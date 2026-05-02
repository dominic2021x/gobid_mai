# Xcode: Build Succeeds but App Does Not Launch — Scheme & Run Diagnostic

When Xcode shows **"Build Succeeded"** but the app never opens on the simulator or physical iPhone, the cause is usually **Scheme / Run configuration**, not the build itself. Use this checklist in order.

---

## 1. Product → Scheme → Edit Scheme

### Open the scheme editor

- **Product** → **Scheme** → **Edit Scheme…** (⌘<)
- Or: click the **scheme** in the toolbar (e.g. "App") → **Edit Scheme…**

### What to check

#### Left sidebar: **Run**

- Select **Run** (must be the first item, with a play icon).
- **Info** tab (right side):
  - **Build Configuration:** Usually **Debug** for development. (Release = no debugger.)
  - **Executable:** Must be **App** (or your app target name), **not** "None".
  - If **Executable** is **None**, Xcode has nothing to run → build succeeds, no launch.

#### **Executable** dropdown

- Should list: **App** (or e.g. "App.app").
- If it shows **None** or is empty:
  - Use the dropdown → **Other…** → navigate to the built app, e.g.  
    `DerivedData/.../Build/Products/Debug-iphonesimulator/App.app` (simulator) or  
    `Debug-iphoneos/App.app` (device).  
  - Prefer fixing the scheme so "App" appears (see §5).

#### **Options** tab (under Run)

- **App Language:** Can leave default.
- **Core Location / App Store** etc.: Only if you use them.

#### **Arguments** tab

- **Arguments Passed on Launch:** Usually empty for a normal run.
- If you have `--no-sandbox` or other flags that cause early exit, try clearing them temporarily.

**Fix for Run:** Set **Run → Info → Executable** to **App** (your app target). If "App" is not in the list, the scheme or target is misconfigured; see §5.

---

## 2. Run executable configuration

### Where it’s defined

- **Edit Scheme** → **Run** → **Info** → **Executable**.

### Correct state

- **Executable:** **App** (the application target that produces `App.app`).
- This is the binary Xcode installs and launches after a successful build.

### Wrong state

- **Executable: None** → Xcode builds but does not run any executable → no app launch.
- **Executable:** Some other target (e.g. a test bundle, or wrong app) → wrong or no app launches.

### How to set it

1. **Edit Scheme** → **Run** → **Info**.
2. **Executable** dropdown → choose **App** (or your main app target name).
3. If **App** does not appear: the scheme may be pointing at the wrong target, or the app target is not in the workspace. See §5 (recreate scheme) and §3 (build action).

---

## 3. Build action membership for Run

The **Run** action only runs a target that is **built** when you press Run. If the app target is not part of the scheme’s **Build** action, it may not be built (or an old build is used) and Run may do nothing or run the wrong thing.

### Where to check

- **Edit Scheme** → **Build** (left sidebar).

### Correct state

- **Build** tab: under **Targets**, **App** (your app target) must be checked.
- **Run** column for **App** should be **checked** (so that when you Run, Xcode builds the App target and then runs it).

### Wrong state

- **App** unchecked for the **Run** column → scheme does not build the app for Run → no up‑to‑date app to launch.
- **App** not in the list → scheme was created for a different target or project.

### What to do

1. **Edit Scheme** → **Build**.
2. Ensure **App** is listed and **Run** is checked for **App**.
3. Optionally enable **Parallelize Build**; leave **Find Implicit Dependencies** checked.

---

## 4. Build Succeeded vs actual app launch

| Phase | What Xcode does | What you see |
|-------|-----------------|--------------|
| **Build** | Compiles and links the target; produces e.g. `App.app`. | "Build Succeeded" in the status bar. |
| **Run** (after build) | Installs the built product on the selected destination (simulator or device) and **launches the executable** defined in the scheme. | "Running …" then the app opens. |

If **Executable** in the scheme is **None**, or the Run action doesn’t build the app target, then:

- **Build** can still **succeed** (other targets or the app target built).
- **Run** does **not** start the app (no executable to run, or wrong one).

So: **Build Succeeded** only means the build phase completed. Launch depends on **Run → Executable** and **Build → Run** membership.

---

## 5. How to recreate a broken Xcode scheme

If **App** never appears as Executable or the scheme is clearly wrong, recreate the scheme.

### Duplicate and fix (safest)

1. **Product** → **Scheme** → **Manage Schemes…**.
2. Select **App** (or the main scheme).
3. Click the **gear** at the bottom → **Duplicate**.
4. Rename the duplicate (e.g. "App-copy").
5. **Edit** the duplicate:
   - **Run** → **Info** → **Executable** = **App**.
   - **Build** → **App** target checked, **Run** column checked.
6. **Close**. Set the duplicate as the active scheme and try **Run**.
7. If it works, you can delete the old scheme and rename the duplicate back to "App".

### Delete and recreate from target

1. **Manage Schemes…** → select the broken scheme → **-** to delete (or **gear** → **Delete**).
2. **+** to add a new scheme.
3. **Name:** e.g. **App**.
4. **Target:** choose **App** (your app target). Ensure "App" is the **application** target, not a test or framework.
5. **OK**.
6. **Edit Scheme** for the new scheme:
   - **Run** → **Info** → **Executable** = **App**.
   - **Build** → **App** has **Run** checked.
