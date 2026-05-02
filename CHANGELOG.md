# Changelog

## iOS 2.1.0 — Take Photo crash fix (App Review resubmission)

### Fixed

- **Take Photo crash on iOS:** The app no longer crashes when the user taps "Take Photo" (Fă o poză) on iPhone or iPad. Camera and photo library access are now handled through a centralized, native flow using `@capacitor/camera` instead of the previous HTML file input with `capture="environment"`, which could crash in the WebView.

### Added

- **`lib/mobile/camera/getPhoto.ts`:** Centralized `getSafePhoto(options?)` and `webPathToFile(webPath)` for production-safe image capture on Capacitor iOS/Android. Returns a typed result; handles cancellation, permission denied, and plugin missing without throwing.
- **`lib/logger/mobile.ts`:** Lightweight, production-safe logging for camera flow failures.
- **`docs/app-review/ios-2.1.0-resubmission.md`:** Resubmission notes, testing summary, Token Plans response text for App Review, and release checklist.

### Changed

- **Quick Add (my-products):** On native app (iOS/Android), "Fă o poză" and "Încarcă din galerie" use `getSafePhoto()` and no longer use the capture file input. On web, behavior is unchanged (file input + optional capture).
- **Dependency:** Added `@capacitor/camera` for native camera/photo picker support.

### Technical

- iOS: "Take Photo" uses the Camera plugin with a prompt (camera or library) by default to avoid crash-prone paths. Permission preflight and defensive error handling ensure no unhandled exceptions reach the UI.
- Info.plist already contained required keys: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`. No change.

---

For full resubmission steps and App Review notes, see `docs/app-review/ios-2.1.0-resubmission.md`.
