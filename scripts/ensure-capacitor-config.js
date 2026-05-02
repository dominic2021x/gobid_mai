/**
 * Asigură existența capacitor.config.ts la rădăcină (pentru build Vercel).
 * 1) Dacă există deja, nu facem nimic.
 * 2) Dacă există capacitor.config.json, generăm .ts din el (export default {...};).
 * 3) Altfel creăm conținut minim.
 * Scrie în process.cwd() (directorul din care rulează build-ul).
 */
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const dirToTry = cwd || path.resolve(__dirname, '..');
const tsPath = path.join(dirToTry, 'capacitor.config.ts');
const jsonPath = path.join(dirToTry, 'capacitor.config.json');

if (fs.existsSync(tsPath)) {
  return;
}

let content = '';
if (fs.existsSync(jsonPath)) {
  try {
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    content = 'export default ' + JSON.stringify(json) + ';\n';
  } catch (e) {
    console.warn('[ensure-capacitor-config] Could not read json:', e.message);
  }
}

if (!content) {
  content = `export default {
  appId: 'ro.gobid.app',
  appName: 'gobid.ro',
  webDir: 'out',
  server: { url: 'https://www.gobid.ro', hostname: 'www.gobid.ro', cleartext: false, allowNavigation: ['https://www.gobid.ro', 'https://www.gobid.ro/*', 'https://gobid.ro', 'https://gobid.ro/*'] },
  android: { allowMixedContent: false },
  ios: { limitsNavigationsToAppBoundDomains: false, contentInset: 'never' },
  plugins: { StatusBar: { overlaysWebView: true }, Badge: { persist: true, autoClear: false } },
};
`;
}

try {
  fs.writeFileSync(tsPath, content, 'utf8');
  console.log('[ensure-capacitor-config] Created capacitor.config.ts');
} catch (err) {
  console.warn('[ensure-capacitor-config] Could not write (ensure capacitor.config.ts is in repo):', err.message);
}
