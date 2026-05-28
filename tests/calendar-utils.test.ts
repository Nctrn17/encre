import { describe, it, expect } from 'vitest'
import {
  isoWeekNumber,
  groupByIsoWeek,
  groupByMonth,
  formatDayMonthShort,
  formatDeadlineHour,
  daysUntilDeadline,
  primaryDisciplineLabel,
} from '../src/lib/calendar-utils'
import type { Opportunity } from '../src/lib/supabase/types'

function opp(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: 'op',
    slug: 's',
    title: 't',
    description: null,
    emitter: 'em',
    emitter_slug: 'em',
    type: 'residence',
    disciplines: ['cinema'],
    audience: [],
    geo_scope: 'national',
    region_code: null,
    amount_min: null,
    amount_max: null,
    currency: 'EUR',
    deadline: null,
    published_at: '2026-01-01T00:00:00.000Z',
    source_url: 'https://x',
    mirror_urls: [],
    fingerprint: 'fp',
    classify_confidence: null,
    human_review: false,
    is_published: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Opportunity
}

describe('isoWeekNumber', () => {
  it('retourne le numéro ISO 8601', () => {
    // 1er janvier 2026 = jeudi → semaine 1
    expect(isoWeekNumber(new Date('2026-01-01T12:00:00Z'))).toBe(1)
    // 15 juin 2026 = lundi → semaine 25
    expect(isoWeekNumber(new Date('2026-06-15T12:00:00Z'))).toBe(25)
  })
})

describe('groupByIsoWeek', () => {
  it('groupe par semaine et trie chronologiquement', () => {
    const items = [
      opp({ id: '1', deadline: '2026-06-15T00:00:00Z' }), // lundi semaine 25
      opp({ id: '2', deadline: '2026-06-08T00:00:00Z' }), // semaine 24
      opp({ id: '3', deadline: '2026-06-17T00:00:00Z' }), // semaine 25
    ]
    const groups = groupByIsoWeek(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].weekNumber).toBe(24)
    expect(groups[1].weekNumber).toBe(25)
    expect(groups[1].items).toHaveLength(2)
  })

  it('ignore les opps sans deadline', () => {
    const items = [opp({ id: '1', deadline: null })]
    expect(groupByIsoWeek(items)).toHaveLength(0)
  })
})

describe('groupByMonth', () => {
  it('groupe par YYYY-MM et trie', () => {
    const items = [
      opp({ id: '1', deadline: '2026-08-15T00:00:00Z' }),
      opp({ id: '2', deadline: '2026-06-30T00:00:00Z' }),
      opp({ id: '3', deadline: '2026-08-01T00:00:00Z' }),
    ]
    const groups = groupByMonth(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe('2026-06')
    expect(groups[1].key).toBe('2026-08')
    expect(groups[0].label).toBe('Juin 2026')
    expect(groups[1].items).toHaveLength(2)
  })
})

describe('formatDayMonthShort', () => {
  it('formate le jour + jour de semaine', () => {
    const result = formatDayMonthShort(new Date('2026-06-02T12:00:00Z')) // mardi
    expect(result.day).toBe('02')
    expect(result.weekday).toBe('Mar')
  })
})

describe('formatDeadlineHour', () => {
  it('formate l\'heure UTC', () => {
    expect(formatDeadlineHour(new Date('2026-06-15T22:59:00Z'))).toBe('22h59')
    expect(formatDeadlineHour(new Date('2026-06-15T00:00:00Z'))).toBe('00h00')
  })
})

describe('daysUntilDeadline', () => {
  it('retourne le nombre de jours positif pour le futur', () => {
    expect(daysUntilDeadline(new Date('2026-06-22T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(7)
  })
  it('retourne un nombre négatif pour le passé', () => {
    expect(daysUntilDeadline(new Date('2026-06-08T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(-7)
  })
  it('borne à ±365', () => {
    expect(daysUntilDeadline(new Date('2030-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(365)
  })
})

describe('primaryDisciplineLabel', () => {
  it('utilise la première discipline + premier tag', () => {
    const r = primaryDisciplineLabel(opp({ disciplines: ['cinema'], disciplines_tags: ['long-metrage'] }))
    expect(r.main).toBe('Cinéma')
    expect(r.sub).toBe('Long Metrage')
  })
  it('renvoie "Transdisciplinaire" si discipline absente', () => {
    const r = primaryDisciplineLabel(opp({ disciplines: [] }))
    expect(r.main).toBe('Transdisciplinaire')
  })
})
