'use client';

import { useEffect } from 'react';

/** Detectează dacă rulăm în app nativă (fără a importa @capacitor – evită stat() la build). */
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.getPlatform?.() && cap.getPlatform() !== 'web');
}

export default function BackButtonHandler({
  config: _config,
}: {
  config?: unknown;
}) {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let isCancelled = false;

    const run = async () => {
      const { Capacitor } = await import('@capacitor/core');
      /* StatusBar plugin is not implemented on iOS (setOverlaysWebView, setStyle both return UNIMPLEMENTED) – only run on Android */
      if (Capacitor.getPlatform() === 'ios') {
        return () => {};
      }

      const { StatusBar, Style } = await import('@capacitor/status-bar');

      const applyStatusBarFromTheme = async () => {
        const isDark = document.documentElement.classList.contains('dark');

        try {
          try {
            await StatusBar.setOverlaysWebView({ overlay: true });
          } catch (_) {
            /* ignore */
          }
          await StatusBar.setStyle({
            style: isDark ? Style.Light : Style.Dark,
          });
          /* Android: fundal transparent ca conținutul site-ului (white/dark mode) să se vadă sub status bar */
          await StatusBar.setBackgroundColor({
            color: '#00000000',
          });
        } catch (error: unknown) {
          if (isCancelled) return;
          const err = error as { code?: string; message?: string };
          if (err?.code === 'UNIMPLEMENTED' || err?.message === 'not implemented') {
            return;
          }
          console.warn('[BackButtonHandler] StatusBar sync failed:', error);
        }
      };

      void applyStatusBarFromTheme();

      const observer = new MutationObserver(() => {
        void applyStatusBarFromTheme();
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      return () => {
        isCancelled = true;
        observer.disconnect();
      };
    };

    let cleanup: (() => void) | void;
    run().then((fn) => { cleanup = fn; }).catch(() => {});

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  return null;
}
