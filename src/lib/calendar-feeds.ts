/**
 * Générateurs iCal (RFC 5545) et RSS pour les opportunités.
 *
 * - iCal : `ical-generator`. Chaque deadline = 1 VEVENT all-day, alarme à J−7.
 * - RSS  : `feed`. Items triés par deadline ascendante, sans contenu HTML
 *   (juste titre + lien + descriptif court - les lecteurs RSS afficheront un
 *   teaser sobre).
 *
 * Le fuseau Europe/Paris est porté côté iCal pour que les agendas affichent
 * l'événement le bon jour. Le RSS s'appuie sur les ISO timestamps UTC.
 */

import ical, { ICalCalendarMethod, type ICalCalendar } from 'ical-generator'
import { Feed } from 'feed'
import type { Opportunity } from '@/lib/supabase/types'
import { DISCIPLINE_LABELS, type DisciplineSlug, DISCIPLINE_SLUGS } from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount } from '@/lib/utils'

interface FeedConfig {
  /** Base URL du site, ex `https://encre.io`. */
  siteUrl: string
  /** Titre du calendrier / flux. */
  name: string
  /** Description longue. */
  description: string
  /** ID stable (TZID). */
  uid?: string
}

/**
 * Construit un calendrier iCal à partir d'une liste d'opportunités.
 * Une opp sans `deadline` est ignorée (pas d'événement sans date).
 */
export function buildIcalCalendar(items: Opportunity[], config: FeedConfig): ICalCalendar {
  const cal = ical({
    name: config.name,
    description: config.description,
    timezone: 'Europe/Paris',
    prodId: { company: 'Encre', product: 'Encre Calendar', language: 'FR' },
    method: ICalCalendarMethod.PUBLISH,
    url: `${config.siteUrl}/api/calendar.ics`,
  })

  for (const opp of items) {
    if (!opp.deadline) continue
    const deadline = new Date(opp.deadline)
    if (Number.isNaN(deadline.getTime())) continue

    const region = opp.region_code ? labelForRegion(opp.region_code) : null
    const amount = opp.amount_max != null ? formatAmount(opp.amount_min ?? null, opp.amount_max) : null
    const meta = [opp.emitter, region, amount].filter(Boolean).join(' · ')

    const url = `${config.siteUrl}/aides/${opp.slug}`
    const descLines = [
      `Émetteur : ${opp.emitter}`,
      region ? `Région : ${region}` : null,
      amount ? `Montant : ${amount}` : null,
      `Type : ${humanizeType(opp.type)}`,
      '',
      opp.description?.slice(0, 600) ?? '',
      '',
      `Fiche complète : ${url}`,
      `Source officielle : ${opp.source_url}`,
    ]
      .filter((l) => l !== null)
      .join('\n')

    const event = cal.createEvent({
      id: `opp-${opp.id}@encre.io`,
      start: deadline,
      end: deadline,
      allDay: false,
      summary: `${opp.title} · ${meta}`,
      description: descLines,
      location: region ?? 'France',
      url,
      timezone: 'Europe/Paris',
    })

    // Alarme par défaut : 7 jours avant
    event.createAlarm({
      type: 'display' as never,
      trigger: 7 * 24 * 60 * 60,
      description: `Deadline dans 7 jours : ${opp.title}`,
    })
  }

  return cal
}

/**
 * Construit un flux RSS 2.0 à partir d'une liste d'opportunités.
 * Tri par deadline ascendante (les plus urgentes en haut).
 */
export function buildRssFeed(items: Opportunity[], config: FeedConfig): Feed {
  const feed = new Feed({
    title: config.name,
    description: config.description,
    id: config.siteUrl,
    link: config.siteUrl,
    language: 'fr',
    favicon: `${config.siteUrl}/favicon.ico`,
    copyright: `Encre · Données sous Licence Ouverte 2.0`,
    updated: new Date(),
    feedLinks: {
      rss: `${config.siteUrl}/api/feed.xml`,
    },
  })

  for (const opp of items) {
    if (!opp.deadline) continue
    const deadline = new Date(opp.deadline)
    if (Number.isNaN(deadline.getTime())) continue

    const region = opp.region_code ? labelForRegion(opp.region_code) : null
    const amount = opp.amount_max != null ? formatAmount(opp.amount_min ?? null, opp.amount_max) : null
    const meta = [opp.emitter, region, amount].filter(Boolean).join(' · ')

    feed.addItem({
      title: opp.title,
      id: `${config.siteUrl}/aides/${opp.slug}`,
      link: `${config.siteUrl}/aides/${opp.slug}`,
      description: meta + (opp.description ? ` · ${opp.description.slice(0, 280)}` : ''),
      content: opp.description?.slice(0, 800) ?? meta,
      date: deadline,
      published: deadline,
      author: [{ name: opp.emitter }],
    })
  }

  return feed
}

export function disciplineSlugFromUrlSlug(urlSlug: string): DisciplineSlug | null {
  const candidate = urlSlug.toLowerCase().replace(/-/g, '_')
  return DISCIPLINE_SLUGS.includes(candidate as DisciplineSlug) ? (candidate as DisciplineSlug) : null
}

export function disciplineLabel(slug: DisciplineSlug): string {
  return DISCIPLINE_LABELS[slug]
}

function humanizeType(t: Opportunity['type']): string {
  switch (t) {
    case 'residence':
      return 'résidence'
    case 'subvention':
      return 'subvention'
    case 'bourse':
      return 'bourse'
    case 'commande':
      return 'commande publique'
    case 'concours':
      return 'concours'
    case 'prix':
      return 'prix'
    default:
      return t
  }
}
