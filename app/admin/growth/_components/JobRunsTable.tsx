"use client";

import { useState, useEffect, useCallback } from "react";

interface RunRow {
  id: string;
  job_id: string;
  correlation_id: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  error: string | null;
  meta: Record<string, unknown>;
}

interface JobRunsTableProps {
  limit?: number;
  className?: string;
  /** "slate" = stil cache/admin (albastru/slate); default = Google grey */
  theme?: "default" | "slate";
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

function formatDate(s: string) {
  return new Date(s).toLocaleString("ro-RO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function JobRunsTable({ limit = 20, className = "", theme = "default" }: JobRunsTableProps) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSlate = theme === "slate";

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getAdminToken();
    if (!token) {
      setError("Nu ești autentificat.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/growth/jobs/runs?limit=${limit}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? `Eroare ${res.status}`);
        return;
      }
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  if (loading && runs.length === 0) {
    return (
      <div
        className={
          isSlate
            ? `rounded-lg border border-slate-200 bg-slate-50 p-8 text-center ${className}`
            : `rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-8 text-center ${className}`
        }
      >
        <i
          className={`ri-loader-4-line animate-spin text-2xl ${isSlate ? "text-blue-600" : "text-[#4285F4]"}`}
          aria-hidden
        />
        <p className={`mt-2 text-sm ${isSlate ? "text-slate-600" : "text-[#5F6368]"}`}>Se încarcă...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={
          isSlate
            ? `rounded-lg border border-red-200 bg-red-50 p-4 ${className}`
            : `rounded-lg border border-[#FAD2CF] bg-[#FCE8E6] p-4 ${className}`
        }
      >
        <p className={`text-sm ${isSlate ? "text-red-700" : "text-[#EA4335]"}`}>{error}</p>
        <button
          type="button"
          onClick={fetchRuns}
          className={`mt-2 text-sm font-medium hover:underline ${isSlate ? "text-blue-600" : "text-[#4285F4]"}`}
        >
          Reîncearcă
        </button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div
        className={
          isSlate
            ? `rounded-lg border border-slate-200 bg-slate-50 p-6 text-center ${className}`
            : `rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-6 text-center ${className}`
        }
      >
        <p className={`text-sm ${isSlate ? "text-slate-600" : "text-[#5F6368]"}`}>Nicio rulare înregistrată.</p>
        <button
          type="button"
          onClick={fetchRuns}
          className={`mt-2 text-sm font-medium hover:underline ${isSlate ? "text-blue-600" : "text-[#4285F4]"}`}
        >
          Reîmprospătează
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        isSlate
          ? `overflow-hidden ${className}`
          : `overflow-hidden rounded-lg border border-[#E8EAED] ${className}`
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className={
                isSlate
                  ? "border-b border-slate-200 bg-slate-100"
                  : "border-b border-[#E8EAED] bg-[#F8F9FA]"
              }
            >
              <th
                className={`px-4 py-3 text-left font-medium ${isSlate ? "text-slate-700" : "text-[#5F6368]"}`}
              >
                Job ID
              </th>
              <th
                className={`px-4 py-3 text-left font-medium ${isSlate ? "text-slate-700" : "text-[#5F6368]"}`}
              >
                Correlation ID
              </th>
              <th
                className={`px-4 py-3 text-left font-medium ${isSlate ? "text-slate-700" : "text-[#5F6368]"}`}
              >
                Start
              </th>
              <th
                className={`px-4 py-3 text-left font-medium ${isSlate ? "text-slate-700" : "text-[#5F6368]"}`}
              >
                Sfârșit
              </th>
              <th
                className={`px-4 py-3 text-left font-medium ${isSlate ? "text-slate-700" : "text-[#5F6368]"}`}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                className={
                  isSlate
                    ? "border-b border-slate-100 hover:bg-slate-50"
                    : "border-b border-[#E8EAED] hover:bg-[#F8F9FA]"
                }
              >
                <td
                  className={`px-4 py-2.5 font-mono text-xs ${isSlate ? "text-slate-800" : "text-[#202124]"}`}
                >
                  {run.job_id.slice(0, 8)}…
                </td>
                <td
                  className={`px-4 py-2.5 font-mono text-xs ${isSlate ? "text-slate-600" : "text-[#5F6368]"}`}
                >
                  {run.correlation_id}
                </td>
                <td className={`px-4 py-2.5 ${isSlate ? "text-slate-600" : "text-[#5F6368]"}`}>
                  {formatDate(run.started_at)}
                </td>
                <td className={`px-4 py-2.5 ${isSlate ? "text-slate-600" : "text-[#5F6368]"}`}>
                  {run.finished_at ? formatDate(run.finished_at) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  {run.ok === true && (
                    <span
                      className={
                        isSlate
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200"
                          : "inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-xs font-medium text-[#34A853]"
                      }
                    >
                      <i className="ri-check-line" /> OK
                    </span>
                  )}
                  {run.ok === false && (
                    <span
                      className={
                        isSlate
                          ? "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200"
                          : "inline-flex items-center gap-1 rounded-full bg-[#FCE8E6] px-2 py-0.5 text-xs font-medium text-[#EA4335]"
                      }
                    >
                      <i className="ri-close-line" /> Eroare
                    </span>
                  )}
                  {run.ok === null && (
                    <span className={isSlate ? "text-slate-400" : "text-[#9AA0A6]"}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className={
          isSlate
            ? "border-t border-slate-200 bg-slate-50 px-4 py-2"
            : "border-t border-[#E8EAED] bg-[#F8F9FA] px-4 py-2"
        }
      >
        <button
          type="button"
          onClick={fetchRuns}
          className={`text-sm font-medium hover:underline ${isSlate ? "text-blue-600" : "text-[#4285F4]"}`}
        >
          Reîmprospătează
        </button>
      </div>
    </div>
  );
}
