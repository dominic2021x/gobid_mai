# Indexare embeddings RAG (Supabase pgvector)

## Endpoint

**POST** `/api/ai/index`

### Body (JSON)

| Câmp   | Tip                      | Descriere |
|--------|--------------------------|-----------|
| type   | `"products"` \| `"pages"` \| `"all"` | Ce se indexează (default: `"all"`) |
| force  | `boolean` (opțional)     | Dacă `true`, re-indexează și rândurile care au deja embedding (default: `false`) |
| limit  | `number` (opțional)      | Număr maxim de rânduri per tip (default: 1000, max: 5000) |

### Autentificare

- **Producție:** header obligatoriu: `x-admin-secret: <ADMIN_SECRET>`
- **Development:** dacă `ADMIN_SECRET` nu e setat, request-ul e permis fără header; dacă e setat, se verifică `x-admin-secret`.

### Exemplu

```bash
curl -X POST https://your-app.com/api/ai/index \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{"type":"products","limit":500}'
```

### Răspuns

```json
{
  "indexed": 120,
  "skipped": 0,
  "errors": []
}
```

---

## Variabile de mediu

| Variabilă | Obligatoriu | Descriere |
|-----------|-------------|-----------|
| `OPENAI_API_KEY` | Da | Cheie API OpenAI (text-embedding-3-small) |
| `SUPABASE_SERVICE_ROLE_KEY` | Da | Service role key Supabase (pentru supabaseAdmin) |
| `NEXT_PUBLIC_SUPABASE_URL` | Da | URL proiect Supabase |
| `ADMIN_SECRET` | Da (producție) | Secret pentru header-ul `x-admin-secret` la `/api/ai/index` |

**Notă:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` e folosit de client; pentru acest endpoint se folosește doar `SUPABASE_SERVICE_ROLE_KEY` (prin `supabaseAdmin`).
