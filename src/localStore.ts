import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { CampaignContext, CampaignExtraction } from "./models";

const DB_PATH = process.env.LOCAL_CAMPAIGNS_PATH || "campaigns-local.json";

export type StoredCampaign = {
  id: string;
  received_at: string;
  context: CampaignContext;
  extraction: CampaignExtraction;
};

/**
 * Read all stored campaigns from disk, returning an empty array if missing.
 */
function readDb(): StoredCampaign[] {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw) as StoredCampaign[];
  } catch {
    return [];
  }
}

/**
 * Write the campaign array to the JSON file.
 */
function writeDb(data: StoredCampaign[]) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Append a campaign extraction + context to the local JSON store.
 */
export function saveCampaignLocally(
  extraction: CampaignExtraction,
  context: CampaignContext
): StoredCampaign {
  const record: StoredCampaign = {
    id: randomUUID(),
    received_at: new Date().toISOString(),
    context,
    extraction,
  };

  const db = readDb();
  db.push(record);
  writeDb(db);

  return record;
}
