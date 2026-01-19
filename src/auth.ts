import 'dotenv/config';
import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';

const clientId = process.env.GOOGLE_CLIENT_ID!;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

if (!clientId || !clientSecret || !redirectUri) {
  throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env');
}

const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// Scopes: read-only Gmail access (enough for our use case)
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/**
 * Prompt the user in the terminal and resolve with their input.
 */
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve =>
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    }),
  );
}

/**
 * Runs the OAuth flow and saves tokens to disk.
 */
async function main() {
  // 1) Generate auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // ensure we get a refresh_token
  });

  console.log('\nAuthorize this app by visiting this URL:\n');
  console.log(authUrl);
  console.log('\nAfter approving, you will be redirected to your redirect URI.');
  console.log('Copy the "code" query parameter from the URL and paste it here.\n');

  // 2) Get "code" from user
  const code = await askQuestion('Enter the code from the URL: ');

  // 3) Exchange code for tokens
  const { tokens } = await oAuth2Client.getToken(code.trim());
  console.log('\nTokens received:\n', tokens);

  // 4) Save tokens to tokens.json
  fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
  console.log('\nSaved tokens to tokens.json');
}

main().catch(err => {
  console.error('Error during auth:', err);
  process.exit(1);
});
