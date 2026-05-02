# Implementation Verification + Corrections Pack — gobid.ro Growth Platform

**Stack:** Next.js 16 App Router, React 19, TS strict, Tailwind v4, Supabase Postgres, Vercel serverless.

---

## 1) System Map

### DB tables (growth + related)

| Table | Purpose |
|-------|--------|
| growth_integrations | OAuth tokens (provider + product unique); token_encrypted, scopes, meta |
| growth_settings | key/value (jsonb); selections + feature flags + caps |
| growth_jobs | type, payload, status (queued\|locked\|done\|failed), run_after, attempts |
| growth_job_runs | job_id, correlation_id, started_at, finished_at, ok, error, meta |
| growth_audit_results | kind, hash, result (e.g. seo_audit) |
| growth_events | type, meta (audit trail) |
| growth_google_snapshots | product, kind, scope_ref, result, created_at |
| growth_ai_plans | plan jsonb, status (queued\|applied\|failed) |
| growth_ai_plan_runs | plan_id, correlation_id, ok, meta |
| growth_demand_snapshots | kind, scope_ref, result |
| growth_demand_opportunities | q_norm, demand_score, recommended_action, status (new\|accepted\|done\|ignored) |
| growth_demand_actions | type (create_lp\|improve_lp\|seed_links\|suggest_listing), status (pending\|executed\|skipped), q_norm, payload; unique (type, q_norm) WHERE status=pending |
| growth_demand_feedback | action_id, type, payload, ctr_before, ctr_after, evaluated_at |
| growth_demand_supply_snapshot | q_norm, category_slug, county_slug, supply, snapshot_date |
| growth_trend_snapshots | kind, result |
| growth_trend_items | key, q_norm, spike_score, recommended_actions, status (new\|accepted\|applied\|ignored) |
| search_queries | q, q_norm, results_count, source, user_id, session_id |
| search_intel_query_stats | (q_norm, day), impressions, clicks, ctr, long_clicks, pogo_clicks |
| search_intel_bucket_weights | bucket, w_lex, w_sem, w_graph, w_fresh |
| search_intel_query_boosts | q_norm, boost (jsonb) |
| search_intel_arms | arm, bucket, weights, impressions, clicks; IPS columns |
| search_intel_position_propensity | pos, p_view |
| search_impressions | impression_id, q_norm, intent_bucket, arm, results, user_id |
| search_events | type, impression_id, q_norm, payload |
| search_query_cache | key, result, expires_at |
| search_query_embeddings | q_norm, embedding (vector 1536) |
| search_health_samples | cache_hit, latency_ms, candidate_count |
| search_explain_logs | q_norm, intent, timing, top_signals |
| search_intent_rules | pattern, intent, forced_filters |
| user_search_profiles | user_id, prefs (jsonb) |
| search_personal_opt_in | user_id, enabled |
| seo_overrides | url (pk), title, meta |
| seo_landing_pages | slug (pk), status (draft\|review\|published\|archived), index_stage, noindex, filters_json, intro_md, faq_json |
| seo_internal_links | source_url, target_url, anchor, status (draft\|applied\|removed) |
| seo_ctr_experiments | page_url, variant_a/b, state, winner |
| seo_hub_pages | slug (pk), status, links_json |
| growth_content_items | type, status, title, slug, brief, draft_md |
| graph_nodes | kind, slug, label, aliases, popularity |
| graph_edges | src_node_id, dst_node_id, rel, weight |
| graph_embeddings | node_id, embedding (vector 1536) |
| graph_link_recommendations | source_path, target_path, anchor, status (draft\|applied\|removed) |
| graph_queries | q_norm, best_node_id, intent, county_slug, category_slug |

### Admin UI pages (app/admin/growth)

