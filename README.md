# Fluent Gmail → Campaign Ingest (MVP)

Parses incoming Gmail messages, uses OpenAI to extract campaign details, and saves them to a local JSON file (no campaign matching).

## Required env
Required by the worker:
- `SUPABASE_URL` (Supabase project URL)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (edge function callback URL)
- `GMAIL_TOKEN_ENCRYPTION_KEY` (base64 32 bytes)
- `GCP_PROJECT_ID`
- `PUBSUB_TOPIC_ID`
- `PUBSUB_SUB_ID`
- `GOOGLE_APPLICATION_CREDENTIALS` (path to service account JSON)

Optional:
- `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`, defaults `gpt-4o-mini`)
- `LOCAL_CAMPAIGNS_PATH` (optional, defaults `campaigns-local.json`)
- `SUPABASE_LOG_PATH` (optional, defaults `supabase-sync.log`)

## Flow
- Gmail push notification → `src/worker.ts` fetches the message.
- `src/gmailParser.ts` pulls the text body.
- `src/classifier.ts` does a quick keyword filter to avoid unnecessary OpenAI calls.
- `src/openaiExtractor.ts` asks OpenAI for structured data (draft required, exclusivity, usage, go-live, payment, key dates, actions).
- `src/localStore.ts` appends the extraction + email context into the JSON file.

## How to run
1) Install deps: `npm install`
2) Fill `.env` with the required vars (Supabase, Gmail, Pub/Sub, encryption) plus `OPENAI_API_KEY` if you want extraction.
3) Connect Gmail through the app (runs the OAuth flow and stores tokens in Supabase).
4) Start everything (ensures sub/watch + worker): `npx ts-node src/runAll.ts`
5) Send a test email containing campaign-like wording; check `campaigns-local.json` for saved extractions.

## Local OAuth testing checklist
- Confirm `GMAIL_PUBSUB_TOPIC` is set in Supabase secrets and the function is deployed.
- Connect Gmail in the app and verify `gmail_connections` has `history_id` + `watch_expiration`.
- Start the worker and watch logs for Pub/Sub message handling.

## Deploy on Fly.io (pull worker)
1) `fly launch` in `creator-fluent-worker` (choose Dockerfile deployment).
2) Set secrets (use `fly secrets set ...`):
   - All required env vars from `.env`.
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` with your service account JSON contents.
3) `fly deploy`

## What it does
- Listens to Gmail INBOX changes via Pub/Sub push notifications.
- Fetches new messages, pulls the text body, and runs a keyword classifier to decide if it’s campaign-related.
- Calls OpenAI to extract structured campaign details (draft requirement, exclusivity, usage rights, go-live window, payment, key dates, required actions).
- Saves the extraction plus email context to a local JSON file for later review.
