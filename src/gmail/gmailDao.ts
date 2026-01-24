import { SupabaseClient } from "@supabase/supabase-js";
import type { GmailConnection, GmailTokens } from "../supabase/supabaseModels";
import { decryptTokens, encryptTokens } from "../utils/tokenCrypto";
import { normalizeEmail } from "../utils/emailUtils";
import { hasOAuthTokens } from "../watch/credentialsService";

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
  try {
    const decrypted = await decryptTokens<GmailTokens>(
      (data as GmailConnection).tokens,
      encryptionKey
    );
    if (!hasOAuthTokens(decrypted.tokens)) {
      console.warn(
        `Missing Gmail tokens for ${normalizeEmail(email)}; skipping notification.`
      );
      return null;
    }
    if (!decrypted.encrypted) {
      const encrypted = await encryptTokens(decrypted.tokens, encryptionKey);
      await supabase
        .from("gmail_connections")
        .update({ tokens: encrypted })
        .eq("id", (data as GmailConnection).id);
    }
    return { ...(data as GmailConnection), tokens: decrypted.tokens };
  } catch (err) {
    console.warn(
      `Failed to decrypt Gmail tokens for ${normalizeEmail(email)}; skipping notification.`,
      err
    );
    return null;
  }
}
