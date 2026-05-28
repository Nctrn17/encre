'use client'

import Link from 'next/link'
import type { AlertProfilePreview } from '@/features/alerts/actions'

type Level = 'strong' | 'possible' | 'difficult' | 'not_recommended'

const LEVEL_SHORT: Record<Level, string> = {
  strong: 'Très adapté',
  possible: 'Possible',
  difficult: 'Exigeant',
  not_recommended: 'Non retenu',
}

export function AlertProfilePreviewPanel({
  preview,
  error,
  isLoading,
  onPreview,
}: {
  preview: AlertProfilePreview | null
  error: string | null
  isLoading: boolean
  onPreview: () => void
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-semibold">Aperçu de l'alerte</h2>
          <p className="mt-1 text-sm text-muted">
            Simulation sur les opportunités ouvertes, sans enregistrer l'alerte.
          </p>
        </div>
        <button
          type="button"
          onClick={onPreview}
          disabled={isLoading}
          className="rounded-[var(--radius)] border border-subtle px-4 py-2 text-sm hover:bg-subtle disabled:opacity-50"
        >
          {isLoading ? 'Calcul...' : 'Prévisualiser'}
        </button>
      </div>

      {error && <div className="mt-4 rounded bg-danger-soft p-3 text-sm text-danger">{error}</div>}

      {preview && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Total" value={preview.total} />
            <Metric label="Très adaptées" value={preview.counts.strong} />
            <Metric label="Possibles" value={preview.counts.possible} />
            <Metric label="Exigeantes" value={preview.counts.difficult} />
          </div>

          {preview.examples.length === 0 ? (
            <p className="text-sm text-muted">
              Aucune opportunité ouverte ne correspond à cette configuration.
            </p>
          ) : (
            <div className="space-y-3">
              {preview.examples.map((example) => (
                <article key={example.id} className="border-t border-subtle pt-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <Link
                      href={`/aides/${example.slug}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {example.title}
                    </Link>
                    <span className="today-level" data-level={example.level}>
                      {LEVEL_SHORT[example.level as Level]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {example.emitter} · {example.decisionLabel}
                  </div>
                  {example.reasons[0] && (
                    <div className="mt-2 text-sm">{example.reasons[0]}</div>
                  )}
                  {example.warnings[0] && (
                    <div className="mt-1 text-sm text-muted">{example.warnings[0]}</div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-subtle bg-background p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  )
}
