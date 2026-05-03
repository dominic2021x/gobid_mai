-- RO instant search foundation — Phase 1.1: approval_normalized as a PLAIN column.
--
-- IMPORTANT: previous version used `generated always as (...) STORED` which forces a full table
-- rewrite and on hosted Postgres failed with SQLSTATE 53100 (could not resize shared memory segment).
-- We now use a plain text column + BIU trigger + batched backfill — no rewrite, low memory.

alter table public.products
  add column if not exists approval_normalized text;

comment on column public.products.approval_normalized is
  'Lower-cardinality, NOT NULL-after-trigger mirror of approval_status (defaulting to approved). Indexable for /ro feed.';

create or replace function public.products_set_approval_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.approval_normalized := coalesce(new.approval_status, 'approved');
  return new;
end;
$$;

drop trigger if exists products_approval_normalized_biu on public.products;

create trigger products_approval_normalized_biu
  before insert or update of approval_status on public.products
  for each row
  execute procedure public.products_set_approval_normalized();

-- Batched backfill (10k rows / iteration) to avoid one giant UPDATE that can blow out shared memory.
-- Tagged via a temporary column flag; uses ctid range to walk the heap deterministically.
do $$
declare
  batch_size constant int := 10000;
  rows_done int := 0;
  total_done bigint := 0;
begin
  loop
    with cte as (
      select ctid
      from public.products
      where approval_normalized is null
      limit batch_size
      for update skip locked
    )
    update public.products p
      set approval_normalized = coalesce(p.approval_status, 'approved')
    from cte
    where p.ctid = cte.ctid;

    get diagnostics rows_done = row_count;
    total_done := total_done + rows_done;
    exit when rows_done = 0;
  end loop;
  raise notice 'approval_normalized backfilled rows: %', total_done;
end $$;

-- Helper used by the estimate RPC (Phase 1.5).
create or replace function public.products_table_reltuples_estimate()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(0, round(c.reltuples))::bigint
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'products'
    and c.relkind = 'r'
  limit 1
$$;

comment on function public.products_table_reltuples_estimate() is
  'Rough row count for public.products from pg_class.reltuples (catalog estimate).';

grant execute on function public.products_table_reltuples_estimate() to anon, authenticated, service_role;
