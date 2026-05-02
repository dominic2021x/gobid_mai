# Analiză RAG cu Supabase pgvector

## 🔍 Ce există deja

### Tabel `products`
| Coloană | Tip | Obligatoriu |
|---------|-----|-------------|
| id | UUID | ✅ PK |
| title | TEXT | ✅ |
| description | TEXT | ❌ |
| slug | TEXT | ❌ (UNIQUE) |
| category | TEXT | ❌ |
| subcategory | TEXT | ❌ |
| starting_price | NUMERIC | ❌ |
| starting_price_ron | NUMERIC | ❌ |
| images | JSONB | ❌ |
| url | TEXT | ❌ |
| status | TEXT | ❌ (default: draft) |
| approval_status | TEXT | ❌ (folosit în cod, posibil adăugat manual) |
| ... | ... | ... |

**Folosit în RAG:** `id`, `title`, `description`, `category`, `subcategory`, `starting_price_ron`, `images`, `url`, `slug`, `status`, `approval_status`

### Tabel `pages`
**Nu există** – `lib/ai/rag-pinecone.ts` se așteaptă la el pentru fallback text search, dar nu e definit în migrații.

### Extensie pgvector
**Nu este activată** – niciun fișier de migrare nu conține `CREATE EXTENSION vector`.

### Coloană embedding
**Nu există** – nici pe `products`, nici pe `pages`.

### Funcții RPC
**Nu există** – `match_products` și `match_pages` sunt apelate din `lib/ai/rag-pinecone.ts`, dar nu sunt definite în DB. Codul cade în fallback la căutare text (ILIKE).

### Embeddings (OpenAI)
- Model: `text-embedding-3-small` (implicit în `utils/embeddings.ts`)
- Dimensiune: **1536**

---

## ❌ Ce lipsește

1. **Extensie `vector`** (pgvector)
2. **Coloană `embedding vector(1536)`** pe `products` și pe `pages`
3. **Coloană `approval_status`** pe `products` (dacă lipsește)
4. **Tabel `pages`** (id, title, content, url, embedding)
5. **Indexuri vector** (HNSW sau IVFFlat) pe `products` și `pages`
6. **Funcții RPC** `match_products` și `match_pages`
7. **Script de indexare** – populează coloanele `embedding` din produse și pagini

---

## ✅ SQL de rulat

Migrarea `supabase/migrations/20260201_rag_pgvector.sql` conține SQL-ul complet.

**Rulare:**
```bash
supabase db push
# sau
supabase migration up
# sau copiază conținutul în Supabase SQL Editor și rulează
```

**Pași din migrare:**
1. `CREATE EXTENSION IF NOT EXISTS vector;`
2. Adaugă `embedding vector(1536)` pe `products` (dacă lipsește)
3. Adaugă `approval_status` pe `products` (dacă lipsește)
4. Index HNSW pe `products.embedding`
5. Creează tabelul `pages` cu `embedding vector(1536)`
6. Index HNSW pe `pages.embedding`
7. Funcție RPC `match_products`
8. Funcție RPC `match_pages`
9. Granturi pentru `service_role` și `authenticated`

---

## După migrare

### Indexare produse
Trebuie creat un script sau endpoint care:

1. Citește produsele din `products`
2. Construiește text pentru embedding: `title + description + category + subcategory`
3. Apelează `generateEmbedding()` din `utils/embeddings.ts`
4. Face `UPDATE products SET embedding = $1 WHERE id = $2`

### Indexare pagini
1. Inserează pagini în `pages` (ex: FAQ, termeni, ajutor)
2. Calculează embedding pentru fiecare pagină
3. Actualizează `pages.embedding`

### Verificare
```sql
-- Verifică extensia
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Verifică coloana pe products
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'embedding';

-- Verifică funcțiile
SELECT proname FROM pg_proc WHERE proname IN ('match_products', 'match_pages');
```
