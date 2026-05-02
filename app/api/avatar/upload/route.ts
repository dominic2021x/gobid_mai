/**
 * API Route - Upload Video Avatar pe Platforme Social Media
 * POST /api/avatar/upload
 * Postează automat clipuri cu avatar pe TikTok, Instagram Reels și YouTube Shorts
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadToTikTok } from '@/lib/video/tiktok';
import { uploadToMetaReels } from '@/lib/video/metaReels';
import { uploadToYouTubeShorts } from '@/lib/video/youtube';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      videoPath,
      platform, // 'tiktok' | 'reels' | 'shorts' | 'all'
      title,
      description,
      hashtags = [],
    } = body;

    if (!videoPath) {
      return NextResponse.json(
        { error: 'Video path is required' },
        { status: 400 }
      );
    }

    // Resolve video file path
    const fullVideoPath = videoPath.startsWith('/')
      ? join(process.cwd(), 'public', videoPath.substring(1))
      : join(process.cwd(), 'public', 'videos', 'avatars', videoPath);

    if (!existsSync(fullVideoPath)) {
      return NextResponse.json(
        { error: 'Video file not found' },
        { status: 404 }
      );
    }

    // Read video file
    const videoBuffer = await readFile(fullVideoPath);

    // Prepare caption with hashtags
    const caption = `${title || description || ''}\n\n${hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ')}`;

    const results: any = {
      success: true,
      uploads: [],
      errors: [],
    };

    const platformsToUpload = platform === 'all' 
      ? ['tiktok', 'reels', 'shorts']
      : [platform];

    // Upload to each platform
    for (const platformName of platformsToUpload) {
      try {
        let uploadResult;
        
        switch (platformName) {
          case 'tiktok':
            if (!process.env.TIKTOK_ACCESS_TOKEN) {
              throw new Error('TIKTOK_ACCESS_TOKEN not configured');
            }
            uploadResult = await uploadToTikTok(videoBuffer, {
              title,
              description: caption,
            });
            break;

          case 'reels':
            if (!process.env.META_ACCESS_TOKEN || !process.env.META_IG_ID) {
              throw new Error('META_ACCESS_TOKEN or META_IG_ID not configured');
            }
            uploadResult = await uploadToMetaReels(videoBuffer, {
              caption,
            });
            break;

          case 'shorts':
            if (!process.env.YOUTUBE_API_KEY) {
              throw new Error('YOUTUBE_API_KEY not configured');
            }
            uploadResult = await uploadToYouTubeShorts(videoBuffer, {
              title: title || 'Product Video',
              description: caption,
              tags: hashtags,
            });
            break;

          default:
            throw new Error(`Unknown platform: ${platformName}`);
        }

        results.uploads.push({
          platform: platformName,
          ...uploadResult,
        });
      } catch (error: any) {
        console.error(`Error uploading to ${platformName}:`, error);
        results.errors.push({
          platform: platformName,
          error: error.message,
        });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Avatar video upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload avatar video',
        message: error.message,
      },
      { status: 500 }
    );
  }
}


