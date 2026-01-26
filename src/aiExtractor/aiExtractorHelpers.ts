import OpenAI from "openai";
import {
  BASE_RETRY_DELAY_MS,
  MAX_OPENAI_RETRIES,
} from "./aiExtractorConstants";

const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

export const openai = new OpenAI({ apiKey: openaiApiKey });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(err: any) {
  const headerValue =
    err?.headers?.["retry-after-ms"] ??
    err?.headers?.["retry-after"] ??
    err?.response?.headers?.["retry-after-ms"] ??
    err?.response?.headers?.["retry-after"];
  if (!headerValue) return null;
  const parsed = Number(headerValue);
  if (Number.isNaN(parsed)) return null;
  return headerValue === err?.headers?.["retry-after"] ? parsed * 1000 : parsed;
}

function isRateLimitError(err: any) {
  const status = err?.status ?? err?.code;
  const errorCode = err?.error?.code ?? err?.code;
  return status === 429 || errorCode === "rate_limit_exceeded";
}

export async function withOpenAIRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<{ value: T; retries: number }> {
  let attempt = 0;
  let retries = 0;
  while (true) {
    try {
      const value = await fn();
      return { value, retries };
    } catch (err: any) {
      attempt += 1;
      if (!isRateLimitError(err) || attempt > MAX_OPENAI_RETRIES) {
        throw err;
      }
      retries += 1;
      const retryAfter = getRetryAfterMs(err);
      const fallbackDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      const delay = retryAfter ?? fallbackDelay;
      console.warn(
        `${label} hit rate limit, retrying in ${delay}ms (attempt ${attempt}/${MAX_OPENAI_RETRIES})`,
      );
      await sleep(delay);
    }
  }
}
