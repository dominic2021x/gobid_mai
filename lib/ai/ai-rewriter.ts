/**
 * AI Text Rewriter - Rescrie texte produse pentru a fi unice, dar păstrând sensul
 * Folosește ChatGPT (OpenAI) cu fallback la Ollama local sau algoritm simplu de parafrazare
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_REWRITE_MODEL = process.env.OPENAI_REWRITE_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2';

interface RewriteInput {
  titlu: string;
  descriere: string;
  specificatii?: string;
}

interface RewriteResult {
  newTitle: string;
  newDescription: string;
  similarityScore: number;
}

/**
 * Calculează similaritate cosine între două texte folosind embeddings
 */
async function calculateSimilarity(text1: string, text2: string): Promise<number> {
  try {
    // Folosește funcția de embeddings existentă
    const { generateEmbedding } = await import('./embeddings');

    // Generează embeddings pentru ambele texte
    const embedding1 = await generateEmbedding(text1);
    const embedding2 = await generateEmbedding(text2);

    // Calculează cosine similarity
    const similarity = cosineSimilarity(embedding1, embedding2);

    return similarity;
  } catch (error) {
    console.warn('Error calculating similarity with embeddings, using simple method:', error);
    // Fallback la similaritate simplă bazată pe cuvinte comune
    return calculateSimpleSimilarity(text1, text2);
  }
}

/**
 * Calculează similaritate cosine între doi vectori
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Similaritate simplă bazată pe cuvinte comune (fallback)
 */
function calculateSimpleSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Încearcă să rescrie textul folosind Ollama
 */
