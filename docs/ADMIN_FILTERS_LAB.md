# Admin Filters Lab – documentație implementare

**URL:** `http://localhost:3000/admin/filters-lab` (sau `/admin/filters-lab` pe orice domeniu).

Pagina de admin pentru scanarea produselor, recategorizare recomandată (AI + rules) și aplicare în masă a categoriilor/subcategoriilor în baza de date. Permite și analiză pe un singur produs (titlu, descriere, imagine) și setarea cross-list Executări.

---

## 1. Scop

- **Scan:** Încarcă produse din `public.products` (Supabase) în batch-uri; pentru fiecare produs calculează o **categorie/subcategorie recomandată** (rules engine sau ChatGPT/Claude/Ollama + fallback rules) și detectează **locație** din titlu/descriere.
- **Mismatch:** Compară categoria/subcategoria **curentă** (din DB) cu cea **sugerată**; afișează doar produsele cu diferență (opțional) sau toate.
- **Aplicare:** Utilizatorul bifează rânduri și aplică schimbările în DB (update `category`, `subcategory`, `custom_fields.listing_main_category` / `listing_category` pentru Licitații Publice).
- **Reorganizare (per rând):** Un singur produs poate fi „reorganizat” imediat (sugerat → curent) și salvat în DB.
- **State:** Lista de produse deja „salvate” (aplicate) e persistenată în `settings` (Supabase), nu doar în memorie, ca să poți ascunde rândurile deja procesate și să eviți duplicate.

---

## 2. Autentificare

- Toate request-urile către API-urile Filters Lab necesită **admin**.
- **Frontend:** folosește `supabase.auth.getSession()` și trimite header `Authorization: Bearer <access_token>`.
- **Backend:** `requireAdmin(request)` în fiecare rută; la eșec returnează 401/403.

Asigură-te că utilizatorul este admin (ex. tabel `admin_page_permissions` sau logică echivalentă în `lib/adminAuth`).

---

## 3. Structura paginii (UI)

| Zonă | Conținut |
|------|----------|
| Header | Titlu „AI Filters Control Center”, scope LIVE BID / LICITAȚII PUBLICE, Cross-list Executări ON/OFF, totaluri surse |
| Config | Engine (rules | chatgpt | claude | ollama), Batch size (10–200), checkbox „Doar produse cu mismatch”, mesaj status scan |
| Info | Structură Licitații publice: Executări și Insolvență → exec-* → listing_category |
| Acțiuni | Start live scan (5 batch-uri), Scan next batch, Selectează confidence ≥0.8, Clear selecție, Selectează verzi/portocalii/roșii, Aplică selecția, Scanare rapidă toate, Analizează complet selecția (1) |
| Filtre listă | Verde / Portocaliu / Roșu (calitate), Ascunde deja salvate, căutare text în rânduri |
| KPI | Produse analizate, Mismatch, Rată mismatch %, Locație extrasă din descriere, Salvate în DB |
| Tabel | Coloane: Apply (checkbox), Cod anunț, Titlu, Executări și Insolvență (curent vs recomandat), Subcategorie, Mai multe detalii, Edit, Status DB, Reorganizare, Locație detectată, Engine, Conf. |
| Panou dreapta | Live scan log, Sugestii filtre noi, Propuneri categorii/subcategorii noi, Idei de optimizare |
| Modal | Scanare rapidă globală (toate produsele în batch-uri mari, listă „Necesită schimbare” vs „Nu necesită”) |
| Bloc selecție unică | După „Analizează complet selecția (1)”: sugestie îmbunătățire (curent vs sugerat, surse folosite, text sugestie, link imagine) |

---

## 4. API-uri

Baza: `/api/admin/filters-lab/...`. Toate cer **admin**.

### 4.1 GET `/api/admin/filters-lab/totals`

- **Scop:** Număr total produse per sursă (live-bid vs licitații publice).
- **Răspuns:** `{ success: true, totals: { liveBid: number, licitatiiPublice: number } }`.
- **Implementare:** Două count-uri Supabase: `product_type = 'live-bid'` și `product_type.eq.licitatii-publice,sale_type.eq.licitatii-insolventa,sale_type.eq.licitatie-publica`.

### 4.2 GET `/api/admin/filters-lab/state`

