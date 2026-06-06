import { describe, expect, it } from 'vitest'
import { validateLineLengths } from '../src/app/admin/curation/validation'

const ok = { conditions: [], calendrier: [], dossier: [] }

describe('validateLineLengths', () => {
  it('returns null when everything is within limits', () => {
    expect(
      validateLineLengths({
        conditions: ['Réservé aux moins de 35 ans.', 'Premier long métrage.'],
        calendrier: ['Dépôt avant le 30 juin.'],
        dossier: ['Synopsis (PDF).'],
      }),
    ).toBeNull()
  })

  it('names the field, the 1-based line number and the length for a too-long condition', () => {
    const long = 'x'.repeat(300)
    const msg = validateLineLengths({ ...ok, conditions: ['court', long] })
    expect(msg).toContain('Conditions')
    expect(msg).toContain('ligne 2')
    expect(msg).toContain('300/280')
  })

  it('uses the 200-char limit for calendrier', () => {
    const long = 'y'.repeat(220)
    const msg = validateLineLengths({ ...ok, calendrier: [long] })
    expect(msg).toContain('Calendrier')
    expect(msg).toContain('ligne 1')
    expect(msg).toContain('220/200')
  })

  it('measures length after trim (trailing whitespace does not count)', () => {
    const line = 'z'.repeat(280) + '     ' // 285 bruts, 280 après trim
    expect(validateLineLengths({ ...ok, dossier: [line] })).toBeNull()
  })

  it('reports several problems separated by a semicolon', () => {
    const msg = validateLineLengths({
      conditions: ['a'.repeat(290)],
      calendrier: ['b'.repeat(210)],
      dossier: [],
    })
    expect(msg).toContain('Conditions')
    expect(msg).toContain('Calendrier')
    expect(msg).toContain(' ; ')
  })

  it('keeps line numbering aligned with the textarea (blank lines counted)', () => {
    // L'utilisateur voit la ligne longue en position 3 dans le textarea.
    const msg = validateLineLengths({ ...ok, dossier: ['', 'ok', 'w'.repeat(400)] })
    expect(msg).toContain('ligne 3')
    expect(msg).toContain('400/280')
  })
})
