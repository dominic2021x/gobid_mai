#!/usr/bin/env npx tsx
/**
 * Generează APPLE_SECRET (JWT) pentru NextAuth – Sign in with Apple.
 * Rulează: npx tsx scripts/generate-apple-client-secret.ts
 * Sau cu env încărcat: node --env-file=.env.local -e "require('./lib/apple-auth.ts')" (nu e ideal)
 *
 * Setează în .env.local: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_ID, APPLE_PRIVATE_KEY
 * APPLE_PRIVATE_KEY = conținutul fișierului .p8 (poți pune \\n pentru newline sau newline real).
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateAppleClientSecretFromEnv } from '../lib/apple-auth';

function loadEnvLocal() {
  const root = path.resolve(__dirname, '..');
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const secret = await generateAppleClientSecretFromEnv();
  if (!secret) {
    console.error('Lipsesc variabile. Setează în .env.local:');
    console.error('  APPLE_TEAM_ID=...');
    console.error('  APPLE_KEY_ID=...   (ex: 6JV63MQ8PU)');
    console.error('  APPLE_ID=...       (Services ID)');
    console.error('  APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"');
    process.exit(1);
  }

  console.log('Copiază valoarea de mai jos în .env.local ca APPLE_SECRET=\n');
  console.log(secret);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
