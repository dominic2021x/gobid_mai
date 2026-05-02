# Reclama laterală stânga (single page, desktop)

## Componentă

- `components/reclame/singlepage_partea_stanga.tsx`

## Unde este folosită

- `app/(site)/live_bid/[slug]/LiveBidSlugView.tsx`

## Comportament

- Se afișează doar pe desktop (`hidden xl:flex`)
- Este poziționată `fixed` pe partea stângă
- Este un rail vertical lung (de sus în jos)
- Nu blochează interacțiunea cu pagina (`pointer-events-none`)

## Dimensiuni curente

- `w-[132px]`
- `2xl:w-[148px]`
- `top-28`
- `bottom-6`

## Poziționare curentă

```ts
left: max(10px, calc((100vw - 80rem) / 2 - 160px))
```

## Design

- fundal alb
- border punctat (`border-dotted`)
- gradient subtil vertical
- pattern grid discret
- icon central cu gradient
- text vertical „Promovare”
- bară gradient jos

## Customizare rapidă

- **Mai aproape de anunț:** schimbă `-160px` în `-145px` / `-130px`
- **Mai lat:** `w-[132px]` -> `w-[150px]` (și `2xl` proporțional)
- **Clickabil:** schimbă `pointer-events-none` în `pointer-events-auto` și adaugă CTA/link
