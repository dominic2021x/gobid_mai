/**
 * Build "Action items" from failed checks: group by suggestion_key, add probable files heuristic.
 */

export interface HealthCheckRow {
  id: number;
  name: string;
  category: string;
  target_url: string;
  ok: boolean;
  suggestion_key: string | null;
  suggestion: string | null;
  error_code: string | null;
  status: number | null;
}

export interface ActionItemGroup {
  suggestion_key: string;
  title: string;
  affected: { target_url: string; name: string }[];
  probableCause: string;
  checklist: string[];
  probableFiles: string[];
}

function probableFilesForUrl(targetUrl: string, category: string): string[] {
  const files: string[] = [];
  try {
    const u = new URL(targetUrl);
    const path = u.pathname.replace(/\/$/, "") || "/";
    if (category === "supabase" || u.pathname.includes("Supabase")) {
      files.push("lib/supabase.ts");
      files.push(".env.local (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL)");
      files.push("supabase/migrations/");
    } else if (path.startsWith("/api/")) {
      const segment = path.replace(/^\/api/, "app/api") + "/route.ts";
      files.push(segment);
    } else {
      const pagePath = path === "/" ? "/page.tsx" : `${path}/page.tsx`;
      files.push("app" + pagePath);
    }
  } catch {
    // ignore
  }
  return files;
}

function checklistForKey(key: string): string[] {
  const map: Record<string, string[]> = {
    timeout: [
      "Verifică Vercel Function Logs pentru timeout",
      "Crește maxDuration pe ruta API dacă e necesar",
      "Verifică cold start și dependențe lente",
    ],
    http_5xx: [
      "Deschide target_url în browser sau cu curl",
      "Verifică Vercel Function Logs",
      "Verifică env vars (chei lipsă)",
      "Verifică stacktrace și erori neprinses",
    ],
    http_4xx_auth: [
      "Confirmă dacă endpoint-ul trebuie să fie public sau protejat",
      "Verifică middleware și auth guard",
    ],
    http_404: [
      "Verifică dacă ruta s-a mutat (App Router)",
      "Verifică next.config.js redirects",
    ],
    json_parse: [
      "Verifică că handler-ul returnează NextResponse.json() la succes și la eroare",
      "Verifică Content-Type header",
    ],
    db_error: [
      "Verifică SUPABASE_SERVICE_ROLE_KEY și NEXT_PUBLIC_SUPABASE_URL",
      "Verifică RLS și policies",
      "Verifică indexurile și query-urile lente",
    ],
    fetch_error: [
      "Verifică disponibilitatea URL-ului și DNS",
      "Pentru apeluri interne folosește NEXT_PUBLIC_SITE_URL",
    ],
    unknown: ["Verifică target_url și logs", "Verifică variabilele de mediu"],
  };
  return map[key] ?? map.unknown;
}

export function buildActionItems(checks: HealthCheckRow[]): ActionItemGroup[] {
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) return [];

  const byKey = new Map<string, HealthCheckRow[]>();
  for (const c of failed) {
    const key = c.suggestion_key || "unknown";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c);
  }

  const result: ActionItemGroup[] = [];
  for (const [suggestionKey, groupChecks] of byKey) {
    const first = groupChecks[0];
    const suggestion = first?.suggestion ?? "Verifică eroarea și logs.";
    const allFiles = new Set<string>();
    for (const c of groupChecks) {
      probableFilesForUrl(c.target_url, c.category).forEach((f) => allFiles.add(f));
    }
    result.push({
      suggestion_key: suggestionKey,
      title: suggestionKey.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      affected: groupChecks.map((c) => ({ target_url: c.target_url, name: c.name })),
      probableCause: suggestion,
      checklist: checklistForKey(suggestionKey),
      probableFiles: Array.from(allFiles),
    });
  }
  return result;
}
