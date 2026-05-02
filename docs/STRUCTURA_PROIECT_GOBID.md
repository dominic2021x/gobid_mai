# Structura tehnică – gobid.ro (Next.js + TypeScript)

Document de referință pentru stack, arhitectură și organizarea codului.

---

## 1. Stack principal

| Tehnologie | Versiune / Detalii |
|------------|--------------------|
| **Framework** | Next.js **16.0.7** (App Router) |
| **Limbaj** | **TypeScript** (strict mode, `tsconfig.json`) |
| **UI** | **React 19.2.0** |
| **Styling** | **Tailwind CSS v4** (`@tailwindcss/postcss`), PostCSS, `globals.css` |
| **Deploy** | **Vercel** (serverless, cron-uri în `vercel.json`) |

- **Alias**: `@/*` → rădăcina proiectului (ex: `@/lib/supabase`, `@/components/...`).

---

## 2. Structura directoarelor

```
/
├── app/                    # App Router (Next.js) – rute, layout-uri, API
├── components/             # Componente React reutilizabile (header, chat, formulare etc.)
├── lib/                    # Logică business, clienți (Supabase, AI, scraperi, utilitare)
│   └── server/             # Cod server-only: db (Prisma), products/listingsRepo (listări /ro)
├── types/                  # Definiții TypeScript (product, pdf-parse, speech etc.)
├── hooks/                  # React hooks (ex: useExchangeRate)
├── utils/                  # Utilitare (embeddings, pageTracker)
├── modules/                # Module/feature-uri izolate
├── data/                   # Date statice (JSON etc.)
├── scripts/                # Scripturi CLI (indexare AI, sync, setup)
├── prisma/                 # Schema Prisma (products etc.), migrări
├── supabase/               # Migrări SQL, definiții schema
├── public/                 # Assets statice (imagini, favicon)
├── assets/                 # Imagini pentru categorii etc.
├── web/                    # Build minimal pentru Capacitor (index.html)
├── middleware.ts           # Middleware Next.js (ex: no-cache pe localhost)
├── next.config.js          # Config Next (imagini, redirects, headers)
├── capacitor.config.ts     # Config app mobilă (Capacitor)
├── vercel.json             # Cron-uri și config deploy Vercel
└── package.json
```

---

## 3. Routing (App Router)

- **Convenție**: fiecare rută este un folder cu `page.tsx` (și opțional `layout.tsx`).
- **Layout-uri**: `app/layout.tsx` (root: HTML, fonturi, Analytics, dark mode script), apoi layout-uri nested pentru zone (dashboard, admin).

**Zone principale:**

| Cale | Rol |
|------|-----|
| `/` | Homepage (listare licitații, search hero) |
| `/ro` | Pagina principală licitații (conținut similar/diferit) |
| `/licitatii`, `/licitatii-publice` | Listări licitații |
| `/licitatii-publice/[slug]`, `/produs/[slug]` | Detalii produs/licitație |
| `/live_bid/[slug]` | Licitație live (bid) |
| `/search`, `/search/image`, `/rezultate` | Căutare și rezultate |
| `/categorii` | Categorii produse |
| `/auth`, `/auth/register/company`, `/auth/reset-password` | Autentificare, înregistrare, reset parolă |
| `/dashboard/*` | Zona utilizator (favorite, oferte, plăți, setări, executor/lichidator) |
| `/admin/*` | Panou admin (utilizatori, produse, importuri, rapoarte, cron-uri) |
| `/price-evaluator`, `/smart-mortgage`, `/credit-ipotecar-inteligent` | Tool-uri (evaluare preț, credit) |
| `/contact`, `/despre-noi`, `/termeni`, `/politica-confidentialitate` | Pagini statice |

- **Rute dinamice**: `[slug]`, `[userId]`, `[id]` etc. în path.
- **Client components**: multe pagini au `"use client"` (state, efecte, Supabase auth în layout-uri).

---

## 4. API Routes (Backend în același proiect)

- Toate API-urile sunt în **`app/api/`**, sub formă de **Route Handlers** Next.js (fișiere `route.ts` cu `GET`, `POST` etc.).
- **Organizare**: un folder pe domeniu (ex: `api/auth/`, `api/search/`, `api/admin/`), cu sub-rute după nevoie.

**Exemple de grupe:**

