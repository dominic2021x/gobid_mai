"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  "rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] focus:border-[#4285F4] focus:outline-none focus:ring-1 focus:ring-[#4285F4]";

export default function GrowthGoogleAdsPage() {
  const [reportSnapshot, setReportSnapshot] = useState<unknown>(null);
  const [actionsSnapshot, setActionsSnapshot] = useState<unknown>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [enqueueing, setEnqueueing] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSnapshot = useCallback(
    async (product: string, kind: string, setter: (d: unknown) => void, setLoading: (b: boolean) => void) => {
      const token = await getAdminToken();
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/growth/google/snapshots?product=${encodeURIComponent(product)}&kind=${encodeURIComponent(kind)}`,
          { headers: {} }
        );
        if (res.ok) {
          const data = await res.json();
          setter(data.snapshot?.result ?? null);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSnapshot("google_ads", "report", setReportSnapshot, setLoadingReport);
    fetchSnapshot("google_ads", "conversion_actions", setActionsSnapshot, setLoadingActions);
  }, [fetchSnapshot]);

  const enqueue = async (type: string, payload: Record<string, unknown>) => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setEnqueueing(type);
    setMessage(null);
    try {
      let url = "";
      let body: string | undefined;
      if (type === "report") {
        url = "/api/admin/growth/google/ads/reports/enqueue";
        body = JSON.stringify({ queryId: "campaign_performance" });
      } else if (type === "create_action") {
        url = "/api/admin/growth/google/ads/conversions/actions";
        body = JSON.stringify({ name: createName.trim() || "Growth conversion", type: "PAGE_LOAD" });
      } else if (type === "upload") {
        url = "/api/admin/growth/google/ads/conversions/upload";
        body = JSON.stringify({
          conversions: [
            {
              gclid: "test-gclid-" + Date.now(),
              conversionAction: "customers/0/conversionActions/0",
              conversionDateTime: new Date().toISOString().replace("Z", "+00:00").slice(0, 19).replace("T", " "),
              conversionValue: 1,
            },
          ],
        });
      }
      if (!url) return;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? `Eroare ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: `Job enqueued: ${data.jobId ?? "ok"}. Rulează worker-ul pentru a procesa.` });
      if (type === "report") setTimeout(() => fetchSnapshot("google_ads", "report", setReportSnapshot, setLoadingReport), 2000);
      if (type === "create_action") {
        setCreateName("");
        setTimeout(() => fetchSnapshot("google_ads", "conversion_actions", setActionsSnapshot, setLoadingActions), 2000);
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setEnqueueing(null);
    }
  };

  return (
    <GrowthPageShell
      title="Google Ads"
      description="Rapoarte, conversion actions și upload conversions. Folosesc customer_id din Integrations."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/growth/google-ads/control"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
          >
            Live Control Panel →
          </Link>
          <Link
            href="/admin/growth/google-ads/optimizer"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700"
          >
            Optimizer
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <GrowthCard title="Google Ads" accent="blue">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-[#5F6368]">Raport (GAQL allowlisted)</p>
              <GrowthButton
                onClick={() => enqueue("report", {})}
                loading={enqueueing === "report"}
                icon="ri-file-list-3-line"
              >
                {enqueueing === "report" ? "Se enqueue..." : "Rulează raport campaign_performance"}
              </GrowthButton>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-[#5F6368]">Conversion actions (listă din snapshot)</p>
              {loadingActions && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
              {!loadingActions && actionsSnapshot != null ? (
                <pre className="max-h-48 overflow-auto rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-3 text-xs text-[#5F6368]">
                  {JSON.stringify(actionsSnapshot, null, 2)}
                </pre>
              ) : null}
              {!loadingActions && !actionsSnapshot && (
                <p className="text-sm text-[#5F6368]">Niciun snapshot. Apasă „Refresh conversion actions” sau creează o acțiune.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <GrowthButton
                  variant="secondary"
                  onClick={async () => {
                    const token = await getAdminToken();
                    if (!token) return;
                    setEnqueueing("refresh_actions");
                    try {
                      const r = await fetch("/api/admin/growth/jobs/enqueue", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ type: "google_ads_conversion_actions_refresh", payload: {} }),
                      });
                      const d = await r.json().catch(() => ({}));
                      if (r.ok) setMessage({ type: "success", text: `Job ${d.jobId} enqueued. Rulează worker-ul.` });
                      else setMessage({ type: "error", text: d?.error ?? "Eroare" });
                    } finally {
                      setEnqueueing(null);
                      setTimeout(() => fetchSnapshot("google_ads", "conversion_actions", setActionsSnapshot, setLoadingActions), 2000);
                    }
                  }}
                  loading={enqueueing === "refresh_actions"}
                >
                  Refresh conversion actions
                </GrowthButton>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nume acțiune"
                  className={inputClass}
                />
                <GrowthButton
                  onClick={() => enqueue("create_action", { name: createName })}
                  loading={enqueueing === "create_action"}
                  disabled={!createName.trim()}
                >
                  Enqueue create action
                </GrowthButton>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-[#5F6368]">Upload conversions (test)</p>
              <GrowthButton
                onClick={() => enqueue("upload", {})}
                loading={enqueueing === "upload"}
                variant="secondary"
              >
                Enqueue upload test conversion
              </GrowthButton>
            </div>
            {message && (
              <p className={`text-sm ${message.type === "success" ? "text-[#34A853]" : "text-[#EA4335]"}`}>
                {message.text}
              </p>
            )}
          </div>
        </GrowthCard>

        <GrowthCard title="Ultimul raport (snapshot)" accent="slate">
          {loadingReport && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
          {!loadingReport && reportSnapshot != null ? (
            <pre className="max-h-64 overflow-auto rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-3 text-xs text-[#5F6368]">
              {JSON.stringify(reportSnapshot, null, 2)}
            </pre>
          ) : null}
          {!loadingReport && !reportSnapshot && (
            <p className="text-sm text-[#5F6368]">Niciun raport încă. Apasă „Rulează raport campaign_performance” și așteaptă worker-ul.</p>
          )}
          <GrowthButton
            variant="ghost"
            onClick={() => fetchSnapshot("google_ads", "report", setReportSnapshot, setLoadingReport)}
            className="mt-2"
          >
            Reîmprospătează
          </GrowthButton>
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
