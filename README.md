# Fluent Gmail → Campaign Ingest (MVP)

Parses incoming Gmail messages, uses OpenAI to extract campaign details, and saves them to a local JSON file (no campaign matching).

## Required env
- `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`, defaults `gpt-4o-mini`)
- `LOCAL_CAMPAIGNS_PATH` (optional, defaults `campaigns-local.json`)
- Existing Gmail/PubSub env already present in `.env`
- `SUPABASE_URL` (Supabase project URL)
- `ADMIN_API_KEY` (Lovable admin API key)
- `ADMIN_API_URL` (optional, defaults `${SUPABASE_URL}/functions/v1/admin-api`)
- `ADMIN_USERS_TABLE` (optional, defaults `auth.users`)
- `SUPABASE_LOG_PATH` (optional, defaults `supabase-sync.log`)

## Flow
- Gmail push notification → `src/worker.ts` fetches the message.
- `src/gmailParser.ts` pulls the text body.
- `src/classifier.ts` does a quick keyword filter to avoid unnecessary OpenAI calls.
- `src/openaiExtractor.ts` asks OpenAI for structured data (draft required, exclusivity, usage, go-live, payment, key dates, actions).
- `src/localStore.ts` appends the extraction + email context into the JSON file.

## How to run
1) Install deps: `npm install`
2) Fill `.env` with Gmail/PubSub vars plus `OPENAI_API_KEY` (and optional `LOCAL_CAMPAIGNS_PATH`).
3) Generate Gmail tokens once (writes `tokens.json`): `npx ts-node src/auth.ts`
4) Start everything (ensures sub/watch + worker): `npx ts-node src/runAll.ts`
5) Send a test email containing campaign-like wording; check `campaigns-local.json` for saved extractions.

## What it does
- Listens to Gmail INBOX changes via Pub/Sub push notifications.
- Fetches new messages, pulls the text body, and runs a keyword classifier to decide if it’s campaign-related.
- Calls OpenAI to extract structured campaign details (draft requirement, exclusivity, usage rights, go-live window, payment, key dates, required actions).
- Saves the extraction plus email context to a local JSON file for later review.
