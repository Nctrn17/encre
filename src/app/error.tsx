'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Error boundary global — affiché quand un Server Component crash au render
 * ou qu'un API côté serveur lève une exception non gérée.
 *
 * Note : Next impose que ce soit un Client Component avec 'use client'.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Dans un vrai prod, on enverrait à un service d'observabilité (Sentry/etc.)
    console.error('[app] unhandled error:', error)
  }, [error])

  return (
    <div className="band-charcoal">
      <section className="band-charcoal pinstripe-bg relative overflow-hidden min-h-[80vh] flex items-center">
        <div className="grain" />
        <span className="crop-mark tl" />
        <span className="crop-mark tr" />

        <div className="max-w-[900px] mx-auto px-6 sm:px-12 py-20 sm:py-32 relative w-full">
          <div className="slug mb-6 sm:mb-8">Incident technique</div>

          <h1
            className="fraunces hang mb-8"
            style={{
              fontSize: 'clamp(48px, 9vw, 140px)',
              lineHeight: 0.92,
              fontWeight: 400,
              letterSpacing: '-0.025em',
            }}
          >
            Une erreur est{' '}
            <span style={{ color: 'var(--vermillion)' }}>survenue.</span>
          </h1>

          <div className="max-w-[600px]">
            <p
              className="prose-charcoal mb-4"
              style={{
                fontSize: '17px',
                color: 'var(--muted-cream)',
                lineHeight: 1.6,
              }}
            >
              Quelque chose n&apos;a pas fonctionné côté serveur. Ce n&apos;est
              pas votre faute. L&apos;incident a été enregistré et sera corrigé.
            </p>

            {error.digest && (
              <div
                className="mono-meta mb-10 p-4"
                style={{
                  border: '1px dashed var(--kelp)',
                  color: 'var(--muted-warm)',
                  fontSize: 11,
                }}
              >
                Référence incident : {error.digest}
                <div className="mt-1 italic" style={{ fontSize: 10.5 }}>
                  Copiez cette référence si vous nous contactez, nous pourrons
                  retrouver ce qui s&apos;est passé.
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-baseline gap-6 mono mt-10">
              <button
                type="button"
                onClick={reset}
                className="link"
                style={{ color: 'var(--vermillion)', cursor: 'pointer' }}
              >
                Réessayer →
              </button>
              <span className="slug-muted">·</span>
              <Link href="/" className="link slug-muted">
                Page d&apos;accueil
              </Link>
              <span className="slug-muted">·</span>
              <Link href="/contact" className="link slug-muted">
                Signaler l&apos;incident
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
