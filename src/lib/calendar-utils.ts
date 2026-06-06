/**
 * Helpers de présentation pour les pages calendrier.
 * Pas de dépendance Supabase — purement formatage.
 */

import type { Opportunity } from '@/lib/supabase/types'
import { DISCIPLINE_LABELS, type DisciplineSlug, DISCIPLINE_SLUGS } from '@/lib/discipline-taxonomy'

const FR_WEEKDAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
export const FR_MONTH_FULL = [
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

/**
 * Numéro de semaine ISO 8601 (lundi = jour 1).
 */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Groupe les opportunités par semaine ISO.
 * Conserve l'ordre chronologique. Retourne un Map ordonné.
 */
export interface WeekGroup {
  weekNumber: number
  start: Date // lundi de la semaine
  end: Date // dimanche de la semaine
  items: Opportunity[]
}

export function groupByIsoWeek(items: Opportunity[]): WeekGroup[] {
  const groups = new Map<number, WeekGroup>()
  for (const o of items) {
    if (!o.deadline) continue
    const d = new Date(o.deadline)
    const weekNumber = isoWeekNumber(d)
    const dayOfWeek = d.getUTCDay() || 7 // 1-7 (lundi-dimanche)
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - (dayOfWeek - 1))
    monday.setUTCHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)

    const existing = groups.get(weekNumber)
    if (existing) {
      existing.items.push(o)
    } else {
      groups.set(weekNumber, { weekNumber, start: monday, end: sunday, items: [o] })
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * Groupe les opportunités par mois (clé `YYYY-MM`).
 */
export interface MonthGroup {
  key: string
  year: number
  month: number // 1-12
  label: string // "Juin 2026"
  items: Opportunity[]
}

const MONTH_LABEL_PASCAL = [
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
]

export function groupByMonth(items: Opportunity[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>()
  for (const o of items) {
    if (!o.deadline) continue
    const d = new Date(o.deadline)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(o)
    } else {
      groups.set(key, {
        key,
        year,
        month,
        label: `${MONTH_LABEL_PASCAL[month - 1]} ${year}`,
        items: [o],
      })
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Format compact d'une date du listing : "02 Mar".
 */
export function formatDayMonthShort(date: Date): { day: string; weekday: string } {
  return {
    day: String(date.getUTCDate()).padStart(2, '0'),
    weekday: FR_WEEKDAY_SHORT[date.getUTCDay()],
  }
}

/**
 * Heure de fin de la deadline ("23h59" ou "00h00") — utile pour le countdown.
 */
export function formatDeadlineHour(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, '0')
  const m = String(date.getUTCMinutes()).padStart(2, '0')
  return `${h}h${m}`
}

/**
 * Délai en jours entre `now` et la deadline (peut être négatif si passée).
 * Borne supérieure à 365 pour éviter l'affichage "J−12000" sur les opps lointaines.
 */
export function daysUntilDeadline(deadline: Date, now: Date = new Date()): number {
  const diff = Math.floor((deadline.getTime() - now.getTime()) / 86400000)
  return Math.max(-365, Math.min(365, diff))
}

/**
 * Discipline principale d'une opp pour affichage compact.
 * Renvoie le label FR + une éventuelle sub-discipline (tag fin si pertinent).
 */
export function primaryDisciplineLabel(opp: Opportunity): { main: string; sub: string | null } {
  const disciplines = opp.disciplines ?? []
  const tags = opp.disciplines_tags ?? []
  const slug = disciplines[0] as DisciplineSlug | undefined
  const main = slug && DISCIPLINE_SLUGS.includes(slug) ? DISCIPLINE_LABELS[slug] : 'Transdisciplinaire'
  const sub = tags[0] ?? null
  return { main, sub: sub ? prettyTag(sub) : null }
}

function prettyTag(tag: string): string {
  return tag
    .split(/[-_]/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}
