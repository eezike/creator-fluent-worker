import type { Classification, ParsedEmail } from "./classifierModels";
import {
  CAMPAIGN_KEYWORDS,
  NEGATIVE_KEYWORDS,
  STRONG_CAMPAIGN_KEYWORDS,
} from "./classifierConstants";

function matchKeywords(text: string, keywords: string[]) {
  return keywords.filter((kw) => text.includes(kw));
}

function hasMoneySignal(text: string) {
  return /\$\s?\d|usd\s?\d/.test(text);
}

/**
 * Quick keyword-based check to decide if an email is likely a campaign.
 */
export function classifyEmail(email: ParsedEmail): Classification {
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const from = email.from.toLowerCase();

  const strongMatches = matchKeywords(text, STRONG_CAMPAIGN_KEYWORDS);
  const matches = matchKeywords(text, CAMPAIGN_KEYWORDS);
  const negativeMatches = matchKeywords(text, NEGATIVE_KEYWORDS);

  let score = strongMatches.length * 2 + matches.length;
  if (hasMoneySignal(text)) score += 1;
  if (from.includes("no-reply") || from.includes("noreply")) score -= 2;
  score -= negativeMatches.length * 2;

  if (score >= 3 || (strongMatches.length > 0 && score >= 1)) {
    return {
      isCampaign: true,
      reason: `Score ${score}; strong=${strongMatches.join(", ") || "none"}; matches=${
        matches.join(", ") || "none"
      }`,
    };
  }

  if (negativeMatches.length && !strongMatches.length && !matches.length) {
    return {
      isCampaign: false,
      reason: `Negative keywords only: ${negativeMatches.join(", ")}`,
    };
  }

  return {
    isCampaign: false,
    reason: `Score ${score}; strong=${strongMatches.join(", ") || "none"}; matches=${
      matches.join(", ") || "none"
    }`,
  };
}
