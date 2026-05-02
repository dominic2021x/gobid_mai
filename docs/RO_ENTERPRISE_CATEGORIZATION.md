# Enterprise categorization + attribute extraction

Sistem de categorizare și atribute canonice aliniat cu filtrele `/api/ro/listings`. O singură sursă de adevăr pentru taxonomie (slug-uri în cod). Apply scrie în coloanele folosite de listings; atributele în `products.attributes` (JSONB), queryable.

## Non-negociabile

- **Taxonomie:** Slug-urile (category, subcategory, level3) din cod: `lib/data/ro-categories.ts` + `lib/taxonomy/ro/taxonomy.ts`.
- **Apply:** Scrie întotdeauna `products.category`, `products.subcategory`, `products.category_level_3`; opțional `products.brand`, `products.model`; atribute canonice în `products.attributes` (merge, nu înlocuire totală). Niciodată doar custom_fields.
- **Atribute:** Canonice și filtrabile (fuel, bodyType, partType, department, apparelType, footwearType, accessoryType).
- **Răspuns listings:** Forma răspunsului `/api/ro/listings` nu se schimbă (poate fi adăugat câmpul opțional `attributes`).
- **Când rulează:** La import + cron (batch), nu la cererea utilizatorului de listare.
- **Override/lock:** Tabelul `category_overrides`; produsele locked sunt sărite. Audit în custom_fields.

## Arhitectură

### Taxonomie

- **lib/data/ro-categories.ts** – sursa unică: `RO_CATEGORIES`, `RO_SUBCATEGORY_NAMES`.
- **lib/taxonomy/ro/index.ts** – wrapper: `listAllCategories()`, `listAllSubcategories(categorySlug)`, `listAllLeaves()`, `isValidCategory`, `isValidSubcategory`, `isLevel3Valid`.
- **lib/taxonomy/ro/taxonomy.ts** – `RO_TAXONOMY`, `RO_LEVEL3_BY_SUBCATEGORY`.
- **lib/taxonomy/ro/attributes.ts** – enum-uri canonice: Auto (fuel, bodyType, partType), Fashion (department, apparelType, footwearType, accessoryType).
- **lib/taxonomy/ro/dictionaries/** – mapări sinonime pentru atribute (combustibil, tip caroserie, modă).

### Normalizare

- **lib/text/normalizeRo.ts** – lowercase, fără diacritice, spații colabate. Folosit de motor și dicționare.

### Sistem dicționare (determinist)

- **lib/categorization/dictionaries/types.ts** – tipul `DictionaryEntry`: `target` (categorySlug, subcategorySlug, level3Slug?), `includeAny`, `includeAll?`, `excludeAny?`, `attributes?`, `confidence`, `reason`.
- **lib/categorization/dictionaries/ro/*.ts** – un fișier per categorie (imobiliare, autovehicule, moda, electronice, casa, mama-copil, etc.), fiecare exportând un array de `DictionaryEntry`.
- **lib/categorization/dictionaries/ro/index.ts** – registru: `ALL_DICTIONARY_ENTRIES` = toate intrările din toate categoriile.
- **scripts/generate-categorization-dictionaries.ts** – generează scaffold-uri goale/minimale pentru toate categoriile/subcategoriile; rulează la nevoie pentru noi subcategorii.

Regulile folosesc doar slug-uri; nicio etichetă afișată hardcodată. Toate țintele sunt validate cu `isValidCategory` / `isValidSubcategory` / `isLevel3Valid` înainte de returnare.

### Motor (dictionary-driven)

- **lib/categorization/engine.ts** – `classify(input)`: normalizare titlu+descriere cu `normalizeRo`, iterare `ALL_DICTIONARY_ENTRIES`, potrivire includeAll/includeAny/excludeAny, alegere best match după confidence și specificitate (includeAll > includeAny), validare țintă cu taxonomy helpers, extragere brand/model (determinist, whole-word) via **lib/categorization/brandModelExtraction.ts**. Returnează `ClassificationResult`: categorySlug, subcategorySlug, level3Slug?, attributes, brand?, model?, confidence, reason, source: "rules".
- **lib/categorization/brandModelExtraction.ts** – liste cunoscute (CAR_BRANDS_FULL, PHONE_BRANDS_FULL, MODELS_CARS, MODELS_PHONES); potrivire whole-word pe text normalizat; returnează brand și opțional model.

### Apply + audit

- **lib/categorization/applyCategoryChange.ts** – logică partajată: scrie `products.category`, `products.subcategory`, `products.category_level_3`, imagini default, custom_fields (LP + audit). Folosit de filters-lab apply și de cron.
- **lib/categorization/apply.ts** – `applyClassification({ productId, categorySlug, subcategorySlug, level3Slug?, attributes?, brand?, model?, reason, source })`: validează taxonomia, verifică override (locked), apelează `applyCategoryChange`, apoi **merge** `products.attributes` (citește curent, face merge cu noile atribute), scrie `products.brand` și `products.model` dacă sunt furnizate, audit în custom_fields. Sare peste produs dacă e locked.

### Cron

- **GET /api/cron/auto-categorize** – Protejat cu `Authorization: Bearer CRON_SECRET`. Selectează până la 200 de produse: status în `DEFAULT_STATUS`, (category null sau diverse sau subcategory lipsă), titlu non-gol, fără cooldown < 24h, fără locked. Pentru fiecare: `classify()` → dacă **confidence >= 0.9** → `applyClassification()` (inclusiv brand, model, attributes); altfel inserează în `category_suggestions` (status pending) pentru review.

### Review loop (sugestii)

- Tabel **public.category_suggestions**: product_id, proposed_category, proposed_subcategory, proposed_level3, proposed_attributes (jsonb), confidence, reason, source, status (pending|approved|rejected), created_at, updated_at.
- **GET /api/admin/category-suggestions** – listare (implicit status=pending).
- **POST /api/admin/category-suggestions/[id]/approve** – aplică clasificarea (reutilizează aceeași `applyClassification`) și setează status=approved.
- **POST /api/admin/category-suggestions/[id]/reject** – setează status=rejected.
- **Filters-lab scan** (mode=rules): folosește `classify()` din engine; rezultatele (inclusiv mismatch și confidence) sunt afișate în scan; sugestiile pot fi create manual sau prin cron când confidence < 0.9.

### Aliniere cu listings (FILTERS_RO.md)

- **listingsWhere** / **listingsRepo**: filtre pe `products.category`, `products.subcategory`, `products.category_level_3`, `products.attributes` (path: fuel, bodyType, partType, department, apparelType, footwearType, accessoryType). Același comportament Prisma + Supabase.
- **/api/ro/listings** – Parametri de query: category, subcategory, category_level_3 + parametri atribute (fuel, bodyType, etc.) conform whitelist-ului din FILTERS_RO.md. Forma răspunsului și paginarea offset rămân neschimbate.

