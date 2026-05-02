/**
 * ElevenLabs Text-to-Speech Wrapper
 * Generează voce naturală feminină pentru video-uri
 */

export interface ElevenLabsOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

/**
 * Generează fișier audio folosind ElevenLabs TTS
 */
export async function generateVoiceAudio(
  text: string,
  options: ElevenLabsOptions = {}
): Promise<Buffer> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const {
    voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Romanian female voice
    stability = 0.6, // Increased for more natural Romanian speech
    similarityBoost = 0.8, // Increased for better Romanian pronunciation
    style = 0.0,
    useSpeakerBoost = true,
  } = options;

  // Clean text - remove pause markers for ElevenLabs
  const cleanText = text.replace(/\//g, ',').replace(/\s+/g, ' ').trim();

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_multilingual_v2', // Supports Romanian perfectly
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `ElevenLabs API error: ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    // Convert response to buffer
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    console.error('Error generating voice audio:', error);
    throw new Error(`Failed to generate voice audio: ${error.message}`);
  }
}

/**
 * Salvează audio-ul generat într-un fișier
 */
export async function saveVoiceAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const videosDir = path.join(process.cwd(), 'public', 'videos', 'audio');
  await fs.mkdir(videosDir, { recursive: true });

  const filePath = path.join(videosDir, filename);
  await fs.writeFile(filePath, audioBuffer);

  return filePath;
}

