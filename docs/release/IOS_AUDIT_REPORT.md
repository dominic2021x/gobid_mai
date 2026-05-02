# Capacitor iOS release – audit report

**Date:** 2026-03-01  
**Scope:** Single config source, sync, allowNavigation, iOS assets, redirect checklist.

---

## 1) Single config source of truth

| Check | Result | Details |
|-------|--------|---------|
| Root has exactly one config file | **PASS** | Only `capacitor.config.ts` exists at repo root. |
| capacitor.config.js at root | **PASS** | Deleted; not present. |
| capacitor.config.json at root | **PASS** | Deleted; not present. |
| References to .js/.json in scripts | **PASS** | `package.json`: `cap:sync-config` runs `tsx scripts/sync-capacitor-config-to-gobid.ts` (reads root .ts). `ensure-capacitor-config.js` only creates .ts when missing; fallback reads .json if present. No reference to root .js. |
| References in docs | **FAIL → FIXED** | **Was:** `docs/IOS_APP_STORE_RELEASE.md` lines 26, 32, 180 cited `capacitor.config.js`. **Was:** `docs/BUILD-ANDROID-PUSH.md` and `gobid_aplicatii/BUILD-ANDROID-PUSH.md` cited .js/.json and `https://gobid.ro`. **Fix applied:** All updated to `capacitor.config.ts` and `https://www.gobid.ro`. |
| tsconfig.json | **PASS** | `exclude` contains `capacitor.config.ts` and `capacitor.config.json` (Next.js does not compile them; Capacitor CLI uses root .ts). Acceptable. |

**Conclusion:** **PASS** after doc updates. Single source of truth is root `capacitor.config.ts`.

---

## 2) Sync run and validation

| Check | Result | Details |
|-------|--------|---------|
| `npm run cap:sync-config` | **PASS** | Exits 0; script runs successfully. |
| server.url | **PASS** | Root and `gobid_aplicatii/capacitor.config.ts`: `https://www.gobid.ro`. |
| server.hostname | **PASS** | Both: `www.gobid.ro`. |
| server.allowNavigation (keys and order) | **PASS** | Identical list in both; no missing entries. Generated file has no comments (Supabase comment in root is stripped by JSON.stringify). |
| android.path / ios.path in generated file | **PASS** | Correctly stripped in `gobid_aplicatii/capacitor.config.ts` (not present). |

**Conclusion:** **PASS**. Synced file matches root `server.url`, `hostname`, and `allowNavigation` exactly.

---

## 3) allowNavigation validation

| Check | Result | Details |
|-------|--------|---------|
| No '*' wildcard | **PASS** | Only path suffixes `/*` are used; no standalone `*`. |
| gobid.ro entries | **PASS** | `https://www.gobid.ro`, `https://www.gobid.ro/*`, `https://gobid.ro`, `https://gobid.ro/*`. |
| secure.mobilpay.ro / sandbox.mobilpay.ro | **PASS** | Required for payment redirects (`payment_url` in credits/tokens/premium APIs). |
| accounts.google.com, oauth2.googleapis.com, www.googleapis.com | **PASS** | Required for Google OAuth (auth flow in app/auth and modules/googleAuth). |
| www.facebook.com, graph.facebook.com | **PASS** | Required for Facebook OAuth (auth flow and modules/facebookAuth). |
| Supabase | **NOTE** | Root `capacitor.config.ts` has comment: if Supabase auth/magic links open in WebView, add `https://<project-ref>.supabase.co` and `https://<project-ref>.supabase.co/*` before App Store submission. Not added by default (project ref is env-specific). |

**Conclusion:** **PASS**. No `*`; all listed domains are required; Supabase is documented for WebView auth.

---

## 4) iOS assets

| Check | Result | Details |
|-------|--------|---------|
| Splash.imageset deleted | **PASS** | Directory `gobid_aplicatii/ios/App/App/Assets.xcassets/Splash.imageset` does not exist. |
| LaunchScreen.storyboard references Splash | **PASS** | No image reference; only `<color key="backgroundColor" systemColor="systemBackgroundColor"/>`. No "Splash" string. |
| Info.plist references Splash | **PASS** | Only `UILaunchStoryboardName` = `LaunchScreen` (storyboard name). No Splash. |
| AppIcon.appiconset/Contents.json | **PASS** | Single image: `filename`: `AppIcon-512@2x.png`, `size`: `1024x1024`, `idiom`: `universal`, `platform`: `ios`. |
| AppIcon PNG exists | **PASS** | `gobid_aplicatii/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` exists (~861 KB). |
| AppIcon PNG 1024×1024 and no transparency | **PASS** | `sips -g hasAlpha AppIcon-512@2x.png` → `hasAlpha: no`. Contents.json specifies 1024×1024. |

**Conclusion:** **PASS**.

---

## 5) Redirect validation checklist (server/CDN)

Cannot be verified from repo. Ensure the following on the host/CDN:

| Redirect | Target | Notes |
|----------|--------|------|
| `http://gobid.ro` | `https://www.gobid.ro` | Single hop if possible to avoid WKWebView redirect chains. |
| `https://gobid.ro` | `https://www.gobid.ro` | 301/302 to canonical. |
| `http://www.gobid.ro` | `https://www.gobid.ro` | HTTP → HTTPS. |

**Verification:** Open each URL in a browser; final URL should be `https://www.gobid.ro` with minimal redirects.

---

## 6) Summary

| Item | Result |
|------|--------|
| 1) Single config source (root .ts; .js/.json gone, no bad refs) | **PASS** (after doc fixes) |
| 2) Sync run and root vs gobid match | **PASS** |
| 3) allowNavigation (no *, domains required, Supabase note) | **PASS** |
| 4) Splash deleted, not referenced; AppIcon valid | **PASS** (transparency: manual) |
| 5) Redirect checklist | **Documented** (server/CDN responsibility) |
| 6) Report with PASS/FAIL and paths | **Done** |

**Diffs applied during audit**

- `docs/IOS_APP_STORE_RELEASE.md`: 3 edits – all references to `capacitor.config.js` → `capacitor.config.ts`; table row config source updated.
- `docs/BUILD-ANDROID-PUSH.md`: 2 edits – config source and URL to `capacitor.config.ts` and `https://www.gobid.ro`.
- `gobid_aplicatii/BUILD-ANDROID-PUSH.md`: 2 edits – same as above.

No code or config changes; documentation only.
