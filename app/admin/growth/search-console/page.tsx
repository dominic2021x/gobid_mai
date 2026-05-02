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

export default function GrowthSearchConsolePage() {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [enqueueing, setEnqueueing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSnapshot = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        "/api/admin/growth/google/snapshots?product=search_console&kind=performance",
        { headers: {} }
      );
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot?.result ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const runPull = async (days: 7 | 28) => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setEnqueueing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/search-console/performance/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Eroare ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Job enqueued (${days} zile). Rulează worker-ul, apoi reîmprospătează.` });
      setTimeout(fetchSnapshot, 3000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setEnqueueing(false);
    }
  };

  return (
    <GrowthPageShell
      title="Search Console"
      description="Performanță pentru siteUrl selectat în Integrations."
    >
      <div className="space-y-6">
        <GrowthCard
          title="Search Console – Performance"
          description="Trage date de performanță pentru siteUrl selectat în Integrations (gsc_site_url)."
          accent="blue"
        >
          <div className="flex flex-wrap gap-2">
            <GrowthButton onClick={() => runPull(7)} loading={enqueueing} icon="ri-download-line">
              Rulează pull 7 zile
            </GrowthButton>
            <GrowthButton
              variant="secondary"
              onClick={() => runPull(28)}
              loading={enqueueing}
            >
              Rulează pull 28 zile
            </GrowthButton>
          </div>
          {message && (
            <p className={`mt-2 text-sm ${message.type === "success" ? "text-[#34A853]" : "text-[#EA4335]"}`}>
              {message.text}
            </p>
          )}
        </GrowthCard>

        <GrowthCard title="Ultimul snapshot performanță" accent="slate">
          {loading && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
          {!loading && snapshot !== null && snapshot !== undefined ? (
            <pre className="max-h-96 overflow-auto rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-3 text-xs text-[#5F6368]">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          ) : null}
          {!loading && !snapshot && (
            <p className="text-sm text-[#5F6368]">Niciun snapshot. Rulează un pull mai întâi.</p>
          )}
          <GrowthButton variant="ghost" onClick={fetchSnapshot} className="mt-2">
            Reîmprospătează
          </GrowthButton>
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
