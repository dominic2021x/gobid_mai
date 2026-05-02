# Audit: Import Licitatii Publice (licitatii-insolventa.ro)

**Data audit:** 2025-02-14  
**Rută Admin:** `/admin/importuri/licitatii-publice`

---

## 1. Overview

Importul sincronizează anunțurile de licitații de pe **https://www.licitatii-insolventa.ro/cauta** în baza de date. Datele sunt stocate în `licitatii_insolventa_listings`; produsele publicate pe site sunt în `products` (cu `product_type = 'licitatii-publice'`).

**Ce face:**
- Crawl pagini de listare (`/cauta`, `/cauta/iPage,N`)
- Upsert în `licitatii_insolventa_listings` (insert/update)
- Soft-delete anunțuri care nu mai apar pe site
- Fetch detalii (descriere, PDF, imagini, vânzător) pentru anunțuri
- Sincronizare status produse publicate (deleted → product status 'in_progress')

**Unde se vede în Admin:** `/admin/importuri` (hub) → `/admin/importuri/licitatii-publice` (pagina principală) și `/admin/importuri/licitatii-publice/panel` (tab „Toate anunțurile” / „Listate pe site”).

---

## 2. Route & Entrypoints

| Fișier | Rol |
|--------|-----|
| `app/admin/importuri/licitatii-publice/page.tsx` | Pagina principală – sincronizare, statistici, listă, acțiuni bulk |
| `app/admin/importuri/licitatii-publice/panel/page.tsx` | Panel alternativ – 2 taburi (Toate / Listate pe site), paginare 50 |
| `app/admin/layout.tsx` | Layout admin – auth guard (redirect la `/admin/login` dacă nu e sesiune) |

**Router:** Next.js App Router. Ruta `/admin/importuri/licitatii-publice` este definită implicit.

**Auth guard:** `app/admin/layout.tsx` – verifică `supabase.auth.getSession()`. Dacă `!sessionUser`, redirect la `/admin/login`. Nu există verificare explicită `is_admin` în layout – orice utilizator autentificat poate accesa. **NECONFIRMAT:** Verificarea `is_admin` se face la nivel de API (Bearer token + `user_profiles.is_admin` sau `user_metadata.is_admin`).

---

## 3. UI Behavior

### 3.1 Acțiuni utilizator

| Acțiune | Buton / UI | Endpoint | Comportament |
|---------|------------|----------|--------------|
| **Sincronizare completă** | „Sincronizează” | `POST /api/admin/sync-licitatii` (x-sync-stream: 1) | Stream NDJSON, progres live |
| **Verifică anunțuri noi** | „Verifică anunțuri noi” | `GET /api/admin/sync-licitatii/check-new` | Afișează totalOnPage, existingCount, newCount |
| **Import doar noi** | „Import anunțuri noi” | `POST /api/admin/sync-licitatii/sync-new-only` | Inserează doar anunțurile noi |
| **Verificare stare** | „Verifică stare” | `POST /api/admin/sync-licitatii/verify-status` | Soft-delete/reactivate pe baza crawl-ului |
| **Șterge dezactivate** | Modal confirm | `POST /api/admin/sync-licitatii/listings/delete-deactivated` | Ștergere fizică (hard delete) |
| **Sincronizare titluri** | Bulk | `POST /api/admin/sync-licitatii/listings/sync-all-titles` | Actualizează titlurile |
| **Sincronizare descrieri** | Bulk | `POST /api/admin/sync-licitatii/listings/sync-all-descriptions` | Fetch descrieri |
| **Sincronizare PDF-uri** | Bulk | `POST /api/admin/sync-licitatii/listings/sync-all-pdfs` | Fetch PDF-uri |
| **Sincronizare data/oră** | Bulk | `POST /api/admin/sync-licitatii/listings/sync-all-data-ora-2` | Actualizează data/oră licitație |
| **Sincronizare vânzător** | Bulk | `POST /api/admin/sync-licitatii/listings/sync-all-seller` | Fetch detalii vânzător |
| **Actualizare prețuri** | Bulk | `POST /api/admin/licitatii-insolventa/refresh-prices` | Refresh prețuri de pe site |
| **Bulk status** | Dezactivează/Reactivează | `POST /api/admin/sync-licitatii/listings/bulk-status` | Body: `{ ids, deleted }` |
| **Publică pe site** | Per item / bulk | `POST /api/admin/licitatii-insolventa/publish` | Creează/actualizează produs în `products` |
| **Regenerează produs** | Per item | `POST /api/admin/licitatii-insolventa/regenerate-product` | Regenerare produs din listing |
| **Refresh detail** | Per item | `POST /api/admin/sync-licitatii/listings/[id]/refresh-detail` | Re-fetch detaliu (ex. seller) |

### 3.2 Automat (client-side)

| Opțiune | localStorage key | Comportament |
|---------|------------------|--------------|
| **Verifică anunțuri noi** | `licitatii_auto_verify` | setInterval (1–24h) → `check-new` → dacă newCount > 0 și `licitatii_auto_add_new` → `sync-new-only` |
| **Adaugă automat noi** | `licitatii_auto_add_new` | Trigger în runAutoCheck când newCount > 0 |
| **Verificare stare** | `licitatii_auto_verify_status` | setInterval (1–24h) → `verify-status` |

