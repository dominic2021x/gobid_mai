"use client";

import Link from "next/link";

export type RecoveryAlternative = { phrase: string; source: "personal" | "global" };
export type RecoveryRelaxation = { label: string; url: string };

export type SearchRecoveryCardProps = {
  alternatives: RecoveryAlternative[];
  relaxations: RecoveryRelaxation[];
  isDarkMode?: boolean;
};

export default function SearchRecoveryCard({
  alternatives,
  relaxations,
  isDarkMode = false,
}: SearchRecoveryCardProps) {
  const hasAlternatives = alternatives.length > 0;
  const hasRelaxations = relaxations.length > 0;
  if (!hasAlternatives && !hasRelaxations) return null;

  const cardClass = isDarkMode
    ? "rounded-xl border border-white/10 bg-white/5 text-white"
    : "rounded-xl border border-gray-200 bg-gray-50 text-gray-900";
  const linkClass = isDarkMode
    ? "text-blue-300 hover:text-blue-200 hover:underline"
    : "text-blue-600 hover:text-blue-800 hover:underline";
  const labelClass = isDarkMode ? "text-white/70" : "text-gray-600";

  return (
    <div className={`p-4 sm:p-5 ${cardClass}`}>
      <h3 className="text-lg font-semibold mb-1">Nu am găsit rezultate.</h3>
      <p className={`text-sm mb-4 ${labelClass}`}>Încearcă una dintre variantele de mai jos:</p>

      {hasAlternatives && (
        <section className="mb-4">
          <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${labelClass}`}>
            Căutări alternative
          </h4>
          <ul className="space-y-1.5">
            {alternatives.map((alt, i) => (
              <li key={`alt-${i}`}>
                <Link
                  href={`/ro?q=${encodeURIComponent(alt.phrase)}`}
                  className={linkClass}
                  prefetch={false}
                >
                  {alt.phrase}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasRelaxations && (
        <section>
          <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${labelClass}`}>
            Relaxează filtrele
          </h4>
          <ul className="space-y-1.5">
            {relaxations.map((r, i) => (
              <li key={`rel-${i}`}>
                <Link href={r.url} className={linkClass} prefetch={false}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
