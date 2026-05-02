# Adopția Prisma – Migrare treptată

## Ce s-a făcut

1. **Prisma instalat și configurat**
   - `prisma` (devDependency), `@prisma/client`, `@prisma/adapter-pg`, `pg`
   - `prisma/schema.prisma` – model `Product` (introspect cu `prisma db pull` când ai DATABASE_URL)
   - `prisma.config.ts` – URL din `DATABASE_URL`
   - Schema fără `url` în datasource (Prisma 7 – URL în config)

2. **Singleton PrismaClient**
   - `lib/server/db.ts` – PrismaClient cu adapter pg, protecție hot-reload în dev
   - Necesită `DATABASE_URL` (PostgreSQL connection string)

3. **Repo pentru listings**
   - `lib/server/products/listingsRepo.ts` – `getRoListings(query)`
   - Implementare implicită: Supabase (comportament neschimbat)
   - Implementare Prisma: activată cu `USE_PRISMA_LISTINGS=true`

4. **Endpoint migrat**
   - `/api/ro/listings` folosește `getRoListings()` din repo
   - Răspuns HTTP identic (items, nextFrom, hasMore, fresh)

5. **Script de verificare parity**
   - `scripts/compare_listings.ts` – compară Supabase vs Prisma pe 5 query-uri
   - Rulează: `npx tsx scripts/compare_listings.ts`

## Cum rulezi pe local

```bash
# 1. Instalare
npm install

# 2. Generează Prisma Client (nu necesită DB conectat)
npx prisma generate

# 3. Opțional: introspect schema din DB (când ai DATABASE_URL)
# Adaugă DATABASE_URL în .env.local din Supabase Dashboard → Database → Connection string
npx prisma db pull

# 4. Dev server
npm run dev

# 5. Verificare parity Supabase vs Prisma
npx tsx scripts/compare_listings.ts
```

## Cum activezi flag-ul Prisma

În `.env.local`:

```
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
USE_PRISMA_LISTINGS=true
```

Restartează `npm run dev`. Endpoint-ul `/api/ro/listings` va folosi Prisma în loc de Supabase.

## Ce NU trebuie făcut încă

- **Nu rula** `prisma migrate dev` sau `prisma migrate deploy` pe producție
- Nu modifica schema DB în acest pas
- Nu schimba contractul răspunsului API
- Nu atinge importurile admin

## Pașii următori

1. **Baseline migrate** – când ești gata, rulează `prisma migrate dev` pe o bază locală/staging
2. **Indexuri** – adaugă indexuri pentru filtre (categorie, preț, etc.) dacă e nevoie
3. **Mutare completă la Prisma** – setează `USE_PRISMA_LISTINGS=true` ca default și elimină Supabase din listings
4. **Filtre** – extinde `ProductQuery` și implementează q, categorie, subcategorie, price_min, price_max, sort în repo
