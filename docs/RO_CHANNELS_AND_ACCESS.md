# RO Channels and Access (Executări & Insolvență token-gating)

**Last updated:** 2026-02

## 1. Goals

- **Executări & Insolvență** is a separate **channel** (token-gated), not a taxonomy category.
- **Taxonomy** (Imobiliare, Autovehicule, etc.) describes the **nature of the item** and is used for filtering inside any channel.
- **Channel** controls **access**: who can see listings in that channel (e.g. `executari_insolventa` requires a valid token).
- **No data leakage**: without a valid token, executari/insolventa items must not appear in list, count, or facets.

## 2. Data model

### 2.1 New columns on `public.products`

| Column            | Type    | Default | Description |
|-------------------|---------|---------|-------------|
| `channel`         | `TEXT`  | `'ro'`  | `'ro'` = main marketplace; `'executari_insolventa'` = token-gated channel. |
| `requires_token`  | `BOOLEAN` | `false` | When true, listing is only visible with channel access. |
| `access_scope`    | `TEXT`  | `NULL`  | Optional scope (reserved). |

- **Migration:** `supabase/migrations/20260221_products_channel_access.sql`
- **Index:** `products_channel_idx` on `(channel)`.

### 2.2 Backfill rules (idempotent)

- Rows that are today “Executări & Insolvență” (by `product_type`, `sale_type`, or `category`) → `channel = 'executari_insolventa'`, `requires_token = true`.
- All other rows → `channel = 'ro'`, `requires_token = false`.

## 3. Access resolution (single source)

- **Helper:** `lib/server/access/resolveAccess.ts`
- **Signature:** `resolveAccess(req: Request): Promise<AccessContext>`
- **Return type:** `{ hasExecutariAccess: boolean; tokenId?: string; scope?: string }`

Token is read from **one place** (no duplication):

- **Cookie:** `executari_access=<token>`
- **Header:** `x-executari-access: <token>`

Validation: token is compared against `EXECUTARI_ACCESS_SECRET` (env). Multiple tokens: comma-separated in the same env var.

- **Do not** duplicate token validation in other routes; always use `resolveAccess(request)`.

## 4. API behaviour

### 4.1 Query param: `channel`

- **Default:** `channel=ro`
- **Allowed:** `ro` | `executari_insolventa`
- **Meaning:** which channel’s listings to return. **Not** a taxonomy category.

### 4.2 Listings: `GET /api/ro/listings`

- Parses `channel` (default `ro`).
- Calls `resolveAccess(request)`.
- Passes `accessCtx` into repo; repo applies gating in the WHERE builder:
  - **channel = `executari_insolventa`** and **!hasExecutariAccess** → 0 rows (impossible condition).
  - **channel = `executari_insolventa`** and **hasExecutariAccess** → filter `channel = 'executari_insolventa'`.
  - **channel = `ro`** → filter `channel = 'ro'` (main feed never includes executari channel rows).

Response shape is **unchanged** (`success`, `items`, `nextFrom`, `hasMore`, `fresh`).

### 4.3 Count: `GET /api/ro/listings-count`

- Same `channel` and `resolveAccess(request)`.
- Same gating logic as listings (strict count matches list).
- Without token for executari channel → `total = 0`.

### 4.4 Filter counts / facets: `GET /api/ro/filter-counts`

- Accepts `channel`; calls `resolveAccess(request)`.
- If `channel = executari_insolventa` and **!hasExecutariAccess** → return zeros / empty facets.
- Otherwise, only products with `channel = <requested channel>` are scanned for counts.

## 5. Categorization (do not move channel)

- **Rule:** Categorization must **never** write `products.channel` or `products.requires_token`.
- It only updates **taxonomy** columns: `category`, `subcategory`, `category_level_3` (and related `custom_fields` for listing labels).
- Channel is set at import/publish or by migration; taxonomy is set by auto-categorize / filters-lab.

See comment in `lib/categorization/applyCategoryChange.ts`.

## 6. UI / routing (separation)

- **/ro** → main marketplace → `channel=ro` (default). Filters by taxonomy (Imobiliare, Autovehicule, etc.).
- **/executari** → Executări & Insolvență → use `channel=executari_insolventa` (e.g. via route or internal param). Same taxonomy filters **inside** this channel.

**Category list:**

- “Executări & Insolvență” must **not** appear as a **taxonomy category** in the main category facet.
- Expose it as a **channel switch / tab** (e.g. “Licitații” vs “Executări”) or separate route `/executari`.
- URL can imply channel (e.g. `/executari` sets `channel=executari_insolventa` without exposing the param in the main /ro UI).

## 7. Env

| Variable | Required | Description |
|----------|----------|-------------|
| `EXECUTARI_ACCESS_SECRET` | For executari access | Secret token(s). Comma-separated for multiple. Cookie/header value must match one. |

## 8. Test plan

1. **Without token**  
   - `GET /api/ro/listings?channel=executari_insolventa` → 0 items.  
   - `GET /api/ro/listings-count?channel=executari_insolventa` → `total = 0`.  
   - `/ro` (channel=ro) unchanged.

2. **With valid token** (cookie or header)  
   - Same URLs with token → list and count &gt; 0 when data exists.  
   - Filtering by taxonomy (e.g. category=imobiliare) works inside executari channel.

3. **No leakage**  
   - `/ro` (channel=ro) never returns executari channel items, even if token is present.

4. **Categorization**  
   - An executari item can have taxonomy e.g. imobiliare/autovehicule; `channel` stays `executari_insolventa`.

5. **Pagination**  
   - Response shape and `nextFrom` / `hasMore` behaviour unchanged; load more uses same params (including `channel`).
