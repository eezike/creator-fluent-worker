#!/bin/sh
set -e

if [ -n "$GOOGLE_APPLICATION_CREDENTIALS_JSON" ] && [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  mkdir -p /app/.secrets
  echo "$GOOGLE_APPLICATION_CREDENTIALS_JSON" > /app/.secrets/service-account.json
  export GOOGLE_APPLICATION_CREDENTIALS=/app/.secrets/service-account.json
fi

node dist/runAll.js
