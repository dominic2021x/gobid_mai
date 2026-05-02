# Verificare – toate câmpurile produs (formular → baza de date)

> **⚠️ Nu rula acest fișier în Supabase SQL Editor.** Acesta este un document Markdown (explicații și tabele).  
> Pentru interogări SQL, folosește fișierul: **`docs/verificare_campuri_produse.sql`** – copiază conținutul aceluia în SQL Editor și rulează-l.

Fișier de referință pentru verificarea că fiecare câmp din formular este salvat corect în baza de date.

---

## 1. Coloane în tabelul `public.products`

Câmpurile din **secțiunea principală** a formularului care se salvează ca **coloane** în tabel:

| # | Coloană DB | Label formular | Sursă în cod (payload) | Migrație |
|---|------------|----------------|------------------------|----------|
| 1 | `id` | — | auto (UUID) | 20251115 |
| 2 | `title` | Titlu | `manualFormData.title` | 20251115 |
| 3 | `description` | Descriere | `manualFormData.description` | 20251115 |
| 4 | `slug` | — | generat din titlu | 20251115 |
| 5 | `sku` | SKU | `manualFormData.sku` | 20251115 |
| 6 | `category` | Categorie | `manualFormData.category` | 20251115 |
| 7 | `subcategory` | Subcategorie | `manualFormData.subcategory` | 20251115 |
| 8 | `category_level_3` | Nivel 3 | `manualFormData.categoryLevel3` | 20260202 |
| 9 | `size` | Mărime | `manualFormData.size` | 20260203 |
| 10 | `brand` | Brand | `manualFormData.brand` | 20260204 |
| 11 | `color` | Culoare | `manualFormData.color` | 20260204 |
| 12 | `condition` | Stare | `manualFormData.condition` | 20260204 |
| 13 | `starting_price` | Preț (calculat) | `normalizedStartingPrice` | 20251115 |
| 14 | `starting_price_ron` | Preț RON | `manualFormPriceRon` | 20251115 |
| 15 | `starting_price_eur` | Preț EUR | `manualFormPriceEur` | 20251115 |
| 16 | `currency` | Monedă | `manualFormData.currency` | 20251115 |
| 17 | `product_type` | — | `'live-bid'` | 20251115 |
| 18 | `status` | — | `'active'` | 20251115 |
| 19 | `county` | Județ | `manualFormData.county` | 20251115 |
| 20 | `city` | Oraș / Comună | `manualFormData.city` | 20251115 |
| 21 | `address` | Adresă | `manualFormData.address` | 20251115 |
| 22 | `images` | Imagini | `uploadedImageUrls` | 20251115 |
| 23 | `custom_fields` | — | JSONB (vezi secțiunea 2) | 20251115 |
| 24 | `seo` | SEO | `finalSEO` | 20251115 |
| 25 | `documents` | — | `[]` | 20251115 |
| 26 | `url` | — | generat | 20251115 |
| 27 | `user_id` | — | `userId` (la insert) | 20260205 |
| 28 | `created_at` | — | auto | 20251115 |
| 29 | `updated_at` | — | auto | 20251115 |
| 30 | `premium_until` | — | (admin) | 20251221 |
| 31 | `is_premium` | — | (admin) | 20251221 |
| 32 | `risk_score` | — | (sistem) | 20260111 |
| 33 | `risk_analysis_data` | — | (sistem) | 20260111 |
| 34 | `approval_status` | — | (sistem) | 20260201 |

---

## 2. Câmpuri din secțiunea principală → `custom_fields`

Acestea vin din **formularul principal** (dropdown-uri deasupra) dar se salvează în **`custom_fields`** (nu ca coloane):

| # | Cheie în `custom_fields` | Label formular | Sursă în cod |
|---|--------------------------|----------------|---------------|
| 1 | `model` | Model | `manualFormData.model` |
| 2 | `model_label` | (același ca model) | `manualFormData.model` |
| 3 | `capacitate_cilindrica` | Capacitate cilindrică (L) | `manualFormData.capacitateCilindrica` |
| 4 | `ram` | RAM (GB) | `manualFormData.ram` |
| 5 | `capacitate_stocare` | Capacitate stocare (GB) | `manualFormData.capacitateStocare` |
| 6 | `garantie` | Garanție | `manualFormData.garantie` |
| 7 | `village` | Sat | `manualFormData.village` |
| 8 | `exchange_rate` | — | la salvare |
| 9 | `exchange_rate_updated_at` | — | la salvare |
| 10 | `buy_now_enabled` | Cumpără acum | `manualFormData.buyNowEnabled` |
| 11 | `buy_now_price_ron` | Preț Cumpără acum RON | `manualFormData.buyNowPriceRON` |
| 12 | `buy_now_price_eur` | Preț Cumpără acum EUR | `manualFormData.buyNowPriceEUR` |
| 13 | `is_fixed_price` | Preț fix | `manualFormData.fixedPrice` |

---

## 3. Câmpuri dinamice (Caracteristici specifice) → `custom_fields`

