"use client";

import dynamic from "next/dynamic";

const AuthRequiredModal = dynamic(() => import("@/components/AuthRequiredModal").then((m) => m.default), {
  ssr: false,
});

export interface HomeFabAndModalsProps {
  isDarkMode: boolean;
  isLoggedIn: boolean;
  showAuthModal: boolean;
  setShowAuthModal: (v: boolean) => void;
  floatingButtonPos: { left: number; top: number } | null;
  floatingButtonRef: React.RefObject<HTMLAnchorElement | null>;
  onFABClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onFloatingDragStart: (clientX: number, clientY: number) => void;
  /** Parent may call e.preventDefault() when dragging to avoid scroll. */
  onFloatingTouchMove: (e: React.TouchEvent<HTMLAnchorElement>) => void;
  onFloatingDragEnd: () => void;
}

/**
 * FAB + AuthRequiredModal. Isolated so heavy modal deps load only with this chunk.
 * Intentionally lazy: FAB and auth modal are non-critical; keeps AuthRequiredModal out of main bundle.
 */
export function HomeFabAndModals({
  isDarkMode,
  isLoggedIn,
  showAuthModal,
  setShowAuthModal,
  floatingButtonPos,
  floatingButtonRef,
  onFABClick,
  onFloatingDragStart,
  onFloatingTouchMove,
  onFloatingDragEnd,
}: HomeFabAndModalsProps) {
  return (
    <>
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        isDarkMode={isDarkMode}
      />
      <a
        ref={floatingButtonRef}
        href={isLoggedIn ? "/dashboard" : "/auth"}
        onClick={onFABClick}
        className={`hidden fixed z-40 flex items-center justify-center min-w-[48px] min-h-[48px] w-16 h-16 rounded-full border-2 border-green-800 bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl active:scale-95 touch-none select-none ${!isLoggedIn ? "fab-pulse-subtle " : ""}${floatingButtonPos ? "" : "bottom-5 right-5"}`}
        style={floatingButtonPos ? { left: floatingButtonPos.left, top: floatingButtonPos.top } : undefined}
        aria-label={isLoggedIn ? "Dashboard" : "Autentificare"}
        onTouchStart={(e) => onFloatingDragStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={onFloatingTouchMove}
        onTouchEnd={onFloatingDragEnd}
        onMouseDown={(e) => onFloatingDragStart(e.clientX, e.clientY)}
      >
        <i className={`${isLoggedIn ? "ri-home-line" : "ri-add-line"} text-[1.75rem] text-white pointer-events-none`} aria-hidden />
      </a>
    </>
  );
}
