import { gatewayEmbedModel, gatewayEmbedTimeoutMs, gatewayRagMaxChunks, gatewayRagTopK } from "./config";

export type RagDocument = {
  text: string;
  embedding?: number[];
  id?: string;
};

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d < 1e-12 ? 0 : dot / d;
}

async function ollamaEmbedOne(
  baseUrl: string,
  text: string,
  model: string,
  signal: AbortSignal
): Promise<number[]> {
  if (signal.aborted) return [];
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), gatewayEmbedTimeoutMs());
  const onParentAbort = () => controller.abort();
  signal.addEventListener("abort", onParentAbort, { once: true });
  try {
    const trimmed = text.slice(0, 8000);
    let res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: trimmed }),
      signal: controller.signal,
    });
    if (!res.ok) {
      res = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: trimmed }),
        signal: controller.signal,
      });
    }
    const raw = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return [];
    }
    if (!res.ok) return [];
    const emb = data.embedding;
    if (Array.isArray(emb) && emb.every((x) => typeof x === "number")) {
      return emb as number[];
    }
    const inputs = data.embeddings;
    if (Array.isArray(inputs) && inputs[0] && Array.isArray((inputs[0] as { embedding?: number[] }).embedding)) {
      return (inputs[0] as { embedding: number[] }).embedding;
    }
    return [];
  } finally {
    clearTimeout(t);
    signal.removeEventListener("abort", onParentAbort);
  }
}

async function embedWithConcurrency(
  baseUrl: string,
  items: string[],
  model: string,
  signal: AbortSignal,
  concurrency: number
): Promise<number[][]> {
  const out: number[][] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await ollamaEmbedOne(baseUrl, items[idx], model, signal);
    }
  }
  const n = Math.min(Math.max(1, concurrency), 8);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Construiește bloc de context RAG cu nomic-embed-text (Ollama).
 */
export async function buildRagContextBlock(params: {
  baseUrl: string;
  query: string;
  documents: RagDocument[];
  signal: AbortSignal;
}): Promise<{ context: string; usedChunks: number }> {
  const maxC = gatewayRagMaxChunks();
  const docs = params.documents
    .filter((d) => typeof d.text === "string" && d.text.trim().length > 0)
    .slice(0, maxC);

  if (docs.length === 0) {
    return { context: "", usedChunks: 0 };
  }

  const model = gatewayEmbedModel();
  const queryVec = await ollamaEmbedOne(params.baseUrl, params.query, model, params.signal);
  if (queryVec.length === 0) {
    return { context: "", usedChunks: 0 };
  }

  const needEmbedIdx: number[] = [];
  const vectors: (number[] | null)[] = docs.map((d, i) => {
    if (d.embedding && d.embedding.length === queryVec.length) return d.embedding;
    needEmbedIdx.push(i);
    return null;
  });

  if (needEmbedIdx.length > 0) {
    const texts = needEmbedIdx.map((i) => docs[i].text);
    const embedded = await embedWithConcurrency(
      params.baseUrl,
      texts,
      model,
      params.signal,
      4
    );
    needEmbedIdx.forEach((docIdx, j) => {
      vectors[docIdx] = embedded[j]?.length ? embedded[j] : null;
    });
  }

  const scored = docs
    .map((d, i) => ({
      doc: d,
      score: vectors[i] ? cosine(queryVec, vectors[i]!) : -1,
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, gatewayRagTopK());

  if (scored.length === 0) {
    return { context: "", usedChunks: 0 };
  }

  const lines = scored.map(
    (s, idx) =>
      `[${idx + 1}] (relevanță ${s.score.toFixed(3)})\n${s.doc.text.trim()}`
  );

  const context =
    "### CONTEXT (RAG — folosește doar aceste fragmente când răspunzi)\n\n" +
    lines.join("\n\n---\n\n");

  return { context, usedChunks: scored.length };
}
