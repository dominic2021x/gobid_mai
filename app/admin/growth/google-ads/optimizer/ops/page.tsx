"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../../_components/Card";
import GrowthPageShell from "../../../_components/GrowthPageShell";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

function coerceBoolean(v: unknown): boolean {
  if (v === true || v === "true" || v === "1") return true;
  return false;
}

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (x != null ? String(x).trim() : "")).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

interface OpsState {
  enabled: boolean;
  autoApplyEnabled: boolean;
  killCampaignIds: string[];
  pilotCampaignIds: string[];
  dailyHour: number;
}

interface DigestSnapshot {
  id?: string;
  scope_ref?: string;
  result?: {
    date?: string;
    generatedAt?: string;
    correlationId?: string;
    customerId?: string;
    latestPlan?: {
      planId?: string;
      planVersion?: number;
      status?: string;
      generatedAt?: string;
      actionsCount?: number;
      riskFlags?: string[];
    };
    recentJobRunsCount?: number;
    jobRuns?: Array<{ id?: string; ok?: boolean; startedAt?: string; meta?: unknown }>;
  };
  created_at?: string;
}

export default function OptimizerOpsPage() {
  const [ops, setOps] = useState<OpsState>({
    enabled: true,
    autoApplyEnabled: true,
    killCampaignIds: [],
    pilotCampaignIds: [],
    dailyHour: 9,
  });
  const [killCampaignIdsText, setKillCampaignIdsText] = useState("");
  const [pilotCampaignIdsText, setPilotCampaignIdsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runDailyLoading, setRunDailyLoading] = useState(false);
  const [digest, setDigest] = useState<DigestSnapshot | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);
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
      const settings = (data.settings ?? {}) as Record<string, { value: unknown }>;
      const enabled = coerceBoolean(settings.ads_optimizer_enabled?.value);
      const autoApplyEnabled = coerceBoolean(settings.ads_optimizer_auto_apply_enabled?.value);
      const killCampaignIds = coerceStringArray(settings.ads_optimizer_kill_campaign_ids?.value);
      const pilotCampaignIds = coerceStringArray(settings.ads_optimizer_pilot_campaign_ids?.value);
      const dailyHour = Number(settings.ads_optimizer_daily_hour?.value);
      setOps({
        enabled,
        autoApplyEnabled,
        killCampaignIds,
        pilotCampaignIds,
        dailyHour: Number.isFinite(dailyHour) ? dailyHour : 9,
      });
      setKillCampaignIdsText(killCampaignIds.join("\n"));
      setPilotCampaignIdsText(pilotCampaignIds.join("\n"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDigest = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setDigestLoading(true);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/digest/latest", {
      });
      if (!res.ok) return;
      const data = await res.json();
      setDigest(data.digest ?? null);
    } finally {
      setDigestLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchDigest();
  }, [fetchDigest]);

  const saveKillSwitch = async (updates: { enabled?: boolean; autoApplyEnabled?: boolean; killCampaignIds?: string[]; pilotCampaignIds?: string[] }) => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/kill-switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (data?.error as string) ?? `Eroare ${res.status}` });
        return;
      }
      setMessage({ type: "success", text: "Setări actualizate." });
      fetchSettings();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setSaving(false);
    }
  };

  const handleEnabledToggle = () => {
    const next = !ops.enabled;
    setOps((p) => ({ ...p, enabled: next }));
    saveKillSwitch({ enabled: next });
  };

  const handleAutoApplyToggle = () => {
    const next = !ops.autoApplyEnabled;
    setOps((p) => ({ ...p, autoApplyEnabled: next }));
    saveKillSwitch({ autoApplyEnabled: next });
  };

  const handleSaveKillCampaignIds = () => {
    const ids = killCampaignIdsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setOps((p) => ({ ...p, killCampaignIds: ids }));
    saveKillSwitch({ killCampaignIds: ids });
  };

  const handleSavePilotCampaignIds = () => {
    const ids = pilotCampaignIdsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setOps((p) => ({ ...p, pilotCampaignIds: ids }));
    saveKillSwitch({ pilotCampaignIds: ids });
  };

  const runDaily = async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setRunDailyLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/growth/google/ads/optimizer/run-daily", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (data?.error as string) ?? `Eroare ${res.status}` });
        return;
      }
      if (data.skipped) {
        setMessage({ type: "success", text: `Skip: ${data.reason as string}` });
      } else {
        setMessage({
          type: "success",
          text: `Run-daily enqueued. ${(data.enqueued as string[])?.length ?? 0} jobs.`,
        });
      }
      setTimeout(fetchDigest, 3000);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setRunDailyLoading(false);
    }
  };

  return (
    <GrowthPageShell
      title="Optimizer Ops"
      description="Kill switch & daily. Enable/disable optimizer, auto-apply, exclude campaigns, trigger daily run, view digest."
      actions={
        <Link
          href="/admin/growth/google-ads/optimizer"
          className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700"
        >
          ← Optimizer
        </Link>
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

      <Card title="Kill switch &amp; toggles" description="ads_optimizer_enabled, ads_optimizer_auto_apply_enabled" accent="amber">
        {loading ? (
          <p className="text-sm text-slate-500">Se încarcă...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={ops.enabled}
                onClick={handleEnabledToggle}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                  ops.enabled ? "bg-emerald-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    ops.enabled ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-slate-700">Optimizer enabled</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={ops.autoApplyEnabled}
                onClick={handleAutoApplyToggle}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                  ops.autoApplyEnabled ? "bg-emerald-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    ops.autoApplyEnabled ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-slate-700">Auto-apply enabled</span>
            </div>
          </div>
        )}
      </Card>

      <Card title="Kill campaign IDs" description="Campaign IDs to exclude from any optimizer action (one per line or comma-separated)" accent="slate">
        <div className="space-y-2">
          <textarea
            value={killCampaignIdsText}
            onChange={(e) => setKillCampaignIdsText(e.target.value)}
            placeholder="123456789\n987654321"
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={handleSaveKillCampaignIds}
            disabled={saving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Se salvează..." : "Salvează kill campaign IDs"}
          </button>
        </div>
      </Card>

      <Card title="Pilot campaign IDs" description="When non-empty, apply only actions for these campaigns; others skipped (PILOT_ONLY). One per line or comma-separated." accent="blue">
        <div className="space-y-2">
          <textarea
            value={pilotCampaignIdsText}
            onChange={(e) => setPilotCampaignIdsText(e.target.value)}
            placeholder="123456789"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSavePilotCampaignIds}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Se salvează..." : "Salvează pilot campaign IDs"}
          </button>
        </div>
      </Card>

      <Card title="Run daily" description="Enqueue refresh jobs, optimizer plan, auto-apply (if enabled), traffic quality, anomaly check, daily digest" accent="blue">
        <p className="mb-3 text-sm text-slate-600">
          Trigger the full daily orchestration. Digest job runs ~1h after enqueue.
        </p>
        <button
          type="button"
          onClick={runDaily}
          disabled={runDailyLoading || !ops.enabled}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {runDailyLoading ? "Se enqueue..." : "Run daily now"}
        </button>
      </Card>

      <Card title="Latest daily digest" description="Snapshot written by google_ads_optimizer_daily_digest job" accent="blue">
        {digestLoading ? (
          <p className="text-sm text-slate-500">Se încarcă...</p>
        ) : digest?.result ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              <strong>Date:</strong> {digest.result.date ?? "—"} ·{" "}
              <strong>Generated:</strong> {digest.result.generatedAt ? new Date(digest.result.generatedAt).toLocaleString() : "—"}
            </p>
            {digest.result.latestPlan && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-800">Latest plan</p>
                <p>ID: {digest.result.latestPlan.planId ?? "—"} · v{digest.result.latestPlan.planVersion ?? "—"} · {digest.result.latestPlan.status ?? "—"}</p>
                <p>Actions: {digest.result.latestPlan.actionsCount ?? 0} · Risk flags: {(digest.result.latestPlan.riskFlags ?? []).join(", ") || "—"}</p>
              </div>
            )}
            <p className="text-slate-600">Job runs today: {digest.result.recentJobRunsCount ?? 0}</p>
            {digest.created_at && (
              <p className="text-slate-500 text-xs">Snapshot created: {new Date(digest.created_at).toLocaleString()}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Niciun digest încă. Rulează run-daily și așteaptă digest job.</p>
        )}
        <button
          type="button"
          onClick={fetchDigest}
          className="mt-3 rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          Refresh digest
        </button>
      </Card>
      </div>
    </GrowthPageShell>
  );
}
