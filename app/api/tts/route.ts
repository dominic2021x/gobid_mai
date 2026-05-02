/**
 * API Route pentru Text-to-Speech
 * Generează audio cu voce feminină realistă
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTTSAudio, checkTTSAvailable } from '@/lib/ai/tts';
import { loadResponseConfig } from '@/lib/ai/response-config';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    // Verifică dacă TTS e disponibil
    const isAvailable = await checkTTSAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        { 
          error: 'TTS not available',
          message: 'Edge TTS nu este instalat. Rulează: pip install edge-tts',
          fallback: true,
        },
        { status: 503 }
      );
    }

    const { text, voice, rate, pitch, volume, addNaturalPauses } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Încarcă configurația personalizată (dacă e disponibilă)
    // Notă: loadResponseConfig funcționează doar pe client, deci aici folosim doar parametrii
    const shouldAddPauses = addNaturalPauses !== false;

    // Generează audio TTS
    const audioBuffer = await generateTTSAudio(text, {
      voice,
      rate,
      pitch,
      volume,
      addNaturalPauses: shouldAddPauses,
    });

    // Returnează audio ca stream
    // Convert Buffer to Uint8Array pentru NextResponse
    const audioUint8Array = new Uint8Array(audioBuffer);
    return new NextResponse(audioUint8Array, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      {
        error: 'Error generating TTS',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// GET pentru streaming
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const text = searchParams.get('text');
  const voice = searchParams.get('voice') || undefined;
  const addNaturalPauses = searchParams.get('natural') !== 'false';

  if (!text) {
    return NextResponse.json(
      { error: 'Text parameter is required' },
      { status: 400 }
    );
  }

  try {
    const audioBuffer = await generateTTSAudio(text, {
      voice,
      addNaturalPauses,
    });

    // Convert Buffer to Uint8Array pentru NextResponse
    const audioUint8Array = new Uint8Array(audioBuffer);
    return new NextResponse(audioUint8Array, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}


