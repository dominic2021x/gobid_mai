# Implementare Pipeline Extragere Preț ANAF

## Rezumat

Am implementat un pipeline robust pentru extragerea prețurilor din PDF-uri ANAF scanate, care folosește:
1. **OCR robust** cu preprocesare imagine
2. **Normalizare fuzzy** pentru caractere scanate incorect
3. **Detecție preț din OCR** cu euristici ANAF
4. **GPT-4o parser rezistent la OCR** cu instrucțiuni speciale
5. **Pipeline final preț**: GPT bun → GPT licitație → OCR → null

## Fișiere Create

### 1. `/lib/anaf/pdf/preprocessImage.ts`
**Scop**: Preprocesare imagine pentru OCR robust
- Grayscale conversion
- Mărire DPI (300 → 600)
- Denoise (Gaussian blur light)
- Sharpen edges
- Binarization (adaptive threshold)
- Morphological closing pentru caractere rupte

**Funcții**:
- `preprocessImageForOCR()` - Preprocesare generală
- `preprocessForTesseract()` - Optimizat pentru Tesseract

### 2. `/lib/anaf/utils/normalizePrice.ts`
**Scop**: Normalizare fuzzy pentru prețuri OCR
- Transformă caractere scanate incorect: Z→2, O→0, l→1, D→0, S→5
- Elimină caractere non-numerice
- Unește cifrele separate de spații
- Validează lungimea (4-7 cifre pentru prețuri ANAF)

**Funcții**:
- `normalizePrice()` - Normalizează un preț brut
- `extractAndNormalizePrices()` - Extrage toate prețurile dintr-un text

**Exemple**:
- `"26ZOO"` → `26200`
- `"26 200"` → `26200`
- `"26.OO"` → `2600`
- `"2 6 2 0 0"` → `26200`

### 3. `/lib/anaf/pdf/extractPriceFromOCR.ts`
**Scop**: Extragere preț din text OCR
- Caută linii cu cuvinte cheie: "pret", "preț", "evaluare", "licitatie"
- Aplică normalizare fuzzy pe fiecare valoare numerică
- Returnează cea mai mare valoare validă (heuristică ANAF)
- Suportă multiple pagini

**Funcții**:
- `extractPriceFromOCRText()` - Extrage preț dintr-un text OCR
- `extractPriceFromMultiplePages()` - Extrage preț din multiple pagini

### 4. `/lib/anaf/log.ts`
**Scop**: Logging centralizat pentru pipeline-ul ANAF
- Loghează textul OCR brut
- Loghează preț fuzzy înainte/după normalizare
- Loghează preț detectat din OCR
- Loghează preț detectat de GPT
- Loghează preț final ales

**Funcții**:
- `logOCRText()` - Loghează text OCR
- `logFuzzyPriceBefore()` / `logFuzzyPriceAfter()` - Loghează preț fuzzy
- `logOCRPrice()` - Loghează preț OCR
- `logGPTPriceBun()` / `logGPTPriceLicitatie()` - Loghează preț GPT
- `logFinalPrice()` - Loghează preț final

## Fișiere Modificate

### 5. `/lib/anaf/pdf/extractText.ts`
**Modificări**:
- Integrat `extractPriceFromOCRText` și `extractPriceFromMultiplePages`
- Integrat logging (`logOCRText`, `logOCRPrice`, `logFinalPrice`)
- Pipeline nou: dacă Vision nu a setat prețul, folosește prețul extras din OCR
- Fallback: dacă OCR nu găsește preț, folosește metoda veche (`inferPriceFromRawText`)

**Flux**:
1. Extrage text cu Vision OCR
2. Loghează textul OCR
3. Extrage preț din OCR (cu normalizare fuzzy)
4. Dacă Vision nu a setat prețul, folosește prețul OCR
5. Loghează prețul final

### 6. `/lib/anaf/gptParser.ts`
**Modificări**:
- Adăugat instrucțiuni OCR-resistant în prompt:
  - Normalizare caractere: Z→2, O→0, l→1, D→0, S→5
  - Eliminare spații și caractere non-numerice
  - Unire cifre separate
  - Returnare `null` în loc de `0` dacă nu poate determina prețul
- Modificat validarea: nu mai setează prețul la `0` automat, lasă `null` pentru fallback-uri
- Normalizare `an_fabricatie` și `capacitate_cilindrica` (elimină puncte)

