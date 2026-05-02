/**
 * API Route - Test Video Generation
 * POST /api/avatar/test
 * Generează un clip video de test complet în limba română
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAutoPromoVideo } from '@/lib/video/autoPromo';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes

export async function POST(request: NextRequest) {
  try {
    console.log('🎬 Starting test video generation...');

    // Verifică API keys
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'OPENAI_API_KEY is not configured',
          message: 'OpenAI API key is required for script generation',
        },
        { status: 500 }
      );
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'ELEVENLABS_API_KEY is not configured',
          message: 'ElevenLabs API key is required for voice generation',
        },
        { status: 500 }
      );
    }

    if (!process.env.HEYGEN_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'HEYGEN_API_KEY is not configured',
          message: 'HeyGen API key is required for video generation',
        },
        { status: 500 }
      );
    }

    // Produs de test - simplificat pentru video scurt
    const testProduct = {
      id: 'test-001',
      title: 'Apartament 3 camere în Cluj',
      description: 'Apartament modern cu 3 camere în centrul Clujului. Preț sub 90.000 EUR.',
      price: 89000,
      category: 'Imobiliare',
      location: 'Cluj-Napoca',
      features: ['3 camere', 'Central', 'Modern'], // Reduced features for short video
    };

    console.log('📦 Test product:', testProduct.title);

    // Generează video-ul
    console.log('🚀 Calling generateAutoPromoVideo...');
    const result = await generateAutoPromoVideo(testProduct, {
      platform: 'tiktok',
      provider: 'heygen',
      avatarName: 'Ana',
      autoUpload: false, // Nu postăm automat pentru test
    });

    console.log('📊 Result:', { success: result.success, error: result.error });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to generate test video',
          message: result.error || 'Unknown error occurred during video generation',
          details: result,
        },
        { status: 500 }
      );
    }

    // Returnează rezultatul
    return NextResponse.json({
      success: true,
      message: 'Test video generated successfully',
      video: {
        url: result.video.url,
        path: result.video.path,
        duration: result.video.duration,
        platform: result.video.platform,
      },
      script: {
        narration: result.script.narration,
        hashtags: result.script.hashtags,
        callToAction: result.script.callToAction,
      },
      product: testProduct,
    });
  } catch (error: any) {
    console.error('❌ Test video generation error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate test video',
        message: error.message || 'Unknown error occurred',
        type: error.name || 'Error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// GET pentru a verifica statusul
export async function GET() {
  return NextResponse.json({
    message: 'Test Video Generation API',
    endpoint: 'POST /api/avatar/test',
    description: 'Generează un clip video de test complet în limba română cu avatar AI',
  });
}

