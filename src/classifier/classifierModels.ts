export type ParsedEmail = {
  from: string;
  subject: string;
  snippet: string;
};

export type Classification = {
  isCampaign: boolean;
  reason: string;
};
