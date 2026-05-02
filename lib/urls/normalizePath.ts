/**
 * Normalize path for internal linking and routing: strip query/hash, leading slash, trailing slash (except /ro).
 */

/**
 * - Strips query and hash (uses pathname if full URL).
 * - Ensures leading slash.
 * - Removes trailing slash except for "/ro".
 */
export function normalizePath(input: string): string {
  let path: string;
  const s = input.trim();
  if (!s) return "/";
  if (s.startsWith("http")) {
    try {
      path = new URL(s).pathname;
    } catch {
      path = s;
    }
  } else {
    path = s.startsWith("/") ? s : `/${s}`;
  }
  path = path.replace(/#.*$/, "").replace(/\?.*$/, "");
  if (path.length > 1 && path.endsWith("/")) {
    if (path === "/ro/") path = "/ro";
    else path = path.slice(0, -1);
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return path || "/";
}
