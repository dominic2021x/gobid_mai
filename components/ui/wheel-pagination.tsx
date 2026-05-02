"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { getRoVisiblePageSlots } from "@/lib/ro/getRoVisiblePageSlots";

/** Aceeași bandă sub listă ca pe marketplace `/ro` — folosită oriunde vrei paginare „full width”, fără alt înveliș custom. */
export interface WheelPaginationFooterProps {
  isDarkMode?: boolean;
  className?: string;
  children: ReactNode;
}

export function WheelPaginationFooter({
  isDarkMode = false,
  className,
  children,
}: WheelPaginationFooterProps) {
  return (
    <div
      className={cn(
        "mt-10 flex w-full flex-col items-center gap-2 px-1 pt-8 sm:mt-12 sm:pt-10 md:px-0",
        "border-t border-dashed pb-6",
        isDarkMode ? "border-white/10 text-gray-100" : "border-gray-200/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface WheelPaginationProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  /** Număr de pagini vizibile în jurul paginii curente (implicit 3 ca pe /ro). */
  paginationDelta?: number;
  className?: string;
  /** False când nu există pagină următoare (ex. paginare „cursor” sau total necunoscut). */
  canGoNext?: boolean;
  /** Temă întunecată (dashboard / marketplace dark). */
  isDarkMode?: boolean;
}

/**
 * Paginare circulară gobid — același design ca marketplace `/ro`
 * (pastile rotunde, gradient albastru pe pagina activă, săgeți, ellipsis).
 */
export default function WheelPagination({
  totalPages,
  currentPage,
  onPageChange,
  paginationDelta = 3,
  className,
  canGoNext = true,
  isDarkMode = false,
}: WheelPaginationProps) {
  /** ≥ sm (640px): delta și „fereastra” de început ca înainte; pe mobil mai puține pastile (≈3 numere). */
  const isSmUp = useMediaQuery("(min-width: 640px)");
  const safeTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
  const safePage = Math.min(Math.max(1, Math.floor(Number(currentPage) || 1)), safeTotal);
  const effectiveDelta = isSmUp ? paginationDelta : 1;
  const slots = getRoVisiblePageSlots(safeTotal, safePage, effectiveDelta, {
    maxLeadingSpan: isSmUp ? 7 : 3,
  });
  const nextDisabled = !canGoNext || safePage >= safeTotal;

  const pillButtonClass = (page: number) =>
    cn(
      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-medium transition-colors duration-150",
      safePage === page
        ? isDarkMode
          ? "border border-sky-400/50 bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md"
          : "border border-sky-300/80 bg-gradient-to-br from-sky-600 to-cyan-600 text-white shadow-md"
        : isDarkMode
          ? "bg-white/10 text-gray-200 hover:bg-slate-800/80"
          : "bg-gray-200 text-gray-800 hover:bg-gray-300",
    );

  return (
    <div
      role="navigation"
      aria-label="Paginare"
      className={cn(
        "mx-auto inline-flex w-fit max-w-full items-center justify-start gap-3 overflow-x-auto rounded-full px-2 py-1 select-none overscroll-x-contain",
        "text-slate-800 dark:text-gray-100",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onPageChange(safePage - 1)}
        disabled={safePage <= 1}
        className={cn(
          "h-12 w-12 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-primary disabled:opacity-40",
          isDarkMode && "hover:bg-slate-800/70 hover:text-sky-300",
        )}
        aria-label="Pagina anterioară"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      {slots.map((slot, idx) =>
        slot === "..." ? (
          <span
            key={`ellipsis-${idx}`}
            className={cn(
              "flex h-12 min-w-8 shrink-0 items-center justify-center text-base font-medium tracking-widest text-muted-foreground select-none",
              isDarkMode && "text-gray-500",
            )}
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            className={pillButtonClass(slot)}
            onClick={() => onPageChange(slot)}
            aria-label={`Pagina ${slot}`}
            aria-current={safePage === slot ? "page" : undefined}
          >
            {String(slot)}
          </button>
        ),
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onPageChange(safePage + 1)}
        disabled={nextDisabled}
        className={cn(
          "h-12 w-12 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-primary disabled:opacity-40",
          isDarkMode && "hover:bg-slate-800/70 hover:text-sky-300",
        )}
        aria-label="Pagina următoare"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
