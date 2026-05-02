"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../_components/Card";
import GrowthPageShell from "../_components/GrowthPageShell";
import GrowthButton from "../_components/GrowthButton";

interface RootCause {
  issue: string;
  evidence: string;
  severity: "low" | "medium" | "high";
}

interface MarketingBrainResult {
  topFindings?: string[];
  priorities?: string[];
  adsInsights?: string[];
  seoInsights?: string[];
  funnelInsights?: string[];
  rootCauses?: RootCause[];
  generatedAt?: string;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" }) {
  const styles = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-amber-100 text-amber-800",
    high: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {severity}
    </span>
  );
}

export default function MarketingBrainPage() {
  const [analysis, setAnalysis] = useState<MarketingBrainResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchLatest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/marketing-brain/latest", {
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.analysis) {
        setAnalysis(data.analysis as MarketingBrainResult);
      } else {
        setAnalysis(null);
      }
    } catch {
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => {
      if (t) fetchLatest();
      else setLoading(false);
    });
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
      const res = await fetch("/api/admin/growth/marketing-brain/enqueue", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (data?.error as string) ?? `Error ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Analysis job enqueued (${data.jobId ?? "ok"}). Run worker to refresh.` });
      setTimeout(fetchLatest, 3000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setRefreshLoading(false);
    }
  }, [fetchLatest]);

  return (
    <GrowthPageShell
      title="AI Marketing Brain"
      description="Cross-channel analysis of Ads, Search Console, and GA4 funnel. Read-only insights for operators."
      actions={
        <GrowthButton onClick={handleRefresh} loading={refreshLoading} icon="ri-refresh-line">
          {refreshLoading ? "Enqueuing…" : "Refresh analysis"}
        </GrowthButton>
      }
    >
      <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Row 1: Status */}
      <Card title="Marketing Brain status" description="Latest analysis snapshot" accent="blue">
        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !analysis ? (
            <p className="text-sm text-slate-500">No analysis yet. Click &quot;Refresh analysis&quot; to enqueue the job and run the worker.</p>
          ) : (
            <>
              {analysis.generatedAt != null && (
                <p className="text-sm text-slate-600">Generated: {analysis.generatedAt}</p>
              )}
              <p className="text-sm text-slate-600">
                Top findings: {analysis.topFindings?.length ?? 0} · Priorities: {analysis.priorities?.length ?? 0} · Root causes: {analysis.rootCauses?.length ?? 0}
              </p>
            </>
          )}
        </div>
      </Card>

      {/* Row 2: Top findings */}
      <Card title="Top findings" accent="emerald">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : analysis?.topFindings?.length ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
            {analysis.topFindings.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No findings.</p>
        )}
      </Card>

      {/* Row 3: Priorities */}
      <Card title="Priorities" description="Ranked list" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : analysis?.priorities?.length ? (
          <ol className="list-inside list-decimal space-y-1 text-sm text-slate-800">
            {analysis.priorities.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">No priorities.</p>
        )}
      </Card>

      {/* Row 4: Ads + SEO insights */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Ads insights" description="CPC / CPA issues" accent="amber">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : analysis?.adsInsights?.length ? (
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
              {analysis.adsInsights.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No ads insights.</p>
          )}
        </Card>
        <Card title="SEO insights" description="Pages with impressions but low CTR" accent="slate">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : analysis?.seoInsights?.length ? (
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
              {analysis.seoInsights.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No SEO insights (or Search Console not connected).</p>
          )}
        </Card>
      </div>

      {/* Row 5: Funnel insights */}
      <Card title="Funnel insights" description="Conversion leaks" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : analysis?.funnelInsights?.length ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
            {analysis.funnelInsights.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No funnel insights (or GA4 not connected).</p>
        )}
      </Card>

      {/* Row 6: Root causes */}
      <Card title="Root causes" description="Issue, evidence, severity" accent="amber">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : analysis?.rootCauses?.length ? (
          <ul className="space-y-3">
            {analysis.rootCauses.map((rc, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{rc.issue}</span>
                  <SeverityBadge severity={rc.severity} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{rc.evidence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No root causes.</p>
        )}
      </Card>
      </div>
    </GrowthPageShell>
  );
}
