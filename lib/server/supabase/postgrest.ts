export type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
};

export type PostgrestLikeResult<T> = {
  data: T | null;
  error: PostgrestLikeError | null;
  count?: number | null;
};

export const POSTGREST_TIMEOUT_CODE = "GOBID_TIMEOUT";

export function isRetryablePostgrestError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  const details = typeof e.details === "string" ? e.details.toLowerCase() : "";
  const hint = typeof e.hint === "string" ? e.hint.toLowerCase() : "";
  const haystack = `${msg} ${details} ${hint}`;

  if (code === "PGRST002" || code === POSTGREST_TIMEOUT_CODE) return true;
  if (status >= 500) return true;

  return (
    haystack.includes("schema cache") ||
    haystack.includes("upstream request timeout") ||
    haystack.includes("upstream connect error") ||
    haystack.includes("service unavailable") ||
    haystack.includes("fetch failed") ||
    haystack.includes("connection closed") ||
    haystack.includes(":closed") ||
    haystack.includes("econnreset") ||
    haystack.includes("socket hang up") ||
    haystack.includes("etimedout") ||
    haystack.includes("aborterror")
  );
}

function createTimeoutError(timeoutMs: number): PostgrestLikeError {
  return {
    code: POSTGREST_TIMEOUT_CODE,
    message: `Supabase query timed out after ${timeoutMs}ms`,
    status: 504,
  };
}

function normalizeUnknownError(error: unknown, timeoutMs: number): PostgrestLikeError {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name : "";
    if (name === "AbortError") {
      return createTimeoutError(timeoutMs);
    }
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : "Supabase query failed",
      details: typeof e.details === "string" ? e.details : undefined,
      hint: typeof e.hint === "string" ? e.hint : undefined,
      status: typeof e.status === "number" ? e.status : undefined,
    };
  }

  return {
    code: undefined,
    message: typeof error === "string" ? error : "Supabase query failed",
    status: undefined,
  };
}

export async function runPostgrestQuery<T>(
  build: (signal: AbortSignal) => PromiseLike<any>,
  {
    timeoutMs = 6500,
    maxRetries = 2,
    retryDelayMs = 250,
  }: {
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  } = {},
): Promise<PostgrestLikeResult<T>> {
  let last: PostgrestLikeResult<T> = { data: null, error: null };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      last = (await build(controller.signal)) as PostgrestLikeResult<T>;
    } catch (error) {
      last = {
        data: null,
        error: normalizeUnknownError(error, timeoutMs),
        count: null,
      };
    } finally {
      clearTimeout(timer);
    }

    if (!last.error) return last;
    if (!isRetryablePostgrestError(last.error) || attempt === maxRetries) return last;
    await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
  }

  return last;
}
