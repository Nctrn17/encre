/**
 * Scraper RSS générique — paramétrable par config (une instance par DRAC).
 *
 * Parse un flux RSS, filtre par mots-clés, retourne les items "appel"-like.
 */

import Parser from 'rss-parser'
import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'
import { slugify } from '../../src/lib/utils'

const DEFAULT_KEYWORDS = ['appel', 'résidence', 'residence', 'bourse', 'subvention', 'aide']

export const slug = 'drac-rss'

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const feedUrl = config.url as string
  if (!feedUrl) throw new Error('drac-rss: url required in config')

  const keywords = (config.filter_keywords as string[]) || DEFAULT_KEYWORDS
  const sourceSlug = (config.source_slug as string) || `drac-rss-${slugify(feedUrl)}`

  const response = await fetchWithRetry(feedUrl)
  if (!response.ok) {
    throw new Error(`RSS feed ${feedUrl} returned ${response.status}`)
  }
  const xml = await response.text()

  const parser = new Parser()
  const feed = await parser.parseString(xml)

  const items: RawScrapedItem[] = []
  for (const entry of feed.items) {
    const title = entry.title?.trim()
    if (!title) continue

    // Filtre mots-clés sur title + content
    const text = `${title} ${entry.content ?? ''} ${entry.contentSnippet ?? ''}`.toLowerCase()
    const matches = keywords.some((k) => text.includes(k.toLowerCase()))
    if (!matches) continue

    const externalId = entry.guid || entry.link || `${sourceSlug}-${slugify(title).slice(0, 60)}`

    items.push({
      external_id: externalId,
      payload: {
        title,
        description: entry.contentSnippet || entry.content || null,
        emitter: feed.title || null,
        url: entry.link || feedUrl,
        deadline: extractDeadlineHint(entry.contentSnippet || entry.content || ''),
        amount_text: extractAmountHint(entry.contentSnippet || entry.content || ''),
        region_hint: (config.region_hint as string) || null,
        raw_json: {
          guid: entry.guid,
          pubDate: entry.pubDate,
          categories: entry.categories,
        },
      },
    })
  }

  return items
}

function extractDeadlineHint(text: string): string | null {
  // Recherche patterns "avant le", "jusqu'au", "date limite"
  const match = text.match(
    /(?:avant le|jusqu'au|date limite|clôture)\s*:?\s*(\d{1,2}[/\-.\s]\d{1,2}[/\-.\s]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})/i,
  )
  return match ? match[1] : null
}

function extractAmountHint(text: string): string | null {
  const match = text.match(/(\d[\d\s]{2,7}\s*€|\d[\d\s]{2,7}\s*EUR|\d[\d\s]{2,7}\s*euros?)/i)
  return match ? match[1] : null
}
