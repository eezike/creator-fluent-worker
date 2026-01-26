export const DraftRequirement = {
  NONE: "none",
  OPTIONAL: "optional",
  REQUIRED: "required",
} as const;

export type DraftRequirement =
  (typeof DraftRequirement)[keyof typeof DraftRequirement];

export const PaymentStatus = {
  PENDING: "pending",
  PAID: "paid",
  LATE: "late",
} as const;

export type PaymentStatus =
  (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const UrgencyLevel = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type UrgencyLevel =
  (typeof UrgencyLevel)[keyof typeof UrgencyLevel];
