import { NextResponse } from 'next/server'
import { notFound } from 'next/navigation'
import { listOpportunities } from '@/features/opportunities/queries'
import { buildIcalCalendar, disciplineSlugFromUrlSlug, disciplineLabel } from '@/lib/calendar-feeds'
import { DISCIPLINE_SLUGS } from '@/lib/discipline-taxonomy'
import { getSiteUrl } from '@/lib/site'

/**
 * GET /api/calendar/[discipline]
 * Calendrier filtré sur une discipline (ex: `cinema`, `arts-visuels`).
 *
 * Le segment accepte aussi un suffixe `.ics` (`/api/calendar/cinema.ics`) pour
 * faciliter l'abonnement depuis les agendas qui exigent une extension visible
 * - il est strippé avant lookup dans la taxonomie.
 *
 * URLs au format slug-tiret (`arts-visuels`), convertis en slug-underscore
 * (`arts_visuels`) pour matcher la taxonomie interne. 404 si discipline inconnue.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 3600

interface RouteContext {
  params: Promise<{ discipline: string }>
}

export async function generateStaticParams() {
  return DISCIPLINE_SLUGS.map((slug) => ({ discipline: slug.replace(/_/g, '-') }))
}

export async function GET(_req: Request, context: RouteContext) {
  const { discipline: rawDiscipline } = await context.params
  // Strip trailing `.ics` if present (Next normalise mais on garde la robustesse).
  const cleaned = rawDiscipline.replace(/\.ics$/i, '')
  const discipline = disciplineSlugFromUrlSlug(cleaned)
  if (!discipline) notFound()

  const siteUrl = getSiteUrl()
  const label = disciplineLabel(discipline)

  const { items } = await listOpportunities({
    disciplines: [discipline],
    limit: 1000,
    includeExpired: false,
  })

  const cal = buildIcalCalendar(items, {
    siteUrl,
    name: `Encre · ${label} · Calendrier`,
    description: `Opportunités culturelles francophones en ${label.toLowerCase()} : résidences, bourses, appels à projets.`,
  })

  return new NextResponse(cal.toString(), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="encre-${cleaned}.ics"`,
      'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
