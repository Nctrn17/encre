/**
 * Scraper HTML — Fondation de France, page "Appels à projets".
 *
 * Cheerio + fetch. Fragile face aux changements de structure HTML —
 * surveille `items_found` en métrique (alerte si 0 sur 3 runs).
 *
 * ⚠️ Selecteurs CSS sont un best-effort au scaffolding ; à ajuster
 * une fois qu'on peut tester live sur le vrai site.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'
import { slugify } from '../../src/lib/utils'

export const slug = 'fondation-france-culture'

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const url = (config.url as string) || 'https://www.fondationdefrance.org/fr/appels-a-projets'
  const keywords = (config.filter_keywords as string[]) || ['culture', 'art', 'résidence']

  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`Fondation de France returned ${response.status}`)
  }
  const html = await response.text()
  const $ = cheerio.load(html)

  const items: RawScrapedItem[] = []

  // Best-effort selectors — à ajuster au live
  const candidates = [
    '.call-for-projects',
    '.appel-card',
    'article.appel',
    '[class*="appel"]',
    '.views-row',
    'article',
  ]

  for (const selector of candidates) {
    const found = $(selector).toArray()
    if (found.length < 3) continue // trop peu de matches, probablement mauvais sélecteur

    for (const el of found) {
      const $el = $(el)
      const title = $el.find('h2, h3, .title').first().text().trim()
      const description = $el
        .find('.description, .summary, p')
        .first()
        .text()
        .trim()
      const link = $el.find('a[href]').first().attr('href')

      if (!title || title.length < 10) continue

      // Filter keywords
      const text = `${title} ${description}`.toLowerCase()
      const matches = keywords.some((k) => text.includes(k.toLowerCase()))
      if (!matches) continue

      const fullUrl = link ? new URL(link, url).toString() : url
      const externalId = `fdf-${slugify(title).slice(0, 60)}`

      items.push({
        external_id: externalId,
        payload: {
          title,
          description: description || null,
          emitter: 'Fondation de France',
          url: fullUrl,
          deadline: null, // à extraire du détail sur page dédiée (v2)
          amount_text: extractAmount(text),
          region_hint: null,
          raw_json: { selector, html_snippet: $el.html()?.slice(0, 500) },
        },
      })
    }

    // Si on a trouvé ≥ 3 items avec ce sélecteur, on ne teste pas les suivants
    if (items.length >= 3) break
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

function extractAmount(text: string): string | null {
  const match = text.match(/(\d[\d\s]{2,8}\s*(?:€|EUR|euros?))/i)
  return match ? match[1].trim() : null
}