**Important:** Aceste intervale rulează **doar când tab-ul Admin este deschis** pe pagina licitatii-publice. Nu există cron server-side pentru acest import.

### 3.3 Status-uri afișate

- **Progres live:** phase, message, pagesCrawled, itemsFound, inserted, updated, softDeleted, detailsFetched
- **Statistici:** total, active, deleted, withPdf, withDescription, withoutDescription, withoutAuctionDate, withoutTitle, withoutCounty, byCounty, byCategory, byMainCategory
- **Listă:** statusFilter (active | deleted | all | reactivated), paginare 50, sortare (newest, oldest, price_asc, price_desc)

### 3.4 Log-uri / erori

- Erori în `lastSummary.errors` (array)
- Mesaje toast: `setMessage({ type: "success" | "error", text })`
- Log live în `liveProgress` (stream NDJSON)

---

## 4. Automatic Run Mechanism

**NECONFIRMAT:** Nu există cron în `vercel.json` pentru sync-licitatii.

| Mecanism | Locație | Frecvență |
|----------|---------|-----------|
| **Client setInterval** | `app/admin/importuri/licitatii-publice/page.tsx` (useEffect) | 1–24h (configurabil, localStorage) |
| **Cron server** | – | **Nu există** |

**Configurare:** localStorage: `licitatii_auto_verify`, `licitatii_auto_verify_hours`, `licitatii_auto_add_new`, `licitatii_auto_verify_status`, `licitatii_auto_verify_status_hours`.

**Protecție rulare simultană:** Nu există lock. Dacă utilizatorul deschide mai multe tab-uri sau pornește manual sync în timp ce auto rulează, pot rula concurent.

---

## 5. Data Source(s)

| Parametru | Valoare |
|-----------|---------|
| **URL listare** | `https://www.licitatii-insolventa.ro/cauta` (pagina 1), `https://www.licitatii-insolventa.ro/cauta/iPage,{N}` (pagina N) |
| **Metodă** | GET (fetch HTML) |
| **User-Agent** | `process.env.SCRAPER_USER_AGENT` sau Chrome 120 |
| **Headers** | Accept, Accept-Language (ro), Accept-Encoding (gzip), Referer |
| **Timeout** | 25_000 ms |
| **Retries** | 3, backoff exponențial (1s, 2s, 4s) |
| **Delay între pagini** | 1200 ms |
| **Delay între detalii** | 1000 ms |
| **Concurrency detalii** | 1 (p-limit) |
| **Max pagini/run** | 500 |

**Fișiere:** `lib/scraper/http.ts`, `lib/scraper/sync.ts`, `lib/scraper/parseListing.ts`, `lib/scraper/parseDetail.ts`

---

## 6. Pipeline

```
1. Crawl listare
   - fetchHtml(pageUrl) pentru fiecare pagină
   - parseListingPage(html) → ListingCard[]
   - Map externalId → card (dedupe)
   - MAX_PAGES_PER_RUN = 500

2. Transform → listingRows
   - source_external_id, source_url, title, price_text, category
   - location_raw, location_city, location_county (normalizeLocation)
   - last_seen_at = crawlStartedAt, deleted_at = null

3. Upsert
   - Pentru fiecare row: select by source_external_id
   - Existent → update (source_url, title, price_text, category, location_*, last_seen_at)
   - Nou → insert

4. Soft-delete
   - Select unde last_seen_at < crawlStartedAt AND deleted_at IS NULL
   - Update deleted_at = crawlStartedAt
   - syncProductStatusForListings(ids, true) → products.status = 'in_progress'

5. Fetch detalii
   - Filtru: pdf_url null SAU description_html null SAU updated_at < cutoff SAU câmpuri auto/imobiliare lipsă
   - DETAIL_CONCURRENCY = 1, DETAIL_REFRESH_HOURS = 24
   - parseDetailPage(html) → buildDetailUpdatePayload
   - Update listing + șterge/inserează imagini (licitatii_insolventa_listing_images)
```

**Deduplicare:** `source_external_id` UNIQUE. Upsert pe acest câmp.

**Validări:** Nu există validare explicită de câmpuri obligatorii la insert. Erori la fetch sunt adăugate în `summary.errors`.

---

## 7. Storage Model

| Tabel | Rol |
|-------|-----|
| `licitatii_insolventa_listings` | Anunțuri importate (sursa de adevăr) |
| `licitatii_insolventa_listing_images` | Imagini per listing |
| `products` | Produse publicate pe site (product_id FK din listings) |

**Storage Model (Public Serving Layer):**
- Canonical serving table for public listings is `public.products`.
- Prisma model: `products` (lowercase), accessed as `prisma.products`.
- `/api/ro/listings` queries `products` only; it is separate from raw import pipelines and tables (`licitatii_insolventa_listings`).

**Cheie unică:** `source_external_id` (UNIQUE).

**Soft delete:** `deleted_at` (timestamp). `reactivated_at` pentru anunțuri reactivate.

