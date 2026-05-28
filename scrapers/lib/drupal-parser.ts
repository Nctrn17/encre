/**
 * Parser générique Drupal 8 pour pages de listing d'aides culturelles.
 *
 * Le CMS Drupal 8 est dominant dans l'écosystème institutionnel FR
 * (CNC, CNL, CNAP, CNM, culture.gouv, DRAC). Les structures HTML varient mais
 * suivent toutes le pattern "liste de <article>" avec des classes CSS
 * identifiables. Ce parser prend une config de sélecteurs et retourne une
 * liste de RawScrapedItem normalisés.
 *
 * Usage :
 *   const items = parseDrupalListing(html, baseUrl, {
 *     itemSelector: 'article.aid-teaser',
 *     titleSelector: '.row-title',
 *     linkSelector: 'a[href]',
 *     subtitleSelector: '.field-subtitle',
 *     categoriesSelector: '.category-item',
 *     externalIdAttribute: 'data-history-node-id',
 *   })
 */

import * as cheerio from 'cheerio'
import type { RawScrapedItem } from './types'
import { slugify } from '../../src/lib/utils'
import { isAdministrativeNoise } from './admin-noise-filter'

export interface DrupalListingConfig {
  /** Sélecteur CSS pour chaque item (ex: 'article.aid-teaser') */
  itemSelector: string
  /** Sélecteur du titre à l'intérieur d'un item */
  titleSelector: string
  /** Sélecteur du lien vers la page détail */
  linkSelector: string
  /** Sélecteur d'un sous-titre / chapo (optionnel) */
  subtitleSelector?: string
  /** Sélecteur des catégories/tags (multiple, optionnel) */
  categoriesSelector?: string
  /** Attribut HTML qui contient un ID stable (ex: 'data-history-node-id') */
  externalIdAttribute?: string
  /** Source slug pour préfixer external_id */
  sourceSlug: string
  /** Nom de l'émetteur (ex: 'Centre national du livre') */
  emitterName: string
  /** Hints de disciplines par défaut pour aider la classification */
  disciplineHints?: string[]
  /** Filtre minimum : item ignoré si le titre contient un des mots-clés (anti-bruit) */
  titleBlocklist?: string[]
  /** Filtre minimum : item inclus seulement si le titre contient au moins un mot-clé */
  titleAllowlist?: string[]
}

export function parseDrupalListing(
  html: string,
  baseUrl: string,
  config: DrupalListingConfig,
): RawScrapedItem[] {
  const $ = cheerio.load(html)
  const items: RawScrapedItem[] = []
  const seenIds = new Set<string>()

  $(config.itemSelector).each((_, el) => {
    const $el = $(el)

    // Titre
    const title = normalizeText($el.find(config.titleSelector).first().text())
    if (!title || title.length < 3) return

    // Filtrage allowlist/blocklist
    if (config.titleBlocklist?.some((kw) => title.toLowerCase().includes(kw.toLowerCase()))) return
    if (
      config.titleAllowlist &&
      !config.titleAllowlist.some((kw) => title.toLowerCase().includes(kw.toLowerCase()))
    ) {
      return
    }

    // Sous-titre extrait tôt pour pouvoir filtrer dessus aussi
    const subtitlePreview = config.subtitleSelector
      ? $el.find(config.subtitleSelector).first().text().trim()
      : ''

    // Bruit administratif (procès-verbaux, nominations, etc.)
    if (isAdministrativeNoise(title, subtitlePreview)) return

    // URL
    const relativeLink = $el.find(config.linkSelector).first().attr('href')
    if (!relativeLink) return
    const url = resolveUrl(relativeLink, baseUrl)

    // Sous-titre (descriptif court)
    const subtitle = config.subtitleSelector
      ? normalizeText($el.find(config.subtitleSelector).first().text())
      : null

    // Catégories
    const categories = config.categoriesSelector
      ? $el
          .find(config.categoriesSelector)
          .toArray()
          .map((c) => normalizeText($(c).text()))
          .filter(Boolean)
      : []

    // External ID stable
    const nodeId = config.externalIdAttribute ? $el.attr(config.externalIdAttribute) : null
    const externalId = nodeId
      ? `${config.sourceSlug}-node-${nodeId}`
      : `${config.sourceSlug}-${slugify(title).slice(0, 60)}`

    if (seenIds.has(externalId)) return
    seenIds.add(externalId)

    const description = [subtitle, categories.length ? `Catégories : ${categories.join(', ')}` : null]
      .filter(Boolean)
      .join('\n\n')

    items.push({
      external_id: externalId,
      payload: {
        title,
        description: description || null,
        emitter: config.emitterName,
        url,
        deadline: null, // à extraire d'une 2e passe sur la page détail (v2)
        amount_text: null,
        discipline_hints: config.disciplineHints ?? [],
        region_hint: null,
        raw_json: {
          source_slug: config.sourceSlug,
          node_id: nodeId ?? undefined,
          categories,
          item_selector_matched: config.itemSelector,
        },
      },
    })
  })

  return items
}

/**
 * Variante avec "enrichissement detail" : après avoir récupéré le listing,
 * fetch la page de chaque item pour en extraire la deadline et la description
 * longue. Coûteux en requêtes (N+1) - à utiliser avec parcimonie.
 *
 * Non utilisé au MVP. Placeholder pour v2.
 */
export interface DrupalDetailConfig {
  deadlineSelector?: string
  deadlineRegex?: RegExp
  descriptionSelector?: string
  amountSelector?: string
  amountRegex?: RegExp
}

export function enrichWithDetail(
  $: cheerio.CheerioAPI,
  config: DrupalDetailConfig,
): { deadline: string | null; description: string | null; amount_text: string | null } {
  let deadline: string | null = null
  let description: string | null = null
  let amountText: string | null = null

  if (config.deadlineSelector) {
    const text = normalizeText($(config.deadlineSelector).first().text())
    if (text) {
      if (config.deadlineRegex) {
        const match = text.match(config.deadlineRegex)
        deadline = match ? match[0] : text
      } else {
        deadline = text
      }
    }
  }

  if (config.descriptionSelector) {
    description = normalizeText($(config.descriptionSelector).first().text()) || null
  }

  if (config.amountSelector) {
    amountText = normalizeText($(config.amountSelector).first().text()) || null
  } else if (config.amountRegex) {
    const match = $.root().text().match(config.amountRegex)
    amountText = match ? match[0] : null
  }

  return { deadline, description, amount_text: amountText }
}

// ==========================================================================
// Helpers
// ==========================================================================

function normalizeText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim()
}

function resolveUrl(link: string, baseUrl: string): string {
  try {
    return new URL(link, baseUrl).toString()
  } catch {
    return link
  }
}
