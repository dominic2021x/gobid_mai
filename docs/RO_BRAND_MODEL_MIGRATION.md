# Migrarea brand + model pe /ro (câmpuri first-class)

## Ce s-a schimbat

- **DB:** Coloana `model` a fost adăugată la `public.products` (brand exista de la 20260204). Indexuri pentru `brand` și `model` (b-tree + trigram pentru ILIKE).
- **Prisma:** Modelul `products` are câmpul `model String?` și index `idx_products_model`.
- **Listings:** Atât path-ul Prisma cât și Supabase folosesc coloanele `brand` și `model` pentru filtre și pentru căutarea `q` (OR pe title, category, subcategory, category_level_3, brand, **model**, slug). Filtre: `brand` / `model` cu `contains` (insensitive). Pe Supabase există fallback la `custom_fields.model` pentru rânduri vechi.
- **Importuri:** ANAF productCreator, executari publish/recreate, licitatii-insolventa publish setează `brand` și `model` (normalizat: trim + collapse whitespace) la insert; dacă lipsește, se lasă null (ingestionul nu se oprește).
- **Contract /api/ro/listings:** Neschimbat (`success`, `items`, `nextFrom`, `hasMore`, `fresh`); paginarea rămâne offset-based, fără „append fill” între pași.

---

## Cum rulezi migrarea

### 1. SQL (Supabase)

Rulezi migrarea din repo (sau copiezi conținutul în SQL Editor):

```bash
# Din proiect, migrările se aplică de obicei cu:
# supabase db push
# sau rulezi manual fișierul:
```

Fișier: **`supabase/migrations/20260228_products_model_column.sql`**

Conține:
- `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model TEXT;`
- Verificare că există `brand` (dacă lipsește, îl adaugă)
- Indexuri: `products_brand_idx`, `products_model_idx`, `products_brand_trgm_idx`, `products_model_trgm_idx` (pg_trgm)

### 2. Prisma

După ce coloana există în DB:

```bash
npx prisma generate
```

(Schema din repo are deja `model` și indexul.)

### 3. Backfill (opțional, idempotent)

Populezi `model` (și eventual `brand`) din `custom_fields` pentru rândurile unde lipsește:

```bash
npx tsx scripts/backfill-products-model.ts
```

Cerințe: `.env.local` cu `NEXT_PUBLIC_SUPABASE_URL` și `SUPABASE_SERVICE_ROLE_KEY`.

Scriptul:
- citește produse cu `model` null/goal
- pentru fiecare: dacă `custom_fields->>'model'` (sau `model_name`) există, setează `model`; dacă `brand` e gol și există `custom_fields->>'brand'` / `marca`, setează `brand`
- e sigur să fie rulat de mai multe ori (idempotent).

---

## Verificare: USE_PRISMA_LISTINGS true vs false

1. **Filtru brand**
   - `/ro?brand=Dacia` (sau alt brand din DB)
   - Verifică că lista conține doar produse cu acel brand (sau potrivire parțială, conform `contains`).
   - Repetă cu `USE_PRISMA_LISTINGS=true` și `false` (restart dev după schimbare în `.env.local`); rezultatele ar trebui să fie consistente (aceleași filtre, aceeași paginare).

2. **Filtru model**
   - `/ro?model=Logan` (sau alt model existent)
   - Verifică că lista conține doar produse cu acel model (sau potrivire parțială).
   - La fel cu Prisma on/off; același comportament.

3. **Căutare q**
   - `/ro?q=iPhone` sau `?q=Dacia`
   - Verifică că rezultatele conțin termenul în title, brand, model sau alte câmpuri din OR (nu doar title).
   - Compară cu Prisma on/off: ordinea poate diferi ușor, dar setul de rezultate și paginarea (nextFrom, hasMore) rămân coerente.

4. **Paginare**
   - Cu filtre (ex: brand + model), treci la „load more”.
   - Verifică în Network că request-ul către `/api/ro/listings` are aceiași parametri (q, brand, model, etc.) și `from`/`limit` crescute; răspunsul păstrează `items`, `nextFrom`, `hasMore`.

5. **Consistență Prisma vs Supabase**
   - Rulează (dacă există): `npx tsx scripts/compare_listings.ts` cu mai multe query-uri (fără filtre, cu brand, cu model, cu q) și verifică că numărul de items, `nextFrom` și `hasMore` coincid sau sunt acceptabile (mici diferențe de ordine/sortare).

---

## Fișiere modificate (rezumat)

| Zonă | Fișier | Modificare |
|------|--------|------------|
| DB | `supabase/migrations/20260228_products_model_column.sql` | Coloană `model`, indexuri brand/model |
| Prisma | `prisma/schema.prisma` | Câmp `model`, index `idx_products_model` |
| Backfill | `scripts/backfill-products-model.ts` | Script one-off din custom_fields |
| Listings | `lib/server/products/listingsRepo.ts` | Select + buildWhere (model filter + q OR) + Supabase row match (column + fallback cf) |
| API listings | `app/api/ro/listings/route.ts` | (deja parsa model; hasFilters include model) |
| Import ANAF | `lib/anaf/productCreator.ts` | brand/model din bun, normalizat |
| Import executari | `app/api/admin/executari-publice/publish/route.ts`, `recreate-product/route.ts` | brand/model din meta_fields |
| Import insolventa | `app/api/admin/licitatii-insolventa/publish/route.ts` | brand/model din info_marca / info_model |

Admin create product (`/api/admin/products/create`) primește payload de la client; dacă frontend trimite `brand`/`model`, sunt persistate ca atare (fără modificări suplimentare în acest pas).
