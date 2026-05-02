const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude mobilpay-card + arc4 din bundle – provoacă "ROOT/node_modules" în webpack
  serverExternalPackages: ['mobilpay-card', 'arc4', 'sharp'],

  // Core optimizations (swcMinify removed – default in Next.js 16)
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Dev: "No sources in source map" in console is a known Turbopack bug for async chunks.
  // Use `npm run dev:webpack` for dev without Turbopack if you want to avoid those warnings.

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["@heroicons/react/24/outline", "@heroicons/react/24/solid"],
    // Dezactivat: pe Vercel provoca ENOENT lstat('.next/lock') după "Traced Next.js server files"
    lockDistDir: false,
  },

  // Exclude cache din bundle serverless (evită depășirea 250 MB pe Vercel)
  outputFileTracingExcludes: {
    '/api/**': ['.next/cache/**'],
    '/**': ['.next/cache/**'],
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    qualities: [75, 90],
    dangerouslyAllowSVG: true,
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },

  // HTTP/2 keepalive for faster repeated requests
  httpAgentOptions: {
    keepAlive: true,
  },

  // Redirect /auctions (sistem vechi, nu mai e funcțional) -> /licitatii-publice
  async redirects() {
    return [
      { source: '/auctions', destination: '/licitatii-publice', permanent: true },
      { source: '/auctions/:id', destination: '/licitatii-publice/:id', permanent: true },
      { source: '/ro/autovehicule/piese-auto/:slug', destination: '/live_bid/:slug', permanent: false },
      { source: '/termeni', destination: '/legal/termeni-si-conditii', permanent: true },
      { source: '/termeni-conditii', destination: '/legal/termeni-si-conditii', permanent: true },
      { source: '/politica-confidentialitate', destination: '/legal/politica-confidentialitate', permanent: true },
      { source: '/politica-cookies', destination: '/legal/politica-cookies', permanent: true },
    ];
  },

  // So that instrumentation.js can use Node built-ins on Vercel (avoid "Can't resolve 'path'")
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals];
      externals.push('path', 'fs');
      config.externals = externals;
    }
    return config;
  },

  // Long-term caching for static assets (PageSpeed: „Folosește perioade eficiente ale memoriei cache”)
  // R2 / Cloudflare Image Resizing (`cdn-cgi/image/*`) is served from the R2 public hostname, not this Next app.
  // Set Cache-Control there (e.g. public, max-age=31536000, immutable) via Cloudflare Cache Rules — see `CDN_IMAGE_RESPONSE_CACHE_CONTROL` in lib/image/cdn.ts.
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(images|fonts|uploads)/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/images/slider/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/icons/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      { source: '/favicon.ico', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, immutable' }] },
      { source: '/netopia-logo.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, immutable' }] },
      { source: '/anpc-sol.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, immutable' }] },
      { source: '/anpc-sal.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, immutable' }] },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
