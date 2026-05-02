/**
 * Generator SEO automat bazat pe AI
 * Analizează titlu, descriere și specificații pentru a genera SEO optimizat (ChatGPT + fallback)
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_SEO_MODEL = process.env.OPENAI_SEO_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2';

interface SEOInput {
  titlu: string;
  descriere: string;
  specificatii?: string;
}

interface SEOResult {
  seoTitle: string;       // max 65 caractere
  seoDescription: string; // max 160 caractere
  seoKeywords: string;    // cuvinte cheie separate prin virgulă
}

/**
 * Extrage cuvinte cheie importante din text
 */
function extractKeywords(text: string): { word: string; score: number }[] {
  // Cuvinte comune care trebuie ignorate (stop words în română)
  const stopWords = new Set([
    'a', 'ai', 'al', 'ale', 'am', 'an', 'ar', 'are', 'as', 'asta', 'astea', 'astfel', 'astăzi',
    'atât', 'au', 'avem', 'aveți', 'azi', 'bun', 'că', 'când', 'care', 'ce', 'cel', 'ceea',
    'cei', 'ceva', 'chiar', 'ci', 'cine', 'cineva', 'conform', 'cu', 'cum', 'cumva', 'dacă',
    'dar', 'dată', 'datorită', 'de', 'decât', 'deci', 'deja', 'despre', 'din', 'după', 'dă',
    'este', 'eu', 'ești', 'face', 'fără', 'fi', 'fie', 'fiecare', 'fost', 'i', 'iar', 'iarăși',
    'în', 'înainte', 'încă', 'într-o', 'într-un', 'între', 'întrucât', 'la', 'lângă', 'le',
    'li', 'lor', 'lui', 'mai', 'mare', 'mea', 'mei', 'meu', 'mi', 'mie', 'multe', 'multă',
    'mulți', 'mulțumesc', 'mâine', 'mă', 'ne', 'nicăieri', 'nici', 'niciodată', 'nicăieri',
    'nimeni', 'niște', 'noastre', 'noastră', 'noi', 'noroc', 'nostru', 'nouă', 'nu', 'nun',
    'o', 'opt', 'ori', 'oricând', 'oricare', 'oricât', 'oricum', 'orice', 'oricine', 'oricum',
    'oriunde', 'până', 'patru', 'patrulea', 'patrulelea', 'pe', 'pentru', 'poate', 'prea',
    'prima', 'primul', 'printre', 'prin', 'până', 'rândul', 'să', 'său', 'sale', 'sau', 'se',
    'spune', 'și', 'sunt', 'suntem', 'sunteți', 'sută', 'să', 'tare', 'te', 'ți', 'tine',
    'toate', 'toată', 'tot', 'totuși', 'toți', 'toți', 'trei', 'treia', 'treilea', 'tu',
    'un', 'una', 'unde', 'unei', 'uneia', 'unele', 'uneori', 'unii', 'unor', 'unora', 'unu',
    'unui', 'unuia', 'unul', 'v', 'va', 'vale', 'vi', 'voastre', 'voastră', 'voi', 'voștri',
    'voștri', 'vostru', 'vouă', 'vreo', 'vreun', 'vreuna', 'vreunei', 'vreunor', 'vă', 'și'
  ]);

  // Normalizare text: lowercase, eliminare diacritice pentru matching
  const normalize = (str: string) => str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimină diacritice
    .replace(/[^\w\s]/g, ' '); // Elimină caractere speciale

  const normalizedText = normalize(text);
  const words = normalizedText.split(/\s+/).filter(w => w.length > 2);

  // Calculează frecvența și relevanța
  const wordFreq: Map<string, number> = new Map();
  const wordPositions: Map<string, number[]> = new Map();

  words.forEach((word, index) => {
    if (!stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      if (!wordPositions.has(word)) {
        wordPositions.set(word, []);
      }
      wordPositions.get(word)!.push(index);
    }
  });

  // Scor SEO bazat pe:
  // 1. Frecvență (weight: 0.3)
  // 2. Poziție în text - cuvintele din început sunt mai importante (weight: 0.4)
  // 3. Lungime - cuvinte mai lungi sunt mai specifice (weight: 0.3)
  const scoredKeywords: { word: string; score: number }[] = [];

  wordFreq.forEach((freq, word) => {
    const positions = wordPositions.get(word) || [];
    const avgPosition = positions.reduce((a, b) => a + b, 0) / positions.length;
    const positionScore = 1 / (1 + avgPosition / 10); // Cuvintele din început au scor mai mare
    const lengthScore = Math.min(word.length / 10, 1); // Normalizat la max 1
    const freqScore = Math.min(freq / 5, 1); // Normalizat

    const totalScore = 
      freqScore * 0.3 + 
      positionScore * 0.4 + 
      lengthScore * 0.3;

    scoredKeywords.push({ word, score: totalScore });
  });

  // Sortează după scor descendent
  return scoredKeywords.sort((a, b) => b.score - a.score);
}

