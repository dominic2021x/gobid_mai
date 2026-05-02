# Unified Search Intelligence – Architecture

Unified ranking engine for gobid.ro that combines suggestions, geo, behavior, listing quality, and business rules into one premium search system.

## Overview

- **Core:** `lib/search/ranking/core/` – types, constants, feature flags.
- **Query:** `lib/search/query/parseUnifiedSearchIntent.ts`, `buildUnifiedSearchPlan.ts` – unified intent + geo + vertical-aware profile.
- **Features:** `lib/search/features/` – query, geo, behavior, listing quality, seller quality, business (shared by suggest + listing ranking).
- **Ranking:** `lib/search/ranking/suggestions/`, `lib/search/ranking/listings/`, `lib/search/ranking/refinements/` – deterministic scoring + rerank with configurable weights.
- **Data:** Precomputed stats tables (search_query_stats, search_query_listing_stats, search_query_suggestion_stats, listing_quality_signals, seller_quality_signals, search_refinement_stats, geo_query_stats) – filled offline; avoid heavy runtime joins.
- **Telemetry:** `app/api/ro/search/track` (impression, click, submit, save, contact_intent, bid_intent, scroll_depth, query_reformulation, pagination), `app/api/ro/search/suggest/track` (impression, click, submit). Rate limiting, optional session_id hashing, strict validation.
- **Integration:** `app/api/ro/search/v2/route.ts` and `app/api/ro/search/suggest/route.ts` preserve response shapes; when `SEARCH_INTELLIGENCE_PHASE >= 2` they use unified plan + unified rerank.
- **Admin:** `app/admin/search/intelligence/page.tsx` – inspect query intent, ranked suggestions, geo tiering, profile; pin/boost/suppress (placeholder for future controls).

## Rollout (feature flags)

Controlled by `SEARCH_INTELLIGENCE_PHASE` (1–4) and optional `USE_SEARCH_QUERY_STATS`, `IP_HASH_SALT`.

| Phase | Scope |
|-------|--------|
| 1 | Telemetry + shared feature builders in use |
| 2 | Unified suggestion + listing scoring (rerank in TS); default on |
| 3 | Refinements + listing/seller quality scores |
| 4 | Advanced behavioral tuning (exploration, personalization) |

- **Phase 1:** Telemetry events and validation in place; feature builders available for scoring.
- **Phase 2:** Suggest and v2 search use `buildUnifiedSearchPlan` and `rerankSuggestionsUnified` / `rerankListingsUnified` when flag is on. Response shapes unchanged.
- **Phase 3:** Use `search_query_*` and quality tables when `USE_SEARCH_QUERY_STATS=true`; refinement ordering from `search_refinement_stats`.
- **Phase 4:** Tune exploration/personalization weights and use behavioral signals more aggressively.

## File layout

```
lib/search/
  ranking/
    core/types.ts, constants.ts, featureFlags.ts
    suggestions/scoreSuggestion.ts, rerankSuggestions.ts
    listings/scoreListing.ts, rerankListings.ts
    refinements/buildRefinementOptions.ts
  query/
    parseUnifiedSearchIntent.ts, buildUnifiedSearchPlan.ts
  features/
    buildQueryFeatures.ts, buildGeoFeatures.ts, buildBehaviorFeatures.ts,
    buildListingQualityFeatures.ts, buildBusinessFeatures.ts, buildSellerQualityFeatures.ts
  quality/
    computeListingQuality.ts, computeSellerQuality.ts
  telemetry/
    validateSearchTelemetry.ts
app/api/
  ro/search/track/route.ts       (extended event types; session hash)
  ro/search/suggest/route.ts     (optional unified rerank)
  ro/search/v2/route.ts         (optional unified plan + listing rerank)
  admin/search/intelligence/route.ts
app/admin/search/intelligence/page.tsx
supabase/migrations/
  20260420_search_intelligence_tables.sql
```

## Performance

- **Serverless-safe:** Candidate caps (suggestions 50, listings 200), bounded rerank in process, no large joins at request time.
- **Precompute:** Stats and quality tables updated by offline jobs; read path only.
- **Caching:** v2 response cached (existing); suggest response cache headers unchanged.
- **Geo:** Geo expansion and listing_geo fetch only when `geoPlan.hasGeoIntent`; progressive widening by page.

## Security

- **Telemetry:** Rate limit by IP (search track) and by session hash (suggest track). Optional `IP_HASH_SALT` for hashing. No raw IP stored.
- **Admin:** Intelligence and pin/boost/suppress behind `requireAdmin` (same as other search admin routes).
- **Validation:** Strict schema for track payloads (query length, UUIDs, result list caps).

## Edge cases

- **Empty query / too short:** Suggest returns fallbacks; v2 returns empty results. Validation in telemetry rejects invalid qNorm.
- **Geo intent but no resolution:** Geo plan can have empty tiers; listing rerank still runs with geo weight 0 when no tiers.
- **Missing stats:** Behavior features use smooth defaults (e.g. CTR 0.1 when no impressions). Exploration boost for low-impression items.
- **Phase < 2:** Suggest and v2 use existing rerank (no unified plan); behavior unchanged.

## Scalability

- Add more verticals in `RankingProfile` and `getProfileForVertical`.
- Add aggregation jobs that fill `search_query_*` and quality tables from raw events.
- Pin/boost/suppress: use existing `search_intel_query_boosts` or new override tables; apply in feature builders or in rerank.

## Rollout order (recommended)

1. Deploy code + run migration `20260420_search_intelligence_tables.sql`.
2. Set `SEARCH_INTELLIGENCE_PHASE=2` (or leave default 2) to enable unified scoring.
3. Optionally set `USE_SEARCH_QUERY_STATS=true` when aggregation jobs for new tables are in place (phase 3).
4. Add cron/jobs to aggregate into `search_query_stats`, `search_query_listing_stats`, `search_query_suggestion_stats`, and to compute `listing_quality_signals` / `seller_quality_signals`.
5. Enable phase 3/4 and tune weights per vertical via config or DB.
