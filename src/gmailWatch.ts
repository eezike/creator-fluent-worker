import { google } from "googleapis";
import { SupabaseClient } from "@supabase/supabase-js";
import type { EnvConfig } from "./env";
import {
  GmailConnection,
  GmailTokens,
  persistTokensIfChanged,
  updateConnection,
  fetchConnections,
} from "./supabaseConnections";

const WATCH_REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

/**
 * Build an OAuth2 client for Gmail calls.
 */
export function buildOAuthClient(tokens: GmailTokens, env: EnvConfig) {
  const oAuth2Client = new google.auth.OAuth2(
    env.clientId,
    env.clientSecret,
    env.redirectUri
  );
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
}

/**
 * Determine whether a Gmail watch is near expiration.
 */
export function isWatchExpiring(expiration: string | null) {
  if (!expiration) return true;
  const expiresAt = Date.parse(expiration);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - Date.now() < WATCH_REFRESH_BUFFER_MS;
}

/**
 * Ensure a Gmail watch exists and refresh if nearing expiration.
 */
export async function ensureWatchForConnection(
  supabase: SupabaseClient,
  connection: GmailConnection,
  env: EnvConfig
) {
  if (!isWatchExpiring(connection.watch_expiration)) {
    return connection;
  }

  const oAuth2Client = buildOAuthClient(connection.tokens, env);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  const topicName = `projects/${env.projectId}/topics/${env.topicId}`;

  console.log(`Setting Gmail watch for ${connection.email}`);
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
    },
  });

  const historyId = res.data.historyId;
  if (!historyId) {
    throw new Error(`No historyId returned from Gmail watch for ${connection.email}`);
  }

  const expiration = res.data.expiration
    ? new Date(Number(res.data.expiration)).toISOString()
    : null;

  const updatedConnection = await persistTokensIfChanged(
    supabase,
    connection,
    oAuth2Client.credentials,
    env.tokenEncryptionKey
  );

  await updateConnection(
    supabase,
    updatedConnection.id,
    { history_id: historyId.toString(), watch_expiration: expiration },
    env.tokenEncryptionKey
  );

  return { ...updatedConnection, history_id: historyId.toString(), watch_expiration: expiration };
}

/**
 * Refresh Gmail watches for every known connection.
 */
export async function refreshAllWatches(supabase: SupabaseClient, env: EnvConfig) {
  const connections = await fetchConnections(supabase, env.tokenEncryptionKey);
  for (const connection of connections) {
    try {
      await ensureWatchForConnection(supabase, connection, env);
    } catch (err) {
      console.error(`Failed to set watch for ${connection.email}:`, err);
    }
  }
}
