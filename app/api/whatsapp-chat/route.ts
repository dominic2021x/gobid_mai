import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * WhatsApp Chat API - GPT-4o cu RAG + Fallback Detection
 * 
 * Features:
 * - AI Chat cu GPT-4o (multimodal)
 * - Integrare Pinecone pentru RAG
 * - Memorie conversațională
 * - Detectare fallback necesar (când AI nu poate răspunde)
 * - Sugestii mesaje predefinite pentru fallback
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { generateEmbedding } from '@/utils/embeddings';
import { queryVectors } from '@/lib/pinecone';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Mesaje predefinite pentru fallback
const FALLBACK_MESSAGES = {
  support: [
    'Pentru probleme tehnice complexe, vă rugăm să ne contactați direct prin WhatsApp.',
    'Pentru asistență tehnică detaliată, un specialist vă va ajuta prin WhatsApp.',
    'Vă conectăm la un specialist tehnic prin WhatsApp pentru rezolvarea problemei.',
  ],
  payments: [
    'Pentru întrebări despre plăți și facturare, vă rugăm să ne contactați prin WhatsApp.',
    'Un consultant financiar vă va ajuta cu întrebările despre plăți prin WhatsApp.',
    'Pentru probleme de facturare, contactați-ne direct prin WhatsApp.',
  ],
  auctions: [
    'Pentru informații detaliate despre licitații, contactați departamentul prin WhatsApp.',
    'Un specialist în licitații vă va ghida prin WhatsApp.',
    'Pentru asistență cu licitațiile, vă conectăm la un expert prin WhatsApp.',
  ],
  account: [
    'Pentru gestionarea contului, vă rugăm să ne contactați prin WhatsApp.',
    'Un consultant vă va ajuta cu setările contului prin WhatsApp.',
    'Pentru probleme cu contul, contactați-ne direct prin WhatsApp.',
  ],
};

/**
 * Extrage context relevant din Pinecone
 */
async function getRelevantContext(query: string, department?: string): Promise<string> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const matches = await queryVectors(queryEmbedding, 5, {
      department: department || undefined,
    });

    if (matches.length === 0) {
      return '';
    }

    const context = matches
      .map((match: any) => match.metadata?.text || match.text)
      .filter(Boolean)
      .join('\n\n');

    return context;
  } catch (error) {
    console.error('Error getting context:', error);
    return '';
  }
}

/**
 * Detectează dacă AI nu poate răspunde și ar trebui fallback
 */
function shouldSuggestFallback(aiResponse: string, userQuery: string): boolean {
  const fallbackIndicators = [
    'nu știu',
    'nu sunt sigur',
    'nu pot ajuta',
    'nu am informații',
    'contactează',
    'sună',
    'verifică',
    'înaintează către',
    'transfer către',
  ];

  const lowerResponse = aiResponse.toLowerCase();
  const hasFallbackIndicator = fallbackIndicators.some(indicator =>
    lowerResponse.includes(indicator)
  );

  // Dacă răspunsul e prea scurt sau generic
  if (aiResponse.length < 50 && hasFallbackIndicator) {
    return true;
  }

  // Dacă răspunsul conține sugestii explicite de contactare
  if (hasFallbackIndicator && lowerResponse.includes('whatsapp')) {
    return true;
  }

  return false;
}

/**
 * Obține mesaj predefinit pentru fallback
 */
function getFallbackMessage(department?: string): string {
  const dept = department || 'support';
  const messages = FALLBACK_MESSAGES[dept as keyof typeof FALLBACK_MESSAGES] || FALLBACK_MESSAGES.support;
  return messages[Math.floor(Math.random() * messages.length)];
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
    const {
      message,
      conversationHistory = [],
      conversationId,
      department,
      userId,
    } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Obține context din Pinecone
    const context = await getRelevantContext(message, department);

    // Construiește sistem prompt
    const systemPrompt = `Ești Maria, asistenta virtuală pentru platforma gobid.ro.
- Ești prietenoasă, profesională și utilă.
- Răspunzi în limba română.
- Dacă nu ești sigură de răspuns sau problema e prea complexă, sugerezi contactarea prin WhatsApp.
- Folosești contextul furnizat pentru a da răspunsuri precise.
${department ? `- Utilizatorul este conectat la departamentul: ${department}` : ''}

Context relevant: ${context || 'Nu există context relevant pentru această întrebare.'}`;

    // Construiește mesajele pentru GPT
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Ultimele 10 mesaje pentru context
      { role: 'user', content: message },
    ];

    // Apel GPT-4o
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500,
      stream: false,
    });

    let aiResponse = completion.choices[0]?.message?.content || 'Nu pot răspunde momentan.';

    // Verifică dacă trebuie fallback
    const fallbackSuggested = shouldSuggestFallback(aiResponse, message);

    // Dacă fallback e sugerat, adaugă mesaj predefinit
    if (fallbackSuggested) {
      const fallbackMsg = getFallbackMessage(department);
      aiResponse += `\n\n💬 ${fallbackMsg}`;
    }

    // Salvează conversația în baza de date (opțional - poți adăuga MongoDB/PostgreSQL aici)
    // await saveConversation(conversationId, message, aiResponse, department, userId);

    return NextResponse.json({
      message: aiResponse,
      conversationId: conversationId || `conv-${Date.now()}`,
      fallbackSuggested,
      department,
    });
  } catch (error: any) {
    console.error('WhatsApp Chat API error:', error);

    // În caz de eroare, returnează mesaj de fallback
    return NextResponse.json({
      message: 'Îmi pare rău, am întâmpinat o problemă. Vă rugăm să ne contactați direct prin WhatsApp pentru asistență.',
      fallbackSuggested: true,
      error: error.message,
    }, { status: 500 });
  }
}
