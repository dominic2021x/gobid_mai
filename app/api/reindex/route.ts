/**
 * API Route - Reindexare Produse/Pagini în Pinecone
 * POST /api/reindex
 * Indexează produse și pagini în Pinecone pentru RAG
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/utils/embeddings';
import { ensureIndex } from '@/lib/pinecone';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


interface IndexItem {
  id: string;
  title: string;
  description: string;
  url: string;
  category?: string;
  price?: number;
  type: 'product' | 'page';
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { items, clearExisting = false } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      );
    }

    // Obține index-ul Pinecone (creează-l dacă nu există)
    const index = await ensureIndex(3072); // 3072 = dimensiune pentru text-embedding-3-large

    // Șterge date existente dacă este solicitat
    if (clearExisting) {
      try {
        await index.deleteAll();
        console.log('✅ Cleared existing vectors from Pinecone');
      } catch (error) {
        console.warn('Warning: Could not clear existing vectors:', error);
        // Fallback: încercă să șteargă cu namespace
        try {
          await index.deleteAll({ namespace: 'default' });
        } catch (e) {
          console.warn('Could not clear with namespace:', e);
        }
      }
    }

    const results = [];
    const errors = [];

    // Procesează în batch-uri de 100
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Generează embeddings pentru batch
      const embeddings = await Promise.all(
        batch.map(async (item: IndexItem) => {
          // Creează text pentru embedding (combine title + description + category)
          const textToEmbed = [
            item.title,
            item.description || '',
            item.category ? `Categorie: ${item.category}` : '',
            item.price ? `Preț: ${item.price}` : ''
          ].filter(Boolean).join('. ');

          const embedding = await generateEmbedding(textToEmbed);
          return {
            id: item.id,
            values: embedding,
            metadata: {
              title: item.title,
              description: item.description || '',
              url: item.url,
              category: item.category || '',
              price: item.price || null,
              type: item.type || 'product'
            }
          };
        })
      );

      // Upload batch la Pinecone
      try {
        await index.upsert(embeddings);
        results.push(...batch.map(item => ({ id: item.id, status: 'success' })));
        console.log(`✅ Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${embeddings.length} items)`);
      } catch (error: any) {
        console.error('Error uploading batch to Pinecone:', error);
        errors.push(...batch.map(item => ({ id: item.id, error: error.message })));
      }
    }

    return NextResponse.json({
      success: true,
      indexed: results.length,
      errorsCount: errors.length,
      total: items.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/reindex:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reindex items' },
      { status: 500 }
    );
  }
}

