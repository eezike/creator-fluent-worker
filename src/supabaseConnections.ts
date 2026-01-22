import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { decryptTokens, encryptTokens } from "./tokenCrypto";

export type GmailTokens = Record<string, any>;

export type GmailConnection = {
  id: string;
  user_id: string;
  email: string;
  tokens: GmailTokens;
  history_id: string | null;
  watch_expiration: string | null;
};

/**
 * Create a Supabase admin client for background work.
 */
export function createSupabaseClient(
  supabaseUrl: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Normalize email casing for stable comparisons.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Merge refreshed token fields while preserving refresh tokens.
 */
export function mergeTokens(existing: GmailTokens, next: GmailTokens): GmailTokens {
  const merged = { ...existing, ...next };
  if (!merged.refresh_token && existing?.refresh_token) {
    merged.refresh_token = existing.refresh_token;
  }
  return merged;
}

/**
 * Check whether persisted tokens differ from new credentials.
 */
export function tokensChanged(existing: GmailTokens, next: GmailTokens): boolean {
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
 * Fetch all Gmail connection records from Supabase.
 */
export async function fetchConnections(
  supabase: SupabaseClient,
  encryptionKey: string
): Promise<GmailConnection[]> {
  const { data, error } = await supabase.from("gmail_connections").select("*");
  if (error) {
    throw new Error(`Failed to fetch gmail_connections: ${error.message}`);
  }
  const connections = (data ?? []) as GmailConnection[];
  return Promise.all(
    connections.map(async (connection) => {
      const decrypted = await decryptTokens<GmailTokens>(
        connection.tokens,
        encryptionKey
      );
      if (!decrypted.encrypted) {
        const encrypted = await encryptTokens(decrypted.tokens, encryptionKey);
        await supabase
          .from("gmail_connections")
          .update({ tokens: encrypted })
          .eq("id", connection.id);
      }
      return { ...connection, tokens: decrypted.tokens };
    })
  );
}

/**
 * Load a Gmail connection by normalized email address.
 */
export async function fetchConnectionByEmail(
  supabase: SupabaseClient,
  email: string,
  encryptionKey: string
): Promise<GmailConnection | null> {
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch gmail_connections: ${error.message}`);
  }
  if (!data) return null;
  const decrypted = await decryptTokens<GmailTokens>(
    (data as GmailConnection).tokens,
    encryptionKey
  );
  if (!decrypted.encrypted) {
    const encrypted = await encryptTokens(decrypted.tokens, encryptionKey);
    await supabase
      .from("gmail_connections")
      .update({ tokens: encrypted })
      .eq("id", (data as GmailConnection).id);
  }
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
