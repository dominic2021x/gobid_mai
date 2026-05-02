"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Hammer from "@/components/Hammer";
import {
  SearchIcon,
  CoinsIcon,
  SettingsIcon,
  CreditCardIcon,
  HeartIcon,
  SupportIcon
} from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardLogoutDarkModeRow from "@/components/dashboard/DashboardLogoutDarkModeRow";
import DashboardFooter from "@/components/DashboardFooter";
import { supabase } from "@/lib/supabase";

export default function DashboardCompany() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [userInfo, setUserInfo] = useState({
    firstName: "",
    companyName: "",
    email: "",
    avatar: ""
  });
  const [tokenBalance, setTokenBalance] = useState(0);
  const [userStats, setUserStats] = useState({
    totalBids: 0,
    wonAuctions: 0,
    activeBids: 0,
    watchlistCount: 0
  });
  const [activeTab, setActiveTab] = useState<"overview" | "active" | "won" | "history" | "my-auctions">("overview");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("darkMode");
    if (saved !== null) setIsDarkMode(saved === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("darkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) {
          if (typeof window !== "undefined") router.replace("/auth?mode=login");
          return;
        }

        const accountType = user.user_metadata?.account_type;
        if (accountType === "executor") {
          if (typeof window !== "undefined") window.location.href = "/dashboard/executor";
          return;
        }
        if (accountType !== "company" && accountType !== "business") {
          if (typeof window !== "undefined") window.location.href = "/dashboard";
          return;
        }

        const [{ data: profile }, watchlistRes, bidsRes] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("first_name, company_name, avatar_url")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.from("user_watchlist").select("product_id").eq("user_id", user.id),
          supabase.from("bids").select("product_id, is_winning").eq("user_id", user.id)
        ]);

        let tokens: { balance?: number } | null = null;
        try {
          const res = await dashboardApiFetch("/api/tokens", {
          });
          if (res.ok) tokens = await res.json();
        } catch (_) {}

        const watchlistRows = watchlistRes.data ?? [];
        const bidsData = bidsRes.data ?? [];

        const productIds = new Set<string>();
        bidsData.forEach((b: { product_id?: string }) => b.product_id && productIds.add(b.product_id));
        let productMap: Record<string, { status?: string }> = {};
        if (productIds.size > 0) {
          const { data: productsData } = await supabase
            .from("products")
            .select("id, status")
            .in("id", Array.from(productIds));
          productsData?.forEach((p: { id?: string; status?: string }) => {
            productMap[String(p.id)] = p;
          });
        }

        const uniqueBids = new Set(bidsData.map((b: { product_id?: string }) => b.product_id).filter(Boolean)).size;
        const wonCount = bidsData.filter((b: { is_winning?: boolean }) => b.is_winning === true).length;
        const activeCount = bidsData.filter((b: { product_id?: string }) => {
          const p = b.product_id ? productMap[b.product_id] : null;
          return p && (p.status === "active" || p.status === "reserved");
        }).length;

        if (!isMounted) return;

        setUserInfo({
          firstName: profile?.first_name || (user.user_metadata?.first_name as string) || (user.user_metadata?.company_name as string) || "",
          companyName: (profile?.company_name as string) || (user.user_metadata?.company_name as string) || "",
          email: user.email || "",
          avatar: (profile?.avatar_url as string) || ""
        });
        setTokenBalance(tokens?.balance ?? 0);
        setUserStats({
          totalBids: uniqueBids,
          wonAuctions: wonCount,
          activeBids: activeCount,
          watchlistCount: watchlistRows.length
        });
      } catch (e) {
        console.error("[DashboardCompany] load error:", e);
        if (typeof window !== "undefined") router.replace("/auth?mode=login");
      } finally {
        if (isMounted) setIsPageLoading(false);
      }
    };

    load();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router instabil în Next → buclă infinită
  }, []);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (typeof window !== "undefined") localStorage.setItem("darkMode", String(next));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      ["userInfo", "userTokens", "supabaseUserId", "authRedirect", "accountType"].forEach((k) =>
        localStorage.removeItem(k)
      );
      window.location.href = "/";
    }
  };

  const displayName = userInfo.companyName || userInfo.firstName || "utilizator";
  const overviewStats = [
    { label: "TOTAL LICITAȚII", value: userStats.totalBids, icon: "ri-auction-line" },
    { label: "LICITAȚII CÂȘTIGATE", value: userStats.wonAuctions, icon: "ri-trophy-line" },
    { label: "LICITAȚII ÎN CURS", value: userStats.activeBids, icon: "ri-time-line" },
    { label: "LICITAȚII ÎN WATCHLIST", value: userStats.watchlistCount, icon: "ri-bookmark-line" }
  ];

  const defaultCards = [
    { href: "/ro", label: "Caută licitații", icon: <SearchIcon size="l" />, light: "from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600", dark: "from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" },
    { href: "/dashboard/tokens", label: `Token-uri (${tokenBalance})`, icon: <CoinsIcon size="l" />, light: "from-yellow-500 via-yellow-500 to-yellow-500 hover:from-yellow-600 hover:via-yellow-600 hover:to-yellow-600", dark: "from-yellow-600 via-yellow-600 to-yellow-600 hover:from-yellow-700 hover:via-yellow-700 hover:to-yellow-700" },
    { href: "/dashboard/settings", label: "Setări", icon: <SettingsIcon size="l" />, light: "from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600", dark: "from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" },
    { href: "/dashboard/payments", label: "Plăți", icon: <CreditCardIcon size="l" />, light: "from-green-500 via-green-500 to-green-500 hover:from-green-600 hover:via-green-600 hover:to-green-600", dark: "from-green-600 via-green-600 to-green-600 hover:from-green-700 hover:via-green-700 hover:to-green-700" },
    { href: "/dashboard/favorites", label: "Favorite", icon: <HeartIcon size="l" />, light: "from-red-500 via-red-500 to-red-500 hover:from-red-600 hover:via-red-600 hover:to-red-600", dark: "from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700" },
    { href: "/dashboard/ofertele_mele", label: "Ofertele mele", icon: <i className="ri-auction-line text-3xl" />, light: "from-cyan-500 via-cyan-500 to-cyan-500 hover:from-cyan-600 hover:via-cyan-600 hover:to-cyan-600", dark: "from-cyan-600 via-cyan-600 to-cyan-600 hover:from-cyan-700 hover:via-cyan-700 hover:to-cyan-700" },
    { href: "/dashboard/support", label: "Suport", icon: <SupportIcon size="l" />, light: "from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700", dark: "from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700" },
    { href: "/dashboard/reviews", label: "Review-uri", icon: <i className="ri-star-line text-3xl" />, light: "from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600", dark: "from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" }
  ];

  const cardClass = "p-4 rounded-xl text-center text-white shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group";
  const shine = <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />;

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700" : "bg-gradient-to-br from-gray-50 via-white to-gray-50"
    }`}>
      {/* Page Loading - Removed spinner */}

      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode}/>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className={`relative w-80 h-full ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-xl`}>
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Meniu</h2>
                <button onClick={() => setIsMobileMenuOpen(false)} className={`p-2 rounded-lg ${isDarkMode ? "hover:bg-gray-700 text-white" : "hover:bg-gray-100 text-gray-900"}`}>×</button>
              </div>
              <nav className="flex-1 p-4 space-y-2 text-sm">
                {[
                  { href: "/", label: "Homepage", icon: "🏠" },
                  { href: "/ro", label: "Licitatii", icon: "🔨" },
                  { href: "/dashboard/favorites", label: "Favorite", icon: "❤️" },
                  { href: "/dashboard/ofertele_mele", label: "Ofertele mele", icon: "💬" },
                  { href: "/dashboard/settings", label: "Setări", icon: "⚙️" },
                  { href: "/dashboard/tokens", label: "Token-uri", icon: "💰" },
                  { href: "/dashboard/payments", label: "Plăți", icon: "💳" },
                  { href: "/dashboard/support", label: "Suport", icon: "🎫" },
                  { href: "/dashboard/reviews", label: "Review-uri", icon: "⭐" }
                ].map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"}`}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>
              <div className="p-4 border-t border-gray-700">
                <button onClick={handleLogout} className={`w-full flex items-center justify-center space-x-2 p-3 rounded-lg transition-colors ${isDarkMode ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-100 hover:bg-red-200 text-red-600"}`}>
                  <span>🚪</span>
                  <span>Ieșire</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardLogoutDarkModeRow
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          onLogout={handleLogout}
          className="mb-6"
        />
        <header className="mb-8 flex flex-col items-center gap-4 text-center relative">
          <div className={`w-16 h-16 rounded-full shadow-2xl overflow-hidden flex items-center justify-center ${
            isDarkMode ? "bg-gradient-to-r from-gray-600 to-gray-500" : "bg-gradient-to-r from-gray-300 to-gray-400"
          }`}>
            {userInfo.avatar ? (
              <img src={userInfo.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className={`text-xl font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {(userInfo.companyName?.[0] || userInfo.firstName?.[0] || "F").toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className={`text-3xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Bun venit, {displayName} 👋
            </h2>
            <p className={isDarkMode ? "text-gray-300" : "text-gray-600"}>
              Panou pentru cont de firmă.
            </p>
          </div>
        </header>

        <section className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-6 shadow-lg mb-8`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-xl font-semibold`}>Acțiuni rapide</h3>
            <button
              onClick={() => router.push("/dashboard/customize-buttons")}
              className={`w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:scale-110 ${
                isDarkMode ? "bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white" : "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              }`}
              title="Personalizează butoanele"
            >
              <i className="ri-add-line text-xl" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            {defaultCards.map((c) => (
              <a
                key={c.href}
                href={c.href}
                className={`bg-gradient-to-r ${isDarkMode ? c.dark : c.light} ${cardClass}`}
              >
                <div className="text-2xl mb-2 flex justify-center relative z-10">{c.icon}</div>
                <span className="text-sm font-medium relative z-10">{c.label}</span>
                {shine}
              </a>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <div className={`rounded-2xl p-2 backdrop-blur-lg flex flex-wrap gap-2 ${isDarkMode ? "bg-white/10 border border-white/20" : "bg-gray-100 border border-gray-200"}`}>
            {[
              { id: "overview", label: "Prezentare" },
              { id: "active", label: "Active" },
              { id: "won", label: "Câștigate" },
              { id: "history", label: "Istoric" },
              { id: "my-auctions", label: "Licitații mele" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? isDarkMode ? "bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg" : "bg-gradient-to-r from-gray-700 to-gray-600 text-white shadow-lg"
                    : isDarkMode ? "text-gray-200 hover:text-white hover:bg-white/10" : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {overviewStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl p-5 shadow-2xl backdrop-blur-lg ${
                  isDarkMode ? "bg-white/10 border border-white/20 text-white" : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs uppercase tracking-wide ${isDarkMode ? "text-gray-200" : "text-gray-600"}`}>{stat.label}</p>
                    <p className="text-3xl font-bold mt-2">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-white/20" : "bg-gray-100"}`}>
                    <i className={`${stat.icon} text-2xl`} />
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab !== "overview" && (
          <section className={`rounded-2xl p-6 ${isDarkMode ? "bg-white/10 border border-white/20" : "bg-white border border-gray-200"}`}>
            <p className={isDarkMode ? "text-gray-300" : "text-gray-600"}>
              {activeTab === "active" && "Licitațiile active la care participi."}
              {activeTab === "won" && "Licitațiile câștigate."}
              {activeTab === "history" && "Istoricul ofertelor."}
              {activeTab === "my-auctions" && "Ofertele tale. Pentru detalii complete, folosește „Ofertele mele” din acțiunile rapide."}
            </p>
            <a
              href="/dashboard/ofertele_mele"
              className={`inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg ${isDarkMode ? "bg-white/20 hover:bg-white/30 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-900"}`}
            >
              <i className="ri-auction-line" />
              Ofertele mele
            </a>
          </section>
        )}
      </div>

      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
