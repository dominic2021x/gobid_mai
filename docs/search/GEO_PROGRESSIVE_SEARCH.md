# Geo-aware progressive search (gobid.ro)

Production-ready geo taxonomy, query parsing, expansion plan, and listing ranking for location-first search across all verticals.

---

## Architecture overview

```
Query "teren intravilan Craiova"
         │
         ▼
┌─────────────────────┐
│ parseSearchIntent   │  → categorySlug, location (county/place), queryWithoutGeo
│ parseLocationFromQuery + GeoResolver (DB)
└──────────┬──────────┘
          │
          ▼
┌─────────────────────┐
│ buildSearchPlan     │  → intent, filters, geoPlan (tiers)
│ buildGeoExpansionPlan (exact_place → nearby → county_rest)
└──────────┬──────────┘
          │
          ▼
┌─────────────────────┐
│ buildProgressiveExpansionPlan │  → tier specs (limit per tier)
└──────────┬──────────┘
          │
          ▼
┌─────────────────────┐
│ Fetch candidates    │  (existing lexical + optional listing_geo join)
│ by tier or single query
└──────────┬──────────┘
          │
          ▼
┌─────────────────────┐
│ rerankListingResults│  → buildListingSearchFeatures, scoreListingResult
│ geoRankScore (county/place/distance/importance)
└──────────┬──────────┘
          │
          ▼
   Results (exact city first, then nearby, then county)
```

---

## A. Database (migration 20260416_geo_taxonomy_listing_geo.sql)

| Table | Purpose |
|-------|--------|
| **geo_counties** | id, code, name, name_norm (canonical counties) |
| **geo_places** | id, county_id, name, name_norm, type (municipality\|city\|town\|commune\|village), parent_place_id, lat, lng, population_rank, importance_score |
| **geo_place_aliases** | place_id, alias, alias_norm |
| **listing_geo** | listing_id (FK products), county_id, place_id, parent_place_id, lat, lng, geo_quality, source |
| **geo_neighbors** | place_id, neighbor_place_id, distance_km (optional, for “nearby”) |

Indexes on name_norm, county_id, place_id, (listing_id), (place_id, distance_km).

---

## B. Query parsing

| File | Purpose |
|------|---------|
| **lib/search/geo/types.ts** | GeoCounty, GeoPlace, ParsedLocation, GeoExpansionTier, GeoExpansionPlan |
| **lib/search/geo/constants.ts** | PLACE_TYPE_EXPANSION_ORDER, NEARBY_MAX_KM, DIACRITICS_MAP |
| **lib/search/geo/normalizeLocation.ts** | normalizeLocation, locationToSlug |
| **lib/search/geo/parseLocationFromQuery.ts** | parseLocationFromQuery (async + resolver), parseLocationFromQuerySync |
| **lib/search/query/parseSearchIntent.ts** | parseSearchIntent (category + location) |
| **lib/search/query/extractStructuredFilters.ts** | extractStructuredFilters(intent) → StructuredFilters |
| **lib/search/query/buildSearchPlan.ts** | buildSearchPlan(query, supabase) → SearchPlan (intent + geoPlan + filters) |

GeoResolver: (countyCodeNorm, placeNameNorm) → { countyId, placeId, placeType, ambiguous }. Implemented in buildSearchPlan via Supabase (geo_counties, geo_places, geo_place_aliases).

---

## C. Geo expansion plan

| File | Purpose |
|------|---------|
| **lib/search/geo/buildGeoExpansionPlan.ts** | buildGeoExpansionPlan(supabase, parsedLocation) → tiers: exact_place → nearby_places → county_major → county_towns → county_rest |
| **lib/search/listings/buildProgressiveExpansionPlan.ts** | buildProgressiveExpansionPlan(geoPlan, intent, pageSize) → ProgressiveTierSpec[] (tier, label, order, countyId, placeIds, limit) |

Behavior: if query targets a city → exact city first, then geo_neighbors, then county rest. If only county → county_major (cities) then towns then county_rest.

---

## D. Listing ranking

| File | Purpose |
|------|---------|
| **lib/search/listings/types.ts** | ListingGeoRow, ListingSearchFeatures, ListingCandidateWithGeo, RankedListingResult, GeoRankContext |
| **lib/search/geo/geoRankScore.ts** | geoRankScore(listingGeo, context, placeImportance, targetLat?, targetLng?) → countyExact, placeExact, sameParentArea, distanceScore, total |
| **lib/search/listings/buildListingSearchFeatures.ts** | buildListingSearchFeatures(candidate, context) → ListingSearchFeatures |
| **lib/search/listings/scoreListingResult.ts** | scoreListingResult(features) → finalScore (weights: textual, category, county/place, tier, freshness, premium) |
| **lib/search/listings/rerankListingResults.ts** | rerankListingResults(candidates, context, topK) → RankedListingResult[] |

