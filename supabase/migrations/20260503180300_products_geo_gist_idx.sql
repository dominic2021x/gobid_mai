-- RO instant search — geo Phase 1.4: denormalize lat/lng from JSON + GiST for radius.
--
-- public.products does NOT have physical `lat`/`lng` columns (only `coordinates` jsonb and
-- optional `custom_fields->'coordinates'`). Match lib/geo/haversine.ts: try `coordinates`, then
-- custom_fields.coordinates; keys lat|latitude and lng|longitude|lon.

alter table public.products
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision;

comment on column public.products.geo_lat is
  'Denormalized from coordinates JSON for indexed earth_box / earth_distance (see products_set_geo_from_coordinates).';
comment on column public.products.geo_lng is
  'Denormalized from coordinates JSON for indexed earth_box / earth_distance (see products_set_geo_from_coordinates).';

create or replace function public.products_set_geo_from_coordinates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c jsonb;
  lat_s text;
  lng_s text;
  lat_n double precision;
  lng_n double precision;
begin
  new.geo_lat := null;
  new.geo_lng := null;

  if new.coordinates is not null
     and jsonb_typeof(new.coordinates) = 'object'
     and new.coordinates <> '{}'::jsonb
  then
    c := new.coordinates;
  elsif new.custom_fields is not null
    and jsonb_typeof(new.custom_fields->'coordinates') = 'object'
    and new.custom_fields->'coordinates' <> '{}'::jsonb
  then
    c := new.custom_fields->'coordinates';
  else
    return new;
  end if;

  lat_s := nullif(btrim(coalesce(c->>'lat', c->>'latitude', '')), '');
  lng_s := nullif(btrim(coalesce(c->>'lng', c->>'longitude', c->>'lon', '')), '');

  if lat_s is null or lng_s is null then
    return new;
  end if;

  begin
    lat_n := lat_s::double precision;
    lng_n := lng_s::double precision;
  exception when others then
    return new;
  end;

  if abs(lat_n) > 90 or abs(lng_n) > 180 then
    return new;
  end if;

  new.geo_lat := lat_n;
  new.geo_lng := lng_n;
  return new;
end;
$$;

drop trigger if exists products_geo_from_coordinates_biud on public.products;

create trigger products_geo_from_coordinates_biud
  before insert or update of coordinates, custom_fields on public.products
  for each row
  execute procedure public.products_set_geo_from_coordinates();

-- Batched backfill (only rows with parseable JSON). Rows without coords stay null.
do $$
declare
  batch_size constant int := 10000;
  rows_done int;
  stagnant int := 0;
begin
  loop
    with candidates as (
      select p.ctid,
        case
          when p.coordinates is not null
            and jsonb_typeof(p.coordinates) = 'object'
            and p.coordinates <> '{}'::jsonb
          then p.coordinates
          when p.custom_fields is not null
            and jsonb_typeof(p.custom_fields->'coordinates') = 'object'
            and p.custom_fields->'coordinates' <> '{}'::jsonb
          then p.custom_fields->'coordinates'
          else null::jsonb
        end as c
      from public.products p
      where p.geo_lat is null
        and p.geo_lng is null
      limit batch_size
    ),
    parsed as (
      select ctid,
        nullif(btrim(coalesce(c->>'lat', c->>'latitude', '')), '') as lat_s,
        nullif(btrim(coalesce(c->>'lng', c->>'longitude', c->>'lon', '')), '') as lng_s
      from candidates
      where c is not null
    ),
    good as (
      select ctid,
        lat_s::double precision as lat_v,
        lng_s::double precision as lng_v
      from parsed
      where lat_s is not null
        and lng_s is not null
        and lat_s ~ '^-?[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?$'
        and lng_s ~ '^-?[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?$'
    ),
    ok as (
      select ctid, lat_v, lng_v
      from good
      where abs(lat_v) <= 90 and abs(lng_v) <= 180
    )
    update public.products p
      set geo_lat = o.lat_v,
          geo_lng = o.lng_v
    from ok o
    where p.ctid = o.ctid;

    get diagnostics rows_done = row_count;
    exit when rows_done = 0 and stagnant >= 1;
    if rows_done = 0 then
      stagnant := stagnant + 1;
    else
      stagnant := 0;
    end if;
    exit when stagnant >= 2;
  end loop;
end $$;

-- GiST on denormalized columns (partial: visible feed only).
create index if not exists products_geo_gist_idx
  on public.products
  using gist (extensions.ll_to_earth(geo_lat, geo_lng))
  where geo_lat is not null
    and geo_lng is not null
    and approval_normalized = 'approved'
    and status <> 'deleted';

comment on index public.products_geo_gist_idx is
  'GiST on ll_to_earth(geo_lat, geo_lng) for approved, non-deleted listings — sargable for earth_box.';
