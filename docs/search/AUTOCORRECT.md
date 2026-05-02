# Soft autocorrect (gobid.ro)

Sistem de autocorectare **soft** pentru căutare și autocomplete: toleranță la greșeli de scriere, diacritice românești, corecții sigure (fără înlocuiri agresive).

## Module

- **`lib/search/autocorrect/`** – stratul de autocorectare
  - `types.ts` – `AutocorrectResult`, `CorrectionCandidate`, `TokenizedQuery`, dicționare
  - `constants.ts` – `MIN_TOKEN_LENGTH_FOR_TYPO=3`, `MAX_EDIT_DISTANCE=2`, `MIN_CONFIDENCE_TO_APPLY=0.75`, `MIN_CONFIDENCE_DID_YOU_MEAN=0.85`, `MIN_CONFIDENCE_FALLBACK=0.85`
  - `normalizeSearchQuery.ts` – folosește `normalizeRo` (diacritice, spații)
  - `tokenizeSearchQuery.ts` – tokenizare cu poziții
  - `isLikelyTypo.ts` – token lung ≥3, nu e în dicționare, nu e protejat (numere, 1–2 litere)
  - `levenshtein.ts` – distanță Levenshtein mărginită
  - `generateCorrectionCandidates.ts` – candidați din dicționare (categorie, geo, brand)
  - `scoreCorrectionCandidate.ts` – scor 0..1 (distanță, lungime, sursă)
  - `buildAutocorrectResult.ts` – orchestrează: phrase-level (merged split) → tokenize → typos → candidați → scor → query corectat
  - `phraseLevelCorrections.ts` – tokeni îmbinați (ex. apartamentcraiova → apartament craiova), bounded
  - `dictionaries/getSearchDictionary.ts` – categorii, subcategorii, atribute (din taxonomie)
  - `dictionaries/getGeoDictionary.ts` – județe, orașe + aliasuri românești
  - `dictionaries/geoAliases.ts` – aliasuri geo (buc→bucuresti, braso→brasov, etc.)
  - `dictionaries/getBrandDictionary.ts` – branduri, modele
  - `index.ts` – `getAutocorrectResult(normalizedQuery, taxonomy)` – entry point

## Reguli de siguranță

- **Nu se corectează**: token doar numeric (`^\d+$`), token foarte scurt (1–2 litere), token deja în dicționar.
- **Lungime minimă pentru typo**: 3 caractere.
- **Distanță Levenshtein**: max 2 (1–2 caractere diferite).
- **Aplicare corecție**: doar dacă `confidence >= 0.75`.
- **didYouMean**: doar dacă `confidence >= 0.85`.
- **Query lung**: autocorectare oprită peste 80 caractere (performanță serverless).

## Integrare

### Suggest (`GET /api/ro/search/suggest`)

- După încărcarea taxonomiei se apelează `getAutocorrectResult(qNorm, taxonomy)`.
- Dacă există `correctedNorm` cu confidence ≥ 0.75: se face un al doilea RPC de candidați cu `correctedNorm`, rezultatele se îmbină (deduplicate pe `phrase_norm`).
- Filtrarea păstrează candidați care încep fie cu `qNorm`, fie cu `correctedNorm`.
- Răspuns: `meta.didYouMean` setat când confidence ≥ 0.85 (sugestie „Ai vrut X?”).

### Search v2 (`GET /api/ro/search/v2`)

- La **0 rezultate** (și page=1) se încarcă taxonomia și se rulează autocorect.
- Dacă există `didYouMean`, se setează `meta.didYouMean`.
- **Fallback intern**: dacă `correctedNorm` există și `confidence >= MIN_CONFIDENCE_FALLBACK` (0.85), se execută o a doua căutare internă cu query-ul corectat; dacă apar rezultate, se returnează aceste rezultate, `meta.didYouMean` și `meta.correctedQueryUsed = true`. Query-ul utilizatorului rămâne canonic (nu se rescrie URL-ul).
- Răspunsul cu fallback **nu** se pune în cache la cheia query-ului original.

## Cache

- Dicționarele **nu** au cache propriu: se construiesc din `MarketplaceTaxonomy` la fiecare apel.
- Taxonomia este deja cache-ată în pattern engine (TTL 60s); suggest și v2 o folosesc pe aceeași instanță.

## Performanță

- **Serverless**: un singur trecere pe tokeni, Levenshtein mărginit la `MAX_EDIT_DISTANCE`, max 8 candidați per token, max 80 caractere query.
- **Suggest**: un RPC suplimentar doar când există corecție (confidence ≥ 0.75).
- **v2**: încărcare taxonomie + autocorect doar când `results.length === 0` și `page === 1`.

## Telemetrie