- **Auth**: `api/auth/[...nextauth]` (NextAuth), `api/auth/google/`, `api/auth/reset-password/`, `api/auth/verify-code/` etc.
- **Search**: `api/search/`, `api/search/results/`, `api/search/suggestions/`, `api/search/semantic/`, `api/search/image/`.
- **Pagina /ro (feed listări)**: `api/ro/listings` (paginate, filtre server-side; backend Supabase sau Prisma via `USE_PRISMA_LISTINGS`), `api/ro/filter-counts` (count-uri categorii/subcategorii).
- **Produse / licitații**: `api/products/`, `api/bids/`, `api/executor/import/`, `api/licitatii-publice/`.
- **Admin / sync**: `api/admin/sync-repes/`, `api/admin/sync-licitatii/`, `api/admin/products/`, `api/admin/users/`, `api/cron/*`.
- **AI / chat**: `api/chat/`, `api/ai-chat/`, `api/ai/`, `api/product-chat/`, `api/tts/`, `api/transcribe/`.
- **Utilizator**: `api/user/favorites/`, `api/user/activity/`, `api/notifications/`, `api/tokens/`.
- **Servicii externe**: `api/anaf/`, `api/exchange-rate/`, `api/street-view/`, `api/premium/`.

- **Cron (Vercel)**: definite în `vercel.json` (ex: autopromo, sync-stats, anaf-import, exchange-rate update).
- **Timeout**: unele rute lungi folosesc `export const maxDuration = 300` (sau 800 pe Pro) pentru a evita timeout-uri pe serverless.

---

## 5. Autentificare

- **Site public / utilizatori**: **Supabase Auth** (session în browser, `supabase.auth.getSession()`). Layout-urile din `app/dashboard/` și `app/admin/` verifică sesiunea și rolul (admin/manager) și redirecționează dacă nu e autentificat.
- **Panou admin (login separat)**: **NextAuth** cu provideri **Google** și opțional **Apple** (`app/api/auth/[...nextauth]/route.ts`). Pagini custom: `signIn: '/auth'`, `error: '/auth'`.
- **Callback-uri**: `app/auth/callback/` (Supabase), `app/auth/google-success/`, `app/auth/facebook-success/` pentru OAuth.

---

## 6. Bază de date și backend

- **Baza de date**: **Supabase** (PostgreSQL). Acces direct și prin **Prisma** (model `products`, listări pentru /ro).
- **Supabase client**: `lib/supabase.ts` – `createClient` cu URL și anon key din env, plus un wrapper custom pentru `fetch` (fix 406 la PATCH). Realtime opțional. Tabele / logică în migrări din `supabase/`; acces din API și componente prin `supabase.from('...')`.
- **Prisma**: schema în `prisma/schema.prisma`, client în `lib/server/db`. Listări pentru pagina /ro în `lib/server/products/listingsRepo.ts` – `getRoListings()` poate rula pe **Supabase** (implicit) sau pe **Prisma** când `USE_PRISMA_LISTINGS=true` (dev); același răspuns API (`items`, `nextFrom`, `hasMore`). Sursa canonică pentru produse publice: `public.products`.
- **Variabile env**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Pentru Prisma: `DATABASE_URL`; opțional `USE_PRISMA_LISTINGS=true` pentru backend listări /ro.

---

## 7. Styling și UI

- **Tailwind v4**: configurat prin `postcss.config.mjs` (`@tailwindcss/postcss`). Clase utility peste tot în JSX.
- **Global**: `app/globals.css` – `@import "tailwindcss"`, variabile CSS (`:root`), dark mode pe `<html class="dark">`, safe-area pentru app (PWA/Capacitor), keyframes (animații).
- **Dark mode**: stocat în `localStorage` (`darkMode`), aplicat prin script inline în `app/layout.tsx` înainte de paint; fără `prefers-color-scheme` pentru a nu interfera cu toggle-ul manual.
- **Fonturi**: system + preconnect la Google Fonts; Remix Icon din CDN.
- **Imagini**: Next.js Image (optimizare AVIF/WebP), `next.config.js` – `remotePatterns`, `dangerouslyAllowSVG`, cache headers pe `_next/static` și pe foldere custom.

---

## 8. Componente

- **Locație**: `components/` (și câteva în `app/components/` pentru pagini specifice, ex: `HeroSearchBar`, `Slider`).
- **Header global**: `components/UniversalHeader.tsx` – navigare, search, notificări, dark mode, responsive; folosit pe homepage și în layout-uri.
- **Alte componente**: chat (AIChat, ChatWidget, AdminChatWidget), formulare (AddressAutocomplete, LocationAutocomplete), listări (AuctionContent, PremiumListings), modale (AuthRequiredModal, VerificationCodeModal), skeleton-uri în `components/skeletons/`, etc.
- **Pattern**: majoritatea sunt **Client Components** (`"use client"`) pentru state și efecte; unde e nevoie se folosește `dynamic(..., { ssr: false })`.

---

## 9. Librăria `lib/` – logică și servicii

