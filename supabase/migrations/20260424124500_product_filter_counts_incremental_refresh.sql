-- Skip large products index builds during migration push.

create table if not exists public.product_filter_counts_source (
  product_id uuid primary key,
  channel_bucket text not null,
  category text,
  subcategory text,
  product_type text,
  sale_type text,
  updated_at timestamptz not null default now()
);

create index if not exists product_filter_counts_source_lookup_idx
  on public.product_filter_counts_source (channel_bucket, category, subcategory, product_type, sale_type);

create table if not exists public.product_filter_counts_dirty_groups (
  scope_key text not null,
  channel_bucket text not null,
  category text,
  subcategory text,
  product_type text,
  sale_type text,
  queued_at timestamptz not null default now(),
  primary key (scope_key, channel_bucket, category, subcategory, product_type, sale_type)
);

create index if not exists product_filter_counts_dirty_groups_queued_idx
  on public.product_filter_counts_dirty_groups (queued_at asc);

create or replace function public.product_filter_counts_normalize_text(p_value text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(p_value), ''), '');
$$;

create or replace function public.product_filter_counts_channel_bucket(p_channel text)
returns text
language sql
immutable
as $$
  select case
    when public.product_filter_counts_normalize_text(p_channel) = 'executari_insolventa' then 'executari_insolventa'
    else 'ro'
  end;
$$;

create or replace function public.product_filter_counts_is_visible(p_status text, p_sold_at timestamptz)
returns boolean
language sql
stable
as $$
  select
    p_status in ('active', 'reserved', 'sold', 'in_progress')
    and p_status <> 'deleted'
    and (
      p_status <> 'sold'
      or p_sold_at >= (now() - interval '24 hours')
    );
$$;

create or replace function public.enqueue_product_filter_count_dirty_groups(
  p_channel_bucket text,
  p_category text,
  p_subcategory text,
  p_product_type text,
  p_sale_type text
)
returns void
language sql
as $$
  insert into public.product_filter_counts_dirty_groups (
    scope_key,
    channel_bucket,
    category,
    subcategory,
    product_type,
    sale_type,
    queued_at
  )
  select
    g.scope_key,
    g.channel_bucket,
    p_category,
    p_subcategory,
    p_product_type,
    p_sale_type,
    now()
  from (
    values
      ('all'::text, 'ro'::text),
      (
        case when p_channel_bucket = 'executari_insolventa' then 'all' else null end,
        case when p_channel_bucket = 'executari_insolventa' then 'executari_insolventa' else null end
      ),
      (
        case when p_channel_bucket = 'ro' then 'live_bid' else null end,
        case when p_channel_bucket = 'ro' then 'ro' else null end
      ),
      (
        case when p_channel_bucket = 'executari_insolventa' then 'executari' else null end,
        case when p_channel_bucket = 'executari_insolventa' then 'executari_insolventa' else null end
      )
  ) as g(scope_key, channel_bucket)
  where g.scope_key is not null
    and g.channel_bucket is not null
  on conflict (scope_key, channel_bucket, category, subcategory, product_type, sale_type)
  do update
  set queued_at = excluded.queued_at;
$$;

create or replace function public.sync_product_filter_counts_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_visible boolean := false;
  new_visible boolean := false;
  old_channel_bucket text;
  new_channel_bucket text;
  old_category text;
  old_subcategory text;
  old_product_type text;
  old_sale_type text;
  new_category text;
  new_subcategory text;
  new_product_type text;
  new_sale_type text;
