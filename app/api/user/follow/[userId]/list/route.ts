import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'followers' sau 'following'

    if (!userId) {
      return NextResponse.json({ error: 'Lipsește ID-ul utilizatorului' }, { status: 400 });
    }

    if (!type || (type !== 'followers' && type !== 'following')) {
      return NextResponse.json({ error: 'Tip invalid. Folosește "followers" sau "following"' }, { status: 400 });
    }

    const admin = supabaseAdmin;

    try {
      let userFollowsQuery;
      
      if (type === 'followers') {
        // Get users who follow this user (followed_user_id = userId)
        userFollowsQuery = admin
          .from('user_follows')
          .select('follower_user_id, created_at')
          .eq('followed_user_id', userId)
          .order('created_at', { ascending: false });
      } else {
        // Get users that this user follows (follower_user_id = userId)
        userFollowsQuery = admin
          .from('user_follows')
          .select('followed_user_id, created_at')
          .eq('follower_user_id', userId)
          .order('created_at', { ascending: false });
      }

      const { data: follows, error: followsError } = await userFollowsQuery;

      // If table doesn't exist (error code 42P01), return empty array
      if (followsError && followsError.code === '42P01') {
        return NextResponse.json({ users: [] });
      }

      if (followsError) {
        console.error('Error fetching follows list:', followsError);
        return NextResponse.json({ error: 'Eroare la încărcarea listei' }, { status: 500 });
      }

      if (!follows || follows.length === 0) {
        return NextResponse.json({ users: [] });
      }

      // Get user IDs (rows have either follower_user_id or followed_user_id depending on query)
      type FollowRow = { follower_user_id?: string; followed_user_id?: string; created_at: string };
      const rows = follows as FollowRow[];
      const userIds = type === 'followers'
        ? rows.map(f => f.follower_user_id).filter((id): id is string => id != null)
        : rows.map(f => f.followed_user_id).filter((id): id is string => id != null);

      if (userIds.length === 0) {
        return NextResponse.json({ users: [] });
      }

      // Create a map of userId -> created_at from follows
      const createdAtMap = new Map<string, string>();
      rows.forEach(f => {
        const id = type === 'followers' ? f.follower_user_id : f.followed_user_id;
        if (id != null) createdAtMap.set(id, f.created_at);
      });

      // Get user profiles in batch
      const { data: profiles, error: profilesError } = await admin
        .from('user_profiles')
        .select('user_id, first_name, last_name, avatar_url, city, country')
        .in('user_id', userIds);

      if (profilesError && profilesError.code !== 'PGRST116') {
        console.error('Error fetching profiles:', profilesError);
      }

      // Create a map of userId -> profile
      const profilesMap = new Map(
        (profiles || []).map(p => [p.user_id, p])
      );

      // Get reviews for all users in batch to calculate ratings
      const { data: allReviews, error: reviewsError } = await admin
        .from('user_reviews')
        .select('rating, reviewed_user_id')
        .in('reviewed_user_id', userIds);

      if (reviewsError && reviewsError.code !== 'PGRST116') {
        console.error('Error fetching reviews:', reviewsError);
      }

      // Calculate ratings for each user
      const ratingsMap = new Map();
      if (allReviews && allReviews.length > 0) {
        const reviewsByUser = new Map<string, number[]>();
        allReviews.forEach((review: any) => {
          const userIdItem = review.reviewed_user_id;
          const rating = Number(review.rating);
          if (!isNaN(rating) && rating >= 1 && rating <= 5) {
            if (!reviewsByUser.has(userIdItem)) {
              reviewsByUser.set(userIdItem, []);
            }
            reviewsByUser.get(userIdItem)!.push(rating);
          }
        });

        reviewsByUser.forEach((ratings, userIdItem) => {
          const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
          const positiveCount = ratings.filter(r => r >= 4).length;
          const positivePercentage = Math.round((positiveCount / ratings.length) * 100 * 10) / 10;
          ratingsMap.set(userIdItem, {
            averageRating: Math.round(avgRating * 10) / 10,
            reviewCount: ratings.length,
            positivePercentage
          });
        });
      }

      // Get followers/following counts for each user
      const followersCountMap = new Map<string, number>();
      const followingCountMap = new Map<string, number>();

      try {
        // Get followers count for each user (users who follow them)
        const { data: followersData } = await admin
          .from('user_follows')
          .select('followed_user_id')
          .in('followed_user_id', userIds);

        if (followersData) {
          followersData.forEach((follow: any) => {
            const userIdItem = follow.followed_user_id;
            const current = followersCountMap.get(userIdItem) || 0;
            followersCountMap.set(userIdItem, current + 1);
          });
        }

        // Get following count for each user (users they follow)
        const { data: followingData } = await admin
          .from('user_follows')
          .select('follower_user_id')
          .in('follower_user_id', userIds);

        if (followingData) {
          followingData.forEach((follow: any) => {
            const userIdItem = follow.follower_user_id;
            const current = followingCountMap.get(userIdItem) || 0;
            followingCountMap.set(userIdItem, current + 1);
          });
        }
      } catch (followStatsError) {
        // Ignore errors for follow stats
        console.warn('Error fetching follow stats:', followStatsError);
      }

      // Get auth users in parallel (limit to 10 at a time to avoid overwhelming the API)
      const usersList = [];
      const batchSize = 10;
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (userIdItem) => {
          try {
            const { data: authUser } = await admin.auth.admin.getUserById(userIdItem);
            const profile = profilesMap.get(userIdItem);
            const rating = ratingsMap.get(userIdItem) || { averageRating: 0, reviewCount: 0, positivePercentage: 0 };
            
            // Build location
            const locationParts = [];
            if (profile?.city) locationParts.push(profile.city);
            if (profile?.country) locationParts.push(profile.country);
            const location = locationParts.length > 0 ? locationParts.join(', ') : undefined;
            
            return {
              id: userIdItem,
              email: authUser?.user?.email || '',
              firstName: profile?.first_name || '',
              lastName: profile?.last_name || '',
              avatarUrl: profile?.avatar_url || null,
              createdAt: createdAtMap.get(userIdItem),
              rating: rating.averageRating,
              reviewCount: rating.reviewCount,
              positivePercentage: rating.positivePercentage,
              location: location,
              lastSignInAt: authUser?.user?.last_sign_in_at ? new Date(authUser.user.last_sign_in_at).toISOString() : undefined,
              followersCount: followersCountMap.get(userIdItem) || 0,
              followingCount: followingCountMap.get(userIdItem) || 0
            };
          } catch (error) {
            // Skip users that can't be fetched
            console.error(`Error fetching user ${userIdItem}:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        usersList.push(...batchResults.filter(user => user !== null));
      }

      return NextResponse.json({ users: usersList });
    } catch (error: any) {
      // Catch any unexpected errors (including table not found)
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return NextResponse.json({ users: [] });
      }
      console.error('Error in follow list GET:', error);
      return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in follow list endpoint:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}

