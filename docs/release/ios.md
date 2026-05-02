# iOS App Store release – gobid.ro

Production-ready, repeatable release process for the Capacitor iOS app. No secrets in client.

---

## 1. Prerequisites

- **Apple Developer Program** (paid), [App Store Connect](https://appstoreconnect.apple.com) access.
- **App** in App Store Connect: Bundle ID `ro.gobid.app`, name, category, privacy policy URL.
- **Agreements, Tax, and Banking** completed.
- At least one **device** in [Certificates, Identifiers & Profiles → Devices](https://developer.apple.com/account/resources/devices/list) (for development provisioning).

---

## 2. Open the iOS project (CocoaPods)

Always use the **workspace**, not the project file. Open it directly by path or via the npm script:

```bash
open gobid_aplicatii/ios/App/App.xcworkspace
```

Or from repo root:

```bash
npm run cap:ios
```

Do **not** open `App.xcodeproj` alone (Pods would be missing; build fails with **module 'Capacitor' not** / **could not build module 'CapacitorLocalNotifications'** etc.).

---

### Run în Simulator (app-ul pornește în simulator)

Dacă Xcode build-uiește dar **nu lansează interfața app-ului** (rămâne pe ecran negru sau nu se deschide fereastra), de obicei este selectată **schema greșită** (Pods în loc de App).

**Pași exacti:**

1. **Deschide workspace-ul** (nu proiectul):
   ```bash
   open gobid_aplicatii/ios/App/App.xcworkspace
   ```
   Sau din root: `npm run cap:ios`.

2. **Scheme:** În bara de instrumente Xcode, la stânga butonului Run (▶), click pe **câmpul Scheme** (afișează numele schemei curente). Din listă alege **App** (target-ul aplicației).  
   **Nu** alege **Pods-App**, **Capacitor**, **CapacitorStatusBar** sau orice altă schemă de tip Pods/Capacitor – acestea build-uiesc doar framework-uri, nu lansează app-ul.

3. **Destination:** În dropdown-ul de lângă Scheme alege un **simulator iOS**, de ex. **iPhone 16**, **iPhone 17** sau **iPad** (nu „Any iOS Device” pentru run în simulator).

4. **Run:** Apasă **Run** (▶) sau ⌘R. Xcode va compila App (și dependențele Pods) și va lansa aplicația în simulator.

**Rezumat:** Workspace = `App.xcworkspace` | Scheme = **App** | Destination = **iPhone 17** (sau alt simulator) | Run ▶.

---

### Aplicația nu pornește deloc

Dacă apeși Run dar **nimic nu se întâmplă** sau simulatorul rămâne fără app:

1. **Verifică Scheme-ul**  
   În bara de sus din Xcode, **lângă butonul Stop (■)** apare numele schemei (ex. „App” sau „Pods-App”). Dacă acolo scrie **Pods-App**, **Capacitor** sau altceva din Pods, Xcode rulează doar build-ul de framework, nu aplicația.  
   → Click pe acel nume → din listă alege **App** (sub proiectul App, nu sub Pods). Apoi apasă din nou **Run** (▶).

2. **Verifică Destination**  
   Lângă Scheme trebuie să fie ales un **simulator** (ex. **iPhone 17**), nu „Any iOS Device”. Dacă e „Any iOS Device”, Run nu lansează în simulator.  
   → Click pe Destination → alege **iPhone 16** sau **iPhone 17** (sau alt simulator), apoi Run.

3. **Clean + Build + Run**  
   - **Product → Clean Build Folder** (⇧⌘K)  
   - **Product → Build** (⌘B) – așteaptă să termine  
   - **Product → Run** (⌘R)

4. **Șterge app-ul din simulator**  
   Dacă build-ul reușește dar în simulator nu apare sau nu se deschide app-ul: pe simulator, ține apăsat pe iconul gobid.ro → **Remove App** → **Delete App**. Apoi în Xcode apasă din nou **Run**.

5. **Dacă app-ul se deschide și se închide imediat**  
   E posibil să fie crash la pornire. În Xcode, jos, deschide **consola** (View → Debug Area → Activate Console) și rulează din nou. Mesajele roșii de acolo indică cauza.

**Cel mai des:** aplicația nu pornește pentru că Scheme este setat pe **Pods-App** în loc de **App**. Schimbă la **App** și rulează din nou.

---

**Dacă vezi "module 'Capacitor' not" sau "could not build module 'CapacitorLocalNotifications' / CapacitorStatusBar":**
1. Închide Xcode.
2. Deschide **doar** `App.xcworkspace` (nu `App.xcodeproj`): `open gobid_aplicatii/ios/App/App.xcworkspace`.
3. Din directorul proiectului (repo root): `cd gobid_aplicatii && npm ci` (sau `npm install`) apoi `cd ios/App && pod install`.
4. În Xcode: **Product → Clean Build Folder** (⇧⌘K), apoi **Product → Build** (⌘B).

The root `capacitor.config.ts` is the single source of truth; the synced file in `gobid_aplicatii/capacitor.config.ts` **omits** `ios.path` and `android.path` by design (sync script strips them). You do not need to set or verify path in the generated file for release.

---

## 3. Xcode target settings

| Setting | Value |
|--------|--------|
| **Bundle Identifier** | `ro.gobid.app` |
| **Version** (MARKETING_VERSION) | `1.0` (bump when you ship a new store version) |
| **Build** (CURRENT_PROJECT_VERSION) | Integer; must increase for each upload |

### Build number (avoid Archive failures)

- **Manual:** Before each Archive, set **General → Build** to the next integer (e.g. 1, 2, 3). App Store Connect rejects duplicate build numbers.
- **Automatic (agvtool):** Add a **Run Script** build phase (Run Only when: **Release**):
  - Script: `agvtool next-version -all`
  - Leave Input/Output Files empty.
  - Ensure **Versioning** is enabled (e.g. **Current Project Version** is set in Build Settings). Then each Archive gets a new build number and uploads do not fail for “build already exists”.

---

## 4. Signing & Capabilities checklist

Before Archive:

- [ ] **Signing & Capabilities → Signing (Release)**
  - [ ] **Automatically manage signing** = On
  - [ ] **Team** = your Apple Developer team
  - [ ] No red errors (valid provisioning profile and certificate)
- [ ] **Capabilities**
  - [ ] Only enable what you use (e.g. Push Notifications, Associated Domains for Universal Links). Remove or do not add unused capabilities.
- [ ] **Run destination** = **Any iOS Device (arm64)** when archiving (not a Simulator).

---

## 5. Archive and upload

### Why “Product → Archive” is disabled

**Archive is greyed out when the run destination is a Simulator.** Xcode only allows Archive for device builds.

| Cause | Fix |
|-------|-----|
| Destination is a Simulator (e.g. iPhone 15) | In the scheme/destination dropdown (top toolbar), choose **Any iOS Device (arm64)** or a connected physical device. |
| Wrong scheme | Scheme must be **App** (the app target), not a Pod or the workspace. A shared scheme is in `App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`. |
| Archive action off in scheme | Edit Scheme → **Archive** → ensure **Build Configuration** is **Release**. The shared App scheme has Archive enabled. |
| Signing errors (Release) | Fix in **Signing & Capabilities**: Team set, no red errors; use Automatic signing. |

### Pre-archive checklist

- [ ] **Scheme:** **App** (not Pods-App or a simulator-only scheme).
- [ ] **Destination:** **Any iOS Device (arm64)** or a real device (not a Simulator).
- [ ] **Signing & Capabilities** (target App): **Automatically manage signing** = On, **Team** = your Apple Developer team, **Bundle ID** = `ro.gobid.app`, no red errors for **Release**.
- [ ] **Build number:** Increment **General → Build** (or use `agvtool next-version -all` in a Run Script phase) so each upload has a unique build.

### App Store submission – Export Compliance, Game Center, build number

**1) Export Compliance (ITSAppUsesNonExemptEncryption)**  
- **Unde verifici:** `gobid_aplicatii/ios/App/App/Info.plist`  
- **Ce trebuie:** Cheie `ITSAppUsesNonExemptEncryption` = `false` (Boolean NO).  
- Dacă lipsește, App Store Connect poate bloca sau întreba la export. Este setată în Info.plist; păstrată la `cap sync`.

**2) Game Center capability**  
- **Unde verifici în Xcode:** **TARGETS** → selectează **App** → tab **Signing & Capabilities**. În listă trebuie să apară **Game Center**.  
- **Fișier entitlement:** `gobid_aplicatii/ios/App/App/AppRelease.entitlements` conține `com.apple.developer.game-center` = true.  
- **Build setting:** La target **App**, configurația **Release** are **Code Signing Entitlements** = `App/AppRelease.entitlements`.  
- Dacă în Xcode nu vezi Game Center la Capabilities: click **+ Capability** → caută **Game Center** → Add. Verifică că fișierul de entitlements folosit de Release este cel de mai sus.

