# Auto-categorizare terenuri (teren intravilan / extravilan / agricol)

Recategorizare automată pentru anunțuri de tip teren intravilan, extravilan sau agricol care altfel rămân în **diverse**. Folosește reguli deterministe (nu AI) și același mecanism de apply ca în Admin filters-lab. **Extravilan nu este echivalent cu agricol:** clasificăm ca terenuri agricole doar când apar termeni agricoli expliciti (agricol, arabil, pasune, etc.); altfel teren + extravilan → terenuri extravilane.

## Sursă unică: taxonomie + coloane DB

- **Taxonomie:** Slug-urile (category, subcategory, level3) provin din **`lib/data/ro-categories.ts`**: `RO_CATEGORIES`, `RO_SUBCATEGORY_NAMES`, `RO_LAND_TAXONOMY`. Orice schimbare de categorie scrie **aceleași coloane** pe care le folosește `/api/ro/listings` și `listingsRepo` / `listingsWhere`: **`products.category`**, **`products.subcategory`**, **`products.category_level_3`**. Nu se scrie niciodată doar în `custom_fields` — taxonomia este întotdeauna în coloanele DB, astfel că filtrele și căutarea rămân aliniate cu admin/autopilot.
- **Status:** Cron-ul selectează produse cu același scope de status ca listarea: `DEFAULT_STATUS` din `lib/server/products/listingsWhere.ts` (active, reserved, sold, in_progress).
- **Validare:** Înainte de apply se validează perechea (category, subcategory) cu **`lib/categorization/verifyTaxonomy.ts`**; dacă nu există în taxonomie, apply este omis și se loghează (DEBUG).

## Cum se apelează cron-ul

- **URL:** `GET /api/cron/auto-categorize`
- **Protecție:** Header obligatoriu: `Authorization: Bearer <CRON_SECRET>`
- **Env:** Setează `CRON_SECRET` în Vercel (sau `.env.local`) și configurează un cron job (ex. zilnic) care trimite acest header.

Exemplu cu curl:

