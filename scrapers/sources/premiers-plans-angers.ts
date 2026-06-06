/**
 * Scraper Festival Premiers Plans d'Angers — appels à scénarios + films.
 *
 * Source : https://www.premiersplans.org/fr/
 * CMS : site PHP custom statique. Pages des appels servies en HTML
 * complet (pas JS-heavy).
 *
 * Premiers Plans est un festival majeur du premier court / premier long
 * en France. Trois appels à candidature distincts par édition annuelle :
 *   1. Appel à films — Compétition officielle
 *   2. Appel à scénarios — Ateliers d'Angers
 *   3. Appel à scénarios — Lecture de courts métrages
 *
 * Particularité : les appels sont **par défaut entre cycles** la majorité
 * de l'année (décembre-mai). Au lieu de skip, on les publie avec un
 * marquage `awaiting_details` (post-process pipeline) pour que les
 * users sachent que ces concours existent et puissent anticiper.
 *
 * Quand un appel rouvre (juin-octobre selon l'appel), la prochaine
 * passe du scraper rafraîchira les détails et le flag pourra être
 * retiré manuellement via /admin/curation.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry, sleep } from '../lib/fetch-helpers'
import { extractCleanDescription } from '../lib/clean-description'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'premiers-plans-angers'

const APPELS = [
  {
    id: 'competition',
    url: 'https://www.premiersplans.org/fr/appel-a-films-selection-officielle',
    fallbackTitle: 'Premiers Plans Angers — Compétition officielle',
  },
  {
    id: 'ateliers',
    url: 'https://www.premiersplans.org/fr/appel-a-scenarios-ateliers-dangers',
    fallbackTitle: "Premiers Plans Angers — Ateliers d'Angers (scénario)",
  },
  {
    id: 'lectures',
    url: 'https://www.premiersplans.org/fr/appel-a-scenarios-lecture-de-courts-metrages',
    fallbackTitle: 'Premiers Plans Angers — Lecture de courts métrages (scénario)',
  },
]

const THROTTLE_MS = 250

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const items: RawScrapedItem[] = []
  for (const appel of APPELS) {
    await sleep(THROTTLE_MS)
    const item = await scrapeAppel(appel)
    if (item) items.push(item)
  }
  return items
}

interface AppelDef {
  id: string
  url: string
  fallbackTitle: string
}

async function scrapeAppel(appel: AppelDef): Promise<RawScrapedItem | null> {
  let html: string
  try {
    const r = await fetchWithRetry(appel.url)
    if (!r.ok) {
      console.warn(`[premiers-plans] ${appel.id} HTTP ${r.status}, skip`)
      return null
    }
    html = await r.text()
  } catch (e) {
    console.warn(`[premiers-plans] ${appel.id} fetch fail: ${(e as Error).message.slice(0, 80)}`)
    return null
  }

  const $ = cheerio.load(html)
  const title = ($('h1').first().text() || $('h2').first().text() || appel.fallbackTitle)
    .replace(/\s+/g, ' ')
    .trim()
    || appel.fallbackTitle

  const description = extractCleanDescription($)

  return {
    external_id: `premiers-plans-${appel.id}`,
    payload: {
      title,
      description,
      emitter: 'Festival Premiers Plans d\'Angers',
      url: appel.url,
      deadline: null,
      amount_text: null,
      discipline_hints: ['cinema', 'audiovisuel'],
      region_hint: 'FR-PDL', // Pays de la Loire
      raw_json: {
        source_slug: 'premiers-plans-angers',
        appel_id: appel.id,
        // Hint pour le post-process : ces opps sont marquées awaiting_details
        // par défaut. Quand l'appel rouvre, l'admin retire le flag via
        // /admin/curation.
        suggest_awaiting_details: true,
      },
    },
  }
}
