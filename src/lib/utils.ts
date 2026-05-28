/**
 * Convertit un texte en slug URL-safe.
 */
export function slugify(input: string, maxLength = 120): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
}

/**
 * Formate un montant EUR de manière condensée.
 */
export function formatAmount(min?: number | null, max?: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null && min === max) return `${formatEuro(min)}`
  if (min != null && max != null) return `${formatEuro(min)} – ${formatEuro(max)}`
  if (min != null) return `à partir de ${formatEuro(min)}`
  if (max != null) return `jusqu'à ${formatEuro(max)}`
  return null
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Retourne le nombre de jours restants avant une deadline (peut être négatif).
 */
export function daysUntil(deadline: string | Date): number {
  const target = typeof deadline === 'string' ? new Date(deadline) : deadline
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Humanise une deadline en français ("dans 5 jours", "expirée", "aujourd'hui").
 */
export function humanDeadline(deadline: string | Date | null | undefined): string {
  if (!deadline) return 'Sans échéance'
  const days = daysUntil(deadline)
  if (days < 0) return `Expirée depuis ${Math.abs(days)} j`
  if (days === 0) return "Expire aujourd'hui"
  if (days === 1) return 'Expire demain'
  if (days <= 7) return `Dans ${days} jours`
  if (days <= 30) return `Dans ${days} jours`
  const weeks = Math.round(days / 7)
  if (weeks <= 8) return `Dans ${weeks} semaines`
  const months = Math.round(days / 30)
  return `Dans ${months} mois`
}
