"use client";

import Image from "next/image";

interface DashboardFooterProps {
  isDarkMode?: boolean;
}

export default function DashboardFooter({ isDarkMode = false }: DashboardFooterProps) {
  return (
    <footer
      suppressHydrationWarning
      className={`mt-auto pt-4 px-4 sm:px-6 lg:px-8 border-t transition-colors duration-300 backdrop-blur-sm ${
      isDarkMode
        ? 'border-white/5 bg-transparent'
        : 'border-gray-200/30 bg-transparent'
      }`}
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 sm:space-y-0">
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1">
          <p className={`text-xs sm:text-sm transition-colors ${
            isDarkMode ? 'text-gray-400/70' : 'text-gray-600/70'
          }`}>
            © 2026 gobid.ro. Toate drepturile rezervate.
          </p>
          <p className={`text-xs sm:text-sm transition-colors ${
            isDarkMode ? 'text-gray-400/60' : 'text-gray-600/60'
          }`}>
            Operat de DMK WEB STRATEGY SRL CUI 54080033
          </p>
        </div>
        <div className="flex w-full sm:w-auto items-center justify-center sm:justify-end gap-2 sm:gap-4 whitespace-nowrap overflow-x-auto">
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs sm:text-sm transition-colors ${
              isDarkMode ? "text-gray-300/80" : "text-gray-700/80"
            }`}>
              <span>Proiectat și dezvoltat cu</span>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-[0.95em] w-[0.95em] fill-red-500 animate-[heartBeat_1.15s_ease-in-out_infinite]"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4C8.24 4 9.91 4.81 11 6.08 12.09 4.81 13.76 4 15.5 4A4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span>de</span>
            </span>
            <a
              href="https://www.noerror.ro/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NOERROR (deschide în tab nou)"
            >
              <Image
                src="/reclame/noerror-logo.png"
                alt="NOError"
                width={80}
                height={18}
                className={`w-auto ${isDarkMode ? "brightness-0 invert" : ""}`}
                style={{ height: 16 }}
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
