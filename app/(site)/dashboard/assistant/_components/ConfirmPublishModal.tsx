"use client";

import { useEffect, useRef } from "react";

type ConfirmPublishModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  draftTitle: string | null;
  isPublishing: boolean;
  forceLight?: boolean;
};

export default function ConfirmPublishModal({
  isOpen,
  onClose,
  onConfirm,
  draftTitle,
  isPublishing,
  forceLight,
}: ConfirmPublishModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
    return () => {
      prevFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPublishing) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const last = focusables[focusables.length - 1];
        const first = focusables[0];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPublishing]);

  if (!isOpen) return null;

  const bg = forceLight ? "bg-white" : "bg-white dark:bg-gray-800";
  const border = forceLight ? "border-gray-200" : "border-gray-200 dark:border-gray-600";
  const text = forceLight ? "text-gray-900" : "text-gray-900 dark:text-gray-100";
  const muted = forceLight ? "text-gray-500" : "text-gray-500 dark:text-gray-400";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-publish-title"
      aria-describedby="confirm-publish-desc"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isPublishing && onClose()}
        aria-hidden
      />
      <div
        ref={modalRef}
        className={`relative w-full max-w-sm rounded-xl border ${border} ${bg} shadow-xl ${text}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-publish-title" className="sr-only">
          Confirmă publicarea
        </h2>
        <div className="px-4 pt-4 pb-1">
          <p className="text-sm font-semibold">Confirmă publicarea</p>
        </div>
        <div id="confirm-publish-desc" className={`px-4 py-2 text-sm ${muted}`}>
          <p className="mb-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Titlu:</span>{" "}
            {draftTitle?.trim() || "Draft fără titlu"}
          </p>
          <p className="mb-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span> Gata de publicare
          </p>
          <p className="text-xs">
            După publicare, anunțul devine activ.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Anulează
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={isPublishing}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPublishing ? "Se publică…" : "Publică"}
          </button>
        </div>
      </div>
    </div>
  );
}
