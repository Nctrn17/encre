/**
 * Helper générique pour sources basées sur un (ou plusieurs) sitemap XML
 * + fetch individuel des pages pour extraire titre/description depuis meta tags.
 *
 * Utilisé par : cnc, culture-gouv-catalogue, et toute source qui publie
 * son contenu via un sitemap + meta OpenGraph sur chaque page.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry, sleep } from './fetch-helpers'
import { isAdministrativeNoise } from './admin-noise-filter'
import type { RawScrapedItem } from './types'

export interface SitemapEntry {
  loc: string
  lastmod: string | null
}

export interface SitemapScraperConfig {
  /** Liste des URL de sitemaps à fetcher (peut être 1 ou plusieurs) */
  sitemapUrls: string[]
  /** Filtre : l'URL doit contenir cette sous-chaîne (ex: '/aides-et-financements/') */
  pathFilter: string
  /** Nombre max de pages à fetcher par run (par défaut 50) */
  fetchLimit?: number
  /** Throttle entre requêtes (ms, par défaut 150) */
  throttleMs?: number
  /** Préfixe pour external_id */
  sourceSlug: string
  /** Nom de l'émetteur par défaut */
  emitterName: string
  /** Fonction optionnelle pour dériver des discipline_hints depuis l'URL */
  deriveDisciplineHints?: (url: string) => string[]
  /** Regex optionnel pour extraire un ID stable de l'URL (group 1 = id) */
  externalIdRegex?: RegExp
  /**
   * Filtre additionnel appliqué APRÈS pathFilter, sur l'URL complète.
   * Permet par exemple de skipper des sous-chemins hors scope V1
   * (musique, danse, patrimoine…) avant fetch HTTP. Économise quota
   * Gemini en aval (les opps non scrapées ne déclenchent pas de
   * classification LLM).
   */
  additionalFilter?: (url: string) => boolean
}

/**
 * Exécute un scrape sitemap-based complet.
 */
export async function scrapeFromSitemaps(
  config: SitemapScraperConfig,
): Promise<RawScrapedItem[]> {
  const fetchLimit = config.fetchLimit ?? 50
  const throttleMs = config.throttleMs ?? 150

  // 1. Fetch tous les sitemaps et fusionner
  const allEntries: SitemapEntry[] = []
  for (const url of config.sitemapUrls) {
    try {
      const resp = await fetchWithRetry(url)
      if (!resp.ok) continue
      const xml = await resp.text()
      allEntries.push(...parseSitemapEntries(xml))
    } catch (err) {
      console.warn(`[sitemap] skip ${url}: ${(err as Error).message}`)
    }
  }

  // 2. Filtrer
  const filtered = allEntries.filter((e) => {
    if (!e.loc.includes(config.pathFilter)) return false
    if (config.additionalFilter && !config.additionalFilter(e.loc)) return false
    return true
  })

  // 3. Trier par lastmod desc
  filtered.sort((a, b) => {
    const da = a.lastmod ? new Date(a.lastmod).getTime() : 0
    const db = b.lastmod ? new Date(b.lastmod).getTime() : 0
    return db - da
  })

  // 4. Dédupliquer par URL
  const seen = new Set<string>()
  const uniqueEntries: SitemapEntry[] = []
  for (const e of filtered) {
    if (!seen.has(e.loc)) {
      seen.add(e.loc)
      uniqueEntries.push(e)
    }
  }

  // 5. Fetch les N plus récentes
  const toFetch = uniqueEntries.slice(0, fetchLimit)
  const items: RawScrapedItem[] = []
  let skippedAdmin = 0

  for (const entry of toFetch) {
    try {
      const resp = await fetchWithRetry(entry.loc)
      if (!resp.ok) continue
      const html = await resp.text()
      const payload = extractMetaFromDetail(html)
      if (!payload) continue

      // Filtre du bruit administratif (décisions, nominations, PV, etc.)
      if (isAdministrativeNoise(payload.title, payload.description)) {
        skippedAdmin++
        continue
      }

      const externalId = buildExternalId(entry.loc, config)
      items.push({
        external_id: externalId,
        payload: {
          title: payload.title,
          description: payload.description,
          emitter: config.emitterName,
          url: entry.loc,
          deadline: null,
          amount_text: null,
          discipline_hints: config.deriveDisciplineHints?.(entry.loc) ?? [],
          region_hint: null,
          raw_json: {
            source_slug: config.sourceSlug,
            url_path: safeUrlPath(entry.loc),
            lastmod: entry.lastmod,
          },
        },
      })
    } catch (err) {
      console.warn(`[sitemap] fetch failed ${entry.loc}: ${(err as Error).message}`)
    }
    await sleep(throttleMs)
  }

  if (skippedAdmin > 0) {
    console.log(`[sitemap] ${skippedAdmin} item(s) filtré(s) (bruit admin)`)
  }

  return items
}

// ==========================================================================
// Parse sitemap XML (streaming friendly)
// ==========================================================================

export function parseSitemapEntries(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = []
  const urlRegex = /<url>([\s\S]*?)<\/url>/g
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1]
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/)
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/)
    if (locMatch) {
      entries.push({
        loc: decodeEntities(locMatch[1].trim()),
        lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
      })
    }
  }

  return entries
}

// ==========================================================================
// Extract meta from HTML page (og:title, og:description)
// ==========================================================================

interface MetaExtract {
  title: string
  description: string | null
}

export function extractMetaFromDetail(html: string): MetaExtract | null {
  const $ = cheerio.load(html)

  const ogTitle = decodeEntities($('meta[property="og:title"]').attr('content') ?? '')
  const twitterTitle = decodeEntities($('meta[name="twitter:title"]').attr('content') ?? '')
  const pageTitle = $('title').first().text().trim()
  const h1 = $('h1').first().text().trim()

  // Nettoie les suffixes génériques "| Site" ou " — Site"
  const title = (ogTitle || twitterTitle || h1 || pageTitle || '')
    .replace(/\s*[|—-]\s*[^|—-]*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title || title.length < 5) return null

  const ogDesc = decodeEntities($('meta[property="og:description"]').attr('content') ?? '')
  const metaDesc = decodeEntities($('meta[name="description"]').attr('content') ?? '')
  const description = (ogDesc || metaDesc || '').replace(/\s+/g, ' ').trim().slice(0, 2000)

  return { title, description: description || null }
}

// ==========================================================================
// Helpers
// ==========================================================================

function buildExternalId(url: string, config: SitemapScraperConfig): string {
  if (config.externalIdRegex) {
    const m = url.match(config.externalIdRegex)
    if (m?.[1]) return `${config.sourceSlug}-${m[1]}`
  }
  return `${config.sourceSlug}-${hashShort(url)}`
}

function decodeEntities(s: string): string {
  if (!s) return ''
  return cheerio.load(`<div>${s}</div>`)('div').text().trim()
}

function safeUrlPath(raw: string): string {
  try {
    return new URL(raw).pathname
  } catch {
    return raw
  }
}

function hashShort(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 12)
}
