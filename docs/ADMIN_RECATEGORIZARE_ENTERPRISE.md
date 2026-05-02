# Admin Recategorizare – Enterprise Architecture

**Last updated:** 2026-02

## 1. Architecture overview

### Data flow

- **URL (searchParams)** → filter state. Admin page uses same query param names as `/ro` (category, subcategory, level3, county, city, priceMin/Max, brand, size, color, condition, attributes, etc.) plus `titleSearch`, `titleSearchMode`, `cursor`, `pageSize`.
- **Server**: Page is a Server Component that reads `searchParams`, optionally prefetches first page via server action or direct fetch to admin API. Table + filters are rendered; filters push to URL. Client component wraps table for selection, inline edit, bulk bar, and detail drawer.
- **Listings**: `GET /api/admin/recategorizare/listings` parses query with shared schema (zod), builds Supabase/Prisma where **without channel gating** (admin sees all products), applies title search mode (AND words / OR words / exact phrase), cursor pagination (`updated_at DESC, id DESC`), returns `{ items, nextCursor, hasMore }`.
- **Updates**: Single `POST /api/admin/recategorizare/update`; bulk `POST /api/admin/recategorizare/bulk` (selected IDs or “apply to all matching current filters” with confirmation). Both validate taxonomy + attributes, write DB in transaction, append to `admin_recategorization_audit`.

### Server vs client

| Layer | Responsibility |
|-------|----------------|
| **Server** | Auth (requireAdmin), filter parsing (zod), WHERE build, cursor pagination, title search, DB read/write, audit, taxonomy validation. |
| **Client** | URL sync (searchParams), filter UI, table checkboxes, selection set, bulk bar, inline edit UI, detail drawer, loading/empty/error states, debounced title search. |

### Reuse of /ro filters

- **Shared**: Filter **schema** and **query parsing** live in `lib/listings/filters/` (zod + `buildQueryFromParams`). `/api/ro/listings` and `/api/admin/recategorizare/listings` both use them. Taxonomy comes from `lib/data/ro-categories.ts` and `lib/taxonomy/ro/attributes.ts`.
- **Admin-only**: Title search (mode + query), cursor pagination, no channel/access gating, audit.

---

## 2. File locations and new files

| Path | Purpose |
|------|---------|
| `lib/listings/filters/schema.ts` | Zod schemas and types for listing filters (same as /ro + admin extras). |
| `lib/listings/filters/queryFromParams.ts` | `buildQueryFromParams(searchParams)` – shared by /ro and admin listings API. |
| `lib/listings/filters/index.ts` | Re-exports. |
| `lib/server/admin-recategorizare/listingsRepo.ts` | Admin-only: fetch products with filters + title search + cursor, no channel gate. |
| `supabase/migrations/2026022001_admin_recategorization_audit.sql` | Table `admin_recategorization_audit`. |
| `app/api/admin/recategorizare/listings/route.ts` | GET listings (filters + title search + cursor). |
| `app/api/admin/recategorizare/filters/route.ts` | GET taxonomy + attribute options for sidebar. |
| `app/api/admin/recategorizare/update/route.ts` | POST single product update (category, subcategory, attributes). |
| `app/api/admin/recategorizare/bulk/route.ts` | POST bulk update (selected IDs or apply to all matching filters). |
| `app/admin/recategorizare/page.tsx` | Server Component: layout + filter sidebar + client table wrapper. |
| `app/admin/recategorizare/RecategorizareTable.tsx` | Client: table, checkboxes, selection, bulk bar, inline edit, drawer. |
| `app/admin/recategorizare/RecategorizareFiltersSidebar.tsx` | Client: filter form synced to URL (same keys as /ro + title search). |
| `app/admin/recategorizare/DetailDrawer.tsx` | Client: product detail + category/attribute editor. |

---

## 3. Implementation structure

- **Components**: `RecategorizareFiltersSidebar` (filter form → URL), `RecategorizareTable` (table + selection + bulk bar + inline edit), `DetailDrawer` (sheet with full product + edit).
- **Hooks**: Optional `useRecategorizareSelection()` for selected IDs; pagination via `nextCursor` in state.
- **Server actions**: Not required; all mutations go through Route Handlers (POST update/bulk). Initial load can use Server Component fetch or client fetch on mount.
- **Route Handlers**: GET listings, GET filters, POST update, POST bulk; all use `requireAdmin`, zod, and shared filter types.

---

## 4. Performance and caching

- **Indexes**: `(updated_at DESC, id DESC)`, `(category, subcategory)`, `title` (e.g. pg_trgm for ILIKE if available). Attributes filtered via JSONB path/contains as today.
- **Cursor pagination**: Stable sort, no large offset. Page size cap (e.g. 50) to respect serverless limits.
- **No cache** on admin listings (always fresh). Filter metadata (GET filters) can be short-lived cache (e.g. 60s) or none.

---

## 5. Scalability (millions of listings)

- Cursor pagination and indexed filters keep each request bounded. “Apply to all matching filters” is capped (e.g. 5000 per request) with clear error; above that a background job can be added later.
- Admin list view returns only needed columns (id, title, images, category, subcategory, category_level_3, attributes snippet, channel, updated_at, source fields); full row in drawer on demand.

---

## 6. Security

- **AuthZ**: All routes under `app/api/admin/recategorizare/*` use `requireAdmin(request)` (Supabase admin session). No NextAuth in API; admin panel uses same session as rest of admin.
- **RLS**: Supabase RLS remains enabled; admin API uses service role only on server, never on client.
- **Input**: All inputs validated with zod (filters, update payload, bulk payload). Category/subcategory validated against `verifyTaxonomy`; attributes against allowed keys and types.
- **Audit**: Every update (single or bulk) writes to `admin_recategorization_audit` (admin_user_id, product_id, action_type, before_json, after_json, request_id).
- **Rate limit**: Optional token bucket per admin user on bulk (e.g. max N bulk requests per minute); can be added in middleware or inside bulk route.

---

## 7. Edge cases and failure modes

- **Missing/invalid category or subcategory**: Validation before save; invalid slug → 400 with message.
- **Subcategory not in category**: `verifyTaxonomy` catches it.
- **Attributes not allowed for new subcategory**: Option to strip or flag; admin chooses in UI (e.g. “Remove incompatible attributes” checkbox). Backend strips if requested.
- **Concurrent edit**: Optimistic concurrency via `updated_at`; if backend detects conflict, return 409 and client refreshes.
- **Bulk partial failure**: Process in transaction per product or in chunks; return `{ applied: string[], failed: { id, error }[] }`; do not abort whole batch unless one transaction fails.
- **“Apply to all” with huge count**: Hard cap (e.g. 5000); above cap return 413 with message; suggest background job.

---

## 8. Quick Win / Premium / Enterprise

- **Quick Win**: Single product edit only; no bulk; simple filter (category/subcategory).
- **Premium**: Bulk by selection; filters aligned with /ro; audit table.
- **Enterprise** (this implementation): All of the above + “apply to all matching filters”, title search modes, cursor pagination, attribute validation and compatibility, detail drawer, full reuse of /ro filter schema and taxonomy.
