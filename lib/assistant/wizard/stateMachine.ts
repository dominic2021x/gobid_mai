import { UI_MAP, MANDATORY_FIELD_LABELS } from "../uiMap";
import type { ValidateDraftResult } from "../tools/validateDraft";

export type WizardState =
  | "START"
  | "INTENT_HELP"
  | "INTENT_CREATE_LISTING"
  | "DRAFT_CREATED"
  | "COLLECTING_DETAILS"
  | "CONFIRM_PUBLISH"
  | "CONFIRM_DELETE"
  | "PUBLISHED"
  | "DONE";

/** User explicitly confirms publish (case-insensitive) */
const PUBLISH_CONFIRM_PATTERNS = [
  /^\s*da\s*[,.]?\s*publică\s*$/i,
  /^\s*publică\s*$/i,
  /^\s*publica\s*$/i,
  /^\s*da\s*$/i,
  /^\s*ok\s*[,.]?\s*publică\s*$/i,
  /^\s*confirm\s*$/i,
];

/** User explicitly confirms delete draft (case-insensitive). Must include șterge/sterge. */
const DELETE_CONFIRM_PATTERNS = [
  /^\s*da\s*[,.]?\s*șterge\s*$/i,
  /^\s*da\s*[,.]?\s*sterge\s*$/i,
  /șterge\s*draft/i,
  /sterge\s*draft/i,
  /^\s*șterge\s*$/i,
  /^\s*sterge\s*$/i,
];

export function userWantsToPublish(message: string): boolean {
  const trimmed = message.trim();
  return PUBLISH_CONFIRM_PATTERNS.some((re) => re.test(trimmed));
}

export function userWantsToDeleteDraft(message: string): boolean {
  const trimmed = message.trim();
  return DELETE_CONFIRM_PATTERNS.some((re) => re.test(trimmed));
}

export type NextWizardStepResult = {
  reply: string;
  nextState: WizardState;
  /** First missing field we are asking for (for context-aware slot filling). */
  requestedField?: string;
};

/**
 * Returns suggested assistant reply and next state based on current state and validate result.
 */
export function getNextWizardStep(
  state: WizardState,
  validation: ValidateDraftResult | null,
  userMessage: string
): NextWizardStepResult {
  if (state === "CONFIRM_PUBLISH" && userWantsToPublish(userMessage) && validation?.ready) {
    return {
      reply: "Am publicat anunțul. Îl poți vedea la [Anunțurile mele](/dashboard/my-products).",
      nextState: "PUBLISHED",
    };
  }

  if (state === "CONFIRM_PUBLISH" && userWantsToPublish(userMessage) && validation && !validation.ready) {
    const labels = validation.missing.map((m) => MANDATORY_FIELD_LABELS[m] ?? m).join(", ");
    return {
      reply: `Încă lipsesc: ${labels}. Completează-le și spune din nou „publică”.`,
      nextState: "COLLECTING_DETAILS",
      requestedField: validation.missing[0],
    };
  }

  if (validation?.ready && state !== "CONFIRM_PUBLISH" && state !== "PUBLISHED" && state !== "DONE") {
    return {
      reply: "Toate câmpurile obligatorii sunt completate. Vrei să publici anunțul? Răspunde „da, publică” pentru a confirma.",
      nextState: "CONFIRM_PUBLISH",
    };
  }

  if (validation && !validation.ready && validation.missing.length > 0) {
    const labels = validation.missing.map((m) => MANDATORY_FIELD_LABELS[m] ?? m).join(", ");
    return {
      reply: `Pentru a putea publica, completează: ${labels}.`,
      nextState: "COLLECTING_DETAILS",
      requestedField: validation.missing[0],
    };
  }

  switch (state) {
    case "START":
      return { reply: "Bună! Pot să te ajut să navighezi în panou sau să creezi un anunț nou. Spune-mi ce ai nevoie.", nextState: "START" };
    case "INTENT_HELP":
      return {
        reply: "Poți naviga folosind meniul: " + UI_MAP.map((u) => `**${u.label}**: ${u.path}`).join(". ") + ".",
        nextState: "DONE",
      };
    case "INTENT_CREATE_LISTING":
      return {
        reply: "Am creat un draft. Spune-mi titlul anunțului.",
        nextState: "DRAFT_CREATED",
      };
    case "DRAFT_CREATED":
      return { reply: "Spune-mi titlul anunțului sau categoria (ex: autoturisme, apartamente).", nextState: "COLLECTING_DETAILS" };
    case "COLLECTING_DETAILS":
      return { reply: "Ce altceva vrei să completezi? (titlu, descriere, categorie, subcategorie, preț, monedă)", nextState: "COLLECTING_DETAILS" };
    case "CONFIRM_PUBLISH":
      return { reply: "Vrei să publici anunțul? Răspunde „da, publică” pentru confirmare.", nextState: "CONFIRM_PUBLISH" };
    case "CONFIRM_DELETE":
      return { reply: "Vrei să ștergi draftul? Răspunde „da, șterge” pentru confirmare.", nextState: "CONFIRM_DELETE" };
    case "PUBLISHED":
    case "DONE":
      return { reply: "Anunțul a fost publicat. Mai ai nevoie de ceva?", nextState: "DONE" };
    default:
      return { reply: "Cu ce te pot ajuta?", nextState: "START" };
  }
}

/**
 * Detects intent from user message (help vs create listing).
 */
export function detectIntent(message: string): "help" | "create_listing" | "unknown" {
  const lower = message.trim().toLowerCase();
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
    lower.includes("unde găsesc") ||
    lower.includes("unde gasesc") ||
    lower.includes("cum ajung") ||
    lower.includes("meniu") ||
    lower.includes("navig") ||
    lower.includes("dashboard")
  ) {
    return "help";
  }
  return "unknown";
}
