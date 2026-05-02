# Homepage Performance Refactor – Summary

## Objectives Addressed

- **LCP image optimization** – Hero uses Next/Image with priority, AVIF/WebP, and preload.
- **Remove large PNG icons** – Replaced with inline SVG (no extra requests, smaller payload).
- **Reduce forced reflow** – Removed `offsetHeight` reflow from layout script.
- **Font loading** – Switched to `next/font` (Inter) instead of external Google Fonts CSS.
- **Network / caching** – Preload LCP hero, cache headers for slider and icons; preconnect kept for Supabase and jsDelivr.

---

## 1. Modified Components & Files

### Layout & fonts

- **`app/fonts.ts`** (new)  
  - `Inter` from `next/font/google` with `display: "swap"`, `preload: true`, `variable: "--font-inter"`.
- **`app/layout.tsx`**  
  - Use `fontInter` on `<html>` and `<body>`.  
  - Removed Google Fonts `<link>` (preconnect + stylesheet).  
  - Removed forced reflow: no more `void htmlElement.offsetHeight` in the inline script.  
  - LCP preload: from `/images/category-defaults/automobile.png` to `/images/slider/slider-1-auctions.jpg` (hero).

### Hero slider

- **`app/components/Slider.tsx`**  
  - All slides use `next/image` `<Image>` (no raw `<img>`).  
  - First slide: `priority`, `sizes="100vw"`.  
  - Other slides: `loading="lazy"`, `sizes="100vw"`.  
  - Next.js image config already uses `formats: ['image/avif', 'image/webp']`, so hero gets AVIF/WebP automatically.
- **`app/(site)/page.tsx`**  
  - `SliderPlaceholder`: replaced `<img>` with `<Image>` for LCP hero, `priority`, `sizes="100vw"`.

### Icons (PNG → SVG)

- **`components/icons/AccessibilityIcon.tsx`** (new) – inline SVG, replaces `accessibility-icon.png`.
- **`components/icons/TapHandIcon.tsx`** (new) – inline SVG, replaces `tap-hand.png`.
- **`components/icons/SwipeTutorialHandsIcon.tsx`** (new) – inline SVG, replaces `swipe-tutorial-hands.png`.
- **`components/UniversalHeader.tsx`**  
  - All usages of the three PNGs above replaced with the new SVG components (no `backgroundImage` for swipe hands).

### Config & caching

- **`next.config.js`**  
  - Headers:  
    - `Cache-Control: public, max-age=31536000, immutable` for `/images/slider/(.*)` and `/icons/(.*)`.

---

## 2. Performance Explanation

| Change | Why it helps |
|--------|----------------|
| **Next/Image for hero** | Automatic AVIF/WebP, responsive `srcset`, no layout shift (dimensions from `fill` + container). |
| **`priority` on first slide** | Browser preloads LCP image; aligns with `<link rel="preload">` in layout. |
| **`sizes="100vw"`** | Correct hint for full-width hero so the right resolution is requested. |
| **next/font (Inter)** | Fonts self-hosted at build; no blocking request to fonts.googleapis.com; no FOUT if `display: "swap"` is used; fewer third-party connections. |
| **Removed layout script reflow** | Avoiding `void htmlElement.offsetHeight` prevents forced synchronous layout and reduces main-thread work. |
| **Inline SVG icons** | No extra HTTP requests for PNGs; smaller payload and no “Ensure images have correct aspect ratio” / “Properly size images” issues. |
| **LCP preload to hero** | Browser starts loading the hero image as soon as the document is parsed. |
| **Cache headers for slider/icons** | Long-lived cache for static assets improves repeat views and reduces bandwidth. |

---

## 3. Slider Logic – Layout Thrashing

- **Checked**: `app/components/Slider.tsx` does **not** use `offsetWidth` or `getBoundingClientRect` in a loop.
- **Checked**: Homepage floating button uses `getBoundingClientRect` only on drag start / position restore (event-driven), not in a timer or animation loop.
- **Conclusion**: No layout-thrashing changes were required in slider or homepage; the only reflow fix was in the root layout script.

---

## 4. Server Components & Client JS

- Homepage remains a single client tree (`app/(site)/page.tsx` is `"use client"`) because of shared client state (theme, user, modals, etc.).
- **Existing** use of `dynamic()` is unchanged: `Slider`, `PremiumListings`, and `AuthRequiredModal` are loaded as separate chunks, which keeps the initial JS bundle smaller and avoids loading below-the-fold code up front.
- No new Server Component split was added so as not to change state flow or require larger refactors.

---

## 5. Expected Lighthouse Impact

| Metric | Expected change |
|--------|------------------|
| **LCP** | Improved: hero is preloaded and served as AVIF/WebP with correct `sizes`; font no longer blocks. |
| **CLS** | Unchanged or slightly better: Next/Image with `fill` avoids layout shift; font swap can reduce FOUT. |
| **TBT / INP** | Slightly better: less main-thread work after removing forced reflow in the layout script. |
| **Speed Index** | Can improve: faster LCP and fewer render-blocking resources (fonts). |
| **“Properly size images”** | Addressed for hero and slider via Next/Image and `sizes="100vw"`. |
| **“Serve images in next-gen formats”** | Addressed by Next/Image with existing `formats: ['image/avif', 'image/webp']`. |
| **“Reduce unused CSS” (fonts)** | Addressed by using `next/font` (only the weights in use are included). |

**Rough expectation**: LCP often improves by **~200–600 ms** on 4G-style throttling, depending on device and network. Overall Performance score can gain **about 5–15 points** (e.g. 75 → 85), with the largest gains on mobile and slower networks.

---

## 6. How to Verify

1. **LCP / hero**  
   - DevTools → Network: filter by “Img”; confirm hero request is early and (when applicable) type is avif/webp via `/_next/image`.  
   - Lighthouse: “Largest Contentful Paint” element should be the hero image.

2. **Fonts**  
   - No request to `fonts.googleapis.com` or `fonts.gstatic.com`; font files under `/_next/static/`.

3. **Icons**  
   - No requests to `accessibility-icon.png`, `tap-hand.png`, or `swipe-tutorial-hands.png` on the homepage/header.

4. **Cache**  
   - Reload a few times; slider and icon assets should return 304 or be served from disk cache with long `max-age`.
