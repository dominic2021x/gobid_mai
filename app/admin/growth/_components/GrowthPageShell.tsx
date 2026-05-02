import type { ReactNode } from "react";
import { Shield } from "lucide-react";

interface GrowthPageShellProps {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function GrowthPageShell({ children, title, description, actions }: GrowthPageShellProps) {
  return (
    <div className="space-y-6">
      {/* Premium header - gradient like main growth page */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-blue-500 p-6 shadow-xl ring-1 ring-black/5">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-60" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm md:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-blue-100/90">
                {description}
              </p>
            )}
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Shield className="h-3.5 w-3.5" />
              <span>Acces admin</span>
            </div>
          </div>
          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
