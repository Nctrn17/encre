import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // activer quand nécessaire
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.cloudfront.net' },
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production'
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            // Defense-in-depth. 'unsafe-inline' sur script-src est requis par
            // les scripts inline de Next (hydratation/streaming) et les blocs
            // JSON-LD ; on resserre tout le reste (frame-ancestors, object-src,
            // base-uri, form-action) et on force le HTTPS. 'unsafe-eval' n'est
            // ajouté qu'en dev (React l'exige pour ses outils de debug ; jamais
            // en prod).
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ]
  },
  async redirects() {
    // Ancien chemin `/opportunites` renommé en `/aides` (mai 2026) pour
    // s'aligner sur le vocabulaire de recherche réel des utilisateurs.
    // Redirect permanent pour préserver le SEO et ne pas casser les
    // partages, flux RSS/iCal et bookmarks antérieurs.
    return [
      {
        source: '/opportunites',
        destination: '/aides',
        permanent: true,
      },
      {
        source: '/opportunites/:slug*',
        destination: '/aides/:slug*',
        permanent: true,
      },
      {
        source: '/mes-alertes/:id/opportunites',
        destination: '/mes-alertes/:id/aides',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
