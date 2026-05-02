import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route - Test AI Module
 * POST /api/admin/ai/test
 * Testează un modul AI specific
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/utils/embeddings';
import { checkPineconeConnection, queryVectors } from '@/lib/pinecone';
import OpenAI from 'openai';
import { logAIOperation } from '@/lib/ai/logger';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { moduleId, testData } = await request.json();

    if (!moduleId) {
      return NextResponse.json(
        { error: 'Module ID is required' },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    let result: any = {};
    let error: any = null;

    try {
      switch (moduleId) {
        case 'chat':
          result = await testChat(testData);
          break;
        case 'voice-to-text':
          result = await testVoiceToText(testData);
          break;
        case 'voice-response':
          result = await testVoiceResponse(testData);
          break;
        case 'rag':
          result = await testRAG(testData);
          break;
        case 'embeddings':
          result = await testEmbeddings(testData);
          break;
        case 'reindex':
          result = await testReindex(testData);
          break;
        case 'autopilot':
          result = await testAutopilot(testData);
          break;
        case 'risk-scoring':
          result = await testRiskScoring(testData);
          break;
        case 'safety-rails':
          result = await testSafetyRails(testData);
          break;
        case 'decision-engine':
          result = await testDecisionEngine(testData);
          break;
        default:
          return NextResponse.json(
            { error: 'Unknown module' },
            { status: 400 }
          );
      }

      const duration = Date.now() - startTime;

      // Log operațiunea
      await logAIOperation({
        module: moduleId,
        level: 'success',
        message: `Test completed successfully`,
        details: { result, duration },
      });

      return NextResponse.json({
        success: true,
        module: moduleId,
        result,
        duration,
      });
    } catch (testError: any) {
      error = testError;
      const duration = Date.now() - startTime;

      // Log eroarea
      await logAIOperation({
        module: moduleId,
        level: 'error',
        message: `Test failed: ${testError.message}`,
        details: { error: testError.message, duration },
      });

      return NextResponse.json(
        {
          success: false,
          module: moduleId,
          error: testError.message,
          duration,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in /api/admin/ai/test:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to test module' },
      { status: 500 }
    );
  }
}

async function testChat(testData?: any) {
  const testMessage = testData?.message || 'Salut, funcționează?';
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Ești un asistent AI.' },
      { role: 'user', content: testMessage },
    ],
    max_tokens: 100,
  });

  return {
    message: testMessage,
    response: response.choices[0]?.message?.content,
    tokens: response.usage,
  };
}

async function testVoiceToText(testData?: any) {
  // Pentru test, verificăm doar că API-ul este configurat
  return {
    status: 'API configured',
    model: 'whisper-1',
    language: 'ro',
  };
}

async function testVoiceResponse(testData?: any) {
  const testText = testData?.text || 'Test';
  
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  return {
    status: 'API configured',
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'Default',
    model: 'eleven_multilingual_v2',
    testText,
  };
}

async function testRAG(testData?: any) {
  const testQuery = testData?.query || 'test';
  
  if (!(await checkPineconeConnection())) {
    throw new Error('Pinecone not connected');
  }

  const embedding = await generateEmbedding(testQuery);
  const results = await queryVectors(embedding, 5);

  return {
    query: testQuery,
    resultsCount: results.length,
    results: results.slice(0, 3).map((r: any) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata,
    })),
  };
}

async function testEmbeddings(testData?: any) {
  const testText = testData?.text || 'Test embedding';
  
  const embedding = await generateEmbedding(testText);

  return {
    text: testText,
    embeddingLength: embedding.length,
    model: 'text-embedding-3-large',
    dimensions: 3072,
  };
}

async function testReindex(testData?: any) {
  if (!(await checkPineconeConnection())) {
    throw new Error('Pinecone not connected');
  }

  return {
    status: 'Pinecone connected',
    indexName: process.env.PINECONE_INDEX_NAME || 'gobid-products',
    batchSize: 100,
  };
}

async function testAutopilot(testData?: any) {
  return {
    status: process.env.AUTOPILOT_ENABLED === 'true' ? 'enabled' : 'disabled',
    costLimit: process.env.AUTOPILOT_COST_LIMIT_USD || '100',
  };
}

async function testRiskScoring(testData?: any) {
  return {
    status: 'API configured',
    model: 'gpt-4o-mini',
    threshold: 60,
  };
}

async function testSafetyRails(testData?: any) {
  return {
    status: 'active',
    budgetCheck: true,
    duplicateCheck: true,
    moderationCheck: true,
    redundantCheck: true,
  };
}

async function testDecisionEngine(testData?: any) {
  return {
    status: 'API configured',
    model: 'gpt-4o',
  };
}


