import { NextResponse } from 'next/server'
import { listOpportunities } from '@/features/opportunities/queries'
import { buildRssFeed } from '@/lib/calendar-feeds'
import { getSiteUrl } from '@/lib/site'

/**
 * GET /api/feed.xml
 * Flux RSS 2.0 global. Toutes les opportunités actives, triées par deadline
 * ascendante. Utilisé par les lecteurs RSS et les agrégateurs (Feedbin, Inoreader, etc.).
 */

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export async function GET() {
  const siteUrl = getSiteUrl()

  const { items } = await listOpportunities({
    limit: 200,
    includeExpired: false,
  })

  const feed = buildRssFeed(items, {
    siteUrl,
    name: 'Encre · Opportunités culturelles',
    description:
      'Le flux RSS des appels à projets, résidences, bourses et prix en culture francophone. Mise à jour quotidienne.',
  })

  return new NextResponse(feed.rss2(), {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
