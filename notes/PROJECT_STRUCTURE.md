# Project Structure Notes

This worker codebase is organized by domain folders with a consistent naming scheme.

## Folder layout (src)
- env: Environment loading and models.
  - envService.ts (getEnvConfig)
  - envModels.ts (EnvConfig)
- watch: Gmail watch-related logic.
  - gmailWatchService.ts
  - watchDao.ts
  - watchModels.ts
  - credentialsService.ts
- pubsub: Pub/Sub-related logic.
  - pubsubService.ts
  - pubsubConstants.ts
- gmail: Gmail notification processing.
  - gmailWorkerService.ts
  - gmailDao.ts
  - gmailModels.ts
  - gmailConstants.ts
- classifier: Email classification logic.
  - classifierService.ts
  - classifierModels.ts
  - classifierConstants.ts
- aiExtractor: OpenAI extraction logic.
  - aiExtractorService.ts
  - aiExtractorModels.ts
  - aiExtractorConstants.ts
  - aiExtractorEnums.ts
- dealSync: Supabase deal syncing.
  - dealSyncService.ts
- supabase: Supabase client setup and Supabase models.
  - supabaseService.ts
  - supabaseModels.ts
- utils: Shared helpers.
  - emailUtils.ts
  - tokenCrypto.ts
  - retry.ts

## Naming conventions
- *Service.ts: functional logic and orchestration.
- *Dao.ts: data access logic for a domain.
- *Models.ts: types/interfaces and data shapes.
- *Constants.ts: constant values.
- *Enums.ts: enums for a domain.

## Rules we are following
- Keep domain-specific data access in its domain (e.g., Gmail DAO in gmail/, watch DAO in watch/).
- Prefer explicit types like SupabaseClient/EnvConfig over ReturnType when possible.
- Avoid index.ts barrels for now; use explicit import paths.
- Keep small shared helpers in utils/ (e.g., tokenCrypto, retry, email normalization).

## Entry point
- runAll.ts wires together env, supabase, watch refresh, and pubsub.
