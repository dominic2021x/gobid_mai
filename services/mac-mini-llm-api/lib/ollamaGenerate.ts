export function ollamaGenerateUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/api/generate`;
}

/** Mac mini 24GB: 2 modele max — ctx 4096, generare limitată implicit pentru RAM. */
function buildGenerateOptions(numCtxOverride?: number) {
  const num_ctx =
    numCtxOverride ??
    (parseInt(process.env.OLLAMA_NUM_CTX ?? "", 10) || 4096);
  return {
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE ?? "0.7") || 0.7,
    top_p: parseFloat(process.env.OLLAMA_TOP_P ?? "0.9") || 0.9,
    repeat_penalty: parseFloat(process.env.OLLAMA_REPEAT_PENALTY ?? "1.1") || 1.1,
    num_ctx,
    num_predict: parseInt(process.env.OLLAMA_NUM_PREDICT ?? "", 10) || 2048,
  };
}

export async function streamOllamaGenerate(params: {
  ollamaBase: string;
  model: string;
  prompt: string;
  signal: AbortSignal;
  numCtx?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(ollamaGenerateUrl(params.ollamaBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      stream: true,
      options: buildGenerateOptions(params.numCtx),
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  if (!res.body) {
    throw new Error("Ollama response has no body");
  }

  return res.body;
}

export async function generateOllamaNonStream(params: {
  ollamaBase: string;
  model: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<string> {
  const res = await fetch(ollamaGenerateUrl(params.ollamaBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      stream: false,
      options: buildGenerateOptions(),
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as { response?: string };
  return typeof data.response === "string" ? data.response : "";
}
