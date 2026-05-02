/**
 * Rule-based suggestions for failed health checks (no AI).
 * Maps error_code + context to suggestion_key and human-readable suggestion.
 */

export interface SuggestionResult {
  suggestion_key: string;
  suggestion: string;
}

const SNIPPET_MAX_LEN = 3000;

function truncateSnippet(s: string | undefined): string {
  if (!s || typeof s !== "string") return "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= SNIPPET_MAX_LEN) return cleaned;
  return cleaned.slice(0, SNIPPET_MAX_LEN) + "...";
}

/**
 * Sanitize response snippet: no tokens, no full HTML dump.
 */
export function sanitizeResponseSnippet(body: string | undefined, contentType?: string): string {
  if (!body || typeof body !== "string") return "";
  let out = body;
  if (contentType?.toLowerCase().includes("application/json")) {
    try {
      const parsed = JSON.parse(out);
      if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed);
        if (keys.some((k) => /token|secret|password|key|auth/i.test(k))) {
          keys.forEach((k) => {
            if (/token|secret|password|key|auth/i.test(k)) (parsed as Record<string, unknown>)[k] = "[REDACTED]";
          });
          out = JSON.stringify(parsed);
        }
      }
    } catch {
      // leave as-is, will truncate
    }
  }
  return truncateSnippet(out);
}

export function getSuggestion(
  errorCode: string | null,
  status: number | null,
  durationMs: number | null
): SuggestionResult {
  const code = (errorCode || "").toUpperCase();
  const statusNum = status ?? 0;
  const duration = durationMs ?? 0;

  if (code === "TIMEOUT" || duration > 15000) {
    return {
      suggestion_key: "timeout",
      suggestion:
        "Crește maxDuration pentru ruta dacă e serverless lungă; verifică call-uri externe lente; adaugă caching; verifică logs Vercel pentru cold start; optimizează query Supabase; adaugă retry/backoff pentru provider.",
    };
  }

  if (statusNum === 500 || statusNum === 502 || statusNum === 503) {
    return {
      suggestion_key: "http_5xx",
      suggestion:
        "Deschide ruta exactă (target_url). Verifică Vercel Function Logs. Verifică env vars (chei lipsă). Confirmă runtime nodejs. Verifică stacktrace/throw necontrolat. Adaugă guard pentru parametri.",
    };
  }

  if (statusNum === 401 || statusNum === 403) {
    return {
      suggestion_key: "http_4xx_auth",
      suggestion:
        "Verifică middleware/auth guard. Dacă trebuie public, scoate verificarea de sesiune. Dacă trebuie privat, marchează check ca 'requiresAuth' și folosește token server-side.",
    };
  }

  if (statusNum === 404) {
    return {
      suggestion_key: "http_404",
      suggestion:
        "Ruta s-a schimbat. Actualizează lista checks sau redirects în next.config.js. Verifică deploy-ul curent și App Router folder name.",
    };
  }

  if (code === "JSON_PARSE" || code === "CONTENT_TYPE_INVALID") {
    return {
      suggestion_key: "json_parse",
      suggestion:
        "Endpoint returnează HTML/eroare în loc de JSON. Verifică handler, headers, și ce se întâmplă la error; returnează NextResponse.json consistent.",
    };
  }

  if (code === "DB_ERROR" || code === "SUPABASE_ERROR") {
    return {
      suggestion_key: "db_error",
      suggestion:
        "Verifică SUPABASE_SERVICE_ROLE_KEY/URL. Confirmă conectivitate. Verifică RLS/policy dacă nu folosești service role. Optimizează query și index.",
    };
  }

  if (code === "FETCH_ERROR" || code === "NETWORK_ERROR") {
    return {
      suggestion_key: "fetch_error",
      suggestion:
        "Verifică disponibilitatea URL-ului, DNS, firewall și timeout. Pentru apeluri interne, folosește URL-ul public (ex. SITE_URL) sau verifică rețeaua Vercel.",
    };
  }

  return {
    suggestion_key: "unknown",
    suggestion: `Eroare: ${code || statusNum}. Verifică target_url și logs. Verifică env (NEXT_PUBLIC_SITE_URL, etc.).`,
  };
}
