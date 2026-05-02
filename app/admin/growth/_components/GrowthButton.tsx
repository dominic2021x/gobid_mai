import type { ReactNode } from "react";

interface GrowthButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  className?: string;
  loading?: boolean;
  icon?: string;
}

const variants = {
  primary:
    "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg hover:shadow-blue-500/30 focus:ring-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed",
  secondary:
    "border-2 border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 focus:ring-blue-500/20 disabled:opacity-60",
  ghost:
    "text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60",
};

export default function GrowthButton({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  type = "button",
  className = "",
  loading = false,
  icon,
}: GrowthButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
        transition focus:outline-none focus:ring-2 focus:ring-offset-2
        ${variants[variant]}
        ${className}
      `}
    >
      {loading && <i className="ri-loader-4-line animate-spin text-lg" />}
      {icon && !loading && <i className={icon} />}
      {children}
    </button>
  );
}
