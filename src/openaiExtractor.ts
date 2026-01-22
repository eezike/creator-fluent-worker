import OpenAI from "openai";
import { DraftRequirement, PaymentStatus } from "./enums";

export interface CampaignContext {
  threadId?: string;
  subject: string;
  from: string;
  bodyPreview: string;
}

export interface CampaignKeyDate {
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface CampaignRequiredAction {
  name: string;
  description: string | null;
}

export interface CampaignExtraction {
  campaignName: string | null;
  brand: string | null;
  draftRequired: DraftRequirement | null;
  draftDeadline: string | null;
  exclusivity: string | null;
  usageRights: string | null;
  goLiveStart: string | null;
  goLiveEnd: string | null;
  payment: number | null;
  paymentStatus: PaymentStatus | null;
  paymentTerms: string | null;
  invoiceSentDate: string | null;
  expectedPaymentDate: string | null;
  keyDates: CampaignKeyDate[];
  requiredActions: CampaignRequiredAction[];
  notes: string | null;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openaiApiKey = process.env.OPENAI_API_KEY;
const MAX_OPENAI_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 500;

if (!openaiApiKey) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

const openai = new OpenAI({ apiKey: openaiApiKey });

const campaignExtractionSchema = {
  name: "campaign_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      campaignName: { type: ["string", "null"] },
      brand: { type: ["string", "null"] },
      draftRequired: {
        type: ["string", "null"],
        enum: [...Object.values(DraftRequirement), null],
      },
      draftDeadline: { type: ["string", "null"], format: "date-time" },
      exclusivity: { type: ["string", "null"] },
      usageRights: { type: ["string", "null"] },
      goLiveStart: { type: ["string", "null"], format: "date-time" },
      goLiveEnd: { type: ["string", "null"], format: "date-time" },
      payment: { type: ["number", "null"] },
      paymentStatus: { type: ["string", "null"], enum: [...Object.values(PaymentStatus), null] },
      paymentTerms: { type: ["string", "null"] },
      invoiceSentDate: { type: ["string", "null"], format: "date-time" },
      expectedPaymentDate: { type: ["string", "null"], format: "date-time" },
      keyDates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            description: { type: ["string", "null"] },
            startDate: { type: ["string", "null"], format: "date-time" },
            endDate: { type: ["string", "null"], format: "date-time" },
          },
          required: ["name", "description", "startDate", "endDate"],
        },
      },
      requiredActions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            description: { type: ["string", "null"] },
          },
          required: ["name", "description"],
        },
      },
      notes: { type: ["string", "null"] },
    },
    required: [
      "campaignName",
      "brand",
      "draftRequired",
      "draftDeadline",
      "exclusivity",
      "usageRights",
      "goLiveStart",
      "goLiveEnd",
      "payment",
      "paymentStatus",
      "paymentTerms",
      "invoiceSentDate",
      "expectedPaymentDate",
      "keyDates",
      "requiredActions",
      "notes",
    ],
  },
  strict: true,
};

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
export async function extractCampaignDetails(
  email: CampaignContext
): Promise<CampaignExtraction> {
  const prompt = buildPrompt(email);

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
Extract campaign details from this email. Use null for unknown values. If this is a reply or update, prefer the most recent explicit changes (for example updated payment amounts, payment terms, or invoice sent status). If the email includes quoted prior messages, ignore outdated values and use the newest values from the latest reply. Use UTC ISO 8601 timestamps for all date-time fields.

Email metadata:
- From: ${email.from}
- Subject: ${email.subject}

Full email text:
${email.bodyPreview}
`.trim();
}