- **Scop:** Citește harta de produse „deja salvate” (persistență în DB).
- **Răspuns:** `{ success: true, savedMap: Record<productId, timestamp> }`.
- **Stocare:** Tabelul `settings`, cheie `filters_lab_saved_map`, valoare JSON `savedMap`.

### 4.3 POST `/api/admin/filters-lab/state`

- **Body:** `{ savedMap: Record<string, number> }` (productId → timestamp).
- **Scop:** Salvează harta „deja salvate” în `settings` (upsert pe `key`).
- **Răspuns:** `{ success: true, savedMap }`.

### 4.4 POST `/api/admin/filters-lab/scan`

- **Body:** `{ offset: number, limit: number, mode: "rules"|"chatgpt"|"claude"|"ollama", onlyMismatched: boolean, listingScope: "all"|"live-bid"|"licitatii-publice" }`.
- **Scop:** Scan batch de produse; pentru fiecare calculează categorie/subcategorie sugerată și locație (din titlu/descriere).
- **Răspuns:**  
  `{ success, rows: ScanRow[], logs: string[], filterSuggestions, newCategoryCandidates, optimizationIdeas, summary: { mismatchedCount, matchedCount, mismatchRate, locationInferredCount? }, meta: { scanned, nextOffset, hasMore }, totals?: { liveBid, licitatiiPublice } }`.

**Tip `ScanRow`:**  
productId, slug, announcementUrl, announcementCode, title, isLicitatiiPublice, currentCategory, currentSubcategory, currentListCategory, suggestedCategory, suggestedSubcategory, suggestedListCategory, confidence, engine, mismatch, city, inferredLocation, locationSource, locationConfidence.

- **Logică scan:**  
  - Filtrare produse după `listingScope` (all / live-bid / licitatii-publice).  
  - Pentru fiecare rând: rules (sau AI dacă mode !== "rules") → sugerat; compară cu curent → mismatch.  
  - Locație: din `city`/county existent sau extrasă din descriere (regex-uri pentru str/județ/localitate etc.).

### 4.5 POST `/api/admin/filters-lab/apply`

- **Body:** `{ changes: { productId, categorySlug, subcategorySlug, listCategory? }[], dryRun?: boolean }`.
- **Scop:** Aplică recategorizarea în `public.products`: actualizează `category`, `subcategory` și, pentru produse Licitații Publice, `custom_fields.listing_main_category` / `listing_category`. Opțional înlocuiește imaginea cu cea default de categorie dacă nu există imagine „reală”.
- **Răspuns:** `{ success, updated: number, failed?: number, errors?: { productId, error }[] }`.

### 4.6 POST `/api/admin/filters-lab/reanalyze`

- **Body:** `{ productId: string }`.
- **Scop:** Reanaliză un singur produs (titlu, titlu scurt, descriere, imagine) și returnează sugestie îmbunătățire.
- **Răspuns:** obiect de tip `SingleSelectionInsight`: productId, current { category, subcategory }, suggested { category, subcategory, confidence, engine }, analyzedFrom { title, shortTitle, description, image }, imageUrl, improvementSuggestion, needsChange.

---

## 5. Fluxuri principale

1. **Scan inițial**  
   Utilizator: scope (all / live-bid / licitatii-publice), engine, batch size, „Doar mismatch” → Start live scan (5 batch-uri) sau Scan next batch.  
   Frontend: POST `/api/admin/filters-lab/scan` cu offset/limit; afișează `rows`, summary, logs, sugestii, propuneri, idei.

2. **Selecție și aplicare**  
   Utilizator: bifează rânduri (sau „Selectează confidence ≥0.8” / „Selectează verzi” etc.) → Aplică selecția.  
   Frontend: POST `/api/admin/filters-lab/apply` cu `changes` pentru rândurile bifate care au `mismatch`; apoi actualizează state local și POST `/api/admin/filters-lab/state` cu noul `savedMap`.

3. **Reorganizare un rând**  
   Utilizator: click „Reorganizare” pe un rând.  
   Frontend: POST apply cu un singur element (sugerat → curent); actualizează `savedMap` și rândul în listă (curent = sugerat, mismatch = false).

4. **Analiză un produs**  
   Utilizator: selectează un singur rând → „Analizează complet selecția (1)”.  
   Frontend: POST `/api/admin/filters-lab/reanalyze` cu productId; afișează blocul cu SingleSelectionInsight.

