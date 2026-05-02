import { Pinecone } from '@pinecone-database/pinecone';

let pineconeClient: Pinecone | null = null;

/**
 * Returnează clientul Pinecone inițializat cu cheia API din mediu.
 */
export function getPineconeClient(): Pinecone {
  if (pineconeClient) {
    return pineconeClient;
  }

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('Lipsește variabila de mediu PINECONE_API_KEY.');
  }

  pineconeClient = new Pinecone({ apiKey });
  return pineconeClient;
}

export function getPineconeIndex(indexName = 'products-index') {
  const client = getPineconeClient();
  return client.Index(indexName);
}










