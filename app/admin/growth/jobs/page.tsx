"use client";

import { useState, useEffect, useCallback } from "react";
import GrowthCard from "../_components/GrowthCard";
import GrowthButton from "../_components/GrowthButton";
import GrowthPageShell from "../_components/GrowthPageShell";
import JobRunsTable from "../_components/JobRunsTable";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

interface QueueCounts {
  queued: number;
  locked: number;
  done: number;
  failed: number;
}

interface JobRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  created_at: string;
  run_after: string;
  last_error: string | null;
}

interface HealthData {
  queuedByType: Record<string, number>;
  lockedByType: Record<string, number>;
  oldestQueuedAgeSecByType: Record<string, number>;
  successRate24h: number;
  p95RuntimeMsByType: Record<string, number>;
  quarantinedCount7d: number;
}

interface QueueResponse {
  counts?: QueueCounts;
  jobs?: JobRow[];
  quarantined?: JobRow[];
  health?: HealthData;
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export default function GrowthJobsPage() {
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [quarantined, setQuarantined] = useState<JobRow[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [requeueing, setRequeueing] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/jobs/queue", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data: QueueResponse = await res.json();
      setCounts(data.counts ?? null);
      setJobs(data.jobs ?? []);
      setQuarantined(data.quarantined ?? []);
      setHealth(data.health ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function handleRequeue(jobId: string) {
    const token = await getAdminToken();
    if (!token) return;
    setRequeueing(jobId);
    try {
      const res = await fetch(`/api/admin/growth/jobs/${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "requeue" }),
      });
      if (res.ok) await fetchQueue();
    } finally {
      setRequeueing(null);
    }
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  }

  const queuedByType = health?.queuedByType ?? {};
  const lockedByType = health?.lockedByType ?? {};
  const oldestByType = health?.oldestQueuedAgeSecByType ?? {};
  const allTypes = new Set([
    ...Object.keys(queuedByType),
    ...Object.keys(lockedByType),
    ...Object.keys(oldestByType),
  ]);

  return (
    <GrowthPageShell
      title="Jobs"
      description="Coadă job-uri, metrice sănătate și rulări."
      actions={<GrowthButton variant="secondary" onClick={fetchQueue}>Reîmprospătează</GrowthButton>}
    >
      <div className="space-y-6">
        <GrowthCard title="Stare coadă" description="Număr de job-uri pe status." accent="blue">
          {loading && !counts && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
          {counts && (
            <div className="flex flex-wrap gap-4">
              <div className="rounded-lg border border-[#E8EAED] bg-[#F8F9FA] px-4 py-3">
                <span className="text-xs font-medium text-[#5F6368]">Queued</span>
                <p className="text-xl font-semibold text-[#202124]">{counts.queued}</p>
              </div>
              <div className="rounded-lg border border-[#FEEFC3] bg-[#FEF7E0] px-4 py-3">
                <span className="text-xs font-medium text-[#5F6368]">Locked</span>
                <p className="text-xl font-semibold text-[#202124]">{counts.locked}</p>
              </div>
              <div className="rounded-lg border border-[#CEEAD6] bg-[#E6F4EA] px-4 py-3">
                <span className="text-xs font-medium text-[#5F6368]">Done</span>
                <p className="text-xl font-semibold text-[#202124]">{counts.done}</p>
              </div>
              <div className="rounded-lg border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3">
                <span className="text-xs font-medium text-[#5F6368]">Failed</span>
                <p className="text-xl font-semibold text-[#202124]">{counts.failed}</p>
              </div>
            </div>
          )}
        </GrowthCard>

        {health && (
          <GrowthCard
            title="Metrice sănătate"
            description="Queued/locked per tip, vârstă, success rate."
            accent="green"
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-[#5F6368]">Success rate 24h: {health.successRate24h}%</p>
                <p className="text-xs text-[#5F6368]">Quarantined (7 zile): {health.quarantinedCount7d}</p>
              </div>
              {allTypes.size > 0 && (
                <div className="overflow-x-auto rounded-lg border border-[#E8EAED]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                        <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Tip</th>
                        <th className="px-4 py-2 text-right font-semibold text-[#5F6368]">Queued</th>
                        <th className="px-4 py-2 text-right font-semibold text-[#5F6368]">Locked</th>
                        <th className="px-4 py-2 text-right font-semibold text-[#5F6368]">Vârstă max</th>
                        <th className="px-4 py-2 text-right font-semibold text-[#5F6368]">p95 (ms)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(allTypes).sort().map((type) => (
                        <tr key={type} className="border-b border-[#E8EAED]">
                          <td className="px-4 py-2 font-medium text-[#202124]">{type}</td>
                          <td className="px-4 py-2 text-right text-[#5F6368]">{queuedByType[type] ?? 0}</td>
                          <td className="px-4 py-2 text-right text-[#5F6368]">{lockedByType[type] ?? 0}</td>
                          <td className="px-4 py-2 text-right text-[#5F6368]">
                            {oldestByType[type] != null ? formatAge(oldestByType[type]) : "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-[#5F6368]">
                            {health.p95RuntimeMsByType?.[type] ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </GrowthCard>
        )}

        <GrowthCard title="Ultimele job-uri" accent="slate">
          {loading && jobs.length === 0 && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
          {!loading && jobs.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#E8EAED]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Tip</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Status</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Attempts</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Creat</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Run after</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA]">
                      <td className="px-4 py-2 font-medium text-[#202124]">{j.type}</td>
                      <td className="px-4 py-2">{j.status}</td>
                      <td className="px-4 py-2">{j.attempts}</td>
                      <td className="px-4 py-2 text-[#5F6368]">{formatDate(j.created_at)}</td>
                      <td className="px-4 py-2 text-[#5F6368]">{formatDate(j.run_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GrowthCard>

        <GrowthCard title="Job-uri în carantină (ultimele 50)" accent="yellow">
          {loading && quarantined.length === 0 && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
          {!loading && quarantined.length === 0 && <p className="text-sm text-[#5F6368]">Niciun job în carantină.</p>}
          {!loading && quarantined.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#E8EAED]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Tip</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Attempts</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Creat</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Eroare</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#5F6368]">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {quarantined.map((j) => (
                    <tr key={j.id} className="border-b border-[#E8EAED]">
                      <td className="px-4 py-2 font-medium text-[#202124]">{j.type}</td>
                      <td className="px-4 py-2">{j.attempts}</td>
                      <td className="px-4 py-2 text-[#5F6368]">{formatDate(j.created_at)}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-[#5F6368]" title={j.last_error ?? ""}>
                        {j.last_error ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <GrowthButton
                          variant="secondary"
                          disabled={requeueing === j.id}
                          loading={requeueing === j.id}
                          onClick={() => handleRequeue(j.id)}
                          className="px-2 py-1 text-xs"
                        >
                          Requeue
                        </GrowthButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GrowthCard>

        <GrowthCard title="Ultimele rulări" accent="slate">
          <JobRunsTable limit={20} />
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
