"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

const ADMIN_LOGIN_THEME_KEY = "gobid-admin-login-theme";

export default function AdminLoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [ipVersion, setIpVersion] = useState<"ipv4" | "ipv6" | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [sessionMetaReady, setSessionMetaReady] = useState(false);
  const [loginPageUrl, setLoginPageUrl] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    async function loadGoogleConfig() {
      try {
        const response = await fetch("/api/auth/google/config");
        const data = await response.json();
        if (data.clientId) {
          (window as unknown as { __GOOGLE_CLIENT_ID__?: string }).__GOOGLE_CLIENT_ID__ =
            data.clientId;
        }
      } catch (err) {
        console.error("Error loading Google config:", err);
      }
    }
    loadGoogleConfig();
  }, []);

  useEffect(() => {
    setLoginPageUrl(
      typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}${window.location.search}` : "",
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/client-ip", { cache: "no-store" });
        const data = (await res.json()) as {
          ip?: string | null;
          ipVersion?: string | null;
          location?: { label?: string | null } | null;
        };
        if (!cancelled) {
          setClientIp(typeof data.ip === "string" ? data.ip : null);
          setIpVersion(
            data.ipVersion === "ipv6" ? "ipv6" : data.ipVersion === "ipv4" ? "ipv4" : null,
          );
          const loc = data.location?.label;
          setLocationLabel(typeof loc === "string" && loc.trim() ? loc.trim() : null);
        }
      } catch {
        if (!cancelled) {
          setClientIp(null);
          setIpVersion(null);
          setLocationLabel(null);
        }
      } finally {
        if (!cancelled) setSessionMetaReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ADMIN_LOGIN_THEME_KEY);
      if (saved === "dark" || saved === "light") {
        setTheme(saved);
        return;
      }
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch {
      setTheme("light");
    }
  }, []);

  /**
   * Layout-ul admin poate seta `dark` pe <html>; pe această pagină tema e doar din wrapper + stare,
   * ca modul clar să nu fie suprascris de tema globală.
   */
  useEffect(() => {
    const root = document.documentElement;
    const hadDarkOnHtml = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (hadDarkOnHtml) root.classList.add("dark");
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(ADMIN_LOGIN_THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    const syncAdminSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("Nu am putut obține sesiunea curentă Supabase:", error);
        return;
      }

      const user = data.session?.user;
      if (!user) {
        return;
      }

      const profile = await fetchAdminProfile(user.id);
      const { isAdmin, adminInfo } = buildAdminInfo(user, profile);

      if (isAdmin) {
        localStorage.setItem("adminInfo", JSON.stringify(adminInfo));
        window.location.href = "/admin";
      }
    };

    syncAdminSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAdminProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("first_name,last_name,role,is_admin")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("Nu am putut încărca profilul administratorului:", error);
    }

    return data ?? null;
  };

  const buildAdminInfo = (user: any, profile: any) => {
    const userRole =
      user?.user_metadata?.role || user?.app_metadata?.role || user?.app_metadata?.roles?.[0];
    const profileRole = profile?.role;
    const profileIsAdmin = profile?.is_admin === true;

    const normalizedUserRole = String(userRole || "").toLowerCase();
    const normalizedProfileRole = String(profileRole || "").toLowerCase();

    const isSuperUser = ["super_user", "superadmin", "administrator", "admin"].some((role) =>
      [normalizedUserRole, normalizedProfileRole].includes(role),
    );

    const isManager = ["manager"].some((role) =>
      [normalizedUserRole, normalizedProfileRole].includes(role),
    );

    const isAdmin = profileIsAdmin || isSuperUser || isManager;

    const effectiveRole =
      normalizedProfileRole ||
      normalizedUserRole ||
      (isSuperUser ? "super_user" : isManager ? "manager" : "admin");

    const adminInfo = {
      firstName: profile?.first_name || user?.user_metadata?.first_name || "Admin",
      lastName: profile?.last_name || user?.user_metadata?.last_name || "",
      email: user?.email ?? formData.email,
      role: effectiveRole,
      isAdmin,
      capabilities: isSuperUser
        ? "super_user"
        : isManager
          ? "manager"
          : isAdmin
            ? "admin"
            : normalizedProfileRole || normalizedUserRole || "user",
    };

    return { isAdmin, adminInfo };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const inputEmail = formData.email.trim().toLowerCase();
      const email = inputEmail;

      console.log("[Admin Login] Attempting sign-in for", email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: formData.password,
      });

      if (error || !data.user) {
        console.warn("[Admin Login] Supabase response:", {
          error,
          data,
        });
        if (error) {
          console.warn("[Admin Login] Error details:", {
            message: error.message,
            code: error.code,
            status: (error as { status?: number }).status,
            name: error.name,
          });
        }
        console.warn("Supabase admin login failed:", {
          code: error?.code,
          status: error?.status,
          message: error?.message,
        });
        if (error?.code === "invalid_credentials") {
          setError("Email sau parolă incorecte. Încearcă din nou.");
        } else if (error?.status === 429) {
          setError("Prea multe încercări. Te rugăm să aștepți câteva secunde.");
        } else if (error?.message) {
          console.error("Supabase auth error:", error);
          setError(error.message);
        } else {
          setError("Nu am reușit să autentificăm contul. Încearcă din nou.");
        }
        setIsLoading(false);
        return;
      }

      const profile = await fetchAdminProfile(data.user.id);
      const { isAdmin, adminInfo } = buildAdminInfo(data.user, profile);

      if (!isAdmin) {
        await supabase.auth.signOut();
        setError("Contul nu are drepturi de administrator. Te rugăm să folosești un cont autorizat.");
        setIsLoading(false);
        return;
      }

      const storedAdminInfo = {
        ...adminInfo,
        email: inputEmail,
      };

      localStorage.setItem("adminInfo", JSON.stringify(storedAdminInfo));

      window.location.href = "/admin";
    } catch (loginError: unknown) {
      console.error("Admin login error:", loginError);
      setError(
        loginError instanceof Error
          ? loginError.message
          : "A apărut o eroare neașteptată. Încearcă din nou.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const ipDisplay =
    !sessionMetaReady ? "…" : clientIp ? clientIp : "nu s-a detectat adresa IP";
  const locationDisplay =
    !sessionMetaReady ? "…" : locationLabel ?? "—";
  const ipKindLabel =
    ipVersion === "ipv6" ? "IPv6" : ipVersion === "ipv4" ? "IPv4" : null;

  return (
    <div className="dark">
      <div
        className={`relative min-h-screen overflow-hidden text-white ${theme === "light" ? "bg-zinc-950" : "bg-black"}`}
      >
        {/* Fundal negru + grid discret + halouri portocalii foarte subtile */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        {/* Gradient negru + alb — ceață albă discretă */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.12] via-white/[0.02] to-black" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-zinc-950" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-transparent via-white/[0.04] to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-emerald-950/18 via-transparent to-emerald-950/12" />
        <div className="pointer-events-none absolute -top-24 right-0 h-96 w-96 rounded-full bg-gradient-to-br from-white/15 via-emerald-200/8 to-emerald-600/5 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-[22rem] w-[22rem] rounded-full bg-gradient-to-tr from-emerald-600/7 via-white/5 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-white/8 to-emerald-500/4 blur-3xl" />

        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="border-b border-neutral-600/80 bg-neutral-800/92 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:border-neutral-500 hover:bg-neutral-700"
              >
                <i className="ri-arrow-left-line text-base text-white" aria-hidden />
                Site public
              </a>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-600 bg-neutral-800 text-white shadow-sm transition hover:bg-neutral-700"
                  title={theme === "light" ? "Fundal negru pur" : "Fundal gri foarte închis (zinc-950)"}
                  aria-label={theme === "light" ? "Comută la negru pur" : "Comută la gri foarte închis"}
                >
                  <i className={theme === "light" ? "ri-moon-line text-lg" : "ri-sun-line text-lg"} aria-hidden />
                </button>
                <span className="hidden rounded-md border border-emerald-500/35 bg-emerald-950/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 sm:inline-flex">
                  <i className="ri-shield-check-line mr-1.5 text-sm text-emerald-400" aria-hidden />
                  Protejat
                </span>
                <span className="rounded-md border border-neutral-600 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-white">
                  Enterprise Admin
                </span>
              </div>
            </div>
          </header>

          <section className="border-b border-neutral-700 bg-neutral-900/55">
            <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white">
                <span className="inline-flex items-center gap-2">
                  <i className="ri-lock-2-line text-emerald-400" aria-hidden />
                  <span>
                    Conexiune criptată{" "}
                    <abbr title="Transport Layer Security" className="cursor-help text-white/90">
                      (TLS)
                    </abbr>
                  </span>
                </span>
                <span className="hidden h-4 w-px bg-neutral-600 sm:block" aria-hidden />
                <span className="inline-flex items-center gap-2 text-white">
                  <i className="ri-map-pin-line text-white/90" aria-hidden />
                  IP și locație estimată pentru audit (acces la această pagină)
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 shadow-md shadow-black/25">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/90">
                      Adresă IP
                    </span>
                    {ipKindLabel ? (
                      <span className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-white">
                        {ipKindLabel}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="break-all font-mono text-xs text-white sm:text-sm"
                    title="Sursă: antete edge (IPv4 sau IPv6)"
                  >
                    <span className="select-all">{ipDisplay}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 shadow-md shadow-black/25 sm:col-span-1">
                  <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-white/90">
                    Locație estimată
                  </div>
                  <p className="text-sm text-white" title="După IP (geoIP); poate diferi de locul real">
                    {locationDisplay}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 shadow-md shadow-black/25">
                  <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-white/90">
                    Pagină accesată
                  </div>
                  <p
                    className="break-all font-mono text-[11px] leading-snug text-white"
                    title="URL-ul acestei sesiuni de login"
                  >
                    <span className="select-all">{loginPageUrl || "…"}</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
            <div className="w-full max-w-md">
              <div className="mb-8 text-center">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
                  Zonă restricționată
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Autentificare administrator
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-white">
                  Acces doar pentru conturi autorizate. Încercările sunt monitorizate.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-600 bg-neutral-800 p-8 shadow-xl shadow-black/40 backdrop-blur-sm">
                <div className="mb-6 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-600 bg-neutral-700/80 px-2.5 py-1 text-[11px] font-medium text-white">
                    <i className="ri-shield-keyhole-line text-white" aria-hidden />
                    Control acces
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-600 bg-neutral-700/80 px-2.5 py-1 text-[11px] font-medium text-white">
                    <i className="ri-fingerprint-line text-white" aria-hidden />
                    Identitate verificată
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {error ? (
                    <div
                      role="alert"
                      className="rounded-lg border border-red-500/35 bg-red-950/40 px-4 py-3 text-sm text-red-200"
                    >
                      <div className="flex gap-2">
                        <i
                          className="ri-error-warning-line mt-0.5 shrink-0 text-lg text-red-400"
                          aria-hidden
                        />
                        <span>{error}</span>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="admin-email"
                      className="mb-1.5 block text-xs font-medium text-white"
                    >
                      Email corporativ
                    </label>
                    <div className="relative">
                      <input
                        id="admin-email"
                        type="email"
                        name="email"
                        autoComplete="username"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full rounded-lg border border-neutral-600 bg-neutral-900 py-3 pl-11 pr-3 text-sm text-white placeholder:text-white/45 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                        placeholder="nume@organizatie.ro"
                        required
                      />
                      <i
                        className="ri-mail-line pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/90"
                        aria-hidden
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-password"
                      className="mb-1.5 block text-xs font-medium text-white"
                    >
                      Parolă
                    </label>
                    <div className="relative">
                      <input
                        id="admin-password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="current-password"
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full rounded-lg border border-neutral-600 bg-neutral-900 py-3 pl-11 pr-12 text-sm text-white placeholder:text-white/45 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                        placeholder="••••••••"
                        required
                      />
                      <i
                        className="ri-lock-line pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/90"
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white transition hover:bg-neutral-700 hover:text-white"
                        aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
                      >
                        <i
                          className={showPassword ? "ri-eye-off-line text-lg" : "ri-eye-line text-lg"}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md shadow-black/40 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Se autentifică…
                      </>
                    ) : (
                      <>
                        <i className="ri-login-circle-line text-lg" aria-hidden />
                        Intră în consolă
                      </>
                    )}
                  </button>
                </form>
              </div>

              <p className="mt-6 text-center text-xs leading-relaxed text-white/90">
                Prin continuare confirmi că ești autorizat să accesezi acest mediu. Activitatea poate fi
                înregistrată împreună cu adresa IP, locația estimată și pagina de mai sus.
              </p>
            </div>
          </main>

          <footer className="border-t border-neutral-700 bg-neutral-900/70 py-6 text-center text-xs text-white/90">
            © {new Date().getFullYear()} gobid.ro — infrastructură de administrare securizată
          </footer>
        </div>
      </div>
    </div>
  );
}