**3) Build number (Current Project Version)**  
- **Unde verifici:** Xcode → **TARGETS** → **App** → tab **General** → **Build** (sau Build Settings → **Current Project Version**).  
- **Version** (Marketing) = **2.1.0**; **Build** = număr întreg, crescut la fiecare upload (ex. 2, 3, 4).  
- Setat în `App.xcodeproj`: `CURRENT_PROJECT_VERSION` (Debug și Release); `MARKETING_VERSION` = 2.1.0.

**4) Pași exacți: Archive și Distribute**

| Pas | Acțiune în Xcode |
|-----|-------------------|
| 1 | Deschide **App.xcworkspace** (nu .xcodeproj). |
| 2 | **Scheme** = **App**; **Destination** = **Any iOS Device (arm64)**. |
| 3 | **Product → Archive**. Așteaptă finalizarea. |
| 4 | La final se deschide **Organizer** (sau **Window → Organizer**). |
| 5 | Selectează arhiva nouă → buton **Distribute App**. |
| 6 | Alege **App Store Connect** → Next. |
| 7 | Alege **Upload** → Next. Opțiuni (symbols etc.) → Next. |
| 8 | **Upload**. După succes, în App Store Connect → TestFlight apare build-ul. |

### Exact steps: Archive and upload to TestFlight

