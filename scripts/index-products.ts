/**
 * Script pentru indexare produse în Qdrant
 * Rulează: npm run ai:index:products
 * 
 * Citește produsele din localStorage sau dintr-un fișier JSON
 * Creează embeddings și salvează în colecția "produse"
 */

import { indexProducts } from '../lib/ai/indexing-service';
import { checkQdrantConnection, ensureCollection } from '../lib/ai/qdrant';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Starting products indexing...\n');

  // Verifică conexiunea Qdrant
  const isConnected = await checkQdrantConnection();
  if (!isConnected) {
    console.log('⚠️  Qdrant is not connected.');
    console.log('   Pentru a porni Qdrant:');
    console.log('   docker run -d --name qdrant -p 6333:6333 qdrant/qdrant\n');
    process.exit(1);
  }

  console.log('✅ Qdrant connected\n');
  
  // Creează colecția "produse" dacă nu există
  await ensureCollection('produse', 384);
  console.log('✅ Collection "produse" ready\n');

  try {
    // Încarcă produse din fișier JSON (dacă există) sau din localStorage (în browser)
    let products: any[] = [];

    // Încearcă să încarce din fișier JSON
    const productsFile = path.join(process.cwd(), 'data', 'products.json');
    if (fs.existsSync(productsFile)) {
      console.log('📄 Loading products from products.json...');
      const fileContent = fs.readFileSync(productsFile, 'utf-8');
      products = JSON.parse(fileContent);
      console.log(`✅ Loaded ${products.length} products from file\n`);
    } else {
      // Dacă nu există fișier, încarcă din indexare (ar trebui să fie furnizate)
      console.log('📝 No products.json found. Products should be provided via API or localStorage.\n');
      console.log('💡 Tip: Creează un fișier data/products.json cu structura:');
      console.log(`   [
        {
          "id": "1",
          "title": "Telefon Samsung",
          "description": "Smartphone nou...",
          "category": "Electronice",
          "price": 1500
        }
      ]\n`);
    }

    // Indexează produsele
    if (products.length > 0) {
      await indexProducts(products);
      console.log(`\n🎉 Indexed ${products.length} products successfully!`);
    } else {
      // Încearcă indexarea din localStorage (doar dacă rulează în browser)
      console.log('⚠️  No products provided. Attempting to index from localStorage...');
      await indexProducts();
      console.log('\n✅ Indexing completed (from localStorage or default)');
    }

    console.log('\n💡 Produsele sunt acum indexate în colecția "produse" din Qdrant.');
    console.log('   Poți căuta produse prin API-ul /api/chat sau /api/search/semantic\n');
  } catch (error: any) {
    console.error('❌ Error during indexing:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);

















