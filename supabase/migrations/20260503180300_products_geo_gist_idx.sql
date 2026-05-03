-- RO instant search — geo Phase 1.4: denormalize lat/lng from JSON + ro_localities + GiST.
--
-- public.products has coordinates in `coordinates` jsonb and optional `custom_fields->'coordinates'`.
-- Third source: `ro_localities` by city_norm (and county_norm tie-breaker) so listings with only
-- `city`/`county` text still get geo_lat/geo_lng for distance sort.

alter table public.products
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision;

comment on column public.products.geo_lat is
  'Denormalized: coordinates JSON, custom_fields.coordinates, or ro_localities lookup (products_set_geo_from_coordinates).';
comment on column public.products.geo_lng is
  'Denormalized: coordinates JSON, custom_fields.coordinates, or ro_localities lookup (products_set_geo_from_coordinates).';

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
  loc_lat double precision;
  loc_lng double precision;
begin
  new.geo_lat := null;
  new.geo_lng := null;

  -- 1) Primary: coordinates jsonb
  if new.coordinates is not null
     and jsonb_typeof(new.coordinates) = 'object'
     and new.coordinates <> '{}'::jsonb
  then
    c := new.coordinates;
    lat_s := nullif(btrim(coalesce(c->>'lat', c->>'latitude', '')), '');
    lng_s := nullif(btrim(coalesce(c->>'lng', c->>'longitude', c->>'lon', '')), '');
    if lat_s is not null and lng_s is not null then
      begin
        lat_n := lat_s::double precision;
        lng_n := lng_s::double precision;
        if abs(lat_n) <= 90 and abs(lng_n) <= 180 then
          new.geo_lat := lat_n;
          new.geo_lng := lng_n;
          return new;
        end if;
      exception when others then
        null;
      end;
    end if;
  end if;

  -- 2) Fallback: custom_fields->coordinates
  if new.custom_fields is not null
     and jsonb_typeof(new.custom_fields->'coordinates') = 'object'
     and new.custom_fields->'coordinates' <> '{}'::jsonb
  then
    c := new.custom_fields->'coordinates';
    lat_s := nullif(btrim(coalesce(c->>'lat', c->>'latitude', '')), '');
    lng_s := nullif(btrim(coalesce(c->>'lng', c->>'longitude', c->>'lon', '')), '');
    if lat_s is not null and lng_s is not null then
      begin
        lat_n := lat_s::double precision;
        lng_n := lng_s::double precision;
        if abs(lat_n) <= 90 and abs(lng_n) <= 180 then
          new.geo_lat := lat_n;
          new.geo_lng := lng_n;
          return new;
        end if;
      exception when others then
        null;
      end;
    end if;
  end if;

  -- 3) ro_localities (city + optional county match)
  if new.city is not null and length(btrim(new.city)) > 0 then
    select rl.latitude, rl.longitude
      into loc_lat, loc_lng
    from public.ro_localities rl
    where rl.city_norm = lower(unaccent(btrim(new.city)))
    order by case
        when new.county is not null and length(btrim(new.county)) > 0
          and rl.county_norm = lower(unaccent(btrim(new.county)))
        then 0
        else 1
      end,
      rl.city_name asc
    limit 1;
    if loc_lat is not null and loc_lng is not null
       and abs(loc_lat) <= 90 and abs(loc_lng) <= 180
    then
      new.geo_lat := loc_lat;
      new.geo_lng := loc_lng;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_geo_from_coordinates_biud on public.products;

create trigger products_geo_from_coordinates_biud
  before insert or update of coordinates, custom_fields, city, county on public.products
  for each row
  execute procedure public.products_set_geo_from_coordinates();

-- Pass 1: backfill from JSON only (batched).
do $$
declare
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
      limit 10000
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

-- Pass 2: backfill from ro_localities for rows with city text but still no geo (batched).
do $$
declare
  rows_done int;
  stagnant int := 0;
begin
  loop
    with batch as (
      select p.id, p.city, p.county
      from public.products p
      where p.geo_lat is null
        and p.geo_lng is null
        and nullif(btrim(p.city), '') is not null
      limit 10000
    ),
    matched as (
      select b.id, loc.latitude as lat_v, loc.longitude as lng_v
      from batch b
      cross join lateral (
        select rl.latitude, rl.longitude
        from public.ro_localities rl
        where rl.city_norm = lower(unaccent(btrim(b.city)))
        order by case
            when nullif(btrim(b.county), '') is not null
              and rl.county_norm = lower(unaccent(btrim(b.county)))
            then 0
            else 1
          end,
          rl.city_name asc
        limit 1
      ) loc
      where loc.latitude is not null
        and loc.longitude is not null
        and abs(loc.latitude) <= 90
        and abs(loc.longitude) <= 180
    )
    update public.products p
      set geo_lat = m.lat_v,
          geo_lng = m.lng_v
    from matched m
    where p.id = m.id;

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

create index if not exists products_geo_gist_idx
  on public.products
  using gist (extensions.ll_to_earth(geo_lat, geo_lng))
  where geo_lat is not null
    and geo_lng is not null
    and approval_normalized = 'approved'
    and status <> 'deleted';

comment on index public.products_geo_gist_idx is
  'GiST on ll_to_earth(geo_lat, geo_lng) for approved, non-deleted listings — sargable for earth_box.';
