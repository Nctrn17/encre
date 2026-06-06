const DAY_MS = 86_400_000

/**
 * Garde-fou de péremption pour les scrapers « health-check + static emit »
 * dont les dates sont codées en dur par édition (bloc `EDITION_YYYY`).
 *
 * Renvoie `true` (= édition périmée, ne plus émettre) quand la deadline de
 * l'édition est dépassée au-delà d'une marge `graceDays`, et alerte bruyamment
 * dans les logs : le bloc doit être rafraîchi pour la nouvelle édition. Sans ce
 * garde-fou, un oubli de mise à jour ferait servir des dates closes comme si
 * l'appel était ouvert.
 *
 * La marge évite de droper une édition juste après sa clôture (l'opportunité
 * reste affichée comme « fermée, prochain appel attendu » via le masquage des
 * deadlines passées côté requêtes).
 */
export function isStaticEditionStale(
  label: string,
  deadlineIso: string | null | undefined,
  graceDays = 14,
): boolean {
  if (!deadlineIso) return false
  const deadline = Date.parse(deadlineIso)
  if (Number.isNaN(deadline)) return false
  const staleAfter = deadline + graceDays * DAY_MS
  if (Date.now() > staleAfter) {
    console.warn(
      `  [edition-guard] ${label} : édition périmée (deadline ${deadlineIso}). ` +
        `Bloc EDITION_YYYY à rafraîchir — émission suspendue.`,
    )
    return true
  }
  return false
}

/**
 * Variante pour les sources à dépôt glissant (pas de deadline unique) : alerte
 * simplement si l'année de l'édition codée en dur est antérieure à l'année
 * courante, sans suspendre l'émission (le dépôt reste ouvert au fil de l'eau).
 */
export function warnIfEditionYearStale(label: string, year: number): void {
  const currentYear = new Date().getFullYear()
  if (year < currentYear) {
    console.warn(
      `  [edition-guard] ${label} : bloc édition ${year} (année courante ${currentYear}). ` +
        `Vérifier que les modalités sont toujours à jour.`,
    )
  }
}
