/**
 * Script pentru a verifica avatarele și vocile disponibile de la HeyGen
 * Rulează cu: npx tsx scripts/check-heygen-avatars.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

async function checkHeyGenAvatars() {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    console.error('❌ HEYGEN_API_KEY nu este configurat în .env.local');
    process.exit(1);
  }

  console.log('🔍 Verificare avatare HeyGen...\n');

  try {
    // Get avatars
    const avatarsResponse = await fetch('https://api.heygen.com/v2/avatars', {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!avatarsResponse.ok) {
      const errorText = await avatarsResponse.text();
      console.error('❌ Eroare la obținerea avatarelor:', avatarsResponse.status, errorText);
      return;
    }

    const avatarsData = await avatarsResponse.json();
    console.log('✅ Avatare disponibile:');
    console.log(JSON.stringify(avatarsData, null, 2));

    // Get voices
    const voicesResponse = await fetch('https://api.heygen.com/v2/voices', {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!voicesResponse.ok) {
      const errorText = await voicesResponse.text();
      console.error('❌ Eroare la obținerea vocii:', voicesResponse.status, errorText);
      return;
    }

    const voicesData = await voicesResponse.json();
    console.log('\n✅ Voci disponibile:');
    console.log(JSON.stringify(voicesData, null, 2));

  } catch (error: any) {
    console.error('❌ Eroare:', error.message);
  }
}

checkHeyGenAvatars();


