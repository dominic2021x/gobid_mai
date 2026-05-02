# Butonul „Înapoi” pe Android – merge înapoi în site, nu ieșire din app

## Problema

La apăsarea butonului fizic „Înapoi” pe Android, aplicația se închide în loc să facă navigare înapoi în site.

## Soluția care funcționează: MainActivity (cod nativ)

Trebuie modificat **codul nativ Android** ca să interceptezi back-ul și să apelezi **WebView.goBack()** când există istoric. Asta nu depinde de JavaScript și funcționează sigur.

### Pași

1. **Deschide proiectul Android** (folderul `android/` – se creează cu `npx cap add android` dacă nu există).

2. **Găsește MainActivity** – de obicei:
   - `android/app/src/main/java/ro/gobid/app/MainActivity.java`  
   sau
   - `android/app/src/main/java/ro/gobid/app/MainActivity.kt`

3. **Adaugă override pentru butonul Înapoi.**

---

### Dacă ai MainActivity.java

Asigură-te că clasa extinde `BridgeActivity` și adaugă această metodă:

```java
import android.webkit.WebView;

// ... în clasa MainActivity, adaugă:

@Override
public void onBackPressed() {
    Bridge bridge = getBridge();
    if (bridge != null) {
        WebView webView = bridge.getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
    }
    super.onBackPressed();
}
```

**Exemplu complet** (dacă MainActivity e aproape goală):

```java
package ro.gobid.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onBackPressed() {
        Bridge bridge = getBridge();
        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
        }
        super.onBackPressed();
    }
}
```

---

### Dacă ai MainActivity.kt (Kotlin)

```kotlin
import android.webkit.WebView

// ... în clasa MainActivity, adaugă:

override fun onBackPressed() {
    bridge?.webView?.let { webView ->
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }
    }
    super.onBackPressed()
}
```

(Sau folosește `getBridge()` dacă în Kotlin ai acces la el ca în Java.)

---

4. **Build APK nou** în Android Studio (Build → Build Bundle(s) / APK(s) → Build APK(s)) sau din CLI:
   ```bash
   cd android && ./gradlew assembleRelease
   ```

5. **Instalează noul APK** pe telefon și testează: back ar trebui să meargă înapoi în site; pe prima pagină (fără istoric) back închide app-ul.

---

## De ce nu e de ajuns doar JavaScript

- `BackButtonHandler.tsx` și `disableBackButtonHandler` din config ajută doar dacă **Android trimite** evenimentul de back către WebView.
- Pe multe versiuni de Capacitor, **Activity-ul închide aplicația** la back înainte să mai ajungă evenimentul la JS.
- Override-ul în **MainActivity** controlează direct: „dacă WebView poate merge înapoi, mergi înapoi; altfel închide app-ul”.

## Dacă nu ai folderul `android/` în acest repo

Rulează în proiectul tău (acolo unde e `capacitor.config.ts`):

```bash
npx cap add android
```

Apoi deschide `android/` în Android Studio și aplică modificările de mai sus în `MainActivity`.