```bash
curl -X GET "https://<domeniu>/api/cron/auto-categorize" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Răspuns tipic:

```json
{
  "success": true,
  "scanned": 200,
  "applied": 12,
  "skipped": 188,
  "errors": []
}
```

## Reguli (comportament)

Toate slug-urile provin din **`RO_LAND_TAXONOMY`** (lib/data/ro-categories.ts); nu se folosesc stringuri hardcodate.

- **Intravilan:** text conține „teren” și „intravilan” → `RO_LAND_TAXONOMY.category` / `RO_LAND_TAXONOMY.subcategoryIntravilan` (terenuri-intravilane), confidence 1.
- **Extravilan:** text conține „teren” și „extravilan” → **terenuri-extravilane** (nu agricole). Categoria/subcategoria: `RO_LAND_TAXONOMY.subcategoryExtravilan`.
- **Agricole:** **Doar** când textul conține „teren” și cel puțin unul dintre: agricol, arabil, pasune, faneata, livada, vie → `RO_LAND_TAXONOMY.subcategoryAgricol` (terenuri-agricole), confidence 1.
- **Excluderi (sport/joc):** dacă textul conține oricare dintre: „teren de joaca”, „teren de joc”, „teren sport”, „teren de sport”, „teren fotbal”, „teren tenis”, „teren baschet” → **nu** se recategorizează (returnează `null`).
- Textul este normalizat: lowercase, fără diacritice, spații colabate.

**Notă:** Extravilan nu înseamnă automat agricol; clasificăm ca agricol doar când există termeni agricoli expliciti.

Doar sugestiile cu **confidence = 1** sunt aplicate de cron; restul sunt doar „skipped”.

## Siguranță

- **Override / lock:** Tabelul `public.category_overrides` (product_id, locked, updated_at). Când există un rând cu `locked = true` pentru un `product_id`, cron-ul **nu** modifică acel produs.
- **Apply identic cu filters-lab:** Folosește `lib/categorization/applyCategoryChange.ts`; pentru LP (executări) se păstrează categoria `executari` și câmpurile listing din `custom_fields`.
- **Batch:** Maxim 200 produse per apel; statusuri: `DEFAULT_STATUS` (active, reserved, sold, in_progress); sunt selectate doar produse cu category null, category = 'diverse' sau subcategory lipsă, titlu non-gol, excluzând id-urile locked.
- **Cooldown:** Produsele cu `custom_fields.last_auto_categorized_at` mai recent de 24h sunt excluse din selecție (evită bucle).
- **Răspuns:** Header `Cache-Control: no-store` pe răspunsul cron-ului.

După aplicare, în `custom_fields` se salvează:
- `last_auto_categorized_at` (ISO timestamp)
- `auto_categorized_reason` (ex. „teren + intravilan → terenuri intravilane”)

## Plan de testare manuală

1. **Teren intravilan din diverse**
   - Creează (sau folosește) un produs cu titlu „Teren intravilan …”, category = `diverse`, subcategory orice.
   - Rulează cron-ul (cu CRON_SECRET).
   - Verifică: produsul are category = `imobiliare`, subcategory = `terenuri-intravilane` și în custom_fields: `last_auto_categorized_at`, `auto_categorized_reason`.

2. **Teren extravilan → extravilane (nu agricole)**
   - Produs cu titlu „Teren extravilan …”, category = `diverse`.
   - Rulează cron-ul.
   - Verifică: produsul are subcategory = `terenuri-extravilane` (nu terenuri-agricole).

3. **Teren extravilan agricol → agricole**
   - Produs cu titlu „Teren extravilan agricol …” (sau „teren arabil”, „teren pasune”), category = `diverse`.
   - Rulează cron-ul.
   - Verifică: produsul are subcategory = `terenuri-agricole`.

4. **Teren de sport nu se mută**
   - Produs cu titlu „Teren de sport …” (sau „teren de joaca”, „teren fotbal”) și category = `diverse`.
   - Rulează cron-ul.
   - Verifică: produsul rămâne în diverse (regula returnează null).

5. **Override locked nu se modifică**
   - Inserează în `category_overrides`: product_id = &lt;id produs teren intravilan&gt;, locked = true.
   - Rulează cron-ul.
   - Verifică: acel produs nu este modificat (rămâne category/subcategory anterioare).

6. **Aliniere cu /api/ro/listings — apare sub filtre imediat**
   - După ce cron-ul aplică o recategorizare, verifică că listarea publică îl returnează cu filtrele corespunzătoare, ex.:
   - `GET /api/ro/listings?category=imobiliare&subcategory=terenuri-intravilane` (sau `terenuri-extravilane`, `terenuri-agricole`).
   - Produsul recategorizat trebuie să apară în răspuns (același `products.category` / `products.subcategory` folosit de listings). Nu se schimbă forma răspunsului API; doar valorile din DB.

## Fișiere implicate

- `lib/data/ro-categories.ts` – sursă unică slug-uri: `RO_CATEGORIES`, `RO_LAND_TAXONOMY`
- `lib/text/normalizeRo.ts` – normalizare text partajată (categorizare + slug comparison)
- `lib/categorization/verifyTaxonomy.ts` – validare category/subcategory înainte de apply
- `lib/categorization/rules/roLandRules.ts` – reguli teren intravilan/extravilan (folosește `RO_LAND_TAXONOMY`, `normalizeForCategorization`)
- `lib/categorization/applyCategoryChange.ts` – aplicare schimbare categorie (coloane DB + optional custom_fields.audit)
- `lib/server/products/listingsWhere.ts` – `DEFAULT_STATUS` (același scope ca cron)
- `app/api/admin/filters-lab/scan/route.ts` – integrare `classifyLandRO` în scan (mode=rules)
- `app/api/admin/filters-lab/apply/route.ts` – folosește `applyCategoryChange`
- `app/api/cron/auto-categorize/route.ts` – cron auto-categorizare
- `supabase/migrations/20260229_category_overrides.sql` – tabel override/lock

## Script verificare aliniere

Rulează (fără DB) verificarea că regulile emit slug-uri din taxonomie, extravilan ≠ agricole, excluderile funcționează și `verifyTaxonomy` trece pentru fiecare clasificare:

```bash
npx tsx scripts/verify-auto-categorize-alignment.ts
```

Cazuri acoperite: (1) teren intravilan → terenuri-intravilane, (2) teren extravilan → terenuri-extravilane (nu agricole), (3) teren extravilan agricol → terenuri-agricole, (4) teren de sport → null.

---

## Rezumat PR + pași testare manuală

**Rezumat:** Extravilan nu se mapează automat la terenuri-agricole; doar la terenuri-extravilane. Terenuri-agricole se aplică doar când există termeni explicit agricoli (agricol, arabil, pasune, faneata, livada, vie). S-a adăugat subcategoria `terenuri-extravilane` în taxonomie (`RO_LAND_TAXONOMY.subcategoryExtravilan`). Excluderi extinse (teren de sport, fotbal, tenis, baschet). Cron: cooldown 24h, titlu non-gol, Cache-Control: no-store.

**Pași testare manuală:**
1. Creează produs „Teren extravilan …” în diverse → rulează cron → verifică: subcategory = `terenuri-extravilane` (nu agricole).
2. Creează produs „Teren extravilan agricol …” în diverse → rulează cron → verifică: subcategory = `terenuri-agricole`.
3. Creează produs „Teren de sport …” în diverse → rulează cron → verifică: nu este mutat (rămâne diverse).
4. Verifică `GET /api/ro/listings?category=imobiliare&subcategory=terenuri-extravilane` (sau terenuri-intravilane / terenuri-agricole) returnează produsele recategorizate.
