/**
 * Generated from repo root capacitor.config.ts. Do not edit.
 * Run: npm run cap:sync-config
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  "appId": "ro.gobid.app",
  "appName": "gobid.ro",
  "webDir": "out",
  "server": {
    "url": "https://www.gobid.ro",
    "hostname": "www.gobid.ro",
    "androidScheme": "https",
    "cleartext": false,
    "allowNavigation": [
      "https://www.gobid.ro",
      "https://www.gobid.ro/*",
      "https://gobid.ro",
      "https://gobid.ro/*",
      "https://secure.mobilpay.ro",
      "https://secure.mobilpay.ro/*",
      "https://sandbox.mobilpay.ro",
      "https://sandbox.mobilpay.ro/*",
      "https://secure.sandbox.netopia-payments.com",
      "https://secure.sandbox.netopia-payments.com/*",
      "https://sandbox.netopia-payments.com",
      "https://sandbox.netopia-payments.com/*",
      "https://accounts.google.com",
      "https://accounts.google.com/*",
      "https://oauth2.googleapis.com",
      "https://oauth2.googleapis.com/*",
      "https://www.googleapis.com",
      "https://www.googleapis.com/*",
      "https://www.facebook.com",
      "https://www.facebook.com/*",
      "https://graph.facebook.com",
      "https://graph.facebook.com/*"
    ]
  },
  "android": {
    "allowMixedContent": false
  },
  "ios": {
    "limitsNavigationsToAppBoundDomains": false,
    "contentInset": "never"
  },
  "plugins": {
    "StatusBar": {
      "overlaysWebView": true
    },
    "Badge": {
      "persist": true,
      "autoClear": false
    },
    "Camera": {
      "presentationStyle": "fullscreen"
    }
  }
};

export default config;
