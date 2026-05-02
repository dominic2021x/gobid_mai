# Supabase pool: transaction mode (Phase 3.3)

High `set_config` / JWT churn in `pg_stat_statements` often comes from **session-mode** pooling where each HTTP request gets a fresh server session.

## What to try

1. In Supabase Dashboard → **Database** → **Connection pooling**, prefer **Transaction mode** for serverless / API-heavy workloads when compatible with your SQL (no `SET LOCAL` spanning multiple statements that must stick on one session).
2. Prefer **one pooled connection string** for app servers and reuse clients (singleton `pg` / Supabase client), not per-request new pools.
3. After switching modes, compare `pg_stat_statements` counts for `set_config` and median latency on `/api/ro/listings`.

## Caveats

- Transaction pooling breaks some session-level features (prepared statements pinned to session, some `LISTEN`, long `SET` lifetimes). Validate migrations and admin scripts.
