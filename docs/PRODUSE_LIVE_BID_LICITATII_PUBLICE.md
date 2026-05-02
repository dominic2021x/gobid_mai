# Structura produselor: live_bid și licitatii_publice

Document de referință pentru structura datelor și a rutelor pentru produsele de tip **live_bid** (licitații live) și **licitatii_publice** (licitații publice / insolvență / ANAF / executori).

---

## 1. Principiu comun

Ambele tipuri de produse folosesc **același tabel**: `products`. Diferențierea se face prin:

- **`product_type`** – tipul principal: `'live-bid'` sau `'licitatii-publice'`
- **`sale_type`** – subtip (în special pentru licitații publice): `'licitatii-insolventa'`, `'licitatie-publica'`, `'licitatii-anaf'`, `'licitatii-executori'` etc.

În listări și filtre, un produs este considerat **licitație publică** dacă:
`product_type = 'licitatii-publice'` **SAU** `sale_type IN ('licitatii-insolventa', 'licitatie-publica')`.

---

## 2. Tabelul `products` (schema comună)

Toate câmpurile relevante pentru live_bid și licitatii_publice:

| Coloană | Tip | Descriere |
|--------|-----|-----------|
| `id` | UUID | PK, generat |
| `created_at`, `updated_at` | timestamptz | |
| `title` | string | Titlul anunțului |
| `description` | string | Descriere (text/HTML) |
| `category` | string | Categorie principală (ex: auto, imobiliare) |
| `subcategory` | string | Subcategorie |
| `category_level_3` | string? | Nivel 3 categorii |
| `sku` | string | UNIQUE, identificator intern |
| **Prețuri** | | |
| `starting_price` | decimal? | Preț pornire |
| `starting_price_ron`, `starting_price_eur` | decimal? | Prețuri în RON/EUR |
| `currency` | string? | RON / EUR |
| `exchange_rate`, `exchange_rate_updated_at` | decimal? / timestamptz? | Curs valutar |
| `discount_percent`, `discount_value_ron`, `discount_value_eur` | decimal? | Reduceri |
| `discounted_price_ron`, `discounted_price_eur` | decimal? | Preț după reducere |
| **Tip produs** | | |
| **`product_type`** | **string?** | **`'live-bid'` \| `'licitatii-publice'`** (sau null/altceva) |
| **`sale_type`** | **string?** | **`'licitatii-insolventa'`, `'licitatie-publica'`, `'licitatii-anaf'`, `'licitatii-executori'`** etc. |
| `insolventa_direct_sale` | boolean? | Vânzare directă insolvență |
| `buy_now_enabled`, `buy_now_price_ron`, `buy_now_price_eur` | boolean? / decimal? | Cumpărare directă |
| **Locație / licitație** | | |
| `product_location`, `auction_location` | string? | Locație produs / licitație |
| `auction_date`, `auction_registration_date` | timestamptz? | Data (și ora) licitației |
| `county`, `city`, `address` | string? | Județ, localitate, adresă |
| `coordinates` | json? | Coordonate (lat/lng) |
| **Conținut** | | |
| `images` | json? | Array URL-uri imagini (default `[]`) |
| `documents` | json? | Array documente (default `[]`) |
| **`custom_fields`** | **json?** | **Câmpuri libere (executor, cod anunț, preț text, etc.)** |
| **`attributes`** | **json?** | **Atribute structurate (brand, model, suprafață, etc.)** |
| `seo` | json? | Metadate SEO |
| **Status și moderare** | | |
| `status` | string? | `'draft'`, `'active'`, etc. (default `'draft'`) |
| `approval_status` | string? | ex. `'approved'` (default) |
| `rejection_reason`, `approved_at`, `approved_by` | string? / timestamptz? / uuid? | Moderare |
| **Utilizator / premium** | | |
| `user_id` | uuid? | **Proprietar/vânzător (obligatoriu pentru live_bid)** |
| `premium_until`, `is_premium` | timestamptz? / boolean | Promovare |
| `risk_score`, `risk_analysis_data` | decimal? / json? | Scor risc |
| **Slug / URL** | | |
| `slug` | string? | UNIQUE, folosit în rute |
| `url` | string? | URL complet (ex: `/licitatii-publice/...`) |
| **Atribute produs (filtre)** | | |
| `size`, `brand`, `model`, `color`, `condition` | string? | Pentru filtre și listări |
| `sold_at` | timestamptz? | Data vânzării |
| **Embedding** | | |
| `embedding` | vector? | Pentru căutare semantică |

