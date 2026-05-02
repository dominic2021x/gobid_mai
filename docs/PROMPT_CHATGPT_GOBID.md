# Prompt pentru ChatGPT – proiect GoBid

Copiază textul de mai jos în ChatGPT și completează la final ce anume ai nevoie.

---

Lucrez la un proiect Next.js (v16, React 19, TypeScript) – site-ul de licitații **gobid.ro**.

**Două module admin (importuri):**

1. **Licitatii publice** – `/admin/importuri/licitatii-publice` – **NU MODIFICA NIMIC AICI.** Folosește-l doar ca referință / exemplu.

2. **Executări publice (REPES)** – `/admin/importuri/executari-publice` – **AICI lucrez.** Sincronizează anunțuri de pe https://prod.executori.ro/repes, le publică pe site, extrage date din PDF-uri (titlu, descriere, categorii), afișează detalii sincronizate (Licitator, Email, Telefon, Adresă etc.). Anunțurile publicate apar pe pagina publică /ro în categoria „Executări și Insolvență” și în subcategorii (Imobiliare, Terenuri etc.), la fel ca cele de la licitatii-publice.

**Aplicația mobilă (Capacitor):** **Aplicație pentru tot site-ul gobid.ro** – homepage, căutare, licitații publice, executări publice, cont utilizator. **Recomandare acceptată:** admin nu e necesar în app (se folosește pe desktop); în app e tot site-ul, focus pe utilizator. Dacă staff se loghează în app, poate accesa și /admin dacă e nevoie – nu e blocat, doar nu e scopul principal. WebView încarcă https://gobid.ro; configurația are `server.url: "https://gobid.ro"`.

**Stack:** Next.js 16, React 19, TypeScript, Supabase (auth, DB, storage), API routes în `/app/api/`, scraping cu Puppeteer/Cheerio pentru REPES, rute protejate cu `x-sync-secret` sau auth Supabase.

**Reguli:** Nu propune modificări în codul de la licitatii-publice. Doar în executari-publice și în API-uri/funcții folosite doar de REPES. Dacă iei logică din licitatii-publice, adaptează-o pentru REPES fără a schimba fișierele licitatii-publice. Datele REPES sunt în tabele Supabase dedicate (repes_listings etc.); produsele publicate au source/flag pentru executări publice.

**Ce am nevoie de la tine:** [completează aici: ex. „să implementez butonul X”, „să repar eroarea Y la publicare”, „să adaug log live la sincronizare”, „pași pentru build Capacitor iOS”, etc.]

---