- **Tabel**: `search_autocorrect_events` (event_type, original_query_norm, suggested_query_norm, confidence, page_context, session_id_hash, vertical, category_slug).
- **Tipuri**: `autocorrect_shown`, `autocorrect_accepted`, `autocorrect_ignored`, `autocorrect_reformulated`.
- **API**: `POST /api/ro/search/autocorrect/track` – body: `event_type`, `original_query_norm`, `suggested_query_norm?`, `confidence?`, `page_context?`, `session_id?`, `vertical?`, `category_slug?`. Rate limit per session.
- **Client**: la afișarea „Did you mean X?” se poate trimite `autocorrect_shown`; la click pe sugestie `autocorrect_accepted`; la reformulare (utilizator schimbă query-ul) `autocorrect_reformulated`.

## Nivel frază (phrase-level)

- **Tokeni îmbinați**: înainte de corecția pe tokeni, se aplică `applyMergedSplits`: un token lung (ex. „apartamentcraiova”) este descompus în două dacă ambele părți sunt în dicționar (apartament + craiova). Maxim un split per query, lungime maximă token 28 caractere.
- Nu se fac swap-uri agresive de tokeni; două typo-uri în aceeași frază sunt deja acoperite de corecția pe tokeni.

## Geo

- **Aliasuri**: `dictionaries/geoAliases.ts` – alias → formă canonică (buc→bucuresti, cluj-napoca→cluj, etc.). Aliasurile sunt adăugate în dicționarul geo astfel încât să nu fie considerate typo; corecția pentru variante greșite (ex. bucurest→bucuresti) rămâne la nivel de token.

## Edge cases

- **Token identic în mai multe dicționare**: se ia primul candidat (sortat după distanță), apoi după scor.
- **Brand/model rar**: dacă nu e în taxonomie, nu se corectează (nu se inventează).
- **Localități ambigue**: se preferă termeni din dicționarul geo; aliasurile extind recunoașterea fără corecții agresive.
- **Numere în model** (ex. „passat 2001”): tokenii numerici sunt protejați prin `NEVER_CORRECT_PATTERN`.
- **Fallback v2**: nu se face cache la cheia query-ului original când `correctedQueryUsed === true`.

## Agregare zilnică

- **Tabel**: `search_autocorrect_daily_stats` (day, original_query_norm, suggested_query_norm, page_context, shown_count, accepted_count, ignored_count, reformulated_count). Cheie: (day, original_query_norm, suggested_query_norm, page_context).
- **Job**: `GET /api/jobs/aggregate-autocorrect-stats` (CRON_SECRET). Rulează `runAggregateAutocorrectStats`: citește din `search_autocorrect_events` ultimele 2 zile, agregă pe cheie, upsert în `search_autocorrect_daily_stats`. Cron: la 6h (ex. `0 */6 * * *`).

## Admin și tuning

- **API**: `GET /api/admin/search/autocorrect?days=14` (admin-only). Returnează: `summary` (total_shown, total_accepted, total_ignored, total_reformulated, acceptance_rate, ignore_rate), `top_by_shown`, `top_by_acceptance_rate`, `weak_corrections` (afișări ≥ 5, rate acceptare ≤ 20%).
- **UI**: tab **Autocorrect** în `/admin/ai-search` (și redirect de la `/admin/search/autocorrect`). Selector zile (7/14/30), buton „Încarcă raport”, carduri sumar, tabele top / slabe / utile.
- **Tuning**: corecțiile cu rate mare de acceptare pot fi considerate „puternice”; cele din `weak_corrections` sunt candidați pentru relaxare (ex. nu mai sugera) sau revizuire. Nu există încă boost automat în motor; datele sunt pentru decizie umană.

## Frontend – telemetrie

- **Suggest (header)**: când `meta.didYouMean` este setat și diferit de query, dropdown-ul afișează rândul „Ai vrut să spui X?”. La afișare se trimite `autocorrect_shown` (o dată per pereche original/sugerat). La click pe „Ai vrut…” → navigare la `?q=X` + `autocorrect_accepted`. La închidere dropdown fără click pe corecție → `autocorrect_ignored`. La Enter cu query diferit de X → `autocorrect_reformulated`.
- **Hook**: `useAutocompleteSuggestions` returnează și `meta: { didYouMean?: string }` din răspunsul suggest API.
- **Componentă**: `SearchSuggestionsDropdown` acceptă `didYouMean` și `onDidYouMeanClick` pentru rândul de corecție.

## Rollout și performanță

- **Migrări**: `20260423_autocorrect_telemetry.sql` (events), `20260424_autocorrect_daily_stats.sql` (agregat zilnic).
- **Telemetrie**: clientul folosește `trackAutocorrectEvent()`; header-ul trimite toate cele 4 tipuri în context suggest.
- **Fallback v2**: se execută doar la 0 rezultate, page=1 și confidence ≥ 0.85; dublă căutare doar în acel caz.
- **Phrase-level**: un singur split per query, O(n) pe lungimea tokenului (max 28).
- **Job agregare**: mărginit la 2 zile, batch 500 rânduri; idempotent.
