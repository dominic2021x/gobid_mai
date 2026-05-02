/**
 * Pinecone Client - Vector Database Enterprise
 * Performanță superioară pentru căutare semantică
 */

import { Pinecone } from '@pinecone-database/pinecone';

// Configurare Pinecone
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT || 'us-east1-gcp';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'gobid-products';

let pineconeClient: Pinecone | null = null;
let pineconeIndex: any = null;

/**
 * Obține clientul Pinecone (singleton)
 */
export function getPineconeClient(): Pinecone {
  if (!pineconeClient && PINECONE_API_KEY) {
    pineconeClient = new Pinecone({
      apiKey: PINECONE_API_KEY,
    });
  }
  if (!pineconeClient) {
    throw new Error('PINECONE_API_KEY is not configured');
  }
  return pineconeClient;
}

/**
 * Obține index-ul Pinecone
 */
export async function getPineconeIndex() {
  if (!pineconeIndex) {
    const client = getPineconeClient();
    pineconeIndex = client.index(PINECONE_INDEX_NAME);
  }
  return pineconeIndex;
}

/**
 * Verifică dacă Pinecone este disponibil
 */
export async function checkPineconeConnection(): Promise<boolean> {
  if (process.env.PINECONE_DISABLED === 'true') {
    return false;
  }
  
  if (!PINECONE_API_KEY) {
    return false;
  }
  
  try {
    const index = await getPineconeIndex();
    await index.describeIndexStats();
    return true;
  } catch (error) {
    console.warn('Pinecone connection error:', error);
    return false;
  }
}

/**
 * Creează sau verifică existența index-ului
 */
export async function ensureIndex(vectorSize: number = 3072) {
  try {
    const client = getPineconeClient();
    const indexList = await client.listIndexes();
    const indexExists = indexList.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);
    
    if (!indexExists) {
      await client.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension: vectorSize,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: PINECONE_ENVIRONMENT.includes('gcp') ? 'us-east1' : 'us-east-1',
          },
        },
      });
      
      // Așteaptă ca index-ul să fie gata
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return await getPineconeIndex();
  } catch (error) {
    console.error('Error ensuring Pinecone index:', error);
    throw error;
  }
}

/**
 * Adaugă sau actualizează un vector în Pinecone
 */
export async function upsertVector(
  id: string,
  vector: number[],
  metadata: Record<string, any>
) {
  try {
    const index = await getPineconeIndex();
    await index.upsert([{
      id,
      values: vector,
      metadata,
    }]);
    return true;
  } catch (error) {
    console.error('Error upserting vector:', error);
    throw error;
  }
}

/**
 * Caută vectori similari
 */
export async function queryVectors(
  queryVector: number[],
  topK: number = 10,
  filter?: Record<string, any>
) {
  try {
    const index = await getPineconeIndex();
    const queryResponse = await index.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
      ...(filter && { filter }),
    });
    
    return queryResponse.matches || [];
  } catch (error) {
    console.error('Error querying vectors:', error);
    throw error;
  }
}

/**
 * Șterge un vector
 */
export async function deleteVector(id: string) {
  try {
    const index = await getPineconeIndex();
    await index.deleteOne(id);
    return true;
  } catch (error) {
    console.error('Error deleting vector:', error);
    throw error;
  }
}

/**
 * Șterge toți vectorii dintr-un namespace
 */
export async function deleteAllVectors(namespace?: string) {
  try {
    const index = await getPineconeIndex();
    await index.deleteAll({ namespace });
    return true;
  } catch (error) {
    console.error('Error deleting all vectors:', error);
    throw error;
  }
}

