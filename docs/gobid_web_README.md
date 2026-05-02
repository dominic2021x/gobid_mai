# web/ – webDir pentru Capacitor (remote WebView)

Acest folder este folosit **doar** ca `webDir` în `capacitor.config.ts`.

- **Ce face Capacitor:** la `npx cap sync` copiază conținutul acestui folder în proiectele native (iOS/Android). La runtime, dacă `server.url` este setat (ex. `https://gobid.ro`), WebView încarcă acea URL, **nu** fișierele din webDir.
- **Fișier minim obligatoriu:** `index.html`. Poate fi minimal (un HTML valid); conținutul nu este afișat utilizatorului când `server.url` este folosit.
- **De ce nu `public/`:** pentru a separa asset-urile Next.js (public/) de asset-urile copiate în app-ul Capacitor și a evita copierea inutilă a imaginilor/iconițelor în build-ul mobil.
