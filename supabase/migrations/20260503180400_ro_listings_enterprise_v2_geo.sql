-- RO instant search — Phase 1.5: enterprise RPCs v2 with approval_normalized + indexed geo radius.
--
-- Adds three new positional params at the END (with defaults so old callers still work):
--   p_near_lat double precision, p_near_lng double precision, p_radius_km double precision
--
-- Geo predicate is sargable on products_geo_gist_idx (earth_box prefilter, then exact earth_distance).
-- For p_location, we now use locality_search (city + ' ' + county) when both p_county and p_city are
-- empty — paritate cu fast PostgREST path în listingsRepo.cleanFastLocationPattern.
--
-- New params change the function signature; CREATE OR REPLACE would create a NEW overload instead of
-- replacing the existing one, so we DROP the old signatures first.

drop function if exists public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text
);

drop function if exists public.count_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text
);

drop function if exists public.count_ro_listings_enterprise_estimate(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text
);

-- ───────────────────────────────────────────────────────────────────────────────
-- search_ro_listings_enterprise v2
-- ───────────────────────────────────────────────────────────────────────────────
create function public.search_ro_listings_enterprise(
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
  p_radius_km double precision default null
)
returns table (
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
  enterprise_rank real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with input as (
    select
      nullif(btrim(left(coalesce(p_q, ''), 120)), '') as raw_q,
      greatest(0, coalesce(p_offset, 0)) as row_offset,
      least(greatest(coalesce(p_limit, 25), 1), 101) as row_limit,
      lower(coalesce(nullif(btrim(p_sort), ''), 'newest')) as sort_key,
      case
        when p_near_lat is not null and p_near_lng is not null and p_radius_km is not null
          and p_radius_km > 0
          and abs(p_near_lat) <= 90 and abs(p_near_lng) <= 180
        then true
        else false
      end as has_geo
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
  filtered as (
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
        nullif(btrim(coalesce(p_county, '')), '') is null
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_county))) || '%'
      )
      and (
        nullif(btrim(coalesce(p_city, '')), '') is null
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_city))) || '%'
      )
      -- p_location: when no city/county filter present, match against the locality_search trigram
      -- (city + ' ' + county) — paritate cu fast PostgREST path. Otherwise OR over county/city.
      and (
        nullif(btrim(coalesce(p_location, '')), '') is null
        or (
          nullif(btrim(coalesce(p_county, '')), '') is null
          and nullif(btrim(coalesce(p_city, '')), '') is null
          and unaccent(lower(coalesce(p.locality_search, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        )
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
      )
      -- Indexed geo radius. earth_box uses meters; products_geo_gist_idx satisfies the prefilter.
      and (
        not (select has_geo from input)
        or (
          p.geo_lat is not null
          and p.geo_lng is not null
          and extensions.earth_box(extensions.ll_to_earth(p_near_lat, p_near_lng), p_radius_km * 1000.0)
              @> extensions.ll_to_earth(p.geo_lat, p.geo_lng)
          and extensions.earth_distance(
                extensions.ll_to_earth(p_near_lat, p_near_lng),
                extensions.ll_to_earth(p.geo_lat, p.geo_lng)
              ) <= p_radius_km * 1000.0
        )
      )
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
  )
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
  from filtered f, input i
  order by
    -- When geo radius is active, prefer nearest first regardless of sort key.
    case when (select has_geo from input)
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
  limit (select row_limit from input);
$$;

comment on function public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
) is
  'Enterprise /ro listing retrieval v2: indexed approval_normalized + indexed geo radius (earth_box / earth_distance).';

grant execute on function public.search_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
) to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────
-- count_ro_listings_enterprise v2 (exact total)
-- ───────────────────────────────────────────────────────────────────────────────
create function public.count_ro_listings_enterprise(
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
  p_radius_km double precision default null
)
returns bigint
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with input as (
    select
      nullif(btrim(left(coalesce(p_q, ''), 120)), '') as raw_q,
      case
        when p_near_lat is not null and p_near_lng is not null and p_radius_km is not null
          and p_radius_km > 0
          and abs(p_near_lat) <= 90 and abs(p_near_lng) <= 180
        then true
        else false
      end as has_geo
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
  filtered as (
    select 1
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
        nullif(btrim(coalesce(p_county, '')), '') is null
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_county))) || '%'
      )
      and (
        nullif(btrim(coalesce(p_city, '')), '') is null
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_city))) || '%'
      )
      and (
        nullif(btrim(coalesce(p_location, '')), '') is null
        or (
          nullif(btrim(coalesce(p_county, '')), '') is null
          and nullif(btrim(coalesce(p_city, '')), '') is null
          and unaccent(lower(coalesce(p.locality_search, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        )
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
      )
      and (
        not (select has_geo from input)
        or (
          p.geo_lat is not null
          and p.geo_lng is not null
          and extensions.earth_box(extensions.ll_to_earth(p_near_lat, p_near_lng), p_radius_km * 1000.0)
              @> extensions.ll_to_earth(p.geo_lat, p.geo_lng)
          and extensions.earth_distance(
                extensions.ll_to_earth(p_near_lat, p_near_lng),
                extensions.ll_to_earth(p.geo_lat, p.geo_lng)
              ) <= p_radius_km * 1000.0
        )
      )
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
      and (coalesce(array_length(p_sizes, 1), 0) = 0 or p.size = any(p_sizes))
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
      and (coalesce(array_length(p_colors, 1), 0) = 0 or unaccent(lower(coalesce(p.color, ''))) = any(p_colors))
      and (coalesce(array_length(p_conditions, 1), 0) = 0 or unaccent(lower(coalesce(p.condition, ''))) = any(p_conditions))
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
        or (p_images = 'with' and jsonb_typeof(coalesce(p.images, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p.images, '[]'::jsonb)) > 0)
        or (p_images = 'without' and (jsonb_typeof(coalesce(p.images, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p.images, '[]'::jsonb)) = 0))
      )
      and (
        p_seller_user_ids is null
        or (p_seller_user_ids_exclude and (p.user_id is null or not (p.user_id::text = any(p_seller_user_ids))))
        or (not p_seller_user_ids_exclude and p.user_id::text = any(p_seller_user_ids))
      )
      and (nullif(btrim(coalesce(p_fuel, '')), '') is null or lower(coalesce(p.attributes->>'fuel', '')) = lower(btrim(p_fuel)))
      and (nullif(btrim(coalesce(p_body_type, '')), '') is null or lower(coalesce(p.attributes->>'bodyType', '')) = lower(btrim(p_body_type)))
      and (nullif(btrim(coalesce(p_part_type, '')), '') is null or lower(coalesce(p.attributes->>'partType', '')) = lower(btrim(p_part_type)))
      and (nullif(btrim(coalesce(p_department, '')), '') is null or lower(coalesce(p.attributes->>'department', '')) = lower(btrim(p_department)))
      and (nullif(btrim(coalesce(p_apparel_type, '')), '') is null or lower(coalesce(p.attributes->>'apparelType', '')) = lower(btrim(p_apparel_type)))
      and (nullif(btrim(coalesce(p_footwear_type, '')), '') is null or lower(coalesce(p.attributes->>'footwearType', '')) = lower(btrim(p_footwear_type)))
      and (nullif(btrim(coalesce(p_accessory_type, '')), '') is null or lower(coalesce(p.attributes->>'accessoryType', '')) = lower(btrim(p_accessory_type)))
  )
  select count(*)::bigint from filtered;
$$;

comment on function public.count_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
) is
  'Exact total v2 — same predicates as search_ro_listings_enterprise (incl. indexed geo radius).';