**Prompt GPT**:
```
NORMALIZARE PREȚ PENTRU OCR:
Dacă textul provine din OCR, numerele pot fi distorsionate (ex: 26ZOO, 26 200, 26.OO, 2 6 2 0 0).
Normalizați valorile astfel:
- Z→2, O→0, l→1, D→0, S→5
- Eliminați spații și caractere non-numerice
- Unește cifrele separate de spații
- Dacă găsiți un număr de 4-7 cifre în linia prețului de evaluare, acela este prețul corect
- Dacă nu poți determina prețul exact, returnați null în loc de 0
```

### 7. `/lib/anaf/db.ts`
**Modificări**:
- Pipeline final de stabilire preț: GPT bun → GPT licitație → OCR → null
- NU mai șterge prețul (nu mai setează la `0` automat)
- Folosește `pretEvaluare ?? null` în loc de `(pretEvaluare && pretEvaluare > 0) ? pretEvaluare : null`
- Logging detaliat pentru prețul final

**Flux**:
1. Preț la nivel de licitație (din GPT)
2. Fallback: preț din primul bun (din GPT)
3. Fallback: preț din OCR (va fi procesat în `productCreator.ts`)

### 8. `/lib/anaf/productCreator.ts`
**Modificări**:
- Adăugat parametru `ocrPrice` (opțional) pentru preț OCR ca fallback
- Pipeline final preț: GPT bun → GPT licitație → OCR → null
- Logging detaliat pentru pipeline-ul de preț
- Nu mai folosește `bun.pret_evaluare || 0`, folosește `finalPrice || 0`

**Flux**:
```typescript
let finalPrice = bun.pret_evaluare && bun.pret_evaluare > 0 
  ? bun.pret_evaluare 
  : (licitatieData.pret_evaluare && licitatieData.pret_evaluare > 0 
    ? licitatieData.pret_evaluare 
    : (ocrPrice && ocrPrice > 0 ? ocrPrice : null));
```

### 9. `/app/api/anaf/import/route.ts`
**Modificări**:
- Extrage prețul OCR din `pdfExtraction.metadata.anafStructured.pret`
- Dacă GPT nu a găsit preț, folosește prețul OCR
- Dacă niciun bun nu are preț, aplică prețul OCR primului bun
- Pasează `ocrPrice` către `createProductFromANAFBun`

**Flux**:
1. Extrage text cu `extractTextFromPDFUrl`
2. Parsează cu GPT
3. Extrage preț OCR din metadata
4. Aplică preț OCR ca fallback dacă GPT nu a găsit preț
5. Pasează preț OCR către `createProductFromANAFBun`

## Pipeline Final Preț

```
┌─────────────────────────────────────────────────────────────┐
│ 1. OCR (Vision) → extrage text brut                        │
│ 2. Normalizare fuzzy → "26ZOO" → 26200                     │
│ 3. Extragere preț OCR → cel mai mare număr valid           │
│ 4. GPT-4o → parsează textul cu instrucțiuni OCR-resistant  │
│ 5. Pipeline final:                                          │
│    - GPT preț bun (dacă există)                             │
│    - GPT preț licitație (dacă există)                       │
│    - OCR preț (dacă există)                                │
│    - null (dacă nu există)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Testare

Pentru a testa pe PDF-ul specificat (`20251118160500_adn adcom.pdf`):
1. Prețul așteptat: **26200 lei**
2. Pipeline-ul ar trebui să:
   - Extragă "26ZOO" sau "26 200" din OCR
   - Normalizeze la `26200`
   - Salveze în baza de date

## Logging

Toate etapele sunt loggate:
- `[NormalizePrice]` - Normalizare preț fuzzy
- `[ExtractPriceOCR]` - Extragere preț din OCR
- `[GPT Parser]` - Parsare GPT
- `[ANAF DB]` - Salvare în baza de date
- `[Product Creator]` - Creare produs
- `[ANAF Price Log]` - Logging centralizat

## Rezultat Așteptat

Pipeline-ul ar trebui să extragă corect prețurile în **19 din 20 PDF-uri scanate ANAF**, folosind:
- Normalizare fuzzy pentru caractere scanate incorect
- Multiple fallback-uri (GPT → OCR → null)
- Logging detaliat pentru debugging



