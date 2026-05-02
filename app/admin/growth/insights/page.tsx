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

export default function GrowthInsightsPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/audits/latest?kind=seo_audit_run", {
      });
      if (res.ok) {
        const data = await res.json();
        const r = data?.result;
        setResult(r ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const issues = result && typeof result.result === "object" && result.result !== null
    ? (result.result as Record<string, unknown>)
    : null;

  return (
    <GrowthPageShell
      title="Insights"
      description="Probleme agregate din ultimul audit SEO."
    >
      <GrowthCard
        title="Probleme agregate"
        description="Listă simplă pe baza ultimului audit (stub: afișează meta)."
        accent="yellow"
      >
        {loading && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
        {!loading && !issues && (
          <p className="text-sm text-[#5F6368]">Rulează un audit din SEO Audits pentru date.</p>
        )}
        {!loading && issues && (
          <div className="space-y-2">
            <p className="text-sm text-[#5F6368]">Rezultat ultim audit (meta):</p>
            <pre className="overflow-x-auto rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-4 text-xs text-[#5F6368]">
              {JSON.stringify(issues, null, 2)}
            </pre>
            <GrowthButton variant="ghost" onClick={fetchLatest}>
              Reîmprospătează
            </GrowthButton>
          </div>
        )}
      </GrowthCard>
    </GrowthPageShell>
  );
}
