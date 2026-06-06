/**
 * Parsing des dates de clôture françaises depuis le champ `calendrier`
 * (text[]) des opportunités.
 *
 * Source de vérité UNIQUE du parsing, partagée par :
 *   - scripts/backfill-deadline-from-calendar.ts (remplissage initial des null)
 *   - scripts/roll-deadlines.ts (roll quotidien vers la session suivante)
 *
 * Centralisée ici pour qu'une amélioration du parsing profite aux deux et
 * qu'aucune divergence ne s'installe entre eux.
 *
 * Sources de dates retenues (par ordre de fiabilité) :
 *   1. Format C : ligne "Clôtures YYYY : 30 janvier, 30 mars, …"
 *      → toutes des clôtures certaines, année dans l'en-tête.
 *   2. Format A : ligne "JJ mois YYYY : …" contenant un mot de clôture
 *      (clôture / dépôt / date limite / candidatures / jusqu'au / avant le).
 *
 * On ignore les étapes postérieures (résultats, commission, jury, auditions,
 * annonce, résidence, restitution) qui ne sont pas des deadlines de dépôt.
 */

export const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5,
  juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10,
  novembre: 11, décembre: 12, decembre: 12,
}
const MONTHS_ALT = Object.keys(MONTHS).join('|')

// Mot indiquant une clôture de dépôt (vs étape postérieure)
const CLOTURE_RE = /clôtur|clotur|dépôt|depot|date limite|candidatur|jusqu['’]au|avant le|deadline|inscription/i
// Étapes postérieures à ignorer si pas de mot clôture
const POSTERIEUR_RE = /résultat|resultat|commission|jury|sélection|selection|annonce|notification|audition|résidence|residence|restitution|remise|atelier|forum|festival|examen|délibér|deliber/i

/** 23:59 Paris ≈ 21:59 UTC (approximation deadline fin de journée). */
export function frDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 21, 59, 59))
}

/**
 * Vrai si la ligne est un en-tête de clôtures avec une année avant le ":".
 * Tolère du texte intercalé : "Clôtures 2026 :" comme
 * "Clôtures 1er collège 2026 :".
 */
const CLOTURE_HEADER_RE = /cl[oô]tures?\b[^:]*?(\d{4})\s*:/i

/** Parse "Clôtures 2026 : 30 janvier, 30 mars, 27 avril" → dates (année de l'en-tête). */
export function parseClotureLine(item: string): Date[] {
  const ym = item.match(CLOTURE_HEADER_RE)
  if (!ym) return []
  const year = Number.parseInt(ym[1], 10)
  const rest = item.slice(item.indexOf(':') + 1)
  // Année optionnelle après le mois : si une date porte sa propre année
  // (ex "04 décembre 2025" dans une ligne "Clôtures 2026"), on la respecte
  // plutôt que d'appliquer aveuglément l'année de l'en-tête.
  const re = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTHS_ALT})(?:\\s+(\\d{4}))?`, 'gi')
  const out: Date[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    const day = Number.parseInt(m[1], 10)
    const month = MONTHS[m[2].toLowerCase()]
    const y = m[3] ? Number.parseInt(m[3], 10) : year
    if (month) out.push(frDate(y, month, day))
  }
  return out
}

/** Parse une ligne Format A "JJ mois YYYY : action" si c'est une clôture. */
export function parseFormatALine(item: string): Date | null {
  const re = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTHS_ALT})\\s+(\\d{4})`, 'i')
  const m = item.match(re)
  if (!m) return null
  // Doit ressembler à une clôture, pas une étape postérieure
  const isCloture = CLOTURE_RE.test(item)
  const isPosterieur = POSTERIEUR_RE.test(item)
  if (!isCloture && isPosterieur) return null
  if (!isCloture && !isPosterieur) return null // ambigu → on ne prend pas
  const day = Number.parseInt(m[1], 10)
  const month = MONTHS[m[2].toLowerCase()]
  const year = Number.parseInt(m[3], 10)
  if (!month) return null
  return frDate(year, month, day)
}

/** Extrait la prochaine clôture future depuis le calendrier, ou null. */
export function nextDeadline(calendrier: string[], now: Date): Date | null {
  const candidates: Date[] = []
  for (const item of calendrier) {
    if (CLOTURE_HEADER_RE.test(item)) {
      candidates.push(...parseClotureLine(item))
    } else {
      const d = parseFormatALine(item)
      if (d) candidates.push(d)
    }
  }
  const future = candidates
    .filter((d) => d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())
  return future[0] ?? null
}
