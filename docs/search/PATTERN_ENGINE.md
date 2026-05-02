# Universal Marketplace Pattern Engine

Production-ready pattern engine for gobid.ro autocomplete and search suggestions. Works across **all** categories (auto, real estate, executari, electronics, agri, home & garden, etc.), not just a few verticals.

## Goals

- **Google-level structured autocomplete**: category, subcategory, brand, model, attributes, geo.
- **Strong quality filtering**: remove garbage like "bmw km", "audi an", "audi bose pian", "bmw vanzare brasov".
- **Vertical-aware**: each vertical has valid/preferred patterns, weak tokens, invalid combinations.
- **Extensible**: taxonomy and profiles can be extended without code changes (DB tables).

## Architecture

### A. Core pattern engine (`lib/search/patterns/`)

| File | Role |
|------|------|
| `types.ts` | `PatternType`, `PatternProfile`, `MarketplaceTaxonomy`, `PatternMatchResult` |
| `constants.ts` | `PATTERN_SUGGEST_TOP_K`, `MIN_PATTERN_CONFIDENCE`, etc. |
| `normalizePatternInput.ts` | Normalize phrase (lowercase, no diacritics, tokens) via `normalizeRo` |
| `buildMarketplaceTaxonomy.ts` | Build taxonomy from defaults or DB (categories, brands, models, attributes, geo) |
| `matchPatternProfile.ts` | Match phrase → pattern type + segments (category, brand, model, geo) |
| `scorePatternQuality.ts` | 0..1 quality score from match + profile (preferred types boosted) |

**Pattern types**: `category`, `subcategory`, `brand`, `brand_model`, `brand_model_variant`, `category_attribute`, `category_attribute_geo`, `brand_model_geo`, `geo_only`, `mixed`, `invalid`.

### B. Quality (`lib/search/patterns/quality/`)

| File | Role |
|------|------|
| `isWeakToken.ts` | `isWeakLastToken`, `isWeakStandaloneToken`, `isNumericToken` |
| `blacklists.ts` | Default weak last/standalone/invalid token sets |
| `whitelists.ts` | Default phrase whitelist (bypass filter) |
| `filterPatternCandidate.ts` | Keep/drop + pattern match + quality score; respects blacklist/whitelist |

### C. Extractors (`lib/search/patterns/extractors/`)

- `categoryPatternExtractor.ts` – category/subcategory phrases from taxonomy
- `brandPatternExtractor.ts` – brand and brand+model from taxonomy
- `modelPatternExtractor.ts` – brand+model from listing title using taxonomy
- `attributePatternExtractor.ts` – e.g. "apartament 2 camere", "teren 5 ha"
- `geoPatternExtractor.ts` – geo-only and category+geo
- `compositePatternExtractor.ts` – runs all and returns unified candidates

### D. Vertical profiles (`lib/search/patterns/profiles/`)

- `universalProfile.ts` – fallback for any category
- `autoProfile.ts`, `realEstateProfile.ts`, `executariProfile.ts`
- `electronicsProfile.ts`, `agriIndustrialProfile.ts`, `homeGardenProfile.ts`
- `getProfileForVertical.ts` – map category/vertical slug → profile (fallback: universal)

Each profile defines: `validPatternTypes`, `preferredPatternTypes`, `invalidTokens`, `weakLastTokens`, `highValueAttributes`, `minPatternScore`, `allowMixed`.

### E. Taxonomy and DB

**Migration** `supabase/migrations/20260421_pattern_engine_taxonomy.sql`:

- `search_taxonomy_terms` – categories, subcategories, attribute keys (optional seed)
- `search_brand_models` – brands and models per vertical
- `search_pattern_rules` – invalid_token, weak_last, preferred_pattern per vertical
- `search_pattern_whitelist` – phrases always accepted
- `search_suggestions_blacklist` – phrases never shown

Engine works with in-memory defaults if these tables are empty; they allow runtime/admin-driven tuning.

### F. Ranking integration

- **filterSuggestion.ts**: When `taxonomy` + `profile` are passed, uses `filterPatternCandidate` (pattern engine); otherwise keeps legacy rules. Suggest route passes taxonomy + profile from `buildMarketplaceTaxonomy()` and `getProfileForVertical(category)`.
- **SuggestionFeatures**: New `pattern_quality` (0..1). **scoreSuggestionUnified**: adds `pattern * weights.pattern` (default weight 0.7).
- **rerankSuggestionsUnified**: Builds taxonomy once, gets pattern profile from `context.category`, runs `matchPatternProfile` + `scorePatternQuality` per candidate and passes `pattern_quality` into `buildSuggestionFeatures`.

