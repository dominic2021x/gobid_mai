# Audit tehnic: Pagina de produse /ro – Search + Filtre

**Data audit:** 2026-02-20  
**Scop:** Documentare implementare curentă (filtre server-side + fallback progresiv + Prisma switch), cu paritate Supabase la paginare.

---

## 1. Overview (STATUS ACTUAL)

Ruta `/ro` este pagina principală de listing pentru RO.

**Arhitectură filtrare (actual):**
- **Server-side**: `/api/ro/listings` acceptă parametri de filtrare (q, category, subcategory, county, city, priceMin/Max, size/brand/color/condition, arrays sizes/brands/colors/conditions, product_type, sale_type, status, sort).
- **Paginare**: strict **offset-based** prin `from` + `limit` (paritate 1:1 cu implementarea veche pe Supabase).
- **Backend switch**: `USE_PRISMA_LISTINGS=true` mută backend-ul de la Supabase la Prisma (fără a schimba response shape).
- **Cache**: se folosește doar când nu există filtre (request "generic").

Notă: UI poate încă avea logică locală (sort/UX), dar sursa de adevăr pentru rezultate filtrate este endpoint-ul.

---

## 2. Route & Entrypoints

| Fișier | Rol |
|--------|-----|
| `app/ro/page.tsx` | Pagina principală – `AuctionsPage` (Suspense) → `AuctionsPageContent` |
| `app/ro/layout.tsx` | Layout minimal, `revalidate = 60` |
| `app/ro/loading.tsx` | Skeleton loading |
| `next.config.js` | Nu conține rewrite/redirect pentru `/ro` |
| `middleware.ts` | Nu modifică ruta `/ro` – doar cache headers pentru localhost |

**Router:** Next.js App Router. Ruta `/ro` este definită implicit prin structura `app/ro/page.tsx`.

**i18n:** NECONFIRMAT – nu există configurare i18n explicită pentru `/ro` în fișierele verificate. Ruta pare statică.

---

## 3. Data Flow (diagramă textuală) – actual

```
UI (/ro)
  state filtre + q (URL-driven)
  construiește querystring (from/limit + filtre)
  |
  v
GET /api/ro/listings?... (from/limit + filtre)
  dacă !hasFilters -> poate folosi cache
  dacă USE_PRISMA_LISTINGS=true -> Prisma repo
  altfel -> Supabase repo
  |
  v
Repo (listingsRepo)
  buildWhere(params) + buildOrderBy(sort)
  runListingsQuery (findMany + count în paralel)
  fallback progresiv (A->B->C->D) până apar rezultate
  |
  v
Response
  { success, items, nextFrom, hasMore, fresh }
```

---

## 4. Search

### 4.1 Surse de adevăr

- **URL:** `?q=...` – sursa canonică la mount/navigare
- **State:** `quickSearchQuery` – sincronizat din `searchParams.get('q')` în `useEffect`
- **Analiză:** `searchAnalysis = analyzeSearchForRo(searchQ)` – `lib/search-query-analyzer.ts`

### 4.2 Evenimente și debounce

| Eveniment | Acțiune | Debounce |
|-----------|---------|----------|
| User tastează în search bar | `setQuickSearchQuery` | 300ms → `fetchQuickSuggestions` |
| Click pe sugestie (brand, categorie, produs) | `router.push(\`/ro?q=${encodeURIComponent(q)}\`)` | - |
| Submit search (header) | `UniversalHeader` → redirect `/ro?q=...` | NECONFIRMAT (verificat doar în page) |

**Debounce implementare:** `app/ro/page.tsx` linii 359–375:
```javascript
useEffect(() => {
  const q = quickSearchQuery.trim();
  if (q.length >= 2) {
    if (quickSuggestionsDebounceRef.current) clearTimeout(quickSuggestionsDebounceRef.current);
    quickSuggestionsDebounceRef.current = setTimeout(() => fetchQuickSuggestions(q), 300);
    ...
  }
}, [quickSearchQuery, fetchQuickSuggestions]);
```

### 4.3 Parametri și impact

- **Parametru:** `q` (string)
- **Min caractere pentru sugestii:** 2
- **API sugestii:** `GET /api/search/suggestions?q=...`
- **Auto-apply filtre din search:** când `?q=` există și `searchAnalysis` inferă categorie/subcategorie/brand/locație, un `useEffect` (linii 112–144) actualizează state-ul și URL-ul cu aceste filtre (doar la prima aplicare, `hasAutoAppliedRef`)

### 4.4 Impact asupra fetch și paginare

