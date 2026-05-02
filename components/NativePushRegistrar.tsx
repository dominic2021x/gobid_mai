'use client';

import { useEffect, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** Verificare instantanee (poate fi fals negativ când WebView încarcă URL remote și bridge-ul e injectat după). */
function getWindowPlatformNow(): string | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() ?? null;
}

/** Detectează platforma și din bridge global și din @capacitor/core (mai robust decât doar window.Capacitor). */
async function detectCapacitorPlatform(): Promise<string> {
  const windowPlatform = getWindowPlatformNow();
  if (windowPlatform && windowPlatform !== 'web') return windowPlatform;
  try {
    const { Capacitor } = await import('@capacitor/core');
    const corePlatform = Capacitor?.getPlatform?.();
    if (corePlatform && corePlatform !== 'web') return corePlatform;
    if (windowPlatform) return windowPlatform;
    return corePlatform || 'web';
  } catch {
    return windowPlatform || 'web';
  }
}

function writePushDebug(patch: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('native_push_debug_v1');
    const current = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      'native_push_debug_v1',
      JSON.stringify({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore storage errors
  }
}

/**
 * În app-ul Capacitor cu server.url remote (gobid.ro), bridge-ul poate apărea după ce pagina s-a încărcat.
 * Așteptăm câteva reîncercări ca să detectăm corect platforma nativă.
 */
function usePlatformDetection(): 'native' | 'web' | 'pending' {
  const [platform, setPlatform] = useState<'native' | 'web' | 'pending'>('pending');

  useEffect(() => {
    if (platform !== 'pending') return;
    const nextTryDelays = [0, 400, 1200, 2500, 5000, 9000];
    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const tryDetect = async (i: number) => {
      if (cancelled) return;
      const value = await detectCapacitorPlatform();
      if (value && value !== 'web') {
        setPlatform('native');
        writePushDebug({ platformDetected: value, platformDetectionResult: 'native' });
        return;
      }
      if (i >= nextTryDelays.length) {
        setPlatform('web');
        writePushDebug({ platformDetected: value || 'web', platformDetectionResult: 'web' });
        return;
      }
      timeoutIds.push(setTimeout(() => { void tryDetect(i + 1); }, nextTryDelays[i]));
    };
    void tryDetect(0);
    return () => {
      cancelled = true;
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [platform]);

  return platform;
}

/** Badging API (browser/PWA): setări badge pe iconița aplicației când e instalată ca PWA. */
function useWebAppBadge(platform: 'native' | 'web' | 'pending') {
  useEffect(() => {
    if (platform !== 'web') return;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const setAppBadge = (nav as unknown as { setAppBadge?: (count: number) => Promise<void> }).setAppBadge;
    const clearAppBadge = (nav as unknown as { clearAppBadge?: () => Promise<void> }).clearAppBadge;
    if (!setAppBadge || !clearAppBadge) return;

    let removed = false;
    let notifChannel: ReturnType<typeof supabase.channel> | null = null;

    const setBadge = async (count: number) => {
      try {
        if (count <= 0) await clearAppBadge();
        else await setAppBadge(count);
      } catch {
        // Badging API poate e dezactivat sau indisponibil
      }
    };

    const syncFromUnread = async () => {
      if (removed) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          await setBadge(0);
          return;
        }
        const { count, error } = await supabase
          .from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .is('read_at', null);
        if (!error) await setBadge(count ?? 0);
      } catch {
        await setBadge(0);
      }
    };

    const authSub = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (notifChannel) {
        supabase.removeChannel(notifChannel);
        notifChannel = null;
      }
      if (session?.user?.id) {
        void syncFromUnread();
        notifChannel = supabase
          .channel(`user_notifications_badge:${session.user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${session.user.id}` },
            () => { void syncFromUnread(); }
          )
          .subscribe();
      } else {
        void setBadge(0);
      }
    });

    void syncFromUnread();

    return () => {
      removed = true;
      if (notifChannel) supabase.removeChannel(notifChannel);
      authSub.data.subscription.unsubscribe();
      void clearAppBadge().catch(() => {});
    };
  }, []);
}