- **/** — Overview (Integrations, Tracking, SEO, Jobs, Settings)
- **/integrations** — Google connection status + connect
- **/tracking** — GTM/GA4 snippet
- **/seo/sitemaps** — ping sitemap
- **/seo/rules** — rules simulator (evaluate URL)
- **/seo/indexing** — enqueue indexing
- **/seo/audits** — enqueue audit
- **/insights** — aggregated issues
- **/jobs** — queue monitor
- **/settings** — dry-run, rate limits
- **/google-ads** — Ads reports, conversions
- **/google-ads/control** — Live Control Panel (campaigns, KPIs, optimizer signals, AI insights)
- **/google-ads/optimizer** — Plan generate/apply, guardrails, risk flags
- **/google-ads/optimizer/ops** — kill-switch, pilot IDs, run-daily, digest
- **/search-console** — GSC performance
- **/ga4** — GA4 reports
- **/marketing-brain** — AI Marketing Brain (findings, priorities, root causes)
- **/os** — Growth OS overview + run-daily
- **/os/seo** — SEO opportunities
- **/os/seo/apply** — apply title/meta overrides
- **/os/keywords** — keyword clusters
- **/os/content** — content briefs
- **/os/content/items** — editorial content items CRUD
- **/os/landing-pages** — list LPs
- **/os/landing-pages/[slug]** — edit LP, publish safety gate, preview
- **/os/internal-links** — generate/apply internal links
- **/os/pseo** — PSEO status, generate/score/seed/demotion/enrich
- **/os/flywheel** — SEO Flywheel (rank, CTR experiments, hubs, prune)
- **/os/demand** — Demand Mining opportunities
- **/os/trends** — Trend Engine
- **/os/graph** — Semantic Graph (refresh, embeddings, link recs, seed)
- **/os/search-intel** — Search Intelligence (rollups, learn weights, boosts, IPS, personal)
- **/os/search-personal** — Personal Search Agent status
- **/os/demand-flywheel** — Demand Flywheel (refresh, execute, feedback eval)

### Admin API routes (all requireAdmin or requireCronSecret where noted)

- **GET/POST /api/admin/growth/worker** — GET: cron (x-cron-secret or Bearer CRON_SECRET) OR admin; POST: not used
- **POST /api/admin/growth/jobs/enqueue** — body { type, payload }
- **GET /api/admin/growth/jobs/queue** — list jobs
- **GET /api/admin/growth/jobs/runs** — list runs
- **GET /api/admin/growth/integrations/status**
- **GET /api/admin/growth/settings**, **PATCH** — read/update settings
- **GET /api/admin/growth/audits/latest**
- **GET /api/admin/growth/google/snapshots** — ?product=&kind=
- **GET /api/admin/growth/google/select** — set selection
- **GET /api/admin/growth/google/oauth/start** — redirect to Google
- **GET /api/admin/growth/google/oauth/callback** — exchange code, encrypt tokens
- **GET /api/admin/growth/google/search-console/sites**
- **GET /api/admin/growth/google/ads/customers**
- **GET /api/admin/growth/google/ga4/properties**
- **POST** reports/enqueue, performance/enqueue, ga4/reports/enqueue, conversions/upload, conversions/actions (GET list)
- **GET** dashboard, **POST** dashboard/enqueue
- **GET** insights/latest, **POST** insights/enqueue
- **GET/POST** optimizer/run-daily — GET cron, POST admin
- **POST** optimizer/kill-switch, optimizer/plan/enqueue, optimizer/apply/enqueue
- **GET** optimizer/plan/latest, optimizer/plans, optimizer/guardrails, optimizer/digest/latest
- **POST** campaign/pause, enable, budget, bidding
- **GET** campaigns, anomaly/status, **POST** anomaly/enqueue
- **GET** traffic-quality/alerts, **POST** traffic-quality/enqueue
- **GET /api/admin/growth/os/latest**, **POST** run-daily — GET cron, POST admin
- **POST** seo/enqueue, seo/apply/enqueue, keywords/enqueue, content/enqueue
- **GET/POST** marketing-brain/latest, enqueue
- **GET** landing-pages, **GET/PATCH** landing-pages/[slug], **POST** landing-pages/create
- **GET/POST** internal-links, **GET/PATCH/DELETE** internal-links/[id], **POST** internal-links/generate, apply
- **GET** pseo/status, **POST** pseo/generate, score, seed-links, demotion, enrich; **GET/POST** pseo/run-daily — GET cron, POST admin
- **GET** flywheel/status, **POST** flywheel/run-daily, run-weekly (no GET/cron for flywheel)
- **GET** demand/status, **POST** demand/enqueue, create-candidates, **PATCH** demand/[id]
- **GET** trends/status, **POST** trends/enqueue, apply, **PATCH** trends/[id]
- **GET** graph/status, **POST** graph/enqueue
- **GET** search-intel/status, **POST** search-intel/enqueue
- **GET** search-personal/status
- **GET** demand-flywheel/status, **POST** demand-flywheel/enqueue
- **GET /api/admin/growth/seo/rules/evaluate** — ?url=
- **POST** seo/sitemaps/ping, seo/indexing/enqueue, seo/audits/enqueue
- **GET /api/admin/search/v2/explain** — admin debug logs

