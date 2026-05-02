"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  AuthChangeEvent,
  RealtimePostgresChangesPayload,
  Session,
} from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getSupabaseAccessTokenRobust } from "@/lib/auth/getSupabaseSessionRobust";
import ConfirmPublishModal from "./ConfirmPublishModal";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import VoiceAssistant from "@/components/assistant/VoiceAssistant";

const PENDING_ASSISTANT_ID = "pending-assistant";
const TYPING_INDICATOR_DELAY_MS = 600;
const GROUP_WINDOW_MS = 2 * 60 * 1000;
/** Client timeout: puțin peste ROUTE_TIMEOUT_MS (5 min) ca serverul să poată termina. */
const CHAT_FETCH_TIMEOUT_MS = 5 * 60 * 1000 + 10_000; // 310s
/** După câte secunde afișăm butonul "Anulează" când așteptăm răspuns. */
const SHOW_CANCEL_AFTER_MS = 8_000;
/** După câte secunde afișăm hint că răspunsul poate dura (LLM pe rețea). */
const SLOW_RESPONSE_HINT_MS = 12_000;

const TOP_CATEGORIES_FOR_HINT = [
  "Imobiliare",
  "Autovehicule",
  "Utilaje & Echipamente",
  "Artă & Antichități",
  "Electronice & Tehnologie",
];

function looksLikeDraftInput(text: string): boolean {
  const t = text.trim();
  if (/\d+/.test(t) && /\b(ron|eur|euro|lei)\b/i.test(t)) return true;
  if (/descriere\s*:/i.test(t)) return true;
  if (TOP_CATEGORIES_FOR_HINT.some((c) => t === c || t.toLowerCase() === c.toLowerCase())) return true;
  return false;
}

function messageTime(m: { created_at?: string }): number {
  if (!m.created_at) return 0;
  try {
    return new Date(m.created_at).getTime();
  } catch {
    return 0;
  }
}

export type AssistantEventItem = { event_type: string; payload: Record<string, unknown> };

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  attachmentUrls?: string[];
  status?: "sending" | "sent" | "failed";
  optimisticDraftHint?: boolean;
  /** Server-sent events for this turn (draft_created, field_updated, validated, published) */
  assistantEvents?: AssistantEventItem[];
  /** Show login button (401 auth required) */
  loginRedirect?: boolean;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_snippet: string | null;
};

type DraftStatus = {
  hasDraft: boolean;
  draftProductId: string | null;
  status: string | null;
  ready: boolean;
};

type DraftProgress = {
  status: "draft" | "ready" | "published";
  filled: number;
  total: number;
};

const DEBOUNCE_MS = 400;
const SEARCH_DEBOUNCE_MS = 200;

/** Count occurrences of term in content, excluding fenced code blocks (case-insensitive). */
function countMatchesInMessage(content: string, term: string): number {
  if (!term || !term.trim()) return 0;
  const lower = term.toLowerCase();
  const parts = content.split("```");
  let count = 0;
  for (let i = 0; i < parts.length; i += 2) {
    count += (parts[i].toLowerCase().split(lower).length - 1);
  }
  return Math.max(0, count);
}

const PIN_STORAGE_PREFIX = "assistant_pin_";
function getStoredDraftPin(convId: string | null): boolean {
  if (typeof window === "undefined" || !convId) return false;
  try {
    const raw = localStorage.getItem(PIN_STORAGE_PREFIX + convId);
    if (!raw) return false;
    const data = JSON.parse(raw) as { pinned?: boolean; ts?: number };
    return data.pinned === true;
  } catch {
    return false;
  }
}
function setStoredDraftPin(convId: string | null, pinned: boolean): void {
  if (typeof window === "undefined" || !convId) return;
  try {
    if (pinned) {
      localStorage.setItem(PIN_STORAGE_PREFIX + convId, JSON.stringify({ pinned: true, ts: Date.now() }));
    } else {
      localStorage.removeItem(PIN_STORAGE_PREFIX + convId);
    }
  } catch {}
}

type AssistantChatProps = {
  isDrawer?: boolean;
  onClose?: () => void;
};

