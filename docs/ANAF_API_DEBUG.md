# ANAF API Debug & Testing Guide

## Prezentare generală

Acest document explică cum să debug-uiți și să testați integrarea cu API-ul ANAF pentru căutarea datelor firmelor după CUI.

## Mock Mode - Testare fără ANAF

Pentru a testa UI-ul și fluxul de autocompletare fără să apelăm API-ul ANAF, poți folosi modul mock.

### Pornire Mock Mode

Setări variabila de mediu `MOCK_COMPANY_LOOKUP=1` înainte de a porni serverul:

```bash
# Linux/Mac
export MOCK_COMPANY_LOOKUP=1
npm run dev

# Windows (CMD)
set MOCK_COMPANY_LOOKUP=1
npm run dev

# Windows (PowerShell)
$env:MOCK_COMPANY_LOOKUP="1"
npm run dev

# Sau într-un fișier .env.local
MOCK_COMPANY_LOOKUP=1
```

### Comportament în Mock Mode

Când `MOCK_COMPANY_LOOKUP=1`, endpoint-ul `/api/company/anaf` va:
- **NU** face request către ANAF
- Returnează date mock pentru orice CUI introdus
- Datele mock returnte:
  ```json
  {
    "cui": "12345678",
    "denumire": "FIRMA TEST SRL",
    "nrRegCom": "J40/1234/2020",
    "adresa": "București, Str. Test 1",
    "judet": "București",
    "localitate": "București"
  }
  ```

### Validare UI cu Mock Mode

1. Pornește serverul cu `MOCK_COMPANY_LOOKUP=1`
2. Accesează pagina de înregistrare companie
3. Introdu orice CUI (ex: `12345678`)
4. Click pe "🔍 Caută Datele Firmei Automat"
5. **Dovadă că UI funcționează**: Câmpurile se vor completa automat cu datele mock

## Debug Panel în UI

În modul development (localhost), apare automat un **Debug Panel** sub butonul de căutare care afișează:

- **CUI Raw**: CUI-ul introdus de utilizator
- **CUI Normalized**: CUI-ul normalizat (doar cifre)
- **URL**: URL-ul apelat
- **Status**: Status code HTTP primit
- **Response Body**: Primele 500 caractere din răspuns
- **Backend Debug Info**: Informații detaliate de la backend (dacă sunt disponibile)

## Loguri Detaliate

### Frontend Logs

În consola browser-ului vei vedea:

```
═══════════════════════════════════════════════════════
[Frontend] 🔍 Company lookup triggered
[Frontend] CUI raw: RO12345678
[Frontend] CUI normalized (digits only): 12345678
[Frontend] URL apelat: /api/company/anaf
═══════════════════════════════════════════════════════
[Frontend] 📤 Sending POST request to: /api/company/anaf
[Frontend] Payload: {"cui":"RO12345678"}
[Frontend] 📥 Response received
[Frontend] Status: 200 OK
[Frontend] Response body (raw text, first 1000 chars): {...}
```

### Backend Logs

În consola serverului (terminal) vei vedea:

```
═══════════════════════════════════════════════════════
[ANAF API] ⚡ HIT /api/company/anaf
[ANAF API] Timestamp: 2026-01-10T...
═══════════════════════════════════════════════════════
[ANAF API] 📥 Request body received: { cui: 'RO12345678' }
[ANAF API] 🔢 CUI normalized: RO12345678 → 12345678
[ANAF API] 🌐 Calling ANAF API
[ANAF API] 📤 ANAF URL: https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva
[ANAF API] 📤 ANAF Payload: [{"cui":"12345678","data":"2026-01-10"}]
[ANAF API] 📡 Sending fetch request to ANAF...
[ANAF API] 📥 ANAF Response received
[ANAF API] 📥 Status: 200 OK
[ANAF API] 📥 Response body (raw text, length): 1234 chars
```

## Mapping Corect al Erorilor

Endpoint-ul diferențiază corect între tipurile de erori:

### 400 - CUI Invalid
- **Când apare**: CUI-ul nu este valid sau lipsește
- **Mesaj**: "CUI invalid" sau mesaj de validare specific
- **Acțiune**: Verifică formatul CUI-ului introdus

### 401/403 - Acces Blocat
- **Când apare**: ANAF returnează 401 sau 403
- **Mesaj**: "Acces ANAF blocat / neautorizat"
- **Acțiune**: Verifică configurația API-ului ANAF

