# Fluent Gmail Ingest (Worker)

Pulls Gmail change events from Pub/Sub, fetches new messages, classifies them, extracts campaign data, and writes deals to Supabase.

## Required env
- `SUPABASE_URL`
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
- Pub/Sub pull subscription via `src/runAll.ts`.
- `src/gmailParser.ts` extracts message text.
- `src/classifier.ts` filters candidates.
- `src/openaiExtractor.ts` extracts structured data.
- `src/dealSync.ts` writes to Supabase.

## How to run
1) Install deps: `npm install`
2) Fill `.env` with the required vars (Supabase, Gmail, Pub/Sub, encryption) plus `OPENAI_API_KEY` if you want extraction.
3) Connect Gmail through the app (OAuth stores tokens in Supabase).
4) Start the worker: `npx ts-node src/runAll.ts`
5) Send a test email and check your Supabase deals.

## Local OAuth testing checklist
- Confirm `GMAIL_PUBSUB_TOPIC` is set in Supabase secrets and the function is deployed.
- Connect Gmail and verify `gmail_connections` has `history_id` + `watch_expiration`.
- Start the worker and watch logs for Pub/Sub message handling.

## Deploy on Fly.io (pull worker)
1) `fly launch` in `creator-fluent-worker` (choose Dockerfile deployment).
2) Import secrets from `.env`:
   - `fly secrets import < <(grep -v '^#' .env | sed '/^$/d')`
3) Add service account JSON:
   - `fly secrets set GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat /path/to/service-account.json)"`
4) `fly deploy`
