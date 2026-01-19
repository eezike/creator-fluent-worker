import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';

const clientId = process.env.GOOGLE_CLIENT_ID!;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
const projectId = process.env.GCP_PROJECT_ID!;
const topicId = process.env.PUBSUB_TOPIC_ID!;

if (!clientId || !clientSecret || !redirectUri || !projectId || !topicId) {
  throw new Error('Missing env vars. Check .env file.');
}

// Load tokens we previously saved
const tokensRaw = fs.readFileSync('tokens.json', 'utf-8');
const tokens = JSON.parse(tokensRaw);

const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

oAuth2Client.setCredentials(tokens);

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

/**
 * Register a Gmail watch to push INBOX changes to the configured Pub/Sub topic.
 */
async function main() {
  const topicName = `projects/${projectId}/topics/${topicId}`;

  console.log('Setting up Gmail watch on topic:', topicName);

  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName,
      labelIds: ['INBOX'], // only notify on INBOX changes
    },
  });

  console.log('Watch response:', res.data);

  const historyId = res.data.historyId;
  if (!historyId) {
    throw new Error('No historyId returned from Gmail watch');
  }

  console.log('\n✅ Gmail watch set up successfully.');
  console.log('Initial historyId:', historyId);
  console.log('\nGmail will now publish messages to that Pub/Sub topic when your INBOX changes.');
}

main().catch(err => {
  console.error('Error setting up watch:', err.response?.data || err);
  process.exit(1);
});
