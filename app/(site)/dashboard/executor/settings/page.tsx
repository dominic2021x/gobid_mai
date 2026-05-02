"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import { useState, useEffect } from "react";
import Hammer, { HammerIcon } from "@/components/Hammer";
import { UserIcon, LockClosedIcon, NotificationIcon, CheckIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import { supabase } from "@/lib/supabase";
import {
  resolveAccountTypeWithUser,
  shouldRedirectAwayFromExecutorRoutes,
} from "@/lib/auth/resolveAccountType";
import { useRouter, usePathname } from "next/navigation";
import {
  getSupabaseSessionRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import ModernDatePicker from "@/components/ModernDatePicker";

export default function ExecutorSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const defaultAvatar = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : null;
  const isLichidator = basePath?.includes("lichidator") ?? false;
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'România',
    postalCode: '',
    avatar: '',
    executorUnejNumber: '',
    executorChamber: '',
    executorOfficeAddress: '',
    executorOfficeLocation: '',
    executorWebsite: '',
    // Date contact licitator
    licitatorName: '',
    licitatorAddress: '',
    licitatorFiscalCode: '',
    licitatorConsignmentAccount: '',
    licitatorEmail: '',
    licitatorPhone: '',
    licitatorFax: '',
    licitatorCompetence: '',
    licitatorAvatar: '',
    birthDate: '',
    location: ''
  });

  // Lista completă de țări cu prefixe telefonice
  const countries = [
    { name: 'România', code: 'RO', prefix: '+40', flag: '🇷🇴' },
    { name: 'Moldova', code: 'MD', prefix: '+373', flag: '🇲🇩' },
    { name: 'Ungaria', code: 'HU', prefix: '+36', flag: '🇭🇺' },
    { name: 'Bulgaria', code: 'BG', prefix: '+359', flag: '🇧🇬' },
    { name: 'Serbia', code: 'RS', prefix: '+381', flag: '🇷🇸' },
    { name: 'Ucraina', code: 'UA', prefix: '+380', flag: '🇺🇦' },
    { name: 'Polonia', code: 'PL', prefix: '+48', flag: '🇵🇱' },
    { name: 'Germania', code: 'DE', prefix: '+49', flag: '🇩🇪' },
    { name: 'Franța', code: 'FR', prefix: '+33', flag: '🇫🇷' },
    { name: 'Italia', code: 'IT', prefix: '+39', flag: '🇮🇹' },
    { name: 'Spania', code: 'ES', prefix: '+34', flag: '🇪🇸' },
    { name: 'Regatul Unit', code: 'GB', prefix: '+44', flag: '🇬🇧' },
    { name: 'SUA', code: 'US', prefix: '+1', flag: '🇺🇸' },
    { name: 'Canada', code: 'CA', prefix: '+1', flag: '🇨🇦' },
    { name: 'Australia', code: 'AU', prefix: '+61', flag: '🇦🇺' },
    { name: 'Japonia', code: 'JP', prefix: '+81', flag: '🇯🇵' },
    { name: 'China', code: 'CN', prefix: '+86', flag: '🇨🇳' },
    { name: 'India', code: 'IN', prefix: '+91', flag: '🇮🇳' },
    { name: 'Brazilia', code: 'BR', prefix: '+55', flag: '🇧🇷' },
    { name: 'Argentina', code: 'AR', prefix: '+54', flag: '🇦🇷' }
  ];
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [newsletterEnabled, setNewsletterEnabled] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [newEmailForChange, setNewEmailForChange] = useState('');
  const [emailChangeCodeSent, setEmailChangeCodeSent] = useState(false);
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [isLoadingEmailChange, setIsLoadingEmailChange] = useState(false);
  /** Email de logare din Supabase Auth (sursa de adevăr), nu din localStorage */
  const [authEmail, setAuthEmail] = useState('');

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
        setShowAuthModal(true);
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
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
          if (k.startsWith('supabase.auth.')) localStorage.removeItem(k);
        }
      }

      if (typeof window !== 'undefined') {
        // Force full reload so all dashboard state/universal header resets immediately
        window.location.replace('/auth?message=account_deleted');
      } else {
        router.replace('/auth?message=account_deleted');
      }
    } catch (err: any) {
      setDeleteAccountError(err?.message || 'Eroare la ștergerea contului.');
    } finally {
      setIsLoading(false);
    }
  };

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

  // Page loading effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 1000); // 1 second loading

    return () => clearTimeout(timer);
  }, []);

  // Load user info - same logic as dashboard page
  const loadUserData = async () => {
    try {
        const { user: resolvedUser, accountType } = await resolveAccountTypeWithUser(supabase);
        const { data: sessionData, error: initialSessionError } = await supabase.auth.getSession();
        let user = sessionData.session?.user ?? resolvedUser;
        let userId: string | null = null;

        console.log('[Executor Settings] Initial session check:', {
          hasSession: !!sessionData.session,
          hasUser: !!user,
          userId: user?.id,
          sessionError: initialSessionError?.message,
          accountType,
        });

        if (!user) {
          if (typeof window !== "undefined") {
            window.location.href = "/auth?mode=login";
          }
          return;
        }

        userId = user.id;
        setAuthEmail(user.email ?? '');

        if (shouldRedirectAwayFromExecutorRoutes(accountType)) {
          if (typeof window !== "undefined") {
            window.location.href = "/dashboard";
          }
          return;
        }

        // If no Supabase session, try to get userId from localStorage
        if (!user && typeof window !== "undefined") {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          
          if (savedUserInfo) {
            try {
              const userInfo = JSON.parse(savedUserInfo);
              const supabaseUserId = savedSupabaseUserId || userInfo.supabaseUserId;
              
              if (supabaseUserId) {
                console.log('[Settings] Found supabaseUserId in localStorage:', supabaseUserId);
                userId = supabaseUserId;
              } else {
                userId = userInfo.email || 'local-user';
                console.log('[Settings] Using localStorage fallback for authentication (no supabaseUserId)');
              }
              
              // Set user info from localStorage
              setUserInfo(prev => ({ ...prev, ...userInfo }));
              
              // Load newsletter preference
              if (userInfo.email) {
                const newsletterPref = localStorage.getItem(`newsletter_enabled_${userInfo.email}`);
                setNewsletterEnabled(newsletterPref === 'true');
                
                // Also check if user is in newsletter subscribers
                const subscribers = JSON.parse(localStorage.getItem('newsletter_subscribers') || '[]');
                const isSubscribed = subscribers.some((s: any) => s.email === userInfo.email && s.status === 'active');
                if (isSubscribed && newsletterPref !== 'true') {
                  setNewsletterEnabled(true);
                  localStorage.setItem(`newsletter_enabled_${userInfo.email}`, 'true');
                }
              }
            } catch (e) {
              console.error('Error parsing userInfo from localStorage:', e);
            }
          }
        } else if (user) {
          userId = user.id;
        }

        // Check if user is admin or manager before redirecting
        if (!userId) {
          // Check if admin info exists in localStorage (admin/manager logged in)
          if (typeof window !== "undefined") {
            const savedAdminInfo = localStorage.getItem('adminInfo');
            if (savedAdminInfo) {
              try {
                const adminInfo = JSON.parse(savedAdminInfo);
                if (adminInfo.isAdmin || adminInfo.role === 'manager') {
                  // Admin/Manager can access, continue without userId
                  console.log('[Settings] Admin/Manager access granted');
                } else {
                  window.location.href = "/auth?mode=login";
                  return;
                }
              } catch (e) {
                console.error('Error parsing adminInfo:', e);
                window.location.href = "/auth?mode=login";
                return;
              }
            } else {
              window.location.href = "/auth?mode=login";
              return;
            }
          } else {
            return;
          }
        }

        // Load user info from Supabase - ALWAYS use Supabase as source of truth
        // This ensures sync across all devices and sessions
        if (userId && user) {
          // Get fresh session to ensure we have the latest user data
          const { data: freshSessionData } = await supabase.auth.getSession();
          const freshUser = freshSessionData?.session?.user || user;
          setAuthEmail(freshUser?.email ?? '');
          
          console.log('[Settings] Loading profile from Supabase:', {
            userId,
            hasUser: !!user,
            hasFreshUser: !!freshUser,
            freshUserId: freshUser?.id,
            userEmail: user?.email,
            freshUserEmail: freshUser?.email
          });
          
          // Always reload from Supabase to get the latest avatar
          const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("first_name,last_name,phone,avatar_url,address,city,country,postal_code,date_of_birth,location,executor_unej_number,executor_chamber,executor_office_address,executor_office_location,executor_website,licitator_name,licitator_address,licitator_fiscal_code,licitator_consignment_account,licitator_email,licitator_phone,licitator_fax,licitator_competence")
            .eq("user_id", userId)
            .maybeSingle();

          // Supabase sometimes returns {} as error when there's no actual error
          // We completely ignore empty object errors - they are not real errors
          // No need to log anything if profileError is just an empty object

          console.log('[Settings] Profile query result:', {
            hasProfile: !!profile,
            avatarUrl: profile?.avatar_url,
            userId: userId
          });

          const meta = freshUser?.user_metadata || {};

          if (profile) {
            // Use EXACT same logic as UniversalHeader - Supabase is source of truth, with fallback la meta
            const userInfoData = {
              firstName: profile.first_name ?? meta.first_name ?? '',
              lastName: profile.last_name ?? meta.last_name ?? '',
              email: freshUser?.email ?? user?.email ?? '',
              phone: profile.phone ?? meta.phone ?? '',
              avatar: profile.avatar_url ?? '', // EXACT same as header line 463
              address: profile.address ?? meta.address ?? '',
              city: profile.city ?? meta.city ?? '',
              country: profile.country ?? meta.country ?? 'România',
              postalCode: profile.postal_code ?? meta.postal_code ?? '',
              executorUnejNumber: profile.executor_unej_number ?? meta.executor_unej_number ?? '',
              executorChamber: profile.executor_chamber ?? meta.executor_chamber ?? '',
              executorOfficeAddress: profile.executor_office_address ?? meta.executor_office_address ?? '',
              executorOfficeLocation: profile.executor_office_location ?? meta.executor_office_location ?? '',
              executorWebsite: profile.executor_website ?? meta.executor_website ?? '',
              birthDate: profile.date_of_birth ? (typeof profile.date_of_birth === 'string' ? profile.date_of_birth.split('T')[0] : '') : (meta.date_of_birth ?? ''),
              location: profile.location ?? meta.location ?? meta.company_city ?? '',
              licitatorName: profile.licitator_name ?? meta.licitator_name ?? '',
              licitatorAddress: profile.licitator_address ?? meta.licitator_address ?? '',
              licitatorFiscalCode: profile.licitator_fiscal_code ?? meta.licitator_fiscal_code ?? '',
              licitatorConsignmentAccount: profile.licitator_consignment_account ?? meta.licitator_consignment_account ?? '',
              licitatorEmail: profile.licitator_email ?? meta.licitator_email ?? '',
              licitatorPhone: profile.licitator_phone ?? meta.licitator_phone ?? '',
              licitatorFax: profile.licitator_fax ?? meta.licitator_fax ?? '',
              licitatorCompetence: profile.licitator_competence ?? meta.licitator_competence ?? '',
              licitatorAvatar: profile.avatar_url ?? meta.avatar_url ?? ''
            };
            
            console.log('[Settings] Setting userInfo with avatar:', {
              avatar: userInfoData.avatar,
              firstName: userInfoData.firstName,
              lastName: userInfoData.lastName
            });
            
            // Set userInfo EXACTLY as header does (line 465)
            setUserInfo(userInfoData);
            
            // Update localStorage EXACTLY as header does (line 468)
            if (typeof window !== 'undefined') {
              // Save exactly as header - same structure
              const headerUserInfo = {
                firstName: userInfoData.firstName,
                lastName: userInfoData.lastName,
                email: userInfoData.email,
                phone: userInfoData.phone,
                avatar: userInfoData.avatar // EXACT same as header
              };
              localStorage.setItem('userInfo', JSON.stringify(headerUserInfo));
              console.log('[Settings] Updated localStorage with avatar (identical to header):', headerUserInfo.avatar);
            }
            
            // Load newsletter preference
            if (freshUser?.email) {
              const newsletterPref = localStorage.getItem(`newsletter_enabled_${freshUser.email}`);
              setNewsletterEnabled(newsletterPref === 'true');
              
              // Also check if user is in newsletter subscribers
              const subscribers = JSON.parse(localStorage.getItem('newsletter_subscribers') || '[]');
              const isSubscribed = subscribers.some((s: any) => s.email === freshUser.email && s.status === 'active');
              if (isSubscribed && newsletterPref !== 'true') {
                setNewsletterEnabled(true);
                localStorage.setItem(`newsletter_enabled_${freshUser.email}`, 'true');
              }
            }
          } else {
            // Profile doesn't exist - use user_metadata (date din formularul de înregistrare)
            console.warn('[Settings] Profile not found in Supabase, using user_metadata fallback:', {
              userId,
              hasUser: !!user,
              hasFreshUser: !!freshUser
            });
            
            const meta = freshUser?.user_metadata || {};
            const userInfoFromMeta = {
              firstName: meta.first_name ?? '',
              lastName: meta.last_name ?? '',
              email: freshUser?.email ?? user?.email ?? '',
              phone: meta.phone ?? '',
              avatar: meta.avatar_url ?? '',
              address: meta.address ?? meta.company_address ?? '',
              city: meta.city ?? meta.company_city ?? '',
              country: meta.country ?? 'România',
              postalCode: meta.postal_code ?? '',
              executorUnejNumber: meta.executor_unej_number ?? '',
              executorChamber: meta.executor_chamber ?? '',
              executorOfficeAddress: meta.executor_office_address ?? '',
              executorOfficeLocation: meta.executor_office_location ?? meta.company_county ?? '',
              executorWebsite: meta.executor_website ?? '',
              birthDate: meta.date_of_birth ? (typeof meta.date_of_birth === 'string' ? meta.date_of_birth.split('T')[0] : '') : '',
              location: meta.location ?? meta.company_city ?? '',
              licitatorName: meta.licitator_name ?? '',
              licitatorAddress: meta.licitator_address ?? '',
              licitatorFiscalCode: meta.licitator_fiscal_code ?? '',
              licitatorConsignmentAccount: meta.licitator_consignment_account ?? '',
              licitatorEmail: meta.licitator_email ?? '',
              licitatorPhone: meta.licitator_phone ?? '',
              licitatorFax: meta.licitator_fax ?? '',
              licitatorCompetence: meta.licitator_competence ?? '',
              licitatorAvatar: meta.avatar_url ?? ''
            };
            setUserInfo(userInfoFromMeta);
            
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInfo', JSON.stringify({
                firstName: userInfoFromMeta.firstName,
                lastName: userInfoFromMeta.lastName,
                email: userInfoFromMeta.email,
                phone: userInfoFromMeta.phone,
                avatar: userInfoFromMeta.avatar
              }));
            }
          }
        }
      } catch (error) {
        console.error('[Settings] Error loading user data:', error);
      }
    };
    
    // Make loadUserData available globally for debugging
    if (typeof window !== 'undefined') {
      (window as any).reloadSettingsAvatar = loadUserData;
    }

  // Load user data on mount - FORCE RELOAD FROM SUPABASE (identical to header)
  useEffect(() => {
    // Always reload from Supabase on mount to ensure sync
    console.log('[Settings] Component mounted, loading user data from Supabase...');
    loadUserData();
    
    // Also reload when page becomes visible (in case avatar was updated in another tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[Settings] Page became visible, reloading user data from Supabase...');
        loadUserData();
      }
    };
    
    // Reload when window gets focus
    const handleFocus = () => {
      console.log('[Settings] Window focused, reloading user data from Supabase...');
      loadUserData();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []); // Run only on mount

  // Listen for avatar updates from other components
  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      // Reload user data from Supabase when avatar is updated elsewhere
      console.log('[Settings] Avatar updated event received, reloading user data from Supabase...', event);
      // Force reload after a short delay to ensure Supabase has the latest data
      setTimeout(() => {
        console.log('[Settings] Executing loadUserData after avatar update...');
        loadUserData();
      }, 500);
    };

    // Also listen for storage events (in case avatar is updated in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userInfo' && e.newValue) {
        try {
          const newUserInfo = JSON.parse(e.newValue);
          if (newUserInfo.avatar && newUserInfo.avatar !== userInfo.avatar) {
            console.log('[Settings] Storage event detected, avatar changed, reloading from Supabase...', {
              old: userInfo.avatar,
              new: newUserInfo.avatar
            });
            setTimeout(() => {
              loadUserData();
            }, 500);
          }
        } catch (e) {
          console.error('Error parsing userInfo from storage event:', e);
        }
      }
    };

    // Listen for custom storage event (same-window updates)
    const handleCustomStorage = () => {
      if (typeof window !== 'undefined') {
        const storedUserInfo = localStorage.getItem('userInfo');
        if (storedUserInfo) {
          try {
            const stored = JSON.parse(storedUserInfo);
            if (stored.avatar && stored.avatar !== userInfo.avatar) {
              console.log('[Settings] Custom storage event, avatar changed, reloading from Supabase...');
              setTimeout(() => {
                loadUserData();
              }, 500);
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    };

    // Listen for licitator data updates from my-products page
    const handleLicitatorDataUpdated = (e: CustomEvent) => {
      if (e.detail) {
        setUserInfo(prev => ({
          ...prev,
          licitatorName: e.detail.licitatorName || prev.licitatorName,
          licitatorAddress: e.detail.licitatorAddress || prev.licitatorAddress,
          licitatorFiscalCode: e.detail.licitatorFiscalCode || prev.licitatorFiscalCode,
          licitatorConsignmentAccount: e.detail.licitatorConsignmentAccount || prev.licitatorConsignmentAccount,
          licitatorEmail: e.detail.licitatorEmail || prev.licitatorEmail,
          licitatorPhone: e.detail.licitatorPhone || prev.licitatorPhone,
          licitatorFax: e.detail.licitatorFax || prev.licitatorFax,
          licitatorCompetence: e.detail.licitatorCompetence || prev.licitatorCompetence
        }));
      }
    };

    window.addEventListener('avatarUpdated', handleAvatarUpdate);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('licitatorDataUpdated', handleLicitatorDataUpdated as EventListener);
    // Listen for same-window localStorage changes
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(...args) {
      originalSetItem.apply(this, args);
      if (args[0] === 'userInfo') {
        handleCustomStorage();
      }
    };
    
    return () => {
      window.removeEventListener('avatarUpdated', handleAvatarUpdate);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('licitatorDataUpdated', handleLicitatorDataUpdated as EventListener);
      localStorage.setItem = originalSetItem;
    };
  }, [userInfo.avatar]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setUserInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Funcție pentru detectarea automată a țării pe baza prefixului
  const detectCountryFromPhone = (phoneNumber: string) => {
    if (!phoneNumber) return;
    
    // Găsește țara pe baza prefixului (formatPhoneNumber deja a transformat 00 în +)
    const detectedCountry = countries.find(country => 
      phoneNumber.startsWith(country.prefix)
    );
    
    if (detectedCountry && detectedCountry.name !== userInfo.country) {
      setUserInfo(prev => ({
        ...prev,
        country: detectedCountry.name
      }));
    }
  };

  // Funcție pentru formatarea numărului de telefon (doar pentru România)
  const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber) return '';
    
    // Curăță numărul de spații și caractere speciale
    let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Transformă 00 în + automat
    if (cleanNumber.startsWith('00')) {
      cleanNumber = '+' + cleanNumber.substring(2);
    }
    
    // Formatare doar pentru România (+40) - maxim 9 cifre
    if (cleanNumber.startsWith('+40')) {
      const numberWithoutPrefix = cleanNumber.replace('+40', '').trim();
      
      // Limitează la maxim 9 cifre pentru România
      const limitedNumber = numberWithoutPrefix.slice(0, 9);
      
      if (limitedNumber.length >= 9) {
        return `+40 ${limitedNumber.slice(0, 3)} ${limitedNumber.slice(3, 6)} ${limitedNumber.slice(6)}`;
      } else if (limitedNumber.length >= 6) {
        return `+40 ${limitedNumber.slice(0, 3)} ${limitedNumber.slice(3)}`;
      } else if (limitedNumber.length >= 3) {
        return `+40 ${limitedNumber}`;
      }
      return `+40 ${limitedNumber}`;
    }
    
    // Pentru alte țări, returnează numărul curățat fără formatare
    return cleanNumber;
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
      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      
      if (!userId) {
        setShowAuthModal(true);
        setIsLoading(false);
        return;
      }

      // Upsert profile in Supabase (create if not exists, update if exists)
      // Executor și lichidator: aceleași câmpuri ca la formularul de înregistrare
      const profileData: Record<string, any> = {
        user_id: userId,
        email: userEmail ?? null,
        first_name: userInfo.firstName,
        last_name: userInfo.lastName,
        phone: userInfo.phone,
        avatar_url: userInfo.avatar,
        date_of_birth: userInfo.birthDate || null,
        location: userInfo.location || null,
        executor_unej_number: userInfo.executorUnejNumber,
        executor_chamber: userInfo.executorChamber,
        executor_office_address: userInfo.executorOfficeAddress,
        executor_office_location: userInfo.executorOfficeLocation,
        executor_website: userInfo.executorWebsite
      };

      const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('Error saving profile:', upsertError);
        setMessage({ type: 'error', text: upsertError.message || 'A apărut o eroare la salvarea profilului. Te rugăm să încerci din nou.' });
      } else {
        // Also save to localStorage for backward compatibility
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        window.dispatchEvent(new CustomEvent('userInfoUpdated'));
        if (userInfo.avatar) {
          window.dispatchEvent(new CustomEvent('avatarUpdated', { detail: { avatarUrl: userInfo.avatar } }));
        }
        
        
        setMessage({ type: 'success', text: 'Profilul a fost actualizat cu succes!' });
      }
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving profile:', error);
      setMessage({ type: 'error', text: 'A apărut o eroare. Te rugăm să încerci din nou.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      
      setAvatarFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Upload to Cloudinary immediately (same as dashboard)
      await handleAvatarUploadToCloudinary(file);
    }
  };

  const handleAvatarUploadToCloudinary = async (file: File) => {
    setIsUploadingAvatar(true);
    setMessage({ type: '', text: '' });

    try {
      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        setShowAuthModal(true);
        setIsUploadingAvatar(false);
        return;
      }

      const uploadData = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });
      if (!uploadData.success) {
        throw new Error(uploadData.error);
      }
      if (!uploadData.url) {
        throw new Error('Eroare la încărcarea imaginii');
      }
      const avatarUrl = uploadData.url;

      // Update user_profiles with new avatar in Supabase
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: avatarUrl })
        .eq('user_id', userId);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setUserInfo(prev => ({ ...prev, avatar: avatarUrl }));
      
      // Update localStorage identic cu header
      if (typeof window !== 'undefined') {
        const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const headerUserInfo = {
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          phone: userInfo.phone,
          avatar: avatarUrl // Identic cu header
        };
        localStorage.setItem('userInfo', JSON.stringify(headerUserInfo));
      }

      // Dispatch event to notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('avatarUpdated', { detail: { avatarUrl } }));
      }

      setAvatarFile(null);
      setAvatarPreview(null);
      setMessage({
        type: 'success',
        text: 'Avatarul a fost actualizat cu succes!',
      });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Eroare la încărcarea avatarului. Te rog încearcă din nou.',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    try {
      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        setShowAuthModal(true);
        return;
      }

      // Remove avatar from Supabase
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: null })
        .eq('user_id', userId);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setUserInfo(prev => ({
        ...prev,
        avatar: ''
      }));
      
      // Update localStorage identic cu header
      if (typeof window !== 'undefined') {
        const headerUserInfo = {
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          phone: userInfo.phone,
          avatar: '' // Remove avatar
        };
        localStorage.setItem('userInfo', JSON.stringify(headerUserInfo));
      }

      // Dispatch event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('avatarUpdated'));
      }

      setMessage({ type: 'success', text: 'Avatar-ul a fost șters cu succes!' });
    } catch (error: any) {
      console.error('Error removing avatar:', error);
      setMessage({ type: 'error', text: 'Eroare la ștergerea avatarului. Te rog încearcă din nou.' });
    }
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
        credentials: 'include',
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
    <div className={`min-h-screen flex flex-col transition-all duration-300 relative ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900/30 via-gray-800/30 to-gray-700/30' 
        : 'bg-gradient-to-br from-gray-50/30 via-white/30 to-gray-50/30'
    }`}>
      {/* Background Emblem - Faded */}
      <div 
        className="fixed inset-0 opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05] pointer-events-none z-0"
        style={{
          backgroundImage: `url(${bgEmblem})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      />

      {/* Universal Header */}
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Panel Badge */}
      <div className="fixed top-20 right-2 md:top-24 md:right-4 z-0">
        <div className={`inline-flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 rounded-lg ${
          isDarkMode 
            ? 'bg-blue-600/20 border border-blue-500/30' 
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <i className={`ri-shield-user-line text-xs md:text-sm ${
            isDarkMode ? 'text-blue-300' : 'text-blue-600'
          }`}></i>
          <span className={`text-[10px] md:text-xs font-medium ${
            isDarkMode ? 'text-blue-200' : 'text-blue-700'
          }`}>
            {basePath?.includes("lichidator") ? "Panel privat pentru lichidatori" : "Panel privat de executori"}
          </span>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          
          {/* Menu Panel */}
          <div className={`relative w-80 h-full ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-xl`}>
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
                  href={basePath}
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
                  href={`${basePath}/favorites`}
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
                  href={`${basePath}/settings`}
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
                  href={`${basePath}/tokens`}
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
                  href={`${basePath}/payments`}
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
                  href={`${basePath}/support`}
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
        </div>
      )}


      {/* Main Content */}
      <div className="container mx-auto max-w-7xl px-2 sm:px-4 py-4 sm:py-8 flex-1 relative z-10">
        {/* Header */}
        <div className="mb-3 sm:mb-6">
          <div className="flex items-center gap-3 mb-8">
            <BackButton fallbackHref={basePath} label="Înapoi" className="shadow-md" />
            
            <h1 className={`text-xl sm:text-2xl md:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Setări Cont
            </h1>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg backdrop-blur-sm shadow-xl border ${
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

        {/* Tabs */}
        <div className="mb-6 md:mb-8">
          <div className={`backdrop-blur-sm rounded-2xl p-6 shadow-2xl border ${
            isDarkMode 
              ? 'bg-gray-800/50 border-gray-700/50' 
              : 'bg-white/50 border-gray-200/50'
          }`}>
            <nav className="flex justify-between md:justify-start md:space-x-8">
              {[
                { id: 'profile', name: isLichidator ? 'Profil Lichidator' : 'Profil Executor', shortName: 'Profil', icon: <UserIcon size="m" className={isDarkMode ? "text-blue-400" : "text-blue-600"} /> },
                { id: 'password', name: 'Securitate', shortName: 'Securitate', icon: <LockClosedIcon size="m" className={isDarkMode ? "text-red-400" : "text-red-600"} /> },
                { id: 'notifications', name: 'Notificări', shortName: 'Notificări', icon: <NotificationIcon size="m" className={isDarkMode ? "text-yellow-400" : "text-yellow-600"} /> },
                { id: 'privacy', name: 'Confidențialitate', shortName: 'Confidențialitate', icon: <CheckIcon size="m" className={isDarkMode ? "text-green-400" : "text-green-600"} /> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-300 backdrop-blur-sm ${
                    activeTab === tab.id
                      ? isDarkMode
                        ? 'bg-white/5 text-white shadow-lg border border-white/15'
                        : 'bg-blue-500/30 text-white shadow-lg border border-blue-400/20'
                      : isDarkMode
                        ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className="w-5 h-5 md:w-4 md:h-4 flex items-center justify-center">
                    {tab.icon}
                  </div>
                  <span className="text-xs md:text-sm leading-tight text-center">{tab.shortName}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className={`backdrop-blur-sm rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-gray-800/30 border-gray-700/30' 
              : 'bg-white/30 border-gray-200/30'
          }`}>
            <h3 className={`text-xl font-semibold mb-6 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {isLichidator ? 'Date de identificare profesională (lichidator)' : 'Date de identificare profesională (executor)'}
            </h3>
            
            <form onSubmit={handleProfileSave} className="space-y-4 md:space-y-6">
              {/* Avatar Section */}
              <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-6">
                <div className="flex-shrink-0 flex justify-center md:justify-start">
                  <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center overflow-hidden shadow-2xl ${
                    isDarkMode 
                      ? 'bg-gradient-to-r from-gray-600 to-gray-500' 
                      : 'bg-gradient-to-r from-blue-500 to-blue-600'
                  }`}>
                    {(avatarPreview || userInfo.avatar || defaultAvatar) ? (
                      <img 
                        src={`${avatarPreview || userInfo.avatar || defaultAvatar}${userInfo.avatar ? '?t=' + Date.now() : ''}`}
                        alt="Avatar" 
                        className="w-full h-full object-cover object-center rounded-full"
                        onError={(e) => {
                          console.error('[Settings] Avatar image failed to load:', avatarPreview || userInfo.avatar || defaultAvatar);
                          // Fallback to initials if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                        key={`avatar-${userInfo.avatar || defaultAvatar || 'none'}-${Date.now()}`} // Force re-render when avatar changes
                      />
                    ) : (
                      <span className="text-white text-xl md:text-2xl font-semibold">
                        {userInfo.firstName ? userInfo.firstName[0].toUpperCase() : 'U'}
                        {userInfo.lastName ? userInfo.lastName[0].toUpperCase() : 'U'}
                      </span>
                    )}
                    {isUploadingAvatar && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Avatar
                  </label>
                  <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <label
                      htmlFor="avatar-upload"
                      className={`w-full md:w-auto px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-300 text-sm text-center ${
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
                  <p className={`text-xs mt-1 transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Formate acceptate: JPG, PNG, GIF (max 5MB)
                  </p>
                </div>
              </div>

              {/* Executor și Lichidator: exact câmpurile de la formulul de înregistrare */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nume *</label>
                  <input type="text" name="lastName" value={userInfo.lastName} onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                    placeholder="Numele tău" required />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Prenume *</label>
                  <input type="text" name="firstName" value={userInfo.firstName} onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                    placeholder="Prenumele tău" required />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Telefon *</label>
                <input type="tel" name="phone" value={userInfo.phone} onChange={(e) => { const fn = formatPhoneNumber(e.target.value); setUserInfo(prev => ({ ...prev, phone: fn })); detectCountryFromPhone(fn); }}
                  onBlur={(e) => { const fn = formatPhoneNumber(e.target.value); if (fn !== e.target.value) { setUserInfo(prev => ({ ...prev, phone: fn })); detectCountryFromPhone(fn); } }}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                  placeholder="+40 123 456 789" required />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Data nașterii</label>
                <ModernDatePicker value={userInfo.birthDate} onChange={(date) => setUserInfo(prev => ({ ...prev, birthDate: date }))} isDarkMode={isDarkMode} placeholder="Selectează data nașterii" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {isLichidator ? 'Număr certificat / înregistrare lichidator *' : 'Număr de înregistrare (UNEJ) *'}
                  </label>
                  <input type="text" name="executorUnejNumber" value={userInfo.executorUnejNumber} onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                    placeholder={isLichidator ? 'Ex: număr certificat / înregistrare' : 'Ex: 12345'} required />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {isLichidator ? 'Instanță / ONRC *' : 'Camera Executorilor *'}
                  </label>
                  <input type="text" name="executorChamber" value={userInfo.executorChamber} onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                    placeholder={isLichidator ? 'Ex: Instanța de judecată / ONRC' : 'Ex: București, Brașov, Cluj'} required />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {isLichidator ? 'Sediul / adresa biroului de lichidare *' : 'Sediul biroului executorului *'}
                </label>
                <input type="text" name="executorOfficeAddress" value={userInfo.executorOfficeAddress} onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                  placeholder="Ex: Str. Exemplu nr. 1, București" required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Județul biroului *</label>
                  <input type="text" name="executorOfficeLocation" value={userInfo.executorOfficeLocation} onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                    placeholder="Ex: București, Sector 1" required />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Localitate *</label>
                  <input type="text" name="location" value={userInfo.location} onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                    placeholder="Oraș, Județ (ex: București, Sector 1)" required />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Website (opțional)</label>
                <input type="url" name="executorWebsite" value={userInfo.executorWebsite} onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                  placeholder="Ex: https://www.example.ro" />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email *</label>
                <input type="email" name="email" value={userInfo.email} onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${isDarkMode ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-yellow-500'}`}
                  placeholder="email@exemplu.com" required />
              </div>

              <div className="flex justify-center md:justify-end mt-6">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg font-semibold hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {isLoading ? 'Se salvează...' : 'Salvează Modificările'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'password' && (
          <div className={`backdrop-blur-sm rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-gray-800/30 border-gray-700/30' 
              : 'bg-white/30 border-gray-200/30'
          }`}>
            {/* Schimbă email de logare – cod trimis la noul email */}
            <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
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
          <div className={`backdrop-blur-sm rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-gray-800/30 border-gray-700/30' 
              : 'bg-white/30 border-gray-200/30'
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
                { title: 'Notificări Push', description: 'Primește notificări în browser', enabled: true, key: 'push' },
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
                              
                              setMessage({ type: 'success', text: 'Te-ai dezabonat de la newsletter.' });
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
          <div className={`backdrop-blur-sm rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-gray-800/30 border-gray-700/30' 
              : 'bg-white/30 border-gray-200/30'
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
                <div className="flex justify-start">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isLoading}
                    className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg hover:from-red-700 hover:to-red-600 transition-all duration-300 text-sm shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Șterge Contul
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        isDarkMode={isDarkMode}
      />

      <DeleteAccountModal
        isOpen={showDeleteAccountModal}
        isDarkMode={isDarkMode}
        isLoading={isLoading}
        errorMessage={deleteAccountError}
        onClose={() => setShowDeleteAccountModal(false)}
        onConfirm={confirmDeleteAccount}
      />
      
      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
