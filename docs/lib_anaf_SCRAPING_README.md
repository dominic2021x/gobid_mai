# ANAF Automatic Scraping System

Sistemul de scraping automat pentru anunțuri ANAF permite extragerea automată a anunțurilor de pe site-ul ANAF, inclusiv pozele și informațiile despre licitații.

## Funcționalități

✅ **Scraping automat** - Extrage anunțuri noi de pe paginile ANAF  
✅ **Paginare automată** - Detectează și parcurge toate paginile disponibile  
✅ **Extragere poze** - Descarcă și procesează pozele disponibile pe site  
✅ **Import automat** - Creează produse automat din anunțurile găsite  
✅ **Evită duplicate** - Verifică anunțurile deja procesate  
✅ **Integrare PDF** - Suportă și importul din PDF-uri (backwards compatible)

## Configurare

### 1. Variabile de mediu

Adaugă în `.env.local`:

```env
# URL-uri către paginile ANAF pentru scraping
# Separat prin virgulă
ANAF_SCRAPE_URLS=https://static.anaf.ro/static/10/Anaf/Informatii_RLA/...,https://static.anaf.ro/static/10/Anaf/Informatii_RLA/...
```

### 2. Configurare Cloudinary (pentru poze)

Asigură-te că ai configurat Cloudinary în `.env.local`:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Utilizare

### Scraping manual

```bash
# POST request către API
curl -X POST http://localhost:3000/api/anaf/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://static.anaf.ro/..."],
    "autoImport": true,
    "maxPages": 10
  }'
```

**Parametri:**
- `urls` (array) - Lista de URL-uri de bază pentru scraping
- `autoImport` (boolean) - Dacă `true`, creează produse automat
- `maxPages` (number) - Numărul maxim de pagini de parcurs per URL (default: 10)

### Scraping automat (Cron Job)

Cron job-ul rulează automat și:
1. Scrapează paginile ANAF configurate
2. Extrage anunțuri noi
3. Descarcă pozele
4. Creează produse automat

**Configurare Vercel Cron:**

În `vercel.json`:

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

Sau folosește Vercel Dashboard → Settings → Cron Jobs

## Structura Anunțului

Fiecare anunț extras conține:

```typescript
{
  id: string;              // ID unic generat
  title: string;           // Titlul anunțului
  description: string;     // Descrierea
  url: string;             // URL-ul complet către anunț
  images: string[];        // URL-uri către poze
  pdfUrl?: string;         // URL către PDF (dacă există)
  price?: number;          // Preț (dacă este extras)
  category?: string;       // Categoria
  location?: string;       // Locația
  date?: string;           // Data
  extractedAt: string;      // Timestamp extragere
}
```

## Procesare

### 1. Scraping

- Descarcă pagina HTML
- Parsează cu Cheerio
- Extrage anunțuri folosind multiple selectori
- **Detectează paginare** - Găsește link-urile către paginile următoare
- **Parcurge toate paginile** - Până la limita `maxPages` (default: 10)
- Extrage pozele și link-urile
- Elimină duplicatele între pagini

### 2. Upload Poze

- Descarcă pozele de la URL-urile găsite
- Încarcă în Cloudinary în folderul `products/anaf`
- Returnează URL-uri Cloudinary

### 3. Creare Produs

- Generează slug din titlu
- Creează câmpuri custom
- Îmbunătățește descrierea cu AI (opțional)
- Salvează în baza de date

## Selectori HTML

### Selectori pentru anunțuri

Sistemul încearcă automat multiple selectori pentru a găsi anunțurile:

```typescript
[
  '.anunt-item',
  '.licitatie-item',
  '.announcement',
  '[class*="anunt"]',
  '[class*="licitatie"]',
  'article',
  '.card',
  '.item',
]
```

Dacă nu găsește anunțuri, încearcă să extragă link-uri directe către anunțuri.

### Selectori pentru paginare

Sistemul detectează automat link-urile către paginile următoare folosind:

```typescript
[
  '.pagination a',
  '.pager a',
  '[class*="pagination"] a',
  'a[rel="next"]',
  'a:contains("Următor")',
  'a:contains("Next")',
  // ... și altele
]
```

De asemenea, detectează pattern-uri în URL-uri:
- `page=2`, `pagina=2`, `p=2`
- `/page/2`, `/pagina/2`

## Paginare

Sistemul suportă automat paginarea:

1. **Detectare automată** - Găsește link-urile către paginile următoare
2. **Parcurgere inteligentă** - Parcurge toate paginile disponibile
3. **Limitare** - Poți seta `maxPages` pentru a limita numărul de pagini
4. **Eliminare duplicate** - Elimină automat anunțurile duplicate între pagini
5. **Rate limiting** - Așteaptă 1 secundă între pagini pentru a evita blocarea

**Exemplu:**
```javascript
// Scrapează primele 5 pagini
const result = await scrapeANAFPage('https://anaf.ro/...', 5);
```

## Rate Limiting

- 1 secundă între request-uri la scraping
- 2 secunde între importuri
- Max 10 poze per anunț

## Debugging

Logurile sunt detaliate și includ:

- `[ANAF Scraper]` - Loguri de scraping
- `[ANAF Announcement]` - Loguri de procesare anunțuri
- `[ANAF Cron]` - Loguri de cron job

## Limitări

- Pozele trebuie să fie accesibile public (fără autentificare)
- Max 10 poze per anunț
- Rate limiting pentru a evita blocarea
- Selectorii HTML pot necesita ajustare pentru structura reală a site-ului ANAF

## Ajustare Selectori

Dacă scraping-ul nu găsește anunțuri, ajustează selectorii în `lib/anaf/scraper.ts`:

```typescript
const announcementSelectors = [
  '.your-custom-selector',
  // ... alte selectori
];
```

## Suport

Pentru probleme sau întrebări, verifică:
1. Logurile din console
2. Structura HTML a paginii ANAF
3. Configurarea variabilelor de mediu
4. Accesul la Cloudinary

