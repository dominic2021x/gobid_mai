"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import Hammer from "../../components/Hammer";
import dynamic from "next/dynamic";
import supabase from "@/lib/supabase";
import { refreshSessionSingleFlight } from "@/lib/auth/getSupabaseSessionRobust";

// Dynamic import pentru AdminChatWidget
const AdminChatWidget = dynamic(
  () => import("../../components/admin/AdminChatWidget"),
  {
    ssr: false,
  }
);

type NavItem = {
  label: string;
  href?: string;
  icon: string;
  iconImage?: string;
  badge?: React.ReactNode;
  children?: NavItem[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0);
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [calendarNotes, setCalendarNotes] = useState<any[]>([]);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isSuperUserRole, setIsSuperUserRole] = useState(false);
  const [adminCapability, setAdminCapability] = useState<string>("admin");
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login" || !pathname;

  /** Neautentificat pe orice rută /admin/* în afară de /admin/login → redirect la login */
  useEffect(() => {
    if (isLoading) return;
    if (isLoginPage) return;
    if (!isAuthenticated) {
      router.replace("/admin/login");
    }
  }, [isLoading, isAuthenticated, isLoginPage, router]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      // Use 'darkMode' key to affect entire site
      localStorage.setItem('darkMode', newMode ? 'true' : 'false');
      // Also keep adminDarkMode for backward compatibility
      localStorage.setItem('adminDarkMode', JSON.stringify(newMode));
      // Apply dark mode to html element
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const clearIndexedDB = async () => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return;
    }

    try {
      const existingDatabases =
        (await (indexedDB as any).databases?.()) as Array<{ name?: string }> | undefined;

      const shouldPreserveDb = (name?: string) =>
        typeof name === 'string' && name.toLowerCase().startsWith('supabase');

      if (Array.isArray(existingDatabases)) {
        await Promise.all(
          existingDatabases
            .map((db) => db?.name)
            .filter((name): name is string => !!name)
            .filter((name) => !shouldPreserveDb(name))
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const request = indexedDB.deleteDatabase(name);
                  request.onsuccess = () => resolve();
                  request.onerror = () => resolve();
                  request.onblocked = () => resolve();
                })
            )
        );
      } else {
        // Fallback: încercăm să ștergem bazele cunoscute (exceptând supabase)
        const fallbackDbs = ['localforage', 'app-cache'];
        await Promise.all(
          fallbackDbs.map(
            (name) =>
              new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              })
          )
        );
      }
    } catch (error) {
      console.warn('Nu am putut șterge complet IndexedDB:', error);
    }
  };

  const handleClearCache = useCallback(async () => {
    if (isClearingCache) {
      return;
    }

    setIsClearingCache(true);
    try {
      if (typeof window !== 'undefined') {
        const preservedLocalStorageEntries: Array<{ key: string; value: string | null }> = [];

        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-')) {
              preservedLocalStorageEntries.push({ key, value: localStorage.getItem(key) });
            }
          }

          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !key.startsWith('sb-')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((key) => localStorage.removeItem(key));

          preservedLocalStorageEntries.forEach(({ key, value }) => {
            if (value !== null) {
              localStorage.setItem(key, value);
            }
          });
        } catch (error) {
          console.warn('Nu am putut curăța complet localStorage:', error);
        }

        try {
          sessionStorage.clear();
        } catch (error) {
          console.warn('Nu am putut goli sessionStorage:', error);
        }

        await clearIndexedDB();

        if ('caches' in window) {
          try {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
          } catch (error) {
            console.warn('Nu am putut curăța Cache Storage:', error);
          }
        }
      }

      alert('Cache-ul local a fost curățat. Rămâi autentificat.');
      setIsClearingCache(false);
    } catch (error) {
      console.error('Eroare la curățarea cache-ului:', error);
      alert('Nu am putut curăța complet cache-ul. Încearcă din nou.');
      setIsClearingCache(false);
    }
  }, [isClearingCache]);

  const roleFromMetadata = (user: any): string | undefined => {
    const metaRole =
      user?.user_metadata?.role ||
      user?.app_metadata?.role ||
      (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);
    return typeof metaRole === 'string' ? metaRole.toLowerCase() : undefined;
  };

  const isSuperUserRoleName = (role?: string) => {
    if (!role) return false;
    return ['super_user', 'superuser', 'owner', 'superadmin'].includes(role);
  };

  const getAdminInfoFromUser = (user: any, opts?: { isAdmin?: boolean }) => {
    const role = roleFromMetadata(user) || 'admin';
    const isSuperUser = isSuperUserRoleName(role);
    const isAdmin = opts?.isAdmin === true;

    return {
      firstName: user?.user_metadata?.first_name || 'Admin',
      lastName: user?.user_metadata?.last_name || '',
      email: user?.email || '',
      role,
      capabilities: isSuperUser ? 'super_user' : 'admin',
      isAdmin,
      isSuperUser,
    };
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Supabase sign out failed:', error);
    }
    localStorage.removeItem('adminInfo');
    window.location.href = '/admin/login';
  };

  // Admin notification functions
  const loadAdminNotifications = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const notifications = localStorage.getItem('adminNotifications');
    if (notifications) {
      setAdminNotifications(JSON.parse(notifications));
    } else {
      setAdminNotifications([]);
    }
  }, []);

  const loadCalendarNotes = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const saved = localStorage.getItem('calendar_day_notes');
      if (saved) {
        setCalendarNotes(JSON.parse(saved));
      } else {
        setCalendarNotes([]);
      }
    } catch (e) {
      console.error('Error loading calendar notes:', e);
    }
  }, []);

  const loadPendingTickets = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const allTickets: any[] = [];
    const seenIds = new Set<string>();

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('userTickets_')) {
          try {
            const userTickets = JSON.parse(localStorage.getItem(key) || '[]');
            userTickets.forEach((ticket: any) => {
              if (ticket?.id && !seenIds.has(ticket.id)) {
                seenIds.add(ticket.id);
                allTickets.push(ticket);
              }
            });
          } catch (err) {
            console.error('Error parsing tickets:', err);
          }
        }
      }

      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        try {
          const generalTicketsArray = JSON.parse(generalTickets);
          generalTicketsArray.forEach((ticket: any) => {
            if (ticket?.id && !seenIds.has(ticket.id)) {
              seenIds.add(ticket.id);
              allTickets.push(ticket);
            }
          });
        } catch (err) {
          console.error('Error parsing general tickets:', err);
        }
      }
    } catch (err) {
      console.error('Error loading tickets:', err);
    }

    const pendingCount = allTickets.filter((t) => t?.status === 'active').length;
    setPendingTicketsCount(pendingCount);
  }, []);

  const markAsRead = (notificationId: string) => {
    const updatedNotifications = adminNotifications.map(notification => 
      notification.id === notificationId 
        ? { ...notification, read: true }
        : notification
    );
    setAdminNotifications(updatedNotifications);
    localStorage.setItem('adminNotifications', JSON.stringify(updatedNotifications));
  };

  const handleNotificationClick = (notification: any) => {
    // Mark as read first
    markAsRead(notification.id);
    
    // Close notification dropdown
    setShowNotificationDropdown(false);
    
    // Navigate based on notification type
    if (notification.type === 'ticket_reply' && notification.ticketId) {
      // Navigate to tickets page and scroll to specific ticket
      window.location.href = '/admin/tickets';
      
      // Store ticket ID for highlighting after page load
      setTimeout(() => {
        localStorage.setItem('highlightTicketId', notification.ticketId);
        // Trigger a custom event to highlight the ticket
        window.dispatchEvent(new CustomEvent('highlightTicket', { 
          detail: { ticketId: notification.ticketId } 
        }));
      }, 100);
    } else if (notification.type === 'new_ticket' && notification.ticketId) {
      // Navigate to tickets page for new tickets
      window.location.href = '/admin/tickets';
      
      setTimeout(() => {
        localStorage.setItem('highlightTicketId', notification.ticketId);
        window.dispatchEvent(new CustomEvent('highlightTicket', { 
          detail: { ticketId: notification.ticketId } 
        }));
      }, 100);
    }
  };

  const clearAllNotifications = () => {
    const updatedNotifications = adminNotifications.map((notification) =>
      !notification.read ? { ...notification, read: true } : notification
    );
    setAdminNotifications(updatedNotifications);
    localStorage.setItem('adminNotifications', JSON.stringify(updatedNotifications));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedInfo = localStorage.getItem('adminInfo');
      if (storedInfo) {
        const parsed = JSON.parse(storedInfo);
        if (parsed) {
          setIsSuperUserRole(Boolean(parsed.isSuperUser));
          if (typeof parsed.capabilities === 'string') {
            setAdminCapability(parsed.capabilities);
          }
        }
      }
    } catch (error) {
      console.warn('Nu am putut citi adminInfo la montare:', error);
    }
  }, []);

  // Check admin authentication and load data from Supabase/local caches
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let calendarInterval: ReturnType<typeof setInterval> | null = null;

    const handleStorageChange = () => {
      loadPendingTickets();
      loadAdminNotifications();
      loadCalendarNotes();
      try {
        const storedInfo = localStorage.getItem('adminInfo');
        if (storedInfo) {
          const parsed = JSON.parse(storedInfo);
          if (parsed) {
            setIsSuperUserRole(!!parsed.isSuperUser);
            if (typeof parsed.capabilities === 'string') {
              setAdminCapability(parsed.capabilities);
            }
          }
        }
      } catch (error) {
        console.warn('Nu am putut sincroniza adminInfo din storage:', error);
      }
    };

    const finishAdminSession = (
      sessionUser: import("@supabase/supabase-js").User | null,
      attachListeners: boolean
    ) => {
      setIsAuthenticated(true);

      if (sessionUser) {
        try {
          const adminInfo = getAdminInfoFromUser(sessionUser, { isAdmin: true });
          setIsSuperUserRole(!!adminInfo.isSuperUser);
          if (typeof adminInfo.capabilities === "string") {
            setAdminCapability(adminInfo.capabilities);
          }

          const existingAdminInfo = localStorage.getItem("adminInfo");
          if (!existingAdminInfo) {
            localStorage.setItem("adminInfo", JSON.stringify(adminInfo));
          } else {
            const parsed = JSON.parse(existingAdminInfo);
            localStorage.setItem(
              "adminInfo",
              JSON.stringify({ ...parsed, ...adminInfo, isAdmin: true })
            );
          }
        } catch (error) {
          console.warn("Nu am putut sincroniza adminInfo local:", error);
        }
      }

      const savedDarkMode = localStorage.getItem("darkMode");
      const savedAdminDarkMode = localStorage.getItem("adminDarkMode");
      let darkModeValue = false;
      if (savedDarkMode !== null) {
        darkModeValue = savedDarkMode === "true";
      } else if (savedAdminDarkMode !== null) {
        try {
          darkModeValue = JSON.parse(savedAdminDarkMode);
        } catch {
          darkModeValue = false;
        }
      }
      darkModeValue = false;
      localStorage.setItem("darkMode", "false");
      localStorage.setItem("adminDarkMode", JSON.stringify(false));
      setIsDarkMode(false);
      document.documentElement.classList.remove("dark");

      loadAdminNotifications();
      loadCalendarNotes();
      loadPendingTickets();
      setIsLoading(false);

      if (attachListeners) {
        window.addEventListener("storage", handleStorageChange);
        calendarInterval = setInterval(() => {
          loadCalendarNotes();
        }, 3000);
      }
    };

    const fetchServerIsAdmin = async (): Promise<boolean> => {
      const base = { credentials: "include" as const, cache: "no-store" as const };
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const headers: HeadersInit = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/user/is-admin", {
        ...base,
        headers,
      });
      const json = (await res.json().catch(() => ({}))) as { isAdmin?: boolean };
      return json.isAdmin === true;
    };

    const initialize = async () => {
      try {
        try {
          await refreshSessionSingleFlight(supabase);
        } catch {
          /* ignore */
        }
        // 1) Server: cookie + (fallback) Bearer — user_profiles.is_admin sau user_profiles.role (admin, …)
        const isAdminServer = await fetchServerIsAdmin();

        if (!isMounted) {
          return;
        }

        if (isAdminServer) {
          try {
            await refreshSessionSingleFlight(supabase);
          } catch {
            /* ignore */
          }
          const { data: afterRefresh } = await supabase.auth.getSession();
          let u = afterRefresh?.session?.user ?? null;
          if (!u) {
            const { data: gu } = await supabase.auth.getUser();
            u = gu?.user ?? null;
          }
          finishAdminSession(u, true);
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (sessionError && sessionError.message !== "Auth session missing!") {
          console.warn("Nu am putut obține sesiunea curentă Supabase (getSession):", sessionError);
        }

        let sessionUser = sessionData?.session?.user ?? null;

        if (!sessionUser) {
          try {
            await refreshSessionSingleFlight(supabase);
            const { data: s2 } = await supabase.auth.getSession();
            sessionUser = s2?.session?.user ?? null;
          } catch {
            /* ignore */
          }
        }

        if (!sessionUser) {
          const { data: gu } = await supabase.auth.getUser();
          sessionUser = gu?.user ?? null;
        }

        if (!sessionUser) {
          try {
            localStorage.removeItem("adminInfo");
          } catch {
            /* ignore */
          }
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        try {
          localStorage.removeItem("adminInfo");
        } catch {
          /* ignore */
        }
        setIsAuthenticated(false);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.error("Error in admin layout initialization:", error);
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      if (calendarInterval) {
        clearInterval(calendarInterval);
      }
    };
  }, [loadAdminNotifications, loadCalendarNotes, loadPendingTickets]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
      const user = session?.user ?? null;

      if (typeof window === 'undefined') {
        return;
      }

      if (user) {
        void (async () => {
          try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess?.session?.access_token;
            const headers: HeadersInit = {};
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
            const res = await fetch("/api/user/is-admin", {
              credentials: "include",
              cache: "no-store",
              headers,
            });
            const json = (await res.json().catch(() => ({}))) as { isAdmin?: boolean };
            if (json.isAdmin !== true) {
              try {
                localStorage.removeItem("adminInfo");
              } catch {
                /* ignore */
              }
              setIsAuthenticated(false);
              return;
            }
            setIsAuthenticated(true);
            try {
              const adminInfo = getAdminInfoFromUser(user, { isAdmin: true });
              setIsSuperUserRole(!!adminInfo.isSuperUser);
              if (typeof adminInfo.capabilities === "string") {
                setAdminCapability(adminInfo.capabilities);
              }
              localStorage.setItem("adminInfo", JSON.stringify(adminInfo));
            } catch (error) {
              console.warn("Nu am putut actualiza adminInfo la schimbarea sesiunii:", error);
            }
          } catch {
            setIsAuthenticated(false);
          }
        })();
        return;
      }

      /**
       * Nu șterge adminInfo la primul frame cu user=null (sesiune încă în curs / mod privat).
       * Doar la deconectare reală — altfel login-ul salvează adminInfo, apoi listener-ul îl șterge înainte de initialize().
       */
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('adminInfo');
        setIsAuthenticated(false);
      }
    },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNotificationDropdown) {
        setShowNotificationDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showNotificationDropdown]);

  const upcomingCalendarCount = useMemo(() => {
    if (!calendarNotes || calendarNotes.length === 0) return 0;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return calendarNotes.filter((note: any) => {
        if (!note || !note.date) return false;
        const noteDate = new Date(note.date);
        if (Number.isNaN(noteDate.getTime())) return false;
        noteDate.setHours(0, 0, 0, 0);
        return noteDate >= today;
      }).length;
    } catch (err) {
      console.error("Error computing upcoming calendar notes", err);
      return 0;
    }
  }, [calendarNotes]);

  const navSections: NavSection[] = useMemo(
    () => [
      {
        title: "Panou",
        items: [
          { label: "Panou control", href: "/admin", icon: "ri-dashboard-line" },
          {
            label: "Calendar & note",
            href: "/admin/calendar",
            icon: "ri-calendar-line",
            badge: upcomingCalendarCount > 0 ? upcomingCalendarCount : undefined,
          },
          { label: "Statistici", href: "/admin/statistici", icon: "ri-bar-chart-line" },
          { label: "AI Search", href: "/admin/ai-search", icon: "ri-search-line" },
          { label: "Geo Lab", href: "/admin/search/geo-lab", icon: "ri-map-pin-line" },
        ],
      },
      {
        title: "Tutoriale & Feedback",
        items: [
          { label: "Tutoriale & feedback", href: "/admin/tutoriale", icon: "ri-lightbulb-line" },
        ],
      },
      {
        title: "Produse & AI",
        items: [
          { label: "Produse", href: "/admin/products", icon: "ri-shopping-bag-line" },
          { label: "Adaugă produs", href: "/admin/add-product", icon: "ri-add-box-line" },
          {
            label: "Produse Utilizatori",
            icon: "ri-user-line",
            children: [
              { label: "Toate produsele", href: "/admin/user-products", icon: "ri-list-check" },
              { label: "Aprobări", href: "/admin/user-products?tab=approvals&filter=pending", icon: "ri-checkbox-circle-line" },
              { label: "Refuzate", href: "/admin/user-products?tab=approvals&filter=rejected", icon: "ri-close-circle-line" },
            ],
          },
          { label: "Module & integrări", href: "/admin/modules", icon: "ri-plug-line" },
          { label: "Autopilot AI", href: "/admin/autopilot", icon: "ri-robot-line" },
          { label: "AI Drive", href: "/admin/ai-drive", icon: "ri-brain-line" },
          { label: "Filters AI Lab", href: "/admin/filters-lab", icon: "ri-filter-3-line" },
          { label: "Recategorizare", href: "/admin/recategorizare", icon: "ri-price-tag-3-line" },
          { label: "AI Monitor", href: "/admin/ai-monitor", icon: "ri-dashboard-3-line" },
          { label: "AI Search", href: "/admin/ai-search", icon: "ri-search-line" },
          { label: "Geo Lab", href: "/admin/search/geo-lab", icon: "ri-map-pin-line" },
          { label: "Review & QA", href: "/admin/review", icon: "ri-clipboard-check-line" },
          { label: "Idei Video", href: "/admin/idee-video", icon: "ri-video-add-line" },
          { label: "TTS Settings", href: "/admin/tts-settings", icon: "ri-mic-2-line" },
        ],
      },
      {
        title: "Comunicare",
        items: [
          { label: "Email", href: "/admin/email", icon: "ri-mail-line" },
          { label: "Newsletter", href: "/admin/newsletter", icon: "ri-mail-send-line" },
          { label: "Chat intern", href: "/admin/chats", icon: "ri-message-3-line" },
          { label: "Support tokeni", href: "/admin/support-tokeni", icon: "ri-coins-line" },
          {
            label: "Tichete suport",
            href: "/admin/tickets",
            icon: "ri-customer-service-2-line",
            badge: pendingTicketsCount > 0 ? pendingTicketsCount : undefined,
          },
          { label: "Rapoarte utilizatori", href: "/admin/reports", icon: "ri-file-warning-line" },
        ],
      },
      {
        title: "Importuri",
        items: [
          { label: "Importuri", href: "/admin/importuri", icon: "ri-download-cloud-2-line" },
          { label: "Piese auto (CSV)", href: "/admin/piese-auto", icon: "ri-car-line" },
          { label: "Licitatii insolventa", href: "/admin/importuri/licitatii-publice", icon: "ri-auction-line", iconImage: "/images/logo-unpir.png" },
          { label: "EXECUTARI-PUBLICE", href: "/admin/importuri/executari-publice", icon: "ri-scales-3-line" },
        ],
      },
      {
        title: "Growth",
        items: [
          { label: "Google Center", href: "/admin/growth", icon: "ri-line-chart-line" },
        ],
      },
      {
        title: "Administrare",
        items: [
          { label: "Utilizatori", href: "/admin/users", icon: "ri-user-settings-line" },
          { label: "Administratori", href: "/admin/users/admins", icon: "ri-shield-user-line" },
          { label: "Sistemul Cache", href: "/admin/cache", icon: "ri-database-2-line" },
          { label: "Curățare imagini", href: "/admin/cleanup", icon: "ri-delete-bin-5-line" },
          { label: "Healthchecks", href: "/admin/healthchecks", icon: "ri-heart-pulse-line" },
        ],
      },
    ],
    [upcomingCalendarCount, pendingTicketsCount]
  );

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  const renderNavItem = (item: NavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.has(item.label);
    const active = item.href ? isActive(item.href) : false;
    const baseColors = isDarkMode
      ? "text-gray-300 hover:bg-white/10"
      : "text-gray-700 hover:bg-blue-50";
    const activeColors = isDarkMode
      ? "bg-gradient-to-r from-blue-500/20 to-blue-500/20 text-white"
      : "bg-blue-100 text-blue-800";

    if (hasChildren) {
      return (
        <div key={item.label} className="space-y-0.5">
          <button
            onClick={() => toggleMenu(item.label)}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-all duration-200 ${
              isExpanded ? activeColors : baseColors
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.iconImage ? (
                <img src={item.iconImage} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
              ) : (
                <i className={`${item.icon} text-base flex-shrink-0`}></i>
              )}
              <span className="text-xs font-medium truncate">{item.label}</span>
            </div>
            <i className={`ri-arrow-${isExpanded ? 'up' : 'down'}-s-line text-xs flex-shrink-0`}></i>
          </button>
          {isExpanded && (
            <div className="ml-3 space-y-0.5 border-l border-gray-200 dark:border-gray-700 pl-1.5">
              {item.children!.map((child) => renderNavItem(child))}
            </div>
          )}
        </div>
      );
    }

    return (
      <a
        key={item.label}
        href={item.href || '#'}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-300 ${baseColors} ${
          active ? activeColors : ""
        }`}
      >
        {item.iconImage ? (
          <img src={item.iconImage} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
        ) : (
          <i className={`${item.icon} text-base flex-shrink-0`} />
        )}
        <span className="truncate text-xs font-medium">{item.label}</span>
        {item.badge ? (
          <span
            className={`ml-auto inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              isDarkMode
                ? "bg-white/15 text-white"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {item.badge}
          </span>
        ) : null}
      </a>
    );
  };

  // Show loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 flex items-center justify-center">
        <Hammer />
      </div>
    );
  }

  /* Neautentificat: useEffect face router.replace('/admin/login'); afișăm loader până la navigare */
  if (!isAuthenticated && !isLoginPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 flex items-center justify-center">
        <Hammer />
      </div>
    );
  }

  return (
    <>
      {isLoginPage ? (
        // Login page - no sidebar/header
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
          {children}
        </div>
      ) : (
        // Admin dashboard with sidebar/header
        <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'}`}>
          {/* Fixed Sidebar - compact */}
          <div className={`fixed left-0 top-0 w-[200px] h-full backdrop-blur-lg border-r z-40 transition-colors duration-300 ${isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white/85 border-gray-200 shadow-lg'}`}>
            <div className="flex h-full flex-col">
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-gradient-to-r from-blue-600 to-gray-600 rounded-md flex items-center justify-center shadow">
                    <i className="ri-diamond-fill text-white text-sm"></i>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold bg-gradient-to-r from-blue-400 via-gray-400 to-slate-400 bg-clip-text text-transparent truncate">
                      GoBid Admin
                    </h2>
                    <p className="text-[9px] uppercase tracking-wider text-gray-500">
                      Control
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20">
                {navSections.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <p
                      className={`px-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-500'
                      }`}
                    >
                      {section.title}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => renderNavItem(item))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

      {/* Fixed Top Bar - compact */}
      <div className={`fixed top-0 left-0 right-0 z-50 h-12 backdrop-blur-lg border-b transition-colors duration-300 ${isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white/90 border-gray-200 shadow-md'}`}>
        <div className="flex items-center justify-between h-12 px-3 ml-[200px]">
          <div className="flex items-center gap-2">
            <button className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
              <i className={`ri-menu-line text-xl transition-colors ${isDarkMode ? 'text-white' : 'text-gray-700'}`}></i>
            </button>
            <div className="hidden md:flex">
              <div>
                <h4 className={`text-sm font-semibold mb-0 transition-colors ${isDarkMode ? 'bg-gradient-to-r from-blue-400 via-gray-400 to-slate-400 bg-clip-text text-transparent' : 'text-gray-900'}`}>Panou Control Admin</h4>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearCache}
              disabled={isClearingCache}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all duration-300 ${
                isDarkMode
                  ? 'bg-gradient-to-r from-blue-500/20 to-blue-500/20 hover:from-blue-500/30 hover:to-blue-500/30 text-white disabled:opacity-60'
                  : 'bg-blue-100 hover:bg-blue-200 text-blue-700 disabled:opacity-60'
              }`}
              title="Curăță cache și sesiunea locală"
            >
              <i className="ri-refresh-line text-lg" />
              <span className="font-medium">
                {isClearingCache ? '...' : 'Cache'}
              </span>
            </button>
            <div className="relative hidden lg:block">
              <input
                type="text"
                placeholder="Caută..."
                className={`w-40 px-2.5 py-1.5 pl-8 text-sm backdrop-blur-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-300 ${isDarkMode ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' : 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500'}`}
              />
              <i className={`ri-search-line absolute left-2 top-1/2 transform -translate-y-1/2 text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}></i>
            </div>
            <div className="relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotificationDropdown(!showNotificationDropdown);
                }}
                className="p-1.5 hover:bg-gradient-to-r hover:from-red-500/20 hover:to-pink-500/20 rounded-md transition-all duration-300 relative"
              >
                <i className="ri-notification-line text-base text-red-400"></i>
                {adminNotifications.length > 0 && adminNotifications.some(n => !n.read) && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {adminNotifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              
              {/* Admin Notification Dropdown */}
              {showNotificationDropdown && (
                <div className={`absolute right-0 top-10 border rounded-lg shadow-xl z-[9999] w-72 max-h-80 overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className={`p-4 border-b transition-colors duration-300 ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Notificări Admin</h3>
                      {adminNotifications.filter(n => !n.read).length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearAllNotifications();
                          }}
                          className="text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          Marchează toate ca citite
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto">
                    {adminNotifications.filter(n => !n.read).length === 0 ? (
                      <div className={`p-4 text-center transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="ri-notification-off-line text-2xl mb-2"></i>
                        <p>Nu ai notificări noi</p>
                      </div>
                    ) : (
                      adminNotifications.filter(n => !n.read).map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          className={`p-4 border-b cursor-pointer transition-colors ${isDarkMode ? 'border-gray-600 bg-gray-700 hover:bg-gray-600' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                              <i className="ri-notification-3-line text-white text-sm"></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium text-sm transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{notification.title}</p>
                              <p className={`text-xs mt-1 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{notification.message}</p>
                              <p className={`text-xs mt-2 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {new Date(notification.timestamp).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}
                              </p>
                            </div>
                            <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-2"></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button className={`p-1.5 rounded-md transition-all duration-300 ${isDarkMode ? 'hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-blue-500/20' : 'hover:bg-blue-50'}`}>
              <i className={`ri-apps-line text-base transition-colors ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}></i>
            </button>
            <button 
              onClick={toggleDarkMode}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' 
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600'
              }`}
              title={isDarkMode ? 'Comută la White Mode' : 'Comută la Dark Mode'}
            >
              <i className={`text-base ${isDarkMode ? 'ri-moon-line' : 'ri-sun-line'}`}></i>
              <span className="text-xs font-medium hidden md:inline">
                {isDarkMode ? 'Dark' : 'White'}
              </span>
            </button>
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-6 h-6 bg-gradient-to-r from-blue-600 to-gray-600 rounded-full flex items-center justify-center shadow">
                <span className="text-[10px] font-medium text-white">A</span>
              </div>
              <span className={`text-xs font-medium transition-colors hidden sm:inline ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Admin</span>
              <button
                onClick={handleLogout}
                className="p-1 hover:bg-gradient-to-r hover:from-red-600/20 hover:to-gray-600/20 rounded-lg transition-all duration-300"
                title="Logout"
              >
                <i className="ri-logout-box-line text-sm text-red-400"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

                 {/* Main Content */}
                 <div className={`ml-[200px] pt-12 min-h-screen flex flex-col transition-colors duration-300 ${isDarkMode ? '' : 'bg-gray-50'}`}>
                   <div className="flex-1">
                     {children}
                   </div>
                   
                   {/* Admin Footer - Over Sidebar */}
                   <footer className={`py-2 px-4 border-t backdrop-blur-sm relative z-50 transition-colors duration-300 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white/80'}`}>
                     <div className="flex flex-col sm:flex-row justify-between items-center space-y-1 sm:space-y-0 gap-1">
                       <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                         © 2025 gobid.ro
                       </p>
                       <div className="flex items-center space-x-3 text-xs">
                         <span className={`transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>v2.1.0</span>
                         <div className="flex items-center space-x-1.5">
                           <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                           <span className={`transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Online</span>
                         </div>
                       </div>
                     </div>
                   </footer>
                 </div>
      </div>
      )}

      {/* Chat intern doar după autentificare admin (nu pe /admin/login) */}
      {isAuthenticated && !isLoginPage ? <AdminChatWidget /> : null}
    </>
  );
}
