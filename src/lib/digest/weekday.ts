/**
 * Jour ISO de la semaine (1 = lundi … 7 = dimanche) dans le fuseau Europe/Paris.
 *
 * Partagé par la construction des digests (filtrage des profils hebdo par
 * `send_weekday`) et par le cron broadcast waitlist (envoi cadencé un jour fixe).
 * Source unique pour éviter deux implémentations qui divergent sur le fuseau.
 */
export function isoWeekdayInParis(date: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Europe/Paris',
  }).format(date)

  const weekdays: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }

  return weekdays[weekday] ?? 1
}
