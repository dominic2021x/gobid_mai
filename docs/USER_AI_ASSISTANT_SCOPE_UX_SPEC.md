# gobid.ro — User AI Assistant (Scope & UX Spec)

**Last updated: 24 februarie 2025**

---

## A) Scop și non-scopuri

### Ce face asistentul (exact două categorii)

1. **Explică dashboard-ul și meniul**  
   Explică structura panoului utilizatorului, unde se află fiecare secțiune și unde să dea click pentru a accesa o funcționalitate (ex.: „Pentru anunțurile tale mergi la Dashboard → Anunțurile mele” sau link direct).

2. **Asistent creare anunț**  
   Ghidează utilizatorul pas cu pas la crearea unui anunț: colectează datele lipsă, salvează un draft și poate finaliza publicarea doar dacă toate câmpurile obligatorii sunt completate.

### Ce NU face asistentul (listă explicită)

- **Admin / back-office**: nu execută acțiuni de administrare, nu accesează panoul admin (`/admin`), nu modifică setări globale.
- **Acces la date interne**: nu citește sau nu răsfoiește baza de date în mod liber; nu are acces la datele altor utilizatori.
- **Decizii de preț / economice**: nu stabilește prețuri sau politici de preț; poate doar ghida utilizatorul să introducă un preț.
- **Sfaturi juridice sau financiare**: nu oferă consiliere juridică sau financiară.
- **Modificarea licitațiilor existente**: nu modifică licitații deja publicate (doar poate actualiza draft-uri de anunț deținute de utilizator).
- **Conținut Executări/Insolvență (token-gated)**: nu creează sau nu publică anunțuri în canalul executări_insolventa în locul utilizatorului; poate explica că acest tip de conținut necesită token și să ghideze utilizatorul către fluxul oficial.
- **Acțiuni ascunse sau „joker”**: nu execută comenzi sau acțiuni care depășesc scope-ul de mai sus.

---

## B) Harta UI verificată (din repo)

Toate rutele de mai jos sunt cele găsite în cod pentru utilizatorul autentificat (dashboard și sub-rute). **Dovezi**: câte un fișier pagină și, unde e cazul, componente cheie.

### Rute dashboard principale (utilizator obișnuit)

| Rută | Scop (1 propoziție) | Dovezi |
|------|----------------------|--------|
| `/dashboard` | Pagina principală a panoului: bun venit, acțiuni rapide, tab-uri (Active, Câștigate, Istoric, Licitații mele). | `app/dashboard/page.tsx` |
| `/dashboard/favorites` | Lista de favorite (licitații/produse); acces permis și pentru invitați (localStorage). | `app/dashboard/favorites/page.tsx` |
| `/dashboard/ofertele_mele` | Ofertele mele (mesaje/oferte legate de anunțuri). | `app/dashboard/ofertele_mele/page.tsx` |
| `/dashboard/my-products` | Anunțurile mele: listă produse, filtre (draft/active/etc.), modal creare/editare anunț (formular manual). | `app/dashboard/my-products/page.tsx` — `showManualAddModal`, `ManualFormData`, `handleManualFormSubmit` |
| `/dashboard/my-bids` | Licitațiile mele (bid-uri). | `app/dashboard/my-bids/page.tsx` |
| `/dashboard/exclusiv` | Anunțuri exclusive. | `app/dashboard/exclusiv/page.tsx` |
| `/dashboard/tokens` | Sold și istoric token-uri. | `app/dashboard/tokens/page.tsx` |
| `/dashboard/settings` | Setări cont. | `app/dashboard/settings/page.tsx` |
| `/dashboard/payments` | Plăți. | `app/dashboard/payments/page.tsx` |
| `/dashboard/support` | Suport: re-export la pagina de suport executor. | `app/dashboard/support/page.tsx` (export din `../executor/support/page`) |
| `/dashboard/reviews` | Review-uri primite/date. | `app/dashboard/reviews/page.tsx` |
| `/dashboard/messages` | Mesaje / conversații (ProductChat, chat-uri pe produse). | `app/dashboard/messages/page.tsx` |
| `/dashboard/customize-buttons` | Personalizare butoane acțiuni rapide pe dashboard. | `app/dashboard/customize-buttons/page.tsx` |

### Rute dashboard executor