### 404 - Nu Găsește
- **Când apare**: ANAF răspunde 200 OK, dar:
  - Array-ul de răspuns este gol
  - CUI-ul apare în array-ul `not_found`
  - Nu există array `found` sau este gol
- **Mesaj**: "Firma nu a fost găsită"
- **Acțiune**: Verifică dacă CUI-ul este corect

### 404 de la ANAF - Endpoint Greșit
- **Când apare**: ANAF returnează 404 (nu endpoint-ul nostru)
- **Mesaj**: "Serviciu ANAF indisponibil (endpoint not found)"
- **Status returnat**: 503 (nu 404)
- **Acțiune**: Verifică URL-ul API-ului ANAF

### 429 - Rate Limit
- **Când apare**: Prea multe request-uri în scurt timp
- **Mesaj**: "Prea multe cereri" sau "Rate limit"
- **Acțiune**: Așteaptă un minut și încearcă din nou

### 500/502/503 - Serviciu Indisponibil
- **Când apare**: 
  - ANAF returnează 5xx
  - Timeout la conexiune
  - Eroare de rețea
- **Mesaj**: "Serviciu ANAF indisponibil"
- **Status returnat**: 503
- **Acțiune**: Verifică dacă ANAF este disponibil și încearcă din nou mai târziu

## Structura Request/Response

### Request către `/api/company/anaf`

**Cu CUI (obligatoriu):**
```json
POST /api/company/anaf
Content-Type: application/json

{
  "cui": "RO12345678"
}
```

**Notă**: 
- Endpoint-ul acceptă doar **CUI** (Cod Unic de Identificare)
- Căutarea după denumire nu este suportată de API-ul ANAF
- CUI-ul poate fi introdus cu sau fără prefix "RO" (ex: "RO12345678" sau "12345678")

### Request către ANAF API

```json
POST https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva
Content-Type: application/json

[
  {
    "cui": "12345678",
    "data": "2026-01-10"
  }
]
```

**IMPORTANT**: 
- CUI-ul către ANAF este trimis ca **număr** (doar cifre, fără "RO")
- Payload-ul către ANAF este un **ARRAY** cu un obiect
- Data este în format `YYYY-MM-DD`

### Response de la ANAF

ANAF returnează un array:

```json
[
  {
    "found": [
      {
        "date_generale": {
          "cui": "12345678",
          "denumire": "NUME FIRMA SRL",
          "adresa": "...",
          ...
        }
      }
    ],
    "not_found": []
  }
]
```

### Response de la `/api/company/anaf`

**Succes (200)**:
```json
{
  "cui": "12345678",
  "denumire": "NUME FIRMA SRL",
  "nrRegCom": "J40/1234/2020",
  "adresa": "Str. Example 1, București",
  "judet": "București",
  "localitate": "București",
  "codCaen": "6201",
  "platitorTva": true,
  "status": "INREGISTRAT",
  "debug": { ... }  // Doar în development
}
```

**Eroare**:
```json
{
  "error": "Mesaj de eroare",
  "debug": { ... }  // Doar în development
}
```

## Debug Info în Development

Când `NODE_ENV !== 'production'`, răspunsul include un câmp `debug` cu:

- `timestamp`: Data și ora request-ului
- `endpoint`: Endpoint-ul apelat
- `cuiRaw`: CUI-ul original
- `cuiNormalized`: CUI-ul normalizat
- `anafUrl`: URL-ul ANAF apelat
- `anafPayload`: Payload-ul trimis către ANAF
- `anafStatus`: Status code de la ANAF
- `anafBodySnippet`: Primele 500 caractere din răspunsul ANAF
- `anafResponseType`: Tipul răspunsului (array/object)
- `foundItemKeys`: Cheile obiectului found
- `dateGeneraleKeys`: Cheile obiectului date_generale
- `error`: Dacă apare o eroare, detalii despre ea

## Verificare Pași de Debug

1. **Verifică că endpoint-ul este lovit**:
   - Caută în loguri: `[ANAF API] ⚡ HIT /api/company/anaf`

2. **Verifică payload-ul trimis către ANAF**:
   - Caută: `[ANAF API] 📤 ANAF Payload`
   - Trebuie să fie un array: `[{"cui":"...","data":"..."}]`

3. **Verifică răspunsul de la ANAF**:
   - Caută: `[ANAF API] 📥 ANAF Response received`
   - Status code: trebuie să fie 200
   - Body: verifică primele 1000 caractere

4. **Verifică mapping-ul datelor**:
   - Caută: `[ANAF API] ✅ Date generale keys`
   - Caută: `[ANAF API] ✅ Extracted result`

