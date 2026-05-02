#!/usr/bin/env node
// Pe Vercel, unele pași din next build verifică existența .next/lock.
// Creăm directorul și fișierul la începutul build-ului ca acel check să treacă.
if (process.env.VERCEL) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(process.cwd(), '.next');
  const lock = path.join(dir, 'lock');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(lock, '', 'utf-8');
    console.log('[ensure-next-lock] Created .next/lock for Vercel build');
  } catch (e) {
    console.warn('[ensure-next-lock] Could not create .next/lock:', e.message);
  }
}
