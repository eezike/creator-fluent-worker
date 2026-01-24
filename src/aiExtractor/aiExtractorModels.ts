import { DraftRequirement, PaymentStatus } from "./aiExtractorEnums";

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
  isBrandDeal: boolean;
  brandDealReason: string | null;
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

export const campaignExtractionSchema = {
  name: "campaign_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      isBrandDeal: { type: "boolean" },
      brandDealReason: { type: ["string", "null"] },
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
      "isBrandDeal",
      "brandDealReason",
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
    strict: true,
  },
} as const;
