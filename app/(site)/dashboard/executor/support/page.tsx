"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import React, { useState, useEffect, useRef } from "react";
import { HammerIcon } from "@/components/Hammer";
import { 
  StarIcon, 
  NotificationIcon, 
  ClockIcon, 
  CheckIcon,
  SettingsIcon,
  CreditCardIcon,
  UserIcon,
  SupportIcon
} from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getActiveAssistant } from '@/lib/ai/assistants';
import { findCustomResponse, loadResponseConfig } from '@/lib/ai/response-config';
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import supabase from "@/lib/supabase";
import {
  resolveAccountTypeWithUser,
  shouldRedirectAwayFromExecutorRoutes,
} from "@/lib/auth/resolveAccountType";

/** Email pentru API-ul de tichete: userInfo poate fi gol dacă profilul DB lipsește sau încărcarea nu s-a terminat. */
async function resolveUserEmailForSupport(
  supabaseClient: SupabaseClient,
  currentEmail: string,
  userId: string | null
): Promise<string | null> {
  const trimmed = (currentEmail || "").trim();
  if (trimmed) return trimmed;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("userInfo");
      if (raw) {
        const p = JSON.parse(raw) as Record<string, unknown>;
        const e = p.email ?? p.userEmail;
        if (typeof e === "string" && e.trim()) return e.trim();
      }
    } catch {
      /* ignore */
    }
  }
  const { data: gu } = await supabaseClient.auth.getUser();
  const authEmail = gu.user?.email?.trim();
  if (authEmail) return authEmail;
  const { data: gs } = await supabaseClient.auth.getSession();
  const sessionEmail = gs.session?.user?.email?.trim();
  if (sessionEmail) return sessionEmail;
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    return `user-${userId.slice(0, 8)}@id.gobid.ro`;
  }
  return null;
}

