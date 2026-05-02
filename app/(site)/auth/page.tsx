"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { HammerIcon } from "@/components/Hammer";
import Header from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import { ButtonWithIcon } from "@/components/ui/button-with-icon";
import VerificationCodeModal from "@/components/VerificationCodeModal";
import DashboardFooter from "@/components/DashboardFooter";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { debugLog, debugWarn } from "@/lib/debug";
import ModernDatePicker from "@/components/ModernDatePicker";
import { getSupabaseSessionRobust } from "@/lib/auth/getSupabaseSessionRobust";
import { recoverDashboardSessionIfNeeded } from "@/lib/auth/dashboardSessionRecovery";
import { getSessionCheckResult } from "@/lib/auth/sessionCheckClient";

/** Path relativ intern (+ query/hash); evită open-redirect. */
function safeInternalRedirectPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  let p = raw.trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (/[\r\n]/.test(p)) return null;
  const noHash = p.split("#")[0] ?? "";
  if (!noHash.startsWith("/")) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(noHash)) return null;
  return noHash;
}

function defaultDashboardForAccountType(accountType: string): string {
  if (accountType === "liquidator") return "/dashboard/lichidator";
  if (accountType === "executor") return "/dashboard/executor";
  if (accountType === "company" || accountType === "business") return "/dashboard/company";
  if (accountType === "piese_auto") return "/dashboard/piese-auto";
  return "/dashboard";
}

function resolvePostAuthPath(user: User, redirectParam: string | null | undefined): string {
  const fromQuery = safeInternalRedirectPath(redirectParam);
  if (fromQuery) return fromQuery;
  const accountType = (user.user_metadata?.account_type as string | undefined) || "private";
  return defaultDashboardForAccountType(accountType);
}

const PASSWORD_REQUIREMENTS = [
  {
    label: "Minim 10 caractere",
    test: (value: string) => value.length >= 10
  },
  {
    label: "Cel puțin o literă mică",
    test: (value: string) => /[a-z]/.test(value)
  },
  {
    label: "Cel puțin o literă mare",
    test: (value: string) => /[A-Z]/.test(value)
  },
  {
    label: "Cel puțin o cifră",
    test: (value: string) => /\d/.test(value)
  },
  {
    label: "Cel puțin un caracter special",
    test: (value: string) => /[^A-Za-z0-9]/.test(value)
  }
];

function calculatePasswordScore(value: string): number {
  let score = 0;
  PASSWORD_REQUIREMENTS.forEach((req) => {
    if (req.test(value)) score += 1;
  });
  return score;
}

function passwordStrengthLabel(score: number): { label: string; color: string } {
  if (score <= 2) return { label: "Parolă slabă", color: "text-red-400" };
  if (score === 3) return { label: "Parolă moderată", color: "text-yellow-400" };
  if (score === 4) return { label: "Parolă bună", color: "text-blue-400" };
  return { label: "Parolă foarte bună", color: "text-green-400" };
}

function generateStrongPassword(): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  // Ensure at least one of each required type
  let password = '';
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly (total length: 20)
  const allChars = lowercase + uppercase + numbers + special;
  for (let i = password.length; i < 20; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

function getRomanianAuthError(error: any): string {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const status = (error as any)?.status;

  // IMPORTANT: don't reveal bans; treat as invalid credentials
  if (msg.includes('user is banned') || msg.includes('banned') || code.includes('user_banned')) {
    return 'Email sau parolă incorecte.';
  }

  if (msg.includes('invalid login credentials') || code === 'invalid_credentials') {
    return 'Email sau parolă incorecte.';
  }

  if (status === 429 || msg.includes('too many requests')) {
    return 'Prea multe încercări. Te rugăm să aștepți câteva secunde și să încerci din nou.';
  }

  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
    return 'Email neconfirmat. Verifică emailul pentru confirmare și încearcă din nou.';
  }

  return 'Autentificare eșuată. Încearcă din nou.';
}

function getRomanianResetPasswordError(error: any): string {
  const msg = String(error?.message || '').toLowerCase();
  const status = (error as any)?.status;

  if (status === 429 || msg.includes('too many requests')) {
    return 'Prea multe cereri. Te rugăm să aștepți câteva secunde și să încerci din nou.';
  }

  return 'Eroare la trimiterea email-ului de resetare.';
}

function AuthPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isLogin, setIsLogin] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [facebookAppId, setFacebookAppId] = useState<string>('');
  // Lista cu principalele țări din Europa (România implicită)
  const countries = [
    { code: "RO", name: "România", dialCode: "+40", flag: "🇷🇴" },
    { code: "AL", name: "Albania", dialCode: "+355", flag: "🇦🇱" },
    { code: "AD", name: "Andorra", dialCode: "+376", flag: "🇦🇩" },
    { code: "AM", name: "Armenia", dialCode: "+374", flag: "🇦🇲" },
    { code: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" },
    { code: "BY", name: "Belarus", dialCode: "+375", flag: "🇧🇾" },
    { code: "BE", name: "Belgia", dialCode: "+32", flag: "🇧🇪" },
    { code: "BA", name: "Bosnia și Herțegovina", dialCode: "+387", flag: "🇧🇦" },
    { code: "BG", name: "Bulgaria", dialCode: "+359", flag: "🇧🇬" },
    { code: "HR", name: "Croația", dialCode: "+385", flag: "🇭🇷" },
    { code: "CY", name: "Cipru", dialCode: "+357", flag: "🇨🇾" },
    { code: "CZ", name: "Cehia", dialCode: "+420", flag: "🇨🇿" },
    { code: "DK", name: "Danemarca", dialCode: "+45", flag: "🇩🇰" },
    { code: "EE", name: "Estonia", dialCode: "+372", flag: "🇪🇪" },
    { code: "FO", name: "Insulele Feroe", dialCode: "+298", flag: "🇫🇴" },
    { code: "FI", name: "Finlanda", dialCode: "+358", flag: "🇫🇮" },
    { code: "FR", name: "Franța", dialCode: "+33", flag: "🇫🇷" },
    { code: "GE", name: "Georgia", dialCode: "+995", flag: "🇬🇪" },
    { code: "DE", name: "Germania", dialCode: "+49", flag: "🇩🇪" },
    { code: "GI", name: "Gibraltar", dialCode: "+350", flag: "🇬🇮" },
    { code: "GR", name: "Grecia", dialCode: "+30", flag: "🇬🇷" },
    { code: "GL", name: "Groenlanda", dialCode: "+299", flag: "🇬🇱" },
    { code: "HU", name: "Ungaria", dialCode: "+36", flag: "🇭🇺" },
    { code: "IS", name: "Islanda", dialCode: "+354", flag: "🇮🇸" },
    { code: "IE", name: "Irlanda", dialCode: "+353", flag: "🇮🇪" },
    { code: "IM", name: "Isle of Man", dialCode: "+44", flag: "🇮🇲" },
    { code: "IT", name: "Italia", dialCode: "+39", flag: "🇮🇹" },
    { code: "JE", name: "Jersey", dialCode: "+44", flag: "🇯🇪" },
    { code: "LV", name: "Letonia", dialCode: "+371", flag: "🇱🇻" },
    { code: "LI", name: "Liechtenstein", dialCode: "+423", flag: "🇱🇮" },
    { code: "LT", name: "Lituania", dialCode: "+370", flag: "🇱🇹" },
    { code: "LU", name: "Luxemburg", dialCode: "+352", flag: "🇱🇺" },
    { code: "MT", name: "Malta", dialCode: "+356", flag: "🇲🇹" },
    { code: "MD", name: "Moldova", dialCode: "+373", flag: "🇲🇩" },
    { code: "MC", name: "Monaco", dialCode: "+377", flag: "🇲🇨" },
    { code: "ME", name: "Muntenegru", dialCode: "+382", flag: "🇲🇪" },
    { code: "NL", name: "Țările de Jos", dialCode: "+31", flag: "🇳🇱" },
    { code: "MK", name: "Macedonia de Nord", dialCode: "+389", flag: "🇲🇰" },
    { code: "NO", name: "Norvegia", dialCode: "+47", flag: "🇳🇴" },
    { code: "PL", name: "Polonia", dialCode: "+48", flag: "🇵🇱" },
    { code: "PT", name: "Portugalia", dialCode: "+351", flag: "🇵🇹" },
    { code: "RU", name: "Rusia", dialCode: "+7", flag: "🇷🇺" },
    { code: "SM", name: "San Marino", dialCode: "+378", flag: "🇸🇲" },
    { code: "RS", name: "Serbia", dialCode: "+381", flag: "🇷🇸" },
    { code: "SK", name: "Slovacia", dialCode: "+421", flag: "🇸🇰" },
    { code: "SI", name: "Slovenia", dialCode: "+386", flag: "🇸🇮" },
    { code: "ES", name: "Spania", dialCode: "+34", flag: "🇪🇸" },
    { code: "SJ", name: "Svalbard și Jan Mayen", dialCode: "+47", flag: "🇸🇯" },
    { code: "SE", name: "Suedia", dialCode: "+46", flag: "🇸🇪" },
    { code: "CH", name: "Elveția", dialCode: "+41", flag: "🇨🇭" },
    { code: "TR", name: "Turcia", dialCode: "+90", flag: "🇹🇷" },
    { code: "UA", name: "Ucraina", dialCode: "+380", flag: "🇺🇦" },
    { code: "GB", name: "Marea Britanie", dialCode: "+44", flag: "🇬🇧" },
    { code: "VA", name: "Vatican", dialCode: "+39", flag: "🇻🇦" },
  ];

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    username: "",
    phone: "",
    accountType: "private" as "private" | "executor" | "company" | "liquidator" | "piese_auto",
    birthDate: "",
    location: "",
    address: "",
    county: "",
    // Executor fields
    executorUnejNumber: "",
    executorChamber: "",
    executorOfficeAddress: "",
    executorOfficeLocation: "",
    executorWebsite: "",
    // Terms and marketing consent
    acceptTerms: false,
    acceptMarketing: false,
    // Dealer Piese Auto: privat vs. firmă (înregistrare)
    pieseAutoAsDealer: false,
    companyName: "",
    cui: "",
    registrationNumber: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set()); // Track câmpuri touched pentru validare
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0); // cooldown pentru "Retrimite codul" când modalul e închis
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [anafCompanyLookupLoading, setAnafCompanyLookupLoading] = useState(false);
  const anafLookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anafLookupInFlightRef = useRef(false);

  const runCompanyAnafLookup = useCallback(async (cuiRaw: string) => {
    const trimmed = cuiRaw.trim();
    const digits = trimmed.replace(/\D/g, "");
    if (!trimmed || digits.length < 8 || digits.length > 10) return;
    if (anafLookupInFlightRef.current) return;
    anafLookupInFlightRef.current = true;
    setAnafCompanyLookupLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/company/anaf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cui: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setMessage({
          type: "error",
          text: (typeof data.error === "string" && data.error) || `Nu am putut prelua datele (${res.status}).`,
        });
        return;
      }
      const denumire = typeof data.denumire === "string" ? data.denumire.trim() : "";
      if (!denumire && typeof data.error === "string" && data.error) {
        setMessage({ type: "error", text: data.error });
        return;
      }
      setFormData((prev) => ({
        ...prev,
        companyName: (typeof data.denumire === "string" && data.denumire.trim()) || prev.companyName,
        cui: (typeof data.cui === "string" && data.cui.trim()) || prev.cui,
        registrationNumber:
          (typeof data.nrRegCom === "string" && data.nrRegCom.trim()) || prev.registrationNumber,
        location: (typeof data.localitate === "string" && data.localitate.trim()) || prev.location,
        county: (typeof data.judet === "string" && data.judet.trim()) || prev.county,
        address: (typeof data.adresa === "string" && data.adresa.trim()) || prev.address,
      }));
      if (denumire) {
        setMessage({ type: "success", text: "Date firma completate din ANAF. Verifică câmpurile înainte de înregistrare." });
      }
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Eroare la conexiunea cu serviciul ANAF.",
      });
    } finally {
      anafLookupInFlightRef.current = false;
      setAnafCompanyLookupLoading(false);
    }
  }, []);

  const scheduleAnafLookupFromCuiValue = useCallback(
    (value: string) => {
      if (anafLookupDebounceRef.current) {
        clearTimeout(anafLookupDebounceRef.current);
        anafLookupDebounceRef.current = null;
      }
      const digits = value.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 10) return;
      anafLookupDebounceRef.current = setTimeout(() => {
        anafLookupDebounceRef.current = null;
        void runCompanyAnafLookup(value.trim());
      }, 900);
    },
    [runCompanyAnafLookup],
  );

  const flushAnafDebounceAndLookup = useCallback(
    (value: string) => {
      if (anafLookupDebounceRef.current) {
        clearTimeout(anafLookupDebounceRef.current);
        anafLookupDebounceRef.current = null;
      }
      void runCompanyAnafLookup(value.trim());
    },
    [runCompanyAnafLookup],
  );

  useEffect(() => {
    return () => {
      if (anafLookupDebounceRef.current) clearTimeout(anafLookupDebounceRef.current);
    };
  }, []);
  // Tip selectat pentru autentificare: utilizator privat sau business (doar vizual, redirect-ul după login vine din backend)
  const [authContext, setAuthContext] = useState<"private" | "business">("private");
  // Load dark mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
    }
  }, []);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  // Load Facebook App ID on mount
  useEffect(() => {
    async function loadFacebookConfig() {
      try {
        debugLog('🔧 Loading Facebook config...');
        const response = await fetch('/api/auth/facebook/config');
        const data = await response.json();
        debugLog('✅ Facebook config response:', {
          appId: data.appId ? `${data.appId.substring(0, 10)}...` : 'MISSING',
          redirectUri: data.redirectUri,
          siteUrl: data.siteUrl || 'NOT SET'
        });
        
        if (data.appId) {
          setFacebookAppId(data.appId);
          // Also set it globally for easy access
          (window as any).__FACEBOOK_APP_ID__ = data.appId;
          // Store redirect URI for validation
          (window as any).__FACEBOOK_REDIRECT_URI__ = data.redirectUri;
          debugLog('✅ Facebook App ID loaded successfully');
          debugLog('📍 Redirect URI:', data.redirectUri);
        } else {
          debugWarn('⚠️ Facebook App ID not found in response:', data);
        }
      } catch (error) {
        console.error('❌ Error loading Facebook config:', error);
      }
    }
    loadFacebookConfig();
  }, []);

  // Check if user is already authenticated and redirect to dashboard
  // Only redirect if there's no 'stay' or 'force' query parameter
  const stayParam = searchParams?.get("stay");
  const forceParam = searchParams?.get("force");
  const redirectParam = searchParams?.get("redirect");

  useEffect(() => {
    let cancelled = false;

    const checkAuthAndRedirect = async () => {
      try {
        const stayOnAuth = stayParam === "true" || forceParam === "true";
        if (stayOnAuth) {
          debugLog("[Auth] User requested to stay on auth page");
          return;
        }

        /** Aliniază clientul cu cookie-urile HTTP înainte de orice decizie (aceeași logică ca în dashboard). */
        const session = await recoverDashboardSessionIfNeeded(supabase);
        if (cancelled) return;

        if (session?.user) {
          const target = resolvePostAuthPath(session.user, redirectParam);
          debugLog("[Auth] User already authenticated, redirecting to", target);
          router.replace(target);
          return;
        }

        if (typeof window !== "undefined") {
          const check = await getSessionCheckResult();
          if (cancelled) return;

          if (check.status === "ok" && check.authenticated) {
            const s2 = await getSupabaseSessionRobust(supabase);
            if (cancelled) return;
            if (s2?.user) {
              const target = resolvePostAuthPath(s2.user, redirectParam);
              debugLog("[Auth] Session after cookie refresh, redirecting to", target);
              router.replace(target);
              return;
            }
          }

          /**
           * Serverul confirmă că nu există sesiune HTTP; UI-ul poate încă arăta „logat” din memorie.
           * Nu curățăm la eroare rețea (`status === "error"`).
           */
          if (check.status === "ok" && !check.authenticated) {
            await supabase.auth.signOut({ scope: "local" });
            try {
              localStorage.removeItem("userInfo");
              localStorage.removeItem("supabaseUserId");
            } catch {
              /* ignore */
            }
          }

          const savedAdminInfo = localStorage.getItem("adminInfo");
          if (savedAdminInfo) {
            try {
              const adminInfo = JSON.parse(savedAdminInfo);
              if (adminInfo.isAdmin || adminInfo.role === "manager") {
                const adminCheck = await getSessionCheckResult();
                if (cancelled) return;
                if (
                  adminCheck.status === "ok" &&
                  adminCheck.authenticated
                ) {
                  const adminTarget =
                    safeInternalRedirectPath(redirectParam) ?? "/admin";
                  debugLog("[Auth] Admin session valid, redirecting to", adminTarget);
                  router.replace(adminTarget);
                }
              }
            } catch {
              /* invalid adminInfo */
            }
          }
        }
      } catch (error) {
        console.error("[Auth] Error checking authentication:", error);
      }
    };

    void checkAuthAndRedirect();
    return () => {
      cancelled = true;
    };
  }, [router, stayParam, forceParam, redirectParam]);

  /**
   * Când sesiunea apare imediat după mount (ex. evenimente Supabase), ieșim de pe /auth.
   */
  useEffect(() => {
    const stayOnAuth = stayParam === "true" || forceParam === "true";
    if (stayOnAuth) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession: Session | null) => {
      if (!pathname?.startsWith("/auth")) return;
      if (event === "SIGNED_OUT" || (event as string) === "USER_DELETED") return;
      if (!nextSession?.user) return;
      const target = resolvePostAuthPath(nextSession.user, redirectParam);
      debugLog("[Auth] onAuthStateChange →", event, target);
      router.replace(target);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname, stayParam, forceParam, redirectParam]);

  // Set default prefix pentru telefon la înregistrare
  useEffect(() => {
    if (!isLogin) {
      setPhoneCountry(countries[0]);
      setPhoneNumber("");
      setFormData((prev) => ({ ...prev, phone: countries[0].dialCode }));
    }
  }, [isLogin]);

  // Funcție pentru formatarea numărului de telefon (3 cifre în 3 cifre, max 9 cifre pentru România)
  const formatPhoneNumber = (value: string): string => {
    // Elimină toate caracterele non-digit
    const digits = value.replace(/\D/g, "");
    
    // Limitează la 9 cifre pentru numerele românești
    const limitedDigits = digits.slice(0, 9);
    
    // Grupează cifrele în grupuri de 3
    const groups: string[] = [];
    for (let i = 0; i < limitedDigits.length; i += 3) {
      groups.push(limitedDigits.slice(i, i + 3));
    }
    
    // Returnează numărul formatat cu spații între grupuri
    return groups.join(" ");
  };

  // Actualizează formData.phone când se schimbă country/number
  useEffect(() => {
    if (!isLogin) {
      const digits = phoneNumber.replace(/\D/g, "");
      const normalized = digits ? `${phoneCountry.dialCode}${digits}` : phoneCountry.dialCode;
      setFormData((prev) => ({ ...prev, phone: normalized }));
    }
  }, [phoneCountry, phoneNumber, isLogin]);

  // Check URL parameters to set initial mode and account type
  useEffect(() => {
    const mode = searchParams?.get?.('mode') ?? null;
    const accountType = searchParams?.get?.('type') ?? null;
    
    if (mode === 'register') {
      setIsLogin(false);
    } else if (mode === 'login') {
      setIsLogin(true);
    }
    
    // If account type is provided, set it and redirect to appropriate page
    if (accountType && !isLogin) {
      if (accountType === 'company') {
        router.push(`/auth/register/company?type=${accountType}`);
        return;
      }
      setFormData(prev => ({ ...prev, accountType: accountType as "private" | "executor" | "company" | "liquidator" | "piese_auto" }));
    }
  }, [searchParams, isLogin, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Fallback: Custom Google OAuth (old method) - defined first so it can be called
  const initiateCustomGoogleAuth = async () => {
    try {
      debugLog('🔄 Using custom Google OAuth flow (fallback)');
      
      // Use canonical site URL when set - MUST match server callback and Google Console
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || window.location.origin;
      const canonicalRedirectUri = `${baseUrl}/api/auth/google/callback`;

      // Get Google Client ID from environment or API
      let clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      let redirectUri = canonicalRedirectUri;

      if (!clientId) {
        // Try to get from API
        debugLog('📡 Fetching Google config from API...');
        const configResponse = await fetch('/api/auth/google/config');
        const configData = await configResponse.json();
        clientId = configData.clientId;
        redirectUri = configData.redirectUri || redirectUri;
        
        if (!clientId) {
          setMessage({ 
            type: 'error', 
            text: 'Google Client ID nu este configurat. Te rog adaugă NEXT_PUBLIC_GOOGLE_CLIENT_ID în .env.local' 
          });
          return;
        }
      }
      
      debugLog('✅ Using Client ID:', clientId.substring(0, 20) + '...');
      debugLog('📍 Redirect URI:', redirectUri);
      
      // Use custom OAuth flow
      const scope = 'openid email profile';
      const state = isLogin ? 'login' : 'signup';
      
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('redirect_uri', redirectUri);
      params.append('response_type', 'code');
      params.append('scope', scope);
      params.append('access_type', 'offline');
      params.append('prompt', 'consent');
      params.append('state', state);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      debugLog('🔗 Redirecting to Google OAuth:', authUrl.substring(0, 100) + '...');
      window.location.href = authUrl;
    } catch (error: any) {
      console.error('❌ Error in custom Google OAuth:', error);
      setMessage({ 
        type: 'error', 
        text: `Eroare la inițializarea autentificării Google: ${error.message || 'Eroare necunoscută'}` 
      });
    }
  };

  // Function to initiate Google OAuth - tries Supabase first, falls back to custom OAuth
  const initiateGoogleAuth = async () => {
    // Check if we have Google Client ID (from env or we'll fetch from API)
    // If we do, use custom OAuth directly to avoid Supabase provider error
    const envClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    
    if (envClientId) {
      debugLog('📌 Google Client ID found in env, using custom OAuth directly (bypassing Supabase)...');
      await initiateCustomGoogleAuth();
      return;
    }

    // Try to get from API as well
    try {
      const configResponse = await fetch('/api/auth/google/config');
      const configData = await configResponse.json();
      if (configData.clientId) {
        debugLog('📌 Google Client ID found via API, using custom OAuth directly (bypassing Supabase)...');
        await initiateCustomGoogleAuth();
        return;
      }
    } catch (e) {
      debugLog('⚠️ Could not fetch Google config from API, will try Supabase...');
    }

    try {
      // First, try Supabase Auth OAuth
      debugLog('🔄 Attempting Supabase OAuth...');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('❌ Supabase OAuth error:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        
        // Check multiple ways the error might be formatted
        const errorMessage = error.message || '';
        const errorMsg = (error as any)?.msg || '';
        const errorCode = (error as any)?.error_code || '';
        const errorString = JSON.stringify(error);
        
        // If provider is not enabled (check all possible formats)
        if (
          errorMessage.includes('not enabled') || 
          errorMessage.includes('Unsupported provider') ||
          errorMsg.includes('not enabled') ||
          errorMsg.includes('Unsupported provider') ||
          errorCode === 'validation_failed' ||
          errorString.includes('not enabled') ||
          errorString.includes('Unsupported provider')
        ) {
          debugLog('⚠️ Provider not enabled in Supabase, falling back to custom OAuth...');
          await initiateCustomGoogleAuth();
          return;
        } else {
          setMessage({ type: 'error', text: errorMessage || errorMsg || 'Eroare la inițializarea autentificării Google.' });
          return;
        }
      }

      if (data?.url) {
        // Supabase OAuth works, redirect
        debugLog('✅ Supabase OAuth URL generated, redirecting...');
        window.location.href = data.url;
      } else {
        // No URL, try custom OAuth as fallback
        debugLog('⚠️ No Supabase OAuth URL, falling back to custom OAuth...');
        await initiateCustomGoogleAuth();
      }
    } catch (error: any) {
      console.error('❌ Error initiating Google OAuth:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      
      // Check error in multiple formats
      const errorMessage = error?.message || '';
      const errorMsg = error?.msg || '';
      const errorString = JSON.stringify(error);
      
      // Fallback to custom OAuth on any error that suggests provider not enabled
      if (
        errorMessage.includes('not enabled') || 
        errorMessage.includes('Unsupported provider') ||
        errorMsg.includes('not enabled') ||
        errorMsg.includes('Unsupported provider') ||
        errorString.includes('not enabled') ||
        errorString.includes('Unsupported provider') ||
        errorString.includes('validation_failed')
      ) {
        debugLog('⚠️ Provider not enabled (caught in catch), falling back to custom OAuth...');
        await initiateCustomGoogleAuth();
      } else {
        setMessage({ type: 'error', text: errorMessage || errorMsg || 'Eroare la inițializarea autentificării Google.' });
      }
    }
  };

  // Function to initiate Facebook OAuth
  const initiateFacebookAuth = async (appId: string) => {
    try {
      // First, get the exact redirect URI from the server
      const configResponse = await fetch('/api/auth/facebook/config');
      const configData = await configResponse.json();
      
      // Use the redirect URI from server (most accurate)
      const redirectUri = configData.redirectUri || `${window.location.origin}/api/auth/facebook/callback`;
      const scope = 'email,public_profile';
      const state = isLogin ? 'login' : 'signup';
      
      debugLog('🔧 Facebook OAuth Config:', {
        appId: appId ? `${appId.substring(0, 10)}...` : 'MISSING',
        redirectUri: redirectUri,
        currentOrigin: window.location.origin,
        envSiteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'NOT SET',
        serverRedirectUri: configData.redirectUri || 'NOT SET',
      });
      
      // Validate app ID
      if (!appId || appId.trim() === '') {
        console.error('❌ Facebook App ID is missing or empty');
        alert('❌ Facebook App ID nu este configurat corect. Verifică .env.local');
        return;
      }
      
      // Validate redirect URI
      if (!redirectUri || redirectUri.includes('undefined')) {
        console.error('❌ Redirect URI is invalid:', redirectUri);
        alert('❌ Redirect URI invalid. Verifică NEXT_PUBLIC_SITE_URL în .env.local');
        return;
      }
      
      // Show warning if redirect URI might not match Facebook App Settings
debugWarn('⚠️ IMPORTANT: Copy this redirect URI and add it to Facebook App Settings:');
          debugWarn('📍 Redirect URI:', redirectUri);
          debugWarn('🔗 Facebook Developers: https://developers.facebook.com/apps');
      
      // Build Facebook OAuth URL
      const params = new URLSearchParams();
      params.append('client_id', appId);
      params.append('redirect_uri', redirectUri);
      params.append('scope', scope);
      params.append('response_type', 'code');
      params.append('state', state);

      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
      debugLog('🔗 Redirecting to Facebook OAuth');
      debugLog('📋 Full URL (first 200 chars):', authUrl.substring(0, 200) + '...');
      debugLog('📋 Redirect URI (must match Facebook App Settings):', redirectUri);
      debugLog('📋 App ID:', `${appId.substring(0, 10)}...`);
      
      // Show user-friendly error if redirect URI mismatch
      const debugInfo = `
🔧 DEBUG INFO:
- Redirect URI: ${redirectUri}
- App ID: ${appId.substring(0, 10)}...

⚠️ Dacă primești eroarea "redirect_uri_mismatch":
1. Copiază redirect URI-ul de mai sus
2. Mergi la: https://developers.facebook.com/apps
3. Selectează aplicația ta
4. Mergi la Settings → Basic
5. Adaugă redirect URI-ul EXACT în "Valid OAuth Redirect URIs"
6. Salvează și așteaptă 1-2 minute
7. Încearcă din nou

💡 Redirect URI trebuie să fie EXACT identic (fără trailing slash!)
      `;
      console.log(debugInfo);
      
      // Force navigation
      window.location.href = authUrl;
    } catch (error) {
      console.error('❌ Error initiating Facebook OAuth:', error);
      alert('❌ Eroare la inițializarea autentificării Facebook. Verifică console-ul pentru detalii.');
    }
  };

  // Sign in with Apple – același flux ca Google: OAuth custom (fără Supabase provider)
  const initiateAppleAuth = async () => {
    try {
      const configRes = await fetch('/api/auth/apple/config');
      const config = await configRes.json();
      const clientId = config.clientId;
      const redirectUri = config.redirectUri;

      if (!clientId) {
        setMessage({
          type: 'error',
          text: 'Apple Sign In nu este configurat. Adaugă APPLE_ID (Services ID) în .env.local.',
        });
        return;
      }

      const state = isLogin ? 'login' : 'signup';
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code id_token',
        response_mode: 'form_post',
        scope: 'name email',
        state,
      });
      const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
      window.location.href = authUrl;
    } catch (err: any) {
      console.error('❌ Error initiating Apple OAuth:', err);
      setMessage({
        type: 'error',
        text: err?.message || 'Eroare la autentificarea cu Apple.',
      });
    }
  };

  // Function to show error
  const showError = () => {
    alert('⚠️ Google Client ID nu este configurat.\n\nTe rog verifică:\n1. .env.local are NEXT_PUBLIC_GOOGLE_CLIENT_ID setat\n2. Server-ul Next.js a fost restartat după adăugarea variabilei\n3. Verifică console-ul pentru detalii');
  };

  // Funcție pentru resetare parolă
  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail || !forgotPasswordEmail.includes('@')) {
      setMessage({ type: "error", text: "Te rugăm să introduci un email valid." });
      return;
    }

    setIsSendingReset(true);
    setMessage(null);

    try {
      const resetUrl = `${window.location.origin}/auth/reset-password`;
      
      // Generate reset link via API route (doesn't send Supabase email)
      const resetResponse = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: forgotPasswordEmail.trim(),
          redirectTo: resetUrl,
        }),
      });

      if (!resetResponse.ok) {
        const errorData = await resetResponse.json().catch(() => ({}));
        setMessage({ 
          type: "error", 
          text: errorData.error || "Eroare la generarea link-ului de resetare." 
        });
        setIsSendingReset(false);
        return;
      }

      const resetData = await resetResponse.json();
      
      // Debug: Log what we received from API
      debugLog('[Client] Reset password API response:', {
        success: resetData.success,
        resetLink: resetData.resetLink?.substring(0, 200),
        debug: resetData.debug
      });
      
      if (!resetData.success || !resetData.resetLink) {
        setMessage({ 
          type: "error", 
          text: "Nu am putut genera link-ul de resetare. Te rugăm să încerci din nou." 
        });
        setIsSendingReset(false);
        return;
      }

      // Extract redirect_to from link for verification and fix if needed
      let finalResetLink = resetData.resetLink;
      let redirectToInLink = null;
      const productionUrl = 'https://gobid.ro';
      
      try {
        const linkUrl = new URL(resetData.resetLink);
        redirectToInLink = linkUrl.searchParams.get('redirect_to');
        debugLog('[Client] redirect_to in link:', redirectToInLink);
        
        // If redirect_to is not correct, fix it
        if (redirectToInLink) {
          let decodedRedirectTo = redirectToInLink;
          try {
            decodedRedirectTo = decodeURIComponent(redirectToInLink);
            if (decodedRedirectTo.includes('%')) {
              decodedRedirectTo = decodeURIComponent(decodedRedirectTo);
            }
          } catch (e) {
            decodedRedirectTo = redirectToInLink;
          }
          
          // Check if redirect_to needs to be fixed
          const hasWww = decodedRedirectTo.includes('www.gobid.ro');
          const isNotExactPath = !decodedRedirectTo.endsWith('/auth/reset-password-redirect');
          const isJustDomain = decodedRedirectTo === 'https://www.gobid.ro' || decodedRedirectTo === 'https://www.gobid.ro/' || 
                               decodedRedirectTo === 'https://gobid.ro' || decodedRedirectTo === 'https://gobid.ro/';
          
          if (decodedRedirectTo !== `${productionUrl}/auth/reset-password-redirect` ||
              decodedRedirectTo.includes('localhost') ||
              decodedRedirectTo.includes('vercel') ||
              !decodedRedirectTo.includes('gobid.ro') ||
              hasWww ||
              isNotExactPath ||
              isJustDomain) {
            debugLog('[Client] Fixing redirect_to in link:', {
              was: decodedRedirectTo,
              willBe: `${productionUrl}/auth/reset-password`
            });
            
            // Fix the redirect_to parameter
            linkUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
            finalResetLink = linkUrl.toString();
            
            debugLog('[Client] Fixed reset link:', finalResetLink.substring(0, 200));
          }
        } else {
          // If no redirect_to, add it
          linkUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
          finalResetLink = linkUrl.toString();
          debugLog('[Client] Added redirect_to parameter to link');
        }
      } catch (e) {
        console.error('[Client] Error parsing reset link:', e);
        // Try simple string replacement as fallback
        if (finalResetLink.includes('localhost') || finalResetLink.includes('vercel')) {
          finalResetLink = finalResetLink.replace(
            /redirect_to=([^&]+)/g,
            (match: string, value: string): string => {
              const decoded = decodeURIComponent(value);
        const hasWww = decoded.includes('www.gobid.ro');
        const isNotExactPath = !decoded.endsWith('/auth/reset-password-redirect');
        const isJustDomain = decoded === 'https://www.gobid.ro' || decoded === 'https://www.gobid.ro/' || 
                             decoded === 'https://gobid.ro' || decoded === 'https://gobid.ro/';
        
        if (decoded.includes('localhost') || decoded.includes('vercel') || !decoded.includes('gobid.ro') || 
            hasWww || isNotExactPath || isJustDomain) {
          return `redirect_to=${encodeURIComponent(`${productionUrl}/auth/reset-password-redirect`)}`;
        }
              return match;
            }
          );
        }
      }

      // FINAL CHECK: Verify redirect_to one more time before sending email
      try {
        const finalCheckUrl = new URL(finalResetLink);
        const finalCheckRedirectTo = finalCheckUrl.searchParams.get('redirect_to');
        
        if (finalCheckRedirectTo) {
          let decodedFinalCheck = finalCheckRedirectTo;
          try {
            decodedFinalCheck = decodeURIComponent(finalCheckRedirectTo);
            if (decodedFinalCheck.includes('%')) {
              decodedFinalCheck = decodeURIComponent(decodedFinalCheck);
            }
          } catch (e) {
            decodedFinalCheck = finalCheckRedirectTo;
          }
          
          // FORCE to production URL if not exactly correct
          const hasWww = decodedFinalCheck.includes('www.gobid.ro');
          const isNotExactPath = !decodedFinalCheck.endsWith('/auth/reset-password-redirect');
          const isJustDomain = decodedFinalCheck === 'https://www.gobid.ro' || decodedFinalCheck === 'https://www.gobid.ro/' || 
                               decodedFinalCheck === 'https://gobid.ro' || decodedFinalCheck === 'https://gobid.ro/';
          
          if (decodedFinalCheck !== `${productionUrl}/auth/reset-password-redirect` ||
              decodedFinalCheck.includes('localhost') ||
              decodedFinalCheck.includes('vercel') ||
              !decodedFinalCheck.includes('gobid.ro') ||
              hasWww ||
              isNotExactPath ||
              isJustDomain) {
            debugLog('[Client] Final check: fixing redirect_to before sending email:', {
              was: decodedFinalCheck,
              willBe: `${productionUrl}/auth/reset-password-redirect`
            });
            finalCheckUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
            finalResetLink = finalCheckUrl.toString();
          }
        } else {
          finalCheckUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
          finalResetLink = finalCheckUrl.toString();
          debugLog('[Client] Final check: added redirect_to before sending email');
        }
      } catch (e) {
        console.error('[Client] Final check error:', e);
      }
      
      // Verify one last time what we're sending
      let finalRedirectToCheck = null;
      try {
        const verifyFinalUrl = new URL(finalResetLink);
        finalRedirectToCheck = verifyFinalUrl.searchParams.get('redirect_to');
        if (finalRedirectToCheck) {
          try {
            finalRedirectToCheck = decodeURIComponent(finalRedirectToCheck);
            if (finalRedirectToCheck.includes('%')) {
              finalRedirectToCheck = decodeURIComponent(finalRedirectToCheck);
            }
          } catch (e) {
            // Keep encoded
          }
        }
      } catch (e) {
        // Ignore
      }
      
      debugLog('[Client] FINAL: Sending email with redirect_to:', finalRedirectToCheck);
      debugLog('[Client] FINAL: Full reset link:', finalResetLink.substring(0, 250));
      
      // CRITICAL: One more string-based fix as absolute last resort
      // This ensures that even if URL parsing fails, we still fix localhost
      if (finalResetLink.includes('localhost:3000') || finalResetLink.includes('redirect_to=http://localhost')) {
        debugLog('[Client] CRITICAL: Found localhost in link, applying string replacement');
        finalResetLink = finalResetLink.replace(/redirect_to=http:\/\/localhost:3000/g, 'redirect_to=https://gobid.ro/auth/reset-password');
        finalResetLink = finalResetLink.replace(/redirect_to=http%3A%2F%2Flocalhost:3000/g, 'redirect_to=https%3A%2F%2Fgobid.ro%2Fauth%2Freset-password');
        finalResetLink = finalResetLink.replace(/redirect_to=([^&]*localhost[^&]*)/g, 'redirect_to=https%3A%2F%2Fgobid.ro%2Fauth%2Freset-password');
        debugLog('[Client] CRITICAL: After string replacement:', finalResetLink.substring(0, 250));
      }

      // Trimite email personalizat cu template (doar email-ul nostru custom)
      try {
        const { getResetPasswordEmailTemplate } = await import('@/lib/email-templates/reset-password');
        
        // Get base URL for logo
        const baseUrl = window.location.origin;
        
        // Log the exact link being passed to template
        debugLog('[Client] About to generate email HTML with reset link:', finalResetLink);
        
        const emailHtml = getResetPasswordEmailTemplate({ 
          resetLink: finalResetLink, // Use the fixed link
          baseUrl: baseUrl,
        });
        
        // Verify the link is in the HTML
        const linkInHtml = emailHtml.match(/href="([^"]+)"/);
        if (linkInHtml) {
          debugLog('[Client] Link found in email HTML:', linkInHtml[1].substring(0, 250));
          
          // Check if localhost is still in the HTML
          if (linkInHtml[1].includes('localhost')) {
            console.error('[Client] ERROR: localhost still found in email HTML!');
            console.error('[Client] Full link in HTML:', linkInHtml[1]);
          }
        }
        
        debugLog('[Client] Email HTML generated, length:', emailHtml.length);
        
        const emailResponse = await fetch('/api/resend/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: forgotPasswordEmail.trim(),
            subject: 'Resetare Parolă - GoBid',
            html: emailHtml,
            config: {
              fromEmail: 'noreply@gobid.ro',
            },
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json().catch(() => ({}));
          console.error('Error sending custom email:', errorData);
          setMessage({ 
            type: "error", 
            text: "Link-ul a fost generat, dar nu am putut trimite email-ul. Te rugăm să contactezi suportul." 
          });
          setIsSendingReset(false);
          return;
        }
      } catch (emailError) {
        console.error('Error sending custom email template:', emailError);
        setMessage({ 
          type: "error", 
          text: "Eroare la trimiterea email-ului. Te rugăm să încerci din nou." 
        });
        setIsSendingReset(false);
        return;
      }

      setMessage({ 
        type: "success", 
        text: "Email-ul de resetare a fost trimis! Verifică inbox-ul și urmează instrucțiunile." 
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
      setIsSendingReset(false);
    } catch (error: any) {
      console.error('Unexpected error in handleForgotPassword:', error);
      setMessage({ 
        type: "error", 
        text: error.message || "A apărut o eroare neașteptată. Te rugăm să încerci din nou." 
      });
      setIsSendingReset(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!formData.email || !formData.password) {
      setMessage({ type: "error", text: "Te rog completează emailul și parola." });
      return;
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      setMessage({ type: "error", text: "Parola și confirmarea nu coincid." });
      return;
    }

    // Validare parolă puternică la înregistrare (toate cerințele obligatorii)
    if (!isLogin && formData.password) {
      const allMet = PASSWORD_REQUIREMENTS.every((req) => req.test(formData.password));
      if (!allMet) {
        setMessage({
          type: "error",
          text: "Parola trebuie să îndeplinească toate cerințele: minim 10 caractere, litere mici și mari, cifre și caractere speciale."
        });
        return;
      }
    }

    // Validate required checkbox for registration (must be checked)
    if (!isLogin && !formData.acceptTerms) {
      // Marchează câmpul ca touched când utilizatorul încearcă să trimită
      setTouchedFields(new Set(['acceptTerms']));
      setMessage({ 
        type: "error", 
        text: "Trebuie să accepți Termenii și Condițiile și Politica de confidențialitate pentru a continua înregistrarea." 
      });
      // Scroll to checkbox to ensure visibility
      setTimeout(() => {
        const checkbox = document.getElementById('acceptTerms');
        if (checkbox) {
          checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          checkbox.focus();
        }
      }, 100);
      return;
    }

    if (
      !isLogin &&
      (formData.accountType === "private" ||
        (formData.accountType === "piese_auto" && !formData.pieseAutoAsDealer))
    ) {
      const username = formData.username.trim();
      if (!username) {
        setMessage({ type: "error", text: "Username-ul este obligatoriu pentru contul de utilizator." });
        return;
      }
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
        setMessage({
          type: "error",
          text: "Username invalid. Folosește 3-30 caractere: litere, cifre, punct, underscore sau cratimă."
        });
        return;
      }
    }

    if (!isLogin && formData.accountType === "piese_auto" && formData.pieseAutoAsDealer) {
      if (!formData.companyName?.trim() || !formData.cui?.trim()) {
        setMessage({
          type: "error",
          text: "Pentru dealer firmă completează denumirea și CUI-ul (ideal completate automat din ANAF).",
        });
        return;
      }
      if (!formData.address?.trim() || !formData.county?.trim() || !formData.location?.trim()) {
        setMessage({
          type: "error",
          text: "Pentru dealer firmă completează adresa sediului, județul și localitatea.",
        });
        return;
      }
    }

    let normalizedPhone = formData.phone?.trim() || "";
    normalizedPhone = normalizedPhone.replace(/\s+/g, "");
    if (!isLogin) {
      // Pentru România (+40), verifică că numărul are exact 9 cifre
      if (phoneCountry.code === "RO") {
        const phoneDigits = phoneNumber.replace(/\D/g, "");
        if (phoneDigits.length !== 9) {
          setMessage({ type: "error", text: "Numărul de telefon românesc trebuie să aibă exact 9 cifre (ex: 712345678)." });
          return;
        }
      }
      
      if (!normalizedPhone.startsWith("+")) {
        normalizedPhone = `+${normalizedPhone}`;
      }
      if (!/^\+\d{8,15}$/.test(normalizedPhone)) {
        setMessage({ type: "error", text: "Te rog introdu un număr de telefon valid (ex: +40 712345678)." });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email.trim(),
          password: formData.password
        });

        if (error) {
          setMessage({ type: "error", text: getRomanianAuthError(error) });
          return;
        }

        if (!data?.session) {
          setMessage({ type: "error", text: "Autentificare reușită, dar nu am primit sesiunea. Încearcă din nou." });
          return;
        }

        // Get account type from session
        const accountType = data.session.user.user_metadata?.account_type || 'private';
        
        // Get redirect path based on account type
        const redirectParam = searchParams?.get?.('redirect');
        let defaultPath = '/dashboard';
        
        if (accountType === 'executor' || accountType === 'liquidator') {
          defaultPath = '/dashboard/executor';
        } else if (accountType === 'company' || accountType === 'business') {
          defaultPath = '/dashboard/company';
        } else if (accountType === 'piese_auto') {
          defaultPath = '/dashboard/piese-auto';
        }
        
        const redirectPath = typeof window !== 'undefined' 
          ? (localStorage.getItem('authRedirect') || redirectParam || defaultPath)
          : defaultPath;
        
        // Clear the saved redirect path and, pentru company/business/piese_auto, salvează accountType
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authRedirect');
          if (accountType === 'company' || accountType === 'business' || accountType === 'liquidator' || accountType === 'piese_auto') {
            localStorage.setItem('accountType', accountType);
          }
        }
        
        router.replace(redirectPath);
      } else {
        // Create user via admin API to avoid Supabase automatic email
        try {
          const createUserResponse = await fetch('/api/auth/create-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: formData.email.trim(),
              password: formData.password,
              firstName: formData.firstName,
              lastName: formData.lastName,
              username: formData.username.trim(),
              phone: normalizedPhone,
              accountType: formData.accountType,
              birthDate: formData.birthDate,
              location: formData.location,
              address: formData.address,
              county: formData.county,
              companyName: formData.companyName,
              cui: formData.cui,
              registrationNumber: formData.registrationNumber,
              city:
                formData.accountType === "piese_auto" && formData.pieseAutoAsDealer
                  ? formData.location
                  : undefined,
              pieseAutoSellAsCompany:
                formData.accountType === "piese_auto" ? formData.pieseAutoAsDealer : undefined,
              // Executor fields
              executorUnejNumber: formData.executorUnejNumber,
              executorChamber: formData.executorChamber,
              executorOfficeAddress: formData.executorOfficeAddress,
              executorOfficeLocation: formData.executorOfficeLocation,
              executorWebsite: formData.executorWebsite,
              // Terms and marketing consent
              acceptTerms: formData.acceptTerms,
              acceptMarketing: formData.acceptMarketing
            }),
          });

          const createUserResult = await createUserResponse.json();

          if (!createUserResult.success || !createUserResult.user) {
            setMessage({ type: "error", text: createUserResult.message || "Înregistrare eșuată." });
            return;
          }

          const user = createUserResult.user;
          setPendingUserId(user.id);

          // 1) Trimite ÎNTÂI codul de verificare (esențial) – apoi newsletter, ca să eviți rate-limit Resend și să primești ambele email-uri
          try {
            let resendConfig = null;
            if (typeof window !== 'undefined') {
              const savedConfig = localStorage.getItem('resend_config');
              if (savedConfig) {
                try {
                  resendConfig = JSON.parse(savedConfig);
                } catch (e) {
                  console.error('Error parsing resend_config:', e);
                }
              }
            }

            const response = await fetch('/api/auth/send-verification-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: formData.email.trim(),
                userId: user.id,
                config: resendConfig,
              }),
            });

            const result = await response.json();

            if (result.success) {
              setShowVerificationModal(true);
              setMessage({ type: "info", text: "Cod de verificare trimis pe email!" });
            } else {
              setMessage({ type: "error", text: result.message || "Eroare la trimiterea codului de verificare." });
            }
          } catch (err: any) {
            console.error('Error sending verification code:', err);
            setMessage({ type: "error", text: "Eroare la trimiterea codului de verificare." });
          }

          // 2) Abonare newsletter DUPĂ trimiterea codului (dacă e acceptMarketing)
          if (formData.acceptMarketing) {
            try {
              const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() || undefined;
              const newsletterResponse = await fetch('/api/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: formData.email.trim(),
                  name: fullName,
                }),
              });
              if (!newsletterResponse.ok) {
                debugWarn('[Auth Register] Newsletter subscription failed, but continuing');
              }
            } catch (newsletterError) {
              debugWarn('[Auth Register] Error subscribing to newsletter:', newsletterError);
            }
          }
        } catch (err: any) {
          console.error('Error creating user:', err);
          setMessage({ type: "error", text: err.message || "Eroare la crearea contului." });
        }
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "A apărut o eroare neașteptată." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (code: string, markCodeAccepted?: () => void) => {
    if (!pendingUserId) {
      throw new Error('Eroare: ID utilizator lipsă.');
    }

    // Normalize email
    const normalizedEmail = formData.email.trim().toLowerCase();

    debugLog('🔍 Client: Verifying code for:', normalizedEmail, 'Code:', code);

    const response = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        code: code
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Cod incorect.');
    }
    markCodeAccepted?.();

    // Code verified, sign in user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: formData.email.trim(),
      password: formData.password
    });

    if (signInError || !signInData?.session) {
      throw new Error('Eroare la autentificare după verificare.');
    }

    // Close modal
    setShowVerificationModal(false);
    setPendingUserId(null);

    // Get redirect path based on account type (din sesiunea după sign-in)
    const accountType = signInData.session.user.user_metadata?.account_type || 'private';
    const redirectParam = searchParams?.get?.('redirect');
    let defaultPath = '/dashboard';
    if (accountType === 'liquidator') defaultPath = '/dashboard/lichidator';
    else if (accountType === 'executor') defaultPath = '/dashboard/executor';
    else if (accountType === 'company' || accountType === 'business') defaultPath = '/dashboard/company';
    else if (accountType === 'piese_auto') defaultPath = '/dashboard/piese-auto';
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authRedirect');
      if (accountType === 'company' || accountType === 'business' || accountType === 'liquidator' || accountType === 'piese_auto') {
        localStorage.setItem('accountType', accountType);
      }
    }
    const redirectPath = typeof window !== 'undefined' 
      ? (localStorage.getItem('authRedirect') || redirectParam || defaultPath)
      : defaultPath;
    const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
    trackGoogleConversion("signup", { dedupeKey: signInData.session.user.id || "once" });
    router.replace(redirectPath);
  };

  const handleResendCode = async () => {
    if (!pendingUserId) {
      throw new Error('Eroare: ID utilizator lipsă.');
    }

    const response = await fetch('/api/auth/send-verification-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: formData.email.trim(),
        userId: pendingUserId
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Eroare la retrimiterea codului.');
    }

    setMessage({ type: "success", text: "Cod de verificare retrimis cu succes!" });
  };

  // Cooldown pentru resend pe pagină (când modalul e închis)
  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;
    const t = setInterval(() => setResendCooldownSeconds((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldownSeconds]);

  const handleResendFromPage = async () => {
    if (resendCooldownSeconds > 0) return;
    try {
      await handleResendCode();
      setResendCooldownSeconds(60);
    } catch {
      // mesajul de eroare e setat în handleResendCode
    }
  };

  return (
    <div className={`min-h-screen relative overflow-hidden transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-100 via-gray-50 to-white'
    }`}>
      {/* Background Image – pointer-events-none ca să nu blocheze formularul când meniul e deschis */}
      {isDarkMode && (
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-sm opacity-30 pointer-events-none"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2000&q=80')"
          }}
        ></div>
      )}
      
      {/* Dark Overlay – pointer-events-none ca formularul să poată fi completat și cu meniul deschis */}
      {isDarkMode && <div className="absolute inset-0 bg-black/40 pointer-events-none" aria-hidden />}
      
      {/* Content */}
      <div className="relative z-10">
        {/* Universal Header */}
        <Header
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />

        {/* Main Content */}
        <div className="flex items-center justify-center min-h-[calc(100vh-120px)] py-6 md:py-12">
          <div className="max-w-md w-full mx-3 md:mx-4">
            <div className="mb-4 md:mb-6 flex justify-center md:justify-start">
              <BackButton fallbackHref="/auth/select-type" label="Înapoi" className="shadow-md" />
            </div>

            {/* Auth Card */}
            <div className={`backdrop-blur-lg rounded-xl md:rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 border ${
              isDarkMode 
                ? 'bg-white/10 border-white/20' 
                : 'bg-white/90 border-gray-200'
            }`}>
              {/* Header - Modern Glassmorphism Design */}
              <div className={`p-5 md:p-8 text-center border-b ${
                isDarkMode ? 'border-white/20' : 'border-gray-200'
              }`}>
                {/* 4 cercuri: afișate doar la login fără type în URL; ascunse când e înregistrare cu type=private/executor/liquidator/company în URL */}
                {(() => {
                  const typeFromUrl = searchParams?.get?.('type') ?? null;
                  const isRegisterWithType = !isLogin && (
                    formData.accountType === 'executor' ||
                    formData.accountType === 'liquidator' ||
                    formData.accountType === 'company' ||
                    formData.accountType === 'piese_auto' ||
                    typeFromUrl === 'executor' ||
                    typeFromUrl === 'liquidator' ||
                    typeFromUrl === 'company' ||
                    typeFromUrl === 'piese_auto' ||
                    typeFromUrl === 'private'
                  );
                  return !isRegisterWithType;
                })() ? (
                <div className="flex items-center justify-center gap-3 md:gap-5 mb-5 md:mb-6">
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden flex-shrink-0 border-2 ${
                    isDarkMode ? 'border-white/20' : 'border-gray-200'
                  }`}>
                    <Image
                      src="/images/logo-unpir.png"
                      alt="UNPIR"
                      width={56}
                      height={56}
                      className="w-full h-full object-contain object-[55%_50%] p-1 scale-[0.8]"
                    />
                  </div>
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden flex-shrink-0 border-2 ${
                    isDarkMode ? 'border-white/20' : 'border-gray-200'
                  }`}>
                    <Image
                      src="/executori.jpeg"
                      alt="Executori"
                      width={56}
                      height={56}
                      className="w-full h-full object-cover scale-[0.8]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuthContext("private")}
                    className={`flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full flex-shrink-0 border-2 transition-all overflow-hidden ${
                      isDarkMode ? "border-white/20 hover:border-white/40" : "border-gray-200 hover:border-gray-300"
                    }`}
                    title="Utilizator privat"
                  >
                    <Image
                      src="/user.png"
                      alt="Utilizator privat"
                      width={56}
                      height={56}
                      className="w-full h-full object-contain p-1 scale-[0.8]"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthContext("business")}
                    className={`flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full flex-shrink-0 border-2 transition-all overflow-hidden ${
                      isDarkMode ? "border-white/20 hover:border-white/40" : "border-gray-200 hover:border-gray-300"
                    }`}
                    title="Business"
                  >
                    <Image
                      src="/company%20.png"
                      alt="Business"
                      width={56}
                      height={56}
                      className="w-full h-full object-contain p-1 scale-[0.8]"
                    />
                  </button>
                </div>
                ) : null}
                {/* Logo tip cont la înregistrare – fiecare tip are logo-ul lui */}
                {!isLogin && formData.accountType && (
                  <div className="flex justify-center mb-4">
                    <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex-shrink-0 border-2 ${
                      isDarkMode ? 'border-white/20' : 'border-gray-200'
                    }`}>
                      {formData.accountType === 'executor' && (
                        <Image src="/executori.jpeg" alt="Executor Judecătoresc" width={96} height={96} className="w-full h-full object-cover" />
                      )}
                      {formData.accountType === 'liquidator' && (
                        <Image src="/images/logo-unpir.png" alt="Lichidator" width={96} height={96} className="w-full h-full object-contain object-[55%_50%] p-1.5" />
                      )}
                      {formData.accountType === 'private' && (
                        <Image src="/user.png" alt="Cont Privat" width={96} height={96} className="w-full h-full object-contain p-1.5" />
                      )}
                      {formData.accountType === 'company' && (
                        <Image src="/company%20.png" alt="Cont Firmă" width={96} height={96} className="w-full h-full object-contain p-1.5" />
                      )}
                      {formData.accountType === 'piese_auto' && (
                        <div className="w-full h-full flex items-center justify-center bg-amber-500/20 text-amber-600 text-4xl">🔧</div>
                      )}
                    </div>
                  </div>
                )}
                <h2 className={`text-3xl md:text-4xl font-bold mb-3 md:mb-4 ${
                  isDarkMode 
                    ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent' 
                    : 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent'
                }`}>
                  {isLogin ? 'Autentificare' : 'Înregistrare'}
                </h2>
                {!isLogin && (formData.accountType === 'executor' || formData.accountType === 'liquidator' || formData.accountType === 'piese_auto') && (
                  <div className={`mb-3 md:mb-4 px-3 md:px-4 py-1.5 md:py-2 rounded-lg inline-block text-xs md:text-sm ${
                    isDarkMode 
                      ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' 
                      : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                  }`}>
                    <span className="font-semibold">
                      {formData.accountType === 'liquidator' ? 'Te înregistrezi ca Lichidator' : formData.accountType === 'piese_auto' ? 'Te înregistrezi ca Dealer Piese Auto' : 'Te înregistrezi ca Executor'}
                    </span>
                  </div>
                )}
                {isLogin && (
                  <p className={`text-base md:text-xl max-w-md mx-auto ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Bine ai venit înapoi! Accesează-ți contul pentru a continua
                  </p>
                )}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-5 md:p-8 space-y-5 md:space-y-6" noValidate>
                {message && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      message.type === "error"
                        ? isDarkMode 
                          ? "bg-red-500/20 text-red-200" 
                          : "bg-red-100 text-red-700"
                        : message.type === "success"
                        ? isDarkMode 
                          ? "bg-green-500/20 text-green-200" 
                          : "bg-green-100 text-green-700"
                        : isDarkMode 
                          ? "bg-blue-500/20 text-blue-200" 
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {message.text}
                  </div>
                )}
                {/* Un singur titlu pentru tot formularul – executor și lichidator, același design */}
                {!isLogin && (formData.accountType === 'liquidator' || formData.accountType === 'executor') && (
                  <h3 className={`text-base md:text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formData.accountType === 'liquidator' ? 'Date de identificare profesională (lichidator)' : 'Date de identificare profesională (executor)'}
                  </h3>
                )}

                {/* Înregistrare: rânduri câte 2 câmpuri, apoi email/parolă jos */}
                {!isLogin && (
                  <>
                    {/* Rând 1: Nume | Prenume */}
                    <div className="grid grid-cols-1 gap-3 md:gap-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nume</label>
                        <input
                          type="text"
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleInputChange}
                          className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                            isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          placeholder="Numele tău"
                          required={!isLogin}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Prenume</label>
                        <input
                          type="text"
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                            isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          placeholder="Prenumele tău"
                          required={!isLogin}
                        />
                      </div>
                    </div>

                    {/* Rând 2: Telefon | Data nașterii */}
                    {(formData.accountType === 'private' ||
                      (formData.accountType === 'piese_auto' && !formData.pieseAutoAsDealer)) && (
                      <div>
                        <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Username <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="username"
                          value={formData.username}
                          onChange={handleInputChange}
                          className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                            isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          placeholder="Ex: ion.popescu"
                          required={!isLogin}
                          autoCapitalize="none"
                          autoCorrect="off"
                        />
                        <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          3-30 caractere: litere, cifre, punct, underscore sau cratimă.
                        </p>
                      </div>
                    )}

                    {/* Rând 3: Telefon | Data nașterii */}
                    <div className="grid grid-cols-1 gap-3 md:gap-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Telefon</label>
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-2 px-2 md:px-3 py-2 md:py-3 rounded-lg border text-sm md:text-base ${
                            isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                          }`}>
                            <select
                              value={phoneCountry.code}
                              onChange={(e) => {
                                const found = countries.find(c => c.code === e.target.value);
                                if (found) setPhoneCountry(found);
                              }}
                              className={`appearance-none bg-transparent pr-1 cursor-pointer outline-none text-sm md:text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                            >
                              {countries.map((c) => (
                                <option key={c.code} value={c.code}>{c.flag} {c.dialCode}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="tel"
                            value={formatPhoneNumber(phoneNumber)}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "");
                              setPhoneNumber(digits.slice(0, 9));
                            }}
                            onBlur={(e) => {
                              const digits = e.target.value.replace(/\D/g, "");
                              setPhoneNumber(digits.slice(0, 9));
                            }}
                            className={`flex-1 px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                              isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            }`}
                            placeholder="712 345 678"
                            required={!isLogin}
                            maxLength={11}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Data nașterii</label>
                        <ModernDatePicker
                          value={formData.birthDate}
                          onChange={(date) => setFormData({ ...formData, birthDate: date })}
                          maxDate={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                          isDarkMode={isDarkMode}
                          placeholder="Selectează data nașterii"
                          required={!isLogin}
                        />
                      </div>
                    </div>

                    {/* Dealer Piese Auto: privat (persoană fizică) vs. firmă + CUI / ANAF */}
                    {formData.accountType === "piese_auto" && (
                      <div
                        className={`rounded-xl border p-4 ${
                          isDarkMode ? "border-amber-500/30 bg-amber-500/10" : "border-amber-200 bg-amber-50/90"
                        }`}
                      >
                        <p
                          className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-amber-100" : "text-gray-900"}`}
                        >
                          Cum vrei să vinzi pe Piese Auto
                        </p>
                        <p className={`text-xs mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                          Contul rămâne dealer Piese Auto; alegi dacă apare ca persoană fizică sau ca firmă.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 mb-4">
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((p) => ({
                                ...p,
                                pieseAutoAsDealer: false,
                                companyName: "",
                                cui: "",
                                registrationNumber: "",
                              }))
                            }
                            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                              !formData.pieseAutoAsDealer
                                ? isDarkMode
                                  ? "bg-amber-500 text-gray-900 shadow-md"
                                  : "bg-amber-500 text-white shadow-md"
                                : isDarkMode
                                  ? "bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600"
                                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            Persoană fizică (privat)
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData((p) => ({ ...p, pieseAutoAsDealer: true }))}
                            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                              formData.pieseAutoAsDealer
                                ? isDarkMode
                                  ? "bg-amber-500 text-gray-900 shadow-md"
                                  : "bg-amber-500 text-white shadow-md"
                                : isDarkMode
                                  ? "bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600"
                                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            Dealer firmă
                          </button>
                        </div>
                        {formData.pieseAutoAsDealer && (
                          <div className="space-y-3 pt-3 border-t border-amber-200/50 dark:border-white/10">
                            <div>
                              <label
                                className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                              >
                                CUI <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                name="cui"
                                value={formData.cui}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFormData((p) => ({ ...p, cui: v }));
                                  scheduleAnafLookupFromCuiValue(v);
                                }}
                                onBlur={(e) => flushAnafDebounceAndLookup(e.target.value)}
                                disabled={anafCompanyLookupLoading}
                                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm disabled:opacity-60 ${
                                  isDarkMode
                                    ? "bg-gray-700 border-gray-600 text-white"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                                placeholder="RO12345678 sau cifre"
                                autoComplete="off"
                              />
                              <p className={`mt-1 text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                                {anafCompanyLookupLoading
                                  ? "Se caută datele în ANAF…"
                                  : "De la 8 cifre în sus: după pauză la tastare sau la ieșirea din câmp, datele firmei se completează singure."}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                              >
                                Denumire firmă <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                name="companyName"
                                value={formData.companyName}
                                onChange={handleInputChange}
                                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm ${
                                  isDarkMode
                                    ? "bg-gray-700 border-gray-600 text-white"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                                placeholder="Denumirea societății"
                                required={formData.pieseAutoAsDealer}
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                                Reg. Comerț
                              </label>
                              <input
                                type="text"
                                name="registrationNumber"
                                value={formData.registrationNumber}
                                onChange={handleInputChange}
                                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm ${
                                  isDarkMode
                                    ? "bg-gray-700 border-gray-600 text-white"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                                placeholder="ex. J40/123/2020"
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                                Adresă sediu <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                name="address"
                                value={formData.address}
                                onChange={handleInputChange}
                                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm ${
                                  isDarkMode
                                    ? "bg-gray-700 border-gray-600 text-white"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                                placeholder="Stradă, număr, localitate"
                                required={formData.pieseAutoAsDealer}
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label
                                  className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                                >
                                  Județ <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  name="county"
                                  value={formData.county}
                                  onChange={handleInputChange}
                                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm ${
                                    isDarkMode
                                      ? "bg-gray-700 border-gray-600 text-white"
                                      : "bg-white border-gray-300 text-gray-900"
                                  }`}
                                  placeholder="ex. București"
                                  required={formData.pieseAutoAsDealer}
                                />
                              </div>
                              <div>
                                <label
                                  className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                                >
                                  Localitate <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  name="location"
                                  value={formData.location}
                                  onChange={handleInputChange}
                                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm ${
                                    isDarkMode
                                      ? "bg-gray-700 border-gray-600 text-white"
                                      : "bg-white border-gray-300 text-gray-900"
                                  }`}
                                  placeholder="ex. București, Sector 1"
                                  required={formData.pieseAutoAsDealer}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rând 3: la privat – Adresa, Județ, Localitate; la executor/lichidator – Localitate | Website */}
                    {(formData.accountType === 'private' ||
                      (formData.accountType === 'piese_auto' && !formData.pieseAutoAsDealer)) && (
                      <>
                        <div>
                          <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Adresa <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleInputChange}
                            className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                              isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            }`}
                            placeholder="Str., nr., bloc, scara, ap. (ex: Str. Exemplu nr. 10, bl. A, sc. 1, ap. 5)"
                            required={!isLogin}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:gap-4">
                          <div>
                            <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Județ <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              name="county"
                              value={formData.county}
                              onChange={handleInputChange}
                              className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                              }`}
                              placeholder="Ex: București, Ilfov, Cluj"
                              required={!isLogin}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Localitate <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              name="location"
                              value={formData.location}
                              onChange={handleInputChange}
                              className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                              }`}
                              placeholder="Ex: București, Sector 1 / Cluj-Napoca"
                              required={!isLogin}
                            />
                          </div>
                        </div>
                      </>
                    )}
                    {/* Executor / Lichidator: câmpuri profesionale câte 2 pe rând – fără titlu/separator în mijloc, același design ca lichidator */}
                    {(formData.accountType === 'executor' || formData.accountType === 'liquidator') && (
                      <>
                        {/* Certificat/UNEJ | Instanță/Cameră */}
                        <div className="grid grid-cols-1 gap-3 md:gap-4">
                          <div>
                            <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {formData.accountType === 'liquidator' ? 'Număr certificat / înregistrare lichidator' : 'Număr de înregistrare (UNEJ)'} <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              name="executorUnejNumber"
                              value={formData.executorUnejNumber}
                              onChange={handleInputChange}
                              className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                              }`}
                              placeholder={formData.accountType === 'liquidator' ? 'Ex: număr certificat / înregistrare' : 'Ex: 12345'}
                              required
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {formData.accountType === 'liquidator' ? 'Instanță / ONRC' : 'Camera Executorilor'} <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              name="executorChamber"
                              value={formData.executorChamber}
                              onChange={handleInputChange}
                              className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                              }`}
                              placeholder={formData.accountType === 'liquidator' ? 'Ex: Instanța de judecată / ONRC' : 'Ex: București, Brașov, Cluj'}
                              required
                            />
                          </div>
                        </div>
                        {/* Sediul biroului | Județul biroului */}
                        <div className="grid grid-cols-1 gap-3 md:gap-4">
                          <div>
                            <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {formData.accountType === 'liquidator' ? 'Sediul / adresa biroului de lichidare' : 'Sediul biroului executorului'} <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              name="executorOfficeAddress"
                              value={formData.executorOfficeAddress}
                              onChange={handleInputChange}
                              className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                              }`}
                              placeholder="Ex: Str. Exemplu nr. 1, București"
                              required
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Județul biroului <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              name="executorOfficeLocation"
                              value={formData.executorOfficeLocation}
                              onChange={handleInputChange}
                              className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                              }`}
                              placeholder="Ex: București, Sector 1"
                              required
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Executor / Lichidator: Localitate și Website – jos în form, deasupra Email */}
                {(formData.accountType === 'executor' || formData.accountType === 'liquidator') && (
                  <div className="grid grid-cols-1 gap-3 md:gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Localitate <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleInputChange}
                        className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                          isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                        placeholder="Oraș, Județ (ex: București, Sector 1)"
                        required
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Website (opțional)</label>
                      <input
                        type="url"
                        name="executorWebsite"
                        value={formData.executorWebsite}
                        onChange={handleInputChange}
                        className={`w-full px-3.5 md:px-4 py-2.5 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                          isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                        placeholder="Ex: https://www.example.ro"
                      />
                    </div>
                  </div>
                )}

                {/* Email, Parolă, Confirmare – pe desktop lat (2 col la login, 3 col la register); pe mobil o coloană */}
                <div className="grid grid-cols-1 gap-3 md:gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="Emailul tău"
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={`block text-sm font-medium transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Parolă
                    </label>
                    {!isLogin && (
                      <button
                        type="button"
                        onClick={() => {
                          const newPassword = generateStrongPassword();
                          setFormData({
                            ...formData,
                            password: newPassword,
                            confirmPassword: newPassword
                          });
                          setShowPassword(true);
                          setShowConfirmPassword(true);
                        }}
                        className={`text-xs font-medium transition-colors hover:underline ${
                          isDarkMode 
                            ? 'text-blue-400 hover:text-blue-300' 
                            : 'text-blue-600 hover:text-blue-700'
                        }`}
                      >
                        <i className="ri-refresh-line mr-1"></i>
                        Generează parolă
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 ${!isLogin ? 'pr-24' : 'pr-12'} rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                      }`}
                      placeholder="Parola"
                      required
                      minLength={10}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      suppressHydrationWarning
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                      {!isLogin && (
                        <button
                          type="button"
                          onClick={() => {
                            const newPassword = generateStrongPassword();
                            setFormData({
                              ...formData,
                              password: newPassword,
                              confirmPassword: newPassword
                            });
                            setShowPassword(true);
                            setShowConfirmPassword(true);
                          }}
                          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                            isDarkMode 
                              ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' 
                              : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                          }`}
                          title="Generează parolă puternică"
                        >
                          <i className="ri-magic-line"></i>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="px-3 flex items-center text-gray-400 hover:text-gray-200"
                        aria-label={showPassword ? "Ascunde parola" : "Afișează parola"}
                      >
                        <i className={showPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                  </div>
                  {!isLogin && formData.password.trim().length > 0 && (
                    <div className="mt-2 space-y-1">
                      {PASSWORD_REQUIREMENTS.map((req) => {
                        const met = req.test(formData.password);
                        return (
                          <div key={req.label} className="flex items-center gap-2 text-xs">
                            <span className={met ? "text-green-400" : "text-gray-400"}>
                              <i className={met ? "ri-checkbox-circle-line" : "ri-checkbox-blank-circle-line"}></i>
                            </span>
                            <span className={met ? "text-green-300" : "text-gray-400"}>{req.label}</span>
                          </div>
                        );
                      })}
                      <div className={`text-xs font-semibold ${passwordStrengthLabel(calculatePasswordScore(formData.password)).color}`}>
                        {passwordStrengthLabel(calculatePasswordScore(formData.password)).label}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        <i className="ri-information-line mr-1"></i>
                        Sugestie: Minim 10 caractere, incluzând litere mici, litere mari, cifre și caractere speciale
                      </div>
                    </div>
                  )}
                </div>

                {/* Link "Ai uitat parola?" - doar pentru login, după câmpul de parolă */}
                {isLogin && (
                  <div className="flex justify-end -mt-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className={`text-sm font-medium transition-colors hover:underline ${
                        isDarkMode 
                          ? 'text-blue-400 hover:text-blue-300' 
                          : 'text-blue-600 hover:text-blue-700'
                      }`}
                    >
                      Ai uitat parola?
                    </button>
                  </div>
                )}

                {!isLogin && (
                  <div>
                    <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Confirmă Parola
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 pr-12 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                        placeholder="Confirmă parola"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-200"
                        aria-label={showConfirmPassword ? "Ascunde parola" : "Afișează parola"}
                      >
                        <i className={showConfirmPassword ? "ri-eye-off-line" : "ri-eye-line"}></i>
                      </button>
                    </div>
                    {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                      <p className="text-xs text-red-400 mt-1">Parolele nu coincid.</p>
                    )}
                  </div>
                )}

                </div>

                {/* Terms and Marketing Checkboxes - Only for registration */}
                {!isLogin && (
                  <div className="space-y-3">
                    {/* Required: Terms and Conditions */}
                    <div>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="acceptTerms"
                          name="acceptTerms"
                          checked={formData.acceptTerms}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, acceptTerms: e.target.checked }));
                            // Marchează câmpul ca touched când utilizatorul interacționează cu el
                            setTouchedFields(prev => new Set(prev).add('acceptTerms'));
                            // Clear error message when checkbox is checked
                            if (e.target.checked && message?.type === 'error' && message?.text?.includes('Termenii')) {
                              setMessage(null);
                            }
                          }}
                          onBlur={() => {
                            // Marchează câmpul ca touched când utilizatorul iese din el
                            setTouchedFields(prev => new Set(prev).add('acceptTerms'));
                          }}
                          className={`mt-1 w-5 h-5 rounded border-2 transition-colors cursor-pointer ${
                            isDarkMode
                              ? 'bg-gray-700 border-gray-600 checked:bg-blue-600 checked:border-blue-600'
                              : 'bg-white border-gray-300 checked:bg-blue-600 checked:border-blue-600'
                          } focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                          required
                        />
                        <label htmlFor="acceptTerms" className={`text-sm leading-relaxed cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Prin înregistrare, confirm că accept{' '}
                          <a
                            href="/termeni"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-medium underline transition-colors ${
                              isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Termenii și Condițiile
                          </a>{' '}
                          gobid.ro, că am citit{' '}
                          <a
                            href="/politica-confidentialitate"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-medium underline transition-colors ${
                              isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Politica de confidențialitate
                          </a>
                          {' '}și că am peste 18 ani.
                          <span className="text-red-500 ml-1">*</span>
                        </label>
                      </div>
                      {!formData.acceptTerms && touchedFields.has('acceptTerms') && (
                        <p className="text-xs text-red-400 mt-2 ml-8">
                          Acest câmp este obligatoriu. Trebuie să accepți Termenii și Condițiile și Politica de confidențialitate pentru a continua.
                        </p>
                      )}
                    </div>

                    {/* Optional: Marketing Communications */}
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="acceptMarketing"
                        name="acceptMarketing"
                        checked={formData.acceptMarketing}
                        onChange={(e) => setFormData(prev => ({ ...prev, acceptMarketing: e.target.checked }))}
                        className={`mt-1 w-5 h-5 rounded border-2 transition-colors cursor-pointer ${
                          isDarkMode
                            ? 'bg-gray-700 border-gray-600 checked:bg-blue-600 checked:border-blue-600'
                            : 'bg-white border-gray-300 checked:bg-blue-600 checked:border-blue-600'
                        } focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                      />
                      <label htmlFor="acceptMarketing" className={`text-sm leading-relaxed cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Doresc să primesc oferte personalizate și să fiu primul care află despre ultimele noutăți de la gobid.ro prin e-mail.
                      </label>
                    </div>
                  </div>
                )}

                <ButtonWithIcon
                  type="submit"
                  disabled={isSubmitting}
                  label={isSubmitting ? (isLogin ? 'Se autentifică...' : 'Se înregistrează...') : (isLogin ? 'Autentificare' : 'Înregistrare')}
                  className={`text-white shadow-xl hover:shadow-2xl ${
                    !isLogin && formData.accountType === 'private'
                      ? 'bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600'
                      : !isLogin && formData.accountType === 'executor'
                      ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700'
                      : !isLogin && formData.accountType === 'liquidator'
                      ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-700 hover:via-orange-700 hover:to-amber-700'
                      : !isLogin && formData.accountType === 'piese_auto'
                      ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-600 hover:via-orange-600 hover:to-orange-600'
                      : 'bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700'
                  }`}
                />
              </form>

              {/* Social Login Section - Outside Form (ascuns la executor și lichidator) */}
              {formData.accountType !== 'executor' && formData.accountType !== 'liquidator' && formData.accountType !== 'piese_auto' && (
              <div className="px-5 md:px-8 pb-5 md:pb-8 relative" style={{ zIndex: 100 }}>
                {/* Divider */}
                <div className="relative my-5 md:my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className={`w-full border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}></div>
                  </div>
                  <div className="relative flex justify-center text-xs md:text-sm">
                    <span className={`px-3 md:px-4 backdrop-blur-sm ${
                      isDarkMode 
                        ? 'bg-white/10 text-gray-400' 
                        : 'bg-gray-50 text-gray-600'
                    }`}>
                      sau
                    </span>
                  </div>
                </div>

                {/* Google Sign In Button */}
                <div 
                  className="relative"
                  style={{ zIndex: 1000 }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    onClick={() => initiateGoogleAuth()}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2.5 md:gap-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 py-2.5 md:py-3 px-3.5 md:px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] border-2 border-gray-300 hover:border-gray-400 cursor-pointer relative text-sm md:text-base group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      pointerEvents: 'auto',
                      WebkitTapHighlightColor: 'rgba(0,0,0,0.1)',
                      touchAction: 'manipulation',
                      zIndex: 1000,
                      position: 'relative'
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2.5 md:gap-3">
                      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span className="font-medium">{isLogin ? 'Continuă cu Google' : 'Înregistrează-te cu Google'}</span>
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  </button>
                </div>

                {/* Facebook Sign In Button – ascuns deocamdată */}
                {false && (
                <div 
                  className="relative mt-3"
                  style={{ zIndex: 1000 }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    onClick={() => initiateFacebookAuth(facebookAppId)}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2.5 md:gap-3 bg-gradient-to-r from-[#1877F2] to-[#166FE5] hover:from-[#166FE5] hover:to-[#1457B2] active:from-[#1457B2] active:to-[#1877F2] text-white py-2.5 md:py-3 px-3.5 md:px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 shadow-lg hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] border-2 border-[#1877F2] hover:border-[#166FE5] cursor-pointer relative text-sm md:text-base group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      pointerEvents: 'auto',
                      WebkitTapHighlightColor: 'rgba(0,0,0,0.1)',
                      touchAction: 'manipulation',
                      zIndex: 1000,
                      position: 'relative'
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2.5 md:gap-3">
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <span className="font-medium">{isLogin ? 'Continuă cu Facebook' : 'Înregistrează-te cu Facebook'}</span>
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  </button>
                </div>
                )}

                {/* Apple Sign In Button */}
                <div
                  className="relative mt-3"
                  style={{ zIndex: 1000 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => initiateAppleAuth()}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2.5 md:gap-3 bg-black hover:bg-gray-900 active:bg-gray-800 text-white py-2.5 md:py-3 px-3.5 md:px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-transparent shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] border-2 border-gray-800 hover:border-gray-700 cursor-pointer relative text-sm md:text-base group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      pointerEvents: 'auto',
                      WebkitTapHighlightColor: 'rgba(0,0,0,0.1)',
                      touchAction: 'manipulation',
                      zIndex: 1000,
                      position: 'relative',
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2.5 md:gap-3">
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                      </svg>
                      <span className="font-medium">{isLogin ? 'Continuă cu Apple' : 'Înregistrează-te cu Apple'}</span>
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  </button>
                </div>
              </div>
              )}

              {/* Toggle Auth Type */}
              <div className="px-8 pb-8 pt-0">
                <div className={`text-center border-t pt-6 ${
                  isDarkMode ? 'border-white/10' : 'border-gray-200'
                }`}>
                  <p className={`text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {isLogin ? 'Nu ai cont?' : 'Ai deja cont?'}
                  </p>
                  {isLogin ? (
                    <a
                      href="/auth/select-type"
                      className={`mt-2 font-medium text-sm transition-colors hover:text-yellow-400 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      Înregistrează-te aici
                    </a>
                  ) : (
                    <a
                      href="/auth"
                      className={`mt-2 font-medium text-sm transition-colors hover:text-yellow-400 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      Autentifică-te aici
                    </a>
                  )}
                </div>
              </div>

              {/* Modal "Ai uitat parola?" */}
              {showForgotPassword && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className={`rounded-xl p-6 w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className={`text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Resetare parolă
                      </h3>
                      <button
                        onClick={() => {
                          setShowForgotPassword(false);
                          setForgotPasswordEmail("");
                          setMessage(null);
                        }}
                        className={`p-1 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        <i className="ri-close-line text-xl"></i>
                      </button>
                    </div>

                    <div className="mb-4">
                      <label className={`block text-sm md:text-sm font-medium mb-2 md:mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder="Introdu email-ul tău"
                        className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleForgotPassword();
                          }
                        }}
                      />
                      <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Vom trimite un email cu instrucțiuni pentru resetarea parolei.
                      </p>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() => {
                          setShowForgotPassword(false);
                          setForgotPasswordEmail("");
                          setMessage(null);
                        }}
                        className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                      >
                        Anulează
                      </button>
                      <button
                        onClick={handleForgotPassword}
                        disabled={isSendingReset || !forgotPasswordEmail}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSendingReset ? 'Se trimite...' : 'Trimite email'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Banner: Retrimite cod / Verifică cod când modalul e închis dar verificarea e în așteptare */}
            {pendingUserId && !showVerificationModal && (
              <div
                className={`mt-4 overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur-xl ${
                  isDarkMode
                    ? 'border-white/15 bg-black/70 shadow-black/40'
                    : 'border-gray-200 bg-white/95 shadow-gray-200/70'
                }`}
              >
                <div className="mb-3 flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      isDarkMode ? 'bg-white text-black' : 'bg-black text-white'
                    }`}
                    aria-hidden
                  >
                    #
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-950'}`}>
                      Verificarea contului este în așteptare
                    </p>
                    <p className={`mt-0.5 text-xs leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Codul a fost trimis la <strong>{formData.email.trim()}</strong>. Poți redeschide verificarea sau retrimite codul.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setShowVerificationModal(true)}
                    className={`h-11 rounded-full px-4 text-sm font-semibold transition-all ${
                      isDarkMode
                        ? 'bg-white text-black hover:bg-gray-200'
                        : 'bg-black text-white hover:bg-gray-800'
                    }`}
                  >
                    Verifică codul
                  </button>
                  <button
                    type="button"
                    onClick={handleResendFromPage}
                    disabled={resendCooldownSeconds > 0}
                    className={`h-11 rounded-full border px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
                      isDarkMode
                        ? 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                        : 'border-gray-200 bg-white text-gray-950 hover:bg-gray-100'
                    }`}
                  >
                    {resendCooldownSeconds > 0 ? `Retrimite în ${resendCooldownSeconds}s` : 'Retrimite codul'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer – componentă din components/DashboardFooter */}
        <div className="relative z-10 mt-16">
          <DashboardFooter isDarkMode={isDarkMode} />
        </div>
      </div>

      {/* Verification Code Modal */}
      <VerificationCodeModal
        isOpen={showVerificationModal}
        email={formData.email.trim()}
        onClose={() => {
          setShowVerificationModal(false);
          /* Nu ștergem pendingUserId – utilizatorul poate folosi "Retrimite codul" de pe pagină */
        }}
        onVerify={handleVerifyCode}
        onResend={handleResendCode}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}
