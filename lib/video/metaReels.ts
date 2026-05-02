/**
 * Meta Graph API Integration - Instagram Reels
 * Postează clipuri video pe Instagram Reels și Facebook
 */

export interface MetaReelsUploadOptions {
  caption?: string;
  coverUrl?: string;
  locationId?: string;
  userId?: string;
}

/**
 * Upload video la Instagram Reels
 */
export async function uploadToMetaReels(
  videoBuffer: Buffer,
  options: MetaReelsUploadOptions
): Promise<{ mediaId: string; permalink: string }> {
  if (!process.env.META_ACCESS_TOKEN) {
    throw new Error('META_ACCESS_TOKEN is not configured');
  }

  const igUserId = process.env.META_IG_ID;
  if (!igUserId) {
    throw new Error('META_IG_ID is not configured');
  }

  try {
    // Step 1: Create media container
    const containerResponse = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: `data:video/mp4;base64,${videoBuffer.toString('base64')}`,
          caption: options.caption || '',
          cover_url: options.coverUrl,
          location_id: options.locationId,
          access_token: process.env.META_ACCESS_TOKEN,
        }),
      }
    );

    if (!containerResponse.ok) {
      const errorData = await containerResponse.json().catch(() => ({}));
      throw new Error(`Meta container error: ${errorData.error?.message || containerResponse.statusText}`);
    }

    const containerData = await containerResponse.json();
    const creationId = containerData.id;

    if (!creationId) {
      throw new Error('Invalid Meta container response');
    }

    // Step 2: Publish the reel
    const publishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: process.env.META_ACCESS_TOKEN,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json().catch(() => ({}));
      throw new Error(`Meta publish error: ${errorData.error?.message || publishResponse.statusText}`);
    }

    const publishData = await publishResponse.json();
    const mediaId = publishData.id;

    // Step 3: Get permalink
    const permalinkResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}?fields=permalink&access_token=${process.env.META_ACCESS_TOKEN}`
    );

    let permalink = `https://www.instagram.com/reel/${mediaId}/`;
    if (permalinkResponse.ok) {
      const permalinkData = await permalinkResponse.json();
      permalink = permalinkData.permalink || permalink;
    }

    return {
      mediaId,
      permalink,
    };
  } catch (error: any) {
    console.error('Meta Reels upload error:', error);
    throw new Error(`Failed to upload to Meta Reels: ${error.message}`);
  }
}


