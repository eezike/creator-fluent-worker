import { google } from "googleapis";
import { SupabaseClient } from "@supabase/supabase-js";
import { classifyEmail } from "../classifier/classifierService";
import type { ParsedEmail } from "../classifier/classifierModels";
import { extractPlainText } from "./gmailParserService";
import type { CampaignEmail } from "./gmailModels";
import { extractCampaignDetails } from "../aiExtractor/aiExtractorService";
import { upsertDealFromExtraction } from "../dealSync/dealSyncService";
import type { EnvConfig } from "../env/envModels";
import { fetchConnectionByEmail } from "./gmailDao";
import { ensureWatchForConnection } from "../watch/gmailWatchService";
import { buildOAuthClient } from "../watch/credentialsService";
import {
  persistTokensIfChanged,
  updateConnection,
} from "../watch/credentialsService";
import { isRateLimitError, withRetry } from "../utils/retry";
import {
  BASE_RETRY_DELAY_MS,
  MAX_BODY_TEXT_CHARS,
  MAX_GMAIL_RETRIES,
  MAX_HISTORY_RESULTS,
} from "./gmailConstants";
import type { GmailNotificationPayload } from "../pubsub/pubsubModels";

/**
 * Detect Gmail history errors that require a watch reset.
 */
function isHistoryNotFoundError(err: any) {
  const code = err?.code ?? err?.status;
  const message = err?.message ?? err?.cause?.message;
  return code === 404 || message?.includes("Requested entity was not found");
}

async function handleCampaignFromMessage(input: {
  supabase: SupabaseClient;
  connectionUserId: string;
  message: { threadId?: string | null };
  subject: string;
  from: string;
  snippet: string | null | undefined;
  bodyText: string;
  receivedAt: string | null;
}) {
  const cappedBodyText = input.bodyText.slice(0, MAX_BODY_TEXT_CHARS);
  const parsed: ParsedEmail = {
    from: input.from,
    subject: input.subject,
    bodyText: cappedBodyText,
  };
  const classification = classifyEmail(parsed);
  console.log("Classification:", classification);

  if (!classification.isCampaign) return;

  const campaignContext: CampaignEmail = {
    ...(input.message.threadId ? { threadId: input.message.threadId } : {}),
    subject: input.subject,
    from: input.from,
    body: cappedBodyText,
    receivedAt: input.receivedAt,
  };

  const extraction = await extractCampaignDetails(campaignContext);
  console.log("OpenAI extraction:", extraction);

  // TODO: add code to serialize extraction to make sure it fits what we expects

  if (!extraction.isDeal) {
    console.log("Skipping non-brand-deal email.");
    return;
  }

  try {
    const result = await upsertDealFromExtraction(
      input.supabase,
      extraction,
      campaignContext,
      input.connectionUserId
    );
    console.log(`Supabase ${result.created ? "created" : "updated"} deal`, result.id);
  } catch (err) {
    console.error("Failed to sync to Supabase:", err);
  }
}

/**
 * Process a single Gmail Pub/Sub notification.
 */
const missingConnectionEmails = new Set<string>();

export async function processGmailNotification(
  supabase: SupabaseClient,
  env: EnvConfig,
  payload: GmailNotificationPayload
) {
  const connection = await fetchConnectionByEmail(
    supabase,
    payload.emailAddress,
    env.tokenEncryptionKey
  );
  if (!connection) {
    if (!missingConnectionEmails.has(payload.emailAddress)) {
      missingConnectionEmails.add(payload.emailAddress);
      console.warn(`No Gmail connection found for ${payload.emailAddress}`);
    }
    return;
  }

  const oAuth2Client = buildOAuthClient(connection.tokens, env);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const lastHistoryId = connection.history_id;
  const startHistoryId = lastHistoryId ?? String(payload.historyId);

  console.log("Last historyId:", lastHistoryId);
  console.log("New historyId from push:", payload.historyId);
  console.log("Using startHistoryId:", startHistoryId);

  if (!lastHistoryId) {
    console.log("No historyId checkpoint; setting baseline and skipping backfill.");
    const updatedConnection = await persistTokensIfChanged(
      supabase,
      connection,
      oAuth2Client.credentials,
      env.tokenEncryptionKey
    );
    await updateConnection(
      supabase,
      updatedConnection.id,
      { history_id: String(payload.historyId) },
      env.tokenEncryptionKey
    );
    return;
  }

  const historyRes = await withRetry(
    async () => {
      try {
        return await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          maxResults: MAX_HISTORY_RESULTS,
        });
      } catch (err: any) {
        if (!isHistoryNotFoundError(err)) {
          throw err;
        }
        console.warn("HistoryId not found; resetting Gmail watch.");
        const refreshed = await ensureWatchForConnection(supabase, connection, env);
        return await gmail.users.history.list({
          userId: "me",
          startHistoryId: refreshed.history_id ?? String(payload.historyId),
          historyTypes: ["messageAdded"],
          maxResults: MAX_HISTORY_RESULTS,
        });
      }
    },
    "gmail.users.history.list",
    {
      maxRetries: MAX_GMAIL_RETRIES,
      baseDelayMs: BASE_RETRY_DELAY_MS,
      isRetryable: isRateLimitError,
    }
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

      let msgRes;
      try {
        msgRes = await withRetry(
          () =>
            gmail.users.messages.get({
              userId: "me",
              id: messageId,
              format: "full",
            }),
          "gmail.users.messages.get",
          {
            maxRetries: MAX_GMAIL_RETRIES,
            baseDelayMs: BASE_RETRY_DELAY_MS,
            isRetryable: isRateLimitError,
          }
        );
      } catch (err: any) {
        if (err?.code === 404 || err?.status === 404) {
          console.warn(`Message not found; skipping ${messageId}.`);
          continue;
        }
        throw err;
      }

      const message = msgRes.data;
      const snippet = message.snippet;
      const headers = message.payload?.headers || [];
      const bodyText = extractPlainText(message);
      const receivedAt = message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : null;

      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(no subject)";
      const from = headers.find((h) => h.name === "From")?.value || "(unknown sender)";

      console.log("---- New Email ----");
      console.log("From:", from);
      console.log("Subject:", subject);
      console.log("Snippet:", snippet);
      console.log("-------------------\n");

      await handleCampaignFromMessage({
        supabase,
        connectionUserId: connection.user_id,
        message,
        subject,
        from,
        snippet,
        bodyText,
        receivedAt,
      });
    }
  }

  const latestHistoryId =
    historyRes.data.historyId?.toString() ?? payload.historyId;

  const updatedConnection = await persistTokensIfChanged(
    supabase,
    connection,
    oAuth2Client.credentials,
    env.tokenEncryptionKey
  );

  await updateConnection(
    supabase,
    updatedConnection.id,
    { history_id: latestHistoryId },
    env.tokenEncryptionKey
  );
}
