import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * API Route - Voice to Text (Whisper)
 * POST /api/voice-to-text
 * Transcrie audio în text folosind OpenAI Whisper
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

    // Validate file size (max 25MB for Whisper API)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 25MB.' },
        { status: 400 }
      );
    }

    // Validate and normalize file type
    const fileType = audioFile.type || '';
    const fileName = audioFile.name || 'audio.webm';
    
    // Whisper API accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm
    const allowedTypes = [
      'audio/webm', 'audio/webm;codecs=opus', 'audio/webm;codecs=vorbis',
      'audio/mp4', 'audio/m4a', 'audio/x-m4a',
      'audio/mpeg', 'audio/mp3', 'audio/mpga',
      'audio/wav', 'audio/wave', 'audio/x-wav'
    ];
    
    // Check if type is valid or if filename has valid extension
    const hasValidType = allowedTypes.some(type => fileType.toLowerCase().includes(type.split('/')[1]?.split(';')[0] || ''));
    const hasValidExtension = /\.(webm|mp3|mp4|m4a|wav|mpga)$/i.test(fileName);
    
    if (!hasValidType && !hasValidExtension) {
      console.error('[voice-to-text] Invalid file type:', fileType, 'File name:', fileName);
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

    console.log('[voice-to-text] Original file type:', fileType, 'File name:', fileName, 'Size:', buffer.length, 'bytes');
    console.log('[voice-to-text] Transcribing as:', fileToTranscribe.name, 'type:', fileToTranscribe.type);

    // Transcribe audio with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fileToTranscribe,
      model: 'whisper-1',
      language: 'ro', // Limba română
      response_format: 'json',
      temperature: 0.2,
      prompt: 'Acesta este un dialog în limba română despre produse, licitații și servicii pe platforma gobid.ro.'
    });

    const transcribedText = transcription.text.trim();

    if (!transcribedText || transcribedText.length === 0) {
      return NextResponse.json(
        { error: 'No speech detected in audio' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      text: transcribedText,
      language: (transcription as any).language || 'ro'
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/voice-to-text:', error);
    
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

