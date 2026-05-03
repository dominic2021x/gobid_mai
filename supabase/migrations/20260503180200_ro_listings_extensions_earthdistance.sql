-- RO instant search — geo Phase 1.3: enable cube + earthdistance for indexed radius search.
--
-- Both extensions are supported on Supabase managed Postgres. They MUST be installed in the
-- "extensions" schema so PostgREST/SQL functions can resolve them. Functions/operators are
-- referenced as extensions.ll_to_earth(...), extensions.earth_box(...), extensions.earth_distance(...).
-- earthdistance depends on cube; create cube first.

create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;
