import Link from 'next/link'
import type { Metadata } from 'next'
import { listOpportunities } from '@/features/opportunities/queries'
import type { Opportunity } from '@/lib/supabase/types'

/**
 * Encre · section dédiée Pays du Sud.
 *
 * Listing des aides accessibles aux créateurs des pays francophones du
 * Sud (zone OIF) — distinct du listing /aides qui cible la cible
 * scénariste FR métropole.
 *
 * Le tag `pays-du-sud` est appliqué par `extractPilotFields` quand la
 * source mentionne explicitement l'éligibilité OIF / TV5MONDE+ ou
 * « réservé aux auteurs des pays du Sud ».
 *
 * Nom de section provisoire : on parle de « Pays du Sud » plutôt que
 * « Francophonie » par souci de neutralité (cf décision session
 * 2026-05-13). Le nom officiel des fonds (OIF, Francophonie TV5MONDE+)
 * reste affiché tel quel sur les fiches sources.
 */

export const revalidate = 1800 // 30 min

export const metadata: Metadata = {
  title: 'Pays du Sud',
  description:
    "Aides à l'écriture et à la création audiovisuelle ouvertes aux créatrices et créateurs des pays francophones du Sud (zone OIF, TV5MONDE+). Cinéma fiction, documentaires, séries, animation.",
  alternates: { canonical: '/pays-du-sud' },
  openGraph: {
    title: "Pays du Sud · aides à l'écriture audiovisuelle",
    description:
      'Aides ouvertes aux créatrices et créateurs des pays francophones du Sud (OIF, TV5MONDE+).',
    type: 'website',
    url: '/pays-du-sud',
  },
}

export default async function PaysDuSudPage() {
  const { items: opps } = await listOpportunities({
    disciplinesTagsAny: ['pays-du-sud'],
    includeExpired: true, // les fonds OIF tournent en continu, deadline = null
    limit: 50,
    offset: 0,
  })

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
      {/* ─── TITLE BLOCK ───────────────────────────────── */}
      <div style={{ padding: '64px 0 32px' }}>
        <div
          className="mono"
          style={{
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--vermillion)',
            marginBottom: 22,
          }}
        >
          Section dédiée
        </div>
        <h1
          className="serif"
          style={{
            fontSize: 'clamp(2rem, 4.5vw, 3rem)',
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            color: 'var(--ink)',
            marginBottom: 24,
            maxWidth: '20ch',
          }}
        >
          Aides ouvertes aux créatrices et créateurs des pays du Sud.
        </h1>
        <p style={ledeStyle}>
          Encre recense aussi les fonds réservés aux ressortissants des pays
          francophones du Sud (zone OIF : Afrique, Caraïbes, Asie, Amérique
          latine). Ces aides ne sont <strong style={proseStrongStyle}>pas
          ouverts</strong> aux résidents français de métropole ; ils sont
          présentés ici pour les créatrices et créateurs qui peuvent y prétendre, et pour la
          transparence sur l\&apos;écosystème global d\&apos;aides
          francophones.
        </p>
      </div>

      {/* ─── LISTING ──────────────────────────────────── */}
      {opps.length === 0 ? (
        <EmptyState />
      ) : (
        <ol style={listStyle}>
          {opps.map((opp, idx) => (
            <Row key={opp.id} opp={opp} num={idx + 1} />
          ))}
        </ol>
      )}

      {/* ─── NOTE BAS DE PAGE ─────────────────────────── */}
      <div style={{ padding: '48px 0 96px' }}>
        <div className="disclaimer">
          <strong>Éligibilité par nationalité</strong>
          Les fonds listés ici (OIF Fonds Image, TV5MONDE+ Fonds Francophonie,
          etc.) sont réservés aux ressortissants de l&apos;un des 35 pays
          du Sud membres de l&apos;OIF. Le calendrier exact et la liste à
          jour des pays éligibles sont publiés dans le Notice annuel
          de chaque fonds. Chaque fiche pointe vers la source officielle.
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function Row({ opp, num }: { opp: Opportunity; num: number }) {
  return (
    <li
      className="opp-row-link"
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr 140px',
        gap: '12px 28px',
        alignItems: 'baseline',
        padding: '26px 0',
        borderBottom: '1px solid var(--ink-rule)',
      }}
    >
      <Link
        href={`/aides/${opp.slug}`}
        style={{
          display: 'contents',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-soft)' }}>
          #{String(num).padStart(2, '0')}
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: '0.72rem',
              letterSpacing: '0.06em',
              color: 'var(--vermillion)',
              marginBottom: 8,
            }}
          >
            {opp.emitter}
          </div>
          <span className="opp-row-title serif" style={titleStyle}>
            {opp.title}
          </span>
          {opp.description && (
            <p style={descStyle}>
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
      }}
    >
      <p style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink-muted)' }}>
        Aucun appel référencé pour le moment dans cette section.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  borderTop: '2px solid var(--ink)',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.35rem',
  fontWeight: 600,
  lineHeight: 1.25,
  color: 'var(--ink)',
  letterSpacing: '-0.008em',
  display: 'block',
}

const descStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: '0.92rem',
  lineHeight: 1.5,
  color: 'var(--ink-muted)',
}

const ledeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontFeatureSettings: '"onum"',
  fontSize: 'clamp(1rem, 1.4vw, 1.12rem)',
  lineHeight: 1.6,
  color: 'var(--ink-muted)',
  maxWidth: '64ch',
}

const proseStrongStyle: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--ink)',
}
