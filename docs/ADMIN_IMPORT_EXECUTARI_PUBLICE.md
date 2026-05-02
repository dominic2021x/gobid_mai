# Audit: Import Executări Publice (REPES – prod.executori.ro/repes)

**Data audit:** 2025-02-14  
**Rută Admin:** `/admin/importuri/executari-publice`

---

## 1. Overview

Importul sincronizează anunțurile de execuții publice de pe **https://prod.executori.ro/repes** în baza de date. Datele sunt stocate în `repes_listings`; produsele publicate pe site sunt în `products` (cu source/flag pentru executări publice).

**Ce face:**
- Crawl pagini de listare (SPA – folosește Puppeteer)
- Upsert în `repes_listings` (insert/update)
- Soft-delete anunțuri care nu mai apar
- Fetch detalii (descriere, PDF, imagini, vânzător)
- Sincronizare status produse publicate
- Publicare automată opțională (max 30/run, 5s delay între ele)

**Unde se vede în Admin:** `/admin/importuri` → `/admin/importuri/executari-publice` și `/admin/importuri/executari-publice/panel`.

---

## 2. Route & Entrypoints

| Fișier | Rol |
|--------|-----|
| `app/admin/importuri/executari-publice/page.tsx` | Pagina principală – sync, statistici, listă, auto-config, publish |
| `app/admin/importuri/executari-publice/panel/page.tsx` | Panel – listă cu Publică / Regenerează |
| `app/admin/layout.tsx` | Layout admin – auth guard |

**Auth guard:** Idem licitații – `supabase.auth.getSession()`, redirect la login dacă nu e sesiune.

---

## 3. UI Behavior

### 3.1 Acțiuni utilizator

| Acțiune | Endpoint | Comportament |
|---------|----------|--------------|
| **Sincronizare completă** | `POST /api/admin/sync-repes` (x-sync-stream: 1) | Stream NDJSON |
| **Verifică anunțuri noi** | `GET /api/admin/sync-repes/check-new?stream=1` | Stream log |
| **Import anunțuri noi** | `POST /api/admin/sync-repes/sync-new-only` (x-sync-stream: 1) | Stream |
| **Verificare stare** | `POST /api/admin/sync-repes/verify-status` (x-verify-stream: 1) | Stream |
| **Rulează automat** | `POST /api/admin/sync-repes/run-auto` (x-force-run: 1) | Rulează sync_new + verify_status + auto_publish (dacă config) |
| **Publică nepublicate** | `POST /api/admin/sync-repes/publish-unpublished` (x-publish-stream: 1) | Publică unul câte unul, 5s delay |
| **Auto-config** | `GET/POST /api/admin/sync-repes/auto-config` | Salvează interval_hours, sync_new, verify_status, auto_publish |
| **Extrage unul** | `POST /api/admin/sync-repes/extract-one` | Test extract |
| **Test** | `GET /api/admin/sync-repes/test` | Test conexiune |
| **Publică** | `POST /api/admin/executari-publice/publish` | body: `{ listingId }` sau `{ listingIds }` |
| **Regenerează** | `POST /api/admin/executari-publice/regenerate-product` | body: `{ listingId }` |
| **Regenerează bulk** | `POST /api/admin/executari-publice/regenerate-products` | body: `{ listingIds }` |
| **Infer categorii** | `POST /api/admin/executari-publice/infer-one-categories` | body: `{ listingId }` |
| **Complete categorii** | `POST /api/admin/executari-publice/complete-categories` | Completează categorii lipsă |
| **Extract PDF** | `POST /api/admin/executari-publice/extract-pdf` | Extrage din PDF |
| **Update listing** | `PATCH /api/admin/sync-repes/listings/[id]` | main_category, category |
| **Update product display** | `POST /api/admin/executari-publice/update-product-display` | Actualizează titlu/descriere pe produs |
| **Recreate product** | `POST /api/admin/executari-publice/recreate-product` | Recreare produs |
| **Delete** | `POST /api/admin/executari-publice/delete` | Ștergere listing |

### 3.2 Automat (run-auto)

