package ro.gobid.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Exemplu MainActivity cu butonul „Înapoi” care face navigare în site (WebView.goBack())
 * în loc să închidă aplicația.
 *
 * Copiază conținutul în: android/app/src/main/java/ro/gobid/app/MainActivity.java
 * sau adaugă doar metoda onBackPressed() în MainActivity ta existentă.
 */
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
