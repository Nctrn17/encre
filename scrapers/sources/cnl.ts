/**
 * Scraper CNL — Centre national du livre.
 *
 * Source : https://centrenationaldulivre.fr/aides
 * CMS : Drupal 8, structure bien indexée.
 *
 * Items identifiés via `article.aid-teaser` (swiper slides + carousels).
 * Chaque item pointe vers /aides-financement/<slug>.
 *
 * Limitation v1 : pas d'extraction de deadline (pages CNL listent plusieurs
 * sessions par an, pas une deadline unique). À enrichir en v2 via fetch
 * individuel de chaque page détail.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import { parseDrupalListing, type DrupalListingConfig } from '../lib/drupal-parser'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'cnl'

const DEFAULT_URL = 'https://centrenationaldulivre.fr/aides'

const CNL_CONFIG: DrupalListingConfig = {
  itemSelector: 'article.aid-teaser',
  titleSelector: '.row-title',
  linkSelector: 'a[href]',
  subtitleSelector: '.field-subtitle',
  categoriesSelector: '.category-item',
  externalIdAttribute: 'data-history-node-id',
  sourceSlug: 'cnl',
  emitterName: 'Centre national du livre',
  disciplineHints: ['litterature'],
  // Le listing inclut des items type "FAQ", "Portail des demandes d'aides" qui
  // ne sont pas des aides réelles. On les filtre.
  titleBlocklist: ['portail numérique', 'foire aux questions', 'faq'],
}

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const url = (config.url as string) || DEFAULT_URL

  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`CNL ${url} returned ${response.status}`)
  }
  const html = await response.text()

  const items = parseDrupalListing(html, 'https://centrenationaldulivre.fr', CNL_CONFIG)
  return items
}
