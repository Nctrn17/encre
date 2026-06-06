/**
 * Scraper Festival du Cinéma Européen de Lille — concours de scénarios.
 *
 * Source : https://eurofilmfest-lille.com/concours-scenarios/
 * CMS : WordPress (page server-rendered HTML).
 *
 * Le festival opère 2 concours scénario distincts :
 *   1. Courts métrages
 *   2. Séries (en partenariat avec Série Mania)
 *
 * La candidature se fait sur FilmFreeway. Le page web sert de présentation
 * statique ; on l'utilise comme source pour title + description, le LLM
 * d'enrichissement complétera les conditions/calendrier/dossier depuis
 * la même page.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import { extractCleanDescription } from '../lib/clean-description'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'eurofilmfest-lille'

const SOURCE_URL = 'https://eurofilmfest-lille.com/concours-scenarios/'
const FILMFREEWAY_URL = 'https://filmfreeway.com/FestivalduCinemaeuropeen'

const CONTESTS: Array<{
  id: string
  title: string
  /** Mots-clés pour identifier la section dans la page */
  sectionKeywords: RegExp
  disciplineHints: string[]
}> = [
  {
    id: 'courts-metrages',
    title: 'Festival du Cinéma Européen de Lille — Concours de Scénarios Courts Métrages',
    sectionKeywords: /courts?[-\s]m[ée]trages?/i,
    disciplineHints: ['cinema', 'audiovisuel'],
  },
  {
    id: 'series',
    title: 'Festival du Cinéma Européen de Lille — Concours de Scénarios Séries',
    sectionKeywords: /s[ée]ries/i,
    disciplineHints: ['audiovisuel'],
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const r = await fetchWithRetry(SOURCE_URL)
  if (!r.ok) throw new Error(`eurofilmfest-lille HTTP ${r.status}`)
  const html = await r.text()
  const $ = cheerio.load(html)

  // Description partagée entre les deux concours (Courts + Séries) —
  // la page n'a pas de séparation HTML claire entre les deux. Le LLM
  // d'enrich-from-page extraira les détails par concours.
  const fullText = extractCleanDescription($)

  return CONTESTS.map((c) => ({
    external_id: `lille-eurofilmfest-${c.id}`,
    payload: {
      title: c.title,
      description: fullText,
      emitter: 'Festival du Cinéma Européen de Lille',
      url: SOURCE_URL,
      deadline: null,
      amount_text: null,
      discipline_hints: c.disciplineHints,
      region_hint: 'FR-HDF', // Hauts-de-France
      raw_json: {
        source_slug: 'eurofilmfest-lille',
        contest_id: c.id,
        submission_url: FILMFREEWAY_URL,
      },
    },
  }))
}