| Rută | Scop | Dovezi |
|------|------|--------|
| `/dashboard/executor` | Panou executor: acțiuni rapide, produse, statistici. | `app/dashboard/executor/page.tsx` |
| `/dashboard/executor/add-auction` | Redirecționare către „Produsele mele” cu modal deschis; nu conține formular propriu. | `app/dashboard/executor/add-auction/page.tsx` — `router.push(\`${basePath}/my-products?openManualModal=true\`)` |
| `/dashboard/executor/my-products` | Produsele executorului: listă, import, modal adăugare manuală (ManualAddModalExecutor). | `app/dashboard/executor/my-products/page.tsx` — `showManualAddModal`, `ManualAddModalExecutor` |
| `/dashboard/executor/import-auctions` | Import anunțuri (fișier/URL, creare automată cu AI). | `app/dashboard/executor/import-auctions/page.tsx` |
| `/dashboard/executor/favorites` | Favorite executor. | `app/dashboard/executor/favorites/page.tsx` |
| `/dashboard/executor/tokens` | Token-uri executor. | `app/dashboard/executor/tokens/page.tsx` |
| `/dashboard/executor/settings` | Setări executor. | `app/dashboard/executor/settings/page.tsx` |
| `/dashboard/executor/payments` | Plăți executor. | `app/dashboard/executor/payments/page.tsx` |
| `/dashboard/executor/support` | Suport executor (tichete + eventual chat AI). | `app/dashboard/executor/support/page.tsx` |
| `/dashboard/executor/customize-buttons` | Personalizare butoane; include buton „Adaugă licitație” → `/dashboard/executor/add-auction`. Nav executor linkează review-urile la `/dashboard/reviews` (pagină comună). | `app/dashboard/executor/customize-buttons/page.tsx`, `app/dashboard/executor/page.tsx` (href `/dashboard/reviews`) |
| `/dashboard/executor/calendar` | Calendar. | `app/dashboard/executor/calendar/page.tsx` |

### Rute dashboard lichidator

| Rută | Scop | Dovezi |
|------|------|--------|
| `/dashboard/lichidator` | Panou lichidator. | `app/dashboard/lichidator/page.tsx` |
| `/dashboard/lichidator/add-auction` | Re-export la pagina executor add-auction (redirecționare la my-products). | `app/dashboard/lichidator/add-auction/page.tsx` — `export { default } from "../../executor/add-auction/page"` |
| `/dashboard/lichidator/my-products` | Produsele lichidatorului. | `app/dashboard/lichidator/my-products/page.tsx` |
| `/dashboard/lichidator/import-auctions` | Import anunțuri. | `app/dashboard/lichidator/import-auctions/page.tsx` |
| `/dashboard/lichidator/favorites` | Favorite. | `app/dashboard/lichidator/favorites/page.tsx` |
| `/dashboard/lichidator/tokens` | Token-uri. | `app/dashboard/lichidator/tokens/page.tsx` |
| `/dashboard/lichidator/settings` | Setări. | `app/dashboard/lichidator/settings/page.tsx` |
| `/dashboard/lichidator/support` | Suport. | `app/dashboard/lichidator/support/page.tsx` |
| `/dashboard/lichidator/payments` | Plăți. | `app/dashboard/lichidator/payments/page.tsx` |
| `/dashboard/lichidator/calendar` | Calendar. | `app/dashboard/lichidator/calendar/page.tsx` |
| `/dashboard/lichidator/customize-buttons` | Personalizare butoane. | `app/dashboard/lichidator/customize-buttons/page.tsx` |

### Rute relevante în afara dashboard-ului

| Rută | Scop | Dovezi |
|------|------|--------|
| `/` | Homepage. | Meniu: „Homepage” în `app/dashboard/page.tsx` (nav) |
| `/ro` | Licitatii: feed principal (live_bid + licitații publice), filtre, categorii (inclusiv executări). | `app/ro/page.tsx` |
| `/auth` | Autentificare (login/redirect). | `app/dashboard/layout.tsx` — redirect la `/auth?mode=login&redirect=...` dacă neautentificat |

### Elemente de navigație de top (meniu / acțiuni rapide)

- **Meniu mobil/desktop (dashboard principal)**  
  - Homepage (`/`), Licitatii (`/ro`), Favorite, Ofertele mele, Setări, Token-uri, Plăți, Suport, Review-uri.  
  - **Dovezi**: `app/dashboard/page.tsx` (nav array cu `href`, `label`, `icon`).

