# Apple Sign In – Profile persistence architecture

## Overview

Apple Sign In profile data is normalized and persisted so that:

1. **Real names are never overwritten** by email-derived or empty values.
2. **Email local-part is never used** as `first_name` or `last_name` (only as optional `displayHandle` for UI).
3. **Existing DB and auth metadata** are preserved when Apple sends no name (e.g. on subsequent logins).
4. **New users without names** are sent to an onboarding step to collect first/last name.

Data flow:

```
Apple callback (POST)
  → normalizeAppleProfile(email, user JSON)
  → existing user? merge user_metadata (preserve existing names if no incoming)
  → upsertUserProfile(..., source: 'apple_oauth')
  → redirect to /auth/apple-success (with needsNameOnboarding when applicable)
  → apple-success: verifyOtp → store userInfo → if needsNameOnboarding → /auth/complete-profile
  → complete-profile: form → POST /api/auth/complete-profile → upsertUserProfile(..., 'onboarding_manual')
```

---

## File paths

| Purpose | Path |
|--------|------|
| Apple profile normalizer | `lib/auth/apple/normalizeAppleProfile.ts` |
| Safe profile upsert | `lib/auth/profile/upsertUserProfile.ts` |
| Apple OAuth callback | `app/api/auth/apple/callback/route.ts` |
| Apple success page (redirect when needs name) | `app/(site)/auth/apple-success/page.tsx` |
| Name onboarding page | `app/(site)/auth/complete-profile/page.tsx` |
| Complete-profile API | `app/api/auth/complete-profile/route.ts` |

---

## Logging

Structured logs:

- **Apple callback**: `[Apple callback] { source: 'apple_oauth', namesReceived: boolean, emailPrefix }`
- **Upsert**: `[upsertUserProfile] { source, userId, namesReceived, dbProfileUpdated, preserved[], needsNameOnboarding }`

So you can trace: source (apple_native | apple_oauth | onboarding_manual), whether names were received, and whether the DB profile was updated or fields preserved.

---

## Migration

**No migration required.** Existing `user_profiles` columns (`first_name`, `last_name`, `email`, etc.) are unchanged. Optional future: add `name_source` (e.g. `'apple' | 'google' | 'onboarding'`) for audit; currently source is only in application logs.

---

## Edge cases

1. **Apple sends name only on first auth**  
   Subsequent callbacks have no `user` object → normalizer returns empty first/last → upsert preserves existing DB names; auth `user_metadata` merge keeps existing names.

2. **New user, Apple sends no name**  
   `needsNameOnboarding = true` → redirect to `/auth/complete-profile` → user submits form → `onboarding_manual` upsert.

3. **Existing user with empty profile**  
   Incoming empty from Apple → preserved empty in DB (no overwrite). User can set name later in Settings.

4. **Capacitor / native Apple Sign In**  
   Same callback and normalizer; if native sends different `user` shape, extend `AppleRawName` in `normalizeAppleProfile.ts` (e.g. `full_name` split).

5. **Session not ready on complete-profile**  
   Page checks session; if missing, shows message and links to auth/dashboard (user can complete name in Settings).

6. **Concurrent updates**  
   Last write wins; upsert is by `user_id`. No extra locking.

---

## Security notes

- **No email → name mapping**: Email local-part is never written to `first_name` or `last_name`, reducing info leakage and wrong attribution.
- **Server-only normalization and upsert**: All profile decisions and writes are server-side (callback + API); client only sends form on complete-profile.
- **Complete-profile API**: Requires authenticated session; uses `createServerClient()` for session and `supabaseAdmin` for upsert (service role). No userId in body; userId from `getUser()`.
- **Supabase sessions**: No change to session lifecycle or cookie handling; only profile and metadata merge logic changed.
- **Logging**: Logs do not include full email (only prefix) or full names; suitable for production.

---

## Quick win / premium / enterprise

- **Quick win (current)**: Normalizer + safe upsert + onboarding redirect + logging. No DB migration. Covers Apple callback and manual onboarding.
- **Premium**: Add `name_source` column on `user_profiles`, set on upsert; dashboard “Name from: Apple / Google / Completed in app”. Optional: backfill existing Apple users with `name_source = 'apple'` where `provider = 'apple'` and first/last non-empty.
- **Enterprise**: Full audit table (e.g. `user_profile_audit`: user_id, field, old_value_hash, new_value_hash, source, at); rate limit on complete-profile; optional IdP re-sync job that only updates when provider returns real names.
