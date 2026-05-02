"use client";

import { useState } from "react";
import GrowthCard from "../../_components/GrowthCard";
import GrowthButton from "../../_components/GrowthButton";
import GrowthPageShell from "../../_components/GrowthPageShell";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

interface EvaluateResult {
  indexable: boolean;
  canonical: string;
  reasons: string[];
  robotsDirectives: string[];
}

const inputClass =
  "flex-1 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] focus:border-[#4285F4] focus:outline-none focus:ring-1 focus:ring-[#4285F4]";

export default function GrowthRulesPage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const token = await getAdminToken();
    if (!token) {
      setError("Nu ești autentificat.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/growth/seo/rules/evaluate?url=${encodeURIComponent(url.trim())}`,
        { headers: {} }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? `Eroare ${res.status}`);
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GrowthPageShell
      title="SEO Rules"
      description="Simulator reguli SEO: indexable, canonical, reasons, robots."
    >
      <GrowthCard
        title="Simulator reguli SEO"
        description="Introdu un URL și vezi indexable, canonical, reasons și robotsDirectives."
        accent="yellow"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#5F6368]">URL</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://gobid.ro/ro/anunt/..."
                className={inputClass}
              />
              <GrowthButton
                onClick={evaluate}
                disabled={!url.trim()}
                loading={loading}
                icon="ri-search-line"
              >
                Evaluează
              </GrowthButton>
            </div>
          </div>
          {error && <p className="text-sm text-[#EA4335]">{error}</p>}
          {result && (
            <div className="rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-medium text-[#5F6368]">Indexable</span>
                  <p className="font-medium text-[#202124]">{result.indexable ? "Da" : "Nu"}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-[#5F6368]">Canonical</span>
                  <p className="break-all text-sm text-[#5F6368]">{result.canonical}</p>
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xs font-medium text-[#5F6368]">Reasons</span>
                <ul className="mt-1 list-inside list-disc text-sm text-[#5F6368]">
                  {result.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-3">
                <span className="text-xs font-medium text-[#5F6368]">Robots directives</span>
                <p className="mt-1 text-sm text-[#5F6368]">{result.robotsDirectives.join(", ")}</p>
              </div>
            </div>
          )}
        </div>
      </GrowthCard>
    </GrowthPageShell>
  );
}