### Public API routes (no admin)

- **GET /api/ro/search/v2** — ?q=, page, filters; cache 60s; returns results, facets, suggestions, meta (impressionId, bucket, arm)
- **GET /api/ro/search/suggest/v2** — suggestions; cache 300s
- **POST /api/ro/search/track** — body type=impression, impressionId, qNorm, bucket, arm, results[], sessionId; rate limit 120/min by IP; inserts search_impressions
- **POST /api/ro/search/click** — body type=click|satisfaction, impressionId, listingId, pos, dwellMs?, pogo?, sessionId; rate limit 180/min by IP; inserts search_events
- **GET /api/ro/search/profile** — GET/POST; requires auth; opt-in + prefs summary
- **GET /api/ro/internal-links** — ?source_url=; validated path; cap 10; cache 300s
- **GET /api/ro/graph/suggest** — ?q=; cap 10; cache 300s
- **GET /api/ro/graph/links** — ?source=; validated path; cap 10; cache 300s

### Job types (worker)

SEO: seo_sitemap_ping, seo_rules_evaluate_batch, seo_audit_run, seo_index_request, seo_growth_refresh, seo_apply_overrides, seo_internal_links_generate, seo_internal_links_apply, seo_flywheel_rank_opportunities, seo_flywheel_ctr_experiments, seo_flywheel_hubs_generate, seo_flywheel_weekly_prune.

Google: google_ads_report, google_ads_conversion_actions_refresh, google_ads_conversion_action_create, google_ads_conversions_upload, gsc_performance_pull, ga4_report_pull, google_search_console_performance_refresh, ga4_funnel_refresh; google_ads_optimizer_plan, google_ads_apply_plan, google_ads_optimizer_auto_apply, google_ads_anomaly_check, traffic_quality_monitor, google_ads_optimizer_daily_digest; google_ads_*_refresh (search_terms, keyword_quality, hourly/device/geo/network/matchtype/auction_pressure, search_terms_structure); google_ads_campaign_pause/enable/budget/bidding, google_ads_dashboard_refresh, google_ads_ai_insights_refresh.

Growth OS: marketing_brain_analysis, keyword_discovery_refresh, content_suggestions_refresh, growth_os_daily_pack.

PSEO: pseo_generate_candidates, pseo_score_and_promote, pseo_seed_internal_links, pseo_demotion, pseo_enrich_content, pseo_geo_generate_candidates.

Demand/Trends: demand_mining_refresh, demand_mining_create_candidates, market_trends_refresh, market_trends_apply, demand_flywheel_refresh, demand_flywheel_execute, demand_flywheel_feedback_eval.

Graph: semantic_graph_refresh, semantic_graph_embeddings_refresh, semantic_graph_link_recs_refresh, semantic_graph_pages_seed.

