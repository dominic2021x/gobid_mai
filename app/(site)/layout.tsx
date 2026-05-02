import GoogleAdsScript from "@/components/GoogleAdsScript";

/**
 * Public site layout. Sibling to app/admin/ - gtag loads only here (not in admin).
 * Do not add root layout components here (PageTracker, RemixiconLoader, etc.) - they live in app/layout.tsx.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleAdsScript />
      {children}
    </>
  );
}
