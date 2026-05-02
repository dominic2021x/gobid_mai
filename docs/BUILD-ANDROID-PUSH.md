# Build Android cu notificări push

Pași pentru un build nou al aplicației gobid.ro (Android) cu notificări push funcționale.

## 1. Verifică Firebase

- În [Firebase Console](https://console.firebase.google.com/) proiectul trebuie să aibă o aplicație Android cu **package name**: `ro.gobid.app`.
- Descarcă **google-services.json** și pune-l în:
  ```
  gobid_aplicatii/android/app/google-services.json
  ```
- Dacă aplicația Android nu există în Firebase: Add app → Android → Package name `ro.gobid.app` → descarcă google-services.json.

## 2. Sync Capacitor (din rădăcina proiectului)

**O singură sursă de adevăr pentru config:** `capacitor.config.ts` din **rădăcina** proiectului. Config-ul din `gobid_aplicatii/capacitor.config.ts` este generat automat din root când rulezi `cap:sync`.

Din folderul principal al proiectului (unde e `package.json` și `capacitor.config.ts`):

```bash
npm run cap:sync
# sau doar Android:
npx cap sync android
```

Asta copiază config-ul din root în `gobid_aplicatii/capacitor.config.ts`, apoi plugin-uri și config în `gobid_aplicatii/android`. Pentru notificări push și detectare „app nativă”, config-ul trebuie să aibă `server.hostname: "gobid.ro"` și `server.androidScheme: "https"` (deja setate la root).

## 3. Build APK în Android Studio

1. Deschide Android Studio.
2. **File → Open** și alege folderul:
   ```
   gobid_aplicatii/android
   ```
3. **Build → Clean Project**, apoi **Build → Rebuild Project**.
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)** (sau **Generate Signed Bundle / APK** pentru release).
5. APK-ul se generează în `gobid_aplicatii/android/app/build/outputs/apk/`.

## 4. Instalare pe telefon

- Instalează noul APK pe dispozitiv (dezactivează „Instalare din surse necunoscute” dacă e nevoie, sau folosește un cablu USB și **Run** din Android Studio).
- Deschide aplicația, loghează-te, mergi la **Setări → Notificări**.
- Acordă permisiunea de notificări dacă ți se cere.
- Apasă **Reînregistrează dispozitivul**, apoi **Trimite notificare test**.

## 5. Diagnostic în Setări

În Setări, sub mesajul despre notificări, apare o linie **Diagnostic**:  
`platformă = android`, `token salvat = da/nu`.

- **platformă = web** → aplicația nu rulează ca app nativă (e browser/WebView fără Capacitor).
- **platformă = android** și **token salvat = nu** → build-ul e nativ, dar FCM nu dă token (verifică google-services.json și Firebase).
- **token salvat = da** → tokenul există; dacă tot nu primești notificarea, verifică pe server variabilele `FIREBASE_SERVICE_ACCOUNT_JSON` sau `FCM_SERVER_KEY`.

## Notă

Aplicația încarcă conținutul de la `https://www.gobid.ro` (setat în `capacitor.config.ts`). Un „build nou” înseamnă în principal **rebuild al părții native Android** (cu google-services.json și plugin Push Notifications), nu neapărat redeploy al site-ului.
