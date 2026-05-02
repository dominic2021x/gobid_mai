# Audit: Elemente Shared – Importuri Admin (Licitatii + Executări)

**Data audit:** 2025-02-14

Acest document descrie componentele și pattern-urile comune între importurile **Licitatii publice** și **Executări publice**.

---

## Operational note: Prisma CLI and DATABASE_URL

Prisma uses `process.env.DATABASE_URL` at runtime. Node's default dotenv behavior loads `.env` only, not `.env.local`. If `.env.local` contains the correct Supabase DB URL, Prisma CLI may use a different (or missing) `DATABASE_URL`.

**Mitigation options:**
1. Explicitly load `.env.local` before Prisma (e.g. in `prisma.config.ts` or a wrapper script) with `override: true`.
2. Set `DATABASE_URL` in the shell before running `npx prisma ...`.
3. Remove or avoid conflicting `DATABASE_URL` in `.env` so the intended source wins.

---

## 1. Auth Pattern (API)

Ambele module folosesc același pattern de autorizare:

```typescript
// app/api/admin/sync-licitatii/route.ts
// app/api/admin/sync-repes/route.ts
// app/api/admin/sync-repes/run-auto/route.ts

const secret = request.headers.get("x-sync-secret");
const envSecret = process.env.SYNC_SECRET;
const authHeader = request.headers.get("authorization");

let allowed = false;
if (envSecret && secret === envSecret) {
  allowed = true;  // Pentru cron / scripturi externe
} else if (authHeader?.startsWith("Bearer ")) {
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (await isAdminUser(user)) allowed = true;
}
if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**isAdminUser:** `user_profiles.is_admin` SAU `user_metadata.is_admin` SAU `app_metadata.is_admin`.

---

## 2. Variabile de mediu

| Variabilă | Folosire | Fișier .env.example |
|-----------|----------|---------------------|
| `SYNC_SECRET` | Header `x-sync-secret` pentru cron/scripturi | Da |
| `SCRAPER_USER_AGENT` | User-Agent la fetch (opțional) | Comentat |
| `SUPABASE_SERVICE_ROLE_KEY` | supabaseAdmin pentru DB | Da |

**Diferențe env:** Nu există variabile diferite pentru local/staging/prod – același `SYNC_SECRET` pe toate mediile (valoarea diferă, dar numele e același).

---

## 3. Stream NDJSON

Ambele sync-uri principale suportă răspuns streamat:

- **Header:** `x-sync-stream: 1`
- **Content-Type:** `application/x-ndjson; charset=utf-8`
- **Format:** o linie JSON per obiect, `\n` separator
- **Tipuri:** `{ type: "progress", phase, message, ... }`, `{ type: "done", success, summary?, error? }`

**Exemplu consum (UI):**
```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const data = JSON.parse(line.trim());
    if (data.type === "progress") setLiveProgress(data);
    else if (data.type === "done") { /* finalizare */ break; }
  }
}
```

---

## 4. Structură SyncSummary

Ambele returnează același tip de summary:

```typescript
interface SyncSummary {
  pagesCrawled: number;
  itemsFound: number;
  inserted: number;
  updated: number;
  softDeleted: number;
  detailsFetched: number;
  errors: string[];
}
```

**Tip:** `lib/scraper/types.ts` (licitatii), `lib/scraper-repes` importă din `lib/scraper/types.ts` sau definește local.

---

## 5. Pipeline comun (conceptual)

| Pas | Licitatii | Executari |
|-----|-----------|-----------|
| 1. Crawl | fetchHtml (native fetch) | Puppeteer (SPA) |
| 2. Parse listare | parseListingPage | parseRepesListingPage |
| 3. Transform | normalizeLocation, map cards | idem |
| 4. Upsert | source_external_id UNIQUE | idem |
| 5. Soft-delete | last_seen_at < crawlStartedAt | idem |
| 6. Sync products | syncProductStatusForListings | syncRepesProductStatusForListings |
| 7. Fetch detalii | parseDetailPage, buildDetailUpdatePayload | parseRepesDetailPage |

---

## 6. Tabele și pattern DB

| Concept | Licitatii | Executari |
|---------|-----------|-----------|
| **Listings** | licitatii_insolventa_listings | repes_listings |
| **Images** | licitatii_insolventa_listing_images | repes_listing_images |
| **FK produs** | product_id → products | product_id → products |
| **Soft delete** | deleted_at | deleted_at |
| **Reactivare** | reactivated_at | reactivated_at |
| **Cheie unică** | source_external_id | source_external_id |

---

## 7. Lib shared

| Fișier | Folosit de |
|--------|------------|
| `lib/licitatii-price.ts` | Ambele (formatPriceTextForDisplay, formatPriceTextForDisplayEuropean) |
| `lib/supabase.ts` | Ambele (supabaseAdmin) |
| `lib/licitatii-insolventa-sync-products.ts` | Licitatii (sync status products) |
| `lib/repes-sync-products.ts` | Executari (sync status products) |
| `lib/data/ro-categories.ts` | Ambele (categorii, subcategorii) |

---

## 8. API structure comună

| Pattern | Licitatii | Executari |
|---------|-----------|-----------|
| **Sync principal** | POST /api/admin/sync-licitatii | POST /api/admin/sync-repes |
| **Listings** | GET /api/admin/sync-licitatii/listings | GET /api/admin/sync-repes/listings |
| **Listing by ID** | GET /api/admin/sync-licitatii/listings/[id] | GET /api/admin/sync-repes/listings/[id] |
| **Check new** | GET /api/admin/sync-licitatii/check-new | GET /api/admin/sync-repes/check-new |
| **Sync new only** | POST /api/admin/sync-licitatii/sync-new-only | POST /api/admin/sync-repes/sync-new-only |
| **Verify status** | POST /api/admin/sync-licitatii/verify-status | POST /api/admin/sync-repes/verify-status |
| **Publish** | POST /api/admin/licitatii-insolventa/publish | POST /api/admin/executari-publice/publish |
| **Regenerate** | POST /api/admin/licitatii-insolventa/regenerate-product | POST /api/admin/executari-publice/regenerate-product |
| **Test** | GET /api/admin/sync-licitatii/test | GET /api/admin/sync-repes/test |

---

## 9. Upgrade notes (shared)

| Obiectiv | Modificare comună |
|----------|-------------------|
| **Cron** | Creare `/api/cron/sync-licitatii` și `/api/cron/sync-repes` care apelează cu SYNC_SECRET; adăugare în vercel.json |
| **Run history** | Tabel unic `import_runs` (type: 'licitatii' | 'repes', started_at, finished_at, summary, status) |
| **Lock** | Tabel `import_locks` sau flag în `import_runs` (status = 'running') |
| **Auth helper** | Extragere `isAdminUser` + auth check într-un `requireAdminSync(request)` în `lib/adminAuth` |
| **Observability** | Logger comun cu run_id, type, phase |
