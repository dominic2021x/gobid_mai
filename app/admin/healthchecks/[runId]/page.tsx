"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import supabase from "@/lib/supabase";

interface Check {
  id: number;
  run_id: number;
  category: string;
  name: string;
  target_url: string;
  method: string;
  status: number | null;
  ok: boolean;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  response_snippet: string | null;
  suggestion_key: string | null;
  suggestion: string | null;
  created_at: string;
}

interface ActionItemGroup {
  suggestion_key: string;
  title: string;
  affected: { target_url: string; name: string }[];
  probableCause: string;
  checklist: string[];
  probableFiles: string[];
}

interface Run {
  id: number;
  run_date: string;
  started_at: string;
  finished_at: string | null;
  now_ro: string | null;
  ok: boolean;
  total: number;
  failed: number;
  env: string | null;
  version: string | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "medium" });
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
}

const LOGS_HINT = `Pași pentru debug:
1. Deschide Vercel Dashboard → Proiect → Logs (sau Functions).
2. Filtrează după path sau timp (started_at al run-ului).
3. Caută erori (status 5xx, stack trace).
4. Verifică env vars în Project Settings.
5. Pentru timeout: mărește maxDuration pe ruta respectivă.`;

export default function AdminHealthcheckRunPage() {
  const params = useParams();
  const runId = params?.runId as string;
  const [run, setRun] = useState<Run | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [actionItems, setActionItems] = useState<ActionItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snippetModal, setSnippetModal] = useState<{ name: string; content: string } | null>(null);
  const [fullErrorModal, setFullErrorModal] = useState<{ name: string; content: string } | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError("Nu ești autentificat.");
          return;
        }
        const res = await fetch(`/api/admin/healthchecks/run/${runId}`, {
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `Eroare ${res.status}`);
          return;
        }
        const j = await res.json();
        if (!cancelled) {
          setRun(j.run);
          setChecks(j.checks ?? []);
          setActionItems(j.actionItems ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Eroare la încărcare");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId]);

  const failedChecks = checks.filter((c) => !c.ok);
  const okChecks = checks.filter((c) => c.ok);

  if (loading && !run) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-6">
        <p className="text-gray-500">Se încarcă...</p>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-6">
        <p className="text-red-600">{error || "Run negăsit."}</p>
        <Link href="/admin/healthchecks" className="text-blue-600 hover:underline mt-2 inline-block">
          Înapoi la listă
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/healthchecks" className="text-blue-600 hover:underline">
            ← Healthchecks
          </Link>
          <h1 className="text-2xl font-bold">Run {run.run_date} (id: {run.id})</h1>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 mb-6 bg-white">
          <p><strong>Total checks:</strong> {run.total} — <strong>Failed:</strong> {run.failed}</p>
          <p><strong>Started (UTC):</strong> {formatDate(run.started_at)}</p>
          {run.now_ro && <p><strong>Now RO:</strong> {run.now_ro}</p>}
          <p><strong>Env:</strong> {run.env ?? "—"} — <strong>Version:</strong> {run.version ? run.version.slice(0, 7) : "—"}</p>
        </div>

        {actionItems.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Action items (unde trebuie făcut update)</h2>
            <div className="space-y-6">
              {actionItems.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
                  <h3 className="font-medium text-amber-800 mb-2">{item.title}</h3>
                  <p className="text-sm mb-2"><strong>Ce e afectat:</strong></p>
                  <ul className="list-disc list-inside text-sm mb-2">
                    {item.affected.map((a, i) => (
                      <li key={i}>
                        <a href={a.target_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                          {a.name}
                        </a>
                        <span className="text-gray-500"> — {a.target_url}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm mb-2"><strong>Probabilă cauză:</strong> {item.probableCause}</p>
                  <p className="text-sm mb-2"><strong>Ce să verifici:</strong></p>
                  <ul className="list-disc list-inside text-sm mb-2">
                    {item.checklist.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <p className="text-sm"><strong>Fișiere probabile:</strong></p>
                  <ul className="list-disc list-inside text-sm font-mono">
                    {item.probableFiles.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {failedChecks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Checks eșuate ({failedChecks.length})</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left p-2">category</th>
                    <th className="text-left p-2">name</th>
                    <th className="text-left p-2">target_url</th>
                    <th className="text-left p-2">status</th>
                    <th className="text-left p-2">duration_ms</th>
                    <th className="text-left p-2">error_code</th>
                    <th className="text-left p-2">suggestion</th>
                    <th className="text-left p-2">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {failedChecks.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="p-2">{c.category}</td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2 max-w-[200px]">
                        <a href={c.target_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                          {c.target_url}
                        </a>
                        <button type="button" onClick={() => copyToClipboard(c.target_url)} className="ml-1 text-gray-400 hover:text-gray-600" title="Copiază">⎘</button>
                      </td>
                      <td className="p-2">{c.status ?? "—"}</td>
                      <td className="p-2">{c.duration_ms ?? "—"}</td>
                      <td className="p-2">{c.error_code ?? "—"}</td>
                      <td className="p-2 max-w-[280px] text-amber-700">{c.suggestion ?? "—"}</td>
                      <td className="p-2">
                        {c.response_snippet && (
                          <button type="button" onClick={() => setSnippetModal({ name: c.name, content: c.response_snippet! })} className="text-blue-600 hover:underline text-xs">
                            Snippet
                          </button>
                        )}
                        {c.error_message && (
                          <>
                            {" "}
                            <button type="button" onClick={() => setFullErrorModal({ name: c.name, content: c.error_message! })} className="text-blue-600 hover:underline text-xs">
                              View full error
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => { copyToClipboard(LOGS_HINT); alert("Pași copiați în clipboard."); }} className="ml-1 text-gray-500 hover:underline text-xs" title="Open logs hint">
                          Logs hint
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xl font-semibold mb-4">Toate checks ({checks.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left p-2">category</th>
                  <th className="text-left p-2">name</th>
                  <th className="text-left p-2">target_url</th>
                  <th className="text-left p-2">status</th>
                  <th className="text-left p-2">duration_ms</th>
                  <th className="text-left p-2">error_code</th>
                  <th className="text-left p-2">error_message</th>
                  <th className="text-left p-2">suggestion</th>
                  <th className="text-left p-2">Snippet</th>
                </tr>
              </thead>
              <tbody>
                {[...failedChecks, ...okChecks].map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="p-2">{c.category}</td>
                    <td className="p-2">{c.name}</td>
                    <td className="p-2 max-w-[180px] break-all">
                      <a href={c.target_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {c.target_url}
                      </a>
                      <button type="button" onClick={() => copyToClipboard(c.target_url)} className="ml-1 text-gray-400" title="Copiază">⎘</button>
                    </td>
                    <td className="p-2">{c.status ?? "—"}</td>
                    <td className="p-2">{c.duration_ms ?? "—"}</td>
                    <td className="p-2">{c.error_code ?? "—"}</td>
                    <td className="p-2 max-w-[160px] truncate" title={c.error_message ?? ""}>
                      {c.error_message ? (c.error_message.length > 80 ? c.error_message.slice(0, 80) + "…" : c.error_message) : "—"}
                    </td>
                    <td className="p-2 max-w-[220px] text-amber-700 text-xs">{c.suggestion ?? "—"}</td>
                    <td className="p-2">
                      {c.response_snippet ? (
                        <button type="button" onClick={() => setSnippetModal({ name: c.name, content: c.response_snippet! })} className="text-blue-600 hover:underline text-xs">
                          View (max 3KB)
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {snippetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSnippetModal(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold">response_snippet — {snippetModal.name}</h3>
              <button type="button" onClick={() => setSnippetModal(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <pre className="p-4 overflow-auto text-xs whitespace-pre-wrap break-words flex-1">{snippetModal.content}</pre>
          </div>
        </div>
      )}

      {fullErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setFullErrorModal(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold">error_message — {fullErrorModal.name}</h3>
              <button type="button" onClick={() => setFullErrorModal(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <pre className="p-4 overflow-auto text-xs whitespace-pre-wrap break-words flex-1">{fullErrorModal.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
