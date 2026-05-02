/**
 * Configurare răspunsuri AI (v2)
 * - versioning + migrare
 * - deepMerge generic
 * - validare/sanitizare
 * - cache pentru regex (performanță)
 */

export type AIStyle = 'formal' | 'casual' | 'friendly' | 'professional';

export interface AIResponseConfig {
  version: number;
  style: AIStyle;
  systemPrompt: string;

  voicePatterns: {
    enabled: boolean;
    pausesProbability: number; // 0-1
    hesitationsProbability: number; // 0-1
    connectorsEnabled: boolean;
  };

  customResponses: Array<{
    id: string;
    pattern: string; // Regex sau keyword
    response: string;
    enabled: boolean;
  }>;

  templates: {
    greeting: string;
    thanks: string;
    noResults: string;
    tokenBlocked: string;
    followUp: string;
    /** Ofertă tichet când AI nu rezolvă (nu crează automat) */
    ticketOffer?: string;
    /** Confirmare după ce userul a spus "da" la ofertă */
    ticketCreatedConfirm?: string;
  };

  welcomeMessage: {
    enabled: boolean;
    message: string;
    initialDelay: number; // ms
    typingDelay: number; // ms
  };
}

const CONFIG_VERSION = 2;

export const DEFAULT_RESPONSE_CONFIG: AIResponseConfig = {
  version: CONFIG_VERSION,
  style: 'friendly',
  systemPrompt: `Ești agent suport gobid.ro. Scrii ca un om real în chat - scurt, firesc, fără formulări de AI. Evită "Cu plăcere să te ajut!", liste numerotate, propoziții prea lungi. Folosește "așa", "păi", "ok" - ton relaxat. Max 2-4 propoziții. Răspunde în română, util și concis.`,
  voicePatterns: {
    enabled: true,
    pausesProbability: 0.3,
    hesitationsProbability: 0.2,
    connectorsEnabled: true,
  },
  customResponses: [
    {
      id: 'greeting',
      pattern:
        '^(salut|bună|buna|bună ziua|buna ziua|bună seara|buna seara|bună dimineața|buna dimineata|hello|hi|hey|servus)\\b',
      response: 'Bună! Cu ce te pot ajuta?',
      enabled: true,
    },
    {
      id: 'thanks',
      pattern: '\\b(mulțumesc|multumesc|mersi|thanks)\\b',
      response: 'Cu plăcere! Dacă mai ai nevoie de ceva, scrie.',
      enabled: true,
    },
    {
      id: 'produs-meu-nu-gasesc',
      pattern: '(produsul meu|produsul tău|produs live|nu il gasesc|nu îl găsesc|nu găsesc produsul|nu gasesc produsul|licitațiile mele|produsele mele)',
      response: 'Produsele tale publicate sunt în Dashboard → Licitațiile mele. Folosește căutarea sau filtrele din pagină. Dacă nu apar, verifică dacă sunt încă în așteptarea aprobării.',
      enabled: true,
    },
  ],
  templates: {
    greeting: 'Bună! 👋 Cu ce te pot ajuta?',
    thanks: 'Cu plăcere! Dacă mai ai nevoie de ceva, scrie.',
    noResults: 'Nu prea înțeleg încă. Îmi zici un pic mai exact ce cauți?',
    tokenBlocked: 'Lista e blocată. Deblochezi tokenul și te ajut imediat.',
    followUp: 'Am {count} rezultate. Ce te interesează mai exact?',
    ticketOffer: 'Nu am putut găsi un răspuns satisfăcător. Doriți să deschid un tichet către suport pentru a verifica mai atent?',
    ticketCreatedConfirm: 'Am deschis un tichet la suport. Echipa noastră îl va verifica în curând.',
  },
  welcomeMessage: {
    enabled: true,
    message:
      'Căutăm agent disponibil... ✓ Ești poziția 2 în coadă, la glumă! 😄 Bună! Cum te pot ajuta astăzi?',
    initialDelay: 1200,
    typingDelay: 3000,
  },
};

/* ----------------------------- utilitare ----------------------------- */

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]';
}

