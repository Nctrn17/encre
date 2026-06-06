const DAY_MS = 86_400_000

/**
 * Deux deadlines désignent-elles la même édition d'une opportunité ?
 *
 * - Si l'une est absente (null/vide), on considère que oui : l'opp a
 *   probablement été vue d'abord sans deadline (scraper qui n'extrait pas la
 *   date) puis re-vue avec, ou inversement. La non-nulle raffine l'autre.
 * - Si les deux sont présentes, elles sont compatibles tant que l'écart reste
 *   sous `maxDaysApart` jours. Conforme à la règle métier « jamais de merge
 *   auto si les deadlines diffèrent de plus de 30 jours » (= éditions
 *   distinctes d'un appel récurrent).
 * - Une date non parsable est traitée comme absente (compatible).
 */
export function deadlinesCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
  maxDaysApart = 30,
): boolean {
  if (!a || !b) return true
  const da = Date.parse(a)
  const db = Date.parse(b)
  if (Number.isNaN(da) || Number.isNaN(db)) return true
  return Math.abs(da - db) <= maxDaysApart * DAY_MS
}
