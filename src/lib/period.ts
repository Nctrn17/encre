/**
 * Parser de période FR pour les routes calendrier `/calendrier/[periode]`.
 *
 * Formats acceptés (slugs URL, tous en minuscules, sans accents) :
 *   - Mois  : `2026-06`
 *   - Année : `2026`
 *   - Saison : `printemps-2026`, `ete-2026`, `automne-2026`, `hiver-2026`
 *
 * Convention saison (hémisphère nord, pratique éditoriale FR) :
 *   - printemps : 1er mars  → 31 mai
 *   - été       : 1er juin  → 31 août
 *   - automne   : 1er sept. → 30 nov.
 *   - hiver     : 1er déc.  → 28/29 fév. de l'année suivante
 *
 * Toutes les dates sont des bornes UTC inclusives sur la journée :
 *   - `start` = début de la première journée à 00:00:00.000Z
 *   - `end`   = fin de la dernière journée à 23:59:59.999Z
 *
 * Le tri/filtrage côté Supabase se fait sur le champ `deadline` (timestamptz),
 * donc les bornes UTC suffisent. On ne gère pas le fuseau Europe/Paris ici :
 * les rares deadlines à minuit Paris début/fin de mois resteront du bon côté
 * de la borne dans 99% des cas, et l'écart d'1h n'a pas d'impact métier.
 */

export type PeriodKind = 'month' | 'year' | 'season'

export type Season = 'printemps' | 'ete' | 'automne' | 'hiver'

export interface ParsedPeriod {
  kind: PeriodKind
  /** Slug URL (entrée d'origine, normalisé). */
  slug: string
  /** Borne basse incluse (UTC). */
  start: Date
  /** Borne haute incluse (UTC). */
  end: Date
  /** Année principale (pour saison hiver = année du décembre). */
  year: number
  /** Mois (1-12) si kind === 'month', sinon null. */
  month: number | null
  /** Saison si kind === 'season', sinon null. */
  season: Season | null
  /** Libellé humain ("Juin 2026", "Été 2026", "2026"). */
  label: string
}

const MONTH_LABELS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const

const SEASON_LABELS_FR: Record<Season, string> = {
  printemps: 'Printemps',
  ete: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const YEAR_RE = /^\d{4}$/
const SEASON_RE = /^(printemps|ete|automne|hiver)-(\d{4})$/

function startOfDayUTC(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0))
}

function endOfDayUTC(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999))
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  // Day 0 of next month = last day of current month.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Parse un slug de période. Retourne `null` si invalide.
 * Garantit que les slugs valides sont dans la liste des slugs acceptés.
 */
export function parsePeriodSlug(raw: string): ParsedPeriod | null {
  if (typeof raw !== 'string') return null
  const slug = raw.toLowerCase().trim()
  if (!slug) return null

  // ── Mois : 2026-06 ────────────────────────────────────────────
  const monthMatch = slug.match(MONTH_RE)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2]) // 1-12
    const monthIndex = month - 1
    if (year < 2020 || year > 2100) return null

    return {
      kind: 'month',
      slug,
      start: startOfDayUTC(year, monthIndex, 1),
      end: endOfDayUTC(year, monthIndex, lastDayOfMonth(year, monthIndex)),
      year,
      month,
      season: null,
      label: `${MONTH_LABELS_FR[monthIndex]} ${year}`,
    }
  }

  // ── Année : 2026 ──────────────────────────────────────────────
  if (YEAR_RE.test(slug)) {
    const year = Number(slug)
    if (year < 2020 || year > 2100) return null
    return {
      kind: 'year',
      slug,
      start: startOfDayUTC(year, 0, 1),
      end: endOfDayUTC(year, 11, 31),
      year,
      month: null,
      season: null,
      label: String(year),
    }
  }

  // ── Saison : ete-2026 / hiver-2026 / etc. ────────────────────
  const seasonMatch = slug.match(SEASON_RE)
  if (seasonMatch) {
    const season = seasonMatch[1] as Season
    const year = Number(seasonMatch[2])
    if (year < 2020 || year > 2100) return null

    let start: Date
    let end: Date
    switch (season) {
      case 'printemps':
        start = startOfDayUTC(year, 2, 1) // mars
        end = endOfDayUTC(year, 4, 31) // mai
        break
      case 'ete':
        start = startOfDayUTC(year, 5, 1) // juin
        end = endOfDayUTC(year, 7, 31) // août
        break
      case 'automne':
        start = startOfDayUTC(year, 8, 1) // sept
        end = endOfDayUTC(year, 10, 30) // nov
        break
      case 'hiver':
        start = startOfDayUTC(year, 11, 1) // déc année N
        end = endOfDayUTC(year + 1, 1, lastDayOfMonth(year + 1, 1)) // fév année N+1
        break
    }

    return {
      kind: 'season',
      slug,
      start,
      end,
      year,
      month: null,
      season,
      label: `${SEASON_LABELS_FR[season]} ${year}`,
    }
  }

  return null
}

/**
 * Liste tous les slugs à pré-générer (`generateStaticParams`).
 * Centré sur l'année courante : 12 mois glissants (passés + futurs)
 * + 4 saisons année courante + 4 saisons année suivante
 * + années courante / suivante / précédente.
 *
 * Total ~24 slugs.
 */
export function listStaticPeriodSlugs(now: Date = new Date()): string[] {
  const slugs: string[] = []
  const year = now.getUTCFullYear()
  const monthIndex = now.getUTCMonth() // 0-11

  // 12 mois glissants : 6 passés + courant + 5 futurs
  for (let offset = -6; offset <= 5; offset += 1) {
    const d = new Date(Date.UTC(year, monthIndex + offset, 1))
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    slugs.push(`${y}-${m}`)
  }

  // 3 années : précédente, courante, suivante
  for (const y of [year - 1, year, year + 1]) {
    slugs.push(String(y))
  }

  // 4 saisons × 2 années (courante + suivante)
  const seasons: Season[] = ['printemps', 'ete', 'automne', 'hiver']
  for (const y of [year, year + 1]) {
    for (const s of seasons) {
      slugs.push(`${s}-${y}`)
    }
  }

  return slugs
}

/**
 * Période courante (mois en cours), utilisée comme défaut pour la nav et
 * pour les redirections par défaut depuis `/calendrier`.
 */
export function currentMonthSlug(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Slug du mois précédent / suivant (pour la nav période).
 */
export function siblingMonthSlug(periode: ParsedPeriod, direction: -1 | 1): string | null {
  if (periode.kind !== 'month' || periode.month == null) return null
  const newDate = new Date(Date.UTC(periode.year, periode.month - 1 + direction, 1))
  const y = newDate.getUTCFullYear()
  const m = String(newDate.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Indique si la période est entièrement dans le passé (utilisé pour `noindex`).
 */
export function isPeriodFullyPast(periode: ParsedPeriod, now: Date = new Date()): boolean {
  return periode.end.getTime() < now.getTime()
}
