import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSourceBySlug, listActiveSourceSlugs } from '@/features/sources/queries'
import { listOpportunities } from '@/features/opportunities/queries'
import { defaultSourceDescription, sourceHostname } from '@/lib/source-categories'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import type { Opportunity } from '@/lib/supabase/types'

/**
 * Encre · page détail d'un émetteur.
 *
 * Capture l'intent de recherche brandé (`Beaumarchais`, `Brouillon d'un rêve`,
 * `GREC`, `CICLIC`, etc.) qui ressort fortement en autocomplete Google FR.
 *
 * Structure : présentation de l'émetteur + liste de ses opportunités ouvertes
 * + lien vers le site officiel + JSON-LD Organization + BreadcrumbList.
 */

export const revalidate = 3600 // ISR 1 h

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await listActiveSourceSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const source = await getSourceBySlug(slug)
  if (!source) return {}
  const path = `/sources/${slug}`
  const description =
    ((source.config as Record<string, unknown> | null)?.description as string | undefined) ??
    defaultSourceDescription(source.name, source.kind)
  return {
    title: `${source.name} · aides à l'écriture ouvertes`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${source.name} · Encre`,
      description,
      type: 'website',
      url: path,
    },
  }
}

export default async function SourceDetailPage({ params }: PageProps) {
  const { slug } = await params
  const source = await getSourceBySlug(slug)
  if (!source) notFound()

  const [{ items: openItems }, { items: pastItems }] = await Promise.all([
    listOpportunities({
      emitterSlugs: [slug],
      includeExpired: false,
      limit: 100,
    }),
    listOpportunities({
      emitterSlugs: [slug],
      includeExpired: true,
      limit: 30,
    }),
  ])

  const closedItems = pastItems.filter(
    (o) => o.deadline && new Date(o.deadline).getTime() < Date.now(),
  )

  const description =
    ((source.config as Record<string, unknown> | null)?.description as string | undefined) ??
    defaultSourceDescription(source.name, source.kind)
  const hostname = sourceHostname(source.config)
  const canonicalUrl = absoluteUrl(`/sources/${slug}`)
  const officialUrl = hostname ? `https://${hostname}/` : null

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: source.name,
    description,
    url: canonicalUrl,
    ...(officialUrl ? { sameAs: [officialUrl] } : {}),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Sources', item: absoluteUrl('/sources') },
      { '@type': 'ListItem', position: 3, name: source.name, item: canonicalUrl },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
        {/* ─── BREADCRUMB ─────────────────────────────── */}
        <div style={{ padding: '32px 0 0' }}>
          <Link
            href="/sources"
            className="mono"
            style={{
              fontSize: '0.74rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-muted)',
              borderBottom: '1px solid transparent',
              paddingBottom: 2,
            }}
          >
            ← Toutes les sources
          </Link>
        </div>

        {/* ─── TITLE BLOCK ────────────────────────────── */}
        <div style={{ padding: '32px 0 40px' }}>
          <div
            className="mono"
            style={{
              fontSize: '0.74rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--vermillion)',
              marginBottom: 18,
            }}
          >
            Émetteur
          </div>
          <h1
            className="serif"
            style={{
              fontSize: 'clamp(2.2rem, 4.8vw, 3.2rem)',
              fontWeight: 600,
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              color: 'var(--ink)',
              marginBottom: 22,
            }}
          >
            {source.name}
          </h1>
          <p
            className="serif"
            style={{
              fontSize: '1.12rem',
              lineHeight: 1.6,
              color: 'var(--ink-muted)',
              maxWidth: '62ch',
              marginBottom: 24,
            }}
          >
            {description}
          </p>
          {officialUrl && (
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer external"
              className="mono"
              style={{
                fontSize: '0.78rem',
                color: 'var(--ink)',
                borderBottom: '1px solid var(--vermillion)',
                paddingBottom: 2,
                letterSpacing: '0.04em',
              }}
            >
              {hostname} →
            </a>
          )}
        </div>

        {/* ─── OPEN OPPORTUNITIES ───────────────────────── */}
        <section style={{ borderTop: '2px solid var(--ink)', paddingTop: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 8,
              paddingBottom: 14,
              borderBottom: '1px solid var(--ink-rule)',
            }}
          >
            <h2
              className="serif"
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: 'var(--ink)',
              }}
            >
              Ouvertes à candidature
            </h2>
            <span
              className="mono"
              style={{
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--ink-soft)',
              }}
            >
              {openItems.length}
            </span>
          </div>

          {openItems.length === 0 ? (
            <EmptyState />
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {openItems.map((opp, idx) => (
                <OppRow key={opp.id} opp={opp} num={idx + 1} />
              ))}
            </ol>
          )}
        </section>

        {/* ─── CLOSED OPPORTUNITIES ─────────────────────── */}
        {closedItems.length > 0 && (
          <section style={{ padding: '64px 0 96px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 8,
                paddingBottom: 14,
                borderBottom: '1px solid var(--ink-rule)',
              }}
            >
              <h2
                className="serif"
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  letterSpacing: '-0.012em',
                  color: 'var(--ink-muted)',
                }}
              >
                Cycles clos récents
              </h2>
              <span
                className="mono"
                style={{
                  fontSize: '0.74rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-soft)',
                }}
              >
                {closedItems.length}
              </span>
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {closedItems.slice(0, 10).map((opp, idx) => (
                <OppRow key={opp.id} opp={opp} num={idx + 1} dim />
              ))}
            </ol>
            <p
              className="serif"
              style={{
                fontStyle: 'italic',
                color: 'var(--ink-muted)',
                fontSize: '0.95rem',
                marginTop: 18,
                maxWidth: '60ch',
              }}
            >
              Les cycles clos sont conservés à titre indicatif. Le prochain cycle
              sera publié dès que l&apos;émetteur l&apos;annoncera.
            </p>
          </section>
        )}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function OppRow({
  opp,
  num,
  dim = false,
}: {
  opp: Opportunity
  num: number
  dim?: boolean
}) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr 140px',
        gap: '12px 28px',
        alignItems: 'baseline',
        padding: '22px 0',
        borderBottom: '1px solid var(--ink-rule)',
        opacity: dim ? 0.6 : 1,
      }}
    >
      <Link
        href={`/aides/${opp.slug}`}
        style={{ display: 'contents', textDecoration: 'none', color: 'inherit' }}
      >
        <div
          className="mono"
          style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}
        >
          #{String(num).padStart(2, '0')}
        </div>
        <div>
          <span
            className="opp-row-title serif"
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              lineHeight: 1.25,
              color: 'var(--ink)',
              letterSpacing: '-0.008em',
              display: 'block',
            }}
          >
            {opp.title}
          </span>
          {opp.description && (
            <p
              style={{
                marginTop: 8,
                fontSize: '0.92rem',
                lineHeight: 1.5,
                color: 'var(--ink-muted)',
                maxWidth: '64ch',
              }}
            >
              {opp.description.slice(0, 200)}
              {opp.description.length > 200 ? '…' : ''}
            </p>
          )}
        </div>
        <div
          className="mono"
          style={{
            textAlign: 'right',
            fontSize: '0.72rem',
            color: 'var(--ink-muted)',
          }}
        >
          {opp.deadline
            ? new Date(opp.deadline).toLocaleDateString('fr-FR')
            : 'Cycle continu'}
        </div>
      </Link>
    </li>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '48px 32px',
        border: '1px solid var(--ink-rule)',
        background: 'var(--paper-soft)',
        textAlign: 'center',
        marginTop: 12,
      }}
    >
      <p
        className="serif"
        style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--ink-muted)',
          fontSize: '1rem',
          maxWidth: '50ch',
          margin: '0 auto',
        }}
      >
        Aucun cycle ouvert pour le moment. Le prochain appel sera publié dès
        qu&apos;il sera annoncé par l&apos;émetteur.
      </p>
    </div>
  )
}