async function rewriteWithOllama(
  titlu: string,
  descriere: string,
  specificatii?: string
): Promise<{ newTitle: string; newDescription: string } | null> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'mistral';

  try {
    const prompt = `Ești un expert în redactare pentru un magazin online. Rescrie următoarele texte într-un mod natural și diferit, dar păstrând același sens și informații importante.

**Titlu original:**
${titlu}

**Descriere originală:**
${descriere}

${specificatii ? `**Specificații:**\n${specificatii}\n` : ''}

**Cerințe:**
1. Rescrie titlul într-un mod natural, potrivit pentru un magazin online
2. Rescrie complet descrierea păstrând toate informațiile importante
3. Folosește sinonime, structuri diferite, formulări naturale
4. Textul trebuie să fie UNIC și diferit de original (similaritate < 0.85)
5. NU traduce, doar rescrie în română
6. Păstrează toate detaliile importante (număr camere, prețuri, specificații)
7. LOCAȚIE: Nu fi extrem de precis. Este suficient orașul sau zona/cartierul; evită adrese exacte sau puncte de reper foarte specifice
8. Dacă în specificații apar "Observații din imagini" sau "Analiză imagini", integrează-le în descriere (mobilă veche/nouă, renovat/nerenovat, starea locuinței etc.) pentru o descriere cât mai realistă
9. IMPORTANT: NU include niciodată numărul de înmatriculare (nr_inmatriculare) în descriere, chiar dacă apare în specificații
10. IMPORTANT: NU include "ANAF" în titlu. Folosește "Licitație Publică" sau "Licitație" în loc de "Licitație ANAF"

Răspunde DOAR în format JSON, fără explicații:
{
  "newTitle": "titlu rescris, natural și diferit",
  "newDescription": "descriere rescrisă complet, cu toate informațiile"
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 secunde timeout

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.8, // Mai creativ pentru varietate
          top_p: 0.9,
        }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const responseText = data.response || '';

    // Extrage JSON din răspuns
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.newTitle && parsed.newDescription) {
        return {
          newTitle: parsed.newTitle.trim(),
          newDescription: parsed.newDescription.trim()
        };
      }
    }
  } catch (error) {
    console.warn('Ollama rewrite failed:', error);
    return null;
  }

  return null;
}

/**
 * Rescrie textul folosind algoritm simplu (fallback)
 */
function rewriteWithSimpleAlgorithm(
  titlu: string,
  descriere: string,
  specificatii?: string
): { newTitle: string; newDescription: string } {
  // Sinonime și reformulări comune
  const synonyms = {
    'apartament': ['locuință', 'spațiu locativ', 'proprietate'],
    'camere': ['încăperi', 'sufragerii', 'compartimente'],
    'spațios': ['generos', 'în dimensiuni mari', 'larg'],
    'renovat': ['refăcut', 'modernizat', 'actualizat'],
    'complet': ['integral', 'total', 'întreg'],
    'apropiat': ['la distanță mică', 'în apropiere', 'la câteva minute'],
    'situat': ['aflat', 'poziționat', 'localizat'],
    'zona': ['cartier', 'sector', 'regiune'],
    'centrală': ['în centru', 'central', 'în zona centrală'],
    'modern': ['actual', 'contemporan', 'de ultimă generație'],
    'elegant': ['rafinat', 'distins', 'sofisticat'],
    'luminos': ['bine iluminat', 'cu multă lumină', 'soare'],
  };

  // Reformulează titlul
  let newTitle = titlu;
  
  // Înlocuiește cuvinte comune cu sinonime
  Object.entries(synonyms).forEach(([word, alternatives]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(newTitle) && Math.random() > 0.5) {
      newTitle = newTitle.replace(regex, alternatives[Math.floor(Math.random() * alternatives.length)]);
    }
  });

  // Reordonează cuvinte în titlu
  const titleWords = newTitle.split(/[\s,]+/).filter(w => w.length > 0);
  if (titleWords.length > 3 && Math.random() > 0.5) {
    // Schimbă ordinea (păstrând primul și ultimul cuvânt)
    const middle = titleWords.slice(1, -1);
    middle.sort(() => Math.random() - 0.5);
    newTitle = [titleWords[0], ...middle, titleWords[titleWords.length - 1]].join(' ');
  }

  // Reformulează descrierea
  let newDescription = descriere;
  
  // Aplică transformări de structură
  const transformations = [
    // Schimbă ordinea propozițiilor
    (text: string) => {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 1) {
        return sentences.reverse().join('. ').trim() + '.';
      }
      return text;
    },
    // Adaugă conectoare diferite
    (text: string) => {
      return text
        .replace(/\. /g, '. Descoperă ')
        .replace(/,\s/g, ', iar ')
        .replace(/\sși\s/g, ', precum și ');
    },
    // Schimbă cuvinte cu sinonime
    (text: string) => {
      Object.entries(synonyms).forEach(([word, alternatives]) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(text) && Math.random() > 0.6) {
          text = text.replace(regex, (match) => {
            const alternative = alternatives[Math.floor(Math.random() * alternatives.length)];
            return match[0] === match[0].toUpperCase() 
              ? alternative.charAt(0).toUpperCase() + alternative.slice(1)
              : alternative;
          });
        }
      });
      return text;
    }
  ];

  // Aplică transformări aleatorii
  transformations.forEach(transform => {
    if (Math.random() > 0.3) {
      newDescription = transform(newDescription);
    }
  });

  // Adaugă specificațiile la descriere dacă există
  if (specificatii && !newDescription.includes(specificatii)) {
    newDescription += ` ${specificatii}.`;
  }

  // Asigură că primul cuvânt este cu majusculă
  newDescription = newDescription.charAt(0).toUpperCase() + newDescription.slice(1);
  newTitle = newTitle.charAt(0).toUpperCase() + newTitle.slice(1);

  return {
    newTitle: newTitle.trim(),
    newDescription: newDescription.trim()
  };
}

/**
 * Funcție principală pentru rescrierea textelor produsului
 */
export async function rewriteProductText(input: RewriteInput): Promise<RewriteResult> {
  const { titlu, descriere, specificatii } = input;
  const MAX_SIMILARITY = 0.85;
  const MAX_ATTEMPTS = 3;

  let attempts = 0;
  let bestResult: RewriteResult | null = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    // Încearcă mai întâi cu ChatGPT
    let rewritten = await rewriteWithChatGPT(titlu, descriere, specificatii);

    // Dacă ChatGPT nu este disponibil, încearcă Ollama
    if (!rewritten) {
      rewritten = await rewriteWithOllama(titlu, descriere, specificatii);
    }
 
    // Dacă Ollama nu funcționează, folosește algoritm simplu
    if (!rewritten) {
      rewritten = rewriteWithSimpleAlgorithm(titlu, descriere, specificatii);
    }

    // Calculează similaritatea pentru titlu
    const titleSimilarity = await calculateSimilarity(titlu, rewritten.newTitle);
    
    // Calculează similaritatea pentru descriere
    const descSimilarity = await calculateSimilarity(descriere, rewritten.newDescription);

    // Similaritate medie
    const avgSimilarity = (titleSimilarity + descSimilarity) / 2;

    // Dacă similaritatea este acceptabilă (< 0.85), returnează rezultatul
    if (avgSimilarity < MAX_SIMILARITY) {
      return {
        newTitle: rewritten.newTitle,
        newDescription: rewritten.newDescription,
        similarityScore: avgSimilarity
      };
    }

    // Salvează cel mai bun rezultat până acum (cel mai mic scor de similaritate)
    if (!bestResult || avgSimilarity < bestResult.similarityScore) {
      bestResult = {
        newTitle: rewritten.newTitle,
        newDescription: rewritten.newDescription,
        similarityScore: avgSimilarity
      };
    }
  }

  // Dacă după toate încercările similaritatea este încă prea mare,
  // returnează cel mai bun rezultat obținut
  if (bestResult) {
    return bestResult;
  }

  // Fallback final - returnează o versiune simplă rescrisă
  const fallback = rewriteWithSimpleAlgorithm(titlu, descriere, specificatii);
  const fallbackSimilarity = await calculateSimilarity(
    `${titlu} ${descriere}`,
    `${fallback.newTitle} ${fallback.newDescription}`
  );

  return {
    newTitle: fallback.newTitle,
    newDescription: fallback.newDescription,
    similarityScore: fallbackSimilarity
  };
}

/**
 * Verifică dacă Ollama este disponibil pentru re-scriere
 */
export async function checkOllamaForRewrite(): Promise<boolean> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    return response.ok;
  } catch {
    return false;
  }
}

export function checkChatGPTForRewrite(): boolean {
  return Boolean(OPENAI_API_KEY);
}

async function rewriteWithChatGPT(
  titlu: string,
  descriere: string,
  specificatii?: string
): Promise<{ newTitle: string; newDescription: string } | null> {
  if (!OPENAI_API_KEY) {
    return null;
  }

  try {
    const messages = [
      {
        role: 'system',
        content:
          'Ești un copywriter senior pentru e-commerce din România. Rescrii titluri și descrieri pentru a fi atractive, unice și realiste. Răspunde exclusiv cu un JSON valid.'
      },
      {
        role: 'user',
        content: `Titlu original: ${titlu}\nDescriere originală: ${descriere}${specificatii ? `\nSpecificații: ${specificatii}` : ''}\n\nCerințe:\n1. Rescrie titlul într-un mod profesionist și clar (limba română).\n2. Rescrie complet descrierea păstrând toate informațiile esențiale.\n3. Folosește ton comercial, prietenos, cu propoziții naturale.\n4. Evită repetițiile.\n5. LOCAȚIE: Nu fi extrem de precis. Este suficient orașul sau zona/cartierul; evită adrese exacte sau puncte de reper foarte specifice, dacă nu sunt esențiale.\n6. Dacă în specificații apar "Observații din imagini" sau "Analiză imagini", integrează-le în descriere (mobilă veche/nouă, renovat/nerenovat, starea locuinței etc.) pentru o descriere cât mai realistă.\n7. IMPORTANT: NU include niciodată numărul de înmatriculare (nr_inmatriculare) în descriere, chiar dacă apare în specificații.\n8. IMPORTANT: NU include "ANAF" în titlu. Folosește "Licitație Publică" sau "Licitație" în loc de "Licitație ANAF".\n9. Returnează DOAR un obiect JSON cu cheile newTitle și newDescription.`
      }
    ];

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_REWRITE_MODEL,
        temperature: 0.7,
        messages
      })
    });

    if (!response.ok) {
      console.warn('OpenAI rewrite request failed', await response.text());
      return null;
    }

    const data = await response.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.newTitle && parsed.newDescription) {
        return {
          newTitle: parsed.newTitle.trim(),
          newDescription: parsed.newDescription.trim()
        };
      }
    }
  } catch (error) {
    console.warn('OpenAI rewrite failed:', error);
    return null;
  }

  return null;
}

