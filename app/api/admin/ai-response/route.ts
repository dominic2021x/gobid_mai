/**
 * Admin AI Response API - Generează răspuns automat AI pentru conversație
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import { generateEmbedding } from '@/utils/embeddings';
import { queryVectors } from '@/lib/pinecone';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { conversationId } = body;

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }

    // TODO: În producție, încarcă conversația din baza de date
    // const conversation = await db.conversations.findUnique({
    //   where: { id: conversationId },
    //   include: { messages: { orderBy: { timestamp: 'asc' } } }
    // });

    // Mock pentru demo
    const conversation = {
      id: conversationId,
      messages: [
        {
          role: 'user' as const,
          content: 'Am o problemă cu contul meu',
        },
      ],
      department: 'support',
    };

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Obține ultimul mesaj de la utilizator
    const userMessages = conversation.messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: 'No user messages found' },
        { status: 400 }
      );
    }

    // Obține context din Pinecone
    let context = '';
    try {
      const queryEmbedding = await generateEmbedding(lastUserMessage.content);
      const matches = await queryVectors(queryEmbedding, 5, {
        department: conversation.department,
      });
      context = matches
        .map((m: any) => m.metadata?.text || m.text)
        .filter(Boolean)
        .join('\n\n');
    } catch (error) {
      console.error('Error getting context:', error);
      context = '';
    }

    // Construiește sistem prompt
    const systemPrompt = `Ești Maria, asistenta virtuală pentru platforma gobid.ro.
- Ești prietenoasă, profesională și utilă.
- Răspunzi în limba română.
- Folosești contextul furnizat pentru a da răspunsuri precise.
${conversation.department ? `- Utilizatorul este conectat la departamentul: ${conversation.department}` : ''}

Context relevant: ${context || 'Nu există context relevant.'}`;

    // Construiește mesajele
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversation.messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    // Apel GPT-4o
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Nu pot răspunde momentan.';

    // TODO: Salvează răspunsul în baza de date
    // await db.messages.create({
    //   data: {
    //     conversationId,
    //     role: 'assistant',
    //     content: aiResponse,
    //     timestamp: new Date(),
    //   }
    // });

    return NextResponse.json({
      success: true,
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      },
    });
  } catch (error: any) {
    console.error('Error generating AI response:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI response', details: error.message },
      { status: 500 }
    );
  }
}
