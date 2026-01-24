import { SupabaseClient } from "@supabase/supabase-js";
import type {
  CampaignContext,
  CampaignExtraction,
} from "../aiExtractor/aiExtractorModels";
import { PaymentStatus, UrgencyLevel } from "../aiExtractor/aiExtractorEnums";

/**
 * Parse a readable name from the email From header.
 */
function parseDisplayName(from: string) {
  const match = from.match(/^(.*)<.*>$/);
  if (match) {
    const name = match[1]?.replace(/"/g, "").trim();
    if (name) return name;
  }
  const email = from.trim();
  if (email.includes("@")) {
    return email.split("@")[0];
  }
  return email;
}

/**
 * Normalize payment status into the app's enum values.
 */
function normalizePaymentStatus(status: string | null | undefined): PaymentStatus {
  const normalized = status?.toLowerCase().trim();
  if (!normalized) return PaymentStatus.PENDING;
  if (normalized.includes("paid")) return PaymentStatus.PAID;
  if (normalized.includes("late") || normalized.includes("overdue")) return PaymentStatus.LATE;
  return PaymentStatus.PENDING;
}

/**
 * Pick the next deadline timestamp from known date fields.
 */
function pickNextDeadline(dates: Array<string | null | undefined>) {
  const now = Date.now();
  const parsed = dates
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);
  const upcoming = parsed.find((value) => value >= now);
  const earliest = parsed[0];
  if (!upcoming && earliest !== undefined) {
    return new Date(earliest).toISOString();
  }
  return upcoming ? new Date(upcoming).toISOString() : null;
}

/**
 * Compute urgency based on how soon the next deadline is.
 */
function computeUrgencyLevel(nextDeadline: string | null): UrgencyLevel {
  if (!nextDeadline) return UrgencyLevel.LOW;
  const target = Date.parse(nextDeadline);
  if (Number.isNaN(target)) return UrgencyLevel.LOW;
  const days = (target - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= 3) return UrgencyLevel.HIGH;
  if (days <= 14) return UrgencyLevel.MEDIUM;
  return UrgencyLevel.LOW;
}

/**
 * Build a short summary based on extracted actions or notes.
 */
function buildDeliverableSummary(extraction: CampaignExtraction) {
  if (extraction.notes) return extraction.notes;
  if (extraction.requiredActions?.length) {
    const names = extraction.requiredActions
      .map((action) => action.name)
      .filter(Boolean)
      .slice(0, 3);
    if (names.length) {
      return `Required actions: ${names.join(", ")}`;
    }
  }
  return "Imported from email";
}

/**
 * Convert a go-live window into a display-ready string.
 */
function buildGoLiveWindow(start: string | null, end: string | null) {
  if (start && end) return `${start} - ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return null;
}

/**
 * Normalize date strings to UTC ISO 8601 timestamps.
 */
function normalizeDateTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Upsert a deal record based on the extraction payload.
 */
export async function upsertDealFromExtraction(
  supabase: SupabaseClient,
  extraction: CampaignExtraction,
  context: CampaignContext,
  userId: string
) {
  const draftDeadline = normalizeDateTime(extraction.draftDeadline);
  const goLiveStart = normalizeDateTime(extraction.goLiveStart);
  const goLiveEnd = normalizeDateTime(extraction.goLiveEnd);
  const liveDeadline = goLiveEnd ?? null;
  const nextDeadline = pickNextDeadline([draftDeadline, goLiveStart, liveDeadline]);
  const urgency = computeUrgencyLevel(nextDeadline);
  const invoiceSentDate = normalizeDateTime(extraction.invoiceSentDate);
  const expectedPaymentDate = normalizeDateTime(extraction.expectedPaymentDate);

  const payload = {
    user_id: userId,
    title: extraction.campaignName ?? context.subject ?? "New campaign",
    brand_name: extraction.brand ?? parseDisplayName(context.from) ?? "Unknown",
    deliverable_summary: buildDeliverableSummary(extraction),
    draft_deadline: draftDeadline,
    live_deadline: liveDeadline,
    next_deadline: nextDeadline,
    urgency_level: urgency,
    created_from: "email",
    email_thread_id: context.threadId ?? null,
    draft_required: extraction.draftRequired,
    go_live_window: buildGoLiveWindow(goLiveStart, goLiveEnd),
    exclusivity: extraction.exclusivity,
    usage_rights: extraction.usageRights,
    payment_amount: extraction.payment,
    payment_status: normalizePaymentStatus(extraction.paymentStatus),
    payment_terms: extraction.paymentTerms,
    invoice_sent_date: invoiceSentDate,
    expected_payment_date: expectedPaymentDate,
  };

  if (context.threadId) {
    const { data: existing, error: existingError } = await supabase
      .from("deals")
      .select("id")
      .eq("user_id", userId)
      .eq("email_thread_id", context.threadId)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to query existing deal: ${existingError.message}`);
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(`Failed to update deal: ${updateError.message}`);
      }

      return { id: existing.id, created: false };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("deals")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Failed to insert deal: ${insertError.message}`);
  }

  return { id: inserted.id, created: true };
}
