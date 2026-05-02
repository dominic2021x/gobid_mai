import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PageTracker from "@/components/PageTracker";
import DeferredAnalytics from "@/components/DeferredAnalytics";
import RemixiconLoader from "@/components/RemixiconLoader";
import BackButtonHandler from "@/components/BackButtonHandler";
import NativePushRegistrar from "@/components/NativePushRegistrar";
import NetopiaTestBanner from "@/components/NetopiaTestBanner";
import ThemeAndPerfBootstrap from "@/components/ThemeAndPerfBootstrap";
import CookieConsentBanner from "@/components/CookieConsentBanner";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "gobid.ro - O platformă 100% românească",
  description: "Platforma ta de încredere pentru licitații online",
  manifest: "/manifest.webmanifest",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION ?? "REPLACE_WITH_GOOGLE_CODE",
  },
  icons: {
    icon: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "gobid",
  },
};

// Font: next/font self-hosts Inter at build (no external CSS request)
const fontInter = Inter({
  subsets: ["latin"],
  display: "swap",
  /** Avoids Firefox “preloaded font unused” on routes that don’t paint text immediately (e.g. /ro). */
  preload: false,
  variable: "--font-inter",
});

// Note: DEV-only "always live" behavior is handled by middleware.ts
// which sets no-cache headers for localhost:3000 only.
// Production uses Next.js default caching optimizations.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro" className={fontInter.variable} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="gobid" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" />
        {/* Hero LCP: HomeHeroServer uses next/image priority+fetchPriority (no global preload — avoids /ro etc. “unused preload” warnings). */}
        {/* Dark mode + low-performance: applied in ThemeAndPerfBootstrap after hydration to avoid React 418 in WebView/Capacitor */}
        {/* Preconnect doar pentru origini critice (PageSpeed: max 4; fonturile erau „nefolosite” pe /ro) */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin} crossOrigin="" />
        )}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        {/* Remixicon: încărcat async de RemixiconLoader (nu preload – evită blocarea LCP) */}
      </head>
      <body className={`app-root ${fontInter.className}`} suppressHydrationWarning>
        <div id="app-content">
          <ThemeAndPerfBootstrap />
          <NetopiaTestBanner />
          <PageTracker />
          <BackButtonHandler />
          <NativePushRegistrar />

          <RemixiconLoader />
          {children}
          {/* Chat Widgets - Client Components */}
          {/* <ChatWidgetsWrapper /> */}

          <CookieConsentBanner />
          <DeferredAnalytics />
        </div>
      </body>
    </html>
  );
}