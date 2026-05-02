# 🏢 Evaluator Imobiliar Profesional

Sistem complet de evaluare imobiliară în 4 pași, folosind GPT-4o, RAG (Pinecone), Decision Engine și Risk Scoring.

## 📋 Arhitectură

### PASUL 0: RAG Knowledge (Opțional)
- Recuperează cunoștințe despre zone, prețuri istorice, ghiduri imobiliare din Pinecone
- Fallback la Supabase dacă Pinecone nu este disponibil

### PASUL 1: AI Extractor (GPT-4o)
- **Input**: Titlu, descriere, câmpuri utilizator
- **Output**: Tip proprietate, criterii extrase, query Google optimizat
- **Model**: `gpt-4o`
- **Funcție**: `extractRealEstateCriteria()`

### PASUL 2: Google Search API
- Caută comparabile folosind query-ul generat
- Extrage prețuri și detalii din rezultate
- Fallback la mock comparabile dacă nu găsește suficiente

### PASUL 3: AI Analyzer (GPT-4o)
- **Input**: Criterii extrase, comparabile găsite
- **Output**: Preț/mp, percentile (p20, p40, p60, p80), clasificare, explicație
- **Model**: `gpt-4o`
- **Funcție**: `analyzeRealEstateComparables()`

### PASUL 4: Validator (Decision Engine)
- **Input**: Criterii, analiză, număr comparabile
- **Output**: Validare, confidence, recomandări, flag pentru re-analizare
- **Model**: `gpt-4o` + reguli bazate pe logică
- **Funcție**: `validateEvaluation()`

## 🚀 Utilizare

### API Endpoint

```typescript
POST /api/evaluate-real-estate

Request Body:
{
  "title": "Apartament 2 camere 54 mp Militari București",
  "description": "Apartament decomandat, bloc nou, etaj 6/8...",
  "price": 89000,
  "currency": "EUR",
  "userFields": {
    "oras": "București",
    "zona": "Militari",
    "suprafata": 54,
    "camere": 2
  }
}

Response:
{
  "ok": true,
  "step1_extraction": {
    "criteria": { ... },
    "query_google": "apartament 2 camere 54 mp Militari Bucuresti 2015 de vanzare bloc nou",
    "knowledge": "..."
  },
  "step2_search": {
    "comparables_found": 20,
    "comparables": [ ... ]
  },
  "step3_analysis": {
    "pret_mp_subiect": 1630,
    "percentile": {
      "p20": 1400,
      "p40": 1520,
      "p60": 1650,
      "p80": 1780
    },
    "clasificare": "in_piata",
    "explicatie_ai": "..."
  },
  "step4_validation": {
    "valid": true,
    "confidence": 85,
    "needsReanalysis": false,
    "issues": [],
    "recommendations": []
  },
  "risk_score": {
    "score": 15,
    "factors": { ... }
  }
}
```

### Utilizare Directă (Module)

```typescript
import { extractRealEstateCriteria } from '@/lib/real-estate/aiExtractor';
import { analyzeRealEstateComparables } from '@/lib/real-estate/aiAnalyzer';
import { validateEvaluation } from '@/lib/real-estate/validator';
import { retrieveRealEstateKnowledge } from '@/lib/real-estate/ragKnowledge';

// Pasul 1: Extrage criterii
const extracted = await extractRealEstateCriteria(
  "Apartament 2 camere 54 mp Militari",
  "Apartament decomandat, bloc nou...",
  { oras: "București", zona: "Militari" }
);

// Pasul 2: Caută comparabile (folosește Google Search API sau mock)
const comparables = await searchWebForComparables(...);

// Pasul 3: Analizează
const analysis = await analyzeRealEstateComparables(
  extracted,
  comparables,
  89000, // preț subiect
  54 // suprafață subiect
);

// Pasul 4: Validează
const validation = await validateEvaluation(
  extracted,
  analysis,
  comparables.length
);
```

## 📊 Tipuri de Proprietăți Suportate

- `apartament`: Apartamente în bloc
- `casa`: Case și vile
- `teren_intravilan`: Terenuri intravilan
- `teren_agricol`: Terenuri agricole
- `spatiu_comercial`: Spații comerciale
- `hala_industriala`: Hale industriale
- `proprietate_turistica`: Pensiuni, hoteluri

## 🎯 Clasificări

- `sub_piata`: Preț < p20
- `in_piata`: p20 ≤ preț ≤ p80
- `usor_peste`: p80 < preț ≤ p80 + 20%
- `peste_piata`: Preț > p80 + 20%

## 🔧 Configurare

### Variabile de Mediu Necesare

```env
OPENAI_API_KEY=sk-... # Pentru GPT-4o
GOOGLE_SEARCH_API_KEY=... # Pentru căutare comparabile
GOOGLE_SEARCH_ENGINE_ID=... # Pentru căutare comparabile
PINECONE_API_KEY=... # Opțional, pentru RAG
PINECONE_INDEX_NAME=gobid-products # Opțional
```

## 🧪 Testare

```bash
# Test API endpoint
curl -X POST http://localhost:3000/api/evaluate-real-estate \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Apartament 2 camere 54 mp Militari București",
    "description": "Apartament decomandat, bloc nou, etaj 6/8",
    "price": 89000,
    "currency": "EUR"
  }'
```

## 📝 Note

- Sistemul folosește fallback-uri pentru fiecare pas (mock data dacă API-urile eșuează)
- Validatorul poate recomanda re-analizare cu filtre relaxate
- Risk Scoring detectează anunțuri suspecte
- RAG Knowledge este opțional dar îmbunătățește acuratețea

## 🔄 Flux Complet

```
Anunț → AI Extractor → Criterii + Query
                    ↓
              Google Search → Comparabile
                    ↓
              AI Analyzer → Analiză + Clasificare
                    ↓
              Validator → Validare + Re-analizare (dacă e nevoie)
                    ↓
              Risk Scoring → Scor risc
                    ↓
              Răspuns Final
```

## 🎓 Exemple

Vezi `app/api/evaluate-real-estate/route.ts` pentru implementare completă.