### G. Search integration

- **buildUnifiedSearchPlan**: When intent has no category, calls `inferVerticalFromQuery(intent.queryNorm)`; if a category is inferred (from pattern segments, e.g. subcategory "apartament" → imobiliare), sets `intent.categorySlug` and `intent.vertical`.
- **parseUnifiedSearchIntent**: Unchanged; inference happens in the plan builder.
- **buildRefinementOptions**: Unchanged; can later use taxonomy for ordering/labels.

### H. Admin

- **GET /api/admin/search/patterns?q=...&category=...**: Inspect phrase – keep/reason, pattern type, confidence, segments, profile.
- **POST /api/admin/search/patterns**: Body `{ action: "blacklist" | "whitelist", phrase_norm, reason? }` – upsert into `search_suggestions_blacklist` or `search_pattern_whitelist`.
- **Admin UI**: `app/admin/search/patterns/page.tsx` – input phrase, inspect, blacklist/whitelist buttons.

## Rollout

1. **Deploy code**: Pattern engine is used by suggest route when filtering and by rerank when scoring. No feature flag required; taxonomy/profile are in-memory by default.
2. **Run migration**: `20260421_pattern_engine_taxonomy.sql` to create tables (optional for day-one; engine works without them).
3. **Optional**: Load blacklist from `search_suggestions_blacklist` in suggest route (e.g. cached) and pass to `filterSuggestionCandidate`; same for whitelist.
4. **Monitor**: Use admin Pattern Engine page to inspect phrases and add blacklist/whitelist entries as needed.

## Performance

- **Deterministic**: No ML; all logic is rule-based and repeatable.
- **Bounded**: Taxonomy and profile are built once per request (or cached); pattern match is O(tokens) per candidate; candidate list is capped (e.g. 50 before filter, 10 after).
- **Serverless-safe**: No heavy DB in the hot path unless you opt-in to loading blacklist/whitelist; RPC remains the single main DB call for candidates.

## Security

- Admin API and UI protected by `requireAdmin`.
- Blacklist/whitelist tables are admin-only writes; suggest route only reads (when implemented).

## Edge cases

- **Multi-word brands**: e.g. "john deere" in taxonomy as one slug; `matchPatternProfile` checks consecutive token spans.
- **Subcategory without category**: e.g. "apartament" → matched as subcategory of "imobiliare"; `inferVerticalFromQuery` returns category "imobiliare".
- **Unknown category**: Profile falls back to `universalProfile` (allowMixed, broad valid types).
- **Empty phrase**: Returns invalid pattern, keep=false.

## Scalability

- Taxonomy can be filled from `search_taxonomy_terms` and `search_brand_models` by an offline job and cached (e.g. in-memory or edge cache) to avoid DB on every suggest.
- Blacklist/whitelist can be cached with short TTL and refreshed when admin adds/removes entries.

---

## Production upgrade (premium ranking layer)

### Runtime taxonomy and rules

- **`lib/search/patterns/cache/getCachedMarketplaceTaxonomy.ts`**: Loads categories, subcategories, brands, models, attribute keys from `search_taxonomy_terms` and `search_brand_models` with a **60s in-memory TTL**. Falls back to in-memory defaults if DB is empty or query fails.
- **`lib/search/patterns/cache/getCachedPatternRules.ts`**: Loads `search_suggestions_blacklist` and `search_pattern_whitelist` with 60s TTL; returns `{ blacklist: Set<string>, whitelist: Set<string> }`.
- **Suggest route**: Calls `getCachedMarketplaceTaxonomy(supabase)` and `getCachedPatternRules(supabase)` in parallel, then passes taxonomy + blacklist + whitelist into `filterSuggestionCandidate` and reuses taxonomy + profile in `rerankSuggestionsUnified`.

### Behavior-based suppression

- **`buildSuggestionFeatures`**: Computes `quality_penalty` from stats:
  - Impressions ≥ 20 and clicks === 0 → `quality_penalty = 0.25`
  - Impressions ≥ 20 and CTR < 0.02 → `quality_penalty = 0.5`
- **Suggest route**: Fetches aggregated impressions/clicks from `search_suggestion_daily_stats` (last 30 days) for candidate UUIDs via `fetchSuggestionStatsMap`, and passes the map to `rerankSuggestionsUnified`. Scoring multiplies by `quality_penalty`, so weak suggestions are heavily demoted.

