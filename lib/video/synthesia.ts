/**
 * Synthesia API Integration
 * Alternativă la HeyGen pentru generarea videoclipuri cu avatar
 */

export interface SynthesiaOptions {
  avatarId?: string;
  voiceId?: string;
  background?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  test?: boolean;
}

export interface SynthesiaVideoResponse {
  videoId: string;
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Generează video cu avatar folosind Synthesia API
 */
export async function generateSynthesiaVideo(
  script: string,
  audioUrl?: string,
  options: SynthesiaOptions = {}
): Promise<SynthesiaVideoResponse> {
  if (!process.env.SYNTHESIA_API_KEY) {
    throw new Error('SYNTHESIA_API_KEY is not configured');
  }

  const {
    avatarId = process.env.AVATAR_ID || 'anna_costume1_cameraA_presenting',
    voiceId = 'ro-RO-AlinaNeural', // Microsoft Romanian voice
    background = '#000000',
    aspectRatio = '9:16',
    test = false,
  } = options;

  try {
    // Step 1: Create video generation request
    const requestBody: any = {
      test: test,
      title: 'Gobid.ro Product Video',
      description: 'Auto-generated product promotion video',
      visibility: 'public',
      input: [
        {
          scriptText: script,
          avatar: avatarId,
          background: {
            type: 'color',
            color: background,
          },
          aspectRatio: aspectRatio,
          voice: voiceId,
        },
      ],
    };

    // If custom audio provided
    if (audioUrl) {
      requestBody.input[0].audioUrl = audioUrl;
      delete requestBody.input[0].voice; // Remove voice if using custom audio
    }

    // Step 2: Submit video generation request
    const createResponse = await fetch('https://api.synthesia.io/v2/videos', {
      method: 'POST',
      headers: {
        'Authorization': process.env.SYNTHESIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}));
      throw new Error(
        `Synthesia API error: ${createResponse.status} - ${errorData.message || createResponse.statusText}`
      );
    }

    const createData = await createResponse.json();
    const videoId = createData.id;

    if (!videoId) {
      throw new Error('No video ID returned from Synthesia');
    }

    console.log(`✅ Synthesia video generation started: ${videoId}`);

    // Step 3: Poll for video completion
    const videoData = await pollSynthesiaVideoStatus(videoId);

    return videoData;
  } catch (error: any) {
    console.error('Synthesia video generation error:', error);
    throw new Error(`Failed to generate Synthesia video: ${error.message}`);
  }
}

/**
 * Poll pentru statusul video-ului Synthesia
 */
async function pollSynthesiaVideoStatus(
  videoId: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<SynthesiaVideoResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const statusResponse = await fetch(
        `https://api.synthesia.io/v2/videos/${videoId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': process.env.SYNTHESIA_API_KEY!,
          },
        }
      );

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();
      const status = statusData.status;

      if (status === 'complete') {
        const downloadUrl = statusData.download;
        const thumbnailUrl = statusData.thumbnail;

        return {
          videoId,
          status: 'completed',
          videoUrl: downloadUrl,
          thumbnailUrl,
        };
      } else if (status === 'failed' || status === 'error') {
        throw new Error(`Video generation failed: ${statusData.error || 'Unknown error'}`);
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
 * Descarcă video-ul generat de Synthesia
 */
export async function downloadSynthesiaVideo(
  videoUrl: string,
  outputPath: string
): Promise<string> {
  const { readFile, writeFile, mkdir } = await import('fs/promises');
  const { join } = await import('path');
  const { existsSync } = await import('fs');

  try {
    const outputDir = join(outputPath, '..');
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, buffer);

    return outputPath;
  } catch (error: any) {
    console.error('Error downloading Synthesia video:', error);
    throw new Error(`Failed to download video: ${error.message}`);
  }
}


