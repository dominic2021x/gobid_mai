/**
 * RAG Knowledge Base pentru Evaluatorul Imobiliar
 * Recuperează cunoștințe despre zone, prețuri istorice, ghiduri imobiliare din Pinecone
 */

import { generateEmbedding } from '@/utils/embeddings';
import { queryVectors } from '@/lib/pinecone';
import { retrieveContext } from '@/lib/ai/rag-pinecone';

export interface RealEstateKnowledge {
  zoneInfo?: {
    zona: string;
    oras: string;
    tip: 'premium' | 'mediu' | 'accesibil';
    pret_mp_mediu?: number;
    caracteristici?: string[];
  };
  normativeInfo?: {
    tip: string;
    reguli?: string[];
    diferente?: string[];
  };
  priceHistory?: {
    zona: string;
    pret_mp_mediu_istoric?: number;
    evolutie?: string;
  };
  filteringRules?: string[];
}

/**
 * Recuperează cunoștințe imobiliare relevante din RAG
 */
export async function retrieveRealEstateKnowledge(
  query: string,
  extractedCriteria?: {
    tip?: string;
    oras?: string;
    zona?: string;
  }
): Promise<RealEstateKnowledge> {
  try {
    // Construiește query pentru RAG
    const ragQuery = buildRAGQuery(query, extractedCriteria);
    
    // Caută în Pinecone
    const queryEmbedding = await generateEmbedding(ragQuery);
    const matches = await queryVectors(
      queryEmbedding,
      10,
      {
        type: { $eq: 'real_estate_knowledge' },
        ...(extractedCriteria?.oras && { oras: { $eq: extractedCriteria.oras } }),
        ...(extractedCriteria?.zona && { zona: { $eq: extractedCriteria.zona } }),
      }
    );

    // Procesează rezultatele
    const knowledge: RealEstateKnowledge = {};

    for (const match of matches) {
      const metadata = match.metadata || {};
      
      if (metadata.type === 'zone_info') {
        knowledge.zoneInfo = {
          zona: metadata.zona || '',
          oras: metadata.oras || '',
          tip: metadata.tip || 'mediu',
          pret_mp_mediu: metadata.pret_mp_mediu,
          caracteristici: metadata.caracteristici || [],
        };
      } else if (metadata.type === 'normative') {
        knowledge.normativeInfo = {
          tip: metadata.tip || '',
          reguli: metadata.reguli || [],
          diferente: metadata.diferente || [],
        };
      } else if (metadata.type === 'price_history') {
        knowledge.priceHistory = {
          zona: metadata.zona || '',
          pret_mp_mediu_istoric: metadata.pret_mp_mediu_istoric,
          evolutie: metadata.evolutie,
        };
      } else if (metadata.type === 'filtering_rules') {
        knowledge.filteringRules = metadata.rules || [];
      }
    }

    // Fallback: caută în Supabase dacă Pinecone nu returnează rezultate
    if (Object.keys(knowledge).length === 0) {
      try {
        const context = await retrieveContext(ragQuery, {
          category: 'real_estate',
        }, 5);
        
        if (context.length > 0) {
          // Procesează contextul din Supabase
          const contextText = context.map(c => c.text).join('\n');
          
          // Extrage informații despre zonă
          if (extractedCriteria?.zona && contextText.toLowerCase().includes(extractedCriteria.zona.toLowerCase())) {
            knowledge.zoneInfo = {
              zona: extractedCriteria.zona,
              oras: extractedCriteria.oras || '',
              tip: 'mediu',
            };
          }
        }
      } catch (error) {
        console.warn('[RAG Knowledge] Fallback to Supabase failed:', error);
      }
    }

    return knowledge;
  } catch (error) {
    console.error('[RAG Knowledge] Error retrieving knowledge:', error);
    return {};
  }
}

/**
 * Construiește query optimizat pentru RAG
 */
function buildRAGQuery(
  originalQuery: string,
  extractedCriteria?: {
    tip?: string;
    oras?: string;
    zona?: string;
  }
): string {
  const parts: string[] = [originalQuery];
  
  if (extractedCriteria?.tip) {
    parts.push(`tip proprietate ${extractedCriteria.tip}`);
  }
  
  if (extractedCriteria?.oras) {
    parts.push(`oraș ${extractedCriteria.oras}`);
  }
  
  if (extractedCriteria?.zona) {
    parts.push(`zonă ${extractedCriteria.zona} cartier`);
  }
  
  parts.push('prețuri imobiliare România ghid evaluare');
  
  return parts.join(' ');
}

/**
 * Formatează cunoștințele pentru prompt AI
 */
export function formatKnowledgeForPrompt(knowledge: RealEstateKnowledge): string {
  const parts: string[] = [];
  
  if (knowledge.zoneInfo) {
    parts.push(`Zonă: ${knowledge.zoneInfo.zona}, ${knowledge.zoneInfo.oras}`);
    parts.push(`Tip zonă: ${knowledge.zoneInfo.tip}`);
    if (knowledge.zoneInfo.pret_mp_mediu) {
      parts.push(`Preț/mp mediu: ${knowledge.zoneInfo.pret_mp_mediu} EUR`);
    }
    if (knowledge.zoneInfo.caracteristici && knowledge.zoneInfo.caracteristici.length > 0) {
      parts.push(`Caracteristici: ${knowledge.zoneInfo.caracteristici.join(', ')}`);
    }
  }
  
  if (knowledge.normativeInfo) {
    parts.push(`Reguli pentru ${knowledge.normativeInfo.tip}:`);
    if (knowledge.normativeInfo.reguli && knowledge.normativeInfo.reguli.length > 0) {
      parts.push(knowledge.normativeInfo.reguli.join('; '));
    }
  }
  
  if (knowledge.priceHistory) {
    parts.push(`Istoric prețuri ${knowledge.priceHistory.zona}:`);
    if (knowledge.priceHistory.pret_mp_mediu_istoric) {
      parts.push(`Preț/mp mediu istoric: ${knowledge.priceHistory.pret_mp_mediu_istoric} EUR`);
    }
    if (knowledge.priceHistory.evolutie) {
      parts.push(`Evoluție: ${knowledge.priceHistory.evolutie}`);
    }
  }
  
  if (knowledge.filteringRules && knowledge.filteringRules.length > 0) {
    parts.push(`Reguli filtrare: ${knowledge.filteringRules.join('; ')}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : '';
}

