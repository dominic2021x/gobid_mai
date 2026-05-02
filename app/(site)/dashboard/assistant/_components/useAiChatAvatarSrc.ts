"use client";

import { useEffect, useState } from "react";

export const AI_CHAT_AVATAR_LIGHT = "/images/ai-chat-avatar-light.png?v=4";
export const AI_CHAT_AVATAR_DARK = "/images/ai-chat-avatar-dark.png?v=4";

/** Pe UI deschis → albastru; pe UI întunecat → alb (invers față de numele fișierului). */
function srcForTheme(isDark: boolean): string {
  return isDark ? AI_CHAT_AVATAR_LIGHT : AI_CHAT_AVATAR_DARK;
}

function isHtmlDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Alege iconița GO AI după `class="dark"` pe `<html>` (Tailwind).
 * Mod clar → robot albastru; mod întunecat → robot alb.
 * `forceLight`: zonă cu fundal deschis (ex. bule) → același ca tema clară (albastru).
 */
export function useAiChatAvatarSrc(options?: { forceLight?: boolean }): string {
  const forceLight = options?.forceLight === true;
  const [src, setSrc] = useState(() =>
    forceLight ? AI_CHAT_AVATAR_DARK : srcForTheme(isHtmlDark())
  );

  useEffect(() => {
    if (forceLight) {
      setSrc(AI_CHAT_AVATAR_DARK);
      return;
    }

    const sync = () => {
      setSrc(srcForTheme(isHtmlDark()));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === "darkMode") sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, [forceLight]);

  return src;
}
