/**
 * Scraper CNC — Centre national du cinéma et de l'image animée.
 *
 * Source : https://www.cnc.fr/professionnels/aides-et-financements
 * CMS : Liferay (pas Drupal). La page index charge le contenu en JS,
 * donc impossible à parser statiquement.
 *
 * Stratégie : passer par le sitemap XML (public), filtrer les URLs
 * contenant /aides-et-financements/, puis fetcher les N plus récentes
 * (ordered by lastmod) pour extraire titre + description depuis les
 * meta tags OpenGraph.
 *
 * Volumétrie : ~757 aides référencées dans le sitemap CNC en avril 2026.
 * On limite à 50 par run pour respecter la politesse HTTP.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry, sleep } from '../lib/fetch-helpers'
import { isAdministrativeNoise, isAdministrativeUrl } from '../lib/admin-noise-filter'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'cnc'

const SITEMAP_URL = 'https://www.cnc.fr/sitemap.xml'
const BASE_URL = 'https://www.cnc.fr'
const AIDES_PATH_PREFIX = '/professionnels/aides-et-financements/'

interface SitemapEntry {
  loc: string
  lastmod: string | null
}

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const sitemapUrl = (config.sitemap_url as string) || SITEMAP_URL
  const fetchLimit = (config.fetch_limit as number) || 50
  const throttleMs = (config.throttle_ms as number) || 150

  // 1. Fetch sitemap
  const sitemapResp = await fetchWithRetry(sitemapUrl)
  if (!sitemapResp.ok) {
    throw new Error(`CNC sitemap returned ${sitemapResp.status}`)
  }
  const sitemapXml = await sitemapResp.text()

  // 2. Parse entries
  const entries = parseSitemapEntries(sitemapXml).filter(
    (e) => e.loc.includes(AIDES_PATH_PREFIX) && !isAdministrativeUrl(e.loc),
  )

  // 3. Sort by lastmod desc, take N
  entries.sort((a, b) => {
    const da = a.lastmod ? new Date(a.lastmod).getTime() : 0
    const db = b.lastmod ? new Date(b.lastmod).getTime() : 0
    return db - da
  })
  const recent = entries.slice(0, fetchLimit)

  // 4. For each URL, fetch + extract meta
  const items: RawScrapedItem[] = []
  for (const entry of recent) {
    const fullUrl = entry.loc.startsWith('http') ? entry.loc : `${BASE_URL}${entry.loc}`
    try {
      const resp = await fetchWithRetry(fullUrl)
      if (!resp.ok) continue
      const html = await resp.text()
      const item = extractItemFromDetail(html, fullUrl)
      if (item) items.push(item)
    } catch (err) {
      console.warn(`[cnc] skipped ${fullUrl}: ${(err as Error).message}`)
    }
    await sleep(throttleMs)
  }

  return items
}

// ==========================================================================
// Parse sitemap XML
// ==========================================================================

function parseSitemapEntries(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = []
  const urlRegex = /<url>([\s\S]*?)<\/url>/g
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1]
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/)
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/)
    if (locMatch) {
      entries.push({
        loc: locMatch[1].trim(),
        lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
      })
    }
  }

  return entries
}

// ==========================================================================
// Extract item from detail page HTML
// ==========================================================================

function extractItemFromDetail(html: string, url: string): RawScrapedItem | null {
  const $ = cheerio.load(html)

  // Titre : og:title > <title> > <h1>
  const ogTitle = decodeEntities($('meta[property="og:title"]').attr('content') ?? '')
  const pageTitle = $('title').first().text().trim().replace(/\s*\|\s*CNC.*$/i, '')
  const h1 = $('h1').first().text().trim()
  const title = (ogTitle || h1 || pageTitle || '').replace(/\s+/g, ' ').trim()

  if (!title || title.length < 5) return null

  // Description : og:description > meta description > chapo
  const ogDesc = decodeEntities($('meta[property="og:description"]').attr('content') ?? '')
  const metaDesc = decodeEntities($('meta[name="description"]').attr('content') ?? '')
  const description = (ogDesc || metaDesc || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)

  // Filtre bruit administratif (décisions, nominations, PV, rapports)
  if (isAdministrativeNoise(title, description)) return null

  // External ID depuis le suffix _NNNNNN de l'URL
  const idMatch = url.match(/_(\d{4,})(?:$|\?|\/)/)
  const externalId = idMatch ? `cnc-node-${idMatch[1]}` : `cnc-url-${hashShort(url)}`

  // Discipline hints déduites du path
  const disciplineHints: string[] = []
  if (url.includes('/cinema/')) disciplineHints.push('cinema')
  if (url.includes('/audiovisuel/')) disciplineHints.push('audiovisuel')
  if (url.includes('/jeu-video') || url.includes('/jeux-video')) disciplineHints.push('numerique')
  if (url.includes('/xr') || url.includes('/immersif')) disciplineHints.push('numerique')
  if (disciplineHints.length === 0) {
    disciplineHints.push('cinema', 'audiovisuel')
  }

  return {
    external_id: externalId,
    payload: {
      title,
      description: description || null,
      emitter: 'CNC',
      url,
      deadline: null, // le CNC publie des commissions multiples/an, à parser détail v2
      amount_text: null,
      discipline_hints: disciplineHints,
      region_hint: null,
      raw_json: {
        source_slug: 'cnc',
        url_path: new URL(url).pathname,
      },
    },
  }
}

/**
 * Décode les entités HTML dans une string (extraite via attr() qui ne décode pas).
 * Utilise cheerio comme décodeur le plus robuste.
 */
function decodeEntities(s: string): string {
  if (!s) return ''
  return cheerio.load(`<div>${s}</div>`)('div').text().trim()
}

function hashShort(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 12)
}
