/**
 * Safe profile upsert for gobid.ro
 *
 * Prevents destructive overwrites:
 * - If incoming Apple (or other provider) data has no given_name/family_name/full_name, keep existing DB values
 * - Never use email local-part as first_name or last_name (caller must pass already-normalized data)
 * - Only update first_name/last_name when incoming values are non-empty and trusted (e.g. from provider or onboarding)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ProfileUpsertSource = 'apple_native' | 'apple_oauth' | 'onboarding_manual' | 'google_oauth';

export type UpsertUserProfileInput = {
  userId: string;
  /** First name (only set when from real provider/onboarding; never email-derived) */
  firstName?: string | null;
  /** Last name (only set when from real provider/onboarding; never email-derived) */
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  /** Username (e.g. from email local part); only set when new profile or existing has no username */
  username?: string | null;
  /** Provider metadata to merge into auth user_metadata (e.g. provider, apple_id) */
  providerMetadata?: Record<string, unknown>;
  source: ProfileUpsertSource;
};

export type UpsertUserProfileResult = {
  updated: boolean;
  /** Fields that were preserved (not overwritten) because incoming was empty */
  preserved: string[];
  /** True when this is a new user and no real name was provided → redirect to name onboarding */
  needsNameOnboarding: boolean;
  /** Log payload for structured logging */
  logPayload: {
    source: ProfileUpsertSource;
    userId: string;
    namesReceived: boolean;
    dbProfileUpdated: boolean;
    preserved: string[];
    needsNameOnboarding: boolean;
  };
};

function trim(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim();
}

function hasValue(s: string): boolean {
  return trim(s).length > 0;
}

/** Derive username from email local part: [a-zA-Z0-9._-], 3–30 chars. For display/handle only. */
export function usernameFromEmail(email: string | null | undefined): string | null {
  const local = trim(email ?? '').split('@')[0];
  if (!local) return null;
  const sanitized = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30);
  return sanitized.length >= 3 ? sanitized : null;
}

/**
 * Safe upsert: never overwrite existing first_name/last_name with empty or null.
 * For existing users: only set first_name/last_name when incoming has real values.
 * For new users: set what we have; if no real names, needsNameOnboarding = true.
 */
export async function upsertUserProfile(
  supabase: SupabaseClient,
  input: UpsertUserProfileInput
): Promise<UpsertUserProfileResult> {
  const { userId, firstName, lastName, email, avatarUrl, phone, username: incomingUsername, source } = input;
  const preserved: string[] = [];
  let dbProfileUpdated = false;
  let needsNameOnboarding = false;

  const incomingFirst = trim(firstName ?? '');
  const incomingLast = trim(lastName ?? '');
  const namesReceived = hasValue(incomingFirst) || hasValue(incomingLast);

  const { data: existing } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, email, avatar_url, phone, metadata')
    .eq('user_id', userId)
    .maybeSingle();

  const isNewProfile = !existing;
  const existingMetadata = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
  const existingUsername = trim((existingMetadata?.username as string) ?? '');

  const usernameToSet =
    incomingUsername !== undefined && incomingUsername !== null && hasValue(trim(String(incomingUsername)))
      ? trim(String(incomingUsername)).slice(0, 30)
      : null;
  const setUsername = usernameToSet && (isNewProfile || !hasValue(existingUsername));
  if (!setUsername && hasValue(existingUsername)) preserved.push('username');

  const payload: Record<string, unknown> = {
    user_id: userId,
    ...(email !== undefined && email !== null ? { email: trim(String(email)) || null } : {}),
    ...(avatarUrl !== undefined ? { avatar_url: trim(String(avatarUrl)) || null } : {}),
    ...(phone !== undefined ? { phone: trim(String(phone)) || null } : {}),
    metadata: {
      ...existingMetadata,
      ...(setUsername ? { username: usernameToSet } : {}),
    },
  };

  if (isNewProfile) {
    if (namesReceived) {
      payload.first_name = incomingFirst || null;
      payload.last_name = incomingLast || null;
    } else {
      payload.first_name = null;
      payload.last_name = null;
      needsNameOnboarding = true;
    }
  } else {
    const existingFirst = trim((existing as { first_name?: string } | null)?.first_name ?? '');
    const existingLast = trim((existing as { last_name?: string } | null)?.last_name ?? '');

    if (hasValue(incomingFirst)) {
      payload.first_name = incomingFirst;
    } else if (hasValue(existingFirst)) {
      preserved.push('first_name');
      payload.first_name = existingFirst;
    } else {
      payload.first_name = null;
    }

    if (hasValue(incomingLast)) {
      payload.last_name = incomingLast;
    } else if (hasValue(existingLast)) {
      preserved.push('last_name');
      payload.last_name = existingLast;
    } else {
      payload.last_name = null;
    }
  }

  const { error } = await supabase.from('user_profiles').upsert(payload as Record<string, unknown>, {
    onConflict: 'user_id',
  });

  if (error) {
    console.error('[upsertUserProfile] Supabase error:', { source, userId, error: error.message });
    throw error;
  }
  dbProfileUpdated = true;

  const logPayload = {
    source,
    userId,
    namesReceived,
    dbProfileUpdated,
    preserved,
    needsNameOnboarding,
  };
  console.log('[upsertUserProfile]', JSON.stringify(logPayload));

  return {
    updated: true,
    preserved,
    needsNameOnboarding,
    logPayload,
  };
}
