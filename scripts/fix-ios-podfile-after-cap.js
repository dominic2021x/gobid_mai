/**
 * `ios` at repo root is a symlink → gobid_aplicatii/ios. CocoaPods resolves the real
 * Podfile path to .../gobid_aplicatii/ios/App, so Capacitor's ../../node_modules points
 * at gobid_aplicatii/node_modules (incomplete) instead of repo-root node_modules.
 *
 * After `cap sync`, rewrite pod paths to ../../../node_modules/...
 */
const fs = require('fs');
const path = require('path');

const podfilePath = path.join(__dirname, '..', 'gobid_aplicatii', 'ios', 'App', 'Podfile');

if (!fs.existsSync(podfilePath)) {
  console.warn('[fix-ios-podfile] Skip: Podfile not found at', podfilePath);
  process.exit(0);
}

let s = fs.readFileSync(podfilePath, 'utf8');
const before = s;
s = s.replace(/:path => '\.\.\/\.\.\/node_modules\//g, ":path => '../../../node_modules/");
s = s.replace(
  /require_relative '\.\.\/\.\.\/node_modules\/@capacitor\/ios\/scripts\/pods_helpers'/,
  "require_relative '../../../node_modules/@capacitor/ios/scripts/pods_helpers'"
);

if (s !== before) {
  fs.writeFileSync(podfilePath, s, 'utf8');
  console.log('[fix-ios-podfile] Patched Podfile paths for repo-root node_modules (symlinked ios/).');
} else {
  console.log('[fix-ios-podfile] Podfile already OK (no ../../node_modules pod paths).');
}
