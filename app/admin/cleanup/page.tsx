import ImageCleanupPanel from "@/components/admin/cleanup/ImageCleanupPanel";
import { Images } from "lucide-react";

export default function AdminCleanupPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
              <Images className="h-5 w-5 text-blue-600" />
            </span>
            Curățare imagini &amp; R2
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Poze orfane, soft-delete și ștergere în Cloudflare R2 — același flux ca la cronul de producție.
          </p>
        </div>

        <ImageCleanupPanel />
      </div>
    </div>
  );
}