Features: textualRelevance, categoryMatch, subcategoryMatch, countyExact, placeExact, sameParentArea, distanceScore, placeImportance, premiumBoost, freshness, engagement, listingQuality, tierOrder.

---

## E. Search endpoint integration

- **Current**: `/api/ro/search/v2` uses buildQueryFromParams, detectIntent, retrieveLexical, rerank, diversify.
- **Integration (additive)**:
  1. Optionally call buildSearchPlan(q, supabase). If geoPlan.hasGeoIntent and geo tables populated, fetch listing_geo for candidate ids and attach to candidates.
  2. Map candidates to ListingCandidateWithGeo (tierOrder from which tier the listing’s place_id/county_id falls into).
  3. Call rerankListingResults(candidates, { queryNorm, categorySlug, subcategorySlug, geo: { countyId, placeId, tiers } }, topK).
  4. Use ranked results for the response; keep response shape (results, facets, suggestions, meta).
- **Progressive pagination**: first request returns first tier only (e.g. exact_place); “Load more” or next page can add next tier (e.g. nearby_places). Implement by passing tier cursor or tier index in request.

---

## F. Suggest integration

- **Current**: suggest returns phrases from search_suggestions_candidates_rpc + rerank.
- **Geo suggestions**: Add county and place names from geo_counties / geo_places (or from existing judete.json bootstrap) into search_suggestions with kind county / city and meta { countyId, placeId }. Or serve geo suggestions from a dedicated endpoint that merges with current suggest (e.g. “teren intravilan” + counties from geo_counties).
- **Category + geo**: Suggestions like “teren intravilan dolj”, “teren intravilan craiova”, “executari dolj” can be generated by combining category/subcategory phrases with county/place names from taxonomy and inserting into search_suggestions or by composing at suggest time (prefix match on “teren intravilan” then append county names).

---

## G. Telemetry (optional)

- **Selected location**: When user selects a county/place from UI, send to track API (e.g. suggest/track or search/track) with event_type and location id/code.
- **Clicked result location tier**: Store in impression/results which tier each result belonged to; aggregate for CTR by tier.
- **Pagination expansion**: When user requests “more” and next tier is loaded, log expansion event (tier index, query).

---

## H. Admin / ops

- **app/admin/search/geo-lab/page.tsx**: Input query, button “Inspect”. Calls GET /api/admin/search/geo-lab?q=... Returns intent, filters, geoPlan (tiers), progressiveTiers. Display in collapsible JSON.
- **app/api/admin/search/geo-lab/route.ts**: requireAdmin, buildSearchPlan(q, supabase), buildProgressiveExpansionPlan, return JSON.

---

## Performance

- **buildSearchPlan**: 2–4 Supabase calls (county, places, aliases, buildGeoExpansionPlan). Keep to one round-trip where possible (e.g. single RPC that returns county + places + neighbors).
- **listing_geo**: Join or batch fetch by listing ids after lexical retrieval; avoid N+1.
- **rerankListingResults**: In-memory only; O(n) per candidate.

---

## Scalability

- **Geo tables**: Seed from judete.json + geocoding job for listing_geo. geo_neighbors precomputed (batch job).
- **Progressive**: First page from tier 1 only reduces DB load; later pages add tiers.

---

## Security

- **Geo-lab**: Admin-only (requireAdmin).
- **Geo resolver**: Read-only; no user input in raw SQL (parameterized).

---

## Edge cases

- **Ambiguous place**: Multiple places same name (e.g. “Valea”) → ambiguous flag; pick first or use county disambiguation when countyCodeNorm present.
- **No geo tables populated**: buildGeoExpansionPlan returns empty tiers; ranking falls back to non-geo (existing behavior).
- **listing_geo missing for product**: candidate.geo = null; geoRankScore returns 0 for geo part.

---

## Rollout

- **Quick win**: Deploy migration; seed geo_counties (and optionally geo_places) from judete.json; add Geo Lab; no change to v2 yet.
- **Premium**: Populate listing_geo (from products.county/city or geocode); integrate buildSearchPlan + rerankListingResults into v2 behind feature flag or when geoPlan.hasGeoIntent; add geo suggestions to suggest.
- **Enterprise**: Progressive pagination (tier cursor); telemetry; geo_neighbors populated; A/B test geo vs non-geo.

---

## Runtime integration (production)

### Scripts

