import Link from 'next/link'

/**
 * Footer Encre · colophon éditorial sur fond ink.
 *
 * Quatre colonnes : mission · explorer · maison · légal.
 * Hairline vermillon sur les titres de colonne, copyright + disclaimer en mono-meta.
 */
export function Footer() {
  return (
    <footer className="band-ink" style={{ borderTop: '1px solid rgba(244, 237, 224, 0.18)' }}>
      <div className="max-w-[1640px] mx-auto px-6 sm:px-12 pt-14 pb-10">
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-10"
          style={{ color: 'var(--ink-soft)' }}
        >
          {/* Colonne mission */}
          <div className="col-span-2 md:col-span-1">
            <div
              className="serif text-[26px] mb-3"
              style={{ fontWeight: 600, letterSpacing: '-0.012em', color: 'var(--paper)' }}
            >
              Encre<span style={{ color: 'var(--vermillion)' }}>.</span>
            </div>
            <p className="prose-ink text-[14px]" style={{ color: 'var(--ink-soft)' }}>
              Aides à l&apos;écriture pour scénaristes et auteurs. Indépendant, sans publicité,
              sans dossier obligatoire pour consulter.
            </p>
          </div>

          {/* Explorer */}
          <div>
            <div className="mono" style={{ color: 'var(--vermillion)', marginBottom: '14px' }}>
              Explorer
            </div>
            <ul className="space-y-2 serif-text text-[15px]">
              <li>
                <Link href="/aides" className="link">
                  Toutes les opportunités
                </Link>
              </li>
              <li>
                <Link href="/pays-du-sud" className="link">
                  Pays du Sud
                </Link>
              </li>
              <li>
                <Link href="/outremer" className="link">
                  Outre-mer
                </Link>
              </li>
              <li>
                <Link href="/onboarding" className="link">
                  Composer une veille
                </Link>
              </li>
              <li>
                <Link href="/sources" className="link">
                  Sources officielles
                </Link>
              </li>
            </ul>
          </div>

          {/* Maison */}
          <div>
            <div className="mono" style={{ color: 'var(--vermillion)', marginBottom: '14px' }}>
              Maison
            </div>
            <ul className="space-y-2 serif-text text-[15px]">
              <li>
                <Link href="/manifeste" className="link">
                  Manifeste
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="link">
                  À propos
                </Link>
              </li>
              <li>
                <Link href="/contact" className="link">
                  Nous écrire
                </Link>
              </li>
            </ul>
          </div>

          {/* Légal */}
          <div>
            <div className="mono" style={{ color: 'var(--vermillion)', marginBottom: '14px' }}>
              Légal
            </div>
            <ul className="space-y-2 serif-text text-[15px]">
              <li>
                <Link href="/mentions-legales" className="link">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="link">
                  CGU
                </Link>
              </li>
              <li>
                <Link href="/donnees-personnelles" className="link">
                  Données personnelles
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-14 pt-6 mono-meta"
          style={{
            borderTop: '1px solid rgba(244, 237, 224, 0.18)',
            color: 'var(--ink-muted)',
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3">
            <span>
              © {new Date().getFullYear()} Encre · Paris, France ·{' '}
              <a
                href="https://github.com/Nctrn17/encre"
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Code source
              </a>
            </span>
            <span>
              Données indicatives : vérifiez le règlement officiel auprès de chaque émetteur.
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