**(DEPRECATED)** — Server-side filtering is now implemented. The following describes legacy client-side behavior:
- **Fetch listings:** NU – `/api/ro/listings` nu primește `q`. Toate produsele sunt încărcate și filtrate pe client.
- **Paginare:** Nu se resetează explicit la schimbarea lui `q`. `visibleCount` și `nextRemoteFrom` nu depind de `q`. Lista filtrată se recalculează din `auctions` prin `passesFilter` și `ladderBase`.

---

## 5. Filters

### 5.1 Listă completă

| Filtru | UI control | State key(s) | URL param(s) | Cum afectează request | Default | Validare |
|--------|------------|--------------|--------------|----------------------|---------|----------|
| **Categorie** | Radio/checkbox (multi) | `selectedCategory`, `selectedCategories` | `category`, `categories` | Client `passesFilter` | `all` | Chei din `RO_CATEGORIES` |
| **Subcategorie** | Checkbox (multi) | `selectedSubcategory`, `selectedSubcategories` | `subcategory`, `subcategories` | Client | `all`, `[]` | Din `categories[cat].subcategories` |
| **Executări – Cat. principală** | Select | `selectedExecutariMainCategory` | `execMain` | Client | `''` | - |
| **Executări – Categorie listă** | Checkbox | `selectedExecutariListCategory`, `selectedExecutariListCategories` | `execCat`, `execCats` | Client | `''`, `[]` | - |
| **Level 3** | Select | `selectedLevel3` | `level3` | Client `category_level_3` | `all` | Din `CATEGORY_LEVEL_3[sub]` |
| **Mărime** | Select/checkbox | `selectedSize`, `selectedSizes` | `size`, `sizes` | Client `size` | `all`, `[]` | - |
| **Brand** | Select/checkbox | `selectedBrand`, `selectedBrands` | `brand`, `brands` | Client `brand` (case-insensitive) | `all`, `[]` | - |
| **Model** | Select/input | `selectedModel`, `selectedModels` | `model`, `models` | Client `model` | `all`, `[]` | - |
| **Culoare** | Select/checkbox | `selectedColor`, `selectedColors` | `color`, `colors` | Client `color` | `all`, `[]` | - |
| **Preț** | Input min/max | `priceRange` | `priceMin`, `priceMax` | Client (RON/EUR după `selectedCurrency`) | `{ min: '', max: '' }` | Numeric |
| **Monedă** | Toggle | `selectedCurrency` | `currency` | Conversie preț la filtrare | `RON` | `ron` / `eur` |
| **Locație** | SearchableLocationSelect | `location`, `selectedLocations` | `location`, `locations` | Client `city` / `location` | `all`, `[]` | Din `ROMANIAN_CITIES` |
| **Condiție** | Select/checkbox | `condition`, `selectedConditions` | `condition`, `conditions` | Client `condition` | `all`, `[]` | - |
| **Sortare** | Select | `sortBy` | NU (doar state) | Client sort | `relevant` | - |
| **Timp rămas** | Select (doar Executări) | `timeRemainingFilter` | NU | Client `auctionDate` | `''` | `24h`, `48h`, `1week`, `2weeks` |

### 5.2 Filtre detaliate (detailedFilters)

| Câmp | URL params | Aplicare |
|------|------------|----------|
| `rooms` | `rooms` | Apartamente, Case |
| `surface` | `surfaceMin`, `surfaceMax` | Apartamente, Case, Spații, Terenuri |
| `floor` | `floorMin`, `floorMax` | Apartamente |
| `buildingYear` | `buildingYearMin`, `buildingYearMax` | Apartamente, Spații |
| `landSurface` | `landSurfaceMin`, `landSurfaceMax` | Case, Terenuri |
| `garden`, `garage`, `pool` | `garden`, `garage`, `pool` (`1`/omit) | Case |
| `terrainType` | `terrainType` | Terenuri |
| `year` | `yearMin`, `yearMax` | Autovehicule |
| `mileage` | `mileageMin`, `mileageMax` | Autovehicule (nu piese-auto) |
| `capacitateCilindrica` | `capMin`, `capMax` | Autovehicule |
| `fuelType` | `fuelType` | Autovehicule |
| `transmission` | `transmission` | Autovehicule |
| `executionType`, `court`, `debtor` | idem | Executări |
| `executionValue` | `executionValueMin`, `executionValueMax` | Executări |

### 5.3 Edge cases

