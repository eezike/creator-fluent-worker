# Email filtering: brand deal detection

This worker uses a two-stage filter to decide whether a Gmail message should be treated as a brand deal and synced to Supabase.

## Stage 1: cheap keyword scoring (classifier.ts)

The goal is to be fast and avoid false positives. It is intentionally heuristic and should be tuned with real data.

Inputs:
- Subject + snippet + body text (lowercased)
- From header (lowercased)

Signals:
- Strong campaign keywords (high confidence): e.g., "statement of work", "usage rights", "creator partnership", "sponsorship", "contract".
- General campaign keywords (medium confidence): e.g., "campaign", "brief", "deliverables", "ugc", "collab", "rate", "budget", "payment".
- Negative keywords (likely non-deal): e.g., "newsletter", "receipt", "password reset", "verification code", "shipping", "unsubscribe".
- Money signal: presence of "$" or "USD" followed by numbers.
- Sender hint: "no-reply" or "noreply" in the From header.

Scoring:
- Strong keyword match: +2 each
- General keyword match: +1 each
- Money signal: +1
- From includes no-reply/noreply: -2
- Negative keyword match: -2 each

Decision:
- Accept if score >= 3
- Accept if strong keywords exist and score >= 1
- Otherwise reject

Notes:
- This stage is a best-effort gate, not the final authority. It is intentionally cheap and can be tuned by adjusting keyword lists and thresholds.

## Stage 2: OpenAI confirmation

If stage 1 passes, we call OpenAI to extract structured campaign details. The schema includes:
- isBrandDeal (boolean)
- brandDealReason (string | null)

Behavior:
- If isBrandDeal is false, OpenAI is instructed to return null for all other scalar fields and empty lists for arrays to avoid unnecessary extraction work.
- The worker skips Supabase upserts when isBrandDeal is false.

## Tuning guidance

When tuning, log a sample of false positives/negatives and update:
- Keyword lists (add/remove terms)
- Score thresholds (raise/lower)
- Negative keywords for frequent noise sources

Keep changes conservative to avoid missing genuine deal emails.
