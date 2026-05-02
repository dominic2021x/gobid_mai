"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useEffect, useState } from "react";
import {
  SearchIcon,
  CoinsIcon,
  SettingsIcon,
  CreditCardIcon,
  HeartIcon,
  SupportIcon,
} from "@/components/HeroIcons";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import DashboardLogoutDarkModeRow from "@/components/dashboard/DashboardLogoutDarkModeRow";
import { usePieseAutoTheme } from "./PieseAutoThemeContext";

export default function PieseAutoDashboard() {
  const { isDarkMode, setDarkMode } = usePieseAutoTheme();
  const [userInfo, setUserInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    avatar: "",
  });
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: "Basic",
  });

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) {
          const saved = localStorage.getItem("userInfo");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setUserInfo({
                firstName: parsed.firstName ?? "",
                lastName: parsed.lastName ?? "",
                email: parsed.email ?? "",
                phone: parsed.phone ?? "",
                avatar: parsed.avatar ?? "",
              });
            } catch (_) {}
          }
          return;
        }

        const accountType = user.user_metadata?.account_type;
        if (accountType === "piese_auto") {
          try {
            localStorage.setItem("accountType", "piese_auto");
          } catch {
            /* ignore */
          }
        }
        if (accountType !== "piese_auto") {
          const stored = localStorage.getItem("accountType");
          if (stored !== "piese_auto") {
            if (typeof window !== "undefined") window.location.href = "/dashboard";
            return;
          }
        }

        const [profileRes, tokensRes] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("first_name,last_name,phone,avatar_url")
            .eq("user_id", user.id)
            .maybeSingle(),
          dashboardApiFetch("/api/tokens", {
          }).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!isMounted) return;

        const profile = profileRes.data;
        setUserInfo({
          firstName: profile?.first_name ?? user.user_metadata?.first_name ?? "",
          lastName: profile?.last_name ?? user.user_metadata?.last_name ?? "",
          email: user.email ?? "",
          phone: profile?.phone ?? user.user_metadata?.phone ?? "",
          avatar: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? "",
        });

        if (tokensRes)
          setUserTokens({
            balance: tokensRes.balance ?? 0,
            totalEarned: tokensRes.totalEarned ?? tokensRes.total_earned ?? 0,
            totalSpent: tokensRes.totalSpent ?? tokensRes.total_spent ?? 0,
            level: tokensRes.level ?? tokensRes.package ?? "Basic",
          });
      } catch (err) {
        console.error("Error loading piese-auto dashboard:", err);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        ["userInfo", "userTokens", "supabaseUserId", "authRedirect", "accountType"].forEach((k) =>
          localStorage.removeItem(k)
        );
        window.location.href = "/";
      }
    } catch (_) {
      if (typeof window !== "undefined") window.location.href = "/";
    }
  };

  const basePath = "/dashboard/piese-auto";

  const avatarCircle = (
    <div
      className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full overflow-hidden flex items-center justify-center shadow-md ${
        isDarkMode ? "bg-gradient-to-r from-amber-600/80 to-orange-600/80" : "bg-gradient-to-r from-amber-500 to-orange-500"
      }`}
    >
      {userInfo.avatar ? (
        <img
          src={userInfo.avatar}
          alt={userInfo.firstName ? `Avatar ${userInfo.firstName}` : "Avatar"}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-base sm:text-lg font-semibold text-white">
          {(userInfo.firstName?.[0] ?? "P").toUpperCase()}
          {(userInfo.lastName?.[0] ?? "A").toUpperCase()}
        </span>
      )}
    </div>
  );

  return (
    <>
      <DashboardLogoutDarkModeRow
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setDarkMode(!isDarkMode)}
        onLogout={handleLogout}
        className="mb-5 md:mb-6"
        center={avatarCircle}
      />

      <header className="mb-5 md:mb-10 flex flex-col items-center gap-2 md:gap-3 text-center">
          <div>
            <h2 className={`text-xl md:text-3xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Bun venit, {userInfo.firstName || "dealer"} 👋
            </h2>
            <p className={`text-sm md:text-base mt-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
              Dashboard pentru dealeri de piese auto.
            </p>
          </div>
        </header>

        {/* Acțiuni rapide - tools pentru dealeri piese auto */}
        <section
          className={`${isDarkMode ? "bg-gray-800/80" : "bg-white"} rounded-xl p-4 md:p-6 shadow-lg mb-4 md:mb-8 backdrop-blur-sm border ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 mb-4 min-w-0">
            <h3
              className={`${isDarkMode ? "text-white" : "text-gray-900"} text-lg md:text-xl font-semibold min-w-0`}
            >
              Acțiuni rapide
            </h3>
            <div
              className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg shrink-0 ${
                isDarkMode ? "bg-amber-500/20 border border-amber-400/30" : "bg-amber-50 border border-amber-200"
              }`}
            >
              <i className={`ri-tools-fill text-sm sm:text-base ${isDarkMode ? "text-amber-400" : "text-amber-600"}`} />
              <span className={`text-[10px] sm:text-xs font-medium whitespace-nowrap ${isDarkMode ? "text-amber-200" : "text-amber-800"}`}>
                Dealer Piese Auto
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
            <Link
              href="/dashboard/my-products?context=piese-auto"
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <i className="ri-tools-line text-2xl md:text-3xl" />
              </div>
              <span className="text-xs md:text-sm font-medium">Produsele mele</span>
            </Link>
            <Link
              href={`${basePath}/my-products?tab=import`}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <i className="ri-file-excel-2-line text-2xl md:text-3xl" />
              </div>
              <span className="text-xs md:text-sm font-medium">Import CSV</span>
            </Link>
            <Link
              href="/ro?category=autovehicule&subcategory=piese-auto"
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <SearchIcon size="l" />
              </div>
              <span className="text-xs md:text-sm font-medium">Caută licitații piese</span>
            </Link>
            <Link
              href="/dashboard/favorites"
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <HeartIcon size="l" />
              </div>
              <span className="text-xs md:text-sm font-medium">Favorite</span>
            </Link>
            <Link
              href="/dashboard/ofertele_mele"
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <i className="ri-auction-line text-2xl md:text-3xl" />
              </div>
              <span className="text-xs md:text-sm font-medium">Ofertele mele</span>
            </Link>
            <Link
              href="/dashboard/tokens"
              className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <CoinsIcon size="l" />
              </div>
              <span className="text-xs md:text-sm font-medium">Token-uri ({userTokens.balance})</span>
            </Link>
            <Link
              href="/dashboard/piese-auto/settings"
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <SettingsIcon size="l" />
              </div>
              <span className="text-xs md:text-sm font-medium">Setări</span>
            </Link>
            <Link
              href="/dashboard/piese-auto/payments"
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <CreditCardIcon size="l" />
              </div>
              <span className="text-xs md:text-sm font-medium">Plăți</span>
            </Link>
            <Link
              href="/dashboard/piese-auto/support"
              className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center">
                <SupportIcon size="l" />
              </div>
              <span className="text-xs md:text-sm font-medium">Suport</span>
            </Link>
          </div>
        </section>
    </>
  );
}