7. Try **Run**.

### Capacitor-specific

- Always open **`App.xcworkspace`**, not the `.xcodeproj`. Schemes are stored per user (in `xcuserdata`) and per project; the workspace includes the App target from the project and Pods.
- If you only ever opened the `.xcodeproj`, open the **workspace** and recreate the scheme there so the **App** target and executable are available.

---

## 6. How to inspect the yellow warning indicator

Yellow warnings in Xcode can point to misconfiguration that affects run (e.g. signing, capabilities, or target issues).

### Where warnings appear

- **Issue navigator:** ⌘5. Filter by **All** or **Warnings**.
- **Project navigator:** Yellow triangle on a file or target.
- **Scheme / Run:** Sometimes a yellow banner in the scheme editor or next to the Run button.

### What to do

1. **Issue navigator (⌘5):** Open each warning; fix any that mention:
   - **Signing** (e.g. "Signing for … requires a development team").
   - **Missing capability** or **entitlement**.
   - **Target** or **scheme** (e.g. "Target X is not built for Run").
2. **Target → General / Signing:**
   - Set **Team** and **Automatically manage signing** if you see signing warnings.
3. **Target → Build Phases:**
   - **Copy Bundle Resources** should include the app’s assets and e.g. **public/index.html** (Capacitor); missing critical resources can cause a silent or immediate exit on launch.
4. **Report navigator (⌘9):** After a Run, open the latest **Run** report. Check for:
   - "Installing …" then "Launching …" (good).
   - "Finished running …" with no "Launching" (run may have no executable).
   - Errors about **executable** or **provisioning** (fix signing or scheme).

If the yellow warning says the **Run executable** is missing or the target isn’t built for Run, fix **Edit Scheme → Run** and **Build** as in §1–3 and §5.

---

## 7. Exact steps to restore simulator + physical iPhone launching

Do these in order.

### Step A: Scheme Run executable

1. **Product** → **Scheme** → **Edit Scheme…**.
2. Select **Run** → **Info**.
3. Set **Executable** to **App** (your app target). If **App** is not in the list, go to Step D.
4. **Close**.

### Step B: Build action for Run

1. **Edit Scheme** → **Build**.
2. Find **App** in the targets list; ensure the **Run** column is **checked** for **App**.
3. **Close**.

### Step C: Destination and clean run

1. In the toolbar, set **destination** to:
   - A **simulator** (e.g. "iPhone 16") for simulator, or  
   - Your **physical iPhone by name** for device.
2. **Product** → **Clean Build Folder** (⇧⌘K).
3. **Product** → **Run** (⌘R).
4. Wait for "Building…" then "Installing…" then "Running…". The app should open.

If the app still does not open, check the **Report navigator** and **Console** for errors (e.g. "could not launch", "executable not found"). Then go to Step D.

### Step D: Recreate scheme (when App is missing as Executable)

1. **Product** → **Scheme** → **Manage Schemes…**.
2. Duplicate the **App** scheme (gear → Duplicate) or delete it and add a new scheme with **Target: App**.
3. **Edit** the (new) scheme:
   - **Run** → **Info** → **Executable** = **App**.
   - **Build** → **App** → **Run** checked.
4. Ensure you opened **`App.xcworkspace`** (not only `App.xcodeproj`).
5. **Close**.
6. **Product** → **Clean Build Folder** → **Run**.

### Step E: Simulator-specific

- **Window** → **Devices and Simulators** → **Simulators**: ensure at least one simulator is present and not corrupted.
- If the chosen simulator is invalid, pick another (e.g. iPhone 15, iPhone 16).
- **Product** → **Run** with that simulator selected.

### Step F: Physical device-specific

- Cable, **Trust**, **Developer Mode** (Settings → Privacy & Security) as in the main deployment doc.
- **Signing & Capabilities**: valid **Team**, **Automatically manage signing**.
- Destination = **your iPhone by name** (not "Generic iOS Device").
- **Product** → **Run**.

### Step G: Capacitor

- From project root: `npm run build` then `npm run cap:sync` (or `cd gobid_aplicatii && npx cap sync ios`).
- Re-open **`App.xcworkspace`** and run again.

---

## Quick reference: Run not launching

| Symptom | Check | Fix |
|--------|--------|-----|
| Build Succeeded, no app | Run → Executable | Set to **App** in Edit Scheme → Run → Info. |
| App not in Executable list | Build membership / scheme | Edit Scheme → Build: **App** with **Run** checked; recreate scheme if needed. |
| Simulator: "Unable to boot" | Simulator | Devices and Simulators → delete broken simulator, add new. |
| Device: installs but doesn’t open | Developer Mode / destination | Developer Mode On; destination = physical device by name. |
| Yellow warnings | Issue navigator (⌘5) | Fix signing, capabilities, or target; ensure Copy Bundle Resources has web assets. |

After fixing **Run → Executable** and **Build → Run** for the App target, **Clean Build Folder** and **Run** again; the app should launch on both simulator and device.
