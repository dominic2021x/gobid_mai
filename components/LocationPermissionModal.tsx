"use client";

import { useCallback, useEffect, useRef } from "react";
import Eye from "lucide-react/dist/esm/icons/eye";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import Lock from "lucide-react/dist/esm/icons/lock";
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import Shield from "lucide-react/dist/esm/icons/shield";
import X from "lucide-react/dist/esm/icons/x";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LocationPermissionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseApproximateLocation: () => void;
  isBusy?: boolean;
  title?: string;
  description?: string;
  /** Paragraf opțional sub descriere (înainte de carduri). */
  footnote?: string;
  manualLabel?: string;
  useLocationLabel?: string;
  /** Afișează cele 3 puncte informative (Lock / Eye / Shield). Implicit: da. */
  showFeatureCards?: boolean;
};

export default function LocationPermissionModal({
  open,
  onOpenChange,
  onUseApproximateLocation,
  isBusy = false,
  title = "Folosește locația ta",
  description = "Pentru a-ți afișa produse relevante din apropierea ta, avem nevoie de acces la locația ta.",
  footnote,
  manualLabel = "Refuză",
  useLocationLabel = "Acceptă locația mea",
  showFeatureCards = true,
}: LocationPermissionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    if (!isBusy) onOpenChange(false);
  }, [isBusy, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, handleDismiss]);

  useEffect(() => {
    if (!open || !modalRef.current) return;

    const modal = modalRef.current;
    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = getFocusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTab);
    queueMicrotask(() => {
      const nodes = getFocusable();
      nodes[0]?.focus();
    });

    return () => document.removeEventListener("keydown", handleTab);
  }, [open]);

  if (!open) return null;

  const describedByParts = [
    "location-permission-description",
    ...(footnote ? ["location-permission-footnote"] : []),
    ...(showFeatureCards ? ["location-permission-features"] : []),
  ];
  const describedBy =
    describedByParts.length > 0 ? describedByParts.join(" ") : undefined;

  return (
    <div className="fixed inset-0 z-[300000] flex items-center justify-center p-4 sm:p-6" role="presentation">
      <button
        type="button"
        aria-label="Închide"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onMouseDown={(e) => {
          e.preventDefault();
          handleDismiss();
        }}
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-permission-title"
        aria-describedby={describedBy}
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-200",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 z-10 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          onClick={handleDismiss}
          disabled={isBusy}
          aria-label="Închide"
        >
          <X className="size-5" aria-hidden />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg dark:from-blue-500 dark:to-cyan-600">
              <MapPin className="size-8 text-white" aria-hidden />
            </div>

            <div className="space-y-2">
              <h2 id="location-permission-title" className="text-2xl font-semibold text-foreground">
                {title}
              </h2>
              <p
                id="location-permission-description"
                className="text-base leading-relaxed text-muted-foreground"
              >
                {description}
              </p>
            </div>

            {footnote ? (
              <p
                id="location-permission-footnote"
                className="max-w-md text-center text-sm leading-relaxed text-muted-foreground"
              >
                {footnote}
              </p>
            ) : null}

            {showFeatureCards ? (
              <div
                id="location-permission-features"
                className="w-full space-y-3 pt-2"
                role="region"
                aria-label="Informații despre locație"
              >
                <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-left dark:bg-muted/30">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                    <Lock className="size-5 text-blue-600 dark:text-blue-400" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-foreground">Confidențialitate garantată</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Nu publicăm adresa ta exactă. Locația este utilizată doar aproximativ (zonă/oraș).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-left dark:bg-muted/30">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 dark:bg-cyan-500/20">
                    <Eye className="size-5 text-cyan-600 dark:text-cyan-400" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-foreground">Rezultate personalizate</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Îți vom arăta produse și oferte din apropierea ta, relevante pentru zona în care te afli.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-left dark:bg-muted/30">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20">
                    <Shield className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-foreground">Date protejate</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Informațiile tale de locație sunt criptate și nu sunt partajate cu terți.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={() => {
                void onUseApproximateLocation();
              }}
              disabled={isBusy}
              className={cn(
                "h-11 w-full rounded-xl font-medium shadow-md transition-all sm:flex-1",
                "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600",
                "shadow-md hover:shadow-lg disabled:opacity-60",
              )}
            >
              {isBusy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Se încarcă...
                </span>
              ) : (
                useLocationLabel
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleDismiss}
              disabled={isBusy}
              className="h-11 w-full rounded-xl sm:w-auto"
            >
              {manualLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
