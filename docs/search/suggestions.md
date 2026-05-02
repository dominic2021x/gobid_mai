# Sugestii de căutare – cum sunt generate (gobid.ro)

Documentație internă: surse, flux, ce face și ce **nu** face Claude, caching, GDPR și debug.

---

## Ce sunt sugestiile

Sugestiile sunt **variante de query** afișate utilizatorului în timp real (la tastare) și la submit, pentru a ghida căutarea pe site. Scopul este **UX**: autocompletare relevantă, corectare diacritice, expansiuni (ex. „ap” → „apartament”), fără latență mare și fără invenții.

---

## Surse de sugestii (în ordinea importanței)

### 1. Queries reale (trafic utilizatori)

**Flux:** Submit → `/track` → `search_events` → `bump_search_popularity` → `search_suggestions`.

- Utilizatorul tastează un termen și apasă Enter (sau dă click pe Caută).
- Frontend apelează **POST /api/ro/search/track** cu `{ q: "textul căutării" }`.
- Backend:
  - scrie în **search_events** (q, q_norm, ip_hash, user_id);
  - apelează RPC **bump_search_popularity(q_norm, phrase_display)** care face upsert în **search_suggestions** (kind = `query`) și incrementează `popularity`.
- Aceste query-uri devin baza pentru sugestiile „specifice”: **sugestiile provin din căutări reale**, nu din combinații inventate.

### 2. Bootstrap (taxonomie + județe/orașe + seed phrases)

- **Endpoint:** POST /api/admin/search/suggestions/bootstrap (protejat: cron secret sau admin).
- Populează **search_suggestions** cu:
  - categorii și subcategorii din taxonomia RO;
  - județe și localități din `judete.json`;
  - eventuale fraze seed (ex. „apartament 2 camere”, „teren agricol”).
- Folosit la setup și la reîmprospătare periodică. **Nu** generează combinații brand×model×piesă din nimic.

### 3. Enrich offline (OpenClaw + Claude)

- **Endpoint:** GET/POST /api/agents/openclaw/search-suggestions/enrich (protejat: cron secret).
- **Rol:** îmbogățește sugestiile existente cu **sinonime**, **diacritice corecte** și **expansiuni controlate** (ex. „ap” → „apartament”, „cam” → „camere”).
- Intrările sunt doar rânduri existente din **search_suggestions** (kind = `query`), sortate după popularity; nu se procesează decât ce există deja.
- Claude **nu inventează** query-uri noi din aer: primește un `base` existent și poate propune variante (suggestions + synonyms). Toate variantele trec printr-un **filtru determinist** server-side (overlap de tokeni cu `base`); fraze irelevante sunt respinse.

### 4. Seed from titles (batch / cron)

- **Endpoint admin:** POST /api/admin/search/suggestions/regenerate (mode full / recent / next). Rulează **runSeedFromTitlesBatch**; idempotent, cursor în agent_state.
- **Cron (opțional):** GET /api/jobs/seed-suggestions (CRON_SECRET) sau worker OpenClaw rulează **runSeedFromTitlesBatch**: citește produse (id, title, channel) incremental după cursor din **agent_state** (key: `openclaw_seed_suggestions`), extrage candidați din titluri (reguli deterministe, fără AI), upsert în **search_suggestions** prin RPC **upsert_search_suggestion_seed**.
- **Extractori:** Imobiliare (teren, teren intravilan/extravilan/agricol, apartament, apartament N camere, casa, spatiu comercial); Auto (brand + model din listă embedded, fără ani). **Nu** se inserează sugestii pentru canalul gated `executari_insolventa` (se sare peste listing-uri cu channel = executari_insolventa).
- **Cursor:** `agent_state.value.last_listing_id` = ultimul `products.id` procesat; batch 500; idempotent (re-rulare reîncepe de la cursor).
- **Operational:** Un job procesează un batch; pentru full seed, enqueue repetat sau cron la interval până când job returnează `processed: 0`. Sugestiile apar imediat prin GET /api/ro/search/suggest (RPC filtrează `is_public = true`).
- **Cap per entity_type:** dacă numărul de sugestii seed pentru un `entity_type` depășește `SEED_ENTITY_CAP` (implicit 10.000), nu se mai inserează sugestii noi pentru acel tip.
- **Cleanup (cron):** funcția SQL `cleanup_weak_seed_suggestions()` șterge rânduri cu `seed_count < 2`, `user_count = 0` și `updated_at` mai vechi de 90 de zile. Poate fi apelată lunar/săptămânal printr-un endpoint admin care execută RPC-ul sau prin pg_cron. După apel, se recomandă rularea `ANALYZE search_suggestions;` pentru actualizarea statisticilor planner-ului.

---

## Mai multe sugestii pentru același phrase_norm (din mai multe părți)

În **search_suggestions** unicitatea este pe **(phrase_norm, kind, entity_type, is_public)**. Deci același text (ex. „apartament”) poate apărea în **mai multe rânduri**:

