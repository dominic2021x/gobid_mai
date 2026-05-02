import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/lib/ai/pinecone';
import { getOpenAIClient } from '@/lib/ai/openai';
import { createEmbedding } from '@/lib/ai/embeddings';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatBody {
  messages?: ChatMessage[];
  topK?: number;
}

const CHAT_MODEL = 'gpt-4o-mini';

export async function POST(request: Request) {
  try {
    const body: ChatBody = await request.json().catch(() => ({}));
    const messages = body.messages ?? [];
    const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user');

    if (!latestUserMessage) {
      return NextResponse.json(
        { error: 'Este necesar cel puțin un mesaj cu rolul "user".' },
        { status: 400 }
      );
    }

    const query = latestUserMessage.content.trim();
    if (!query) {
      return NextResponse.json(
        { error: 'Mesajul utilizatorului este gol.' },
        { status: 400 }
      );
    }

    const embedding = await createEmbedding(query);

    const index = getPineconeIndex();
    const topK = body.topK ?? 5;

    const searchResponse = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });

    const matches = searchResponse.matches ?? [];
    const contextBlocks = matches.map((match, idx) => {
      const metadata = match.metadata as Record<string, unknown>;
      const title = metadata?.title ?? 'Fără titlu';
      const description = metadata?.description ?? '';
      const category = metadata?.category ? `Categorie: ${metadata.category}` : '';
      return `# Rezultat ${idx + 1}\nTitlu: ${title}\n${category}\nDescriere: ${description}\n`;
    });

    const contextText =
      contextBlocks.length > 0
        ? contextBlocks.join('\n')
        : 'Nu există rezultate relevante din baza de cunoștințe.';

    const systemPrompt = `Ești un asistent AI pentru magazinul online.
Folosești STRICT rezultatele din RAG.
Răspunzi doar cu date existente în metadata.
Nu inventa nimic. Dacă nu ai informații, spune că nu poți răspunde.`;

    const openai = getOpenAIClient();
    const response = await openai.responses.create({
      model: CHAT_MODEL,
      input: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Context:\n${contextText}\n\nÎntrebare utilizator: ${query}`,
        },
      ],
    });

    return NextResponse.json({
      response,
      sources: matches.map((match) => ({
        id: match.id ?? '',
        score: match.score ?? 0,
        metadata: match.metadata ?? {},
      })),
    });
  } catch (error) {
    console.error('Chat RAG error:', error);
    const message =
      error instanceof Error ? error.message : 'Eroare la generarea răspunsului.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}