1. Open the **workspace**: `open gobid_aplicatii/ios/App/App.xcworkspace` (do not open `App.xcodeproj` alone).
2. In the toolbar: set **Scheme** to **App**, and **Destination** to **Any iOS Device (arm64)** (or a connected iPhone/iPad).
3. (Optional) **General → Build**: set build number to the next value (e.g. 2, 3) if not using auto-increment.
4. **Product → Archive**. Wait for the build to finish.
5. **Window → Organizer** (or the Organizer window that opens after Archive).
6. Select the new archive → **Distribute App**.
7. **App Store Connect** → Next → **Upload** → choose options (e.g. upload symbols) → Next → Upload.
8. In **App Store Connect** → TestFlight: wait for processing, then use the build for internal/external testing or submit for App Review.

**Recommendation:** Upload to **TestFlight** first, install on a device, then submit the same (or next) build for App Review.

### Most likely blockers

1. **Destination is Simulator** → Archive stays disabled. Switch to **Any iOS Device (arm64)**.
2. **Signing (Release):** Missing team, wrong Bundle ID, or expired profile → fix in Signing & Capabilities and ensure no red errors.
3. **Duplicate build number** → App Store Connect rejects uploads with an existing build number; increment Build before each Archive.
4. **Opening .xcodeproj instead of .xcworkspace** → Pods not loaded, build/archive can fail; always use **App.xcworkspace**.

---

### „This build is missing export compliance information” – rezolvare fără documentație (French/CCATS)

App-ul folosește doar HTTPS/TLS prin WKWebView/NSURLSession (criptare din iOS); nu folosește algoritmi proprii sau non-standard. **Info.plist** conține deja **ITSAppUsesNonExemptEncryption** = **false**. Pentru build-ul deja încărcat trebuie completat chestionarul în App Store Connect astfel încât **să nu se solicite** „App Encryption Documentation” (fără French declaration, fără upload).

**1) Unde se completează (TestFlight / Build details)**

- **App Store Connect** → **Apps** → selectează app-ul (gobid.ro).
- Tab **TestFlight**.
- În bara din stânga, sub **Builds**, click pe platforma **iOS**.
- În tabelul din dreapta, în coloana **Build**, click pe **iconița app-ului** sau pe **șirul de build** (ex. „2.1.0 (2)”) al build-ului care are „Missing Compliance”.
- Pe rândul acelui build apare **Manage** sau un link de tip **Provide Export Compliance Information** / **Missing Compliance**. Click pe **Manage** (sau pe linkul de compliance).

**2) Răspunsuri în chestionar (calea „exempt” – fără documentație)**

