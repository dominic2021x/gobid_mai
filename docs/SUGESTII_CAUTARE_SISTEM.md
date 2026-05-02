# Sistemul de sugestii de căutare – generare și afișare

Documentație exactă: cum se generează sugestiile și cum se afișează în search. Poate fi folosită pentru a face update-uri coerente.

---

## 1. Sursele de sugestii (de unde vin)

Există **trei surse** care alimentează ce vede utilizatorul:

| Surse | Unde se generează | Unde se salvează | Unde se folosesc |
|-------|--------------------|------------------|-------------------|
| **A) Căutări frecvente** (la focus, fără tastare) | 1) Listă statică în cod<br>2) Admin „Generează Sugestii” | 1) Cod: `POPULAR_SEARCH_SUGGESTIONS`<br>2) `localStorage.aiSuggestions` | Header (desktop + mobil): secțiunea „Căutări frecvente” |
| **B) Sugestii dinamice** (când user tastează ≥2 caractere) | API `GET /api/search/suggestions?q=...` | Răspuns JSON (nu se salvează) | Header: „Sugestii rapide” și „SUGESTII” (fallback) |
| **C) Istoric căutări** (opțional) | API `GET /api/search/history` (cu Bearer token) | Supabase | API-ul de sugestii le include în răspuns dacă sunt autentificat |

---

## 2. Generarea – în detaliu

### 2.1. „Căutări frecvente” – două variante

**Varianta 1 – Listă statică (implicit)**

- **Fișier:** `components/UniversalHeader.tsx`
- **Constantă:** `POPULAR_SEARCH_SUGGESTIONS` (linii ~35–52)
- **Conținut:** listă fixă, ex: `["Autoturisme", "Apartamente", "Piese auto", "Terenuri", "iPhone", ...]`
- **Folosire:** dacă nu există sugestii generate din Admin, header-ul afișează această listă la secțiunea „Căutări frecvente”.

**Varianta 2 – Din Admin „Generează Sugestii”**

- **Fișier:** `app/admin/ai-drive/page.tsx` – funcția `handleGenerateSuggestions`
- **Pasii:**
  1. Citește din Supabase toate produsele active/aprobate (cu `title`).
  2. Construiește un obiect:
     - `products`: toate titlurile produselor
     - `categories`: toate valorile distincte din `category` + `subcategory`
     - `brands`: branduri detectate din titluri (listă fixă de cuvinte: bmw, mercedes, apple, samsung, etc.)
  3. Salvează **doar în `localStorage`** sub cheia `"aiSuggestions"` (JSON).
- **Limitări:**
  - Nu se salvează în baza de date.
  - Se aplică **doar pe browser-ul** unde admin-ul a dat „Generează Sugestii”.
  - Header-ul citește `localStorage` la montare și când se deschide dropdown-ul; dacă există `aiSuggestions`, folosește acea listă pentru „Căutări frecvente” în loc de `POPULAR_SEARCH_SUGGESTIONS`.

**Cum alege header-ul între cele două:**

- **Fișier:** `components/UniversalHeader.tsx`
- **State:** `popularSuggestionsFromStorage` (încărcat din `localStorage.aiSuggestions`).
- **Afișare:**  
  `(popularSuggestionsFromStorage && popularSuggestionsFromStorage.length > 0) ? popularSuggestionsFromStorage : POPULAR_SEARCH_SUGGESTIONS`
- Deci: dacă există sugestii generate, se afișează ele (categorii + branduri + primele 20 produse, max 24 elemente); altfel lista statică.

---

### 2.2. Sugestii dinamice – API `GET /api/search/suggestions`

- **Fișier:** `app/api/search/suggestions/route.ts`
- **Parametru:** `q` (query, minim 2 caractere).
- **Răspuns:** JSON cu: `suggestions`, `subcategories`, `products`, `brands`, `categories`, eventual `corrected`, `time`.

**Cum se construiesc sugestiile în API (ordine logică):**

1. **Categorii/subcategorii reale din DB**  
   - Se citesc din `products` (active/aprobate, fără deleted) toate perechile `(category, subcategory)` distincte.  
   - Orice sugestie de tip categorie/subcategorie este filtrată să existe în aceste seturi („reale”).