- **Acțiuni rapide (dashboard principal)**  
  - Ofertele mele, Anunțurile mele (`/dashboard/my-products`), Caută licitații (`/ro`), Favorite, Anunțuri exclusive, Token-uri, Setări, Plăți, Review-uri, Suport.  
  - **Dovezi**: `app/dashboard/page.tsx` (secțiunea cu `customButtons` și default-uri).

- **Header global („Vinde”)**  
  - Utilizator obișnuit: link către `/dashboard/my-products?openManualModal=true`; executor/lichidator: link către `/dashboard/executor/add-auction` sau echivalent lichidator.  
  - **Dovezi**: `components/UniversalHeader.tsx` (href cu `openManualModal=true` sau `executorDashboardBase/add-auction`).

**Notă**: Pagina `app/dashboard/my-products/page.tsx` **nu** citește parametrul URL `openManualModal`; deci deschiderea automată a modalului la `/dashboard/my-products?openManualModal=true` nu este implementată în repo. Executor add-auction redirecționează cu acest query, dar efectul depinde de o eventuală implementare viitoare pe my-products.

---

## C) Capabilități stricte ale asistentului

### C1) Capabilitatea „Explică UI”

- **Stil de răspuns permis**: instrucțiuni scurte, pas cu pas + sugestie de link direct (deep link) către rută.
- **Surse permise**: doar **Harta UI verificată** (secțiunea B) și **Surse de ajutor verificate** (dacă există în cod: MD/MDX, tooltip-uri, texte de help).
- **Interzis**: inventează rute, pagini sau funcții care nu apar în cod; nu ghicește meniuri sau fluxuri neconfirmate.

**Surse de ajutor verificate în repo**:

- **Docs intern** (pentru conținut tehnic, nu neapărat user-facing): `docs/` (ex.: `docs/search/suggestions.md`, `docs/INDEX.md`, `docs/RAG_SUPABASE_ANALIZA.md` menționează pagini tip FAQ). Nu există în repo o pagină publică dedicată FAQ/ghid utilizator.
- **Suport AI**: componenta `app/dashboard/support/AIHelper.tsx` există și apelează `POST /api/support/chat`; **nu** a fost găsită în render-ul paginii `app/dashboard/executor/support/page.tsx`. Utilizarea efectivă în UI: **UNKNOWN (necesită confirmare)**.
- **API chat suport**: `app/api/support/chat/route.ts` — prompt generic suport (cont, licitații, produse, facturare, setări); fără verificare explicită de autentificare în ruta citită.

Asistentul poate descrie doar ce există în harta UI și, dacă se confirmă, orice help/FAQ oficial documentat pentru utilizator.

### C2) Capabilitatea „Creare draft anunț”

#### Acțiuni / tool-uri conceptuale (fără cod)

- **createDraftListing()** — creează un draft de anunț (în front se face insert în `products` cu `status: 'draft'` sau `'active'`; în formularul manual din my-products, status este ales în formular).
- **updateDraftField()** — actualizează câmpuri pe un draft deținut de utilizator.
- **attachPhoto()** — atașează poze la draft; în cod, upload-ul se face la `/api/upload` (Cloudinary), apoi URL-urile se salvează în obiectul anunț (câmp `images`).
- **validateDraft()** — verifică dacă draft-ul are toate câmpurile obligatorii conform validărilor din front/backend.
- **publishListing()** — în repo nu există un endpoint separat „publish”; publicarea este același submit al formularului manual care face insert sau update în `products` cu `status: 'active'`. Deci „publish” = trimiterea formularului complet (inclusiv status activ). **Recomandare**: în spec, considerăm publish = acțiunea de finalizare a anunțului (submit cu toate câmpurile obligatorii); implementarea poate fi fie redirect către formularul existent, fie apel la un API care să facă update la status.

#### Date pe care asistentul le poate solicita (din validări din cod)

Din `app/dashboard/my-products/page.tsx` (handleManualFormSubmit și manualFormData):

- **Obligatorii** (validare explicită la submit):
  - `title` (titlu)
  - `description` (descriere)
  - `category` (categorie)
  - `subcategory` (subcategorie)
  - Preț de pornire > 0 (în RON sau EUR, după `currency`)
  - Utilizator autentificat (Supabase session)
  - Curs valabil EUR/RON (pentru normalizare preț; se obține din API/exchange)

