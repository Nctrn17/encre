/**
 * Scraper CNM — Centre national de la musique.
 *
 * Source : https://cnm.fr/aides-financieres/
 * CMS : WordPress (Gutenberg avec block editor Interactivity API).
 *
 * Stratégie : le HTML est rendu en JS côté client → non scrapable statiquement.
 * Heureusement, WordPress expose l'API REST : /wp-json/wp/v2/aide
 *
 * Retourne jusqu'à 100 aides avec titre, extrait, contenu, dates.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import { isAdministrativeNoise } from '../lib/admin-noise-filter'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'cnm'

const API_URL = 'https://cnm.fr/wp-json/wp/v2/aide'

interface WpAide {
  id: number
  date: string
  modified: string
  slug: string
  status: string
  type: string
  link: string
  title: { rendered: string }
  excerpt: { rendered: string }
  content: { rendered: string }
}

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const perPage = (config.per_page as number) || 100
  const url = `${API_URL}?per_page=${perPage}&status=publish`

  const resp = await fetchWithRetry(url)
  if (!resp.ok) {
    throw new Error(`CNM API returned ${resp.status}`)
  }
  const aides = (await resp.json()) as WpAide[]

  const items: RawScrapedItem[] = []
  for (const aide of aides) {
    if (aide.status !== 'publish') continue

    const title = stripHtml(aide.title.rendered)
    if (!title || title.length < 5) continue

    const excerpt = stripHtml(aide.excerpt.rendered)
    const fullText = stripHtml(aide.content.rendered)
    const description = excerpt || truncate(fullText, 800)

    // Filtre bruit administratif
    if (isAdministrativeNoise(title, description)) continue

    items.push({
      external_id: `cnm-aide-${aide.id}`,
      payload: {
        title,
        description: description || null,
        emitter: 'Centre national de la musique',
        url: aide.link,
        deadline: null, // l'API WP ne retourne pas de deadline structurée, à parser du content v2
        amount_text: extractAmount(fullText),
        discipline_hints: ['musique'],
        region_hint: null,
        raw_json: {
          source_slug: 'cnm',
          wp_id: aide.id,
          wp_slug: aide.slug,
          modified: aide.modified,
        },
      },
    })
  }

  return items
}

/**
 * Retire balises HTML + décode entités + normalise whitespace.
 */
function stripHtml(html: string): string {
  if (!html) return ''
  const $ = cheerio.load(`<div>${html}</div>`)
  return $('div').text().replace(/\s+/g, ' ').trim()
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n).replace(/\s\S*$/, '') + '…'
}

function extractAmount(text: string): string | null {
  const match = text.match(/(\d[\d\s]{2,8}\s*(?:€|EUR|euros?))/i)
  return match ? match[1].trim() : null
}
