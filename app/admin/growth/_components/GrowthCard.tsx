import type { ReactNode } from "react";

const accentStyles: Record<string, { header: string; border: string }> = {
  blue: {
    header: "from-blue-50 to-blue-50 ring-1 ring-blue-100/80",
    border: "border-l-blue-500",
  },
  red: {
    header: "from-red-50 to-rose-50 ring-1 ring-red-100/80",
    border: "border-l-red-500",
  },
  yellow: {
    header: "from-amber-50 to-yellow-50 ring-1 ring-amber-100/80",
    border: "border-l-amber-500",
  },
  green: {
    header: "from-emerald-50 to-teal-50 ring-1 ring-emerald-100/80",
    border: "border-l-emerald-500",
  },
  slate: {
    header: "from-slate-50 to-slate-100 ring-1 ring-slate-200/80",
    border: "border-l-slate-500",
  },
};

interface GrowthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  accent?: "blue" | "red" | "yellow" | "green" | "slate";
}

export default function GrowthCard({
  title,
  description,
  children,
  className = "",
  accent = "slate",
}: GrowthCardProps) {
  const style = accentStyles[accent] ?? accentStyles.slate;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95
        shadow-xl shadow-slate-200/40 backdrop-blur-sm
        border-l-4 ${style.border}
        ${className}
      `}
    >
      <div className={`rounded-t-2xl bg-gradient-to-r px-5 py-3 ${style.header}`}>
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