**Indexuri relevante:**

- `idx_products_lp_scope`: `(product_type, sale_type, category, subcategory)` – unde `product_type = 'licitatii-publice'` sau `sale_type` în ('licitatii-insolventa','licitatie-publica').
- Alte indexuri: `status`, `user_id`, `category/subcategory`, `brand`, `model`, `auction_date`, etc.

---

## 3. Live Bid (`product_type = 'live-bid'`)

### Identificare

- **`product_type`**: `'live-bid'`
- **`sale_type`**: de obicei null sau alt tip (nu licitatii-insolventa/licitatie-publica)
- **Rută frontend**: **`/live_bid/[slug]`** (ex: `/live_bid/masina-xyz`)
- **URL produs**: `url` sau `/live_bid/{slug}`

### Relații importante

- **`user_id`**: utilizatorul care pune anunțul la licitație (vânzător).
- **`bids`**: oferte (tabelul `bids`: `product_id`, `user_id`, `amount`, `is_winning`, `is_outbid`, etc.) – folosit doar pentru live_bid.

### Surse date

- Produsele live_bid sunt create de utilizatori (executori/vânzători) prin flow-uri de creare anunț (dashboard, import executor etc.), nu din sync-uri insolvență/ANAF.

### Custom fields / attributes (exemple)

- `custom_fields`: pot conține `city`, `suprafata`, `camere`, `an`, `kilometraj`, `motor`, `putere` etc., în funcție de categorie.
- `attributes`: folosit pentru evaluare preț și filtre (surface, rooms, year, mileage, etc.).

### Fișiere cheie

- **Pagină**: `app/live_bid/[slug]/page.tsx`
- **Listări**: filtre în `app/api/ro/listings`, `app/api/admin/filters-lab/scan/route.ts` cu `product_type = 'live-bid'`

---

## 4. Licitații publice (`product_type = 'licitatii-publice'` sau `sale_type` insolvență/publică)

### Identificare

- **`product_type`**: `'licitatii-publice'` **SAU**
- **`sale_type`**: `'licitatii-insolventa'`, `'licitatie-publica'`, `'licitatii-anaf'`, `'licitatii-executori'`
- **Rută frontend**: **`/licitatii-publice/[slug]`** (ex: `/licitatii-publice/imobil-bucuresti`)
- **URL produs**: `url` sau `/licitatii-publice/{slug}`

### Relații și surse date

1. **`licitatii_insolventa_listings`**  
   - Tabel sursă pentru licitații insolvență (scraping/sync).  
   - Câmp: **`product_id`** → `products.id`.  
   - Un produs `products` poate avea **un** listing insolvență asociat (`licitatii_insolventa_listings.product_id`).

2. **`anaf_licitatii`**  
   - Tabel sursă pentru licitații ANAF (import).  
   - Câmp: **`product_id`** → `products.id`.  
   - Produsul este creat din ANAF cu `product_type: 'licitatii-publice'`, `sale_type: 'licitatii-anaf'`.

3. **Import executori**  
   - Produse create din panoul executor cu `product_type: 'licitatii-publice'`, `sale_type: 'licitatii-executori'`.

### Custom fields (exemple pentru licitatii_publice)

- Licitator, Email, Telefon, Adresă, Cod fiscal, Competență
- `price_text`, `location_raw`, `auction_time`
- `executor_name`, `executor_email`, `executor_phone`, `executor_address`
- `source_url`, `source_external_id`
- Pentru ANAF: câmpuri specifice din `anaf_licitatii` (judet, localitate, tip_bun, etc.) mapate în `custom_fields` sau în produs.

### Fișiere cheie

