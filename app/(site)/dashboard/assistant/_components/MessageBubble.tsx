"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { linkifyInternalPaths } from "@/lib/assistant/ui/linkify";
import CodeBlock from "./CodeBlock";
import { useAiChatAvatarSrc } from "./useAiChatAvatarSrc";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  attachmentUrls?: string[];
  forceLight?: boolean;
  /** User message: sending | sent | failed */
  status?: "sending" | "sent" | "failed";
  /** Assistant placeholder (pending response) */
  isPending?: boolean;
  /** Show avatar (first in group) */
  showAvatar?: boolean;
  /** Reduce top margin (continuation in group) */
  compact?: boolean;
  /** Gray hint under user bubble: "(se completează draft-ul…)" */
  optimisticDraftHint?: boolean;
  /** User only: last user message in conversation (enables Edit) */
  isLastUserMessage?: boolean;
  /** User only: retry failed send */
  onRetry?: () => void;
  /** User only: edit & resend (fill input and focus) */
  onEdit?: () => void;
  /** Search highlight: term to highlight in non-code text (debounced from parent) */
  highlightTerm?: string;
  /** Assistant only: server-sent events (draft_created, field_updated, validated, published) shown as chips */
  assistantEvents?: { event_type: string; payload: Record<string, unknown> }[];
  /** Assistant only: show login button (401) */
  loginRedirect?: boolean;
};

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function DotsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

type ContentSegment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language?: string };

type HighlightSegment = { type: "text"; value: string } | { type: "match"; value: string };

function splitByHighlight(text: string, term: string): HighlightSegment[] {
  if (!term || !term.trim()) return [{ type: "text", value: text }];
  const lower = term.toLowerCase();
  const segments: HighlightSegment[] = [];
  let remaining = text;
  let pos = remaining.toLowerCase().indexOf(lower);
  while (pos !== -1) {
    segments.push({ type: "text", value: remaining.slice(0, pos) });
    segments.push({ type: "match", value: remaining.slice(pos, pos + term.length) });
    remaining = remaining.slice(pos + term.length);
    pos = remaining.toLowerCase().indexOf(lower);
  }
  segments.push({ type: "text", value: remaining });
  return segments;
}

function parseFencedCodeBlocks(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const parts = content.split("```");
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i].length > 0) segments.push({ type: "text", content: parts[i] });
    } else {
      const block = parts[i];
      const firstNewline = block.indexOf("\n");
      let code: string;
      let language: string | undefined;
      if (firstNewline === -1) {
        language = block.trim() || undefined;
        code = "";
      } else {
        const firstLine = block.slice(0, firstNewline).trim();
        code = block.slice(firstNewline + 1);
        language = firstLine.length > 0 ? firstLine : undefined;
      }
      segments.push({ type: "code", content: code, language });
    }
  }
  return segments;
}

function formatMessageTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function AvatarAI({ className = "", forceLight }: { className?: string; forceLight?: boolean }) {
  const src = useAiChatAvatarSrc({ forceLight });
  return (
    <img src={src} alt="" className={`shrink-0 w-8 h-8 object-contain ${className}`} aria-hidden />
  );
}

