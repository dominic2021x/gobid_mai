# Stack și capabilități — structură pentru prompt (generic)

Text generic, fără mențiuni de „website”, potrivit pentru prompt-uri (ex. construire alt proiect). Include notificări și permisiuni (microfon, locație, cameră / take photo).

---

## Stack și arhitectură

**Frontend (client)**  
- Framework: Next.js (App Router)  
- UI: React, TypeScript (strict)  
- Styling: Tailwind CSS  
- Rutare: file-based (App Router)

**Backend / server**  
- Runtime: Node.js (Next.js server)  
- API: Next.js Route Handlers (REST-like)  
- Baza de date: PostgreSQL (Prisma ORM)  
- Auth: sesiuni / OAuth (ex. Google), Supabase Auth sau similar

**Mobile (aplicații native)**  
- Wrapper: Capacitor  
- Platforme: iOS, Android  
- Mod: WebView care încarcă frontend-ul (URL remote sau bundle)  
- Plugin-uri: Camera, Push Notifications, Status Bar, Local Notifications, Badge

**Deploy**  
- Web: Vercel sau alt host pentru Next.js (SSR/SSG + API)  
- Mobile: build-uri native (Xcode pentru iOS, Android Studio pentru Android), distribuite prin App Store / Play Store

**Alte capabilități tipice**  
- PWA (manifest, service worker opțional)  
- Dark mode (class pe `<html>`, persistat în localStorage)  
- Responsive (mobile-first)  
- Internaționalizare / limbă în conținut și meta

---

## Safe area la header și footer (aplicații mobile)

Pentru aplicațiile în wrapper nativ (Capacitor), conținutul trebuie să respecte **safe area** (notch, status bar, home indicator pe iOS; margini pe Android), ca header-ul și footer-ul să nu fie tăiate sau lipite de margini.

**Viewport**  
- În layout / viewport meta: `viewport-fit=cover` (Next.js: `export const viewport = { viewportFit: "cover" }`). Fără asta, `env(safe-area-inset-*)` nu este aplicat corect pe iOS.

**CSS – variabile globale**  
- În `:root` (ex. globals.css) definești variabile pentru insets:  
  `--sat: env(safe-area-inset-top, 0px);`  
  `--sab: env(safe-area-inset-bottom, 0px);`  
  `--sal: env(safe-area-inset-left, 0px);`  
  `--sar: env(safe-area-inset-right, 0px);`  
- Opțional: înălțimi pentru bară fixă (ex. `--topbar-h`, `--bottombar-h`) pentru a calcula padding-ul total.

**Root / container principal**  
- Pe containerul principal (ex. `.app-root` pe `body` sau div-ul principal):  
  `padding-top: var(--sat);`  
  `padding-bottom: calc(var(--sab) + [înălțimea footer-ului/bottom nav dacă e fix]);`  
  `padding-left: var(--sal);`  
  `padding-right: var(--sar);`  
- Astfel conținutul nu intră sub notch sau home indicator.

**Header**  
- Header fix sau în flux: asigură că primește spațiu în partea de sus (ex. containerul de mai sus are deja `padding-top: var(--sat)`, sau header-ul are `padding-top: env(safe-area-inset-top, 0px)` / clasă `.safe-area-top { padding-top: env(safe-area-inset-top, 0px); }`).  
- Dacă header-ul e fix (position fixed), include în top / padding-top valoarea `env(safe-area-inset-top)` ca să nu se ascundă sub status bar.

**Footer / bottom navigation**  
- Footer fix sau bottom nav:  
  `padding-bottom: calc([spațiu dorit] + env(safe-area-inset-bottom, 0px));`  
- Butoane sau elemente fixate jos: poziționare cu `bottom: env(safe-area-inset-bottom, 0px)` sau `bottom: calc(var(--bottombar-h) + env(safe-area-inset-bottom));` ca să rămână deasupra home indicator-ului.  
- Variabilă helper (opțional): ex. `--floating-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px)` pentru elemente flotante deasupra zonei sigure.

