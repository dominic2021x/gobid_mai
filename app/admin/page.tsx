"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ActivityRow = { user_id: string; event: string; created_at: string; properties?: { path?: string; page?: string; ip?: string; city?: string; regionName?: string; country?: string } | null };
type VisitRow = { user_id: string; created_at: string; properties?: { ip?: string; city?: string; regionName?: string; country?: string } | null };
type ActivityByPageRow = { pageTitle: string; count: number; lastVisit: string; pathHint: string; visits: VisitRow[] };
type SupabaseListResult<T> = { data: T[] | null; error: { message?: string } | null };

const ADMIN_DASHBOARD_PAGE_SIZE = 1000;

async function fetchAllSupabaseRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<SupabaseListResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + ADMIN_DASHBOARD_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);

    if (error) {
      throw error;
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < ADMIN_DASHBOARD_PAGE_SIZE) {
      return rows;
    }

    from += ADMIN_DASHBOARD_PAGE_SIZE;
  }
}

// Titlu pagină din activitate (properties.page sau din path)
function getActivityPageTitle(a: { event: string; properties?: { path?: string; page?: string } | null }): string {
  const p = a.properties;
  if (p?.page && typeof p.page === "string") return p.page;
  const path = p?.path && typeof p.path === "string" ? p.path : "";
  if (!path && a.event === "page_view") return "Vizualizare pagină";
  if (!path) return a.event;
  // Map path → titlu (aliniat cu formatPageName + rute dashboard)
  if (path === "/") return "Acasă";
  if (path.startsWith("/admin")) return "Admin Panel";
  if (path === "/dashboard" || path === "/dashboard/") return "Dashboard";
  if (path.startsWith("/dashboard/executor")) return "Dashboard Executor";
  if (path.startsWith("/dashboard/ofertele_mele")) return "Ofertele mele";
  if (path.startsWith("/dashboard/my-products")) return "Produsele mele";
  if (path.startsWith("/dashboard/assistant")) return "Asistent";
  if (path.startsWith("/dashboard")) return "Dashboard";
  if (path.startsWith("/licitatii-publice")) return "Licitații publice";
  if (path.startsWith("/live_bid")) return "Licitație live";
  if (path.includes("executari")) return "Executări";
  if (path.startsWith("/auth")) return "Autentificare";
  if (path.startsWith("/search")) return "Căutare";
  if (path.startsWith("/ro")) return "Pagina produs";
  // Fallback: path fără /, cu spații
  return path.replace(/^\//, "").replace(/-/g, " ").replace(/\//g, " › ") || a.event;
}

// Culori metrici: verde = bine (top), galben = mijloc, roșu = slab (bottom). Ordinea e pe valori numerice.
function getMetricColor(value: number, allValues: number[], inverted = false): "green" | "yellow" | "red" {
  if (allValues.length === 0) return "yellow";
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.indexOf(value);
  const pct = sorted.length <= 1 ? 1 : rank / (sorted.length - 1);
  const tier = inverted ? (1 - pct) : pct;
  if (tier >= 2 / 3) return "green";
  if (tier >= 1 / 3) return "yellow";
  return "red";
}
const metricColorClass = {
  green: "bg-emerald-100 text-emerald-800 font-medium",
  yellow: "bg-amber-100 text-amber-800 font-medium",
  red: "bg-red-100 text-red-800 font-medium",
};

// IP afișat „normal”: localhost → 127.0.0.1 (local), altfel IP-ul ca atare
function formatIpDisplay(ip: string | undefined): string {
  if (!ip) return "—";
  const normalized = ip.replace(/^::ffff:/i, "").trim();
  if (normalized === "127.0.0.1" || normalized === "::1" || ip === "::1") return "127.0.0.1 (local)";
  return ip;
}
function isLocalIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const n = ip.replace(/^::ffff:/i, "").trim();
  return n === "127.0.0.1" || n === "::1";
}

