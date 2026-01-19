import fs from "node:fs";

const HISTORY_FILE = "history.json";

/**
 * Read the last processed Gmail historyId from disk.
 */
export function getLastHistoryId(): string | null {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    const data = JSON.parse(raw);
    return data.lastHistoryId ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist the latest processed Gmail historyId to disk.
 */
export function setLastHistoryId(historyId: string) {
  const data = { lastHistoryId: historyId };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}
