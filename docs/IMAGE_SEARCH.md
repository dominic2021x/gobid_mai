# Image Search Implementation

Sistem complet de căutare după imagine folosind GPT-4o Vision + Pinecone embeddings.

## Arhitectură

1. **Vision Extraction**: GPT-4o Vision analizează imaginea și extrage informații structurate
2. **Text Embedding**: Textul generat este embedded folosind `text-embedding-3-large`
3. **Vector Search**: Căutare în Pinecone pentru produse similare
4. **Reranking**: Reordonare și deduplicare bazată pe brand, categorie, etc.

## Setup

### Variabile de Mediu

```env
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=gobid-products
PINECONE_ENVIRONMENT=us-east1-gcp
```

### Indexare Produse

Pentru a indexa produsele în Pinecone:

```bash
curl -X POST http://localhost:3000/api/reindex/products
```

Sau folosește scriptul:
```bash
npm run ai:index:products
```

## API Endpoints

### POST /api/search/image

Căutare după imagine.

**Request:**
- `multipart/form-data`
- Field: `image` (File) - JPEG, PNG, sau WebP, max 8MB
- Field: `topK` (optional, number) - număr de rezultate (default: 40)

**Response:**
```json
{
  "query": {
    "caption": "iPhone 16 Pro Max în cutie",
    "attributes": {
      "category": "electronice",
      "brand": "Apple",
      "color": "Titanium",
      ...
    },
    "identifiers": {
      "model_code": "iPhone 16 Pro Max",
      ...
    },
    "confidence": { ... }
  },
  "match": {
    "status": "exact" | "candidate" | "none",
    "productId": "uuid" | null,
    "score": 0.95 | null
  },
  "similars": [
    {
      "productId": "uuid",
      "score": 0.92,
      "title": "iPhone 16 Pro Max 512GB",
      "image": "https://...",
      "price": 3600,
      "brand": "Apple",
      "category": "electronice"
    },
    ...
  ]
}
```

### POST /api/reindex/products

Reindexează toate produsele active în Pinecone.

**Response:**
```json
{
  "success": true,
  "total": 150,
  "indexed": 148,
  "errors": 2,
  "skipped": 0,
  "duration": 45000
}
```

## Testare

```bash
# Test cu imagine locală
tsx scripts/test-image-search.ts path/to/image.jpg
```

Sau cu curl:
```bash
curl -X POST http://localhost:3000/api/search/image \
  -F "image=@path/to/image.jpg" \
  -F "topK=40"
```

## Integrare Frontend

Frontend-ul trimite direct fișierul la `/api/search/image` și primește rezultatele. Rezultatele sunt stocate în `sessionStorage` și afișate pe pagina `/ro`.

## Match Status Logic

- **exact**: Score >= 0.90, gap >= 0.03, brand match (dacă brand confidence >= 0.6)
- **candidate**: Score >= 0.85
- **none**: Altfel

## Rate Limiting

10 requests per minute per IP (in-memory, TODO: replace with Redis).