// Fundal alb enterprise – grid discret + orbe pastel
function LightGridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50/80 to-blue-50/30" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50/50 rounded-full blur-[80px]" />
      <svg className="absolute inset-0 w-full h-full opacity-[0.4]" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id="admin-light-dot" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.5" fill="rgb(99, 102, 241)" fillOpacity="0.2" />
          </pattern>
          <linearGradient id="admin-light-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#admin-light-dot)" />
        {[20, 50, 80].map((pct) => (
          <line key={`h-${pct}`} x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`} stroke="url(#admin-light-line)" strokeWidth="0.5" />
        ))}
      </svg>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [message, setMessage] = useState({ type: "", text: "" });
  const [userProductsStats, setUserProductsStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [userStats, setUserStats] = useState({
    total: 0,
    totalLive: 0,
    private: 0,
    privateLive: 0,
    business: 0,
    businessLive: 0,
    executor: 0,
    executorLive: 0,
  });
  const [userAnalytics, setUserAnalytics] = useState({
    active1h: 0,
    active24h: 0,
    active7d: 0,
    newSignups7d: 0,
    newSignups30d: 0,
  });
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [analyticsUpdatedAt, setAnalyticsUpdatedAt] = useState<Date | null>(null);
  const [visitsModal, setVisitsModal] = useState<ActivityByPageRow | null>(null);
  const [visitsModalProfiles, setVisitsModalProfiles] = useState<Record<string, { email?: string; first_name?: string; last_name?: string }>>({});
  const [activityProfiles, setActivityProfiles] = useState<Record<string, { city?: string; location?: string }>>({});

  const loadUserProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const buildCountQuery = (approvalStatus?: "pending" | "approved" | "rejected") => {
        let query = supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .not("user_id", "is", null)
          .neq("status", "deleted");

        if (approvalStatus) {
          query = query.eq("approval_status", approvalStatus);
        }

        return query;
      };

      const [totalRes, pendingRes, approvedRes, rejectedRes] = await Promise.all([
        buildCountQuery(),
        buildCountQuery("pending"),
        buildCountQuery("approved"),
        buildCountQuery("rejected"),
      ]);

      const firstError = totalRes.error || pendingRes.error || approvedRes.error || rejectedRes.error;
      if (firstError) {
        console.error("Error loading user products:", firstError);
        return;
      }

      setUserProductsStats({
        total: totalRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
      });
    } catch (error) {
      console.error("Error loading user products:", error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadUserProducts();
  }, [loadUserProducts]);

  const loadUserStats = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const now = Date.now();
      const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        totalUsersRes,
        privateUsersRes,
        businessUsersRes,
        executorUsersRes,
        profilesForLive,
        activity1hRows,
        activity24hRows,
        activity7dRows,
        signups7dRes,
        signups30dRes,
        recentActivityRes,
      ] = await Promise.all([
        supabase.from("user_profiles").select("user_id", { count: "exact", head: true }).eq("is_admin", false),
        supabase.from("user_profiles").select("user_id", { count: "exact", head: true }).eq("is_admin", false).eq("account_type", "private"),
        supabase.from("user_profiles").select("user_id", { count: "exact", head: true }).eq("is_admin", false).eq("account_type", "business"),
        supabase.from("user_profiles").select("user_id", { count: "exact", head: true }).eq("is_admin", false).eq("account_type", "executor"),
        fetchAllSupabaseRows<{ account_type: string; user_id: string }>((from, to) =>
          supabase
            .from("user_profiles")
            .select("account_type, user_id")
            .eq("is_admin", false)
            .order("user_id", { ascending: true })
            .range(from, to)
        ),
        fetchAllSupabaseRows<{ user_id: string }>((from, to) =>
          supabase
            .from("user_activity_logs")
            .select("user_id")
            .gte("created_at", oneHourAgo)
            .order("created_at", { ascending: true })
            .range(from, to)
        ),
        fetchAllSupabaseRows<{ user_id: string }>((from, to) =>
          supabase
            .from("user_activity_logs")
            .select("user_id")
            .gte("created_at", oneDayAgo)
            .order("created_at", { ascending: true })
            .range(from, to)
        ),
        fetchAllSupabaseRows<{ user_id: string }>((from, to) =>
          supabase
            .from("user_activity_logs")
            .select("user_id")
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: true })
            .range(from, to)
        ),
        supabase
          .from("user_profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("is_admin", false)
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("user_profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("is_admin", false)
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("user_activity_logs")
          .select("user_id, event, created_at, properties")
          .eq("event", "page_view")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const firstStatsError =
        totalUsersRes.error ||
        privateUsersRes.error ||
        businessUsersRes.error ||
        executorUsersRes.error;

      if (firstStatsError) {
        console.error("Error loading user stats:", firstStatsError);
        return;
      }

      const active1hIds = new Set(activity1hRows.map((a) => a.user_id));
      const active24hIds = new Set(activity24hRows.map((a) => a.user_id));
      const active7dIds = new Set(activity7dRows.map((a) => a.user_id));

      const privateProfilesForLive = profilesForLive.filter((p: { account_type: string }) => p.account_type === "private");
      const businessProfilesForLive = profilesForLive.filter((p: { account_type: string }) => p.account_type === "business");
      const executorProfilesForLive = profilesForLive.filter((p: { account_type: string }) => p.account_type === "executor");

      setUserStats({
        total: totalUsersRes.count ?? 0,
        totalLive: profilesForLive.filter((p: { user_id: string }) => active1hIds.has(p.user_id)).length,
        private: privateUsersRes.count ?? 0,
        privateLive: privateProfilesForLive.filter((p: { user_id: string }) => active1hIds.has(p.user_id)).length,
        business: businessUsersRes.count ?? 0,
        businessLive: businessProfilesForLive.filter((p: { user_id: string }) => active1hIds.has(p.user_id)).length,
        executor: executorUsersRes.count ?? 0,
        executorLive: executorProfilesForLive.filter((p: { user_id: string }) => active1hIds.has(p.user_id)).length,
      });

      const signups7d = typeof signups7dRes.count === "number" ? signups7dRes.count : 0;
      const signups30d = typeof signups30dRes.count === "number" ? signups30dRes.count : 0;

      setUserAnalytics({
        active1h: active1hIds.size,
        active24h: active24hIds.size,
        active7d: active7dIds.size,
        newSignups7d: signups7d,
        newSignups30d: signups30d,
      });
      setRecentActivity((recentActivityRes.data || []) as ActivityRow[]);
      setAnalyticsUpdatedAt(new Date());
    } catch (error) {
      console.error("Error loading user stats:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUserStats();
    const interval = window.setInterval(() => {
      void loadUserStats();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadUserStats]);

  // Încarcă city/location pentru toți user_id din activitate (pentru % locație)
  useEffect(() => {
    if (!recentActivity.length) {
      setActivityProfiles({});
      return;
    }
    const userIds = [...new Set(recentActivity.map((a) => a.user_id))];
    supabase
      .from("user_profiles")
      .select("user_id, city, location")
      .in("user_id", userIds)
      .then(
        ({
          data,
        }: {
          data: { user_id: string; city?: string; location?: string }[] | null;
        }) => {
          const byId: Record<string, { city?: string; location?: string }> = {};
          (data || []).forEach((p: { user_id: string; city?: string; location?: string }) => {
            byId[p.user_id] = { city: p.city, location: p.location };
          });
          setActivityProfiles(byId);
        },
        () => setActivityProfiles({})
      );
  }, [recentActivity]);

  // Grupare activitate pe pagină: o singură linie per pagină + număr vizitări + lista vizite (user_id, created_at)
  const activityByPage = useMemo((): ActivityByPageRow[] => {
    const map = new Map<string, { count: number; lastVisit: string; pathHint: string; visits: VisitRow[] }>();
    for (const a of recentActivity) {
      const title = getActivityPageTitle(a);
      const pathHint = a.properties?.path ?? a.event;
      const existing = map.get(title);
      const visit: VisitRow = { user_id: a.user_id, created_at: a.created_at, properties: a.properties ? { ip: a.properties.ip, city: a.properties.city, regionName: a.properties.regionName, country: a.properties.country } : undefined };
      if (existing) {
        existing.count += 1;
        existing.visits.push(visit);
        if (a.created_at > existing.lastVisit) {
          existing.lastVisit = a.created_at;
          existing.pathHint = pathHint;
        }
      } else {
        map.set(title, { count: 1, lastVisit: a.created_at, pathHint, visits: [visit] });
      }
    }
    return Array.from(map.entries())
      .map(([pageTitle, data]) => ({ pageTitle, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  }, [recentActivity]);

  // La deschidere modal vizitări, încarcă profilele utilizatorilor
  useEffect(() => {
    if (!visitsModal?.visits?.length) {
      setVisitsModalProfiles({});
      return;
    }
    const userIds = [...new Set(visitsModal.visits.map((v) => v.user_id))];
    supabase
      .from("user_profiles")
      .select("user_id, email, first_name, last_name")
      .in("user_id", userIds)
      .then(
        ({
          data,
        }: {
          data:
            | {
                user_id: string;
                email?: string;
                first_name?: string;
                last_name?: string;
              }[]
            | null;
        }) => {
          const byId: Record<string, { email?: string; first_name?: string; last_name?: string }> = {};
          (data || []).forEach((p: { user_id: string; email?: string; first_name?: string; last_name?: string }) => {
            byId[p.user_id] = {
              email: p.email,
              first_name: p.first_name,
              last_name: p.last_name,
            };
          });
          setVisitsModalProfiles(byId);
        },
        () => setVisitsModalProfiles({})
      );
  }, [visitsModal?.pageTitle]);

  return (
    <div className="min-h-screen relative bg-gray-50 text-gray-900">
      <LightGridBackground />

      {message.text && (
        <div
          className={`fixed top-16 right-4 z-[100] px-4 py-2 rounded-lg shadow-lg border text-sm transition-all duration-300 ${
            message.type === "success"
              ? "bg-emerald-500 text-white border-emerald-400"
              : "bg-rose-500 text-white border-rose-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Bară sus – alb, compact */}
      <div className="relative z-10 border-b border-gray-200 bg-white/90 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Panou Control</span>
            <span className="w-0.5 h-0.5 rounded-full bg-gray-400" />
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            {analyticsUpdatedAt && (
              <>
                <span className="w-0.5 h-0.5 rounded-full bg-gray-400" />
                <span className="text-gray-500 text-[10px]">
                  {analyticsUpdatedAt.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span>{userStats.total} utilizatori</span>
            <span>{userProductsStats.total} produse</span>
          </div>
        </div>
      </div>

      {/* Hero – compact */}
      <section className="relative z-10 pt-4 pb-5 px-4 lg:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-blue-600 font-semibold tracking-wider uppercase text-[10px] mb-1">Control Center</p>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                <span className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 bg-clip-text text-transparent">
                  Admin
                </span>{" "}
                <span className="text-gray-800">Dashboard</span>
              </h1>
              <p className="mt-1.5 text-gray-600 text-sm max-w-md">
                Monitorizează produse, utilizatori și cache în timp real.
              </p>
              <div className="mt-2 flex items-center gap-2 text-gray-500 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
                <span className="text-gray-300">·</span>
                <span>
                  {new Date().toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={() => router.push("/admin/cache")}
                className="group flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 shadow shadow-gray-200/80 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow group-hover:scale-105 transition-transform">
                  <i className="ri-database-2-line text-lg text-white" />
                </div>
                <div className="text-left">
                  <span className="block font-semibold text-gray-900 text-sm">Cache Control</span>
                  <span className="text-xs text-gray-500">Revalidare pagini & feed</span>
                </div>
                <i className="ri-arrow-right-s-line text-lg text-gray-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats: Produse utilizatori – carduri compacte */}
      <section className="relative z-10 px-4 lg:px-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-blue-500" />
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Produse utilizatori</h2>
            </div>
            <button
              onClick={loadUserProducts}
              disabled={isLoadingProducts}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium disabled:opacity-50 transition-all shadow-sm"
            >
              <i className={`ri-refresh-line text-sm ${isLoadingProducts ? "animate-spin" : ""}`} />
              Actualizează
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total", value: userProductsStats.total, href: "/admin/user-products", icon: "ri-stack-line", gradient: "from-slate-500 to-slate-600" },
              { label: "În așteptare", value: userProductsStats.pending, href: "/admin/user-products?filter=pending", icon: "ri-time-line", gradient: "from-amber-500 to-orange-600" },
              { label: "Aprobate", value: userProductsStats.approved, href: "/admin/user-products?filter=approved", icon: "ri-checkbox-circle-line", gradient: "from-emerald-500 to-teal-600" },
              { label: "Respinse", value: userProductsStats.rejected, href: "/admin/user-products?filter=rejected", icon: "ri-close-circle-line", gradient: "from-rose-500 to-red-600" },
            ].map((card) => (
              <button
                key={card.label}
                onClick={() => router.push(card.href)}
                className="group relative p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow shadow-sm text-left transition-all duration-300"
              >
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow mb-3`}>
                  <i className={`${card.icon} text-base text-white`} />
                </div>
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-0.5">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{card.value}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-gray-500 text-xs group-hover:text-blue-600 transition-colors">
                  Vezi <i className="ri-arrow-right-line text-xs group-hover:translate-x-0.5 transition-transform" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats: Utilizatori – carduri compacte */}
      <section className="relative z-10 px-4 lg:px-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-cyan-500" />
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Utilizatori</h2>
            </div>
            <button
              onClick={loadUserStats}
              disabled={isLoadingUsers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium disabled:opacity-50 transition-all shadow-sm"
            >
              <i className={`ri-refresh-line text-sm ${isLoadingUsers ? "animate-spin" : ""}`} />
              Actualizează
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total", total: userStats.total, live: userStats.totalLive, icon: "ri-group-line", gradient: "from-blue-500 to-blue-600" },
              { label: "Privați", total: userStats.private, live: userStats.privateLive, icon: "ri-user-line", gradient: "from-slate-500 to-slate-600" },
              { label: "Business", total: userStats.business, live: userStats.businessLive, icon: "ri-building-line", gradient: "from-amber-500 to-orange-600" },
              { label: "Executori", total: userStats.executor, live: userStats.executorLive, icon: "ri-scale-3-line", gradient: "from-cyan-500 to-teal-600" },
            ].map((card) => (
              <button
                key={card.label}
                onClick={() => router.push("/admin/users")}
                className="group relative p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow shadow-sm text-left transition-all duration-300"
              >
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow mb-3`}>
                  <i className={`${card.icon} text-base text-white`} />
                </div>
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{card.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xl font-bold tabular-nums">{card.live}</span>
                    <span className="text-xs text-gray-500">live</span>
                  </span>
                  <span className="text-gray-400 text-xs">/</span>
                  <span className="text-base font-semibold text-gray-900 tabular-nums">{card.total}</span>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-gray-500 text-xs group-hover:text-blue-600 transition-colors">
                  Vezi <i className="ri-arrow-right-line text-xs group-hover:translate-x-0.5 transition-transform" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Analiză detaliată utilizatori – compact */}
      <section className="relative z-10 px-4 lg:px-6 pb-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-cyan-500" />
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Analiză utilizatori</h2>
            </div>
            <button
              onClick={loadUserStats}
              disabled={isLoadingUsers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium disabled:opacity-50 transition-all shadow-sm"
            >
              <i className={`ri-refresh-line text-sm ${isLoadingUsers ? "animate-spin" : ""}`} />
              Actualizează
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow shadow-gray-200/50">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200">
              {[
                { label: "Activi 1h", value: userAnalytics.active1h, icon: "ri-time-line", color: "text-emerald-600" },
                { label: "Activi 24h", value: userAnalytics.active24h, icon: "ri-24-hours-line", color: "text-cyan-600" },
                { label: "Activi 7 zile", value: userAnalytics.active7d, icon: "ri-calendar-week-line", color: "text-blue-600" },
                { label: "Înreg. 7 zile", value: userAnalytics.newSignups7d, icon: "ri-user-add-line", color: "text-amber-600" },
                { label: "Înreg. 30 zile", value: userAnalytics.newSignups30d, icon: "ri-user-search-line", color: "text-blue-600" },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white p-3">
                  <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">{kpi.label}</p>
                  <div className="flex items-center gap-1.5">
                    <i className={`${kpi.icon} text-sm ${kpi.color}`} />
                    <span className="text-lg font-bold text-gray-900 tabular-nums">{kpi.value}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-200">
              <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Distribuție tip cont</p>
              <div className="space-y-2">
                {[
                  { label: "Privați", count: userStats.private, total: userStats.total, bar: "bg-slate-500", labelColor: "text-gray-700" },
                  { label: "Business", count: userStats.business, total: userStats.total, bar: "bg-amber-500", labelColor: "text-amber-700" },
                  { label: "Executori", count: userStats.executor, total: userStats.total, bar: "bg-cyan-500", labelColor: "text-cyan-700" },
                ].map((row) => {
                  const pct = userStats.total > 0 ? Math.round((row.count / userStats.total) * 100) : 0;
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className={`text-xs font-medium w-16 ${row.labelColor}`}>{row.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div className={`h-full rounded-full ${row.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 tabular-nums w-14 text-right">
                        {row.count} <span className="text-gray-400">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Activitate recentă (pagini unice)</p>
                <span className="text-[10px] text-gray-400 flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded bg-emerald-100 text-emerald-800 text-center leading-4 font-medium">↑</span> bine
                  <span className="inline-block w-4 h-4 rounded bg-amber-100 text-amber-800 text-center leading-4 font-medium">·</span> mijloc
                  <span className="inline-block w-4 h-4 rounded bg-red-100 text-red-800 text-center leading-4 font-medium">↓</span> slab
                </span>
              </div>
              {activityByPage.length === 0 ? (
                <p className="text-gray-500 text-xs">Nu există vizite recente.</p>
              ) : (
                <div className="rounded-lg border border-gray-200 overflow-x-auto overflow-y-hidden">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gray-600 font-medium">Pagină</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium w-16">Vizitări</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium w-20" title="Câți utilizatori distincți">Utilizatori unici</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium w-14" title="Procent din total">% total</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium w-16" title="Vizite per user">Medie/user</th>
                        <th className="text-left py-2 px-3 text-gray-600 font-medium min-w-[140px]" title="Locație după IP (oraș, țară) – procent vizite">Top locații (după IP %)</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium w-22">Prima vizitare</th>
                        <th className="text-right py-2 px-3 text-gray-600 font-medium w-22">Ultima vizitare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalVisits = activityByPage.reduce((s, r) => s + r.count, 0);
                        const counts = activityByPage.map((r) => r.count);
                        const uniques = activityByPage.map((r) => new Set(r.visits.map((v) => v.user_id)).size);
                        const pcts = activityByPage.map((r) => (totalVisits > 0 ? (r.count / totalVisits) * 100 : 0));
                        const avgs = activityByPage.map((r) => {
                          const u = new Set(r.visits.map((v) => v.user_id)).size;
                          return u > 0 ? r.count / u : 0;
                        });
                        return activityByPage.map((row, idx) => {
                          const uniqueUsers = uniques[idx];
                          const pctNum = pcts[idx];
                          const avgNum = avgs[idx];
                          const pct = totalVisits > 0 ? pctNum.toFixed(1) : "0";
                          const avgPerUser = uniqueUsers > 0 ? avgNum.toFixed(1) : "—";
                          const firstVisit = row.visits.length > 0
                            ? row.visits.reduce((min, v) => (v.created_at < min ? v.created_at : min), row.visits[0].created_at)
                            : null;
                          const fmt = (d: string) =>
                            new Date(d).toLocaleString("ro-RO", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            });
                          const cityCounts = new Map<string, number>();
                          row.visits.forEach((v) => {
                            const p = v.properties;
                            const fromIp = p?.city && p?.country
                              ? `${p.city}, ${p.country}`
                              : (p?.city || p?.country || (p?.regionName ? p.regionName : null));
                            const fromProfile = activityProfiles[v.user_id];
                            const profileLoc = (fromProfile?.city || fromProfile?.location || "").trim();
                            const label = (fromIp || profileLoc || (p?.ip ? `IP ${p.ip}` : "Necunoscut")) || "Necunoscut";
                            cityCounts.set(label, (cityCounts.get(label) || 0) + 1);
                          });
                          const topLocations = Array.from(cityCounts.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([name, n]) => `${name} ${((n / row.count) * 100).toFixed(0)}%`)
                            .join(", ") || "—";
                          const colorV = getMetricColor(row.count, counts);
                          const colorU = getMetricColor(uniqueUsers, uniques);
                          const colorPct = getMetricColor(pctNum, pcts);
                          const colorAvg = getMetricColor(avgNum, avgs);
                          return (
                            <tr key={row.pageTitle} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="py-1.5 px-3 text-gray-800" title={row.pathHint}>
                                <Link
                                  href={row.pathHint.startsWith("/") ? row.pathHint : `/${row.pathHint}`}
                                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {row.pageTitle}
                                </Link>
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setVisitsModal(row)}
                                  className={`inline-block tabular-nums rounded px-1.5 py-0.5 ${metricColorClass[colorV]} hover:opacity-90`}
                                  title="Vezi utilizatorii care au deschis pagina"
                                >
                                  {row.count}
                                </button>
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <span className={`inline-block tabular-nums rounded px-1.5 py-0.5 ${metricColorClass[colorU]}`}>
                                  {uniqueUsers}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <span className={`inline-block tabular-nums rounded px-1.5 py-0.5 ${metricColorClass[colorPct]}`}>
                                  {pct}%
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-right" title="Vizite per utilizator unic">
                                <span className={`inline-block tabular-nums rounded px-1.5 py-0.5 ${metricColorClass[colorAvg]}`}>
                                  {avgPerUser}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-gray-600 text-[10px] max-w-[180px] truncate" title={topLocations}>
                                {topLocations}
                              </td>
                              <td className="py-1.5 px-3 text-right text-gray-500 tabular-nums">
                                {firstVisit ? fmt(firstVisit) : "—"}
                              </td>
                              <td className="py-1.5 px-3 text-right text-gray-500 tabular-nums">
                                {fmt(row.lastVisit)}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Acces rapid – compact */}
      <section className="relative z-10 px-4 lg:px-6 pb-6">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow shadow-gray-200/50">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-3">Acces rapid</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "AI Search", href: "/admin/ai-search", icon: "ri-search-line" },
                { label: "AI Drive", href: "/admin/ai-drive", icon: "ri-brain-line" },
                { label: "Filters Lab", href: "/admin/filters-lab", icon: "ri-filter-3-line" },
                { label: "Healthchecks", href: "/admin/healthchecks", icon: "ri-heart-pulse-line" },
                { label: "Statistici", href: "/admin/statistici", icon: "ri-bar-chart-line" },
                { label: "Setări", href: "/admin/settings", icon: "ri-settings-3-line" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 hover:text-blue-700 text-xs font-medium transition-all"
                >
                  <i className={`${link.icon} text-sm`} />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Modal: utilizatori care au deschis URL-ul */}
      {visitsModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setVisitsModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="visits-modal-title"
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 id="visits-modal-title" className="text-lg font-semibold text-gray-900">
                Utilizatori care au deschis pagina
              </h3>
              <button
                type="button"
                onClick={() => setVisitsModal(null)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                aria-label="Închide"
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>
            <div className="p-4 border-b border-gray-100 space-y-1">
              <p className="text-sm font-medium text-gray-800">{visitsModal.pageTitle}</p>
              <p className="text-xs text-gray-500 font-mono" title="URL">
                {visitsModal.pathHint.startsWith("/") ? visitsModal.pathHint : `/${visitsModal.pathHint}`}
              </p>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 px-3 text-gray-600 font-medium">Utilizator</th>
                    <th className="py-2 px-3 text-gray-600 font-medium">IP</th>
                    <th className="py-2 px-3 text-gray-600 font-medium">Locație</th>
                    <th className="py-2 px-3 text-right text-gray-600 font-medium w-24">Accesări</th>
                    <th className="py-2 px-3 text-right text-gray-600 font-medium">Ultima vizitare</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const byUser = new Map<string, { count: number; lastVisit: string; ip?: string; city?: string; country?: string }>();
                    for (const v of visitsModal.visits) {
                      const ex = byUser.get(v.user_id);
                      if (ex) {
                        ex.count += 1;
                        if (v.created_at > ex.lastVisit) {
                          ex.lastVisit = v.created_at;
                          ex.ip = v.properties?.ip ?? ex.ip;
                          ex.city = v.properties?.city ?? ex.city;
                          ex.country = v.properties?.country ?? ex.country;
                        }
                      } else {
                        byUser.set(v.user_id, {
                          count: 1,
                          lastVisit: v.created_at,
                          ip: v.properties?.ip,
                          city: v.properties?.city,
                          country: v.properties?.country,
                        });
                      }
                    }
                    return Array.from(byUser.entries())
                      .map(([userId, data]) => ({ userId, ...data }))
                      .sort((a, b) => b.count - a.count)
                      .map((row) => {
                        const profile = visitsModalProfiles[row.userId];
                        const label =
                          profile?.email ||
                          (profile?.first_name || profile?.last_name
                            ? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
                            : null) ||
                          row.userId.slice(0, 8) + "…";
                        return (
                          <tr key={row.userId} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 px-3 text-gray-800" title={row.userId}>
                              <Link
                                href={`/admin/users?userId=${encodeURIComponent(row.userId)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                onClick={() => setVisitsModal(null)}
                              >
                                {label}
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-gray-600 font-mono text-xs">
                              {formatIpDisplay(row.ip)}
                            </td>
                            <td className="py-2 px-3 text-gray-600 text-xs">
                              {row.city && row.country
                                ? `${row.city}, ${row.country}`
                                : row.city || row.country || (isLocalIp(row.ip) ? "Local" : "—")}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-medium text-gray-700">
                              {row.count}
                            </td>
                            <td className="py-2 px-3 text-right text-gray-500 tabular-nums">
                              {new Date(row.lastVisit).toLocaleString("ro-RO", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </td>
                          </tr>
                        );
                      });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