**Configurare:** `integration_settings` (key = `repes_auto`):
- `interval_hours` (default 6)
- `sync_new` (default true)
- `verify_status` (default true)
- `auto_publish` (default false)
- `last_run_at`

**NECONFIRMAT:** UI-ul afișează „cron apelează run-auto la acest interval”, dar **nu există cron în vercel.json** pentru REPES. `run-auto` este apelat doar manual (buton „Rulează acum”) cu `x-force-run: 1`. Pentru automat real, ar trebui adăugat un cron care apelează `POST /api/admin/sync-repes/run-auto` cu `x-sync-secret`.

### 3.3 Status-uri

- Progres: phase, message, pagesCrawled, itemsFound, inserted, updated, softDeleted, detailsFetched
- Stats: total, active, deleted, withPdf, withDescription, unpublished, listed, byCounty, byMainCategory

---

## 4. Automatic Run Mechanism

| Mecanism | Locație | Frecvență |
|----------|---------|-----------|
| **run-auto** | `POST /api/admin/sync-repes/run-auto` | Config: interval_hours (DB) |
| **Cron vercel.json** | – | **Nu există** pentru REPES |

**Flow run-auto:**
1. Citește `integration_settings` (key = `repes_auto`)
2. Dacă `last_run_at + interval_hours` nu a trecut și nu e `x-force-run` → skipped
3. Apelează în ordine: `sync-new-only` → `verify-status` → (dacă auto_publish) publică până la 30 nepublicate, 5s delay

**Protecție:** Nu există lock. `last_run_at` este actualizat la final (nu la start) – deci două apeluri rapide pot rula amândouă.

---

## 5. Data Source(s)

| Parametru | Valoare |
|-----------|---------|
| **URL** | `https://prod.executori.ro/repes?pageIdx=0` (pagina 1), `?pageIdx=N` (0-based) |
| **Tip** | SPA – conținut încărcat client-side → **Puppeteer** |
| **Browser** | `puppeteer.launch({ headless: true, args: ["--no-sandbox", ...] })` |
| **Timeout** | 35_000 ms (listing), 25_000 ms (detail) |
| **Delay între pagini** | 5000 ms |
| **Delay între detalii** | 800 ms |
| **DETAIL_CONCURRENCY** | 2 |
| **MAX_PAGES_PER_RUN** | 200 |

**Fișiere:** `lib/scraper-repes/http.ts`, `lib/scraper-repes/sync.ts`, `lib/scraper-repes/parseListing.ts`, `lib/scraper-repes/parseDetail.ts`

---

## 6. Pipeline

```
1. Crawl (Puppeteer)
   - launchRepesBrowser()
   - fetchRepesListingPageWithPage(page, pageUrl) pentru fiecare pagină
   - parseRepesListingPage(html) → RepesListingCard[]
   - Map externalId → card

2. Transform → listingRows
   - source_external_id, source_url, title, price_text (formatPriceTextForDisplayEuropean)
   - location_raw, location_city, location_county (normalizeLocation)
   - last_seen_at, deleted_at = null

3. Upsert în repes_listings

4. Soft-delete (last_seen_at < crawlStartedAt)
   - syncRepesProductStatusForListings(ids, true)

5. Fetch detalii (Puppeteer sau fetch)
   - parseRepesDetailPage, update listing + imagini
```

**Deduplicare:** `source_external_id` UNIQUE.

---

## 7. Storage Model

| Tabel | Rol |
|-------|-----|
| `repes_listings` | Anunțuri importate |
| `repes_listing_images` | Imagini per listing |
| `products` | Produse publicate (product_id FK) |
| `integration_settings` | key = `repes_auto`, settings = { interval_hours, sync_new, verify_status, auto_publish, last_run_at } |

**Storage Model (Public Serving Layer):**
- Canonical serving table for public listings is `public.products`. `repes_listings` is the raw import source; publishing flows into `products`.
- Prisma model: `products` (lowercase), accessed as `prisma.products`.
- `/api/ro/listings` queries `products` only; it is separate from raw import pipelines and tables (`repes_listings`).

**Migrații:** `supabase/migrations/20260208_repes_listings.sql`, `20260226_repes_listings_pdf_urls.sql`, `20260227_repes_listings_categories.sql`, etc.