Search intel: search_intel_rollup_hourly, search_intel_rollup_hourly_ips, search_intel_learn_weights_daily, search_intel_update_query_boosts_daily, search_personal_rollup_daily.

### Snapshot (product, kind) conventions

- google_ads: campaign_performance, conversion_actions, search_terms, ads_dashboard_pack, daily_digest, ads_ai_insights; keyword_quality, hourly_performance, device_performance, geo_performance, network_performance, matchtype_performance, auction_pressure, search_terms_structure.
- search_console: performance_overview.
- ga4: funnel_overview, report_*.
- marketing_brain: analysis.
- seo: opportunities, internal_link_plan (scope_ref).
- keywords: clusters.
- content: briefs.
- growth_os: daily_pack.
- flywheel: ranked_opportunities, ctr_experiments_status.
- graph: summary.
- search: health.

---

## 2) Invariant Contract

- **Auth**
  - All `/api/admin/*` and `/admin/*` growth routes: admin only via `requireAdmin(request)` (Bearer token from Supabase session; isAdmin from user_profiles or metadata). Preview gate on LP page: `isAdminFromRequest()` (cookies).
  - Worker GET: either `x-cron-secret` / `Authorization: Bearer CRON_SECRET` OR `requireAdmin(req)`.
  - Run-daily/cron endpoints: GET = `requireCronSecret(req)`; POST = `requireAdmin(req)`.

- **Rate limits**
  - Public tracking: `/api/ro/search/track` 120 req/min per IP; `/api/ro/search/click` 180 req/min per IP (in-memory map; serverless resets per instance).

- **Caps**
  - Search v2: candidates 200 (LEXICAL_CAP), page 30, suggestions 12; cache key from q_norm + filters + page.
  - Internal-links public: 10 items; source_url length 200.
  - Graph suggest/links: 10 items; source length 200.
  - Demand flywheel: 100 actions/refresh; execute caps per type (create_lp 30, seed_links 40, improve_lp 20, suggest_listing 10).
  - PSEO: generation caps per run; index budget via pseo_max_indexable_pages.

- **Idempotency**
  - Ads optimizer run-daily: dailyKey = `${YYYY-MM-DD}:${customerId}`; if already ran today return 200 { ok, skipped: "already_ran" }.
  - Demand actions: unique index (type, q_norm) WHERE status = 'pending'.

- **Logging**
  - growth_events for apply/mutate/plan/digest/failures (type + meta; no tokens).
  - growth_job_runs: correlation_id, ok, error, meta (no tokens).
  - Worker console: correlationId, jobId, type only.

- **Caching**
  - Public read APIs: Cache-Control set (e.g. s-maxage=60 or 300, stale-while-revalidate).
  - Search v2: DB cache (search_query_cache) + response Cache-Control 60/120.

- **Failure modes**
  - Worker: markJobFailed with backoff; max attempts 5; no token in error.
  - API: JSON { error, code } with stable codes (UNAUTHORIZED, FORBIDDEN, BAD_REQUEST, RATE_LIMIT, etc.).

- **Tokens**
  - Stored encrypted (AES-256-GCM) in growth_integrations; never logged; refreshed via lib/google/tokens.

---

## 3) Consistency Audit

| Check | Status | Notes |
|-------|--------|--------|
| requireAdmin import | OK | Most admin routes use `@/lib/auth/requireAdmin` (throws); worker uses `@/lib/adminAuth` (returns auth.response). |
| growth_settings value type | OK | jsonb; getGrowthSetting returns string for simple values; getGrowthSettingRaw for jsonb. |
| growth_integrations | OK | Unique (provider, product). |
| Job type strings | OK | Single source in worker JOB_TYPES array; enqueue endpoints pass same type string. |
| Status enums | OK | growth_jobs.status queued|locked|done|failed; growth_demand_opportunities new|accepted|done|ignored; growth_trend_items new|accepted|applied|ignored; growth_demand_actions pending|executed|skipped; seo_landing_pages draft|review|published|archived; seo_internal_links draft|applied|removed. |
| Snapshot product/kind | OK | See System Map; no duplicate (product, kind) semantics. |
| Settings keys | OK | GROWTH_SETTING_KEYS in lib/growth/settings.ts; used in handlers. |
| Flywheel run-daily | OK | GET with requireCronSecret added; POST with requireAdmin; shared runDaily(). |
| Error response shape | OK | growthJsonError(error, code, status); public track/click return { error, code }. |

