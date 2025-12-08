import "dotenv/config";
import { PubSub } from "@google-cloud/pubsub";
import { createGmailClient } from "./gmailClient";
import { getLastHistoryId, setLastHistoryId } from "./historyStore";

const PROJECT_ID = process.env.GCP_PROJECT_ID!;
const SUBSCRIPTION_ID = process.env.PUBSUB_SUB_ID || "gmail-events-local-sub";

// Message data format from Gmail → Pub/Sub:
// data is base64(JSON({ emailAddress, historyId }))
type GmailPushPayload = {
  emailAddress: string;
  historyId: string;
};

async function processGmailNotification(payload: GmailPushPayload) {
  const gmail = createGmailClient();

  const lastHistoryId = getLastHistoryId();
  const startHistoryId = lastHistoryId ?? payload.historyId;

  console.log("Last historyId:", lastHistoryId);
  console.log("New historyId from push:", payload.historyId);
  console.log("Using startHistoryId:", startHistoryId);

  // 1. List history changes since lastHistoryId
  const historyRes = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    historyTypes: ["messageAdded"],
  });

  const history = historyRes.data.history || [];
  console.log(`Found ${history.length} history items`);

  for (const h of history) {
    const messagesAdded = h.messagesAdded || [];
    for (const added of messagesAdded) {
      const msg = added.message;
      if (!msg?.id) continue;

      const messageId = msg.id;
      console.log("Fetching message:", messageId);

      // 2. Fetch full message
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const message = msgRes.data;
      const snippet = message.snippet;
      const headers = message.payload?.headers || [];

      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(no subject)";
      const from =
        headers.find((h) => h.name === "From")?.value || "(unknown sender)";

      console.log("---- New Email ----");
      console.log("From:", from);
      console.log("Subject:", subject);
      console.log("Snippet:", snippet);
      console.log("-------------------\n");

      // 👇 This is where, later, you'll:
      // - parse full body
      // - run classifier
      // - upsert campaign / notes into DB
      import { classifyEmail, ParsedEmail } from "./classifier";
      
      
      // inside for each message:
      const parsed: ParsedEmail = {from, subject, snippet: snippet || "",};
      
      const classification = classifyEmail(parsed);
      
      console.log("Classification:", classification);
      
      if (classification.isCampaign) {
        console.log("👉 This looks like a campaign email. (In the future: create/find campaign, add notes.)");
        }
    }
  }

  // 3. Update lastHistoryId to the most recent one we got
  setLastHistoryId(payload.historyId);
}

async function main() {
  const pubsub = new PubSub({ projectId: PROJECT_ID });
  const subscription = pubsub.subscription(SUBSCRIPTION_ID);

  console.log(
    `Listening for messages on subscription: ${SUBSCRIPTION_ID} (project ${PROJECT_ID})`
  );

  subscription.on("message", async (message) => {
    try {
    const dataStr = message.data.toString("utf8");
      const payload: GmailPushPayload = JSON.parse(dataStr);

      console.log("\n📩 Received Gmail push notification:", payload);

      await processGmailNotification(payload);

      message.ack();
    } catch (err) {
      console.error("Error handling message:", err);
      // Do not ack → may retry
    }
  });

  subscription.on("error", (err) => {
    console.error("Subscription error:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
