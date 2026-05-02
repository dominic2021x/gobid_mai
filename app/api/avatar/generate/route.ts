/**
 * API Route - Generare Video cu Avatar AI
 * POST /api/avatar/generate
 * Generează automat clipuri video cu avatar uman AI pentru TikTok/Reels/Shorts
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAvatarScript } from '@/lib/video/avatarScript';
import { generateVoiceAudio, saveVoiceAudio } from '@/lib/video/elevenlabs';
import { generateHeyGenVideo, downloadHeyGenVideo } from '@/lib/video/heygen';
import { generateSynthesiaVideo, downloadSynthesiaVideo } from '@/lib/video/synthesia';
import { mergeAvatarVideo } from '@/lib/video/videoMerge';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes for video generation

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      product,
      platform = 'tiktok',
      provider = 'heygen', // 'heygen' | 'synthesia'
      avatarName = 'Ana',
      autoUpload = false,
      logoPath,
    } = body;

    if (!product || !product.title) {
      return NextResponse.json(
        { error: 'Product data is required' },
        { status: 400 }
      );
    }

    // Step 1: Generate script with GPT-4o
    console.log('📝 Generating avatar script...');
    const script = await generateAvatarScript(product, platform, avatarName);
    console.log('✅ Script generated:', script.narration.substring(0, 50) + '...');

    // Step 2: Generate voice audio with ElevenLabs
    console.log('🎙️ Generating voice audio...');
    const audioBuffer = await generateVoiceAudio(script.narration);
    const audioFilename = `avatar_audio_${Date.now()}.mp3`;
    const audioPath = await saveVoiceAudio(audioBuffer, audioFilename);
    console.log('✅ Audio generated:', audioPath);

    // Step 3: Generate avatar video with HeyGen or Synthesia
    console.log(`🎬 Generating avatar video with ${provider}...`);
    
    let avatarVideoUrl: string;
    let avatarVideoPath: string;

    // Upload audio to a publicly accessible URL (needed for HeyGen/Synthesia)
    // For now, we'll use the audio URL or generate video with text-to-speech
    const audioUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/videos/audio/${audioFilename}`
      : undefined;

    if (provider === 'heygen') {
      if (!process.env.HEYGEN_API_KEY) {
        throw new Error('HEYGEN_API_KEY is not configured');
      }

      const heygenVideo = await generateHeyGenVideo(
        script.narration,
        audioUrl, // Use audio URL if available
        {
          avatarId: process.env.AVATAR_ID || 'female_friendly_1',
          aspectRatio: '9:16',
        }
      );

      if (!heygenVideo.videoUrl) {
        throw new Error('HeyGen video URL not available');
      }

      avatarVideoUrl = heygenVideo.videoUrl;
    } else if (provider === 'synthesia') {
      if (!process.env.SYNTHESIA_API_KEY) {
        throw new Error('SYNTHESIA_API_KEY is not configured');
      }

      const synthesiaVideo = await generateSynthesiaVideo(
        script.narration,
        audioUrl,
        {
          avatarId: process.env.AVATAR_ID || 'anna_costume1_cameraA_presenting',
          aspectRatio: '9:16',
        }
      );

      if (!synthesiaVideo.videoUrl) {
        throw new Error('Synthesia video URL not available');
      }

      avatarVideoUrl = synthesiaVideo.videoUrl;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Step 4: Download avatar video
    const videosDir = join(process.cwd(), 'public', 'videos', 'avatars');
    await mkdir(videosDir, { recursive: true });

    const avatarFilename = `avatar_${Date.now()}_${provider}.mp4`;
    avatarVideoPath = join(videosDir, avatarFilename);

    if (provider === 'heygen') {
      await downloadHeyGenVideo(avatarVideoUrl, avatarVideoPath);
    } else {
      await downloadSynthesiaVideo(avatarVideoUrl, avatarVideoPath);
    }

    console.log('✅ Avatar video downloaded:', avatarVideoPath);

    // Step 5: Merge with logo, subtitles, and effects
    console.log('🎞️ Merging video with logo and subtitles...');
    const finalVideoPath = join(videosDir, `final_${avatarFilename}`);

    // Use default logo if not provided
    const logo = logoPath || join(process.cwd(), 'public', 'images', 'logo.png');

    await mergeAvatarVideo({
      avatarVideoPath,
      logoPath: existsSync(logo) ? logo : undefined,
      subtitles: script.subtitles,
      outputPath: finalVideoPath,
      addIntro: true,
      addOutro: true,
      outroText: script.callToAction || 'Descoperă mai multe pe gobid.ro',
    });

    console.log('✅ Final video merged:', finalVideoPath);

    // Step 6: Auto-upload if requested
    let uploadResults = null;
    if (autoUpload) {
      console.log('📤 Auto-uploading video...');
      try {
        const uploadResponse = await fetch(
          new URL('/api/avatar/upload', request.url),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoPath: `/videos/avatars/final_${avatarFilename}`,
              platform,
              title: product.title,
              description: script.narration,
              hashtags: script.hashtags,
            }),
          }
        );

        if (uploadResponse.ok) {
          uploadResults = await uploadResponse.json();
        }
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    // Return results
    const videoUrl = `/videos/avatars/final_${avatarFilename}`;

    return NextResponse.json({
      success: true,
      video: {
        url: videoUrl,
        path: finalVideoPath,
        duration: script.duration,
        platform,
        provider,
      },
      script: {
        narration: script.narration,
        hashtags: script.hashtags,
        callToAction: script.callToAction,
        greeting: script.greeting,
      },
      upload: uploadResults,
    });
  } catch (error: any) {
    console.error('Avatar video generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate avatar video',
        message: error.message,
      },
      { status: 500 }
    );
  }
}


