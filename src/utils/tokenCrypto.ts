import { webcrypto } from "node:crypto";

export type EncryptedTokens = {
  v: 1;
  alg: "AES-GCM";
  iv: string;
  data: string;
};

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function decodeBase64(value: string) {
  return Buffer.from(value, "base64");
}

function encodeBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

function isEncryptedTokens(value: unknown): value is EncryptedTokens {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<EncryptedTokens>;
  return (
    record.v === 1 &&
    record.alg === "AES-GCM" &&
    typeof record.iv === "string" &&
    typeof record.data === "string"
  );
}

async function importKey(keyBase64: string) {
  const raw = decodeBase64(keyBase64);
  if (raw.length !== KEY_LENGTH) {
    throw new Error(
      `GMAIL_TOKEN_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes base64-encoded`
    );
  }
  return await webcrypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptTokens<T>(
  tokens: T,
  keyBase64: string
): Promise<EncryptedTokens> {
  const key = await importKey(keyBase64);
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const payload = new TextEncoder().encode(JSON.stringify(tokens));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    payload
  );
  return {
    v: 1,
    alg: "AES-GCM",
    iv: encodeBase64(iv),
    data: encodeBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptTokens<T>(
  value: unknown,
  keyBase64: string
): Promise<{ tokens: T; encrypted: boolean }> {
  if (!isEncryptedTokens(value)) {
    return { tokens: value as T, encrypted: false };
  }
  const key = await importKey(keyBase64);
  const iv = decodeBase64(value.iv);
  const data = decodeBase64(value.data);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const decoded = new TextDecoder().decode(new Uint8Array(decrypted));
  return { tokens: JSON.parse(decoded) as T, encrypted: true };
}
