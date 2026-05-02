# Prompturi pe componente reclame (single page)

Acest fișier conține prompturi gata de copy/paste pentru fiecare slot:

- `components/reclame/singlepage_partea_stanga.tsx`
- `components/reclame/singlepage_partea_dreapta.tsx`
- `components/reclame/singlepage_partea_dreapta_subcodanunt.tsx`

Pentru fiecare componentă ai 2 variante:

1. **Prompt ChatGPT** (ca să-ți genereze design/content)
2. **Prompt implementare Codex** (ca să fac direct modificarea în proiect)

---

## 1) `components/reclame/singlepage_partea_stanga.tsx`

### Prompt ChatGPT

```md
Generează designul pentru un slot de reclamă verticală stânga pentru o pagină de anunț auto.

Context:
- Componentă: components/reclame/singlepage_partea_stanga.tsx
- Afișare: desktop only (xl+)
- Stil: premium, clean, modern, white mode
- Layout: rail vertical lung, poziționat fixed pe stânga

Cerințe:
- Fundal alb, border dotted fin
- Gradient subtil + grid discret
- Icon modern centrat
- Text vertical (ex: PROMOVARE / SLOT PREMIUM)
- Bară gradient jos
- Nu încărca vizual agresiv, să rămână elegant

Output:
- Structură JSX + clase Tailwind recomandate
- 2 variante de copy (formal/comercial)
```

### Prompt implementare Codex

```md
Actualizează componenta `components/reclame/singlepage_partea_stanga.tsx` în proiectul meu Next.js + TS + Tailwind.

Obiectiv:
- păstrează componenta desktop-only
- design premium alb (white mode), vertical rail lung
- să fie în același limbaj vizual cu slotul principal din `singlepage_partea_dreapta_subcodanunt.tsx`

Constrângeri:
- nu modifica alte fișiere decât dacă e necesar pentru import/integrare
- păstrează `pointer-events-none`
- fără dark-mode styling separat
- fără erori lint

După implementare:
- confirmă ce ai schimbat
```

---

## 2) `components/reclame/singlepage_partea_dreapta.tsx`

### Prompt ChatGPT

```md
Generează designul pentru un slot de reclamă verticală dreapta pentru o pagină de anunț.

Context:
- Componentă: components/reclame/singlepage_partea_dreapta.tsx
- Afișare: desktop only (xl+)
- Stil: premium, white mode, elegant
- Rail vertical lung, fixed pe dreapta

Cerințe:
- Design diferit de stânga (icon + text), dar din aceeași familie vizuală
- Fundal alb, border dotted fin
- Accent gradient discret
- Text vertical clar
- Potrivit pentru branding premium

Output:
- JSX + Tailwind classes
- micro-animatie hover subtilă (opțional)
- variantă fallback copy dacă nu există campanie activă
```

### Prompt implementare Codex

```md
Modifică `components/reclame/singlepage_partea_dreapta.tsx` să fie un rail de reclamă premium pe desktop.

Cerințe tehnice:
- white mode only
- păstrează poziționarea fixed în dreapta, lungă pe verticală
- lățime ușor mare (compatibilă cu layoutul existent)
- stil similar cu `singlepage_partea_stanga.tsx`, dar conținut/icon diferit
- fără interacțiuni care blochează pagina (`pointer-events-none`)

Nu schimba:
- logica principală a paginii de anunț
- componentele din zona de conținut principal

La final:
- rulează verificare lint pentru fișierul modificat
```

---

## 3) `components/reclame/singlepage_partea_dreapta_subcodanunt.tsx`

### Prompt ChatGPT

```md
Propune un design premium pentru slotul de reclamă din coloana dreaptă, sub codul anunțului.

Context:
- Componentă: components/reclame/singlepage_partea_dreapta_subcodanunt.tsx
- Stil: premium white mode, cu imagine, titlu, descriere și CTA
- Afișare: desktop

Cerințe:
- Card clar, elegant, aerisit
- Poză principală, icon, headline puternic
- CTA gradient modern
- Efecte hover subtile (fără exagerări)
- Structură SSR-safe (fără probleme de hydration)

Output:
- structură JSX finală
- copy profesional (3 variante de descriere)
- clase Tailwind gata de folosit
```

### Prompt implementare Codex

```md
Implementează update în `components/reclame/singlepage_partea_dreapta_subcodanunt.tsx`.

Obiectiv:
- păstrează componenta actuală, dar optimizează designul premium white mode
- menține fallback placeholder + varianta ad activă
- păstrează comportamentele existente:
  - close (X)
  - reset la schimbare produs (`resetKey`)
  - fără erori hydration SSR/CSR

Important:
- white mode permanent (fără dark variant separat pentru card)
- evită nesting invalid (button în link)
- lint clean la final

Returnează:
- ce ai modificat exact
- eventuale trade-off-uri
```

---

## Sugestie de lucru

1. Rulezi promptul de **ChatGPT** pentru idei de design/copy.  
2. Rulezi promptul de **Codex** pentru implementare directă în codul real.
