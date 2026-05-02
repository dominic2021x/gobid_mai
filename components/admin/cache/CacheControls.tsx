"use client";

import { useState, useEffect } from "react";
import { RefreshCw, FolderSync, Trash2, Flame, UserRound } from "lucide-react";

type Props = {
  token: string;
  cacheEnabled?: boolean;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  flushCooldownSec?: number;
};

export default function CacheControls({ token, cacheEnabled = false, onSuccess, onError, flushCooldownSec = 60 }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [userIdInput, setUserIdInput] = useState("");
  const [flushCooldown, setFlushCooldown] = useState(0);

  useEffect(() => {
    if (flushCooldown <= 0) return;
    const t = setInterval(() => setFlushCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [flushCooldown]);

  const run = async (action: string, body?: Record<string, unknown>) => {
    setLoading(action);
    try {
      const res = await fetch("/api/admin/cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body ?? { action }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        onError?.(json?.error ?? `HTTP ${res.status}`);
        if (res.status === 429) setFlushCooldown(flushCooldownSec);
        return;
      }
      onSuccess?.(json?.message ?? action);
      if (action === "revalidate_everything_public") setFlushCooldown(flushCooldownSec);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(null);
    }
  };

  const flushDisabled = flushCooldown > 0 || loading === "revalidate_everything_public";
  const anyDisabled = !cacheEnabled || !!loading;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-base font-semibold text-slate-800">Operații cache</h2>
      <p className="text-sm text-slate-600 -mt-2">Revalidare, warmup sau golire cache.</p>
      {!cacheEnabled && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Acțiunile sunt dezactivate cât timp sistemul de cache este oprit. Pornește cache-ul mai sus pentru a le folosi.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run("revalidate_ro_listings")}
          disabled={anyDisabled}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading === "revalidate_ro_listings" ? "animate-spin" : ""}`} />
          Revalidează cache listări
        </button>

        <div className="inline-flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Categorie (ex. auto)"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm w-32 focus:ring-1 focus:ring-slate-400"
          />
          <button
            onClick={() => run("revalidate_category", { action: "revalidate_category", category: categoryInput })}
            disabled={anyDisabled || !categoryInput.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FolderSync className={`h-4 w-4 ${loading === "revalidate_category" ? "animate-spin" : ""}`} />
            Revalidează categoria
          </button>
        </div>

        <div className="inline-flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="UUID utilizator"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm w-[min(100%,280px)] min-w-[200px] font-mono text-xs focus:ring-1 focus:ring-slate-400"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={() =>
              run("revalidate_user_public", { action: "revalidate_user_public", userId: userIdInput.trim() })
            }
            disabled={anyDisabled || !userIdInput.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Revalidează cache Next.js pentru pagina publică /user/[id]"
          >
            <UserRound className={`h-4 w-4 ${loading === "revalidate_user_public" ? "animate-spin" : ""}`} />
            Cache pentru 1 utilizator
          </button>
        </div>

        <button
          onClick={() => run("revalidate_everything_public")}
          disabled={!cacheEnabled || flushDisabled}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          title={flushCooldown > 0 ? `Pauză ${flushCooldown}s` : undefined}
        >
          <Trash2 className="h-4 w-4" />
          Golește tot cache-ul public {flushCooldown > 0 ? `(${flushCooldown}s)` : ""}
        </button>

        <button
          onClick={() => run("warmup_cache")}
          disabled={anyDisabled}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          <Flame className={`h-4 w-4 ${loading === "warmup_cache" ? "animate-pulse" : ""}`} />
          Forțează warmup
        </button>
      </div>

      {flushCooldown > 0 && (
        <p className="text-sm font-medium text-amber-700 rounded-lg bg-amber-50 px-3 py-2 border border-amber-200">
          Limită rată. Așteaptă {flushCooldown}s.
        </p>
      )}

      <p className="text-xs text-slate-500 border-t border-slate-200 pt-3 mt-1">
        <strong>Cache pentru 1 utilizator</strong> revalidează:{" "}
        <code className="rounded bg-slate-100 px-1">/user/&lt;UUID&gt;</code>, întreg layout{" "}
        <code className="rounded bg-slate-100 px-1">/dashboard</code> (toate paginile contului în Next cache),{" "}
        fiecare <code className="rounded bg-slate-100 px-1">/produs</code>, <code className="rounded bg-slate-100 px-1">/live_bid</code>,{" "}
        <code className="rounded bg-slate-100 px-1">/card-vizita</code> pentru produsele acelui user din DB, plus tag-ul{" "}
        <code className="rounded bg-slate-100 px-1">ro-listings</code>. Nu șterge date personale din baza de date — doar cache Next.{" "}
        Notă: layout-ul dashboard și tag-ul listări afectează și alți vizitatori până la regenerare (doar cache).{" "}
        <strong>Golește tot cache-ul public</strong> revalidează toate path-urile publice (homepage, /ro, /live_bid, /licitatii, /search, /rezultate, /contact, /categorii, /despre-noi, legal, politici), segmentele de layout (/produs, /legal, /user, /card-vizita etc.) și tag-ul ro-listings. Limită: 60s.{" "}
        <strong>Forțează warmup</strong> preîncarcă paginile cheie și câteva query-uri /ro (bmw, apartament, teren).
      </p>
    </div>
  );
}