5. **Scan rapid global**  
   Utilizator: deschide modal „Scanare rapidă toate produsele” → Start scanare rapidă.  
   Frontend: loop POST scan cu batch 200, până la hasMore false sau max 60 batch-uri; împarte rândurile în „Necesită schimbare” vs „Nu necesită”.

---

## 6. Calitate rând (verde / portocaliu / roșu)

- **Verde:** (confidence ≥ 0.88 și mismatch și locație bună) sau (fără mismatch și confidence ≥ 0.9).  
  Etichetă: „Excelent - salvează”.
- **Portocaliu:** confidence ≥ 0.65 și nu (mismatch și locație lipsă și confidence locație < 0.4).  
  Etichetă: „Review necesar”.
- **Roșu:** restul.  
  Etichetă: „Modifică / completează”.

Filtrele de status (Verde / Portocaliu / Roșu) și „Ascunde deja salvate” se aplică în frontend pe `rows` înainte de afișare (`visibleRows`).

---

## 7. Licitații publice / Executări

- Produse cu `product_type = 'licitatii-publice'` sau `sale_type` licitatii-insolventa/licitatie-publica sunt tratate ca **Licitații Publice**.
- Categoria principală afișată: „Executări și Insolvență” (slug `executari`).
- Subcategoriile sunt din `RO_CATEGORIES.executari.subcategories` (ex. exec-imobiliare, exec-autovehicule, oferte-grupate).
- La **apply**, pentru aceste produse se forțează `category = 'executari'` și se persistă detaliile în `custom_fields.listing_main_category` / `listing_category`.

---

## 8. Fișiere relevante

| Fișier | Rol |
|--------|-----|
| `app/admin/filters-lab/page.tsx` | Pagina UI (client component): state, scan, apply, state persistence, reorganizare, reanalyze, bulk scan modal |
| `app/api/admin/filters-lab/scan/route.ts` | Scan batch: citește produse, rules + opțional AI, locație, returnează rows + summary + sugestii |
| `app/api/admin/filters-lab/apply/route.ts` | Aplicare schimbări în `products`: category, subcategory, custom_fields, eventual imagine default |
| `app/api/admin/filters-lab/state/route.ts` | GET/POST state „saved map” în `settings` |
| `app/api/admin/filters-lab/totals/route.ts` | GET totaluri liveBid / licitatiiPublice |
| `app/api/admin/filters-lab/reanalyze/route.ts` | POST reanaliză 1 produs (titlu, descriere, imagine) |
| `lib/search/categoryRules.ts` | `inferIntentCategoriesFromQuery` – folosit în rules engine |
| `lib/data/ro-categories.ts` | `RO_CATEGORIES`, `RO_SUBCATEGORY_NAMES` – sursă pentru slug-uri și etichete |

---

## 9. Implementare corectă – checklist

- [ ] Admin: doar utilizatori cu permisiune pot accesa `/admin/filters-lab` și API-urile `/api/admin/filters-lab/*`.
- [ ] Scan: filtrare după `listingScope` (all / live-bid / licitatii-publice) aliniată cu `totals` (același `product_type` / `sale_type`).
- [ ] Apply: update `category` / `subcategory`; pentru Licitații Publice și `custom_fields.listing_main_category` / `listing_category`; validare slug-uri în `RO_CATEGORIES` / `RO_SUBCATEGORY_NAMES`.
- [ ] State: cheie fixă `filters_lab_saved_map` în `settings`; valoare JSON `Record<productId, timestamp>`; migrare opțională de pe localStorage (legacy) la primul load dacă DB e gol.
- [ ] Reorganizare: un singur apply cu sugerat → curent; apoi actualizare savedMap și rând local.
- [ ] Locație: consistentă între scan și reanalyze (regex-uri pentru str/județ/oras în descriere); `locationSource`: existing | description | none.
- [ ] Cross-list Executări: toggle-ul apelează `/api/admin/ro-crosslist` (GET/POST); nu face parte din filters-lab dar e pe aceeași pagină.

Dacă vrei extinderi (ex. export CSV, filtre suplimentare în scan, alte engine-uri), poți folosi acest doc ca bază și menține contractul API și tipurile `ScanRow` / `ApplyChange` / `SingleSelectionInsight` pentru compatibilitate.
