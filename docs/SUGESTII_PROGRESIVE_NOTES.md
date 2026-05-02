# Progressive Suggestions – Ranking Rules & Examples

**Implementation:** `app/api/search/suggestions/route.ts`

## A. Query normalization (`normalizeQueryForProgressive`)

- `raw`: trim of input
- `normalized`: trim + lowercase + strip diacritics (NFD + remove combining marks)
- `tokens`: split by whitespace
- `alphaTokens`: tokens with letters only (e.g. "xj")
- `numericTokens`: tokens containing digits (e.g. "2002", "3996")
- `hasDigits`: true if q contains digits
- `length`: normalized length

## B. Gating (praguri)

| q.length | Behavior |
|----------|----------|
| < 3 | `products` = []. Only brand / category / subcategory. |
| 3–4 | Products only if: score ≥ 80 AND no numeric noise. Numeric noise = q has no digits AND suggestion has digit count > 2. |
| ≥ 5 | Products allowed with full scoring. |

## C. Scoring (`scoreProductSuggestion`)

| Rule | Points |
|------|--------|
| Prefix match on first alpha token (e.g. q="jagu" → "jaguar") | +100 |
| Prefix match on subsequent alpha tokens | +60 |
| Contains match for alpha tokens | +30 |
| Bonus: q is prefix of brand | +20 |
| Penalty: many digits when q has no digits | -40 |
| Penalty: suggestion > 45 chars when q.length < 6 | -25 |

## D. Dedupe + diversity

- **Dedupe:** case-insensitive, by normalized title (strip diacritics).
- **Hyper-specific:** (≥2 numeric tokens in title) OR (title > 40 chars AND ≥1 digit).
- **Limit:** max 2 hyper-specific in top 6–8.
- **Order:** brands → categories → subcategories → products.

## E. Output

- Same JSON shape (brands, categories, subcategories, products, suggestions, meta, used).
- No new root keys.

## F. Debug

`DEBUG_SUGGESTIONS=1` (or any truthy) logs:
- `q`, `tokens`
- Top 10 candidates with `score` and `reason` (e.g. "prefix first token", "numeric penalty").

## Examples

| Query | Expected |
|-------|----------|
| `ja` | `payload.products` = []. Only brand/category if they match. |
| `jagu` | Top: "Jaguar …" simple. No "jaguar xj 2002 3996" in top. |
| `jaguar xj` | XJ products in top. |
| `jaguar 2002` | Products with year 2002 allowed (q has digits). |
| `iasi` / `iași` | Same results (diacritics normalized). |