/**
 * Generează titlu SEO (max 65 caractere)
 */
function generateSEOTitle(titlu: string, keywords: string[]): string {
  // Dacă titlul este deja optim (sub 65 caractere), îl folosim
  if (titlu.length <= 65) {
    return titlu;
  }

  // Altfel, construim un titlu nou cu cuvinte cheie principale
  const mainKeywords = keywords.slice(0, 3).join(' ');
  const truncated = titlu.substring(0, 50 - mainKeywords.length);
  
  return `${truncated} ${mainKeywords}`.substring(0, 65).trim();
}

/**
 * Generează descriere SEO (max 160 caractere)
 */
function generateSEODescription(
  descriere: string,
  specificatii: string | undefined,
  keywords: string[]
): string {
  // Combină descriere și specificații
  let combined = descriere;
  if (specificatii) {
    combined += ' ' + specificatii;
  }

  // Dacă textul combinat este deja optim, îl folosim
  if (combined.length <= 160) {
    return combined;
  }

  // Construiește descriere cu keyword-uri principale
  const mainKeywords = keywords.slice(0, 2).join(', ');
  const preview = descriere.substring(0, 140 - mainKeywords.length);
  
  return `${preview} ${mainKeywords}.`.substring(0, 160).trim();
}

/**
 * Generează lista de cuvinte cheie
 */
function generateSEOKeywords(
  titlu: string,
  descriere: string,
  specificatii: string | undefined,
  keywords: string[]
): string {
  // Combină toate cuvintele cheie importante
  const allText = `${titlu} ${descriere} ${specificatii || ''}`;
  const extracted = extractKeywords(allText);
  
  // Ia top 5-7 cuvinte cheie
  const topKeywords = extracted.slice(0, 7).map(k => k.word);
  
  // Adaugă și termeni compuși relevanți (ex: "apartament București")
  const compoundKeywords: string[] = [];
  if (topKeywords.length >= 2) {
    // Generează perechi relevante
    for (let i = 0; i < Math.min(3, topKeywords.length - 1); i++) {
      compoundKeywords.push(`${topKeywords[i]} ${topKeywords[i + 1]}`);
    }
  }

  // Combină cuvinte simple și compuse
  const allKeywords = [...topKeywords, ...compoundKeywords];
  
  // Returnează primele 10-12 termeni, separate prin virgulă
  return allKeywords.slice(0, 12).join(', ');
}

/**
 * Funcție principală pentru generarea SEO
 * Folosește AI local (Ollama) sau fallback la algoritm simplu
 */
