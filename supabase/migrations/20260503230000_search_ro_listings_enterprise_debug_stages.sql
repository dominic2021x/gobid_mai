-- Debug stages + toggles for search_ro_listings_enterprise:
-- p_debug=true: repeated per row — cnt_all, cnt_geo, cnt_candidates_geo, cnt_page_geo, cnt_final + JSON sample of 10 geo_slice rows.
-- p_debug_skip_distance_sort: omit geo distance ordering (tasks 2).
-- p_debug_skip_bbox: sphere-only filter (tasks 3).
-- p_debug_force_radius_km: e.g. 1000 to widen radius (tasks 4).

DROP FUNCTION IF EXISTS public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
);

DROP FUNCTION IF EXISTS public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, boolean
);

DROP FUNCTION IF EXISTS public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, boolean,
  boolean, boolean, double precision
);

CREATE OR REPLACE FUNCTION public.search_ro_listings_enterprise(
  p_q text default null,
  p_channel text default 'ro',
  p_scope text default 'all',
  p_include_executari boolean default false,
  p_has_executari_access boolean default false,
  p_offset integer default 0,
  p_limit integer default 25,
  p_statuses text[] default array['active', 'reserved', 'sold', 'in_progress']::text[],
  p_categories text[] default array[]::text[],
  p_category_values text[] default array[]::text[],
  p_category_extra_subcategories text[] default array[]::text[],
  p_subcategories text[] default array[]::text[],
  p_level3s text[] default array[]::text[],
  p_list_categories text[] default array[]::text[],
  p_county text default null,
  p_city text default null,
  p_location text default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_sizes text[] default array[]::text[],
  p_brands text[] default array[]::text[],
  p_model text default null,
  p_colors text[] default array[]::text[],
  p_conditions text[] default array[]::text[],
  p_product_type text default null,
  p_sale_type text default null,
  p_images text default null,
  p_seller_user_ids text[] default null,
  p_seller_user_ids_exclude boolean default false,
  p_free_only boolean default false,
  p_fuel text default null,
  p_body_type text default null,
  p_part_type text default null,
  p_department text default null,
  p_apparel_type text default null,
  p_footwear_type text default null,
  p_accessory_type text default null,
  p_sort text default 'newest',
  p_near_lat double precision default null,
  p_near_lng double precision default null,
  p_radius_km double precision default null,
  p_debug boolean default false,
  p_debug_skip_distance_sort boolean default false,
  p_debug_skip_bbox boolean default false,
  p_debug_force_radius_km double precision default null
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  slug text,
  url text,
  images jsonb,
  category text,
  subcategory text,
  category_level_3 text,
  size text,
  brand text,
  model text,
  color text,
  condition text,
  starting_price numeric,
  starting_price_ron numeric,
  starting_price_eur numeric,
  product_type text,
  sale_type text,
  status text,
  county text,
  city text,
  product_location text,
  auction_date timestamptz,
  custom_fields jsonb,
  attributes jsonb,
  created_at timestamptz,
  is_premium boolean,
  premium_until timestamptz,
  sold_at timestamptz,
  coordinates jsonb,
  enterprise_rank real,
  debug_cnt_all bigint,
  debug_cnt_geo bigint,
  debug_cnt_candidates_geo bigint,
  debug_cnt_page_geo bigint,
  debug_cnt_final bigint,
  debug_geo_slice_sample jsonb
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  with input as (
    select
      nullif(btrim(left(coalesce(p_q, ''), 120)), '') as raw_q,
      greatest(0, coalesce(p_offset, 0)) as row_offset,
      least(greatest(coalesce(p_limit, 25), 1), 101) as row_limit,
      lower(coalesce(nullif(btrim(p_sort), ''), 'newest')) as sort_key,
      case
        when p_near_lat is not null and p_near_lng is not null
          and abs(p_near_lat) <= 90 and abs(p_near_lng) <= 180
        then true
        else false
      end as has_center,
      case
        when p_near_lat is not null and p_near_lng is not null
          and abs(p_near_lat) <= 90 and abs(p_near_lng) <= 180
        then least(
          greatest(
            case
              when p_debug_force_radius_km is not null and p_debug_force_radius_km > 0::double precision
              then p_debug_force_radius_km
              else coalesce(nullif(p_radius_km, 0), 200::double precision)
            end,
            1::double precision
          ),
          2000::double precision
        )
        else null
      end as effective_radius_km,
      nullif(
        trim(
          coalesce(
            nullif(trim(coalesce(p_location, '')), ''),
            nullif(trim(coalesce(p_city, '')), ''),
            nullif(trim(coalesce(p_county, '')), '')
          )
        ),
        ''
      ) as boost_pat,
      least(
        5000,
        greatest(
          1000,
          greatest(0, coalesce(p_offset, 0)) + least(greatest(coalesce(p_limit, 25), 1), 101) + 100
        )
      ) as candidate_cap
  ),
  param as (
    select
      i.*,
      (i.has_center and i.effective_radius_km is not null and i.effective_radius_km > 0) as has_radius,
      case
        when i.has_center
        then greatest(0.5::double precision, i.effective_radius_km / 111.0)
      end as bbox_lat_delta,
      case
        when i.has_center
        then greatest(
          0.5::double precision,
          i.effective_radius_km / greatest(111.320 * cos(radians(p_near_lat)), 1e-9::double precision)
        )
      end as bbox_lng_delta
    from input i
  ),
  ts as (
    select case
      when raw_q is null then null::tsquery
      else coalesce(public.build_prefix_tsquery(raw_q), plainto_tsquery('simple', unaccent(raw_q)))
    end as tsq
    from input
  ),
  query_tokens as (
    select array_remove(
      regexp_split_to_array(unaccent(lower(coalesce((select raw_q from input), ''))), '\s+'),
      ''
    ) as tokens
  ),
  filtered_all as (
    select
      p.*,
      case
        when (select tsq from ts) is not null and p.search_vector @@ (select tsq from ts)
          then ts_rank_cd(p.search_vector, (select tsq from ts))::real
        else 0::real
      end as rank_score
    from public.products p
    where p.status = any(coalesce(p_statuses, array['active', 'reserved', 'sold', 'in_progress']::text[]))
      and p.status <> 'deleted'
      and p.approval_normalized = 'approved'
      and (
        p_scope = 'live_bid'
        and p.channel = 'ro'
        or p_scope = 'executari'
        and p_has_executari_access
        and p.channel = 'executari_insolventa'
        or p_scope not in ('live_bid', 'executari')
        and (
          (p_channel = 'executari_insolventa' and p_has_executari_access and p.channel = 'executari_insolventa')
          or (p_channel <> 'executari_insolventa' and p_include_executari and p.channel in ('ro', 'executari_insolventa'))
          or (p_channel <> 'executari_insolventa' and not p_include_executari and p.channel = 'ro')
        )
      )
      and (
        (select raw_q from input) is null
        or ((select tsq from ts) is not null and p.search_vector @@ (select tsq from ts))
        or not exists (
          select 1
          from unnest((select tokens from query_tokens)) token
          where length(token) > 0
            and not (
              unaccent(lower(coalesce(p.title, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.category, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.subcategory, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.category_level_3, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.brand, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.model, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.slug, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.city, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.county, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.product_location, ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.custom_fields->>'listing_main_category', ''))) like '%' || token || '%'
              or unaccent(lower(coalesce(p.custom_fields->>'listing_category', ''))) like '%' || token || '%'
            )
        )
      )
      and (
        coalesce(array_length(p_categories, 1), 0) = 0
        or unaccent(lower(coalesce(p.category, ''))) = any(p_category_values)
        or lower(coalesce(p.subcategory, '')) = any(p_category_extra_subcategories)
        or (
          'executari' = any(p_categories)
          and (
            unaccent(lower(coalesce(p.category, ''))) like '%executari%'
            or p.product_type = 'licitatii-publice'
            or p.sale_type in ('licitatie-publica', 'licitatii-insolventa', 'licitatii-anaf', 'licitatii-executori')
          )
        )
      )
      and (
        coalesce(array_length(p_subcategories, 1), 0) = 0
        or lower(coalesce(p.subcategory, '')) = any(p_subcategories)
        or lower(coalesce(p.category_level_3, '')) = any(p_subcategories)
      )
      and (
        coalesce(array_length(p_level3s, 1), 0) = 0
        or lower(coalesce(p.category_level_3, '')) = any(p_level3s)
      )
      and (
        coalesce(array_length(p_list_categories, 1), 0) = 0
        or unaccent(lower(coalesce(p.custom_fields->>'listing_category', ''))) = any(p_list_categories)
      )
      and (
        (select has_center from input)
        or (
          nullif(btrim(coalesce(p_county, '')), '') is null
          or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_county))) || '%'
        )
      )
      and (
        (select has_center from input)
        or (
          nullif(btrim(coalesce(p_city, '')), '') is null
          or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_city))) || '%'
        )
      )
      -- p_location: strict text filter only when no geo center (distance-first mode skips this).
      and (
        (select has_center from input)
        or (
          nullif(btrim(coalesce(p_location, '')), '') is null
          or (
            nullif(btrim(coalesce(p_county, '')), '') is null
            and nullif(btrim(coalesce(p_city, '')), '') is null
            and unaccent(lower(coalesce(p.locality_search, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
          )
          or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
          or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        )
      )
      -- Geo filtering applied in geo_slice / chosen (includes NULL coords + fallback).
      and (
        p_free_only
        and (
          lower(coalesce(p.custom_fields->>'is_free_listing', 'false')) in ('true', '1', 'yes')
          or lower(coalesce(p.custom_fields->>'isFreeListing', 'false')) in ('true', '1', 'yes')
        )
        or not p_free_only
        and (p_price_min is null or coalesce(p.starting_price_ron, p.starting_price, 0) >= p_price_min)
        and (p_price_max is null or coalesce(p.starting_price_ron, p.starting_price, 0) <= p_price_max)
      )
      and (
        coalesce(array_length(p_sizes, 1), 0) = 0
        or p.size = any(p_sizes)
      )
      and (
        coalesce(array_length(p_brands, 1), 0) = 0
        or exists (
          select 1
          from unnest(p_brands) wanted_brand
          where unaccent(lower(coalesce(p.brand, ''))) like '%' || unaccent(lower(wanted_brand)) || '%'
             or unaccent(lower(coalesce(p.title, ''))) like '%' || unaccent(lower(wanted_brand)) || '%'
        )
      )
      and (
        nullif(btrim(coalesce(p_model, '')), '') is null
        or unaccent(lower(coalesce(p.model, ''))) like '%' || unaccent(lower(btrim(p_model))) || '%'
        or unaccent(lower(coalesce(p.custom_fields->>'model', ''))) like '%' || unaccent(lower(btrim(p_model))) || '%'
        or unaccent(lower(coalesce(p.title, ''))) like '%' || unaccent(lower(btrim(p_model))) || '%'
      )
      and (
        coalesce(array_length(p_colors, 1), 0) = 0
        or unaccent(lower(coalesce(p.color, ''))) = any(p_colors)
      )
      and (
        coalesce(array_length(p_conditions, 1), 0) = 0
        or unaccent(lower(coalesce(p.condition, ''))) = any(p_conditions)
      )
      and (
        nullif(btrim(coalesce(p_product_type, '')), '') is null
        or unaccent(lower(coalesce(p.product_type, ''))) = unaccent(lower(btrim(p_product_type)))
      )
      and (
        nullif(btrim(coalesce(p_sale_type, '')), '') is null
        or unaccent(lower(coalesce(p.sale_type, ''))) = unaccent(lower(btrim(p_sale_type)))
      )
      and (
        p_images is null
        or p_images not in ('with', 'without')
        or (
          p_images = 'with'
          and jsonb_typeof(coalesce(p.images, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(p.images, '[]'::jsonb)) > 0
        )
        or (
          p_images = 'without'
          and (
            jsonb_typeof(coalesce(p.images, '[]'::jsonb)) <> 'array'
            or jsonb_array_length(coalesce(p.images, '[]'::jsonb)) = 0
          )
        )
      )
      and (
        p_seller_user_ids is null
        or (
          p_seller_user_ids_exclude
          and (p.user_id is null or not (p.user_id::text = any(p_seller_user_ids)))
        )
        or (
          not p_seller_user_ids_exclude
          and p.user_id::text = any(p_seller_user_ids)
        )
      )
      and (nullif(btrim(coalesce(p_fuel, '')), '') is null or lower(coalesce(p.attributes->>'fuel', '')) = lower(btrim(p_fuel)))
      and (nullif(btrim(coalesce(p_body_type, '')), '') is null or lower(coalesce(p.attributes->>'bodyType', '')) = lower(btrim(p_body_type)))
      and (nullif(btrim(coalesce(p_part_type, '')), '') is null or lower(coalesce(p.attributes->>'partType', '')) = lower(btrim(p_part_type)))
      and (nullif(btrim(coalesce(p_department, '')), '') is null or lower(coalesce(p.attributes->>'department', '')) = lower(btrim(p_department)))
      and (nullif(btrim(coalesce(p_apparel_type, '')), '') is null or lower(coalesce(p.attributes->>'apparelType', '')) = lower(btrim(p_apparel_type)))
      and (nullif(btrim(coalesce(p_footwear_type, '')), '') is null or lower(coalesce(p.attributes->>'footwearType', '')) = lower(btrim(p_footwear_type)))
      and (nullif(btrim(coalesce(p_accessory_type, '')), '') is null or lower(coalesce(p.attributes->>'accessoryType', '')) = lower(btrim(p_accessory_type)))
  ),
  geo_slice as (
    select f.*
    from filtered_all f
    where
      not (select has_center from input)
      or f.geo_lat is null
      or f.geo_lng is null
      or (
        f.geo_lat is not null
        and f.geo_lng is not null
        and (
          coalesce(p_debug_skip_bbox, false)
          or (
            f.geo_lat between p_near_lat - (select bbox_lat_delta from param) and p_near_lat + (select bbox_lat_delta from param)
            and f.geo_lng between p_near_lng - (select bbox_lng_delta from param) and p_near_lng + (select bbox_lng_delta from param)
          )
        )
        and extensions.earth_distance(
              extensions.ll_to_earth(p_near_lat, p_near_lng),
              extensions.ll_to_earth(f.geo_lat, f.geo_lng)
            ) <= (select effective_radius_km from param) * 1000.0
      )
  ),
  chosen_geo as (
    select * from geo_slice
  ),
  chosen_fb as (
    select * from filtered_all
  ),
  candidates_geo as (
    select f.*
    from chosen_geo f, param i
    order by
      case
        when (select has_center from input)
          and (select boost_pat from input) is not null
          and (
            unaccent(lower(coalesce(f.city, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.county, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.locality_search, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
          )
        then 0
        else 1
      end asc,
      case
        when (select has_center from input) and not coalesce(p_debug_skip_distance_sort, false)
        then (f.geo_lat is null)
      end asc nulls last,
      case
        when (select has_center from input)
          and not coalesce(p_debug_skip_distance_sort, false)
          and f.geo_lat is not null
          and f.geo_lng is not null
        then extensions.earth_distance(
               extensions.ll_to_earth(p_near_lat, p_near_lng),
               extensions.ll_to_earth(f.geo_lat, f.geo_lng)
             )
      end asc nulls last,
      case when i.raw_q is not null and i.sort_key in ('', 'relevant') then f.rank_score end desc nulls last,
      case when i.sort_key in ('price_asc', 'pricelow') then coalesce(f.starting_price_ron, f.starting_price, 0) end asc nulls last,
      case when i.sort_key in ('price_desc', 'pricehigh') then coalesce(f.starting_price_ron, f.starting_price, 0) end desc nulls last,
      case when i.sort_key in ('date_asc', 'oldest') then f.created_at end asc nulls last,
      case when i.sort_key = 'title' then lower(f.title) end asc nulls last,
      case when i.sort_key = 'timeleft' then f.auction_date end asc nulls last,
      f.created_at desc nulls last,
      f.id desc
    limit (select case when (select has_center from input) then (select candidate_cap from input) end)
  ),
  candidates_fb as (
    select f.*
    from chosen_fb f, param i
    order by
      case
        when (select has_center from input)
          and (select boost_pat from input) is not null
          and (
            unaccent(lower(coalesce(f.city, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.county, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.locality_search, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
          )
        then 0
        else 1
      end asc,
      case
        when (select has_center from input) and not coalesce(p_debug_skip_distance_sort, false)
        then (f.geo_lat is null)
      end asc nulls last,
      case
        when (select has_center from input)
          and not coalesce(p_debug_skip_distance_sort, false)
          and f.geo_lat is not null
          and f.geo_lng is not null
        then extensions.earth_distance(
               extensions.ll_to_earth(p_near_lat, p_near_lng),
               extensions.ll_to_earth(f.geo_lat, f.geo_lng)
             )
      end asc nulls last,
      case when i.raw_q is not null and i.sort_key in ('', 'relevant') then f.rank_score end desc nulls last,
      case when i.sort_key in ('price_asc', 'pricelow') then coalesce(f.starting_price_ron, f.starting_price, 0) end asc nulls last,
      case when i.sort_key in ('price_desc', 'pricehigh') then coalesce(f.starting_price_ron, f.starting_price, 0) end desc nulls last,
      case when i.sort_key in ('date_asc', 'oldest') then f.created_at end asc nulls last,
      case when i.sort_key = 'title' then lower(f.title) end asc nulls last,
      case when i.sort_key = 'timeleft' then f.auction_date end asc nulls last,
      f.created_at desc nulls last,
      f.id desc
    limit (select case when (select has_center from input) then (select candidate_cap from input) end)
  ),
  page_geo as (
    select
      f.id,
      f.user_id,
      f.title,
      f.slug,
      f.url,
      coalesce(f.images, '[]'::jsonb) as images,
      f.category,
      f.subcategory,
      f.category_level_3,
      f.size,
      f.brand,
      f.model,
      f.color,
      f.condition,
      f.starting_price,
      f.starting_price_ron,
      f.starting_price_eur,
      f.product_type,
      f.sale_type,
      f.status,
      f.county,
      f.city,
      f.product_location,
      f.auction_date,
      coalesce(f.custom_fields, '{}'::jsonb) as custom_fields,
      coalesce(f.attributes, '{}'::jsonb) as attributes,
      f.created_at,
      f.is_premium,
      f.premium_until,
      f.sold_at,
      f.coordinates,
      f.rank_score as enterprise_rank
    from candidates_geo f, param i
    order by
      case
        when (select has_center from input)
          and (select boost_pat from input) is not null
          and (
            unaccent(lower(coalesce(f.city, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.county, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.locality_search, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
          )
        then 0
        else 1
      end asc,
      case
        when (select has_center from input) and not coalesce(p_debug_skip_distance_sort, false)
        then (f.geo_lat is null)
      end asc nulls last,
      case
        when (select has_center from input)
          and not coalesce(p_debug_skip_distance_sort, false)
          and f.geo_lat is not null
          and f.geo_lng is not null
        then extensions.earth_distance(
               extensions.ll_to_earth(p_near_lat, p_near_lng),
               extensions.ll_to_earth(f.geo_lat, f.geo_lng)
             )
      end asc nulls last,
      case when i.raw_q is not null and i.sort_key in ('', 'relevant') then f.rank_score end desc nulls last,
      case when i.sort_key in ('price_asc', 'pricelow') then coalesce(f.starting_price_ron, f.starting_price, 0) end asc nulls last,
      case when i.sort_key in ('price_desc', 'pricehigh') then coalesce(f.starting_price_ron, f.starting_price, 0) end desc nulls last,
      case when i.sort_key in ('date_asc', 'oldest') then f.created_at end asc nulls last,
      case when i.sort_key = 'title' then lower(f.title) end asc nulls last,
      case when i.sort_key = 'timeleft' then f.auction_date end asc nulls last,
      f.created_at desc nulls last,
      f.id desc
    offset (select row_offset from input)
    limit (select row_limit from input)
  ),
  page_fb as (
    select
      f.id,
      f.user_id,
      f.title,
      f.slug,
      f.url,
      coalesce(f.images, '[]'::jsonb) as images,
      f.category,
      f.subcategory,
      f.category_level_3,
      f.size,
      f.brand,
      f.model,
      f.color,
      f.condition,
      f.starting_price,
      f.starting_price_ron,
      f.starting_price_eur,
      f.product_type,
      f.sale_type,
      f.status,
      f.county,
      f.city,
      f.product_location,
      f.auction_date,
      coalesce(f.custom_fields, '{}'::jsonb) as custom_fields,
      coalesce(f.attributes, '{}'::jsonb) as attributes,
      f.created_at,
      f.is_premium,
      f.premium_until,
      f.sold_at,
      f.coordinates,
      f.rank_score as enterprise_rank
    from candidates_fb f, param i
    order by
      case
        when (select has_center from input)
          and (select boost_pat from input) is not null
          and (
            unaccent(lower(coalesce(f.city, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.county, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
            or unaccent(lower(coalesce(f.locality_search, ''))) like '%' || unaccent(lower((select boost_pat from input))) || '%'
          )
        then 0
        else 1
      end asc,
      case
        when (select has_center from input) and not coalesce(p_debug_skip_distance_sort, false)
        then (f.geo_lat is null)
      end asc nulls last,
      case
        when (select has_center from input)
          and not coalesce(p_debug_skip_distance_sort, false)
          and f.geo_lat is not null
          and f.geo_lng is not null
        then extensions.earth_distance(
               extensions.ll_to_earth(p_near_lat, p_near_lng),
               extensions.ll_to_earth(f.geo_lat, f.geo_lng)
             )
      end asc nulls last,
      case when i.raw_q is not null and i.sort_key in ('', 'relevant') then f.rank_score end desc nulls last,
      case when i.sort_key in ('price_asc', 'pricelow') then coalesce(f.starting_price_ron, f.starting_price, 0) end asc nulls last,
      case when i.sort_key in ('price_desc', 'pricehigh') then coalesce(f.starting_price_ron, f.starting_price, 0) end desc nulls last,
      case when i.sort_key in ('date_asc', 'oldest') then f.created_at end asc nulls last,
      case when i.sort_key = 'title' then lower(f.title) end asc nulls last,
      case when i.sort_key = 'timeleft' then f.auction_date end asc nulls last,
      f.created_at desc nulls last,
      f.id desc
    offset (select row_offset from input)
    limit (select row_limit from input)
  )
  select
    r.id,
    r.user_id,
    r.title,
    r.slug,
    r.url,
    r.images,
    r.category,
    r.subcategory,
    r.category_level_3,
    r.size,
    r.brand,
    r.model,
    r.color,
    r.condition,
    r.starting_price,
    r.starting_price_ron,
    r.starting_price_eur,
    r.product_type,
    r.sale_type,
    r.status,
    r.county,
    r.city,
    r.product_location,
    r.auction_date,
    r.custom_fields,
    r.attributes,
    r.created_at,
    r.is_premium,
    r.premium_until,
    r.sold_at,
    r.coordinates,
    r.enterprise_rank,
    case when p_debug then (select count(*)::bigint from filtered_all) end as debug_cnt_all,
    case when p_debug then (select count(*)::bigint from geo_slice) end as debug_cnt_geo,
    case when p_debug then (select count(*)::bigint from candidates_geo) end as debug_cnt_candidates_geo,
    case when p_debug then (select count(*)::bigint from page_geo) end as debug_cnt_page_geo,
    case when p_debug then
      case when exists (select 1 from page_geo limit 1)
        then (select count(*)::bigint from candidates_geo)
        else (select count(*)::bigint from candidates_fb)
      end
    end as debug_cnt_final,
    case when p_debug then (
      select coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', s2.id,
              'title', left(coalesce(s2.title, ''), 120),
              'geo_lat', s2.geo_lat,
              'geo_lng', s2.geo_lng,
              'dist_m',
                case
                  when s2.geo_lat is not null and s2.geo_lng is not null
                  then extensions.earth_distance(
                    extensions.ll_to_earth(p_near_lat, p_near_lng),
                    extensions.ll_to_earth(s2.geo_lat, s2.geo_lng)
                  )
                end
            )
            ORDER BY s2.created_at DESC, s2.id DESC
          )
          from (select * from geo_slice order by created_at desc, id desc limit 10) s2
        ),
        '[]'::jsonb
      )
    ) end as debug_geo_slice_sample
  from (
    select * from page_geo
    union all
    select * from page_fb
    where not exists (select 1 from page_geo limit 1)
  ) r;

$$;

COMMENT ON FUNCTION public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, boolean,
  boolean, boolean, double precision
) IS
  'Enterprise /ro: bbox + earth_distance (m); fallback when page_geo empty. p_debug → stage counts + geo_slice sample; toggles for skip distance/bbox or force radius.';

GRANT EXECUTE ON FUNCTION public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision, boolean,
  boolean, boolean, double precision
) TO anon, authenticated, service_role;

