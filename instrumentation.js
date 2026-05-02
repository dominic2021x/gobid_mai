// Rulează la pornirea procesului Next.js (build și server).
// Pe Vercel, asigură .next/lock pentru a evita ENOENT după "Traced Next.js server files".
// path și fs sunt externals în next.config.js (server) ca să nu dea "Can't resolve 'path'".
export async function register() {
  if (typeof process !== 'undefined' && process.env.VERCEL && process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const path = require('path');
      const fs = require('fs');
      const dir = path.join(process.cwd(), '.next');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'lock'), '', 'utf-8');
    } catch (_) {}
  }
}
