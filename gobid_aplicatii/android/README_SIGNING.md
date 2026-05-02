# Release Signing Setup

## Keystore location

Place your release keystore in:

```
gobid_aplicatii/android/gobid-release.keystore
```

Or use a path relative to the `android` directory, e.g. `../gobid-release.keystore` if it lives one level up.

## gradle.properties (local only)

1. Copy `gradle.properties.example` to `gradle.properties`.
2. Fill in real values for the four signing properties:
   - `GOBID_STORE_FILE` – path to the keystore file (e.g. `../gobid-release.keystore`)
   - `GOBID_STORE_PASSWORD` – keystore password
   - `GOBID_KEY_ALIAS` – key alias (e.g. `gobid`)
   - `GOBID_KEY_PASSWORD` – key password

3. Do **not** commit `gradle.properties` – it is gitignored.

## Environment variables (alternative)

You can set these instead of using gradle.properties:

- `GOBID_STORE_FILE`
- `GOBID_STORE_PASSWORD`
- `GOBID_KEY_ALIAS`
- `GOBID_KEY_PASSWORD`

## Building release AAB

```bash
cd gobid_aplicatii/android
./gradlew clean bundleRelease
```

Output: `app/build/outputs/bundle/release/app-release.aab` (signed and ready for Play Console).

## If keystore was committed

To remove it from version control:

```bash
git rm --cached gobid_aplicatii/android/gobid-release.keystore
```

Then add `*.keystore` to `.gitignore` (already done) and commit the removal.
