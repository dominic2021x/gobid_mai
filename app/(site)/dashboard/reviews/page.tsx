"use client";

import { useState, useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import UserReviews from "@/components/UserReviews";
import { supabase } from "@/lib/supabase";
import {
  hasDashboardLocalAuthEvidence,
  looksLikeSupabaseUserId,
} from "@/lib/auth/resolveAccountType";
import { getSupabaseSessionRobust } from "@/lib/auth/getSupabaseSessionRobust";

export default function ReviewsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [accountType, setAccountType] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("darkMode");
      if (saved !== null) setIsDarkMode(saved === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (isDarkMode) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (typeof window !== "undefined") localStorage.setItem("darkMode", String(next));
  };

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const robustSession = await getSupabaseSessionRobust(supabase);
        let user = robustSession?.user ?? null;
        let userId: string | null = user?.id ?? null;

        if (userId && !cancelled) {
          setCurrentUserId(userId);
          if (user) {
            setAccountType((user.user_metadata?.account_type as string) || null);
          }
        }

        if (!userId && typeof window !== "undefined") {
          const savedSupabaseUserId = localStorage.getItem("supabaseUserId");
          const savedUserInfo = localStorage.getItem("userInfo");
          if (savedSupabaseUserId && looksLikeSupabaseUserId(savedSupabaseUserId)) {
            userId = savedSupabaseUserId;
            if (!cancelled) setCurrentUserId(savedSupabaseUserId);
          } else if (savedUserInfo) {
            try {
              const parsed = JSON.parse(savedUserInfo) as Record<string, unknown>;
              const sid =
                (looksLikeSupabaseUserId(parsed.supabaseUserId) ? String(parsed.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(parsed.userId) ? String(parsed.userId) : null) ||
                (looksLikeSupabaseUserId(parsed.id) ? String(parsed.id) : null);
              if (sid) {
                userId = sid;
                if (!cancelled) setCurrentUserId(sid);
              }
              const at = localStorage.getItem("accountType");
              if (at && !cancelled) setAccountType(at);
            } catch (_) {}
          }
        }

        if (!userId) {
          if (typeof window !== "undefined") {
            const adminInfo = localStorage.getItem("adminInfo");
            if (adminInfo) {
              try {
                const a = JSON.parse(adminInfo);
                if (a.isAdmin || a.role === "manager") {
                  if (!cancelled) {
                    setCurrentUserId(null);
                  }
                  return;
                }
              } catch (_) {}
            }
            if (hasDashboardLocalAuthEvidence()) {
              /* Nu redirecționăm (evită bucla cu layout); retry la 1.2s + onAuthStateChange pot completa userId. */
            } else {
              window.location.href = "/auth?mode=login";
              return;
            }
          }
        }
      } catch (e) {
        console.error("[Reviews] loadUser error:", e);
        if (typeof window !== "undefined" && !hasDashboardLocalAuthEvidence()) {
          window.location.href = "/auth?mode=login";
        }
      } finally {
        if (!cancelled) {
          setIsPageLoading(false);
        }
      }
    };

    void loadUser();
    const retryTimer = setTimeout(() => {
      if (!cancelled) void loadUser();
    }, 1200);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user && !cancelled) void loadUser();
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const backHref = accountType === "liquidator" ? "/dashboard/lichidator" : accountType === "executor" ? "/dashboard/executor" : accountType === "company" || accountType === "business" ? "/dashboard/company" : "/dashboard";

  return (
    <div
      className={`min-h-screen transition-all duration-300 relative ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-50"
      } max-md:h-dvh max-md:flex max-md:flex-col max-md:overflow-hidden`}
    >
      <div className="relative z-[1] max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0">
        <UniversalHeader
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />

      <div className="max-md:flex-1 max-md:min-h-0 max-md:flex max-md:flex-col max-md:overflow-hidden">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto max-md:overflow-x-hidden">
        <div className="mb-6">
          <BackButton fallbackHref={backHref} label="Înapoi" className="shadow-md" />
        </div>

        {/* Page Header */}
        <div className="mb-6 md:mb-8">
          <div
            className={`backdrop-blur-lg rounded-2xl p-4 md:p-8 shadow-2xl border ${
              isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2 md:gap-4 min-w-0 max-md:overflow-hidden">
              <div className={`inline-flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-full shadow-2xl flex-shrink-0 bg-gradient-to-r from-amber-500 to-yellow-600`}>
                <i className="ri-star-smile-line text-white text-2xl md:text-3xl" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-2xl md:text-4xl font-bold max-md:text-lg max-md:truncate max-md:mb-0 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  Review-urile Mele
                </h2>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`backdrop-blur-lg rounded-2xl p-4 md:p-8 shadow-2xl border ${
            isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
          }`}
        >
          <h2
            className={`text-2xl font-bold mb-6 max-md:hidden ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Review-urile Mele
          </h2>

          {isPageLoading ? (
            <div
              className={`text-center py-8 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto border-blue-500" />
              <p className="mt-2">Se încarcă...</p>
            </div>
          ) : !currentUserId ? (
            <div
              className={`text-center py-8 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              <p>Trebuie să fii autentificat pentru a vedea review-urile.</p>
              <a
                href="/auth?mode=login"
                className={`inline-block mt-4 px-4 py-2 rounded-lg ${
                  isDarkMode
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                Autentificare
              </a>
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <UserReviews
                  userId={currentUserId}
                  reviewType="seller"
                  isDarkMode={isDarkMode}
                  showAddReview={false}
                />
              </div>
              <div>
                <UserReviews
                  userId={currentUserId}
                  reviewType="buyer"
                  isDarkMode={isDarkMode}
                  showAddReview={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