Scop: să rezulte **„No export compliance documentation required”**, fără să apară **„Go to App Encryption Page”** sau **„Choose File”** (fără French form / CCATS).

- Dacă întrebarea este **„Does your app use encryption?”** sau echivalent: alege **Yes** (app-ul folosește HTTPS/TLS).
- Dacă apare **„Is the encryption limited to that within the Apple operating system?”** / **„Does your app use only encryption provided by Apple’s operating system?”** / **„Uses only encryption within the Apple OS?”**: alege **Yes**.
- Dacă se oferă opțiuni de tip algoritm: alege varianta care spune că **encryption is limited to / only within the Apple operating system** (sau „standard encryption from Apple frameworks” / „Apple OS only”). **Nu** alege „industry standard algorithm not provided by Apple” și **nu** „proprietary or non-standard”.
- La final ar trebui să apară concluzia că **no documentation is required** și buton **Save**. Click **Save**.

**3) Ce să eviți**

- **Nu** apăsa **„Go to App Encryption Page”** – duce la upload de documentație.
- **Nu** apăsa **„Choose File”** pentru a încărca documente (French declaration, CCATS).
- Dacă după răspunsuri se oferă doar **Save** (fără „Go to App Encryption Page” / „Choose File”), înseamnă că ai ales calea exempt corect.

**4) Verificare Info.plist (în proiect)**

- Fișier: **`gobid_aplicatii/ios/App/App/Info.plist`**.
- Trebuie să existe: **ITSAppUsesNonExemptEncryption** = **false** (Boolean NO). Astfel build-urile viitoare pot evita întrebări la fiecare submit (comportament recomandat de Apple).

**5) Checklist scurt – Export Compliance rezolvat**

- [ ] App Store Connect → **Apps** → [App] → **TestFlight** → **Builds** → **iOS** → click pe build-ul cu Missing Compliance.
- [ ] Click **Manage** (sau **Provide Export Compliance Information**).
- [ ] La întrebări: encryption **limitat doar la Apple OS** / „only within Apple operating system” → **Save**.
- [ ] **Nu** s-a apăsat „Go to App Encryption Page”; **nu** s-a încărcat niciun fișier.
- [ ] În **Info.plist**: **ITSAppUsesNonExemptEncryption** = **false**.
- [ ] După Save, build-ul nu mai afișează „Missing Compliance” (poate dura câteva minute).

---

## 6. Production URL and redirects

- **Canonical URL:** `https://www.gobid.ro` (set in root `capacitor.config.ts`).
- **Redirects** are enforced at **platform level (Vercel)**, not in middleware:
  - Set **www.gobid.ro** as **Primary Domain**; **gobid.ro** as secondary (redirect-only).
  - **vercel.json** (root) contains a **permanent** redirect so that requests to `gobid.ro` go to `https://www.gobid.ro` with **308** (not 307). This removes the second hop and avoids temporary redirect semantics for the canonical host.

---

## 7. Pre-Submission Gate: redirect verification

Redirects are handled at **platform level (Vercel)** via **vercel.json** and domain settings. Middleware is not used for canonical host.

**Target:** All entries land on `https://www.gobid.ro` with **max 1 redirect**. Apex → www must be **308** (permanent), not 307 (temporary).

**Setup (before TestFlight / App Review):**

1. **Vercel → Project → Settings → Domains:** Set **www.gobid.ro** as **Primary Domain**; **gobid.ro** as secondary (redirect-only).
2. **vercel.json** (repo root) must include the permanent redirect so that `gobid.ro` → `https://www.gobid.ro` with **308** (e.g. `"permanent": true` in the redirect rule with `"has": [{ "type": "host", "value": "gobid.ro" }]`).
3. **Redeploy** after changing domains or **vercel.json**.

**1) Apex → www must be 308 (not 307):**

```bash
curl -I https://gobid.ro
```

Expected: `HTTP/2 308` and `Location: https://www.gobid.ro/`. If you see **307**, the redirect is temporary; fix **vercel.json** (use `"permanent": true`) and redeploy.

**2) Final URL and redirect count (follow with `-L`):**

```bash
curl -s -o /dev/null -w "final: %{url_effective}\nredirects: %{num_redirects}\n" -L http://gobid.ro
curl -s -o /dev/null -w "final: %{url_effective}\nredirects: %{num_redirects}\n" -L https://gobid.ro
```

