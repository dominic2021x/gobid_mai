-- Follow-up for the remaining database-side Security Advisor warnings:
-- - extension_in_public: vector, pg_trgm, unaccent
-- - public_bucket_allows_listing: auction-images
--
-- Auth leaked-password protection is an Auth setting and must be enabled from
-- the Supabase Dashboard.

create schema if not exists extensions;

grant usage on schema extensions to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter extension vector set schema extensions';
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'alter extension pg_trgm set schema extensions';
  end if;

  if exists (select 1 from pg_extension where extname = 'unaccent') then
    execute 'alter extension unaccent set schema extensions';
  end if;
end $$;

grant execute on all functions in schema extensions to anon, authenticated, service_role;

-- Keep legacy functions that explicitly call public.unaccent(...) working after
-- the extension moves to the dedicated extensions schema.
create or replace function public.unaccent(input text)
returns text
language sql
stable
parallel safe
set search_path = extensions, pg_temp
as $$
  select extensions.unaccent(input);
$$;

create or replace function public.unaccent(dict regdictionary, input text)
returns text
language sql
stable
parallel safe
set search_path = extensions, pg_temp
as $$
  select extensions.unaccent(dict, input);
$$;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', fn.signature);
  end loop;
end $$;

-- Public buckets can serve direct public URLs without a broad storage.objects
-- SELECT policy. Dropping this removes object listing for anonymous clients.
drop policy if exists "Auction images read public" on storage.objects;
