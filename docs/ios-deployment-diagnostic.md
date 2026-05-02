# Xcode Physical iPhone Deployment — Diagnostic Flow

Use this order. Do not skip steps; each can cause "build succeeds but app does not launch."

---

## 1. Check Xcode → Window → Devices and Simulators

**Open:** Xcode → **Window** → **Devices and Simulators** (⇧⌘2).

### Device list (left) — possible statuses

| Status | Meaning | Action |
|--------|--------|--------|
| **Device name** (e.g. "John's iPhone") with no icon | Paired, trusted, ready | Proceed to step 2. |
| **"Preparing device..."** (spinner) | Xcode is installing device support / pairing | Wait 2–5 min. If it stays >10 min, unplug, restart iPhone, reconnect. |
| **"Unavailable"** (grey) | Device is locked, or iOS version not supported by this Xcode | Unlock iPhone; or update Xcode / iOS (see §4). |
| **"Unsupported device"** / **"This device is not supported"** | Xcode is too old for this iOS version | Install newer Xcode or use a device with older iOS (see §4). |
| **"Connect with cable"** / device not in list | Not connected, wrong cable (charge‑only), or USB issue | Use data-capable cable, try another port/USB hub, restart both Mac and iPhone. |
| **Yellow warning icon** | Trust not established or Developer Mode off | See §2. |
| **"Device is busy"** | Another process (e.g. iTunes, another Xcode) is using it | Quit other apps using the device; disconnect and reconnect. |

### What to verify

- Your **physical iPhone** appears by name (not only "iPhone" or "Generic iOS Device").
- Status is **not** "Unavailable" or "Unsupported."
- If you see "Preparing device..." wait until it finishes.

---

## 2. iPhone trust + Developer Mode

### Trust this computer

1. Unlock iPhone.
2. Connect via USB.
3. If a pop-up **"Trust This Computer?"** appears on the iPhone → tap **Trust** and enter passcode.
4. If you previously chose "Don't Trust": on iPhone go to **Settings → General → Transfer or Reset iPhone → Reset → Reset Location & Privacy**, then reconnect and choose **Trust** when prompted.

### Developer Mode (iOS 16+)

Required to run apps installed via Xcode (development builds).

1. On iPhone: **Settings → Privacy & Security → Developer Mode**.
2. Turn **Developer Mode** **On**.
3. iPhone will restart.
4. After restart, confirm the toggle is still On.

If Developer Mode is off, the app may install but **will not launch** (or will exit immediately).

---

## 3. Signing & Capabilities — exact fields

**Open:** In Xcode, select the **App** target (not the project) → **Signing & Capabilities** tab.

### Team

- **Team:** Must be a non-"None" team (your Apple ID or your organization’s team).
- If you see **"Failed to create provisioning profile"** or **"No accounts with team"**: add your Apple ID in **Xcode → Settings → Accounts**, then select that team again.

### Signing certificate

- **Signing Certificate:** Should show **"Apple Development"** (or "Apple Distribution" for archive) — not "Signing for … requires a development team".
- **Provisioning Profile:** Should be automatic (Xcode-managed) or a valid development profile for your device.

### Bundle Identifier

- Must be **unique** (e.g. `ro.gobid.app`) and match what you use in App Store Connect if you later distribute.
- No spaces or invalid characters.

### Capabilities

- Only add capabilities you actually use (e.g. Push Notifications, Camera, Photo Library). Incorrect or missing entitlements can prevent launch or cause instant crash.

### Common mistakes

- **Team:** "None" → app won’t run on device.
- **Automatically manage signing** unchecked and no valid profile → build can succeed but install/launch fails.
- Wrong or conflicting provisioning profile → "Unable to install" or no launch.

**Fix:** Check **Automatically manage signing**, pick the correct **Team**, clean build folder (Product → Clean Build Folder), then build again.

---

## 4. Xcode version vs installed iOS version

If the device appears as **"Unsupported"** or **"Unavailable"**, Xcode may not support your iPhone’s iOS version.

### Check versions

- **iPhone iOS:** Settings → General → About → **Software Version**.
- **Xcode:** Xcode → About Xcode (or **Xcode → Settings → Platforms** for device support).

### Compatibility (typical)

- Xcode 15.x → usually supports up to iOS 17.x; may need **Additional Components** for newer iOS (e.g. 18).
- Xcode 16.x → supports iOS 18.x; may need components for latest point releases.

### If iOS is newer than Xcode supports

1. **Preferred:** Update Xcode (App Store or developer.apple.com).
2. **Or:** In Xcode, **Window → Devices and Simulators**, select the device → look for **"Download symbol / support"** or **"Get"** next to the iOS version and install device support if offered.
3. **Or:** Use an iPhone with an iOS version supported by your current Xcode.

Until device support is installed, the device may stay "Unavailable" or "Unsupported" and the app will not run on it.

---

## 5. Workspace vs project

For **Capacitor** iOS apps you must open the **workspace**, not the raw `.xcodeproj`.

### Correct

- Open: **`App.xcworkspace`** (e.g. `ios/App/App.xcworkspace` or `gobid_aplicatii/ios/App/App.xcworkspace`).
- This loads CocoaPods and the app target correctly.

### Wrong

- Opening **`App.xcodeproj`** only can lead to missing pods, wrong scheme, or build/run pointing at the wrong target, so the app may not install or launch on device.