### Seed pipeline hardening

- **`seedFromTitles.ts`**: After building `allRows` from extractors, filters with pattern engine: `matchPatternProfile(phrase_norm, { taxonomy, profile })` and `scorePatternQuality(match, profile)`. Drops rows where `match.invalid` or `score < profile.minPatternScore`. Profile is derived from `entity_type` (real_estate → imobiliare, auto → autovehicule). Only pattern-accepted rows are passed to cap logic and upsert.

### Suggest route production hardening

- Cached taxonomy + rules + blacklist/whitelist loaded in parallel; merged with defaults (empty DB → in-memory defaults).
- Candidate retrieval remains bounded (RPC limit 50); stats fetch limited to 100 UUIDs, 30 days.
- Response shape unchanged (`{ ok, q, qNorm, items, meta }`).
- **Debug logs**: Only in `process.env.NODE_ENV === "development"` (no production sampling).

### Admin quality tools

- **GET /api/admin/search/patterns/weak**: Returns weak suggestions (impressions ≥ 20, zero clicks or CTR < 2%), recent blacklist entries, and counts. Used by the patterns admin page.
- **Admin page** (`app/admin/search/patterns/page.tsx`): "Raport sugestii slabe" section with "Încarcă raport", table of weak suggestions (phrase, impressions, clicks, CTR, reason), recent blacklist list, and a "Motive respingere pattern" legend (phrase_too_short, blacklisted, invalid_token, weak_last_token, etc.).

### Rollout plan

1. Deploy code; suggest route uses cached taxonomy/rules and behavior stats when available.
2. Run migration `20260421_pattern_engine_taxonomy.sql` if not already applied.
3. Optionally backfill `search_taxonomy_terms` and `search_brand_models` from existing categories/brands; otherwise in-memory defaults apply.
4. Monitor admin "Raport sugestii slabe" to add blacklist entries for recurring weak phrases.
5. Seed pipeline now drops low pattern-score candidates; re-run seed if you want to clean existing suggestions (or rely on serving-time filter + ranking).

### Performance notes

- Taxonomy + rules cache: 60s TTL; cold start = one parallel DB read (terms + brands + blacklist + whitelist), then cache hit for 60s.
- Stats fetch: one query to `search_suggestion_daily_stats` filtered by suggestion_id in (…) and day ≥ 30 days ago; max 100 IDs.
- All logic remains deterministic and bounded; no N+1.

### Edge cases

- **Geo suggestions**: IDs are non-UUID (e.g. `geo-county-...`); they are excluded from stats fetch and get no behavior penalty (exploration only).
- **Empty stats**: Suggestions with no rows in daily_stats get default CTR and quality_penalty 1 (no penalty).
- **Seed pattern filter**: Very short or generic phrases may get low pattern score and be dropped at seed; inspect via admin "Verifică o frază" to confirm.

---

## Marketplace-wide intelligence layer (v2)

### A. Taxonomy expansion

- **`getCachedMarketplaceTaxonomy`**: Now loads `term_type IN ('category', 'subcategory', 'attribute_key', 'geo_county', 'geo_city')` from `search_taxonomy_terms`. Counties and cities from DB are merged into taxonomy as `opts.counties` and `opts.cities`; in-memory defaults used when empty.
- **Migration** `20260422_pattern_intelligence_lifecycle.sql`: Relaxes `search_taxonomy_terms.term_type` CHECK to allow `geo_county` and `geo_city`. Populate these from your geo tables to drive geo-aware suggestions.

### B. Subcategory-specific profiles

- **`lib/search/patterns/profiles/subcategoryProfiles.ts`**: Defines profiles for e.g. `apartament`, `teren_intravilan`, `teren_extravilan`, `casa`, `spatiu_comercial`, `telefon`, `laptop`, `tractor`, `buldoexcavator`, `autoturism`, `utilaj_agricol`. Each sets preferred patterns, weak endings, invalid tokens, high-value attributes.
- **`getProfileForSubcategory(categorySlug, subcategorySlug)`**: Resolves profile with fallback chain: **subcategory profile → vertical profile → universal**. Used in suggest route and rerank so that e.g. "apartament" gets real-estate subcategory rules.
- **Suggest route**: Builds `patternProfile` with `getProfileForSubcategory(category, subcategory)` so context (category + subcategory from query params) drives which profile is used for filtering and scoring.

### C. Query-to-suggestion affinity

