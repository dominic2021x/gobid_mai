/**
 * Qdrant Client - Vector Database
 * Gestionează conexiunea și operațiile cu Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest';

// Configurare Qdrant (poate rula local sau remote)
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

let qdrantClient: QdrantClient | null = null;

/**
 * Obține clientul Qdrant (singleton)
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
    });
  }
  return qdrantClient;
}

/**
 * Verifică dacă Qdrant este disponibil
 */
export async function checkQdrantConnection(): Promise<boolean> {
  // Verifică dacă rulează în modul fără Qdrant (fallback)
  if (process.env.QDRANT_DISABLED === 'true') {
    return false;
  }
  
  try {
    const client = getQdrantClient();
    await client.getCollections();
    return true;
  } catch (error) {
    console.warn('Qdrant connection error (continuing without vector search):', error);
    return false;
  }
}

/**
 * Creează sau verifică existența unei colecții
 * Optimizat pentru HNSW index pentru căutare rapidă
 */
export async function ensureCollection(collectionName: string, vectorSize: number = 384) {
  const client = getQdrantClient();
  
  try {
    // Verifică dacă colecția există
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);

    if (!exists) {
      // Creează colecția nouă cu HNSW optimizare
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize, // all-MiniLM-L6-v2 are 384 dimensiuni
          distance: 'Cosine',
        },
        // HNSW index pentru căutare rapidă
        optimizers_config: {
          default_segment_number: 2,
        },
        hnsw_config: {
          m: 16,           // Număr conexiuni - mai mare = mai precis, mai lent
          ef_construct: 100, // Număr vecini - mai mare = mai precis, mai lent
        },
        // Payload index pentru filtrare rapidă
        on_disk_payload: true,
      });
      console.log(`Collection "${collectionName}" created with HNSW optimization`);
    } else {
      // Verifică configurația și o optimizează dacă e necesar
      const collectionInfo = await client.getCollection(collectionName);
      if (!collectionInfo.config?.hnsw_config) {
        console.log(`Updating collection "${collectionName}" with HNSW config...`);
        // Notă: Qdrant nu permite modificarea HNSW config după creare
        // Colecțiile existente vor folosi default config
      }
    }
  } catch (error: any) {
    if (error.status === 409) {
      // Colecția deja există
      console.log(`Collection "${collectionName}" already exists`);
    } else {
      console.error(`Error creating collection "${collectionName}":`, error);
      throw error;
    }
  }
}

/**
 * Salvează un vector în Qdrant
 */
export async function upsertVector(
  collectionName: string,
  id: string | number,
  vector: number[],
  payload: Record<string, any>
) {
  const client = getQdrantClient();
  
  await client.upsert(collectionName, {
    wait: true,
    points: [
      {
        id,
        vector,
        payload,
      },
    ],
  });
}

/**
 * Salvează mai multe vectori (batch)
 */
export async function upsertVectors(
  collectionName: string,
  points: Array<{ id: string | number; vector: number[]; payload: Record<string, any> }>
) {
  const client = getQdrantClient();
  
  await client.upsert(collectionName, {
    wait: true,
    points,
  });
}

/**
 * Caută vectori similari cu optimizare HNSW
 */
export async function searchVectors(
  collectionName: string,
  queryVector: number[],
  limit: number = 5,
  filter?: Record<string, any>,
  options?: {
    scoreThreshold?: number;
    ef?: number; // HNSW ef parameter pentru precizie/viteză tradeoff
  }
) {
  // Verifică dacă Qdrant este disponibil
  const isConnected = await checkQdrantConnection();
  if (!isConnected) {
    // Returnează rezultate goale dacă Qdrant nu e disponibil
    console.warn('Qdrant not available, returning empty search results');
    return [];
  }
  
  try {
    const client = getQdrantClient();
    
    // Configurație HNSW pentru căutare rapidă
    // ef mai mare = mai precis, mai lent (default 100)
    // ef mai mic = mai rapid, mai puțin precis (recomandat 16-64 pentru search rapid)
    const ef = options?.ef || 64; // Balance între viteză și precizie
    
    const result = await client.search(collectionName, {
      vector: queryVector,
      limit,
      filter,
      with_payload: true,
      params: {
        hnsw_ef: ef, // HNSW ef pentru acest query (override global config)
      },
      score_threshold: options?.scoreThreshold,
    });
    
    return result;
  } catch (error) {
    console.error('Error searching vectors:', error);
    return [];
  }
}

/**
 * Șterge un vector
 */
export async function deleteVector(collectionName: string, id: string | number) {
  const client = getQdrantClient();
  
  await client.delete(collectionName, {
    wait: true,
    points: [id],
  });
}

/**
 * Șterge toate vectorii dintr-o colecție
 */
export async function deleteCollection(collectionName: string) {
  const client = getQdrantClient();
  
  await client.deleteCollection(collectionName);
}

