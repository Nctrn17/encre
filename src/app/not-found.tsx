import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="band-charcoal">
      <section
        className="band-charcoal pinstripe-bg relative overflow-hidden min-h-[80vh] flex items-center"
      >
        <div className="grain" />
        <span className="crop-mark tl" />
        <span className="crop-mark tr" />
        <span className="crop-mark bl" />
        <span className="crop-mark br" />

        <div className="max-w-[900px] mx-auto px-6 sm:px-12 py-20 sm:py-32 relative w-full">
          <div className="slug mb-6 sm:mb-8">Page introuvable</div>

          <h1
            className="fraunces hang mb-8 sm:mb-12"
            style={{
              fontSize: 'clamp(72px, 14vw, 220px)',
              lineHeight: 0.9,
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: 'var(--vermillion)',
            }}
          >
            404.
          </h1>

          <div className="max-w-[560px]">
            <p
              className="fraunces-italic mb-4"
              style={{
                fontSize: 'clamp(18px, 1.8vw, 24px)',
                lineHeight: 1.4,
                color: 'var(--cream-text)',
              }}
            >
              L&apos;appel que vous cherchez n&apos;existe plus, ou n&apos;a
              jamais existé.
            </p>
            <p
              className="prose-charcoal mb-10"
              style={{
                fontSize: '15.5px',
                color: 'var(--muted-cream)',
                lineHeight: 1.6,
              }}
            >
              Peut-être que l&apos;appel a été clos et retiré de la base, ou
              que l&apos;adresse que vous avez ouverte comporte une faute de
              frappe. Ou que nous avons simplement manqué cette fiche.
            </p>

            <div className="flex flex-wrap items-baseline gap-6 mono">
              <Link
                href="/aides"
                className="link"
                style={{ color: 'var(--vermillion)' }}
              >
                ← Retour au carnet
              </Link>
              <span className="slug-muted">·</span>
              <Link
                href="/"
                className="link slug-muted"
              >
                Page d&apos;accueil
              </Link>
              <span className="slug-muted">·</span>
              <Link
                href="/contact"
                className="link slug-muted"
              >
                Signaler le lien cassé
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