**Run history:** Nu există tabel dedicat. Ultimul rezultat este în state-ul UI (`lastSummary`).

---

## 8. API Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| POST | `/api/admin/sync-licitatii` | Bearer sau x-sync-secret | Headers: x-sync-stream (optional) | JSON sau NDJSON stream |
| GET | `/api/admin/sync-licitatii/check-new` | Bearer | - | `{ success, totalOnPage, existingCount, newCount }` |
| POST | `/api/admin/sync-licitatii/sync-new-only` | Bearer | - | `{ success, inserted, failed, errors }` |
| POST | `/api/admin/sync-licitatii/verify-status` | Bearer | body: `{ listingIds? }` | `{ success, summary }` |
| GET | `/api/admin/sync-licitatii/listings` | Bearer | Query: page, limit, status, county, category, ... | `{ success, listings, totalCount, stats? }` |
| GET | `/api/admin/sync-licitatii/listings/[id]` | Bearer | - | `{ success, listing }` |
| POST | `/api/admin/sync-licitatii/listings/[id]/refresh-detail` | Bearer | body: `{ only?: "seller" }` | `{ success }` |
| POST | `/api/admin/sync-licitatii/listings/bulk-status` | Bearer | body: `{ ids, deleted }` | `{ success }` |
| POST | `/api/admin/sync-licitatii/listings/delete-deactivated` | Bearer | - | `{ success, deleted }` |
| POST | `/api/admin/sync-licitatii/listings/sync-all-titles` | Bearer | - | `{ success, ... }` |
| POST | `/api/admin/sync-licitatii/listings/sync-all-descriptions` | Bearer | - | `{ success, ... }` |
| POST | `/api/admin/sync-licitatii/listings/sync-all-pdfs` | Bearer | - | `{ success, ... }` |
| POST | `/api/admin/sync-licitatii/listings/sync-all-data-ora-2` | Bearer | - | `{ success, ... }` |
| POST | `/api/admin/sync-licitatii/listings/sync-all-seller` | Bearer | - | `{ success, ... }` |
| POST | `/api/admin/licitatii-insolventa/publish` | Bearer | body: `{ listingId }` sau `{ listingIds }` | `{ success, results }` |
| POST | `/api/admin/licitatii-insolventa/regenerate-product` | Bearer | body: `{ productId }` | `{ success }` |
| POST | `/api/admin/licitatii-insolventa/regenerate-products` | Bearer | body: `{ productIds }` | `{ success, regenerated }` |
| POST | `/api/admin/licitatii-insolventa/refresh-prices` | Bearer | body: `{ listingIds?, ... }` | `{ success, ... }` |
| GET | `/api/admin/sync-licitatii/test` | Bearer | - | `{ success, message }` |

---

## 9. Logging / Monitoring

- **Console:** `console.error("[sync-licitatii]", message)` la eroare
- **Sentry/Datadog:** NECONFIRMAT – nu am găsit integrare explicită
- **Run ID:** Nu există. Log-urile sunt în memorie (stream) și în `summary.errors`
- **Alerting:** NECONFIRMAT – nu există notificări la fail

---

## 10. Security Notes

- **Auth API:** Bearer token (Supabase session) sau `x-sync-secret` = `process.env.SYNC_SECRET`
- **Admin check:** `user_profiles.is_admin` sau `user_metadata.is_admin` / `app_metadata.is_admin`
- **CSRF:** Nu există protecție CSRF explicită (Next.js API routes)
- **Rate limit:** Nu există
- **Credențiale:** `SYNC_SECRET`, `SCRAPER_USER_AGENT` din `.env`

---

## 11. Known Issues / Tech Debt

1. **Fără cron server-side** – automatul rulează doar când tab-ul e deschis
2. **Fără lock** – rulări simultane posibile
3. **Fără run history** – nu există istoric runs în DB
4. **Admin layout** – orice user autentificat vede admin; verificarea e doar la API
5. **Fără stop/cancel** – sync-ul rulează până la final

---

## 12. Upgrade Notes

| Obiectiv | Fișier / zonă | Modificare |
|----------|---------------|------------|
| **Cron server** | `vercel.json` | Adăugare `{"path":"/api/cron/sync-licitatii","schedule":"0 */6 * * *"}` + endpoint GET care apelează sync cu SYNC_SECRET |
| **Lock / idempotency** | `lib/scraper/sync.ts` | Adăugare lock în DB (ex. `import_runs` cu status running) sau Redis |
| **Run history** | Migrare + `lib/scraper/sync.ts` | Tabel `import_runs` (id, type, started_at, finished_at, summary jsonb, status) |
| **Stop/cancel** | `lib/scraper/sync.ts` | AbortController + check periodic în loop |
| **Retry/backoff** | `lib/scraper/http.ts` | Deja există (3 retries, backoff) – poate crește MAX_RETRIES |
| **Observability** | `lib/scraper/sync.ts` | Log structured (run_id, phase, counts) către Sentry/logger |
| **Batch progresiv** | `lib/scraper/sync.ts` | Procesare pe batch-uri (ex. 50) cu yield/checkpoint pentru resume |
