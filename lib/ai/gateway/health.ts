export async function gatewayHealthCheck(baseUrl: string): Promise<Record<string, unknown>> {
  const root = baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${root}/api/tags`, { signal: controller.signal });
    let ollama: unknown = null;
    try {
      ollama = await res.json();
    } catch {
      ollama = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      baseUrl: root,
      ollama,
    };
  } catch (e) {
    return {
      ok: false,
      baseUrl: root,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}
