import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { google } from "googleapis";
import type { EnvConfig } from "../env/envModels";
import type { GmailTokens } from "../supabase/supabaseModels";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GmailConnection } from "../supabase/supabaseModels";
import { decryptTokens, encryptTokens } from "../utils/tokenCrypto";

/**
 * Resolve and validate the GCP credentials JSON path.
 */
export function resolveCredentialsPath(credentialsPath: string): string {
  const resolved = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(process.cwd(), credentialsPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS file not found: ${resolved}`);
  }

  process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
  return resolved;
}

/**
 * Log basic service account metadata for verification.
 */
export function logCredentialInfo(credentialsPath: string) {
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
 * Check whether tokens include usable OAuth credentials.
 */
export function hasOAuthTokens(tokens: GmailTokens | null | undefined): boolean {
  if (!tokens || typeof tokens !== "object") return false;
  const record = tokens as Record<string, unknown>;
  const refresh = record.refresh_token;
  const access = record.access_token;
  return (
    (typeof refresh === "string" && refresh.length > 0) ||
    (typeof access === "string" && access.length > 0)
  );
}

/**
 * Merge refreshed token fields while preserving refresh tokens.
 */
function mergeTokens(existing: GmailTokens, next: GmailTokens): GmailTokens {
  const merged = { ...existing, ...next };
  if (!merged.refresh_token && existing?.refresh_token) {
    merged.refresh_token = existing.refresh_token;
  }
  return merged;
}

/**
 * Check whether persisted tokens differ from new credentials.
 */
function tokensChanged(existing: GmailTokens, next: GmailTokens): boolean {
  const keys = [
    "access_token",
    "refresh_token",
    "expiry_date",
    "scope",
    "token_type",
    "id_token",
  ];
  return keys.some((key) => (existing?.[key] ?? null) !== (next?.[key] ?? null));
}

/**
 * Persist token updates only when refresh tokens rotate.
 */
export async function persistTokensIfChanged(
  supabase: SupabaseClient,
  connection: GmailConnection,
  nextTokens: GmailTokens,
  encryptionKey: string
) {
  const merged = mergeTokens(connection.tokens, nextTokens);
  if (!tokensChanged(connection.tokens, merged)) {
    return connection;
  }
  const encrypted = await encryptTokens(merged, encryptionKey);
  const { data, error } = await supabase
    .from("gmail_connections")
    .update({ tokens: encrypted })
    .eq("id", connection.id)
    .select("*")
    .single();
  if (error) {
    console.warn("Failed to persist refreshed tokens:", error);
    return connection;
  }
  const decrypted = await decryptTokens<GmailTokens>(
    (data as GmailConnection).tokens,
    encryptionKey
  );
  return { ...(data as GmailConnection), tokens: decrypted.tokens };
}

/**
 * Update a Gmail connection with new metadata.
 */
export async function updateConnection(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<GmailConnection>,
  encryptionKey?: string
) {
  const nextUpdates = { ...updates } as Partial<GmailConnection>;
  if (updates.tokens && encryptionKey) {
    nextUpdates.tokens = (await encryptTokens(
      updates.tokens,
      encryptionKey
    )) as unknown as GmailTokens;
  }
  const { error } = await supabase
    .from("gmail_connections")
    .update(nextUpdates)
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to update gmail_connections: ${error.message}`);
  }
}
