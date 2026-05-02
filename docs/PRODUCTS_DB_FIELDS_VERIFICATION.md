# Verificare câmpuri produse – baza de date

## Tabelul `public.products`

### Coloane în tabel (migrații)

| Coloană | Migrație | Folosit în formular |
|--------|----------|----------------------|
| `id` | 20251115 | auto |
| `title` | 20251115 | Da (Titlu) |
| `description` | 20251115 | Da (Descriere) |
| `slug` | 20251115 | generat |
| `sku` | 20251115 | Da (SKU) |
| `category` | 20251115 | Da (Categorie) |
| `subcategory` | 20251115 | Da (Subcategorie) |
| `category_level_3` | 20260202 | Da (Nivel 3) |
| `size` | 20260203 | Da (Mărime) |
| `brand` | 20260204 | Da (Brand) |
| `color` | 20260204 | Da (Culoare) |
| `condition` | 20260204 | Da (Stare) |
| `starting_price` | 20251115 | Da (Preț) |
| `starting_price_ron` | 20251115 | Da |
| `starting_price_eur` | 20251115 | Da |
| `currency` | 20251115 | Da |
| `product_type` | 20251115 | live-bid / etc. |
| `sale_type` | 20251115 | (executor) |
| `status` | 20251115 | draft / active |
| `county` | 20251115 | Da (Județ) |
| `city` | 20251115 | Da (Oraș) |
| `address` | 20251115 | Da (Adresă) |
| `product_location` | 20251115 | (executor) |
| `auction_date` | 20251115 | (executor) |
| `auction_registration_date` | 20251115 | (executor) |
| `auction_location` | 20251115 | (executor) |
| `custom_fields` | 20251115 | JSONB – vezi mai jos |
| `seo` | 20251115 | Da (SEO) |
| `documents` | 20251115 | - |
| `images` | 20251115 | Da (Imagini) |
| `url` | 20251115 | generat |
| `created_at` | 20251115 | auto |
| `updated_at` | 20251115 | auto |
| `premium_until` | 20251221 | - |
| `is_premium` | 20251221 | - |
| `risk_score` | 20260111 | - |
| `risk_analysis_data` | 20260111 | - |
| **`user_id`** | **trebuie adăugat** | **Da (proprietar)** – folosit în RLS, lipsește din CREATE TABLE |

### Câmpuri în `custom_fields` (JSONB)

Toate acestea se salvează în `custom_fields` (nu ca coloane separate):

| Cheie în custom_fields | Câmp formular | Categorie |
|------------------------|---------------|-----------|
| `model`, `model_label` | Model | Auto / Telefoane |
| `capacitate_cilindrica` | Capacitate cilindrică (L) | Auto |
| `ram` | RAM (GB) | Telefoane |
| `capacitate_stocare` | Capacitate stocare (GB) | Telefoane |
| `garantie` | Garanție | Telefoane / Console |
| `village` | Sat | Locație |
| `an` | An fabricare | Auto |
| `kilometraj` | Kilometraj | Auto |
| `combustibil` | Combustibil | Auto |
| `transmisie` | Transmisie | Auto |
| `putere` | Putere (KW) | Auto |
| `caroserie` | Tip caroserie | Auto |
| `serie_sasiu` | Serie șasiu | Auto |
| `clasa_emisii` | Clasa emisii | Auto |
| `nrLocuri` | Număr locuri | Auto |
| … + orice alt câmp din „Caracteristici specifice” per subcategorie | Dinamic | Diverse |

## Concluzie

- Coloanele din formular (brand, model logic, culoare, stare, categorie, subcategorie, preț, județ, oraș etc.) sunt acoperite: fie ca coloane (`brand`, `color`, `condition`, `size`, `category`, `subcategory`, `county`, `city`), fie în `custom_fields` (model, ram, capacitate_stocare, garantie, an, kilometraj, etc.).
- **`user_id`** este folosit în politicile RLS („Users can view/update their own products”) dar **nu apare** în `CREATE TABLE` din `20251115_products_custom_fields.sql`. Trebuie adăugat prin migrație dacă lipsește în baza ta.

## Migrație recomandată

Rulează migrația `20260205_products_user_id.sql` pentru a adăuga `user_id` la `products` dacă nu există.
