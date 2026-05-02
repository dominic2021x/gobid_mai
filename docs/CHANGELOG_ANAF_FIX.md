# Changelog - Fix ANAF API Integration

## Data: 2026-01-10

### Problemă Identificată
- Endpoint-ul ANAF v8 (`/api/v8/ws/tva`) returnează **404 Not Found**
- Mesajele de eroare nu diferențiau corect între "nu găsește firma" și "endpoint greșit"

### Soluții Implementate

#### 1. ✅ Actualizare Endpoint ANAF
- **Endpoint v9 funcționează**: `https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva`
- Implementat sistem de fallback automat:
  1. v9 (funcționează ✅)
  2. v7 (404 - fallback)
  3. v8 (404 - fallback)

#### 2. ✅ Mapping Corect al Erorilor
- **"Firma nu a fost găsită"** doar când:
  - ANAF răspunde 200 OK cu array gol SAU
  - CUI-ul apare în `notFound` array SAU
  - Nu există array `found` sau este gol
  
- **"Serviciu ANAF indisponibil"** când:
  - ANAF returnează 4xx/5xx (endpoint greșit, server error)
  - Timeout la conexiune
  - Eroare de rețea

#### 3. ✅ Suport Format v9 (camelCase)
- Suport pentru `notFound` (v9) și `not_found` (v7/v8)
- Extragere corectă a datelor din `adresa_sediu_social` pentru judet și localitate

#### 4. ✅ Instrumentare Completă
- Loguri detaliate în frontend și backend
- Debug panel în UI (doar development)
- Fallback mock mode pentru testare (`MOCK_COMPANY_LOOKUP=1`)

### Testare

#### Test cu CUI 49154860
```bash
curl -X POST "http://localhost:3000/api/company/anaf" \
  -H "Content-Type: application/json" \
  -d '{"cui":"49154860"}'
```

**Rezultat**:
```json
{
  "cui": "49154860",
  "denumire": "DEMECA DIGITAL S.R.L.",
  "nrRegCom": "J2023002475166",
  "adresa": "JUD. DOLJ, MUN. CRAIOVA, BLD. DECEBAL, NR.18, BL.D5, SC.1, ET.4, AP.16",
  "judet": "DOLJ",
  "localitate": "Mun. Craiova"
}
```

**Status**: ✅ **200 OK**

### Fișiere Modificate

1. `app/api/company/anaf/route.ts`
   - Actualizat URL endpoint la v9 (cu fallback)
   - Corectat mapping erori
   - Suport pentru format v9 (camelCase)
   - Extragere judet/localitate din `adresa_sediu_social`

2. `app/auth/register/company/page.tsx`
   - Loguri detaliate frontend
   - Debug panel în UI
   - Citirea răspunsului ca text pentru debug

3. `ANAF_API_DEBUG.md`
   - Documentație actualizată cu v9 endpoint

### Status Final

✅ **Endpoint funcționează corect**
✅ **Mapping erori corect**
✅ **Datele se extrag complet** (judet, localitate, etc.)
✅ **Loguri detaliate pentru debug**
✅ **Mock mode disponibil pentru testare**
