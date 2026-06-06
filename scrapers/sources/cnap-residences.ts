/**
 * Scraper CNAP — page Résidences arts visuels.
 * Source officielle du CNAP (Centre national des arts plastiques).
 * https://www.cnap.fr
 *
 * Stratégie : lire la page d'index puis chaque fiche résidence.
 * Best-effort au scaffolding — à ajuster après 1er run.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'
import { slugify } from '../../src/lib/utils'

export const slug = 'cnap-residences'

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const url = (config.url as string) || 'https://www.cnap.fr/residences'

  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`CNAP returned ${response.status}`)
  }
  const html = await response.text()
  const $ = cheerio.load(html)

  const items: RawScrapedItem[] = []

  const candidates = [
    '.residence-item',
    '.news-item',
    'article',
    '[class*="residence"]',
  ]

  for (const selector of candidates) {
    const found = $(selector).toArray()
    if (found.length < 2) continue

    for (const el of found) {
      const $el = $(el)
      const title = $el.find('h2, h3, .title').first().text().trim()
      const link = $el.find('a[href]').first().attr('href')
      const description = $el.find('p, .description').first().text().trim()

      if (!title || title.length < 8) continue

      const fullUrl = link ? new URL(link, url).toString() : url
      const externalId = `cnap-${slugify(title).slice(0, 60)}`

      items.push({
        external_id: externalId,
        payload: {
          title,
          description: description || null,
          emitter: 'CNAP',
          url: fullUrl,
          deadline: null,
          amount_text: null,
          region_hint: null,
          discipline_hints: ['arts_visuels', 'arts_plastiques'],
          raw_json: { selector },
        },
      })
    }

    if (items.length >= 2) break
  }

  return dedupByExternalId(items)
}

function dedupByExternalId(items: RawScrapedItem[]): RawScrapedItem[] {
  const seen = new Set<string>()
  const out: RawScrapedItem[] = []
  for (const item of items) {
    if (!seen.has(item.external_id)) {
      seen.add(item.external_id)
      out.push(item)
    }
  }
  return out
}
