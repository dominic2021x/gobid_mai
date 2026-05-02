#!/bin/bash
# Run Supabase link without loading .env.local (its multi-line JSON breaks the CLI parser).
set -e
cd "$(dirname "$0")/.."
if [ -f .env.local ]; then
  mv .env.local .env.local.bak
  trap 'mv .env.local.bak .env.local' EXIT
fi
npx supabase link --project-ref edksysetafmfsngzggwt "$@"
