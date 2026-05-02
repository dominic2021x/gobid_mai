/**
 * API Route - AI Modules List
 * GET /api/admin/ai/modules
 * Returnează lista tuturor modulelor AI cu status și informații
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkPineconeConnection } from '@/lib/pinecone';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const modules = [
      {
        id: 'chat',
        name: 'Chat AI (GPT-4o)',
        description: 'Chat cu AI folosind GPT-4o și RAG',
        icon: 'ChatBubbleLeftRightIcon' as const,
        status: process.env.OPENAI_API_KEY ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 1000,
          openaiApiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'voice-to-text',
        name: 'Voice-to-Text (Whisper)',
        description: 'Transcriere audio în text folosind Whisper',
        icon: 'MicrophoneIcon' as const,
        status: process.env.OPENAI_API_KEY ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          model: 'whisper-1',
          language: 'ro',
          openaiApiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'voice-response',
        name: 'Voice Response (ElevenLabs)',
        description: 'Text-to-Speech folosind ElevenLabs',
        icon: 'SpeakerWaveIcon' as const,
        status: process.env.ELEVENLABS_API_KEY ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          voiceId: process.env.ELEVENLABS_VOICE_ID || 'Default',
          model: 'eleven_multilingual_v2',
          elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'rag',
        name: 'RAG (Pinecone)',
        description: 'Retrieval Augmented Generation cu Pinecone',
        icon: 'MagnifyingGlassIcon' as const,
        status: (await checkPineconeConnection()) ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          indexName: process.env.PINECONE_INDEX_NAME || 'gobid-products',
          environment: process.env.PINECONE_ENVIRONMENT || 'us-east1-gcp',
          pineconeApiKey: process.env.PINECONE_API_KEY ? '✅ Configured' : '❌ Not configured',
          embeddingModel: 'text-embedding-3-large',
          dimensions: 3072,
        },
      },
      {
        id: 'embeddings',
        name: 'Embeddings Generator',
        description: 'Generare embeddings cu text-embedding-3-large',
        icon: 'SparklesIcon' as const,
        status: process.env.OPENAI_API_KEY ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          model: 'text-embedding-3-large',
          dimensions: 3072,
          openaiApiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'reindex',
        name: 'Reindex (Pinecone)',
        description: 'Indexare produse/pagini în Pinecone',
        icon: 'ArrowPathIcon' as const,
        status: (await checkPineconeConnection()) ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          batchSize: 100,
          indexName: process.env.PINECONE_INDEX_NAME || 'gobid-products',
          pineconeApiKey: process.env.PINECONE_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'autopilot',
        name: 'Autopilot AI',
        description: 'Sistem automat de producție AI',
        icon: 'CpuChipIcon' as const,
        status: process.env.AUTOPILOT_ENABLED === 'true' ? 'active' : 'inactive',
        lastRun: await getLastAutopilotRun(),
        logs: [],
        config: {
          enabled: process.env.AUTOPILOT_ENABLED === 'true',
          costLimit: process.env.AUTOPILOT_COST_LIMIT_USD || '100',
          openaiApiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'risk-scoring',
        name: 'Risk Scoring',
        description: 'Calculare scor de risc pentru task-uri AI',
        icon: 'ShieldCheckIcon',
        status: process.env.OPENAI_API_KEY ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          model: 'gpt-4o-mini',
          threshold: 60,
          openaiApiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
      {
        id: 'safety-rails',
        name: 'Safety Rails',
        description: 'Protecții pentru task-uri AI',
        icon: 'ShieldCheckIcon',
        status: 'active',
        lastRun: null,
        logs: [],
        config: {
          budgetCheck: true,
          duplicateCheck: true,
          moderationCheck: true,
          redundantCheck: true,
        },
      },
      {
        id: 'decision-engine',
        name: 'Decision Engine',
        description: 'Motor de decizie pentru Autopilot',
        icon: 'ChartBarIcon' as const,
        status: process.env.OPENAI_API_KEY ? 'active' : 'inactive',
        lastRun: null,
        logs: [],
        config: {
          model: 'gpt-4o',
          openaiApiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured',
        },
      },
    ];

    return NextResponse.json({
      success: true,
      modules,
    });
  } catch (error: any) {
    console.error('Error in /api/admin/ai/modules:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load modules' },
      { status: 500 }
    );
  }
}

async function getLastAutopilotRun(): Promise<string | null> {
  try {
    if (!supabaseAdmin) {
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from('autopilot_tasks')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data.created_at;
  } catch (error) {
    return null;
  }
}

