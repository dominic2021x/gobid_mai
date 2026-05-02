# Live autocomplete (gobid.ro)

Autocomplete-ul live folosește endpoint-ul existent `GET /api/ro/search/suggest` și motorul de ranking (pattern engine, quality, geo, behavior). Comportamentul este implementat în componentele client din `components/search/`.

## Componente

- **`AutocompleteSearchInput`** – input + dropdown + debounce, keyboard, track. Pentru câmpuri de căutare standalone (ex. hero).
- **`SearchSuggestionsDropdown`** – dropdown portalat cu highlight și tap/click; folosește `highlightSuggestion` și `onMouseDown` preventDefault pentru selectare fiabilă pe mobil.
- **`useAutocompleteSuggestions`** – fetch cu debounce 150ms, min length 2, AbortController, cache client, requestId (ignoră răspunsuri out-of-order). Returnează `items` (cu `phrase_norm` pentru track) și `queryNorm`.
- **`useKeyboardSuggestionNavigation`** – handler pentru ArrowDown/ArrowUp/Enter/Escape.
- **`highlightSuggestion`** – evidențiere sigură a potrivirii (fără HTML din user input).

## Integrare în header

Header-ul site-ului folosește:

- `useAutocompleteSuggestions({ q: searchQuery, limit: 10 })` pentru sugestii live.
- `SearchSuggestionsDropdown` cu max 8 sugestii vizibile.
- Track: **impression** când se afișează lista (query length ≥ 2); **click** la selectare.
- Enter fără selecție → navigare la `/ro?q=<query tastat>`.

## Track (POST /api/ro/search/suggest/track)

- **Impression**: la afișarea listei de sugestii, cu `query_norm` și `suggestions: [{ phrase_norm, kind }]`.
- **Click**: la selectarea unei sugestii, cu `query_norm`, `phrase_norm`, `kind`. Backend-ul folosește `phrase_norm` din răspunsul suggest (câmp opțional `phrase_norm` pe fiecare item).

## Performance și siguranță

- Debounce 150ms; fetch doar pentru `query.length >= 2`.
- AbortController anulează request-uri vechi.
- Cache client (TTL 30s) pentru query-uri recente.
- Răspunsuri out-of-order sunt ignorate (requestId).
- Textul sugestiilor este randat prin split + `<mark>`, fără HTML din user.
- Logica grea (ranking, pattern, quality) rămâne pe server; clientul doar afișează și trimite track.

## Utilizare în hero / alte zone

Pentru un câmp de căutare simplu (fără butoane voice/image în același bloc), poți folosi direct:

```tsx
import { AutocompleteSearchInput } from "@/components/search/AutocompleteSearchInput";

<AutocompleteSearchInput
  value={query}
  onChange={setQuery}
  placeholder="Căutare rapidă..."
  isDarkMode={false}
  onNavigate={(url) => router.push(url)}
  maxSuggestions={8}
/>
```

Pentru layout custom (ex. icon + input + butoane), folosește `useAutocompleteSuggestions` + `useKeyboardSuggestionNavigation` + `SearchSuggestionsDropdown` și leagă track-ul manual (impression la afișare, click la select).
