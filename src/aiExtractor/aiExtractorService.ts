import OpenAI from "openai";
import {
  campaignExtractionSchema,
  type CampaignContext,
  type CampaignExtraction,
} from "./aiExtractorModels";
import {
  BASE_RETRY_DELAY_MS,
  MAX_OPENAI_RETRIES,
  OPENAI_MODEL,
} from "./aiExtractorConstants";

const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

const openai = new OpenAI({ apiKey: openaiApiKey });


/**
 * Sleep for a fixed duration.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract retry-after delay from API headers.
 */
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

/**
 * Detect OpenAI rate limit responses.
 */
function isRateLimitError(err: any) {
  const status = err?.status ?? err?.code;
  const errorCode = err?.error?.code ?? err?.code;
  return status === 429 || errorCode === "rate_limit_exceeded";
}

/**
 * Execute OpenAI requests with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt += 1;
      if (!isRateLimitError(err) || attempt > MAX_OPENAI_RETRIES) {
        throw err;
      }
      const retryAfter = getRetryAfterMs(err);
      const fallbackDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      const delay = retryAfter ?? fallbackDelay;
      console.warn(
        `${label} hit rate limit, retrying in ${delay}ms (attempt ${attempt}/${MAX_OPENAI_RETRIES})`
      );
      await sleep(delay);
    }
  }
}

/**
 * Call OpenAI to extract structured campaign details from an email.
 */
export async function extractCampaignDetailsWithMeta(email: CampaignContext): Promise<{
  extraction: CampaignExtraction;
  usage: OpenAI.Completions.CompletionUsage | null;
  latencyMs: number;
  model: string;
}> {
  const prompt = buildPrompt(email);
  const start = Date.now();

  const completion = await withRetry<OpenAI.Chat.Completions.ChatCompletion>(
    () =>
      openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: campaignExtractionSchema },
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that extracts structured campaign data from influencer/brand emails and decides if the email is actually about a brand deal. If isBrandDeal is false, return null for all other scalar fields (except brandDealReason) and empty lists for arrays. If a field is missing, return null or an empty list as appropriate.",
          },
          { role: "user", content: prompt },
        ],
      }),
    "openai.chat.completions.create"
  );
  const latencyMs = Date.now() - start;

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }

  try {
    const parsed = JSON.parse(content) as CampaignExtraction;
    return {
      extraction: parsed,
      usage: completion.usage ?? null,
      latencyMs,
      model: completion.model ?? OPENAI_MODEL,
    };
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response: ${err}`);
  }
}

export async function extractCampaignDetails(
  email: CampaignContext
): Promise<CampaignExtraction> {
  const { extraction } = await extractCampaignDetailsWithMeta(email);
  return extraction;
}

/**
 * Build the system prompt for OpenAI including schema hints and email context.
 */
function buildPrompt(email: CampaignContext): string {
  return `
Extract campaign details from this email. First decide if the email is actually about a brand deal/influencer campaign (true/false) and explain briefly why. If isBrandDeal is false, return null for all other scalar fields (except brandDealReason) and empty lists for arrays. Use null for unknown values. If this is a reply or update, prefer the most recent explicit changes (for example updated payment amounts, payment terms, or invoice sent status). If the email includes quoted prior messages, ignore outdated values and use the newest values from the latest reply. Use UTC ISO 8601 timestamps for all date-time fields.

Email metadata:
- From: ${email.from}
- Subject: ${email.subject}

Full email text:
${email.bodyPreview}
`.trim();
}
