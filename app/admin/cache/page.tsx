import { PUBLIC_PATHS, LAYOUT_SEGMENTS } from "@/lib/admin/cachePaths";
import CachePanel from "@/components/admin/cache/CachePanel";
import { Shield } from "lucide-react";

export default async function AdminCachePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-800">Sistemul Cache</h1>
          <p className="text-sm text-slate-600 mt-1">Monitorizare și control cache.</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
            <Shield className="h-3.5 w-3.5" />
            <span>Acces admin</span>
          </div>
        </div>

        <CachePanel
          publicPathsCount={PUBLIC_PATHS.length}
          layoutSegmentsCount={LAYOUT_SEGMENTS.length}
        />
      </div>
    </div>
  );
}
