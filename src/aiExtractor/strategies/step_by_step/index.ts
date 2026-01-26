import type OpenAI from "openai";
import { OPENAI_MODEL } from "../../aiExtractorConstants";
import type { CampaignEmail } from "../../../gmail/gmailModels";
import { buildEmailPrompt, buildEmailPromptSnippet } from "../../prompts";
import { withOpenAIRetry, openai } from "../../aiExtractorHelpers";
import { DEEP_ELIGIBLE_STAGES } from "./enums";
import type { DealStage } from "./enums";
import type {
  DecisionTreeResult,
  DeepExtraction,
  MinimalExtraction,
  Routing,
} from "./models";
import { deepSchema, minimalSchema, routingSchema } from "./schemas";
import {
  deepSystemPrompt,
  minimalSystemPrompt,
  routingSystemPrompt,
} from "./prompts";

export type { DecisionTreeResult } from "./models";

/**
 * NOTE:
 * - We assume buildEmailPrompt / buildEmailPromptSnippet already include enough context
 *   (subject/from/receivedAt/body + maybe attachment names). If not, update those prompt
 *   builders to include from/receivedAt/attachment filenames because the schemas below
 *   rely on that being present in the input text.
 */

/* -------------------------- Attachment Heuristics ----------------------- */

function hasAttachmentKeywords(email: CampaignEmail): boolean {
  const haystack = `${email.subject ?? ""} ${email.body ?? ""}`.toLowerCase();
  return /(contract|agreement|sow|statement of work|msa|master service|brief|insertion order|io|terms and conditions)/.test(
    haystack,
  );
}

/* -------------------------- Evidence Guardrails ------------------------- */

function isSubstring(needle: string, haystack: string): boolean {
  return needle.length > 0 && haystack.includes(needle);
}

/**
 * Best-effort validator: if evidence quotes aren't literal substrings,
 * we null out that field (or drop that list item) to prevent hallucinated evidence.
 */
function sanitizeEvidence<T>(value: T, promptText: string): T {
  const visit = (node: any): any => {
    if (node == null) return node;

    if (Array.isArray(node)) {
      // Drop items that contain invalid evidence (conservative)
      return node
        .map(visit)
        .filter((x) => x !== null);
    }

    if (typeof node === "object") {
      // Evidence object?
      if (
        typeof node.quote === "string" &&
        typeof node.source === "string" &&
        ("page" in node)
      ) {
        return isSubstring(node.quote, promptText) ? node : null;
      }

      const out: any = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = visit(v);
      }

      // If a wrapper object requires evidence and evidence got nulled, null the whole wrapper.
      if ("evidence" in out && out.evidence === null) {
        return null;
      }

      return out;
    }

    return node;
  };

  return visit(value) as T;
}

/* ----------------------------- OpenAI Call ------------------------------ */

async function runJsonSchemaCall<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: any,
): Promise<{ value: T; retries: number; promptText: string }> {
  const { value: completion, retries } =
    await withOpenAIRetry<OpenAI.Chat.Completions.ChatCompletion>(
      () =>
        openai.chat.completions.create({
          model: OPENAI_MODEL,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: schema,
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      "openai.chat.completions.create",
    );

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");

  return { value: JSON.parse(content) as T, retries, promptText: userPrompt };
}

/* ------------------------------- Main API ------------------------------ */

const DEEP_ELIGIBLE_STAGE_SET: ReadonlySet<DealStage> = new Set<DealStage>(
  DEEP_ELIGIBLE_STAGES,
);

export async function extractCampaignDetailsDecisionTree(
  email: CampaignEmail,
): Promise<DecisionTreeResult> {
  // Call 1: routing on snippet (cheap)
  const routingPrompt = buildEmailPromptSnippet(email, 1000);
  const { value: routing } = await runJsonSchemaCall<Routing>(
    routingSystemPrompt,
    routingPrompt,
    routingSchema,
  );


  if (!routing.isDeal) {
    return { routing };
  }

  // Decide whether to run deep:
  // - later-stage signals, OR
  // - attachment keywords
  const shouldRunDeep =
    DEEP_ELIGIBLE_STAGE_SET.has(routing.dealStage) ||
    routing.shouldParseAttachments ||
    hasAttachmentKeywords(email);

  // Full prompt for extraction calls
  const fullPrompt = buildEmailPrompt(email);

  const minimalPromise = runJsonSchemaCall<MinimalExtraction>(
    minimalSystemPrompt,
    fullPrompt,
    minimalSchema,
  );

  if (shouldRunDeep) {
    const [minimalResult, deepResult] = await Promise.all([
      minimalPromise,
      runJsonSchemaCall<DeepExtraction>(deepSystemPrompt, fullPrompt, deepSchema),
    ]);

    return {
      routing,
      minimal: sanitizeEvidence(minimalResult.value, minimalResult.promptText),
      deep: sanitizeEvidence(deepResult.value, deepResult.promptText),
    };
  }

  const minimalResult = await minimalPromise;
  return {
    routing,
    minimal: sanitizeEvidence(minimalResult.value, minimalResult.promptText),
  };
}