---

## 8. API Endpoints

| Method | Path | Auth | Note |
|--------|------|------|------|
| POST | `/api/admin/sync-repes` | Bearer / x-sync-secret | x-sync-stream: 1 pentru NDJSON |
| GET | `/api/admin/sync-repes/check-new` | Bearer | ?stream=1 pentru stream |
| POST | `/api/admin/sync-repes/sync-new-only` | Bearer | x-sync-stream opțional |
| POST | `/api/admin/sync-repes/verify-status` | Bearer | x-verify-stream opțional |
| POST | `/api/admin/sync-repes/run-auto` | Bearer / x-sync-secret | x-force-run: 1, ?force=1, ?only=publish |
| POST | `/api/admin/sync-repes/publish-unpublished` | Bearer | x-publish-stream: 1 |
| GET/POST | `/api/admin/sync-repes/auto-config` | Bearer | Salvează config |
| POST | `/api/admin/sync-repes/extract-one` | Bearer | Test |
| GET | `/api/admin/sync-repes/test` | Bearer | Test |
| GET | `/api/admin/sync-repes/listings` | Bearer | Query: page, limit, status, county, mainCategory, category, search, statsOnly |
| GET | `/api/admin/sync-repes/listings/[id]` | Bearer | Detaliu listing |
| PATCH | `/api/admin/sync-repes/listings/[id]` | Bearer | main_category, category |
| POST | `/api/admin/sync-repes/listings/[id]/refresh-detail` | Bearer | Re-fetch detaliu |
| POST | `/api/admin/executari-publice/publish` | Bearer | listingId sau listingIds |
| POST | `/api/admin/executari-publice/regenerate-product` | Bearer | listingId |
| POST | `/api/admin/executari-publice/regenerate-products` | Bearer | listingIds |
| POST | `/api/admin/executari-publice/infer-one-categories` | Bearer | listingId |
| POST | `/api/admin/executari-publice/complete-categories` | Bearer | - |
| POST | `/api/admin/executari-publice/extract-pdf` | Bearer | - |
| POST | `/api/admin/executari-publice/update-product-display` | Bearer | - |
| POST | `/api/admin/executari-publice/recreate-product` | Bearer | - |
| POST | `/api/admin/executari-publice/delete` | Bearer | - |

---

## 9. Logging / Monitoring

- Console: `console.error("[sync-repes]", message)`
- Run ID: Nu există
- Alerting: NECONFIRMAT

---

## 10. Security Notes

- Auth: Bearer sau `x-sync-secret` = `SYNC_SECRET`
- Același `SYNC_SECRET` ca la licitații (documentat în .env.example)
- Puppeteer: headless, no-sandbox (necesar în containere)

---

## 11. Known Issues / Tech Debt

1. **Cron lipsește** – UI spune „cron apelează run-auto” dar nu există
2. **Puppeteer** – dependență grea, poate eșua pe Vercel (limitări)
3. **maxDuration 800** – Vercel Pro, dar sync-ul poate depăși
4. **Fără lock** – run-auto poate rula concurent
5. **Fără run history** – last_run_at în settings, nu istoric complet

---

## 12. Upgrade Notes

| Obiectiv | Fișier / zonă | Modificare |
|----------|---------------|------------|
| **Cron REPES** | `vercel.json` | Adăugare `{"path":"/api/cron/sync-repes","schedule":"0 */6 * * *"}` + endpoint care apelează run-auto cu SYNC_SECRET |
| **Lock** | `app/api/admin/sync-repes/run-auto/route.ts` | Lock în DB (integration_settings sau tabel dedicat) înainte de run |
| **Run history** | Migrare + run-auto | Tabel `import_runs` cu type='repes' |
| **Puppeteer fallback** | `lib/scraper-repes/http.ts` | Fallback la fetch dacă Puppeteer eșuează (SPA poate nu funcționeze) |
| **Batch progresiv** | `lib/scraper-repes/sync.ts` | Procesare pe batch-uri, checkpoint pentru resume |
| **Observability** | sync.ts | Log structured, Sentry |