function deepMerge<T>(base: T, override: any): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override ?? base) as T;

  const out: any = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const bv = (base as any)[k];
    if (Array.isArray(v)) {
      // pentru arrays: by default înlocuiește; dacă vrei merge-by-id, vezi funcția de mai jos
      out[k] = v;
    } else if (isPlainObject(v) && isPlainObject(bv)) {
      out[k] = deepMerge(bv, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function clamp01(n: any, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function sanitizeConfig(raw: any): AIResponseConfig {
  // pornești de la default + override, apoi corectezi câmpuri riscante
  const merged = deepMerge(DEFAULT_RESPONSE_CONFIG, raw);

  // style
  const allowed: AIStyle[] = ['formal', 'casual', 'friendly', 'professional'];
  if (!allowed.includes(merged.style)) merged.style = DEFAULT_RESPONSE_CONFIG.style;

  // voicePatterns
  merged.voicePatterns = {
    enabled: !!merged.voicePatterns?.enabled,
    pausesProbability: clamp01(
      merged.voicePatterns?.pausesProbability,
      DEFAULT_RESPONSE_CONFIG.voicePatterns.pausesProbability
    ),
    hesitationsProbability: clamp01(
      merged.voicePatterns?.hesitationsProbability,
      DEFAULT_RESPONSE_CONFIG.voicePatterns.hesitationsProbability
    ),
    connectorsEnabled: !!merged.voicePatterns?.connectorsEnabled,
  };

  // welcomeMessage timings
  merged.welcomeMessage = {
    enabled: !!merged.welcomeMessage?.enabled,
    message: String(merged.welcomeMessage?.message ?? DEFAULT_RESPONSE_CONFIG.welcomeMessage.message),
    initialDelay: Math.max(
      0,
      Number(merged.welcomeMessage?.initialDelay ?? DEFAULT_RESPONSE_CONFIG.welcomeMessage.initialDelay)
    ),
    typingDelay: Math.max(
      0,
      Number(merged.welcomeMessage?.typingDelay ?? DEFAULT_RESPONSE_CONFIG.welcomeMessage.typingDelay)
    ),
  };

  // templates
  merged.templates = {
    ...DEFAULT_RESPONSE_CONFIG.templates,
    ...(merged.templates || {}),
  };

  // customResponses: sanitize + dedupe by id
  merged.customResponses = mergeCustomResponsesById(
    DEFAULT_RESPONSE_CONFIG.customResponses,
    Array.isArray(raw?.customResponses) ? raw.customResponses : merged.customResponses
  ).map((r) => ({
    id: String(r.id),
    pattern: String(r.pattern ?? ''),
    response: String(r.response ?? ''),
    enabled: !!r.enabled,
  }));

  // version
  merged.version = CONFIG_VERSION;

  return merged;
}

function mergeCustomResponsesById(
  base: AIResponseConfig['customResponses'],
  override: AIResponseConfig['customResponses']
) {
  const map = new Map<string, any>();
  for (const r of base) map.set(r.id, r);
  for (const r of override || []) {
    if (!r?.id) continue;
    map.set(String(r.id), { ...(map.get(String(r.id)) || {}), ...r });
  }
  return Array.from(map.values());
}

/* --------------------------- storage + migrare --------------------------- */

function migrateConfig(raw: any): any {
  // aici pui pași de migrare când crești versiunea
  const v = Number(raw?.version ?? 0);

  if (v < 1) {
    // exemplu: dacă înainte nu exista version, îl adaugi
    raw = { ...raw, version: 1 };
  }

  if (v < 2) {
    // exemplu: schimbi un template vechi
    if (raw?.templates?.noResults === 'Îmi pare rău, dar vă rog să fiți mai explicit.') {
      raw = {
        ...raw,
        templates: { ...raw.templates, noResults: DEFAULT_RESPONSE_CONFIG.templates.noResults },
      };
    }
    raw = { ...raw, version: 2 };
  }

  return raw;
}

const STORAGE_KEY = 'aiResponseConfig';

/**
 * Încarcă configurația
 */
export function loadResponseConfig(): AIResponseConfig {
  if (typeof window === 'undefined') return DEFAULT_RESPONSE_CONFIG;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_RESPONSE_CONFIG;

    const parsed = migrateConfig(JSON.parse(saved));
    return sanitizeConfig(parsed);
  } catch (e) {
    console.error('Error loading response config:', e);
    return DEFAULT_RESPONSE_CONFIG;
  }
}

/**
 * Salvează configurația
 */
export function saveResponseConfig(config: AIResponseConfig): void {
  if (typeof window === 'undefined') return;

  try {
    const clean = sanitizeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.error('Error saving response config:', e);
  }
}

/* ---------------------------- prompt + templating ---------------------------- */

export function buildSystemPrompt(config: AIResponseConfig): string {
  const stylePrompts: Record<AIStyle, string> = {
    formal: 'Folosește un ton formal și respectuos. Evită emoji-uri și expresii informale.',
    casual: 'Folosește un ton casual și relaxat. Poți folosi emoji-uri rar și expresii prietenoase.',
    friendly: 'Folosește un ton prietenos și apropiat. Emoji-uri rare, maxim 1 per mesaj.',
    professional: 'Folosește un ton profesional dar accesibil. Fii clar, scurt, orientat pe soluție.',
  };

  return `${config.systemPrompt}\n\n${stylePrompts[config.style]}`;
}

export function applyTemplate(template: string, variables: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(variables?.[key] ?? `{${key}}`));
}

/* -------------------------- custom responses (cache) -------------------------- */

type CompiledRule = {
  id: string;
  enabled: boolean;
  response: string;
  kind: 'regex' | 'keyword';
  regex?: RegExp;
  keyword?: string;
};

let compiledCacheKey = '';
let compiledRules: CompiledRule[] = [];

function compileCustomResponses(config: AIResponseConfig): CompiledRule[] {
  const key = JSON.stringify(
    (config.customResponses || []).map((r) => [r.id, r.enabled, r.pattern, r.response])
  );
  if (key === compiledCacheKey) return compiledRules;

  compiledCacheKey = key;
  compiledRules = (config.customResponses || []).map((r) => {
    const pattern = (r.pattern || '').trim();
    if (!pattern) {
      return { id: r.id, enabled: r.enabled, response: r.response, kind: 'keyword', keyword: '' };
    }

    try {
      const re = new RegExp(pattern, 'i');
      return { id: r.id, enabled: r.enabled, response: r.response, kind: 'regex', regex: re };
    } catch {
      // fallback keyword
      return {
        id: r.id,
        enabled: r.enabled,
        response: r.response,
        kind: 'keyword',
        keyword: pattern.toLowerCase(),
      };
    }
  });

  return compiledRules;
}

export function findCustomResponse(query: string, config: AIResponseConfig): string | null {
  const q = String(query || '');
  const qLower = q.toLowerCase();

  for (const rule of compileCustomResponses(config)) {
    if (!rule.enabled) continue;

    if (rule.kind === 'regex' && rule.regex) {
      if (rule.regex.test(q)) return rule.response; // test pe query original
    } else if (rule.kind === 'keyword' && rule.keyword) {
      if (qLower.includes(rule.keyword)) return rule.response;
    }
  }

  return null;
}
