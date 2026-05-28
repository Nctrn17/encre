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
