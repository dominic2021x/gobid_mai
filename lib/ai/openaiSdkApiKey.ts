/**
 * OpenAI SDK throws at construct time if `apiKey` is missing/empty.
 * During `next build` (e.g. Vercel) `OPENAI_API_KEY` is often unset — use this string
 * so `new OpenAI({ apiKey })` in module scope does not crash the build.
 * Route handlers must still check `process.env.OPENAI_API_KEY` before real API calls.
 */
export const OPENAI_SDK_API_KEY =
  process.env.OPENAI_API_KEY?.trim() || "sk-build-time-placeholder-not-used";