Toate câmpurile din **Caracteristici specifice** (per categorie/subcategorie) se salvează în **`custom_fields`** cu **cheia** din coloana `key` din config.

### 3.1 Autovehicule

| Subcategorie | Cheie `custom_fields` | Label |
|-------------|------------------------|-------|
| Autoturisme | `an` | An Fabricare |
| | `kilometraj` | Kilometraj |
| | `combustibil` | Combustibil |
| | `transmisie` | Transmisie |
| | `putere` | Putere (KW) |
| | `caroserie` | Tip Caroserie |
| | `serie_sasiu` | Serie Șasiu |
| | `clasa_emisii` | Clasa Emisii |
| | `nrLocuri` | Număr Locuri |
| SUV / 4x4 | `an`, `kilometraj`, `combustibil`, `transmisie`, `putere`, `tip4x4` | (la fel + Tip 4x4) |
| Motociclete și Scutere | `an`, `kilometraj`, `combustibil`, `transmisie`, `putere` | (la fel) |
| Camioane | `an`, `kilometraj`, `capacitateIncarcare`, `combustibil` | + Capacitate Încărcare (t) |
| Remorci și Semiremorci | `tip`, `capacitateIncarcare`, `dimensiuni` | Tip, Capacitate, Dimensiuni |
| Autorulote / Rulote | `an`, `capacitate`, `lungime` | + Capacitate (persoane), Lungime |
| Vehicule Electrice | `an`, `autonomie`, `capacitateBaterie` | An, Autonomie, Capacitate Baterie |
| Piese Auto și Accesorii | `tipPiesa`, `compatibilitate`, `codOriginal` | Tip Piesă, Compatibilitate, Cod Original |

### 3.2 Electronice & Tehnologie

| Subcategorie | Cheie `custom_fields` | Label |
|-------------|------------------------|-------|
| Laptopuri și PC-uri | `procesor`, `stocare`, `gpu`, `dimensiuneEcran` | Procesor, Stocare, GPU, Dimensiune Ecran |
| Telefoane Mobile | (brand, model, ram, capacitateStocare, garantie sunt în secțiunea principală) | — |
| Tablete | `dimensiuneEcran` | Dimensiune Ecran (inch) |
| TV & Audio | `dimensiuneEcran`, `tipEcran`, `rezolutie` | Dimensiune, Tip Ecran, Rezoluție |
| Console & Jocuri | `tipConsole`, `stocare` | Tip Console, Stocare (GB) |
| Drone & Gadgeturi Smart | `tip`, `autonomie` | Tip, Autonomie |
| Echipamente Foto/Video | `tip`, `rezolutie` | Tip, Rezoluție Video |

### 3.3 Modă & Lifestyle

| Subcategorie | Cheie `custom_fields` | Label |
|-------------|------------------------|-------|
| Haine de Designer | `marime`, `material`, `sezon` | Mărime, Material, Sezon |
| Încălțăminte | `marime`, `tip`, `material` | Mărime, Tip Încălțăminte, Material |
| Genți & Accesorii | `tipAccesoriu`, `material` | Tip Accesoriu, Material |
| Parfumuri & Cosmetice | `tip`, `capacitate` | Tip, Capacitate (ml) |
| Ceasuri de Lux | `material`, `an` | Material, An Fabricare |

### 3.4 Casă & Grădină

| Subcategorie | Cheie `custom_fields` | Label |
|-------------|------------------------|-------|
| Mobilier Interior | `tipMobilier`, `material`, `dimensiuni` | Tip Mobilier, Material, Dimensiuni |
| Mobilier Exterior | `tipMobilier`, `material` | Tip Mobilier, Material |
| Echipamente de Grădinărit | `tipEchipament`, `putere` | Tip Echipament, Putere |
| Decorațiuni | `tipDecoratiune`, `material`, `dimensiuni` | Tip Decorațiune, Material, Dimensiuni |
| Electrocasnice | `tipElectrocasnic` | Tip Electrocasnic |

### 3.5 Alte categorii

Toate cheile din `dynamicFieldsConfig` pentru fiecare categorie/subcategorie sunt salvate în `custom_fields` cu același `key`. (Imobiliare, Utilaje, Artă, Mama și copilul, Agricultură, Maritime, Business, Materiale Construcții, Diverse, Executări silite.)

---

## 4. Mapare rapidă: formular → DB

| Unde în formular | Unde în DB |
|------------------|------------|
| Categorie, Subcategorie, Nivel 3 | `products.category`, `products.subcategory`, `products.category_level_3` |
| Titlu, Descriere | `products.title`, `products.description` |
| Brand, Culoare, Stare | `products.brand`, `products.color`, `products.condition` |
| Mărime | `products.size` |
| Model | `custom_fields.model` (+ `model_label`) |
| Capacitate cilindrică (L) | `custom_fields.capacitate_cilindrica` |
| RAM (GB), Capacitate stocare (GB), Garanție | `custom_fields.ram`, `capacitate_stocare`, `garantie` |
| Județ, Oraș, Sat, Adresă | `products.county`, `products.city`, `custom_fields.village`, `products.address` |
| Preț RON/EUR, Monedă | `products.starting_price_ron`, `starting_price_eur`, `currency` |
| Toate câmpurile din Caracteristici specifice | `custom_fields.<key>` (ex: `an`, `kilometraj`, `combustibil`) |

