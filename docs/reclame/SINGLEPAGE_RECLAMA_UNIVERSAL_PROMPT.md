# Prompt universal creare reclamă (single page)

Folosește acest prompt când vrei să generezi rapid un nou slot de reclamă, indiferent de poziție (stânga, dreapta, sub cod anunț etc.).

---

## Prompt gata de folosit

```md
Vreau să creezi un slot nou de reclamă în proiectul meu Next.js + React + TypeScript + Tailwind.

### Context
- Pagina: <PAGE_PATH>
- Componentă nouă: <COMPONENT_FILE_NAME>.tsx
- Folder: components/reclame/
- Stil existent: premium, clean, modern, cu efecte subtile (gradient, glow, hover)
- Compatibilitate: fără erori de hidratare SSR/CSR

### Poziționare
- Poziție în pagină: <left | right | inline | below-section | fixed-rail>
- Vizibilitate: <desktop-only | all>
- Dacă este rail lateral:
  - top: <TOP_VALUE>
  - bottom: <BOTTOM_VALUE>
  - left/right: <POSITION_RULE>

### Dimensiuni (obligatoriu)
- Width: <ex: w-[132px], 2xl:w-[148px]>
- Min height: <ex: min-h-[480px]>
- Aspect imagine: <ex: aspect-[4/3] | aspect-video>
- Padding: <ex: p-6 | p-8>

### Conținut
- Titlu: "<TITLE>"
- Descriere: "<DESCRIPTION>"
- CTA label: "<CTA_TEXT>"
- Link: "<CTA_LINK>"
- Imagine: "<IMAGE_URL or local asset>"
- Placeholder fallback când nu există campanie activă: DA

### Cerințe tehnice
- Creează type:
  - RightSidebarAd (id, title, description, ctaLabel, href, imageUrl, startsAt, endsAt, isActive, priority)
- Fallback dacă ad nu este activ
- Stil consistent în white mode (sau specifică: light/dark)
- Evită nesting invalid (ex: button în a)
- Evită Date.now() în markup SSR dacă produce mismatch
- Adaugă logică opțională de close (X)
- Adaugă `resetKey` dacă vreau reset pe schimbare de produs

### Output dorit
1. Fișier componentă nouă completă
2. Integrare în pagina țintă
3. `.md` scurt de documentare pentru slot
4. Confirmare că nu are erori de lint
```

---

## Variabile rapide (de completat)

- `<PAGE_PATH>`: exemplu `app/(site)/live_bid/[slug]/LiveBidSlugView.tsx`
- `<COMPONENT_FILE_NAME>`: exemplu `singlepage_partea_dreapta_noua`
- `<TOP_VALUE>`: exemplu `top-28`
- `<BOTTOM_VALUE>`: exemplu `bottom-6`
- `<POSITION_RULE>`: exemplu `right: max(10px, calc((100vw - 80rem) / 2 - 160px))`
- `<TITLE>`: text headline reclamă
- `<DESCRIPTION>`: text profesional scurt
- `<CTA_TEXT>`: ex. `Află mai multe`
- `<CTA_LINK>`: URL final campanie

---

## Prompt scurt (quick use)

```md
Creează o componentă nouă de reclamă premium în Next.js, cu dimensiunile:
- width: <WIDTH>
- min-height: <MIN_HEIGHT>
- position: <POSITION>
- desktop-only: <yes/no>

Nume componentă: <NAME>.tsx
Integreaz-o în: <TARGET_FILE>

Include:
- title + description + CTA + image
- fallback placeholder
- stil premium (gradient + hover subtil)
- fără erori hydration
- fără nesting invalid
```

---

## Notă

Dacă slotul trebuie să fie strict white mode, specifică explicit:

- `Use white mode only. Ignore dark theme styling for this ad slot.`
