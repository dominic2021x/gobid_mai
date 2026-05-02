"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import supabase from "@/lib/supabase";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const RecategorizareTopBar = dynamic(
  () => import("./RecategorizareTopBar"),
  { ssr: false }
);
const RecategorizareTable = dynamic(
  () => import("./RecategorizareTable"),
  { ssr: false }
);

type ChangeLogEntry = {
  productId: string;
  title: string;
  oldCategory: string;
  oldSubcategory: string;
  oldLevel3: string | null;
  newCategory: string;
  newSubcategory: string;
  newLevel3: string | null;
  reason: string;
  source: string;
  applied: boolean;
};

type RunResult = {
  success: boolean;
  scanned?: number;
  applied?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
  changes?: ChangeLogEntry[];
};

type Suggestion = {
  id: number;
  product_id: string;
  proposed_category: string;
  proposed_subcategory: string;
  proposed_level3: string | null;
  confidence: number;
  reason: string | null;
  source: string | null;
  status: string;
  created_at: string;
};

import type { RoFilterSchema } from "@/lib/filters";

type FilterMeta = RoFilterSchema;

export default function AdminRecategorizarePage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"agent" | "list">("agent");
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [actioningId, setActioningId] = useState<number | null>(null);

  useEffect(() => {
    if (tab !== "list") return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/recategorizare/filters", {
      });
      if (res.ok) {
        const j = await res.json();
        setFilterMeta({
          categories: j.categories ?? [],
          subcategoryNames: j.subcategoryNames ?? {},
          level3BySubcategory: j.level3BySubcategory ?? {},
          level4BySubcategory: j.level4BySubcategory ?? {},
          level4Labels: j.level4Labels ?? {},
          attributeOptions: j.attributeOptions ?? {},
          fieldsBySubcategory: j.fieldsBySubcategory ?? {},
        });
      }
    })();
  }, [tab]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/category-suggestions?status=pending&limit=100", {
      });
      if (res.ok) {
        const j = await res.json();
        setSuggestions(j.items ?? []);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleRun = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLastResult({ success: false, error: "Nu ești autentificat." });
        return;
      }
      const res = await fetch("/api/admin/recategorize/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data: RunResult = await res.json().catch(() => ({}));
      setLastResult(data);
      if (data.success) fetchSuggestions();
    } catch (e) {
      setLastResult({
        success: false,
        error: e instanceof Error ? e.message : "Eroare la rulare",
      });
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (id: number) => {
    setActioningId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/admin/category-suggestions/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: number) => {
    setActioningId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/admin/category-suggestions/${id}/reject`, {
        method: "POST",
      });
      if (res.ok) setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <i className="ri-price-tag-3-line text-blue-600" />
            Recategorizare
          </h1>
          <p className="mt-1 text-gray-600 text-sm">
            Agent automat (Executări & Insolvență) sau listare și editare manuală cu filtre identice cu /ro.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setTab("agent")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "agent" ? "bg-white text-blue-700 shadow" : "text-gray-600 hover:text-gray-900"}`}
          >
            Agent automat
          </button>
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "list" ? "bg-white text-blue-700 shadow" : "text-gray-600 hover:text-gray-900"}`}
          >
            Listare & editare
          </button>
        </div>
      </div>

      {tab === "list" && (
        <Suspense fallback={<div className="flex items-center justify-center py-12"><i className="ri-loader-4-line animate-spin text-2xl text-gray-400" /></div>}>
          <div className="space-y-4">
            <RecategorizareTopBar />
            <RecategorizareTable filterMeta={filterMeta ?? undefined} />
          </div>
        </Suspense>
      )}

      {tab === "agent" && (
        <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/80">
          <h2 className="font-semibold text-gray-800">Rulează agentul</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Procesează până la 200 de produse per rulare (confidence=1 → aplicat; altfel → sugestie în așteptare).
          </p>
        </div>
        <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {running ? (
              <>
                <i className="ri-loader-4-line animate-spin text-lg" />
                Se rulează...
              </>
            ) : (
              <>
                <i className="ri-play-line text-lg" />
                Rulează recategorizare
              </>
            )}
          </button>
          {lastResult && (
            <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm">
              {lastResult.success ? (
                <>
                  <span className="font-medium text-green-700">Rulare finalizată.</span>
                  <span className="text-gray-600 ml-2">
                    Scanate: {lastResult.scanned ?? 0} · Aplicate: {lastResult.applied ?? 0} · Sărite: {lastResult.skipped ?? 0}
                  </span>
                  {lastResult.errors && lastResult.errors.length > 0 && (
                    <div className="mt-2 text-amber-700">
                      Erori: {lastResult.errors.slice(0, 5).join("; ")}
                      {lastResult.errors.length > 5 && ` (+${lastResult.errors.length - 5})`}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-red-600">{lastResult.error ?? "Eroare necunoscută"}</span>
              )}
            </div>
          )}
        </div>

        {/* Log detaliat: ce produs, ce categorii avea, ce categorii a primit */}
        {lastResult?.success && lastResult.changes && lastResult.changes.length > 0 && (
          <div className="border-t border-gray-200 bg-white">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <i className="ri-file-list-3-line text-blue-600" />
                Log detaliat – ce s-a schimbat la fiecare produs
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Produs (ID + titlu), categorii vechi → categorii noi, motiv, aplicat (da/nu).
              </p>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr className="text-left text-gray-600 font-medium">
                    <th className="px-3 py-2 border-b border-gray-200 whitespace-nowrap">Produs (ID)</th>
                    <th className="px-3 py-2 border-b border-gray-200 whitespace-nowrap">Titlu</th>
                    <th className="px-3 py-2 border-b border-gray-200 whitespace-nowrap">Categorii vechi</th>
                    <th className="px-3 py-2 border-b border-gray-200 whitespace-nowrap">Categorii noi</th>
                    <th className="px-3 py-2 border-b border-gray-200 whitespace-nowrap">Motiv / Sursă</th>
                    <th className="px-3 py-2 border-b border-gray-200 whitespace-nowrap w-16">Aplicat</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResult.changes.map((c, i) => (
                    <tr
                      key={`${c.productId}-${i}`}
                      className={`border-b border-gray-100 ${c.applied ? "bg-green-50/50" : "bg-gray-50/30"}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-gray-600 align-top" title={c.productId}>
                        {c.productId.slice(0, 8)}…
                      </td>
                      <td className="px-3 py-2 text-gray-800 max-w-[220px] truncate align-top" title={c.title}>
                        {c.title}
                      </td>
                      <td className="px-3 py-2 text-gray-600 align-top whitespace-nowrap">
                        <span className="text-amber-700">{c.oldCategory || "—"}</span>
                        <span className="text-gray-400 mx-0.5">/</span>
                        <span className="text-amber-700">{c.oldSubcategory || "—"}</span>
                        {c.oldLevel3 ? (
                          <>
                            <span className="text-gray-400 mx-0.5">/</span>
                            <span className="text-amber-600">{c.oldLevel3}</span>
                          </>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-800 align-top whitespace-nowrap">
                        <span className="text-green-700 font-medium">{c.newCategory}</span>
                        <span className="text-gray-400 mx-0.5">/</span>
                        <span className="text-green-700 font-medium">{c.newSubcategory}</span>
                        {c.newLevel3 ? (
                          <>
                            <span className="text-gray-400 mx-0.5">/</span>
                            <span className="text-green-600">{c.newLevel3}</span>
                          </>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-600 align-top max-w-[180px]">
                        <span className="text-xs">{c.reason}</span>
                        {c.source && c.source !== "-" ? (
                          <span className="block text-[10px] text-gray-400 mt-0.5">Sursă: {c.source}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {c.applied ? (
                          <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                            <i className="ri-checkbox-circle-fill" /> Da
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                            <i className="ri-close-circle-line" /> Nu
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Sugestii în așteptare</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Propuneri cu confidence &lt; 1; le poți aproba sau respinge.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={suggestionsLoading}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {suggestionsLoading ? "Se încarcă..." : "Reîmprospătează"}
          </button>
        </div>
        <div className="p-5">
          {suggestionsLoading ? (
            <div className="py-8 text-center text-gray-500">
              <i className="ri-loader-4-line animate-spin text-2xl" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="py-6 text-center text-gray-500">Nicio sugestie în așteptare.</p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <span className="font-mono text-xs text-gray-500 truncate max-w-[120px]" title={s.product_id}>
                    {s.product_id}
                  </span>
                  <span className="text-gray-700">
                    {s.proposed_category} / {s.proposed_subcategory}
                    {s.proposed_level3 ? ` / ${s.proposed_level3}` : ""}
                  </span>
                  <span className="text-xs text-gray-500">{(s.confidence * 100).toFixed(0)}% · {s.reason ?? "-"}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(s.id)}
                      disabled={actioningId !== null}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                    >
                      {actioningId === s.id ? "..." : "Aprobă"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(s.id)}
                      disabled={actioningId !== null}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      {actioningId === s.id ? "..." : "Respinge"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
