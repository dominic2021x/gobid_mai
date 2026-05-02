/**
 * Social Media Stats Sync
 * Sincronizează statisticile de pe TikTok, Instagram Reels și YouTube Shorts
 */

import { supabase } from '@/lib/supabase';

export interface SocialStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

/**
 * Obține statisticile unui clip TikTok
 */
export async function getTikTokStats(videoId: string): Promise<SocialStats | null> {
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    console.warn('TIKTOK_ACCESS_TOKEN not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://open.tiktokapis.com/v2/research/video/query/?fields=view_count,like_count,comment_count,share_count`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            and: [
              {
                operation: 'EQ',
                field_name: 'video_id',
                field_values: [videoId],
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`TikTok API error: ${response.statusText}`);
    }

    const data = await response.json();
    const stats = data.data?.videos?.[0];

    if (!stats) return null;

    const views = stats.view_count || 0;
    const likes = stats.like_count || 0;
    const comments = stats.comment_count || 0;
    const shares = stats.share_count || 0;
    const engagementRate = views > 0 
      ? ((likes + comments + shares) / views) * 100 
      : 0;

    return {
      views,
      likes,
      comments,
      shares,
      engagementRate,
    };
  } catch (error: any) {
    console.error('Error getting TikTok stats:', error);
    return null;
  }
}

/**
 * Obține statisticile unui clip Instagram Reels
 */
export async function getInstagramReelsStats(mediaId: string): Promise<SocialStats | null> {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_IG_ID) {
    console.warn('META_ACCESS_TOKEN or META_IG_ID not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${process.env.META_ACCESS_TOKEN}`
    );

    if (!response.ok) {
      throw new Error(`Meta Graph API error: ${response.statusText}`);
    }

    const data = await response.json();
    const insights = data.data || [];

    const impressions = insights.find((i: any) => i.name === 'impressions')?.values?.[0]?.value || 0;
    const reach = insights.find((i: any) => i.name === 'reach')?.values?.[0]?.value || 0;
    const likes = insights.find((i: any) => i.name === 'likes')?.values?.[0]?.value || 0;
    const comments = insights.find((i: any) => i.name === 'comments')?.values?.[0]?.value || 0;
    const shares = insights.find((i: any) => i.name === 'shares')?.values?.[0]?.value || 0;

    const views = Math.max(impressions, reach);
    const engagementRate = views > 0 
      ? ((likes + comments + shares) / views) * 100 
      : 0;

    return {
      views,
      likes,
      comments,
      shares,
      engagementRate,
    };
  } catch (error: any) {
    console.error('Error getting Instagram Reels stats:', error);
    return null;
  }
}

/**
 * Obține statisticile unui clip YouTube Shorts
 */
export async function getYouTubeShortsStats(videoId: string): Promise<SocialStats | null> {
  if (!process.env.YOUTUBE_API_KEY) {
    console.warn('YOUTUBE_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=statistics&key=${process.env.YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.statusText}`);
    }

    const data = await response.json();
    const stats = data.items?.[0]?.statistics;

    if (!stats) return null;

    const views = parseInt(stats.viewCount || '0', 10);
    const likes = parseInt(stats.likeCount || '0', 10);
    const comments = parseInt(stats.commentCount || '0', 10);
    const shares = 0; // YouTube API nu oferă share count direct
    const engagementRate = views > 0 
      ? ((likes + comments) / views) * 100 
      : 0;

    return {
      views,
      likes,
      comments,
      shares,
      engagementRate,
    };
  } catch (error: any) {
    console.error('Error getting YouTube Shorts stats:', error);
    return null;
  }
}

/**
 * Sincronizează statisticile pentru toate clipurile video
 */
export async function syncAllVideoStats(): Promise<void> {
  try {
    // Get all videos with platform info
    const { data: videos, error } = await supabase
      .from('clipuri_video')
      .select('id, produs_id, url, platforme, tiktok_id, instagram_id, youtube_id');

    if (error) throw error;

    if (!videos || videos.length === 0) {
      console.log('No videos to sync');
      return;
    }

    console.log(`Syncing stats for ${videos.length} videos...`);

    for (const video of videos) {
      const platforms = Array.isArray(video.platforme) 
        ? video.platforme 
        : typeof video.platforme === 'string' 
          ? JSON.parse(video.platforme) 
          : [];

      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      let maxEngagementRate = 0;

      // Sync TikTok stats
      if (platforms.includes('tiktok') && video.tiktok_id) {
        const tiktokStats = await getTikTokStats(video.tiktok_id);
        if (tiktokStats) {
          totalViews += tiktokStats.views;
          totalLikes += tiktokStats.likes;
          totalComments += tiktokStats.comments;
          totalShares += tiktokStats.shares;
          maxEngagementRate = Math.max(maxEngagementRate, tiktokStats.engagementRate);
        }
      }

      // Sync Instagram Reels stats
      if (platforms.includes('instagram') || platforms.includes('reels')) {
        if (video.instagram_id) {
          const instagramStats = await getInstagramReelsStats(video.instagram_id);
          if (instagramStats) {
            totalViews += instagramStats.views;
            totalLikes += instagramStats.likes;
            totalComments += instagramStats.comments;
            totalShares += instagramStats.shares;
            maxEngagementRate = Math.max(maxEngagementRate, instagramStats.engagementRate);
          }
        }
      }

      // Sync YouTube Shorts stats
      if (platforms.includes('youtube') || platforms.includes('shorts')) {
        if (video.youtube_id) {
          const youtubeStats = await getYouTubeShortsStats(video.youtube_id);
          if (youtubeStats) {
            totalViews += youtubeStats.views;
            totalLikes += youtubeStats.likes;
            totalComments += youtubeStats.comments;
            totalShares += youtubeStats.shares;
            maxEngagementRate = Math.max(maxEngagementRate, youtubeStats.engagementRate);
          }
        }
      }

      // Update video in database
      if (totalViews > 0 || totalLikes > 0) {
        await supabase
          .from('clipuri_video')
          .update({
            views: totalViews,
            likes: totalLikes,
            comments: totalComments,
            shares: totalShares,
            engagement_rate: maxEngagementRate,
            stats_updated_at: new Date().toISOString(),
          })
          .eq('id', video.id);

        console.log(`✅ Updated stats for video ${video.id}: ${totalViews} views, ${totalLikes} likes`);
      }
    }

    console.log('✅ Video stats sync completed');
  } catch (error: any) {
    console.error('Error syncing video stats:', error);
    throw error;
  }
}


