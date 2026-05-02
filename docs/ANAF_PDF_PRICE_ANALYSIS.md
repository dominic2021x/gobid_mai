# Analiză Sistem Salvare PDF ANAF - Problema Prețului

## Workflow Complet

### 1. **Extragere Text din PDF** (`lib/anaf/pdf/extractText.ts`)
- Extrage textul brut din PDF
- Încearcă să deducă prețul din text folosind regex patterns:
  - Pattern 1: după "pret", "preț", "pretul", "prețul de evaluare/pornire"
  - Pattern 2: număr mare urmat de "lei" / "RON"
  - Pattern 3: orice număr mare (minim 5 cifre)
- Salvează prețul dedus în `combinedJson.pret` (ca string)

### 2. **OCR pentru PDF-uri Scanate** (`lib/anaf/pdf/visionOCR.ts`)
- Dacă extragerea textului eșuează, folosește Google Vision OCR
- Extrage textul din imagini
- Încearcă să deducă prețul din textul OCR

### 3. **Parsing cu GPT-4o** (`lib/anaf/gptParser.ts`)
- Primește textul extras din PDF
- Trimite prompt la GPT-4o pentru a extrage date structurate
- **PROMPT IMPORTANT** (linia 121): "4. Prețul de evaluare (exclusiv TVA sau inclusiv TVA)"
- **PROMPT IMPORTANT** (linia 184): "Dacă nu găsești prețul pentru un bun, folosește 0 (nu null)"
- GPT returnează JSON cu structura:
  ```json
  {
    "judet": "...",
    "localitate": "...",
    "pret_evaluare": 12345,  // LA NIVEL DE LICITAȚIE (pentru backwards compatibility)
    "bunuri": [
      {
        "tip_bun": "...",
        "pret_evaluare": 12345,  // LA NIVEL DE BUN (corect)
        "moneda": "RON",
        ...
      }
    ]
  }
  ```

### 4. **Normalizare Date** (`lib/anaf/gptParser.ts`, linia 252-263)
```typescript
parsedData.bunuri = parsedData.bunuri.map((bun: any) => {
  if (!bun.pret_evaluare || bun.pret_evaluare === 0) {
    bun.pret_evaluare = 0;  // ⚠️ PROBLEMA: Setează 0 dacă nu există
  }
  // ...
});
```

### 5. **Salvare Licitație în Baza de Date** (`lib/anaf/db.ts`, `saveANAFlicitatie`)
```typescript
pret_evaluare: (licitatieData.pret_evaluare && licitatieData.pret_evaluare > 0) 
  ? licitatieData.pret_evaluare 
  : null,  // ⚠️ PROBLEMA: Verifică la nivel de licitație, nu de bun
```

**PROBLEMA IDENTIFICATĂ:**
- `saveANAFlicitatie` salvează prețul la nivel de **licitație** (`licitatieData.pret_evaluare`)
- Dar prețul real este la nivel de **bun** (`bun.pret_evaluare`)
- Pentru licitații cu mai multe bunuri, `licitatieData.pret_evaluare` poate fi:
  - `undefined` (dacă GPT nu l-a extras)
  - `0` (dacă GPT nu l-a găsit)
  - Prețul primului bun (dacă GPT l-a copiat)
- În `db.ts` linia 225, dacă prețul este `0` sau `undefined`, se setează `null`

### 6. **Creare Produse** (`lib/anaf/productCreator.ts`, `createProductFromANAFBun`)
- Pentru fiecare bun, creează un produs
- Folosește `bun.pret_evaluare` (corect!)
- Linia 174: `starting_price: bun.pret_evaluare || 0`
- Linia 162: `const hasValidPrice = typeof bun.pret_evaluare === 'number' && bun.pret_evaluare > 0;`

## Problema Principală

**Prețul nu se salvează în tabela `anaf_licitatii` pentru că:**

1. **În `gptParser.ts` (linia 253-254)**: Dacă `bun.pret_evaluare` nu există sau este 0, se setează la 0
2. **În `db.ts` (linia 225)**: Dacă `licitatieData.pret_evaluare` este 0 sau nu există, se setează `null`
3. **Prețul corect este la nivel de bun**, nu la nivel de licitație

## Soluții Posibile

### Soluția 1: Populează `licitatieData.pret_evaluare` cu prețul primului bun
În `gptParser.ts`, după normalizarea bunurilor:
```typescript
// Dacă nu există preț la nivel de licitație, folosește prețul primului bun
if (!parsedData.pret_evaluare || parsedData.pret_evaluare === 0) {
  const firstBunWithPrice = parsedData.bunuri?.find(b => b.pret_evaluare && b.pret_evaluare > 0);
  if (firstBunWithPrice) {
    parsedData.pret_evaluare = firstBunWithPrice.pret_evaluare;
  }
}
```

### Soluția 2: Modifică `saveANAFlicitatie` să folosească prețul primului bun
În `db.ts`, înainte de salvare:
```typescript
// Dacă nu există preț la nivel de licitație, folosește prețul primului bun
let pretEvaluare = licitatieData.pret_evaluare;
if (!pretEvaluare || pretEvaluare === 0) {
  const firstBunWithPrice = licitatieData.bunuri?.find(b => b.pret_evaluare && b.pret_evaluare > 0);
  if (firstBunWithPrice) {
    pretEvaluare = firstBunWithPrice.pret_evaluare;
  }
}

pret_evaluare: (pretEvaluare && pretEvaluare > 0) ? pretEvaluare : null,
```

### Soluția 3: Elimină verificarea strictă în `db.ts`
Permite salvarea prețului chiar dacă este 0 (pentru debugging):
```typescript
pret_evaluare: licitatieData.pret_evaluare ?? null,
```

## Recomandare

**Soluția 2** este cea mai robustă, deoarece:
- Păstrează backwards compatibility
- Populează prețul corect pentru licitații cu mai multe bunuri
- Nu necesită modificări în GPT prompt
- Asigură că prețul este salvat în baza de date

## Verificare

Pentru a verifica dacă prețul este extras corect:
1. Verifică log-urile din `gptParser.ts` - ar trebui să vezi prețul extras pentru fiecare bun
2. Verifică în baza de date `anaf_licitatii` - câmpul `pret_evaluare` ar trebui să fie populat
3. Verifică în `products` - câmpul `starting_price` ar trebui să fie populat corect

## Log-uri de Debug

Adaugă log-uri în:
- `gptParser.ts` (după parsing): `console.log('Pret evaluare:', parsedData.pret_evaluare, 'Bunuri:', parsedData.bunuri?.map(b => ({ tip: b.tip_bun, pret: b.pret_evaluare })))`
- `db.ts` (înainte de salvare): `console.log('Saving pret_evaluare:', pretEvaluare)`
- `productCreator.ts` (înainte de creare produs): `console.log('Bun pret_evaluare:', bun.pret_evaluare)`



