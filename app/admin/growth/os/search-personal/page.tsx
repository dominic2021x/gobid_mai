"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "../../_components/Card";

interface PersonalStatus {
  optInCount: number;
  profilesCount: number;
  lastRollupAt: string | null;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function SearchPersonalPage() {
  const [status, setStatus] = useState<PersonalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/os/search-personal/status", {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus(json as PersonalStatus);
      else setStatus(null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAdminToken().then((t) => (t ? fetchStatus() : setLoading(false)));
  }, [fetchStatus]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/growth/os" className="text-sm text-slate-600 hover:text-slate-900">
          ← Growth OS
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Personal Search Agent</h1>
        <p className="mt-1 text-sm text-slate-500">
          Opt-in only. Summary counts for debugging (no sensitive history).
        </p>
      </div>
      <Card title="Summary" description="Counts only" accent="blue">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !status ? (
          <p className="text-sm text-slate-500">No data.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-700">
            <li>Opt-in users: <strong>{status.optInCount}</strong></li>
            <li>Profiles with prefs: <strong>{status.profilesCount}</strong></li>
            <li>Last personal rollup: {status.lastRollupAt ? new Date(status.lastRollupAt).toLocaleString() : "Never"}</li>
          </ul>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        To run the daily personal rollup, use Search Intelligence page and enqueue &quot;Personal rollup (daily)&quot;.
      </p>
    </div>
  );
}
