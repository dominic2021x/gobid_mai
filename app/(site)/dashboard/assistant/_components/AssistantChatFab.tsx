"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import AssistantChat from "./AssistantChat";
import { useAiChatAvatarSrc } from "./useAiChatAvatarSrc";

const STORAGE_KEY = "gobid_go_ai_chat_position";
const FAB_DOCKED_KEY = "gobid_go_ai_fab_docked";
/** Zonă de la marginea dreaptă a ecranului unde swipe stânga redeschide FAB (mobil) */
const EDGE_SWIPE_ZONE_PX = 28;
/** Swipe minim (px) spre stânga de pe marginea ecranului (mobil) */
const EDGE_SWIPE_THRESHOLD_PX = 48;
/** Swipe mai scurt pe fila GO AI vizibilă */
const PEEK_SWIPE_THRESHOLD_PX = 28;
const PANEL_PADDING = 16;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 320;
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 520;
/** Poziție FAB: bottom-5 right-5 = 20px */
const FAB_OFFSET_BOTTOM = 20;
const FAB_OFFSET_RIGHT = 20;
/** Sub această lățime (Tailwind sm) panoul apare în stânga sus pe mobil, ca pe desktop */
const MOBILE_BREAKPOINT_PX = 640;
/** Buton floating GO AI: mobil 2×48px, desktop sm+ 3×62px */
const FAB_SIZE_MOBILE_PX = 96;
const FAB_SIZE_DESKTOP_PX = 186;

function fabSizePx(isMobileViewport: boolean): number {
  return isMobileViewport ? FAB_SIZE_MOBILE_PX : FAB_SIZE_DESKTOP_PX;
}
/** Distanța de la header până la partea de sus a panoului: 2cm (≈76px la 96dpi) */
const GAP_BELOW_HEADER_PX = 76;

type SavedState = { x: number; y: number; w?: number; h?: number };

