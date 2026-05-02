"use client";

import { useState, useEffect } from "react";

interface LinkItem {
  target_url: string;
  anchor: string;
}

export default function ResurseUtileSection({ sourceUrl }: { sourceUrl: string }) {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!sourceUrl) return;
    const params = new URLSearchParams({ source_url: sourceUrl });
    fetch(`/api/ro/internal-links?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data?.items) ? data.items : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [sourceUrl]);
  if (!loaded || items.length === 0) return null;
  return (
    <section className="mt-6 px-4 py-4 rounded-lg bg-slate-100/80 border border-slate-200" aria-label="Resurse utile">
      <h2 className="text-lg font-semibold text-slate-900">Resurse utile</h2>
      <ul className="mt-2 space-y-1">
        {items.map((link, i) => (
          <li key={i}>
            <a href={link.target_url} className="text-slate-700 underline hover:text-slate-900">
              {link.anchor}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
