/**
 * Scraper Beaumarchais-SACD.
 *
 * Source : https://beaumarchais.asso.fr/
 * CMS : site custom (WordPress-like), une page détail par discipline.
 *
 * 11 bourses d'écriture actives (2026-04-19) :
 *   5 audiovisuelles : court métrage, long métrage, TV, animation TV, fiction sonore
 *   6 spectacle vivant : théâtre, mise en scène théâtre, cirque, danse,
 *                        espace public, spectacle sonore ou musical
 *
 * Particularités :
 *   - **Adhésion SACD non obligatoire** → ouverte aux hors-réseau
 *   - Strictement "émergents" : max 1 œuvre pro antérieure par discipline
 *   - Jamais lauréat Beaumarchais dans la même discipline auparavant
 *   - Pas de limite d'âge / nationalité / résidence
 *   - Montants : 2 000 € (court), 5 000 € (TV), autres à confirmer
 *
 * Ref doc : docs/PILOTE-SCENARISTES.md section 3.1 (Beaumarchais = pépite pilote)
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import { isAdministrativeNoise } from '../lib/admin-noise-filter'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'beaumarchais'

const BASE_URL = 'https://beaumarchais.asso.fr'

interface BourseConfig {
  slug: string
  title: string
  disciplineHints: string[]
  /**
   * `true` si la bourse cible bien les auteurs textuels (scénaristes,
   * auteurs dramatiques, auteurs de fiction sonore). Les bourses pour
   * mise en scène, chorégraphes, compositeurs, circassiens, performeurs
   * de rue restent encodées (pour mémoire et extension future) mais ne
   * sont pas scrapées en V1.
   */
  v1: boolean
}

const BOURSES: BourseConfig[] = [
  // ── Audiovisuel / cinéma (V1) ────────────────────────────────────────
  {
    slug: 'cinema-court-metrage',
    title: 'Beaumarchais-SACD — Cinéma court métrage',
    disciplineHints: ['cinema', 'audiovisuel'],
    v1: true,
  },
  {
    slug: 'cinema-long-metrage',
    title: 'Beaumarchais-SACD — Cinéma long métrage',
    disciplineHints: ['cinema', 'audiovisuel'],
    v1: true,
  },
  {
    slug: 'television',
    title: 'Beaumarchais-SACD — Télévision',
    disciplineHints: ['audiovisuel'],
    v1: true,
  },
  {
    slug: 'animation-television',
    title: 'Beaumarchais-SACD — Animation TV',
    disciplineHints: ['audiovisuel'],
    v1: true,
  },
  {
    slug: 'fiction-sonore',
    title: 'Beaumarchais-SACD — Fiction sonore',
    disciplineHints: ['audiovisuel', 'musique'],
    v1: true,
  },
  // ── Théâtre : écriture seulement (V1) ────────────────────────────────
  {
    slug: 'theatre',
    title: 'Beaumarchais-SACD — Théâtre',
    disciplineHints: ['theatre'],
    v1: true,
  },
  // ── Hors V1 (mise en scène, chorégraphie, compo, performance) ────────
  // Conservés pour mémoire et extension future. Filtrés au runtime.
  {
    slug: 'mise-en-scene-de-theatre',
    title: 'Beaumarchais-SACD — Mise en scène de théâtre',
    disciplineHints: ['theatre'],
    v1: false,
  },
  {
    slug: 'cirque',
    title: 'Beaumarchais-SACD — Cirque',
    disciplineHints: ['cirque'],
    v1: false,
  },
  {
    slug: 'danse',
    title: 'Beaumarchais-SACD — Danse',
    disciplineHints: ['danse'],
    v1: false,
  },
  {
    slug: 'espace-public',
    title: 'Beaumarchais-SACD — Espace public (arts de la rue)',
    disciplineHints: ['theatre', 'cirque'],
    v1: false,
  },
  {
    slug: 'spectacle-sonore-ou-musical',
    title: 'Beaumarchais-SACD — Spectacle sonore ou musical',
    disciplineHints: ['musique', 'theatre'],
    v1: false,
  },
]

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
}

const EMITTER = 'Association Beaumarchais-SACD'

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  // V1 launch : on ne scrape que les bourses qui ciblent les auteurs textuels.
  // Les bourses mise en scène, chorégraphie, composition restent encodées
  // dans BOURSES pour mémoire et pour pouvoir être réactivées en flippant
  // leur flag `v1: false` → true.
  const v1Bourses = BOURSES.filter((b) => b.v1)
  const fetches = v1Bourses.map(async (bourse) => {
    const url = `${BASE_URL}/${bourse.slug}/`
    try {
      const resp = await fetchWithRetry(url)
      if (!resp.ok) {
        console.warn(`  [beaumarchais] ${bourse.slug}: HTTP ${resp.status}`)
        return null
      }
      const html = await resp.text()
      return { bourse, url, html }
    } catch (err) {
      console.warn(`  [beaumarchais] ${bourse.slug}: fetch error ${(err as Error).message}`)
      return null
    }
  })

  const pages = (await Promise.all(fetches)).filter(
    (x): x is { bourse: BourseConfig; url: string; html: string } => x !== null,
  )

  const items: RawScrapedItem[] = []

  for (const { bourse, url, html } of pages) {
    const $ = cheerio.load(html)

    const description = extractDescription($)
    const amountText = extractAmount($)
    const deadlines = extractDeadlines($)
    const nextDeadline = selectNextDeadline(deadlines)

    if (isAdministrativeNoise(bourse.title, description)) continue

    items.push({
      external_id: `beaumarchais-${bourse.slug}`,
      payload: {
        title: bourse.title,
        description: buildFinalDescription(description, deadlines),
        emitter: EMITTER,
        url,
        deadline: nextDeadline,
        amount_text: amountText,
        discipline_hints: bourse.disciplineHints,
        region_hint: null,
        raw_json: {
          source_slug: 'beaumarchais',
          bourse_slug: bourse.slug,
          all_deadlines: deadlines,
          // Flags spécifiques Beaumarchais — utiles pour reclassif Gemma 4 31B
          hint_hors_reseau_friendly: true, // "Adhésion SACD non obligatoire"
          hint_min_films_produits: 0, // "Max 1 œuvre pro antérieure" = débutants OK
        },
      },
    })
  }

  return items
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers d'extraction (pattern partagé avec scam-brouillon-dun-reve.ts —
// à factoriser en scrapers/lib/french-date-extractor.ts si 3e scraper reprend
// la même logique)
// ─────────────────────────────────────────────────────────────────────────────

