/**
 * Script pentru indexarea produselor în Pinecone
 * Rulează: npm run ai:index sau tsx scripts/index-products-pinecone.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { generateProductEmbedding } from '../utils/embeddings';
import { ensureIndex, upsertVector, checkPineconeConnection } from '../lib/pinecone';

interface Product {
  id: string;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  price?: number;
  image?: string;
  url?: string;
  specifications?: Record<string, any>;
}

async function indexProducts() {
  console.log('🚀 Starting product indexing in Pinecone...\n');

  // Verifică conexiunea Pinecone
  const isConnected = await checkPineconeConnection();
  if (!isConnected) {
    console.error('❌ Pinecone is not connected. Please check your configuration.');
    process.exit(1);
  }

  console.log('✅ Pinecone connected\n');

  // Asigură-te că index-ul există
  console.log('📦 Ensuring index exists...');
  await ensureIndex(3072); // text-embedding-3-large dimension
  console.log('✅ Index ready\n');

  // Încarcă produsele
  console.log('📂 Loading products...');
  const productsPath = join(process.cwd(), 'data', 'products.json');
  let products: Product[] = [];

  try {
    const productsData = readFileSync(productsPath, 'utf-8');
    products = JSON.parse(productsData);
    console.log(`✅ Loaded ${products.length} products\n`);
  } catch (error) {
    console.error('❌ Error loading products:', error);
    process.exit(1);
  }

  // Indexează produsele
  console.log('🔄 Indexing products...\n');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    
    try {
      // Generează embedding
      const embedding = await generateProductEmbedding({
        title: product.title,
        description: product.description,
        category: product.category,
        location: product.location,
        price: product.price,
        specifications: product.specifications,
      });

      // Construiește metadata
      const metadata = {
        id: product.id,
        title: product.title,
        description: product.description || '',
        category: product.category || '',
        location: product.location || '',
        price: product.price || 0,
        image: product.image || '',
        url: product.url || `/products/${product.id}`,
        type: 'product',
        indexedAt: new Date().toISOString(),
      };

      // Adaugă în Pinecone
      await upsertVector(`product_${product.id}`, embedding, metadata);

      successCount++;
      
      if ((i + 1) % 10 === 0) {
        console.log(`  ✅ Indexed ${i + 1}/${products.length} products...`);
      }
    } catch (error: any) {
      console.error(`  ❌ Error indexing product ${product.id}:`, error.message);
      errorCount++;
    }

    // Rate limiting pentru a evita rate limits
    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n✨ Indexing complete!');
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  📊 Total: ${products.length}\n`);
}

// Rulează scriptul
indexProducts().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

