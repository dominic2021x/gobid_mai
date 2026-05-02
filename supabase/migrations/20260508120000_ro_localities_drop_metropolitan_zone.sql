-- Elimină din indexul de localități intrările „Zona Metropolitană …” (agregări OSM/nominatim),
-- ca să nu mai apară la autocomplete / locații.

create extension if not exists unaccent;

delete from public.ro_localities
where lower(unaccent(coalesce(city_name, ''))) like '%zona metropolitana%'
   or lower(unaccent(coalesce(county_name, ''))) like '%zona metropolitana%';