- **Opționale** (prezente în formular):  
  `categoryLevel3`, `size`, `brand`, `model`, `sku`, `county`, `city`, `village`, `address`, `images` (liste de URL-uri după upload), `customFields`, `buyNowEnabled`, `buyNowPriceRON`/`buyNowPriceEUR`, `fixedPrice`, câmpuri specifice categoriei (din `lib/categories.ts`, `lib/attributes.ts`). Status poate fi `draft` sau `active`; la primul salvare ca „draft” nu se impun toate câmpurile obligatorii pentru publicare.

Categoriile și subcategoriile disponibile sunt definite în `lib/categories.ts` (ex.: `CATEGORY_LEVEL_3`, subcategorii per categorie); atribute (mărimi, brand, model etc.) în `lib/attributes.ts` și `lib/data/brand-models.ts`.

#### Mașină de stări (flux conversațional)

| Stare | Declanșator | Mesaj asistent | Inputuri necesare | Acțiuni permise |
|-------|-------------|----------------|-------------------|------------------|
| **START** | Utilizatorul exprimă intenția de a crea un anunț. | Confirmă intenția și oferă pași (ex.: titlu, categorie, preț). Poate sugera link: „Poți deschide formularul aici: [Anunțurile mele](link)”. | — | createDraftListing (dacă vrea să înceapă din chat), sau ghidează către UI. |
| **INTENT_DETECTED** | Asistentul a înțeles „vreau să public un anunț”. | Cere primul câmp obligatoriu (ex. titlu) sau mai multe dacă utilizatorul le dă deodată. | — | createDraftListing (dacă nu există draft). |
| **DRAFT_CREATED** | Draft creat (id draft în context). | „Am creat un draft. Spune-mi titlul anunțului.” / „Acum alege categoria.” | title (sau următorul câmp). | updateDraftField, attachPhoto. |
| **CATEGORY_SET** | category + subcategory setate. | Cere prețul de pornire și/sau alte câmpuri opționale (județ, oraș, poze). | category, subcategory. | updateDraftField, attachPhoto. |
| **PHOTOS_ADDED** | Utilizatorul a atașat cel puțin o poză (opțional). | Confirmă și cere următorul câmp sau confirmare. | — | updateDraftField, attachPhoto. |
| **DETAILS_MISSING** | validateDraft() returnează câmpuri lipsă. | Enumeră câmpurile lipsă (obligatorii) și cere completarea. | Câmpurile lipsă. | updateDraftField, attachPhoto. |
| **CONFIRMATION** | Toate câmpurile obligatorii sunt completate. | „Ai completat toate câmpurile. Vrei să publici anunțul? [Da/Nu]” | — | publishListing (doar după confirmare explicită). |
| **SUBMITTED** | Utilizatorul a confirmat publicarea. | „Anunțul a fost publicat. Îl poți vedea la [Anunțurile mele].” | — | — |
| **DONE** | Conversația s-a încheiat sau utilizatorul a renunțat. | Mesaj de încheiere; oferă link către dashboard/my-products. | — | — |

Reguli:

- La orice acțiune ireversibilă (publicare, ștergere draft) se cere **confirmare explicită** înainte de executare.
- Dacă utilizatorul trimite doar poze fără text, asistentul interpretează ca atașare la draft (dacă există) sau cere intenția (ex. „Vrei să creezi un anunț nou? Spune-mi titlul.”).

---

## D) Granițe de date și permisiuni

- **Izolare per utilizator**: conversațiile și draft-urile sunt asociate utilizatorului curent; nu există acces cross-user pentru asistent.
- **Citire**:
  - Draft-urile proprii (produse cu `user_id = auth.uid()` și status draft/active).
  - Setări de profil utilizator care există în cod (ex.: `user_profiles` pentru utilizatorul curent).
- **Scriere**:
  - Câmpuri pe draft-uri proprii (titlu, descriere, categorie, subcategorie, preț, imagini, etc.).
  - Atașare poze: în cod, upload-ul este la `/api/upload`; URL-urile sunt stocate în draft (câmp `images`).
- **RLS**:  
  - `supabase/migrations/20260118_fix_user_access_policies.sql`: pe `products` există politici SELECT/UPDATE pentru `user_id = auth.uid()` și INSERT cu `user_id = auth.uid()`.  
  - Orice API folosit de asistent pentru produse trebuie să folosească client Supabase autentificat (sau service role cu verificare explicită `user_id`) astfel încât să se respecte RLS. La nivel de API, orice mutare de date trebuie să verifice că `user_id` corespunde utilizatorului autentificat.

---

## E) Siguranță și limitarea abuzului

