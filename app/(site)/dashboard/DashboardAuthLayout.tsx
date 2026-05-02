"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import supabase from "@/lib/supabase";
import { recoverDashboardSessionIfNeeded } from "@/lib/auth/dashboardSessionRecovery";
import { formatPageName } from "@/utils/pageTracker";
import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { DashboardLoginRedirect } from "./DashboardLoginRedirect";

const DASHBOARD_ACTIVITY_TRACK_INTERVAL_MS = 120_000;
const DASHBOARD_ACTIVITY_TRACK_THROTTLE_MS = 90_000;

function shouldSkipRecentDashboardActivity(pathname: string): boolean {
  try {
    const key = `gobid:last-activity:${pathname}`;
    const now = Date.now();
    const last = Number(window.localStorage.getItem(key) || "0");
    if (Number.isFinite(last) && now - last < DASHBOARD_ACTIVITY_TRACK_THROTTLE_MS) {
      return true;
    }
    window.localStorage.setItem(key, String(now));
    return false;
  } catch {
    return false;
  }
}

type AuthViewState =
  | { kind: "loading" }
  | { kind: "children" }
  | { kind: "redirect"; href: string; returnPath: string };

export default function DashboardAuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [view, setView] = useState<AuthViewState>({ kind: "loading" });

  /**
   * Increments on every effect subscription (incl. Strict Mode re-run). Async work must ignore stale runs.
   * Replaces a fragile `startedRef` (refs reset on remount, so they do not dedupe Strict Mode).
   */
  const authEffectGenerationRef = useRef(0);

  // Activity tracking — separate from gate; pathname changes must not re-run auth.
  useEffect(() => {
    const trackActivity = async () => {
      try {
        if (shouldSkipRecentDashboardActivity(pathname || "")) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;

        await dashboardApiFetch("/api/user/activity", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event: "page_view",
            properties: {
              path: pathname,
              page: formatPageName(pathname || ""),
              timestamp: new Date().toISOString(),
            },
          }),
        }).catch((err) => console.error("Error tracking activity:", err));
      } catch (error) {
        console.error("Error in trackActivity:", error);
      }
    };

    void trackActivity();
    const interval = setInterval(trackActivity, DASHBOARD_ACTIVITY_TRACK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pathname]);

  useEffect(() => {
    const generation = ++authEffectGenerationRef.current;
    let cancelled = false;

    const stale = () => cancelled || generation !== authEffectGenerationRef.current;

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
      let t: ReturnType<typeof setTimeout> | undefined;
      const safe = promise.catch(() => null as unknown as T);
      try {
        return await Promise.race([
          safe,
          new Promise<null>((resolve) => {
            t = setTimeout(() => resolve(null), ms);
          }),
        ]);
      } finally {
        if (t) clearTimeout(t);
      }
    };

    const resolveReturnPath = () =>
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search || ""}` || "/dashboard"
        : "/dashboard";

    const runGate = async () => {
      try {
        const session = await recoverDashboardSessionIfNeeded(supabase);
        if (stale()) return;

        if (session?.user) {
          const userId = session.user.id;
          const profileResult = await withTimeout(
            Promise.resolve(
              supabase
                .from("user_profiles")
                .select("role, is_admin")
                .eq("user_id", userId)
                .maybeSingle(),
            ) as Promise<{ data: { role?: string; is_admin?: boolean } | null }>,
            5000,
          );
          if (stale()) return;

          const profile = profileResult?.data ?? null;
          const userRole =
            session.user.user_metadata?.role ||
            session.user.app_metadata?.role ||
            profile?.role;
          const normalizedRole = String(userRole || "").toLowerCase();
          const isAdmin =
            profile?.is_admin === true ||
            ["admin", "superadmin", "administrator", "super_user"].includes(normalizedRole);
          const isManager = ["manager"].includes(normalizedRole);

          if (isAdmin || isManager) {
            if (!stale()) setView({ kind: "children" });
            return;
          }

          if (!stale()) setView({ kind: "children" });
          return;
        }

        /** Favorite guest: aceeași sursă ca pe /ro (localStorage), fără cont obligatoriu */
        const path = pathname || "";
        if (path === "/dashboard/favorites" || path.startsWith("/dashboard/favorites/")) {
          if (!stale()) setView({ kind: "children" });
          return;
        }

        const returnPath = resolveReturnPath();
        const href =
          "/auth?mode=login&redirect=" + encodeURIComponent(returnPath);
        if (!stale()) {
          setView({ kind: "redirect", href, returnPath });
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
        if (!stale()) {
          const path = pathname || "";
          if (path === "/dashboard/favorites" || path.startsWith("/dashboard/favorites/")) {
            setView({ kind: "children" });
            return;
          }
          const returnPath = resolveReturnPath();
          setView({
            kind: "redirect",
            href: "/auth?mode=login&redirect=" + encodeURIComponent(returnPath),
            returnPath,
          });
        }
      }
    };

    void runGate();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (view.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent dark:border-orange-400" />
          <p
            className="mt-4 text-gray-600 dark:text-gray-400"
            suppressHydrationWarning
          >
            {"Se verific\u0103 autentificarea..."}
          </p>
        </div>
      </div>
    );
  }

  if (view.kind === "redirect") {
    return (
      <DashboardLoginRedirect href={view.href} returnPath={view.returnPath} />
    );
  }

  return <>{children}</>;
}
