import { describe, expect, it } from 'vitest'
import { gradeExtractionQuality } from '@/lib/pipeline/extraction-quality'

describe('gradeExtractionQuality', () => {
  it('allows a complete evidenced extraction', () => {
    const result = gradeExtractionQuality({
      sourceText: `
Conditions : sans producteur attache.
Calendrier : 30 juin 2026 : cloture des candidatures.
Dossier : synopsis de 5 pages maximum et CV.
`,
      classifyConfidence: 0.82,
      sections: {
        conditions: ['Sans producteur attache'],
        calendrier: ['30 juin 2026 : cloture des candidatures'],
        dossier: ['Synopsis de 5 pages maximum', 'CV'],
      },
    })

    expect(result.canSendDigest).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('blocks low confidence outputs', () => {
    const result = gradeExtractionQuality({
      sourceText: 'Date limite : 30 juin 2026.',
      classifyConfidence: 0.45,
      sections: {
        conditions: [],
        calendrier: ['30 juin 2026 : date limite'],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('low_classify_confidence')
  })

  it('blocks empty dossier when the source mentions required documents', () => {
    const result = gradeExtractionQuality({
      sourceText: 'Documents a joindre : CV, note d intention, traitement de 10 pages.',
      classifyConfidence: 0.8,
      sections: {
        conditions: [],
        calendrier: [],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain(
      'dossier_missing_despite_source_marker',
    )
  })

  it('allows empty calendar when only the known deadline is mentioned', () => {
    const result = gradeExtractionQuality({
      sourceText: 'La date limite de depot est fixee au 15 mai 2026.',
      classifyConfidence: 0.8,
      deadlineKnown: true,
      sections: {
        conditions: [],
        calendrier: [],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(true)
  })

  it('still blocks empty calendar when secondary calendar markers are present', () => {
    const result = gradeExtractionQuality({
      sourceText: 'Calendrier : 15 mai 2026 cloture. Juin 2026 annonce des resultats.',
      classifyConfidence: 0.8,
      deadlineKnown: true,
      sections: {
        conditions: [],
        calendrier: [],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain(
      'calendrier_missing_despite_source_marker',
    )
  })

  it('blocks partial recurrent calendar headers', () => {
    const result = gradeExtractionQuality({
      sourceText: 'Calendrier des depots 2026 avec 5 sessions.',
      classifyConfidence: 0.8,
      sections: {
        conditions: [],
        calendrier: ['5 sessions par an, calendrier annuel recurrent'],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('calendar_partial_format_c')
  })

  it('blocks numbers invented by the extraction', () => {
    const result = gradeExtractionQuality({
      sourceText: 'Dossier : synopsis et CV.',
      classifyConfidence: 0.8,
      sections: {
        conditions: [],
        calendrier: [],
        dossier: ['Synopsis de 10 pages maximum', 'CV'],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('unsupported_number')
  })

  it('blocks awaiting next cycle pages', () => {
    const result = gradeExtractionQuality({
      sourceText: "La prochaine edition sera annoncee prochainement. Modalites a venir.",
      classifyConfidence: 0.8,
      sections: {
        conditions: [],
        calendrier: ['Prochaine edition a venir'],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain(
      'calendar_awaiting_next_cycle',
    )
  })

  it('blocks recurrent calendar tables that are not summarized canonically', () => {
    const result = gradeExtractionQuality({
      sourceText: `
Session | Ouverture du depot | Cloture du depot
1 | 17 novembre 2025 | 30 janvier 2026
2 | 6 janvier 2026 | 30 mars 2026
3 | 18 fevrier 2026 | 27 avril 2026
`,
      classifyConfidence: 0.8,
      deadlineKnown: true,
      sections: {
        conditions: [],
        calendrier: ['17 novembre 2025', '30 janvier 2026', '6 janvier 2026'],
        dossier: [],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain(
      'calendar_recurrent_table_not_summarized',
    )
  })

  it('blocks dossier items when the source does not list application documents', () => {
    const result = gradeExtractionQuality({
      sourceText: 'Le reglement detaille est publie sur le site officiel.',
      classifyConfidence: 0.8,
      deadlineKnown: true,
      sections: {
        conditions: [],
        calendrier: [],
        dossier: ['Reglement detaille'],
      },
    })

    expect(result.canSendDigest).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain(
      'dossier_extracted_without_source_marker',
    )
  })
})
