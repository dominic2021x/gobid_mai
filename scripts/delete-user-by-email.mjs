/**
 * Șterge un utilizator din Supabase Auth după email.
 * Rulează: node scripts/delete-user-by-email.mjs
 * sau: npx dotenv -e .env.local -- node scripts/delete-user-by-email.mjs
 * 
 * Necesită .env.local cu SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Încarcă .env.local manual dacă există
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const env = readFileSync(envPath, 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}

const EMAIL_TO_DELETE = 'dominic.mihai0502@gmail.com';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Eroare: Setează NEXT_PUBLIC_SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY în .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function deleteUserByEmail(email) {
  const emailNormalized = email.trim().toLowerCase();
  console.log(`Căutare utilizator cu email: ${emailNormalized}`);

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });

  if (listError) {
    console.error('Eroare la listarea utilizatorilor:', listError.message);
    process.exit(1);
  }

  const user = listData.users.find((u) => (u.email || '').toLowerCase() === emailNormalized);
  if (!user) {
    console.log(`Utilizatorul cu email ${emailNormalized} nu a fost găsit.`);
    process.exit(0);
  }

  console.log(`Găsit: ${user.email} (ID: ${user.id})`);
  console.log('Ștergere în curs...');

  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('Eroare la ștergere:', deleteError.message);
    process.exit(1);
  }

  console.log(`✓ Utilizatorul ${emailNormalized} a fost șters cu succes.`);
}

deleteUserByEmail(EMAIL_TO_DELETE);
