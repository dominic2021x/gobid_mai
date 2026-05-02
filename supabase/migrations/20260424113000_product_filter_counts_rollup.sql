create table if not exists public.product_filter_counts_rollup (
  scope_key text not null,
  channel_bucket text not null,
  category text,
  subcategory text,
  product_type text,
  sale_type text,
  visible_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (scope_key, channel_bucket, category, subcategory, product_type, sale_type)
);

create index if not exists product_filter_counts_rollup_scope_channel_idx
  on public.product_filter_counts_rollup (scope_key, channel_bucket);

create or replace function public.refresh_product_filter_counts_rollup()
returns void
language sql
security definer
set search_path = public
as $$
  truncate table public.product_filter_counts_rollup;

  with visible_products as (
    select
      coalesce(nullif(trim(channel), ''), 'ro') as channel,
      coalesce(nullif(trim(category), ''), '') as category,
      coalesce(nullif(trim(subcategory), ''), '') as subcategory,
      coalesce(nullif(trim(product_type), ''), '') as product_type,
      coalesce(nullif(trim(sale_type), ''), '') as sale_type
    from public.products
    where status in ('active', 'reserved', 'sold', 'in_progress')
      and status <> 'deleted'
      and (
        status <> 'sold'
        or sold_at >= (now() - interval '24 hours')
      )
  ),
  grouped as (
    select
      'all'::text as scope_key,
      'ro'::text as channel_bucket,
      category,
      subcategory,
      product_type,
      sale_type,
      count(*)::integer as visible_count
    from visible_products
    where channel in ('ro', 'executari_insolventa')
    group by 1, 2, 3, 4, 5, 6

    union all

    select
      'all'::text as scope_key,
      'executari_insolventa'::text as channel_bucket,
      category,
      subcategory,
      product_type,
      sale_type,
      count(*)::integer as visible_count
    from visible_products
    where channel = 'executari_insolventa'
    group by 1, 2, 3, 4, 5, 6

    union all

    select
      'live_bid'::text as scope_key,
      'ro'::text as channel_bucket,
      category,
      subcategory,
      product_type,
      sale_type,
      count(*)::integer as visible_count
    from visible_products
    where channel = 'ro'
    group by 1, 2, 3, 4, 5, 6

    union all

    select
      'executari'::text as scope_key,
      'executari_insolventa'::text as channel_bucket,
      category,
      subcategory,
      product_type,
      sale_type,
      count(*)::integer as visible_count
    from visible_products
    where channel = 'executari_insolventa'
    group by 1, 2, 3, 4, 5, 6
  )
  insert into public.product_filter_counts_rollup (
    scope_key,
    channel_bucket,
    category,
    subcategory,
    product_type,
    sale_type,
    visible_count,
    updated_at
  )
  select
    g.scope_key,
    g.channel_bucket,
    g.category,
    g.subcategory,
    g.product_type,
    g.sale_type,
    g.visible_count,
    now()
  from grouped g
  ;
$$;

comment on table public.product_filter_counts_rollup is
  'Precomputed rollup for /api/ro/filter-counts. Keeps request path off the products table.';

comment on function public.refresh_product_filter_counts_rollup() is
  'Refreshes product filter counts rollup. Call after product imports/updates or from cron.';