2. **Branduri**  
   - Listă fixă în cod (`BRANDS_PREFIX_ENTRIES`): bmw, mercedes, audi, apple, samsung, etc.  
   - Se potrivesc după prefix (≥2 caractere); se returnează ex. „Toate produsele BMW” + categoria (Autovehicule).

3. **Categorii/subcategorii din listă statică**  
   - `CATEGORY_SUGGESTIONS` + `getCategoriesAndSubcategories(lowerQuery)`: potrivire după termeni (inclusiv greșeli frecvente).  
   - Se păstrează doar cele care există în seturile „reale” de categorii/subcategorii din DB.

4. **Sugestii din titlurile produselor**  
   - Query către `products`: `title`, `description`, `category`, `subcategory` (ilike).  
   - Din fiecare titlu se extrag sugestii prin `extractSuggestionsFromTitle()` (ex: piese auto + model, combinații cu culori, etc.).  
   - Se filtrează după `lowerQuery`, se sortează (exact match, prefix), se limitează (ex. 15).  
   - Categoria afișată se poate infera din text cu `inferCategoryFromSuggestionText()`.

5. **Produse (obiecte)**  
   - Alt query către `products`: titlu/descriere/categorie/subcategorie; până la 5–10 produse cu `id`, `title`, `images`, `starting_price_ron`, `url`/`slug` pentru link.

6. **Completare până la 12 sugestii**  
   - Dacă `subcategoriesForResponse` are mai puțin de 12 elemente:
     - `getRelatedSuggestions()` (ex. „iphone 12” → iphone 13, 14, 15…)
     - `getKeywordSuggestions()` (tel → Telefoane, lap → Laptopuri, etc.)
     - pentru prefixe „ip”/„iphone”: listă fixă de sugestii iPhone.

**Forma finală a răspunsului:**

- `suggestions`: mix de branduri, categorii, sugestii din titluri, subcategorii (max ~25).
- `subcategories`: array de obiecte `{ display, q, brand?, category?, subcategory? }` (folosit pentru „Sugestii rapide” în header).
- `products`: array de obiecte produs (imagine, preț, url) – folosit pentru afișare produse în dropdown (dacă UI-ul le folosește).

---

## 3. Afișarea în search (header)

**Fișier principal:** `components/UniversalHeader.tsx`

### 3.1. Când se deschide dropdown-ul

- La **focus** pe câmpul de căutare: `onFocus={() => setShowSearchSuggestions(true)}`.
- La **≥2 caractere** se apelează API-ul (debounce 300 ms): `fetchSuggestions(searchQuery)` → `GET /api/search/suggestions?q=...`.

### 3.2. Structura dropdown-ului (desktop și mobil, similar)

1. **Secțiune „Căutări frecvente”** (mereu vizibilă)
   - Conținut: `popularSuggestionsFromStorage` dacă există și nu e gol, altfel `POPULAR_SEARCH_SUGGESTIONS`.
   - Fiecare element e un link către `/ro?q=...`.
   - La deschiderea dropdown-ului se poate reîncărca `localStorage` (ca după „Generează Sugestii” să apară imediat).

2. **Secțiune „Sugestii rapide”** (doar dacă `searchQuery.trim().length >= 2` și există `searchSubcategories`)
   - Conținut: `searchSubcategories` (primele 12) – vine din `data.subcategories` din API.
   - Fiecare element: `display`, `category`/`subcategory`, eventual `brand`.
   - La click: `handleSuggestionClick(s)` → navigare la `/ro?q=s.q`.

3. **Secțiune „SUGESTII” (fallback)** (dacă user a tastat ≥2 caractere, dar `searchSubcategories` e gol și `searchSuggestions` nu e gol)
   - Conținut: `searchSuggestions` (primele 12) – vine din `data.suggestions` din API.
   - La click: `handleSuggestionClick(suggestion)` → navigare cu `suggestion.q`.

