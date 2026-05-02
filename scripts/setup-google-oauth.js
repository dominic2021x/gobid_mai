#!/usr/bin/env node

/**
 * Script pentru configurarea automată a Google OAuth în Supabase
 * 
 * Utilizare:
 * 1. Adaugă în .env.local:
 *    SUPABASE_ACCESS_TOKEN=your_access_token (din Supabase Dashboard → Account → Access Tokens)
 *    GOOGLE_CLIENT_ID=your_google_client_id
 *    GOOGLE_CLIENT_SECRET=your_google_client_secret
 * 
 * 2. Rulează: node scripts/setup-google-oauth.js
 */

require('dotenv').config({ path: '.env.local' });

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN nu este setat în .env.local');
  console.log('\n📝 Cum să obții Access Token:');
  console.log('1. Mergi la https://app.supabase.com/');
  console.log('2. Click pe Account (iconița de profil din colțul dreapta sus)');
  console.log('3. Mergi la "Access Tokens"');
  console.log('4. Click "Generate new token"');
  console.log('5. Copiază token-ul și adaugă-l în .env.local ca SUPABASE_ACCESS_TOKEN=...\n');
  process.exit(1);
}

if (!SUPABASE_PROJECT_REF) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL nu este setat sau nu este valid');
  console.log('Te rog adaugă NEXT_PUBLIC_SUPABASE_URL în .env.local\n');
  process.exit(1);
}

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('❌ GOOGLE_CLIENT_ID sau GOOGLE_CLIENT_SECRET nu sunt setate');
  console.log('\n📝 Cum să obții Google Credentials:');
  console.log('1. Mergi la https://console.cloud.google.com/');
  console.log('2. APIs & Services → Credentials');
  console.log('3. Create Credentials → OAuth client ID');
  console.log('4. Copiază Client ID și Client Secret');
  console.log('5. Adaugă-le în .env.local:\n');
  console.log('   GOOGLE_CLIENT_ID=your_client_id');
  console.log('   GOOGLE_CLIENT_SECRET=your_client_secret\n');
  process.exit(1);
}

async function setupGoogleOAuth() {
  console.log('\n🚀 Configurare Google OAuth în Supabase\n');
  console.log('='.repeat(60));
  console.log(`📋 Project Reference: ${SUPABASE_PROJECT_REF}`);
  console.log(`📋 Google Client ID: ${GOOGLE_CLIENT_ID.substring(0, 20)}...`);
  console.log('='.repeat(60) + '\n');

  try {
    // Folosim Supabase Management API
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          EXTERNAL_GOOGLE_ENABLED: true,
          EXTERNAL_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID,
          EXTERNAL_GOOGLE_SECRET: GOOGLE_CLIENT_SECRET,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Eroare la configurare:', response.status, errorText);
      
      if (response.status === 401) {
        console.log('\n💡 Token-ul de acces este invalid sau expirat.');
        console.log('   Te rog generează unul nou din Supabase Dashboard → Account → Access Tokens\n');
      } else if (response.status === 404) {
        console.log('\n💡 Project Reference-ul nu este corect.');
        console.log(`   Verifică că NEXT_PUBLIC_SUPABASE_URL este corect: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);
      }
      
      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ Google OAuth configurat cu succes!\n');
    console.log('📝 Următorii pași:');
    console.log('1. Verifică în Supabase Dashboard → Authentication → Providers → Google');
    console.log('2. Asigură-te că toggle-ul este ACTIVAT');
    console.log('3. Testează autentificarea în aplicație\n');

  } catch (error) {
    console.error('❌ Eroare:', error.message);
    console.log('\n💡 Alternativă manuală:');
    console.log('1. Mergi la https://app.supabase.com/');
    console.log('2. Selectează proiectul tău');
    console.log('3. Authentication → Providers → Google');
    console.log('4. Activează provider-ul');
    console.log('5. Adaugă Client ID și Client Secret');
    console.log('6. Salvează\n');
    process.exit(1);
  }
}

setupGoogleOAuth();






