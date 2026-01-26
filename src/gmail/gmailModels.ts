export interface CampaignEmail {
  threadId?: string;
  subject: string;
  from: string;
  body: string;
  receivedAt: string | null;
}
