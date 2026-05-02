# Site Health Monitor

Sistem automat de healthcheck care rulează prin Vercel Cron, salvează rezultatele în Supabase și expune un panou admin.

## Ce este implementat

- **Cron**: două rulări zilnice (00:05 UTC și 01:05 UTC) – doar una va fi 03:xx în Europe/Bucharest (DST safe).
- **Runner**: `GET /api/cron/healthcheck` – autentificare `Authorization: Bearer ${CRON_SECRET}`, rulează doar la ora 03 în București, daily lock (o singură rulare per zi).
- **Checks**: pagini (/, /licitatii, /search), API (exchange-rate, search/suggestions, search/results), Supabase (select pe products limit 1).
- **Sugestii**: generate după reguli (timeout, http_5xx, http_404, db_error, json_parse etc.) – fără AI.
- **Persistență**: tabele `healthcheck_runs`, `healthcheck_checks`, `healthcheck_incidents` în Supabase.
- **Admin UI**: `/admin/healthchecks` (listă rulări, filtre, sumar) și `/admin/healthchecks/[runId]` (detalii, checks eșuate, Action items, snippet/error modal).
- **Admin API**: `GET /api/admin/healthchecks/runs`, `GET /api/admin/healthchecks/run/[id]`, `POST /api/admin/healthchecks/trigger`, `GET/PATCH /api/admin/healthchecks/settings` – protejate cu session Supabase (admin/manager).
- **Scanare manuală**: buton „Scanează acum” în panou; verifică încărcarea site-ului (prag configurat); dacă trafic ridicat returnează 503 cu sugestie de amânare 20–40 min.
- **Automatizare**: switch „Scanare automată”, fereastră orară preferată (ex. 03:00–05:00), prag răspuns (ms). Cron-ul la 03:00, dacă automatizarea e activă, verifică încărcarea înainte de scanare; dacă e ridicată, sare peste rulare (fără crash).

## Pași obligatorii

1. **Migrări Supabase**  
   Rulează în ordine:
   - `supabase/migrations/20260210_healthcheck_tables.sql`
   - `supabase/migrations/20260210_healthcheck_settings_and_source.sql` (adaugă `healthcheck_settings`, coloana `source` pe `healthcheck_runs`, elimină UNIQUE pe `run_date`).
   Din Supabase Dashboard → SQL Editor: copiază conținutul fiecărui fișier și execută.

2. **Variabile de mediu (Vercel / .env.local)**  
   - `CRON_SECRET` – folosit de Vercel Cron pentru a apela `/api/cron/healthcheck`
   - `NEXT_PUBLIC_SITE_URL` – URL-ul public al site-ului (ex. https://gobid.ro)
   - `SUPABASE_SERVICE_ROLE_KEY` – pentru inserare/citire healthcheck în Supabase
   - `NEXT_PUBLIC_SUPABASE_URL` – folosit de client; runner-ul folosește service role

După deploy, cron-urile vor apela automat endpoint-ul; rezultatele apar în **Admin → Healthchecks**.

## Testare manuală

- **Cron (local)**:  
  ```bash
  curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/healthcheck"
  ```
  Răspunsul va fi `skipped: true, reason: "not_03_xx_bucharest"` dacă ora locală nu e 03:xx București. Pentru a rula oricum în dev, poți temporar comenta verificarea orei în `app/api/cron/healthcheck/route.ts`.

- **Admin**: autentificare în panou cu cont admin, apoi acces la **Healthchecks** din meniu. Lista se populează după prima rulare reală (03:xx București) sau după ce ai rulat manual cu ora modificată.
