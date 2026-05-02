"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  ScanSearch,
  Trash2,
  Activity,
  Database,
  Cloud,
  Timer,
  GitCompare,
  Radio,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type CleanupDiag = {
  activeTotal: number;
  activeWithoutProductImages: number;
  activeWithoutPiUploadsPrefix: number;
  blockedWrongStoragePrefix: number;
  blockedGraceLessThan24hNoPi: number;
  blockedPendingOrProcessingJobs: number;
  orphanEligibleStrict: number;
};

type Totals = {
  distinctProductsWithActiveImages: number | null;
  uploadedImagesActive: number | null;
  uploadedImagesSoftDeletedTotal: number | null;
  softDeletedGraceUnder24h: number | null;
  orphanCandidatesEligible: number | null;
  readyForPhysicalR2Purge: number | null;
};

type DashboardStats = {
  at: string;
  r2Configured: boolean;
  diag?: CleanupDiag | null;
  totals: Totals;
  warnings?: string[];
};

type CleanupTickResponse = {
  success: boolean;
  statsBefore: DashboardStats;
  statsAfter: DashboardStats;
  delta: {
    orphanCandidatesEligible: number | null;
    readyForPhysicalR2Purge: number | null;
    uploadedImagesActive: number | null;
    uploadedImagesSoftDeletedTotal: number | null;
  };
  tick: Record<string, unknown>;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("ro-RO");
}

/** În afara componentei → nu dispare la Fast Refresh / HMR (evită ReferenceError la click). */
function runCleanupPanelRefresh(
  fetchStatus: () => Promise<boolean>,
  setRefreshing: (v: boolean) => void
): void {
  void (async () => {
    setRefreshing(true);
    try {
      await fetchStatus();
    } finally {
      setRefreshing(false);
    }
  })();
}