**Rezumat**  
- Viewport: `viewport-fit: cover`.  
- Variabile `--sat`, `--sab`, `--sal`, `--sar` din `env(safe-area-inset-*)`.  
- Root: padding pe toate cele patru laturi cu aceste variabile; la bottom adaugi înălțimea footer-ului/bottom nav dacă e fix.  
- Header: padding-top sau top cu safe-area-top.  
- Footer / bottom nav: padding-bottom și poziționare elemente fixe cu safe-area-bottom.  
- Comportament identic pe iOS (notch, home indicator) și pe Android unde există insets.

---

## Notificări

**Push notifications**  
- Plugin: `@capacitor/push-notifications`  
- Flux: request permisiune → register → trimitere token la backend; backend trimite notificări prin FCM (Android) / APNs (iOS)  
- În app: listener pentru `pushNotificationReceived` / `pushNotificationActionPerformed`; badge actualizat cu `@capawesome/capacitor-badge` dacă e cazul  
- iOS: permisiune la runtime; Android: permisiuni în manifest  
- Remote URL (WebView): token-ul se trimite la serverul aplicației pentru a asocia device-ul cu userul

**Local notifications**  
- Plugin: `@capacitor/local-notifications`  
- Pentru alerte locale (reminder-uri, notificări programate)  
- Request permisiune, schedule/ cancel notificări; listener pentru `localNotificationReceived` / `localNotificationActionPerformed`

**Badge (număr pe iconița app)**  
- Plugin: `@capawesome/capacitor-badge` (sau Badging API în browser/PWA)  
- Sincronizat cu numărul de notificări necitite (ex. din backend sau din local)

---

## Permisiuni (microfon, locație, cameră / take photo)

**Reguli generale**  
- Declarare în manifest nativ (iOS Info.plist, Android AndroidManifest.xml) cu mesaje clare pentru utilizator  
- La runtime: verificare și, unde e cazul, cerere permisiune înainte de a folosi funcționalitatea  
- Fallback grațios dacă permisiunea e refuzată sau indisponibilă (mesaj în UI, fără crash)  
- Pe iOS: Developer Mode activat pentru development; în producție permisiunile se cer conform politicilor Apple

### Microfon

- **iOS (Info.plist):** cheie `NSMicrophoneUsageDescription` — text explicativ (ex. „Aplicația folosește microfonul pentru înregistrări audio / voce”).  
- **Android (AndroidManifest.xml):** `RECORD_AUDIO`.  
- **În cod:** Web API `navigator.mediaDevices.getUserMedia({ audio: true })` sau plugin dedicat dacă folosești; verifică/ cere permisiunea înainte de a porni captura.  
- **UX:** buton/ acțiune dedicată „Permite microfon”; mesaj dacă e refuzat sau indisponibil.

### Locație

- **iOS (Info.plist):**  
  - `NSLocationWhenInUseUsageDescription` — când folosești locația în foreground (ex. „Pentru conținut din apropiere și filtre pe zonă”).  
  - Opțional: `NSLocationAlwaysAndWhenInUseUsageDescription` dacă ai nevoie de background.  
- **Android:** `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` în manifest; cerere la runtime pentru API 23+.  
- **În cod:** Geolocation API (navigator.geolocation) sau `@capacitor/geolocation`; verifică disponibilitatea și permisiunea înainte de `getCurrentPosition` / watch.  
- **UX:** explică de ce ai nevoie de locație; mesaj dacă e dezactivată sau refuzată.

### Cameră / Take photo și galerie

- **iOS (Info.plist):**  
  - `NSCameraUsageDescription` — pentru captură foto (ex. „Aplicația folosește camera pentru a face fotografii pentru conținut”).  
  - `NSPhotoLibraryUsageDescription` — pentru alegere din galerie (ex. „Pentru a încărca imagini din galerie”).  
  - `NSPhotoLibraryAddUsageDescription` — dacă salvezi imagini în galerie (ex. „Pentru a salva imaginile în galerie”).  