4. **Produse**  
   - `productSuggestions` vine din `data.products` din API. Dacă în UI există un bloc pentru „produse” în dropdown, acesta le folosește (imagine, titlu, link).

### 3.3. Flux date din API în state (header)

- `fetchSuggestions(query)`:
  - `data.subcategories` → `setSearchSubcategories(subcategories)`
  - `data.suggestions` → `setSearchSuggestions(data.suggestions)`
  - `data.products` → `setProductSuggestions(uniqueProducts)`
  - Dacă există măcar una dintre ele → `setShowSearchSuggestions(true)`.

---

## 4. Alte locuri care folosesc același API

- **`app/ro/page.tsx`** – folosește `GET /api/search/suggestions?q=...` pentru sugestii pe pagina de rezultate.
- **`app/components/HeroSearchBar.tsx`** – același endpoint, pentru bara de căutare din hero.
- **`components/SearchInterface.tsx`** – același endpoint pentru autocomplete.

Toate depind de același răspuns: `suggestions`, `subcategories`, `products`.

---

## 5. Probleme / neconcordanțe actuale

1. **„Generează Sugestii” nu afectează API-ul**  
   - Salvează doar în `localStorage`.  
   - Sugestiile dinamice (la tastare) vin 100% din API (DB + liste statice din `route.ts`).  
   - Deci: ce generează admin-ul influențează doar „Căutări frecvente”, nu și „Sugestii rapide”.

2. **Dublarea logicii**  
   - Categorii/branduri: și în API (liste statice + DB), și la „Generează Sugestii” (din DB în frontend).  
   - Dacă vrei o singură sursă de adevăr pentru „cele mai bune sugestii”, trebuie ales: fie doar API (și eventual un job/cron care scrie în DB), fie doar localStorage + un API care citește din același storage (ex. din DB).

3. **„Căutări frecvente” diferit pe device/browser**  
   - Pe un alt browser sau device nu există `aiSuggestions` în `localStorage`, deci se vede doar `POPULAR_SEARCH_SUGGESTIONS`.  
   - Pentru același set de sugestii peste toate device-urile, trebuie persistență în backend (DB) și ca API-ul sau un endpoint separat să servească aceste sugestii.

4. **API-ul e complex**  
   - Multe surse: categorii reale, liste statice, titluri produse, `getRelatedSuggestions`, `getKeywordSuggestions`, liste iPhone.  
   - Orice modificare (ex: „doar din produse”) trebuie făcută atent în `route.ts` ca ordinea și filtrele să rămână coerente.

---

## 6. Recomandări pentru update

- **Un singur „motor” pentru sugestii**  
  - Fie toate sugestiile (inclusiv „Căutări frecvente”) vin din API, iar API-ul citește din DB + produse.  
  - Fie „Generează Sugestii” scrie în DB (ex. tabel `search_suggestions` sau JSON în `settings`), iar API-ul pentru `q` gol sau pentru o cheie specială returnează aceste sugestii; header-ul ar folosi doar API-ul.

- **Persistență în DB pentru „Căutări frecvente”**  
  - La „Generează Sugestii”: POST care salvează în DB (ex. `ai_drive_settings.suggestions` sau tabel dedicat).  
  - GET (ex. `/api/search/suggestions` fără `q` sau cu `q=` sau endpoint dedicat) returnează aceste sugestii.  
  - Header: la focus (fără tastare) să ia „Căutări frecvente” din acest endpoint, nu din `localStorage`.  
  - Opțional: păstrare și `localStorage` ca cache, dar sursa de adevăr = API/DB.

- **Simplificare API**  
  - Clarificare: ce surse sunt „oficiale” (doar produse + categorii din DB vs. și liste statice).  
  - Reducere surse artificiale (getRelatedSuggestions, getKeywordSuggestions) doar acolo unde chiar îmbunătățesc UX, sau mutare într-un mod „extended” opțional.

După ce decizi sursa unică (DB vs. localStorage) și cum vrei să se vadă „Căutări frecvente” pe toate device-urile, pașii de implementare decurg din secțiunile 2 și 3 de mai sus (unde se generează vs. unde se afișează).
