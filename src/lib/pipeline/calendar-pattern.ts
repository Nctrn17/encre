/**
 * Détecteur de pattern de calendrier pour distinguer les cas d'extraction
 * vide ou partielle. Réponse au problème CNC où un calendrier vide pouvait
 * signifier 3 choses différentes (extraction ratée, flux continu, ou cycle
 * non encore annoncé).
 *
 * Fonction PURE — pas d'IO, pas de DB. Prend le texte source de la page
 * + le calendrier déjà extrait par le LLM, renvoie un verdict avec preuve.
 *
 * Le caller décide quoi faire :
 *   - `continuous`         → écraser calendrier par ["Flux continu, pas de commission"]
 *   - `awaiting_next`      → set next_edition_status='awaiting_details'
 *   - `partial_format_c`   → flag pour re-extract (LLM a manqué la 2e ligne)
 *   - `unknown_empty`      → set next_edition_status='awaiting_details' par sécurité
 *   - `ok`                 → ne rien faire
 */

export type CalendarPattern =
  | 'ok'
  | 'partial_format_c'
  | 'continuous'
  | 'awaiting_next'
  | 'unknown_empty'

export interface CalendarPatternResult {
  pattern: CalendarPattern
  /** Bout de texte (source ou item) qui a déclenché le verdict. Pour debug/log. */
  evidence: string | null
}

/** Item canonique à mettre dans `calendrier` quand pattern === 'continuous'. */
export const CONTINUOUS_FLOW_ITEM = 'Flux continu, pas de commission'

// ──────────────────────────────────────────────────────────────────────
// Heuristiques de détection
// ──────────────────────────────────────────────────────────────────────

/**
 * Marqueurs textuels indiquant un fonctionnement « au fil de l'eau ».
 * Doivent apparaître dans la source officielle, pas dans des sections
 * boilerplate (CNIL, RGPD, footer) — la `clean-description` côté scraper
 * est censée déjà les retirer.
 */
