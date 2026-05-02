/**
 * HeyGen API Integration
 * Generează videoclipuri cu avatar uman AI care vorbesc
 */

import { readFile } from 'fs/promises';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface HeyGenOptions {
  avatarId?: string; // avatar_id pentru HeyGen v2
  voiceId?: string; // ElevenLabs voice ID pentru sincronizare
  background?: string; // URL sau hex color
  aspectRatio?: '16:9' | '9:16' | '1:1';
  test?: boolean; // Test mode
}

/**
 * Obține o voce validă din lista HeyGen
 */
async function getDefaultVoiceId(): Promise<string> {
  try {
    if (!process.env.HEYGEN_API_KEY) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    const voicesResponse = await fetch('https://api.heygen.com/v2/voices', {
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!voicesResponse.ok) {
      throw new Error(`Failed to fetch voices: ${voicesResponse.statusText}`);
    }

    const voicesData = await voicesResponse.json();
    let voices: any[] = [];
    
    if (voicesData.data && voicesData.data.voices && Array.isArray(voicesData.data.voices)) {
      voices = voicesData.data.voices;
    } else if (Array.isArray(voicesData)) {
      voices = voicesData;
    } else if (voicesData.data && Array.isArray(voicesData.data)) {
      voices = voicesData.data;
    }

    if (!Array.isArray(voices) || voices.length === 0) {
      throw new Error('No voices available in response');
    }

    console.log(`📋 Found ${voices.length} available voices`);

    // Caută o voce feminină (preferabil cu suport pentru locale)
    const femaleVoice = voices.find((v: any) => 
      (v.gender === 'female' || v.gender === 'Female') && v.voice_id
    );
    
    if (femaleVoice?.voice_id) {
      console.log(`✅ Selected female voice: ${femaleVoice.name} (${femaleVoice.voice_id})`);
      return femaleVoice.voice_id;
    }

    // Dacă nu găsește una feminină, folosește prima voce disponibilă
    const firstVoice = voices.find((v: any) => v.voice_id);
    if (firstVoice?.voice_id) {
      console.log(`✅ Selected first available voice: ${firstVoice.name} (${firstVoice.voice_id})`);
      return firstVoice.voice_id;
    }

    throw new Error('No valid voices found');
  } catch (error: any) {
    console.error('Error getting default voice:', error);
    // Fallback la o voce cunoscută (Cassidy - feminină)
    return 'e0cc82c22f414c95b1f25696c732f058';
  }
}

/**
 * Obține primul avatar valid din lista HeyGen
 */
async function getDefaultAvatarId(): Promise<string> {
  try {
    if (!process.env.HEYGEN_API_KEY) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    const avatarsResponse = await fetch('https://api.heygen.com/v2/avatars', {
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!avatarsResponse.ok) {
      throw new Error(`Failed to fetch avatars: ${avatarsResponse.statusText}`);
    }

    const avatarsData = await avatarsResponse.json();
    // HeyGen API v2 returns: { error: null, data: { avatars: [...] } }
    let avatars: any[] = [];
    
    if (avatarsData.data && avatarsData.data.avatars && Array.isArray(avatarsData.data.avatars)) {
      avatars = avatarsData.data.avatars;
    } else if (Array.isArray(avatarsData)) {
      avatars = avatarsData;
    } else if (avatarsData.data && Array.isArray(avatarsData.data)) {
      avatars = avatarsData.data;
    }

    if (!Array.isArray(avatars) || avatars.length === 0) {
      console.warn('⚠️  Unexpected avatars response structure:', JSON.stringify(avatarsData).substring(0, 200));
      throw new Error('No avatars available in response');
    }

    console.log(`📋 Found ${avatars.length} available avatars`);

    // Caută un avatar feminin valid (preferabil "Tiana", "Maria", "Priya", "Michelle", "Abigail")
    const preferredNames = ['Tiana', 'Maria', 'Priya', 'Michelle', 'Abigail'];
    
    for (const name of preferredNames) {
      const avatar = avatars.find((a: any) => {
        const avatarName = (a.avatar_name || a.name || '').toLowerCase();
        return avatarName.includes(name.toLowerCase());
      });
      if (avatar?.avatar_id) {
        console.log(`✅ Selected preferred avatar: ${avatar.avatar_name || avatar.name} (${avatar.avatar_id})`);
        return avatar.avatar_id;
      }
    }

    // Dacă nu găsește unul preferat, caută un avatar feminin
    const femaleAvatar = avatars.find((a: any) => a.gender === 'female' && a.avatar_id);
    if (femaleAvatar?.avatar_id) {
      console.log(`✅ Selected female avatar: ${femaleAvatar.avatar_name} (${femaleAvatar.avatar_id})`);
      return femaleAvatar.avatar_id;
    }

    // Dacă nu găsește unul feminin, folosește primul avatar disponibil cu avatar_id
    const firstValidAvatar = avatars.find((a: any) => a.avatar_id);
    if (firstValidAvatar?.avatar_id) {
      console.log(`✅ Selected first available avatar: ${firstValidAvatar.avatar_name || firstValidAvatar.name} (${firstValidAvatar.avatar_id})`);
      return firstValidAvatar.avatar_id;
    }

    throw new Error('No valid avatars with avatar_id found');
  } catch (error: any) {
    console.error('Error getting default avatar:', error);
    // Fallback la un avatar cunoscut (Abigail - feminin, disponibil)
    return 'Abigail_expressive_2024112501';
  }
}

export interface HeyGenVideoResponse {
  videoId: string;
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Generează video cu avatar folosind HeyGen API
 */
export async function generateHeyGenVideo(
  script: string,
  audioUrl?: string, // URL către audio generat cu ElevenLabs
  options: HeyGenOptions = {}
): Promise<HeyGenVideoResponse> {
  if (!process.env.HEYGEN_API_KEY) {
    throw new Error('HEYGEN_API_KEY is not configured');
  }

  // Get avatar ID - use configured one or fetch a valid one
  let finalAvatarId = options.avatarId || process.env.HEYGEN_AVATAR_ID || process.env.AVATAR_ID;
  
  // Always fetch available avatars to validate and get a default if needed
  // This ensures we use a valid talking_photo_id
  console.log('📋 Fetching available avatars...');
  const defaultAvatarId = await getDefaultAvatarId();
  
  // If no avatar ID configured or if configured one might be invalid, use default
  if (!finalAvatarId || finalAvatarId === 'female_friendly_1') {
    console.log('⚠️  Using default avatar (configured one is invalid or missing)');
    finalAvatarId = defaultAvatarId;
  } else {
    console.log(`✅ Using configured avatar ID: ${finalAvatarId}`);
  }

  // Get voice ID - HeyGen requires HeyGen voice ID, not ElevenLabs!
  let finalVoiceId = options.voiceId || process.env.HEYGEN_VOICE_ID;
  
  // If no voice ID configured or if it's an ElevenLabs voice ID, get a default HeyGen voice
  if (!finalVoiceId || finalVoiceId === process.env.ELEVENLABS_VOICE_ID) {
    console.log('📋 No HeyGen voice ID configured, fetching default voice...');
    finalVoiceId = await getDefaultVoiceId();
  } else {
    console.log(`✅ Using configured voice ID: ${finalVoiceId}`);
  }

  const {
    background = '#000000',
    aspectRatio = '9:16', // Vertical pentru TikTok/Reels/Shorts
    test = false,
  } = options;

  try {
    console.log(`🎬 Using avatar ID: ${finalAvatarId}`);
    console.log(`🎤 Using voice ID: ${finalVoiceId}`);
    
    // Step 1: Create video generation request
    // Convert aspect ratio to dimensions
    const dimensions: { width: number; height: number } = 
      aspectRatio === '9:16' 
        ? { width: 720, height: 1280 } // Vertical (TikTok/Reels/Shorts)
        : aspectRatio === '16:9'
        ? { width: 1280, height: 720 } // Horizontal
        : { width: 1080, height: 1080 }; // Square

    // HeyGen v2 API structure - avatar_id directly in character (not nested)
    const requestBody: any = {
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: finalAvatarId, // avatar_id directly in character (not nested)
            avatar_style: 'normal', // Required field
          },
          voice: {
            type: 'text',
            input_text: script,
            voice_id: finalVoiceId, // HeyGen voice ID (not ElevenLabs!)
            speed: 1.0,
          },
        },
      ],
      dimension: dimensions,
      test: test,
    };

    // Log request structure for debugging
    console.log('📤 HeyGen request structure:', JSON.stringify({
      video_inputs: [{
        character: {
          type: requestBody.video_inputs[0].character.type,
          avatar_id: requestBody.video_inputs[0].character.avatar_id,
          avatar_style: requestBody.video_inputs[0].character.avatar_style,
        },
        voice: {
          type: requestBody.video_inputs[0].voice.type,
          voice_id: requestBody.video_inputs[0].voice.voice_id ? '[SET]' : '[NOT SET]',
        },
      }],
      dimension: requestBody.dimension,
      test: requestBody.test,
    }, null, 2));

    // If custom audio provided, use it instead
    // NOTE: audioUrl must be publicly accessible (not localhost) for HeyGen to access it
    if (audioUrl) {
      // Check if audioUrl is publicly accessible
      if (audioUrl.includes('localhost') || audioUrl.includes('127.0.0.1')) {
        console.warn('⚠️  Audio URL is localhost - HeyGen cannot access it. Using text voice instead.');
        // Keep text voice instead of audio
      } else {
        console.log('🎵 Using custom audio URL:', audioUrl);
        requestBody.video_inputs[0].voice = {
          type: 'audio',
          audio_url: audioUrl,
        };
      }
    }

    // Step 2: Submit video generation request (HeyGen API v2)
    const createResponse = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }
      throw new Error(
        `HeyGen API error: ${createResponse.status} - ${errorData.message || errorData.error?.message || createResponse.statusText}`
      );
    }

    const createData = await createResponse.json();
    // HeyGen v2 returns video_id directly in data, not nested
    const videoId = createData.data?.video_id || createData.video_id;

    if (!videoId) {
      console.error('HeyGen response:', JSON.stringify(createData, null, 2));
      throw new Error('No video ID returned from HeyGen');
    }

    console.log(`✅ HeyGen video generation started: ${videoId}`);

    // Step 3: Poll for video completion (with longer timeout for video generation)
    try {
      const videoData = await pollHeyGenVideoStatus(videoId, 300, 2000); // 10 minutes max
      return videoData;
    } catch (error: any) {
      // If timeout, return the video ID so it can be checked later
      if (error.message.includes('timeout')) {
        console.warn('⚠️  Video generation is taking longer than expected. Video ID:', videoId);
        console.warn('💡 You can check the status later using the video ID or increase the timeout.');
        // Return partial response with video ID for async checking
        return {
          videoId,
          status: 'processing',
          videoUrl: undefined,
          thumbnailUrl: undefined,
        };
      }
      throw error;
    }
  } catch (error: any) {
    console.error('HeyGen video generation error:', error);
    throw new Error(`Failed to generate HeyGen video: ${error.message}`);
  }
}