function AvatarUser({ className = "" }: { className?: string }) {
  return (
    <div
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-500 text-white shadow-sm border border-white/40 ${className}`}
      aria-hidden
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>
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

const ASSISTANT_EVENT_LABELS: Record<string, string> = {
  draft_created: "Draft creat",
  field_updated: "Câmp actualizat",
  validated: "Validat",
  published: "Anunț publicat",
  support_ticket_created: "Tichet suport creat",
};

export default function MessageBubble({
  role,
  content,
  createdAt,
  attachmentUrls,
  forceLight,
  status,
  isPending,
  showAvatar = true,
  compact,
  optimisticDraftHint,
  isLastUserMessage,
  onRetry,
  onEdit,
  highlightTerm,
  assistantEvents,
  loginRedirect,
}: MessageBubbleProps) {
  const time = formatMessageTime(createdAt);
  const isUser = role === "user";
  const isFailed = status === "failed";
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copyToClipboard(content)
      .then(() => {
        setCopied(true);
        setMobileMenuOpen(false);
        copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  }, [content]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [mobileMenuOpen]);

  const isAssistant = !isUser;
  const showCopy = isAssistant && !isPending && content.length > 0;
  const showUserActions = isUser && (onRetry != null || onEdit != null);

  const highlight = useCallback(
    (str: string) => {
      if (!highlightTerm?.trim()) return <>{str}</>;
      const segs = splitByHighlight(str, highlightTerm);
      return (
        <>
          {segs.map((s, i) =>
            s.type === "text" ? (
              <Fragment key={i}>{s.value}</Fragment>
            ) : (
              <mark key={i} className="bg-amber-200/80 dark:bg-amber-500/40 rounded px-0.5" data-search-match>
                {s.value}
              </mark>
            )
          )}
        </>
      );
    },
    [highlightTerm]
  );

  const contentSegments = useMemo(() => {
    if (!isAssistant || !content.includes("```")) return null;
    return parseFencedCodeBlocks(content);
  }, [isAssistant, content]);
  const hasCodeBlocks = contentSegments?.some((s) => s.type === "code") ?? false;

  const bubbleTransition = "bubble-hover-transition transition-shadow duration-150 ease-out";
  const bubbleBase = `rounded-2xl px-4 py-2.5 text-sm shadow-sm ${bubbleTransition} ${
    isPending
      ? `rounded-bl-md border border-gray-200/80 ${
          forceLight ? "bg-gray-100/90 text-gray-400" : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 dark:border-gray-600"
        }`
      : isUser
        ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-br-md border border-white/20 group-hover:shadow-md"
        : `rounded-bl-md border border-gray-200/80 group-hover:shadow-md ${
            forceLight
              ? "bg-gray-100/90 text-gray-900 group-hover:bg-gray-50"
              : "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 group-hover:bg-gray-50 dark:group-hover:bg-gray-600/80"
          }`
  }`;

  return (
    <div
      className={`group flex w-full gap-2 ${isUser ? "justify-end" : "justify-start"} ${compact ? "!mt-1" : ""} ${isPending ? "anim-fade" : "anim-in"}`}
    >
      {!isUser && (showAvatar ? <AvatarAI forceLight={forceLight} /> : <div className="w-8 shrink-0" />)}
      <div className={`flex flex-col max-w-[75%] min-w-0 ${isUser ? "items-end" : "items-start"}`}>
        <div className="relative">
          <div className={bubbleBase}>
            {isAssistant && assistantEvents && assistantEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-gray-200/60 dark:border-gray-500/40">
                {assistantEvents.map((ev, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      forceLight
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                    }`}
                  >
                    {ASSISTANT_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                  </span>
                ))}
              </div>
            )}
            <div
              className={`whitespace-pre-wrap break-words [&>a]:underline ${
                isUser ? "[&>a]:text-white/90" : `[&>a]:text-green-600${forceLight ? "" : " dark:[&>a]:text-green-400"}`
              }`}
            >
              {hasCodeBlocks && contentSegments ? (
                contentSegments.map((seg, idx) =>
                  seg.type === "text" ? (
                    <span key={idx}>
                      {isAssistant
                        ? linkifyInternalPaths(seg.content).map((s, i) =>
                            s.type === "text" ? (
                              <Fragment key={i}>{highlight(s.value)}</Fragment>
                            ) : (
                              <Link
                                key={i}
                                href={s.href}
                                target="_self"
                                className={`underline-offset-2 hover:underline ${
                                  forceLight
                                    ? "text-green-600"
                                    : "text-green-600 dark:text-green-400"
                                }`}
                              >
                                {highlight(s.value)}
                              </Link>
                            )
                          )
                        : highlight(seg.content)}
                    </span>
                  ) : (
                    <CodeBlock key={idx} code={seg.content} language={seg.language} forceLight={forceLight} />
                  )
                )
              ) : isAssistant ? (
                (() => {
                  const linkified = linkifyInternalPaths(content);
                  if (linkified.length === 1 && linkified[0].type === "text") {
                    return highlight(content);
                  }
                  return linkified.map((s, i) =>
                    s.type === "text" ? (
                      <Fragment key={i}>{highlight(s.value)}</Fragment>
                    ) : (
                      <Link
                        key={i}
                        href={s.href}
                        target="_self"
                        className={`underline-offset-2 hover:underline ${
                          forceLight ? "text-green-600" : "text-green-600 dark:text-green-400"
                        }`}
                      >
                        {highlight(s.value)}
                      </Link>
                    )
                  );
                })()
              ) : (
                highlight(content)
              )}
            </div>
            {loginRedirect && (
              <div className="mt-2">
                <Link
                  href="/login?next=/dashboard/assistant"
                  className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                    forceLight
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                  }`}
                >
                  Autentifică-te
                </Link>
              </div>
            )}
            {/* Desktop: action row on hover/focus-visible; assistant Copy */}
            {showCopy && (
              <div
                className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto pointer-events-none"
                aria-hidden={!mobileMenuOpen}
              >
                {copied ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      forceLight ? "bg-gray-200 text-gray-600" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                    }`}
                  >
                    Copiat
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      forceLight
                        ? "text-gray-500 hover:bg-gray-200/80 focus-visible:ring-gray-400"
                        : "text-gray-500 hover:bg-gray-200/80 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-600 dark:focus-visible:ring-gray-500"
                    }`}
                    aria-label="Copiază în clipboard"
                  >
                    <CopyIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            {/* Desktop: action row for user (Retry / Edit) */}
            {showUserActions && (
              <div
                className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 focus-within:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto pointer-events-none"
              >
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1"
                    aria-label="Reîncearcă"
                  >
                    Reîncearcă
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="rounded px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1"
                    aria-label="Editează"
                  >
                    Editează
                  </button>
                )}
              </div>
            )}
            {/* Mobile: subtle ⋯ button (assistant only); tap opens popover with Copy */}
            {showCopy && (
              <div className="relative ml-auto mt-0.5 flex justify-end md:hidden" ref={mobileMenuRef}>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((o) => !o)}
                  className={`rounded p-1 touch-manipulation ${
                    forceLight ? "text-gray-400 hover:bg-gray-200/80" : "text-gray-400 hover:bg-gray-200/80 dark:text-gray-500 dark:hover:bg-gray-600"
                  }`}
                  aria-label="Acțiuni mesaj"
                  aria-expanded={mobileMenuOpen}
                >
                  <DotsIcon className="h-4 w-4" />
                </button>
                {mobileMenuOpen && (
                  <div
                    className={`absolute right-0 bottom-full mb-1 flex flex-col rounded-lg border py-1 shadow-lg ${
                      forceLight
                        ? "border-gray-200 bg-white"
                        : "border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
                    }`}
                    role="menu"
                  >
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                      role="menuitem"
                    >
                      <CopyIcon className="h-4 w-4 shrink-0" />
                      {copied ? "Copiat" : "Copiază"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Mobile: ⋯ for user (Retry / Edit) */}
            {showUserActions && (
              <div className="relative ml-auto mt-0.5 flex justify-end md:hidden" ref={mobileMenuRef}>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((o) => !o)}
                  className="rounded p-1 touch-manipulation text-white/80 hover:bg-white/20"
                  aria-label="Acțiuni mesaj"
                  aria-expanded={mobileMenuOpen}
                >
                  <DotsIcon className="h-4 w-4" />
                </button>
                {mobileMenuOpen && (
                  <div
                    className={`absolute right-0 bottom-full mb-1 flex flex-col rounded-lg border py-1 shadow-lg ${
                      forceLight
                        ? "border-gray-200 bg-white"
                        : "border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
                    }`}
                    role="menu"
                  >
                    {onRetry && (
                      <button
                        type="button"
                        onClick={() => { onRetry(); setMobileMenuOpen(false); }}
                        className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                      >
                        Reîncearcă
                      </button>
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => { onEdit(); setMobileMenuOpen(false); }}
                        className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                      >
                        Editează
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {optimisticDraftHint && (
          <span className={`mt-0.5 text-[10px] text-gray-400 italic ${forceLight ? "" : "dark:text-gray-500"}`}>
            (se completează draft-ul…)
          </span>
        )}
        {isFailed && (
          <span className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">Eroare. Reîncearcă</span>
        )}
        {time && !compact && (
          <span className={`mt-1 text-[11px] text-gray-400 px-1${forceLight ? "" : " dark:text-gray-500"}`}>
            {time}
          </span>
        )}
        {attachmentUrls && attachmentUrls.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
            {attachmentUrls.map((url, idx) => (
              <a
                key={`${url}-${idx}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-12 h-12 rounded-lg border overflow-hidden shrink-0 shadow-sm ${
                  forceLight ? "border-gray-200 bg-gray-100" : "border-gray-200 bg-gray-100 dark:border-gray-600 dark:bg-gray-700"
                }`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>
      {isUser && (showAvatar ? <AvatarUser /> : <div className="w-8 shrink-0" />)}
    </div>
  );
}
