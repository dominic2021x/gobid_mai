import { supabaseAdmin } from "@/lib/supabase";

export const RO_EXECUTARI_CROSSLIST_SETTINGS_KEY = "ro_executari_crosslist_enabled";

type SettingsRow = {
  key: string;
  value: unknown;
};

function parseBooleanValue(input: unknown, fallback = true): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (["1", "true", "on", "yes", "da"].includes(normalized)) return true;
    if (["0", "false", "off", "no", "nu"].includes(normalized)) return false;
    return fallback;
  }
  if (input && typeof input === "object") {
    const candidate = input as Record<string, unknown>;
    if ("enabled" in candidate) return parseBooleanValue(candidate.enabled, fallback);
    if ("value" in candidate) return parseBooleanValue(candidate.value, fallback);
  }
  return fallback;
}

export async function getRoExecutariCrosslistEnabled(defaultValue = true): Promise<boolean> {
  if (!supabaseAdmin) return defaultValue;

  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("key,value")
      .eq("key", RO_EXECUTARI_CROSSLIST_SETTINGS_KEY)
      .maybeSingle<SettingsRow>();

    if (error || !data) return defaultValue;
    return parseBooleanValue(data.value, defaultValue);
  } catch {
    return defaultValue;
  }
}

export async function setRoExecutariCrosslistEnabled(enabled: boolean): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert(
      {
        key: RO_EXECUTARI_CROSSLIST_SETTINGS_KEY,
        value: { enabled: !!enabled },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(error.message);
  }
}

