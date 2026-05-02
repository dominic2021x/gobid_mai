import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Voice Search API - Whisper Transcription + GPT-4 Correction
 * Transcrie vocea și corectează automat textul pentru căutare
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Convert File to Blob
    const audioBlob = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(audioBlob);

    // Transcribe audio with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
      model: 'whisper-1',
      language: 'ro', // Limba română
      response_format: 'json',
    });

    const transcribedText = transcription.text;

    if (!transcribedText || transcribedText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No speech detected' },
        { status: 400 }
      );
    }

    // Corectează textul cu GPT-4 pentru a elimina greșelile de pronunție
    const correctionPrompt = `Ești un asistent care corectează textele dictat vocal în limba română.
Utilizatorul a dictat: "${transcribedText}"

Sarcina ta:
1. Corectează orice greșeli de pronunție sau dictare
2. Păstrează sensul original
3. Returnează DOAR textul corectat, fără explicații
4. Dacă textul este deja corect, returnează-l la fel
5. Asigură-te că textul este optimizat pentru căutare semantică (elimină cuvinte de umplutură dacă e necesar)

Text corectat:`;

    const correctionResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în corectarea textelor dictat vocal în limba română. Returnezi DOAR textul corectat, fără explicații.',
        },
        {
          role: 'user',
          content: correctionPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const correctedText = correctionResponse.choices[0]?.message?.content?.trim() || transcribedText;

    return NextResponse.json({
      transcribed: transcribedText,
      corrected: correctedText,
      query: correctedText, // Query final pentru căutare
    });
  } catch (error: any) {
    console.error('Voice search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process voice search',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

