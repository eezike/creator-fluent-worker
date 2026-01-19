import fs from "node:fs";
import { CampaignContext, CampaignExtraction } from "./models";

const SUPABASE_URL = process.env.SUPABASE_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ADMIN_API_URL =
  process.env.ADMIN_API_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/admin-api` : "");
const ADMIN_USERS_TABLE = process.env.ADMIN_USERS_TABLE || "auth.users";
const SUPABASE_LOG_PATH = process.env.SUPABASE_LOG_PATH || "supabase-sync.log";

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL in environment");
}

if (!ADMIN_API_KEY) {
  throw new Error("Missing ADMIN_API_KEY in environment");
}

if (!ADMIN_API_URL) {
  throw new Error("Missing ADMIN_API_URL in environment");
}

function logSupabaseSync(message: string, payload?: unknown) {
  const timestamp = new Date().toISOString();
  const line = payload
    ? `[${timestamp}] ${message} ${safeJson(payload)}`
    : `[${timestamp}] ${message}`;
  fs.appendFileSync(SUPABASE_LOG_PATH, `${line}\n`);
}

function safeJson(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return "[unserializable payload]";
  }
}

type AdminApiPayload = {
  action: "select" | "insert" | "update" | "get" | "delete";
  table: string;
  filters?: Record<string, string | number | boolean | null>;
  data?: Record<string, unknown>;
};

function normalizeAdminPayload(payload: AdminApiPayload): AdminApiPayload {
  if (!payload.data) return payload;
  const data = { ...payload.data };
  const columns = data.columns;
  if (Array.isArray(columns)) {
    data.columns = columns.join(",");
  }
  return { ...payload, data };
}

async function adminApiRequest<T>(payload: AdminApiPayload): Promise<T> {
  const adminApiKey = ADMIN_API_KEY as string;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-admin-key": adminApiKey,
  };
  const normalizedPayload = normalizeAdminPayload(payload);
  const res = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(normalizedPayload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Admin API ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

function normalizeRecords<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === "object") {
    const data = (response as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
    const records = (response as { data?: { records?: unknown } }).data?.records;
    if (Array.isArray(records)) return records as T[];
  }
  return [];
}

type DealInsert = {
  user_id: string;
  title: string;
  brand_name: string;
  deliverable_summary: string;
  draft_deadline: string | null;
  live_deadline: string | null;
  next_deadline: string | null;
  urgency_level: "low" | "medium" | "high";
  created_from: "manual" | "email";
  email_thread_id: string | null;
  draft_required: string | null;
  go_live_window: string | null;
  exclusivity: string | null;
  usage_rights: string | null;
  payment_amount: number | null;
  payment_status: "pending" | "paid" | "late";
  payment_terms: string | null;
  invoice_sent_date: string | null;
  expected_payment_date: string | null;
};

type ReminderInsert = {
  deal_id: string;
  type:
    | "deliverable"
    | "talking_point"
    | "do"
    | "dont"
    | "visual_requirement"
    | "hashtag_link"
    | "deadline"
    | "usage_restriction";
  text: string;
  is_critical: boolean;
  order_index: number;
  source: "manual" | "email" | "attachment";
};

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  logSupabaseSync("Lookup user by email", { email: normalizedEmail });

  try {
    const response = await adminApiRequest<unknown>({
      action: "select",
      table: ADMIN_USERS_TABLE,
      filters: { email: normalizedEmail },
      data: { limit: 1 },
    });
    const records = normalizeRecords<{ id?: string }>(response);
    const userId = records[0]?.id ?? null;
    logSupabaseSync("User lookup result", { email: normalizedEmail, userId });
    return userId;
  } catch (err) {
    logSupabaseSync("User lookup failed", { email: normalizedEmail, error: err });
    throw err;
  }
}

function buildGoLiveWindow(extraction: CampaignExtraction): string | null {
  const start = extraction.goLiveStart;
  const end = extraction.goLiveEnd;

  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  if (end) return `By ${end}`;
  return null;
}

function buildDeliverableSummary(extraction: CampaignExtraction): string {
  if (extraction.requiredActions && extraction.requiredActions.length > 0) {
    return extraction.requiredActions.map((action) => action.name).join("; ");
  }
  return "Auto-imported from email";
}

function buildReminderText(label: string, detail?: string | null) {
  if (!detail) return label;
  return `${label} — ${detail}`;
}

function buildDeadlineText(dateLabel: string, startDate?: string | null, endDate?: string | null) {
  if (startDate && endDate) return `${dateLabel} (${startDate} - ${endDate})`;
  if (startDate) return `${dateLabel} (${startDate})`;
  if (endDate) return `${dateLabel} (${endDate})`;
  return dateLabel;
}

function buildReminders(extraction: CampaignExtraction): Omit<ReminderInsert, "deal_id">[] {
  const reminders: Omit<ReminderInsert, "deal_id">[] = [];

  extraction.requiredActions?.forEach((action, index) => {
    reminders.push({
      type: "do",
      text: buildReminderText(action.name, action.description ?? null),
      is_critical: false,
      order_index: index,
      source: "email",
    });
  });

  extraction.keyDates?.forEach((date, index) => {
    reminders.push({
      type: "deadline",
      text: buildDeadlineText(
        date.name,
        date.startDate ?? null,
        date.endDate ?? null
      ),
      is_critical: false,
      order_index: index,
      source: "email",
    });
  });

  return reminders;
}

function buildDealPayload(
  extraction: CampaignExtraction,
  context: CampaignContext,
  userId: string
): DealInsert {
  const threadId = context.threadId ?? null;
  const liveDeadline = extraction.goLiveEnd ?? extraction.goLiveStart ?? null;

  return {
    user_id: userId,
    title: extraction.campaignName ?? context.subject ?? "Untitled Deal",
    brand_name: extraction.brand ?? context.from ?? "Unknown brand",
    deliverable_summary: buildDeliverableSummary(extraction),
    draft_deadline: extraction.draftDeadline ?? null,
    live_deadline: liveDeadline,
    next_deadline: liveDeadline,
    urgency_level: "low",
    created_from: "email",
    email_thread_id: threadId,
    draft_required: extraction.draftRequired ?? null,
    go_live_window: buildGoLiveWindow(extraction),
    exclusivity: extraction.exclusivity ?? null,
    usage_rights: extraction.usageRights ?? null,
    payment_amount: extraction.payment ?? null,
    payment_status: (extraction.paymentStatus as DealInsert["payment_status"]) ?? "pending",
    payment_terms: extraction.paymentTerms ?? null,
    invoice_sent_date: extraction.invoiceSentDate ?? null,
    expected_payment_date: extraction.expectedPaymentDate ?? null,
  };
}

function buildDealUpdatePayload(extraction: CampaignExtraction, context: CampaignContext) {
  const payload: Partial<DealInsert> = {};
  const liveDeadline = extraction.goLiveEnd ?? extraction.goLiveStart ?? null;

  if (extraction.campaignName || context.subject) {
    payload.title = extraction.campaignName ?? context.subject;
  }
  if (extraction.brand || context.from) {
    payload.brand_name = extraction.brand ?? context.from;
  }
  const deliverableSummary = buildDeliverableSummary(extraction);
  if (deliverableSummary) {
    payload.deliverable_summary = deliverableSummary;
  }
  if (liveDeadline) {
    payload.live_deadline = liveDeadline;
    payload.next_deadline = liveDeadline;
  }
  if (extraction.draftDeadline) payload.draft_deadline = extraction.draftDeadline;
  if (extraction.draftRequired) payload.draft_required = extraction.draftRequired;
  const goLiveWindow = buildGoLiveWindow(extraction);
  if (goLiveWindow) payload.go_live_window = goLiveWindow;
  if (extraction.exclusivity) payload.exclusivity = extraction.exclusivity;
  if (extraction.usageRights) payload.usage_rights = extraction.usageRights;
  if (extraction.payment !== null && extraction.payment !== undefined) {
    payload.payment_amount = extraction.payment;
  }
  if (extraction.paymentStatus) {
    payload.payment_status = extraction.paymentStatus as DealInsert["payment_status"];
  }
  if (extraction.paymentTerms) payload.payment_terms = extraction.paymentTerms;
  if (extraction.invoiceSentDate) payload.invoice_sent_date = extraction.invoiceSentDate;
  if (extraction.expectedPaymentDate) {
    payload.expected_payment_date = extraction.expectedPaymentDate;
  }

  return payload;
}

export async function upsertDealFromExtraction(
  extraction: CampaignExtraction,
  context: CampaignContext,
  userId: string
) {
  const threadId = context.threadId ?? null;

  let existingDealId: string | null = null;

  if (threadId) {
    const response = await adminApiRequest<unknown>({
      action: "select",
      table: "deals",
      filters: { user_id: userId, email_thread_id: threadId },
      data: { limit: 1, columns: ["id"] },
    });
    const records = normalizeRecords<{ id?: string }>(response);
    existingDealId = records[0]?.id ?? null;
  }

  if (!existingDealId) {
    const dealPayload = buildDealPayload(extraction, context, userId);
    logSupabaseSync("Create deal payload", dealPayload);
    const createResponse = await adminApiRequest<unknown>({
      action: "insert",
      table: "deals",
      data: { records: [dealPayload] },
    });
    const createdRecords = normalizeRecords<{ id?: string }>(createResponse);
    const createdId = createdRecords[0]?.id;

    if (!createdId) {
      logSupabaseSync("Create deal failed", { response: createResponse });
      throw new Error("Failed to create deal: missing id in response");
    }

    const reminders = buildReminders(extraction);
    if (reminders.length > 0) {
      logSupabaseSync("Create reminders payload", reminders);
      const reminderResponse = await adminApiRequest<unknown>({
        action: "insert",
        table: "reminders",
        data: {
          records: reminders.map((reminder) => ({ ...reminder, deal_id: createdId })),
        },
      });
      logSupabaseSync("Create reminders response", reminderResponse);
    }

    return { id: createdId, created: true };
  }

  const updatePayload = buildDealUpdatePayload(extraction, context);
  if (Object.keys(updatePayload).length > 0) {
    logSupabaseSync("Update deal payload", { id: existingDealId, update: updatePayload });
    const updateResponse = await adminApiRequest<unknown>({
      action: "update",
      table: "deals",
      filters: { id: existingDealId },
      data: { values: updatePayload },
    });
    logSupabaseSync("Update deal response", updateResponse);
  }

  const reminders = buildReminders(extraction);
  if (reminders.length > 0) {
    logSupabaseSync("Load existing reminders", { dealId: existingDealId });
    const remindersResponse = await adminApiRequest<unknown>({
      action: "select",
      table: "reminders",
      filters: { deal_id: existingDealId },
      data: { columns: ["type", "text"] },
    });
    const existingReminders = normalizeRecords<{ type?: string; text?: string }>(
      remindersResponse
    );

    const reminderIndex = new Set(
      (existingReminders || []).map(
        (reminder) =>
          `${reminder.type ?? ""}|${(reminder.text ?? "").trim().toLowerCase()}`
      )
    );

    const newReminders = reminders.filter((reminder) => {
      const key = `${reminder.type}|${reminder.text.trim().toLowerCase()}`;
      return !reminderIndex.has(key);
    });

    if (newReminders.length > 0) {
      logSupabaseSync("Append reminders payload", {
        dealId: existingDealId,
        reminders: newReminders,
      });
      const appendResponse = await adminApiRequest<unknown>({
        action: "insert",
        table: "reminders",
        data: {
          records: newReminders.map((reminder) => ({
            ...reminder,
            deal_id: existingDealId,
          })),
        },
      });
      logSupabaseSync("Append reminders response", appendResponse);
    }
  }

  return { id: existingDealId, created: false };
}