- **Supabase**: `lib/supabase.ts` (client browser).
- **Server-only**: `lib/server/db.ts` (Prisma client), `lib/server/products/listingsRepo.ts` – listări paginate pentru `/api/ro/listings` (filtre server-side, fallback progresiv; Supabase sau Prisma după `USE_PRISMA_LISTINGS`).
- **AI**: `lib/ai/` – OpenAI, LangChain, RAG (Pinecone, Qdrant), embeddings, indexare, sugestii, TTS, transcriere.
- **Căutare**: `lib/search/` – indexare, normalizare, reguli categorii, Supabase/Pinecone.
- **Scraperi / surse date**: `lib/scraper/`, `lib/scraper-repes/`, `lib/anaf/` – parsare listări, detalii, PDF-uri, ANAF.
- **Produse / licitații**: `lib/description-processor.ts`, `lib/priceLogic.ts`, `lib/licitatii-*.ts`, `lib/repes-sync-products.ts`, `lib/licitatii-insolventa-sync-products.ts`.
- **Imagini**: `lib/image-search/`, `lib/convertToWebp.ts`, `lib/getProductDisplayImage.ts`.
- **Video / promo**: `lib/video/` – scripturi, HeyGen, ElevenLabs, TikTok, YouTube.
- **Maps / locații**: `lib/maps/` (geocode, Street View).
- **Real estate / evaluare**: `lib/real-estate/`, `lib/autopilot/`.
- **Utilitare**: `lib/currency.ts`, `lib/slugify.ts`, `lib/darkMode.ts`, `lib/categories.ts`, template-uri email etc.

---

## 10. State și date

- **Server**: date din API routes (Supabase, env, servicii externe). Unele rute sunt lungi și folosesc `maxDuration`.
- **Client**: React state (`useState`, `useEffect`) în layout-uri și pagini; **Zustand** în `package.json` pentru state global unde e folosit.
- **Session**: Supabase session pe client; NextAuth session doar pentru admin.

---

## 11. Aplicația mobilă (gobid.ro ca app)

- **Capacitor 6**: `capacitor.config.ts` – `appId: 'ro.gobid.app'`, `webDir: 'web'`.
- **Mod de rulare**: **remote WebView** – `server.url: 'https://gobid.ro'`; nu se face build de tip export pentru app, ci se încarcă direct site-ul. `web/` conține un `index.html` minimal pentru sync.
- **Safe area**: în `globals.css`, padding-ul de sus (safe-area) se aplică doar în `display-mode: standalone` sau `fullscreen` (PWA/app), nu în browser.

---

## 12. Variabile de mediu (rezumat)

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Prisma**: `DATABASE_URL` (conexiune PostgreSQL; folosit de `lib/server/db` și de CLI `npx prisma`). Opțional: `USE_PRISMA_LISTINGS=true` pentru a servi listările /ro din Prisma în loc de Supabase (același răspuns API).
- **Site**: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`.
- **Auth**: NextAuth `NEXTAUTH_SECRET`; Google `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; opțional Apple `APPLE_ID`, `APPLE_SECRET`.
- **Cron / sync**: `CRON_SECRET`, `SYNC_SECRET`.
- **OpenAI**: `OPENAI_API_KEY`, `OPENAI_API_URL`, opțional `OPENAI_MODEL`, `OPENAI_VISION_MODEL` etc.
- **Alte servicii**: ElevenLabs, TTS, Resend, Cloudinary etc. (conform `.env.example`).

---

## 13. Build și deploy

- **Build**: `next build` (nu se folosește `next export` pentru app; export-ul din scripts e pentru alte scopuri).
- **Start**: `next start`.
- **Vercel**: deploy din repo; serverless functions; cron-uri din `vercel.json`; limite `maxDuration` (ex: 800s pe plan Pro) respectate în API.
- **Middleware**: `middleware.ts` – pe localhost se seteză no-cache pentru HTML/API; în rest Next.js aplică cache-ul normal.

---

## 14. Rezumat pe scurt

- **Next.js 16** (App Router) + **TypeScript** + **React 19**.
- **Tailwind v4** + CSS global; dark mode prin class pe `<html>` și localStorage.
- **Auth**: Supabase pentru utilizatori, NextAuth pentru admin (Google/Apple).
- **DB și API**: Supabase (PostgreSQL); opțional Prisma pentru listări /ro (`USE_PRISMA_LISTINGS`). Backend în același proiect sub `app/api/` (Route Handlers); feed /ro: `api/ro/listings` + `api/ro/filter-counts`.
- **Funcționalități**: căutare (text, semantic, imagine), licitații live, dashboard utilizator, panou admin, sync-uri (REPES, licitații, ANAF), AI (chat, RAG, TTS), evaluare preț, video/promo.
- **Mobil**: Capacitor cu WebView remote pe https://gobid.ro; safe-area doar în mod app/PWA.
- **Deploy**: Vercel, cu cron-uri și respectarea limitelor de timeout pentru serverless.

Dacă ai nevoie de detaliu pentru o parte anume (ex: doar auth, doar API, doar AI), se poate extrage din acest document o secțiune dedicată.
