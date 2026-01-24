import { gmail_v1 } from "googleapis";

/**
 * Decode Gmail-safe base64 strings to UTF-8 text.
 */
function decodeBase64(data?: string | null): string {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

/**
 * Pull a plain-text body from a Gmail message payload, preferring text/plain parts.
 */
export function extractPlainText(message: gmail_v1.Schema$Message): string {
  const payload = message.payload;
  if (!payload) return "";

  if (payload.parts?.length) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain") {
        return decodeBase64(part.body?.data);
      }
    }
  }

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  return "";
}
