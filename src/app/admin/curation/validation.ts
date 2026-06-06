/**
 * Validation de longueur des lignes de curation (conditions / calendrier /
 * dossier). Extrait de actions.ts car un module `'use server'` ne peut exporter
 * que des fonctions async — et on veut une fonction pure, testable.
 *
 * Limite de longueur par ligne = format télégraphique / fiches concises.
 * Le but du message : champ + numéro de ligne (tel qu'affiché dans le textarea)
 * + longueur réelle vs limite, au lieu du message Zod opaque
 * « Too big: expected string to have <=280 characters ».
 */
export const LINE_LIMITS = { conditions: 280, calendrier: 200, dossier: 280 } as const
export const FIELD_LABELS = {
  conditions: 'Conditions',
  calendrier: 'Calendrier',
  dossier: 'Dossier',
} as const

export type CurationArrayField = keyof typeof LINE_LIMITS

export interface CurationLines {
  conditions: string[]
  calendrier: string[]
  dossier: string[]
}

/**
 * Repère les lignes trop longues. Retourne un message lisible, ou null si tout
 * est dans les clous. Mesure APRÈS trim (valeur réellement stockée) et ignore
 * les lignes vides (supprimées au nettoyage).
 */
export function validateLineLengths(input: CurationLines): string | null {
  const problems: string[] = []
  for (const field of ['conditions', 'calendrier', 'dossier'] as CurationArrayField[]) {
    const limit = LINE_LIMITS[field]
    input[field].forEach((line, i) => {
      const len = line.trim().length
      if (len > limit) {
        problems.push(`${FIELD_LABELS[field]}, ligne ${i + 1} : ${len}/${limit} caractères`)
      }
    })
  }
  if (problems.length === 0) return null
  return `Lignes trop longues à raccourcir : ${problems.join(' ; ')}`
}