**Target:** For both commands: `final: https://www.gobid.ro/` and **redirects: 1** (ideal). If `http://gobid.ro` shows **redirects: 2** (http→https then apex→www), that is acceptable; **https://gobid.ro** must still show **redirects: 1** and **308** in the first response.

- **Pass:** Final URL is `https://www.gobid.ro/`; **https://gobid.ro** uses a single **308** (no 307). **Fail:** 307 for apex→www, or final URL not canonical, or >2 redirects for any entry → fix Vercel config and redeploy.

---

## 8. TestFlight – Pre-Review Device Checklist

Instalează build-ul din TestFlight pe un **iPhone real** (nu simulator). Validează înainte de trimitere la App Review.

**1. Cold start & launch**

- [ ] Aplicația pornește fără crash.
- [ ] LaunchScreen apare corect (fără splash lipsă).
- [ ] Se încarcă `https://www.gobid.ro` (nu apex).
- [ ] Nu există redirect vizibil sau flicker excesiv.

**2. Login flows**

- [ ] Login email/parolă
- [ ] Logout
- [ ] Login Google
- [ ] Login Facebook (dacă e activ)
- [ ] Confirm email / reset password (dacă folosești)

**Dacă confirm/reset se deschide în WebView și vezi blocaj:** adaugă domeniul Supabase în `allowNavigation` (vezi §9 Supabase).

**3. Push Notifications**

- [ ] iOS cere permisiunea.
- [ ] Accept → token generat.
- [ ] Token salvat în backend.
- [ ] Trimite notificare test.
- [ ] Notificarea deschide aplicația corect (deep link dacă există).

Push trebuie să fie demonstrabil pentru App Review.

**4. Payment flow (Mobilpay)**

- [ ] Redirect către `secure.mobilpay.ro` funcționează.
- [ ] Finalizare plată → redirect înapoi în app.
- [ ] Nu apare "blocked navigation".

**5. Deep links / Universal Links (dacă le ai)**

- [ ] Trimite pe telefon un link: `https://www.gobid.ro/anunt/123`
- [ ] Aplicația instalată → se deschide în app.
- [ ] Aplicația neinstalată → se deschide în Safari.

Dacă nu ai Universal Links încă, nu e blocker; ajută la 4.2.

**6. Performance sanity**

- [ ] Scroll fluent.
- [ ] Search funcționează.
- [ ] Nu există infinite redirect loop.
- [ ] Network calls OK (nu 401 neașteptate).

**7. App Store Connect – pregătire**

- **Screenshots (minim):** Home, Search, Listing page, Login, Notifications.
- **Description:** Accent pe licitații, notificări, cont personal, experiență mobilă optimizată. Nu scrie "acces la website".

**8. Review Notes (foarte important)**

În câmpul **Review Notes** din App Store Connect, scrie clar:

```
App loads secure content from https://www.gobid.ro
Push notifications are implemented for auctions and account alerts
Payments are handled via secure Mobilpay redirect
The app provides account-based bidding and notification features
```

Reduce riscul 4.2.

**Go / No-Go**

Poți trimite la App Review dacă:

- [ ] Redirect `https://gobid.ro` → 308 → www
- [ ] Push funcționează
- [ ] OAuth funcționează
- [ ] Payment funcționează
- [ ] Nicio eroare vizibilă la launch

Toate bifate → trimite.

---

## 9. App Review – “thin wrapper” risk

- **Guideline 4.2:** Apps that are mostly a WebView over a website can be rejected.
- **Mitigation:** Emphasize **native value** in description and screenshots:
  - **Push Notifications** (already used) – e.g. “Notificări pentru licitații și oferte”.
  - **Universal Links** – links to `https://www.gobid.ro/...` open in the app when installed; add **Associated Domains** and `apple-app-site-association` on the server.
- Describe the app as an **account, bidding, and notifications** experience, not “access to our website”.
- Do **not** put API keys or secrets in the client; do **not** use `allowNavigation: ['*']` in production.

### Supabase and allowNavigation (decision checklist)

- [ ] **Do email confirmation, password reset, or magic-link flows open inside the app WebView?**
  - **Yes** → Before App Review, add your Supabase project URL to `allowNavigation` in root `capacitor.config.ts`, then run `npm run cap:sync-config`:
    - `https://<your-project-ref>.supabase.co`
    - `https://<your-project-ref>.supabase.co/*`
  - **No** (links open in external browser or are not used) → Leave Supabase **excluded** from `allowNavigation`; no change needed.

