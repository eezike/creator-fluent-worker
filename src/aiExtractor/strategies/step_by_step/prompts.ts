const sharedRules = [
  "OUTPUT RULES:",
  "- Output JSON only.",
  "- No prose, no explanations.",
  "- Prefer null/empty arrays over guessing.",
  "- For every non-null extracted field or array item, include evidence.",
  "- Evidence.quote MUST be an exact substring from the provided input text.",
  "- Keep summaries brief; do not paraphrase long legal text.",
].join("\n");

export const routingSystemPrompt = [
  "Router: routing only (no extraction).",
  "Decide if this email is a brand deal or brand-deal related, and what stage it is at.",
  "Also decide whether attachments likely contain deal terms (contract/brief/SOW) worth parsing.",
  "",
  sharedRules,
].join("\n");

export const minimalSystemPrompt = [
  "Extractor: minimal inbox card payload (early-stage).",
  "Extract ONLY:",
  "- campaignName",
  "- brandName",
  "- lastActionNeededBy",
  "- draftRequired (only if explicitly stated)",
  "- goLiveWindow (rawText; start/end date only if explicitly stated)",
  "- payment (amount/currency; paymentTerms only if explicitly short + explicit, e.g. 'Net 30')",
  "- deliverablesSummary",
  "",
  "Do NOT extract legal terms, usage rights, exclusivity, invoice timestamps, or structured deliverables here.",
  "",
  sharedRules,
].join("\n");

export const deepSystemPrompt = [
  "Extractor: deep terms (late-stage / contract / brief / SOW).",
  "Extract ONLY:",
  "- exclusivityRightsSummary (brief, if any)",
  "- usageRightsSummary (brief, if any)",
  "- payment terms + payment status + invoice timestamps (ONLY if explicitly stated)",
  "- keyDates (named milestones) if explicitly stated",
  "- requiredActions and mustAvoids if explicitly stated",
  "- deliverables (structured) ONLY if explicitly stated",
  "",
  "Rules:",
  "- Never infer; return null/empty if unclear.",
  "- Evidence required for every field and item.",
  "",
  sharedRules,
].join("\n");
