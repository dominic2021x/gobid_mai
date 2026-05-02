import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RagDocument } from "./ragNomic";

export function parseRagDocumentsFromBody(body: Record<string, unknown>): RagDocument[] {
  const raw = body.rag_documents;
  if (!Array.isArray(raw)) return [];
  const out: RagDocument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const text =
      typeof o.text === "string"
        ? o.text
        : typeof o.content === "string"
          ? o.content
          : "";
    if (!text.trim()) continue;
    const id = typeof o.id === "string" ? o.id : undefined;
    const embedding =
      Array.isArray(o.embedding) && (o.embedding as unknown[]).every((x) => typeof x === "number")
        ? (o.embedding as number[])
        : undefined;
    out.push({ text, id, embedding });
  }
  return out;
}

export function loadRagDocumentsFromEnvFile(): RagDocument[] {
  const p = process.env.AI_GATEWAY_RAG_JSON_PATH?.trim();
  if (!p) return [];
  try {
    const abs = resolve(process.cwd(), p);
    if (!existsSync(abs)) return [];
    const raw = readFileSync(abs, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    if (j.length > 0 && typeof j[0] === "string") {
      return (j as string[]).map((text, i) => ({ id: String(i), text }));
    }
    return parseRagDocumentsFromBody({ rag_documents: j as unknown[] });
  } catch {
    return [];
  }
}
