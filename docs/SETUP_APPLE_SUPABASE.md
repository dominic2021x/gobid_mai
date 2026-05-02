# Sign in with Apple (OAuth custom – la fel ca Google)

Login-ul cu Apple folosește **același tip de flux ca Google**: OAuth făcut în aplicație (callback propriu), fără provider Apple în Supabase. Utilizatorul este creat/actualizat în Supabase din callback, iar sesiunea se stabilește prin magic link.

## Ce ai nevoie

1. **Apple Developer** – cont și App ID / Services ID configurat pentru „Sign in with Apple”.
2. **Variabilă de mediu**: `APPLE_ID` = Services ID (ex: `com.gobid.service`).

## Pași

### 1. Apple Developer

1. Mergi la [Apple Developer](https://developer.apple.com/account/) → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Creează un **Services ID** (nu App ID) pentru web: ex. `com.gobid.service`. Notează **Identifier** (= `APPLE_ID`).
3. Activează **Sign in with Apple** pentru acest Services ID și apasă **Configure**.
4. La **Return URLs** adaugă:
   - Producție: `https://www.gobid.ro/api/auth/apple/callback`
   - (Pentru dev local, Apple nu acceptă `localhost` – poți folosi un tunnel, ex. ngrok, și adăuga URL-ul aici.)
5. Salvează.

### 2. .env.local

```env
APPLE_ID=com.gobid.service
```

(Înlocuiește cu Services ID-ul tău.)

### 3. Redirect URL în Supabase (opțional)

Nu este nevoie să activezi providerul Apple în Supabase. Utilizatorii sunt creați/actualizați din callback-ul nostru, la fel ca la Google.

### 4. Testare

1. Pornește aplicația și mergi la `/auth`.
2. Apasă „Continuă cu Apple” – ar trebui să fii dus la Apple, apoi înapoi pe site și autentificat.

## De ce pe localhost nu se înregistrează în baza de date?

Apple **nu acceptă** `http://localhost` ca Return URL. De aceea, când rulezi aplicația **pe localhost**:

1. Config-ul trimite către Apple un `redirect_uri` de **producție**: `https://www.gobid.ro/api/auth/apple/callback`.
2. După ce te autentifici la Apple, browserul este redirecționat la acel URL – adică la **serverul de producție**, nu la localhost.
3. **Callback-ul** (crearea/actualizarea utilizatorului în Supabase) rulează pe **producție**, deci utilizatorul este salvat în **baza de date de producție**.
4. La final ești dus pe **www.gobid.ro** (producție), nu înapoi pe localhost.

**Concluzie:** Când testezi de pe localhost, înregistrarea în baza de date se face pe **producție** (pentru că acolo rulează callback-ul). Nu există logică care să scrie în „baza de date de localhost” în acest flux.

**Dacă vrei să testezi tot fluxul local** (inclusiv scrierea în baza ta locală / Supabase de dev):

1. Folosește un tunnel (ex. [ngrok](https://ngrok.com)): `ngrok http 3000` → obții un URL tip `https://abc123.ngrok.io`.
2. În Apple Developer, la Services ID → Configure: adaugă la **Domains** domeniul ngrok (ex. `abc123.ngrok.io`) și la **Return URLs** `https://abc123.ngrok.io/api/auth/apple/callback`.
3. În `.env.local` pe mașina ta: `APPLE_REDIRECT_ORIGIN=https://abc123.ngrok.io`.
4. Pornești app-ul local; când apeși „Continuă cu Apple”, redirect_uri va fi ngrok, deci callback-ul va rula pe mașina ta și va folosi variabilele din `.env.local` (inclusiv Supabase-ul tău local).

## Ce date furnizează Apple

- **Email**: mereu (din `id_token`), sau adresă relay dacă utilizatorul ascunde emailul.
- **Nume (prenume, nume de familie)**: **doar la prima autorizare**, în parametrul `user` (JSON cu `name.givenName` / `name.familyName` sau `name.firstName` / `name.lastName`). La autentificări ulterioare Apple nu retrimite numele.
- **Telefon și adresă**: **nu sunt furnizate** de Sign in with Apple. Utilizatorii le pot completa manual în Setări cont.

## Flux tehnic

1. Utilizatorul apasă „Continuă cu Apple” → se redirecționează la `https://appleid.apple.com/auth/authorize` cu `client_id`, `redirect_uri`, `response_mode=form_post`, `scope=name email`.
2. Apple trimite un **POST** la `/api/auth/apple/callback` cu `code`, `id_token`, eventual `user` (nume, doar la prima autorizare).
3. Backend-ul verifică `id_token` cu cheile Apple (JWKS), extrage email și sub (Apple user id), parsează numele din `user` (givenName/familyName sau firstName/lastName), creează/actualizează utilizatorul în Supabase, generează magic link și redirecționează la `/auth/apple-success`.
4. Pagina `apple-success` folosește magic link-ul pentru a seta sesiunea Supabase și redirecționează utilizatorul (ex. la dashboard).

## Cheia .p8 (opțional – pentru NextAuth)

Dacă ai descărcat cheia „Sign in with Apple” din Apple Developer (.p8):

- **Nu** o pune în git. Păstreaz-o local (ex. `~/.apple/AuthKey_XXXXX.p8`).
- Pentru **login pe site** (butonul „Continuă cu Apple”) **nu** e nevoie de cheie – folosim doar verificarea id_token cu JWKS.
- Pentru **NextAuth** (login admin cu Apple) ai nevoie de **APPLE_SECRET** (un JWT generat din această cheie). Rulează:
  ```bash
  npx tsx scripts/generate-apple-client-secret.ts
  ```
  Setează în `.env.local`: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_ID`, `APPLE_PRIVATE_KEY` (conținutul fișierului .p8, newline-uri ca `\n`). Copiază JWT-ul afișat în `APPLE_SECRET=...`. JWT-ul expiră la ~6 luni – rulează din nou scriptul și actualizează `APPLE_SECRET`.

## Rezolvare eroare „invalid_client”

Dacă Apple afișează **invalid_client** la autorizare:

1. **Identifier (Services ID)**  
   Mergi la [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list) → filtrează **Services IDs** → deschide Services ID-ul folosit pentru web (ex. „gobid Web Login”).  
   Copiază **exact** valoarea din câmpul **Identifier** (ex. `ro.gobid.web` sau `ro.gobid.weblogin`) și pune-o în `.env.local` la `APPLE_ID=...`. Nu adăuga spații sau caractere în plus.

2. **Return URL**  
   În același Services ID → **Sign in with Apple** → **Configure** → la **Return URLs** trebuie să existe **exact**:  
   `https://www.gobid.ro/api/auth/apple/callback`  
   (fără slash la final dacă nu l-ai adăugat în listă). Salvează modificările.

3. **Domains**  
   În aceeași fereastră **Configure**, la **Domains and Subdomains** trebuie să fie: `www.gobid.ro` (și dacă folosești și `gobid.ro`, adaugă-l separat). Domeniul trebuie verificat (butonul de verificare).

4. **App ID asociat**  
   Sign in with Apple pentru web necesită un **App ID** (ex. pentru iOS/macOS) cu capabilitatea „Sign in with Apple” activată. În configurarea Services ID-ului, asigură-te că ai ales **Primary App ID** și ai salvat.

După modificări în Apple Developer, așteaptă 1–2 minute și reîncearcă autentificarea. Dacă ai schimbat `APPLE_ID` în `.env.local`, repornește serverul Next.js.

## Documentație

- [Apple: Sign in with Apple (web)](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js/incorporating_sign_in_with_apple_into_other_platforms)
- [Apple: Generate and validate tokens](https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens)
