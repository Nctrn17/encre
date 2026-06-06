/**
 * Helpers HTTP pour scrapers — timeout, retry, user-agent honnête, throttling
 * par hôte, et respect de robots.txt.
 *
 * Politesse :
 *  - User-Agent identifiable (`encre-bot/0.x` + URL bot + email contact).
 *  - Délai mini entre requêtes au même hôte (default 2000ms), respectant
 *    aussi `Crawl-delay` si déclaré dans robots.txt.
 *  - Vérif robots.txt (cache par hôte). Sur 404/erreur réseau, on fail-open
 *    (autorise par défaut) pour ne pas bloquer scraping en cas de site mal
 *    configuré ; on log un warning. Sur Disallow explicite, on throw.
 *
 * Le throttling et robots peuvent être désactivés par option pour les rares
 * cas (probes ponctuels, audits) où l'on veut bypass.
 */

const BOT_VERSION = '0.1'
const USER_AGENT =
  `encre-bot/${BOT_VERSION} (+https://encre.xyz/bot; contact@encre.xyz)`
const BOT_TOKEN = 'encre-bot' // matché contre `User-agent:` dans robots.txt
const DEFAULT_MIN_DELAY_MS = 2_000

// ── State per host (module-level, vit le temps du process) ──────────────
const hostLastFetchMs = new Map<string, number>()
const hostRobotsRules = new Map<string, RobotsRules | null>() // null = allow-all
const hostRobotsLoading = new Map<string, Promise<RobotsRules | null>>()

interface RobotsRules {
  /** Liste des règles applicables à notre UA (ou * si plus spécifique absent). */
  rules: Array<{ allow: boolean; pathPrefix: string }>
  /** Délai mini entre requêtes (déduit de Crawl-delay), en ms. 0 = pas de directive. */
  crawlDelayMs: number
}

export interface FetchOptions {
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  /** Désactive le throttling par hôte (default: actif, 2000ms). */
  skipHostThrottle?: boolean
  /** Désactive la vérif robots.txt (default: actif). */
  skipRobotsCheck?: boolean
  /** Override du délai mini entre requêtes au même hôte (default 2000ms). */
  minDelayBetweenMs?: number
}

class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url} for ${BOT_TOKEN}`)
    this.name = 'RobotsDisallowedError'
  }
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 15_000,
    retries = 2,
    headers = {},
    skipHostThrottle = false,
    skipRobotsCheck = false,
    minDelayBetweenMs = DEFAULT_MIN_DELAY_MS,
  } = options

  // 1. robots.txt (sauf si bypass explicite ou si on fetch /robots.txt lui-même).
  const parsed = safeParseUrl(url)
  const isRobotsRequest = parsed?.pathname === '/robots.txt'
  if (parsed && !skipRobotsCheck && !isRobotsRequest) {
    const robots = await getRobotsRulesFor(parsed)
    if (robots && !isAllowedByRobots(robots, parsed.pathname)) {
      throw new RobotsDisallowedError(url)
    }
  }

  // 2. Throttle par hôte. Si robots définit un Crawl-delay, prendre le max.
  if (parsed && !skipHostThrottle) {
    const robots = hostRobotsRules.get(parsed.host) ?? null
    const delay = Math.max(minDelayBetweenMs, robots?.crawlDelayMs ?? 0)
    await throttleHost(parsed.host, delay)
  }

  // 3. fetch + retry classique
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          ...headers,
        },
      })
      clearTimeout(timeout)

      if (response.status >= 500 && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`)
        await sleep(500 * (attempt + 1))
        continue
      }
      return response
    } catch (err) {
      clearTimeout(timeout)
      lastError = err
      if (attempt < retries) {
        await sleep(500 * (attempt + 1))
        continue
      }
    }
  }
  throw lastError
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ──────────────────────────────────────────────────────────────────────────
// Throttling par hôte
// ──────────────────────────────────────────────────────────────────────────

async function throttleHost(host: string, minDelayMs: number): Promise<void> {
  if (minDelayMs <= 0) return
  const last = hostLastFetchMs.get(host) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < minDelayMs) {
    await sleep(minDelayMs - elapsed)
  }
  hostLastFetchMs.set(host, Date.now())
}

// ──────────────────────────────────────────────────────────────────────────
// robots.txt — fetch + parse + cache
// ──────────────────────────────────────────────────────────────────────────

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * Récupère (ou met en cache) les règles robots.txt pour l'hôte. Retourne
 * `null` si pas de règles applicables (= autorise tout). Les requêtes
 * concurrentes vers le même hôte partagent la même promesse.
 */
