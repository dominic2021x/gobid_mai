# Configurări iOS/Android – WebView gobid.ro

## 1. Ce trebuie verificat/modificat în Xcode

### Signing
- **Target → Signing & Capabilities:** Team selectat; pentru device fizic, profil de dezvoltare valid.
- **Release:** la Archive, certificat de distribuție și provisioning profile pentru App Store / Ad Hoc.

### Info.plist
- **Nu este nevoie de excepții ATS** pentru gobid.ro: totul este HTTPS. Comportamentul implicit (HTTPS permis) este suficient.
- **Poți elimina** (dacă există) orice bloc `NSAppTransportSecurity` care:
  - setează `NSAllowsArbitraryLoads: true` (riscant), sau
  - adaugă excepții inutile pentru domenii deja HTTPS.
- Dacă păstrezi ATS explicit, limită-te la domenii necesare, fără `NSExceptionAllowsInsecureHTTPLoads: true` pentru gobid.ro.

### Associated Domains (Universal Links)
- **Nu sunt necesare** pentru fluxul actual: OAuth (Google/Facebook) redirecționează către `https://gobid.ro/api/auth/.../callback`, apoi către `https://gobid.ro/auth/...-success`. Totul se întâmplă în același WebView, pe același domeniu. Nu este nevoie să „readuci” utilizatorul în app printr-un link universal.

### URL Types (custom scheme, ex. `ro.gobid.app://`)
- **Nu sunt necesare** pentru login: redirect-urile OAuth rămân pe `https://gobid.ro`. Poți adăuga ulterior un URL scheme dacă vrei „Deschide în app” din browser sau pentru deep link-uri custom.

### limitsNavigationsToAppBoundDomains (capacitor.config.ts)
- Este setat **false** – corect pentru WebView remote. Permite încărcarea gobid.ro (domeniu extern). Dacă îl pui `true`, trebuie să adaugi gobid.ro în WKAppBoundDomains (entitlements), altfel navigarea poate fi blocată.

### Safe area / bara de status (contentInset)
- În **capacitor.config.ts** este setat **ios.contentInset: 'always'** – face ca WebView-ul să respecte safe area pe iOS (header-ul nu mai intră sub ora/Dynamic Island).
- După modificări la config, rulează **npx cap sync** și refă build-ul în Xcode.

---

## 2. Ce trebuie verificat/modificat în Android Studio

### AndroidManifest.xml
- **Permisiune:** `android.permission.INTERNET` (de obicei deja prezentă din Capacitor).
- **Nu activa** `android:usesCleartextTraffic="true"` – gobid.ro este HTTPS.

### intent-filters / URL scheme
- **Nu sunt necesare** pentru fluxul actual: OAuth revine pe `https://gobid.ro` în același WebView. Nu este nevoie de intent-filter pentru un scheme custom (ex. `ro.gobid.app://`) ca să prindă redirect-ul de login.
- Poți adăuga ulterior intent-filter pentru scheme sau App Links dacă vrei deep link-uri către app.

---

## 3. Rezumat setări

| Platformă | Setare | Valoare / acțiune |
|-----------|--------|-------------------|
| iOS | ATS (Info.plist) | Nu adăuga excepții inutile; HTTPS este permis implicit. Elimină NSAllowsArbitraryLoads: true dacă există. |
| iOS | Associated Domains | Nu necesare pentru OAuth actual. |
| iOS | URL Types | Nu necesare pentru OAuth actual. |
| iOS | limitsNavigationsToAppBoundDomains | false (în capacitor.config.ts). |
| Android | INTERNET | Obligatoriu. |
| Android | usesCleartextTraffic | false sau omis. |
| Android | intent-filters pentru scheme | Nu necesare pentru OAuth actual. |

---

## 4. Cookies și session

- WebView-ul încarcă `https://gobid.ro`; cookie-urile pentru acest domeniu sunt acceptate implicit (Same-origin).
- Supabase Auth și NextAuth (callback-uri pe gobid.ro) funcționează fără setări suplimentare în Info.plist sau AndroidManifest pentru cookies.
