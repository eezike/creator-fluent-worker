import type OpenAI from "openai";
import type {
  Currency,
  DealStage,
  DeliverableType,
  EvidenceSource,
  LastActionNeededBy,
  PaymentStatus,
  Platform,
} from "./enums";

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

export type Evidence = {
  quote: string; // exact substring
  source: EvidenceSource;
  page: number | null; // PDFs only
};

/* -------------------- Core Parsed Object -------------------- */

export type CampaignExtraction = {
  /* -------- Routing -------- */
  isDeal: boolean;
  dealStage: DealStage;

  /* -------- Labels -------- */
  campaignName: { value: string; evidence: Evidence } | null;
  brandName: { value: string; evidence: Evidence } | null;

  lastActionNeededBy:
    | { value: LastActionNeededBy; evidence: Evidence }
    | null;

  draftRequired:
    | { value: boolean; evidence: Evidence }
    | null;

  /* -------- Timeline -------- */
  goLiveWindow:
    | {
        rawText: string;
        startDate: string | null; // YYYY-MM-DD only
        endDate: string | null; // YYYY-MM-DD only
        evidence: Evidence;
      }
    | null;

  keyDates: Array<{
    name: string | null;
    dateRawText: string;
    startDate: string | null; // YYYY-MM-DD only
    endDate: string | null; // YYYY-MM-DD only
    description: string | null;
    evidence: Evidence;
  }>;

  /* -------- Terms -------- */
  exclusivityRightsSummary:
    | { value: string; evidence: Evidence }
    | null;

  usageRightsSummary:
    | { value: string; evidence: Evidence }
    | null;

  /* -------- Payment -------- */
  payment:
    | {
        amount: number | null;
        currency: Currency;
        paymentTerms: string | null; // e.g. "Net 30"
        paymentStatus: PaymentStatus | null;
        invoiceSentAt: string | null; // YYYY-MM-DD
        invoiceExpectedAt: string | null; // YYYY-MM-DD
        evidence: Evidence;
      }
    | null;

  /* -------- Actions / Constraints -------- */
  requiredActions: Array<{
    name: string;
    description: string | null;
    evidence: Evidence;
  }>;

  mustAvoids: Array<{
    name: string;
    description: string | null;
    evidence: Evidence;
  }>;

  /* -------- Deliverables -------- */
  deliverables: Array<{
    platform: Platform;
    type: DeliverableType;
    quantity: number | null;
    dueDate: string | null; // YYYY-MM-DD
    dueDateRawText: string | null;
    description: string | null;
    evidence: Evidence;
  }>;
};

export interface CampaignExtractionMetadata {
  extraction: CampaignExtraction;
  usage: OpenAI.Completions.CompletionUsage | null;
  latencyMs: number;
  model: string;
  retries: number;
}
