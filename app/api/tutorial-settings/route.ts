/**
 * GET /api/tutorial-settings – citire setări tutoriale (public, pentru frontend)
 * POST /api/tutorial-settings – scriere (doar admin)
 * Stocate în Supabase settings: key = tutorial_flags, value = { mobileNavTutorial: boolean, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";
import {
  buildLastKnownGoodSnapshotKey,
  readFreshLastKnownGoodSnapshot,
  rememberLastKnownGoodSnapshot,
  shouldUseLastKnownGoodSnapshot,
} from "@/lib/server/lastKnownGoodSnapshot";
import { getOrLoadFromSharedTtlCache, writeToSharedTtlCache } from "@/lib/server/sharedTtlCache";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const SETTINGS_KEY = "tutorial_flags";

const DEFAULTS = {
  mobileNavTutorial: true,
};

type TutorialSettingsPayload = {
  mobileNavTutorial: boolean;
  stale?: true;
  snapshotAgeMs?: number;
};

const TUTORIAL_SETTINGS_SNAPSHOT_TTL_MS = 60_000;
const TUTORIAL_SETTINGS_SNAPSHOT_NAMESPACE = "api:tutorial-settings";
const TUTORIAL_SETTINGS_SNAPSHOT_KEY = buildLastKnownGoodSnapshotKey({
  route: "/api/tutorial-settings",
  settingsKey: SETTINGS_KEY,
});
const TUTORIAL_SETTINGS_CACHE_TTL_MS = 60_000;
const TUTORIAL_SETTINGS_CACHE_NAMESPACE = "cache:api:tutorial-settings";

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(DEFAULTS);
    }
    const adminClient = supabaseAdmin;
    const { value: payload } = await getOrLoadFromSharedTtlCache<TutorialSettingsPayload>(
      TUTORIAL_SETTINGS_CACHE_NAMESPACE,
      TUTORIAL_SETTINGS_SNAPSHOT_KEY,
      {
        ttlMs: TUTORIAL_SETTINGS_CACHE_TTL_MS,
        loader: async () => {
          const { data, error } = await runPostgrestQuery<{ value?: Record<string, unknown> | null }>(
            (signal) =>
              adminClient
                .from("settings")
                .select("value")
                .eq("key", SETTINGS_KEY)
                .abortSignal(signal)
                .maybeSingle(),
            { timeoutMs: 5000, maxRetries: 0 },
          );

          if (error) {
            throw Object.assign(new Error(error.message || "tutorial-settings failed"), error);
          }

          if (!data?.value) {
            return DEFAULTS;
          }

          const v = data.value as Record<string, unknown>;
          const nextPayload: TutorialSettingsPayload = {
            mobileNavTutorial: typeof v?.mobileNavTutorial === "boolean" ? v.mobileNavTutorial : DEFAULTS.mobileNavTutorial,
          };
          rememberLastKnownGoodSnapshot(TUTORIAL_SETTINGS_SNAPSHOT_NAMESPACE, TUTORIAL_SETTINGS_SNAPSHOT_KEY, nextPayload);
          return nextPayload;
        },
      },
    );

    return NextResponse.json(payload);
  } catch (err) {
    if (shouldUseLastKnownGoodSnapshot(err)) {
      const snapshot = readFreshLastKnownGoodSnapshot<TutorialSettingsPayload>(
        TUTORIAL_SETTINGS_SNAPSHOT_NAMESPACE,
        TUTORIAL_SETTINGS_SNAPSHOT_KEY,
        TUTORIAL_SETTINGS_SNAPSHOT_TTL_MS,
      );
      if (snapshot) {
        return NextResponse.json({ ...snapshot.value, stale: true, snapshotAgeMs: snapshot.ageMs });
      }
      return NextResponse.json(DEFAULTS);
    }
    return NextResponse.json({ error: "tutorial-settings failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const adminClient = supabaseAdmin;
  try {
    const body = await request.json();
    const mobileNavTutorial =
      typeof body.mobileNavTutorial === "boolean" ? body.mobileNavTutorial : DEFAULTS.mobileNavTutorial;

    const { error } = await adminClient
      .from("settings")
      .upsert(
        {
          key: SETTINGS_KEY,
          value: { mobileNavTutorial },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    rememberLastKnownGoodSnapshot(TUTORIAL_SETTINGS_SNAPSHOT_NAMESPACE, TUTORIAL_SETTINGS_SNAPSHOT_KEY, {
      mobileNavTutorial,
    });
    await writeToSharedTtlCache(
      TUTORIAL_SETTINGS_CACHE_NAMESPACE,
      TUTORIAL_SETTINGS_SNAPSHOT_KEY,
      { mobileNavTutorial },
      TUTORIAL_SETTINGS_CACHE_TTL_MS,
    );
    return NextResponse.json({ success: true, mobileNavTutorial });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
