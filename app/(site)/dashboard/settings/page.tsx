"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Hammer, { HammerIcon } from "@/components/Hammer";
import { UserIcon, LockClosedIcon, NotificationIcon, CheckIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import DashboardFooter from "@/components/DashboardFooter";
import { supabase } from "@/lib/supabase";
import {
  readAccountTypeWithoutRefresh,
  resolveAccountTypeFromJwtOnly,
  hasDashboardLocalAuthEvidence,
  looksLikeSupabaseUserId,
} from "@/lib/auth/resolveAccountType";
import {
  getSupabaseSessionRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPieseAuto = searchParams.get("context") === "piese-auto";
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'România',
    postalCode: '',
    avatar: '',
    // Câmpuri firmă (doar pentru cont business)
    companyName: '',
    cui: '',
    registrationNumber: '',
    county: '',
    contactPerson: '',
    companyAddress: ''
  });
  const [isBusiness, setIsBusiness] = useState(false);
  /** Din JWT (private, piese_auto, business, …) — folosit pentru modul vânzător piese-auto */
  const [authAccountType, setAuthAccountType] = useState<string | undefined>(undefined);
  /** Doar conturi `piese_auto`: vânzare ca persoană fizică vs. firmă (salvat în metadata) */
  const [pieseAutoSellAsCompany, setPieseAutoSellAsCompany] = useState(false);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  // Sincronizează tab-ul cu URL (?tab=delete-account etc.)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'delete-account' || tab === 'profile' || tab === 'password' || tab === 'notifications' || tab === 'privacy') {
      setActiveTab(tab);
    }
  }, [searchParams]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [newsletterEnabled, setNewsletterEnabled] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [newEmailForChange, setNewEmailForChange] = useState('');
  const [emailChangeCodeSent, setEmailChangeCodeSent] = useState(false);
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [isLoadingEmailChange, setIsLoadingEmailChange] = useState(false);
  /** Email de logare din Supabase Auth (sursa de adevăr), nu din localStorage */
  const [authEmail, setAuthEmail] = useState('');
  /** Pe mobil: "side" = meniu lateral stânga, "bottom" = meniu jos (footer) */
  const [mobileNavMode, setMobileNavMode] = useState<"side" | "bottom">("side");
  /** Completare date firmă din ANAF (ca la /auth/register/company) */
  const [anafCompanyLookupLoading, setAnafCompanyLookupLoading] = useState(false);
  const anafLookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anafLookupInFlightRef = useRef(false);

  /** Cont business JWT sau dealer piese-auto care a ales „vând ca firmă” */
  const sellAsCompanyProfile = useMemo(
    () => isBusiness || (authAccountType === "piese_auto" && pieseAutoSellAsCompany),
    [isBusiness, authAccountType, pieseAutoSellAsCompany],
  );

  const handleDeleteAccount = () => {
    setDeleteAccountError(null);
    setShowDeleteAccountModal(true);
  };

  const confirmDeleteAccount = async () => {
    try {
      setIsLoading(true);
      setMessage({ type: '', text: '' });
      setDeleteAccountError(null);

      const session = await getSupabaseSessionRobust(supabase);
      if (!session?.access_token) {
        setDeleteAccountError('Trebuie să fii autentificat pentru a șterge contul.');
        return;
      }

      const resp = await dashboardApiFetch('/api/auth/delete-account', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'user_request' }),
      });

      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || !(result as any)?.success) {
        const msg = (result as any)?.message || 'Nu am putut șterge contul. Încearcă din nou.';
        setDeleteAccountError(msg);
        return;
      }

      try {
        await supabase.auth.signOut({ scope: 'local' } as any);
      } catch {
        // ignore
      }

      if (typeof window !== 'undefined') {
        // Clear auth + user cached state (UniversalHeader has localStorage fallback)
        const keepKeys = new Set(['darkMode', 'showHeaderNameDesktop']);
        for (const k of Object.keys(localStorage)) {
          if (!keepKeys.has(k)) localStorage.removeItem(k);
        }
        for (const k of Object.keys(sessionStorage)) {
          sessionStorage.removeItem(k);
        }
        // Also remove any Supabase auth token keys (project-ref specific)
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
          if (k.startsWith('supabase.auth.')) localStorage.removeItem(k);
        }
        window.location.replace('/auth?message=account_deleted');
      }
    } catch (err: any) {
      setDeleteAccountError(err?.message || 'Eroare la ștergerea contului.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load dark mode and mobile nav mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
      const navMode = localStorage.getItem('gobid_mobile_nav_mode');
      if (navMode === 'side' || navMode === 'bottom') setMobileNavMode(navMode);
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

  // Încarcă profilul din DB: prioritate GET /api/user/profile (server), apoi Supabase client
  const applyProfileToState = (data: {
    firstName?: string; lastName?: string; username?: string; email?: string; phone?: string;
    avatar?: string; address?: string; city?: string; country?: string; postalCode?: string;
    companyName?: string; cui?: string; companyAddress?: string;
    registrationNumber?: string; county?: string; contactPerson?: string;
  }, userId: string | null) => {
    const str = (v: unknown) => (v != null && typeof v === 'string' ? v : '');
    const updated = {
      firstName: str(data.firstName),
      lastName: str(data.lastName),
      username: str(data.username),
      email: str(data.email),
      phone: formatPhoneNumber(str(data.phone)) || '',
      avatar: str(data.avatar),
      address: str(data.address),
      city: str(data.city),
      country: str(data.country) || 'România',
      postalCode: str(data.postalCode),
      companyName: str(data.companyName),
      cui: str(data.cui),
      companyAddress: str(data.companyAddress),
      registrationNumber: str(data.registrationNumber),
      county: str(data.county),
      contactPerson: str(data.contactPerson),
    };
    setUserInfo(prev => ({ ...prev, ...updated }));
    if (typeof window !== 'undefined' && userId) {
      try {
        const stored = localStorage.getItem('userInfo');
        const storedObj = stored ? JSON.parse(stored) : {};
        localStorage.setItem('userInfo', JSON.stringify({ ...storedObj, ...updated, supabaseUserId: userId }));
        window.dispatchEvent(new CustomEvent('userInfoUpdated'));
      } catch (_) {}
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadUserData = async (opts?: { forExecutorRoute?: boolean }) => {
      const forExecutorRoute = opts?.forExecutorRoute ?? false;
      try {
        const { user, accountType } = forExecutorRoute
          ? await resolveAccountTypeFromJwtOnly(supabase)
          : await readAccountTypeWithoutRefresh(supabase);
        let userId: string | null = user?.id ?? null;

        if (user) {
          setCurrentUserId(user.id);
          setAuthEmail(user.email ?? '');
          setAuthAccountType(accountType);
          setIsBusiness(accountType === 'business' || accountType === 'company');
          if (accountType !== 'piese_auto') {
            setPieseAutoSellAsCompany(false);
          }
          if (forExecutorRoute) {
            if (accountType === 'liquidator') {
              if (typeof window !== "undefined" && !cancelled) {
                const q = window.location.search || "";
                window.location.replace(`/dashboard/lichidator/settings${q}`);
              }
              return;
            }
            if (accountType === 'executor') {
              if (typeof window !== "undefined" && !cancelled) {
                const q = window.location.search || "";
                window.location.replace(`/dashboard/executor/settings${q}`);
              }
              return;
            }
          }
        }

        if (!userId && typeof window !== "undefined") {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          if (savedUserInfo) {
            try {
              const parsed = JSON.parse(savedUserInfo) as Record<string, unknown>;
              const fromKey =
                savedSupabaseUserId && looksLikeSupabaseUserId(savedSupabaseUserId)
                  ? savedSupabaseUserId
                  : null;
              const fromParsed =
                (looksLikeSupabaseUserId(parsed.supabaseUserId) ? String(parsed.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(parsed.userId) ? String(parsed.userId) : null) ||
                (looksLikeSupabaseUserId(parsed.id) ? String(parsed.id) : null);
              userId = fromKey || fromParsed;
              if (userId) setCurrentUserId(userId);
              setUserInfo(prev => ({ ...prev, ...parsed }));
              const em = typeof parsed.email === 'string' ? parsed.email : '';
              if (em) {
                const newsletterPref = localStorage.getItem(`newsletter_enabled_${em}`);
                setNewsletterEnabled(newsletterPref === 'true');
              }
            } catch (e) {
              console.error('Error parsing userInfo from localStorage:', e);
            }
          }
        }

        if (!userId) {
          if (typeof window !== "undefined") {
            const savedAdminInfo = localStorage.getItem('adminInfo');
            if (savedAdminInfo) {
              try {
                const adminInfo = JSON.parse(savedAdminInfo);
                if (adminInfo.isAdmin || adminInfo.role === 'manager') return;
              } catch (_) {}
            }
            if (hasDashboardLocalAuthEvidence()) {
              return;
            }
            window.location.href = "/auth?mode=login";
          }
          return;
        }

        const meta = user?.user_metadata || {};
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name,last_name,phone,avatar_url,address,city,country,postal_code,metadata,company_name,company_cui,company_address,email")
          .eq("user_id", userId)
          .maybeSingle();

        if (profile && !cancelled) {
          const metadata = (profile.metadata || {}) as Record<string, unknown>;
          const pac = metadata.piese_auto_sell_as_company;
          if (accountType === "piese_auto") {
            setPieseAutoSellAsCompany(pac === true || pac === "true");
          }
          applyProfileToState({
            firstName: (profile.first_name as string) || (meta.first_name as string) || '',
            lastName: (profile.last_name as string) || (meta.last_name as string) || '',
            username: String(metadata.username ?? '') || (meta.username as string) || '',
            email: (profile.email as string) || user?.email || '',
            phone: (profile.phone as string) || (meta.phone as string) || '',
            avatar: profile.avatar_url || '',
            address: profile.address || '',
            city: (profile.city as string) || String(metadata.city ?? '') || (meta.city as string) || (meta.company_city as string) || '',
            country: (profile.country as string) || String(metadata.country ?? '') || (meta.country as string) || 'România',
            postalCode: (profile.postal_code as string) || String(metadata.postal_code ?? ''),
            companyName: profile.company_name || (meta.company_name as string) || '',
            cui: profile.company_cui || (meta.cui as string) || '',
            companyAddress: profile.company_address || (meta.company_address as string) || '',
            registrationNumber: String(metadata.registration_number ?? ''),
            county: String(metadata.county ?? '') || (meta.company_county as string) || '',
            contactPerson: String(metadata.contact_person ?? '') || (profile.first_name as string) || (meta.first_name as string) || '',
          }, userId);
        } else if (!profile && !cancelled && user) {
          applyProfileToState({
            firstName: (meta.first_name as string) || '',
            lastName: (meta.last_name as string) || '',
            username: (meta.username as string) || '',
            email: user.email || '',
            phone: (meta.phone as string) || '',
            avatar: (meta.avatar_url as string) || '',
            address: (meta.address as string) || (meta.company_address as string) || '',
            city: (meta.city as string) || (meta.company_city as string) || '',
            country: (meta.country as string) || 'România',
            postalCode: (meta.postal_code as string) || '',
            companyName: (meta.company_name as string) || '',
            cui: (meta.cui as string) || '',
            companyAddress: (meta.company_address as string) || '',
            registrationNumber: (meta.registration_number as string) || '',
            county: (meta.company_county as string) || '',
            contactPerson: (meta.contact_person as string) || (meta.first_name as string) || '',
          }, userId);
        }

        if (user?.email) {
          const newsletterPref = localStorage.getItem(`newsletter_enabled_${user.email}`);
          setNewsletterEnabled(newsletterPref === 'true');
        }
      } catch (error) {
        console.error('[Settings] Error loading user data:', error);
      } finally {
        if (!cancelled) setIsPageLoading(false);
      }
    };

    void loadUserData({ forExecutorRoute: true });
    const retryTimer = setTimeout(() => {
      void loadUserData({ forExecutorRoute: true });
    }, 1200);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          void loadUserData({ forExecutorRoute: event === "SIGNED_IN" });
        }
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setUserInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  /** Completare automată din ANAF (fără buton), același contract ca `/auth/register/company`. */
  const runCompanyAnafLookup = useCallback(async (cuiRaw: string) => {
    const trimmed = cuiRaw.trim();
    const digits = trimmed.replace(/\D/g, "");
    if (!trimmed || digits.length < 8 || digits.length > 10) return;
    if (anafLookupInFlightRef.current) return;
    anafLookupInFlightRef.current = true;

    setAnafCompanyLookupLoading(true);
    setMessage({ type: "", text: "" });
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
      setUserInfo((prev) => ({
        ...prev,
        companyName: (typeof data.denumire === "string" && data.denumire.trim()) || prev.companyName,
        cui: (typeof data.cui === "string" && data.cui.trim()) || prev.cui,
        registrationNumber:
          (typeof data.nrRegCom === "string" && data.nrRegCom.trim()) || prev.registrationNumber,
        city: (typeof data.localitate === "string" && data.localitate.trim()) || prev.city,
        county: (typeof data.judet === "string" && data.judet.trim()) || prev.county,
        companyAddress: (typeof data.adresa === "string" && data.adresa.trim()) || prev.companyAddress,
      }));
      setMessage({
        type: "success",
        text: denumire
          ? "Date completate din ANAF. Verifică și apasă „Salvează Modificările”."
          : "Răspuns ANAF primit; verifică câmpurile și salvează.",
      });
      setTimeout(() => setMessage({ type: "", text: "" }), 5000);
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

  // Format strict 07xx xxx xxx (doar România, 10 cifre)
  const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber) return '';
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length === 0) return '';
    let rest = digits;
    if (rest.startsWith('40')) rest = '0' + rest.slice(2);
    else if (!rest.startsWith('0')) rest = '0' + rest;
    rest = rest.slice(0, 10);
    if (rest.length <= 4) return rest;
    if (rest.length <= 7) return `${rest.slice(0, 4)} ${rest.slice(4)}`;
    return `${rest.slice(0, 4)} ${rest.slice(4, 7)} ${rest.slice(7)}`;
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // getSession singur poate fi gol după navigare; refresh + getUser restabilesc JWT pentru RLS
      const authSession = await getSupabaseSessionRobust(supabase);
      const user = authSession?.user ?? null;

      let userId: string | null = user?.id ?? null;

      if (!userId) {
        const savedUserInfo = localStorage.getItem('userInfo');
        const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
        try {
          userId =
            savedSupabaseUserId ||
            (savedUserInfo ? (JSON.parse(savedUserInfo) as { supabaseUserId?: string }).supabaseUserId : null) ||
            null;
        } catch {
          userId = savedSupabaseUserId || null;
        }

        if (!userId) {
          setMessage({ type: 'error', text: 'Nu ești autentificat. Te rugăm să te conectezi din nou.' });
          setIsLoading(false);
          return;
        }
      }

      // Upsert profile direct in Supabase, same approach as executor settings
      const profileData: any = {
        user_id: userId,
        first_name: sellAsCompanyProfile ? (userInfo.contactPerson || null) : (userInfo.firstName || null),
        last_name: sellAsCompanyProfile ? null : (userInfo.lastName || null),
        phone: userInfo.phone || null,
        avatar_url: userInfo.avatar || null,
        address: sellAsCompanyProfile ? null : (userInfo.address || null),
        email: userInfo.email?.trim() || null,
        city: userInfo.city || null,
        country: userInfo.country || 'România',
        postal_code: userInfo.postalCode || null,
      };

      if (!sellAsCompanyProfile) {
        const username = (userInfo.username || '').trim();
        if (!username) {
          setMessage({ type: 'error', text: 'Username-ul este obligatoriu.' });
          setIsLoading(false);
          return;
        }
        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
          setMessage({
            type: 'error',
            text: 'Username invalid. Folosește 3-30 caractere: litere, cifre, punct, underscore sau cratimă.'
          });
          setIsLoading(false);
          return;
        }
      }

      if (
        authAccountType === "piese_auto" &&
        pieseAutoSellAsCompany &&
        (!userInfo.companyName?.trim() ||
          !userInfo.contactPerson?.trim() ||
          !userInfo.cui?.trim())
      ) {
        setMessage({
          type: "error",
          text: "Pentru vânzare ca firmă completează: denumire firmă, persoană de contact și CUI.",
        });
        setIsLoading(false);
        return;
      }

      // Câmpuri firmă (cont business JWT sau dealer piese-auto ca firmă)
      if (sellAsCompanyProfile) {
        profileData.company_name = userInfo.companyName || null;
        profileData.company_cui = userInfo.cui || null;
        profileData.company_address = userInfo.companyAddress || null;
      } else if (authAccountType === "piese_auto" && !pieseAutoSellAsCompany) {
        profileData.company_name = null;
        profileData.company_cui = null;
        profileData.company_address = null;
      }

      // Metadata: username (în user_profiles.metadata) + city, country, email, etc.
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('metadata')
        .eq('user_id', userId)
        .maybeSingle();
      const existingMetadata = (existingProfile?.metadata as Record<string, unknown>) || {};
      const metadata: Record<string, unknown> = { ...existingMetadata };
      if (!sellAsCompanyProfile && userInfo.username?.trim()) metadata.username = userInfo.username.trim();
      if (userInfo.city) metadata.city = userInfo.city;
      if (userInfo.email) metadata.email = userInfo.email;
      if (sellAsCompanyProfile) {
        metadata.registration_number = userInfo.registrationNumber || null;
        metadata.county = userInfo.county || null;
        metadata.contact_person = userInfo.contactPerson || null;
      }
      if (authAccountType === "piese_auto") {
        metadata.piese_auto_sell_as_company = pieseAutoSellAsCompany;
      }
      profileData.metadata = metadata;

      const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('[Settings] Error saving profile directly to Supabase:', upsertError);
        setMessage({ type: 'error', text: upsertError.message || 'A apărut o eroare la actualizarea profilului. Te rugăm să încerci din nou.' });
        setIsLoading(false);
        return;
      }

      // Reîncarcă profilul complet din DB ca datele să rămână salvate și sincronizate
      if (userId && user) {
        const { data: freshProfile } = await supabase
          .from('user_profiles')
          .select('first_name,last_name,phone,avatar_url,address,city,country,postal_code,metadata,email,company_name,company_cui,company_address')
          .eq('user_id', userId)
          .maybeSingle();
        if (freshProfile) {
          const meta = (freshProfile.metadata as Record<string, unknown>) || {};
          if (authAccountType === "piese_auto") {
            const pac = meta.piese_auto_sell_as_company;
            setPieseAutoSellAsCompany(pac === true || pac === "true");
          }
          const savedState = {
            firstName: (freshProfile.first_name as string) ?? '',
            lastName: (freshProfile.last_name as string) ?? '',
            username: (meta.username as string) ?? '',
            phone: formatPhoneNumber((freshProfile.phone as string) ?? '') || '',
            email: (freshProfile.email as string) ?? user?.email ?? '',
            address: (freshProfile.address as string) ?? '',
            city: (freshProfile.city as string) ?? (meta.city as string) ?? '',
            country: (freshProfile.country as string) ?? (meta.country as string) ?? 'România',
            postalCode: (freshProfile.postal_code as string) ?? (meta.postal_code as string) ?? '',
            avatar: (freshProfile.avatar_url as string) ?? '',
            companyName: (freshProfile.company_name as string) ?? '',
            cui: (freshProfile.company_cui as string) ?? '',
            companyAddress: (freshProfile.company_address as string) ?? '',
            registrationNumber: (meta.registration_number as string) ?? '',
            county: (meta.county as string) ?? '',
            contactPerson: (meta.contact_person as string) ?? (freshProfile.first_name as string) ?? '',
          };
          setUserInfo(prev => ({ ...prev, ...savedState }));
          // Persistență: salvează în localStorage ca datele să rămână până le schimbă utilizatorul
          if (typeof window !== 'undefined') {
            const forStorage = { ...savedState, supabaseUserId: userId };
            localStorage.setItem('userInfo', JSON.stringify(forStorage));
          }
        } else if (typeof window !== 'undefined') {
          // Fallback: persistă ce tocmai a salvat utilizatorul
          localStorage.setItem('userInfo', JSON.stringify({ ...userInfo, supabaseUserId: userId }));
        }
      }

      // Sincronizează auth user_metadata cu phone și username (persistență în sesiune)
      if (user) {
        const { error: metaError } = await supabase.auth.updateUser({
          data: {
            phone: userInfo.phone || undefined,
            username: (userInfo.username?.trim() || undefined) as string | undefined,
          },
        });
        if (metaError) {
          console.warn('[Settings] Could not update user_metadata:', metaError);
        }
      }

      // Also update email in auth.users if changed and user is authenticated
      if (user && userInfo.email && userInfo.email !== user.email) {
        const { error: emailUpdateError } = await supabase.auth.updateUser({
          email: userInfo.email
        });
        
        if (emailUpdateError) {
          console.warn('[Settings] Could not update email in auth:', emailUpdateError);
          // Don't fail the whole operation if email update fails
        }
      }

      // Dacă nu s-a făcut reîncărcarea din DB (ex. fără session), persistă totuși în localStorage
      if (typeof window !== 'undefined' && !userId) {
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
      }
      // Notify header to refresh name/email/avatar in same tab
      window.dispatchEvent(new CustomEvent('userInfoUpdated'));
      if (userInfo.avatar) {
        window.dispatchEvent(new CustomEvent('avatarUpdated', { detail: { avatarUrl: userInfo.avatar } }));
      }
      
      setMessage({ type: 'success', text: 'Profilul a fost actualizat cu succes!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error: any) {
      console.error('[Settings] Error saving profile:', error);
      setMessage({ type: 'error', text: 'A apărut o eroare. Te rugăm să încerci din nou.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Fișierul este prea mare. Dimensiunea maximă este 5MB.' });
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Vă rugăm să selectați o imagine validă.' });
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setUserInfo(prev => ({
          ...prev,
          avatar: result
        }));
        setMessage({ type: 'success', text: 'Avatar-ul a fost încărcat cu succes!' });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarRemove = () => {
    setUserInfo(prev => ({
      ...prev,
      avatar: ''
    }));
    setMessage({ type: 'success', text: 'Avatar-ul a fost șters cu succes!' });
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Parolele nu se potrivesc!' });
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Parola trebuie să aibă cel puțin 6 caractere!' });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setMessage({ type: 'success', text: 'Parola a fost schimbată cu succes!' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'A apărut o eroare. Te rugăm să încerci din nou.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmailChangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmailForChange.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setMessage({ type: 'error', text: 'Introdu un email nou valid.' });
      return;
    }
    if (email === (userInfo.email || '').trim().toLowerCase()) {
      setMessage({ type: 'error', text: 'Noul email este același cu cel actual.' });
      return;
    }
    setIsLoadingEmailChange(true);
    setMessage({ type: '', text: '' });
    try {
      const session = await getSupabaseSessionRobust(supabase);
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'Trebuie să fii autentificat.' });
        return;
      }
      const res = await dashboardApiFetch('/api/auth/send-email-change-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newEmail: email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: (data as any)?.message || 'Eroare la trimiterea codului.' });
        return;
      }
      setEmailChangeCodeSent(true);
      setEmailChangeCode('');
      setMessage({ type: 'success', text: (data as any)?.message || 'Cod trimis la noul email.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Eroare la trimiterea codului.' });
    } finally {
      setIsLoadingEmailChange(false);
    }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmailForChange.trim().toLowerCase();
    const code = emailChangeCode.trim();
    if (!email || !code) {
      setMessage({ type: 'error', text: 'Introdu codul primit pe email.' });
      return;
    }
    setIsLoadingEmailChange(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await dashboardApiFetch('/api/auth/confirm-email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: (data as any)?.message || 'Cod invalid sau expirat.' });
        return;
      }
      setMessage({ type: 'success', text: (data as any)?.message || 'Email actualizat cu succes!' });
      // Reîmprospătare sesiune din Supabase ca JWT-ul să conțină noul email (sursa de adevăr)
      await refreshSessionSingleFlight(supabase);
      const { data: { session } } = await supabase.auth.getSession();
      const newEmail = session?.user?.email ?? email;
      setAuthEmail(newEmail);
      setUserInfo(prev => ({ ...prev, email: newEmail }));
      const current = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const updated = { ...current, email: newEmail };
      localStorage.setItem('userInfo', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('userInfoUpdated'));
      setNewEmailForChange('');
      setEmailChangeCodeSent(false);
      setEmailChangeCode('');
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Eroare la confirmare.' });
    } finally {
      setIsLoadingEmailChange(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    window.location.href = '/';
  };

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isPieseAuto
        ? isDarkMode
          ? "bg-[#1a1d21]"
          : "bg-[#f5f6f8]"
        : isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-50"
    } max-md:h-dvh max-md:flex max-md:flex-col max-md:overflow-hidden`}>
      {/* Universal Header */}
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Mobile Menu – doar panou lateral, fără overlay; pagina rămâne 100% utilizabilă */}
      {isMobileMenuOpen && typeof document !== 'undefined' && createPortal(
        <div className={`md:hidden fixed top-0 left-0 z-[99999] w-80 max-h-[100vh] overflow-y-auto shadow-xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'} border-r border-gray-200`}>
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-600">
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Meniu</h2>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="w-6 h-6 flex items-center justify-center">
                    <span className={`text-xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>×</span>
                  </div>
                </button>
              </div>

              {/* Dark Mode Toggle - Top */}
              <div className="p-4 border-b border-gray-600">
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-700 text-white hover:bg-gray-600' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className="text-lg">{isDarkMode ? '🌙' : '☀️'}</span>
                    <span>Mod întunecat</span>
                  </span>
                  <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {isDarkMode ? 'Activat' : 'Dezactivat'}
                  </span>
                </button>
              </div>

              {/* Meniu rapid pe mobil: Lateral vs Jos */}
              <div className="p-4 border-b border-gray-600">
                <p className="text-sm font-medium text-gray-400 mb-2">Pe mobil: meniu rapid</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('gobid_mobile_nav_mode', 'side');
                        setMobileNavMode('side');
                        window.dispatchEvent(new CustomEvent('gobid_mobile_nav_mode', { detail: 'side' }));
                      }
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                      mobileNavMode === 'side'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    Lateral
                  </button>
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('gobid_mobile_nav_mode', 'bottom');
                        setMobileNavMode('bottom');
                        window.dispatchEvent(new CustomEvent('gobid_mobile_nav_mode', { detail: 'bottom' }));
                      }
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                      mobileNavMode === 'bottom'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    Jos (footer)
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">Lateral = bară stânga. Jos = bară fixă jos ca în aplicații.</p>
              </div>

              {/* Navigation Links */}
              <div className="flex-1 p-4 space-y-2">
                <a
                  href="/"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">🏠</span>
                  <span>Homepage</span>
                </a>
                
                <a
                  href="/ro"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">🔨</span>
                  <span>Licitatii</span>
                </a>
                
                <a
                  href="/dashboard"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">📊</span>
                  <span>Dashboard</span>
                </a>
                
                <a
                  href="/dashboard/favorites"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">❤️</span>
                  <span>Favorite</span>
                </a>
                
                <a
                  href="/dashboard/settings"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">⚙️</span>
                  <span>Setări</span>
                </a>
                
                <a
                  href="/dashboard/tokens"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">💰</span>
                  <span>Token-uri</span>
                </a>
                
                <a
                  href="/dashboard/payments"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">💳</span>
                  <span>Plăți</span>
                </a>
                
                <a
                  href="/dashboard/support"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">🎫</span>
                  <span>Suport</span>
                </a>
              </div>

              {/* Logout Button - Bottom */}
              <div className="p-4 border-t border-gray-600">
                <button
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-center space-x-2 p-3 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'bg-red-600 text-white hover:bg-red-700' 
                      : 'bg-red-100 text-red-600 hover:bg-red-200'
                  }`}
                >
                  <span className="text-lg">🚪</span>
                  <span>Ieșire</span>
                </button>
              </div>
            </div>
        </div>
      , document.body)}


      {/* Main Content - full viewport pe mobil */}
      <div className="max-md:flex-1 max-md:min-h-0 max-md:flex max-md:flex-col max-md:overflow-hidden">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto max-md:overflow-x-hidden">
        <div className="mb-6">
          <BackButton
            fallbackHref={isPieseAuto ? "/dashboard/piese-auto" : "/dashboard"}
            label="Înapoi"
            className="shadow-md"
          />
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border max-md:p-4 ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center space-x-4 mb-4 max-md:mb-0">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full shadow-2xl max-md:hidden ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-gray-600 to-gray-500' 
                  : 'bg-gradient-to-r from-blue-500 to-blue-600'
              }`}>
                <i className="ri-settings-line text-white text-2xl"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-3xl font-bold max-md:text-xl ${
                  isDarkMode 
                    ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent' 
                    : 'text-gray-900'
                }`}>
                  Setări Cont
                </h2>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg backdrop-blur-lg shadow-xl border ${
            message.type === 'success' 
              ? isDarkMode
                ? 'bg-green-500/20 text-green-300 border-green-400/30' 
                : 'bg-green-50 text-green-800 border-green-200'
              : isDarkMode
                ? 'bg-red-500/20 text-red-300 border-red-400/30'
                : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {isPieseAuto && authAccountType === 'piese_auto' && (
          <div
            className={`mb-6 md:mb-8 rounded-2xl border p-4 md:p-6 shadow-xl backdrop-blur-lg ${
              isDarkMode ? 'border-white/20 bg-white/10' : 'border-amber-200 bg-amber-50/90'
            }`}
          >
            <p
              className={`text-sm font-semibold mb-1 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              Piese Auto: privat sau firmă
            </p>
            <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Aici alegi dacă anunțurile apar ca persoană fizică sau ca firmă. Vizibil pe orice tab (Profil,
              Notificări etc.).
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setPieseAutoSellAsCompany(false)}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  !pieseAutoSellAsCompany
                    ? isDarkMode
                      ? 'bg-amber-500 text-gray-900 shadow-md'
                      : 'bg-amber-500 text-white shadow-md'
                    : isDarkMode
                      ? 'bg-white/10 text-gray-300 hover:bg-white/15'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Persoană fizică (privat)
              </button>
              <button
                type="button"
                onClick={() => setPieseAutoSellAsCompany(true)}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  pieseAutoSellAsCompany
                    ? isDarkMode
                      ? 'bg-amber-500 text-gray-900 shadow-md'
                      : 'bg-amber-500 text-white shadow-md'
                    : isDarkMode
                      ? 'bg-white/10 text-gray-300 hover:bg-white/15'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Firmă
              </button>
            </div>
            {pieseAutoSellAsCompany && (
              <div
                className={`mt-4 pt-4 border-t ${isDarkMode ? "border-white/15" : "border-amber-200/80"}`}
              >
                <label
                  className={`block text-sm font-medium mb-1.5 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}
                >
                  CUI firmă
                </label>
                <input
                  type="text"
                  name="cui"
                  value={userInfo.cui}
                  onChange={(e) => {
                    handleInputChange(e);
                    scheduleAnafLookupFromCuiValue(e.target.value);
                  }}
                  onBlur={(e) => flushAnafDebounceAndLookup(e.target.value)}
                  disabled={anafCompanyLookupLoading}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-colors disabled:opacity-60 ${
                    isDarkMode
                      ? "bg-white/10 border-white/20 text-white placeholder-gray-500 focus:ring-2 focus:ring-amber-400/50"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-amber-500/40"
                  }`}
                  placeholder="ex. RO12345678 sau cifre"
                  autoComplete="off"
                />
                {anafCompanyLookupLoading ? (
                  <p className={`mt-1.5 text-xs ${isDarkMode ? "text-amber-200/90" : "text-amber-800"}`}>
                    Se caută datele în ANAF…
                  </p>
                ) : (
                  <p className={`mt-1.5 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    Minim 8 cifre (numărul fiscal); după ce le introduci, denumirea și adresa se completează singure
                    (același câmp ca în Profil).
                  </p>
                )}
              </div>
            )}
            {activeTab !== 'profile' && (
              <p className={`mt-3 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Pentru date complete și salvare, deschide tabul{' '}
                <button
                  type="button"
                  className={`font-semibold underline-offset-2 hover:underline ${
                    isDarkMode ? 'text-amber-400' : 'text-amber-700'
                  }`}
                  onClick={() => {
                    setActiveTab('profile');
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location.href);
                      url.searchParams.set('tab', 'profile');
                      router.replace(url.pathname + url.search, { scroll: false });
                    }
                  }}
                >
                  Profil
                </button>{' '}
                și apasă „Salvează Modificările”.
              </p>
            )}
          </div>
        )}

        {/* Tabs - pe mobil grid 2x2, pe desktop rând orizontal */}
        <div className="mb-6 md:mb-8">
          <div className={`backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <nav className="grid grid-cols-2 gap-2 md:flex md:flex-nowrap md:justify-start md:gap-0 md:space-x-8">
              {[
                { id: 'profile', name: 'Profil Personal', shortName: 'Profil', icon: <UserIcon size="m" className={isDarkMode ? "text-blue-400" : "text-blue-600"} /> },
                { id: 'password', name: 'Securitate', shortName: 'Securitate', icon: <LockClosedIcon size="m" className={isDarkMode ? "text-red-400" : "text-red-600"} /> },
                { id: 'notifications', name: 'Notificări', shortName: 'Notificări', icon: <NotificationIcon size="m" className={isDarkMode ? "text-yellow-400" : "text-yellow-600"} /> },
                { id: 'privacy', name: 'Confidențialitate', shortName: 'Confidențialitate', icon: <CheckIcon size="m" className={isDarkMode ? "text-green-400" : "text-green-600"} /> },
                { id: 'delete-account', name: 'Șterge contul', shortName: 'Șterge cont', icon: <i className={`ri-delete-bin-line ${isDarkMode ? "text-red-400" : "text-red-600"}`} /> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', tab.id);
                    router.replace(url.pathname + url.search, { scroll: false });
                  }}
                  className={`flex items-center justify-center md:justify-start gap-2 md:space-x-2 px-3 py-3 md:px-4 rounded-lg transition-all duration-300 flex-shrink-0 ${
                    activeTab === tab.id
                      ? isDarkMode
                        ? 'bg-white/20 text-white shadow-lg'
                        : 'bg-blue-500 text-white shadow-lg'
                      : isDarkMode
                        ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className="w-5 h-5 md:w-4 md:h-4 flex items-center justify-center flex-shrink-0">
                    {tab.icon}
                  </div>
                  <span className="text-xs md:text-sm leading-tight text-center truncate">{tab.shortName}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className={`backdrop-blur-lg rounded-2xl p-4 md:p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <h3 className={`text-lg md:text-xl font-semibold mb-4 md:mb-6 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Informații Personale
            </h3>
            
            <form onSubmit={handleProfileSave} className="space-y-3 md:space-y-6">
              {/* Avatar Section */}
              <div className="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-6">
                <div className="flex-shrink-0 flex justify-center md:justify-start">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center overflow-hidden shadow-2xl ${
                    isDarkMode 
                      ? 'bg-gradient-to-r from-gray-600 to-gray-500' 
                      : 'bg-gradient-to-r from-blue-500 to-blue-600'
                  }`}>
                    {userInfo.avatar ? (
                      <img 
                        src={userInfo.avatar} 
                        alt="Avatar" 
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <span className="text-white text-xl md:text-2xl font-semibold">
                        {sellAsCompanyProfile
                          ? (userInfo.contactPerson || userInfo.companyName || 'F').slice(0, 2).toUpperCase()
                          : `${userInfo.firstName ? userInfo.firstName[0].toUpperCase() : 'U'}${userInfo.lastName ? userInfo.lastName[0].toUpperCase() : 'U'}`
                        }
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Avatar
                  </label>
                  <div className="flex flex-col md:flex-row items-center space-y-1.5 md:space-y-0 md:space-x-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <label
                      htmlFor="avatar-upload"
                      className={`w-full md:w-auto px-3 md:px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-300 text-xs md:text-sm text-center ${
                        isDarkMode
                          ? 'bg-white/10 backdrop-blur-sm border-white/20 text-gray-300 hover:border-yellow-400 hover:text-yellow-400 hover:bg-white/20'
                          : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {userInfo.avatar ? 'Schimbă Avatar' : 'Adaugă Avatar'}
                    </label>
                    {userInfo.avatar && (
                      <button
                        type="button"
                        onClick={handleAvatarRemove}
                        className="px-4 py-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600 shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        Șterge
                      </button>
                    )}
                  </div>
                  <p className={`text-[11px] md:text-xs mt-1 transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Formate acceptate: JPG, PNG, GIF (max 5MB)
                  </p>
                </div>
              </div>
              {/* Prenume și Nume – doar pentru cont personal; la firmă există doar Persoană de contact */}
              {!sellAsCompanyProfile && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Prenume *
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={userInfo.firstName}
                      onChange={handleInputChange}
                      className={`w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm md:text-base ${
                        isDarkMode
                          ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                      }`}
                      placeholder="Prenumele tău"
                      required
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Nume *
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={userInfo.lastName}
                      onChange={handleInputChange}
                      className={`w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm md:text-base ${
                        isDarkMode
                          ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                      }`}
                      placeholder="Numele tău"
                      required
                    />
                  </div>
                </div>
              )}

              {!sellAsCompanyProfile && (
                <div>
                  <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Username *
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={userInfo.username}
                    onChange={handleInputChange}
                    className={`w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                    }`}
                    placeholder="Ex: ion.popescu"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                  />
                  <p className={`mt-1 text-[11px] md:text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    3-30 caractere: litere, cifre, punct, underscore sau cratimă.
                  </p>
                </div>
              )}

              {/* Email – în zona generală doar pentru cont personal; la firmă e al 2-lea în Date firmă */}
              {!sellAsCompanyProfile && (
                <div>
                  <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={userInfo.email}
                    onChange={handleInputChange}
                    className={`w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                    }`}
                    placeholder="email@exemplu.com"
                    required
                  />
                </div>
              )}

              {/* Telefon – în zona generală doar pentru cont personal; pe mobil: 4 câmpuri 10-4-3-3; opțional */}
              {!sellAsCompanyProfile && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Telefon
                  </label>
                  {/* Un singur câmp pe toate ecranele, format 07xx xxx xxx */}
                  <div>
                    <input
                      type="tel"
                      name="phone"
                      value={userInfo.phone}
                      onChange={(e) => {
                        const formattedNumber = formatPhoneNumber(e.target.value);
                        setUserInfo(prev => ({ ...prev, phone: formattedNumber }));
                      }}
                      onBlur={(e) => {
                        const finalFormattedNumber = formatPhoneNumber(e.target.value);
                        if (finalFormattedNumber !== e.target.value) {
                          setUserInfo(prev => ({ ...prev, phone: finalFormattedNumber }));
                        }
                      }}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                        isDarkMode
                          ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                      }`}
                      placeholder="07xx xxx xxx"
                    />
                  </div>
                </div>
              )}

              {/* Adresă (personală) – ascunsă la firmă; la firmă se folosește doar Adresă sediu */}
              {!sellAsCompanyProfile && (
                <div>
                  <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Adresă
                  </label>
                  <textarea
                    name="address"
                    value={userInfo.address}
                    onChange={handleInputChange}
                    rows={2}
                    className={`w-full px-3 md:px-4 py-2.5 md:py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                    }`}
                    placeholder="Strada, numărul, blocul, scara, etajul, apartamentul"
                  />
                </div>
              )}

              {/* Oraș – doar pentru cont personal; la firmă e în Date firmă */}
              {!sellAsCompanyProfile && (
                <div>
                  <label className={`block text-sm font-medium mb-1.5 md:mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Oraș
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={userInfo.city}
                    onChange={handleInputChange}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode 
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                    }`}
                    placeholder="București"
                  />
                </div>
              )}

              {/* Date firmă – cont business JWT sau dealer piese-auto ca firmă. Ordine: 1.Persoană de contact 2.Email … */}
              {sellAsCompanyProfile && (
                <>
                  <div className={`mt-8 pt-6 border-t ${isDarkMode ? 'border-white/20' : 'border-gray-200'}`}>
                    <h4 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Date firmă
                    </h4>
                  </div>
                  {/* 1. Persoană de contact */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Persoană de contact *</label>
                    <input
                      type="text"
                      name="contactPerson"
                      value={userInfo.contactPerson}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="Numele persoanei de contact"
                      required
                    />
                  </div>
                  {/* 2. Email */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email *</label>
                    <input
                      type="email"
                      name="email"
                      value={userInfo.email}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="email@exemplu.com"
                      required
                    />
                  </div>
                  {/* 3. Denumire firmă */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Denumire firmă</label>
                    <input
                      type="text"
                      name="companyName"
                      value={userInfo.companyName}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="Denumirea societății"
                    />
                  </div>
                  {/* 4. CUI – completare automată ANAF (fără buton), ca la cont firmă */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      CUI
                    </label>
                    <input
                      type="text"
                      name="cui"
                      value={userInfo.cui}
                      onChange={(e) => {
                        handleInputChange(e);
                        scheduleAnafLookupFromCuiValue(e.target.value);
                      }}
                      onBlur={(e) => flushAnafDebounceAndLookup(e.target.value)}
                      disabled={anafCompanyLookupLoading}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base disabled:opacity-60 ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="ex. RO12345678 sau 12345678"
                      autoComplete="off"
                    />
                    <p className={`mt-1.5 text-[11px] md:text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                      {anafCompanyLookupLoading
                        ? "Se caută datele în ANAF…"
                        : "De la 8 cifre în sus: la pauză după tastare sau la ieșirea din câmp, denumirea, Reg. Comerț, adresă, județ și localitate se completează automat (nu se schimbă persoana de contact sau emailul)."}
                    </p>
                  </div>
                  {/* 5. Reg. Comerț */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Reg. Comerț</label>
                    <input
                      type="text"
                      name="registrationNumber"
                      value={userInfo.registrationNumber}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="ex. J40/123/2020"
                    />
                  </div>
                  {/* 6. Nr. de tel – opțional */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nr. de tel</label>
                    <input
                      type="tel"
                      name="phone"
                      value={userInfo.phone}
                      onChange={(e) => {
                        const formattedNumber = formatPhoneNumber(e.target.value);
                        setUserInfo(prev => ({ ...prev, phone: formattedNumber }));
                      }}
                      onBlur={(e) => {
                        const finalFormattedNumber = formatPhoneNumber(e.target.value);
                        if (finalFormattedNumber !== e.target.value) {
                          setUserInfo(prev => ({ ...prev, phone: finalFormattedNumber }));
                        }
                      }}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="+40 123 456 789"
                    />
                  </div>
                  {/* 7. Adresă sediu */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Adresă sediu</label>
                    <textarea
                      name="companyAddress"
                      value={userInfo.companyAddress}
                      onChange={handleInputChange}
                      rows={2}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="Strada, număr, oraș"
                    />
                  </div>
                  {/* 8. Județ */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Județ</label>
                    <input
                      type="text"
                      name="county"
                      value={userInfo.county}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="ex. București"
                    />
                  </div>
                  {/* 9. Oraș / Localitate */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Oraș / Localitate</label>
                    <input
                      type="text"
                      name="city"
                      value={userInfo.city}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                      placeholder="ex. București"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-center md:justify-end">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full md:w-auto px-4 md:px-6 py-2.5 md:py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg font-semibold hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {isLoading ? 'Se salvează...' : 'Salvează Modificările'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'password' && (
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            {/* Schimbă email de logare – cod trimis la noul email */}
            <div className="mb-8 pb-8 border-b border-gray-200 dark:border-white/20">
              <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Schimbă email de logare
              </h3>
              <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Se trimite un cod la noul email. Până nu introduci codul corect, emailul rămâne cel vechi.
              </p>
              <div className={`text-sm mb-4 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                Email actual de logare: <strong>{authEmail || userInfo.email || '—'}</strong>
              </div>
              {!emailChangeCodeSent ? (
                <form onSubmit={handleSendEmailChangeCode} className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Noul email</label>
                    <input
                      type="email"
                      value={newEmailForChange}
                      onChange={(e) => setNewEmailForChange(e.target.value)}
                      placeholder="email@exemplu.com"
                      className={`w-full px-4 py-2.5 rounded-lg border text-base ${
                        isDarkMode
                          ? 'bg-white/10 border-white/20 text-white placeholder-gray-400'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                      }`}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoadingEmailChange}
                    className="px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoadingEmailChange ? 'Se trimite...' : 'Trimite cod la noul email'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmEmailChange} className="space-y-3">
                  <p className={`text-sm ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                    Cod trimis la <strong>{newEmailForChange}</strong>. Verifică căsuța de poștă.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[140px]">
                      <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Cod din email</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={emailChangeCode}
                        onChange={(e) => setEmailChangeCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className={`w-full px-4 py-2.5 rounded-lg border text-base font-mono tracking-widest ${
                          isDarkMode
                            ? 'bg-white/10 border-white/20 text-white placeholder-gray-400'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        }`}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoadingEmailChange || emailChangeCode.length !== 6}
                      className="px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {isLoadingEmailChange ? 'Se confirmă...' : 'Confirmă schimbarea'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmailChangeCodeSent(false); setEmailChangeCode(''); setMessage({ type: '', text: '' }); }}
                      className={`px-4 py-2.5 rounded-lg border ${isDarkMode ? 'border-white/30 text-gray-300 hover:bg-white/10' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                    >
                      Anulează
                    </button>
                  </div>
                </form>
              )}
            </div>

            <h3 className={`text-xl font-semibold mb-6 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Schimbă Parola
            </h3>
            
            <form onSubmit={handlePasswordSave} className="space-y-4 md:space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Parola Curentă *
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                    isDarkMode
                      ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                  }`}
                  placeholder="Parola ta actuală"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Parola Nouă *
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                    isDarkMode
                      ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                  }`}
                  placeholder="Parola nouă (minim 6 caractere)"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Confirmă Parola Nouă *
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                    isDarkMode
                      ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'
                  }`}
                  placeholder="Confirmă parola nouă"
                  required
                />
              </div>

              <div className="flex justify-center md:justify-end">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {isLoading ? 'Se schimbă...' : 'Schimbă Parola'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <h3 className={`text-xl font-semibold mb-6 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Preferințe Notificări
            </h3>
            
            <div className="space-y-4 md:space-y-6">
              {[
                { title: 'Notificări Email', description: 'Primește notificări despre licitațiile tale', enabled: true, key: 'email' },
                { title: 'Notificări SMS', description: 'Primește notificări pe telefon', enabled: false, key: 'sms' },
                { title: 'Notificări Push', description: 'Oferte, mesaje și notificări direct pe telefon', enabled: true, key: 'push' },
                { title: 'Newsletter', description: 'Primește noutăți despre platformă și oferte speciale', enabled: newsletterEnabled, key: 'newsletter' }
              ].map((notification, index) => (
                <div key={index} className={`flex items-center justify-between p-4 backdrop-blur-sm border rounded-lg transition-all duration-300 ${
                  isDarkMode
                    ? 'bg-white/5 border-white/10 hover:bg-white/10'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}>
                  <div className="flex-1">
                    <h4 className={`font-medium ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {notification.title}
                    </h4>
                    <p className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {notification.description}
                    </p>
                    {notification.key === 'newsletter' && newsletterEnabled && (
                      <div className="mt-2 flex items-center gap-2">
                        <i className="ri-gift-line text-green-400"></i>
                        <span className="text-xs text-green-300">Cupon 5% discount activ!</span>
                      </div>
                    )}
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notification.key === 'newsletter' ? newsletterEnabled : notification.enabled}
                      onChange={(e) => {
                        if (notification.key === 'newsletter') {
                          const newValue = e.target.checked;
                          setNewsletterEnabled(newValue);
                          
                          // Save preference
                          if (userInfo.email) {
                            localStorage.setItem(`newsletter_enabled_${userInfo.email}`, newValue ? 'true' : 'false');
                            
                            // Add/update subscriber
                            const subscribers = JSON.parse(localStorage.getItem('newsletter_subscribers') || '[]');
                            if (newValue) {
                              // Add subscriber
                              const existingIndex = subscribers.findIndex((s: any) => s.email === userInfo.email);
                              const subscriber = {
                                id: `SUB-${Date.now()}`,
                                email: userInfo.email,
                                name: userInfo.firstName ? `${userInfo.firstName} ${userInfo.lastName}`.trim() : undefined,
                                subscribedAt: new Date().toISOString(),
                                status: 'active' as const,
                                couponCode: existingIndex === -1 ? `NEWS5-${Math.random().toString(36).substring(2, 10).toUpperCase()}` : subscribers[existingIndex].couponCode,
                                couponUsed: existingIndex !== -1 ? subscribers[existingIndex].couponUsed : false
                              };
                              
                              if (existingIndex !== -1) {
                                subscribers[existingIndex] = { ...subscribers[existingIndex], status: 'active' };
                              } else {
                                subscribers.push(subscriber);
                              }
                              
                              setMessage({ type: 'success', text: 'Te-ai abonat la newsletter! Verifică emailul pentru codul de cupon.' });
                            } else {
                              // Unsubscribe
                              const subscriberIndex = subscribers.findIndex((s: any) => s.email === userInfo.email);
                              if (subscriberIndex !== -1) {
                                subscribers[subscriberIndex].status = 'unsubscribed';
                              }
                              
                              setMessage({ type: 'info', text: 'Te-ai dezabonat de la newsletter.' });
                            }
                            
                            localStorage.setItem('newsletter_subscribers', JSON.stringify(subscribers));
                            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
                          }
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-red-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <h3 className={`text-xl font-semibold mb-6 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Confidențialitate și Securitate
            </h3>
            
            <div className="space-y-4 md:space-y-6">
              <div className={`p-6 backdrop-blur-sm border rounded-lg transition-all duration-300 ${
                isDarkMode
                  ? 'bg-white/5 border-white/10 hover:bg-white/10'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}>
                <h4 className={`font-medium mb-2 text-base ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Autentificare în Două Pași
                </h4>
                <p className={`text-sm mb-4 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Adaugă o securitate suplimentară contului tău
                </p>
                <button className="w-full md:w-auto px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 text-sm shadow-lg hover:shadow-xl transform hover:scale-105">
                  Activează 2FA
                </button>
              </div>

              <div className={`p-6 backdrop-blur-sm border rounded-lg transition-all duration-300 ${
                isDarkMode
                  ? 'bg-red-500/10 border-red-400/30 hover:bg-red-500/20'
                  : 'bg-red-50 border-red-200 hover:bg-red-100'
              }`}>
                <h4 className={`font-medium mb-2 text-base ${
                  isDarkMode ? 'text-red-300' : 'text-red-700'
                }`}>
                  Zone de Pericol
                </h4>
                <p className={`text-sm mb-4 ${
                  isDarkMode ? 'text-red-400' : 'text-red-600'
                }`}>
                  Acțiuni care nu pot fi anulate
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('delete-account');
                    router.replace('/dashboard/settings?tab=delete-account', { scroll: false });
                  }}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Șterge contul →
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'delete-account' && (
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <h3 className={`text-xl font-semibold mb-2 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Ștergere cont
            </h3>
            <p className={`text-sm mb-6 ${
              isDarkMode ? 'text-red-300' : 'text-red-700'
            }`}>
              <strong>Contul va fi șters permanent.</strong> Această acțiune nu poate fi anulată.
            </p>

            <div className={`space-y-6 text-sm ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              <div>
                <h4 className={`font-medium mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Cum ștergi contul
                </h4>
                <p className="mb-2">
                  Apasă butonul „Șterge Contul” de mai jos, confirmă în fereastra de dialog, iar contul tău va fi dezactivat imediat. Vei fi deconectat și nu te vei mai putea autentifica.
                </p>
                <p className="text-xs opacity-80">
                  Poți accesa direct această pagină la:{' '}
                  <code className={`px-1 py-0.5 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    /dashboard/settings?tab=delete-account
                  </code>
                </p>
              </div>

              <div>
                <h4 className={`font-medium mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Ce date sunt șterse
                </h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Accesul la cont – nu te mai vei putea autentifica</li>
                  <li>Profilul tău (nume, email, telefon, adresă)</li>
                  <li>Toate anunțurile și produsele tale</li>
                  <li>Listele de favorite și conversațiile</li>
                  <li>Istoricul licitațiilor și ofertelor</li>
                </ul>
              </div>

              <div>
                <h4 className={`font-medium mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  În cât timp
                </h4>
                <p>
                  Procesarea este <strong>imediată</strong>. La confirmare, contul este dezactivat instant. Vei fi redirecționat pe pagina de autentificare.
                </p>
              </div>
            </div>

            <div className={`mt-8 p-6 backdrop-blur-sm border rounded-lg ${
              isDarkMode
                ? 'bg-red-500/20 border-red-400/40'
                : 'bg-red-50 border-red-200'
            }`}>
              <p className={`text-sm font-medium mb-4 ${
                isDarkMode ? 'text-red-200' : 'text-red-800'
              }`}>
                Confirmă că înțelegi: contul va fi șters permanent și nu poate fi recuperat.
              </p>
              <button
                onClick={handleDeleteAccount}
                disabled={isLoading}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg hover:from-red-700 hover:to-red-600 transition-all duration-300 font-medium shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Se procesează...' : 'Șterge Contul Permanent'}
              </button>
            </div>
          </div>
        )}

        </div>
      </div>

      <DashboardFooter isDarkMode={isDarkMode} />

      <DeleteAccountModal
        isOpen={showDeleteAccountModal}
        isDarkMode={isDarkMode}
        isLoading={isLoading}
        errorMessage={deleteAccountError}
        onClose={() => setShowDeleteAccountModal(false)}
        onConfirm={confirmDeleteAccount}
      />
    </div>
  );
}