- **Executări:** Mapare `executari-silite` → `executari`, `imobile-executari` → `exec-imobiliare` etc. în sync URL→state
- **Multi-select:** `categories`/`subcategories`/`brands`/`sizes`/`colors`/`models`/`locations`/`conditions` – array serializat cu `,`
- **Lipsă/invalid:** Valori necunoscute sunt ignorate la parsare; `all`/`''` = fără filtru

---

## 6. Sorting & Pagination

### 6.1 Opțiuni sortare

| Valoare | Comportament |
|---------|--------------|
| `relevant` | Ordine naturală (0 în sortFn) sau `initialOrder` dacă există |
| `newest` | `created_at` / `createdAt` / `auctionDate` desc |
| `timeLeft` | `timeLeft` string localeCompare |
| `priceLow` | Preț crescător (în moneda selectată) |
| `priceHigh` | Preț descrescător |
| `title` | `title` localeCompare |

**Locație în cod:** `app/ro/page.tsx` – `sortFn` în `useMemo` pentru `filteredFull` (linii 2885–2915) și în `fullListForPagination` (linii 3163–3176).

### 6.2 Paginare

- **Tip:** Infinite scroll (IntersectionObserver pe `loadMoreSentinelRef`)
- **Page size client:** `INFINITE_SCROLL_PAGE_SIZE = 18`
- **Reset la filtre:** Nu există reset explicit al `visibleCount` la schimbarea filtrelor. `visibleCount` crește la scroll; lista `listForPagination` se recalculează la fiecare schimbare de filtre.
- **Load more remote:** Când `visibleCount >= listForPagination.length` și `hasMoreRemote`, se apelează `loadMoreRealProducts()` – încarcă următoarele 60 din API (fără filtre).

---

## 7. API: /api/ro/listings (server-side filters + Prisma)

### 7.1 Query params (offset-based)

**Parametri paginare:**
- `from` (number, default 0, clamp >= 0)
- `limit` (number, default 30, clamp 1..100)

**Parametri search/filtre:**
- `q` (string)
- `category` / `categorie`
- `subcategory` / `subcategorie`
- `level3`
- `county`
- `city`
- `location`
- `priceMin` / `price_min`
- `priceMax` / `price_max`
- `size` / `sizes` (repeatable sau csv / array-style în UI)
- `brand` / `brands`
- `color` / `colors`
- `condition` / `conditions`
- `product_type`
- `sale_type`
- `status`
- `sort`: `price_asc | price_desc | date_asc | date_desc | newest`

### 7.2 Response shape (neschimbat)

```json
{
  "success": true,
  "items": [],
  "nextFrom": 0,
  "hasMore": false,
  "fresh": true
}
```

### 7.3 Pagination invariants (Supabase parity)

**Formulas (MUST NOT change):**
- `nextFrom = from + items.length`
- `hasMore = items.length === limit`

**Edge case (last full page):** `hasMore` may be true even when no more results exist; same as Supabase legacy. Client requests once more and receives `items=[], hasMore=false`.

### 7.4 Backend switch (rollback safety)

- **Default:** Supabase. `USE_PRISMA_LISTINGS=true` => Prisma (model: `products`, acces: `prisma.products.*`).
- **Invariant:** Backend switch MUST NOT alter response shape, pagination formulas, or filter semantics. Both paths return identical structure.
- **When Prisma enabled:** `/api/ro/listings` does NOT depend on `supabaseAdmin`; rollback = set flag to false.

### 7.5 Câmpuri selectate (paritate)

`items` conțin (select server-side): `id`, `title`, `slug`, `url`, `images`, `category`, `subcategory`, `category_level_3`, `size`, `brand`, `color`, `condition`, `starting_price`, `starting_price_ron`, `starting_price_eur`, `product_type`, `sale_type`, `status`, `county`, `city`, `product_location`, `auction_date`, `custom_fields`, `created_at`, `is_premium`, `premium_until`

### 7.6 Search semantics (q)

- **Split:** `q` is split into words (whitespace).
- **AND across words:** Each word MUST match.
- **OR across fields:** Each word matches if it appears in at least one of: `title`, `category`, `subcategory`, `category_level_3`, `brand`, `slug`.
- **Match type:** Case-insensitive contains (substring match).
- **Diacritics fallback:** If strict query returns no results, repo may retry with diacritics-normalized `q` (step A of progressive fallback).

### 7.7 Progressive fallback (repo, internal only)

**Rule:** Stop at first non-empty result set. No merging across steps.

