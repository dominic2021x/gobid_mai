/**
 * API Route - Generare Video Auto-Promovare
 * POST /api/video/generate
 * Generează automat clipuri video pentru TikTok/Reels/Shorts
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateVideoScript } from '@/lib/video/scriptGenerator';
import { generateVoiceAudio, saveVoiceAudio } from '@/lib/video/elevenlabs';
import { buildVideo } from '@/lib/video/videoBuilder';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for video generation

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      product,
      platform = 'tiktok',
      images: providedImages,
      autoUpload = false,
    } = body;

    if (!product || !product.title) {
      return NextResponse.json(
        { error: 'Product data is required' },
        { status: 400 }
      );
    }

    // Step 1: Generate script with GPT-4o
    console.log('📝 Generating video script...');
    const script = await generateVideoScript(product, platform);
    console.log('✅ Script generated:', script.narration.substring(0, 50) + '...');

    // Step 2: Generate voice audio with ElevenLabs
    console.log('🎙️ Generating voice audio...');
    const audioBuffer = await generateVoiceAudio(script.narration);
    const audioFilename = `audio_${Date.now()}.mp3`;
    const audioPath = await saveVoiceAudio(audioBuffer, audioFilename);
    console.log('✅ Audio generated:', audioPath);

    // Step 3: Get product images
    let images: string[] = [];
    
    if (providedImages && Array.isArray(providedImages) && providedImages.length > 0) {
      // Use provided images
      images = providedImages.map((img: string) => {
        // Convert URL to file path if needed
        if (img.startsWith('http')) {
          // For now, skip external URLs - would need to download first
          return '';
        }
        return img.startsWith('/') 
          ? join(process.cwd(), 'public', img.substring(1))
          : join(process.cwd(), 'public', 'uploads', img);
      }).filter(Boolean);
    } else {
      // Try to find images from product data
      if (product.images && Array.isArray(product.images)) {
        images = product.images.map((img: string) => {
          if (img.startsWith('http')) return '';
          return img.startsWith('/')
            ? join(process.cwd(), 'public', img.substring(1))
            : join(process.cwd(), 'public', 'uploads', img);
        }).filter(Boolean);
      }
    }

    // Fallback: use placeholder images if none found
    if (images.length === 0) {
      console.warn('⚠️ No images found, using placeholder');
      images = [
        join(process.cwd(), 'public', 'images', 'placeholder.jpg'),
      ];
      // Create placeholder if doesn't exist
      if (!existsSync(images[0])) {
        // Would need to create a placeholder image
        return NextResponse.json(
          { error: 'No images available for product' },
          { status: 400 }
        );
      }
    }

    // Limit to 5 images max
    images = images.slice(0, 5);
    console.log(`📸 Using ${images.length} images`);

    // Step 4: Build video with FFmpeg
    console.log('🎬 Building video...');
    const videoDir = join(process.cwd(), 'public', 'videos');
    await mkdir(videoDir, { recursive: true });

    const videoFilename = `video_${Date.now()}_${platform}.mp4`;
    const videoPath = join(videoDir, videoFilename);

    await buildVideo({
      images,
      audioPath,
      subtitles: script.subtitles,
      outputPath: videoPath,
      duration: script.duration,
    });

    console.log('✅ Video built:', videoPath);

    // Step 5: Auto-upload if requested
    let uploadResults = null;
    if (autoUpload) {
      console.log('📤 Auto-uploading video...');
      try {
        const uploadResponse = await fetch(
          new URL('/api/video/upload', request.url),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoPath: `/videos/${videoFilename}`,
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
    const videoUrl = `/videos/${videoFilename}`;

    return NextResponse.json({
      success: true,
      video: {
        url: videoUrl,
        path: videoPath,
        duration: script.duration,
        platform,
      },
      script: {
        narration: script.narration,
        hashtags: script.hashtags,
        callToAction: script.callToAction,
      },
      upload: uploadResults,
    });
  } catch (error: any) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate video',
        message: error.message,
      },
      { status: 500 }
    );
  }
}


