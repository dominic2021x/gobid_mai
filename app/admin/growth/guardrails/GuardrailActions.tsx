"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Guardrail {
  id: string;
  enabled: boolean;
  min_value: number | null;
  max_value: number | null;
  metric: string;
  guardrail_type: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function GuardrailActions({ guardrail }: { guardrail: Guardrail }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [minVal, setMinVal] = useState<string>(String(guardrail.min_value ?? ""));
  const [maxVal, setMaxVal] = useState<string>(String(guardrail.max_value ?? ""));

  const handleToggle = async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/growth/guardrails/${guardrail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !guardrail.enabled }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveThresholds = async () => {
    const token = await getAdminToken();
    if (!token) return;
    const min = minVal === "" ? null : Number(minVal);
    const max = maxVal === "" ? null : Number(maxVal);
    if (min !== null && !Number.isFinite(min)) return;
    if (max !== null && !Number.isFinite(max)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/growth/guardrails/${guardrail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ min_value: min, max_value: max }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className={`rounded px-2 py-1 text-xs font-medium ${
          guardrail.enabled
            ? "bg-emerald-100 text-emerald-800"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {guardrail.enabled ? "Enabled" : "Disabled"}
      </button>
      <span className="text-slate-400">|</span>
      <input
        type="text"
        value={minVal}
        onChange={(e) => setMinVal(e.target.value)}
        placeholder="min"
        className="w-16 rounded border border-slate-200 px-2 py-0.5 text-xs"
      />
      <input
        type="text"
        value={maxVal}
        onChange={(e) => setMaxVal(e.target.value)}
        placeholder="max"
        className="w-16 rounded border border-slate-200 px-2 py-0.5 text-xs"
      />
      <button
        type="button"
        onClick={handleSaveThresholds}
        disabled={loading}
        className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
      >
        Save
      </button>
    </div>
  );
}
