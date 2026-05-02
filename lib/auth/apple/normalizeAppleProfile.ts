/**
 * Safe Apple profile normalizer for gobid.ro
 *
 * Rules:
 * - Never use email local-part as first_name or last_name
 * - Only set first_name/last_name from Apple's givenName/familyName (or name.firstName/lastName)
 * - When Apple sends no name (subsequent logins), leave names empty so existing DB values are preserved
 * - displayHandle: optional fallback from email local-part for UI display only (e.g. "john.doe" from john.doe@icloud.com)
 */

export type AppleRawName = {
  firstName?: string | null;
  lastName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
};

export type NormalizeAppleProfileInput = {
  /** Email from id_token (required) */
  email: string;
  /** Optional user object from form param (only on first auth) */
  user?: {
    name?: AppleRawName | { fullName?: string } | string | null;
    email?: string | null;
  } | null;
  /** Optional decoded id_token payload (Apple usually doesn't put name here) */
  idTokenPayload?: Record<string, unknown> | null;
};

export type NormalizedAppleProfile = {
  /** First name from Apple only; never from email. Empty string if not provided. */
  firstName: string;
  /** Last name from Apple only; never from email. Empty string if not provided. */
  lastName: string;
  email: string;
  /** True if Apple sent real given_name/family_name (or name.firstName/lastName) */
  hasRealNames: boolean;
  /** Optional display handle: local part of email, for display only (never for first_name/last_name) */
  displayHandle?: string;
};

function trim(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim();
}

function hasValue(s: string): boolean {
  return trim(s).length > 0;
}

/**
 * Derive display handle from email local-part. Use only for UI display, never for first_name/last_name.
 */
function emailToDisplayHandle(email: string): string | undefined {
  const local = email.split('@')[0]?.trim();
  if (!local) return undefined;
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

/**
 * Normalizes raw Apple callback data into a safe profile shape.
 * - first_name/last_name from Apple's name object (givenName/familyName or firstName/lastName or fullName string)
 * - Optional fallback: for new users with no name, use displayHandle as first_name so something is saved
 */
export function normalizeAppleProfile(input: NormalizeAppleProfileInput): NormalizedAppleProfile {
  const { email, user, idTokenPayload } = input;
  const emailStr = trim(email) || '';
  let firstName = '';
  let lastName = '';
  let hasRealNames = false;

  if (user?.name) {
    const n = user.name;
    if (typeof n === 'object' && n !== null && !Array.isArray(n)) {
      const raw = n as AppleRawName & { fullName?: string };
      let fn = trim(raw.firstName ?? raw.givenName ?? '');
      let ln = trim(raw.lastName ?? raw.familyName ?? '');
      if (!hasValue(fn) && hasValue(raw.fullName ?? '')) {
        const parts = trim(raw.fullName!).split(/\s+/);
        fn = parts[0] ?? '';
        ln = parts.slice(1).join(' ') ?? '';
      }
      if (hasValue(fn)) {
        firstName = fn;
        hasRealNames = true;
      }
      if (hasValue(ln)) {
        lastName = ln;
        hasRealNames = true;
      }
    } else if (typeof n === 'string' && hasValue(n)) {
      const parts = trim(n).split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ') ?? '';
      if (hasValue(firstName)) hasRealNames = true;
      if (hasValue(lastName)) hasRealNames = true;
    }
  }

  if (!hasRealNames && idTokenPayload && typeof idTokenPayload === 'object') {
    const p = idTokenPayload as Record<string, unknown>;
    const fn = trim((p.given_name ?? p.givenName) as string);
    const ln = trim((p.family_name ?? p.familyName) as string);
    if (hasValue(fn)) {
      firstName = fn;
      hasRealNames = true;
    }
    if (hasValue(ln)) {
      lastName = ln;
      hasRealNames = true;
    }
  }

  const displayHandle = emailStr ? emailToDisplayHandle(emailStr) : undefined;

  return {
    firstName,
    lastName,
    email: emailStr,
    hasRealNames,
    displayHandle,
  };
}
