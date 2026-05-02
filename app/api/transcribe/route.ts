import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route - Transcribe Audio (Whisper)
 * POST /api/transcribe
 * Transcrie audio în text folosind OpenAI Whisper API
 * Primește FormData cu cheia "file" și numele "recording.webm"
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('[transcribe] OpenAI API key not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('file') as File; // Cheia este "file", nu "audio"

    if (!audioFile) {
      console.error('[transcribe] No file provided in FormData');
      return NextResponse.json(
        { error: 'No audio file provided. Expected FormData key: "file"' },
        { status: 400 }
      );
    }

    console.log('[transcribe] Received file:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    });

    // Validate file size (max 25MB for Whisper API)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      console.error('[transcribe] File too large:', audioFile.size);
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 25MB.' },
        { status: 400 }
      );
    }

    // Validate file size minimum
    if (audioFile.size < 100) {
      console.error('[transcribe] File too small:', audioFile.size);
      return NextResponse.json(
        { error: 'Audio file too small. Minimum size is 100 bytes.' },
        { status: 400 }
      );
    }

    // Validate file type - Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm
    const allowedTypes = [
      'audio/webm', 'audio/webm;codecs=opus', 'audio/webm;codecs=vorbis',
      'audio/mp4', 'audio/m4a', 'audio/x-m4a',
      'audio/mpeg', 'audio/mp3', 'audio/mpga',
      'audio/wav', 'audio/wave', 'audio/x-wav'
    ];
    
    const fileType = audioFile.type || '';
    const fileName = audioFile.name || 'recording.webm';
    
    const hasValidType = allowedTypes.some(type => 
      fileType.toLowerCase().includes(type.split('/')[1]?.split(';')[0] || '')
    );
    const hasValidExtension = /\.(webm|mp3|mp4|m4a|wav|mpga)$/i.test(fileName);
    
    if (!hasValidType && !hasValidExtension) {
      console.error('[transcribe] Invalid file type:', fileType, 'filename:', fileName);
      return NextResponse.json(
        { 
          error: `Invalid audio file format. Received type: ${fileType || 'unknown'}, filename: ${fileName}. Supported: webm, mp3, mp4, m4a, wav` 
        },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const audioBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    // Determine correct format for Whisper API
    let whisperFormat: string;
    let whisperType: string;
    
    const normalizedType = fileType.toLowerCase();
    if (normalizedType.includes('webm') || normalizedType.includes('opus')) {
      whisperFormat = 'webm';
      whisperType = 'audio/webm';
    } else if (normalizedType.includes('mp4') || normalizedType.includes('m4a')) {
      whisperFormat = 'm4a';
      whisperType = 'audio/mp4';
    } else if (normalizedType.includes('mp3') || normalizedType.includes('mpeg') || normalizedType.includes('mpga')) {
      whisperFormat = 'mp3';
      whisperType = 'audio/mpeg';
    } else if (normalizedType.includes('wav')) {
      whisperFormat = 'wav';
      whisperType = 'audio/wav';
    } else {
      // Default to webm (most compatible)
      whisperFormat = 'webm';
      whisperType = 'audio/webm';
    }

    // Create File object with correct format for Whisper API
    const fileToTranscribe = new File(
      [buffer], 
      `recording.${whisperFormat}`, 
      { type: whisperType }
    );

    console.log('[transcribe] Original file type:', fileType, 'name:', fileName, 'size:', buffer.length, 'bytes');
    console.log('[transcribe] Transcribing as:', fileToTranscribe.name, 'type:', fileToTranscribe.type);

    // Transcribe audio with Whisper API
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: fileToTranscribe,
        model: 'whisper-1',
        language: 'ro', // Limba română
        response_format: 'json',
        temperature: 0.0, // Temperatură mai mică pentru mai multă acuratețe
        prompt: `Acesta este un dialog în limba română despre căutare de produse pe platforma gobid.ro.
Cuvinte comune: apartament, camere, Brașov, București, Cluj, Timișoara, Iași, Constanța.
Numere: unu, doi, trei, patru, cinci, șase, șapte, opt, nouă, zece.
Context: utilizatorul caută produse, locuințe, mașini, electronice, etc.`
      });

      let transcribedText = transcription.text.trim();

      if (!transcribedText || transcribedText.length === 0) {
        console.warn('[transcribe] No speech detected in audio');
        return NextResponse.json(
          { error: 'No speech detected in audio' },
          { status: 400 }
        );
      }

      console.log('[transcribe] Raw transcription:', transcribedText);

      // Corectează textul cu GPT-4 pentru a elimina greșelile de pronunție și transcriere
      try {
        const correctionPrompt = `Ești un asistent care corectează textele dictat vocal în limba română pentru căutare de produse.

Textul dictat (poate conține greșeli de pronunție): "${transcribedText}"

Sarcina ta:
1. Corectează orice greșeli de pronunție sau dictare (ex: "Atame" → "Apartament", "brășov" → "Brașov")
2. Corectează numele de orașe: Brașov, București, Cluj, Timișoara, Iași, Constanța
3. IMPORTANT - Corectează numerele pentru substantive feminine/neutre:
   - "doi camere" → "două camere" (corect: două camere, două băi, două uși, două roți)
   - "doi dormitoare" → "două dormitoare"
   - "doi bai" → "două băi"
   - Păstrează "două" pentru camere, băi, uși, roți, dormitoare, etc. (90% din vocabular)
   - Transformă doar alte numere: "trei" → "3", "patru" → "4", etc.
4. Păstrează sensul original și structura propoziției
5. Returnează DOAR textul corectat, fără explicații, fără punctuație finală
6. Dacă textul este deja corect, returnează-l la fel

Exemple de corecții:
- "Atame de 3 camere în brășov" → "Apartament de 3 camere în Brașov"
- "caut un apartament cu doi camere în brasov" → "Apartament cu două camere în Brașov"
- "vreau un apartament cu două camere în bucuresti" → "Apartament cu două camere în București"
- "casa cu doi dormitoare" → "Casa cu două dormitoare"
- "masina cu doi usi" → "Mașină cu două uși"

Text corectat:`;

        const correctionResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Ești un expert în corectarea textelor dictat vocal în limba română. Corectezi doar greșelile, păstrând sensul original.'
            },
            {
              role: 'user',
              content: correctionPrompt
            }
          ],
          temperature: 0.1, // Foarte mică pentru acuratețe maximă
          max_tokens: 200
        });

        const correctedText = correctionResponse.choices[0]?.message?.content?.trim() || transcribedText;
        
        // Dacă corecția este diferită de original, o folosim
        if (correctedText && correctedText !== transcribedText && correctedText.length > 0) {
          console.log('[transcribe] Corrected transcription:', correctedText);
          transcribedText = correctedText;
        } else {
          console.log('[transcribe] No correction needed or correction failed, using original');
        }
      } catch (correctionError: any) {
        console.warn('[transcribe] Correction failed, using original transcription:', correctionError.message);
        // Continuăm cu transcrierea originală dacă corecția eșuează
      }

      console.log('[transcribe] Final transcription:', transcribedText);
      return NextResponse.json({
        success: true,
        text: transcribedText,
        language: (transcription as any).language || 'ro'
      }, { status: 200 });

    } catch (whisperError: any) {
      // Log complete error from Whisper API
      console.error('[transcribe] Whisper API error:', whisperError);
      
      // Try to get full error message
      let errorMessage = 'Failed to transcribe audio';
      if (whisperError.message) {
        errorMessage = whisperError.message;
        console.error('[transcribe] Whisper API error message:', whisperError.message);
      }
      if (whisperError.response) {
        console.error('[transcribe] Whisper API error response:', whisperError.response);
        try {
          const errorText = JSON.stringify(whisperError.response);
          console.error('[transcribe] Whisper API error response (full):', errorText);
        } catch (e) {
          console.error('[transcribe] Could not stringify error response');
        }
      }
      
      if (whisperError.message?.includes('API key')) {
        errorMessage = 'OpenAI API key not configured or invalid';
      } else if (whisperError.message?.includes('file')) {
        errorMessage = 'Invalid audio file format';
      }

      return NextResponse.json(
        { error: errorMessage, details: whisperError.message },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[transcribe] Error in /api/transcribe:', error);
    
    let errorMessage = 'Failed to transcribe audio';
    if (error.message?.includes('API key')) {
      errorMessage = 'OpenAI API key not configured';
    } else if (error.message?.includes('file')) {
      errorMessage = 'Invalid audio file format';
    }

    return NextResponse.json(
      { error: errorMessage, details: error.message },
      { status: 500 }
    );
  }
}


