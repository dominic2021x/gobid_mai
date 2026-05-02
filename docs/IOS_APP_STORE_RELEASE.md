# gobid.ro – iOS App Store Release Guide

**Canonical guide:** [docs/release/ios.md](release/ios.md)

Production-ready flow for building and submitting the Capacitor iOS app to the App Store. No secrets in client; repeatable process.

---

## 1. Open the iOS project (CocoaPods)

**Always open the workspace, not the project:**

```bash
open gobid_aplicatii/ios/App/App.xcworkspace
```

- Use **App.xcworkspace** so CocoaPods dependencies are resolved.
- Do **not** open `App.xcodeproj` alone (missing Pods, build failures).

From repo root you can also run:

```bash
npm run cap:ios
```

Open the workspace by path or via the script above; do not rely on editing the generated `gobid_aplicatii/capacitor.config.ts` (it omits `ios.path`/`android.path` by design).

---

## 2. Capacitor config (production URL & navigation)

**Source of truth:** `capacitor.config.ts` (root). Synced to `gobid_aplicatii/capacitor.config.ts` via `npm run cap:sync-config`.

- **Production URL:** `https://www.gobid.ro` (not `https://gobid.ro`).
- **hostname:** `www.gobid.ro` (matches URL).
- **allowNavigation:** Explicit whitelist (no `*`):
  - `https://www.gobid.ro/*`, `https://www.gobid.ro`
  - `https://gobid.ro/*`, `https://gobid.ro`
- **cleartext:** `false`.
- **No secrets** in config (URLs only).
- For **redirect verification** (curl) and **Supabase allowNavigation** decision checklist, see [release/ios.md](release/ios.md) sections 6.1 and 7.

After editing root config, run:

```bash
npm run cap:sync-config
# or
npm run cap:sync
```

---

## 3. iOS assets

### AppIcon

- Path: `gobid_aplicatii/ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- **Required:** One **1024×1024 px** PNG (sRGB, no transparency, square).
- Place the file as `AppIcon-512@2x.png` (or update `Contents.json` to match the filename you use).
- `Contents.json` is already set for a single universal 1024×1024 slot.

### Splash / LaunchScreen

- **LaunchScreen** uses `Base.lproj/LaunchScreen.storyboard` with a solid background (no image reference).
- **Splash.imageset** is kept with empty slots (no “unassigned children” warning). If you want a custom splash image later, add the PNGs and fill the slots in `Splash.imageset/Contents.json`.

---

## 4. Xcode target settings

In Xcode: select project **App** → target **App** → **General** (or **Build Settings**).

| Setting | Value |
|--------|--------|
| **Bundle Identifier** | `ro.gobid.app` |
| **Version** | `1.0` (MARKETING_VERSION) |
| **Build** | Integer; increment for each App Store upload (see below) |

**Build auto-increment (each release):**

- **Option A (manual):** Before Archiving, open **General** → **Build** and set e.g. `1`, `2`, `3` for each new upload.
- **Option B (script):** Add a **Run Script** build phase (Run Only for Release):
  - Script: `agvtool next-version -all`
  - Input/Output Files: leave empty.
  - This increments `CURRENT_PROJECT_VERSION` on each Archive.

---

## 5. Signing & Capabilities checklist

Before Archive:

- [ ] **Signing & Capabilities** → **Signing (Release)**  
  - [ ] **Automatically manage signing** = On  
  - [ ] **Team** = your Apple Developer team (e.g. SJHN38U6VH)  
  - [ ] No red errors (provisioning profile and certificate valid)
- [ ] **Capabilities**  
  - [ ] Only add what you use (e.g. Push Notifications, Associated Domains for deep links). Avoid empty or unused capabilities.
- [ ] **Device:** Destination = **Any iOS Device (arm64)** (not Simulator) when archiving.

---

## 6. Archive and upload to App Store Connect

### Prerequisites (Apple Developer)

- [ ] **Apple Developer Program** membership (paid).
- [ ] **App** created in [App Store Connect](https://appstoreconnect.apple.com) with:
  - Bundle ID `ro.gobid.app`
  - Name, primary language, category, privacy policy URL.
- [ ] **Agreements, Tax, and Banking** completed in App Store Connect.
- [ ] At least one **physical device** registered in [Certificates, Identifiers & Profiles → Devices](https://developer.apple.com/account/resources/devices/list) (needed for development; distribution uses App Store profile).

### Steps

1. **Open workspace**
   ```bash
   open gobid_aplicatii/ios/App/App.xcworkspace
   ```

2. **Select scheme and destination**
   - Scheme: **App**
   - Destination: **Any iOS Device (arm64)**

3. **Increment Build** (if not using auto-increment script)  
   - Target **App** → **General** → **Build** → set next number (e.g. 2, 3).

4. **Archive**
   - **Product** → **Archive**
   - Wait for build to finish; Organizer opens.

5. **Distribute**
   - In Organizer: select the archive → **Distribute App**
   - **App Store Connect** → **Upload**
   - Select options (e.g. upload symbols, manage version) → **Upload**

6. **App Store Connect**
   - After processing (minutes to ~1 hour), build appears in the app version’s **Build** field.
   - Select the build, add “What’s New”, screenshots, etc., and submit for review.

---

## 7. App Review – WebView wrappers

**Risks for “simple” WebView-only apps:**

- Apple may reject apps that are only a thin browser over a website (Guideline 4.2).
- They expect **native value**: e.g. push notifications, offline use, device features, or a clearly app-like experience.

**Suggested minimal native features to reduce rejection risk:**

1. **Push Notifications**  
   - Already in use; ensure they’re implemented and mentioned in the app description.

2. **Deep links / Universal Links**  
   - Open app from emails or web (e.g. `https://www.gobid.ro/...` opening in app when installed).  
   - Add **Associated Domains** capability and `apple-app-site-association` on the server.

3. **Clear app purpose**  
   - Description and screenshots should stress: account, notifications, bidding, etc., not “just a website.”

4. **Optional but helpful**  
   - Offline or cached content, native forms/sheets, use of device sensors/camera only where relevant.

**Do not:**

- Put API keys or secrets in the client (use env/server-only config).
- Use `allowNavigation: ['*']` in production (use the whitelist above).

---

## 8. Quick reference

| Item | Location / Value |
|------|------------------|
| Open iOS project | `App.xcworkspace` (not `.xcodeproj`) |
| Production URL | `https://www.gobid.ro` |
| Bundle ID | `ro.gobid.app` |
| Version | 1.0 |
| Build | Increment per upload |
| Config source | `capacitor.config.ts` (root) → sync to `gobid_aplicatii` |

---

*Last updated for Capacitor 6 and Xcode 26 / iOS 18+.*