begin
  if tg_op <> 'INSERT' then
    old_visible := public.product_filter_counts_is_visible(old.status, old.sold_at);
    old_channel_bucket := public.product_filter_counts_channel_bucket(old.channel);
    old_category := public.product_filter_counts_normalize_text(old.category);
    old_subcategory := public.product_filter_counts_normalize_text(old.subcategory);
    old_product_type := public.product_filter_counts_normalize_text(old.product_type);
    old_sale_type := public.product_filter_counts_normalize_text(old.sale_type);
  end if;

  if tg_op <> 'DELETE' then
    new_visible := public.product_filter_counts_is_visible(new.status, new.sold_at);
    new_channel_bucket := public.product_filter_counts_channel_bucket(new.channel);
    new_category := public.product_filter_counts_normalize_text(new.category);
    new_subcategory := public.product_filter_counts_normalize_text(new.subcategory);
    new_product_type := public.product_filter_counts_normalize_text(new.product_type);
    new_sale_type := public.product_filter_counts_normalize_text(new.sale_type);
  end if;

  if tg_op <> 'INSERT' then
    delete from public.product_filter_counts_source where product_id = old.id;
    if old_visible then
      perform public.enqueue_product_filter_count_dirty_groups(
        old_channel_bucket,
        old_category,
        old_subcategory,
        old_product_type,
        old_sale_type
      );
    end if;
  end if;

  if tg_op <> 'DELETE' and new_visible then
    insert into public.product_filter_counts_source (
      product_id,
      channel_bucket,
      category,
      subcategory,
      product_type,
      sale_type,
      updated_at
    )
    values (
      new.id,
      new_channel_bucket,
      new_category,
      new_subcategory,
      new_product_type,
      new_sale_type,
      now()
    )
    on conflict (product_id)
    do update
    set
      channel_bucket = excluded.channel_bucket,
      category = excluded.category,
      subcategory = excluded.subcategory,
      product_type = excluded.product_type,
      sale_type = excluded.sale_type,
      updated_at = excluded.updated_at;

    perform public.enqueue_product_filter_count_dirty_groups(
      new_channel_bucket,
      new_category,
      new_subcategory,
      new_product_type,
      new_sale_type
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_products_filter_counts_source_sync on public.products;

create trigger trg_products_filter_counts_source_sync
after insert or update of status, sold_at, channel, category, subcategory, product_type, sale_type or delete
on public.products
for each row
execute function public.sync_product_filter_counts_source();

drop function if exists public.refresh_product_filter_counts_rollup();

create or replace function public.refresh_product_filter_counts_rollup(p_max_groups integer default 500)
returns table (
  processed_groups integer,
  upserted_groups integer,
  deleted_groups integer,
  remaining_groups bigint
)
language sql
security definer
set search_path = public
as $$
  with todo as (
    select
      scope_key,
      channel_bucket,
      category,
      subcategory,
      product_type,
      sale_type
    from public.product_filter_counts_dirty_groups
    order by queued_at asc
    limit greatest(coalesce(p_max_groups, 500), 1)
  ),
  consumed as (
    delete from public.product_filter_counts_dirty_groups d
    using todo t
    where d.scope_key = t.scope_key
      and d.channel_bucket = t.channel_bucket
      and d.category is not distinct from t.category
      and d.subcategory is not distinct from t.subcategory
      and d.product_type is not distinct from t.product_type
      and d.sale_type is not distinct from t.sale_type
    returning
      d.scope_key,
      d.channel_bucket,
      d.category,
      d.subcategory,
      d.product_type,
      d.sale_type
  ),
  recomputed as (
    select
      c.scope_key,
      c.channel_bucket,
      c.category,
      c.subcategory,
      c.product_type,
      c.sale_type,
      count(s.product_id)::integer as visible_count
    from consumed c
    left join public.product_filter_counts_source s
      on (
        (c.scope_key = 'all' and c.channel_bucket = 'ro' and s.channel_bucket in ('ro', 'executari_insolventa'))
        or (c.scope_key = 'all' and c.channel_bucket = 'executari_insolventa' and s.channel_bucket = 'executari_insolventa')
        or (c.scope_key = 'live_bid' and c.channel_bucket = 'ro' and s.channel_bucket = 'ro')
        or (c.scope_key = 'executari' and c.channel_bucket = 'executari_insolventa' and s.channel_bucket = 'executari_insolventa')
      )
      and s.category is not distinct from c.category
      and s.subcategory is not distinct from c.subcategory
      and s.product_type is not distinct from c.product_type
      and s.sale_type is not distinct from c.sale_type
    group by 1, 2, 3, 4, 5, 6
  ),
  deleted_zero as (
    delete from public.product_filter_counts_rollup r
    using recomputed x
    where r.scope_key = x.scope_key
      and r.channel_bucket = x.channel_bucket
      and r.category is not distinct from x.category
      and r.subcategory is not distinct from x.subcategory
      and r.product_type is not distinct from x.product_type
      and r.sale_type is not distinct from x.sale_type
      and x.visible_count = 0
    returning 1
  ),
  upserted as (
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
      x.scope_key,
      x.channel_bucket,
      x.category,
      x.subcategory,
      x.product_type,
      x.sale_type,
      x.visible_count,
      now()
    from recomputed x
    where x.visible_count > 0
    on conflict (scope_key, channel_bucket, category, subcategory, product_type, sale_type)
    do update
    set
      visible_count = excluded.visible_count,
      updated_at = excluded.updated_at
    returning 1
  )
  select
    coalesce((select count(*)::integer from consumed), 0) as processed_groups,
    coalesce((select count(*)::integer from upserted), 0) as upserted_groups,
    coalesce((select count(*)::integer from deleted_zero), 0) as deleted_groups,
    coalesce((select count(*)::bigint from public.product_filter_counts_dirty_groups), 0) as remaining_groups;
$$;

create or replace function public.refresh_product_filter_counts_rollup()
returns table (
  processed_groups integer,
  upserted_groups integer,
  deleted_groups integer,
  remaining_groups bigint
)
language sql
security definer
set search_path = public
as $$
  select * from public.refresh_product_filter_counts_rollup(500);
$$;

create or replace function public.rebuild_product_filter_counts_rollup()
returns table (
  rebuilt_source_rows bigint,
  rebuilt_rollup_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.product_filter_counts_source;

  insert into public.product_filter_counts_source (
    product_id,
    channel_bucket,
    category,
    subcategory,
    product_type,
    sale_type,
    updated_at
  )
  select
    p.id,
    public.product_filter_counts_channel_bucket(p.channel),
    public.product_filter_counts_normalize_text(p.category),
    public.product_filter_counts_normalize_text(p.subcategory),
    public.product_filter_counts_normalize_text(p.product_type),
    public.product_filter_counts_normalize_text(p.sale_type),
    now()
  from public.products p
  where public.product_filter_counts_is_visible(p.status, p.sold_at);

  get diagnostics rebuilt_source_rows = row_count;

  truncate table public.product_filter_counts_rollup;

  with grouped as (
    select
      'all'::text as scope_key,
      'ro'::text as channel_bucket,
      s.category,
      s.subcategory,
      s.product_type,
      s.sale_type,
      count(*)::integer as visible_count
    from public.product_filter_counts_source s
    group by 1, 2, 3, 4, 5, 6

    union all

    select
      'all'::text as scope_key,
      'executari_insolventa'::text as channel_bucket,
      s.category,
      s.subcategory,
      s.product_type,
      s.sale_type,
      count(*)::integer as visible_count
    from public.product_filter_counts_source s
    where s.channel_bucket = 'executari_insolventa'
    group by 1, 2, 3, 4, 5, 6

    union all

    select
      'live_bid'::text as scope_key,
      'ro'::text as channel_bucket,
      s.category,
      s.subcategory,
      s.product_type,
      s.sale_type,
      count(*)::integer as visible_count
    from public.product_filter_counts_source s
    where s.channel_bucket = 'ro'
    group by 1, 2, 3, 4, 5, 6

    union all

    select
      'executari'::text as scope_key,
      'executari_insolventa'::text as channel_bucket,
      s.category,
      s.subcategory,
      s.product_type,
      s.sale_type,
      count(*)::integer as visible_count
    from public.product_filter_counts_source s
    where s.channel_bucket = 'executari_insolventa'
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
  from grouped g;

  get diagnostics rebuilt_rollup_rows = row_count;

  truncate table public.product_filter_counts_dirty_groups;
  return next;
end;
$$;

comment on function public.refresh_product_filter_counts_rollup(integer) is
  'Incremental refresh for product_filter_counts_rollup. Recomputes only queued dirty groups.';

comment on function public.refresh_product_filter_counts_rollup() is
  'Incremental refresh wrapper with default batch size 500.';

comment on function public.rebuild_product_filter_counts_rollup() is
  'Full rebuild of product_filter_counts_source and product_filter_counts_rollup. Use once after deploy or for maintenance.';
