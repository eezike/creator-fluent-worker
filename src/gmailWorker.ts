import { google } from "googleapis";
import { SupabaseClient } from "@supabase/supabase-js";
import { classifyEmail, ParsedEmail } from "./classifier";
import { extractPlainText } from "./gmailParser";
import { CampaignContext, extractCampaignDetails } from "./openaiExtractor";
import { upsertDealFromExtraction } from "./dealSync";
import type { EnvConfig } from "./env";
import {
  fetchConnectionByEmail,
  persistTokensIfChanged,
  updateConnection,
} from "./supabaseConnections";
import { buildOAuthClient, ensureWatchForConnection } from "./gmailWatch";
import { isRateLimitError, withRetry } from "./retry";

const MAX_GMAIL_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_HISTORY_RESULTS = 100;

/**
 * Detect Gmail history errors that require a watch reset.
 */
function isHistoryNotFoundError(err: any) {
  const code = err?.code ?? err?.status;
  const message = err?.message ?? err?.cause?.message;
  return code === 404 || message?.includes("Requested entity was not found");
}

/**
 * Process a single Gmail Pub/Sub notification.
 */
export async function processGmailNotification(
  supabase: SupabaseClient,
  env: EnvConfig,
  payload: { emailAddress: string; historyId: string }
) {
  const connection = await fetchConnectionByEmail(
    supabase,
    payload.emailAddress,
    env.tokenEncryptionKey
  );
  if (!connection) {
    console.warn(`No Gmail connection found for ${payload.emailAddress}`);
    return;
  }

  const oAuth2Client = buildOAuthClient(connection.tokens, env);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const lastHistoryId = connection.history_id;
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
          startHistoryId: refreshed.history_id ?? payload.historyId,
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

      const msgRes = await withRetry(
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

      const message = msgRes.data;
      const snippet = message.snippet;
      const headers = message.payload?.headers || [];
      const bodyText = extractPlainText(message);

      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(no subject)";
      const from = headers.find((h) => h.name === "From")?.value || "(unknown sender)";

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

        try {
          const result = await upsertDealFromExtraction(
            supabase,
            extraction,
            campaignContext,
            connection.user_id
          );
          console.log(`Supabase ${result.created ? "created" : "updated"} deal`, result.id);
        } catch (err) {
          console.error("Failed to sync to Supabase:", err);
        }
      }
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