- **Pagină**: `app/licitatii-publice/[slug]/page.tsx`
- **API**: `app/api/licitatii-publice/` (fill-auction-from-description, executor-meta, etc.)
- **Admin**: `app/api/admin/licitatii-insolventa/`, `app/api/admin/executari-publice/`, publish/regenerate
- **Creare produs ANAF**: `lib/anaf/productCreator.ts` (product_type: `'licitatii-publice'`, sale_type: `'licitatii-anaf'`)

---

## 5. Tabele auxiliare

### `bids` (doar pentru live_bid)

| Coloană | Tip | Descriere |
|--------|-----|-----------|
| `id` | uuid | PK |
| `product_id` | uuid | FK → products.id |
| `user_id` | uuid | FK → users.id |
| `amount` | decimal(10,2) | Suma ofertei |
| `is_winning`, `is_outbid` | boolean? | Status ofertă |
| `created_at` | timestamptz? | |
| `is_private` | boolean | |

### `licitatii_insolventa_listings`

| Coloană | Tip | Descriere |
|--------|-----|-----------|
| `id` | uuid | PK |
| `source_external_id` | string | UNIQUE, ID sursă |
| `source_url` | string | URL sursă |
| `title`, `price_text`, `category` | string? | |
| `location_raw`, `location_city`, `location_county` | string? | |
| `description_html` | string? | |
| `seller_name`, `seller_profile_url`, `seller_email`, `seller_phone`, `seller_address` | string? | |
| `published_at`, `auction_date`, `auction_time` | timestamptz? / string? | |
| `sale_type` | string? | |
| `pdf_url`, `pdf_urls` (json?) | string? / json? | |
| `last_seen_at`, `deleted_at`, `reactivated_at` | timestamptz | |
| **`product_id`** | **uuid?** | **FK → products.id** |
| `main_category` | string? | |
| `info_*` (marca, km, combustibil, suprafata, camere, etc.) | string? | Atribute specifice |
| `meta_fields` | json? | |

### `licitatii_insolventa_listing_images`

| Coloană | Tip | Descriere |
|--------|-----|-----------|
| `id` | uuid | PK |
| `listing_id` | uuid | FK → licitatii_insolventa_listings.id |
| `url` | string | URL imagine |
| `sort_order` | int | |

### `anaf_licitatii`

| Coloană | Tip | Descriere |
|--------|-----|-----------|
| `id` | uuid | PK |
| `import_id` | uuid? | FK → anaf_imports.id |
| **`product_id`** | **uuid?** | **FK → products.id** (produs creat din ANAF) |
| `numar_licitatie`, `data_licitatie`, `ora_licitatie`, `loc_licitatie` | string? / date? / time? | |
| `tip_bun`, `categoria_teren` | string? | |
| `suprafata_totala`, `unitate_suprafata` | decimal? / string? | |
| `judet`, `localitate`, `adresa` | string | |
| `coordinates` | json? | |
| `nume_contribuabil`, `pret_evaluare`, `tva_inclus`, `valoare_tva`, `moneda` | string? / decimal? / boolean? | |
| `conditii_suplimentare` (json), `detalii_relevante`, `pdf_url`, `pdf_storage_path` | json / string? | |
| `status`, `product_created` | string / boolean? | |
| `metadata` | json | |
| `lat`, `lng`, `street_view_image_url` | float? / string? | |

---

## 6. Rezumat rapid

| Aspect | live_bid | licitatii_publice |
|--------|----------|-------------------|
| **Tabel principal** | `products` | `products` |
| **product_type** | `'live-bid'` | `'licitatii-publice'` |
| **sale_type** | (altceva sau null) | `licitatii-insolventa`, `licitatie-publica`, `licitatii-anaf`, `licitatii-executori` |
| **Rută** | `/live_bid/[slug]` | `/licitatii-publice/[slug]` |
| **Relație oferte** | `bids` (product_id) | — |
| **Sursă date** | Utilizatori (dashboard/import) | `licitatii_insolventa_listings`, `anaf_licitatii`, import executori |
| **Tabel sursă → produs** | — | `licitatii_insolventa_listings.product_id`, `anaf_licitatii.product_id` |

Această structură este sursa unică de adevăr pentru rute, filtre (`listingScope`: `live-bid` vs `licitatii-publice`) și pentru orice logică care diferențiază cele două tipuri de produse.
