# Licitatii Insolventa Sync

Sincronizare inventar de pe **https://www.licitatii-insolventa.ro** (fără API oficial). Sursa de adevăr este pagina de căutare `/cauta`.

## Ce face

- **Crawl listing**: parcurge paginile de la /cauta (1..lastPage) și colectează toate cardurile de anunțuri.
- **Upsert**: pentru fiecare `source_external_id` actualizează sau inserează în `licitatii_insolventa_listings` (titlu, preț, categorie, locație, `last_seen_at`).
- **Soft-delete**: orice înregistrare din DB care nu a fost văzută în acest crawl (`last_seen_at < crawlStartedAt`) primește `deleted_at = now`. Ștergerea se bazează **doar** pe crawl-ul complet al /cauta.
- **Detalii**: pentru anunțuri fără PDF/descriere/imagine sau cu `updated_at` mai vechi de 24h se descarcă pagina de detaliu (concurrency max 3), se extrag PDF, imagini, descriere, vânzător, data licitației etc., și se actualizează DB + `licitatii_insolventa_listing_images`.

## Cum rulezi

### Din UI (admin)

1. Mergi la **http://localhost:3000/admin/importuri**.
2. Deschide **Licitatii publice** (link către `/admin/importuri/licitatii-publice`).
3. Apasă **Rulează sincronizare**. Trebuie să fii autentificat ca admin (Bearer token din sesiune).

### Din API (cron / script)

- **POST** `/api/admin/sync-licitatii`
- Header: `x-sync-secret: <SYNC_SECRET>` (valoarea din `process.env.SYNC_SECRET`).
- Răspuns exemplu:

```json
{
  "success": true,
  "summary": {
    "pagesCrawled": 39,
    "itemsFound": 1200,
    "inserted": 50,
    "updated": 1150,
    "softDeleted": 2,
    "detailsFetched": 200,
    "errors": []
  }
}
```

### Cron (Vercel)

În `vercel.json` poți defini un cron care apelează endpoint-ul cu secretul:

```json
{
  "crons": [
    {
      "path": "/api/admin/sync-licitatii",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Vercel trimite un header specific pentru cron; poți verifica în route că request-ul vine de la cron și folosești `SYNC_SECRET` în acel context, sau apelezi manual cu `curl`:

```bash
curl -X POST https://your-domain.com/api/admin/sync-licitatii \
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

### Self-hosted (script)

```bash
npx tsx scripts/run-sync.ts
```

Scriptul apelează direct `syncAllListings()` (nu folosește HTTP). Pentru cron pe server: `0 6 * * * cd /path/to/project && npx tsx scripts/run-sync.ts`.

## Variabile de mediu

- `SYNC_SECRET` – obligatoriu pentru apeluri API cu header `x-sync-secret`.
- `SCRAPER_USER_AGENT` – opțional; default: `Mozilla/5.0 (compatible; LicitatiiBot/1.0; ...)`.
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – pentru DB (migrarea `licitatii_insolventa_listings` + `licitatii_insolventa_listing_images` trebuie aplicată).

## Structură

- `http.ts` – fetch HTML, retry/backoff, delay.
- `location.ts` – normalizare locație (oraș, județ; ignoră „(Romania)”).
- `parseListing.ts` – parsare pagină /cauta, `getLastPage`, `extractExternalId`.
- `parseDetail.ts` – parsare pagină detaliu (titlu, PDF, imagini, câmpuri custom).
- `sync.ts` – orchestrator: crawl, upsert, soft-delete, fetch detalii cu p-limit.
- `types.ts` – tipuri rezumat sync.

Teste: `npm run test` sau `npx vitest run lib/scraper/parseListing.test.ts`.