- **Rate limiting**: se recomandă limitare pe endpoint-uri de chat și pe acțiuni de creare/actualizare draft (ex.: N cereri/minut per user) pentru a evita abuzul și costurile AI.
- **Confirmare înainte de acțiuni ireversibile**: publicare anunț sau ștergere draft doar după confirmare explicită (ex.: „Sigur vrei să publici?”).
- **Rezistență la prompt injection**: conținutul introdus de utilizator nu trebuie interpretat ca instrucțiuni pentru model; sistemul trebuie să trateze strict scope-ul (explicare UI + creare draft) și să ignore cereri care cer admin, acces la alte conturi sau acțiuni în afara scope-ului.
- **PII**: se folosesc doar date necesare pentru anunț (titlu, descriere, locație, contact dacă e cazul); nu se stochează în loguri mesaje complete cu date personale decât dacă este necesar și conform politicii de confidențialitate.

---

## F) Cazuri limită (concrete)

- **Utilizatorul trimite doar poze**  
  Interpretează ca atașare la draft curent (dacă există) sau solicită intenția: „Vrei să creezi un anunț nou? Spune-mi titlul și categoria.”

- **Utilizatorul încearcă conținut Executări/Insolvență (token-gated)**  
  Asistentul nu creează anunțuri cu `channel = 'executari_insolventa'` sau `requires_token = true` în locul utilizatorului. Poate răspunde: „Anunțurile din Executări și Insolvență necesită token și se gestionează prin fluxul dedicat. Poți verifica token-urile în Dashboard → Token-uri.”

- **Categorie ambiguă**  
  Asistentul oferă o listă scurtă de categorii din `lib/categories.ts` (sau subcategorii pentru o categorie dată) și cere alegerea clară (ex.: „Ai menționat «mașini». Categoriile disponibile sunt: Autoturisme, SUV, Motociclete... Care se potrivește?”).

- **Upload eșuat / draft parțial**  
  Mesaj clar: „Încărcarea unei imagini a eșuat. Poți încerca din nou sau continua fără ea.” Draft-ul rămâne salvat; utilizatorul poate adăuga alte poze sau completa restul și să publice mai târziu.

- **Câmpuri obligatorii lipsă la „publicare”**  
  `validateDraft()` returnează lista câmpurilor lipsă; asistentul răspunde cu: „Pentru a publica, completează: [listă]. Apoi spune «publică» când ești gata.”

---

## G) Checklist de implementare (fără cod)

- **Pagină UI pentru asistent**  
  - **De ce**: un singur loc (ex.: `/dashboard/assistant` sau panou în dashboard/support) unde utilizatorul discută cu asistentul.  
  - **Securitate**: doar utilizatori autentificați (același mecanism ca `app/dashboard/layout.tsx`).  
  - **Performanță**: lazy load pentru componenta de chat; eventual streaming pentru răspunsuri lungi.

- **Rute API pentru chat + tool-uri**  
  - **De ce**: endpoint POST pentru mesaje utilizator; backend apelează modelul și execută tool-uri (createDraftListing, updateDraftField, attachPhoto, validateDraft, publishListing).  
  - **Securitate**: verificare obligatorie a sesiunii Supabase (sau JWT); fiecare mutare pe `products` cu `user_id` din token.  
  - **Performanță**: rate limiting, timeout pentru model; cache pentru listă categorii dacă e necesar.

- **Tabele DB (conceptual)**  
  - **Conversații / mesaje asistent**: dacă se dorește persistență (ex.: `assistant_conversations`, `assistant_messages`) cu `user_id` și eventual `draft_product_id`.  
  - **Securitate**: RLS pe `user_id = auth.uid()`; index pe `user_id` pentru query rapid.  
  - **Performanță**: limită pe număr de mesaje per conversație la încărcare.

- **Logging și monitorizare**  
  - **De ce**: detectare abuz, erori, timp de răspuns.  
  - **Securitate**: fără PII în loguri (sau anonimizare); log doar tip acțiune, user_id (hashat dacă e cazul), status.  
  - **Performanță**: log-uri asincrone pentru a nu bloca răspunsul.

---

## Repo Evidence (liste de fișiere folosite ca dovezi)

