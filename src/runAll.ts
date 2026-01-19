import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { google } from "googleapis";
import { PubSub, Subscription } from "@google-cloud/pubsub";
import { createGmailClient } from "./gmailClient";
import { classifyEmail, ParsedEmail } from "./classifier";
import { getLastHistoryId, setLastHistoryId } from "./historyStore";
import { extractPlainText } from "./gmailParser";
import { extractCampaignDetails } from "./openaiExtractor";
import { CampaignContext } from "./models";
import { saveCampaignLocally } from "./localStore";
import { findUserIdByEmail, upsertDealFromExtraction } from "./supabaseStore";

const TOKENS_PATH = "tokens.json";
const HISTORY_FILE = "history.json";

const PROJECT_ID = process.env.GCP_PROJECT_ID!;
const TOPIC_ID = process.env.PUBSUB_TOPIC_ID!;
const SUBSCRIPTION_ID = process.env.PUBSUB_SUB_ID || "gmail-events-local-sub";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;
const APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const MAX_GMAIL_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: any) {
  const code = err?.code ?? err?.status;
  const message = err?.message ?? err?.cause?.message;
  return code === 429 || message?.includes("Too many concurrent requests");
}

function isHistoryNotFoundError(err: any) {
  const code = err?.code ?? err?.status;
  const message = err?.message ?? err?.cause?.message;
  return code === 404 || message?.includes("Requested entity was not found");
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt += 1;
      if (!isRateLimitError(err) || attempt > MAX_GMAIL_RETRIES) {
        throw err;
      }
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `${label} hit rate limit, retrying in ${delay}ms (attempt ${attempt}/${MAX_GMAIL_RETRIES})`
      );
      await sleep(delay);
    }
  }
}

/**
 * Ensure required environment variables are present.
 */
function assertEnv() {
  const missing = [
    ["GCP_PROJECT_ID", PROJECT_ID],
    ["PUBSUB_TOPIC_ID", TOPIC_ID],
    ["GOOGLE_CLIENT_ID", CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", CLIENT_SECRET],
    ["GOOGLE_REDIRECT_URI", REDIRECT_URI],
    ["GOOGLE_APPLICATION_CREDENTIALS", APPLICATION_CREDENTIALS],
  ].filter(([, val]) => !val);

  if (missing.length) {
    throw new Error(
      `Missing env vars: ${missing.map(([k]) => k).join(", ")}. Check .env.`
    );
  }
}

function resolveCredentialsPath(): string {
  if (!APPLICATION_CREDENTIALS) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS in environment");
  }

  const resolved = path.isAbsolute(APPLICATION_CREDENTIALS)
    ? APPLICATION_CREDENTIALS
    : path.resolve(process.cwd(), APPLICATION_CREDENTIALS);

  if (!fs.existsSync(resolved)) {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS file not found: ${resolved}`);
  }

  process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
  return resolved;
}

function logCredentialInfo(credentialsPath: string) {
  try {
    const raw = fs.readFileSync(credentialsPath, "utf-8");
    const parsed = JSON.parse(raw) as { client_email?: string; project_id?: string };
    console.log("Service account:", parsed.client_email ?? "(unknown)");
    console.log("Credentials project:", parsed.project_id ?? "(unknown)");
  } catch (err) {
    console.warn("Could not read credentials JSON:", err);
  }
}

/**
 * Prompt for user input in the terminal.
 */
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

/**
 * Ensure OAuth tokens exist locally, otherwise run the interactive flow.
 */
async function ensureTokens(): Promise<void> {
  if (fs.existsSync(TOKENS_PATH)) {
    console.log("✅ Found tokens.json");
    return;
  }

  console.log("tokens.json not found. Running OAuth flow...");
  const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\nAuthorize this app by visiting this URL:\n");
  console.log(authUrl);
  console.log("\nAfter approving, copy the 'code' query param and paste it here.\n");

  const code = (await ask("Enter the code from the URL: ")).trim();
  const { tokens } = await oAuth2Client.getToken(code);

  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nSaved tokens to ${TOKENS_PATH}`);
}

/**
 * Ensure the Pub/Sub subscription exists, creating it if missing.
 */
async function ensureSubscription(pubsub: PubSub): Promise<Subscription> {
  const subscription = pubsub.subscription(SUBSCRIPTION_ID);

  try {
    await subscription.getMetadata();
    console.log(`✅ Subscription exists: ${SUBSCRIPTION_ID}`);
    return subscription;
  } catch (err: any) {
    if (err?.code !== 5) {
      throw err;
    }
  }

  console.log(`Creating subscription "${SUBSCRIPTION_ID}" on topic "${TOPIC_ID}"...`);
  const [created] = await pubsub.topic(TOPIC_ID).createSubscription(SUBSCRIPTION_ID);
  console.log("✅ Created subscription:", created.name);
  return created;
}

/**
 * Register a Gmail watch and store the returned historyId.
 */
async function setupWatch(): Promise<string> {
  const gmail = createGmailClient();
  const topicName = `projects/${PROJECT_ID}/topics/${TOPIC_ID}`;

  console.log("Setting up Gmail watch on topic:", topicName);
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
    },
  });

  const historyId = res.data.historyId;
  if (!historyId) {
    throw new Error("No historyId returned from Gmail watch");
  }

  setLastHistoryId(historyId);
  console.log("✅ Gmail watch set. Initial historyId stored in", HISTORY_FILE);
  return historyId;
}

