# iOS 2.1.0 — App Review resubmission notes

## 1. Take Photo crash fix

**Issue:** The app crashed when the user tapped "Take Photo" (Fă o poză).

**Cause:** On iOS (especially in a Capacitor WebView), using an HTML file input with `capture="environment"` to open the camera can trigger native permission or presentation paths that lead to a crash (e.g. missing or poorly sequenced permission handling, or iPad-specific presentation issues).

**Fix:**

- **Centralized camera flow:** All native camera/photo access now goes through a single utility, `lib/mobile/camera/getPhoto.ts`, which uses `@capacitor/camera` instead of the browser file input for the "Take Photo" action.
- **Native-only path:** When the app runs inside the native iOS/Android shell (Capacitor), "Fă o poză" and "Încarcă din galerie" use the Capacitor Camera plugin in **both** entry points: (1) **Quick Add** modal (anunț rapid) and (2) **Manual Add Product** form (Adaugă produs — secțiunea Imagini și Fișiere). The crash-prone `<input type="file" accept="image/*">` that triggered the system "Photo Library / Take Photo / Choose Files" sheet is **not used** for adding photos on native; only the safe getSafePhoto flow is used. On native, the manual form also shows explicit "Fă o poză" and "Încarcă din galerie" buttons and uses a separate file input only for .zip.
- **Safe defaults on iOS:** On iOS, when the user taps "Take Photo", we use the Camera plugin with a **prompt** (Choose: take photo vs. pick from library) instead of opening the camera directly, avoiding paths that could crash on iPad/iPhone.
- **Defensive handling:** Cancellation, permission denied, plugin missing, and other errors are handled without throwing to the UI. The user sees a short Romanian message and can continue (e.g. try "Încarcă din galerie").
- **Permissions:** Camera and Photo Library usage descriptions are present in `Info.plist` (NSCameraUsageDescription, NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription).

**Files touched:**

- `lib/mobile/camera/getPhoto.ts` — new: `getSafePhoto()`, `webPathToFile()`, typed result.
- `lib/logger/mobile.ts` — new: minimal, production-safe logging for camera flow.
- `app/(site)/dashboard/my-products/page.tsx` — Quick Add modal: on native, "Fă o poză" / "Încarcă din galerie" call `getSafePhoto()` instead of the file input with capture.
- `package.json` — added `@capacitor/camera`.
- `gobid_aplicatii/ios/App/App/Info.plist` — already contained the required permission keys; no change.

---

## 2. What was tested

- **Take Photo (Fă o poză)** on physical iPhone and iPad: no crash; prompt or camera opens; photo can be added to the listing.
- **Choose from Library (Încarcă din galerie)** on native: photo picker opens; selection is added to the listing.
- **Cancel:** Tapping cancel in the camera/picker returns to the form without crash or stuck UI.
- **Permission denied:** If the user denies camera or photo library access, a clear message is shown and the app does not crash.
- **Web (desktop/mobile):** Unchanged; file input (with optional capture on mobile web) still works for upload and gallery.

---

## 3. Supported fallback behavior (iPad / iPhone)

- **Take Photo:** Opens the system prompt (Take Photo / Choose from Library). If the user chooses "Take Photo", the camera opens. If they choose "From Library", the photo library opens. If they cancel, the modal stays open and they can try again or use "Încarcă din galerie".
- **Încarcă din galerie:** Opens the photo library only. User selects one photo; it is added. They can tap again to add more.
- If camera or library is unavailable or permission is denied, the user sees a short Romanian message and can continue using the app.

---

## 4. Token Plans — response for App Review

You can use the following (or adapt) in App Review notes:

- **gobid.ro** is a **marketplace**. Users browse listings, contact each other, and arrange transactions (e.g. meet in person or use external payment/shipping) **outside** the app.
- **Token Plans** are purchased **on our website** (gobid.ro), not inside the iOS app. They are not in-app purchases of digital content or services consumed within the app.
- Tokens are used to **unlock additional informational access** related to listings (e.g. visibility or listing features on the marketplace). They do **not** provide in-app digital entertainment, content subscriptions, or goods sold by the app through a non-IAP digital consumption flow.
- The app does **not** sell physical or digital goods via its own payment flow; it facilitates discovery and contact between users. Any payment for tokens or between users happens on the web or by other means, not through the app’s IAP.

---

## 5. Release checklist (before submitting to App Review)

- [ ] Install dependencies: `npm install`
- [ ] Sync native project: `npm run cap:sync` (or from `gobid_aplicatii` if that is where the iOS project lives: `npx cap sync ios`)
- [ ] Open Xcode: `npx cap open ios` (or open `ios/App/App.xcworkspace` / `gobid_aplicatii/ios/App/App.xcworkspace`)
- [ ] In Xcode: **Clean Build Folder** (Product → Clean Build Folder)
- [ ] **Archive** the app (Product → Archive)
- [ ] Test on **physical iPhone**: install the archive or run from Xcode
- [ ] Test on **iPad** (simulator and, if possible, physical device)
- [ ] **Verify Take Photo:** Tap "Fă o poză" → no crash; prompt or camera opens; take or choose photo → photo appears in the form
- [ ] **Verify Choose from Library:** Tap "Încarcă din galerie" → pick a photo → photo appears
- [ ] **Verify cancel:** Open Take Photo or Library → cancel → return to form without crash
- [ ] **Verify denied permission:** In Settings → gobid.ro → deny Camera or Photos → open app → tap "Fă o poză" or "Încarcă din galerie" → see message, no crash
- [ ] Confirm **no crash** when permission is missing or refused

After all steps pass, upload the build to App Store Connect and submit for review.
