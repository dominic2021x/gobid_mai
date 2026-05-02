"use client";

import { useMemo, useState } from "react";
import type { CacheEvent } from "./types";
import { formatDuration, statusBarColor } from "./types";

const MAX_BAR_MS = 5000;
const TIMELINE_HEIGHT = 100;

type Props = {
  events: CacheEvent[];
};

export default function CacheTimeline({ events }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const timelineData = useMemo(() => {
    const slice = events.slice(0, 50).reverse();
    const durations = slice.map((e) => e.duration_ms ?? 0);
    const maxMs = Math.min(MAX_BAR_MS, Math.max(1, ...durations));
    return slice.map((e, i) => ({
      ...e,
      value: Math.min(e.duration_ms ?? 0, MAX_BAR_MS),
      maxMs,
      heightPct: maxMs > 0 ? (Math.min(e.duration_ms ?? 0, MAX_BAR_MS) / maxMs) * 100 : 0,
    }));
  }, [events]);

  if (timelineData.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Cronologie performanță</h2>
        <div className="flex items-center justify-center h-[100px] rounded-lg bg-slate-50 border border-slate-200 border-dashed">
          <div className="text-center text-slate-500 px-4">
            <p className="text-sm font-medium">Niciun eveniment</p>
            <p className="text-xs mt-1">Rulează operații de cache pentru a vedea graficul.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-1">Cronologie performanță</h2>
      <p className="text-xs text-slate-600 mb-4">Ultimele 50 operații (verde=ok, portocaliu=parțial, roșu=eroare)</p>
      <div className="relative">
        <div
          className="flex items-end gap-0.5 h-[100px] rounded-lg bg-slate-50 border border-slate-200 px-2 py-2"
          style={{ minHeight: TIMELINE_HEIGHT }}
        >
          {timelineData.map((d, i) => (
            <div
              key={`${d.id}-${i}`}
              className="flex-1 min-w-0 flex flex-col items-center justify-end group"
              style={{ height: TIMELINE_HEIGHT }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className={`w-full rounded-t transition-all ${statusBarColor(d.status)} ${
                  hoveredIndex === i ? "opacity-100 ring-2 ring-neutral-400 ring-offset-1" : "opacity-90"
                }`}
                style={{
                  height: `${Math.max(2, (d.heightPct / 100) * (TIMELINE_HEIGHT - 8))}px`,
                }}
              />
            </div>
          ))}
        </div>
        {hoveredIndex !== null && timelineData[hoveredIndex] && (
          <div
            className="absolute z-10 rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-left text-xs max-w-xs pointer-events-none"
            style={{
              left: `max(0, min(${(hoveredIndex / timelineData.length) * 100}% - 80px, 100% - 200px))`,
              top: -8,
              transform: "translateY(-100%)",
            }}
          >
            <p className="text-slate-600 font-sans font-normal">
              {new Date(timelineData[hoveredIndex].created_at).toLocaleString("ro-RO")}
            </p>
            <p className="mt-0.5 text-slate-900 font-bold">{timelineData[hoveredIndex].type}</p>
            <p className="text-slate-700 truncate" title={timelineData[hoveredIndex].target ?? undefined}>
              {timelineData[hoveredIndex].target ?? "—"}
            </p>
            <p className="mt-0.5">
              Durată: {formatDuration(timelineData[hoveredIndex].duration_ms)}
              {timelineData[hoveredIndex].status !== "ok" && (
                <span className={`ml-1 font-medium ${timelineData[hoveredIndex].status === "error" ? "text-red-600" : "text-amber-600"}`}>
                  ({timelineData[hoveredIndex].status})
                </span>
              )}
            </p>
            {typeof timelineData[hoveredIndex].meta?.error === "string" && (
              <p className="mt-1 text-red-600 truncate" title={String(timelineData[hoveredIndex].meta?.error)}>
                Eroare: {String(timelineData[hoveredIndex].meta?.error).slice(0, 80)}…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
