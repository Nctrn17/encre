import { NextResponse } from 'next/server'
import { listOpportunities } from '@/features/opportunities/queries'
import { buildIcalCalendar } from '@/lib/calendar-feeds'
import { getSiteUrl } from '@/lib/site'

/**
 * GET /api/calendar.ics
 * Calendrier global : toutes les opportunités actives, toutes disciplines.
 *
 * Caché 1h côté CDN (s-maxage=3600). Le scrape étant quotidien, plus court
 * serait du gaspillage de bande, plus long ferait passer des deadlines à côté.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export async function GET() {
  const siteUrl = getSiteUrl()

  const { items } = await listOpportunities({
    limit: 1000,
    includeExpired: false,
  })

  const cal = buildIcalCalendar(items, {
    siteUrl,
    name: 'Encre · Calendrier des opportunités culturelles',
    description:
      'Toutes les opportunités culturelles francophones avec date limite : appels à projets, résidences, bourses, prix.',
  })

  return new NextResponse(cal.toString(), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="encre-calendar.ics"',
      'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
