import Link from 'next/link'
import type { Metadata } from 'next'
import {
  DISCIPLINE_LABELS,
  DISCIPLINE_DESCRIPTIONS,
  type DisciplineSlug,
} from '@/lib/discipline-taxonomy'

/**
 * Pendant le pilote scénariste, on n'affiche que les disciplines audiovisuelles
 * sur cette page. Les autres hubs `/disciplines/[slug]` existent toujours (pour
 * l'accès direct par URL) mais ne sont plus mis en avant. À élargir quand on
 * ouvrira le pilote.
 */
const PILOT_DISCIPLINES: DisciplineSlug[] = ['cinema', 'audiovisuel']

export const metadata: Metadata = {
  title: 'Aides à l’écriture audiovisuelle',
  description:
    'Appels à projets, résidences et bourses pour scénaristes, réalisatrices et réalisateurs, autrices et auteurs de documentaire.',
}

export default function DisciplinesIndexPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-serif mb-2">Aides à l’écriture audiovisuelle</h1>
      <p className="text-muted mb-10">
        Le pilote actuel couvre l’écriture audiovisuelle : scénario cinéma, TV,
        série, documentaire, création sonore, web narratif. Les autres
        disciplines seront ouvertes progressivement.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {PILOT_DISCIPLINES.map((slug) => (
          <Link
            key={slug}
            href={`/disciplines/${slug.replace(/_/g, '-')}`}
            className="p-5 rounded-[var(--radius-lg)] border border-subtle bg-surface hover:border-accent/40 hover:shadow-[var(--shadow)] transition-all"
          >
            <div className="font-serif text-lg font-semibold mb-2">{DISCIPLINE_LABELS[slug]}</div>
            <p className="text-sm text-muted leading-relaxed">{DISCIPLINE_DESCRIPTIONS[slug]}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