export async function generateSEO(input: SEOInput): Promise<SEOResult> {
  const { titlu, descriere, specificatii } = input;

  // Combină toate textele pentru analiză
  const allText = `${titlu} ${descriere} ${specificatii || ''}`;
  const keywords = extractKeywords(allText).map(k => k.word);

  // Încearcă ChatGPT mai întâi
  const chatgptResult = await generateSEOWithChatGPT(input, keywords);
  if (chatgptResult) {
    return chatgptResult;
  }

  // Generează SEO bazat pe algoritm simplu (fallback)
  let seoTitle = generateSEOTitle(titlu, keywords);
  let seoDescription = generateSEODescription(descriere, specificatii, keywords);
  let seoKeywords = generateSEOKeywords(titlu, descriere, specificatii, keywords);

  // Încearcă să folosească Ollama pentru îmbunătățire (dacă este disponibil)
  try {
    const ollamaResult = await tryOllamaSEO(input, keywords);
    if (ollamaResult) {
      return ollamaResult;
    }
  } catch (error) {
    console.warn('Ollama not available, using simple SEO generation:', error);
  }

  return {
    seoTitle,
    seoDescription,
    seoKeywords
  };
}

/**
 * Încearcă să folosească Ollama pentru generare SEO mai inteligentă
 */
async function tryOllamaSEO(
  input: SEOInput,
  keywords: string[]
): Promise<SEOResult | null> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  
  try {
    const prompt = `Ești expert în SEO. Generează optimizare SEO pentru următoarele informații:

Titlu: ${input.titlu}
Descriere: ${input.descriere}
${input.specificatii ? `Specificații: ${input.specificatii}` : ''}

Cuvinte cheie importante: ${keywords.slice(0, 5).join(', ')}

Răspunde DOAR în format JSON, fără explicații:
{
  "seoTitle": "titlu SEO optimizat (maxim 65 caractere, cu keyword principal)",
  "seoDescription": "descriere SEO optimizată (maxim 160 caractere, naturală, cu 2-3 keyworduri)",
  "seoKeywords": "cuvinte cheie separate prin virgulă (maxim 12 termeni)"
}`;

    // Creează un AbortController pentru timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout 10 secunde

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'mistral',
        prompt: prompt,
        stream: false,
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
      
      // Validează și limitează lungimea
      return {
        seoTitle: parsed.seoTitle?.substring(0, 65) || generateSEOTitle(input.titlu, keywords),
        seoDescription: parsed.seoDescription?.substring(0, 160) || generateSEODescription(input.descriere, input.specificatii, keywords),
        seoKeywords: parsed.seoKeywords || generateSEOKeywords(input.titlu, input.descriere, input.specificatii, keywords)
      };
    }
  } catch (error) {
    // Ollama nu este disponibil, continuă cu fallback
    return null;
  }

  return null;
}

/**
 * Verifică dacă Ollama este disponibil
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  
  try {
    // Creează un AbortController pentru timeout
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

async function generateSEOWithChatGPT(input: SEOInput, keywords: string[]): Promise<SEOResult | null> {
  if (!OPENAI_API_KEY) {
    return null;
  }

  try {
    const messages = [
      {
        role: 'system',
        content: 'Ești un specialist SEO din România. Optimizezi titluri, descrieri și cuvinte cheie pentru listări de produs. Răspunde numai cu JSON valid.'
      },
      {
        role: 'user',
        content: `Titlu: ${input.titlu}
Descriere: ${input.descriere}${input.specificatii ? `
Specificații: ${input.specificatii}` : ''}
Cuvinte cheie extrase: ${keywords.slice(0, 6).join(', ')}

Returnează exclusiv JSON cu cheile seoTitle (max 65 caractere), seoDescription (max 160 caractere) și seoKeywords (termeni separați prin virgulă).`
      }
    ];

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_SEO_MODEL,
        temperature: 0.5,
        messages
      })
    });

    if (!response.ok) {
      console.warn('OpenAI SEO request failed', await response.text());
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
      if (parsed.seoTitle && parsed.seoDescription && parsed.seoKeywords) {
        return {
          seoTitle: parsed.seoTitle.substring(0, 65).trim(),
          seoDescription: parsed.seoDescription.substring(0, 160).trim(),
          seoKeywords: String(parsed.seoKeywords)
        };
      }
    }
  } catch (error) {
    console.warn('OpenAI SEO generation failed:', error);
    return null;
  }

  return null;
}

export async function checkChatGPTAvailable(): Promise<boolean> {
  return Boolean(OPENAI_API_KEY);
}

