# Search Suggestions – Verification

## Request path (chain)

```
UI (HeroSearchBar / UniversalHeader / SearchInterface)
  → GET /api/search/suggestions?q=...&limit=10
  → Route: parse q, limit (5–20), rate limit, normalize
  → DB: createAdminClient().rpc('search_suggestions_rpc', { q_norm, lim, ... })
  → Tables: search_suggestions (phrase, phrase_norm, kind, is_public), search_suggestion_synonyms
  → Response: { suggestions, subcategories, products, meta }
  → UI: setSuggestions(data.suggestions), setShowSuggestions(!!hasAny)
```

Alternative path (RO suggest, used when `useRoSuggestions=true`):

```
UI (useSearchSuggestions)
  → GET /api/ro/search/suggest?q=...&limit=10
  → RPC search_suggestions_rpc → { ok, items: [{ phrase, kind, popularity }] }
  → UI: roItems
```

## curl examples

```bash
# Suggestions (main UI endpoint) – expect non-empty suggestions when DB has data
curl -s -o /dev/null -w "%{http_code}" "https://YOUR_SITE/api/search/suggestions?q=ap&limit=10"
# 200

curl -s "https://YOUR_SITE/api/search/suggestions?q=teren&limit=5" | jq '.suggestions | length'
# Should be >= 0; if DB populated, often 1–20

# Short query: returns trending (popular) list
curl -s "https://YOUR_SITE/api/search/suggestions?q=a&limit=5" | jq '.suggestions | length'
# Should be >= 0 (trending or fallback)

# RO suggest (RPC-only)
curl -s "https://YOUR_SITE/api/ro/search/suggest?q=apartament&limit=10" | jq '.items | length'
# Should be >= 0
```

## SQL to check counts

```sql
-- Total suggestions (public)
SELECT kind, COUNT(*) FROM public.search_suggestions WHERE is_public = true GROUP BY kind;

-- Sample query-like rows
SELECT phrase, phrase_norm, kind, popularity FROM public.search_suggestions
WHERE kind = 'query' AND is_public = true ORDER BY popularity DESC LIMIT 20;

-- Synonyms count
SELECT COUNT(*) FROM public.search_suggestion_synonyms;
```

## Rate limit

- 120 requests per IP per minute (in-memory; per Vercel instance).
- When exceeded: `429` with `{ error: "Too many requests", suggestions: [] }`.
- For production at scale, replace with Upstash Redis (see `lib/search/suggestRateLimit.ts`).

## Caching

- Response headers: `Cache-Control: public, s-maxage=10, stale-while-revalidate=50`
- Ensures CDN/edge can serve stale for 50s while revalidating; avoids “stuck empty” by short s-maxage.

## Logging

- Server logs one JSON line per request: `{ rid, q, limit, count, elapsed_ms }`.
- No user secrets; `q` truncated to 50 chars in logs.

---

## Production: manual indexes + ANALYZE

After deploying migrations, create suggest indexes **outside a transaction** (no lock in prod):

1. Run **Supabase SQL Editor** (or psql) without `BEGIN`/`COMMIT`.
2. Execute in order:
   - `scripts/db/manual/create_idx_suggest_user_seed_rank.sql`
   - `scripts/db/manual/create_idx_suggest_phrase_norm_prefix.sql`
3. Then: `ANALYZE search_suggestions;`

See **docs/search/INDEX_DEPLOYMENT.md** for details.

---

## Seed from titles (OpenClaw)

- **Enqueue:** `curl -X POST https://YOUR_SITE/api/agents/openclaw/update -H "Content-Type: application/json" -d '{"runSeedSuggestions": true}'` (with admin auth).
- **SQL count seeded:** `SELECT source, entity_type, COUNT(*) FROM public.search_suggestions WHERE source = 'seed_titles' GROUP BY source, entity_type;`
- **Confirm public suggest:** `curl -s "https://YOUR_SITE/api/ro/search/suggest?q=jag&limit=10" | jq '.items'` — should include "Jaguar" / "Jaguar F-PACE" when seeded from listings.
- **Gated channel:** Listings with `channel = 'executari_insolventa'` are not inserted; suggest returns only `is_public = true` (RPC v9 + RLS).
