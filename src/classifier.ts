export type ParsedEmail = {
    from: string;
    subject: string;
    snippet: string;
  };
  
  export type Classification = {
    isCampaign: boolean;
    reason: string;
  };
  
  const CAMPAIGN_KEYWORDS = [
    "campaign",
    "brief",
    "proposal",
    "sow",
    "statement of work",
    "deliverables",
    "usage rights",
    "ugc",
    "whitelisting",
    "influencer",
    "creator partnership",
    "brand deal",
  ];
  
  export function classifyEmail(email: ParsedEmail): Classification {
    const text = `${email.subject} ${email.snippet}`.toLowerCase();
  
    for (const kw of CAMPAIGN_KEYWORDS) {
      if (text.includes(kw)) {
        return {
          isCampaign: true,
          reason: `Matched keyword "${kw}"`,
        };
      }
    }
  
    return {
      isCampaign: false,
      reason: "No campaign keywords found",
    };
  }
  