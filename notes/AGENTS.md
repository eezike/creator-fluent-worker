# AI Instructions

Follow these conventions when updating the worker codebase.

## Structure and naming
- Keep logic grouped by domain folders under src/.
- Use these suffixes consistently:
  - *Service.ts for orchestration/logic
  - *Dao.ts for data access
  - *Models.ts for types/interfaces
  - *Constants.ts for constants
  - *Enums.ts for enums
- Prefer explicit imports and types over ReturnType when the type is obvious.
- Avoid index.ts barrels; use explicit file paths in imports.

## Domain ownership
- watch/: Gmail watch logic and persistence for watch-related data.
- pubsub/: Pub/Sub initialization, subscriptions, and workers.
- gmail/: Gmail notification processing and Gmail-specific DAO/models.
- classifier/: email classification logic and related constants/models.
- aiExtractor/: OpenAI extraction logic, schema/models/enums/constants.
- dealSync/: syncing extracted deals to Supabase.
- supabase/: Supabase client configuration and Supabase models.
- utils/: shared helpers (tokenCrypto, retry, email utils).

## Refactor guidance
- If a function is only used by one domain, move it into that domain.
- Keep data access functions near the domain that uses them.
- When moving files, update all import paths and fix relative imports.
