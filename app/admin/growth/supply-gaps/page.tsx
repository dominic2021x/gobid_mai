"use client";

import { useState, useEffect, useCallback } from "react";
import GrowthCard from "../_components/GrowthCard";
import GrowthButton from "../_components/GrowthButton";
import GrowthPageShell from "../_components/GrowthPageShell";

interface SupplyGapRow {
  id: string;
  q_norm: string;
  category_slug: string | null;
  county_slug: string | null;
  search_demand: number;
  listing_supply: number;
  gap_score: number;
  quality_score?: number;
  flags?: string[];
  action_state?: string;
  status: string;
  created_at: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function SupplyGapsPage() {
  const [gaps, setGaps] = useState<SupplyGapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [activateLoading, setActivateLoading] = useState(false);
  const [createLoadingId, setCreateLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchGaps = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/supply-gaps/status", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setGaps((json.gaps ?? []) as SupplyGapRow[]);
      else setGaps([]);
    } catch {
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchGaps() : setLoading(false)));
  }, [fetchGaps]);

  const handleRefresh = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setRefreshLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/supply-gaps/enqueue", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Refresh enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchGaps, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRefreshLoading(false);
    }
  }, [fetchGaps]);

  const handleActivate = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setActivateLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/supply-gaps/activate/enqueue", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: `Activate enqueued (${json.jobId ?? "ok"}). Run worker.` });
        setTimeout(fetchGaps, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setActivateLoading(false);
    }
  }, [fetchGaps]);

  const handleCreateLanding = useCallback(
    async (gap: SupplyGapRow) => {
      const token = await getAdminToken();
      if (!token) return;
      setCreateLoadingId(gap.id);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/growth/supply-gaps/create-landing", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ gapId: gap.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = json?.code === "QUALITY_GATE" ? (json?.error as string) : (json?.error as string) ?? `Error ${res.status}`;
          setMessage({ type: "error", text: msg });
        } else {
          setMessage({ type: "success", text: `Landing page "${json.slug}" created.` });
          window.location.href = `/admin/growth/os/landing-pages/${encodeURIComponent(json.slug)}`;
        }
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      } finally {
        setCreateLoadingId(null);
      }
    },
    []
  );

  return (
    <GrowthPageShell
      title="Supply Gap Engine"
      description="High-demand / low-supply search queries. Create landing pages from gaps."
      actions={
        <div className="flex gap-2">
          <GrowthButton onClick={handleRefresh} loading={refreshLoading} icon="ri-refresh-line">
            Refresh gaps
          </GrowthButton>
          <GrowthButton variant="secondary" onClick={handleActivate} loading={activateLoading}>
            Activate
          </GrowthButton>
        </div>
      }
    >
      <div className="space-y-6">
        {message && (
          <div
            className={
              "rounded-lg px-4 py-2 text-sm " +
              (message.type === "success" ? "bg-[#E6F4EA] text-[#34A853]" : "bg-[#FCE8E6] text-[#EA4335]")
            }
          >
            {message.text}
          </div>
        )}

        <GrowthCard
          title="Supply gaps"
          description="q_norm, demand, supply, gap_score, quality_score, flags, action_state"
          accent="blue"
        >
          {loading ? (
            <p className="text-sm text-[#5F6368]">Loading…</p>
          ) : gaps.length === 0 ? (
            <p className="text-sm text-[#5F6368]">No supply gaps. Click Refresh gaps and run the worker.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#E8EAED]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8EAED] bg-[#F8F9FA] text-left">
                    <th className="p-2 font-medium text-[#5F6368]">q_norm</th>
                    <th className="p-2 font-medium text-[#5F6368]">demand</th>
                    <th className="p-2 font-medium text-[#5F6368]">supply</th>
                    <th className="p-2 font-medium text-[#5F6368]">gap</th>
                    <th className="p-2 font-medium text-[#5F6368]">quality</th>
                    <th className="p-2 font-medium text-[#5F6368]">flags</th>
                    <th className="p-2 font-medium text-[#5F6368]">action_state</th>
                    <th className="p-2 font-medium text-[#5F6368]">status</th>
                    <th className="p-2 font-medium text-[#5F6368]">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g) => (
                    <tr key={g.id} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA]">
                      <td className="max-w-[200px] truncate p-2 font-mono text-[#202124]" title={g.q_norm}>
                      {g.q_norm}
                    </td>
                      <td className="p-2 text-[#5F6368]">{g.search_demand}</td>
                      <td className="p-2 text-[#5F6368]">{g.listing_supply}</td>
                      <td className="p-2 text-[#5F6368]">{Number(g.gap_score).toFixed(1)}</td>
                      <td className="p-2 text-[#5F6368]">{Number(g.quality_score ?? 0)}</td>
                      <td className="max-w-[120px] truncate p-2 text-[#5F6368]" title={(g.flags ?? []).join(", ")}>
                      {(g.flags ?? []).length ? (g.flags ?? []).join(", ") : "—"}
                    </td>
                      <td className="p-2">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-xs " +
                            (g.action_state === "activated" ? "bg-[#E6F4EA] text-[#34A853]" : g.action_state === "ignored" ? "bg-[#E8EAED] text-[#5F6368]" : "bg-[#FEF7E0] text-[#FBBC04]")
                          }
                        >
                          {g.action_state ?? "new"}
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-xs " +
                            (g.status === "new" ? "bg-[#FEF7E0] text-[#FBBC04]" : "bg-[#E8EAED] text-[#5F6368]")
                          }
                        >
                          {g.status}
                        </span>
                      </td>
                      <td className="flex flex-wrap gap-1 p-2">
                        <GrowthButton
                          variant="secondary"
                          onClick={() => handleCreateLanding(g)}
                          disabled={createLoadingId === g.id}
                          loading={createLoadingId === g.id}
                          className="px-2 py-0.5 text-xs"
                        >
                          {createLoadingId === g.id ? "Creating…" : "Create LP"}
                        </GrowthButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
