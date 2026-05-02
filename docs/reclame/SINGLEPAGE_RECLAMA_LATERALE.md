# Reclame laterale single page (desktop)

## Scop

Acest document descrie noile sloturi de reclamă laterale pentru pagina de anunț (`/live_bid/[slug]`), afișate doar pe desktop.

## Componente

- `components/reclame/singlepage_partea_stanga.tsx`
- `components/reclame/singlepage_partea_dreapta.tsx`

Ambele sunt integrate în:

- `app/(site)/live_bid/[slug]/LiveBidSlugView.tsx`

## Comportament

- Sloturile sunt **verticale, lungi pe înălțime**.
- Se afișează doar pe desktop:
  - `hidden xl:flex`
- Sunt poziționate `fixed`, între header și footer:
  - `top-28`
  - `bottom-6`
- Sunt setate cu `pointer-events-none` (decorative), ca să nu blocheze interacțiunea cu pagina.

## Dimensiuni și poziționare

Dimensiuni curente:

- `w-[132px]`
- `2xl:w-[148px]`

Poziționare curentă (aproape de containerul central):

- Stânga:
  - `left: max(10px, calc((100vw - 80rem) / 2 - 160px))`
- Dreapta:
  - `right: max(10px, calc((100vw - 80rem) / 2 - 160px))`

## Design (stil premium)

Sloturile folosesc același limbaj vizual premium ca bannerul principal:

- fundal alb (`bg-white`)
- border punctat (`border-dotted`)
- gradient subtil în fundal
- pattern grid discret
- icon central cu gradient
- bandă gradient jos

Diferențiere stânga/dreapta:

- text vertical diferit
- icon diferit
- nuanțe de gradient ușor diferite

## Customizare rapidă

### Le vrei mai aproape de anunț

Modifică `-160px` spre o valoare mai mică (ex. `-145px`) în `style.left` / `style.right`.

### Le vrei mai late

Crește:

- `w-[132px]` -> `w-[150px]`
- `2xl:w-[148px]` -> `2xl:w-[170px]`

### Le vrei active (clickabile)

Înlocuiește `pointer-events-none` cu `pointer-events-auto` și adaugă CTA/link în componente.

## Notă

Aceste două sloturi sunt independente de componenta:

- `components/reclame/singlepage_partea_dreapta_subcodanunt.tsx`

Aceasta rămâne slotul principal din coloana dreaptă, sub blocul cu cod anunț.
