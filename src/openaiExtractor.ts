import OpenAI from "openai";
import { CampaignExtraction, CampaignContext } from "./models";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openaiApiKey = process.env.OPENAI_API_KEY;
const MAX_OPENAI_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 500;

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

const openai = new OpenAI({ apiKey: openaiApiKey });

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
export async function extractCampaignDetails(
  email: CampaignContext
): Promise<CampaignExtraction> {
  const prompt = buildPrompt(email);

  const completion = await withRetry(
    () =>
      openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that extracts structured campaign data from influencer/brand emails. If a field is missing, return null or an empty list as appropriate.",
          },
          { role: "user", content: prompt },
        ],
      }),
    "openai.chat.completions.create"
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }

  try {
    const parsed = JSON.parse(content) as CampaignExtraction;
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response: ${err}`);
  }
}

/**
 * Build the system prompt for OpenAI including schema hints and email context.
 */
function buildPrompt(email: CampaignContext): string {
  return `
Extract campaign details from this email. Use null for unknown values. If this is a reply or update, prefer the most recent explicit changes (for example updated payment amounts, payment terms, or invoice sent status). If the email includes quoted prior messages, ignore outdated values and use the newest values from the latest reply.

Return JSON matching:
{
  "campaignName": string | null,
  "brand": string | null,
  "draftRequired": "none" | "optional" | "required" | null,
  "draftDeadline": ISO 8601 string | null,
  "exclusivity": string | null,
  "usageRights": string | null,
  "goLiveStart": ISO 8601 string | null,
  "goLiveEnd": ISO 8601 string | null,
  "payment": number | null,
  "paymentStatus": string | null,
  "paymentTerms": string | null,
  "invoiceSentDate": ISO 8601 string | null,
  "expectedPaymentDate": ISO 8601 string | null,
  "keyDates": [
    {
      "name": string,
      "description": string | null,
      "startDate": ISO 8601 string | null,
      "endDate": ISO 8601 string | null
    }
  ],
  "requiredActions": [
    {
      "name": string,
      "description": string | null
    }
  ],
  "notes": string | null
}

Email metadata:
- From: ${email.from}
- Subject: ${email.subject}

Full email text:
${email.bodyPreview}
`.trim();
}
