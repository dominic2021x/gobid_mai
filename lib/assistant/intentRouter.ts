/**
 * Intent router for the User AI Assistant. All actions are deterministic; no LLM for execution.
 */

export type RouteIntent =
  | "open_support"
  | "open_dashboard_favorites"
  | "open_dashboard_profile"
  | "create_listing"
  | "publish_listing"
  | "go_to_dashboard"
  | "unknown";

const SUPPORT_PATTERNS = [
  /\bsuport\b/i,
  /\bajutor\s+uman\b/i,
  /\bvorbesc\s+cu\s+cineva\b/i,
  /\bvreau\s+suport\b/i,
  /\bchat\s+suport\b/i,
];

const FAVORITES_PATTERNS = [
  /\b(du-?mă|du-?te|mergi)\s+(la\s+)?favorite\b/i,
  /\bfavorite\s*(le\s+mele)?\b/i,
  /\bla\s+favorite\b/i,
];

const PROFILE_PATTERNS = [
  /\b(du-?mă|du-?te|mergi)\s+(la\s+)?profil\b/i,
  /\b(la\s+)?profilul\s+meu\b/i,
  /\bsetări\b/i,
  /\b(du-?mă)\s+la\s+setări\b/i,
];

const DASHBOARD_PATTERNS = [
  /\b(du-?mă|du-?te|mergi)\s+(la\s+)?dashboard\b/i,
  /\bla\s+dashboard\b/i,
  /\bpanou\b/i,
];

export function detectIntentRoute(message: string): RouteIntent {
  const t = message.trim();
  if (!t) return "unknown";

  if (SUPPORT_PATTERNS.some((re) => re.test(t))) return "open_support";
  if (FAVORITES_PATTERNS.some((re) => re.test(t))) return "open_dashboard_favorites";
  if (PROFILE_PATTERNS.some((re) => re.test(t))) return "open_dashboard_profile";
  if (DASHBOARD_PATTERNS.some((re) => re.test(t))) return "go_to_dashboard";

  const lower = t.toLowerCase();
  if (
    lower.includes("vreau să public") ||
    lower.includes("vreau sa public") ||
    lower.includes("creez un anunț") ||
    lower.includes("adaug un anunț") ||
    lower.includes("anunț nou") ||
    lower.includes("anunt nou")
  ) {
    return "create_listing";
  }
  if (
    /^\s*da\s*[,.]?\s*publică\s*$/i.test(t) ||
    /^\s*publică\s*$/i.test(t) ||
    /^\s*publica\s*$/i.test(t) ||
    /^\s*da\s*$/i.test(t) ||
    /^\s*ok\s*[,.]?\s*publică\s*$/i.test(t) ||
    /^\s*confirm\s*$/i.test(t)
  ) {
    return "publish_listing";
  }

  return "unknown";
}

export type UiActionType = "OPEN_SUPPORT_CHAT" | "NAVIGATE" | "OPEN_MODAL";

export type AssistantUiAction = {
  type: UiActionType;
  payload?: Record<string, unknown>;
};

export interface AssistantResponse {
  message: string;
  quickReplies?: string[];
  draftProgress?: { status: string; filled: number; total: number };
  uiAction?: AssistantUiAction;
}
