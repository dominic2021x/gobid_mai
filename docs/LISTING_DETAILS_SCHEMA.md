# Listing details schema (Executări și Insolvență)

## Architecture summary

- **Single source of truth:** `(channel, category, subcategory)` → detail field schema.
- **Registry:** `lib/listings/details/fieldRegistry.ts` – static mapping of Executări subcategory slug → ordered `DetailFieldDef[]` (label + `custom_fields` keys).
- **Schema resolution:** `getDetailSchema({ channel, category, subcategory })` → `DetailSchema | null`. Returns `null` for unknown subcategory or non-Executări; no section is rendered.
- **Row building:** `getDetailRows({ schema, listing, formatDateDisplay, isAuctionInPast, priceDisplay })` → `DetailRow[]`. Only non-empty values; common fields (Cod anunț, Preț, Categorie, Tip vânzare, Județ, Oraș, Data/Ora licitației) added first when schema has `commonFieldKeys`.
- **Render guard:** Section is rendered only if `hasDisplayableDetailRows(rows)` (at least one row with value ≠ "—").

## File paths

| Path | Purpose |
|------|--------|
| `lib/listings/details/types.ts` | `DetailFieldDef`, `DetailSchema`, `DetailRow`, `ListingDetailSource`, `DetailChannel` |
| `lib/listings/details/fieldRegistry.ts` | `EXECUTARI_DETAIL_FIELDS_BY_SUBCATEGORY`, `normalizeSubcategorySlug`, `isKnownExecutariSubcategory`, `getExecutariDetailFieldsForSubcategory` |
| `lib/listings/details/getDetailSchema.ts` | `getDetailSchema(params)` – returns schema or null |
| `lib/listings/details/getDetailRows.ts` | `getDetailRows(params)`, `hasDisplayableDetailRows(rows)` |
| `lib/listings/details/index.ts` | Re-exports |
| `app/licitatii-publice/[slug]/page.tsx` | Uses schema + getDetailRows; renders "Informații despre licitație" only when schema exists and rows are displayable |

## Subcategory-specific fields

- **exec-imobiliare:** Tip imobil, Categorie teren, Camere, Etaj, Suprafață.
- **utilaje-echipamente:** Marca, Model, An fabricație, Stare, Capacitate motor, Putere.
- **exec-autovehicule:** Marca, Model, Kilometraj, Combustibil, An fabricație, Capacitate cilindrică.
- **exec-industrial / exec-afaceri / exec-office / exec-altele:** Tip bun (minimal).
- **oferte-grupate:** None (only common row).

## Caching / performance

- No DB reads; mapping is in-code. No TTFB impact.
- Callers can wrap `getDetailSchema` in `cache()` or `unstable_cache` if used from Server Components; current use is client-side in licitatii-publice page (one call per product).

## Security

- Channel is fixed to `executari_insolventa` on the product page; not taken from URL.
- All values rendered as text (no `dangerouslySetInnerHTML`).
- Token gating is handled by the page; this module only shapes which fields are shown.

## Edge cases

- **Unknown subcategory:** `getDetailSchema` returns `null` → section not rendered.
- **Schema exists but all values empty:** `hasDisplayableDetailRows(rows)` false → section not rendered.
- **Numeric 0:** Treated as valid (not empty).
- **Romanian diacritics:** `normalizeSubcategorySlug` used for lookup so slug matches regardless of diacritics.

## Imobiliare

- Unchanged. Filter "Mai multe detalii" on /ro and list_category in admin remain as before. Imobiliare-specific form fields stay in `lib/imobiliare-fields.ts`.

## Quick win (current)

- Hardcoded mapping in `fieldRegistry.ts` for all Executări subcategories.

## Premium (future)

- Full mapping + unit tests for `getDetailSchema` / `getDetailRows` + admin UI to edit labels/cfKeys per subcategory (read from config or DB).

## Enterprise (future)

- DB-driven schema, versioning, audit log, A/B tests per schema variant.
