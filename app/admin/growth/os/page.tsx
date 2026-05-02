"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../_components/Card";
import GrowthPageShell from "../_components/GrowthPageShell";
import GrowthButton from "../_components/GrowthButton";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function GrowthOsPage() {
  const [data, setData] = useState<{ dailyPack: Record<string, unknown> | null; dailyPackAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/latest", { headers: {} });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setData({ dailyPack: json.dailyPack ?? null, dailyPackAt: json.dailyPackAt ?? null });
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchLatest() : setLoading(false)));
  }, [fetchLatest]);

  const handleRunDaily = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Not authenticated." });
      return;
    }
    setRunLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/run-daily", { method: "POST", headers: {} });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: "Daily pack enqueued. Run worker; daily_pack runs in 30m." });
        setTimeout(fetchLatest, 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRunLoading(false);
    }
  }, [fetchLatest]);

  const pack = data?.dailyPack as { generatedAt?: string } | null;

  return (
    <GrowthPageShell
      title="Growth OS"
      description="Autonomous Growth System: SEO, keyword discovery, content suggestions. Orchestrated run-daily."
      actions={
        <GrowthButton onClick={handleRunDaily} loading={runLoading} icon="ri-play-line">
          {runLoading ? "Enqueuing…" : "Run daily"}
        </GrowthButton>
      }
    >
      <div className="space-y-6">
      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"}`}>{message.text}</div>
      )}
      <Card title="Daily pack status" description="Latest aggregated snapshot" accent="blue">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : !pack ? <p className="text-sm text-slate-500">No daily pack yet. Click Run daily and run the worker.</p> : <p className="text-sm text-slate-600">Generated: {(pack as { generatedAt?: string }).generatedAt ?? data?.dailyPackAt ?? "—"}</p>}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/growth/os/seo" className="block transition hover:opacity-90"><Card title="SEO opportunities" description="Low CTR, striking distance, internal links" accent="emerald"><p className="text-sm font-medium text-slate-600">View & refresh →</p></Card></Link>
        <Link href="/admin/growth/os/keywords" className="block transition hover:opacity-90"><Card title="Keyword clusters" description="Discovery and clusters" accent="blue"><p className="text-sm font-medium text-slate-600">View & refresh →</p></Card></Link>
        <Link href="/admin/growth/os/content" className="block transition hover:opacity-90"><Card title="Content briefs" description="AI content suggestions" accent="amber"><p className="text-sm font-medium text-slate-600">View & refresh →</p></Card></Link>
        <Link href="/admin/growth/os/landing-pages" className="block transition hover:opacity-90"><Card title="Landing pages" description="Edit, preview, publish" accent="blue"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/internal-links" className="block transition hover:opacity-90"><Card title="Internal linking" description="Generate, apply, Resurse utile" accent="emerald"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/pseo" className="block transition hover:opacity-90"><Card title="Programmatic SEO" description="Index budget, score & promote" accent="blue"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/flywheel" className="block transition hover:opacity-90"><Card title="SEO Flywheel" description="Ranked opportunities, CTR experiments, hubs" accent="blue"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/demand" className="block transition hover:opacity-90"><Card title="Search Demand Mining" description="Internal + GSC demand, create LP candidates" accent="blue"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/demand-flywheel" className="block transition hover:opacity-90"><Card title="Demand Flywheel" description="Demand → Search → SEO actions, execute via jobs" accent="emerald"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/trends" className="block transition hover:opacity-90"><Card title="Trends" description="Spike detection, create LP, seed links, hub" accent="blue"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/graph" className="block transition hover:opacity-90"><Card title="Semantic Graph" description="Nodes, edges, embeddings, link recs" accent="blue"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/search-intel" className="block transition hover:opacity-90"><Card title="Search Intelligence" description="Bucket weights, arms, query boosts, rollup" accent="amber"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/os/search-personal" className="block transition hover:opacity-90"><Card title="Personal Search Agent" description="Opt-in profiles, rollup summary" accent="slate"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
        <Link href="/admin/growth/supply-gaps" className="block transition hover:opacity-90"><Card title="Supply Gap Engine" description="High-demand / low-supply queries" accent="emerald"><p className="text-sm font-medium text-slate-600">View →</p></Card></Link>
      </div>
      </div>
    </GrowthPageShell>
  );
}
