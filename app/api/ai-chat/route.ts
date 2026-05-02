import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * AI Chat API - GPT-4o with RAG + Conversational Memory
 * Chat vocal cu memorie conversațională și integrare Pinecone
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

interface ChatContext {
  messages: ChatMessage[];
  conversationId?: string;
}

/**
 * Detectează dacă utilizatorul caută un produs
 */
function isProductSearchQuery(query: string): boolean {
  const searchKeywords = [
    'caut', 'caută', 'găsește', 'văd', 'arătă', 'arata',
    'apartament', 'casă', 'mașină', 'auto', 'produs', 'licitație',
    'preț', 'cumpăr', 'cumpăra', 'vând', 'vinde', 'oferă',
  ];
  
  const lowerQuery = query.toLowerCase();
  return searchKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Extrage informații relevante din Pinecone pentru context
 */
async function getRelevantContext(query: string): Promise<string> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const matches = await queryVectors(queryEmbedding, 5);
    
    if (matches.length === 0) {
      return '';
    }
    
    const contextParts = matches.map((match: any, index: number) => {
      const metadata = match.metadata || {};
      return `${index + 1}. ${metadata.title || 'Produs'} - ${metadata.description || ''} - Preț: ${metadata.price || 'N/A'} Lei`;
    });
    
    return `Informații relevante despre produse:\n${contextParts.join('\n')}`;
  } catch (error) {
    console.error('Error getting context:', error);
    return '';
  }
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
    const { message, conversationHistory = [], conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Detectează dacă utilizatorul caută un produs
    const isSearchQuery = isProductSearchQuery(message);
    
    // Obține context relevant din Pinecone (cu fallback dacă eșuează)
    let ragContext = '';
    if (isSearchQuery) {
      try {
      ragContext = await getRelevantContext(message);
      } catch (error) {
        console.error('Failed to get RAG context, continuing without it:', error);
        ragContext = '';
      }
    }

    // Construiește sistem prompt
    const systemPrompt = `Ești un asistent AI inteligent pentru platforma gobid.ro, o platformă de licitații online.

Sarcini tale:
1. Răspunzi natural și prietenos în limba română
2. Îți adaptezi tonul la utilizator (formal/casual)
3. Când utilizatorul caută produse, oferi informații precise și sugestii
4. Poți răspunde despre produse, licitații, funcționalități ale site-ului
5. Încurajezi utilizatorul să exploreze produsele relevante

${ragContext ? `\nContext despre produse relevante:\n${ragContext}\n` : ''}

Răspunde concis, util și prietenos.`;

    // Construiește mesajele pentru GPT-4o
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory.map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Generează răspuns cu GPT-4o
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'text' },
    });

    const responseText = completion.choices[0]?.message?.content || 'Nu pot răspunde momentan.';

    // Detectează dacă trebuie să comutăm în search mode
    const shouldSwitchToSearch = isSearchQuery && responseText.toLowerCase().includes('găsit') || 
                                  responseText.toLowerCase().includes('produs');

    return NextResponse.json({
      message: responseText,
      conversationId: conversationId || `conv_${Date.now()}`,
      isSearchQuery,
      shouldSwitchToSearch,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    console.error('Error stack:', error.stack);
    
    // Mesaje de eroare mai specifice
    let errorMessage = 'Failed to process chat message';
    let errorDetails = error.message || 'Unknown error';
    
    if (error.message?.includes('API key')) {
      errorMessage = 'OpenAI API key not configured';
      errorDetails = 'Please add OPENAI_API_KEY to your .env.local file';
    } else if (error.message?.includes('Pinecone') || error.message?.includes('embedding')) {
      errorMessage = 'RAG service error';
      errorDetails = 'Error connecting to Pinecone or generating embeddings. Continuing without RAG context.';
    } else if (error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Connection error';
      errorDetails = 'Could not connect to OpenAI API. Please check your internet connection and API key.';
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}