grant execute on function public.count_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
) to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────
-- count_ro_listings_enterprise_estimate v2 (reltuples for default feed; capped 1001 otherwise)
-- ───────────────────────────────────────────────────────────────────────────────
create function public.count_ro_listings_enterprise_estimate(
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
  p_radius_km double precision default null
)
returns table (total bigint, total_kind text)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with input as (
    select
      nullif(btrim(left(coalesce(p_q, ''), 120)), '') as raw_q,
      case
        when p_near_lat is not null and p_near_lng is not null and p_radius_km is not null
          and p_radius_km > 0
          and abs(p_near_lat) <= 90 and abs(p_near_lng) <= 180
        then true
        else false
      end as has_geo
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
  filtered as (
    select 1
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
        nullif(btrim(coalesce(p_county, '')), '') is null
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_county))) || '%'
      )
      and (
        nullif(btrim(coalesce(p_city, '')), '') is null
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_city))) || '%'
      )
      and (
        nullif(btrim(coalesce(p_location, '')), '') is null
        or (
          nullif(btrim(coalesce(p_county, '')), '') is null
          and nullif(btrim(coalesce(p_city, '')), '') is null
          and unaccent(lower(coalesce(p.locality_search, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        )
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
      )
      and (
        not (select has_geo from input)
        or (
          p.geo_lat is not null
          and p.geo_lng is not null
          and extensions.earth_box(extensions.ll_to_earth(p_near_lat, p_near_lng), p_radius_km * 1000.0)
              @> extensions.ll_to_earth(p.geo_lat, p.geo_lng)
          and extensions.earth_distance(
                extensions.ll_to_earth(p_near_lat, p_near_lng),
                extensions.ll_to_earth(p.geo_lat, p.geo_lng)
              ) <= p_radius_km * 1000.0
        )
      )
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
      and (coalesce(array_length(p_sizes, 1), 0) = 0 or p.size = any(p_sizes))
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
      and (coalesce(array_length(p_colors, 1), 0) = 0 or unaccent(lower(coalesce(p.color, ''))) = any(p_colors))
      and (coalesce(array_length(p_conditions, 1), 0) = 0 or unaccent(lower(coalesce(p.condition, ''))) = any(p_conditions))
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
        or (p_images = 'with' and jsonb_typeof(coalesce(p.images, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p.images, '[]'::jsonb)) > 0)
        or (p_images = 'without' and (jsonb_typeof(coalesce(p.images, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p.images, '[]'::jsonb)) = 0))
      )
      and (
        p_seller_user_ids is null
        or (p_seller_user_ids_exclude and (p.user_id is null or not (p.user_id::text = any(p_seller_user_ids))))
        or (not p_seller_user_ids_exclude and p.user_id::text = any(p_seller_user_ids))
      )
      and (nullif(btrim(coalesce(p_fuel, '')), '') is null or lower(coalesce(p.attributes->>'fuel', '')) = lower(btrim(p_fuel)))
      and (nullif(btrim(coalesce(p_body_type, '')), '') is null or lower(coalesce(p.attributes->>'bodyType', '')) = lower(btrim(p_body_type)))
      and (nullif(btrim(coalesce(p_part_type, '')), '') is null or lower(coalesce(p.attributes->>'partType', '')) = lower(btrim(p_part_type)))
      and (nullif(btrim(coalesce(p_department, '')), '') is null or lower(coalesce(p.attributes->>'department', '')) = lower(btrim(p_department)))
      and (nullif(btrim(coalesce(p_apparel_type, '')), '') is null or lower(coalesce(p.attributes->>'apparelType', '')) = lower(btrim(p_apparel_type)))
      and (nullif(btrim(coalesce(p_footwear_type, '')), '') is null or lower(coalesce(p.attributes->>'footwearType', '')) = lower(btrim(p_footwear_type)))
      and (nullif(btrim(coalesce(p_accessory_type, '')), '') is null or lower(coalesce(p.attributes->>'accessoryType', '')) = lower(btrim(p_accessory_type)))
  ),
  __flags as (
    select
      (
        (select raw_q from input) is null
        and coalesce(array_length(p_categories, 1), 0) = 0
        and coalesce(array_length(p_subcategories, 1), 0) = 0
        and coalesce(array_length(p_level3s, 1), 0) = 0
        and coalesce(array_length(p_list_categories, 1), 0) = 0
        and nullif(btrim(coalesce(p_county, '')), '') is null
        and nullif(btrim(coalesce(p_city, '')), '') is null
        and nullif(btrim(coalesce(p_location, '')), '') is null
        and not (select has_geo from input)
        and (p_price_min is null or p_price_min <= 0)
        and p_price_max is null
        and coalesce(array_length(p_sizes, 1), 0) = 0
        and coalesce(array_length(p_brands, 1), 0) = 0
        and nullif(btrim(coalesce(p_model, '')), '') is null
        and coalesce(array_length(p_colors, 1), 0) = 0
        and coalesce(array_length(p_conditions, 1), 0) = 0
        and nullif(btrim(coalesce(p_product_type, '')), '') is null
        and nullif(btrim(coalesce(p_sale_type, '')), '') is null
        and p_images is null
        and p_seller_user_ids is null
        and p_free_only is false
        and nullif(btrim(coalesce(p_fuel, '')), '') is null
        and nullif(btrim(coalesce(p_body_type, '')), '') is null
        and nullif(btrim(coalesce(p_part_type, '')), '') is null
        and nullif(btrim(coalesce(p_department, '')), '') is null
        and nullif(btrim(coalesce(p_apparel_type, '')), '') is null
        and nullif(btrim(coalesce(p_footwear_type, '')), '') is null
        and nullif(btrim(coalesce(p_accessory_type, '')), '') is null
        and coalesce(p_include_executari, false) is false
        and (p_scope is null or lower(btrim(p_scope)) = 'all')
        and coalesce(p_channel, 'ro') = 'ro'
        and coalesce(p_has_executari_access, false) is false
      ) as use_reltuples
  ),
  __capped as (
    select (count(*))::bigint as c from (select 1 from filtered limit 1001) z
  )
  select
    case when (select use_reltuples from __flags)
      then public.products_table_reltuples_estimate()
      else (select c from __capped)
    end,
    case
      when (select use_reltuples from __flags) then 'estimate'::text
      when (select c from __capped) >= 1001 then 'capped'::text
      else 'exact'::text
    end;
$$;

comment on function public.count_ro_listings_enterprise_estimate(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
) is
  'Capped estimate v2 — reltuples for default feed; otherwise count limited to 1001. Same predicates as enterprise search.';

grant execute on function public.count_ro_listings_enterprise_estimate(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text,
  double precision, double precision, double precision
) to anon, authenticated, service_role;
