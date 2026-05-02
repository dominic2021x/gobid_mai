"use client";

import type { ReactNode } from "react";
import { ArrowRightOnRectangleIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export type DashboardLogoutDarkModeRowProps = {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void | Promise<void>;
  className?: string;
  /** Conținut centrat între Ieșire și comutatorul zi/noapte (ex. avatar pe mobil). */
  center?: ReactNode;
};

/**
 * Rând ca pe dashboard user: Ieșire stânga, comutator zi/noapte dreapta (inclusiv mobil).
 */
export default function DashboardLogoutDarkModeRow({
  isDarkMode,
  onToggleDarkMode,
  onLogout,
  className = "",
  center,
}: DashboardLogoutDarkModeRowProps) {
  return (
    <div
      className={`flex flex-row items-center w-full min-h-[44px] gap-1 sm:gap-2 ${center ? "" : "justify-between"} ${className}`}
    >
      <button
        type="button"
        onClick={() => void onLogout()}
        title="Ieșire din cont"
        aria-label="Ieșire din cont"
        className={`group flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-400/60 focus:ring-offset-transparent flex-shrink-0
          ${
            isDarkMode
              ? "bg-white/5 border border-white/10 text-gray-300 hover:bg-rose-500/20 hover:border-rose-400/30 hover:text-rose-200 shadow-lg shadow-black/10 hover:shadow-rose-500/10 hover:scale-[1.02] active:scale-[0.98]"
              : "bg-white/80 border border-gray-200/80 text-gray-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 shadow-lg shadow-gray-200/50 hover:shadow-rose-200/40 hover:scale-[1.02] active:scale-[0.98] backdrop-blur-md"
          }`}
      >
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-300 ${
            isDarkMode ? "bg-white/10 group-hover:bg-rose-500/30" : "bg-gray-100 group-hover:bg-rose-100"
          }`}
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Ieșire</span>
      </button>
      {center ? (
        <div className="flex-1 flex justify-center items-center min-w-0 px-0.5">{center}</div>
      ) : null}
      <button
        type="button"
        onClick={onToggleDarkMode}
        title={isDarkMode ? "Comută la modul zi" : "Comută la modul noapte"}
        aria-label={isDarkMode ? "Mod noapte activ – comută la zi" : "Mod zi activ – comută la noapte"}
        className={`flex items-center gap-0.5 p-0.5 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400/50 focus:ring-offset-transparent flex-shrink-0
          ${
            isDarkMode
              ? "bg-white/5 border border-white/10 shadow-lg shadow-black/10 hover:scale-[1.02] active:scale-[0.98]"
              : "bg-white/80 border border-gray-200/80 shadow-lg shadow-gray-200/50 hover:scale-[1.02] active:scale-[0.98] backdrop-blur-md"
          }`}
      >
        <span
          className={`p-2 rounded-full transition-all duration-300 ${
            !isDarkMode ? "bg-white shadow-md text-amber-500" : "text-gray-400 hover:text-gray-300"
          }`}
          aria-hidden
        >
          <SunIcon className="w-4 h-4" />
        </span>
        <span
          className={`p-2 rounded-full transition-all duration-300 ${
            isDarkMode ? "bg-white/10 text-blue-300 shadow-inner" : "text-gray-400 hover:text-gray-500"
          }`}
          aria-hidden
        >
          <MoonIcon className="w-4 h-4" />
        </span>
      </button>
    </div>
  );
}
