export type GmailTokens = Record<string, any>;

export type GmailConnection = {
  id: string;
  user_id: string;
  email: string;
  tokens: GmailTokens;
  history_id: string | null;
  watch_expiration: string | null;
};
