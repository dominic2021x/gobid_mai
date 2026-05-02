"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CodeBlockProps = {
  code: string;
  language?: string;
  forceLight?: boolean;
};

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      resolve();
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

export default function CodeBlock({ code, language, forceLight }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    copyToClipboard(code).then(() => {
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 1200);
    });
  }, [code]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const bg = forceLight
    ? "bg-gray-100/80 border-gray-200/80"
    : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-600";
  const btn =
    forceLight
      ? "text-gray-500 hover:bg-gray-200/80"
      : "text-gray-500 hover:bg-gray-200/80 dark:text-gray-400 dark:hover:bg-gray-700";

  return (
    <div
      className={`relative mt-2 mb-1 rounded-lg border overflow-hidden ${bg}`}
      data-code-block
    >
      <div className="flex items-center justify-end gap-1 pr-2 pt-1.5 pb-0.5">
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-gray-400 ${btn}`}
          aria-label="Copiază codul"
        >
          {copied ? (
            <span className="text-emerald-600 dark:text-emerald-400">Copiat</span>
          ) : (
            <>
              <CopyIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Copiază codul</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 pt-0 text-xs font-mono leading-relaxed whitespace-pre">
        <code className={forceLight ? "text-gray-800" : "text-gray-800 dark:text-gray-200"}>{code}</code>
      </pre>
    </div>
  );
}
