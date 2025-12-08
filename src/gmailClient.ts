import { google } from "googleapis";
import fs from "node:fs";

const TOKENS_PATH = "tokens.json";

export function createGmailClient() {
  const raw = fs.readFileSync(TOKENS_PATH, "utf-8");
  const tokens = JSON.parse(raw);

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  oAuth2Client.setCredentials(tokens);

  return google.gmail({ version: "v1", auth: oAuth2Client });
}
