# Search suggestions – index deployment (production)

## Production manual step

Supabase CLI runs migrations inside a transaction. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so the suggest ranking and prefix indexes are **not** created by migrations.

**After deploying migrations** (including `20260228_suggest_ranking_index.sql` and `20260229_suggest_prefix_index_rpc_v9.sql`), run the following **manually** in production:

1. **Supabase Dashboard → SQL Editor** (or `psql` connected to the project), **without** starting a transaction (no `BEGIN`).
2. Run each script once, in order:
   - `scripts/db/manual/create_idx_suggest_user_seed_rank.sql`
   - `scripts/db/manual/create_idx_suggest_phrase_norm_prefix.sql`
3. Then run: `ANALYZE search_suggestions;`

This creates the indexes without long table locks (CONCURRENTLY) and updates planner statistics.

## Scripts

| Script | Index | Purpose |
|--------|--------|--------|
| `create_idx_suggest_user_seed_rank.sql` | `idx_suggest_user_seed_rank` | Supports ORDER BY user_count, seed_count, updated_at in suggest RPC. |
| `create_idx_suggest_phrase_norm_prefix.sql` | `idx_suggest_phrase_norm_prefix` | Supports `phrase_norm LIKE 'x%'` in suggest RPC. |

## Local / dev fallback

For local or dev databases where CONCURRENTLY is not required, you can create the same indexes without CONCURRENTLY so the RPC can use them:

```sql
CREATE INDEX IF NOT EXISTS idx_suggest_user_seed_rank
  ON public.search_suggestions (
    (COALESCE((meta->>'user_count')::int, 0)),
    (COALESCE((meta->>'seed_count')::int, 0)),
    updated_at DESC
  )
  WHERE is_public = true AND kind = 'query';

CREATE INDEX IF NOT EXISTS idx_suggest_phrase_norm_prefix
  ON public.search_suggestions (phrase_norm text_pattern_ops)
  WHERE is_public = true AND kind = 'query';

ANALYZE search_suggestions;
```

(Table lock is brief; acceptable for small `search_suggestions` in dev.)