export default function NativePushRegistrar() {
  const platform = usePlatformDetection();
  useWebAppBadge(platform);

  useEffect(() => {
    if (platform !== 'native') return;

    let removed = false;
    const PUSH_TOKEN_STORAGE_KEY = 'native_push_token_v1';

    const run = async () => {
      const [
        { Capacitor },
        { App },
        { PushNotifications },
        { Badge },
      ] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/app'),
        import('@capacitor/push-notifications'),
        import('@capawesome/capacitor-badge'),
      ]);
      const waitForPlugins = async (maxWaitMs: number, stepMs: number) => {
        const start = Date.now();
        while (!removed && Date.now() - start < maxWaitMs) {
          const pushReady = Capacitor?.isPluginAvailable?.('PushNotifications') ?? false;
          const appReady = Capacitor?.isPluginAvailable?.('App') ?? false;
          if (pushReady && appReady) {
            writePushDebug({
              pushPluginReadyAfterMs: Date.now() - start,
              pluginsReadyAt: new Date().toISOString(),
            });
            return { pushReady: true, appReady: true };
          }
          await new Promise((resolve) => setTimeout(resolve, stepMs));
        }
        return {
          pushReady: Capacitor?.isPluginAvailable?.('PushNotifications') ?? false,
          appReady: Capacitor?.isPluginAvailable?.('App') ?? false,
        };
      };

      const initialPushPluginAvailable = Capacitor?.isPluginAvailable?.('PushNotifications') ?? false;
      const initialAppPluginAvailable = Capacitor?.isPluginAvailable?.('App') ?? false;
      const ready = (initialPushPluginAvailable && initialAppPluginAvailable)
        ? { pushReady: true, appReady: true }
        : await waitForPlugins(20000, 500);
      const pushPluginAvailable = ready.pushReady;
      const appPluginAvailable = ready.appReady;
      let nativeAppVersion: string | null = null;
      let nativeAppBuild: string | null = null;
      if (appPluginAvailable) {
        try {
          const info = await App.getInfo();
          nativeAppVersion = info?.version || null;
          nativeAppBuild = info?.build || null;
        } catch {
          // ignore
        }
      }
      writePushDebug({
        runtimePlatform: Capacitor.getPlatform(),
        pushPluginAvailable,
        appPluginAvailable,
        nativeAppVersion,
        nativeAppBuild,
        pushRegistrarStartedAt: new Date().toISOString(),
      });
      if (!pushPluginAvailable) {
        writePushDebug({
          pushRegisterError: 'PushNotifications plugin missing in native container',
        });
      }

      const setBadgeCount = async (count: number) => {
        try {
          const { isSupported } = await Badge.isSupported();
          if (!isSupported) return;
          await Badge.set({ count: Math.max(0, count) });
        } catch {
          // Badge nu e suportat pe toate launcher-ele Android
        }
      };

      const syncBadgeFromUnread = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user?.id) {
            await setBadgeCount(0);
            return;
          }
          const { count, error } = await supabase
            .from('user_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', session.user.id)
            .is('read_at', null);
          if (!error) await setBadgeCount(count ?? 0);
        } catch {
          // ignore
        }
      };

      const registerDevice = async () => {
        try {
          const available = Capacitor?.isPluginAvailable?.('PushNotifications') ?? false;
          if (!available) {
            writePushDebug({
              pushPluginAvailable: false,
              pushRegisterError: 'PushNotifications plugin unavailable at register() time',
            });
            return;
          }
          const permission = await PushNotifications.checkPermissions();
          writePushDebug({ pushPermissionBeforeRequest: permission.receive });
          if (permission.receive !== 'granted') {
            const requested = await PushNotifications.requestPermissions();
            writePushDebug({ pushPermissionAfterRequest: requested.receive });
            if (requested.receive !== 'granted') return;
          }
          await PushNotifications.register();
          writePushDebug({ pushRegisterCalledAt: new Date().toISOString() });
        } catch (error) {
          console.warn('[NativePushRegistrar] register failed:', error);
          writePushDebug({
            pushRegisterError: error instanceof Error ? error.message : String(error),
          });
        }
      };

      const sendTokenToBackend = async (tokenValue: string, accessTokenOverride?: string | null) => {
        try {
          const accessToken =
            accessTokenOverride ||
            (await supabase.auth.getSession()).data.session?.access_token ||
            null;
          if (!accessToken) return;

          const res = await fetch('/api/notifications/register-device', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              token: tokenValue,
              platform: Capacitor.getPlatform(),
              appVersion: '1',
            }),
          });
          writePushDebug({
            pushRegisterDeviceApiStatus: res.status,
            pushRegisterDeviceApiOk: res.ok,
            pushTokenSentAt: new Date().toISOString(),
          });
        } catch (error) {
          console.warn('[NativePushRegistrar] send token failed:', error);
          writePushDebug({
            pushSendTokenError: error instanceof Error ? error.message : String(error),
          });
        }
      };

      const tokenListener = PushNotifications.addListener('registration', (token: { value?: string }) => {
        if (removed) return;
        if (!token?.value) return;
        try { localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token.value); } catch {}
        writePushDebug({
          pushTokenReceivedAt: new Date().toISOString(),
          pushTokenPrefix: token.value.slice(0, 12),
        });
        void sendTokenToBackend(token.value);
      });

      const errorListener = PushNotifications.addListener('registrationError', (err) => {
        if (!removed) console.warn('[NativePushRegistrar] registrationError:', err);
        writePushDebug({
          pushRegistrationErrorAt: new Date().toISOString(),
          pushRegistrationError: typeof err === 'string' ? err : JSON.stringify(err),
        });
      });

      const pushReceivedListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
        if (removed) return;
        const data = notification.data as Record<string, string> | undefined;
        const badgeCount = data?.badgeCount ? parseInt(String(data.badgeCount), 10) : undefined;
        if (typeof badgeCount === 'number' && !Number.isNaN(badgeCount)) {
          void setBadgeCount(badgeCount);
        } else {
          void syncBadgeFromUnread();
        }
      });

      const pushActionListener = PushNotifications.addListener('pushNotificationActionPerformed', () => {
        if (removed) return;
        void syncBadgeFromUnread();
      });

      let notifChannel: ReturnType<typeof supabase.channel> | null = null;

      const authSub = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        if (notifChannel) {
          supabase.removeChannel(notifChannel);
          notifChannel = null;
        }
        if (session?.user?.id) {
          try {
            const cached = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
            if (cached) void sendTokenToBackend(cached, session.access_token);
          } catch {}
          void registerDevice();
          void syncBadgeFromUnread();
          notifChannel = supabase
            .channel(`user_notifications:${session.user.id}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${session.user.id}` },
              () => { void syncBadgeFromUnread(); }
            )
            .subscribe();
        } else {
          void setBadgeCount(0);
        }
      });

      const appStateListener = App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
        if (removed) return;
        if (isActive) {
          void registerDevice();
          void syncBadgeFromUnread();
        }
      });

      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return;
          const cached = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
          if (cached) await sendTokenToBackend(cached, session.access_token);
          if (session.user?.id) await syncBadgeFromUnread();
        } catch {}
      })();

      const onReregister = async () => {
        if (removed) return;
        try {
          const cached = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
          if (cached) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) await sendTokenToBackend(cached, session.access_token);
          }
        } catch {}
        void registerDevice();
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('capacitor-push-reregister', onReregister);
      }

      void registerDevice();
      const t1 = setTimeout(() => { if (!removed) void registerDevice(); }, 3000);
      const t2 = setTimeout(() => { if (!removed) void registerDevice(); }, 6000);
      const t3 = setTimeout(() => { if (!removed) void registerDevice(); }, 12000);
      const t4 = setTimeout(() => { if (!removed) void registerDevice(); }, 20000);

      return () => {
        removed = true;
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        if (typeof window !== 'undefined') {
          window.removeEventListener('capacitor-push-reregister', onReregister);
        }
        if (notifChannel) supabase.removeChannel(notifChannel);
        tokenListener.then((listener) => listener.remove()).catch(() => {});
        errorListener.then((listener) => listener.remove()).catch(() => {});
        pushReceivedListener.then((listener) => listener.remove()).catch(() => {});
        pushActionListener.then((listener) => listener.remove()).catch(() => {});
        authSub.data.subscription.unsubscribe();
        appStateListener.then((listener) => listener.remove()).catch(() => {});
      };
    };

    let cleanup: (() => void) | void;
    run().then((fn) => { cleanup = fn; }).catch(() => {});

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [platform]);

  return null;
}
