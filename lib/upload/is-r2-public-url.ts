/** True dacă URL-ul este deja pe domeniul R2 configurat. */
export function isUrlHostedOnOurR2(publicUrl: string): boolean {
  const raw = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!raw) return false;
  const base = raw.replace(/\/$/, "");
  return publicUrl.trim().startsWith(base);
}