---

## 4) Correctness Checklist

**SQL checks (run in Supabase SQL editor)**

1. `SELECT COUNT(*) FROM growth_jobs WHERE status = 'queued';` — queued count.
2. `SELECT type, COUNT(*) FROM growth_jobs WHERE status IN ('queued','locked') GROUP BY type;` — backlog by type.
3. `SELECT key FROM growth_settings WHERE key LIKE 'ads_optimizer%';` — kill-switch and pilot keys exist.
4. `SELECT indexname FROM pg_indexes WHERE tablename = 'growth_demand_actions' AND indexname LIKE '%unique%';` — unique pending index present.
5. `SELECT column_name FROM information_schema.columns WHERE table_name = 'growth_demand_feedback' AND column_name IN ('ctr_before','ctr_after','evaluated_at');` — feedback eval columns present.

**curl (admin token = $TOKEN)**

6. `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/growth/worker"` — 200 and body ok when no job or job run.
7. `curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/growth/os/demand-flywheel/status"` — returns actionsLast24h, actionsByType, successRate.
8. `curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/admin/growth/google/ads/optimizer/run-daily" -X POST` — 200 with ok/skipped.
9. `curl -s "$BASE/api/ro/internal-links?source_url=/ro"` — 200, JSON items array, Cache-Control present.
10. `curl -s "$BASE/api/ro/search/v2?q=test"` — 200, results array, meta.impressionId present.

**Public tracking (no auth)**

11. `curl -s -X POST "$BASE/api/ro/search/track" -H "Content-Type: application/json" -d '{"type":"impression","impressionId":"'"$(uuidgen)"'","qNorm":"test","bucket":"default","arm":"mix_a","results":[{"id":"1","pos":0}]}'` — 200 { ok: true }.
12. Repeat 130 times from same IP — 429 RATE_LIMIT after 120.

**Admin UI**

13. Open /admin/growth → no redirect; overview loads.
14. Open /admin/growth/os/demand-flywheel → summary shows pending count, actions last 24h, success rate.
15. Open /ro/lp/[slug]?preview=1 as admin → draft LP visible; as anon → 404 if draft.

---

## 5) Minimal Patch Set

**Patch 1 (applied): SEO Flywheel run-daily GET for cron**

- **File:** `app/api/admin/growth/os/flywheel/run-daily/route.ts`
- **Change applied:** GET handler with `requireCronSecret`; shared `runDaily()` used by GET and POST so cron can trigger flywheel daily.

**No other code patches required.** Dedupe (unique index), caps, rate limits, cache headers, and error codes are in place.

---

## 6) Operational Runbooks

**Daily crons (Vercel Cron or external)**

1. **Growth OS run-daily**  
   `GET /api/admin/growth/os/run-daily`  
   Header: `Authorization: Bearer $CRON_SECRET` or `x-cron-secret: $CRON_SECRET`  
   Enqueues: GSC performance, GA4 funnel, seo_growth_refresh, keyword_discovery_refresh, content_suggestions_refresh, marketing_brain_analysis, growth_os_daily_pack (+30m).

2. **Ads optimizer run-daily**  
   `GET /api/admin/growth/google/ads/optimizer/run-daily`  
   Same auth. Idempotent per day per customer. Enqueues refresh jobs, optimizer_plan, optional auto_apply, traffic_quality_monitor, anomaly_check, daily_digest.

