import Link from 'next/link'
import type { Metadata } from 'next'
import { listOpportunities } from '@/features/opportunities/queries'
import type { Opportunity } from '@/lib/supabase/types'

/**
 * Encre · section dédiée Outre-mer.
 *
 * Listing des aides spécifiquement ouvertes aux auteurs ultra-marins,
 * OU des aides métropolitaines qui couvrent transport/logement pour
 * les candidats d'outre-mer (signal d'accessibilité critique).
 *
 * Pour rappel : les auteurs ultra-marins sont éligibles aux aides FR
 * métropole, mais le ticket d'avion + le logement à Paris pour une
 * résidence d'un mois sont un mur structurel. Cette section sépare
 * deux choses utiles à ces candidats :
 *   1. Les aides ciblées (DRAC Guadeloupe, Martinique, Réunion, etc.)
 *   2. Les aides métropolitaines avec couverture transport/logement
 *      (taguées `outremer` par le matcher).
 */

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Outre-mer',
  description:
    'Aides spécifiques outre-mer (DROM-COM) et aides métropolitaines accessibles aux autrices et auteurs ultra-marins (transport et logement couverts).',
  alternates: { canonical: '/outremer' },
  openGraph: {
    title: "Outre-mer · aides à l'écriture pour les autrices et auteurs d'outre-mer",
    description:
      'Aides spécifiques DROM-COM et aides métropolitaines avec transport ou logement couverts.',
    type: 'website',
    url: '/outremer',
  },
}

export default async function OutremerPage() {
  const { items: opps } = await listOpportunities({
    disciplinesTagsAny: ['outremer'],
    includeExpired: true,
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
          Aides ouvertes aux créatrices et créateurs d&apos;outre-mer.
        </h1>
        <p style={ledeStyle}>
          Techniquement, une autrice ou un auteur de Guadeloupe ou de la Réunion peut candidater
          à une résidence en Bretagne, mais le billet d&apos;avion plus le
          logement sur place rendent la plupart de ces aides{' '}
          <strong style={proseStrongStyle}>structurellement
          inaccessibles</strong>. Cette section regroupe deux choses utiles
          aux créatrices et créateurs ultra-marins : les aides ciblées des collectivités
          DROM-COM, et les aides métropolitaines qui couvrent
          explicitement les frais de transport et d&apos;hébergement.
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
          <strong>Couverture partielle</strong>
          Encre référence aujourd&apos;hui les principales aides des
          5 DROM (Guadeloupe, Guyane, Martinique, Réunion, Mayotte) et l&apos;aide
          sélective CNC pour les cultures d&apos;outre-mer. Pas encore : Polynésie
          française, Kanaky, Wallis-et-Futuna, Saint-Pierre-et-Miquelon.
          Si vous connaissez des aides actives sur ces territoires, écrivez-nous
          via{' '}
          <Link href="/contact" style={{ color: 'var(--vermillion)' }}>
            la page contact
          </Link>
          .
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents (identique à /pays-du-sud, à factoriser plus tard)
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
        Aucun appel référencé pour le moment.
      </p>
    </div>
  )
}

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
