"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect } from "react";
import Image from "next/image";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import { HammerIcon } from "@/components/Hammer";
import { 
  CoinsIcon, 
  CreditCardIcon, 
  StarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  PlusIcon,
  MinusIcon
} from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import { useRouter, usePathname } from "next/navigation";
import supabase from "@/lib/supabase";
import {
  resolveAccountTypeWithUser,
  shouldRedirectAwayFromExecutorRoutes,
} from "@/lib/auth/resolveAccountType";
import {
  getSupabaseSessionRobust,
  getSupabaseAccessTokenRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import { submitNetopiaCertificateForm } from "@/lib/netopia-submit-certificate-form";
import { StoreKit, verifyAppleReceiptOnServer } from "@/lib/mobile/iap/appleStoreKit";
import { isNativeCapacitorIos } from "@/lib/platform/isIosApp";
import { appleTokenProductIdForTokenCount } from "@/lib/payments/apple/product-map";
import { useOblioStatus, requestOblioInvoice, buildPayloadForTransaction } from "@/lib/invoice/oblioClient";

export default function ExecutorTokensPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [tokenImageError, setTokenImageError] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: ''
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(100);
  const [transferData, setTransferData] = useState({
    recipient: '',
    amount: 0,
    message: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  // Implicit: plată cu card prin Netopia (sau Apple pe iOS)
  const [paymentMethod, setPaymentMethod] = useState<'netopia' | 'bank' | 'apple'>('netopia');
  const [isNativeIosApp, setIsNativeIosApp] = useState(false);
  const oblioStatus = useOblioStatus();

  // User tokens state - loaded from Supabase
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic'
  });

  // Token transactions - loaded from Supabase
  const [tokenTransactions, setTokenTransactions] = useState<any[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);

  // Token packages - same as homepage plans
  const tokenPackages = [
    {
      id: 'basic',
      name: 'Basic',
      tokens: 10,
      price: 0,
      originalPrice: 0,
      discount: 0,
      bonus: 0,
      popular: false,
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      description: 'Ideal pentru a explora platforma',
      features: ['Chat/email suport', 'Notificări push', 'Dashboard Pro']
    },
    {
      id: 'standard',
      name: 'Standard',
      tokens: 50,
      price: 50,
      originalPrice: 50,
      discount: 0,
      bonus: 0,
      popular: false,
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Soluție echilibrată pentru licitații regulate',
      features: ['Chat/email suport', 'Notificări push', 'Suport priorititar', 'Dashboard Pro']
    },
    {
      id: 'pro',
      name: 'Pro',
      tokens: 100,
      price: Math.round(100 * (1 - 30 / 100)), // 70 Lei cu discount 30%
      originalPrice: 100,
      discount: 30,
      bonus: 0,
      popular: true,
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Pentru utilizatori dedicați și licitații frecvente',
      features: ['Chat/email suport', 'Notificări push', 'Suport priorititar', 'Dashboard Pro']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      tokens: 250,
      price: 150,
      originalPrice: 250,
      discount: 40,
      bonus: 0,
      popular: false,
      color: 'bg-green-100 text-green-800 border-green-200',
      description: 'Maximă putere și acces pentru licitații premium',
      features: ['Chat/email suport', 'Notificări push', 'Suport priorititar', 'Consultant dedicat']
    }
  ];

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

  // Detect native iOS app to enable Apple IAP
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsNativeIosApp(isNativeCapacitorIos());
  }, []);

  useEffect(() => {
    if (showPaymentModal && isNativeIosApp && selectedPackage && selectedPackage.price > 0) {
      setPaymentMethod("apple");
    }
  }, [showPaymentModal, isNativeIosApp, selectedPackage]);

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

  // Load user info and tokens from Supabase
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Load user info from localStorage (fallback)
        const savedUserInfo = localStorage.getItem('userInfo');
        if (savedUserInfo) {
          const parsedInfo = JSON.parse(savedUserInfo);
          setUserInfo(prev => ({ ...prev, ...parsedInfo }));
        }

        const { user: resolvedUser, accountType } = await resolveAccountTypeWithUser(supabase);
        const robustSession = await getSupabaseSessionRobust(supabase);
        const effectiveUser = robustSession?.user ?? resolvedUser;
        const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
        const userId = effectiveUser?.id || savedSupabaseUserId;

        if (shouldRedirectAwayFromExecutorRoutes(accountType)) {
          if (typeof window !== "undefined") {
            window.location.href = "/dashboard";
          }
          return;
        }

        if (!effectiveUser) {
          if (typeof window !== "undefined") {
            window.location.href = "/auth?mode=login";
          }
          return;
        }

        if (typeof window !== "undefined") {
          if (pathname?.startsWith("/dashboard/lichidator") && accountType === "executor") {
            window.location.href = "/dashboard/executor/tokens";
            return;
          }
          if (pathname?.startsWith("/dashboard/executor") && accountType === "liquidator") {
            window.location.href = "/dashboard/lichidator/tokens";
            return;
          }
        }
        
        if (!userId) {
          console.log('[Tokens] No userId available, using localStorage fallback');
          // Fallback to localStorage
          const savedTokens = localStorage.getItem('userTokens');
          if (savedTokens) {
            const parsedTokens = JSON.parse(savedTokens);
            setUserTokens(parsedTokens);
          }
          setIsLoadingTokens(false);
          return;
        }

        let accessToken =
          robustSession?.access_token ??
          (await getSupabaseAccessTokenRobust(supabase, 5000)) ??
          null;
        if (!accessToken) {
          const ref = await refreshSessionSingleFlight(supabase);
          accessToken = ref?.access_token ?? null;
        }
        if (!accessToken) {
          const { data: sess } = await supabase.auth.getSession();
          accessToken = sess.session?.access_token ?? null;
        }

        // Load tokens from Supabase using API
        console.log('[Tokens] Loading tokens from API with userId:', userId, 'hasAccessToken:', !!accessToken);
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          credentials: 'include',
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });

        if (tokensResponse.ok) {
          const tokensData = await tokensResponse.json();
          
          // Dacă nu există record în Supabase (balance = 0, totalEarned = 0, totalSpent = 0)
          // și există tokeni în localStorage, migrează-i în Supabase
          if (tokensData.balance === 0 && tokensData.totalEarned === 0 && tokensData.totalSpent === 0) {
            const savedTokens = localStorage.getItem('userTokens');
            if (savedTokens) {
              try {
                const localTokens = JSON.parse(savedTokens);
                // Dacă localStorage are tokeni (balance > 0 sau totalSpent > 0), migrează-i
                if (localTokens.balance > 0 || localTokens.totalSpent > 0) {
                  console.log('[Tokens] Migrating tokens from localStorage to Supabase...');
                  const migrateResponse = await dashboardApiFetch('/api/tokens', {
                    method: 'PUT',
                    credentials: 'include',
                    headers: {
                      ...(userId && !accessToken ? { 'x-user-id': userId } : {}),
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      balance: localTokens.balance || 0,
                      totalEarned: localTokens.totalEarned || localTokens.totalEarned || 0,
                      totalSpent: localTokens.totalSpent || 0,
                      level: localTokens.level || 'Basic',
                      package: localTokens.package || 'Basic'
                    })
                  });

                  if (migrateResponse.ok) {
                    const migratedData = await migrateResponse.json();
                    setUserTokens({
                      balance: migratedData.balance ?? 0,
                      totalEarned: migratedData.totalEarned ?? 0,
                      totalSpent: migratedData.totalSpent ?? 0,
                      level: migratedData.level || 'Basic',
                      package: migratedData.package || 'Basic'
                    });
                    console.log('[Tokens] Migration successful!');
                    return;
                  }
                }
              } catch (e) {
                console.error('[Tokens] Error migrating tokens:', e);
              }
            }
          }
          
          // Folosește valorile din Supabase
          console.log('[Tokens] Setting tokens from Supabase:', tokensData);
          setUserTokens({
            balance: tokensData.balance ?? 0,
            totalEarned: tokensData.totalEarned ?? 0,
            totalSpent: tokensData.totalSpent ?? 0,
            level: tokensData.level || 'Basic',
            package: tokensData.package || 'Basic'
          });
          
          // Update localStorage with Supabase values
          if (typeof window !== 'undefined') {
            localStorage.setItem('userTokens', JSON.stringify({
              balance: tokensData.balance ?? 0,
              totalEarned: tokensData.totalEarned ?? 0,
              totalSpent: tokensData.totalSpent ?? 0,
              level: tokensData.level || 'Basic',
              package: tokensData.package || 'Basic'
            }));
          }
        } else {
          console.error('[Tokens] Failed to load tokens from API:', tokensResponse.status, await tokensResponse.text().catch(() => ''));
        }

        const transactionsResponse = await dashboardApiFetch('/api/tokens/transactions', {
          credentials: 'include',
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });

        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json();
          setTokenTransactions(transactionsData || []);
        }

        setIsLoadingTokens(false);
      } catch (error) {
        console.error('Error loading user data:', error);
        // NU folosi localStorage ca fallback - tokens-urile trebuie să vină din Supabase
        // Dacă nu există în Supabase, balance va fi 0
        setUserTokens({
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: 'Basic',
          package: 'Basic'
        });
        setIsLoadingTokens(false);
      }
    };

    loadUserData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completată';
      case 'pending': return 'În așteptare';
      case 'failed': return 'Eșuată';
      default: return status;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <CreditCardIcon size="s" className="text-green-500" />;
      case 'spent': return <MinusIcon size="s" className="text-red-500" />;
      case 'earned': return <StarIcon size="s" className="text-blue-500" />;
      case 'transfer': return <CoinsIcon size="s" className="text-blue-500" />;
      default: return <CoinsIcon size="s" className="text-yellow-500" />;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'purchase': return 'Cumpărare';
      case 'spent': return 'Cheltuit';
      case 'earned': return 'Câștigat';
      case 'transfer': return 'Transfer';
      default: return type;
    }
  };

  const updateLevelBasedOnPackage = (packageType: string) => {
    let newLevel = 'Basic';
    let newPackage = 'Basic';
    
    switch (packageType) {
      case 'Basic':
        newLevel = 'Basic';
        newPackage = 'Basic';
        break;
      case 'Standard':
        newLevel = 'Standard';
        newPackage = 'Standard';
        break;
      case 'Pro':
        newLevel = 'Pro';
        newPackage = 'Pro';
        break;
      case 'Enterprise':
        newLevel = 'Enterprise';
        newPackage = 'Enterprise';
        break;
      default:
        newLevel = 'Basic';
        newPackage = 'Basic';
    }
    
    return { newLevel, newPackage };
  };

  const handlePurchaseTokens = (packageId: string) => {
    const packageToPurchase = tokenPackages.find(pkg => pkg.id === packageId);
    if (!packageToPurchase) return;

    // Open payment modal instead of directly adding tokens
    setSelectedPackage(packageToPurchase);
    setShowPaymentModal(true);
  };

  const handlePaymentComplete = async () => {
    if (!selectedPackage) return;

    try {
      const session = await getSupabaseSessionRobust(supabase);
      const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const userId = session?.user?.id || savedSupabaseUserId;
      
      if (!userId) {
        const savedAdminInfo = typeof window !== 'undefined' ? localStorage.getItem('adminInfo') : null;
        if (savedAdminInfo) {
          try {
            const adminInfo = JSON.parse(savedAdminInfo);
            if (adminInfo.isAdmin || adminInfo.role === 'manager') {
              console.log('[Tokens] Admin/Manager access granted');
            } else {
              setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
              setTimeout(() => { window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent(basePath + '/tokens'); }, 2000);
              return;
            }
          } catch (e) {
            setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
            setTimeout(() => { window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent(basePath + '/tokens'); }, 2000);
            return;
          }
        } else {
          setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
          setTimeout(() => { window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent(basePath + '/tokens'); }, 2000);
          return;
        }
      }

      const totalTokens = selectedPackage.tokens === -1 ? 999999 : selectedPackage.tokens + (selectedPackage.bonus || 0);

      // Pachet gratuit – actualizare directă
      if (selectedPackage.price === 0) {
        const { newLevel, newPackage } = updateLevelBasedOnPackage(selectedPackage.name);
        const updatedTokens = {
          balance: selectedPackage.tokens === -1 ? 999999 : userTokens.balance + totalTokens,
          totalEarned: selectedPackage.tokens === -1 ? 999999 : userTokens.totalEarned + totalTokens,
          totalSpent: userTokens.totalSpent,
          level: newLevel,
          package: newPackage
        };
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedTokens)
        });
        if (!tokensResponse.ok) throw new Error('Failed to update tokens');
        setUserTokens(updatedTokens);
        const transactionResponse = await dashboardApiFetch('/api/tokens/transactions', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            transactionId: `TKN-${Date.now()}`,
            type: 'purchase',
            amount: 0,
            status: 'completed',
            date: new Date().toISOString().split('T')[0],
            description: `Cumpărare tokens - ${selectedPackage.name} (Gratuit)`,
            paymentMethod: 'Gratuit',
            tokensReceived: totalTokens
          })
        });
        if (transactionResponse.ok) {
          const newTransaction = await transactionResponse.json();
          setTokenTransactions(prev => [newTransaction, ...prev]);
        }
        setMessage({ type: 'success', text: `Ai cumpărat ${totalTokens} tokens cu succes!` });
        setShowPaymentModal(false);
        setSelectedPackage(null);
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }

      // Apple In‑App Purchase flow on native iOS
      if (paymentMethod === 'apple' && isNativeIosApp) {
        try {
          const tokenCountForIap =
            selectedPackage.tokens === -1 ? 0 : Math.floor(Number(selectedPackage.tokens));
          const appleProductId = appleTokenProductIdForTokenCount(tokenCountForIap);
          if (!appleProductId) {
            setMessage({
              type: 'error',
              text: 'Acest pachet nu este disponibil prin Apple IAP. Alege Standard (50), Pro (100) sau Enterprise (250), sau altă metodă de plată.',
            });
            setTimeout(() => setMessage({ type: '', text: '' }), 5000);
            return;
          }

          const { products } = await StoreKit.getProducts({
            productIds: [appleProductId],
          });

          const product = products.find((p) => p.productId === appleProductId);
          if (!product) {
            setMessage({ type: 'error', text: 'Produsul Apple nu este configurat corect.' });
            setTimeout(() => setMessage({ type: '', text: '' }), 4000);
            return;
          }

          const { purchase } = await StoreKit.purchase({ productId: appleProductId });
          if (!purchase || !purchase.receipt) {
            setMessage({ type: 'error', text: 'Achiziția nu a fost finalizată.' });
            setTimeout(() => setMessage({ type: '', text: '' }), 4000);
            return;
          }

          const verifyResult = await verifyAppleReceiptOnServer(purchase.receipt, appleProductId);
          if (!verifyResult.success) {
            setMessage({ type: 'error', text: verifyResult.message || 'Eroare la verificarea plății cu Apple.' });
            setTimeout(() => setMessage({ type: '', text: '' }), 4000);
            return;
          }

          // Reload tokens from API to sync cross‑platform
          const refreshedAccessToken = await getSupabaseAccessTokenRobust(supabase);
          const tokensResponse = await dashboardApiFetch('/api/tokens', {
            headers: {
            },
          });
          if (tokensResponse.ok) {
            const tokensData = await tokensResponse.json();
            setUserTokens({
              balance: tokensData.balance ?? 0,
              totalEarned: tokensData.totalEarned ?? 0,
              totalSpent: tokensData.totalSpent ?? 0,
              level: tokensData.level || 'Basic',
              package: tokensData.package || 'Basic',
            });
          }

          setMessage({ type: 'success', text: 'Plata prin Apple a fost finalizată cu succes. Tokenii au fost actualizați.' });
          setShowPaymentModal(false);
          setSelectedPackage(null);
          setTimeout(() => setMessage({ type: '', text: '' }), 4000);
          return;
        } catch (error) {
          console.error('[Tokens] Apple IAP error:', error);
          setMessage({ type: 'error', text: 'Eroare la plata prin Apple. Încearcă din nou sau folosește plata cu cardul.' });
          setTimeout(() => setMessage({ type: '', text: '' }), 4000);
          return;
        }
      }

      // Plată cu card (Netopia) – dezactivată în build-ul iOS nativ pentru 3.1.1
      if (paymentMethod === 'netopia' && !isNativeIosApp) {
        let accessToken = await getSupabaseAccessTokenRobust(supabase, 5000);
        if (!accessToken) {
          const ref = await refreshSessionSingleFlight(supabase);
          accessToken = ref?.access_token ?? null;
        }
        if (!accessToken) {
          const { data: sess } = await supabase.auth.getSession();
          accessToken = sess.session?.access_token ?? null;
        }
        const res = await dashboardApiFetch('/api/tokens/initiate-payment', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? {} : {}),
          },
          body: JSON.stringify({
            package_id: selectedPackage.id,
            package_name: selectedPackage.name,
            amount: selectedPackage.price,
            tokens: totalTokens,
            payment_method: 'netopia',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setMessage({
            type: 'error',
            text:
              [data.error, data.message].filter(Boolean).join('. ') ||
              'Sesiune expirată sau neautentificat. Reîncearcă după autentificare.',
          });
          setTimeout(() => setMessage({ type: '', text: '' }), 4000);
          return;
        }
        if (res.ok) {
          setShowPaymentModal(false);
          if (
            data.use_form_redirect &&
            data.form_url &&
            data.env_key &&
            data.data &&
            submitNetopiaCertificateForm({
              form_url: data.form_url as string,
              env_key: data.env_key as string,
              data: data.data as string,
              iv: (data.iv ?? '') as string,
              cipher: (data.cipher ?? 'aes-256-cbc') as string,
            })
          ) {
            return;
          }
          if (data.payment_url) {
            window.location.assign(data.payment_url as string);
            return;
          }
          setMessage({
            type: 'error',
            text:
              data.message ||
              'Netopia nu a returnat un link de plată. Verifică configurația (Admin → Module → Netopia).',
          });
          setTimeout(() => setMessage({ type: '', text: '' }), 6000);
          return;
        }
        setMessage({
          type: 'error',
          text: [data.error, data.message].filter(Boolean).join('. ') || 'Eroare la redirecționarea către plată.',
        });
        setTimeout(() => setMessage({ type: '', text: '' }), 4000);
        return;
      }

      setMessage({ type: 'info', text: 'Pentru transfer bancar, contactează-ne la contact@gobid.ro.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 4000);
    } catch (error) {
      console.error('Error completing payment:', error);
      setMessage({ type: 'error', text: 'Eroare la procesarea plății. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleTransferTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const session = await getSupabaseSessionRobust(supabase);
      const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const userId = session?.user?.id || savedSupabaseUserId;
      
      if (!userId) {
        // Check if admin/manager is logged in
        const savedAdminInfo = typeof window !== 'undefined' ? localStorage.getItem('adminInfo') : null;
        if (savedAdminInfo) {
          try {
            const adminInfo = JSON.parse(savedAdminInfo);
            if (adminInfo.isAdmin || adminInfo.role === 'manager') {
              // Admin/Manager can access, continue
              console.log('[Tokens] Admin/Manager access granted');
            } else {
              setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
              setTimeout(() => {
                window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent(basePath + '/tokens');
              }, 2000);
              return;
            }
          } catch (e) {
            setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
            setTimeout(() => {
              window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent(basePath + '/tokens');
            }, 2000);
            return;
          }
        } else {
          setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
          setTimeout(() => {
            window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent(basePath + '/tokens');
          }, 2000);
          return;
        }
      }

      // Check if recipient exists in Supabase
      const { data: recipientData, error: recipientError } = await supabase
        .from('user_profiles')
        .select('email, first_name, last_name')
        .eq('email', transferData.recipient.toLowerCase())
        .maybeSingle();

      if (recipientError || !recipientData) {
        setMessage({ type: 'error', text: 'Utilizatorul nu a fost găsit în baza de date!' });
        return;
      }

      const recipientName = `${recipientData.first_name || ''} ${recipientData.last_name || ''}`.trim() || transferData.recipient;
      
      // Check level restrictions
      const maxTransferAmount = userTokens.level === 'Basic' ? 2 : userTokens.balance;
      
      if (transferData.amount > maxTransferAmount) {
        if (userTokens.level === 'Basic') {
          setMessage({ type: 'error', text: 'Utilizatorii cu nivel Basic pot trimite maximum 2 tokeni!' });
        } else {
          setMessage({ type: 'error', text: 'Nu ai suficienți tokens pentru acest transfer!' });
        }
        return;
      }

      if (transferData.amount <= 0) {
        setMessage({ type: 'error', text: 'Suma trebuie să fie mai mare decât 0!' });
        return;
      }

      // Update tokens in Supabase
      const updatedTokens = {
        balance: userTokens.balance - transferData.amount,
        totalEarned: userTokens.totalEarned,
        totalSpent: userTokens.totalSpent + transferData.amount,
        level: userTokens.level,
        package: userTokens.package
      };

      const tokensResponse = await dashboardApiFetch('/api/tokens', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedTokens)
      });

      if (!tokensResponse.ok) {
        throw new Error('Failed to update tokens');
      }

      setUserTokens(updatedTokens);

      // Add transaction to Supabase
      const transactionData = {
        transactionId: `TKN-${Date.now()}`,
        type: 'transfer',
        amount: -transferData.amount,
        status: 'completed',
        date: new Date().toISOString().split('T')[0],
        description: `Transfer către ${recipientName}`,
        paymentMethod: 'Transfer',
        tokensTransferred: transferData.amount,
        recipientEmail: transferData.recipient,
        recipientName: recipientName,
        message: transferData.message
      };

      const transactionResponse = await dashboardApiFetch('/api/tokens/transactions', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(transactionData)
      });

      if (transactionResponse.ok) {
        const newTransaction = await transactionResponse.json();
        setTokenTransactions(prev => [newTransaction, ...prev]);
      }

      setTransferData({ recipient: '', amount: 0, message: '' });
      setShowTransferModal(false);
      setMessage({ type: 'success', text: `Ai transferat ${transferData.amount} tokens către ${recipientName}!` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error transferring tokens:', error);
      setMessage({ type: 'error', text: 'Eroare la transferul tokens. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
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
      {/* Background Emblem */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05]"
        style={{ backgroundImage: `url(${bgEmblem})` }}
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

      {/* Main Content */}
      <div className="container mx-auto max-w-7xl px-2 sm:px-4 py-4 sm:py-8 flex-1 relative z-10">
        {/* Page Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center space-x-4">
            <BackButton fallbackHref={basePath} label="Înapoi" className="shadow-md" />
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg">
              <CoinsIcon size="l" className="text-white" />
            </div>
            <div>
              <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold mb-2 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent' 
                  : 'text-gray-900'
              }`}>
                Centrul de Tokens
              </h2>
            </div>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? isDarkMode
                ? 'bg-green-500/20 text-green-300 border border-green-400/30' 
                : 'bg-green-50 text-green-800 border border-green-200'
              : isDarkMode
                ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs - Modern Glassmorphism Design */}
        <div className="mb-8">
          <div className={`backdrop-blur-sm rounded-2xl p-2 border ${
            isDarkMode 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/30 border-gray-200/50'
          }`}>
            <nav className="flex justify-between md:justify-start md:space-x-2">
              {[
                { id: 'overview', name: 'Prezentare Generală', shortName: 'Prezentare', icon: <i className={`${isDarkMode ? 'ri-dashboard-line text-gray-500' : 'ri-dashboard-line text-gray-600'}`}></i> },
                { id: 'purchase', name: 'Cumpără Tokens', shortName: 'Cumpără', icon: <i className={`${isDarkMode ? 'ri-shopping-cart-line text-gray-500' : 'ri-shopping-cart-line text-gray-600'}`}></i> },
                { id: 'transactions', name: 'Tranzacții', shortName: 'Tranzacții', icon: <i className={`${isDarkMode ? 'ri-exchange-line text-gray-500' : 'ri-exchange-line text-gray-600'}`}></i> },
                { id: 'transfer', name: 'Transfer', shortName: 'Transfer', icon: <i className={`${isDarkMode ? 'ri-send-plane-line text-gray-500' : 'ri-send-plane-line text-gray-600'}`}></i> }
              ].map((tab) => (
                <div key={tab.id} className="relative">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 flex flex-row items-center space-x-2 flex-1 md:flex-none justify-center ${
                      activeTab === tab.id
                        ? isDarkMode
                          ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg transform scale-105'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                        : isDarkMode
                          ? 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center">
                      {tab.icon}
                    </div>
                    <span className="text-xs md:text-sm leading-tight text-center">{tab.shortName}</span>
                  </button>
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingTokens && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className={`mt-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Se încarcă datele tokens...
            </p>
          </div>
        )}

        {/* Tab Content */}
        {!isLoadingTokens && activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Token Balance Card */}
            <div className={`rounded-xl p-4 md:p-6 shadow-lg transition-all backdrop-blur-sm ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white/30 border border-gray-200/50'}`}>
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex justify-center mb-2 md:mb-3">
                  <div className="relative w-16 h-16 md:w-20 md:h-20">
                    {!tokenImageError ? (
                      <Image
                        src="/images/token.webp"
                        alt="Token gobid.ro"
                        fill
                        className="object-contain drop-shadow-lg"
                        priority
                        sizes="(max-width: 768px) 64px, 80px"
                        onError={() => setTokenImageError(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-3xl md:text-4xl">🪙</div>
                      </div>
                    )}
                  </div>
                </div>
                <h3 className={`text-xl md:text-2xl font-bold mb-1 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {userTokens.balance.toLocaleString()} Tokens
                </h3>
                <p className={`text-xs md:text-sm transition-colors mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Soldul tău curent
                </p>
                <div className={`inline-flex items-center justify-center px-2 md:px-3 py-1 rounded-full text-xs font-medium ${
                  userTokens.level === 'Enterprise' ? 'bg-green-100 text-green-800' :
                  userTokens.level === 'Pro' ? 'bg-blue-100 text-blue-800' :
                  userTokens.level === 'Standard' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  🏆 Nivel {userTokens.level}
                </div>
              </div>
            </div>

            {/* Stats Cards - Modern Glassmorphism Design */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`backdrop-blur-sm rounded-xl p-4 shadow-2xl border hover:shadow-3xl hover:scale-105 transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/5 border-white/10 text-white' 
                  : 'bg-white/30 border-gray-200/50 text-gray-900'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>TOTAL CÂȘTIGAT</p>
                    <p className={`text-2xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{userTokens.totalEarned.toLocaleString()}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-blue-100'
                  }`}>
                    <i className={`ri-arrow-up-line text-xl ${
                      isDarkMode ? 'text-white' : 'text-blue-600'
                    }`}></i>
                  </div>
                </div>
              </div>

              <div className={`backdrop-blur-sm rounded-xl p-4 shadow-2xl border hover:shadow-3xl hover:scale-105 transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/5 border-white/10 text-white' 
                  : 'bg-white/30 border-gray-200/50 text-gray-900'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>TOTAL CHELTUIT</p>
                    <p className={`text-2xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{userTokens.totalSpent.toLocaleString()}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-red-100'
                  }`}>
                    <i className={`ri-arrow-down-line text-xl ${
                      isDarkMode ? 'text-white' : 'text-red-600'
                    }`}></i>
                  </div>
                </div>
              </div>

              <div className={`backdrop-blur-sm rounded-xl p-4 shadow-2xl border hover:shadow-3xl hover:scale-105 transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/5 border-white/10 text-white' 
                  : 'bg-white/30 border-gray-200/50 text-gray-900'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>TRANZACȚII</p>
                    <p className={`text-2xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{tokenTransactions.length}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-blue-100'
                  }`}>
                    <i className={`ri-exchange-line text-xl ${
                      isDarkMode ? 'text-white' : 'text-blue-600'
                    }`}></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoadingTokens && activeTab === 'purchase' && (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className={`text-2xl font-bold mb-4 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Alege Pachetul de Tokens
              </h3>
              <p className={`transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Cumpără tokens pentru a participa la licitații
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
              {tokenPackages.map((pkg) => (
                <div key={pkg.id} className={`rounded-2xl p-4 md:p-8 transition-all duration-300 hover:shadow-xl relative backdrop-blur-sm ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white/30 border border-gray-200/50'} ${pkg.popular ? 'border-blue-500' : ''}`}>
                  {pkg.popular && (
                    <div className="absolute -top-3 md:-top-4 left-1/2 transform -translate-x-1/2">
                      <span className="bg-blue-600 text-white px-3 md:px-4 py-1 rounded-full text-xs md:text-sm font-semibold">
                        Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="text-center mb-4 md:mb-8">
                    <h3 className={`text-lg md:text-2xl font-bold mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {pkg.name}
                    </h3>
                    <div className="mb-3 md:mb-4">
                      {pkg.price === 0 ? (
                        <div>
                          <span className={`text-2xl md:text-4xl font-bold transition-colors ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            0 Lei
                          </span>
                          <span className={`ml-1 text-sm md:text-lg transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>/lună</span>
                        </div>
                      ) : pkg.discount && pkg.discount > 0 ? (
                        <div>
                          <div className="flex items-center justify-center space-x-2 mb-1">
                            <span className={`text-lg md:text-xl font-medium line-through transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {pkg.originalPrice} Lei
                            </span>
                            <span className={`text-2xl md:text-4xl font-bold transition-colors ${
                              pkg.discount >= 50 ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                              pkg.discount >= 30 ? (isDarkMode ? 'text-orange-400' : 'text-orange-600') :
                              (isDarkMode ? 'text-red-400' : 'text-red-600')
                            }`}>
                              {pkg.price} Lei
                            </span>
                          </div>
                          <div className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            /lună
                          </div>
                          {pkg.discount > 0 && (
                            <div className={`mt-1 text-xs font-semibold ${
                              pkg.discount >= 50 ? (isDarkMode ? 'text-green-300' : 'text-green-700') :
                              pkg.discount >= 30 ? (isDarkMode ? 'text-orange-300' : 'text-orange-700') :
                              (isDarkMode ? 'text-red-300' : 'text-red-700')
                            }`}>
                              {pkg.discount}% OFF
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className={`text-2xl md:text-4xl font-bold transition-colors ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            {pkg.price} Lei
                          </span>
                          <span className={`ml-1 text-sm md:text-lg transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>/lună</span>
                        </div>
                      )}
                    </div>
                    <div className={`mb-3 md:mb-4 rounded-lg px-3 py-2 backdrop-blur-sm ${
                      pkg.id === 'basic' ? (isDarkMode ? 'bg-green-900/30 border border-green-500/30' : 'bg-green-50/50 border border-green-200/50') :
                      pkg.id === 'standard' ? (isDarkMode ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-blue-50/50 border border-blue-200/50') :
                      pkg.id === 'pro' ? (isDarkMode ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-blue-50/50 border border-blue-200/50') :
                      (isDarkMode ? 'bg-teal-900/30 border border-teal-500/30' : 'bg-teal-50/50 border border-teal-200/50')
                    }`}>
                      <div className={`text-xl md:text-2xl font-bold transition-colors ${
                        pkg.id === 'basic' ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                        pkg.id === 'standard' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                        pkg.id === 'pro' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                        (isDarkMode ? 'text-teal-400' : 'text-teal-600')
                      }`}>
                        {pkg.tokens === -1 ? 'Nelimitat' : `${pkg.tokens.toLocaleString()} Tokens`}
                      </div>
                      <div className={`text-xs md:text-sm transition-colors ${
                        pkg.id === 'basic' ? (isDarkMode ? 'text-green-300' : 'text-green-700') :
                        pkg.id === 'standard' ? (isDarkMode ? 'text-blue-300' : 'text-blue-700') :
                        pkg.id === 'pro' ? (isDarkMode ? 'text-blue-300' : 'text-blue-700') :
                        (isDarkMode ? 'text-teal-300' : 'text-teal-700')
                      }`}>
                        {pkg.id === 'basic' ? 'Bonus de bine ai venit' : pkg.tokens === -1 ? 'Enterprise' : 'Lunar'}
                      </div>
                    </div>
                    <p className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {pkg.description}
                    </p>
                  </div>
                  
                  <ul className="space-y-2 md:space-y-4 mb-4 md:mb-8">
                    {pkg.features.map((feature, index) => (
                      <li key={index} className="flex items-center">
                        <svg className="w-4 h-4 md:w-5 md:h-5 text-green-500 mr-2 md:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <button
                    onClick={() => handlePurchaseTokens(pkg.id)}
                    className={`w-full py-2 md:py-3 px-3 md:px-4 rounded-lg font-semibold transition-colors text-sm md:text-base ${
                      pkg.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : pkg.price === 0
                          ? 'bg-gray-600 text-white hover:bg-gray-700'
                          : isDarkMode
                            ? 'bg-gray-700 text-white hover:bg-gray-600'
                            : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    }`}
                  >
                    {pkg.price === 0 ? 'Plan Gratuit' : 'Alege Planul'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoadingTokens && activeTab === 'transactions' && (
          <div className="space-y-6">
            <h3 className={`text-xl font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Istoric Tranzacții Tokens
            </h3>

            <div className={`rounded-xl shadow-lg transition-all backdrop-blur-sm ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white/30 border border-gray-200/50'}`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`border-b transition-colors ${isDarkMode ? 'border-white/10' : 'border-gray-200/50'}`}>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tranzacție</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tip</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Sumă</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Status</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Data</th>
                      {oblioStatus.enabled && (
                        <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Factură</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tokenTransactions.map((transaction) => (
                      <tr key={transaction.id} className={`border-b transition-colors ${isDarkMode ? 'border-white/10' : 'border-gray-200/50'}`}>
                        <td className="py-2 md:py-3 px-2 md:px-4">
                          <div className="flex items-center space-x-2 md:space-x-3">
                            <span className="text-sm md:text-xl">{getTypeIcon(transaction.type)}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate`} title={transaction.description}>
                                {transaction.description?.length > 20 ? transaction.description.substring(0, 20) + '...' : transaction.description}
                              </p>
                              <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {transaction.paymentMethod?.length > 15 ? transaction.paymentMethod.substring(0, 15) + '...' : transaction.paymentMethod}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={`py-2 md:py-3 px-2 md:px-4 transition-colors text-xs md:text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {getTypeText(transaction.type)}
                        </td>
                        <td className={`py-2 md:py-3 px-2 md:px-4 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          <span className={`font-semibold text-xs md:text-sm ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2 md:py-3 px-2 md:px-4">
                          <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(transaction.status)}`}>
                            {getStatusText(transaction.status)}
                          </span>
                        </td>
                        <td className={`py-2 md:py-3 px-2 md:px-4 transition-colors text-xs md:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {transaction.date.split('-').reverse().join('-')}
                        </td>
                        {oblioStatus.enabled && (
                          <td className="py-2 md:py-3 px-2 md:px-4">
                            {transaction.type === 'purchase' && transaction.amount > 0 ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const { payment, clientInfo } = buildPayloadForTransaction(
                                    { amount: transaction.amount, date: transaction.date, description: transaction.description, status: transaction.status, type: 'purchase', tokensReceived: transaction.tokensReceived },
                                    { firstName: userInfo.firstName, lastName: userInfo.lastName, email: userInfo.email }
                                  );
                                  const result = await requestOblioInvoice(payment, clientInfo, { openPdf: true });
                                  if (!result.success) setMessage({ type: 'error', text: result.message || 'Eroare factură' });
                                }}
                                className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${isDarkMode ? 'border-blue-500 text-blue-400 hover:bg-blue-500/20' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
                              >
                                Descarcă
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isLoadingTokens && activeTab === 'transfer' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className={`text-2xl font-bold mb-4 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Transfer Tokens
              </h3>
              <p className={`transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Trimite tokens către alți utilizatori
              </p>
              {userTokens.level === 'Basic' && (
                <div className={`mt-4 p-3 rounded-lg border ${isDarkMode ? 'bg-yellow-900/20 border-yellow-700 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                  <p className="text-sm font-medium">
                    ⚠️ Nivel Basic: Poți trimite maximum 2 tokeni per transfer
                  </p>
                </div>
              )}
            </div>

            <div className={`rounded-xl p-4 md:p-8 shadow-lg transition-all max-w-md mx-auto backdrop-blur-sm ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white/30 border border-gray-200/50'}`}>
              <form onSubmit={handleTransferTokens} className="space-y-4 md:space-y-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Email destinatar
                  </label>
                  <input
                    type="email"
                    value={transferData.recipient}
                    onChange={(e) => setTransferData(prev => ({ ...prev, recipient: e.target.value }))}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base backdrop-blur-sm ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10 text-white placeholder-gray-400' 
                        : 'bg-white/30 border-gray-200/50 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="utilizator@email.com"
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Sumă (Tokens)
                  </label>
                  <input
                    type="number"
                    value={transferData.amount}
                    onChange={(e) => setTransferData(prev => ({ ...prev, amount: parseInt(e.target.value) || 0 }))}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base backdrop-blur-sm ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10 text-white placeholder-gray-400' 
                        : 'bg-white/30 border-gray-200/50 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder={userTokens.level === 'Basic' ? "2" : "100"}
                    min="1"
                    max={userTokens.level === 'Basic' ? 2 : userTokens.balance}
                    required
                  />
                  <p className={`text-xs md:text-sm mt-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {userTokens.level === 'Basic' 
                      ? `Nivel Basic: maximum 2 tokeni per transfer`
                      : `Sold disponibil: ${userTokens.balance.toLocaleString()} tokens`
                    }
                  </p>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Mesaj (opțional)
                  </label>
                  <textarea
                    value={transferData.message}
                    onChange={(e) => setTransferData(prev => ({ ...prev, message: e.target.value }))}
                    rows={3}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base backdrop-blur-sm ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10 text-white placeholder-gray-400' 
                        : 'bg-white/30 border-gray-200/50 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="Mesaj pentru destinatar..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 md:py-3 px-3 md:px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm md:text-base"
                >
                  Trimite Tokens
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/50 backdrop-blur-md">
          <div className={`relative max-w-md w-full max-h-[95vh] overflow-y-auto rounded-2xl md:rounded-3xl shadow-2xl transition-all border-2 border-black
            ${isDarkMode ? 'bg-gray-900 backdrop-blur-xl' : 'bg-white'}`}
          >
            <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-black/20" />
            <div className="p-5 md:p-8">
              <div className="flex items-center justify-between mb-5 md:mb-6">
                <h3 className={`text-lg md:text-xl font-semibold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Finalizează Plata
                </h3>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedPackage(null);
                  }}
                  className={`p-2 rounded-xl transition-all hover:scale-105 ${
                    isDarkMode 
                      ? 'hover:bg-white/10 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            
              {/* Package Summary */}
              <div className={`mb-6 p-4 rounded-xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
              <h4 className={`font-semibold mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {selectedPackage.name}
              </h4>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {selectedPackage.tokens === -1 ? 'Tokens nelimitați' : `${selectedPackage.tokens.toLocaleString()} tokens`}
                </span>
                <div className="text-right">
                  {selectedPackage.price === 0 ? (
                    <span className={`font-bold text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Gratuit
                    </span>
                  ) : selectedPackage.discount && selectedPackage.discount > 0 ? (
                    <div>
                      <div className="flex items-center justify-end space-x-2">
                        <span className={`text-sm line-through transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {selectedPackage.originalPrice} Lei
                        </span>
                        <span className={`font-bold text-lg transition-colors ${
                          selectedPackage.discount >= 50 ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                          selectedPackage.discount >= 30 ? (isDarkMode ? 'text-orange-400' : 'text-orange-600') :
                          (isDarkMode ? 'text-red-400' : 'text-red-600')
                        }`}>
                          {selectedPackage.price} Lei
                        </span>
                      </div>
                      <span className={`text-xs font-semibold transition-colors ${
                        selectedPackage.discount >= 50 ? (isDarkMode ? 'text-green-300' : 'text-green-700') :
                        selectedPackage.discount >= 30 ? (isDarkMode ? 'text-orange-300' : 'text-orange-700') :
                        (isDarkMode ? 'text-red-300' : 'text-red-700')
                      }`}>
                        {selectedPackage.discount}% discount
                      </span>
                    </div>
                  ) : (
                    <span className={`font-bold text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {selectedPackage.price} Lei
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <label className={`block text-sm font-medium mb-3 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Metoda de plată
              </label>
              <div className="space-y-3">
                {isNativeIosApp ? (
                  <div
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left ${
                      isDarkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'
                    }`}
                  >
                    <svg className="w-6 h-6 flex-shrink-0 text-black" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M16.365 1.43c0 1.14-.417 2.09-1.247 2.87-.9.84-1.99 1.33-3.18 1.25-.05-1.09.43-2.12 1.29-2.91.43-.41.98-.76 1.64-1.04.65-.27 1.26-.42 1.83-.46.01.1.02.19.02.29zm4.22 15.24c-.46 1.07-.68 1.54-1.29 2.48-.84 1.28-2.03 2.88-3.51 2.9-1.31.01-1.65-.83-3.43-.83-1.78 0-2.16.82-3.46.84-1.48.03-2.61-1.39-3.45-2.66-1.88-2.86-2.08-6.21-.92-8.01.82-1.26 2.12-2.01 3.35-2.01 1.56 0 2.54.85 3.83.85 1.26 0 2-.85 3.82-.85 1.17 0 2.41.64 3.23 1.73-2.84 1.55-2.37 5.61.81 6.36z"
                      />
                    </svg>
                    <div>
                      <span className={`font-medium block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Plată în aplicație (Apple)
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Pe iPhone și iPad, tokenii se cumpără doar prin App Store.
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('netopia')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === 'netopia'
                          ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                          : isDarkMode ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 text-white' : 'border-2 border-gray-300 bg-white hover:border-black/50 text-gray-900'
                      }`}
                    >
                      <span className="flex-shrink-0 w-20 h-7 relative flex items-center justify-center rounded-md bg-white px-2">
                        <Image src="/netopia-logo.svg" alt="Netopia" fill className="object-contain object-center p-0.5" />
                      </span>
                      <span className={`font-medium transition-colors ${paymentMethod === 'netopia' ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Card bancar (Netopia)
                      </span>
                      {paymentMethod === 'netopia' && <span className="ml-auto text-gray-900">✓</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === 'bank'
                          ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                          : isDarkMode ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 text-white' : 'border-2 border-gray-300 bg-white hover:border-black/50 text-gray-900'
                      }`}
                    >
                      <BuildingLibraryIcon className={`w-8 h-8 flex-shrink-0 ${paymentMethod === 'bank' ? 'text-gray-600' : 'text-gray-500'}`} />
                      <span className={`font-medium transition-colors ${paymentMethod === 'bank' ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Transfer bancar
                      </span>
                      {paymentMethod === 'bank' && <span className="ml-auto text-gray-900">✓</span>}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Payment Button */}
            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedPackage(null);
                }}
                className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl font-medium text-sm md:text-base transition-all border-2 border-green-600 dark:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
              >
                Anulează
              </button>
              <button
                onClick={handlePaymentComplete}
                className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl font-medium text-sm md:text-base shadow-lg border-2 border-green-600 dark:border-green-500 transition-all ${isDarkMode ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
              >
                {selectedPackage.price === 0
                  ? 'Activează Gratuit'
                  : isNativeIosApp
                    ? 'Cumpără cu Apple (App Store)'
                    : selectedPackage.discount && selectedPackage.discount > 0
                      ? `Plătește ${selectedPackage.price} Lei (din ${selectedPackage.originalPrice} Lei)`
                      : `Plătește ${selectedPackage.price} Lei`}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
