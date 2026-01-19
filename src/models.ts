export type DraftRequirement = "none" | "optional" | "required";

export type KeyDate = {
  name: string;
  description?: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type RequiredAction = {
  name: string;
  description?: string | null;
};

export type CampaignExtraction = {
  campaignName?: string;
  brand?: string;
  draftRequired?: DraftRequirement;
  draftDeadline?: string | null;
  exclusivity?: string;
  usageRights?: string;
  goLiveStart?: string | null;
  goLiveEnd?: string | null;
  payment?: number | null;
  paymentStatus?: string | null;
  paymentTerms?: string | null;
  invoiceSentDate?: string | null;
  expectedPaymentDate?: string | null;
  keyDates?: KeyDate[];
  requiredActions?: RequiredAction[];
  notes?: string;
};

export type CampaignContext = {
  threadId?: string;
  subject: string;
  from: string;
  bodyPreview: string;
};
