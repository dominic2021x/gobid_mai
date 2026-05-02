import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeAppleProfile as normalizeAppleUser } from '@/lib/auth/apple/normalizeAppleProfile';
import { upsertUserProfile, usernameFromEmail } from '@/lib/auth/profile/upsertUserProfile';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const APPLE_JWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

const APPLE_SUCCESS_COOKIE = 'apple_success_data';
const COOKIE_MAX_AGE = 60;

function redirectToAppleSuccess(
  baseUrl: string,
  payload: Record<string, unknown>,
  isAdmin: boolean
): NextResponse {
  const redirectUrl = new URL('/auth/apple-success', baseUrl);
  if (isAdmin) redirectUrl.searchParams.set('admin', 'true');
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  // 303 See Other: browser follows with GET (avoid 405 on apple-success which only accepts GET)
  const res = NextResponse.redirect(redirectUrl, 303);
  res.cookies.set(APPLE_SUCCESS_COOKIE, encoded, {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const code = formData.get('code') as string | null;
    const idToken = formData.get('id_token') as string | null;
    const userJson = formData.get('user') as string | null;
    const state = formData.get('state') as string | null;
    const error = formData.get('error') as string | null;

    if (error) {
      console.error('❌ Apple OAuth error:', error);
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
      return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error)}`, baseUrl));
    }

    if (!idToken) {
      console.error('❌ No id_token in Apple callback');
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
      return NextResponse.redirect(new URL('/auth?error=no_id_token', baseUrl));
    }

    const clientId = process.env.APPLE_ID || process.env.APPLE_SERVICE_ID;
    if (!clientId) {
      console.error('❌ APPLE_ID / APPLE_SERVICE_ID not set');
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
      return NextResponse.redirect(new URL('/auth?error=config_error', baseUrl));
    }

    let payload: jose.JWTPayload;
    try {
      const { payload: p } = await jose.jwtVerify(idToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: clientId,
      });
      payload = p;
    } catch (verifyErr) {
      console.error('❌ Apple id_token verification failed:', verifyErr);
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
      return NextResponse.redirect(new URL('/auth?error=invalid_token', baseUrl));
    }

    const email = payload.email as string | undefined;
    const sub = payload.sub as string; // Apple user id

    if (!email) {
      console.error('❌ No email in Apple id_token');
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
      return NextResponse.redirect(new URL('/auth?error=no_email', baseUrl));
    }

    let userObj: { name?: { firstName?: string; lastName?: string; givenName?: string; familyName?: string }; email?: string } | null = null;
    if (userJson) {
      try {
        userObj = JSON.parse(userJson) as typeof userObj;
      } catch {
        // ignore
      }
    }

    const normalized = normalizeAppleUser({
      email,
      user: userObj ?? undefined,
      idTokenPayload: payload as Record<string, unknown>,
    });

    console.log('[Apple callback]', JSON.stringify({
      source: 'apple_oauth',
      namesReceived: normalized.hasRealNames,
      emailPrefix: email.substring(0, 3) + '…',
    }));

    let supabaseUserId: string | null = null;
    let needsNameOnboarding = false;
    let firstNameToSave = normalized.firstName;
    let lastNameToSave = normalized.lastName;
    const userInfo = {
      get firstName() {
        return firstNameToSave;
      },
      get lastName() {
        return lastNameToSave;
      },
      email: normalized.email,
      avatar: '',
      phone: '',
      provider: 'apple' as const,
      appleId: sub,
      displayHandle: normalized.displayHandle,
      hasRealNames: normalized.hasRealNames,
    };

    if (supabaseAdmin) {
      try {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = listData?.users?.find((u) => u.email === email);
        const isRelogin = !!existingUser && !normalized.hasRealNames;

        if (existingUser) {
          supabaseUserId = existingUser.id;
          if (!normalized.hasRealNames) {
            const { data: existingProfile } = await supabaseAdmin
              .from('user_profiles')
              .select('first_name, last_name')
              .eq('user_id', supabaseUserId)
              .maybeSingle();
            const fromProfile = existingProfile as { first_name?: string | null; last_name?: string | null } | null;
            const fromMeta = (existingUser.user_metadata as Record<string, unknown>) || {};
            firstNameToSave = (fromProfile?.first_name ?? fromMeta.first_name ?? '') as string;
            lastNameToSave = (fromProfile?.last_name ?? fromMeta.last_name ?? '') as string;
          }
          const existingMeta = (existingUser.user_metadata as Record<string, unknown>) || {};
          await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
            user_metadata: {
              ...existingMeta,
              first_name: firstNameToSave || existingMeta.first_name,
              last_name: lastNameToSave ?? existingMeta.last_name,
              provider: 'apple',
              apple_id: sub,
            },
          });
        } else {
          if (!normalized.hasRealNames && normalized.displayHandle) {
            firstNameToSave = normalized.displayHandle;
            lastNameToSave = '';
            needsNameOnboarding = true;
          } else if (!normalized.hasRealNames) {
            needsNameOnboarding = true;
          }
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: normalized.email,
            email_confirm: true,
            user_metadata: {
              first_name: firstNameToSave || null,
              last_name: lastNameToSave || null,
              provider: 'apple',
              apple_id: sub,
            },
          });
          if (createError) {
            console.error('Error creating Supabase user:', createError);
          } else if (newUser?.user) {
            supabaseUserId = newUser.user.id;
          }
        }

        if (supabaseUserId) {
          if (!isRelogin) {
            const derivedUsername = usernameFromEmail(normalized.email);
            const upsertResult = await upsertUserProfile(supabaseAdmin, {
              userId: supabaseUserId,
              firstName: userInfo.firstName || null,
              lastName: userInfo.lastName || null,
              email: normalized.email,
              avatarUrl: userInfo.avatar || null,
              phone: userInfo.phone || null,
              username: derivedUsername ?? undefined,
              source: 'apple_oauth',
            });
            needsNameOnboarding = needsNameOnboarding || upsertResult.needsNameOnboarding;
          }

          const { data: existingTokens } = await supabaseAdmin
            .from('user_tokens')
            .select('*')
            .eq('user_id', supabaseUserId)
            .maybeSingle();
          if (!existingTokens) {
            await supabaseAdmin.from('user_tokens').upsert(
              {
                user_id: supabaseUserId,
                user_email: userInfo.email,
                balance: 0,
                total_earned: 0,
                total_spent: 0,
                level: 'Basic',
                package_type: 'Basic',
              },
              { onConflict: 'user_id' }
            );
          }

          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: userInfo.email,
          });

          if (!linkError && linkData?.properties) {
            const magicLink = linkData.properties.action_link;
            const tokenMatch = magicLink?.match(/token=([^&]+)/);
            const hashMatch = magicLink?.match(/token_hash=([^&]+)/);
            const baseUrl =
              process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
              `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host') || 'localhost:3000'}`;

            return redirectToAppleSuccess(
              baseUrl,
              {
                ...userInfo,
                supabaseUserId,
                needsNameOnboarding: needsNameOnboarding,
                magicLink: magicLink || null,
                magicLinkToken: tokenMatch?.[1] || null,
                magicLinkHash: hashMatch?.[1] || linkData.properties.hashed_token || null,
              },
              state?.includes('admin') ?? false
            );
          }
        }
      } catch (err) {
        console.error('Error managing Supabase user (Apple):', err);
      }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
      `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host') || 'localhost:3000'}`;
    return redirectToAppleSuccess(
      baseUrl,
      { ...userInfo, supabaseUserId, needsNameOnboarding },
      state?.includes('admin') ?? false
    );
  } catch (err: unknown) {
    console.error('Apple OAuth callback error:', err);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
    return NextResponse.redirect(
      new URL(`/auth?error=${encodeURIComponent(err instanceof Error ? err.message : 'unknown_error')}`, baseUrl)
    );
  }
}
