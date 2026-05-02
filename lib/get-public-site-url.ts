/**
 * Public HTTPS base URL for payment callbacks (Netopia returnUrl / notifyUrl), OAuth, etc.
 * On Vercel previews/production, NEXT_PUBLIC_SITE_URL is sometimes unset; VERCEL_URL is always present.
 */
export function getPublicSiteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '');
    return `https://${host}`;
  }
  return 'http://localhost:3000';
}