5. **Verifică frontend-ul**:
   - Debug panel în UI (dacă ești pe localhost)
   - Consola browser-ului pentru loguri frontend

## Troubleshooting

### Endpoint returnează 404

**Verifică**:
1. Fișierul există: `app/api/company/anaf/route.ts`
2. Funcția POST este exportată: `export async function POST(...)`
3. Nu există erori de compilare TypeScript
4. Serverul Next.js a fost repornit după crearea rutei

**Soluție**: Repornește serverul Next.js

### ANAF returnează HTML în loc de JSON (404 Not Found)

**Cauză**: URL-ul API-ului ANAF este greșit sau endpoint-ul a fost mutat

**Verifică**: 
- În loguri, vezi `[ANAF API] ❌ Response is HTML, not JSON`
- Status 404 de la ANAF
- Body-ul conține HTML cu "404 Not Found"

**Soluție**: 
1. Verifică documentația oficială ANAF pentru URL-ul corect
2. Configurează `ANAF_API_URL` în `.env.local` cu URL-ul corect (dacă l-ai găsit)
3. Alternativ, folosește mock mode pentru testare: `MOCK_COMPANY_LOOKUP=1`
4. Contactează ANAF pentru a confirma disponibilitatea API-ului

### "Nu găsește" apare pentru erori de rețea

**Cauză**: Mapping-ul erorilor nu este corect (problema a fost rezolvată în această implementare)

**Verifică**: 
- Erorile 4xx/5xx de la ANAF returnează 503, nu 404
- Mesajul diferențiază între "nu găsește" și "serviciu indisponibil"

### UI nu se completează cu mock data

**Verifică**:
1. `MOCK_COMPANY_LOOKUP=1` este setat
2. Serverul a fost repornit după setarea variabilei
3. În loguri apare: `[ANAF API] 🔧 MOCK MODE ENABLED`

**Soluție**: Repornește serverul cu variabila setată

## Exemple de Loguri

### Succes

```
[ANAF API] ⚡ HIT /api/company/anaf
[ANAF API] 📥 Request body received: { cui: '12345678' }
[ANAF API] 🔢 CUI normalized: 12345678 → 12345678
[ANAF API] 🌐 Calling ANAF API
[ANAF API] 📤 ANAF Payload: [{"cui":"12345678","data":"2026-01-10"}]
[ANAF API] 📥 ANAF Response received
[ANAF API] 📥 Status: 200 OK
[ANAF API] ✅ Found item keys: ['date_generale', ...]
[ANAF API] ✅ Extracted result: {...}
```

### Nu Găsește

```
[ANAF API] ⚡ HIT /api/company/anaf
[ANAF API] 📥 Request body received: { cui: '99999999' }
[ANAF API] 📥 ANAF Response received
[ANAF API] 📥 Status: 200 OK
[ANAF API] ❌ CUI found in not_found array: 99999999
```

### Eroare de Rețea

```
[ANAF API] ⚡ HIT /api/company/anaf
[ANAF API] 🌐 Calling ANAF API
[ANAF API] ❌ Fetch error: Error: connect ECONNREFUSED
[ANAF API] ❌ CRITICAL ERROR: ...
```

## Configurare URL ANAF

Endpoint-ul ANAF poate fi configurat prin variabilă de mediu `ANAF_API_URL`.

**IMPORTANT**: Sistemul încearcă automat mai multe versiuni ale endpoint-ului ANAF:
1. **v9** (recomandat, funcționează ✅): `https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva`
2. v7 (fallback, returnează 404)
3. v8 (fallback, returnează 404)

### Configurare URL manual

Dacă vrei să folosești un URL specific:

```bash
# .env.local
ANAF_API_URL=https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva
```

**Notă**: Dacă toate endpoint-urile returnează 404, verifică:
1. Documentația oficială ANAF pentru URL-urile corecte
2. Contactarea ANAF pentru informații despre API
3. Utilizarea mock mode pentru testare: `MOCK_COMPANY_LOOKUP=1`

## Note Importante

1. **Rate Limiting**: Endpoint-ul limitează la 10 request-uri pe minut per IP
2. **Timeout**: Request-ul către ANAF are timeout de 15 secunde
3. **Mock Mode**: Funcționează doar dacă variabila este setată înainte de start
4. **Debug Info**: Apare doar în development (`NODE_ENV !== 'production'`)
5. **CUI Normalization**: CUI-ul este automat normalizat (extrage doar cifrele)
6. **URL ANAF**: Poate fi configurat prin `ANAF_API_URL` - verifică că URL-ul este valid