function extractDescription($: cheerio.CheerioAPI): string {
  const wrappers = ['article', 'main', '.content', '.entry-content', '.page-content']
  for (const wrapper of wrappers) {
    const paragraphs = $(`${wrapper} p`)
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 60)
    if (paragraphs.length > 0) {
      return truncate(paragraphs[0], 800)
    }
  }

  const fallback = $('body p')
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, ' ').trim())
    .find((t) => t.length > 60)
  return fallback ? truncate(fallback, 800) : ''
}

function extractAmount($: cheerio.CheerioAPI): string | null {
  const bodyText = $('body').text().replace(/\s+/g, ' ')

  // Pattern "X 000 € nets par projet" ou "X 000 € par projet"
  const perProject = bodyText.match(
    /(\d[\d\s]{2,6})\s*(?:€|EUR|euros?)\s*(?:nets?)?\s*par\s+(?:projet|laur[éeÉE]at)/i,
  )
  if (perProject) return `${perProject[1].trim()} € nets par projet`

  // Pattern plage "2 500 € à 6 000 €"
  const range = bodyText.match(
    /(\d[\d\s]{1,6})\s*(?:€|EUR|euros?)?\s*(?:à|-|–|—)\s*(\d[\d\s]{1,6})\s*(?:€|EUR|euros?)/i,
  )
  if (range) return `${range[1].trim()} à ${range[2].trim()} €`

  const single = bodyText.match(/(\d[\d\s]{2,6})\s*(?:€|EUR|euros?)/i)
  return single ? `${single[1].trim()} €` : null
}

function extractDeadlines($: cheerio.CheerioAPI): string[] {
  const bodyText = $('body').text()
  const currentYear = new Date().getFullYear()
  const seen = new Set<string>()
  const dates: string[] = []

  const addIsoIfValid = (day: number, month: number, year: number) => {
    if (!month || day < 1 || day > 31) return
    if (year < currentYear || year > currentYear + 3) return
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59+02:00`
    if (seen.has(iso)) return
    seen.add(iso)
    dates.push(iso)
  }

  // Pattern 1 : "DD mois YYYY" (avec année)
  const fullPattern =
    /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/gi

  let m: RegExpExecArray | null
  while ((m = fullPattern.exec(bodyText)) !== null) {
    addIsoIfValid(parseInt(m[1], 10), FRENCH_MONTHS[m[2].toLowerCase()], parseInt(m[3], 10))
  }

  // Fallback : "Du DD au DD mois" sans année → infère currentYear ou currentYear+1
  if (dates.length === 0) {
    const rangePattern =
      /du\s+\d{1,2}\s+au\s+(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?!\s+\d{4})/gi

    let r: RegExpExecArray | null
    while ((r = rangePattern.exec(bodyText)) !== null) {
      const day = parseInt(r[1], 10)
      const month = FRENCH_MONTHS[r[2].toLowerCase()]
      if (!month) continue
      const thisYear = new Date(currentYear, month - 1, day).getTime()
      const year = thisYear > Date.now() ? currentYear : currentYear + 1
      addIsoIfValid(day, month, year)
    }
  }

  return dates.sort()
}

function selectNextDeadline(deadlines: string[]): string | null {
  if (deadlines.length === 0) return null
  const now = Date.now()
  const future = deadlines.filter((d) => new Date(d).getTime() > now)
  return future.length > 0 ? future[0] : deadlines[deadlines.length - 1]
}

function buildFinalDescription(desc: string, deadlines: string[]): string | null {
  if (!desc && deadlines.length === 0) return null

  const parts: string[] = []
  if (desc) parts.push(desc)

  const now = Date.now()
  const futureSessions = deadlines.filter((d) => new Date(d).getTime() > now)
  if (futureSessions.length > 1) {
    const formatted = futureSessions.slice(0, 6).map(formatFrDate).join(', ')
    parts.push(`Prochaines dates : ${formatted}.`)
  }

  return parts.join(' ').slice(0, 2000)
}

function formatFrDate(iso: string): string {
  const d = new Date(iso)
  const monthNames = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ]
  return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n).replace(/\s\S*$/, '') + '…'
}
