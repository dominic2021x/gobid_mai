# Configurare Scraping ANAF - Ghid Rapid

## Pasul 1: Adaugă URL-urile în `.env.local`

Deschide fișierul `.env.local` și adaugă următoarea linie:

```env
# URL-uri către paginile ANAF pentru scraping automat
# Separat prin virgulă (fără spații)
ANAF_SCRAPE_URLS=https://static.anaf.ro/static/10/Anaf/Informatii_RLA/...,https://static.anaf.ro/static/10/Anaf/Informatii_RLA/...
```

## Pasul 2: Găsește URL-urile corecte

### Opțiunea 1: De pe site-ul ANAF

1. Mergi pe site-ul ANAF: https://static.anaf.ro/static/10/Anaf/Informatii_RLA/
2. Navighează la paginile cu listări de licitații
3. Copiază URL-ul complet al paginii
4. Adaugă-l în `.env.local`

### Opțiunea 2: URL-uri comune ANAF

URL-urile ANAF au de obicei structura:
```
https://static.anaf.ro/static/10/Anaf/Informatii_RLA/[JUDET]/[CATEGORIE]/
```

**Exemple:**
- Pentru București: `https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Bucuresti/`
- Pentru toate județele: Adaugă URL-ul paginii principale de listări

## Pasul 3: Format corect în `.env.local`

```env
# ✅ CORECT - URL-uri separate prin virgulă, fără spații
ANAF_SCRAPE_URLS=https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Bucuresti/,https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Cluj/

# ❌ GREȘIT - Cu spații
ANAF_SCRAPE_URLS=https://anaf.ro/..., https://anaf.ro/...

# ❌ GREȘIT - Fără virgulă
ANAF_SCRAPE_URLS=https://anaf.ro/... https://anaf.ro/...
```

## Pasul 4: Testează configurarea

După ce ai adăugat URL-urile, testează:

```bash
# Verifică dacă variabilele sunt încărcate
curl http://localhost:3000/api/anaf/scrape
```

Sau testează scraping-ul manual:

```bash
curl -X POST http://localhost:3000/api/anaf/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Bucuresti/"],
    "autoImport": false,
    "maxPages": 5
  }'
```

## Pasul 5: Configurare Cron Job (opțional)

Pentru scraping automat, adaugă în `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/anaf-import",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Sau configurează în Vercel Dashboard → Settings → Cron Jobs

## Exemple complete `.env.local`

```env
# Cloudinary (necesar pentru poze)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ANAF Scraping URLs
ANAF_SCRAPE_URLS=https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Bucuresti/,https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Cluj/,https://static.anaf.ro/static/10/Anaf/Informatii_RLA/Timis/

# Google Maps (pentru geocoding și Street View)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Notă importantă

- **Fără spații** între URL-uri și virgulă
- **URL-uri complete** (cu `https://`)
- **Maxim 10 pagini** per URL (configurabil prin `maxPages`)
- **Rate limiting** - sistemul așteaptă 1 secundă între pagini

## Troubleshooting

### URL-urile nu sunt detectate

1. Verifică dacă variabila este setată:
   ```bash
   echo $ANAF_SCRAPE_URLS
   ```

2. Verifică logurile:
   ```bash
   # În consolă vei vedea:
   [ANAF Scrape API] 🔄 Starting scrape for X URLs...
   ```

### Nu găsește anunțuri

1. Verifică dacă URL-ul este accesibil în browser
2. Verifică structura HTML a paginii (poate necesita ajustare selectori)
3. Verifică logurile pentru erori

### Eroare la upload poze

1. Verifică configurarea Cloudinary în `.env.local`
2. Verifică dacă pozele sunt accesibile public (fără autentificare)



