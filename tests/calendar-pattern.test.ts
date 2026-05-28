import { describe, it, expect } from 'vitest'
import {
  detectCalendarPattern,
  applyContinuousFlowOverride,
  CONTINUOUS_FLOW_ITEM,
  extractProchaineDateList,
  synthesizeFormatAFromProchaineList,
} from '@/lib/pipeline/calendar-pattern'

describe('detectCalendarPattern', () => {
  describe('continuous flow', () => {
    it('detects "au fil de l\'eau" in source text', () => {
      const r = detectCalendarPattern(
        'Les candidatures sont déposées au fil de l\'eau, sans commission.',
        [],
      )
      expect(r.pattern).toBe('continuous')
      expect(r.evidence).toMatch(/au fil de l/i)
    })

    it('detects "flux continu" with apostrophe variants', () => {
      const r = detectCalendarPattern(
        'Modalité : flux continu de dépôt.',
        [],
      )
      expect(r.pattern).toBe('continuous')
    })

    it('detects "pas de date limite"', () => {
      const r = detectCalendarPattern(
        'Pas de date limite pour ce dispositif.',
        [],
      )
      expect(r.pattern).toBe('continuous')
    })

    it('detects continuous marker inside an extracted item', () => {
      const r = detectCalendarPattern('', ['Dépôt continu, examen mensuel'])
      expect(r.pattern).toBe('continuous')
    })

    it('typographic apostrophe is supported', () => {
      const r = detectCalendarPattern(
        'Dépôt au fil de l’eau toute l’année.',
        [],
      )
      expect(r.pattern).toBe('continuous')
    })
  })

  describe('awaiting next cycle', () => {
    it('detects "dates 2026 non encore publiées"', () => {
      const r = detectCalendarPattern(
        'Le calendrier des dates 2026 non encore publiées par le CNC sera communiqué.',
        [],
      )
      expect(r.pattern).toBe('awaiting_next')
    })

    it('detects awaiting marker in extracted item', () => {
      const r = detectCalendarPattern('', [
        'Dates 2026 non encore publiées par le CNC',
      ])
      expect(r.pattern).toBe('awaiting_next')
    })

    it('detects "prochaine commission à venir"', () => {
      const r = detectCalendarPattern(
        'La prochaine commission à venir sera annoncée prochainement.',
        [],
      )
      expect(r.pattern).toBe('awaiting_next')
    })

    it('detects "calendrier 2026 à venir"', () => {
      const r = detectCalendarPattern(
        'Calendrier 2026 à venir.',
        [],
      )
      expect(r.pattern).toBe('awaiting_next')
    })

    it('detects "modalités à venir"', () => {
      const r = detectCalendarPattern(
        'Les modalités à venir seront publiées en septembre.',
        [],
      )
      expect(r.pattern).toBe('awaiting_next')
    })

    it('detects "édition 2025 clôturée"', () => {
      const r = detectCalendarPattern(
        'L\'édition 2025 clôturée, prochaine session en 2026.',
        [],
      )
      expect(r.pattern).toBe('awaiting_next')
    })
  })

  describe('format C partial extraction', () => {
    it('detects line 1 alone with "N sessions par an"', () => {
      const r = detectCalendarPattern('', [
        '5 sessions par an, calendrier annuel récurrent',
      ])
      expect(r.pattern).toBe('partial_format_c')
      expect(r.evidence).toMatch(/sessions/i)
    })

    it('detects line 1 with "M calendriers parallèles"', () => {
      const r = detectCalendarPattern('', [
        '6 sessions par an, 2 calendriers parallèles (1er collège, 2ème collège)',
      ])
      expect(r.pattern).toBe('partial_format_c')
    })

    it('does NOT trigger on full Format C (2+ items)', () => {
      const r = detectCalendarPattern('', [
        '3 sessions par an, calendrier annuel récurrent',
        'Clôtures 2026 : 26 janvier, 20 avril, 22 septembre',
      ])
      expect(r.pattern).toBe('ok')
    })
  })

  describe('unknown empty', () => {
    it('returns unknown_empty when calendrier is [] and no markers', () => {
      const r = detectCalendarPattern(
        'Une page de description sans mention de calendrier.',
        [],
      )
      expect(r.pattern).toBe('unknown_empty')
      expect(r.evidence).toBeNull()
    })

    it('handles null source text gracefully', () => {
      const r = detectCalendarPattern(null, [])
      expect(r.pattern).toBe('unknown_empty')
    })

    it('handles undefined source text', () => {
      const r = detectCalendarPattern(undefined, [])
      expect(r.pattern).toBe('unknown_empty')
    })
  })

  describe('ok cases', () => {
    it('returns ok for normal Format A calendar', () => {
      const r = detectCalendarPattern('', [
        '30 juin 2026 : clôture des candidatures',
        'Septembre 2026 : auditions',
      ])
      expect(r.pattern).toBe('ok')
    })

    it('returns ok for full Format C calendar', () => {
      const r = detectCalendarPattern('Le CNC organise 6 sessions par an.', [
        '6 sessions par an, calendrier annuel récurrent',
        'Clôtures 2026 : 30 janvier, 30 mars, 27 avril, 29 juin, 28 septembre, 30 novembre',
      ])
      expect(r.pattern).toBe('ok')
    })
  })

  describe('priority order', () => {
    it('continuous wins over awaiting when both markers present', () => {
      const r = detectCalendarPattern(
        'Pas de date limite. Prochaine commission à venir.',
        [],
      )
      expect(r.pattern).toBe('continuous')
    })

    it('partial_format_c wins over awaiting markers in source', () => {
      const r = detectCalendarPattern(
        'Calendrier 2026 à venir.',
        ['5 sessions par an, calendrier annuel récurrent'],
      )
      expect(r.pattern).toBe('partial_format_c')
    })
  })
})