---

## 10. iOS assets

- **AppIcon:** `gobid_aplicatii/ios/App/App/Assets.xcassets/AppIcon.appiconset/` must contain a **1024×1024 px** PNG (sRGB, no transparency). Set `Contents.json` to reference it (e.g. `AppIcon-512@2x.png`). Xcode can generate other sizes from this single asset.
- **LaunchScreen:** Uses `Base.lproj/LaunchScreen.storyboard` with a solid background. **Splash.imageset** has been removed; no splash image is required.

### Schimbarea iconului la update

**iOS**

1. Pregătește o imagine **1024×1024 px**, PNG, sRGB, **fără transparență**, pătrată.
2. Înlocuiește fișierul din:
   - `gobid_aplicatii/ios/App/App/Assets.xcassets/AppIcon.appiconset/`
3. Numele fișierului trebuie să fie cel din `Contents.json` (acum: `AppIcon-512@2x.png`). Dacă folosești alt nume, actualizează `Contents.json` → `"filename": "numele-tau.png"`.
4. Fă un nou build (Archive) și urcă build-ul la TestFlight/App Store. Iconul nou va apărea după instalare/update.

**Android**

1. Iconul folosește **adaptive icon**: foreground + background. Asset-urile sunt în:
   - `gobid_aplicatii/android/app/src/main/res/`
   - Foldere: `mipmap-mdpi`, `mipmap-hdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, `mipmap-xxxhdpi`
   - Fișiere: `ic_launcher_foreground.png`, `ic_launcher_background.png` (și variantele `ic_launcher.png` / `ic_launcher_round.png` în fiecare folder).
2. **Variantă simplă:** pune un singur PNG 1024×1024 ca sursă, apoi generează toate densitățile (de ex. cu [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html) sau un script) și copiază în folderele `mipmap-*`.
3. Sau înlocuiești manual PNG-urile din fiecare `mipmap-*` cu noile imagini (dimensiunile recomandate: ldpi 48px, mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192 pentru foreground/background).
4. Rebuild APK/AAB și urcă noul build; iconul se actualizează la update.

**Dacă vrei același icon pe ambele platforme:** folosești același design; pe iOS un singur 1024×1024, pe Android setul de densități (sau un generator care face toate mărimile din 1024×1024).

#### Aplicația încarcă www.gobid.ro (production)

App-ul iOS afișează conținutul de la **https://www.gobid.ro/** (WebView). Orice modificare în cod (inclusiv fix-uri JS din `layout.tsx` sau alte componente) trebuie **deploy-ată** pe production ca să se vadă în app: push pe git + build/deploy pe Vercel (sau hosting-ul folosit). După deploy, deschide din nou app-ul sau reîncarcă; nu e nevoie de un nou build iOS doar pentru schimbări pe site.

#### Mesaje în consolă care pot fi ignorate (Xcode / device log)

- **Could not create a sandbox extension for '…/App.app'** – avertizare iOS la accesul la bundle; nu blochează rularea. Poate apărea la debug din Xcode.
- **Unable to hide query parameters from script (missing data)** – mesaj intern WebKit (privacy); nu necesită acțiune din aplicație.
- **'WEBP'-_reader->initImage[0] failed err=-50** – unele variante WebP pot eșua în WKWebView. Am schimbat preload-ul LCP la PNG; imaginile WebP din conținut pot încă loga erori, dar nu opresc încărcarea.
- **StatusBar setOverlaysWebView … UNIMPLEMENTED** – nu mai este apelat pe iOS (doar pe Android); dacă mai apare, e din cache/versiune veche. Fă deploy la ultima versiune.

#### „Application violated contract by causing UIApplicationMain() to return”

Această aserțiune apare când iOS consideră că `UIApplicationMain()` a returnat (ceea ce nu ar trebui să se întâmple niciodată în mod normal).

- **Dacă apare când oprești aplicația din Xcode (Stop)** – este așteptat; run loop-ul se oprește și mesajul este raportat. Nu necesită acțiune.
- **Dacă apare la lansarea reală a app-ului de pe device** (fără debugger):
  1. **Prewarm (iOS 15+)** – sistemul poate „preîncălzi” app-ul în background; unele inițializări (rețea, Keychain) pot eșua sau provoca comportament neașteptat. Asigură-te că nu apelezi `exit()` / `fatalError()` în AppDelegate sau la pornire; amână orice logică grea după ce scena este activă.
  2. **Actualizare Capacitor** – unele versiuni au avut probleme cu prewarm. Rulează `npm update @capacitor/core @capacitor/ios` în `gobid_aplicatii`, apoi `npx cap sync ios` și rebuild.
  3. **SceneDelegate** – fereastra este creată în `scene(_:willConnectTo:options:)`; dacă `scene` nu e `UIWindowScene`, nu setăm fereastra (guard). Nu faceți apeluri sincrone grele aici.

Dacă crash-ul persistă la lansare, raportați cu versiune iOS și dacă apare mereu sau doar uneori (ex. după repornire).

#### Command CompileAssetCatalogVariant failed with a nonzero exit code

Eroare la compilarea Assets.xcassets (de obicei AppIcon). Pași:

1. **Curăță cache-ul Xcode**
   - În Xcode: **Product → Clean Build Folder** (⇧⌘K).
   - Închide Xcode, apoi în Terminal:
     ```bash
     rm -rf ~/Library/Developer/Xcode/DerivedData/*App*
     ```
   - Redeschide **App.xcworkspace** și fă **Product → Build** (⌘B).

2. **Verifică AppIcon**
   - Fișierul `AppIcon.appiconset/AppIcon-512@2x.png` trebuie să fie **1024×1024**, PNG, **fără transparență** (alpha). În Terminal:
     ```bash
     sips -g hasAlpha -g pixelWidth -g pixelHeight gobid_aplicatii/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
     ```
     `hasAlpha` trebuie să fie `no`. Dacă e `yes`, redeschide imaginea în Preview/Photoshop și exportă fără transparență.

3. **Șterge .DS_Store din asset catalog** (poate strica actool pe unele versiuni):
   ```bash
   find gobid_aplicatii/ios/App/App/Assets.xcassets -name ".DS_Store" -delete
   ```

4. Dacă eroarea persistă: în Xcode, click dreapta pe **Assets.xcassets** → **Delete** (doar referința din proiect, „Remove Reference”), apoi **File → Add Files to "App"…** și adaugă din nou folderul **Assets.xcassets**. Apoi Clean Build și Build.

#### Iconul s-a schimbat în folder dar nu și în aplicație

Dacă ai înlocuit `AppIcon-512@2x.png` (sau ai actualizat `Contents.json` cu un nou nume) dar pe device/simulator încă apare vechiul icon:

1. **Verifică imaginea:** 1024×1024 px, PNG, **fără transparență** (alpha). În Terminal:
   ```bash
   sips -g pixelWidth -g pixelHeight -g hasAlpha gobid_aplicatii/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
   ```
   `hasAlpha` trebuie să fie `no`. Dacă e `yes`, exportă din editor cu „flatten” / fără canal alpha.

2. **Curăță build-ul în Xcode** ca asset catalog-ul să fie reprocesat:
   - **Product → Clean Build Folder** (⇧⌘K)
   - Opțional: șterge DerivedData pentru proiect:
     ```bash
     rm -rf ~/Library/Developer/Xcode/DerivedData/*App*
     ```

3. **Pe simulator:** șterge aplicația (long press → Delete App), apoi rulează din nou din Xcode (▶ Run).

4. **Pe device:** șterge aplicația de pe telefon, apoi instalează din nou (Run sau Archive → distribuire). Uneori după update iOS păstrează în cache vechiul icon; o reinstalare completă rezolvă.

5. **Dacă ai schimbat doar fișierul PNG** (același nume), Xcode poate folosi încă cache. După ce ai făcut Clean Build Folder, fă un **Build** (⌘B) și apoi **Run** sau **Archive**. Asigură-te că în **AppIcon.appiconset** nu există decât un singur fișier PNG și că `Contents.json` are în `"filename"` exact numele acelui fișier.

---

## 11. Quick reference

| Item | Value |
|------|--------|
| Open project | `gobid_aplicatii/ios/App/App.xcworkspace` |
| Production URL | `https://www.gobid.ro` |
| Bundle ID | `ro.gobid.app` |
| Config (single source) | `capacitor.config.ts` (repo root) |
| Sync config to native | `npm run cap:sync-config` or `npm run cap:sync` |