**Check:** Title bar should show something like **"App"** and the scheme (e.g. "App") should list your physical device. If you opened the project by mistake, close Xcode and open **`App.xcworkspace`**.

---

## 6. Capacitor sync issues

If the web app or native config is out of date, the built app can be broken or fail to run.

### From project root (where `package.json` and `capacitor.config.*` live)

```bash
npm install
npm run build
npm run cap:sync
```

Or, if the iOS app lives in a subfolder (e.g. `gobid_aplicatii`):

```bash
cd gobid_aplicatii
npx cap sync ios
```

### What to verify

- **`ios/App/App/Info.plist`** (or equivalent) exists and has correct bundle ID and permissions.
- No script errors during `cap sync` (e.g. missing `webDir` or wrong paths).
- After sync, open **`App.xcworkspace`** in Xcode (see §5) and build again.

If you run on device without syncing after web or config changes, the app may build but behave incorrectly or not start; re-sync and rebuild.

---

## 7. Run destination: generic vs physical device

The run destination must be your **physical iPhone**, not a simulator or a generic device.

### Where to look

- **Toolbar:** Next to the **Run (▶)** button, the destination dropdown (e.g. "App > iPhone 15") shows the selected destination.
- **Scheme:** **Product → Destination** (or the device dropdown in the scheme selector).

### How to tell

| Destination text | Meaning |
|------------------|--------|
| **"John's iPhone"** (or your device name) | Physical device — correct for device deployment. |
| **"iPhone 15"**, **"iPhone 16"**, etc. (with no name) | Simulator — app runs in Simulator, not on the connected phone. |
| **"Any iOS Device (arm64)"** / **"Generic iOS Device"** | Generic device — used for Archive; **will not run** on the connected iPhone. |

### What to do

1. Click the destination dropdown next to the Run button.
2. Under **"Devices"** (not "iOS Simulators"), select your **iPhone by name**.
3. If your iPhone is not in the list, go back to §1 and §2 (pairing, trust, Developer Mode, device support).

Only run (▶) when the selected destination is your **named physical iPhone**.

---

## 8. Recovery steps by failure case

### App doesn’t install / "Unable to install"

- **Signing:** Set Team, enable "Automatically manage signing", clean build folder, rebuild.
- **Provisioning:** Remove old app from iPhone (long-press → Delete App). In Xcode, Product → Clean Build Folder, then Run again.
- **Device:** Confirm device is trusted and Developer Mode is On (§2).

### App installs but doesn’t launch (or exits immediately)

- **Developer Mode:** Turn On (Settings → Privacy & Security → Developer Mode), restart iPhone (§2).
- **Trust:** Re-establish trust (cable, "Trust This Computer").
- **Destination:** Ensure you selected the **physical device by name**, not "Generic iOS Device" or a simulator (§7).

### Device not in the destination list / "Unavailable"

- **Unlock** iPhone and leave it unlocked during first run.
- **Device support:** Update Xcode or install device support for your iOS version (§4).
- **USB:** Try another cable/port; avoid charge-only cables; restart Mac and iPhone.

### "Preparing device..." never finishes

- Unplug iPhone, restart iPhone, reconnect.
- Restart Xcode; re-open **App.xcworkspace** (§5).
- If still stuck, remove the device from Devices and Simulators (right‑click → "Unpair" or "Remove"), then reconnect and trust again.

### Build succeeds but nothing happens on iPhone

- Confirm the **run destination** is your **physical iPhone** (§7), not "Generic iOS Device" or a simulator.
- In Xcode, check the **Report navigator** (last build) and the **Console** for install/launch errors.
- On iPhone, check **Settings → General → VPN & Device Management** for any profile/developer app restrictions.

### CocoaPods / workspace issues

- Open **`App.xcworkspace`**, not `App.xcodeproj` (§5).
- If pods are missing: in `ios/App` run `pod install`, then open `App.xcworkspace` and build again.

---

## 9. Final clean run checklist (physical iPhone)

Use this sequence once everything above is in order:

1. **iPhone**
   - [ ] Unlocked.
   - [ ] **Settings → Privacy & Security → Developer Mode** = **On** (iOS 16+).
   - [ ] Connected with a **data-capable USB cable**.

2. **Trust**
   - [ ] "Trust This Computer?" accepted on iPhone (if prompted).
   - [ ] In **Xcode → Window → Devices and Simulators**, iPhone appears by name and is **not** Unavailable/Unsupported/Preparing.

3. **Xcode**
   - [ ] Opened **`App.xcworkspace`** (not `.xcodeproj`).
   - [ ] **App** target → **Signing & Capabilities**: valid **Team**, **Automatically manage signing** on.
   - [ ] **Product → Clean Build Folder**.
   - [ ] **Destination** = your **physical iPhone by name** (not "Generic iOS Device", not a simulator).

4. **Capacitor (if you changed web or config)**
   - [ ] From project root: `npm run build` then `npm run cap:sync` (or `cd gobid_aplicatii && npx cap sync ios`).
   - [ ] Open `App.xcworkspace` again if you closed it.

5. **Run**
   - [ ] Press **Run (▶)**.
   - [ ] Wait for "Installing…" then "Running" — app should open on the iPhone.

If the app still does not launch, check the **Xcode console** and **Report navigator** for the exact error message, then match it to §8 (e.g. signing, Developer Mode, or destination).
