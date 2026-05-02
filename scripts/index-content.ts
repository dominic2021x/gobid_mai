/**
 * Script pentru indexare inițială a conținutului
 * Rulează: npm run ai:index
 */

import { indexProducts, indexPages } from '../lib/ai/indexing-service';
import { checkQdrantConnection, ensureCollection } from '../lib/ai/qdrant';

async function main() {
  console.log('🚀 Starting content indexing...\n');

  // Verifică conexiunea Qdrant (opțional - funcționează și fără)
  const isConnected = await checkQdrantConnection();
  if (!isConnected) {
    console.log('⚠️  Qdrant is not connected.');
    console.log('   Sistemul va funcționa în mod simplificat (fără vector search).');
    console.log('   Pentru funcționalitate completă:');
    console.log('   1. Instalează Docker');
    console.log('   2. Rulează: docker run -p 6333:6333 qdrant/qdrant');
    console.log('   3. Sau: npm run ai:setup\n');
  } else {
    console.log('✅ Qdrant connected\n');
    // Creează colecția dacă nu există
    await ensureCollection('content', 384);
  }

  try {
    // Indexează produse (dacă sunt disponibile)
    console.log('📦 Indexing products...');
    try {
      await indexProducts();
      console.log('✅ Products indexed\n');
    } catch (error: any) {
      console.log('⚠️  No products found to index:', error.message);
      console.log('   (Normal dacă nu ai produse în localStorage)\n');
    }

    // Indexează pagini statice
    console.log('📄 Indexing static pages...');
    await indexPages();
    console.log('✅ Pages indexed\n');

    console.log('🎉 Indexing completed!\n');
    console.log('💡 Sistemul AI este acum gata de folosit!');
    console.log('   - Chat AI: Integrat în tichete');
    console.log('   - Căutare semantică: /api/search/semantic');
    console.log('   - Documentație: README-AI.md\n');
  } catch (error: any) {
    console.error('❌ Error during indexing:', error.message);
    console.log('\n💡 Sistemul va funcționa în mod simplificat fără indexare.');
    process.exit(0); // Nu oprește procesul, doar avertisă
  }
}

main().catch(console.error);