---

## 5. Verificare în baza de date

### 5.1 Verificare coloane tabel `products`

Rulează în SQL (Supabase sau psql):

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;
```

Compară lista cu **Secțiunea 1** – toate coloanele din tabelul de mai sus trebuie să existe.

### 5.2 Verificare că un produs salvat are datele corecte

După ce salvezi un anunț (ex: Autoturism, Telefon):

- Coloane: `title`, `category`, `subcategory`, `brand`, `color`, `condition`, `size`, `county`, `city`, `starting_price_ron`, `starting_price_eur`, `currency`, `images`, `slug`, `url`, `user_id`.
- `custom_fields` (JSONB) trebuie să conțină: `model`, `model_label`, `capacitate_cilindrica` (auto), `ram`, `capacitate_stocare`, `garantie` (telefoane), `an`, `kilometraj`, `combustibil`, `transmisie`, etc., în funcție de subcategorie.

Exemplu verificare un produs:

```sql
SELECT id, title, category, subcategory, brand, color, condition, size,
       county, city, starting_price_ron, user_id,
       custom_fields
FROM public.products
WHERE id = 'UUID_PRODUS'
LIMIT 1;
```

---

## 6. Verificare direct în SQL Editor

Copiază și rulează în **Supabase → SQL Editor** (sau orice client SQL).

### 6.1 Lista tuturor coloanelor din `products`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;
```

### 6.2 Verifică dacă coloana `user_id` există

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'user_id'
) AS are_user_id;
```

- Rezultat `true` = coloana există.  
- Rezultat `false` = rulează migrația `20260205_products_user_id.sql`.

### 6.3 Ultimul produs creat (toate coloanele + custom_fields)

```sql
SELECT id, title, description, slug, sku,
       category, subcategory, category_level_3, size,
       brand, color, condition,
       starting_price, starting_price_ron, starting_price_eur, currency,
       product_type, status,
       county, city, address,
       user_id, url, images,
       custom_fields,
       seo, created_at, updated_at
FROM public.products
ORDER BY created_at DESC
LIMIT 1;
```

### 6.4 Toate cheile din `custom_fields` (folosite în baza de date)

```sql
SELECT DISTINCT jsonb_object_keys(custom_fields) AS cheie
FROM public.products
WHERE custom_fields IS NOT NULL AND custom_fields != '{}'::jsonb
ORDER BY cheie;
```

### 6.5 Verificare produs după ID (înlocuie UUID-ul)

```sql
SELECT id, title, category, subcategory, brand, color, condition, size,
       county, city, starting_price_ron, starting_price_eur, currency,
       user_id, custom_fields
FROM public.products
WHERE id = '00000000-0000-0000-0000-000000000000';  -- înlocuie cu ID-ul real
```

### 6.6 Rezumat: câte produse au fiecare coloană populată

```sql
SELECT
  COUNT(*) AS total,
  COUNT(title) AS cu_titlu,
  COUNT(category) AS cu_categorie,
  COUNT(subcategory) AS cu_subcategorie,
  COUNT(brand) AS cu_brand,
  COUNT(color) AS cu_culoare,
  COUNT(condition) AS cu_stare,
  COUNT(size) AS cu_marime,
  COUNT(county) AS cu_judet,
  COUNT(city) AS cu_oras,
  COUNT(user_id) AS cu_user_id,
  COUNT(custom_fields) FILTER (WHERE custom_fields != '{}'::jsonb) AS cu_custom_fields
FROM public.products;
```

### 6.7 Verificare că `custom_fields` conține câmpurile așteptate (exemplu: model, ram)

```sql
SELECT id, title, category, subcategory,
       custom_fields->>'model' AS model,
       custom_fields->>'ram' AS ram,
       custom_fields->>'capacitate_stocare' AS capacitate_stocare,
       custom_fields->>'garantie' AS garantie,
       custom_fields->>'capacitate_cilindrica' AS capacitate_cilindrica,
       custom_fields->>'an' AS an,
       custom_fields->>'kilometraj' AS kilometraj
FROM public.products
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 7. Migrații relevante

| Fișier migrație | Ce adaugă |
|-----------------|-----------|
| `20251115_products_custom_fields.sql` | Tabel `products` + coloana `custom_fields` (JSONB) |
| `20260202_products_category_level3.sql` | `category_level_3` |
| `20260203_products_size.sql` | `size` |
| `20260204_products_brand_color.sql` | `brand`, `color`, `condition` |
| `20260205_products_user_id.sql` | `user_id` (pentru RLS) |
| `20251221_premium_promotion.sql` | `premium_until`, `is_premium` |
| `20260111_products_risk_score.sql` | `risk_score`, `risk_analysis_data` |
| `20260201_rag_pgvector.sql` | `approval_status`, `embedding` |

---

*Document generat pentru verificarea completă a câmpurilor produs (formular → `public.products` + `custom_fields`).*
