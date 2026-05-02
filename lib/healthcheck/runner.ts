/**
 * Health check runner: execute HTTP and Supabase checks, measure duration, collect results.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { getCheckDefinitions, SUPABASE_CHECK_NAME, type CheckDefinition } from "./checks";
import { getSuggestion, sanitizeResponseSnippet } from "./suggestions";

const REQUEST_TIMEOUT_MS = 25000;
const SNIPPET_MAX_CHARS = 3000;

export interface CheckResult {
  category: string;
  name: string;
  target_url: string;
  method: string;
  expected: Record<string, unknown> | null;
  status: number | null;
  ok: boolean;
  duration_ms: number;
  error_code: string | null;
  error_message: string | null;
  response_snippet: string | null;
  suggestion_key: string;
  suggestion: string;
}

async function runHttpCheck(def: CheckDefinition): Promise<CheckResult> {
  const start = Date.now();
  let status: number | null = null;
  let body = "";
  let contentType = "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(def.target_url, {
      method: def.method,
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);
    status = res.status;
    contentType = res.headers.get("content-type") || "";

    const text = await res.text();
    body = text;

    const duration_ms = Date.now() - start;

    const expectStatus = def.expected?.status ?? 200;
    const expectJson = def.expected?.contentType === "application/json";
    let ok = res.ok && status === expectStatus;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (controller.signal.aborted) {
      ok = false;
      errorCode = "TIMEOUT";
      errorMessage = `Request exceeded ${REQUEST_TIMEOUT_MS}ms`;
    } else if (!res.ok) {
      errorCode = `HTTP_${status}`;
      errorMessage = `${status} ${res.statusText}`;
    } else if (expectJson && !contentType.toLowerCase().includes("application/json")) {
      ok = false;
      errorCode = "CONTENT_TYPE_INVALID";
      errorMessage = `Expected JSON, got ${contentType}`;
    } else if (expectJson && text) {
      try {
        JSON.parse(text);
      } catch {
        ok = false;
        errorCode = "JSON_PARSE";
        errorMessage = "Response is not valid JSON";
      }
    }

    const suggestion = getSuggestion(errorCode, status, duration_ms);
    const responseSnippet = ok ? null : sanitizeResponseSnippet(body.slice(0, 5000), contentType).slice(0, SNIPPET_MAX_CHARS);

    return {
      category: def.category,
      name: def.name,
      target_url: def.target_url,
      method: def.method,
      expected: def.expected ? (def.expected as Record<string, unknown>) : null,
      status,
      ok,
      duration_ms,
      error_code: errorCode,
      error_message: errorMessage,
      response_snippet: responseSnippet || null,
      suggestion_key: suggestion.suggestion_key,
      suggestion: suggestion.suggestion,
    };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout");
    const errorCode = isTimeout ? "TIMEOUT" : "FETCH_ERROR";
    const suggestion = getSuggestion(errorCode, status, duration_ms);

    return {
      category: def.category,
      name: def.name,
      target_url: def.target_url,
      method: def.method,
      expected: def.expected ? (def.expected as Record<string, unknown>) : null,
      status,
      ok: false,
      duration_ms,
      error_code: errorCode,
      error_message: message.slice(0, 1000),
      response_snippet: body ? sanitizeResponseSnippet(body.slice(0, 2000), contentType).slice(0, SNIPPET_MAX_CHARS) : null,
      suggestion_key: suggestion.suggestion_key,
      suggestion: suggestion.suggestion,
    };
  }
}

async function runSupabaseCheck(siteUrl: string): Promise<CheckResult> {
  const start = Date.now();
  const def: CheckDefinition = {
    name: SUPABASE_CHECK_NAME,
    category: "supabase",
    target_url: `${siteUrl.replace(/\/$/, "")}/api (Supabase select)`,
    method: "GET",
  };

  if (!supabaseAdmin) {
    const duration_ms = Date.now() - start;
    const suggestion = getSuggestion("DB_ERROR", null, duration_ms);
    return {
      category: def.category,
      name: def.name,
      target_url: def.target_url,
      method: def.method,
      expected: null,
      status: null,
      ok: false,
      duration_ms,
      error_code: "DB_ERROR",
      error_message: "Supabase service role not configured",
      response_snippet: null,
      suggestion_key: suggestion.suggestion_key,
      suggestion: suggestion.suggestion,
    };
  }

  try {
    const { error } = await supabaseAdmin.from("products").select("id").limit(1).maybeSingle();
    const duration_ms = Date.now() - start;

    if (error) {
      const suggestion = getSuggestion("DB_ERROR", null, duration_ms);
      return {
        category: def.category,
        name: def.name,
        target_url: def.target_url,
        method: def.method,
        expected: null,
        status: null,
        ok: false,
        duration_ms,
        error_code: "DB_ERROR",
        error_message: error.message.slice(0, 1000),
        response_snippet: null,
        suggestion_key: suggestion.suggestion_key,
        suggestion: suggestion.suggestion,
      };
    }

    const suggestion = getSuggestion(null, 200, duration_ms);
    return {
      category: def.category,
      name: def.name,
      target_url: def.target_url,
      method: def.method,
      expected: null,
      status: 200,
      ok: true,
      duration_ms,
      error_code: null,
      error_message: null,
      response_snippet: null,
      suggestion_key: suggestion.suggestion_key,
      suggestion: suggestion.suggestion,
    };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const suggestion = getSuggestion("DB_ERROR", null, duration_ms);
    return {
      category: def.category,
      name: def.name,
      target_url: def.target_url,
      method: def.method,
      expected: null,
      status: null,
      ok: false,
      duration_ms,
      error_code: "DB_ERROR",
      error_message: message.slice(0, 1000),
      response_snippet: null,
      suggestion_key: suggestion.suggestion_key,
      suggestion: suggestion.suggestion,
    };
  }
}

/**
 * Run all checks (HTTP from definitions + one Supabase check). Uses SITE_URL from env.
 */
export async function runAllChecks(): Promise<CheckResult[]> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://gobid.ro")).replace(/\/$/, "");

  const definitions = getCheckDefinitions(base);
  const results: CheckResult[] = [];

  for (const def of definitions) {
    const result = await runHttpCheck(def);
    results.push(result);
  }

  const supabaseResult = await runSupabaseCheck(base || "https://gobid.ro");
  results.push(supabaseResult);

  return results;
}
