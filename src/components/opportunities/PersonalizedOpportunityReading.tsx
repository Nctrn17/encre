'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Level = 'strong' | 'possible' | 'difficult' | 'not_recommended'

interface ReadingRow {
  profile: {
    id: string
    name: string
  }
  retained: boolean
  rejectionReasons: string[]
  reading: {
    level: Level
    score: number
    decisionLabel: string
    reasons: string[]
    warnings: string[]
  }
}

interface ApiPayload {
  authenticated: boolean
  readings: ReadingRow[]
  error?: string
}

const LEVEL_SHORT: Record<Level, string> = {
  strong: 'Très adapté',
  possible: 'Possible',
  difficult: 'Exigeant',
  not_recommended: 'Non retenu',
}

const REJECTION_PHRASES: Record<string, string> = {
  discipline: 'Format différent de votre veille.',
  audience: 'Public visé non couvert par votre veille.',
  type: "Type d'opportunité non suivi.",
  geo: 'Hors de la zone configurée.',
  geo_scope: 'Portée géographique non suivie.',
  min_amount: 'En dessous du montant minimum que vous suivez.',
  personalization: 'Votre situation actuelle ne correspond pas aux critères.',
}

export function PersonalizedOpportunityReading({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<ApiPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(
          `/api/opportunities/${encodeURIComponent(slug)}/personalization`,
          { cache: 'no-store' },
        )
        if (!response.ok) throw new Error('Lecture personnalisée indisponible')
        const data = (await response.json()) as ApiPayload
        if (!cancelled) setPayload(data)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [slug])

  if (error || !payload || !payload.authenticated) return null

  if (payload.readings.length === 0) {
    return (
      <section className="perso-reading">
        <Header />
        <p style={bodyStyle}>
          Aucune alerte active pour le moment.{' '}
          <Link href="/onboarding" style={linkStyle}>
            Composer une veille
          </Link>
          .
        </p>
      </section>
    )
  }

  const retained = payload.readings.filter((row) => row.retained)
  const displayed = retained.length > 0 ? retained : payload.readings.slice(0, 3)

  return (
    <section className="perso-reading">
      <Header />
      {retained.length === 0 && (
        <p style={bodyStyle}>
          Aucune alerte active ne retient cette opportunité. Les lignes
          ci-dessous indiquent les principaux points de friction.
        </p>
      )}

      <div style={listStyle}>
        {displayed.map((row) => (
          <article key={row.profile.id} className="perso-reading__row">
            <div style={rowHeadStyle}>
              <Link
                href={`/mes-alertes/${row.profile.id}/aides`}
                className="perso-reading__profile"
              >
                {row.profile.name}
              </Link>
              <span
                className="perso-reading__level"
                data-level={row.reading.level}
              >
                {LEVEL_SHORT[row.reading.level]}
              </span>
            </div>
            <div style={labelStyle}>{row.reading.decisionLabel}</div>

            {row.reading.reasons.length > 0 && (
              <ul style={messageListStyle}>
                {row.reading.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}

            {row.reading.warnings.length > 0 && (
              <ul style={{ ...messageListStyle, color: 'var(--ink-muted)' }}>
                {row.reading.warnings.slice(0, 2).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            {!row.retained && row.rejectionReasons.length > 0 && (
              <div style={rejectionStyle}>
                {REJECTION_PHRASES[row.rejectionReasons[0]] ??
                  'Cette opportunité ne correspond pas à cette alerte.'}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function Header() {
  return (
    <>
      <div style={eyebrowStyle}>Lecture personnalisée</div>
      <h2 style={titleStyle}>Pourquoi cette opportunité apparaît ici</h2>
    </>
  )
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--vermillion)',
  marginBottom: 8,
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.35rem',
  lineHeight: 1.15,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--ink)',
  marginBottom: 16,
}

const bodyStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.55,
  color: 'var(--ink-muted)',
  margin: 0,
}

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
}

const rowHeadStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 16,
}

const labelStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: '0.9rem',
  color: 'var(--ink-muted)',
}

const messageListStyle: React.CSSProperties = {
  margin: '10px 0 0',
  paddingLeft: 18,
  fontSize: '0.9rem',
  lineHeight: 1.5,
  color: 'var(--ink)',
}

const rejectionStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: '0.85rem',
  fontStyle: 'italic',
  color: 'var(--ink-muted)',
}

const linkStyle: React.CSSProperties = {
  color: 'var(--ink)',
  borderBottom: '1px solid var(--vermillion)',
  textDecoration: 'none',
}
