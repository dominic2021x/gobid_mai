"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function GrowthOsSeoPage() {
  const [opportunities, setOpportunities] = useState<Record<string, unknown> | null>(null);
  const [linkPlan, setLinkPlan] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/latest", { headers: {} });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setOpportunities(json.seoOpportunities ?? null);
        setLinkPlan(json.seoInternalLinkPlan ?? null);
      } else {
        setOpportunities(null);
        setLinkPlan(null);
      }
    } catch {
      setOpportunities(null);
      setLinkPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchLatest() : setLoading(false)));
  }, [fetchLatest]);

  const handleRefresh = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Not authenticated." });
      return;
    }
    setRefreshLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/os/seo/enqueue", { method: "POST", headers: {} });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ type: "error", text: (json?.error as string) ?? `Error ${res.status}` });
      else {
        setMessage({ type: "success", text: "SEO refresh enqueued. Run worker." });
        setTimeout(fetchLatest, 3000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRefreshLoading(false);
    }
  }, [fetchLatest]);

  const lowCtr = (opportunities?.lowCtrPages as Array<Record<string, unknown>>) ?? [];
  const striking = (opportunities?.strikingDistanceQueries as Array<Record<string, unknown>>) ?? [];
  const issues = (opportunities?.indexabilityIssues as Array<Record<string, unknown>>) ?? [];
  const plans = (linkPlan?.plans as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">← Growth OS</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">SEO opportunities</h1>
        <div className="flex gap-2">
          <Link href="/admin/growth/os/seo/apply" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Apply overrides</Link>
          <button type="button" onClick={handleRefresh} disabled={refreshLoading} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {refreshLoading ? "Enqueuing…" : "Refresh SEO"}
          </button>
        </div>
      </div>
      {message && (
        <div className={"rounded-lg px-4 py-2 text-sm " + (message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{message.text}</div>
      )}
      <Card title="Low CTR pages" description="Suggested title and meta" accent="emerald">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : lowCtr.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
          <ul className="space-y-2 text-sm">
            {lowCtr.slice(0, 15).map((p, i) => (
              <li key={i} className="rounded border border-slate-200 p-2">
                <div className="font-medium text-slate-800">{String(p.page ?? "")}</div>
                <div className="text-slate-500">Impressions: {Number(p.impressions ?? 0)} · CTR: {Number(p.ctr ?? 0) * 100}%</div>
                {p.suggestedTitle != null ? <div className="mt-1 text-slate-700">Title: {String(p.suggestedTitle)}</div> : null}
                {p.suggestedMeta != null ? <div className="text-slate-600">Meta: {String(p.suggestedMeta)}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Striking distance queries" description="Position 4 to 15" accent="blue">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : striking.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
          <ul className="space-y-2 text-sm">
            {striking.slice(0, 15).map((s, i) => (
              <li key={i} className="rounded border border-slate-200 p-2">
                <div className="font-medium text-slate-800">{String(s.query ?? "")}</div>
                <div className="text-slate-500">Position: {Number(s.position ?? 0)} · Page: {String(s.page ?? "")}</div>
                {Array.isArray(s.suggestedActions) && (s.suggestedActions as string[]).length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-slate-600">{(s.suggestedActions as string[]).map((a, j) => <li key={j}>{a}</li>)}</ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Indexability issues" accent="amber">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : issues.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
          <ul className="space-y-1 text-sm">
            {issues.slice(0, 20).map((u, i) => (
              <li key={i} className="rounded border border-slate-200 p-2">
                <div className="font-medium text-slate-800">{String(u.url ?? "")}</div>
                <div className="text-slate-600">{(u.reasons as string[])?.join("; ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Internal link plan" accent="slate">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : plans.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
          <ul className="space-y-3 text-sm">
            {plans.map((plan, i) => (
              <li key={i} className="rounded border border-slate-200 p-3">
                <div className="font-medium text-slate-800">Target: {String(plan.targetUrl ?? "")}</div>
                <div className="mt-1 text-slate-600">Sources: {(plan.sourceUrls as string[])?.join(", ")}</div>
                <div className="mt-1 text-slate-600">Anchors: {(plan.suggestedAnchors as string[])?.join(", ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