- **Seed from titles:** creează rânduri cu `entity_type` = `real_estate`, `auto` sau `` (gol), deci pot exista până la 3 rânduri pentru aceeași frază (kind = `query`, is_public = true).
- **Bootstrap:** categorii, subcategorii, județe, orașe, fraze seed (kind category/subcategory/county/city/query); de obicei `entity_type` = ``.
- **Enrich (OpenClaw):** upsert pe (phrase_norm, kind); poate actualiza un rând existent sau crea unul nou dacă nu există conflict pe toate cele 4 coloane.
- **Track (submit/click):** actualizează popularity pe rândurile existente.

La **afișare** (GET /api/ro/search/suggest), RPC-ul **search_suggestions_candidates_rpc** face **DISTINCT ON (phrase_norm)** și returnează un singur rând per frază (cel cu rank_score/quality_score cel mai bun), deci utilizatorul vede o singură sugestie per text.

**Verificare:** GET **/api/admin/search/suggestions/duplicates** (admin) returnează toate phrase_norm care au mai mult de un rând (cu source, entity_type, is_public pentru fiecare), ca să poți verifica dacă sunt sugestii din mai multe părți.

---

## Ce NU face Claude

- **Nu** creează combinații combinatorii de tip brand×model×piesă care să nu existe în trafic sau în seed.
- **Nu** garantează sugestii ultra-specifice (ex. „BMW 320 ușă dreapta”) fără trafic real sau fără seed/bootstrap; astfel de fraze apar **doar** dacă:
  - utilizatorii au căutat exact asta (prin /track), sau
  - există în seed / atribute reale (bootstrap sau date structurate).

---

## Cum apare exemplul „BMW 320 ușă dreapta”

- **Dacă userii caută exact asta:** la submit se apelează /track → `search_events` + `bump_search_popularity` → fraza intră în **search_suggestions** cu popularity crescută; va apărea în sugestii la tastare (RPC).
- **Dacă există în seed sau atribute:** bootstrap sau alte surse pot introduce fraze din taxonomie/atribute; enrich poate adăuga doar sinonime/expansiuni legate de ce există deja, nu fraze complet noi fără legătură cu `base`.

---

## Diagrama flux (ASCII)

```
[User tastează]  ──►  GET /api/ro/search/suggest?q=...
                              │
                              ▼
                      RPC search_suggestions_rpc(q_norm, ...)
                              │
                              ▼
                      [Răspuns: phrase, kind, popularity, score]
                      (+ synonyms din search_suggestion_synonyms)

[User submit]     ──►  POST /api/ro/search/track  { q: "..." }
                              │
                              ▼
                      INSERT search_events (q, q_norm, ip_hash, user_id)
                      RPC bump_search_popularity(q_norm, phrase_display)
                              │
                              ▼
                      UPSERT search_suggestions (popularity += 1)

[Cron zilnic]     ──►  RPC run_search_popularity_decay()
                              │
                              ▼
                      popularity *= 0.98 (floor)

[Cron/OpenClaw]  ──►  GET /api/agents/openclaw/search-suggestions/enrich
                              │
                              ▼
                      Citește search_suggestions (query, popularity DESC)
                      Pentru fiecare (cu cooldown 7 zile): Claude → suggestions + synonyms
                      Filtru server-side (overlap tokeni cu base) → accept/respinge
                      UPSERT search_suggestions + search_suggestion_synonyms
```

---

## Note despre caching

- **Sugestii globale:** GET /api/ro/search/suggest – cache **public** (sugestiile nu sunt per-user).
- **Sugestii personale:** GET /api/ro/search/suggest/personal – cache **private** (conține istoricul utilizatorului autentificat).

---

## Note GDPR

- În **search_events** nu se stochează IP-ul în clar; se stochează **ip_hash** (hash cu salt, ex. SHA256(salt + ip)).
- Salt-ul este în variabila de mediu (ex. `IP_HASH_SALT`); fără salt, hash-ul rămâne determinist dar nu expunem IP raw.

---

## Checklist de debug: de unde vine o sugestie

1. **Endpoint intern:** GET /api/admin/search/suggestions/inspect?phrase=...
   - Protejat: admin (is_admin) sau header cron secret.
   - Returnează: rândul din **search_suggestions** (kind, popularity, meta, updated_at), rândurile din **search_suggestion_synonyms** unde `to_norm` = phrase_norm (top 10), **events_count_30d** (count din search_events pe q_norm în ultimele 30 zile), **last_event_at**.

2. **Interpretare:**
   - **events_count_30d > 0** → sugestia este cel mai probabil **user-driven** (oamenii au căutat exact această frază).
   - **events_count_30d = 0** și există rânduri în **synonyms_in** (from_norm → to) → cel mai probabil **enrich-generated** (sinonime/expansiuni Claude).
   - **Popularity mare dar events_count 0** → poate fi veche (reteținere) sau din bootstrap; verifică `updated_at` și eventual logs.

3. **Verificare rapidă:** apelează inspect cu fraza exactă (ex. „apartament 2 camere”) și compară `events_count_30d` vs prezența în `synonyms_in` pentru a demonstra sursa.
