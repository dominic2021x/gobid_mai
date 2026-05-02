/**
 * Script pentru indexare pagini statice în Qdrant
 * Rulează: npm run ai:index:pages
 * 
 * Citește paginile statice (FAQ, Termeni, Ghid) și le indexează în colecția "pagini"
 */

import { indexPages } from '../lib/ai/indexing-service';
import { checkQdrantConnection, ensureCollection } from '../lib/ai/qdrant';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Starting pages indexing...\n');

  // Verifică conexiunea Qdrant
  const isConnected = await checkQdrantConnection();
  if (!isConnected) {
    console.log('⚠️  Qdrant is not connected.');
    console.log('   Pentru a porni Qdrant:');
    console.log('   docker run -d --name qdrant -p 6333:6333 qdrant/qdrant\n');
    process.exit(1);
  }

  console.log('✅ Qdrant connected\n');
  
  // Creează colecția "pagini" dacă nu există
  await ensureCollection('pagini', 384);
  console.log('✅ Collection "pagini" ready\n');

  try {
    // Încarcă pagini din fișier JSON (dacă există) sau folosește default
    let pages: Array<{ id: string; title: string; content: string; url: string }> = [];

    // Încearcă să încarce din fișier JSON
    const pagesFile = path.join(process.cwd(), 'data', 'pages.json');
    if (fs.existsSync(pagesFile)) {
      console.log('📄 Loading pages from pages.json...');
      const fileContent = fs.readFileSync(pagesFile, 'utf-8');
      pages = JSON.parse(fileContent);
      console.log(`✅ Loaded ${pages.length} pages from file\n`);
    } else {
      console.log('📝 No pages.json found. Using default pages.\n');
      console.log('💡 Tip: Creează un fișier data/pages.json cu structura:');
      console.log(`   [
        {
          "id": "faq",
          "title": "FAQ",
          "content": "Conținut FAQ...",
          "url": "/faq"
        }
      ]\n`);
    }

    // Indexează paginile
    await indexPages(pages.length > 0 ? pages : undefined);
    console.log(`\n🎉 Pages indexed successfully!`);

    console.log('\n💡 Paginile sunt acum indexate în colecția "pagini" din Qdrant.');
    console.log('   Poți căuta pagini prin API-ul /api/chat\n');
  } catch (error: any) {
    console.error('❌ Error during indexing:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);

