export default function AssistantChat({ isDrawer, onClose }: AssistantChatProps = {}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus | null>(null);
  const [draftRefreshTrigger, setDraftRefreshTrigger] = useState(0);
  const [quickReplies, setQuickReplies] = useState<string[] | null>(null);
  const [draftProgress, setDraftProgress] = useState<DraftProgress | null>(null);
  const [showThinkingIndicator, setShowThinkingIndicator] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const showCancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSendingRef = useRef(false);
  const [showCancelRequest, setShowCancelRequest] = useState(false);
  const [slowResponseHint, setSlowResponseHint] = useState(false);
  const slowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingLastMessage, setEditingLastMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isDraftPinned, setIsDraftPinned] = useState(false);
  const [isPublishingNow, setIsPublishingNow] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [pinnedDraftInfo, setPinnedDraftInfo] = useState<{
    draftId: string | null;
    title: string | null;
    status: string;
    updatedAt?: string;
  } | null>(null);

  const MAX_UPLOAD_FILES = 10;

  useEffect(() => {
    setIsDraftPinned(getStoredDraftPin(conversationId));
  }, [conversationId]);

  useEffect(() => {
    if (draftProgress?.status !== "ready") setPublishError(null);
  }, [draftProgress?.status]);

  useEffect(() => {
    if (!isDraftPinned || !conversationId || !accessToken) {
      setPinnedDraftInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await dashboardApiFetch(`/api/assistant/draft-info?conversationId=${encodeURIComponent(conversationId)}`,
          { headers: {} }
        );
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPinnedDraftInfo(null);
          return;
        }
        if (data.draftId == null) {
          setPinnedDraftInfo({ draftId: null, title: null, status: "draft" });
          return;
        }
        setPinnedDraftInfo({
          draftId: data.draftId,
          title: data.title ?? null,
          status: data.status ?? "draft",
          updatedAt: data.updatedAt,
        });
      } catch {
        if (!cancelled) setPinnedDraftInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isDraftPinned, conversationId, accessToken]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSearchMatchIndex(0);
  }, [conversationId]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      if (showCancelTimeoutRef.current) clearTimeout(showCancelTimeoutRef.current);
    };
  }, []);

  const fetchConversations = useCallback(async (token: string) => {
    const res = await dashboardApiFetch("/api/assistant/conversations", {
    });
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getSupabaseAccessTokenRobust(supabase);
      setAccessToken(token);
      if (token) {
        setLoadingConvos(true);
        await fetchConversations(token);
      }
      setLoadingConvos(false);
    })();
  }, [fetchConversations]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const token = session?.access_token ?? null;
      setAccessToken(token);
      if (token) {
        setLoadingConvos(true);
        fetchConversations(token).finally(() => setLoadingConvos(false));
      } else {
        setLoadingConvos(false);
        // Golește chat doar la deconectare reală. La refreshSession() Supabase poate apela
        // callback-ul cu session null și ștergea mesajele – de aceea dispăreau la fiecare trimitere.
        if (event === "SIGNED_OUT") {
          setConversations([]);
          setConversationId(null);
          setMessages([]);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchConversations]);

  const loadMessages = useCallback(
    async (convId: string) => {
      if (!accessToken) return;
      setLoadingMessages(true);
      try {
        const res = await dashboardApiFetch(`/api/assistant/conversations/${convId}?limit=30`, {
        });
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = await res.json();
        const list = (data.messages ?? []).map(
          (m: { id: string; role: string; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            created_at: m.created_at,
          })
        );
        setMessages(list);
      } finally {
        setLoadingMessages(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (isSendingRef.current) return;
    if (conversationId && accessToken) loadMessages(conversationId);
    setQuickReplies(null);
    setDraftProgress(null);
  }, [conversationId, accessToken, loadMessages]);

  // La deschiderea chat-ului: dacă avem conversații dar niciuna selectată, restabilește ultima (cea mai recentă)
  useEffect(() => {
    if (!accessToken || loadingConvos) return;
    if (conversationId != null) return;
    if (conversations.length === 0) return;
    const mostRecent = conversations[0];
    if (mostRecent?.id) setConversationId(mostRecent.id);
  }, [accessToken, loadingConvos, conversations, conversationId]);

  // Supabase Realtime: subscribe to assistant_events for this conversation (chat-visible notifications)
  useEffect(() => {
    if (!conversationId || !supabase) return;
    const channel = supabase
      .channel(`assistant_events:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "assistant_events",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const row = payload.new as {
            id?: string;
            event_type?: string;
            payload?: Record<string, unknown>;
            created_at?: string;
          };
          const eventItem: AssistantEventItem = {
            event_type: row.event_type ?? "unknown",
            payload: (row.payload as Record<string, unknown>) ?? {},
          };
          setMessages((prev) => {
            const lastAssistantIdx = prev.length - 1;
            if (lastAssistantIdx >= 0 && prev[lastAssistantIdx].role === "assistant") {
              const last = prev[lastAssistantIdx];
              const next = [...prev];
              next[lastAssistantIdx] = {
                ...last,
                assistantEvents: [...(last.assistantEvents ?? []), eventItem],
              };
              return next;
            }
            return [
              ...prev,
              {
                role: "assistant" as const,
                content: "",
                created_at: (row.created_at as string) ?? new Date().toISOString(),
                assistantEvents: [eventItem],
              },
            ];
          });
        }
      )
      .subscribe((status: string) => {
        if (process.env.NODE_ENV === "development" && status === "SUBSCRIBED") {
          // optional log
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showThinkingIndicator]);

  const fetchDraftStatus = useCallback(async () => {
    if (!conversationId || !accessToken) {
      setDraftStatus(null);
      return;
    }
    try {
      const res = await dashboardApiFetch(`/api/assistant/draft-status?conversationId=${encodeURIComponent(conversationId)}`,
        { headers: {} }
      );
      if (!res.ok) {
        setDraftStatus(null);
        return;
      }
      const data = await res.json();
      setDraftStatus({
        hasDraft: data.hasDraft ?? false,
        draftProductId: data.draftProductId ?? null,
        status: data.status ?? null,
        ready: Boolean(data.ready),
      });
    } catch {
      setDraftStatus(null);
    }
  }, [conversationId, accessToken]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!conversationId || !accessToken) {
      setDraftStatus(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchDraftStatus();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [conversationId, accessToken, draftRefreshTrigger, fetchDraftStatus]);

  const selectConversation = (id: string | null) => {
    setConversationId(id);
    if (id === null) setMessages([]);
  };

  const sendMessage = async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed || loading) return false;

    isSendingRef.current = true;
    const now = new Date().toISOString();
    const userMsg: Message = {
      role: "user",
      content: trimmed,
      created_at: now,
      status: "sending",
      optimisticDraftHint: looksLikeDraftInput(trimmed),
    };
    const pendingAssistant: Message = {
      id: PENDING_ASSISTANT_ID,
      role: "assistant",
      content: "…",
      created_at: now,
    };

    setMessages((prev) => [...prev, userMsg, pendingAssistant]);
    setInput("");
    setQuickReplies(null);
    setShowThinkingIndicator(false);
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    thinkingTimeoutRef.current = setTimeout(() => {
      thinkingTimeoutRef.current = null;
      setShowThinkingIndicator(true);
    }, TYPING_INDICATOR_DELAY_MS);

    setShowCancelRequest(false);
    if (showCancelTimeoutRef.current) {
      clearTimeout(showCancelTimeoutRef.current);
      showCancelTimeoutRef.current = null;
    }
    const controller = new AbortController();
    chatAbortRef.current = controller;
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), CHAT_FETCH_TIMEOUT_MS);
    showCancelTimeoutRef.current = setTimeout(() => {
      showCancelTimeoutRef.current = null;
      setShowCancelRequest(true);
    }, SHOW_CANCEL_AFTER_MS);
    setSlowResponseHint(false);
    if (slowHintTimeoutRef.current) clearTimeout(slowHintTimeoutRef.current);
    slowHintTimeoutRef.current = setTimeout(() => {
      slowHintTimeoutRef.current = null;
      setSlowResponseHint(true);
    }, SLOW_RESPONSE_HINT_MS);

    setLoading(true);
    if (process.env.NODE_ENV === "development") {
      console.log("[CHAT][SEND]", "message length=" + trimmed.length);
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const res = await dashboardApiFetch("/api/assistant/chat", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          message: trimmed,
        }),
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[CHAT][RESPONSE]", "status=" + res.status);
      }
      if (!res.ok) {
        if (slowHintTimeoutRef.current) { clearTimeout(slowHintTimeoutRef.current); slowHintTimeoutRef.current = null; }
        setSlowResponseHint(false);
        setLoading(false);
        setShowCancelRequest(false);
        setShowThinkingIndicator(false);
        if (thinkingTimeoutRef.current) {
          clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }
        const body = await res.text().catch(() => "");
        if (process.env.NODE_ENV === "development") {
          console.log("[CHAT][RESPONSE_ERROR]", "status=" + res.status, "body preview=" + (body.slice(0, 300) || "(empty)"));
        }
        let errorContent: string;
        let loginRedirect = false;
        let rateLimitHit = false;
        if (res.status === 401) {
          errorContent = "Trebuie să fii autentificat ca să folosești Asistentul.";
          loginRedirect = true;
        } else if (res.status === 429) {
          rateLimitHit = true;
          try {
            const parsed = JSON.parse(body) as { error?: string };
            errorContent = typeof parsed?.error === "string" ? parsed.error : "Prea multe cereri. Te rugăm să aștepți înainte de a trimite din nou.";
          } catch {
            errorContent = "Prea multe cereri. Te rugăm să aștepți înainte de a trimite din nou.";
          }
        } else {
          const snippet = body.length > 300 ? body.slice(0, 300) + "…" : body;
          errorContent = `Eroare ${res.status}${snippet ? ": " + snippet : "."}`;
        }
        const correlationId = res.headers.get("x-correlation-id");
        if (correlationId) {
          errorContent += ` [correlation-id: ${correlationId}]`;
        }
        setMessages((prev) => {
          const withoutPending = prev.filter((m) => m.id !== PENDING_ASSISTANT_ID);
          const updated = withoutPending.map((msg, i) => {
            const isLastUser = i === withoutPending.length - 1 && msg.role === "user";
            if (isLastUser && msg.status === "sending") {
              return { ...msg, status: "failed" as const, optimisticDraftHint: false };
            }
            return msg;
          });
          return [
            ...updated,
            {
              role: "assistant" as const,
              content: errorContent,
              created_at: new Date().toISOString(),
              ...(loginRedirect ? { loginRedirect: true as const } : {}),
              ...(rateLimitHit ? { rateLimitHit: true as const } : {}),
            },
          ];
        });
        return false;
      }

      if (slowHintTimeoutRef.current) { clearTimeout(slowHintTimeoutRef.current); slowHintTimeoutRef.current = null; }
      setSlowResponseHint(false);
      setLoading(false);
      setShowCancelRequest(false);
      setShowThinkingIndicator(false);
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      const data = await res.json().catch(() => ({}));

      const rawText =
        (typeof data?.text === "string" ? data.text : null) ??
        (typeof data?.reply === "string" ? data.reply : null) ??
        (data?.message && typeof data.message === "object" && typeof (data.message as { content?: string }).content === "string"
          ? (data.message as { content: string }).content
          : null) ??
        (typeof data?.message === "string" ? data.message : null) ??
        "";
      let assistantContent = rawText.trim() || "";
      const errDetail =
        (typeof data?.assistantErrorDetail === "string" && data.assistantErrorDetail.trim()) ||
        (typeof (data as { ollamaErrorDetail?: string })?.ollamaErrorDetail === "string" &&
          (data as { ollamaErrorDetail: string }).ollamaErrorDetail.trim());
      if (errDetail) {
        assistantContent += (assistantContent ? "\n\n" : "") + "**Detalii tehnice:** " + String(errDetail).trim();
      }
      if (!assistantContent) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[CHAT] Răspuns gol – chei:", data ? Object.keys(data) : []);
        }
        assistantContent = "Răspuns gol de la server.";
      }

      if (data?.conversationId) {
        setConversationId(data.conversationId);
        if (accessToken) fetchConversations(accessToken);
      }
      const events = Array.isArray(data?.assistantEvents) ? (data.assistantEvents as AssistantEventItem[]) : undefined;
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => m.id !== PENDING_ASSISTANT_ID);
        const updated = withoutPending.map((msg, i) => {
          const isLastUser = i === withoutPending.length - 1 && msg.role === "user";
          if (isLastUser && msg.status === "sending") {
            return { ...msg, status: "sent" as const, optimisticDraftHint: false };
          }
          return msg;
        });
        return [
          ...updated,
          {
            role: "assistant" as const,
            content: assistantContent,
            created_at: new Date().toISOString(),
            ...(events?.length ? { assistantEvents: events } : {}),
          },
        ];
      });
      setQuickReplies(Array.isArray(data?.quickReplies) ? data.quickReplies : null);
      const nextProgress =
        data?.draftProgress &&
        typeof data.draftProgress.status === "string" &&
        typeof data.draftProgress.filled === "number" &&
        typeof data.draftProgress.total === "number"
          ? (data.draftProgress as DraftProgress)
          : null;
      setDraftProgress((prev) =>
        nextProgress != null ? nextProgress : prev?.status === "published" ? prev : null
      );
      setDraftRefreshTrigger((t) => t + 1);
      return true;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const errMsg = err instanceof Error ? err.message : String(err);
      const errorContent = isTimeout
        ? "Răspunsul durează prea mult. Încearcă din nou sau verifică serverul AI (Mac mini / rețea)."
        : errMsg && errMsg.length > 0
          ? errMsg
          : "Eroare de rețea. Încearcă din nou.";
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => m.id !== PENDING_ASSISTANT_ID);
        const updated = withoutPending.map((msg, i) => {
          const isLastUser = i === withoutPending.length - 1 && msg.role === "user";
          if (isLastUser && msg.status === "sending") {
            return { ...msg, status: "failed" as const, optimisticDraftHint: false };
          }
          return msg;
        });
        return [...updated, { role: "assistant" as const, content: errorContent, created_at: new Date().toISOString() }];
      });
      if (slowHintTimeoutRef.current) { clearTimeout(slowHintTimeoutRef.current); slowHintTimeoutRef.current = null; }
      setSlowResponseHint(false);
      setLoading(false);
      setShowThinkingIndicator(false);
      setShowCancelRequest(false);
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
      return false;
    } finally {
      isSendingRef.current = false;
      chatAbortRef.current = null;
      if (timeoutId) clearTimeout(timeoutId);
      if (showCancelTimeoutRef.current) {
        clearTimeout(showCancelTimeoutRef.current);
        showCancelTimeoutRef.current = null;
      }
      if (slowHintTimeoutRef.current) {
        clearTimeout(slowHintTimeoutRef.current);
        slowHintTimeoutRef.current = null;
      }
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
      setShowThinkingIndicator(false);
      setLoading(false);
      setShowCancelRequest(false);
      setSlowResponseHint(false);
    }
  };

  const cancelChatRequest = () => {
    chatAbortRef.current?.abort();
    setShowCancelRequest(false);
  };

  /** Trimite mesajul curent. Folosit de buton și Enter – fără form submit ca să nu se reîncarce pagina. */
  const submitCurrentMessage = () => {
    setEditingLastMessage(false);
    const toSend = input.trim();
    if (toSend && !loading) sendMessage(toSend);
  };

  const lastUserMessageIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user" && (m.status === "sent" || m.status === undefined)) return i;
    }
    return -1;
  })();

  const handleRetry = (content: string) => {
    sendMessage(content);
  };

  const handleEditLast = (content: string) => {
    setInput(content);
    setEditingLastMessage(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleQuickAction = () => {
    sendMessage("Vreau să public un anunț");
  };

  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !accessToken || !conversationId || uploading) return;
    e.target.value = "";
    setUploadMessage(null);
    setUploading(true);
    const urls: string[] = [];
    const fileCount = Math.min(files.length, MAX_UPLOAD_FILES);
    try {
      for (let i = 0; i < fileCount; i++) {
        const file = files[i];
        const data = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });
        if (data.success && data.url) urls.push(data.url);
      }
      if (urls.length === 0) {
        setUploadMessage("Nicio imagine încărcată. Încearcă din nou.");
        setUploading(false);
        return;
      }
      const attachRes = await dashboardApiFetch("/api/assistant/attach-photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversationId, urls }),
      });
      const attachData = await attachRes.json().catch(() => ({}));
      if (attachRes.ok && attachData.attached > 0) {
        setUploadMessage(`Am atașat ${attachData.attached} poză(e) la draft.`);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Am adăugat ${attachData.attached} poză(e) la anunțul tău. Ce altceva vrei să completezi? (titlu, descriere, categorie, preț)`,
            attachmentUrls: urls,
          },
        ]);
        setDraftRefreshTrigger((t) => t + 1);
      } else {
        setUploadMessage(
          attachData?.error ?? "Nu s-a putut atașa. Creează mai întâi un draft („Creează un anunț”)."
        );
      }
    } catch {
      setUploadMessage("Eroare la încărcare.");
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      const d = new Date(s);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" });
    } catch {
      return "";
    }
  };

  const draftBadgeLabel =
    draftStatus?.status === "active"
      ? "Publicat"
      : draftStatus?.ready
        ? "Gata de publicare"
        : draftStatus?.hasDraft
          ? "Draft"
          : null;

  const searchMatchCounts = useMemo(
    () => (debouncedSearchQuery ? messages.map((m) => countMatchesInMessage(m.content, debouncedSearchQuery)) : []),
    [messages, debouncedSearchQuery]
  );
  const totalSearchMatches = searchMatchCounts.reduce((a, b) => a + b, 0);
  const messageIndexForScroll = (() => {
    if (totalSearchMatches <= 0) return 0;
    let acc = 0;
    const idx = (searchMatchIndex % totalSearchMatches + totalSearchMatches) % totalSearchMatches;
    for (let j = 0; j < searchMatchCounts.length; j++) {
      if (idx < acc + searchMatchCounts[j]) return j;
      acc += searchMatchCounts[j];
    }
    return 0;
  })();

  useEffect(() => {
    setSearchMatchIndex((i) => Math.min(i, Math.max(0, totalSearchMatches - 1)));
  }, [totalSearchMatches]);

  useEffect(() => {
    if (totalSearchMatches <= 0 || messageRefs.current.length === 0) return;
    const el = messageRefs.current[messageIndexForScroll];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [messageIndexForScroll, totalSearchMatches, debouncedSearchQuery]);

  const containerHeight = isDrawer ? "h-full min-h-0" : "h-[calc(100vh-12rem)] max-h-[720px]";
  const containerRounded = isDrawer ? "" : "rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg";
  const containerBg = isDrawer ? "bg-white" : "bg-white dark:bg-gray-800";
  const asideBorder = isDrawer ? "border-gray-200/60" : "border-gray-200 dark:border-gray-700";
  const asideBg = isDrawer ? "bg-transparent" : "bg-gray-50 dark:bg-gray-800/50";
  const chatAreaBg = isDrawer ? "bg-white" : "bg-white dark:bg-gray-800";
  const formBar = isDrawer
    ? "border-gray-200/60 bg-gray-100"
    : "border-gray-200 bg-gray-100";
  const inputWrapper = "border-0 bg-white shadow-sm";
  return (
    <div className={`flex ${containerHeight} ${containerRounded} ${containerBg} overflow-hidden`}>
      {/* Sidebar ascuns în drawer (FAB): doar fereastra de chat, fără listă conversații */}
      {!isDrawer && (
        <aside
          className={`shrink-0 flex flex-col border-r ${asideBorder} ${asideBg} w-[280px]`}
        >
          <div className={`p-2.5 border-b ${asideBorder} flex items-center gap-2`}>
            <button
              type="button"
              onClick={() => selectConversation(null)}
              className="flex-1 text-left px-3 py-2 text-sm font-medium rounded-lg text-emerald-600 hover:bg-emerald-50/80 transition-colors"
            >
              + Conversație nouă
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            {loadingConvos ? (
              <p className="text-xs text-gray-500 p-2">Se încarcă...</p>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-gray-500">Nicio conversație</p>
                <p className="text-xs text-gray-400 mt-1">Trimite un mesaj pentru a începe.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(c.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-sm truncate transition-colors ${
                        conversationId === c.id
                          ? "bg-emerald-50 text-emerald-800 font-medium"
                          : "text-gray-700 hover:bg-gray-100/80"
                      }`}
                      title={c.title}
                    >
                      <span className="block truncate">{c.title}</span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">{formatDate(c.updated_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      {/* Zona de chat — mereu vizibilă în drawer, full width */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 ${chatAreaBg} flex`}
      >
        {/* Top: draft badge + actions (fără „înapoi” în drawer – un singur chat) */}
        <div className={`shrink-0 px-2.5 py-2 border-b ${asideBorder} flex flex-wrap items-center gap-x-2 gap-y-1`}>
          {draftBadgeLabel && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                draftBadgeLabel === "Publicat"
                  ? "bg-emerald-100 text-emerald-700"
                  : draftBadgeLabel === "Gata de publicare"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {draftBadgeLabel}
            </span>
          )}
          {draftStatus?.hasDraft && draftStatus.status !== "active" && (
            <>
              <button type="button" onClick={() => document.querySelector<HTMLInputElement>('form input[type="text"]')?.focus()} className="text-[11px] font-medium text-gray-600 hover:text-gray-800">
                Completează
              </button>
              <button type="button" onClick={() => sendMessage("Publică anunțul")} disabled={!draftStatus.ready} className="text-[11px] font-medium text-emerald-600 hover:underline disabled:opacity-50">
                Publică
              </button>
            </>
          )}
          {draftStatus?.draftProductId && (
            <button type="button" onClick={() => router.push(`/dashboard/my-products?openProduct=${draftStatus.draftProductId}`)} className="text-[11px] font-medium text-gray-500 hover:text-gray-700">
              Anunțurile mele
            </button>
          )}
          {conversationId && draftProgress != null && (
            <button
              type="button"
              onClick={() => {
                if (isDraftPinned) {
                  setIsDraftPinned(false);
                  setStoredDraftPin(conversationId, false);
                } else {
                  setIsDraftPinned(true);
                  setStoredDraftPin(conversationId, true);
                }
              }}
              className={`rounded p-1.5 ${isDraftPinned ? "text-amber-600 dark:text-amber-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
              aria-label={isDraftPinned ? "Anulează fixare draft" : "Fixează draft"}
              title={isDraftPinned ? "Anulează fixare draft" : "Fixează draft"}
            >
              <svg className="h-4 w-4" fill={isDraftPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
          {(conversationId || isDrawer) && (
            <button type="button" onClick={handleQuickAction} className="text-[11px] font-medium text-emerald-600 hover:underline">
              Creează anunț
            </button>
          )}
          {uploadMessage && <span className="text-[11px] text-gray-500">{uploadMessage}</span>}
          {/* Search in conversation — right side, only when conversation open */}
          {conversationId && (
            <div className="ml-auto flex items-center gap-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Caută în conversație…"
                className="w-36 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                aria-label="Caută în conversație"
              />
              {debouncedSearchQuery && totalSearchMatches > 0 && (
                <>
                  <span className="text-[11px] text-gray-500 tabular-nums">
                    {Math.min(searchMatchIndex + 1, totalSearchMatches)} / {totalSearchMatches}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchMatchIndex((i) => (i <= 0 ? totalSearchMatches - 1 : i - 1))}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                    aria-label="Match anterior"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMatchIndex((i) => (i >= totalSearchMatches - 1 ? 0 : i + 1))}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                    aria-label="Match următor"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Pinned draft banner — when user pinned for this conversation */}
        {conversationId && isDraftPinned && (
          <div
            className={`shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b ${asideBorder} ${isDrawer ? "px-2" : "px-4"} bg-amber-50/80 dark:bg-amber-900/20`}
          >
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                (pinnedDraftInfo?.status === "active" || pinnedDraftInfo?.status === "published" || draftProgress?.status === "published")
                  ? "bg-emerald-100 text-emerald-700"
                  : (pinnedDraftInfo?.status === "ready" || draftProgress?.status === "ready")
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-800/50 dark:text-amber-200"
              }`}
            >
              {(pinnedDraftInfo?.status === "active" || pinnedDraftInfo?.status === "published" || draftProgress?.status === "published")
                ? "Publicat"
                : (pinnedDraftInfo?.status === "ready" || draftProgress?.status === "ready")
                  ? "Gata de publicare"
                  : "Draft"}
            </span>
            <span className="text-[11px] text-gray-600 dark:text-gray-400">
              Draft: {pinnedDraftInfo != null ? (pinnedDraftInfo.title ?? "Draft fără titlu") : "…"}
            </span>
            <button
              type="button"
              onClick={() => router.push(pinnedDraftInfo?.draftId ? `/dashboard/my-products?openProduct=${pinnedDraftInfo.draftId}` : "/dashboard/my-products")}
              className="text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Deschide în Anunțurile mele
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDraftPinned(false);
                setStoredDraftPin(conversationId, false);
              }}
              className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-200/80 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200"
              aria-label="Anulează fixare"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Draft progress bar — status pill + Completat X/Y + Publică acum when ready */}
        {draftProgress != null && (
          <div
            className={`shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b ${asideBorder} ${isDrawer ? "px-2" : "px-4"}`}
          >
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                draftProgress.status === "published"
                  ? "bg-emerald-100 text-emerald-700"
                  : draftProgress.status === "ready"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {draftProgress.status === "published"
                ? "Publicat"
                : draftProgress.status === "ready"
                  ? "Gata de publicare"
                  : "Draft"}
            </span>
            <span className="text-[11px] text-gray-500 tabular-nums">
              Completat: {draftProgress.filled} / {draftProgress.total}
            </span>
            {draftProgress.status === "ready" && (
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                {publishError && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">
                    {publishError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isPublishingNow || loading) return;
                    setPublishError(null);
                    setShowPublishModal(true);
                  }}
                  disabled={isPublishingNow || loading || !accessToken}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Publică acum
                </button>
              </div>
            )}
          </div>
        )}

        {/* Messages — scrollable. Când există mesaje în state, le afișăm mereu (inclusiv la primul mesaj, înainte de conversationId). */}
        <div className={`flex-1 overflow-y-auto min-h-0 ${isDrawer ? "p-3 space-y-3" : "p-4 space-y-4"}`}>
          {conversationId && loadingMessages ? (
            <p className={`text-gray-500 text-sm ${!isDrawer ? "dark:text-gray-400" : ""}`}>Se încarcă mesajele...</p>
          ) : messages.length === 0 ? (
            /* Fără mesaje: bun venit + input activ; primul mesaj creează conversația automat */
            <div className="space-y-3">
              <MessageBubble
                role="assistant"
                content="Salutare! Mă numesc GO AI, de la GoBid – te-ai prins? 😄 Cu ce te pot ajuta?"
                forceLight={isDrawer}
              />
              <p className={`text-center text-xs text-gray-400 ${!isDrawer ? "dark:text-gray-500" : ""}`}>
                Scrie ceva sau apasă „Creează anunț”.
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const t = messageTime(m);
              const prevT = prev ? messageTime(prev) : 0;
              const nextT = next ? messageTime(next) : 0;
              const sameRolePrev = prev && prev.role === m.role && t - prevT <= GROUP_WINDOW_MS;
              const sameRoleNext = next && next.role === m.role && nextT - t <= GROUP_WINDOW_MS;
              const showAvatar = !sameRolePrev;
              const compact = sameRolePrev;

              if (m.id === PENDING_ASSISTANT_ID && showThinkingIndicator && !slowResponseHint) {
                return (
                  <div key={`${PENDING_ASSISTANT_ID}-typing`} ref={(el) => { messageRefs.current[i] = el; }}>
                    <TypingIndicator forceLight={isDrawer} />
                  </div>
                );
              }
              if (m.id === PENDING_ASSISTANT_ID) {
                return (
                  <div key={PENDING_ASSISTANT_ID} ref={(el) => { messageRefs.current[i] = el; }}>
                    <MessageBubble
                      role="assistant"
                      content={slowResponseHint ? "… Se procesează (poate dura 20–30 secunde, serverul AI)." : "…"}
                      forceLight={isDrawer}
                      isPending
                      showAvatar
                      compact={false}
                      highlightTerm={debouncedSearchQuery || undefined}
                    />
                  </div>
                );
              }
              const isLastUser = m.role === "user" && i === lastUserMessageIndex;
              const canRetry = m.role === "user" && m.status === "failed";
              const canEdit = isLastUser && (m.status === "sent" || m.status === undefined);
              return (
                <div key={m.id ?? i} ref={(el) => { messageRefs.current[i] = el; }}>
                  <MessageBubble
                    role={m.role}
                    content={m.content}
                    createdAt={m.created_at}
                    attachmentUrls={m.attachmentUrls}
                    forceLight={isDrawer}
                    status={m.status}
                    showAvatar={showAvatar}
                    compact={compact}
                    optimisticDraftHint={m.optimisticDraftHint}
                    isLastUserMessage={isLastUser}
                    assistantEvents={m.role === "assistant" ? m.assistantEvents : undefined}
                    onRetry={canRetry ? () => handleRetry(m.content) : undefined}
                    onEdit={canEdit ? () => handleEditLast(m.content) : undefined}
                    highlightTerm={debouncedSearchQuery || undefined}
                    loginRedirect={m.role === "assistant" ? m.loginRedirect : undefined}
                  />
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Anulează request când durează mult */}
        {loading && showCancelRequest && (
          <div className={`shrink-0 flex items-center justify-center gap-2 py-2 ${isDrawer ? "px-2" : "px-4"}`}>
            <span className="text-sm text-gray-500 dark:text-gray-400">Se așteaptă răspuns…</span>
            <button
              type="button"
              onClick={cancelChatRequest}
              className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400"
            >
              Anulează
            </button>
          </div>
        )}

        {/* Quick reply chips (category / subcategory) */}
        {quickReplies != null && quickReplies.length > 0 && (
          <div className={`anim-fade shrink-0 flex flex-wrap gap-1.5 px-3 pb-2 ${isDrawer ? "px-2" : "px-4"}`}>
            {quickReplies.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => sendMessage(label)}
                disabled={loading || !accessToken}
                className="px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Sticky input bar – fără <form> ca să nu existe niciun submit nativ și niciun refresh la pagină */}
        <div
          role="group"
          aria-label="Trimite mesaj"
          className={`shrink-0 border-t ${formBar} ${isDrawer ? "px-2 py-2.5" : "px-3 py-3"}`}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            multiple
            className="hidden"
            disabled={!conversationId || uploading || !accessToken}
            onChange={handleUploadPhotos}
          />
          {editingLastMessage && (
            <p className={`mb-1.5 text-[11px] text-gray-500 ${!isDrawer ? "dark:text-gray-400" : ""}`}>
              (editezi ultimul mesaj)
            </p>
          )}
          <div
            className={`flex items-end gap-1 rounded-[22px] ${inputWrapper} ${isDrawer ? "px-2 py-1.5 min-h-[44px]" : "px-3 py-2 min-h-[48px]"} focus-within:ring-2 focus-within:ring-emerald-400/40 focus-within:ring-offset-0`}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!conversationId || uploading || !accessToken}
              className="shrink-0 p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200/60 disabled:opacity-50 transition-colors"
              title="Încarcă poze"
              aria-label="Încarcă poze"
            >
              <svg className={isDrawer ? "w-5 h-5" : "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCurrentMessage();
                }
              }}
              placeholder="Mesaj..."
              className="flex-1 min-w-0 bg-transparent border-0 px-1 py-1.5 text-[15px] text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none"
              disabled={loading || !accessToken}
            />
            <div className="shrink-0 flex items-center gap-0.5 pb-0.5">
              <VoiceAssistant
                accessToken={accessToken}
                conversationId={conversationId}
                onTranscription={(text) => {
                  const trimmed = text?.trim();
                  if (trimmed) sendMessage(trimmed);
                }}
                disabled={loading || !accessToken}
                className="flex items-center justify-center"
              />
              <button
                type="button"
                onClick={submitCurrentMessage}
                disabled={loading || !accessToken || !input.trim()}
                className="shrink-0 p-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Trimite"
                aria-label="Trimite"
              >
                <svg className={isDrawer ? "w-5 h-5" : "w-6 h-6"} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmPublishModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onConfirm={async () => {
          setPublishError(null);
          setIsPublishingNow(true);
          try {
            const ok = await sendMessage("da, publică");
            if (ok) {
              setShowPublishModal(false);
            } else {
              setPublishError("Nu s-a putut publica. Încearcă din nou.");
              setShowPublishModal(false);
            }
          } finally {
            setIsPublishingNow(false);
          }
        }}
        draftTitle={pinnedDraftInfo?.title ?? null}
        isPublishing={isPublishingNow}
        forceLight={isDrawer}
      />
    </div>
  );
}