3. **PSEO run-daily**  
   `GET /api/admin/growth/os/pseo/run-daily`  
   Same auth. Enqueues GSC, GA4, seo_growth, keyword_discovery, pseo_generate_candidates, then pseo_enrich_content (+10m), pseo_seed_internal_links (+15m), seo_internal_links_apply (+20m), pseo_score_and_promote (+30m), pseo_demotion (+35m), growth_os_daily_pack (+45m), marketing_brain_analysis (+50m).

4. **Flywheel run-daily**  
   `GET /api/admin/growth/os/flywheel/run-daily` with cron secret (or POST with admin for manual run).

5. **Worker**  
   Poll `GET /api/admin/growth/worker` with cron secret (or admin Bearer) every 1–2 min; processes one job per call.

**Weekly**

- **Flywheel prune**  
  From admin: POST /api/admin/growth/os/flywheel/run-weekly (or enqueue seo_flywheel_weekly_prune).

**Kill-switch (Ads Optimizer)**

- **Disable optimizer:** PATCH growth_settings: ads_optimizer_enabled = false (or use POST /api/admin/growth/google/ads/optimizer/kill-switch with body { enabled: false }).
- **Disable auto-apply:** ads_optimizer_auto_apply_enabled = false.
- **Exclude campaigns:** ads_optimizer_kill_campaign_ids = ["id1", "id2"].

**Pilot allowlist**

- Set ads_optimizer_pilot_campaign_ids to a list of campaign IDs; apply handler only applies actions for those campaigns.

**Safe rollback**

- Revert deployment; worker will continue processing already-queued jobs (same job types).
- If a job type is removed from code, worker returns `Unknown job type` and marks job failed; no data corruption.

---

## 7) Security Review

**Threat model summary**

- **Public tracking (/api/ro/search/track, /click):** Abuse (flood, fake impressions/clicks). Mitigations: strict validation (UUID, qNorm length 2–120, results cap 30); rate limit per IP (120/180 per min); no auth so no privilege escalation; payload does not accept arbitrary PII.
- **Public cached read APIs (/api/ro/internal-links, /api/ro/graph/suggest, /api/ro/graph/links):** DoS, data scraping. Mitigations: validate source_url/source (prefix /ro, length, no ".." or "?"); cap 10; Cache-Control to reduce load; no sensitive data.
- **OAuth callback:** CSRF, token leakage. Mitigations: state in signed cookie; validate state on callback; exchange code server-side; encrypt tokens before DB; never log tokens.
- **Worker route:** Unauthorized job execution. Mitigations: GET requires either CRON_SECRET or admin Bearer; no public access.

**Mitigations in place**

- track/click: rate limit, validation, error codes (RATE_LIMIT, INVALID_*).
- internal-links: normalizePath, max length 200, cap 10, cache headers.
- graph/suggest, graph/links: same pattern; cap 10.
- OAuth: state validation; tokens encrypted (lib/google/tokens); no token in logs.
- Worker: hasCronSecret(req) || requireAdmin(req); adminAuth uses Bearer and Supabase auth.getUser.

---

## 8) Performance Review

- **TTFB:** Search v2 uses cache (DB + response headers); heavy path is lexical + semantic + graph + rerank + diversify; all in one serverless invocation (maxDuration 60). No change recommended.
- **DB hot spots:**  
  - growth_jobs: index (status, run_after, created_at) present.  
  - growth_google_snapshots: index (product, kind, created_at DESC) present.  
  - search_intel_*: indexes on q_norm, day, bucket, etc.  
  - search_impressions / search_events: append-heavy; consider partitioning by created_at if volume is very high (out of scope for this pack).
- **New indexes:** None required for current caps and usage. Unique partial index on (type, q_norm) WHERE status = 'pending' already added for growth_demand_actions.

---

**End of Implementation Verification + Corrections Pack.**