/** Tichetul poate fi doar în localStorage (creare offline / eroare rețea). Îl recreează în Supabase ca POST /api/support/tickets să accepte duplicate. */
async function syncSupportTicketToSupabase(
  supabaseClient: SupabaseClient,
  ticket: {
    id: unknown;
    subject?: string;
    category?: string;
    priority?: string;
    status?: string;
    requestedBy?: string;
    assignee?: string;
  },
  userInfo: { email: string; supabaseUserId: string | null }
): Promise<boolean> {
  const userEmail = await resolveUserEmailForSupport(
    supabaseClient,
    userInfo.email,
    userInfo.supabaseUserId
  );
  if (!userEmail) return false;
  const id = String(ticket.id);
  if (!id || id === "undefined") return false;
  const statusRaw = String(ticket.status || "").toLowerCase();
  const statusForApi = statusRaw === "closed" ? "closed" : "active";
  const res = await dashboardApiFetch("/api/support/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      userId: userInfo.supabaseUserId || null,
      userEmail,
      subject: ticket.subject || "Suport gobid.ro",
      category: ticket.category || "general",
      priority: ticket.priority || "medium",
      status: statusForApi,
      requestedBy: ticket.requestedBy || null,
      assignee: ticket.assignee || "Echipa Suport",
      messages: [],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (data.success) return true;
  const err = String(data.error || "");
  if (/duplicate|23505|unique constraint/i.test(err)) return true;
  return false;
}

export default function ExecutorSupportPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPieseAuto = searchParams.get("context") === "piese-auto";
  const isGeneralSupport = pathname === "/dashboard/support";
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : pathname?.startsWith("/dashboard/executor") ? "/dashboard/executor" : "/dashboard";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const defaultAvatar = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : null;
  const panelLabel = basePath?.includes("lichidator") ? "Panel privat pentru lichidatori" : basePath?.includes("executor") ? "Panel privat de executori" : "Suport";
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: '',
    supabaseUserId: null as string | null
  });
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic' as string
  });
  const [activeTab, setActiveTab] = useState('tickets');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [newTicket, setNewTicket] = useState({
    subject: '',
    category: 'technical',
    priority: 'medium',
    description: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitRef = useRef(false);
  const [validationErrors, setValidationErrors] = useState({
    subject: false,
    description: false,
    category: false,
    priority: false
  });
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackAnswers, setFeedbackAnswers] = useState<{[key: string]: string}>({});
  const [chatRating, setChatRating] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queueStartedForTicket = useRef<string | null>(null);

  // Încarcă rating salvat când se deschide un tichet
  useEffect(() => {
    if (selectedTicket?.id && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`chatRating_${selectedTicket.id}`);
      setChatRating(saved ? parseInt(saved, 10) : null);
    } else {
      setChatRating(null);
    }
  }, [selectedTicket?.id]);
  
  // AI Assistant (doar pentru afișare, nu setări)
  const [activeAssistant, setActiveAssistant] = useState<any>(null);

  // Echipă suport (5 agenți – nume din denumire avatar)
  const SUPPORT_AGENTS = [
    { avatar: '/avatare/Alina.png', name: 'Alina' },
    { avatar: '/avatare/Andreea.png', name: 'Andreea' },
    { avatar: '/avatare/Cristina.png', name: 'Cristina' },
    { avatar: '/avatare/Iulia.png', name: 'Iulia' },
    { avatar: '/avatare/Simona.png', name: 'Simona' },
  ];

  // Agent conectat pentru acest chat (index 0-4)
  const [connectedAgentIndex, setConnectedAgentIndex] = useState<number | null>(null);
  // Poziție în coadă (1-4) și status pentru simulare
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [showQueueStatus, setShowQueueStatus] = useState(false);
  // Ordine random pentru afișare avatare în header
  const [shuffledAgents] = useState(() => [...SUPPORT_AGENTS].sort(() => Math.random() - 0.5));

  // Sanitizează răspuns AI: elimină formulări de robot, înlocuiește cu ton uman
  const sanitizeAgentResponse = (text: string, agentName: string) => {
    if (!text) return text;
    let out = text
      .replace(/asistenta ta virtuală\s*\w*/gi, agentName)
      .replace(/asistentul tău virtual\s*\w*/gi, agentName)
      .replace(/asistent virtual\s*\w*/gi, agentName)
      .replace(/Cristina|Maria/gi, agentName)
      .replace(/Cu plăcere să te ajut!/gi, 'Cu plăcere!')
      .replace(/Sunt aici să te ajut/gi, 'Spune-mi dacă mai ai nevoie')
      .replace(/sunt aici pentru tine/gi, 'scrie dacă mai ai întrebări')
      .replace(/Cu siguranță!/gi, 'Da, sigur.')
      .replace(/Cu plăcere! 😊 Cu ce te pot ajuta în continuare\?/gi, 'Cu plăcere!')
      .replace(/Dacă ai alte întrebări, sunt aici să te ajut/gi, 'Dacă mai ai întrebări, scrie.');
    return out;
  };

  // Persistăm agentul per mesaj, ca istoricul să nu-și schimbe avatarul/numele la reconnect.
  const extractAgentIndexFromAttachments = (attachments: any): number | null => {
    if (!Array.isArray(attachments)) return null;
    const meta = attachments.find((item: any) => item && typeof item === 'object' && (item.type === 'agent_meta' || typeof item.agentIndex !== 'undefined'));
    if (!meta) return null;
    const n = Number(meta.agentIndex);
    if (!Number.isFinite(n)) return null;
    const idx = Math.trunc(n);
    return idx >= 0 && idx < SUPPORT_AGENTS.length ? idx : null;
  };

  const resolveMessageAgentIndex = (msg: any): number | null => {
    if (typeof msg?.agentIndex === 'number' && msg.agentIndex >= 0 && msg.agentIndex < SUPPORT_AGENTS.length) {
      return msg.agentIndex;
    }
    return extractAgentIndexFromAttachments(msg?.attachments);
  };

  const buildAgentMetaAttachment = (agentIdx: number) => ({
    type: 'agent_meta',
    agentIndex: agentIdx,
    agentName: SUPPORT_AGENTS[agentIdx]?.name || null,
    agentAvatar: SUPPORT_AGENTS[agentIdx]?.avatar || null,
  });

  // Elimină "Bună!" / "Salut!" din fața răspunsului (doar prima dată ar trebui să salute)
  const stripLeadingGreeting = (text: string) => {
    if (!text) return text;
    const stripped = text
      .replace(/^(Bună!?[,\s]*|Salut!?[,\s]*|Bună ziua!?[,\s]*|Hello!?[,\s]*|Hi!?[,\s]*|Hey!?[,\s]*)+/i, '')
      .replace(/^[.,;:\s]+/, '')
      .trim();
    return stripped || text;
  };

  // Calculează delay uman pentru scriere (proporțional cu lungimea mesajului)
  const getTypingDelay = (message: string) => {
    const base = 1500 + Math.random() * 1000;
    const perChar = 40 + Math.random() * 30;
    const total = base + (message?.length || 0) * perChar;
    return Math.min(12000, Math.max(2500, total));
  };

  // Auto scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Tickets data - starts empty, will be populated from localStorage
  const [tickets, setTickets] = useState<any[]>([]);

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

  // Helper function to load tickets from Supabase
  const loadTicketsFromSupabase = async (email: string, userId?: string) => {
    try {
      console.log('[Support] Loading tickets from Supabase...');
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (email) params.append('userEmail', email);

      const response = await dashboardApiFetch(`/api/support/tickets?${params.toString()}`);
      const result = await response.json();

      if (result.success && result.tickets) {
        console.log(`[Support] Loaded ${result.tickets.length} tickets from Supabase`);
        // Map Supabase format to local format
        const mappedTickets = result.tickets.map((ticket: any) => ({
          id: ticket.id,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          createdAt: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('ro-RO') : ticket.created_at,
          updatedAt: ticket.updated_at,
          requestedBy: ticket.requested_by,
          assignee: ticket.assignee,
          messages: (ticket.messages || []).map((msg: any) => ({
            id: msg.id,
            sender: msg.sender,
            message: msg.message,
            timestamp: msg.timestamp,
            attachments: msg.attachments || [],
            agentIndex: resolveMessageAgentIndex(msg),
          })),
        }));
        
        setTickets(mappedTickets);
        // Save to localStorage as cache
        localStorage.setItem(`userTickets_${email}`, JSON.stringify(mappedTickets));
        return mappedTickets;
      } else {
        console.warn('[Support] No tickets found in Supabase');
        return [];
      }
    } catch (error) {
      console.error('[Support] Error loading tickets from Supabase:', error);
      return null; // Return null to indicate error, will fallback to localStorage
    }
  };

  // Load user info, tokens and tickets from Supabase (with localStorage fallback) - same logic as dashboard
  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const { user: resolvedUser, accountType } = await resolveAccountTypeWithUser(supabase);
        const [{ data: sessionData, error: initialSessionError }, { data: userData }] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
        ]);
        let user = userData.user ?? sessionData.session?.user ?? resolvedUser;
        let userId: string | null = null;

        console.log('[Support] Initial session check:', {
          hasSession: !!sessionData.session,
          hasUser: !!user,
          userId: user?.id,
          sessionError: initialSessionError?.message,
          accountType,
        });

        // Redirect so URL matches account type; /dashboard/support acceptă toți utilizatorii
        if (user) {
          if (typeof window !== "undefined") {
            if (isGeneralSupport) {
              if (accountType === "executor") {
                window.location.href = "/dashboard/executor/support";
                return;
              }
              if (accountType === "liquidator") {
                window.location.href = "/dashboard/lichidator/support";
                return;
              }
            } else {
              if (shouldRedirectAwayFromExecutorRoutes(accountType)) {
                window.location.href = "/dashboard";
                return;
              }
              if (pathname?.startsWith("/dashboard/lichidator") && accountType === "executor") {
                window.location.href = "/dashboard/executor/support";
                return;
              }
              if (pathname?.startsWith("/dashboard/executor") && accountType === "liquidator") {
                window.location.href = "/dashboard/lichidator/support";
                return;
              }
            }
          }
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
                console.log('[Support] Found supabaseUserId in localStorage:', supabaseUserId);
                userId = supabaseUserId;
              } else {
                userId = userInfo.email || 'local-user';
                console.log('[Support] Using localStorage fallback for authentication (no supabaseUserId)');
              }
              
              // Set user info from localStorage
              if (!cancelled) setUserInfo(prev => ({ ...prev, ...userInfo }));
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
                  console.log('[Support] Admin/Manager access granted');
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

        // Load user info from Supabase if we have userId
        if (userId && user) {
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("first_name,last_name,phone,avatar_url")
            .eq("user_id", userId)
            .maybeSingle();

          if (profile) {
            if (!cancelled) setUserInfo(prev => ({
              ...prev,
              firstName: profile.first_name || prev.firstName,
              lastName: profile.last_name || prev.lastName,
              phone: profile.phone || prev.phone,
              avatar: profile.avatar_url || prev.avatar,
              email: user.email || prev.email,
              supabaseUserId: userId
            }));
          } else if (!cancelled) {
            setUserInfo(prev => ({
              ...prev,
              email: user.email || prev.email,
              supabaseUserId: userId,
              firstName: prev.firstName || (user.user_metadata?.first_name as string) || "",
              lastName: prev.lastName || (user.user_metadata?.last_name as string) || "",
            }));
          }
        } else if (typeof window !== "undefined") {
          // Fallback to localStorage
          const savedUserInfo = localStorage.getItem('userInfo');
          if (savedUserInfo) {
            try {
              const parsedInfo = JSON.parse(savedUserInfo);
              if (!cancelled) setUserInfo(prev => ({ ...prev, ...parsedInfo }));
            } catch (e) {
              console.error('Error parsing userInfo:', e);
            }
          }
        }

        // Load tickets - use email from userInfo
        const userEmail = user?.email || userInfo.email;
        const supabaseUserId = userId || userInfo.supabaseUserId;
        
        if (userEmail) {
          // Try to load tickets from Supabase first
          const supabaseTickets = await loadTicketsFromSupabase(
            userEmail,
            supabaseUserId || undefined
          );
          
          // If Supabase failed, fallback to localStorage
          if (supabaseTickets === null) {
            console.log('[Support] Falling back to localStorage...');
            const userSpecificTickets = localStorage.getItem(`userTickets_${userEmail || 'default'}`);
            if (userSpecificTickets) {
              const tickets = JSON.parse(userSpecificTickets);
              if (!cancelled) setTickets(tickets);
            }
          }
        }
      } catch (error) {
        console.error('[Support] Error loading user data:', error);
      }
      
      const savedTokens = localStorage.getItem('userTokens');

      // Load tokens from Supabase first
      const loadTokensFromSupabase = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const accessToken = session.access_token;
            const tokensResponse = await dashboardApiFetch('/api/tokens', {
              headers: {
              }
            });

            if (tokensResponse.ok) {
              const tokensData = await tokensResponse.json();
              
              // Dacă nu există record în Supabase și există tokeni în localStorage, migrează-i
              if (tokensData.balance === 0 && tokensData.totalEarned === 0 && tokensData.totalSpent === 0) {
                if (savedTokens) {
                  try {
                    const localTokens = JSON.parse(savedTokens);
                    if (localTokens.balance > 0 || localTokens.totalSpent > 0) {
                      console.log('[Support] Migrating tokens from localStorage to Supabase...');
                      const migrateResponse = await dashboardApiFetch('/api/tokens', {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          balance: localTokens.balance || 0,
                          totalEarned: localTokens.totalEarned || 0,
                          totalSpent: localTokens.totalSpent || 0,
                          level: localTokens.level || 'Basic',
                          package: localTokens.package || 'Basic'
                        })
                      });

                      if (migrateResponse.ok) {
                        const migratedData = await migrateResponse.json();
                        if (!cancelled) setUserTokens({
                          balance: migratedData.balance ?? 0,
                          totalEarned: migratedData.totalEarned ?? 0,
                          totalSpent: migratedData.totalSpent ?? 0,
                          level: migratedData.level || 'Basic',
                          package: migratedData.package || 'Basic'
                        });
                        return;
                      }
                    }
                  } catch (e) {
                    console.error('[Support] Error migrating tokens:', e);
                  }
                }
              }
              
              if (!cancelled) setUserTokens({
                balance: tokensData.balance ?? 0,
                totalEarned: tokensData.totalEarned ?? 0,
                totalSpent: tokensData.totalSpent ?? 0,
                level: tokensData.level || 'Basic',
                package: tokensData.package || 'Basic'
              });
              return;
            }
          }
        } catch (error) {
          console.error('Error loading tokens from Supabase:', error);
        }

        // Fallback to localStorage only if no Supabase session
        if (savedTokens) {
          const tokens = JSON.parse(savedTokens);
          if (!cancelled) setUserTokens(tokens);
        } else {
          // NO default tokens - must be 0 if no record exists
          if (!cancelled) setUserTokens({
            balance: 0,
            totalEarned: 0,
            totalSpent: 0,
            level: 'Basic',
            package: 'Basic'
          });
        }
      };

      await loadTokensFromSupabase();
    };

    void loadData();
    const retryTimer = setTimeout(() => { void loadData(); }, 1200);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) void loadData();
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500 text-white';
      case 'In asteptare raspuns': return 'bg-orange-500 text-white';
      case 'Am primit raspuns': return 'bg-blue-500 text-white';
      case 'Am raspuns': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-orange-500 text-white';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'technical': return <SettingsIcon size="s" className="text-orange-500" />;
      case 'billing': return <CreditCardIcon size="s" className="text-green-500" />;
      case 'account': return <UserIcon size="s" className="text-blue-500" />;
      case 'general': return <SupportIcon size="s" className="text-blue-500" />;
      default: return <SupportIcon size="s" className="text-blue-500" />;
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const errors = {
      subject: !newTicket.subject.trim(),
      description: !newTicket.description.trim(),
      category: !newTicket.category,
      priority: !newTicket.priority
    };
    
    setValidationErrors(errors);
    
    // Check if there are any errors
    if (errors.subject || errors.description || errors.category || errors.priority) {
      return; // Just show visual validation, no popup
    }
    
    // Prevent multiple submissions - triple check with ref
    if (isSubmitting || submitRef.current) {
      console.log('Submission already in progress, ignoring...');
      return;
    }
    
    console.log('Starting ticket creation...');
    setIsSubmitting(true);
    submitRef.current = true;
    
    // Add a small delay to prevent rapid double-clicks
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      // Generate unique ID with timestamp and random number to prevent duplicates
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      let uniqueId = `TK-${timestamp}-${random}`;
      
      // Check if ID already exists
      const existingIds = tickets.map(t => t.id);
      if (existingIds.includes(uniqueId)) {
        console.log('ID collision detected, generating new one...');
        const newTimestamp = Date.now() + Math.floor(Math.random() * 100);
        const newRandom = Math.floor(Math.random() * 1000);
        uniqueId = `TK-${newTimestamp}-${newRandom}`;
      }
    
    const newTicketData = {
        id: uniqueId,
      subject: newTicket.subject,
      category: newTicket.category,
      priority: newTicket.priority,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
        requestedBy: userInfo.firstName + ' ' + userInfo.lastName,
        assignee: 'Echipa Suport',
      messages: [
        {
        id: 1,
        sender: 'user',
        message: newTicket.description,
        timestamp: new Date().toISOString(),
        attachments: []
        },
        {
          id: 2,
          sender: 'ai',
          message: 'Salut! Sunt asistentul tău virtual de la gobid.ro! 😊 Cu ce te pot ajuta astăzi? Dacă nu pot răspunde la întrebarea ta, voi trimite tichetul mai departe la unul din colegii noștri din echipa de suport.',
          timestamp: new Date().toISOString(),
          attachments: []
        }
      ]
    };

      console.log('Creating ticket:', newTicketData.id);
      
      // Check for duplicate tickets based on subject and description
      const isDuplicate = tickets.some(ticket => 
        ticket.subject === newTicketData.subject && 
        ticket.messages[0]?.message === newTicketData.messages[0]?.message
      );
      
      if (isDuplicate) {
        console.log('Duplicate ticket detected, preventing creation...');
        setIsSubmitting(false);
        submitRef.current = false;
        setMessage({ type: 'error', text: 'Un tichet identic a fost deja creat. Te rugăm să verifici lista de tichete.' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
      
      // Save to Supabase first
      try {
        const userEmailForApi = await resolveUserEmailForSupport(
          supabase,
          userInfo.email,
          userInfo.supabaseUserId
        );
        if (!userEmailForApi) {
          setMessage({
            type: "error",
            text: "Nu am putut determina emailul contului. Reîncarcă pagina sau autentifică-te din nou.",
          });
          setTimeout(() => setMessage({ type: "", text: "" }), 5000);
          setIsSubmitting(false);
          submitRef.current = false;
          return;
        }
        const response = await dashboardApiFetch('/api/support/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: uniqueId,
            userId: userInfo.supabaseUserId || null,
            userEmail: userEmailForApi,
            subject: newTicketData.subject,
            category: newTicketData.category,
            priority: newTicketData.priority,
            status: newTicketData.status,
            requestedBy: newTicketData.requestedBy,
            assignee: newTicketData.assignee,
            messages: newTicketData.messages.map((msg: any) => ({
              sender: msg.sender,
              message: msg.message,
              timestamp: msg.timestamp,
              attachments: msg.attachments || [],
            })),
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to save ticket to Supabase');
        }

        console.log('[Support] Ticket saved to Supabase:', uniqueId);
        
        // Map Supabase response to local format
        const savedTicket = {
          id: result.ticket.id,
          subject: result.ticket.subject,
          category: result.ticket.category,
          priority: result.ticket.priority,
          status: result.ticket.status,
          createdAt: result.ticket.created_at ? new Date(result.ticket.created_at).toLocaleDateString('ro-RO') : new Date().toLocaleDateString('ro-RO'),
          updatedAt: result.ticket.updated_at,
          requestedBy: result.ticket.requested_by,
          assignee: result.ticket.assignee,
          messages: (result.ticket.messages || []).map((msg: any) => ({
            id: msg.id,
            sender: msg.sender,
            message: msg.message,
            timestamp: msg.timestamp,
            attachments: msg.attachments || [],
            agentIndex: resolveMessageAgentIndex(msg),
          })),
        };

        const updatedTickets = [savedTicket, ...tickets];
      setTickets(updatedTickets);
      
        // Save to localStorage as cache
      localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(updatedTickets));
      } catch (supabaseError: any) {
        console.error('[Support] Error saving to Supabase, saving to localStorage only:', supabaseError);
        // Fallback: save to localStorage only
        const updatedTickets = [newTicketData, ...tickets];
        setTickets(updatedTickets);
        localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(updatedTickets));
        setMessage({ type: 'warning', text: 'Tichetul a fost creat, dar nu a putut fi salvat în baza de date. Te rugăm să reîncerci mai târziu.' });
      }
      
    setNewTicket({ subject: '', category: 'technical', priority: 'medium', description: '' });
    setShowNewTicket(false);
    if (!message.text || message.type !== 'warning') {
    setMessage({ type: 'success', text: 'Tichetul a fost creat cu succes!' });
    }
      
      console.log('Ticket created successfully');
      
      // Wait 2 seconds before allowing new submissions
      setTimeout(() => {
        setIsSubmitting(false);
        submitRef.current = false;
        setMessage({ type: '', text: '' });
        console.log('Ready for new submissions');
      }, 2000);
      
    } catch (error) {
      console.error('Error creating ticket:', error);
      setIsSubmitting(false);
      submitRef.current = false;
      setMessage({ type: 'error', text: 'A apărut o eroare la crearea tichetului. Te rugăm să încerci din nou.' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    window.location.href = '/';
  };

  const handleStatusFilter = (status: string | null) => {
    setStatusFilter(status);
  };

  const handleOpenTicket = (ticket: any) => {
    console.log('Opening ticket:', ticket);
    setSelectedTicket(ticket);
    // Setează aiEnabled doar pentru chat-uri AI
    setAiEnabled(ticket.subject === 'Chat Tichet AI');
    setShowTicketModal(true);
    // Always center modal on open
    setModalPosition({
      x: 0,
      y: 0
    });
  };

  const handleCloseTicket = () => {
    setSelectedTicket(null);
    setShowTicketModal(false);
    setReplyMessage('');
  };

  const handleCreateChatTicket = async () => {
    // Setează tab-ul chat ca activ
    setActiveTab('chat');
    
    // Verifică dacă există deja un chat AI activ pentru user (nu este closed)
    const existingChatTicket = tickets.find(ticket => 
      ticket.subject === 'Chat Tichet AI' && 
      ticket.status !== 'closed'
    );
    
    if (existingChatTicket) {
      // Dacă există un chat activ, îl deschidem direct
      setSelectedTicket(existingChatTicket);
      setShowTicketModal(true);
      setAiEnabled(true);
      
      // Always center the modal
      setModalPosition({
        x: 0,
        y: 0
      });
      
      // Auto scroll to last message after modal opens
      setTimeout(() => {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
      return;
    }
    
    // Dacă nu există un chat activ, creăm unul nou (FĂRĂ mesaj de bun venit - userul trebuie să scrie primul)
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const uniqueId = `TK-${timestamp}-${random}`;

    const userEmailForChat = await resolveUserEmailForSupport(
      supabase,
      userInfo.email,
      userInfo.supabaseUserId
    );
    if (!userEmailForChat) {
      setMessage({
        type: "error",
        text: "Nu am putut determina emailul contului. Reîncarcă pagina sau autentifică-te din nou.",
      });
      setTimeout(() => setMessage({ type: "", text: "" }), 5000);
      return;
    }
    
    const newChatTicket = {
      id: uniqueId,
      subject: 'Chat Tichet AI',
      description: 'Conversație cu AI Assistant',
      status: 'active',
      priority: 'medium',
      category: 'general',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requestedBy: userInfo.firstName + ' ' + userInfo.lastName,
      assignee: 'Cristina - AI Assistant',
      messages: [] // NU mai trimitem mesaj automat - userul scrie primul
    };

    // Save to Supabase first
    try {
      const response = await dashboardApiFetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uniqueId,
          userId: userInfo.supabaseUserId || null,
          userEmail: userEmailForChat,
          subject: newChatTicket.subject,
          category: newChatTicket.category,
          priority: newChatTicket.priority,
          status: newChatTicket.status,
          requestedBy: newChatTicket.requestedBy,
          assignee: newChatTicket.assignee,
          messages: [],
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save chat ticket to Supabase');
      }

      console.log('[Support] Chat ticket saved to Supabase:', uniqueId);
      
      // Map Supabase response to local format
      const savedTicket = {
        id: result.ticket.id,
        subject: result.ticket.subject,
        category: result.ticket.category,
        priority: result.ticket.priority,
        status: result.ticket.status,
        createdAt: result.ticket.created_at ? new Date(result.ticket.created_at).toLocaleDateString('ro-RO') : new Date().toLocaleDateString('ro-RO'),
        updatedAt: result.ticket.updated_at,
        requestedBy: result.ticket.requested_by,
        assignee: result.ticket.assignee,
        messages: [],
      };

      const updatedTickets = [savedTicket, ...tickets];
      setTickets(updatedTickets);
      localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(updatedTickets));
      
      // Open the chat ticket directly
      setSelectedTicket(savedTicket);
      setShowTicketModal(true);
      setAiEnabled(true); // Enable AI by default for chat tickets
    } catch (supabaseError: any) {
      console.error('[Support] Error saving chat ticket to Supabase, saving to localStorage only:', supabaseError);
      // Fallback: save to localStorage only
    const updatedTickets = [newChatTicket, ...tickets];
    setTickets(updatedTickets);
    localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(updatedTickets));
    
    // Open the chat ticket directly
    setSelectedTicket(newChatTicket);
    setShowTicketModal(true);
      setAiEnabled(true);
    }
    
    // Always center the modal
    setModalPosition({
      x: 0,
      y: 0
    });
    
    // Auto scroll to last message after modal opens
    setTimeout(() => {
      const messagesContainer = document.getElementById('messages-container');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 100);
  };

  const handleCreateNormalTicket = () => {
    setActiveTab('new'); // Show the normal form
  };

    const handleSendReply = async () => {
      if (!replyMessage.trim() || !selectedTicket) {
        return;
      }

      const userMessage = replyMessage.trim();
      
      setReplyMessage(''); // Clear input immediately

      const newMessage = {
        id: selectedTicket.messages.length + 1,
        sender: 'user',
        message: userMessage,
        timestamp: new Date().toISOString(),
        attachments: []
      };

      const postMessageToApi = async () => {
        const response = await dashboardApiFetch("/api/support/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: String(selectedTicket.id),
            sender: "user",
            message: userMessage,
            attachments: [],
            timestamp: new Date().toISOString(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        return { response, result };
      };

      try {
        let { response, result } = await postMessageToApi();

        const ticketMissing =
          !result.success &&
          (response.status === 404 ||
            String((result as { error?: string }).error || "")
              .toLowerCase()
              .includes("nu există"));

        if (ticketMissing) {
          const synced = await syncSupportTicketToSupabase(supabase, selectedTicket, userInfo);
          if (synced) {
            ({ response, result } = await postMessageToApi());
          }
        }

        if (result.success) {
          console.log("[Support] Message saved to Supabase");

          const savedMessage = {
            id: (result as { message: { id: unknown } }).message.id,
            sender: (result as { message: { sender: string } }).message.sender,
            message: (result as { message: { message: string } }).message.message,
            timestamp: (result as { message: { timestamp: string } }).message.timestamp,
            attachments:
              (result as { message: { attachments?: unknown[] } }).message.attachments || [],
          };

          const updatedTicket = {
            ...selectedTicket,
            messages: [...selectedTicket.messages, savedMessage],
            status: "In asteptare raspuns",
            updatedAt: new Date().toISOString().split("T")[0],
          };

          const updatedTickets = tickets.map((t) =>
            t.id === selectedTicket.id ? updatedTicket : t
          );
          setTickets(updatedTickets);
          localStorage.setItem(
            `userTickets_${userInfo.email || "default"}`,
            JSON.stringify(updatedTickets)
          );
          setSelectedTicket(updatedTicket);

          if (aiEnabled && selectedTicket.subject === "Chat Tichet AI") {
            setTimeout(() => {
              simulateAIResponse(userMessage, updatedTicket);
            }, 100);
          }
        } else {
          console.warn(
            "[Support] Message API failed, using localStorage:",
            (result as { error?: string }).error || response.status
          );
          const updatedTicket = {
            ...selectedTicket,
            messages: [...selectedTicket.messages, newMessage],
            status: "In asteptare raspuns",
            updatedAt: new Date().toISOString().split("T")[0],
          };
          const updatedTickets = tickets.map((t) =>
            t.id === selectedTicket.id ? updatedTicket : t
          );
          setTickets(updatedTickets);
          localStorage.setItem(
            `userTickets_${userInfo.email || "default"}`,
            JSON.stringify(updatedTickets)
          );
          setSelectedTicket(updatedTicket);
          if (aiEnabled && selectedTicket.subject === "Chat Tichet AI") {
            setTimeout(() => {
              simulateAIResponse(userMessage, updatedTicket);
            }, 100);
          }
        }
      } catch (supabaseError: unknown) {
        console.error(
          "[Support] Error saving message to Supabase, saving to localStorage only:",
          supabaseError
        );
        const updatedTicket = {
          ...selectedTicket,
          messages: [...selectedTicket.messages, newMessage],
          status: "In asteptare raspuns",
          updatedAt: new Date().toISOString().split("T")[0],
        };

        const updatedTickets = tickets.map((t) =>
          t.id === selectedTicket.id ? updatedTicket : t
        );
        setTickets(updatedTickets);
        localStorage.setItem(
          `userTickets_${userInfo.email || "default"}`,
          JSON.stringify(updatedTickets)
        );
        setSelectedTicket(updatedTicket);
        if (aiEnabled && selectedTicket.subject === "Chat Tichet AI") {
          setTimeout(() => {
            simulateAIResponse(userMessage, updatedTicket);
          }, 100);
        }
      }
      
      // Create notification for admin
      const notification = {
        id: Date.now().toString(),
        type: 'ticket_reply',
        title: 'Răspuns de la client',
        message: `${userInfo.firstName} ${userInfo.lastName} a răspuns la tichetul #${selectedTicket.id}`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId: selectedTicket.id,
        userEmail: userInfo.email
      };

      // Add notification to admin notifications
      const adminNotifications = localStorage.getItem('adminNotifications');
      const allAdminNotifications = adminNotifications ? JSON.parse(adminNotifications) : [];
      allAdminNotifications.unshift(notification);
      localStorage.setItem('adminNotifications', JSON.stringify(allAdminNotifications));
      
      // Auto scroll to last message after sending
      setTimeout(() => {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 200);
    };

  // Drag and drop functions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // Only drag from header
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setModalPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add event listeners for drag
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Auto scroll to last message when selectedTicket changes
  React.useEffect(() => {
    if (selectedTicket && showTicketModal) {
      setTimeout(() => {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
    }
  }, [selectedTicket, showTicketModal]);


  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showEmojiPicker && !target.closest('.emoji-picker-container')) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Auto scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [selectedTicket?.messages]);

  // Load active assistant (doar pentru afișare, nu setări)
  useEffect(() => {
    setActiveAssistant(getActiveAssistant());
    
    // Update active assistant every minute
    const interval = setInterval(() => {
      setActiveAssistant(getActiveAssistant());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Simulare coadă și conectare agent când se deschide chat-ul gol
  useEffect(() => {
    if (!selectedTicket || selectedTicket.messages.length > 0 || !aiEnabled || selectedTicket.subject !== 'Chat Tichet AI') {
      if (selectedTicket?.messages?.length > 0) {
        queueStartedForTicket.current = null;
        const firstAi = selectedTicket.messages.find((m: any) => m.sender === 'ai');
        if (firstAi) setConnectedAgentIndex(typeof firstAi.agentIndex === 'number' ? firstAi.agentIndex : 0);
      }
      return;
    }

    const ticketId = selectedTicket.id;
    if (queueStartedForTicket.current === ticketId) return; // Evită dublarea când effect rulează de două ori
    queueStartedForTicket.current = ticketId;
    const initialPos = 1 + Math.floor(Math.random() * 4);
    setQueuePosition(initialPos);
    setShowQueueStatus(true);
    setConnectedAgentIndex(null);

    const tickMs = 3000 + Math.floor(Math.random() * 27000); // 3-30 secunde între decrementări

    const interval = setInterval(() => {
      setQueuePosition(p => {
        if (p === null || p <= 1) {
          clearInterval(interval);
          setShowQueueStatus(false);
          const agentIdx = Math.floor(Math.random() * 5);
          setConnectedAgentIndex(agentIdx);
          const agent = SUPPORT_AGENTS[agentIdx];

          setAiTyping(true);
          setTimeout(() => {
            const takeoverMsg = { id: Date.now(), sender: 'ai', message: `${agent.name} vă preia discuția. ✓`, timestamp: new Date().toISOString(), attachments: [], agentIndex: agentIdx };
            setTickets(prev => {
              const next = prev.map(t => t.id === ticketId ? { ...t, messages: [takeoverMsg], updatedAt: new Date().toISOString().split('T')[0] } : t);
              const updatedTkt = next.find(t => t.id === ticketId);
              if (updatedTkt) setSelectedTicket(updatedTkt);
              localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(next));
              return next;
            });
          }, 600 + Math.random() * 700);

          setTimeout(() => {
            setAiTyping(true);
            const greetingText = `Bună! Eu sunt ${agent.name}. Cu ce te pot ajuta?`;
            const typingDelay = Math.min(8000, Math.max(2500, 1500 + greetingText.length * 50 + Math.random() * 1000));
            setTimeout(() => {
              const takeoverMsg2 = { id: Date.now(), sender: 'ai', message: `${agent.name} vă preia discuția. ✓`, timestamp: new Date().toISOString(), attachments: [], agentIndex: agentIdx };
              const greetingMsg = { id: Date.now() + 1, sender: 'ai', message: `Bună! Eu sunt ${agent.name}. Cu ce te pot ajuta?`, timestamp: new Date().toISOString(), attachments: [], agentIndex: agentIdx };
              setTickets(prev => {
                const tkt = prev.find(t => t.id === ticketId);
                if (!tkt) return prev;
                const hasGreeting = tkt.messages.some((m: any) => m.message?.includes('Cu ce te pot ajuta'));
                if (hasGreeting) return prev;
                const msgs = tkt.messages.length > 0 ? [...tkt.messages, greetingMsg] : [takeoverMsg2, greetingMsg];
                const next = prev.map(t => t.id === ticketId ? { ...t, messages: msgs, updatedAt: new Date().toISOString().split('T')[0] } : t);
                const updatedTkt = next.find(t => t.id === ticketId);
                if (updatedTkt) setSelectedTicket(updatedTkt);
                localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(next));
                return next;
              });
              setAiTyping(false);
            }, typingDelay);
          }, 2000 + Math.random() * 1200);

          return 0;
        }
        return p - 1;
      });
    }, tickMs);

    return () => clearInterval(interval);
  }, [selectedTicket?.id, selectedTicket?.messages?.length, aiEnabled, selectedTicket?.subject]);

  // AI Chatbot functions - Website Scanner
  const scanWebsiteForProducts = async () => {
    try {
      // Simulează scanarea website-ului pentru produse
      const mockProducts = [
        { name: "iPhone 15 Pro", category: "Electronice", price: 4500, description: "Smartphone Apple iPhone 15 Pro, 256GB, Titanium" },
        { name: "Rolex Submariner", category: "Bijuterii", price: 25000, description: "Ceas de lux Rolex Submariner, automat, 40mm" },
        { name: "Picasso Original", category: "Artă", price: 150000, description: "Pictură originală Pablo Picasso, ulei pe pânză" },
        { name: "Tesla Model S", category: "Auto", price: 80000, description: "Mașină electrică Tesla Model S, 2023, 500km autonomie" },
        { name: "Diamond Ring", category: "Bijuterii", price: 12000, description: "Inel cu diamant 2ct, aur alb 18k, certificat GIA" }
      ];
      
      return mockProducts;
    } catch (error) {
      console.log('Error scanning website:', error);
      return [];
    }
  };

  const generateAIResponse = async (userMessage: string, conversationHistory: any[]) => {
    const websiteKnowledge = {
        // Informații despre licitații
        licitatii: [
          "Pe gobid.ro poți participa la licitații - ai nevoie de tokens în cont.",
          "Tokens suficienți în cont, apoi plasezi oferta. Poți cumpăra din secțiunea Tokens.",
          "Licitațiile au timp limitat, se încheie automat. Urmărește-le să nu riști să le ratezi.",
          "Poți adăuga la favorite și primești notificări când se apropie de sfârșit."
        ],
        // Informații despre tokens
        tokens: [
          "Tokens sunt moneda platformei - folosești pentru oferte la licitații.",
          "Cumperi din secțiunea Tokens din dashboard. Acceptăm cardul, transfer etc.",
          "Cu cât ai mai mulți tokens, cu atât poți licita mai mult.",
          "Poți trimite tokens și altor utilizatori din platformă."
        ],
        // Informații despre cont
        cont: [
          "În dashboard vezi licitațiile active și câștigate.",
          "Setări - acolo îți actualizezi datele, parola, notificările.",
          "Profil: nume, email, avatar. Le schimbi din Setări.",
          "Parola și preferințele se schimbă din Setări."
        ],
        // Informații despre suport
        suport: [
          "Suportul e disponibil non-stop. Poți crea tichete din chat.",
          "Deschizi un tichet pentru orice problemă. Ajungem la tine în câteva ore.",
          "Întrebările frecvente le răspundem aici. Restul merge la echipa tehnică.",
          "Pentru chestii mai complicate, colegii verifică în 24h."
        ],
        // Informații despre platformă
        platforma: [
          "gobid.ro e platformă de licitații din România.",
          "Licitații la electronice, bijuterii, artă, mobilier - tot felul.",
          "Produsele sunt verificate înainte de publicare.",
          "Tranzacțiile sunt sigure, datele protejate."
        ],
        // Informații despre produse
        produse: [
          "Da, poți adăuga produse din dashboard - secțiunea Adaugă Produs.",
          "Titlu, descriere, poze, preț de pornire. Cu atât mai multe detalii, cu atât mai bine.",
          "Le verificăm înainte de publicare, de obicei 24-48h.",
          "Electronice, bijuterii, artă, mobilier - aproape orice categorie.",
          "Max 10 poze per produs. Imaginea clară ajută mult."
        ]
    };

    // Analizează mesajul utilizatorului pentru cuvinte cheie
    const message = userMessage.toLowerCase();
    let response = "";
    let foundMatch = false;

    // Verifică dacă AI rezolvă o problemă
    const problemSolvedKeywords = ['rezolvat', 'gata', 'terminat', 'complet', 'finalizat', 'ok', 'perfect', 'bun'];
    const isProblemSolved = problemSolvedKeywords.some(keyword => message.includes(keyword));
    
    if (isProblemSolved) {
      const problemSolvedResponses = [
        "Super, mă bucur că s-a rezolvat.",
        "Ok, perfect.",
        "Bine, dacă mai ai nevoie de ceva, scrie.",
        "Gata, sper că e ok."
      ];
      return problemSolvedResponses[Math.floor(Math.random() * problemSolvedResponses.length)];
    }
    
    // Verifică dacă utilizatorul este civilizat și salută
    const politeGreetings = ['salut', 'bună', 'buna', 'bună ziua', 'buna ziua', 'bună seara', 'buna seara', 'hello', 'hi', 'hey'];
    const isPoliteGreeting = politeGreetings.some(greeting => message.includes(greeting));
    
    // Verifică dacă utilizatorul mulțumește
    const thanksWords = ['mulțumesc', 'multumesc', 'mersi', 'thank you', 'thanks', 'gracias'];
    const isThanking = thanksWords.some(thanks => message.includes(thanks));
    
    if (isPoliteGreeting) {
      const politeResponses = [
        "Cu ce te pot ajuta?",
        "Spune-mi cu ce ai nevoie.",
        "Da, te ascult.",
        "Cu ce te ajut?"
      ];
      return politeResponses[Math.floor(Math.random() * politeResponses.length)];
    }
    
    if (isThanking) {
      const thankResponses = [
        "Cu plăcere!",
        "Nu ai pentru ce.",
        "Cu plăcere, dacă mai ai nevoie de ceva.",
        "Nicio problemă."
      ];
      return thankResponses[Math.floor(Math.random() * thankResponses.length)];
    }

    // Căutare după cuvinte cheie
    if (message.includes('licitatii') || message.includes('licitație') || message.includes('oferte')) {
      response = websiteKnowledge.licitatii[Math.floor(Math.random() * websiteKnowledge.licitatii.length)];
      foundMatch = true;
    } else if (message.includes('token') || message.includes('bani') || message.includes('cumpăra')) {
      response = websiteKnowledge.tokens[Math.floor(Math.random() * websiteKnowledge.tokens.length)];
      foundMatch = true;
    } else if (message.includes('cont') || message.includes('profil') || message.includes('setări')) {
      response = websiteKnowledge.cont[Math.floor(Math.random() * websiteKnowledge.cont.length)];
      foundMatch = true;
    } else if (message.includes('suport') || message.includes('ajutor') || message.includes('problemă')) {
      response = websiteKnowledge.suport[Math.floor(Math.random() * websiteKnowledge.suport.length)];
      foundMatch = true;
    } else if (message.includes('platformă') || message.includes('site') || message.includes('website')) {
      response = websiteKnowledge.platforma[Math.floor(Math.random() * websiteKnowledge.platforma.length)];
      foundMatch = true;
    } else if (message.includes('produs') || message.includes('produse') || message.includes('adăuga') || message.includes('adauga') || message.includes('pune') || message.includes('vinde')) {
      // Scanează website-ul pentru produse reale
      const products = await scanWebsiteForProducts();
      
      if (products.length > 0) {
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        response = `Avem ${products.length} produse. Exemplu: ${randomProduct.name} (${randomProduct.category}) - ${randomProduct.price} Lei. Poți adăuga și tu din dashboard - Adaugă Produs.`;
      } else {
        response = websiteKnowledge.produse[Math.floor(Math.random() * websiteKnowledge.produse.length)];
      }
      foundMatch = true;
    } else if (message.includes('cauta') || message.includes('caută') || message.includes('găsește') || message.includes('gaseste')) {
      // Caută produse specifice
      const products = await scanWebsiteForProducts();
      const searchTerm = message.replace(/cauta|caută|găsește|gaseste/gi, '').trim();
      
      if (searchTerm && products.length > 0) {
        const filteredProducts = products.filter(product => 
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (filteredProducts.length > 0) {
          const product = filteredProducts[0];
          response = `Am găsit ${filteredProducts.length} produse pentru "${searchTerm}": ${product.name} (${product.category}) - ${product.price} Lei.`;
        } else {
          response = `Nu am găsit nimic pentru "${searchTerm}". Încearcă alt termen sau adaugă tu un produs.`;
        }
      } else {
        response = `Avem ${products.length} produse. Ce cauți mai exact?`;
      }
      foundMatch = true;
    }

    // Dacă nu găsește cuvinte cheie specifice, folosește răspunsuri generale (ton uman)
    if (!foundMatch) {
      const generalResponses = [
        "Nu sunt sigur ce cauți exact. Poți detalia puțin?",
        "Păi, despre ce ai vrea să știi mai exact?",
        "Hmm, nu am prins bine. Poți reformula?",
        "Nu e clar, spune-mi mai pe scurt ce te interesează."
      ];
      response = generalResponses[Math.floor(Math.random() * generalResponses.length)];
    }

    // Nu adăuga formulări de robot la final

    return response;
  };

  const simulateAIResponse = async (userMessage: string, currentTicket: any) => {
    // Verifică mai întâi răspunsurile manuale din config
    setAiTyping(true);

    try {
      // Încarcă configurația personalizată AI din localStorage
      let aiResponseConfig = null;
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('aiResponseConfig');
          if (saved) {
            aiResponseConfig = JSON.parse(saved);
          } else {
            // Dacă nu există, folosește default
            aiResponseConfig = loadResponseConfig();
          }
        } catch (e) {
          console.error('Error loading AI config:', e);
          aiResponseConfig = loadResponseConfig();
        }
      } else {
        aiResponseConfig = loadResponseConfig();
      }

      // Verifică dacă există un răspuns manual pentru mesajul userului
      const rawCustomResponse = findCustomResponse(userMessage, aiResponseConfig);
      
      if (rawCustomResponse) {
        const agentName = SUPPORT_AGENTS[connectedAgentIndex ?? 0]?.name || 'Echipa Suport';
        const customResponse = stripLeadingGreeting(sanitizeAgentResponse(rawCustomResponse, agentName));
        const typingDelay = getTypingDelay(customResponse);
        await new Promise(resolve => setTimeout(resolve, typingDelay));
        
        // Save AI message to Supabase
        try {
          const response = await dashboardApiFetch('/api/support/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: currentTicket.id,
              sender: 'ai',
              message: customResponse,
            attachments: [buildAgentMetaAttachment(connectedAgentIndex ?? 0)],
              timestamp: new Date().toISOString(),
            }),
          });

          const result = await response.json();

          if (result.success) {
            const agentIdx = connectedAgentIndex ?? 0;
            const savedMessage = {
              id: result.message.id,
              sender: result.message.sender,
              message: stripLeadingGreeting(sanitizeAgentResponse(result.message.message, SUPPORT_AGENTS[agentIdx]?.name || 'Echipa Suport')),
              timestamp: result.message.timestamp,
              attachments: result.message.attachments || [],
              agentIndex: agentIdx,
            };

            const updatedTicket = {
              ...currentTicket,
              messages: [...currentTicket.messages, savedMessage],
              updatedAt: new Date().toISOString().split('T')[0]
            };

            setTickets(prevTickets =>
              prevTickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
            );

            localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(
              tickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
            ));

            setSelectedTicket(updatedTicket);
            setAiTyping(false);
            return; // Nu continuă cu API-ul AI
          }
        } catch (error) {
          console.error('[Support] Error saving AI message to Supabase:', error);
        }

        // Fallback: save to localStorage only
        const agentIdx = connectedAgentIndex ?? 0;
        const aiMessage = {
          id: Date.now(),
          sender: 'ai',
          message: stripLeadingGreeting(sanitizeAgentResponse(customResponse, SUPPORT_AGENTS[agentIdx]?.name || 'Echipa Suport')),
          timestamp: new Date().toISOString(),
          attachments: [buildAgentMetaAttachment(agentIdx)],
          agentIndex: agentIdx,
        };

        const updatedTicket = {
          ...currentTicket,
          messages: [...currentTicket.messages, aiMessage],
          updatedAt: new Date().toISOString().split('T')[0]
        };

        setTickets(prevTickets =>
          prevTickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
        );

        localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(
          tickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
        ));

        setSelectedTicket(updatedTicket);
        setAiTyping(false);
        return; // Nu continuă cu API-ul AI
      }

      // Dacă nu există răspuns manual, folosește AI-ul
      const agentName = SUPPORT_AGENTS[connectedAgentIndex ?? 0]?.name || 'Agent';
      const conversationHistory = (currentTicket.messages || [])
        .filter((m: any) => m.sender === 'user' || m.sender === 'ai')
        .map((m: any) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.message || '',
        }));
      const response = await dashboardApiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationId: currentTicket.id,
          userId: userInfo.email,
          responseConfig: aiResponseConfig,
          agentName,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const answer = stripLeadingGreeting(sanitizeAgentResponse(data.answer || '', agentName));
      const typingDelay = getTypingDelay(answer);
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      // Save AI message to Supabase
      try {
        const response = await dashboardApiFetch('/api/support/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: currentTicket.id,
            sender: 'ai',
            message: answer,
            attachments: [buildAgentMetaAttachment(connectedAgentIndex ?? 0)],
            timestamp: new Date().toISOString(),
          }),
        });

        const result = await response.json();

        if (result.success) {
          const agentIdx = connectedAgentIndex ?? 0;
          const savedMessage = {
            id: result.message.id,
            sender: result.message.sender,
            message: result.message.message,
            timestamp: result.message.timestamp,
            attachments: result.message.attachments || [],
            agentIndex: agentIdx,
          };

          const updatedTicket = {
            ...currentTicket,
            messages: [...currentTicket.messages, savedMessage],
            updatedAt: new Date().toISOString().split('T')[0]
          };

          setTickets(prevTickets =>
            prevTickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
          );

          localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(
            tickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
          ));

          setSelectedTicket(updatedTicket);
          setAiTyping(false);
          return;
        }
      } catch (error) {
        console.error('[Support] Error saving AI message to Supabase:', error);
      }

        // Fallback: save to localStorage only
        const agentIdx = connectedAgentIndex ?? 0;
        const aiMessage = {
          id: Date.now(),
          sender: 'ai',
          message: answer,
          timestamp: new Date().toISOString(),
          attachments: [buildAgentMetaAttachment(agentIdx)],
          agentIndex: agentIdx,
        };

      const updatedTicket = {
        ...currentTicket,
        messages: [...currentTicket.messages, aiMessage],
        updatedAt: new Date().toISOString().split('T')[0]
      };

      setTickets(prevTickets =>
        prevTickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
      );

      localStorage.setItem(`userTickets_${userInfo.email || 'default'}`, JSON.stringify(
        tickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
      ));

      setSelectedTicket(updatedTicket);
      setAiTyping(false);

      // Dacă AI sugerează suport uman, pregătește tichetul pentru escalare
      if (data.needsHumanSupport) {
        // Poți adăuga logică aici pentru a marca tichetul pentru review uman
        console.log('AI suggests human support for this ticket');
      }
    } catch (error) {
      console.error('AI Response error:', error);
      
      // Fallback la răspuns simplu dacă API-ul eșuează - folosește template personalizat dacă e disponibil
      let fallbackText = 'Îmi pare rău, am întâmpinat o problemă tehnică. Te rog încearcă din nou sau contactează suportul pentru asistență.';
      
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('aiResponseConfig');
          if (saved) {
            const config = JSON.parse(saved);
            if (config.templates?.noResults) {
              fallbackText = config.templates.noResults;
            }
          }
        } catch (e) {
          // Ignore
        }
      }
      
      const agentIdx = connectedAgentIndex ?? 0;
      const fallbackMessage = {
        id: Date.now(),
        sender: 'ai',
        message: fallbackText,
        timestamp: new Date().toISOString(),
        attachments: [],
        agentIndex: agentIdx,
      };

      const updatedTicket = {
        ...currentTicket,
        messages: [...currentTicket.messages, fallbackMessage],
        updatedAt: new Date().toISOString().split('T')[0]
      };

      setTickets(prevTickets =>
        prevTickets.map(t => t.id === currentTicket.id ? updatedTicket : t)
      );

      setSelectedTicket(updatedTicket);
      setAiTyping(false);
    }
  };

  // Funcția veche (nu mai e folosită - folosim simulateAIResponse cu /api/chat)
  // Păstrată pentru referință, dar nu mai e utilizată

  const filteredTickets = statusFilter 
    ? tickets.filter(ticket => ticket.status === statusFilter && ticket.status !== 'closed')
    : tickets.filter(ticket => ticket.status !== 'closed');

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-300 relative ${
      isPieseAuto
        ? isDarkMode
          ? "bg-[#1a1d21]"
          : "bg-[#f5f6f8]"
        : isDarkMode
          ? "bg-gradient-to-br from-gray-900/30 via-gray-800/30 to-gray-700/30"
          : "bg-gradient-to-br from-gray-50/30 via-white/30 to-gray-50/30"
    }`}>
      {/* Background Emblem */}
      {!isGeneralSupport && !isPieseAuto && (
        <div 
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05]"
          style={{ backgroundImage: `url(${bgEmblem})` }}
        />
      )}

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
            {panelLabel}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto max-w-7xl px-2 sm:px-4 py-4 sm:py-8 flex-1 relative z-10">
        {/* Page Header */}
        <div className="mb-4 sm:mb-6 mt-8">
          <div className="flex items-center space-x-4">
            <BackButton
              fallbackHref={isPieseAuto ? "/dashboard/piese-auto" : basePath}
              label="Înapoi"
              className="shadow-md"
            />
            <div className="w-12 h-12 bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <SupportIcon size="l" className="text-white" />
            </div>
            <div>
              <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold mb-2 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent' 
                  : 'text-gray-900'
              }`}>
                Centrul de Suport
              </h2>
            </div>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-3 sm:mb-6 p-3 sm:p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 sm:mb-8">
          <div className={`backdrop-blur-sm rounded-xl sm:rounded-2xl p-1 sm:p-2 border ${
            isDarkMode 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/30 border-gray-200/50'
          }`}>
            <nav className="flex justify-between md:justify-start md:space-x-2">
              {[
                { id: 'tickets', name: 'Tichetele Mele', shortName: 'Tichetele mele', icon: <NotificationIcon size="m" className="text-blue-500" /> },
                { id: 'chat', name: 'Contactează Chat', shortName: 'Contactează Chat', icon: <SupportIcon size="m" className="text-green-500" /> },
                { id: 'new', name: 'Creează Tichet', shortName: 'Creează Tichet', icon: <i className="ri-ticket-line text-green-500 text-lg"></i> }
              ].map((tab) => (
                <div key={tab.id} className="relative">
                <button
                    onClick={() => {
                      if (tab.id === 'new') {
                        handleCreateNormalTicket();
                      } else if (tab.id === 'chat') {
                        handleCreateChatTicket();
                      } else {
                        setActiveTab(tab.id);
                      }
                    }}
                  className={`py-2 px-2 sm:py-3 sm:px-4 rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm transition-all duration-300 flex flex-row items-center space-x-1 sm:space-x-2 flex-1 md:flex-none justify-center ${
                    activeTab === tab.id
                      ? isDarkMode
                      ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg transform scale-105'
                        : 'bg-gradient-to-r from-gray-700 to-gray-600 text-white shadow-lg transform scale-105'
                      : isDarkMode
                        ? 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'
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

        {/* Tab Content */}
        <div>
        {activeTab === 'tickets' && (
          <div className="space-y-3 sm:space-y-6">
        {/* Stats Cards - Modern Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-6 mb-4 sm:mb-8">
          <div 
            className="bg-gradient-to-r from-gray-600 to-gray-500 rounded-xl sm:rounded-2xl p-3 sm:p-6 text-white cursor-pointer hover:shadow-2xl hover:scale-105 transition-all duration-300 border border-gray-400/30"
                onClick={() => handleStatusFilter(null)}
              >
                <div className="flex items-center justify-between">
                  <div>
                <p className="text-gray-200 text-xs sm:text-sm font-medium">TOTAL TICHETE</p>
                <p className="text-xl sm:text-3xl font-bold">{tickets.length}</p>
                  </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <i className="ri-percent-line text-lg sm:text-2xl"></i>
                  </div>
                </div>
              </div>

              <div 
            className="bg-gradient-to-r from-green-600 to-green-500 rounded-xl sm:rounded-2xl p-3 sm:p-6 text-white cursor-pointer hover:shadow-2xl hover:scale-105 transition-all duration-300 border border-green-400/30"
                onClick={() => handleStatusFilter('active')}
              >
                <div className="flex items-center justify-between">
                  <div>
                <p className="text-green-200 text-xs sm:text-sm font-medium">TICHETE ACTIVE</p>
                <p className="text-xl sm:text-3xl font-bold">{tickets.filter(t => t.status === 'active' && t.status !== 'closed').length}</p>
                  </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <i className="ri-percent-line text-lg sm:text-2xl"></i>
                  </div>
                </div>
              </div>

              <div 
            className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl sm:rounded-2xl p-3 sm:p-6 text-white cursor-pointer hover:shadow-2xl hover:scale-105 transition-all duration-300 border border-blue-400/30"
                onClick={() => handleStatusFilter('in-progress')}
              >
                <div className="flex items-center justify-between">
                  <div>
                <p className="text-blue-200 text-xs sm:text-sm font-medium">ÎN CURS</p>
                <p className="text-xl sm:text-3xl font-bold">{tickets.filter(t => t.status === 'in-progress').length}</p>
                  </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <i className="ri-percent-line text-lg sm:text-2xl"></i>
                  </div>
                </div>
              </div>

              <div 
            className="bg-gradient-to-r from-gray-500 to-gray-400 rounded-xl sm:rounded-2xl p-3 sm:p-6 text-white cursor-pointer hover:shadow-2xl hover:scale-105 transition-all duration-300 border border-gray-300/30"
                onClick={() => handleStatusFilter('resolved')}
              >
                <div className="flex items-center justify-between">
                  <div>
                <p className="text-gray-200 text-xs sm:text-sm font-medium">REZOLVATE</p>
                <p className="text-xl sm:text-3xl font-bold">{tickets.filter(t => t.status === 'resolved').length}</p>
                  </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <i className="ri-percent-line text-lg sm:text-2xl"></i>
                </div>
              </div>
              </div>
            </div>

            {/* Filter Status */}
            {statusFilter && (
              <div className={`p-2 sm:p-3 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <p className={`text-xs sm:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Afișezi tichetele cu statusul: <span className="font-semibold">
                    {statusFilter === 'active' ? 'Active' : 
                     statusFilter === 'in-progress' ? 'În Curs' : 'Rezolvate'}
                  </span>
                  <button 
                    onClick={() => handleStatusFilter(null)}
                    className={`ml-2 text-xs underline transition-colors ${
                      isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'
                    }`}
                  >
                    Arată toate
                  </button>
                </p>
              </div>
            )}

            {/* Tickets Table - Modern Design */}
            <div className={`backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-2xl border overflow-hidden ${
              isDarkMode 
                ? 'bg-white/5 border-white/10' 
                : 'bg-white/30 border-gray-200/50'
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className={isDarkMode ? 'bg-gradient-to-r from-gray-600/10 to-gray-500/10' : 'bg-white/20'}>
                    <tr>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>ID</th>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>Subiect</th>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider hidden sm:table-cell ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>Categorie</th>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>Prioritate</th>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>Status</th>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>Data Creării</th>
                      <th className={`px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-medium uppercase tracking-wider ${
                        isDarkMode ? 'text-white/80' : 'text-gray-600'
                      }`}>Acțiune</th>
                    </tr>
                  </thead>
                  <tbody className={isDarkMode ? 'bg-white/5 divide-y divide-white/10' : 'bg-white divide-y divide-gray-200'}>
              {filteredTickets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 sm:px-6 py-6 sm:py-12 text-center">
                          <div className="text-2xl sm:text-4xl mb-2 sm:mb-4">🎫</div>
                          <p className={`text-sm sm:text-base ${
                            isDarkMode ? 'text-white/60' : 'text-gray-500'
                          }`}>
                    {statusFilter 
                      ? `Nu există tichete cu statusul "${statusFilter === 'active' ? 'Active' : statusFilter === 'in-progress' ? 'În Curs' : 'Rezolvate'}"`
                      : 'Nu există tichete de suport'
                    }
                  </p>
                        </td>
                      </tr>
                    ) : (
                      filteredTickets.map((ticket, index) => (
                        <tr key={index} className={`cursor-pointer transition-colors duration-200 ${
                          isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-50'
                        }`} onClick={() => {
                          console.log('Row clicked, ticket:', ticket);
                          setSelectedTicket(ticket);
                          // Setează aiEnabled doar pentru chat-uri AI
                          setAiEnabled(ticket.subject === 'Chat Tichet AI');
                          setShowTicketModal(true);
                          setModalPosition({ x: 0, y: 0 });
                          
                          // Auto scroll to last message after modal opens
                          setTimeout(() => {
                            const messagesContainer = document.getElementById('messages-container');
                            if (messagesContainer) {
                              messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            }
                          }, 100);
                        }}>
                          <td className={`px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {ticket.id.substring(0, 8)}...
                          </td>
                          <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="text-base sm:text-xl mr-2 sm:mr-3">{getCategoryIcon(ticket.category)}</div>
                              <div className={`text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-none ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>{ticket.subject}</div>
                      </div>
                          </td>
                          <td className={`px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-xs sm:text-sm hidden sm:table-cell ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {ticket.category === 'technical' ? 'Tehnic' : 
                             ticket.category === 'billing' ? 'Facturare' : 
                             ticket.category === 'account' ? 'Cont' : 'General'}
                          </td>
                          <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap hidden md:table-cell">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority === 'high' ? 'Prioritate Mare' : 
                         ticket.priority === 'medium' ? 'Prioritate Medie' : 'Prioritate Mică'}
                      </span>
                          </td>
                          <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">
                            <span className={`inline-flex px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                        {ticket.status === 'active' ? 'Activ' : 
                         ticket.status === 'In asteptare raspuns' ? 'In asteptare raspuns' :
                         ticket.status === 'Am raspuns' ? 'Am primit raspuns' :
                         ticket.status === 'Am primit raspuns' ? 'Am primit raspuns' :
                         ticket.status}
                      </span>
                          </td>
                          <td className={`px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-xs sm:text-sm hidden lg:table-cell ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {ticket.createdAt}
                          </td>
                          <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-1 sm:space-x-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTicket(ticket);
                                  // Setează aiEnabled doar pentru chat-uri AI
                                  setAiEnabled(ticket.subject === 'Chat Tichet AI');
                                  setShowTicketModal(true);
                                  setModalPosition({ x: 0, y: 0 });
                                  
                                  // Auto scroll to last message after modal opens
                                  setTimeout(() => {
                                    const messagesContainer = document.getElementById('messages-container');
                                    if (messagesContainer) {
                                      messagesContainer.scrollTop = messagesContainer.scrollHeight;
                                    }
                                  }, 100);
                                }}
                                className={`transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border ${
                                  isDarkMode
                                    ? 'text-blue-400 hover:text-blue-300 bg-gradient-to-r from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 border-blue-400/30'
                                    : 'text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200'
                                }`}
                                title="Răspunde la tichet"
                              >
                                <i className="ri-reply-line text-sm sm:text-base"></i>
                            </button>
                              <button className={`transition-colors ${
                                isDarkMode ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                              }`}>
                                <i className="ri-more-2-fill text-sm sm:text-base"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'new' && (
          <div className={`backdrop-blur-sm rounded-2xl p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/10 border-gray-200/30'
          }`}>
            <h3 className={`text-2xl font-bold mb-6 text-center ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Creează Tichet Nou
            </h3>
            
            <form onSubmit={handleCreateTicket} className="space-y-6" noValidate>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Subiect *
                </label>
                <input
                  type="text"
                  value={newTicket.subject}
                  onChange={(e) => {
                    setNewTicket(prev => ({ ...prev, subject: e.target.value }));
                    if (validationErrors.subject) {
                      setValidationErrors(prev => ({ ...prev, subject: false }));
                    }
                  }}
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-gray-400 focus:border-transparent backdrop-blur-sm ${
                    validationErrors.subject
                      ? 'border-red-500 bg-red-500/20'
                      : isDarkMode
                        ? 'bg-white/5 border-white/10 text-white placeholder-white/50'
                        : 'bg-white/10 border-gray-200/30 text-gray-900 placeholder-gray-500'
                  }`}
                  placeholder="Descrie pe scurt problema ta"
                  required
                />
                {validationErrors.subject && (
                  <p className={`mt-1 text-sm ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>Subiectul este obligatoriu!</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-white/80' : 'text-gray-700'
                  }`}>
                    Categorie *
                  </label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => {
                      setNewTicket(prev => ({ ...prev, category: e.target.value }));
                      if (validationErrors.category) {
                        setValidationErrors(prev => ({ ...prev, category: false }));
                      }
                    }}
                    className={`w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-gray-400 focus:border-transparent backdrop-blur-sm ${
                      validationErrors.category
                        ? 'border-red-500 bg-red-500/20'
                        : isDarkMode
                          ? 'bg-white/5 border-white/10 text-white'
                          : 'bg-white/10 border-gray-200/30 text-gray-900'
                    }`}
                    required
                  >
                    <option value="technical" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>🔧 Tehnic</option>
                    <option value="billing" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>💳 Facturare</option>
                    <option value="account" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>👤 Cont</option>
                    <option value="general" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>❓ General</option>
                  </select>
                  {validationErrors.category && (
                    <p className={`mt-1 text-sm ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>Categoria este obligatorie!</p>
                  )}
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-white/80' : 'text-gray-700'
                    }`}>
                      Prioritate *
                    </label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => {
                      setNewTicket(prev => ({ ...prev, priority: e.target.value }));
                      if (validationErrors.priority) {
                        setValidationErrors(prev => ({ ...prev, priority: false }));
                      }
                    }}
                    className={`w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-gray-400 focus:border-transparent backdrop-blur-sm ${
                      validationErrors.priority
                        ? 'border-red-500 bg-red-500/20'
                        : isDarkMode
                          ? 'bg-white/5 border-white/10 text-white'
                          : 'bg-white/10 border-gray-200/30 text-gray-900'
                    }`}
                    required
                  >
                    <option value="low" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>🟢 Prioritate Mică</option>
                    <option value="medium" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>🟡 Prioritate Medie</option>
                    <option value="high" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>🔴 Prioritate Mare</option>
                  </select>
                  {validationErrors.priority && (
                    <p className={`mt-1 text-sm ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>Prioritatea este obligatorie!</p>
                  )}
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Descriere Detaliată *
                </label>
                <textarea
                  value={newTicket.description}
                  onChange={(e) => {
                    setNewTicket(prev => ({ ...prev, description: e.target.value }));
                    if (validationErrors.description) {
                      setValidationErrors(prev => ({ ...prev, description: false }));
                    }
                  }}
                  rows={6}
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none backdrop-blur-sm ${
                    validationErrors.description
                      ? 'border-red-500 bg-red-500/20'
                      : isDarkMode
                        ? 'bg-white/5 border-white/10 text-white placeholder-white/50'
                        : 'bg-white/10 border-gray-200/30 text-gray-900 placeholder-gray-500'
                  }`}
                  placeholder="Descrie în detaliu problema ta. Cu cât mai multe informații oferi, cu atât mai rapid îți vom putea oferi ajutorul."
                  required
                />
                {validationErrors.description && (
                  <p className={`mt-1 text-sm ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>Descrierea este obligatorie!</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-8 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-3 ${
                    isSubmitting
                      ? isDarkMode
                      ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                        : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : newTicket.priority === 'low'
                        ? 'bg-green-600 text-white hover:bg-gradient-to-r hover:from-green-600 hover:to-green-500 active:bg-gradient-to-r active:from-green-500 active:to-green-400 shadow-lg hover:shadow-xl transform hover:scale-105'
                        : newTicket.priority === 'medium'
                          ? 'bg-yellow-600 text-white hover:bg-gradient-to-r hover:from-yellow-600 hover:to-yellow-500 active:bg-gradient-to-r active:from-yellow-500 active:to-yellow-400 shadow-lg hover:shadow-xl transform hover:scale-105'
                          : newTicket.priority === 'high'
                            ? 'bg-red-600 text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-500 active:bg-gradient-to-r active:from-red-500 active:to-red-400 shadow-lg hover:shadow-xl transform hover:scale-105'
                            : isDarkMode
                              ? 'bg-gray-600 text-white hover:bg-gradient-to-r hover:from-gray-600 hover:to-gray-500 active:bg-gradient-to-r active:from-gray-500 active:to-gray-400 shadow-lg hover:shadow-xl transform hover:scale-105'
                              : 'bg-gray-700 text-white hover:bg-gradient-to-r hover:from-gray-700 hover:to-gray-600 active:bg-gradient-to-r active:from-gray-600 active:to-gray-500 shadow-lg hover:shadow-xl transform hover:scale-105'
                  }`}
                >
                  {isSubmitting && (
                    <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${
                      isDarkMode ? 'border-white' : 'border-gray-900'
                    }`}></div>
                  )}
                  {isSubmitting ? 'Se trimite...' : 'Creează Tichet'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className={`backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/10 border-gray-200/30'
          }`}>
            {(() => {
              // Găsește chat-ul activ
              const activeChatTicket = tickets.find(ticket => 
                ticket.subject === 'Chat Tichet AI' && 
                ticket.status !== 'closed'
              );
              
              if (activeChatTicket) {
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className={`text-2xl font-bold mb-2 ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          Chat AI Activ
                        </h3>
                        <p className={`text-sm ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`}>
                          Tichet: {activeChatTicket.id}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTicket(activeChatTicket);
                          setShowTicketModal(true);
                          setAiEnabled(true);
                          setModalPosition({ x: 0, y: 0 });
                          setTimeout(() => {
                            const messagesContainer = document.getElementById('messages-container');
                            if (messagesContainer) {
                              messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            }
                          }, 100);
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-500 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                      >
                        <i className="ri-chat-3-line mr-2"></i>
                        Deschide Chat
                      </button>
                    </div>
                    
                    {/* Info Card */}
                    <div className={`rounded-xl p-6 border backdrop-blur-sm ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10' 
                        : 'bg-white/10 border-gray-200/30'
                    }`}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className={`text-sm mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>Status</p>
                          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(activeChatTicket.status)}`}>
                            {activeChatTicket.status === 'active' ? 'Activ' : activeChatTicket.status}
                          </span>
                        </div>
                        <div>
                          <p className={`text-sm mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>Mesaje</p>
                          <p className={`font-semibold ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {activeChatTicket.messages?.length || 0}
                          </p>
                        </div>
                        <div>
                          <p className={`text-sm mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>Creat la</p>
                          <p className={`text-sm ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {activeChatTicket.createdAt ? new Date(activeChatTicket.createdAt).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) : 'N/A'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Ultimele mesaje */}
                      {activeChatTicket.messages && activeChatTicket.messages.length > 0 && (
                        <div className={`mt-6 pt-6 border-t ${
                          isDarkMode ? 'border-white/10' : 'border-gray-200'
                        }`}>
                          <p className={`text-sm mb-4 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>Ultimele mesaje</p>
                          <div className="space-y-3 max-h-64 overflow-y-auto">
                            {activeChatTicket.messages.slice(-3).reverse().map((msg: any, index: number) => (
                              <div 
                                key={index} 
                                className={`p-3 rounded-lg backdrop-blur-sm ${
                                  msg.sender === 'user' 
                                    ? isDarkMode 
                                      ? 'bg-blue-500/20 text-white' 
                                      : 'bg-blue-100/50 text-blue-900'
                                    : isDarkMode 
                                      ? 'bg-gray-700/30 text-gray-200' 
                                      : 'bg-gray-100/50 text-gray-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-xs font-semibold ${
                                    isDarkMode ? 'opacity-80' : 'opacity-90'
                                  }`}>
                                    {msg.sender === 'user' ? 'Tu' : 'AI'}
                                  </span>
                                  <span className="text-xs opacity-60">
                                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                                <p className="text-sm">{msg.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gradient-to-r from-blue-500/20 to-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <i className="ri-chat-3-line text-blue-400 text-4xl"></i>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Nu ai chat activ
                    </h3>
                    <p className="text-gray-300 mb-6">
                      Apasă butonul "Contactează Chat" pentru a crea un nou chat cu AI Assistant
                    </p>
                    <button
                      onClick={handleCreateChatTicket}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-500 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                    >
                      <i className="ri-chat-new-line mr-2"></i>
                      Creează Chat Nou
                    </button>
                  </div>
                );
              }
            })()}
          </div>
        )}

        </div>
      </div>

      {/* Reply Modal - Telegram Style pentru Chat AI, Normal pentru Tichete (identic cu Admin) */}
      {showTicketModal && selectedTicket && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 pt-20 pb-6 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            // Închide modal-ul când se dă click pe backdrop
            if (e.target === e.currentTarget) {
              handleCloseTicket();
            }
          }}
        >
          <div 
            className={`${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (isDarkMode ? 'bg-gray-900/98 backdrop-blur-xl border-gray-700/50' : 'bg-white/98 backdrop-blur-xl border-gray-200/80') : 'bg-white/95 backdrop-blur-lg'} ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'w-full max-w-md' : 'max-w-4xl w-full'} rounded-2xl ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'h-[78vh] sm:h-[82vh] max-h-[calc(100vh-5rem)]' : 'h-[80vh]'} overflow-hidden shadow-2xl border flex flex-col`}
            onClick={(e) => {
              // Previne închiderea când se dă click pe conținutul modal-ului
              e.stopPropagation();
            }}
          >
            {/* Background Emblem for Chat */}
            {(selectedTicket.subject === 'Chat Tichet AI' || aiEnabled) && !isGeneralSupport && (
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05]"
                style={{ backgroundImage: `url(${bgEmblem})` }}
              />
            )}
            {/* Header */}
            {selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (
              // Header Telegram Style pentru Chat AI
              <div className={`flex items-center justify-between p-4 sm:p-5 border-b relative z-10 ${isDarkMode ? 'bg-gray-800/95 border-gray-700' : 'bg-gray-50/95 border-gray-200'}`}>
                <div className="flex items-center space-x-3 sm:space-x-4">
                  {connectedAgentIndex !== null ? (
                    <>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-700 flex-shrink-0 shadow-md bg-gray-200">
                        <img src={SUPPORT_AGENTS[connectedAgentIndex].avatar} alt={SUPPORT_AGENTS[connectedAgentIndex].name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/user.png'; }} />
                      </div>
                      <div>
                        <h3 className={`text-base sm:text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{SUPPORT_AGENTS[connectedAgentIndex].name}</h3>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Online</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex -space-x-2 sm:-space-x-3">
                        {shuffledAgents.map((agent, i) => (
                          <div key={i} className="w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-700 flex-shrink-0 shadow-md bg-gray-200" style={{ zIndex: shuffledAgents.length - i }}>
                            <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/user.png'; }} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <h3 className={`text-base sm:text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Echipă Suport</h3>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Online</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                <button
                    onClick={handleCloseTicket}
                    className={`p-2 rounded-lg transition-colors duration-200 ${isDarkMode ? 'hover:bg-gray-600 text-white' : 'hover:bg-gray-200 text-gray-700'}`}
                  >
                    <i className="ri-close-line text-lg sm:text-xl"></i>
                  </button>
                </div>
                    </div>
                  ) : (
              // Header Normal pentru Tichete (identic cu Admin)
              <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-500 rounded-full flex items-center justify-center">
                      <i className="ri-customer-service-line text-white text-xl"></i>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white">Tichet Suport</h3>
                      <p className="text-gray-300">#{selectedTicket.id} - {selectedTicket.subject || selectedTicket.title}</p>
                    </div>
                  </div>
                <button
                  onClick={handleCloseTicket}
                    className="p-2 hover:bg-gray-600 rounded-lg transition-colors duration-200"
                >
                    <i className="ri-close-line text-gray-300 text-xl"></i>
                </button>
              </div>
            </div>
            )}

            {/* Messages Area */}
            <div id="messages-container" className={`flex-1 ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? `p-4 sm:p-5 overflow-y-auto relative z-10 ${isDarkMode ? 'bg-gray-900/50' : 'bg-gray-50/50'}` : 'p-6 overflow-y-auto bg-gray-50'}`}>
              <div className={selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'space-y-3 sm:space-y-4' : 'space-y-4'}>
                {showQueueStatus && queuePosition !== null && (
                  <div className="flex justify-center py-6">
                    <div className={`px-4 py-3 rounded-xl border shadow-sm ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-200 text-gray-800'}`}>
                      <p className="text-sm font-medium">Sunteți poziția <span className="font-bold text-blue-500">{queuePosition}</span> în coadă. Vă rugăm așteptați...</p>
                    </div>
                  </div>
                )}
                {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                  selectedTicket.messages.map((msg: any, index: number) => {
                    const isTelegramStyle = (selectedTicket.subject === 'Chat Tichet AI' || aiEnabled);
                    return (
                      <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} ${isTelegramStyle ? 'items-end gap-2' : ''}`}>
                        {/* Avatar pentru AI (doar în Telegram style) */}
                        {isTelegramStyle && msg.sender !== 'user' && (
                          <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-600 flex items-center justify-center flex-shrink-0 mb-1 shadow-md bg-gray-200">
                            {(() => {
                              const idx = typeof msg.agentIndex === 'number' ? msg.agentIndex : (connectedAgentIndex ?? 0);
                              const agent = SUPPORT_AGENTS[idx];
                              return agent ? <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/user.png'; }} /> : null;
                            })()}
                      </div>
                        )}
                        {/* Avatar pentru User (doar în Telegram style) */}
                        {isTelegramStyle && msg.sender === 'user' && (
                          <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-blue-400/50 flex items-center justify-center flex-shrink-0 mb-1 bg-gradient-to-br from-blue-300 to-blue-400">
                            {(userInfo.avatar || defaultAvatar) ? (
                              <img 
                                src={userInfo.avatar || defaultAvatar!}
                                alt={userInfo.firstName || 'User'}
                                className="w-full h-full object-cover object-center"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center ${(userInfo.avatar || defaultAvatar) ? 'hidden' : ''}`}>
                              <span className="text-xs font-bold text-white">
                                {userInfo.firstName ? userInfo.firstName.charAt(0).toUpperCase() : 'U'}
                              </span>
                            </div>
                      </div>
                        )}
                        
                        <div className={`${isTelegramStyle ? 'max-w-[85%] flex flex-col' : 'max-w-[75%]'} ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                          
                          {/* Bula mesajului - Telegram Style pentru AI, Normal pentru Tichete */}
                          <div className={`${
                            isTelegramStyle 
                              ? msg.sender === 'user'
                                ? 'bg-blue-700 backdrop-blur-sm text-white rounded-2xl rounded-br-sm shadow-md border border-blue-600' // Albastru închis pentru utilizator (Telegram)
                                : 'bg-blue-500 backdrop-blur-sm text-white rounded-2xl rounded-bl-sm shadow-md border border-blue-400' // Albastru deschis pentru AI (Telegram)
                              : msg.sender === 'user'
                                ? 'bg-gradient-to-r from-blue-800 to-blue-600 text-white rounded-lg' // Gradient pentru user (identic cu Admin)
                                : msg.sender === 'admin'
                                  ? 'bg-gradient-to-r from-blue-400 to-blue-300 text-white rounded-lg' // Gradient pentru admin (identic cu Admin)
                                  : 'bg-gray-200 text-gray-800 rounded-lg'
                          } w-full ${isTelegramStyle ? 'px-4 py-3 sm:px-5 sm:py-4' : 'p-5'} break-words overflow-wrap-anywhere`}>
                            {/* Structură pentru tichete normale (identic cu Admin) */}
                            {!isTelegramStyle && (
                              <>
                                <div className="flex items-center gap-2 mb-3">
                                  {msg.sender === 'admin' && (
                                    <>
                                      <i className="ri-admin-line text-sm"></i>
                                      <span className="text-sm font-medium opacity-80 whitespace-nowrap">Admin</span>
                                    </>
                    )}
                    {msg.sender === 'user' && (
                                    <>
                                      {(userInfo.avatar || defaultAvatar) ? (
                                        <img
                                          src={userInfo.avatar || defaultAvatar!}
                                          alt={userInfo.firstName || 'User'}
                                          className="w-6 h-6 rounded-full object-cover object-center border border-white/30 flex-shrink-0"
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            const fallback = target.nextElementSibling as HTMLElement;
                                            if (fallback) fallback.style.display = 'flex';
                                          }}
                                        />
                                      ) : null}
                                      <div 
                                        className={`w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 ${(userInfo.avatar || defaultAvatar) ? 'hidden' : ''}`}
                                      >
                                        <span className="text-xs font-bold">
                          {userInfo.firstName ? userInfo.firstName.charAt(0).toUpperCase() : 'U'}
                        </span>
                      </div>
                                      <span className="text-sm font-medium opacity-80 break-words">
                          {userInfo.firstName && userInfo.lastName 
                            ? `${userInfo.firstName} ${userInfo.lastName}` 
                            : 'Utilizator'
                          }
                        </span>
                                    </>
                                  )}
                      </div>
                                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
                                <p className="text-xs opacity-70 mt-3">{msg.timestamp}</p>
                              </>
                            )}
                            {/* Structură pentru chat AI (Telegram style) */}
                            {isTelegramStyle && (
                              <>
              {msg.sender === 'user' && (
                                  <div className="text-xs font-semibold mb-2 opacity-90 text-white">Tu</div>
                                )}
                                <p className="text-sm sm:text-base text-white leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
                                <div className="flex items-center justify-end gap-1.5 mt-3 opacity-80 flex-wrap">
                                  <span className="text-xs text-white/80 whitespace-nowrap">
                                    {msg.timestamp ? new Date(msg.timestamp).toLocaleString('ro-RO', { 
                                      day: '2-digit', 
                                      month: '2-digit', 
                                      year: 'numeric',
                                      hour: '2-digit', 
                                      minute: '2-digit',
                                      second: '2-digit'
                                    }) : ''}
                                  </span>
                                  {msg.sender === 'user' && (
                                    <i className="ri-check-double-line text-xs text-white/80 ml-1 flex-shrink-0"></i>
                                  )}
                                  {msg.sender !== 'user' && (
                                    <i className="ri-check-double-line text-xs text-white/80 ml-1 flex-shrink-0"></i>
                                  )}
                </div>
                              </>
          )}
        </div>
      </div>

    </div>
  );
})
                ) : (
                  <div className="text-center py-8">
                    <div className={`w-16 h-16 ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'bg-white/30 backdrop-blur-sm' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                      <i className={`ri-message-3-line ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'text-blue-200' : 'text-gray-400'} text-2xl`}></i>
                    </div>
                    <p className={selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'text-blue-200' : 'text-gray-500'}>Nu există mesaje încă</p>
                    <p className={`${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? 'text-blue-300' : 'text-gray-400'} text-sm`}>Scrie primul mesaj pentru a începe conversația</p>
                  </div>
                )}
              
              {aiTyping && (
                  <div className="flex justify-start items-end gap-2">
                    {selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-600 flex items-center justify-center flex-shrink-0 mb-1 shadow-md bg-gray-200">
                        {(() => {
                          const idx = connectedAgentIndex ?? 0;
                          const agent = SUPPORT_AGENTS[idx];
                          return agent ? <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/user.png'; }} /> : null;
                        })()}
                      </div>
                    ) : null}
                    <div className={`${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (isDarkMode ? 'bg-gray-700/80 text-gray-200 rounded-2xl rounded-bl-sm shadow-md border border-gray-600' : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm shadow-md border border-gray-200') : 'bg-blue-500 text-white'} px-4 py-2.5 max-w-xs`}>
                    <div className="flex items-center gap-2">
                        {!(selectedTicket.subject === 'Chat Tichet AI' || aiEnabled) && <i className="ri-robot-line"></i>}
                      <span className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{(connectedAgentIndex !== null ? SUPPORT_AGENTS[connectedAgentIndex]?.name : 'Agent')} scrie...</span>
                      <div className="flex gap-1">
                          <div className={`w-1 h-1 ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (isDarkMode ? 'bg-gray-400' : 'bg-gray-500') : 'bg-white'} rounded-full animate-bounce`}></div>
                          <div className={`w-1 h-1 ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (isDarkMode ? 'bg-gray-400' : 'bg-gray-500') : 'bg-white'} rounded-full animate-bounce`} style={{animationDelay: '0.1s'}}></div>
                          <div className={`w-1 h-1 ${selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (isDarkMode ? 'bg-gray-400' : 'bg-gray-500') : 'bg-white'} rounded-full animate-bounce`} style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Rating conversație - doar când conversația pare terminată */}
            {selectedTicket.subject === 'Chat Tichet AI' && aiEnabled && selectedTicket.messages?.length >= 2 && (() => {
              const msgs = selectedTicket.messages;
              const lastMsg = msgs[msgs.length - 1];
              const lastUserMsg = [...msgs].reverse().find((m: any) => m.sender === 'user');
              const closingWords = ['mulțumesc', 'multumesc', 'mersi', 'gata', 'pa', 'la revedere', 'o revedere', 'pe mai departe', 'spor', 'o zi bună', 'pe curând', 'succes', 'bye', 'perfect', 'bun', 'super', 'ok', 'thx', 'mulțam', 'multam', 'rămas bun', 'ramas bun'];
              const lastUserText = (lastUserMsg?.message || '').toLowerCase();
              const hasClosing = closingWords.some(w => lastUserText.includes(w));
              const conversationEnded = lastMsg?.sender === 'ai' && lastUserMsg && hasClosing;
              return conversationEnded ? (
                <div className={`px-4 py-2 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <p className={`text-xs mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ai fost mulțumit de conversație?</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          setChatRating(star);
                          const key = `chatRating_${selectedTicket.id}`;
                          if (typeof window !== 'undefined') localStorage.setItem(key, String(star));
                        }}
                        className={`p-0.5 transition-colors ${chatRating !== null && star <= chatRating ? 'text-amber-400' : isDarkMode ? 'text-gray-500 hover:text-amber-400/70' : 'text-gray-300 hover:text-amber-400'}`}
                        title={`${star} stele`}
                      >
                        <i className={`ri-star-${chatRating !== null && star <= chatRating ? 'fill' : 'line'} text-lg`}></i>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Reply Form - Telegram Style pentru AI */}
            {selectedTicket.subject === 'Chat Tichet AI' || aiEnabled ? (
              <div className={`p-3 sm:p-4 border-t relative z-10 ${isDarkMode ? 'bg-gray-800/95 border-gray-700' : 'bg-gray-50/95 border-gray-200'}`}>
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                  <textarea
                    value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Scrie un mesaj..."
                      className={`w-full px-4 py-2.5 sm:py-3 border rounded-3xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none transition-all duration-200 text-sm sm:text-base ${isDarkMode ? 'border-gray-600 bg-gray-800 text-white placeholder-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'}`}
                    rows={1}
                      style={{ maxHeight: '120px' }}
                      onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                          if (replyMessage.trim() && !aiTyping) {
                        handleSendReply();
                          }
                      }
                    }}
                  />
                  </div>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyMessage.trim() || aiTyping}
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                      !replyMessage.trim() || aiTyping
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    }`}
                  >
                    {aiTyping ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <i className="ri-send-plane-fill text-lg sm:text-xl"></i>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-6 bg-white border-t border-gray-200">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Răspunsul tău
                    </label>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Scrie răspunsul tău..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 resize-none transition-all duration-200"
                      rows={4}
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                          <button
                      onClick={handleCloseTicket}
                      className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
                    >
                      Anulează
                          </button>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyMessage.trim() || aiTyping}
                      className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                      !replyMessage.trim() || aiTyping
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-500 to-blue-500 hover:from-blue-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    }`}
                  >
                    {aiTyping ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Se trimite...</span>
                        </div>
                    ) : (
                        'Trimite Răspunsul'
                    )}
                  </button>
                </div>
              </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-check-line text-white text-2xl"></i>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-2">Mă bucur că am fost de ajutor!</h3>
              <p className="text-gray-600 mb-6">Te rog să îmi dai feedback pentru a îmbunătăți serviciul meu.</p>
              
              {/* Star Rating */}
              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-3">Cât de mulțumit ești de răspunsul meu?</p>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setFeedbackRating(star)}
                      className={`text-2xl transition-colors duration-200 ${
                        star <= feedbackRating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Questions */}
              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-sm text-gray-700 mb-2">Am fost de ajutor?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFeedbackAnswers(prev => ({...prev, helpful: 'da'}))}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        feedbackAnswers.helpful === 'da' 
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Da
                    </button>
                    <button
                      onClick={() => setFeedbackAnswers(prev => ({...prev, helpful: 'nu'}))}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        feedbackAnswers.helpful === 'nu' 
                          ? 'bg-red-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Nu
                    </button>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-700 mb-2">Răspunsul a fost clar?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFeedbackAnswers(prev => ({...prev, clear: 'da'}))}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        feedbackAnswers.clear === 'da' 
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Da
                    </button>
                    <button
                      onClick={() => setFeedbackAnswers(prev => ({...prev, clear: 'nu'}))}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        feedbackAnswers.clear === 'nu' 
                          ? 'bg-red-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Nu
                    </button>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-700 mb-2">Vrei să continui discuția?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFeedbackAnswers(prev => ({...prev, continue: 'da'}))}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        feedbackAnswers.continue === 'da' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Da
                    </button>
                    <button
                      onClick={() => setFeedbackAnswers(prev => ({...prev, continue: 'nu'}))}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        feedbackAnswers.continue === 'nu' 
                          ? 'bg-gray-500 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Nu
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setFeedbackRating(0);
                    setFeedbackAnswers({});
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Continuă discuția
                </button>
                <button
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setFeedbackRating(0);
                    setFeedbackAnswers({});
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Mulțumesc!
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
