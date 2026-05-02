import type { ReactNode } from "react";

const COLORS = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC04",
  green: "#34A853",
  grey: "#5F6368",
} as const;

type KpiVariant = "blue" | "red" | "yellow" | "green" | "grey" | "white";

const variantStyles: Record<KpiVariant, string> = {
  blue: "text-white",
  red: "text-white",
  yellow: "text-[#202124]",
  green: "text-white",
  grey: "text-white",
  white: "text-[#202124] border border-[#DADCE0]",
};

const variantBg: Record<KpiVariant, string> = {
  blue: "bg-[#4285F4]",
  red: "bg-[#EA4335]",
  yellow: "bg-[#FBBC04]",
  green: "bg-[#34A853]",
  grey: "bg-[#5F6368]",
  white: "bg-white",
};

interface GrowthKpiCardProps {
  title: string;
  value: string | number;
  variant?: KpiVariant;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

export default function GrowthKpiCard({
  title,
  value,
  variant = "grey",
  hint,
  icon,
  className = "",
}: GrowthKpiCardProps) {
  return (
    <div
      className={`rounded-lg p-4 shadow-sm ${variantBg[variant]} ${variantStyles[variant]} ${className}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium opacity-90">{title}</span>
        {icon && <div className="opacity-80">{icon}</div>}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className={`mt-1 text-xs ${variant === "white" || variant === "yellow" ? "text-[#5F6368]" : "opacity-90"}`}>{hint}</p>}
    </div>
  );
}
