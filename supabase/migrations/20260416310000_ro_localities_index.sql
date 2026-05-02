-- Romanian localities index for intent parser (server-side cache, no runtime file parsing).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.ro_localities_set_norms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.city_norm := CASE
    WHEN NEW.city_name IS NULL THEN NULL
    ELSE lower(unaccent(NEW.city_name))
  END;
  NEW.county_norm := CASE
    WHEN NEW.county_name IS NULL THEN NULL
    ELSE lower(unaccent(NEW.county_name))
  END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.ro_localities (
  id bigserial PRIMARY KEY,
  county_id integer,
  county_name text,
  county_norm text,
  city_name text NOT NULL,
  city_norm text,
  siruta bigint,
  latitude double precision,
  longitude double precision,
  source text NOT NULL DEFAULT 'judete-orase.sql',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ro_localities_city_not_empty CHECK (length(btrim(city_name)) > 0),
  CONSTRAINT ro_localities_unique_city_county UNIQUE (city_name, county_name)
);

COMMENT ON TABLE public.ro_localities IS
  'Romanian localities imported from judete-orase.sql, used for fast intent city/county detection.';

DROP TRIGGER IF EXISTS ro_localities_set_norms_trg ON public.ro_localities;
CREATE TRIGGER ro_localities_set_norms_trg
  BEFORE INSERT OR UPDATE OF city_name, county_name
  ON public.ro_localities
  FOR EACH ROW
  EXECUTE FUNCTION public.ro_localities_set_norms();

-- Skip full-table backfill and index creation during migration push.
