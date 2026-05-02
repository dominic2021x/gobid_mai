# RO Recategorization Agent

**Last updated:** 2026-02

Automatic recategorization agent that updates **taxonomy** (category, subcategory, category_level_3) for existing products in DB. Runs as a **batch cron** on Vercel. Primarily uses **title** (and optional description); ~95% of items describe type in title.

## Non-negotiables

- Writes **only** into DB columns used by filters/search: `products.category`, `products.subcategory`, `products.category_level_3` (and `brand`, `model`, `attributes` when provided).
- **Does NOT change** `products.channel` (e.g. `executari_insolventa` stays).
- **Respects** `category_overrides.locked`: skips locked products.
- Uses **taxonomy slugs** from `lib/data/ro-categories.ts` only (no invented slugs).
- **Audit** in `custom_fields`: `last_auto_categorized_at`, `auto_categorized_reason`, `auto_categorized_source`, `auto_categorized_version`.
- **Batch** only; no per-request recategorization.
- **/api/ro/listings** response shape and behaviour unchanged.

---

## Phase 1 – Rules-first

### A) Normalization

- **`lib/text/normalizeRo.ts`**
  - `normalizeRo(text)`: lowercase, strip diacritics, collapse spaces, trim.
  - `normalizeForCategorization(text)`: alias for `normalizeRo`.
  - Used for title/description matching in engine and rules.

### B) Taxonomy helpers

- **`lib/categorization/taxonomy.ts`**
  - `listCategorySlugs()` / `listSubcategorySlugs(cat)` – slugs from RO_CATEGORIES.
  - `validateSlugs({ categorySlug, subcategorySlug, level3Slug? })` – valid against taxonomy.
  - `mapLegacyExecSubcategoryToTaxonomy(execSubcategorySlug)` – maps `exec-*` (and `utilaje-echipamente`, `oferte-grupate`) to real taxonomy (e.g. exec-imobiliare → imobiliare/apartamente).
  - `isLegacyExecSubcategory(subcategorySlug)` – true for exec-*, utilaje-echipamente, oferte-grupate.

### C) Deterministic engine

- **`lib/categorization/engine.ts`**
  - **Input:** product `{ id, title, description?, category, subcategory, category_level_3, brand, model, custom_fields }`.
  - **Output:** `{ categorySlug, subcategorySlug, level3Slug?, attributes?, brand?, model?, confidence, reason, source }` or `null`.
  - **Steps:**
    1. **Legacy mapping:** if current subcategory is legacy exec-* → map to base category/subcategory; return with **confidence=1**, reason `"legacy exec mapping"`.
    2. **Keyword dictionaries** (per category: imobiliare, autovehicule, electronice, casa, moda, mama-copil, etc.) – match on normalized title/description.
  - Returns **only when** confidence ≥ 0.9; otherwise `null` (so cron auto-applies only when confidence=1; lower confidence can be stored as suggestion).

### D) Apply

- **`lib/categorization/applyClassification.ts`** (existing)
  - Validates slugs with `verifyTaxonomy`.
  - Updates `products.category`, `products.subcategory`, `products.category_level_3` (and optional brand, model, attributes).
  - Writes audit into `custom_fields`: `last_auto_categorized_at`, `auto_categorized_reason`, `auto_categorized_source`, `auto_categorized_version`.
  - **Skips** if `category_overrides.locked` is true for that product.
  - Does **not** write `channel` or `requires_token`.

### E) Cron route

- **`GET /api/cron/recategorize`**
  - **Auth:** `Authorization: Bearer <CRON_SECRET>`.
  - **Runtime:** nodejs, maxDuration 20s.
  - **Selection:**
    - `products.channel = 'executari_insolventa'`
    - status in active/reserved/sold/in_progress
    - `category` is null or `'diverse'` or `subcategory` is null or `subcategory` like `exec-%`
    - title non-empty
    - **Cooldown:** skip if `custom_fields.last_auto_categorized_at` &lt; 24h
    - **Skip** products in `category_overrides` with `locked = true`
  - **Batch:** up to 200 products per run.
  - **Logic:** for each product, `classify(input)` → if **confidence === 1** → `applyClassification(...)`; else insert into `category_suggestions` (pending).
  - **Response:** `{ success, scanned, applied, skipped, errors }`.

---

## Phase 2 – Suggestions + optional AI

- **Table** `public.category_suggestions` (migration `20260230_category_suggestions.sql`): stores proposed category/subcategory/level3/attributes when confidence &lt; 1.
- **Optional AI:** `lib/categorization/ai/classifier.ts` (e.g. gpt-4o-mini, JSON schema) – use only when rules return null and title length ≥ N; auto-apply only if confidence ≥ 0.98.
- **Admin:** approve/reject suggestions (reuse `applyClassification`); see `app/api/admin/category-suggestions/`.

---

## Migrations

- **category_overrides:** `20260229_category_overrides.sql` – lock products from auto-categorization.
- **category_suggestions:** `20260230_category_suggestions.sql` – queue for low-confidence suggestions.
- **products.attributes** (JSONB) – already in schema; used for fuel, bodyType, etc.

---

## Manual QA steps

1. **Locked**
   - Insert a row in `category_overrides` with `product_id = <some product id>` and `locked = true`.
   - Run cron; that product must not be updated.

2. **Cooldown**
   - Set `custom_fields.last_auto_categorized_at` to a recent ISO timestamp on a product that would otherwise be selected.
   - Run cron; that product must be skipped (within 24h).

3. **Legacy exec mapping**
   - Pick a product with `channel = 'executari_insolventa'` and `subcategory = 'exec-imobiliare'`.
   - Run cron; it should be recategorized to `category = 'imobiliare'`, `subcategory = 'apartamente'` (or similar), **channel unchanged**.

4. **Dictionary**
   - Pick a product with title containing clear keywords (e.g. "apartament", "laptop"); ensure it gets the expected category/subcategory when confidence=1.

5. **Suggestions**
   - When confidence &lt; 1, a row should appear in `category_suggestions` with status `pending`.

6. **Listings API**
   - After recategorization, call `/api/ro/listings` with same params as before; response shape and pagination unchanged; filters use new taxonomy.

---

## Vercel cron (optional)

Add to `vercel.json` crons if you want the agent to run on a schedule:

```json
{ "path": "/api/cron/recategorize", "schedule": "0 2 * * *" }
```

(Example: daily at 02:00 UTC.)