## Migrări și setup

- **20260230_products_attributes.sql** – coloană `products.attributes` (jsonb, default '{}'), index GIN.
- **20260230_category_suggestions.sql** – tabel `category_suggestions`.
- **20260229_category_overrides.sql** – (existent) override/lock.

După aplicarea migrărilor, rulează `npx prisma generate` pentru a actualiza clientul Prisma cu câmpul `attributes`.

## Verificare

- **scripts/verify-enterprise-categorization.ts** – rulează titluri de test prin `classify()` și asertează taxonomie validă și subcategorii așteptate. Comandă: `npx tsx scripts/verify-enterprise-categorization.ts`.

## Plan QA manual pentru filtre /ro

1. **Categorie + subcategorie** – Setează category=imobiliare, subcategory=terenuri-intravilane (sau autovehicule/autoturisme, moda/incaltaminte). Verifică că listarea returnează doar produsele cu acele coloane.
2. **Atribute auto** – Creează/folosește un produs cu attributes = { fuel: "diesel", bodyType: "suv" }. Apel GET /api/ro/listings?category=autovehicule&subcategory=autoturisme&fuel=diesel&bodyType=suv. Verifică că produsul apare.
3. **Atribute modă** – Produs cu attributes = { footwearType: "tenisi" }. Filtru subcategory=incaltaminte&footwearType=tenisi. Verifică că apare.
4. **Fără atribut** – Filtre doar category/subcategory, fără parametri de atribute; verifică că listarea nu se strică.

## Fișiere cheie

| Rol | Fișier |
|-----|--------|
| Taxonomie wrapper | lib/taxonomy/ro/index.ts |
| Taxonomie + level3 | lib/taxonomy/ro/taxonomy.ts, lib/data/ro-categories.ts |
| Atribute | lib/taxonomy/ro/attributes.ts, lib/taxonomy/ro/dictionaries/*.ts |
| Dicționare tip + registru | lib/categorization/dictionaries/types.ts, lib/categorization/dictionaries/ro/index.ts |
| Dicționare per categorie | lib/categorization/dictionaries/ro/imobiliare.ts, autovehicule.ts, moda.ts, etc. |
| Motor | lib/categorization/engine.ts |
| Brand/model | lib/categorization/brandModelExtraction.ts |
| Apply | lib/categorization/apply.ts, lib/categorization/applyCategoryChange.ts |
| Validare | lib/categorization/verifyTaxonomy.ts |
| Cron | app/api/cron/auto-categorize/route.ts |
| Admin sugestii | app/api/admin/category-suggestions/route.ts, [id]/approve, [id]/reject |
| Filters-lab scan | app/api/admin/filters-lab/scan/route.ts (mode=rules folosește engine) |
| Filtre listings | lib/server/products/listingsWhere.ts, listingsRepo.ts, app/api/ro/listings/route.ts |
| Verificare | scripts/verify-enterprise-categorization.ts |
| Gen. dicționare | scripts/generate-categorization-dictionaries.ts |
