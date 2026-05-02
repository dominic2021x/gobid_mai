/**
 * YouTube Data API v3 Integration
 * Postează clipuri video pe YouTube Shorts
 */

import { google } from 'googleapis';

export interface YouTubeUploadOptions {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
  categoryId?: string;
}

/**
 * Upload video la YouTube Shorts
 */
export async function uploadToYouTubeShorts(
  videoBuffer: Buffer,
  options: YouTubeUploadOptions
): Promise<{ videoId: string; url: string }> {
  if (!process.env.YOUTUBE_API_KEY && !process.env.YOUTUBE_CLIENT_ID) {
    throw new Error('YouTube credentials not configured');
  }

  try {
    // For YouTube, we need OAuth2 authentication
    // This is a simplified version - in production, you'd need proper OAuth flow
    const auth = new google.auth.GoogleAuth({
      credentials: process.env.YOUTUBE_CLIENT_SECRET
        ? {
            client_id: process.env.YOUTUBE_CLIENT_ID,
            client_secret: process.env.YOUTUBE_CLIENT_SECRET,
            refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
          }
        : undefined,
      scopes: ['https://www.googleapis.com/auth/youtube.upload'],
    });

    const youtube = google.youtube({
      version: 'v3',
      auth,
    });

    // Upload video
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: options.title.substring(0, 100),
          description: options.description?.substring(0, 5000) || '',
          tags: options.tags || [],
          categoryId: options.categoryId || '22', // People & Blogs
          defaultLanguage: 'ro',
          defaultAudioLanguage: 'ro',
        },
        status: {
          privacyStatus: options.privacyStatus || 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: videoBuffer,
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error('No video ID returned from YouTube');
    }

    return {
      videoId,
      url: `https://www.youtube.com/shorts/${videoId}`,
    };
  } catch (error: any) {
    console.error('YouTube upload error:', error);
    throw new Error(`Failed to upload to YouTube: ${error.message}`);
  }
}


