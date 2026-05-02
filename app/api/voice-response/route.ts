/**
 * API Route - Text to Speech (ElevenLabs)
 * POST /api/voice-response
 * Convertește text în voce naturală folosind ElevenLabs
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, voiceId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Folosește voice ID din body sau din env, sau default
    const selectedVoiceId = voiceId || 
                           process.env.ELEVENLABS_VOICE_ID || 
                           'EXAVITQu4vr4xnSDxMaL'; // Default Romanian female voice

    // Trimite request la ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2', // Suportă română
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `ElevenLabs API error: ${response.status}`);
    }

    // Obține audio ca buffer și returnează direct ca audio/mpeg
    const audioBuffer = await response.arrayBuffer();

    // Returnează audio direct ca MP3
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('Error in /api/voice-response:', error);
    
    let errorMessage = 'Failed to generate voice response';
    if (error.message?.includes('API key')) {
      errorMessage = 'ElevenLabs API key not configured';
    } else if (error.message?.includes('voice')) {
      errorMessage = 'Invalid voice ID';
    }

    return NextResponse.json(
      { error: errorMessage, details: error.message },
      { status: 500 }
    );
  }
}

