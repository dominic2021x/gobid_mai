/**
 * API Route - Test Vocile Disponibile
 * GET /api/voice/test
 * Returnează lista de voci disponibile și permite testarea lor
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const elevenLabsVoices = [
      {
        id: '21m00Tcm4TlvDq8ikWAM',
        name: 'Rachel',
        provider: 'elevenlabs',
        description: 'Voce feminină, foarte naturală și plăcută (RECOMANDAT pentru română) ⭐',
        gender: 'feminină',
        characteristics: ['foarte naturală', 'plăcută', 'caldă', 'umană'],
        recommended: true,
      },
      {
        id: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Bella',
        provider: 'elevenlabs',
        description: 'Voce feminină, dulce și melodioasă',
        gender: 'feminină',
        characteristics: ['dulce', 'melodioasă', 'expresivă'],
        recommended: false,
      },
      {
        id: 'ThT5KcBeYPX3keUQqHPh',
        name: 'Domi',
        provider: 'elevenlabs',
        description: 'Voce feminină, expresivă și energică',
        gender: 'feminină',
        characteristics: ['expresivă', 'energică', 'vibrantă'],
        recommended: false,
      },
      {
        id: 'VR6AewLTigWG4xSOukaG',
        name: 'Arnold',
        provider: 'elevenlabs',
        description: 'Voce masculină, caldă și prietenoasă',
        gender: 'masculină',
        characteristics: ['caldă', 'prietenoasă', 'relaxată'],
        recommended: false,
      },
    ];

    const openAIVoices = [
      {
        id: 'nova',
        name: 'Nova',
        provider: 'openai',
        description: 'Voce feminină, naturală și plăcută',
        gender: 'feminină',
        characteristics: ['naturală', 'plăcută', 'caldă'],
        recommended: false,
      },
      {
        id: 'shimmer',
        name: 'Shimmer',
        description: 'Voce feminină, dulce și melodioasă',
        gender: 'feminină',
        characteristics: ['dulce', 'melodioasă', 'expresivă'],
        recommended: false,
      },
      {
        id: 'fable',
        name: 'Fable',
        description: 'Voce feminină, expresivă și plăcută',
        gender: 'feminină',
        characteristics: ['expresivă', 'plăcută', 'energetică'],
        recommended: false,
      },
      {
        id: 'echo',
        name: 'Echo',
        description: 'Voce masculină, caldă și prietenoasă',
        gender: 'masculină',
        characteristics: ['caldă', 'prietenoasă', 'relaxată'],
        recommended: false,
      },
      {
        id: 'onyx',
        name: 'Onyx',
        description: 'Voce masculină, profundă și autoritară',
        gender: 'masculină',
        characteristics: ['profundă', 'autoritară', 'serioasă'],
        recommended: false,
      },
      {
        id: 'alloy',
        name: 'Alloy',
        description: 'Voce neutră, echilibrată',
        gender: 'neutră',
        characteristics: ['echilibrată', 'versatilă', 'clară'],
        recommended: false,
      },
    ];

    const allVoices = [...elevenLabsVoices, ...openAIVoices];

    return NextResponse.json({
      voices: allVoices,
      models: [
        {
          id: 'tts-1',
          name: 'TTS-1',
          description: 'Rapid, calitate bună',
          speed: 'rapid',
        },
        {
          id: 'tts-1-hd',
          name: 'TTS-1-HD',
          description: 'Calitate superioară, mai lent (RECOMANDAT)',
          speed: 'moderat',
          recommended: true,
        },
      ],
      currentProvider: process.env.TTS_PROVIDER || 'auto',
      currentElevenLabsVoice: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
      currentOpenAIVoice: process.env.OPENAI_TTS_VOICE || 'nova',
      currentModel: process.env.OPENAI_TTS_MODEL || 'tts-1-hd',
      note: 'Pentru a schimba provider-ul, setați TTS_PROVIDER=elevenlabs sau TTS_PROVIDER=openai. Pentru auto (fallback), lăsați neconfigurat sau setați TTS_PROVIDER=auto.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get voice options', details: error.message },
      { status: 500 }
    );
  }
}

