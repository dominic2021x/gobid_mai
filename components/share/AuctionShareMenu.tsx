"use client";

import type { ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export type AuctionShareMenuAction =
  | "whatsapp"
  | "facebook"
  | "gmail"
  | "telegram"
  | "twitter"
  | "copy"
  | "native";

function IconWrap({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-md ring-1 ring-black/[0.06] dark:ring-white/10",
        className
      )}
    >
      {children}
    </div>
  );
}

function WhatsAppBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FacebookBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

/** Logo Gmail (culori oficiale aproximate) */
function GmailBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function TelegramBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function XBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkCopyIcon() {
  return (
    <svg className="h-5 w-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function NativeShareGlyph() {
  return (
    <svg className="h-5 w-5 text-slate-600 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m0-9.316a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

type RowProps = {
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  hoverClass: string;
  titleClass: string;
  subtitleClass: string;
};

function ShareRow({ onClick, icon, title, subtitle, hoverClass, titleClass, subtitleClass }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-200",
        "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        hoverClass
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className={cn("text-[15px] font-semibold leading-tight tracking-tight", titleClass)}>{title}</div>
        <div className={cn("mt-0.5 text-[13px] leading-snug opacity-90", subtitleClass)}>{subtitle}</div>
      </div>
    </button>
  );
}

/**
 * Meniu partajare licitație: iconițe brand (SVG), header „Distribuie” + închidere, listă scrollabilă.
 */
export function AuctionShareMenuPanel({
  isDarkMode,
  showNativeShare,
  onAction,
  onClose,
  className,
  /** Umple lățimea containerului (ex. card sidebar), nu doar 20rem */
  fullWidth = false,
}: {
  isDarkMode: boolean;
  showNativeShare: boolean;
  onAction: (action: AuctionShareMenuAction) => void | Promise<void>;
  onClose: () => void;
  className?: string;
  fullWidth?: boolean;
}) {
  const t = isDarkMode ? "text-white" : "text-gray-900";
  const sub = isDarkMode ? "text-gray-400" : "text-gray-500";
  const border = isDarkMode ? "border-gray-700" : "border-gray-200";
  const headBg = isDarkMode ? "bg-gray-900/95" : "bg-white";
  const rowHover = (tone: "green" | "blue" | "red" | "neutral") => {
    if (isDarkMode) {
      const map = {
        green: "hover:bg-green-900/25",
        blue: "hover:bg-blue-900/25",
        red: "hover:bg-red-900/20",
        neutral: "hover:bg-white/10",
      };
      return map[tone];
    }
    const map = {
      green: "hover:bg-green-50",
      blue: "hover:bg-blue-50",
      red: "hover:bg-red-50",
      neutral: "hover:bg-gray-50",
    };
    return map[tone];
  };

  const run = (a: AuctionShareMenuAction) => {
    void onAction(a);
  };

  return (
    <div
      className={cn(
        "flex max-h-[min(72vh,calc(100dvh-7rem))] flex-col overflow-hidden rounded-3xl",
        "border border-white/20 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.28)] dark:border-white/10 dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.65)]",
        "bg-white/90 backdrop-blur-xl dark:bg-gray-950/90",
        fullWidth ? "w-full max-w-none" : "w-[min(100vw-1.5rem,20rem)]",
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 px-4 py-3.5",
          "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.12)]"
        )}
      >
        <span className="text-[17px] font-semibold tracking-tight">Distribuie</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
          aria-label="Închide"
        >
          <XMarkIcon className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable]",
          isDarkMode ? "bg-gray-950/40" : "bg-slate-50/90"
        )}
      >
        <ShareRow
          hoverClass={rowHover("green")}
          titleClass={t}
          subtitleClass={sub}
          onClick={() => run("whatsapp")}
          title="WhatsApp"
          subtitle="Partajează pe WhatsApp"
          icon={
            <IconWrap className="bg-[#25D366] text-white">
              <WhatsAppBrandIcon />
            </IconWrap>
          }
        />
        <ShareRow
          hoverClass={rowHover("blue")}
          titleClass={t}
          subtitleClass={sub}
          onClick={() => run("facebook")}
          title="Facebook"
          subtitle="Partajează pe Facebook"
          icon={
            <IconWrap className="bg-[#1877F2] text-white">
              <FacebookBrandIcon />
            </IconWrap>
          }
        />
        <ShareRow
          hoverClass={rowHover("red")}
          titleClass={t}
          subtitleClass={sub}
          onClick={() => run("gmail")}
          title="Gmail"
          subtitle="Trimite prin email"
          icon={
            <IconWrap className="bg-white">
              <GmailBrandIcon />
            </IconWrap>
          }
        />
        <ShareRow
          hoverClass={rowHover("blue")}
          titleClass={t}
          subtitleClass={sub}
          onClick={() => run("telegram")}
          title="Telegram"
          subtitle="Partajează pe Telegram"
          icon={
            <IconWrap className="bg-[#26A5E4] text-white">
              <TelegramBrandIcon />
            </IconWrap>
          }
        />
        <ShareRow
          hoverClass={rowHover("neutral")}
          titleClass={t}
          subtitleClass={sub}
          onClick={() => run("twitter")}
          title="X (Twitter)"
          subtitle="Partajează pe X / Twitter"
          icon={
            <IconWrap className="bg-black text-white">
              <XBrandIcon />
            </IconWrap>
          }
        />
        <ShareRow
          hoverClass={rowHover("neutral")}
          titleClass={t}
          subtitleClass={sub}
          onClick={() => run("copy")}
          title="Copiază link"
          subtitle="Copiază linkul paginii"
          icon={
            <IconWrap className="bg-slate-100 dark:bg-slate-700/80">
              <LinkCopyIcon />
            </IconWrap>
          }
        />
        {showNativeShare && (
          <ShareRow
            hoverClass={rowHover("neutral")}
            titleClass={t}
            subtitleClass={sub}
            onClick={() => run("native")}
            title="Partajare nativă"
            subtitle="Folosește opțiunile sistemului"
            icon={
              <IconWrap className="bg-slate-100 dark:bg-slate-700/80">
                <NativeShareGlyph />
              </IconWrap>
            }
          />
        )}
      </div>
    </div>
  );
}