describe('extractProchaineDateList', () => {
  it('extracts a CNC FAJV-style date list', () => {
    const text = `
Détails du fonds.

Prochaine date limite de dépôt :

lundi 2 février 2026

lundi 11 mai 2026

lundi 21 septembre 2026

Les commissions se tiennent 2 mois environ après la date de dépôt.
`
    const out = extractProchaineDateList(text)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ day: 2, month: 'février', year: 2026 })
    expect(out[1]).toEqual({ day: 11, month: 'mai', year: 2026 })
    expect(out[2]).toEqual({ day: 21, month: 'septembre', year: 2026 })
  })

  it('handles dates without weekday prefix', () => {
    const text = `
Prochaines dates limites de dépôt :
2 février 2026
11 mai 2026
`
    const out = extractProchaineDateList(text)
    expect(out).toHaveLength(2)
  })

  it('normalizes simplified accents (fevrier → février, aout → août)', () => {
    const text = `
Calendrier des dépôts :
1 fevrier 2026
15 aout 2026
`
    const out = extractProchaineDateList(text)
    expect(out[0].month).toBe('février')
    expect(out[1].month).toBe('août')
  })

  it('stops at the first non-date non-blank line', () => {
    const text = `
Prochaine date limite de dépôt :
2 février 2026
11 mai 2026
Note : les sessions peuvent être reportées.
21 septembre 2026
`
    const out = extractProchaineDateList(text)
    expect(out).toHaveLength(2) // s'arrête au "Note"
  })

  it('returns empty array when header not found', () => {
    const text = `
Le fonds soutient la création.
30 octobre 2026.
`
    const out = extractProchaineDateList(text)
    expect(out).toEqual([])
  })

  it('returns empty array on null/undefined source', () => {
    expect(extractProchaineDateList(null)).toEqual([])
    expect(extractProchaineDateList(undefined)).toEqual([])
  })

  it('matches « Prochaines clôtures » variant', () => {
    const text = `
Prochaines clôtures :
30 mars 2026
30 juin 2026
`
    const out = extractProchaineDateList(text)
    expect(out).toHaveLength(2)
  })
})

describe('synthesizeFormatAFromProchaineList', () => {
  it('synthesizes Format A items from extracted dates', () => {
    const text = `
Prochaine date limite de dépôt :
lundi 2 février 2026
lundi 11 mai 2026
lundi 21 septembre 2026
`
    const out = synthesizeFormatAFromProchaineList(text)
    expect(out).toEqual([
      '2 février 2026 : clôture du dépôt',
      '11 mai 2026 : clôture du dépôt',
      '21 septembre 2026 : clôture du dépôt',
    ])
  })

  it('uses "1er" for day 1', () => {
    const text = `
Prochaines clôtures :
1 février 2026
1 août 2026
`
    const out = synthesizeFormatAFromProchaineList(text)
    expect(out?.[0]).toContain('1er février 2026')
    expect(out?.[1]).toContain('1er août 2026')
  })

  it('returns null when fewer than 2 dates (single deadline = Format A by main extraction)', () => {
    const text = `
Prochaine date limite de dépôt :
2 février 2026
`
    expect(synthesizeFormatAFromProchaineList(text)).toBeNull()
  })

  it('returns null when no header present', () => {
    expect(synthesizeFormatAFromProchaineList('Texte sans calendrier.')).toBeNull()
  })
})

describe('applyContinuousFlowOverride', () => {
  it('replaces calendrier when pattern is continuous', () => {
    const out = applyContinuousFlowOverride(['old item'], 'continuous')
    expect(out).toEqual([CONTINUOUS_FLOW_ITEM])
  })

  it('returns a copy of calendrier for non-continuous patterns', () => {
    const input = ['a', 'b']
    const out = applyContinuousFlowOverride(input, 'ok')
    expect(out).toEqual(['a', 'b'])
    expect(out).not.toBe(input) // immutability
  })

  it('does not modify calendrier for awaiting_next', () => {
    const out = applyContinuousFlowOverride(
      ['Dates 2026 non encore publiées'],
      'awaiting_next',
    )
    expect(out).toEqual(['Dates 2026 non encore publiées'])
  })

  it('does not modify calendrier for partial_format_c', () => {
    const out = applyContinuousFlowOverride(
      ['5 sessions par an, calendrier annuel récurrent'],
      'partial_format_c',
    )
    expect(out).toEqual(['5 sessions par an, calendrier annuel récurrent'])
  })
})
