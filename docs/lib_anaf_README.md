# Sistem Import ANAF

Sistem complet pentru import automat de licitații ANAF din PDF-uri.

## Structură

### Module

1. **pdfExtractor.ts** - Extrage textul din PDF-uri ANAF
   - `extractTextFromPDFUrl()` - Descarcă și extrage text dintr-un URL PDF
   - `extractTextFromPDFBuffer()` - Extrage text dintr-un buffer PDF

2. **gptParser.ts** - Parsează textul cu GPT-4o și extrage date structurate
   - `parseANAFPDFWithGPT()` - Returnează obiect JSON cu toate datele licitației

3. **db.ts** - Operațiuni de bază de date
   - `createANAFImport()` - Creează un import nou
   - `updateANAFImportStatus()` - Actualizează statusul importului
   - `saveANAFlicitatie()` - Salvează licitația în baza de date
   - `getANAFlicitatii()` - Obține licitații cu filtre
   - `getANAFImports()` - Obține importuri cu filtre

4. **productCreator.ts** - Creează automat produse din licitații
   - `createProductFromANAFlicitatie()` - Creează produs complet cu toate detaliile

## API Routes

### POST /api/anaf/import
Importează o licitație ANAF dintr-un URL PDF.

**Request:**
```json
{
  "pdfUrl": "https://static.anaf.ro/static/...pdf",
  "sourceType": "anaf"
}
```

**Response:**
```json
{
  "success": true,
  "importId": "uuid",
  "licitatieId": "uuid",
  "productId": "uuid",
  "data": { ... }
}
```

### GET /api/anaf/import
Obține lista de importuri sau un import specific.

**Query params:**
- `importId` - ID-ul importului specific
- `sourceType` - Filtru după tip sursă
- `status` - Filtru după status
- `limit` - Limită rezultate
- `offset` - Offset pentru paginare

### GET /api/anaf/licitatii
Obține lista de licitații cu filtre.

**Query params:**
- `judet` - Filtru după județ
- `tip_bun` - Filtru după tip bun
- `data_licitatie_from` - Data de la
- `data_licitatie_to` - Data până la
- `status` - Status (default: 'active')
- `limit` - Limită rezultate
- `offset` - Offset pentru paginare

### GET /api/cron/anaf-import
CRON job pentru import automat (rulează la fiecare 6 ore).

## Pagini

### /admin/imports
Pagina de gestionare a tuturor importurilor (ANAF și alte surse).

### /licitatii
Pagina publică pentru afișarea licitațiilor ANAF cu filtre și căutare.

## Baza de Date

### Tabel: anaf_imports
Stochează toate importurile (ANAF și alte surse).

### Tabel: anaf_licitatii
Stochează licitațiile procesate cu toate detaliile extrase.

## Configurare

1. Adaugă `OPENAI_API_KEY` în `.env.local`
2. Rulează migrația SQL: `supabase/migrations/20251114_anaf_imports.sql`
3. Instalează dependențe: `npm install pdf-parse`
4. Configurează CRON în `vercel.json` (deja configurat)

## Utilizare

### Import Manual
1. Accesează `/admin/imports`
2. Introdu URL-ul PDF-ului
3. Selectează sursa (ANAF, Insolvență, etc.)
4. Click pe "Importă Licitație"

### Import Automat
CRON job-ul rulează automat la fiecare 6 ore și procesează PDF-urile noi.

## Date Extrase

Sistemul extrage următoarele informații din PDF-uri:
- Județ și localitate
- Adresă exactă
- Nume contribuabil
- Tip bun și categorie teren
- Suprafață
- Preț evaluare și TVA
- Data și ora licitației
- Loc desfășurare
- Condiții suplimentare
- Alte detalii relevante

## Creare Automată Produse

Fiecare licitație procesată creează automat un produs în sistemul de licitații cu:
- Titlu generat automat
- Descriere completă
- Categorii și subcategorii
- Preț și monedă
- Locație și coordonate
- PDF descărcabil
- SEO optimizat








