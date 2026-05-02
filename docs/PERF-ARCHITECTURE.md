# PageSpeed / Core Web Vitals – Architecture & Optimizations

This document describes the gobid.ro performance architecture after the LCP/INP optimization waves (Next.js 16 App Router, React 19, Vercel).

---

## 1. Architecture overview

### Homepage flow (second wave: server-first)

1. **HomeHeroServer (LCP)**  
   - `app/(site)/HomeHeroServer.tsx` is a **Server Component** that renders the above-the-fold hero (single image + title).  
   - The hero image is in the **initial HTML**; `app/layout.tsx` preloads the same URL (`/images/slider/slider-3-real-estate.jpg`).  
   - No client Slider or carousel in the critical path.

2. **HomeEnhancementsClient (minimal above-the-fold client)**  
   - `app/(site)/HomeEnhancementsClient.tsx`: **UniversalHeader** + **HomeSearchLauncherClient** only.  
   - **HomeSearchLauncherClient**: search trigger (button); on click loads full `HeroSearchBar` via `dynamic(..., { ssr: false })`.  
   - Dark mode from `localStorage`; no Supabase or heavy deps in this shell.

3. **HomePremiumListingsServer**  
   - `app/(site)/HomePremiumListingsServer.tsx`: **Server Component** that calls `getHomePremiumListings()` from `lib/server/home/getHomePremiumListings.ts`.  
   - Data cached with `unstable_cache` (60s, tag `home-premium`). Renders 4 static cards with `next/image` and `Link`; no favorite toggle (can be added as lazy client overlay later).

4. **HomeEnhancementsLazy (below-the-fold, ssr: false)**  
   - `app/(site)/HomeEnhancementsLazy.tsx` dynamically imports **HomeLazyShell** (not HomeClient).  
   - **Third wave:** HomeLazyShell is a thin composition layer that holds shared state and lazy-loads **five independent section chunks**: HomeCategoriesSection, HomeActiveAuctionsSection, HomePlansSection, HomeNewsletterSection, HomeFabAndModals (each in `app/(site)/home/*.tsx`, loaded via `dynamic(..., { ssr: false })`).  
   - HomeLazyShell does not render header, search bar, or mobile menu (those are in HomeEnhancementsClient). Premium is rendered only by HomePremiumListingsServer in the page (no duplicate).

5. **Third-party and layout**  
   - **Analytics:** `DeferredAnalytics` loads after `requestIdleCallback`.  
   - **Ads:** `GoogleAdsScript` uses `strategy="afterInteractive"`.  
   - **Remixicon:** `RemixiconLoader` in `useEffect`.  
   - **Layout script:** Minimal inline script for dark mode / low-perf class (sync to avoid FOUC).

### /ro page

- `RoPageClient.tsx` uses `next/image` for non–first-screen cards and wraps the listing grid in Suspense.  
- Listings data: `lib/server/products/listingsRepo.ts` uses `unstable_cache` for default listings.  
- Filter counts: `app/api/ro/filter-counts/route.ts` returns public cache for anonymous and `private, no-store` when auth cookies are present.

---

## 2. Files (second wave)

| File | Role |
|------|------|
| `app/(site)/HomeHeroServer.tsx` | Server Component: hero image + overlay + title (LCP). |
| `app/(site)/HomeSearchLauncherClient.tsx` | Client: search trigger; on click loads full HeroSearchBar (dynamic, ssr: false). |
| `app/(site)/HomeEnhancementsClient.tsx` | Client: header + search launcher only (minimal shell). |
| `app/(site)/HomePremiumListingsServer.tsx` | Server Component: fetches 4 premium via `getHomePremiumListings()`, renders static cards. |
| `app/(site)/HomeEnhancementsLazy.tsx` | Client: dynamic import of HomeLazyShell; loading fallback HomePageSkeleton. |
| `app/(site)/HomeLazyShell.tsx` | Client: thin shell – state (theme, user, tokens, newsletter, FAB, active auctions) + dynamic imports of 5 sections; no header/hero/search/premium. |
| `app/(site)/page.tsx` | Server: HomeEnhancementsClient → HomeHeroServer → HomePremiumListingsServer → Suspense(HomeEnhancementsLazy). |
| `app/(site)/HomeClient.tsx` | Legacy: no longer used by homepage; kept for reference or other routes. |
| `lib/server/home/getHomePremiumListings.ts` | Server: fetch 4 premium products; `unstable_cache` 60s, tag `home-premium`. |
| `app/layout.tsx` | Preload matches HomeHeroServer image. |

### Third wave: section chunks (lazy homepage)

