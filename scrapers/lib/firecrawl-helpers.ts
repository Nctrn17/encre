/**
 * Helpers Firecrawl - scraping JS-heavy + bypass Cloudflare.
 *
 * Cas d'usage Encre :
 *   - Series Mania Institute (SPA React, contenu chargé en JS)
 *   - ArtCena (protégé Cloudflare, fetch standard reçoit du HTML challenge)
 *   - Sites WordPress avec contenu chargé via JS (rare mais existe)
 *
 * Politique d'usage :
 *   - On essaye TOUJOURS fetch standard d'abord (gratuit, rapide).
 *   - On escalade vers Firecrawl uniquement si fetch retourne du contenu
 *     vide, un challenge Cloudflare, ou un HTML sans le contenu attendu.
 *   - Free tier = 500 crédits/mois. À économiser sur les pages stables.
 *
 * Comportement sans API key : log warning + return null. Les scrapers
 * qui en dépendent doivent gérer ce cas (en général : return [] et
 * documenter que la source est conditionnée à Firecrawl).
 */

import FirecrawlApp from '@mendable/firecrawl-js'

let cachedClient: FirecrawlApp | null = null
let initAttempted = false

/**
 * Retourne un client Firecrawl initialisé, ou null si la clé manque.
 * Mémoïse pour éviter de relire l'env à chaque appel.
 */
function getClient(): FirecrawlApp | null {
  if (initAttempted) return cachedClient
  initAttempted = true

  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.warn(
      '  [firecrawl] FIRECRAWL_API_KEY absent - sources JS-heavy/Cloudflare ignorées',
    )
    return null
  }

  try {
    cachedClient = new FirecrawlApp({ apiKey })
    return cachedClient
  } catch (err) {
    console.warn(`  [firecrawl] init failed: ${(err as Error).message}`)
    return null
  }
}

export interface FirecrawlScrapeResult {
  /** HTML brut rendu après JS execution */
  html: string
  /** Markdown extrait (utile pour parsing texte sans HTML) */
  markdown: string
  /** Métadonnées de la page (title, description, OG, etc.) */
  metadata: Record<string, unknown>
  /** URL finale après redirections */
  url: string
}

/**
 * Scrape une page via Firecrawl.
 *
 * @param url URL absolue à scraper
 * @param options Options Firecrawl (waitFor, onlyMainContent, etc.)
 * @returns Le résultat structuré ou null si Firecrawl indisponible / erreur.
 *
 * Convention : on retourne null plutôt que de throw pour que le scraper
 * appelant puisse gérer le cas « source skippée » sans crash global du
 * batch. Le caller doit décider quoi faire d'un null (skip, retry, etc.).
 */
export async function firecrawlScrape(
  url: string,
  options: {
    /** Attendre N ms que le JS rende avant capture (default 2000) */
    waitForMs?: number
    /** Filtrer au contenu principal (skip nav/footer) - default true */
    onlyMainContent?: boolean
    /** Formats demandés (default html + markdown) */
    formats?: Array<'html' | 'markdown' | 'rawHtml' | 'links' | 'screenshot'>
    /** Timeout total de la requête en ms (default 30000) */
    timeoutMs?: number
  } = {},
): Promise<FirecrawlScrapeResult | null> {
  const client = getClient()
  if (!client) return null

  const {
    waitForMs = 2000,
    onlyMainContent = true,
    formats = ['html', 'markdown'],
    timeoutMs = 30000,
  } = options

  try {
    // L'API firecrawl-js v4 expose `scrape` (sans `Url` suffixe).
    // Le typage exact dépend de la version, on cast au minimum nécessaire.
    const result = await (client as unknown as {
      scrape: (u: string, opts: Record<string, unknown>) => Promise<unknown>
    }).scrape(url, {
      formats,
      onlyMainContent,
      waitFor: waitForMs,
      timeout: timeoutMs,
    })

    const r = result as {
      html?: string
      markdown?: string
      metadata?: Record<string, unknown>
      url?: string
      data?: {
        html?: string
        markdown?: string
        metadata?: Record<string, unknown>
        url?: string
      }
    }
    // L'API peut renvoyer la data soit à plat, soit dans .data - on gère les deux.
    const data = r.data ?? r
    return {
      html: data.html ?? '',
      markdown: data.markdown ?? '',
      metadata: data.metadata ?? {},
      url: data.url ?? url,
    }
  } catch (err) {
    console.warn(
      `  [firecrawl] scrape failed for ${url}: ${(err as Error).message}`,
    )
    return null
  }
}

/**
 * Helper pour stratégie "fetch standard d'abord, Firecrawl en fallback".
 * Évite de cramer les crédits Firecrawl sur des sites qui marchent sans.
 *
 * @param url URL à scraper
 * @param shouldEscalate Callback qui inspecte le HTML standard et décide
 *   si on doit escalader (ex: détection challenge Cloudflare, contenu
 *   manquant, status 403, etc.). Si elle retourne true on appelle Firecrawl.
 * @returns Le HTML final (depuis fetch standard ou Firecrawl), ou null
 *   si les deux ont échoué.
 */
export async function fetchWithFirecrawlFallback(
  url: string,
  shouldEscalate: (html: string, status: number) => boolean,
  options: Parameters<typeof firecrawlScrape>[1] = {},
): Promise<{ html: string; source: 'fetch' | 'firecrawl' } | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; encre-bot/0.1; +https://encre.xyz/sources)',
      },
    })
    const html = resp.ok ? await resp.text() : ''
    if (resp.ok && !shouldEscalate(html, resp.status)) {
      return { html, source: 'fetch' }
    }
    // Escalade Firecrawl
    const fc = await firecrawlScrape(url, options)
    if (fc) return { html: fc.html, source: 'firecrawl' }
    // Si firecrawl indisponible mais qu'on a quand même un HTML standard,
    // on le retourne - le caller décidera s'il est exploitable.
    if (html) return { html, source: 'fetch' }
    return null
  } catch (err) {
    console.warn(`  [fetch-fallback] ${url}: ${(err as Error).message}`)
    // Dernier recours : tenter direct Firecrawl
    const fc = await firecrawlScrape(url, options)
    if (fc) return { html: fc.html, source: 'firecrawl' }
    return null
  }
}

/**
 * Détecteurs courants pour escalation vers Firecrawl.
 * À passer à `fetchWithFirecrawlFallback` selon les cas.
 */
export const escalationDetectors = {
  /**
   * Challenge Cloudflare typique : le HTML mentionne « Just a moment »,
   * « Checking your browser », ou « cf-mitigated ». À utiliser pour ArtCena.
   */
  cloudflareChallenge: (html: string): boolean => {
    const h = html.toLowerCase()
    return (
      h.includes('just a moment') ||
      h.includes('checking your browser') ||
      h.includes('cf-mitigated') ||
      h.includes('cf-chl-bypass')
    )
  },

  /**
   * Contenu vide : page < 5KB OU pas de balise contenu attendue.
   * À utiliser pour SPAs où le shell HTML est minuscule.
   */
  emptyShell: (html: string): boolean => {
    return html.length < 5000 && !html.includes('<article') && !html.includes('<main')
  },

  /**
   * Compose plusieurs détecteurs en OR.
   */
  any: (...detectors: Array<(html: string, status: number) => boolean>) =>
    (html: string, status: number) => detectors.some((d) => d(html, status)),
}
