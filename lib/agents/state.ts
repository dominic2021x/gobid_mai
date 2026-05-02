/**
 * Agent state (cursor) persistence for OpenClaw jobs.
 * Uses agent_state table: key (text), value (jsonb), updated_at.
 */

type SupabaseAdmin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

const KEY_SEED_SUGGESTIONS = "openclaw_seed_suggestions";

export const DEFAULT_LAST_UPDATED_AT = "1970-01-01T00:00:00Z";
export const DEFAULT_LAST_ID = "00000000-0000-0000-0000-000000000000";

export type SeedSuggestionsState = {
  last_updated_at: string;
  last_id: string;
};

export async function getSeedSuggestionsState(
  supabase: SupabaseAdmin
): Promise<SeedSuggestionsState> {
  const { data, error } = await supabase
    .from("agent_state")
    .select("value")
    .eq("key", KEY_SEED_SUGGESTIONS)
    .maybeSingle();

  if (error) throw error;
  const value = (data?.value as Partial<SeedSuggestionsState>) ?? {};
  return {
    last_updated_at: value.last_updated_at ?? DEFAULT_LAST_UPDATED_AT,
    last_id: value.last_id ?? DEFAULT_LAST_ID,
  };
}

export async function setSeedSuggestionsState(
  supabase: SupabaseAdmin,
  state: SeedSuggestionsState
): Promise<void> {
  const { error } = await supabase
    .from("agent_state")
    .upsert(
      {
        key: KEY_SEED_SUGGESTIONS,
        value: state as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) throw error;
}

/** Reset cursor to start; next worker run will process all products from the beginning. */
export async function resetSeedSuggestionsState(
  supabase: SupabaseAdmin
): Promise<void> {
  await setSeedSuggestionsState(supabase, {
    last_updated_at: DEFAULT_LAST_UPDATED_AT,
    last_id: DEFAULT_LAST_ID,
  });
}