const CONTINUOUS_MARKERS: RegExp[] = [
  /\bau fil de l['’]\s*eau\b/i,
  /\bflux\s+continu\b/i,
  /\bd[ée]p[ôo]t\s+continu\b/i,
  /\bcandidatures?\s+continues?\b/i,
  /\bcandidatures?\s+(?:ouvertes?|examin[ée]es?)\s+en\s+continu\b/i,
  /\bpas\s+de\s+date\s+limite\b/i,
  /\bsans\s+date\s+limite\b/i,
  /\baucune\s+date\s+limite\b/i,
  /\bsans\s+(?:appel\s+)?commission\b/i,
  /\bno\s+deadline\b/i,
]

/**
 * Marqueurs indiquant que le cycle suivant n'a pas encore été annoncé.
 * On accepte les variations courantes : "à venir", "prochainement",
 * "non encore publié", etc.
 */
const AWAITING_MARKERS: RegExp[] = [
  /\bprochaine?\s+commission\s+(?:à|a)\s+venir\b/i,
  /\bprochaines?\s+dates?\s+(?:à|a)\s+venir\b/i,
  /\bprochaine?\s+(?:session|édition|edition)\s+(?:à|a)\s+venir\b/i,
  /\bcalendrier\s+(?:\d{4}\s+)?(?:sera|à|a)\s+communiqu[ée]\b/i,
  /\bdates?\s+\d{4}\s+(?:non\s+encore|pas\s+encore)\s+publi[ée]e?s?\b/i,
  /\bdates?\s+\d{4}\s+(?:non\s+encore|pas\s+encore)\s+communiqu[ée]e?s?\b/i,
  /\bmodalit[ée]s?\s+(?:à|a)\s+venir\b/i,
  /\bmodalit[ée]s?\s+prochainement\b/i,
  /(?:cycle|[ée]dition|session)\s+\d{4}\s+(?:cl[ôo]tur[ée]e?|termin[ée]e?|achev[ée]e?)/i,
  /prochaine?\s+[ée]dition\s+en\s+cours\s+de\s+programmation/i,
  /\bcalendrier\s+\d{4}\s+(?:à|a)\s+venir\b/i,
]

/**
 * Marqueur de Format C ligne 1 — quand le LLM extrait juste "N sessions
 * par an[, calendrier annuel récurrent | M calendriers parallèles]" sans
 * la 2e ligne "Clôtures YYYY : …", c'est une extraction tronquée.
 *
 * On matche l'en-tête sur "N sessions par an" : suffisamment spécifique
 * pour ne pas faire de faux positifs, et tolère les deux variantes de
 * suite (singleton "calendrier annuel récurrent" ou multi "M calendriers
 * parallèles").
 */
const FORMAT_C_HEADER = /^\d+\s+sessions?\s+par\s+an\b/i

// ──────────────────────────────────────────────────────────────────────
// API publique
// ──────────────────────────────────────────────────────────────────────

export function detectCalendarPattern(
  sourceText: string | null | undefined,
  calendrier: readonly string[],
): CalendarPatternResult {
  const text = sourceText ?? ''
  const n = calendrier.length

  // 1. Format C partiel : 1 seul item, et c'est l'en-tête sans la ligne dates.
  if (n === 1 && FORMAT_C_HEADER.test(calendrier[0])) {
    return {
      pattern: 'partial_format_c',
      evidence: calendrier[0],
    }
  }

  // 2. Vérifier les marqueurs SOIT dans le texte source SOIT dans les items
  //    eux-mêmes (le LLM peut avoir copié un marqueur dans un item).
  const allHaystacks = [text, ...calendrier]

  // 2a. Continuous (vérifier d'abord — plus spécifique qu'awaiting)
  for (const haystack of allHaystacks) {
    for (const re of CONTINUOUS_MARKERS) {
      const m = haystack.match(re)
      if (m) {
        return { pattern: 'continuous', evidence: m[0] }
      }
    }
  }

  // 2b. Awaiting next cycle
  for (const haystack of allHaystacks) {
    for (const re of AWAITING_MARKERS) {
      const m = haystack.match(re)
      if (m) {
        return { pattern: 'awaiting_next', evidence: m[0] }
      }
    }
  }

  // 3. Calendrier vide sans marqueur explicite : Case A probable.
  if (n === 0) {
    return { pattern: 'unknown_empty', evidence: null }
  }

  // 4. Sinon, tout va bien.
  return { pattern: 'ok', evidence: null }
}

/**
 * Applique le verdict au calendrier extrait. NE TOUCHE PAS à
 * `next_edition_status` (le caller le gère, c'est hors ClassificationOutput).
 *
 * Renvoie un nouveau tableau (immutable). Si pattern === 'ok' ou
 * 'unknown_empty' ou 'partial_format_c' ou 'awaiting_next', le calendrier
 * est laissé tel quel — le caller décidera (re-extract, flag, etc.).
 */
export function applyContinuousFlowOverride(
  calendrier: readonly string[],
  pattern: CalendarPattern,
): string[] {
  if (pattern === 'continuous') {
    return [CONTINUOUS_FLOW_ITEM]
  }
  return [...calendrier]
}

// ──────────────────────────────────────────────────────────────────────
// Synthesizer Format A depuis le pattern « Prochaine date limite de
// dépôt : <liste de dates> » (typique des pages CNC type FAJV).
// ──────────────────────────────────────────────────────────────────────

/**
 * En-tête possible introduisant une liste de dates de dépôt. Couvre les
 * variantes les plus courantes côté CNC, culture.gouv et CNL.
 *
 * Important : la regex n'est PAS ancrée et la détection se fait ligne par
 * ligne (split sur \n). On cherche un en-tête comme :
 *   - « Prochaine date limite de dépôt : »
 *   - « Prochaines dates limites de dépôt »
 *   - « Calendrier des dépôts : »
 *   - « Prochaines clôtures »
 *   - « Dates de dépôt »
 */
const PROCHAINE_DEADLINE_HEADER_RE =
  /(?:prochaines?\s+)?(?:dates?\s+limites?\s+de\s+d[ée]p[ôo]t|d[ée]p[ôo]ts?\s+du\s+dossier|cl[ôo]tures?\s+du\s+d[ée]p[ôo]t|calendrier\s+des\s+d[ée]p[ôo]ts|prochaines?\s+cl[ôo]tures?|dates?\s+de\s+d[ée]p[ôo]t)\s*:?\s*$/i

const FRENCH_MONTHS_LIST = [
  'janvier',
  'février',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
  'decembre',
]

/**
 * Match une ligne de date française au format `[jour-de-la-semaine] J mois YYYY`.
 * Le préfixe jour-de-la-semaine (lundi, mardi…) est optionnel — c'est
 * fréquent sur les pages CNC. Tolère les accents simplifiés (fevrier, aout…).
 */
const FRENCH_DATE_LINE_RE = new RegExp(
  '^(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+)?' +
    '(\\d{1,2})\\s+(' +
    FRENCH_MONTHS_LIST.join('|') +
    ')\\s+(\\d{4})\\s*$',
  'i',
)

interface FrenchDate {
  day: number
  month: string
  year: number
}

function normalizeMonth(m: string): string {
  const lc = m.toLowerCase()
  // Accents simplifiés → accentués (style Encre)
  if (lc === 'fevrier') return 'février'
  if (lc === 'aout') return 'août'
  if (lc === 'decembre') return 'décembre'
  return lc
}

/**
 * Extrait toutes les dates groupées sous un en-tête « Prochaine date
 * limite de dépôt » (ou variante). Renvoie le bloc avec le plus grand
 * nombre de dates (en pratique il n'y en a qu'un par page).
 *
 * Pure : ne fetch rien, ne mute rien.
 */
export function extractProchaineDateList(sourceText: string | null | undefined): FrenchDate[] {
  if (!sourceText) return []
  const lines = sourceText.split('\n').map((l) => l.trim())
  let best: FrenchDate[] = []

  for (let i = 0; i < lines.length; i++) {
    if (!PROCHAINE_DEADLINE_HEADER_RE.test(lines[i])) continue

    // Collecte les dates qui suivent, en sautant les lignes vides
    // (fréquentes dans le texte stripé). Le 1er non-blanc qui n'est PAS
    // une date marque la fin de la liste — soit on est tombé sur une
    // section suivante (début d'autre paragraphe), soit ce n'était pas
    // une vraie liste sous l'en-tête (auquel cas collected reste vide
    // et on passera au prochain match d'en-tête).
    const collected: FrenchDate[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (!line) continue
      const m = FRENCH_DATE_LINE_RE.exec(line)
      if (!m) break
      collected.push({
        day: Number.parseInt(m[1], 10),
        month: normalizeMonth(m[2]),
        year: Number.parseInt(m[3], 10),
      })
    }

    if (collected.length > best.length) best = collected
  }

  return best
}

/**
 * Synthesize un calendrier Format A à partir des dates extraites par
 * `extractProchaineDateList`. Renvoie null si moins de 2 dates (1 seule
 * date est probablement la deadline principale, pas un cycle de sessions).
 *
 * Format produit (style Encre) :
 *   ["2 février 2026 : clôture du dépôt",
 *    "11 mai 2026 : clôture du dépôt",
 *    "21 septembre 2026 : clôture du dépôt"]
 */
export function synthesizeFormatAFromProchaineList(
  sourceText: string | null | undefined,
): string[] | null {
  const dates = extractProchaineDateList(sourceText)
  if (dates.length < 2) return null

  return dates.map((d) => {
    const dayStr = d.day === 1 ? '1er' : String(d.day)
    return `${dayStr} ${d.month} ${d.year} : clôture du dépôt`
  })
}
