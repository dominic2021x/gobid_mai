#!/usr/bin/env node

/**
 * Script helper pentru a verifica configurarea Google OAuth în Supabase
 * Rulează: node scripts/check-google-setup.js
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function checkSetup() {
  console.log('\n🔍 Verificare Configurare Google OAuth în Supabase\n');
  console.log('='.repeat(60));

  // Verifică variabilele de mediu
  console.log('\n📋 1. Verificare Variabile de Mediu:');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl) {
    console.log('✅ NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
    
    // Extrage project reference
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (match) {
      const projectRef = match[1];
      console.log('✅ Project Reference:', projectRef);
      console.log('📍 Redirect URI pentru Google Console:');
      console.log(`   https://${projectRef}.supabase.co/auth/v1/callback`);
    }
  } else {
    console.log('❌ NEXT_PUBLIC_SUPABASE_URL nu este setat');
  }

  if (supabaseKey) {
    console.log('✅ NEXT_PUBLIC_SUPABASE_ANON_KEY: Setat');
  } else {
    console.log('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY nu este setat');
  }

  // Checklist interactiv
  console.log('\n📋 2. Checklist Configurare:');
  console.log('\nTe rog răspunde la următoarele întrebări:\n');

  const checks = [
    {
      question: 'Ai creat OAuth Client ID în Google Cloud Console? (y/n): ',
      name: 'googleClientCreated'
    },
    {
      question: 'Ai adăugat redirect URI-ul Supabase în Google Console? (y/n): ',
      name: 'redirectUriAdded'
    },
    {
      question: 'Ai activat provider-ul Google în Supabase Dashboard? (y/n): ',
      name: 'providerEnabled'
    },
    {
      question: 'Ai adăugat Client ID în Supabase? (y/n): ',
      name: 'clientIdAdded'
    },
    {
      question: 'Ai adăugat Client Secret în Supabase? (y/n): ',
      name: 'clientSecretAdded'
    }
  ];

  const results = {};
  for (const check of checks) {
    const answer = await question(check.question);
    results[check.name] = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  // Rezumat
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Rezumat:\n');

  let allGood = true;
  for (const check of checks) {
    const status = results[check.name] ? '✅' : '❌';
    const name = check.name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`${status} ${name}`);
    if (!results[check.name]) {
      allGood = false;
    }
  }

  if (allGood) {
    console.log('\n🎉 Toate verificările sunt OK! Ar trebui să funcționeze.');
    console.log('\n💡 Dacă tot primești erori:');
    console.log('   1. Verifică că ai salvat configurația în Supabase');
    console.log('   2. Verifică că redirect URI-urile sunt EXACT identice');
    console.log('   3. Așteaptă 1-2 minute după salvare (propagare)');
  } else {
    console.log('\n⚠️  Unele verificări au eșuat. Te rog urmează ghidul din SETUP_GOOGLE_SUPABASE.md');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📖 Pentru ghid complet, vezi: SETUP_GOOGLE_SUPABASE.md\n');

  rl.close();
}

checkSetup().catch(console.error);






