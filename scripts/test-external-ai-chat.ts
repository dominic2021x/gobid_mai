/**
 * Testează același provider LLM ca în chat (Mac mini / EXTERNAL_AI sau OpenAI).
 * Rulează: npx tsx scripts/test-external-ai-chat.ts
 * Env: MAC_MINI_API_URL sau EXTERNAL_AI_API_URL (+ chei opționale), sau OpenAI dacă nu e setat URL extern.
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  console.log("--- Test LLM asistent (getLlmProvider → complete) ---");
  console.log(
    "ASSISTANT_LLM_PROVIDER:",
    process.env.ASSISTANT_LLM_PROVIDER ?? "(auto / nesetat)"
  );
  console.log(
    "MAC_MINI_API_URL / EXTERNAL_AI_API_URL:",
    process.env.MAC_MINI_API_URL?.trim()
      ? "(MAC_MINI setat)"
      : process.env.EXTERNAL_AI_API_URL?.trim()
        ? "(EXTERNAL_AI setat)"
        : "(niciun URL extern — posibil OpenAI)"
  );
  console.log("");

  const { getLlmProvider } = await import("../lib/assistant/llm");
  const llm = getLlmProvider();

  console.log("Trimit mesaj de probă...");
  const t0 = Date.now();

  try {
    const result = await llm.complete({
      messages: [{ role: "user", content: "Răspunde doar cu: OK." }],
      max_tokens: 10,
    });
    const elapsed = Date.now() - t0;
    console.log("");
    console.log("SUCCES în", elapsed, "ms");
    console.log("Răspuns (primele 200 caractere):", (result.text ?? "").trim().slice(0, 200));
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.log("");
    console.log("EROARE după", elapsed, "ms");
    console.log(msg);
    process.exit(1);
  }
}

main();
