/**
 * Apeluri către `/api/*` din zona `/dashboard/*`: fără cache HTTP, `credentials: "include"`
 * (sesiune Supabase SSR din cookie). Nu seta `Authorization` pentru același origin — serverul
 * folosește `getRequestAuthUser()` (doar cookie + `getUser()`).
 */
export function dashboardApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const body = init?.body;
  const isBinaryBody =
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof Blob !== "undefined" && body instanceof Blob);
  if (!headers.has("Accept") && !isBinaryBody) {
    headers.set("Accept", "application/json");
  }
  const next: RequestInit = {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
    cache: init?.cache ?? "no-store",
  };
  return fetch(input, next);
}
