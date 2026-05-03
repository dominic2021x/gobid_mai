-- Smoke test for the location filter pipeline (run after `supabase db push`).
-- Paste in Supabase SQL editor (Project → SQL → New query) and look for:
--   - Bitmap Heap Scan on products  +  ->  Bitmap Index Scan on products_geo_gist_idx
--     under 100 ms for the radius query
--   - Bitmap Index Scan on products_locality_search_trgm_hot_idx (or _city_trgm_/_county_trgm_)
--     under 80 ms for the text query
--
-- If you instead see a Seq Scan on products, either the index didn't get built
-- or `approval_normalized = 'approved'` filtered out everything in your dataset
-- (run: select count(*) from public.products where approval_normalized = 'approved' and status <> 'deleted';).
--
-- Also confirm the new functions exist:
--   select proname, pronargs from pg_proc where proname like 'search_ro_listings_enterprise%';
--   select proname, pronargs from pg_proc where proname like 'count_ro_listings_enterprise%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Indexed radius (50km București)
-- ─────────────────────────────────────────────────────────────────────────────
explain (analyze, buffers, format text)
select id, title, city, county, geo_lat, geo_lng
from public.products p
where p.status = any(array['active','reserved','sold','in_progress'])
  and p.status <> 'deleted'
  and p.approval_normalized = 'approved'
  and p.geo_lat is not null
  and p.geo_lng is not null
  and extensions.earth_box(extensions.ll_to_earth(44.4268, 26.1025), 50 * 1000.0)
      @> extensions.ll_to_earth(p.geo_lat, p.geo_lng)
  and extensions.earth_distance(
        extensions.ll_to_earth(44.4268, 26.1025),
        extensions.ll_to_earth(p.geo_lat, p.geo_lng)
      ) <= 50 * 1000.0
order by extensions.earth_distance(
           extensions.ll_to_earth(44.4268, 26.1025),
           extensions.ll_to_earth(p.geo_lat, p.geo_lng)
         ) asc
limit 25;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Text-only locality (Cluj)
-- ─────────────────────────────────────────────────────────────────────────────
explain (analyze, buffers, format text)
select id, title, city, county
from public.products p
where p.status <> 'deleted'
  and p.approval_normalized = 'approved'
  and unaccent(lower(coalesce(p.locality_search, ''))) like '%' || unaccent(lower('Cluj')) || '%'
order by p.created_at desc, p.id desc
limit 25;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) End-to-end through the new RPC (most realistic — should match (1) plan + use
--    the GiST index even when called from PostgREST/Supabase JS).
-- ─────────────────────────────────────────────────────────────────────────────
explain (analyze, buffers, format text)
select id, title, city, county
from public.search_ro_listings_enterprise(
  p_limit       => 25,
  p_near_lat    => 44.4268,
  p_near_lng    => 26.1025,
  p_radius_km   => 50
);

-- 3b) Same RPC, center only (no radius) — „Toată țara”: fără cutoff geo, sort după distanță + NULLS LAST.
--     Planul așteaptă sort pe earth_distance fără Bitmap Heap pe GiST (cutoff-ul lipsește).
explain (analyze, buffers, format text)
select id, title, city, county, geo_lat, geo_lng
from public.search_ro_listings_enterprise(
  p_limit       => 25,
  p_near_lat    => 44.4268,
  p_near_lng    => 26.1025,
  p_radius_km   => null
);

-- 4) Approval column / index sanity
select count(*) filter (where approval_normalized = 'approved') as approved,
       count(*) filter (where approval_normalized is null)      as null_norm,
       count(*) as total
from public.products;

-- 5) Acoperire geo după trigger + backfill ro_localities (țintă: >80% din rândurile cu city setat)
select
  count(*) filter (where city is not null and trim(city) <> '') as products_with_city,
  count(*) filter (where city is not null and trim(city) <> '' and geo_lat is not null) as with_geo,
  round(
    100.0 * count(*) filter (where city is not null and trim(city) <> '' and geo_lat is not null)
    / nullif(count(*) filter (where city is not null and trim(city) <> ''), 0),
    1
  ) as pct_geo_among_city_rows
from public.products
where status <> 'deleted';

select indexrelname, idx_scan, idx_tup_read
from pg_stat_user_indexes
where indexrelname in (
  'products_geo_gist_idx',
  'products_approval_normalized_visible_feed_keyset_idx',
  'products_locality_search_trgm_hot_idx',
  'products_city_trgm_hot_idx',
  'products_county_trgm_hot_idx'
);

-- 6) resolve_ro_locality_center (Chiajna + Ilfov) — trebuie să returneze un rând exact/fuzzy
select * from public.resolve_ro_locality_center('chiajna', 'ilfov');

-- 7) Acoperire geo pe județ (după migrația de backfill din ro_localities)
select
  coalesce(nullif(trim(county), ''), '(lipsă)') as county,
  count(*) as total,
  count(geo_lat) as with_geo,
  round(100.0 * count(geo_lat) / nullif(count(*), 0), 1) as pct_with_geo
from public.products
where status <> 'deleted'
  and city is not null
  and trim(city) <> ''
group by 1
order by total desc
limit 25;

-- 8) RPC cu centrul Chiajna, fără rază (parity cu /ro?location=Chiajna,Ilfov după enrich server)
explain (analyze, buffers, format text)
select id, title, city, county, geo_lat, geo_lng
from public.search_ro_listings_enterprise(
  p_limit       => 24,
  p_near_lat    => (select latitude from public.resolve_ro_locality_center('chiajna', 'ilfov') limit 1),
  p_near_lng    => (select longitude from public.resolve_ro_locality_center('chiajna', 'ilfov') limit 1),
  p_radius_km   => null
);
