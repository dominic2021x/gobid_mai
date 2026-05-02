"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "../../_components/Card";
import ActionButton from "../../_components/ActionButton";
import GrowthPageShell from "../../_components/GrowthPageShell";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function GrowthAuditsPage() {
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
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
        setLatest(data?.result ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  return (
    <GrowthPageShell
      title="Audits"
      description="Rulează audit SEO și vizualizează ultimul rezultat."
    >
      <div className="space-y-6">
      <Card
        title="Rulează audit SEO"
        description="Enqueuează job-ul seo_audit_run. Rezultatul este stocat în growth_audit_results."
        accent="blue"
      >
        <ActionButton
          label="Enqueue audit"
          href="/api/admin/growth/seo/audits/enqueue"
          method="POST"
          onSuccess={fetchLatest}
        />
      </Card>

      <Card
        title="Ultimul rezultat audit"
        description="Cel mai recent rezultat din growth_audit_results (kind=seo_audit_run)."
        accent="slate"
      >
        {loading && <p className="text-sm text-slate-500">Se încarcă...</p>}
        {!loading && !latest && (
          <p className="text-sm text-slate-500">Niciun rezultat încă.</p>
        )}
        {!loading && latest && (
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify(latest, null, 2)}
          </pre>
        )}
      </Card>
      </div>
    </GrowthPageShell>
  );
}