| Script | Purpose |
|--------|--------|
| **scripts/geo/importOraseCsv.ts** | Bootstrap geo_counties, geo_places, geo_place_aliases from [orase.csv](https://github.com/romania/localitati/blob/master/orase.csv). Idempotent; normalizes with normalizeLocation; validates duplicates/missing coords. Run: `npx tsx scripts/geo/importOraseCsv.ts`. |
| **scripts/geo/backfillListingGeo.ts** | Backfill listing_geo from products (county, city, product_location). Matches county → geo_counties (code/name_norm), city → geo_places (exact then alias); sets geo_quality (exact \| inferred \| county_only). Run: `npx tsx scripts/geo/backfillListingGeo.ts`. |

### Search v2 (`/api/ro/search/v2`)

- **When geo is used**: `buildSearchPlan(qNorm, supabase)` runs in parallel with `detectIntent`. If `plan.geoPlan?.hasGeoIntent` and `plan.geoPlan.tiers.length > 0`, the geo path is used.
- **Flow**: Lexical candidates (cap 200) → dedupe → applyQueryBoosts. Then: fetch **listing_geo** only for the first **GEO_CANDIDATE_CAP** (150) candidate ids (bounded, no full-table join). Build **GeoRankContext** from plan (countyId, placeId, tiers). Map each candidate to **ListingCandidateWithGeo** (tierOrder via **getTierOrderForListing**). Call **rerankListingResults**(candidatesWithGeo, context, 150). Map ranked results back to SearchCandidate (score = finalScore), append tail (candidates beyond 150), then diversify and paginate as before.
- **Response shape**: Unchanged (results, facets, suggestions, meta).
- **Fallback**: If no geo plan or empty tiers, standard rerank(weights) is used.

### Suggest (`/api/ro/search/suggest`)

- **getGeoSuggestions**(supabase, qNorm, 8) is called after **search_suggestions_candidates_rpc**. Geo items are converted to **SuggestionCandidate** (id `geo-{kind}-{id}`, kind county \| city, meta countyId/placeId). Merged with RPC candidates; dedupe by **phrase_norm**. Rerank and slice as before. Supports e.g. "teren intravilan dolj", "teren intravilan craiova", "executari dolj" when the query prefix matches county/place name_norm.

### Feature tuning (configurable)

| File | What to tune |
|------|--------------|
| **lib/search/geo/constants.ts** | **GEO_RANK_WEIGHTS**: countyExact, placeExact, sameParentArea, distance, placeImportance. **GEO_MAX_KM_FOR_DISTANCE**. |
| **lib/search/listings/rankingConfig.ts** | **LISTING_RANK_WEIGHTS**: textualRelevance, categoryMatch, countyExact, placeExact, premiumBoost, freshness, tierOrder, etc. **TIER_ORDER_STEP**, **TIER_ORDER_MIN_MULT**. |

### Performance notes

- **No full-table joins**: listing_geo is queried with `.in("listing_id", cappedIds)` (max 150 ids).
- **Rerank in TypeScript**: rerankListingResults and scoreListingResult run in Node; no heavy SQL.
- **buildSearchPlan**: 2–4 Supabase reads (county, places, aliases, neighbors); runs once per request when geo path is taken. Non-geo queries still call it (to decide useGeo); consider skipping when `filters.county` and `filters.city` are both empty and query is single-token to reduce cost.
- **Debug**: x-debug header and search_explain_logs remain admin-only; no extra logging in production.

### Rollout steps

1. Run migration `20260416_geo_taxonomy_listing_geo.sql` if not already applied.
2. Run `npx tsx scripts/geo/importOraseCsv.ts` to seed geo_counties, geo_places, geo_place_aliases.
3. Run `npx tsx scripts/geo/backfillListingGeo.ts` to populate listing_geo from products.
4. Deploy API changes (v2 + suggest). No feature flag required; geo path is enabled when geoPlan.hasGeoIntent.
5. (Optional) Populate **geo_neighbors** for "nearby" tier (batch job from geo_places lat/lng).

### Edge cases

- **Ambiguous place**: buildSearchPlan resolver picks first match; ambiguous flag can be used by UI.
- **listing_geo missing for a listing**: candidate gets geo = null, tierOrder = 999; still included after geo-reranked block, so no results lost.
- **Empty geo tables**: buildGeoExpansionPlan returns empty tiers; hasGeoIntent may still be true if query had location tokens; geo path is skipped when tiers.length === 0, so standard rerank is used.
- **Suggest duplicate**: Geo suggestion with same phrase_norm as an RPC suggestion is skipped (phraseNormSeen).
