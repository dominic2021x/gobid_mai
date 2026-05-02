"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";

type CacheEvent = {
  id: string;
  type: string;
  tag: string | null;
  action: string;
  meta?: Record<string, unknown>;
  created_at: string;
};

type Props = {
  token: string;
  pollIntervalMs?: number;
};

export default function CacheLogs({ token, pollIntervalMs = 2000 }: Props) {
  const [events, setEvents] = useState<CacheEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/admin/cache/events?limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json.events)) setEvents(json.events);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    };

    void fetchEvents();
    const id = setInterval(fetchEvents, pollIntervalMs);
    return () => clearInterval(id);
  }, [token, pollIntervalMs]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <ScrollText className="h-5 w-5" />
        Live Logs
        <span className="text-xs font-normal text-gray-500">(poll every 2s)</span>
      </h2>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="rounded-lg bg-gray-100 border border-gray-200 p-3 font-mono text-xs overflow-auto max-h-64">
        <table className="w-full text-left text-gray-700">
          <thead>
            <tr className="text-gray-500">
              <th className="pb-1 pr-2">time</th>
              <th className="pb-1 pr-2">action</th>
              <th className="pb-1 pr-2">tag</th>
              <th className="pb-1">status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-gray-500">
                  No events yet.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-gray-200">
                <td className="py-1 pr-2 whitespace-nowrap">{new Date(e.created_at).toLocaleTimeString("ro-RO")}</td>
                <td className="py-1 pr-2">{e.action}</td>
                <td className="py-1 pr-2 text-cyan-600">{e.tag ?? "—"}</td>
                <td className="py-1 text-emerald-600">ok</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