- **Android:** `CAMERA`, `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES` (în funcție de API); cerere la runtime unde e necesar.  
- **În cod (recomandat în Capacitor):**  
  - Un singur punct de acces: utilitar (ex. `getSafePhoto(options)`) care folosește `@capacitor/camera` (Camera.getPhoto cu source: Prompt / Camera / Photos).  
  - Pe iOS: preferă `CameraSource.Prompt` pentru „Take photo” ca să eviți crash-uri pe iPad/iPhone (în loc de `<input capture>` în WebView).  
  - Verificare/ cerere permisiuni (Camera.checkPermissions, requestPermissions) înainte de deschiderea camerei/ galeriei.  
  - Rezultat tipizat: `{ ok: true, webPath, source } | { ok: false, reason: 'cancelled' | 'permission-denied' | 'unavailable' | ... }`; nu arunca erori neprins către UI.  
  - Conversie `webPath` → File/Blob pentru upload dacă e nevoie.  
- **UX:** butoane explicite „Fă o poză” și „Încarcă din galerie”; mesaje în limbajul aplicației la anulare, permisiune refuzată sau cameră indisponibilă.

---

## Structură proiect (termeni)

```
[project-root]
├── app/                    # Next.js App Router
│   ├── (routes)/           # route groups
│   ├── api/                # API routes (backend)
│   ├── layout.tsx          # root layout
│   └── globals.css
├── components/             # React components
├── lib/                    # shared logic, utils, clients
│   ├── mobile/             # optional: native-only helpers
│   │   └── camera/         # ex. getSafePhoto, webPathToFile
│   └── logger/             # optional: mobile/camera logging
├── public/                 # static assets
├── [native]/               # Capacitor (ios/, android/ sau subfolder)
│   └── App/                # native project (Xcode/Android)
│       └── App/
│           └── Info.plist  # iOS: usage descriptions
├── package.json
├── tsconfig.json
├── tailwind.config.*
├── next.config.*
└── capacitor.config.*      # appId, webDir, server URL
```

---

## Termeni cheie pentru prompt

- **Aplicație web:** frontend + backend în Next.js  
- **Client:** Next.js App Router, React, TypeScript, Tailwind  
- **Server / API:** Next.js Route Handlers, Prisma, PostgreSQL  
- **Aplicații mobile:** Capacitor (iOS + Android), WebView pe URL sau bundle  
- **Notificări:** push (FCM/APNs), local, badge; permisiuni și listeners în app  
- **Permisiuni:** microfon (NSMicrophoneUsageDescription, RECORD_AUDIO), locație (NSLocationWhenInUseUsageDescription, ACCESS_*_LOCATION), cameră/galerie (NSCameraUsageDescription, NSPhotoLibrary*, CAMERA, READ_*); verificare/cerere la runtime; mesaje clare în UI  
- **Take photo:** flux centralizat prin Capacitor Camera (getPhoto, Prompt/Camera/Photos), fără `<input capture>` în WebView pe iOS; rezultat tipizat, fallback la galerie, mesaje la anulare/refuz  
- **Safe area (header / footer):** viewport-fit=cover; variabile CSS --sat, --sab, --sal, --sar din env(safe-area-inset-*); padding pe root; header cu safe-area-top; footer/bottom nav cu safe-area-bottom ca pe gobid  
- **Auth:** sesiuni, OAuth, provider (ex. Supabase Auth)  
- **Deploy web:** platformă tip Vercel; mobile: App Store, Play Store  

---

## Checklist rapid (mobile)

- [ ] **Safe area:** viewport-fit=cover; variabile --sat, --sab, --sal, --sar; padding pe root; header cu safe-area-top; footer/bottom nav cu safe-area-bottom (ca la gobid)  
- [ ] Info.plist (iOS): NSCameraUsageDescription, NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription, NSMicrophoneUsageDescription, NSLocationWhenInUseUsageDescription (texte clare)  
- [ ] Android manifest: CAMERA, READ_EXTERNAL_STORAGE / READ_MEDIA_IMAGES, RECORD_AUDIO, ACCESS_FINE_LOCATION (și cerere la runtime unde e cazul)  
- [ ] Push: plugin Push Notifications, request permission, register, trimitere token la backend; listeners pentru received/action  
- [ ] Cameră: un singur utilitar (ex. getSafePhoto), @capacitor/camera, Prompt pe iOS pentru take photo, check/request permissions, rezultat tipizat și mesaje în UI  
- [ ] Microfon: cerere permisiune înainte de getUserMedia sau plugin; mesaj la refuz  
- [ ] Locație: cerere permisiune înainte de getCurrentPosition/watch; mesaj la refuz/dezactivare  
