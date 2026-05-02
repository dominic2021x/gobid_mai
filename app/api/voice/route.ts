import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route - Text to Speech (ElevenLabs + OpenAI TTS fallback)
 * POST /api/voice
 * Convertește text în voce naturală folosind ElevenLabs (foarte natural) sau OpenAI TTS (fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

/**
 * Generează audio folosind ElevenLabs (foarte natural)
 */
async function generateWithElevenLabs(text: string, voiceId?: string): Promise<Buffer | null> {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return null;
    }

    // Voci ElevenLabs recomandate pentru română:
    // - '21m00Tcm4TlvDq8ikWAM' (Rachel - feminină, naturală) ⭐ RECOMANDAT
    // - 'EXAVITQu4vr4xnSDxMaL' (Bella - feminină, dulce)
    // - 'VR6AewLTigWG4xSOukaG' (Arnold - masculină, caldă)
    // - 'ThT5KcBeYPX3keUQqHPh' (Domi - feminină, expresivă)
    const defaultVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel - cea mai naturală pentru română
    const finalVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || defaultVoiceId;

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // Model multilingvistic (suportă română)
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('ElevenLabs API error:', response.status, errorText);
      return null;
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return audioBuffer;
  } catch (error: any) {
    console.warn('ElevenLabs error:', error.message);
    return null;
  }
}

/**
 * Generează audio folosind OpenAI TTS (fallback)
 */
async function generateWithOpenAI(text: string, voice?: string): Promise<Buffer | null> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return null;
    }

    const selectedVoice = voice || process.env.OPENAI_TTS_VOICE || 'nova';
    const model = process.env.OPENAI_TTS_MODEL || 'tts-1-hd';
    
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const finalVoice = validVoices.includes(selectedVoice) ? selectedVoice : 'nova';
    
    const response = await openai.audio.speech.create({
      model: model as 'tts-1' | 'tts-1-hd',
      voice: finalVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return audioBuffer;
  } catch (error: any) {
    console.warn('OpenAI TTS error:', error.message);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voice, provider, voiceId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Verifică dacă TTS este enabled (doar dacă există token de autentificare)
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        
        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        });

        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          const { data: settingsRow } = await supabaseAdmin
            .from('user_settings')
            .select('data')
            .eq('user_id', user.id)
            .eq('category', 'tts')
            .maybeSingle();

          const settingsData = settingsRow?.data as { enabled?: boolean } | undefined;
          const enabled = settingsData?.enabled !== undefined ? settingsData.enabled : false;
          
          if (!enabled) {
            return NextResponse.json(
              { error: 'TTS is disabled', message: 'Text-to-speech este dezactivat în setări' },
              { status: 403 }
            );
          }
        }
      } catch (error) {
        // Continuă dacă verificarea eșuează (pentru compatibilitate)
        console.warn('Could not check TTS enabled status:', error);
      }
    }

    // Determină provider-ul: 'elevenlabs' (default dacă e configurat), 'openai', sau 'auto' (încearcă ElevenLabs, apoi OpenAI)
    // Verifică și preferința din localStorage (dacă e disponibilă în browser)
    let selectedProvider = provider || process.env.TTS_PROVIDER || 'auto';
    
    // Dacă nu e specificat în request, verifică localStorage (doar dacă e în browser)
    if (!provider && typeof window !== 'undefined') {
      const savedProvider = localStorage.getItem('tts_provider');
      if (savedProvider && ['auto', 'elevenlabs', 'openai'].includes(savedProvider)) {
        selectedProvider = savedProvider;
      }
    }

    let audioBuffer: Buffer | null = null;
    let usedProvider = '';

    // Încearcă ElevenLabs dacă este configurat și este provider-ul selectat sau 'auto'
    if ((selectedProvider === 'elevenlabs' || selectedProvider === 'auto') && process.env.ELEVENLABS_API_KEY) {
      audioBuffer = await generateWithElevenLabs(text, voiceId);
      if (audioBuffer) {
        usedProvider = 'elevenlabs';
      }
    }

    // Fallback la OpenAI dacă ElevenLabs nu a funcționat sau dacă este selectat explicit
    if (!audioBuffer && (selectedProvider === 'openai' || selectedProvider === 'auto')) {
      audioBuffer = await generateWithOpenAI(text, voice);
      if (audioBuffer) {
        usedProvider = 'openai';
      }
    }

    if (!audioBuffer) {
      return NextResponse.json(
        { error: 'No TTS provider available. Please configure ELEVENLABS_API_KEY or OPENAI_API_KEY' },
        { status: 500 }
      );
    }

    // Returnează audio direct ca MP3
    // Convertim Buffer la Uint8Array pentru NextResponse
    const audioArray = new Uint8Array(audioBuffer);
    return new NextResponse(audioArray, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
        'X-TTS-Provider': usedProvider, // Header pentru debugging
      },
    });

  } catch (error: any) {
    console.error('Error in /api/voice:', error);
    
    return NextResponse.json(
      { error: 'Failed to generate voice response', details: error.message },
      { status: 500 }
    );
  }
}

