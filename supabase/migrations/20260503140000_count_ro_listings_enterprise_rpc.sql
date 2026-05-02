-- Total exact pentru aceiași parametri ca search_ro_listings_enterprise — evită PostgREST head count + ILIKE pe mai multe coloane.
-- Dacă modifici WHERE-ul din search_ro_listings_enterprise, actualizează și aici (același graf de filtre).

create or replace function public.count_ro_listings_enterprise(
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
  p_sort text default 'newest'
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select
      nullif(btrim(left(coalesce(p_q, ''), 120)), '') as raw_q,
      greatest(0, coalesce(p_offset, 0)) as row_offset,
      least(greatest(coalesce(p_limit, 25), 1), 101) as row_limit,
      lower(coalesce(nullif(btrim(p_sort), ''), 'newest')) as sort_key
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
      and coalesce(p.approval_status, 'approved') = 'approved'
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
        or unaccent(lower(coalesce(p.county, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
        or unaccent(lower(coalesce(p.city, ''))) like '%' || unaccent(lower(btrim(p_location))) || '%'
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
  select count(*)::bigint from filtered;
$$;

comment on function public.count_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text
) is
  'Exact total for /ro filters — same predicate graph as search_ro_listings_enterprise; keep in sync when search changes.';

grant execute on function public.count_ro_listings_enterprise(
  text, text, text, boolean, boolean, integer, integer,
  text[], text[], text[], text[], text[], text[], text[],
  text, text, text, numeric, numeric, text[], text[], text,
  text[], text[], text, text, text, text[], boolean, boolean,
  text, text, text, text, text, text, text, text
) to anon, authenticated, service_role;
