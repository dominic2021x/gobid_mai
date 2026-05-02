"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";

const nav = [
  { href: "/admin/growth", label: "Overview", icon: "ri-home-4-line" },
  { href: "/admin/growth/ops", label: "Ops Console", icon: "ri-activity-line" },
  { href: "/admin/growth/integrations", label: "Integrations", icon: "ri-plug-line" },
  { href: "/admin/growth/google-ads", label: "Google Ads", icon: "ri-megaphone-line" },
  { href: "/admin/growth/google-ads/optimizer", label: "Ads Optimizer", icon: "ri-robot-2-line" },
  { href: "/admin/growth/search-console", label: "Search Console", icon: "ri-search-line" },
  { href: "/admin/growth/ga4", label: "GA4", icon: "ri-bar-chart-box-line" },
  { href: "/admin/growth/tracking", label: "Tracking", icon: "ri-pie-chart-line" },
  { href: "/admin/growth/seo/sitemaps", label: "Sitemaps", icon: "ri-map-line" },
  { href: "/admin/growth/seo/rules", label: "Rules", icon: "ri-code-s-slash-line" },
  { href: "/admin/growth/seo/indexing", label: "Indexing", icon: "ri-search-eye-line" },
  { href: "/admin/growth/seo/audits", label: "Audits", icon: "ri-file-search-line" },
  { href: "/admin/growth/insights", label: "Insights", icon: "ri-lightbulb-line" },
  { href: "/admin/growth/jobs", label: "Jobs", icon: "ri-list-check-2" },
  { href: "/admin/growth/settings", label: "Settings", icon: "ri-settings-3-line" },
  { href: "/admin/growth/guardrails", label: "Guardrails", icon: "ri-shield-check-line" },
];

export default function GrowthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin/growth") return pathname === "/admin/growth";
    return pathname?.startsWith(href) ?? false;
  };

  return (
    <div className="flex min-h-0 flex-1 bg-gradient-to-br from-blue-50/80 via-slate-50 to-blue-50/50">
      {/* Premium sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/30 backdrop-blur-sm sm:flex">
        <div className="border-b border-slate-200/80 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30">
              <i className="ri-line-chart-line text-lg" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Google Center</h2>
              <p className="text-xs text-slate-500">gobid.ro</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative mx-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-gradient-to-r from-blue-500/15 to-blue-500/10 text-blue-700 ring-1 ring-blue-200/60"
                    : "text-slate-700 hover:bg-slate-100/80"
                }`}
              >
                <i className={`${item.icon} shrink-0 text-base ${active ? "text-blue-600" : "text-slate-500"}`} />
                <span className="truncate">{item.label}</span>
                {active && (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-500 to-blue-500" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200/80 p-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50/80 px-2 py-2">
            <Shield className="h-3.5 w-3.5 text-slate-500" />
            <p className="text-[10px] font-medium text-slate-500">Integrări, SEO, job-uri</p>
          </div>
        </div>
      </aside>

      {/* Main content - premium background */}
      <main className="min-w-0 flex-1 p-6 md:p-8 lg:p-10">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