- `app/dashboard/layout.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/favorites/page.tsx`
- `app/dashboard/ofertele_mele/page.tsx`
- `app/dashboard/my-products/page.tsx`
- `app/dashboard/my-bids/page.tsx`
- `app/dashboard/exclusiv/page.tsx`
- `app/dashboard/tokens/page.tsx`
- `app/dashboard/settings/page.tsx`
- `app/dashboard/payments/page.tsx`
- `app/dashboard/support/page.tsx`
- `app/dashboard/support/AIHelper.tsx`
- `app/dashboard/reviews/page.tsx`
- `app/dashboard/messages/page.tsx`
- `app/dashboard/customize-buttons/page.tsx`
- `app/dashboard/company/page.tsx`
- `app/dashboard/executor/page.tsx`
- `app/dashboard/executor/add-auction/page.tsx`
- `app/dashboard/executor/my-products/page.tsx`
- `app/dashboard/executor/import-auctions/page.tsx`
- `app/dashboard/executor/favorites/page.tsx`
- `app/dashboard/executor/tokens/page.tsx`
- `app/dashboard/executor/settings/page.tsx`
- `app/dashboard/executor/support/page.tsx`
- `app/dashboard/executor/customize-buttons/page.tsx`
- `app/dashboard/executor/calendar/page.tsx`
- `app/dashboard/executor/payments/page.tsx`
- `app/dashboard/lichidator/page.tsx`
- `app/dashboard/lichidator/add-auction/page.tsx`
- `app/dashboard/lichidator/my-products/page.tsx`
- `app/dashboard/lichidator/import-auctions/page.tsx`
- `app/dashboard/lichidator/favorites/page.tsx`
- `app/dashboard/lichidator/tokens/page.tsx`
- `app/dashboard/lichidator/settings/page.tsx`
- `app/dashboard/lichidator/support/page.tsx`
- `app/dashboard/lichidator/payments/page.tsx`
- `app/dashboard/lichidator/calendar/page.tsx`
- `app/dashboard/lichidator/customize-buttons/page.tsx`
- `app/api/support/chat/route.ts`
- `app/api/upload/route.ts`
- `components/UniversalHeader.tsx`
- `lib/categories.ts`
- `lib/attributes.ts`
- `supabase/migrations/20260118_fix_user_access_policies.sql`
- `supabase/migrations/20260205_products_user_id.sql`
- `supabase/migrations/20260221_products_channel_access.sql`
- `app/ro/page.tsx` (referință scope executări / filtru)

---

## Unknowns / Necesită confirmare

1. **Parametrul `openManualModal` pe `/dashboard/my-products`**: URL-ul `/dashboard/my-products?openManualModal=true` este folosit în UniversalHeader și la redirect din add-auction, dar `app/dashboard/my-products/page.tsx` nu folosește `useSearchParams` pentru a deschide automat modalul. Confirmare: fie se implementează citirea parametrului și deschiderea modalului, fie se documentează că deep link-ul doar duce utilizatorul pe pagină și el deschide manual „Adaugă anunț”.
2. **Utilizarea efectivă a `AIHelper` (dashboard/support)**: `app/dashboard/support/AIHelper.tsx` apelează `/api/support/chat`; nu s-a găsit import/render în `app/dashboard/executor/support/page.tsx`. Confirmare: unde este afișat acest component (dacă este) și dacă ruta `/dashboard/support` (general) folosește o pagină diferită care îl include.
3. **Autentificare la `/api/support/chat`**: Ruta nu verifică în codul citit sesiunea Supabase; utilizatorii pot apela API-ul fără auth. Confirmare: dacă este intenționat (ex.: doar pentru utilizatori care au acces la pagini de suport) sau trebuie adăugată verificare de auth.
4. **Autentificare la `/api/upload`**: Request-ul trimite `userId` în formData; nu s-a verificat dacă API-ul validează token/sesiune și dacă asociază upload-ul cu acel user. Confirmare pentru securitate și pentru scope asistent (attachPhoto).
5. **Pagină `/dashboard/notifications`**: Este referită în `app/dashboard/customize-buttons/page.tsx` ca URL posibil pentru un buton; nu există `app/dashboard/notifications/page.tsx`. Confirmare: există rută reală sau e placeholder/404.
6. **Flux „publicare” din asistent**: În aplicație, publicarea este același submit de formular (insert/update cu status). Pentru asistent, confirmare: publicarea se face prin redirect cu draft pre-completat în formularul existent, sau se introduce un API dedicat (ex.: PATCH products/:id cu status=active) cu validare și RLS.

---

*Document generat pe baza scanării codului din repository; toate afirmațiile despre UI și fluxuri sunt legate de fișiere și rute existente.*
