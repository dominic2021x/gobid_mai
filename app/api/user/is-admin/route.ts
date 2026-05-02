import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser, getUserFromJwt } from '@/lib/auth/getRequestAuthUser';
import { isAdminUser } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * GET /api/user/is-admin
 * Răspunde dacă utilizatorul curent (cookie sesiune sau Authorization: Bearer) este admin.
 * Bearer este necesar pentru clientul Supabase care ține JWT în localStorage fără cookie de sesiune.
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }
    let user = await getRequestAuthUser(request);
    if (!user?.id) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const jwt = authHeader.replace('Bearer ', '').trim();
        if (jwt) {
          user = await getUserFromJwt(jwt);
        }
      }
    }
    if (!user?.id) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }
    const allowed = await isAdminUser(user, supabaseAdmin);
    return NextResponse.json({ isAdmin: allowed }, { status: 200 });
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}
