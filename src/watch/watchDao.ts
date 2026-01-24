import { SupabaseClient } from "@supabase/supabase-js";
import type { GmailConnection, GmailTokens } from "../supabase/supabaseModels";
import { decryptTokens, encryptTokens } from "../utils/tokenCrypto";
import { hasOAuthTokens } from "./credentialsService";

/**
 * Fetch all Gmail connection records from Supabase for watch refresh.
 */
export async function fetchConnectionsForWatch(
  supabase: SupabaseClient,
  encryptionKey: string
): Promise<GmailConnection[]> {
  const { data, error } = await supabase.from("gmail_connections").select("*");
  if (error) {
    throw new Error(`Failed to fetch gmail_connections: ${error.message}`);
  }
  const connections = (data ?? []) as GmailConnection[];
  const hydrated = await Promise.all(
    connections.map(async (connection) => {
      try {
        const decrypted = await decryptTokens<GmailTokens>(
          connection.tokens,
          encryptionKey
        );
        if (!hasOAuthTokens(decrypted.tokens)) {
          console.warn(
            `Missing Gmail tokens for ${connection.email}; skipping watch refresh.`
          );
          return null;
        }
        if (!decrypted.encrypted) {
          const encrypted = await encryptTokens(decrypted.tokens, encryptionKey);
          await supabase
            .from("gmail_connections")
            .update({ tokens: encrypted })
            .eq("id", connection.id);
        }
        return { ...connection, tokens: decrypted.tokens };
      } catch (err) {
        console.warn(
          `Failed to decrypt Gmail tokens for ${connection.email}; skipping watch refresh.`,
          err
        );
        return null;
      }
    })
  );
  return hydrated.filter((connection): connection is GmailConnection => !!connection);
}
