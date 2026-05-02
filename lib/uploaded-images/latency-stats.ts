/** Medie + P95 pentru eșantion de latențe R2 (ms). */
export function computeLatencyAvgAndP95(ms: number[]): {
  avg: number | null;
  p95: number | null;
} {
  if (ms.length === 0) return { avg: null, p95: null };
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const n = sorted.length;
  const p95Idx = Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1));
  return { avg, p95: sorted[p95Idx] };
}
