import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

/**
 * Encre · robots.txt.
 *
 * Politique :
 *  - Tous les crawlers généralistes : autorisés sauf zones authentifiées.
 *  - Crawlers AI explicitement autorisés (signal positif de consentement à
 *    être cité par ChatGPT, Perplexity, Claude, Google AI Overviews, Bing
 *    Copilot). Encre vit de sa citabilité, pas de pubs : refuser ces bots
 *    serait contre-productif.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  const privatePaths = [
    '/admin',
    '/api',
    '/auth',
    '/onboarding',
    '/mes-alertes',
    '/mes-favoris',
    '/mon-compte',
    '/connexion',
    '/aujourdhui',
  ]

  return {
    rules: [
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'PerplexityBot',
          'Perplexity-User',
          'ClaudeBot',
          'Claude-Web',
          'anthropic-ai',
          'Google-Extended',
          'Applebot-Extended',
          'CCBot',
        ],
        allow: '/',
        disallow: privatePaths,
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: privatePaths,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
