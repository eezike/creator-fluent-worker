import type { GmailNotificationPayload } from "./pubsubModels";

export function parseGmailNotificationPayload(
  value: unknown
): GmailNotificationPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.emailAddress !== "string" || payload.emailAddress.length === 0) {
    return null;
  }
  const historyId = payload.historyId;
  if (
    (typeof historyId === "string" && historyId.length === 0) ||
    (typeof historyId !== "string" &&
      (typeof historyId !== "number" || !Number.isFinite(historyId)))
  ) {
    return null;
  }
  return {
    emailAddress: payload.emailAddress,
    historyId: String(historyId),
  };
}
