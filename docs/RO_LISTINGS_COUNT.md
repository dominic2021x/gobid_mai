# GET /api/ro/listings-count

## Contract

- **Method:** GET
- **Query params:** Same as `/api/ro/listings` (q, category, subcategory, level3, county, city, location, brand, model, color, condition, priceMin/priceMax, product_type, sale_type, status). `from`, `limit`, and `sort` are ignored for count.
- **Response:** `{ success: true, total: number }` (or `{ success: false, error: string }` on 500).
- **Cache:** `Cache-Control: no-store, no-cache, must-revalidate` (client should use `cache: "no-store"` when fetching).

## Why strict-only (no relax)

The count reflects the **strict** filter set only: the same criteria used for the first (non-relaxed) step of `/api/ro/listings`. There is no progressive relax, no merge/append. So:

- The total is the number of rows that match the current filters exactly.
- It may be higher than the number of items actually returned on the first page (e.g. if the listings API later relaxes to fill the page), but for typical usage with strict-only listings it matches.
- This keeps the implementation simple and avoids double-counting or confusing semantics.

## Perf / index expectations

- **Prisma path** (`USE_PRISMA_LISTINGS=true`): Single `COUNT(*)` with the same `WHERE` as the strict step; uses existing indexes (status, category, subcategory, brand, model, etc.).
- **Supabase path**: Single request with `select('id', { count: 'exact', head: true })` and the same filters applied; no row fetch. Indexes on status, brand, model, category, etc. help.
- Optional short cache when there are no filters can be added later; for now the endpoint is uncached.

## Manual test plan

1. **/ro with no filters**  
   Open `/ro`. Call `GET /api/ro/listings-count` (no query). Expect `total > 0` and in the same order of magnitude as the dataset. UI shows “Total: &lt;total&gt;” when the count has loaded.

2. **/ro?brand=...**  
   Apply a brand filter. Check that `listings-count?brand=...` returns a total that matches the subset. UI “Total” should match that number.

3. **/ro?model=...**  
   Apply a model filter. Same check: total from `listings-count` matches the filtered subset; UI “Total” matches.

4. **/ro?q=...**  
   Use a search query. Compare `listings-count?q=...` total with the number of results shown (or with the first page of listings). With strict-only listings, total should be consistent. Compare with `USE_PRISMA_LISTINGS=true` and `false` (totals should align for strict semantics).

5. **Rapid filter changes**  
   Change filters quickly (e.g. brand, then category, then q). Confirm that the displayed total updates and does not get stuck (previous request is aborted when the effect cleans up).

## Implementation notes

- **Strict WHERE:** Built in `lib/server/products/listingsWhere.ts` (`buildPrismaWhereStrict`). Used by listings repo for the strict step and by `listingsCountRepo` for Prisma count. Supabase count in `listingsCountRepo` applies the same filters via the Supabase client (no row fetch).
- **UI:** `/ro` fetches count in a `useEffect` that depends on `filtersSignatureFromUrl`; uses `AbortController` so the previous request is aborted when params change. Displays “Total: {total}” only when `totalCountFromDb !== null` (fed by the listings-count response). Client Supabase count for this total has been removed.
