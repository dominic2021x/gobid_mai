import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const APPLE_SUCCESS_COOKIE = 'apple_success_data';

/**
 * GET: read Apple success payload from httpOnly cookie (set by callback),
 * return JSON and clear the cookie so it can't be reused.
 */
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(APPLE_SUCCESS_COOKIE)?.value;
  if (!cookie) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  let payload: unknown;
  try {
    const decoded = Buffer.from(cookie, 'base64url').toString('utf-8');
    payload = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  const res = NextResponse.json({ data: payload });
  res.cookies.set(APPLE_SUCCESS_COOKIE, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  return res;
}