| File | Role |
|------|------|
| `lib/data/home-categories.ts` | Shared category list and type; single source for HomeCategoriesSection. |
| `app/(site)/home/HomeCategoriesSection.tsx` | Lazy: categories grid (mobile + desktop); props: `isDarkMode`. Intentionally lazy – below-the-fold. |
| `app/(site)/home/HomeActiveAuctionsSection.tsx` | Lazy: active auctions grid; props: isDarkMode, loading flags, activeAuctions, userTokens, unlock/favorite handlers. Supabase + card UI isolated to this chunk. |
| `app/(site)/home/HomePlansSection.tsx` | Lazy: plan cards (Basic, Standard, Pro, Enterprise); props: `isDarkMode`. |
| `app/(site)/home/HomeNewsletterSection.tsx` | Lazy: newsletter CTA and form; props: isDarkMode + newsletter state/handlers. Form/API deps only in this chunk. |
| `app/(site)/home/HomeFabAndModals.tsx` | Lazy: AuthRequiredModal + FAB; props: auth state, FAB position/ref, drag/touch handlers. Heavy modal deps isolated. |
| `app/(site)/home/types.ts` | Shared types: HomeActiveAuction, HomeUserTokens. |

HomeLazyShell imports these sections via `dynamic(..., { ssr: false })` from `app/(site)/home/`; each section is a separate JS chunk. The legacy `app/(site)/home-sections/` directory may still exist; homepage uses `app/(site)/home/` for the five sections.

---

## 3. Performance impact (estimates)

| Change | Expected impact |
|--------|------------------|
| Server hero (HomeHeroServer) | **LCP:** Hero in first HTML; no client JS for above-the-fold image. |
| Minimal client shell (header + launcher) | **Hydration / TBT:** Only header + search trigger in first client bundle; HeroSearchBar loaded on interaction. |
| Server premium block | **LCP / TTI:** Premium cards in HTML; no client fetch or PremiumListings component in critical path. |
| Lazy rest (HomeEnhancementsLazy, ssr: false) | **Initial JS:** Categories, active auctions, plans, newsletter, FAB in separate chunk; loads after shell. |
| **Third wave: section chunks** | **Lazy chunk size:** Single large HomeClient chunk replaced by HomeLazyShell + 5 independent lazy sections; smaller initial lazy payload and per-section chunks; less post-load main-thread work. |
| Defer active auctions fetch (inside shell) | **INP:** requestIdleCallback for Supabase in HomeLazyShell when lazy boundary runs. |

---

## 4. Scalability notes

- **Hero:** Carousel can be re-added as a lazy client component that augments the server hero after idle.  
- **Lazy chunk (third wave):** HomeEnhancementsLazy loads HomeLazyShell, which dynamic-imports HomeCategoriesSection, HomeActiveAuctionsSection, HomePlansSection, HomeNewsletterSection, HomeFabAndModals from `app/(site)/home/`; each section is a separate lazy chunk.  
- **Premium:** `getHomePremiumListings` uses `unstable_cache`; revalidate/tags can be tuned; favorite buttons can be added via a small client overlay.  
- **Listings:** `listingsRepo` + `unstable_cache` for /ro unchanged.

---

## 5. Security and cache notes

- **Authenticated API responses** must not be edge-cached. In `filter-counts`, `hasAuthOrCookies(request)` forces `Cache-Control: private, no-store`. Any route that returns user-specific data must do the same.  
- **Preload** is for the same URL as the server-rendered hero; no sensitive data.  
- **Premium listings** are fetched on the server (`getHomePremiumListings`); no auth. Active listings still fetched in client (HomeLazyShell) after idle; auth via Supabase client and RLS.

---

## 6. Edge cases and maintenance

- **LCP image:** If the hero image URL changes, update `HomeHeroServer.tsx` and the preload in `app/layout.tsx`.  
- **requestIdleCallback:** Fallback to immediate run when not available; timeout 2000 ms.  
- **No duplicate premium:** Single premium block via HomePremiumListingsServer in page; HomeLazyShell does not render premium when used with this layout.  
- **SEO:** Homepage has server-rendered hero + premium; metadata and critical content in initial response.  
- **Dark mode:** Section components receive `isDarkMode` from HomeLazyShell (from localStorage after mount); layout inline script sets `.dark` early to reduce FOUC.  
- **Third-wave sections:** No duplicate header/hero/search/premium in lazy path; category data in `lib/data/home-categories.ts`; FAB touch drag uses `onFloatingTouchMove` so parent can `preventDefault` when dragging.

---

## 7. How to verify

- **LCP:** Lighthouse (mobile); LCP element = hero image; preload and `HomeHeroServer` image URL must match.  
- **Bundle:** `npm run build:analyze`; initial route should not include HomeLazyShell, full HeroSearchBar, or section implementations; they load via HomeEnhancementsLazy (shell + 5 section chunks).  
- **Cache:** `getHomePremiumListings` cached 60s; `/api/ro/filter-counts` with/without auth → `Cache-Control` public vs. private.
