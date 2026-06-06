/**
 * Scraper Concours de scénario Moyen métrage — Festival du cinéma de Brive.
 *
 * Source : page collectif Nouvelle-Aquitaine qui annonce le concours
 * annuel. URL change chaque année (suffix /-YYYY/) → on essaie l'année
 * courante puis on fallback sur la liste des concours du collectif.
 *
 * Le concours est annuel (déc-jan), prix 2500€, format moyen métrage
 * 30-59 minutes (fiction, doc, animation, expérimental).
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import { extractCleanDescription } from '../lib/clean-description'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'brive-moyen-metrage'

const COLLECTIF_BASE = 'https://www.festivalscinema-na.com'

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const currentYear = new Date().getFullYear()
  const candidates = [
    `${COLLECTIF_BASE}/concours-de-scenario-moyen-metrage-${currentYear + 1}/`,
    `${COLLECTIF_BASE}/concours-de-scenario-moyen-metrage-${currentYear}/`,
    `${COLLECTIF_BASE}/concours-de-scenario-moyen-metrage-${currentYear - 1}/`,
  ]

  for (const url of candidates) {
    try {
      const r = await fetchWithRetry(url)
      if (!r.ok) continue
      const html = await r.text()
      const item = parsePage(url, html)
      if (item) return [item]
    } catch {
      continue
    }
  }

  console.warn('[brive-moyen-metrage] aucune URL annuelle valide trouvée')
  return []
}

function parsePage(url: string, html: string): RawScrapedItem | null {
  const $ = cheerio.load(html)
  const title = ($('h1').first().text() || $('h2').first().text() || 'Concours scénario Moyen métrage — Brive')
    .replace(/\s+/g, ' ')
    .trim()

  const description = extractCleanDescription($)

  return {
    external_id: 'brive-moyen-metrage-current',
    payload: {
      title,
      description,
      emitter: 'Festival du cinéma de Brive (collectif Nouvelle-Aquitaine)',
      url,
      deadline: null,
      amount_text: '2500€',
      discipline_hints: ['cinema', 'audiovisuel'],
      region_hint: 'FR-NAQ', // Nouvelle-Aquitaine
      raw_json: { source_slug: 'brive-moyen-metrage' },
    },
  }
}