/**
 * Poll pentru statusul video-ului HeyGen
 */
async function pollHeyGenVideoStatus(
  videoId: string,
  maxAttempts: number = 300, // Increased to 300 attempts (10 minutes at 2s interval)
  intervalMs: number = 2000
): Promise<HeyGenVideoResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // HeyGen v2 uses different endpoint structure
      const statusResponse = await fetch(
        `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
        {
          method: 'GET',
          headers: {
            'X-Api-Key': process.env.HEYGEN_API_KEY!,
            'Accept': 'application/json',
          },
        }
      );

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error(`Status check failed (${statusResponse.status}):`, errorText);
        throw new Error(`Status check failed: ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();
      
      // Log status for debugging (first few attempts)
      if (attempt < 3) {
        console.log(`📊 HeyGen status response (attempt ${attempt + 1}):`, JSON.stringify(statusData, null, 2));
      }
      
      // HeyGen v2 may return status differently
      const status = statusData.data?.status || statusData.status;

      if (status === 'completed' || status === 'succeeded') {
        const videoUrl = statusData.data?.video_url || statusData.data?.url || statusData.video_url;
        const thumbnailUrl = statusData.data?.thumbnail_url || statusData.thumbnail_url;

        return {
          videoId,
          status: 'completed',
          videoUrl,
          thumbnailUrl,
        };
      } else if (status === 'failed' || status === 'error' || status === 'failed_generation') {
        // Log full error details for debugging
        console.error('❌ HeyGen video generation failed. Full status data:', JSON.stringify(statusData, null, 2));
        
        // Extract error message properly
        let errorMessage = 'Unknown error';
        if (statusData.data?.error) {
          if (typeof statusData.data.error === 'string') {
            errorMessage = statusData.data.error;
          } else if (statusData.data.error.message) {
            errorMessage = statusData.data.error.message;
          } else {
            errorMessage = JSON.stringify(statusData.data.error);
          }
        } else if (statusData.error) {
          if (typeof statusData.error === 'string') {
            errorMessage = statusData.error;
          } else if (statusData.error.message) {
            errorMessage = statusData.error.message;
          } else {
            errorMessage = JSON.stringify(statusData.error);
          }
        } else if (statusData.message) {
          errorMessage = statusData.message;
        }
        
        throw new Error(`Video generation failed: ${errorMessage}`);
      }

      // Log progress for debugging
      if (attempt % 10 === 0) {
        const elapsedSeconds = Math.floor((attempt * intervalMs) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        console.log(`⏳ Waiting for video generation... (attempt ${attempt + 1}/${maxAttempts}, ${elapsedMinutes}m ${seconds}s elapsed, status: ${status})`);
      }
      
      // Log every 30 attempts for longer waits
      if (attempt % 30 === 0 && attempt > 0) {
        const elapsedMinutes = Math.floor((attempt * intervalMs) / 60000);
        console.log(`⏳ Still processing... (${elapsedMinutes} minutes elapsed, status: ${status})`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } catch (error: any) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error('Video generation timeout - exceeded max polling attempts');
}

/**
 * Descarcă video-ul generat de HeyGen
 */
export async function downloadHeyGenVideo(
  videoUrl: string,
  outputPath: string
): Promise<string> {
  try {
    // Ensure output directory exists
    const outputDir = join(outputPath, '..');
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Download video
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, buffer);

    return outputPath;
  } catch (error: any) {
    console.error('Error downloading HeyGen video:', error);
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