- **`search_query_suggestion_stats`**: Table stores per `(query_norm, suggestion_id, day)` impressions and clicks (and optional `submits`). Used to learn which suggestion performs best for a given query prefix.
- **`fetchQuerySuggestionStats(supabase, queryNorm, suggestionIds)`**: Fetches aggregated impressions/clicks for the **current query prefix** over the last 30 days. Returns `Map<suggestion_id, { impressions, clicks }>`.
- **Suggest route**: Calls `fetchQuerySuggestionStats` in parallel with `fetchSuggestionStatsMap`; passes the result as `queryAffinityMap` to `rerankSuggestionsUnified`.
- **`buildSuggestionFeatures`**: New optional `queryStats`; when present, computes `query_affinity` (0..1 from CTR for this query). **`scoreSuggestionUnified`**: New weight `queryAffinity` (default 0.6); suggestions that perform well for this specific prefix rank higher.

### D. Stronger suppression lifecycle

- **Migration** `20260422_pattern_intelligence_lifecycle.sql`:
  - Adds `search_suggestions.auto_suppressed_at` and `suppression_reason` (no hard delete).
  - RPC **`search_suggestions_apply_auto_suppression`**: Selects suggestions with high impressions and zero clicks (or CTR below threshold), sets `is_active = false`, `auto_suppressed_at = now()`, `suppression_reason` ('zero_clicks_high_impressions' | 'low_ctr_high_impressions'). Safe thresholds and `p_max_to_update` cap.
- **Admin**: **GET /api/admin/search/patterns/suppressed** lists auto-suppressed suggestions; **POST /api/admin/search/patterns/suppressed** runs the RPC (apply suppression). UI: "Auto-suppression (lifecycle)" section with "Listează sugestii suppressate" and optional "Run suppression" (POST).

### E. Search v2 enrichment

- **`buildUnifiedSearchPlan`**: When intent has no subcategory, runs `matchPatternProfile(intent.queryNorm, ...)` and sets `intent.subcategorySlug` from `match.segments.subcategory` so partial queries (e.g. "apartament 2") get correct subcategory.
- **v2 route** (`app/api/ro/search/v2/route.ts`): When unified scoring is enabled, merges `unifiedPlan.intent` into detected intent: `categorySlug`, and `forcedFilters.categorie` / `forcedFilters.subcategorie` from pattern-inferred category and subcategory. Improves category/subcategory inference and geo+category combinations without changing response shape; candidate retrieval remains bounded.

### F. Admin tools (intelligence layer)

- **Inspect**: Response now includes `resolved_subcategory` (from pattern segments). UI shows "Subcategorie (pattern)" when present.
- **Raport sugestii slabe**: Optional query param `?q=...` for **per-query weak**: uses `search_query_suggestion_stats` filtered by `query_norm` so you see weak suggestions for that prefix only.
- **Auto-suppression**: "Listează sugestii suppressate" (GET suppressed), table with phrase, reason, date; optional POST to run suppression job.
- **Query affinity**: Input "ex: apartament" and "Încarcă affinity" (GET `/api/admin/search/patterns/affinity?q=...`) to see top suggestions by CTR for that query (from `search_query_suggestion_stats`).

### Rollout order

1. Run migration `20260422_pattern_intelligence_lifecycle.sql`.
2. Deploy code (suggest + v2 + admin). Suggest route will use subcategory profile and query affinity when data exists; v2 will use pattern-inferred category/subcategory when unified plan is used.
3. Backfill or aggregate into `search_query_suggestion_stats` from your suggest tracking (impressions/clicks per query + suggestion) so affinity has data.
4. Optionally run POST `/api/admin/search/patterns/suppressed` to apply auto-suppression; monitor via GET suppressed and weak report.
5. Populate `search_taxonomy_terms` with `geo_county` / `geo_city` for richer geo suggestions.

### Performance notes

- Query affinity: one extra query per suggest request to `search_query_suggestion_stats` (by `query_norm`, last 30 days, suggestion_id in list); bounded by candidate set size.
- Subcategory profile resolution is in-memory (map lookup).
- Suppression RPC is intended for cron or manual admin run, not per-request.

### Edge cases

- **No query affinity data**: Suggestions get neutral `query_affinity` 0.5; ranking unchanged.
- **Subcategory slug mismatch**: Normalize map (e.g. apartamente → apartament) in `subcategoryProfiles`; vertical fallback still applies.
- **v2 without unified**: When `isUnifiedScoringEnabled()` is false, v2 does not merge pattern intent; behavior unchanged.
