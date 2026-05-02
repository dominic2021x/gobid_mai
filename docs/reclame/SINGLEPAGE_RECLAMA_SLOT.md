# Slot reclamă single page (desktop)

## Locație și componentă

- **Pagină:** `/live_bid/[slug]` (single anunț)
- **Zonă UI:** coloana dreaptă, sub blocul cu `COD ANUNȚ`
- **Vizibilitate:** doar desktop (`lg:block`)
- **Componentă dedicată:** `components/reclame/singlepage_partea_dreapta_subcodanunt.tsx`
- **Integrare în view:** `app/(site)/live_bid/[slug]/LiveBidSlugView.tsx`

## Scop

Acest slot este rezervat pentru reclame plătite (închiriere spațiu).  
În prezent are conținut placeholder: **„Reclama ta aici”**.

## Termeni de implementare (tehnic)

Pentru orice reclamă nouă în acest slot, recomandarea este:

1. **Nu modifica layout-ul paginii principale** (`LiveBidSlugView`) decât pentru datele trimise.
2. **Actualizează doar componenta dedicată** `singlepage_partea_dreapta_subcodanunt.tsx`.
3. Păstrează fallback-ul vizual dacă nu există campanie activă.
4. Respectă modul white-only (setarea actuală).
5. Nu afișa pe mobil decât dacă se decide explicit.

## Contract minim pentru reclamă (prop/model recomandat)

```ts
type RightSidebarAd = {
  id: string;
  title: string;
  description?: string;
  ctaLabel?: string;
  href?: string;
  imageUrl?: string;
  startsAt?: string;   // ISO
  endsAt?: string;     // ISO
  isActive: boolean;
  priority?: number;
};
```

## Reguli de afișare recomandate

- Afișează reclama doar dacă:
  - `isActive === true`
  - data curentă este între `startsAt` și `endsAt` (dacă există)
- Dacă nu există reclamă validă:
  - afișează placeholder-ul actual „Reclama ta aici”.
- Dacă există `href`, cardul rămâne clickabil (fără nesting invalid).

## Termeni comerciali (template)

Folosește această structură când vinzi slotul:

- **Denumire slot:** Single Page Right Sidebar (desktop)
- **Poziționare:** sub cod anunț, coloană dreaptă
- **Dispozitive incluse:** desktop only
- **Durată campanie:** ex. 7 / 14 / 30 zile
- **Model tarifare:** tarif fix / perioadă
- **Materiale necesare de la client:**
  - titlu scurt
  - descriere scurtă
  - link destinație
  - imagine (opțional)
- **Aprobări:** conținut validat înainte de publicare
- **KPI opțional:** click-uri (dacă se adaugă tracking)

## Checklist publicare reclamă

- [ ] campania este activă (`isActive`)
- [ ] intervalul de date este corect
- [ ] link-ul (`href`) este valid
- [ ] textul încape corect în bloc
- [ ] fallback-ul apare când campania expiră

## Notă

Numele componentei este intenționat explicit (`singlepage_partea_dreapta_subcodanunt.tsx`) pentru a fi ușor de identificat când se adaugă reclame noi.
