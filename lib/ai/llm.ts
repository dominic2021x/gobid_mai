/**
 * LLM Service - Local sau API pentru generare răspunsuri
 * Poate folosi Ollama (local), Mistral API, sau OpenRouter
 */

export interface LLMResponse {
  text: string;
  tokens?: number;
}

/**
 * Generează răspuns folosind LLM
 * Opțiuni:
 * 1. Ollama (local) - gratuit
 * 2. Mistral API - low cost
 * 3. OpenRouter - acces la multiple modele
 */
export async function generateResponse(
  prompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<LLMResponse> {
  const {
    model = process.env.LLM_MODEL || 'llama3.2', // Ollama default
    temperature = 0.7,
    maxTokens = 500,
  } = options;

  const llmProvider = process.env.LLM_PROVIDER || 'simple'; // ollama, mistral, openrouter, simple

  try {
    switch (llmProvider) {
      case 'ollama':
        return await generateWithOllama(prompt, { model, temperature, maxTokens });
      case 'mistral':
        return await generateWithMistral(prompt, { temperature, maxTokens });
      case 'openrouter':
        return await generateWithOpenRouter(prompt, { model, temperature, maxTokens });
      case 'simple':
        return await generateSimpleResponse(prompt);
      default:
        return await generateSimpleResponse(prompt);
    }
  } catch (error) {
    console.error('Error generating LLM response:', error);
    // Fallback la răspuns simplu
    return await generateSimpleResponse(prompt);
  }
}

/**
 * Răspuns simplu bazat pe context (fără LLM extern) - pentru început
 */
async function generateSimpleResponse(prompt: string): Promise<LLMResponse> {
  // Verifică răspunsuri custom din configurație
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('aiResponseConfig');
      if (saved) {
        const config = JSON.parse(saved);
        const { findCustomResponse } = await import('./response-config');
        const customResponse = findCustomResponse(prompt, config);
        if (customResponse) {
          return { text: customResponse };
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Extrage contextul din prompt (construit de RAG)
  // Caută contextul înainte de "Întrebare utilizator:"
  // Folosim [\s\S] în loc de . cu flag-ul s pentru compatibilitate ES2017
  const contextMatch = prompt.match(/Context relevant:\s*([\s\S]+?)(?:\n\nÎntrebare utilizator:|\n\nRăspuns:|$)/);
  const contextText = contextMatch?.[1]?.trim() || '';
  const hasContext = contextText && !contextText.includes('Nu s-a găsit') && contextText.length > 30;
  
  // Extrage întrebarea utilizatorului
  const queryMatch = prompt.match(/Întrebare utilizator:\s*([\s\S]+?)(?:\n\nRăspuns:|$)/);
  const userQuery = queryMatch?.[1]?.trim() || prompt;

  // Verifică template-uri custom
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('aiResponseConfig');
      if (saved) {
        const config = JSON.parse(saved);
        
        // Verifică greeting
        if (/^(salut|bună|buna|hello|hi|hey)/i.test(userQuery)) {
          return { text: config.templates?.greeting || 'Bună! Cu ce te pot ajuta?' };
        }
        
        // Verifică thanks
        if (/(mulțumesc|multumesc|mersi|thanks)/i.test(userQuery)) {
          return { text: config.templates?.thanks || 'Cu plăcere!' };
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  const lowerPrompt = userQuery.toLowerCase();
  const lowerContext = contextText.toLowerCase();
  
  // Dacă avem context relevant, folosește-l pentru răspuns
  if (hasContext) {
    // Extrage doar partea utilă din context (fără formate repetitive)
    let cleanContext = contextText
      .replace(/\[(\d+)\]\s*/g, '')
      .replace(/Sursă:.*?$/gm, '')
      .replace(/Context relevant:\s*/gi, '')
      .trim();
    
    // Elimină fraze duplicate din context
    const contextSentences = cleanContext.split(/[.!?]+/).filter(s => s.trim().length > 15);
    const uniqueSentences: string[] = [];
    const seen = new Set<string>();
    
    for (const sentence of contextSentences) {
      const normalized = sentence.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueSentences.push(sentence.trim());
      }
    }
    
    cleanContext = uniqueSentences.join('. ').trim();
    
    // Analizează întrebarea mai detaliat - caută întrebări specifice
    const exactMatches: { pattern: RegExp; response: (ctx: string) => string }[] = [
      {
        pattern: /^(salut|bună|buna|hello|hi|hey)/i,
        response: () => 'Bună! 👋 Sunt Cristina, asistenta ta virtuală. Cu ce te pot ajuta?',
      },
      {
        pattern: /(mulțumesc|multumesc|mersi|thanks)/i,
        response: () => 'Cu plăcere! 😊 Mai ai alte întrebări?',
      },
      {
        pattern: /unde.*(cumpăr|cumpar|cumpăra).*token/i,
        response: () => 'Poți cumpăra tokens din dashboard-ul tău, secțiunea "Tokens" sau "Tokeni". Acolo găsești toate pachetele disponibile și poți efectua plata.',
      },
      {
        pattern: /ce.*(token|tokeni)/i,
        response: (ctx) => {
          const tokenInfo = ctx.includes('moneda') ? 'moneda virtuală' : 'unitatea de măsură';
          return `Tokens sunt ${tokenInfo} a platformei gobid.ro. ${ctx.substring(0, 150)}.`;
        },
      },
      {
        pattern: /(cum funcționează|cum se).*licita/i,
        response: (ctx) => {
          const relevantPart = ctx.substring(0, Math.min(200, ctx.length));
          return relevantPart.endsWith('.') ? relevantPart : relevantPart + '.';
        },
      },
    ];
    
    // Verifică match-uri exacte
    for (const match of exactMatches) {
      if (match.pattern.test(userQuery)) {
        const response = match.response(cleanContext);
        if (response && response.length > 20) {
          return { text: response };
        }
      }
    }
    
    // Dacă nu e match exact, folosește contextul direct
    // Dar asigură-te că nu e prea repetitiv
    const contextParts = cleanContext.split(/\s+/);
    const queryParts = userQuery.split(/\s+/);
    const relevantWords = queryParts.filter(q => q.length > 3);
    
    // Extrage doar partea relevantă din context care se potrivește cu întrebarea
    let answer = '';
    
    if (relevantWords.length > 0) {
      // Găsește propozițiile care conțin cuvinte cheie din întrebare
      const relevantSentences = uniqueSentences.filter(sentence => {
        const sentenceLower = sentence.toLowerCase();
        return relevantWords.some(word => sentenceLower.includes(word.toLowerCase()));
      });
      
      if (relevantSentences.length > 0) {
        answer = relevantSentences.slice(0, 2).join(' ');
      } else {
        // Dacă nu găsim propoziții relevante, folosește primele 2 propoziții din context
        answer = uniqueSentences.slice(0, 2).join('. ');
      }
    } else {
      // Fără cuvinte cheie clare - folosește contextul așa cum e
      answer = uniqueSentences.slice(0, 2).join('. ');
    }
    
    // Cleanup final
    answer = answer.trim();
    
    // Asigură-te că nu e prea lung
    if (answer.length > 350) {
      const lastPeriod = answer.substring(0, 350).lastIndexOf('.');
      answer = lastPeriod > 200 ? answer.substring(0, lastPeriod + 1) : answer.substring(0, 350) + '...';
    }
    
    // Elimină fraze care se repetă
    const finalSentences = answer.split(/[.!?]+/).filter((s, i, arr) => {
      const normalized = s.trim().toLowerCase();
      return normalized.length > 10 && arr.findIndex(a => a.trim().toLowerCase() === normalized) === i;
    });
    
    answer = finalSentences.join('. ').trim();
    if (answer && !answer.endsWith('.') && !answer.endsWith('!') && !answer.endsWith('?')) {
      answer += '.';
    }
    
    // Dacă încă nu avem un răspuns bun, folosește contextul direct (primele 250 caractere)
    if (!answer || answer.length < 30) {
      answer = cleanContext.substring(0, 250).trim();
      const lastPeriod = answer.lastIndexOf('.');
      if (lastPeriod > 100) {
        answer = answer.substring(0, lastPeriod + 1);
      }
    }
    
    return { text: answer || 'Mulțumesc pentru întrebarea ta. Te recomand să contactezi suportul pentru mai multe detalii.' };
  }
  
  // Fără context - răspunsuri bazate doar pe keywords din întrebare
  const greetingKeywords = ['salut', 'bună', 'buna', 'hello', 'hi', 'hey'];
  const thanksKeywords = ['mulțumesc', 'multumesc', 'mersi', 'thanks', 'thank'];
  const helpKeywords = ['ajutor', 'help', 'asistență', 'asistenta'];
  
  if (greetingKeywords.some(k => lowerPrompt.includes(k))) {
    return {
      text: 'Bună! 👋 Sunt Cristina, asistenta ta virtuală de la gobid.ro. Cu ce te pot ajuta astăzi? Poți mă întreba despre licitații, tokens, cont sau orice altceva legat de platformă.',
    };
  }
  
  if (thanksKeywords.some(k => lowerPrompt.includes(k))) {
    return {
      text: 'Cu plăcere! 😊 Sunt aici să te ajut oricând ai nevoie. Mai ai alte întrebări?',
    };
  }
  
  if (helpKeywords.some(k => lowerPrompt.includes(k))) {
    return {
      text: 'Desigur, sunt aici să te ajut! Poți mă întreba despre:\n\n• Cum funcționează licitațiile\n• Cum să cumperi tokens\n• Cum să îți gestionezi contul\n• Cum să adaugi produse\n• Orice altceva legat de platformă\n\nCu ce te pot ajuta?',
    };
  }
  
  // Analiză mai detaliată pentru răspunsuri specifice
  if (lowerPrompt.includes('funcționează') || lowerPrompt.includes('functioneaza')) {
    if (lowerPrompt.includes('licita')) {
      return {
        text: 'Licitațiile funcționează astfel: poți explora produsele disponibile, plasa oferte folosind tokens, și dacă oferta ta rămâne cea mai mare până la încheierea licitației, câștigi produsul! Fiecare licitație are un timp limitat de desfășurare.',
      };
    }
    return {
      text: 'Platforma gobid.ro funcționează ca o platformă de licitații online. Poți explora produse, plasa oferte folosind tokens, și câștiga produse la prețuri avantajoase. Pentru a începe, ai nevoie de tokens în contul tău.',
    };
  }
  
  if (lowerPrompt.includes('cumpăr') || lowerPrompt.includes('cumpar')) {
    if (lowerPrompt.includes('token')) {
      return {
        text: 'Pentru a cumpăra tokens, mergi în dashboard-ul tău, secțiunea "Tokens" sau "Tokeni". Acolo poți selecta pachetul dorit și efectua plata. Tokens sunt necesari pentru a plasa oferte în licitații.',
      };
    }
  }
  
  if (lowerPrompt.includes('preț') || lowerPrompt.includes('pret') || lowerPrompt.includes('cost')) {
    return {
      text: 'Prețurile și costurile variază în funcție de ce te interesează. Pentru tokens, poți vedea pachetele disponibile în secțiunea Tokens din dashboard. Pentru produse, fiecare licitație are un preț de pornire și poți plasa oferte până la bugetul tău.',
    };
  }
  
  // Răspuns fallback inteligent
  return {
    text: 'Mulțumesc pentru întrebarea ta! 😊\n\nDin păcate, nu am găsit informații exacte pentru întrebarea ta în momentul de față. Te recomand să:\n\n• Verifici secțiunea FAQ din platformă\n• Explorezi ghidul de utilizare\n• Fii mai specific în întrebarea ta (ex: "Cum cumpăr tokens?", "Cum particip la licitații?")\n• Contactezi echipa noastră de suport pentru asistență personalizată\n\nCu ce anume te pot ajuta mai concret?',
  };
}

/**
 * Folosește Ollama (local) - gratuit
 */
async function generateWithOllama(
  prompt: string,
  options: { model?: string; temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const { model = 'llama3.2', temperature = 0.7, maxTokens = 500 } = options;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    text: data.response || '',
    tokens: data.eval_count,
  };
}

/**
 * Folosește Mistral API - low cost
 */
async function generateWithMistral(
  prompt: string,
  options: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('Mistral API key not configured');
  }

  const { temperature = 0.7, maxTokens = 500 } = options;

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-small',
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0]?.message?.content || '',
    tokens: data.usage?.total_tokens,
  };
}

/**
 * Folosește OpenRouter - acces la multiple modele
 */
async function generateWithOpenRouter(
  prompt: string,
  options: { model?: string; temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const {
    model = 'meta-llama/llama-3.1-8b-instruct:free',
    temperature = 0.7,
    maxTokens = 500,
  } = options;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0]?.message?.content || '',
    tokens: data.usage?.total_tokens,
  };
}


