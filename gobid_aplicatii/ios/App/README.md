# gobid.ro – iOS (Capacitor)

## Run în Simulator

1. **Deschide workspace-ul** (obligatoriu, nu `.xcodeproj`):
   ```bash
   open App.xcworkspace
   ```
   Din repo root: `npm run cap:ios`.

2. În Xcode, în bara de sus:
   - **Scheme:** click pe numele schemei (lângă butonul Stop) → alege **App**. Dacă acolo e „Pods-App” sau „Capacitor”, app-ul **nu pornește** – trebuie **App**.
   - **Destination:** alege un simulator (ex. **iPhone 17**), nu „Any iOS Device”.
   - Apasă **Run** (▶) sau ⌘R.

**Dacă nu pornește deloc:** de obicei Scheme este greșit (Pods în loc de App). Schimbă la **App** și rulează din nou. Apoi: Product → Clean Build Folder, Build, Run.

Documentație completă: [docs/release/ios.md](../../../docs/release/ios.md).