function MetricTile({
  label,
  sub,
  value,
  pulse,
}: {
  label: string;
  sub?: string;
  value: string;
  pulse?: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        pulse ? "ring-2 ring-blue-200/80 ring-offset-2" : ""
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-slate-400">{sub}</p>}
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

export default function ImageCleanupPanel() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [tickElapsedMs, setTickElapsedMs] = useState(0);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [livePoll, setLivePoll] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<(CleanupTickResponse & { error?: string }) | null>(null);
  const [lastAudit, setLastAudit] = useState<Record<string, unknown> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setToken(data.session?.access_token ?? "");
      setLoading(false);
    })();
  }, []);

  const fetchStatus = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch("/api/admin/cleanup/images", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) {
        setStatusError(j?.error ?? `HTTP ${res.status}`);
        setStats(null);
        return false;
      }
      setStatusError(null);
      setStats(j.stats ?? null);
      setNotes(Array.isArray(j.notes) ? j.notes : []);
      return true;
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Eroare rețea");
      return false;
    }
  }, [token]);

  useEffect(() => {
    if (token) void fetchStatus();
  }, [token, fetchStatus]);

  useEffect(() => {
    if (!livePoll || !token || busy) return;
    const id = window.setInterval(() => void fetchStatus(), 8000);
    return () => clearInterval(id);
  }, [livePoll, token, busy, fetchStatus]);

  useEffect(() => {
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

  const startTickTimer = () => {
    setTickElapsedMs(0);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    const t0 = Date.now();
    tickTimerRef.current = setInterval(() => setTickElapsedMs(Date.now() - t0), 100);
  };

  const stopTickTimer = () => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  };

  const runCleanupTick = async () => {
    setBusy("cleanup_tick");
    setLastCleanup(null);
    setActionError(null);
    startTickTimer();
    try {
      const res = await fetch("/api/admin/cleanup/images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "cleanup_tick" }),
      });
      const j = (await res.json()) as CleanupTickResponse & { error?: string };
      if (res.ok && j.statsAfter) {
        setStats(j.statsAfter);
        setLastCleanup(j);
      } else {
        setActionError(j?.error ?? `HTTP ${res.status}`);
        setLastCleanup(null);
      }
      await fetchStatus();
    } finally {
      stopTickTimer();
      setBusy(null);
    }
  };

  const runAudit = async () => {
    setBusy("r2_audit");
    setLastAudit(null);
    setActionError(null);
    startTickTimer();
    try {
      const res = await fetch("/api/admin/cleanup/images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "r2_audit" }),
      });
      const j = await res.json();
      if (res.ok) setLastAudit(j);
      else setActionError((j as { error?: string })?.error ?? `HTTP ${res.status}`);
      await fetchStatus();
    } finally {
      stopTickTimer();
      setBusy(null);
    }
  };

  const t = stats?.totals;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm font-medium">Se încarcă panoul…</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
        Nu există sesiune validă. Reautentifică-te în panoul admin.
      </div>
    );
  }

  const tick = lastCleanup?.tick as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Intro card — light */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-2xl gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" aria-hidden />
            <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Curățare stocare</p>
            <h2 className="text-lg font-semibold text-slate-900">Monitor imagini &amp; R2</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Numărul mare la „În uz” sunt <strong className="font-medium text-slate-800">poze</strong> (rânduri în{" "}
              <code className="rounded bg-slate-100 px-1 text-[13px]">uploaded_images</code>), nu numărul de anunțuri.
              Un singur produs poate avea zeci sau sute de fișiere după import sau variante. Cozile de curățare urmează aceleași
              reguli ca în cron (orfani, R2, grație 24h).
            </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runCleanupPanelRefresh(fetchStatus, setRefreshing)}
              disabled={!!busy}
              aria-busy={refreshing}
              className={`inline-flex min-w-[158px] items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px active:shadow-inner ${
                refreshing
                  ? "pointer-events-none cursor-wait border-blue-300 bg-blue-50 text-blue-900 shadow-inner ring-2 ring-blue-200/80"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              }`}
            >
              <RefreshCw
                className={`h-4 w-4 shrink-0 ${refreshing || busy ? "animate-spin text-blue-600" : "text-slate-500"}`}
                aria-hidden
              />
              {refreshing ? "Se actualizează…" : "Actualizează"}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <Radio className={`h-4 w-4 text-slate-500 ${livePoll ? "text-blue-600" : ""}`} />
              <span>Live ~8s</span>
              <input
                type="checkbox"
                className="sr-only"
                checked={livePoll}
                onChange={(e) => setLivePoll(e.target.checked)}
              />
            </label>
          </div>
        </div>

        {stats?.warnings && stats.warnings.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong className="font-semibold text-amber-900">Atenție:</strong> {stats.warnings.join(" · ")}
          </div>
        )}
      </div>

      {statusError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{statusError}</div>
      )}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{actionError}</div>
      )}

      {/* Metrics grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          label="Produse cu poză activă"
          sub="SKU-uri distincte cu ≥1 imagine (product_images)"
          value={fmt(t?.distinctProductsWithActiveImages)}
        />
        <MetricTile
          label="În uz (active)"
          sub="Rânduri uploaded_images — poze în DB, nu nr. produse"
          value={fmt(t?.uploadedImagesActive)}
          pulse={livePoll && !busy}
        />
        <MetricTile
          label="Orfani eligibili"
          sub="SQL: fără product_images, cheie uploads/…, ≥24h, fără job pending"
          value={fmt(t?.orphanCandidatesEligible)}
        />
        <MetricTile
          label="Coadă purge R2"
          sub="Soft-delete ≥24h — urmează DeleteObject"
          value={fmt(t?.readyForPhysicalR2Purge)}
        />
        <MetricTile
          label="Grace 24h"
          sub="Marcate recent — înainte de R2"
          value={fmt(t?.softDeletedGraceUnder24h)}
        />
        <MetricTile
          label="Total soft-delete"
          sub="Toate rândurile marcate în DB"
          value={fmt(t?.uploadedImagesSoftDeletedTotal)}
        />
        <MetricTile
          label="R2 configurat"
          sub="Variabile bucket + chei"
          value={stats?.r2Configured ? "DA" : "NU"}
        />
      </div>

      {stats?.diag && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            De ce pare că „nu mai ai anunțuri”, dar nu sunt orfani?
          </p>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              <strong className="text-slate-900">Curățarea nu numără ce vezi în listă</strong> (piese-auto, filtre, „câte crezi că ai”).
              Evaluează doar tabelele <code className="rounded bg-slate-100 px-1 text-[13px]">uploaded_images</code> și{" "}
              <code className="rounded bg-slate-100 px-1 text-[13px]">product_images</code>. Nu știe de categorie sau de pagina publică.
            </p>
            <p>
              În cod, <strong className="text-slate-900">„orfan” nu înseamnă „nu merită să existe”</strong>, ci literal:{" "}
              <strong className="text-slate-900">nicio înregistrare produs nu mai declară URL-ul acelei poze</strong> în{" "}
              <code className="rounded bg-slate-100 px-1 text-[13px]">products.images</code>. Tabela{" "}
              <code className="rounded bg-slate-100 px-1 text-[13px]">product_images</code> este doar o oglindă a acelui JSON (actualizată la salvare).
            </p>
            <p>
              Dacă în DB mai există rânduri în <code className="rounded bg-slate-100 px-1 text-[13px]">products</code> care încă conțin acele URL-uri în{" "}
              <code className="rounded bg-slate-100 px-1 text-[13px]">images</code>, pentru sistem pozele sunt încă{" "}
              <strong className="text-slate-900">în uz</strong>, chiar dacă ție îți par „vechi” sau nu le mai vezi unde te uiți tu în UI.
            </p>
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detalii tehnice (aceleași reguli ca la tick)</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Tick-ul apelează <code className="rounded bg-slate-100 px-1 text-[13px]">mark_orphan_uploaded_images_soft_delete</code>: setează{" "}
            <code className="rounded bg-slate-100 px-1 text-[13px]">deleted_at</code> doar unde nu mai există rând în{" "}
            <code className="rounded bg-slate-100 px-1 text-[13px]">product_images</code>, plus prefix <code className="text-[13px]">uploads/</code>, grație 24h, fără job blocat.
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-slate-600">Active fără nicio legătură product_images</dt>
              <dd className="font-mono font-semibold text-slate-900">{fmt(stats.diag.activeWithoutProductImages)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-slate-600">… și cu storage_key „uploads/…”</dt>
              <dd className="font-mono font-semibold text-slate-900">{fmt(stats.diag.activeWithoutPiUploadsPrefix)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-slate-600">Blocate: prefix ≠ uploads/ (nu intră în cleanup)</dt>
              <dd className="font-mono font-semibold text-slate-900">{fmt(stats.diag.blockedWrongStoragePrefix)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-slate-600">Blocate: &lt; 24h de la încărcare (grație)</dt>
              <dd className="font-mono font-semibold text-slate-900">{fmt(stats.diag.blockedGraceLessThan24hNoPi)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-slate-600">Blocate: image_jobs pending/processing</dt>
              <dd className="font-mono font-semibold text-slate-900">{fmt(stats.diag.blockedPendingOrProcessingJobs)}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
              <dt className="text-blue-950">Orfani eligibili (strict, ca la tick)</dt>
              <dd className="font-mono font-semibold text-blue-950">{fmt(stats.diag.orphanEligibleStrict)}</dd>
            </div>
          </dl>
          {stats.diag.activeWithoutProductImages === 0 && stats.diag.activeTotal > 0 ? (
            <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              Indicatorii spun că <strong>toate</strong> pozele active au cel puțin un rând în <code className="text-[13px]">product_images</code> → în DB nu sunt orfani de șters automat. Ca să declanșezi curățarea:{" "}
              <strong className="font-semibold text-sky-950">scoate URL-urile din</strong>{" "}
              <code className="text-[13px]">products.images</code> pentru produsul respectiv și salvează, sau{" "}
              <strong className="font-semibold text-sky-950">șterge produsul</strong> din admin (ștergerea scoate legăturile); apoi așteaptă grația de 24h și rulează din nou tick-ul.
            </p>
          ) : null}
          {stats.diag.blockedPendingOrProcessingJobs > 0 ? (
            <p className="mt-3 text-xs text-amber-900">
              Job-uri în coadă blochează marcarea orfanilor până se finalizează sau se resetează (ex. migrare{" "}
              <code className="rounded bg-amber-100 px-1">reset_stale_image_jobs</code>).
            </p>
          ) : null}
        </div>
      )}

      {t?.uploadedImagesActive != null &&
        t.distinctProductsWithActiveImages != null &&
        t.distinctProductsWithActiveImages > 0 && (
          <p className="text-center text-xs leading-relaxed text-slate-600">
            Medie orientativă: ~{Math.round(t.uploadedImagesActive / t.distinctProductsWithActiveImages)}{" "}
            înregistrări de poză per produs care are galerie (doar matematică DB, nu include produse fără imagini).
          </p>
        )}

      {stats?.at && (
        <p className="text-center text-xs text-slate-500">
          Ultimul eșantion:{" "}
          <span className="font-mono text-slate-600">{new Date(stats.at).toLocaleString("ro-RO")}</span>
        </p>
      )}

      {/* Running */}
      {busy && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-blue-100 bg-blue-50/80 px-5 py-4 shadow-sm">
          <Loader2 className="h-8 w-8 shrink-0 animate-spin text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">
              {busy === "cleanup_tick" ? "Se rulează tick-ul de curățare…" : "Se scanează bucket-ul R2 (audit)…"}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">Poate dura până la ~2 minute. Nu închide pagina.</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 font-mono text-base tabular-nums text-slate-800 shadow-sm">
            <Timer className="h-4 w-4 text-blue-500" />
            {(tickElapsedMs / 1000).toFixed(1)}s
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void runCleanupTick()}
          disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-45"
        >
          {busy === "cleanup_tick" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Rulează tick curățare
        </button>
        <button
          type="button"
          onClick={() => void runAudit()}
          disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-45"
        >
          {busy === "r2_audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          Audit R2 vs DB
        </button>
      </div>

      {/* Delta after cleanup */}
      {lastCleanup && lastCleanup.statsBefore && lastCleanup.statsAfter && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
            <GitCompare className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">Impact ultimul tick</h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Înainte → După</p>
              <div className="mt-4 space-y-3 text-sm">
                <RowCompare
                  label="Orfani eligibili"
                  before={lastCleanup.statsBefore.totals.orphanCandidatesEligible}
                  after={lastCleanup.statsAfter.totals.orphanCandidatesEligible}
                  delta={lastCleanup.delta?.orphanCandidatesEligible}
                />
                <RowCompare
                  label="Coadă purge R2"
                  before={lastCleanup.statsBefore.totals.readyForPhysicalR2Purge}
                  after={lastCleanup.statsAfter.totals.readyForPhysicalR2Purge}
                  delta={lastCleanup.delta?.readyForPhysicalR2Purge}
                />
                <RowCompare
                  label="Active în DB"
                  before={lastCleanup.statsBefore.totals.uploadedImagesActive}
                  after={lastCleanup.statsAfter.totals.uploadedImagesActive}
                  delta={lastCleanup.delta?.uploadedImagesActive}
                />
                <RowCompare
                  label="Total soft-delete"
                  before={lastCleanup.statsBefore.totals.uploadedImagesSoftDeletedTotal}
                  after={lastCleanup.statsAfter.totals.uploadedImagesSoftDeletedTotal}
                  delta={lastCleanup.delta?.uploadedImagesSoftDeletedTotal}
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
              <p className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                <Activity className="h-4 w-4 text-emerald-600" />
                Execuție worker
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <StatKv k="Marcaj orfan (soft)" v={tick?.softMarked} />
                <StatKv k="Candidați purge" v={tick?.purgeCandidates} />
                <StatKv k="Șters R2 (succes)" v={tick?.r2DeleteSuccess} />
                <StatKv k="Rânduri DB după R2" v={tick?.purgedDbRows} />
                <StatKv k="Retry eșuat R2" v={tick?.r2DeleteSkippedAfterRetries} />
                <StatKv k="DB sărit (încă referințe)" v={tick?.dbDeleteSkippedStillReferenced} />
                <StatKv k="Chei respinse" v={tick?.storageKeyRejected} />
                <StatKv k="Durată ms" v={tick?.executionMs} />
              </dl>
              {tick?.stoppedEarly ? (
                <p className="mt-3 text-xs text-amber-800">Tick oprit devreme (timeout sau cap).</p>
              ) : null}
              {Array.isArray(tick?.rpcErrors) && (tick.rpcErrors as string[]).length > 0 ? (
                <p className="mt-3 text-xs text-amber-900">
                  RPC: {(tick.rpcErrors as string[]).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Audit summary */}
      {lastAudit && lastAudit.success !== false && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Cloud className="h-4 w-4 text-sky-600" /> Rezultat audit R2
          </h3>
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 shadow-sm">
              Chei scanate: <strong className="text-slate-900">{fmt(Number(lastAudit.scannedObjectKeys))}</strong>
            </div>
            <div className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 shadow-sm">
              Orfane în bucket (est.): <strong className="text-slate-900">{fmt(Number(lastAudit.orphanCount))}</strong>
            </div>
            <div className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 shadow-sm">
              Eșantion chei (max 100): {(lastAudit.orphanKeysInR2NotInDb as string[])?.length ?? 0}
            </div>
          </div>
          {typeof lastAudit.error === "string" && lastAudit.error.trim() !== "" ? (
            <p className="mt-4 text-xs text-amber-900">{lastAudit.error}</p>
          ) : null}
        </div>
      )}

      {(lastCleanup || lastAudit) && (
        <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">
            Răspuns JSON complet (debug)
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-800">
            {JSON.stringify(lastCleanup || lastAudit, null, 2)}
          </pre>
        </details>
      )}

      {notes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cum funcționează</p>
          <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-3">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Delta-uri din API sunt definite astfel încât valori > 0 = îmbunătățire tipică (mai puțini orfani/coadă, mai puține active, mai multe marcate soft). */
function RowCompare({
  label,
  before,
  after,
  delta,
}: {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}) {
  const good = delta === null || delta === 0 ? null : delta > 0;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-600">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="font-mono tabular-nums text-slate-500">{fmt(before)}</span>
        <span className="text-slate-300">→</span>
        <span className="font-mono font-semibold tabular-nums text-slate-900">{fmt(after)}</span>
        {delta !== null && delta !== 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              good === true ? "bg-emerald-100 text-emerald-800" : good === false ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-500"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

function StatKv({ k, v }: { k: string; v: unknown }) {
  if (v === undefined) return null;
  let display = "—";
  if (typeof v === "number" && Number.isFinite(v)) display = fmt(v);
  else if (typeof v === "boolean") display = v ? "da" : "nu";
  else if (v === null) display = "—";
  else if (typeof v === "string") display = v;
  return (
    <>
      <dt className="text-slate-600">{k}</dt>
      <dd className="text-right font-mono font-medium text-slate-900">{display}</dd>
    </>
  );
}
