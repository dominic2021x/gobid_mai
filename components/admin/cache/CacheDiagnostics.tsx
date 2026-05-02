"use client";

import { Server, Cloud, RefreshCw, Trash2 } from "lucide-react";

const cards = [
  {
    icon: Server,
    title: "Strat cache server",
    description:
      "Folosește Next.js unstable_cache cu invalidare pe taguri. Listările și căutarea pentru /ro sunt cache-uite cu revalidate=30 și taguri (ex. ro-listings, slug-uri categorii). Se invalidează prin revalidateTag când se modifică produse sau categorii.",
  },
  {
    icon: Cloud,
    title: "Strat cache CDN",
    description:
      "Cache-ul la margine e controlat prin antete Cache-Control: s-maxage și stale-while-revalidate. Răspunsurile publice și API setează antetele astfel încât CDN și browserul să poată cache-ui și servi conținut vechi în timp ce revalidează în fundal.",
  },
  {
    icon: RefreshCw,
    title: "Sistem de invalidare",
    description:
      "Cache-ul se invalidează cu revalidateTag (pentru cache date) și revalidatePath cu opțiunea layout pentru segmente de rută. Actualizările produselor din admin declanșează revalidarea pe tag și path. Schimbările de categorie invalidează atât tagurile vechi cât și pe cele noi.",
  },
  {
    icon: Trash2,
    title: "Mentenanță cron",
    description:
      "Curățarea zilnică (prin /api/cron/cache-events-cleanup) șterge înregistrările cache_events mai vechi de 30 de zile. Necesită CRON_SECRET în producție. Rulează la 03:00 UTC. Starea se vede la Stare sistem și Metrici cache.",
  },
];

const CARD_STYLES = [
  "border-l-blue-500 bg-blue-50/50",
  "border-l-blue-500 bg-blue-50/50",
  "border-l-emerald-500 bg-emerald-50/50",
  "border-l-amber-500 bg-amber-50/50",
];

export default function CacheDiagnostics() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-2">Diagnostic</h2>
      <p className="text-sm text-slate-600 mb-4">Cum funcționează cache-ul și invalidarea.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map(({ icon: Icon, title, description }, i) => (
          <div
            key={title}
            className={`rounded-lg border border-slate-200 border-l-4 p-3 ${CARD_STYLES[i % CARD_STYLES.length]}`}
          >
            <div className="flex items-start gap-2">
              <div className="rounded bg-white border border-slate-200 p-1.5 shrink-0">
                <Icon className="h-4 w-4 text-slate-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-slate-800">{title}</h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
