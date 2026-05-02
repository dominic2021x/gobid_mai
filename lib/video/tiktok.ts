/**
 * TikTok API Integration
 * Postează clipuri video pe TikTok
 */

export interface TikTokUploadOptions {
  title: string;
  description?: string;
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIEND' | 'SELF_ONLY';
  disableDuet?: boolean;
  disableComment?: boolean;
  disableStitch?: boolean;
}

/**
 * Upload video la TikTok
 */
export async function uploadToTikTok(
  videoBuffer: Buffer,
  options: TikTokUploadOptions
): Promise<{ videoId: string; shareUrl: string }> {
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    throw new Error('TIKTOK_ACCESS_TOKEN is not configured');
  }

  try {
    // Step 1: Initialize upload
    const initResponse = await fetch(
      'https://open-api.tiktok.com/video/init/',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: options.title.substring(0, 150),
            description: options.description?.substring(0, 2200) || '',
            privacy_level: options.privacyLevel || 'PUBLIC_TO_EVERYONE',
            disable_duet: options.disableDuet || false,
            disable_comment: options.disableComment || false,
            disable_stitch: options.disableStitch || false,
            video_cover_timestamp_ms: 1000, // 1 second thumbnail
          },
          source_info: {
            source: 'FILE_UPLOAD',
          },
        }),
      }
    );

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      throw new Error(`TikTok init error: ${errorData.error?.message || initResponse.statusText}`);
    }

    const initData = await initResponse.json();
    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl || !publishId) {
      throw new Error('Invalid TikTok init response');
    }

    // Step 2: Upload video file
    // Convert Buffer to Uint8Array for fetch body
    const videoArray = new Uint8Array(videoBuffer);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
      },
      body: videoArray,
    });

    if (!uploadResponse.ok) {
      throw new Error(`TikTok upload error: ${uploadResponse.statusText}`);
    }

    // Step 3: Publish video
    const publishResponse = await fetch(
      'https://open-api.tiktok.com/video/publish/',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json().catch(() => ({}));
      throw new Error(`TikTok publish error: ${errorData.error?.message || publishResponse.statusText}`);
    }

    const publishData = await publishResponse.json();
    const videoId = publishData.data?.video_id;

    return {
      videoId: videoId || publishId,
      shareUrl: `https://www.tiktok.com/@your_account/video/${videoId || publishId}`,
    };
  } catch (error: any) {
    console.error('TikTok upload error:', error);
    throw new Error(`Failed to upload to TikTok: ${error.message}`);
  }
}


