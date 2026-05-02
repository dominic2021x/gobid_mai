# Integrare Capacitor – WebView gobid.ro

Aplicația mobilă este un **WebView** care încarcă direct **https://gobid.ro**.

- **Nu se folosește** `output: 'export'` în next.config.js. Backend-ul rămâne pe Vercel; toate request-urile `/api/*` merg către același domeniu (gobid.ro).
- **Autentificare:** OAuth (Google/Facebook) redirecționează către `https://gobid.ro/api/auth/.../callback`, apoi către `/auth/google-success` sau `/auth/facebook-success`. Totul pe același domeniu în WebView – **nu sunt necesare** deep link, URL scheme sau Universal Links pentru ca OAuth să revină în app.

---

## 1. Ce este deja făcut în proiect

- **capacitor.config.ts** – `server.url: "https://gobid.ro"`, `webDir: "web"` (folder dedicat), `allowNavigation` restrâns la gobid.ro, Supabase (*.supabase.co), Google și Facebook OAuth.
- **web/** – `webDir` pentru Capacitor; conține doar un `index.html` minimal (vezi `web/README.md`). La runtime WebView încarcă server.url, nu acest fișier.
- **package.json** – dependențe Capacitor și scripturi `cap:sync`, `cap:ios`, `cap:android`.
- **docs/capacitor-ios-android-config.md** – ce verifici în Xcode (Signing, Info.plist, Associated Domains, URL Types) și Android Studio (intent-filters); ATS inutile pentru HTTPS; fără deep link/Universal Links pentru OAuth actual.

---

## 2. Comenzi de rulat (în ordine)

Rulezi tu în terminal, în rădăcina proiectului.

### 2.1 Instalare dependențe

```bash
npm install
```

### 2.2 Adăugare platforme iOS și Android

```bash
npx cap add ios
npx cap add android
```

(Creează folderele `ios/` și `android/`.)

### 2.3 Sincronizare (copiază config + webDir în proiectele native)

```bash
npx cap sync
```

Sau:

```bash
npm run cap:sync
```

### 2.4 Deschidere în Xcode / Android Studio

**iOS:**

```bash
npx cap open ios
```

sau `npm run cap:ios`.

**Android:**

```bash
npx cap open android
```

sau `npm run cap:android`.

---

## 3. Ce faci în Xcode (pentru iOS)

1. În Xcode: selectează **scheme-ul „App”** și un **simulator** (sau device).
2. Apasă **Run** (▶).
3. După pornire, app-ul ar trebui să încarce **https://gobid.ro** în WebView.
4. **Pentru login:** Verifică login (email/parolă sau OAuth). OAuth rămâne în WebView (allowNavigation include accounts.google.com, facebook.com); redirect-ul revine la https://gobid.ro/api/auth/.../callback → /auth/...-success. Nu sunt necesare Associated Domains sau URL Types pentru acest flux.
5. Dacă vezi erori de rețea: nu adăuga excepții ATS inutile; HTTPS este permis implicit (vezi `docs/capacitor-ios-android-config.md`).

---

## 4. Ce faci în Android Studio (pentru Android)

1. Așteaptă **Gradle sync** să se termine.
2. Selectează un **emulator** sau device, apoi apasă **Run** (▶).
3. App-ul ar trebui să deschidă **https://gobid.ro** în WebView.
4. **Pentru login:**
   - Testează login-ul la fel ca pe iOS.
   - Dacă apare **ERR_CLEARTEXT_NOT_PERMITTED**: nu folosi HTTP; gobid.ro e HTTPS, deci nu ar trebui să fie cazul.
5. Pentru debug: **Logcat** filtrat după „Capacitor” sau „WebView”; sau Chrome **chrome://inspect** pentru WebView.

---

## 5. Verificări rapide ca login-ul să funcționeze

- **Toate request-urile** sunt către **https://gobid.ro** (și subdomenii permise), deci **cookies și session** (Supabase + NextAuth) funcționează ca în browser.
- **iOS**: Nu sunt necesare excepții ATS pentru gobid.ro (HTTPS); nu activa NSAllowsArbitraryLoads. Vezi `docs/capacitor-ios-android-config.md`.
- **Android**: Permisiune `INTERNET`; nu e nevoie de cleartext pentru gobid.ro.
- După prima pornire reușită: testează **upload**, **search**, **plăți** (dacă le folosești); toate trec prin același domeniu gobid.ro.

---

## 6. Dacă ceva nu merge

- **„Cannot find module '@capacitor/...'”** → rulează din nou `npm install` și `npx cap sync`.
- **WebView alb / nu încarcă** → verifică că `capacitor.config.ts` are `server.url: "https://gobid.ro"`, `webDir: "web"`, și rulezi `npx cap sync` după orice modificare la config.
- **Login nu persistă** → vezi `docs/capacitor-ios-android-config.md` (cookies, ATS, permisiuni).
- **Erori la build în Xcode/Android Studio** → verifică versiunea Xcode/Android Studio și că ai rulat `npx cap sync` după ce ai adăugat ios/android.

---

## 7. Ce NU face Cursor

- Nu rulează Xcode sau Android Studio.
- Nu apasă Run / Archive / Upload.
- Nu creează cont Apple Developer sau Google Play.
- Nu acceptă licențe sau certificate.

Tu rulezi comenzile, apeși Run și testezi pe simulator/device. După ce pornește prima dată gobid.ro în app, verifici login, apoi (opțional) adaugi un feature nativ mic (push sau deep link) pentru store.
