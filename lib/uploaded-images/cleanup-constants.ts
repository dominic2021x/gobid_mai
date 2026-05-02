/** Rânduri procesate per tick cron (soft-mark și purge). */
export const UPLOADED_IMAGES_CLEANUP_BATCH = 50;

/** Oprește bucla de purge dacă tick-ul depășește (sub maxDuration Vercel 120s). */
export const UPLOADED_IMAGES_CLEANUP_MAX_MS = 100_000;

/**
 * Max apeluri R2 DeleteObject per tick (opțional, apărare quota).
 * Setare env: UPLOADED_IMAGES_R2_DELETE_MAX_PER_TICK (implicit 200). Gol / 0 = fără plafon suplimentar.
 */
export function getR2DeleteMaxPerTick(): number | null {
  const raw = process.env.UPLOADED_IMAGES_R2_DELETE_MAX_PER_TICK?.trim();
  if (raw === undefined || raw === "") return 200;
  if (raw === "0") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 200;
  return n;
}

/**
 * Plafon dinamic (opțional): reduce max delete-uri când timpul rămas din fereastra 100s e mic.
 * UPLOADED_IMAGES_R2_DELETE_DYNAMIC=true — buget ≈ min(base, floor(remainingMs / 500)), min 10.
 */
export function getEffectiveR2DeleteMaxPerTick(startedAtMs: number): number | null {
  const base = getR2DeleteMaxPerTick();
  if (base === null) return null;
  if (process.env.UPLOADED_IMAGES_R2_DELETE_DYNAMIC !== "true") {
    return base;
  }
  const elapsed = Date.now() - startedAtMs;
  const remainingMs = Math.max(0, UPLOADED_IMAGES_CLEANUP_MAX_MS - elapsed);
  const budget = Math.max(10, Math.min(base, Math.floor(remainingMs / 500)));
  return budget;
}
