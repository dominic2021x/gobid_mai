# Suggestion ranking + learning system (gobid.ro)

Production-ready ranking and learning pipeline for search suggestions. No AI/embeddings in this phase; deterministic scoring and offline aggregation.

---

## Architecture overview

```
┌─────────────────┐     GET /api/ro/search/suggest?q=...
│   Client (UI)   │ ────────────────────────────────────────►  Fetch 50 candidates (RPC)
└────────┬────────┘                                            Build features (Node)
         │                                                     Rerank → top 8–10
         │ POST /api/ro/search/suggest/track                   Return { items } (backward compatible)
         │ { event_type, query_norm, suggestions }
         ▼
┌─────────────────┐     INSERT search_suggestion_events (impression | click | submit)
│  Track API      │     Rate-limit by session_id; IP hashed server-side
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Cron GET /api/jobs/aggregate-suggestion-stats (every 6h)
│  Aggregate job  │     Aggregate events → search_suggestion_daily_stats (by day)
└────────┬────────┘     Recompute quality_score, rank_score → search_suggestions
         │
         ▼
┌─────────────────┐     Next suggest request uses updated rank/quality from DB
│ search_suggestions │   RPC returns is_active=true only; candidates reranked in Node
└─────────────────┘
```

- **Candidate generation**: DB (RPC `search_suggestions_candidates_rpc`), prefix + fuzzy, limit 80.
- **Ranking**: Node (lib/search/suggestions/ranking): features + `scoreSuggestion` + sort.
- **Learning**: Raw events → daily stats (aggregation job) → quality_score / rank_score written back to `search_suggestions`.

---

## File-by-file implementation

| Component | Path | Purpose |
|-----------|------|---------|
| Migration | `supabase/migrations/20260415_suggestion_ranking_learning.sql` | New columns on `search_suggestions`; `search_suggestion_events`; `search_suggestion_daily_stats`; indexes; RPCs `search_suggestions_candidates_rpc`, `upsert_suggestion_daily_stats_batch` |
| Ranking types | `lib/search/suggestions/ranking/types.ts` | `SuggestionCandidate`, `SuggestionFeatures`, `RankedSuggestion`, `RankingContext` |
| Constants | `lib/search/suggestions/ranking/constants.ts` | Weights and thresholds (lexical, CTR, recency, exploration, etc.) |
| Features | `lib/search/suggestions/ranking/buildSuggestionFeatures.ts` | Build features from candidate + context + optional stats |
| Score | `lib/search/suggestions/ranking/scoreSuggestion.ts` | Single scalar score from features |
| Rerank | `lib/search/suggestions/ranking/rerankSuggestions.ts` | Build features, score, sort, return top K |
| Track API | `app/api/ro/search/suggest/track/route.ts` | POST; event_type impression/click/submit; batch impressions; CRON not required; rate-limit by session |
| Aggregate job | `app/api/jobs/aggregate-suggestion-stats/route.ts` | GET; CRON_SECRET; events → daily_stats; recompute quality/rank → search_suggestions |
| Suggest route | `app/api/ro/search/suggest/route.ts` | GET; fetch 50 candidates (candidates RPC); rerank; return top 8–10; same response shape |

---

## Database (migration)

- **search_suggestions** (new columns): `source_priority`, `channel`, `category_key`, `frequency_count`, `last_seen_at`, `quality_score`, `rank_score`, `is_active`. Indexes: `(is_active, rank_score)`, `last_seen_at`.
- **search_suggestion_events**: `id`, `suggestion_id` (FK, nullable), `query_norm`, `event_type` (impression | click | submit), `session_id_hash`, `ip_hash`, `channel`, `meta`, `created_at`. Indexes: suggestion_id, query_norm, created_at, event_type, channel.
- **search_suggestion_daily_stats**: `suggestion_id`, `day`, `channel`, `category_key`, `impressions`, `clicks`, `submits`. Unique `(suggestion_id, day, channel, category_key)`. Indexes: suggestion_id, day, channel, category_key.
- **RPCs**: `search_suggestions_candidates_rpc` (candidates for rerank; is_active=true; limit up to 80); `upsert_suggestion_daily_stats_batch` (idempotent batch upsert for aggregation).

---

## Ranking formula (summary)

- **Lexical**: exact match > prefix > fuzzy (weighted).
- **Phrase length penalty**: prefer shorter phrases beyond threshold.
- **source_priority**, **frequency_count** (log-scaled), **recency** (exp decay from last_seen_at).
- **CTR** from daily_stats (smoothed); **quality_score** from DB.
- **Context boost**: category/channel match.
- **Exploration boost**: low-impression suggestions get a small boost.
- **Quality penalty**: reserved for future abuse/low-quality handling.

