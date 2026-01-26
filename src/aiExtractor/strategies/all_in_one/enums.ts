export const DEAL_STAGES = [
  "INBOUND",
  "NEGOTIATION",
  "CONTRACTING",
  "SCHEDULING",
  "FULFILLMENT",
  "PAYMENT",
  "COMPLETED",
  "DEAD",
  "OTHER",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const LAST_ACTION_NEEDED_BY = [
  "CREATOR",
  "BRAND",
  "AGENT",
  "PLATFORM",
  "OTHER",
] as const;

export type LastActionNeededBy = (typeof LAST_ACTION_NEEDED_BY)[number];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "OTHER"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_STATUSES = [
  "NOT_APPLICABLE",
  "NOT_INVOICED",
  "INVOICE_REQUESTED",
  "INVOICE_SENT",
  "PAID",
  "OVERDUE",
  "UNKNOWN",
  "OTHER",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PLATFORMS = [
  "INSTAGRAM",
  "TIKTOK",
  "YOUTUBE",
  "TWITCH",
  "X",
  "PINTEREST",
  "FACEBOOK",
  "BLOG",
  "PODCAST",
  "OTHER",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const DELIVERABLE_TYPES = [
  "POST",
  "REEL",
  "STORY",
  "TIKTOK",
  "SHORT",
  "VIDEO",
  "LIVESTREAM",
  "CAROUSEL",
  "THREAD",
  "BLOG_POST",
  "PODCAST_EPISODE",
  "OTHER",
] as const;

export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const EVIDENCE_SOURCES = [
  "EMAIL_SUBJECT",
  "EMAIL_FROM",
  "EMAIL_BODY",
  "PDF_TEXT",
  "OTHER",
] as const;

export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];