/**
 * Process a Gmail push notification by fetching new messages and logging classifications.
 */
async function processGmailNotification(payload: { emailAddress: string; historyId: string }) {
  const gmail = createGmailClient();
  const userId = await findUserIdByEmail(payload.emailAddress);

  if (!userId) {
    console.warn(
      `No Supabase user found for Gmail address ${payload.emailAddress}; skipping DB sync.`
    );
  }
  const lastHistoryId = getLastHistoryId();
  const startHistoryId = lastHistoryId ?? payload.historyId;

  console.log("Last historyId:", lastHistoryId);
  console.log("New historyId from push:", payload.historyId);
  console.log("Using startHistoryId:", startHistoryId);

  const historyRes = await withRetry(
    async () => {
      try {
        return await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
        });
      } catch (err: any) {
        if (!isHistoryNotFoundError(err)) {
          throw err;
        }
        console.warn(
          "HistoryId not found; resetting Gmail watch to get a fresh historyId."
        );
        const newHistoryId = await setupWatch();
        return await gmail.users.history.list({
          userId: "me",
          startHistoryId: newHistoryId,
          historyTypes: ["messageAdded"],
        });
      }
    },
    "gmail.users.history.list"
  );

  const history = historyRes.data.history || [];
  console.log(`Found ${history.length} history items`);

  for (const h of history) {
    const messagesAdded = h.messagesAdded || [];
    for (const added of messagesAdded) {
      const msg = added.message;
      if (!msg?.id) continue;

      const messageId = msg.id;
      console.log("Fetching message:", messageId);

      const msgRes = await withRetry(
        () =>
          gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full",
          }),
        "gmail.users.messages.get"
      );

      const message = msgRes.data;
      const snippet = message.snippet;
      const headers = message.payload?.headers || [];
      const bodyText = extractPlainText(message);

      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(no subject)";
      const from =
        headers.find((h) => h.name === "From")?.value || "(unknown sender)";

      console.log("---- New Email ----");
      console.log("From:", from);
      console.log("Subject:", subject);
      console.log("Snippet:", snippet);
      console.log("-------------------\n");

      const parsed: ParsedEmail = {
        from,
        subject,
        snippet: `${snippet || ""}\n\n${bodyText}`.trim(),
      };
      const classification = classifyEmail(parsed);
      console.log("Classification:", classification);

      if (classification.isCampaign) {
        const campaignContext: CampaignContext = {
          ...(message.threadId ? { threadId: message.threadId } : {}),
          subject,
          from,
          bodyPreview: parsed.snippet,
        };

        const extraction = await extractCampaignDetails(campaignContext);
        console.log("OpenAI extraction:", extraction);

        const saved = saveCampaignLocally(extraction, campaignContext);
        console.log("👉 Saved campaign locally with id", saved.id);

        if (userId) {
          try {
            const result = await upsertDealFromExtraction(
              extraction,
              campaignContext,
              userId
            );
            console.log(
              `✅ Supabase ${result.created ? "created" : "updated"} deal`,
              result.id
            );
          } catch (err) {
            console.error("Failed to sync to Supabase:", err);
          }
        }
      }
    }
  }

  const latestHistoryId =
    historyRes.data.historyId?.toString() ?? payload.historyId;
  setLastHistoryId(latestHistoryId);
}

/**
 * Start the worker loop that listens on Pub/Sub and processes notifications.
 */
async function startWorker(pubsub: PubSub, subscription: Subscription) {
  console.log(
    `Listening for messages on subscription: ${SUBSCRIPTION_ID} (project ${PROJECT_ID})`
  );

  let processingQueue = Promise.resolve();

  subscription.on("message", (message) => {
    processingQueue = processingQueue
      .then(async () => {
        const dataStr = message.data.toString("utf8");
        const payload = JSON.parse(dataStr) as {
          emailAddress: string;
          historyId: string;
        };

        console.log("\n📩 Received Gmail push notification:", payload);

        await processGmailNotification(payload);
        message.ack();
      })
      .catch((err) => {
        console.error("Error handling message:", err);
      });
  });

  subscription.on("error", (err) => {
    console.error("Subscription error:", err);
    process.exit(1);
  });
}

/**
 * Orchestrate setup and start the worker end-to-end.
 */
async function main() {
  assertEnv();

  console.log("Step 1/4: Ensure tokens");
  await ensureTokens();

  const credentialsPath = resolveCredentialsPath();
  console.log("Using GOOGLE_APPLICATION_CREDENTIALS:", credentialsPath);
  logCredentialInfo(credentialsPath);
  console.log("Pub/Sub target:", {
    projectId: PROJECT_ID,
    topicId: TOPIC_ID,
    subscriptionId: SUBSCRIPTION_ID,
  });
  const pubsub = new PubSub({ projectId: PROJECT_ID, keyFilename: credentialsPath });

  console.log("\nStep 2/4: Ensure Pub/Sub subscription");
  const subscription = await ensureSubscription(pubsub);

  console.log("\nStep 3/4: Set up Gmail watch");
  const initialHistoryId = await setupWatch();
  console.log("Watch ready. Initial historyId:", initialHistoryId);

  console.log("\nStep 4/4: Start worker listener");
  await startWorker(pubsub, subscription);

  console.log("\nAll set! Send yourself an email to INBOX to see logs stream in.");
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(1);
});