---

## Tracking API (POST /api/ro/search/suggest/track)

- **Payload**: `event_type` (impression | click | submit), `query_norm`, for impression `suggestions: [{ phrase_norm, kind }]`, for click/submit `phrase_norm` + `kind` (or single suggestion). Optional: `session_id`, `channel`.
- **Validation**: Strict (Zod); impression requires non-empty `suggestions`.
- **Rate limit**: By hashed `session_id` (e.g. 100/min).
- **IP**: Hashed server-side (e.g. SHA256(salt + ip)); store `ip_hash`.
- **Resolve**: (phrase_norm, kind) → suggestion_id; insert into `search_suggestion_events` (admin client).

---

## Aggregation job (GET /api/jobs/aggregate-suggestion-stats)

- **Auth**: CRON_SECRET.
- **Logic**: Last 2 days of events → group by (suggestion_id, day, channel) → upsert `search_suggestion_daily_stats` via RPC. Then: for suggestions with stats, sum last 30 days impressions/clicks; compute smoothed CTR → quality_score; compute rank_score (quality + frequency + recency + source_priority); UPDATE search_suggestions.
- **Idempotent**: Re-running overwrites same day; score recompute is deterministic.
- **Bounded**: 2 days events, batch updates (500 suggestions per batch), maxDuration 60s.

---

## Suggest endpoint (GET /api/ro/search/suggest)

- Fetch 50 candidates via `search_suggestions_candidates_rpc` (is_active=true).
- Build `RankingContext` from q, category, subcategory, county, city.
- Rerank in Node with `rerankSuggestions(candidates, context, undefined, displayLimit)` (no live stats map; uses DB quality_score/rank_score).
- Return top 8–10 (displayLimit); response shape unchanged: `{ ok, q, qNorm, items: [{ phrase, kind, popularity, meta }] }`.
- **Short query**: q.trim().length < 2 → fallback list (no RPC).
- **No candidates / error**: fallback list; still 200.

---

## Quality controls

- **Inactive**: RPC and candidates RPC filter `is_active = true`; suppressed suggestions never returned.
- **No behavioral data**: quality_score/rank_score default 0; ranking still uses lexical, source_priority, frequency_count, recency.
- **Exploration**: Low-impression suggestions get exploration_boost in `buildSuggestionFeatures` (when stats passed; aggregation job writes quality/rank so next request benefits).
- **Very short queries**: Fallback list when q length < 2; no DB hit.

---

## Performance

- **Suggest**: One RPC (candidates, limit 50) + small Node rerank (no extra DB for stats in first version). Target p99 &lt; 200ms.
- **Track**: Single or batch insert; rate limit prevents abuse.
- **Aggregate**: Bounded by 2 days of events and batch size; run every 6h to spread load.

---

## Scalability

- **Reads**: Suggest is read-heavy; cache headers (s-maxage=15, stale-while-revalidate=60) reduce origin load.
- **Writes**: Events are append-only; daily_stats upsert and suggestion updates are batched.
- **Future**: Optional per-request stats fetch (e.g. last 7d impressions/clicks) for exploration_boost; can be cached or limited to high-value queries.

---

## Security

- **Track**: No auth required; rate-limit by session_id; IP hashed (salt from env); validate payload size and array caps (e.g. max 30 impressions per request).
- **Aggregate**: CRON_SECRET only; no user input.
- **Suggest**: Public; rate limit existing (checkSuggestRateLimit); no PII in response.

---

## Edge cases

- **Missing suggestion_id**: Events can store suggestion_id null if (phrase_norm, kind) not found; aggregation skips nulls.
- **Duplicate phrase_norm+kind**: Resolve returns one id; events attributed to that row.
- **Empty candidates**: Rerank returns []; suggest route returns fallback list.
- **RPC failure**: Suggest route catches error and returns fallback list (200).
- **Aggregation partial failure**: One day fail doesn’t block others; log and continue.

---

## Rollout plan

- **Quick win**: Deploy migration + suggest route (candidates RPC + rerank). No track or aggregate yet; ranking uses existing meta (seed_count, etc.) and new columns (defaults). Backward compatible.
- **Premium**: Enable track API; frontend sends impression on show and click/submit on action. Deploy aggregate job (cron 6h). quality_score/rank_score populate over time; rerank uses them.
- **Enterprise**: Add optional live stats fetch for exploration; tune weights (constants); add quality_penalty from moderation; consider per-channel/category rollouts.

---

## Vercel cron

- `GET /api/jobs/aggregate-suggestion-stats`: `0 */6 * * *` (every 6 hours).
