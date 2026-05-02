"use client";

import { useState, useEffect, useCallback } from "react";
import GrowthCard from "../_components/GrowthCard";
import GrowthButton from "../_components/GrowthButton";
import GrowthPageShell from "../_components/GrowthPageShell";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

const inputClass =
  "w-full max-w-xs rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] focus:border-[#4285F4] focus:outline-none focus:ring-1 focus:ring-[#4285F4]";

export default function GrowthSettingsPage() {
  const [dryRun, setDryRun] = useState(false);
  const [rateLimit, setRateLimit] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/settings", {
      });
      if (!res.ok) return;
      const data = await res.json();
      const s = data?.settings ?? {};
      setDryRun(!!(s.dry_run?.value));
      setRateLimit(String(s.rate_limit?.value ?? ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        fetch("/api/admin/growth/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "dry_run", value: dryRun }),
        }),
        fetch("/api/admin/growth/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "rate_limit", value: rateLimit }),
        }),
      ]);
      setMessage({ type: "success", text: "Setări salvate." });
    } catch {
      setMessage({ type: "error", text: "Eroare la salvare." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GrowthPageShell title="Settings" description="Dry run, rate limit și alte setări Growth.">
      <div className="space-y-6">
        <GrowthCard
          title="Dry run"
          description="Comută execuția în mod dry-run (dacă este implementat în worker)."
          accent="yellow"
        >
          {loading ? (
            <p className="text-sm text-[#5F6368]">Se încarcă...</p>
          ) : (
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-4 w-4 rounded border-[#DADCE0] text-[#4285F4] focus:ring-[#4285F4]"
              />
              <span className="text-sm font-medium text-[#202124]">Dry run activat</span>
            </label>
          )}
        </GrowthCard>

        <GrowthCard
          title="Rate limit"
          description="Limită (ex. număr de cereri pe minut) – stocat în growth_settings."
          accent="slate"
        >
          <div className="space-y-4">
            <input
              type="text"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              placeholder="ex. 60"
              className={inputClass}
            />
            <GrowthButton onClick={save} loading={saving} icon="ri-save-line">
              Salvează
            </GrowthButton>
            {message && (
              <p className={`text-sm ${message.type === "success" ? "text-[#34A853]" : "text-[#EA4335]"}`}>
                {message.text}
              </p>
            )}
          </div>
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