function loadSaved(): SavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return {
        x: parsed.x,
        y: parsed.y,
        w: typeof parsed.w === "number" ? parsed.w : undefined,
        h: typeof parsed.h === "number" ? parsed.h : undefined,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function save(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadFabDocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(FAB_DOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistFabDocked(docked: boolean) {
  try {
    if (docked) localStorage.setItem(FAB_DOCKED_KEY, "1");
    else localStorage.removeItem(FAB_DOCKED_KEY);
  } catch {
    /* ignore */
  }
}

type ResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

/**
 * FAB + chat panel. Poți muta (drag din header) și redimensiona din toate părțile (mânere pe margini/colțuri).
 */
export default function AssistantChatFab() {
  const aiAvatarSrc = useAiChatAvatarSrc();
  const [open, setOpen] = useState(false);
  const [fabDockedRight, setFabDockedRight] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const resizeStart = useRef<{
    handle: ResizeHandle;
    x: number;
    y: number;
    left: number;
    top: number;
    w: number;
    h: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const edgeSwipeStartX = useRef<number | null>(null);
  const dockPeekTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setFabDockedRight(loadFabDocked());
    const saved = loadSaved();
    if (saved && typeof saved.w === "number" && typeof saved.h === "number") {
      setSize({ w: saved.w, h: saved.h });
    }
    // Poziția nu se restabilește: la fiecare deschidere chat-ul apare în colțul dreapta-jos (poziție standard)
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const apply = () => setIsMobileViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!fabDockedRight || !isMobileViewport || typeof window === "undefined") return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.changedTouches[0] ?? e.touches[0];
      if (!touch) return;
      const vw = window.innerWidth;
      if (touch.clientX >= vw - EDGE_SWIPE_ZONE_PX) {
        edgeSwipeStartX.current = touch.clientX;
      } else {
        edgeSwipeStartX.current = null;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = edgeSwipeStartX.current;
      edgeSwipeStartX.current = null;
      if (start == null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start;
      if (dx <= -EDGE_SWIPE_THRESHOLD_PX) {
        setFabDockedRight(false);
        persistFabDocked(false);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [fabDockedRight, isMobileViewport]);

  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") return;
    const header = document.querySelector("header");
    const h = header?.getBoundingClientRect().height ?? 56;
    setHeaderHeight(Math.round(h));
  }, [isFullscreen]);

  useLayoutEffect(() => {
    if (!open || position !== null) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const headerEl = typeof document !== "undefined" ? document.querySelector("header") : null;
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 56;
    const top = headerH + GAP_BELOW_HEADER_PX;
    const isMobile = vw < MOBILE_BREAKPOINT_PX;
    const fabSize = fabSizePx(isMobile);
    const iconTop = vh - FAB_OFFSET_BOTTOM - fabSize;
    const h = Math.max(MIN_HEIGHT, iconTop - top);
    const w = Math.min(Math.max(size.w, MIN_WIDTH), vw - 2 * PANEL_PADDING);
    setSize({ w, h });
    // Mobil: panoul în stânga sus (ca pe desktop). Desktop: dreapta-jos, lipit de colțul stânga-sus al iconiței
    const x = isMobile ? PANEL_PADDING : Math.max(PANEL_PADDING, vw - FAB_OFFSET_RIGHT - fabSize - w);
    setPosition({ x, y: top });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doar la deschidere (open); size citit din state
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted, open]);

  const clampPosition = useCallback((x: number, y: number, w: number, h: number) => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    return {
      x: Math.max(0, Math.min(x, vw - Math.max(MIN_WIDTH, w))),
      y: Math.max(0, Math.min(y, vh - Math.max(MIN_HEIGHT, h))),
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("[data-resize-handle]"))
        return;
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const left = position?.x ?? rect.left;
      const top = position?.y ?? rect.top;
      if (position === null) setPosition({ x: rect.left, y: rect.top });
      dragStart.current = { x: e.clientX, y: e.clientY, left, top };
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [position]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const newX = Math.max(0, dragStart.current.left + dx);
      const newY = Math.max(0, dragStart.current.top + dy);
      const clamped = clampPosition(newX, newY, size.w, size.h);
      setPosition({ x: clamped.x, y: clamped.y });
    },
    [isDragging, size.w, size.h, clampPosition]
  );

  const handlePointerUp = useCallback(() => {
    if (resizeStart.current && position) {
      save({ x: position.x, y: position.y, w: size.w, h: size.h });
    }
    resizeStart.current = null;
    setIsResizing(false);
    if (dragStart.current && position) {
      save({ x: position.x, y: position.y, w: size.w, h: size.h });
    }
    dragStart.current = null;
    setIsDragging(false);
  }, [position, size]);

  const startResize = useCallback(
    (handle: ResizeHandle) => (e: React.PointerEvent) => {
      e.stopPropagation();
      const panel = panelRef.current;
      if (!panel || position === null) return;
      const rect = panel.getBoundingClientRect();
      resizeStart.current = {
        handle,
        x: e.clientX,
        y: e.clientY,
        left: position.x,
        top: position.y,
        w: size.w,
        h: size.h,
      };
      setIsResizing(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [position, size]
  );

  useEffect(() => {
    if (!isResizing || !resizeStart.current) return;
    const onMove = (e: PointerEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      const { handle, x: startX, y: startY, left, top, w, h } = start;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = left;
      let newTop = top;
      let newW = w;
      let newH = h;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (handle.includes("e")) newW = Math.max(MIN_WIDTH, Math.min(w + dx, vw - left));
      if (handle.includes("w")) {
        const eff = Math.max(-left, Math.min(dx, w - MIN_WIDTH));
        newLeft = left + eff;
        newW = w - eff;
      }
      if (handle.includes("s")) newH = Math.max(MIN_HEIGHT, Math.min(h + dy, vh - top));
      if (handle.includes("n")) {
        const eff = Math.max(-top, Math.min(dy, h - MIN_HEIGHT));
        newTop = top + eff;
        newH = h - eff;
      }
      newW = Math.max(MIN_WIDTH, Math.min(newW, vw));
      newH = Math.max(MIN_HEIGHT, Math.min(newH, vh));
      const clamped = clampPosition(newLeft, newTop, newW, newH);
      setPosition({ x: clamped.x, y: clamped.y });
      setSize({ w: newW, h: newH });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [isResizing, clampPosition]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const onUp = () => {
      if ((dragStart.current || resizeStart.current) && position) {
        save({ x: position.x, y: position.y, w: size.w, h: size.h });
      }
      dragStart.current = null;
      resizeStart.current = null;
      setIsDragging(false);
      setIsResizing(false);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [isDragging, isResizing, position, size]);

  const dockFab = useCallback(() => {
    setOpen(false);
    setIsFullscreen(false);
    setPosition(null);
    setFabDockedRight(true);
    persistFabDocked(true);
  }, []);

  const undockFab = useCallback(() => {
    setFabDockedRight(false);
    persistFabDocked(false);
  }, []);

  if (!mounted) return null;

  /** Când e ascuns spre dreapta, rămâne vizibilă doar jumătate din lățimea FAB (96px → 48px, 186px → 93px). */
  const fabWidthPx = fabSizePx(isMobileViewport);
  const dockPeekPx = Math.round(fabWidthPx / 2);

  const panelStyle = !isFullscreen && position !== null
    ? {
        left: position.x,
        top: position.y,
        width: size.w,
        height: size.h,
      }
    : undefined;

  const resizeHandles: { handle: ResizeHandle; className: string; cursor: string }[] = [
    { handle: "n", className: "absolute top-0 left-0 right-0 h-2", cursor: "n-resize" },
    { handle: "s", className: "absolute bottom-0 left-0 right-0 h-2", cursor: "s-resize" },
    { handle: "e", className: "absolute top-0 right-0 bottom-0 w-2", cursor: "e-resize" },
    { handle: "w", className: "absolute top-0 left-0 bottom-0 w-2", cursor: "w-resize" },
    { handle: "nw", className: "absolute top-0 left-0 w-3 h-3", cursor: "nw-resize" },
    { handle: "ne", className: "absolute top-0 right-0 w-3 h-3", cursor: "ne-resize" },
    { handle: "sw", className: "absolute bottom-0 left-0 w-3 h-3", cursor: "sw-resize" },
    { handle: "se", className: "absolute bottom-0 right-0 w-3 h-3", cursor: "se-resize" },
  ];

  return (
    <>
      <div
        ref={fabRef}
        className={`fixed bottom-5 right-5 z-[9998] gobid-floating-above-bottom-nav transition-transform duration-300 ease-out will-change-transform ${
          fabDockedRight ? "cursor-pointer" : ""
        }`}
        style={{
          transform: fabDockedRight
            ? `translateX(calc(100% - ${dockPeekPx}px))`
            : "translateX(0)",
        }}
        data-fab-container
        data-fab-docked={fabDockedRight ? "true" : "false"}
        title={
          fabDockedRight
            ? isMobileViewport
              ? "Afișează GO AI (apasă sau trage spre stânga)"
              : "Afișează GO AI — click pe jumătatea vizibilă"
            : undefined
        }
        onClick={() => {
          if (fabDockedRight) undockFab();
        }}
        onTouchStart={(e) => {
          if (!fabDockedRight) return;
          dockPeekTouchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = dockPeekTouchStartX.current;
          dockPeekTouchStartX.current = null;
          if (start == null || !fabDockedRight) return;
          const end = e.changedTouches[0]?.clientX;
          if (end != null && end - start <= -PEEK_SWIPE_THRESHOLD_PX) {
            undockFab();
          }
        }}
      >
        <div className="relative w-24 h-24 sm:w-[186px] sm:h-[186px] shrink-0">
          {!fabDockedRight && (
            <button
              type="button"
              aria-label="Ascunde GO AI în bara laterală"
              title="Ascunde"
              className="absolute -top-1 -right-1 z-[2] flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                dockFab();
              }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (fabDockedRight) {
                undockFab();
                return;
              }
              setOpen(true);
            }}
            className="flex h-full w-full items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-2"
            aria-label={fabDockedRight ? "Afișează GO AI" : "Deschide GO AI"}
          >
            <img
              src={aiAvatarSrc}
              alt="AI"
              className="pointer-events-none h-full w-full object-contain"
            />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[9999]"
          role="dialog"
          aria-modal="true"
          aria-label="Chat GO AI"
        >
          <div
            className="absolute inset-0 bg-black/5"
            onClick={() => {
              setOpen(false);
              setIsFullscreen(false);
              setPosition(null);
            }}
            aria-hidden
          />
          <div
            ref={panelRef}
            className={`flex flex-col overflow-hidden animate-in fade-in duration-200 select-none chat-panel-above-footer ${
              isFullscreen
                ? "fixed left-0 right-0 bottom-0 w-full rounded-none"
                : "absolute rounded-2xl"
            }`}
            data-chat-panel
            style={
              isFullscreen
                ? {
                    top: headerHeight,
                    bottom: "calc(var(--gobid-bottom-nav-height, 0px) + var(--gobid-bottom-nav-safe-bottom, 0px))",
                    background: "rgba(255,255,255,0.98)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    boxShadow: "none",
                    border: "none",
                  }
                : (() => {
                    if (position !== null) return { ...panelStyle, background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.6) inset", border: "1px solid rgba(255,255,255,0.6)" };
                    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
                    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
                    const headerEl = typeof document !== "undefined" ? document.querySelector("header") : null;
                    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 56;
                    const top = headerH + GAP_BELOW_HEADER_PX;
                    const isMobile = vw < MOBILE_BREAKPOINT_PX;
                    const fabSize = fabSizePx(isMobile);
                    const iconTop = vh - FAB_OFFSET_BOTTOM - fabSize;
                    const h = Math.max(MIN_HEIGHT, iconTop - top);
                    const w = Math.min(DEFAULT_WIDTH, vw - 2 * PANEL_PADDING);
                    const left = isMobile ? PANEL_PADDING : Math.max(PANEL_PADDING, vw - FAB_OFFSET_RIGHT - fabSize - w);
                    return { left, top, width: w, height: h, background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.6) inset", border: "1px solid rgba(255,255,255,0.6)" };
                  })()
            }
            onClick={(e) => e.stopPropagation()}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {!isFullscreen && (
              <>
                {resizeHandles.map(({ handle, className, cursor }) => (
                  <div
                    key={handle}
                    data-resize-handle
                    role="presentation"
                    className={className}
                    style={{ cursor }}
                    onPointerDown={startResize(handle)}
                    aria-hidden
                  />
                ))}
              </>
            )}
            <div
              role="button"
              tabIndex={0}
              onPointerDown={isFullscreen ? undefined : handlePointerDown}
              className={`shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200/60 ${!isFullscreen ? "cursor-grab active:cursor-grabbing " : ""}${isDragging ? "cursor-grabbing" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.preventDefault();
              }}
            >
              <div className="flex items-center gap-2 pointer-events-none min-w-0">
                <img src={aiAvatarSrc} alt="" className="w-7 h-7 shrink-0 object-contain" />
                <span className="text-[13px] font-medium text-gray-800 truncate">GO AI</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isFullscreen ? (
                  <button
                    type="button"
                    onClick={() => { setIsFullscreen(false); setPosition(null); }}
                    className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 transition-colors"
                    aria-label="Micșorează fereastra"
                    title="Micșorează fereastra"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H4V8 M16 4h4V8 M20 16v4h-4 M4 16v4h4" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="sm:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 transition-colors"
                    aria-label="Fullscreen"
                    title="Fullscreen – tastează ca într-un chat normal"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setIsFullscreen(false);
                    setPosition(null);
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
                  aria-label="Închide"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <AssistantChat isDrawer onClose={() => { setOpen(false); setPosition(null); }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