**Order:**
- **A)** Search relax: first 1 word → first 2 words → `q` normalized (without diacritics)
- **B)** Soft filter removal: color → condition → size → brand
- **C)** Structural relax: drop city, then drop subcategory (keep county/category)
- **D)** Minimal: only `q` + status/scope (product_type, sale_type)

**Invariants:** Fallback is internal to repo; public API response shape stays unchanged. First successful step returns immediately; results are never merged across steps.

### 7.8 Debug flag

- **Env:** `DEBUG_LISTINGS=1` (or truthy).
- **Behavior:** When set, repo emits `console.debug` logs (query params, filters, relaxation steps). No effect on response shape or caching.

---

## 8. API Contracts (alte endpoint-uri)

### 8.1 GET /api/ro/filter-counts

**Fișier:** `app/api/ro/filter-counts/route.ts`

**Query params:**
- `category` (optional) – când != `all`, returnează și `subcategoryCounts`

**Response:**
```json
{
  "success": true,
  "categoryCounts": { "imobiliare": 1234, "autovehicule": 567, ... },
  "subcategoryCounts": { "apartamente": 400, "case-vile": 200, ... },
  "rowsScanned": 5000
}
```

**Cache:** `Cache-Control: no-store, no-cache, must-revalidate`

### 8.2 GET /api/search/suggestions

**Fișier:** `app/api/search/suggestions/route.ts`

**Query params:** `q` (min 2 caractere)

**Response:** `{ brands, categories, subcategories, suggestions, products, ... }` – structură detaliată în `docs/SUGESTII_CAUTARE_SISTEM.md`

---

## 9. Caching & Performance

**Invariant:** Cache is used ONLY when there are NO filters (pure browsing). When any filter is present, results are always fresh from the repo.

| Resursă | Locație | Cheie / mecanism |
|---------|---------|-------------------|
| Listings API | Server | `unstable_cache` key `["ro-listings"]`, revalidate 120s (only when !hasFilters) |
| Listings fetch (client) | `fetchRoListingsPage` | `cache: "force-cache"` – respectă Cache-Control de la server |
| Filter counts | Client | `cache: 'no-store'`, refresh la 15s + visibilitychange |
| Search suggestions | Client | Fără cache explicit – fiecare tastare nouă = request |
| Filtre salvate | localStorage | `savedFilters` |
| Istoric căutări | localStorage | `user_search_history` |

---

## 10. Known Issues / Tech Debt

1. **(DEPRECATED) Filtrare 100% client-side:** API-ul încarcă toate produsele paginate fără filtre. La volume mari, performanța va suferi.
2. **(DEPRECATED) Listings API ignoră filtrele:** `/api/ro/listings` nu primește `category`, `q`, `priceMin` etc. Orice optimizare server-side necesită modificări majore.
3. **Duplicare logică:** `passesFilter` este foarte lung (~300+ linii), cu condiții imbricate pentru fiecare tip de produs.
4. **URL fără sortBy:** Sortarea nu este în URL – la refresh se pierde.
5. **filter-counts parțial:** Returnează doar category/subcategory counts, nu și brand/size/color/location facets.
6. **Executări – mapări hardcodate:** `execSubMap` și logica de cross-list sunt complexe și fragile.

---

## 11. Upgrade Notes: Filtre Progresive

### 11.1 Definiție „progresive” în contextul codului actual

- **Aplicare incrementală fără reload complet:** Filtrele se aplică pe client, deci deja nu există reload. „Progresive” ar însemna: la fiecare selecție, lista se actualizează instant (deja parțial realizat) + eventuale facets actualizate.
- **Update facets la fiecare selecție:** `categoryCountsFromDb` și `subcategoryCountsFromDb` vin din `/api/ro/filter-counts` doar pentru `category`. Pentru progresive: facets pentru brand, size, color, location etc. ar trebui calculate din rezultatele filtrate curente sau dintr-un API care acceptă filtre compuse.
- **Păstrarea selecțiilor valide:** Când o opțiune devine indisponibilă (0 rezultate), păstrăm selecția dar o marcăm ca „0” sau o dezactivăm.
- **Dezactivarea opțiunilor indisponibile:** UI-ul ar trebui să dezactiveze (grey out) opțiunile cu count=0 în contextul filtrelor curente.
- **URL mereu sincronizat:** Deja implementat prin `syncAllFiltersToUrl`.

### 11.2 Puncte exacte de modificare (hooks)

