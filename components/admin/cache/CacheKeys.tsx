"use client";

import { Key } from "lucide-react";

type KeyExample = { params: string; key: string; full: string };

type Props = {
  examples: KeyExample[];
};

export default function CacheKeys({ examples }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2 mb-4">
        <Key className="h-5 w-5" />
        Cache Keys (examples)
      </h2>
      <p className="text-sm text-neutral-500 mb-3">Normalized params → deterministic key. Namespace: ["ro-listings", key]</p>
      <div className="space-y-3 font-mono text-xs">
        {examples.map(({ params, full }, i) => (
          <div key={i} className="rounded-lg bg-neutral-50 p-3 border border-neutral-100">
            <p className="text-neutral-500 mb-1">Params: {params}</p>
            <p className="text-cyan-600 break-all">{full}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
