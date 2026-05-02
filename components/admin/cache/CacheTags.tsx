"use client";

import { useMemo } from "react";
import { Tag } from "lucide-react";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";

/** Tag general + câte un tag per categorie din RO_CATEGORIES (exclus "all"). */
function getAllCacheTags(): string[] {
  const base = "ro-listings";
  const categories = typeof RO_CATEGORIES === "object" && RO_CATEGORIES !== null ? RO_CATEGORIES : {};
  const categorySlugs = Object.keys(categories).filter((slug) => slug !== "all");
  const categoryTags = categorySlugs.map((slug) => `ro-listings:category:${slug}`);
  return [base, ...categoryTags];
}

type TagEvent = { type: string; target: string | null; created_at: string };

type Props = {
  lastInvalidations?: Record<string, string>;
  events?: TagEvent[];
};

export default function CacheTags({ lastInvalidations = {}, events = [] }: Props) {
  const allTags = useMemo(() => getAllCacheTags() ?? ["ro-listings"], []);

  const tagToLast = (tag: string): string => {
    if (lastInvalidations[tag]) return lastInvalidations[tag];
    const e = events.find((x) => x.type === "revalidate_tag" && x.target === `tag:${tag}`);
    return e ? new Date(e.created_at).toLocaleString("ro-RO") : "—";
  };

  const affected = (tag: string): string => {
    if (tag === "ro-listings") return "/api/ro/listings, /ro (all)";
    if (tag.startsWith("ro-listings:category:")) return `/ro?category=${tag.split(":")[2]}`;
    return "—";
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2 mb-4">
        <Tag className="h-5 w-5" />
        Cache Tags
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="pb-2 pr-4 font-medium">Tag name</th>
              <th className="pb-2 pr-4 font-medium">Last invalidated</th>
              <th className="pb-2 font-medium">Affected endpoints</th>
            </tr>
          </thead>
          <tbody>
            {(allTags ?? []).map((tag) => (
              <tr key={tag} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono text-neutral-900">{tag}</td>
                <td className="py-2 pr-4 text-neutral-600">{tagToLast(tag)}</td>
                <td className="py-2 text-neutral-600">{affected(tag)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
