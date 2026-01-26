import {
  CURRENCIES,
  DEAL_STAGES,
  DELIVERABLE_TYPES,
  EVIDENCE_SOURCES,
  LAST_ACTION_NEEDED_BY,
  PAYMENT_STATUSES,
  PLATFORMS,
} from "./enums";

const paymentStatusEnum = [...PAYMENT_STATUSES, null] as const;

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    quote: { type: "string", minLength: 1, maxLength: 240 },
    source: { type: "string", enum: EVIDENCE_SOURCES },
    page: { type: ["integer", "null"], minimum: 1 },
  },
  required: ["quote", "source", "page"],
} as const;

const isoDateOrNull = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
} as const;

export const campaignExtractionSchema = {
  name: "deal_oneshot_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      // --- Routing ---
      isDeal: { type: "boolean" },
      dealStage: {
        type: "string",
        enum: DEAL_STAGES,
      },

      // --- Core labels ---
      campaignName: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          value: { type: "string", minLength: 1, maxLength: 120 },
          evidence: evidenceSchema,
        },
        required: ["value", "evidence"],
      },

      brandName: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          value: { type: "string", minLength: 1, maxLength: 120 },
          evidence: evidenceSchema,
        },
        required: ["value", "evidence"],
      },

      lastActionNeededBy: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          value: { type: "string", enum: LAST_ACTION_NEEDED_BY },
          evidence: evidenceSchema,
        },
        required: ["value", "evidence"],
      },

      draftRequired: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          value: { type: "boolean" },
          evidence: evidenceSchema,
        },
        required: ["value", "evidence"],
      },

      // --- Timeline ---
      goLiveWindow: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          rawText: { type: "string", minLength: 1, maxLength: 120 },
          startDate: isoDateOrNull,
          endDate: isoDateOrNull,
          evidence: evidenceSchema,
        },
        required: ["rawText", "startDate", "endDate", "evidence"],
      },

      keyDates: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: ["string", "null"], maxLength: 80 },
            dateRawText: { type: "string", minLength: 1, maxLength: 120 },
            startDate: isoDateOrNull,
            endDate: isoDateOrNull,
            description: { type: ["string", "null"], maxLength: 160 },
            evidence: evidenceSchema,
          },
          required: ["name", "dateRawText", "startDate", "endDate", "description", "evidence"],
        },
      },

      // --- Deal terms ---
      exclusivityRightsSummary: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          value: { type: "string", minLength: 1, maxLength: 180 },
          evidence: evidenceSchema,
        },
        required: ["value", "evidence"],
      },

      usageRightsSummary: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          value: { type: "string", minLength: 1, maxLength: 180 },
          evidence: evidenceSchema,
        },
        required: ["value", "evidence"],
      },

      // --- Payment ---
      payment: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          amount: { type: ["number", "null"], minimum: 0 },
          currency: { type: "string", enum: CURRENCIES },
          paymentTerms: { type: ["string", "null"], maxLength: 120 },
          paymentStatus: {
            type: ["string", "null"],
            enum: paymentStatusEnum,
          },
          invoiceSentAt: isoDateOrNull,
          invoiceExpectedAt: isoDateOrNull,
          evidence: evidenceSchema,
        },
        required: [
          "amount",
          "currency",
          "paymentTerms",
          "paymentStatus",
          "invoiceSentAt",
          "invoiceExpectedAt",
          "evidence",
        ],
      },

      // --- Actions / constraints ---
      requiredActions: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            description: { type: ["string", "null"], maxLength: 160 },
            evidence: evidenceSchema,
          },
          required: ["name", "description", "evidence"],
        },
      },

      mustAvoids: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            description: { type: ["string", "null"], maxLength: 160 },
            evidence: evidenceSchema,
          },
          required: ["name", "description", "evidence"],
        },
      },

      // --- Deliverables ---
      deliverables: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            platform: {
              type: "string",
              enum: PLATFORMS,
            },
            type: {
              type: "string",
              enum: DELIVERABLE_TYPES,
            },
            quantity: { type: ["integer", "null"], minimum: 1 },
            dueDate: isoDateOrNull,
            dueDateRawText: { type: ["string", "null"], maxLength: 120 },
            description: { type: ["string", "null"], maxLength: 160 },
            evidence: evidenceSchema,
          },
          required: ["platform", "type", "quantity", "dueDate", "dueDateRawText", "description", "evidence"],
        },
      },
    },
    required: [
      "isDeal",
      "dealStage",
      "campaignName",
      "brandName",
      "lastActionNeededBy",
      "draftRequired",
      "goLiveWindow",
      "exclusivityRightsSummary",
      "usageRightsSummary",
      "payment",
      "keyDates",
      "requiredActions",
      "mustAvoids",
      "deliverables",
    ],
  },
} as const;
