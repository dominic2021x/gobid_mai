package ro.gobid.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;

public class MainActivity extends BridgeActivity {

  private final ActivityResultLauncher<String> requestPermissionLauncher =
      registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {});

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Defensive explicit registration: in unele build-uri cu remote server.url,
    // auto-register poate rata pluginurile în runtime.
    registerPlugin(PushNotificationsPlugin.class);
    super.onCreate(savedInstanceState);
    createNotificationChannel();
    requestNotificationPermissionIfNeeded();
  }

  private void requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
          != PackageManager.PERMISSION_GRANTED) {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
          requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
        }, 1500);
      }
    }
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        "default",
        "Notificări",
        NotificationManager.IMPORTANCE_HIGH
      );
      channel.setDescription("Notificări push de la gobid.ro");
      channel.enableVibration(true);
      channel.setShowBadge(true);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
      }
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (manager != null) {
        manager.createNotificationChannel(channel);
      }
    }
  }

  @Override
  public void onBackPressed() {
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