| Fișier | Funcție / zonă | Modificare sugerată |
|--------|----------------|---------------------|
| `app/ro/page.tsx` | `passesFilter` (linii ~2467–2875) | Extragere într-un hook `useProductFilters` pentru reutilizare și testare |
| `app/ro/page.tsx` | `syncAllFiltersToUrl` (linii 779–908) | Adăugare `sortBy` în URL |
| `app/ro/page.tsx` | useEffect pentru `filter-counts` (linii 1255–1297) | Extindere: trimitere tuturor filtrelor active, nu doar `category` |
| `app/api/ro/filter-counts/route.ts` | `GET` handler | Acceptare parametri: `subcategory`, `brand`, `priceMin`, `priceMax`, `location` etc. și returnare facets per filtru |
| `app/api/ro/listings/route.ts` | `GET` handler | Adăugare parametri de filtrare (category, subcategory, q, priceMin, priceMax, etc.) și aplicare în query Supabase |
| `app/ro/page.tsx` | State + fetch | Când API-ul acceptă filtre: `fetchRoListingsPage` să trimită `searchParams`; eliminare/ simplificare filtrare client pentru lista principală |
| `app/ro/page.tsx` | UI filtre (checkbox, select) | Disable opțiuni cu count=0 când `SHOW_FILTER_OPTION_COUNTS` și count disponibil |
| `lib/search/fallbackLadder.ts` | `buildScenarios`, `auctionMatchesScenario` | Păstrare pentru search `?q=`; eventual integrare cu API când search devine server-side |

---

## FILES MAP

| Fișier | Rol |
|--------|-----|
| `app/ro/page.tsx` | Pagina principală, toată logica de state, filtrare, sortare, UI |
| `app/ro/layout.tsx` | Layout minimal, revalidate 60 |
| `app/ro/loading.tsx` | Skeleton loading |
| `app/api/ro/listings/route.ts` | API listare produse (paginate, cu filtre server-side) |
| `app/api/ro/filter-counts/route.ts` | API count-uri categorii/subcategorii |
| `app/api/search/suggestions/route.ts` | API sugestii autocomplete |
| `lib/data/ro-categories.ts` | `RO_CATEGORIES`, `RO_SUBCATEGORY_NAMES` |
| `lib/data/romanian-cities.ts` | `ROMANIAN_CITIES` |
| `lib/search-query-analyzer.ts` | `analyzeSearchForRo` – inferare categorie, brand, locație din query |
| `lib/search/fallbackLadder.ts` | `buildScenarios`, `auctionMatchesScenario` – ladder progresiv pentru search |
| `lib/categories.ts` | `CATEGORY_LEVEL_3`, `SUBCATEGORY_DISPLAY_TO_KEY`, `getSizeOptions` |
| `lib/attributes.ts` | `getBrandOptionsForSubcategory`, `getAttributesForSubcategory`, `COLOR_OPTIONS` |
| `lib/data/brand-models.ts` | `getModelsForBrand` |
| `components/UniversalHeader.tsx` | Header cu search bar, redirect la `/ro?q=...` |
| `components/SearchableLocationSelect.tsx` | Select locații cu search |
| `middleware.ts` | Cache headers, nu afectează /ro |
| `next.config.js` | Fără redirect/rewrite pentru /ro |

---

## Architectural Invariants

These rules MUST be preserved across changes. Violations break client contracts and rollback safety.

1. **Single source of truth:** Public listings are served ONLY from `public.products`. Import tables (`repes_listings`, `licitatii_insolventa_listings`, etc.) are never queried by `/api/ro/listings`.

2. **Response shape stable:** The `/api/ro/listings` response shape (`success`, `items`, `nextFrom`, `hasMore`, `fresh`) MUST NOT change. No new root-level fields without coordinated client update.

3. **Offset-based pagination:** Pagination is strictly offset-based. Formulas: `nextFrom = from + items.length`, `hasMore = items.length === limit`. Supabase parity MUST be maintained.

4. **Backend switch behavior:** Switching between Supabase and Prisma (via `USE_PRISMA_LISTINGS`) MUST NOT alter response shape, pagination formulas, or filter semantics. Both paths return identical structure.

5. **Progressive fallback internal:** Fallback (A→B→C→D) is internal to repo. Stop at first non-empty result set; no merging across steps. API response shape stays unchanged; `meta.relaxed` is not exposed in root.

6. **Cache only when no filters:** Cache MUST be used only when `!hasFilters`. When any filter is present, results MUST be fresh from the repo.

7. **Prisma path independence:** When `USE_PRISMA_LISTINGS=true`, `/api/ro/listings` MUST NOT depend on `supabaseAdmin`. Rollback = set flag to false.