async function getRobotsRulesFor(parsed: URL): Promise<RobotsRules | null> {
  const host = parsed.host
  if (hostRobotsRules.has(host)) return hostRobotsRules.get(host) ?? null
  const inflight = hostRobotsLoading.get(host)
  if (inflight) return inflight

  const promise = loadRobotsForHost(parsed).then((rules) => {
    hostRobotsRules.set(host, rules)
    hostRobotsLoading.delete(host)
    return rules
  })
  hostRobotsLoading.set(host, promise)
  return promise
}

async function loadRobotsForHost(parsed: URL): Promise<RobotsRules | null> {
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`
  try {
    const resp = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!resp.ok) {
      // 404 ou erreur : pas de robots → fail-open silencieux.
      return null
    }
    const text = await resp.text()
    return parseRobotsForUserAgent(text, BOT_TOKEN)
  } catch (err) {
    console.warn(
      `[fetch-helpers] robots.txt fetch failed pour ${robotsUrl} : ${(err as Error).message}`,
    )
    return null
  }
}

/**
 * Parser robots.txt minimal mais correct pour la spec courante :
 *  - sélectionne le bloc User-agent matchant `botToken` (case-insensitive,
 *    match si la ligne UA est `botToken*` ou un prefix), sinon retombe
 *    sur le bloc `*` si présent
 *  - récupère Disallow / Allow (préfixes de path, comparaison string)
 *  - récupère Crawl-delay (en secondes, converti en ms)
 *
 * Convention de matching : la règle la plus longue gagne (cf. spec Google).
 * Allow l'emporte sur Disallow à longueur égale.
 */
export function parseRobotsForUserAgent(text: string, botToken: string): RobotsRules | null {
  const lines = text.split(/\r?\n/)
  const blocks: Array<{ uas: string[]; rules: RobotsRules['rules']; crawlDelayMs: number }> = []
  let current: { uas: string[]; rules: RobotsRules['rules']; crawlDelayMs: number } | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const directive = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()

    if (directive === 'user-agent') {
      // Une nouvelle UA déclarée après des règles ouvre un nouveau bloc.
      if (!current || current.rules.length || current.crawlDelayMs > 0) {
        current = { uas: [], rules: [], crawlDelayMs: 0 }
        blocks.push(current)
      }
      current.uas.push(value.toLowerCase())
    } else if (current && (directive === 'disallow' || directive === 'allow')) {
      // Disallow vide = autorise tout (convention robots).
      if (directive === 'disallow' && value === '') continue
      current.rules.push({ allow: directive === 'allow', pathPrefix: value })
    } else if (current && directive === 'crawl-delay') {
      const seconds = Number.parseFloat(value)
      if (Number.isFinite(seconds) && seconds > 0) {
        current.crawlDelayMs = Math.round(seconds * 1000)
      }
    }
  }

  const tokenLower = botToken.toLowerCase()
  // Bloc spécifique à notre UA = priorité absolue (spec Google).
  const specific = blocks.find((b) => b.uas.some((ua) => ua === tokenLower || ua.startsWith(tokenLower)))
  if (specific) return { rules: specific.rules, crawlDelayMs: specific.crawlDelayMs }
  const wildcard = blocks.find((b) => b.uas.includes('*'))
  if (wildcard) return { rules: wildcard.rules, crawlDelayMs: wildcard.crawlDelayMs }
  return null
}

/**
 * Évalue si `path` est autorisé selon les règles. Spec Google :
 *   - règle la plus longue gagne
 *   - en cas d'égalité de longueur, Allow l'emporte sur Disallow
 *   - aucune règle matchée = autorisé
 */
export function isAllowedByRobots(rules: RobotsRules, path: string): boolean {
  let bestLen = -1
  let bestAllow: boolean | null = null
  for (const rule of rules.rules) {
    if (!rule.pathPrefix) continue
    if (!path.startsWith(rule.pathPrefix)) continue
    if (
      rule.pathPrefix.length > bestLen ||
      (rule.pathPrefix.length === bestLen && rule.allow && bestAllow === false)
    ) {
      bestLen = rule.pathPrefix.length
      bestAllow = rule.allow
    }
  }
  return bestAllow ?? true
}

// ──────────────────────────────────────────────────────────────────────────
// Test helpers (utilisés par tests/fetch-helpers.test.ts)
// ──────────────────────────────────────────────────────────────────────────

function _resetFetchHelpersStateForTests(): void {
  hostLastFetchMs.clear()
  hostRobotsRules.clear()
  hostRobotsLoading.clear()
}
