# Plan de testare: /ro listings (stabilitate + model + cache)

După patch-ul din `app/ro/page.tsx` (model în whitelist, `cache: "no-store"`, count stopgap) și alinierea orchestratorului cu `model` în sanitizer.

---

## 1. Filtru `model` în request

- Mergi pe `/ro`, pune un filtru de model (dacă există în UI) sau adaugă în URL `?model=...` (ex: `?model=iPhone+14`).
- În DevTools → Network, identifică requestul către `/api/ro/listings`.
- **Verifică:** URL-ul requestului conține parametrul `model` (ex: `model=iPhone+14`).

---

## 2. Fără rezultate stale după refresh

- Aplică filtre (categorie, județ, q etc.) și așteaptă încărcarea listei.
- Reîmprospătează pagina (F5).
- **Verifică:** Lista afișată corespunde filtrelor din URL; nu apar rezultate din sesiunea anterioară.

---

## 3. Schimbare filtre → listă nouă

- Cu filtre deja aplicate, schimbă un filtru (ex: alt județ sau alt termen `q`).
- **Verifică:** Lista se golește / se reîncarcă și rezultatele corespund noilor filtre.

---

## 4. „Afișate X”

- Cu filtre care returnează rezultate, verifică că apare „Afișate &lt;N&gt;” unde N = numărul de itemuri din lista curentă (ex: primele 18).
- La „Load more”, **verifică:** N crește corespunzător (ex: 18 → 36).

---

## 5. Infinite scroll – aceiași parametri ca în URL

- Aplică filtre (ex: `q=...`, `county=...`, `model=...`) și derulează până la „Load more”.
- În Network, la requestul de „load more” către `/api/ro/listings`, **verifică:** query string-ul conține aceiași parametri (q, county, model, etc.) plus `from`/`limit` crescute; nu se încarcă „fără filtre”.

---

## 6. Verificare „model” + orchestrator (edge)

- Fă un submit prin orchestrator: search bar → agent plan → `router.replace`.
- **Verifică:** În URL-ul final apare `model=...` dacă agentul l-a propus.
- **Verifică:** Request-ul către `/api/ro/listings` include parametrul `model` (după whitelist).
- Validează end-to-end că `model` nu se pierde pe traseu (orchestrator → proposedFilters → URL → buildListingsApiParams → API).

---

## 7. Verificare „Te-ar putea interesa” (edge)

- Deschide `/ro` fără filtre; în Network notează request-ul pentru „Te-ar putea interesa” (același endpoint `/api/ro/listings` cu parametri).
- Aplică filtre (q, categorie, județ etc.) sau reîmprospătează cu filtre.
- **Verifică:** Requesturile pentru „Te-ar putea interesa” nu rămân cache-uite și nu se repetă identic când se schimbă filtrarea (mai ales după refresh). Fiecare combinație de filtre produce un request cu parametri corespunzători și răspuns proaspăt (`cache: "no-store"`).

---

## Următorul pas (ROI mare)

- **GET /api/ro/listings-count** server-side: același query params ca `/api/ro/listings`, răspuns `{ total }`. Permite total exact în UI și eliminarea completă a count-ului Supabase din pagină, fără a modifica contractul `/api/ro/listings`.
- La audit complet al repo-ului sau la implementarea listings-count: reîncarcă fișierele de documentație relevante (unele .md pot fi expirate în mediu); `app/ro/page.tsx` rămâne sursa de adevăr pentru UI.
