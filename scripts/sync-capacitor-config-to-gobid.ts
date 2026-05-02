/**
 * Syncs root capacitor.config.ts into gobid_aplicatii (strips android/ios path for local build).
 * Single source of truth: ./capacitor.config.ts (repo root).
 * Run: npm run cap:sync-config or npm run cap:sync
 */
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const root = path.resolve(__dirname, '..');
  const gobidDir = path.join(root, 'gobid_aplicatii');
  const outPath = path.join(gobidDir, 'capacitor.config.ts');

  // Load root config (CapacitorConfig type; we need to strip path for gobid_aplicatii)
  const configModule = await import('../capacitor.config');
  const config = configModule.default as Record<string, unknown>;

  const configForGobid = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  if (configForGobid.android && typeof configForGobid.android === 'object' && 'path' in configForGobid.android) {
    delete (configForGobid.android as Record<string, unknown>).path;
  }
  if (configForGobid.ios && typeof configForGobid.ios === 'object' && 'path' in configForGobid.ios) {
    delete (configForGobid.ios as Record<string, unknown>).path;
  }

  const tsContent = `/**
 * Generated from repo root capacitor.config.ts. Do not edit.
 * Run: npm run cap:sync-config
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = ${JSON.stringify(configForGobid, null, 2)};

export default config;
`;

  fs.mkdirSync(gobidDir, { recursive: true });
  fs.writeFileSync(outPath, tsContent, 'utf8');
  console.log('[sync-capacitor-config] Updated gobid_aplicatii/capacitor.config.ts from root.');
}

main().catch((err) => {
  console.warn('[sync-capacitor-config] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
