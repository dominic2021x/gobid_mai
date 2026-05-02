import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ADMIN_ROLES = ['admin', 'superadmin', 'administrator', 'super_user', 'manager'];

/** Username din user_profiles.metadata sau auth user_metadata. */
function readUsernameFromProfile(profile: Record<string, unknown>, user: any): string {
  const meta = profile?.metadata;
  let fromProfile = '';
  if (meta && typeof meta === 'object' && meta !== null && 'username' in meta) {
    const u = (meta as { username?: unknown }).username;
    if (typeof u === 'string') fromProfile = u.trim();
  }
  const fromAuth =
    user?.user_metadata && typeof user.user_metadata.username === 'string'
      ? String(user.user_metadata.username).trim()
      : '';
  return fromProfile || fromAuth;
}
const ADMIN_ROLES_EXTENDED = [...ADMIN_ROLES, 'owner', 'superuser'];

async function isAdminUser(user: any, supabaseAdmin: any): Promise<boolean> {
  // Check metadata first (fast check)
  if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) {
    return true;
  }

  const metaRole =
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);

  const roles = new Set<string>();
  if (metaRole) roles.add(String(metaRole).toLowerCase());
  if (Array.isArray(user?.app_metadata?.roles)) {
    user.app_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }
  if (user?.user_metadata?.roles && Array.isArray(user.user_metadata.roles)) {
    user.user_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }

  if (Array.from(roles).some((role) => ADMIN_ROLES.includes(role))) {
    return true;
  }

  // Check user_profiles table as fallback
  if (user?.id && supabaseAdmin) {
    try {
      const { data: profile, error } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && profile?.is_admin === true) {
        return true;
      }
    } catch (e) {
      console.error('Error checking admin status in user_profiles:', e);
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get('authorization');
    let authenticatedUser: any | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const accessToken = authHeader.replace('Bearer ', '').trim();
      if (accessToken) {
        const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        if (!authError && authUser?.user) {
          authenticatedUser = authUser.user;
        }
      }
    }

    // Fallback for requests authenticated via Supabase session cookies.
    if (!authenticatedUser) {
      const supabaseServer = await createServerClient();
      const { data: cookieAuthData, error: cookieAuthError } = await supabaseServer.auth.getUser();
      if (!cookieAuthError && cookieAuthData?.user) {
        authenticatedUser = cookieAuthData.user;
      }
    }

    if (!authenticatedUser) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }

    const isAdmin = await isAdminUser(authenticatedUser, supabaseAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const adminOnly =
      searchParams.get('adminOnly') === '1' ||
      searchParams.get('adminOnly') === 'true';
    const perPage = Math.min(
      200,
      Math.max(1, Number.parseInt(searchParams.get('perPage') ?? '100', 10))
    );
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10));

    let supabaseUsers: any[] = [];
    let usersTotal = 0;

    if (adminOnly) {
      const roleCsv = ADMIN_ROLES_EXTENDED.join(',');
      const { data: adminProfiles, error: adminProfilesError } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, is_admin, role')
        .or(`is_admin.eq.true,role.in.(${roleCsv})`);

      if (adminProfilesError) {
        console.error('Error loading admin candidates from user_profiles:', adminProfilesError);
        return NextResponse.json({ error: 'Failed to load admin candidates' }, { status: 500 });
      }

      const adminIds = new Set<string>(
        (adminProfiles ?? [])
          .map((row: any) => row?.user_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      );

      if (adminIds.size === 0) {
        return NextResponse.json({ users: [], total: 0, page, perPage, adminOnly: true });
      }

      const collectedAdmins = new Map<string, any>();
      const scanPerPage = 200;
      let scanPage = 1;
      let knownTotal = 0;

      while (true) {
        const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page: scanPage,
          perPage: scanPerPage,
        });

        if (listError) {
          console.error('Error scanning Supabase auth users for admins:', listError);
          return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
        }

        const chunk = usersPage?.users ?? [];
        knownTotal = usersPage?.total ?? knownTotal;

        for (const user of chunk) {
          if (adminIds.has(user.id)) {
            collectedAdmins.set(user.id, user);
          }
        }

        const reachedEnd =
          chunk.length < scanPerPage ||
          (knownTotal > 0 && scanPage * scanPerPage >= knownTotal);

        if (reachedEnd || collectedAdmins.size >= adminIds.size) {
          break;
        }

        scanPage += 1;
      }

      supabaseUsers = Array.from(collectedAdmins.values());
      usersTotal = supabaseUsers.length;
    } else {
      const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        console.error('Error listing Supabase auth users:', listError);
        return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
      }

      supabaseUsers = usersPage?.users ?? [];
      usersTotal = usersPage?.total ?? supabaseUsers.length;
    }

    if (supabaseUsers.length === 0) {
      return NextResponse.json({ users: [], total: usersTotal, page, perPage, adminOnly });
    }

    const userIds = supabaseUsers.map((u: any) => u.id);

    const [
      profilesRes,
      tokensRes,
      paymentsRes,
      favoritesRes,
      unlockedRes,
      activityRes,
      historyRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('*')
        .in('user_id', userIds),
      supabaseAdmin
        .from('user_tokens')
        .select('*')
        .in('user_id', userIds),
      supabaseAdmin
        .from('user_payments')
        .select('*')
        .in('user_id', userIds)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('user_favorites')
        .select('*')
        .in('user_id', userIds),
      supabaseAdmin
        .from('user_unlocked_products')
        .select('*')
        .in('user_id', userIds),
      supabaseAdmin
        .from('user_activity_logs')
        .select('user_id, created_at, properties')
        .in('user_id', userIds)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from('user_auction_history')
        .select('*')
        .in('user_id', userIds)
        .order('occurred_at', { ascending: false }),
    ]);

    const profilesById = new Map(
      (profilesRes.data ?? []).map((profile: any) => [profile.user_id, profile])
    );
    const tokensById = new Map(
      (tokensRes.data ?? []).map((token: any) => [token.user_id, token])
    );
    const paymentsByUser = new Map<string, any[]>();
    (paymentsRes.data ?? []).forEach((payment: any) => {
      if (!paymentsByUser.has(payment.user_id)) {
        paymentsByUser.set(payment.user_id, []);
      }
      paymentsByUser.get(payment.user_id)!.push(payment);
    });
    const favoritesByUser = new Map<string, any[]>();
    (favoritesRes.data ?? []).forEach((fav: any) => {
      if (!favoritesByUser.has(fav.user_id)) {
        favoritesByUser.set(fav.user_id, []);
      }
      favoritesByUser.get(fav.user_id)!.push(fav.product_id);
    });
    const unlockedByUser = new Map<string, any[]>();
    (unlockedRes.data ?? []).forEach((row: any) => {
      if (!unlockedByUser.has(row.user_id)) {
        unlockedByUser.set(row.user_id, []);
      }
      unlockedByUser.get(row.user_id)!.push(row.product_id);
    });
    const activityByUser = new Map<string, any[]>();
    (activityRes.data ?? []).forEach((activity: any) => {
      if (!activityByUser.has(activity.user_id)) {
        activityByUser.set(activity.user_id, []);
      }
      activityByUser.get(activity.user_id)!.push(activity);
    });
    const historyByUser = new Map<string, any[]>();
    (historyRes.data ?? []).forEach((row: any) => {
      if (!historyByUser.has(row.user_id)) {
        historyByUser.set(row.user_id, []);
      }
      historyByUser.get(row.user_id)!.push(row);
    });

    const users = supabaseUsers.map((user: any) => {
      const profile = profilesById.get(user.id) ?? {};
      const tokens = tokensById.get(user.id) ?? {
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        level: 'Basic',
      };

      const profileRole = typeof profile.role === 'string' ? profile.role : undefined;
      const metaRole =
        profileRole ??
        user?.user_metadata?.role ??
        user?.app_metadata?.role ??
        (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);

      const normalizedRole = typeof metaRole === 'string' ? metaRole.toLowerCase() : 'user';
      // Check admin status synchronously for display purposes (already checked profile.is_admin above)
      const isAdminFlag =
        profile?.is_admin === true ||
        ADMIN_ROLES.includes(normalizedRole) ||
        user?.user_metadata?.is_admin === true ||
        user?.app_metadata?.is_admin === true;

      // Calculate last activity and LIVE status
      const userActivities = activityByUser.get(user.id) ?? [];
      const lastActivity = userActivities.length > 0 
        ? userActivities[0] // Activities are already sorted by created_at DESC
        : null;
      const lastActivityDate = lastActivity?.created_at ?? null;
      
      // Check if user is LIVE (activity in last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const isLive = lastActivityDate ? lastActivityDate >= oneHourAgo : false;

      // Extract IP address from latest activity
      const lastActivityProperties = lastActivity?.properties ?? {};
      const ipAddress = lastActivityProperties.ip || null;
      
      // Extract location from latest activity properties (if available)
      let city = lastActivityProperties.city || lastActivityProperties.location?.city || null;
      let country = lastActivityProperties.country || lastActivityProperties.location?.country || null;

      return {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        firstName: profile.first_name ?? '',
        lastName: profile.last_name ?? '',
        username: readUsernameFromProfile(profile as Record<string, unknown>, user),
        phone: profile.phone ?? '',
        avatar: profile.avatar_url ?? '',
        dateOfBirth: profile.date_of_birth ?? null,
        address: profile.address ?? '',
        city: city,
        country: country,
        ipAddress: ipAddress,
        companyName: profile.company_name ?? '',
        companyCui: profile.company_cui ?? '',
        companyAddress: profile.company_address ?? '',
        companyVerified: profile.company_verified ?? false,
        accountType: profile.account_type ?? 'private',
        tokens: {
          balance: tokens.balance ?? 0,
          totalEarned: tokens.total_earned ?? 0,
          totalSpent: tokens.total_spent ?? 0,
          level: tokens.level ?? 'Basic',
        },
        payments: (paymentsByUser.get(user.id) ?? []).map((payment: any) => ({
          id: payment.id,
          invoiceNumber: payment.invoice_number,
          amount: Number(payment.amount ?? 0),
          currency: payment.currency ?? 'RON',
          type: payment.payment_type,
          description: payment.description,
          metadata: payment.metadata ?? {},
          createdAt: payment.created_at,
        })),
        unlockedProducts: unlockedByUser.get(user.id) ?? [],
        favoriteAuctions: favoritesByUser.get(user.id) ?? [],
        activity: (activityByUser.get(user.id) ?? []).map((activity: any) => ({
          id: activity.id,
          event: activity.event,
          properties: activity.properties ?? {},
          createdAt: activity.created_at,
        })),
        auctionHistory: (historyByUser.get(user.id) ?? []).map((row: any) => ({
          id: row.id,
          productId: row.product_id,
          status: row.status,
          bidAmount: row.bid_amount,
          currency: row.currency,
          metadata: row.metadata ?? {},
          occurredAt: row.occurred_at,
        })),
        role: normalizedRole,
        isAdmin: isAdminFlag,
        lastActivityDate: lastActivityDate,
        isLive: isLive,
      };
    });

    return NextResponse.json({
      users,
      total: usersTotal || users.length,
      page,
      perPage,
      adminOnly,
    });
  } catch (error) {
    console.error('Unexpected error loading admin users:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}


