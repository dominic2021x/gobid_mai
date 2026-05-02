-- pg_stat_statements: slow PostgREST shape — OR(city ilike, county ilike) + sort.
-- Single trigram column replaces BitmapOr between two GINs.
--
-- GENERATED STORED was rejected on managed PG (42P17: expr not immutable — collation on text/btrim).
-- Plain column + trigger + one-time backfill.

create extension if not exists pg_trgm;

alter table public.products
  add column if not exists locality_search text;

comment on column public.products.locality_search is
  'city + county pentru filtru unic ILIKE (înlocuiește OR city/county în PostgREST).';

create or replace function public.products_set_locality_search()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.locality_search := btrim(
    concat_ws(
      ' ',
      nullif(btrim(coalesce(new.city, '')), ''),
      nullif(btrim(coalesce(new.county, '')), '')
    )
  );
  return new;
end;
$$;

drop trigger if exists products_locality_search_biud on public.products;

create trigger products_locality_search_biud
  before insert or update of city, county on public.products
  for each row
  execute procedure public.products_set_locality_search();

update public.products
set locality_search = btrim(
  concat_ws(
    ' ',
    nullif(btrim(coalesce(city, '')), ''),
    nullif(btrim(coalesce(county, '')), '')
  )
)
where locality_search is distinct from btrim(
  concat_ws(
    ' ',
    nullif(btrim(coalesce(city, '')), ''),
    nullif(btrim(coalesce(county, '')), '')
  )
);

create index if not exists products_locality_search_trgm_hot_idx
  on public.products using gin (locality_search extensions.gin_trgm_ops)
  where status is distinct from 'deleted'
    and locality_search is not null
    and locality_search <> '';
