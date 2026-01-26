import type {
  Currency,
  DealStage,
  DeliverableType,
  EvidenceSource,
  LastActionNeededBy,
  PaymentStatus,
  Platform,
} from "./enums";

export type Evidence = {
  quote: string;
  source: EvidenceSource;
  page: number | null; // PDFs only; else null
};

export type Routing = {
  isDeal: boolean;
  dealStage: DealStage;
  shouldParseAttachments: boolean;
  routingReason: string | null; // short, optional
};

export type MinimalExtraction = {
  campaignName: { value: string; evidence: Evidence } | null;
  brandName: { value: string; evidence: Evidence } | null;
  lastActionNeededBy: { value: LastActionNeededBy; evidence: Evidence } | null;
  draftRequired: { value: boolean; evidence: Evidence } | null;

  goLiveWindow:
    | {
        rawText: string;
        startDate: string | null; // YYYY-MM-DD only if explicit
        endDate: string | null; // YYYY-MM-DD only if explicit
        evidence: Evidence;
      }
    | null;

  payment:
    | {
        amount: number | null;
        currency: Currency;
        paymentTerms: string | null; // keep short like "Net 30" if explicit
        evidence: Evidence;
      }
    | null;

  deliverablesSummary: { value: string; evidence: Evidence } | null;
};

export type DeepExtraction = {
  exclusivityRightsSummary: { value: string; evidence: Evidence } | null;
  usageRightsSummary: { value: string; evidence: Evidence } | null;

  payment: {
    amount: number | null;
    currency: Currency;
    paymentTerms: string | null;
    paymentStatus: PaymentStatus | null; // only if explicitly stated
    invoiceSentAt: string | null; // YYYY-MM-DD only if explicit
    invoiceExpectedAt: string | null; // YYYY-MM-DD only if explicit
    evidence: Evidence;
  };

  keyDates: Array<{
    name: string | null;
    dateRawText: string;
    startDate: string | null; // YYYY-MM-DD only if explicit
    endDate: string | null; // YYYY-MM-DD only if explicit
    description: string | null;
    evidence: Evidence;
  }>;

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

  deliverables: Array<{
    platform: Platform;
    type: DeliverableType;
    quantity: number | null;
    dueDate: string | null; // YYYY-MM-DD only if explicit
    dueDateRawText: string | null;
    description: string | null;
    evidence: Evidence;
  }>;
};

export type DecisionTreeResult = {
  routing: Routing;
  minimal?: MinimalExtraction | null;
  deep?: DeepExtraction | null;
};
