/**
 * Scraper SCAM — Brouillon d'un rêve.
 *
 * Source : https://www.lascam.fr/lessentiel/bourses-brouillon-dun-reve/
 * CMS : site custom SCAM. 9 bourses distinctes, une page détail par bourse.
 *
 * Stratégie :
 *   1. Fetch en parallèle les 9 pages détail (slugs connus, stables).
 *   2. Pour chaque page : extraction description, montant, dates de commissions.
 *   3. Une seule opportunity par bourse (pas une par session) — deadline = prochaine
 *      commission future, sessions suivantes listées dans la description.
 *
 * Particularités intéressantes pour notre pilote scénariste :
 *   - 6 commissions/an pour Brouillon d'un rêve Documentaire (cycle le plus dense)
 *   - Ouvert aux non-sociétaires SCAM la première fois → accessibilité hors-réseau
 *   - Montants 2 500-6 000 € cumulables
 *
 * Réf. doc pilote : docs/PILOTE-SCENARISTES.md section 3.1
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../lib/fetch-helpers'
import { isAdministrativeNoise } from '../lib/admin-noise-filter'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'scam-brouillon-dun-reve'

const BASE_URL = 'https://www.lascam.fr'

interface BourseConfig {
  slug: string
  title: string
  disciplineHints: string[]
}

/**
 * Catalogue des 9 bourses Brouillon d'un rêve (réf WebFetch 2026-04-19).
 * Slugs stables — la SCAM ne renomme pas les dispositifs historiques.
 * Si une bourse est ajoutée/retirée, il suffit de modifier cette liste.
 */
const BOURSES: BourseConfig[] = [
  {
    slug: 'brouillon-dun-reve-documentaire',
    title: "Brouillon d'un rêve — Documentaire",
    disciplineHints: ['audiovisuel', 'cinema'],
  },
  {
    slug: 'brouillon-dun-reve-journalisme',
    title: "Brouillon d'un rêve — Journalisme",
    disciplineHints: ['audiovisuel'],
  },
  {
    slug: 'brouillon-dun-reve-sonore',
    title: "Brouillon d'un rêve — Radio / Podcast (Sonore)",
    disciplineHints: ['musique', 'audiovisuel'],
  },
  {
    slug: 'brouillon-dun-reve-litteraire',
    title: "Brouillon d'un rêve — Littéraire",
    disciplineHints: ['litterature'],
  },
  {
    slug: 'brouillon-dun-reve-photographie-et-dessin',
    title: "Brouillon d'un rêve — Photographie et Dessin",
    disciplineHints: ['arts-visuels'],
  },
  {
    slug: 'brouillon-dun-reve-ecritures-et-formes-emergentes',
    title: "Brouillon d'un rêve — Écritures et formes émergentes",
    disciplineHints: ['audiovisuel', 'arts-numeriques'],
  },
  {
    slug: 'brouillon-dun-reve-impact-videastes-du-net',
    title: "Brouillon d'un rêve — Impact (vidéastes du net)",
    disciplineHints: ['audiovisuel'],
  },
  {
    slug: 'bourses-albert-londres',
    title: 'Bourses Albert Londres',
    disciplineHints: ['audiovisuel'],
  },
  {
    slug: 'bourses-pour-la-creation-de-documentaires-audio-france-culture-x-la-scam',
    title: 'Bourses Documentaires audio — France Culture × SCAM',
    disciplineHints: ['musique', 'audiovisuel'],
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

const EMITTER = 'SCAM — Société civile des auteurs multimédia'

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const fetches = BOURSES.map(async (bourse) => {
    const url = `${BASE_URL}/lessentiel/bourses-brouillon-dun-reve/${bourse.slug}/`
    try {
      const resp = await fetchWithRetry(url)
      if (!resp.ok) {
        console.warn(`  [scam] ${bourse.slug}: HTTP ${resp.status}`)
        return null
      }
      const html = await resp.text()
      return { bourse, url, html }
    } catch (err) {
      console.warn(`  [scam] ${bourse.slug}: fetch error ${(err as Error).message}`)
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
      external_id: `scam-bdr-${bourse.slug}`,
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
          source_slug: 'scam-brouillon-dun-reve',
          bourse_slug: bourse.slug,
          all_deadlines: deadlines,
        },
      },
    })
  }

  return items
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers d'extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractDescription($: cheerio.CheerioAPI): string {
  // On tente plusieurs sélecteurs de wrapper de contenu, du plus spécifique au
  // plus générique. On prend le premier paragraphe > 50 chars.
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

  // Fallback : premier paragraphe du body
  const fallback = $('body p')
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, ' ').trim())
    .find((t) => t.length > 60)
  return fallback ? truncate(fallback, 800) : ''
}

function extractAmount($: cheerio.CheerioAPI): string | null {
  const bodyText = $('body').text().replace(/\s+/g, ' ')

  // Pattern "2 500 € à 6 000 €" ou "2 500 à 6 000 €"
  const range = bodyText.match(
    /(\d[\d\s]{1,6})\s*(?:€|EUR|euros?)?\s*(?:à|-|–|—)\s*(\d[\d\s]{1,6})\s*(?:€|EUR|euros?)/i,
  )
  if (range) {
    return `${range[1].trim()} à ${range[2].trim()} €`
  }

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

  // Pattern 1 (prioritaire) : "DD mois YYYY" — e.g. "11 mars 2026"
  const fullPattern =
    /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/gi

  let m: RegExpExecArray | null
  while ((m = fullPattern.exec(bodyText)) !== null) {
    addIsoIfValid(parseInt(m[1], 10), FRENCH_MONTHS[m[2].toLowerCase()], parseInt(m[3], 10))
  }

  // Fallback : si pattern 1 n'a rien donné, tente "Du DD au DD mois" (sans année)
  // → prend DD2 comme jour de clôture, infère année = currentYear si encore futur,
  //   sinon currentYear+1. Utilisé pour bourses avec 1 session annuelle fixe.
  if (dates.length === 0) {
    const rangePattern =
      /du\s+\d{1,2}\s+au\s+(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?!\s+\d{4})/gi

    let r: RegExpExecArray | null
    while ((r = rangePattern.exec(bodyText)) !== null) {
      const day = parseInt(r[1], 10)
      const month = FRENCH_MONTHS[r[2].toLowerCase()]
      if (!month) continue

      // Tente currentYear d'abord, fallback currentYear+1 si déjà passé
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
  // Si pas de date future, on prend la plus récente pour que l'item reste
  // visible avec tag "prochain appel attendu" en front.
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
    parts.push(`Prochaines sessions de dépôt : ${formatted}.`)
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
