import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { Opportunity } from '@/lib/supabase/types'
import {
  OPPORTUNITY_TYPE_LABELS,
  DISCIPLINE_LABELS,
  type OpportunityType,
  type DisciplineSlug,
} from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount, humanDeadline, daysUntil } from '@/lib/utils'

/**
 * Carte d'opportunité au style Plateau (hubs /disciplines, /regions, favoris).
 *
 * Styles inline en dark-on-light (tokens --ink / --vermillion / --kelp) pour un
 * rendu correct sur fond cream sans dépendre d'un wrapper `.band-*`. Le hover
 * (bordure vermillon) est porté par la classe `.opp-card-link` (globals.css).
 */
export function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
  const dleft = o.deadline ? daysUntil(o.deadline) : null
  const isUrgent = dleft !== null && dleft >= 0 && dleft <= 14
  const isPast = dleft !== null && dleft < 0
  const amount = formatAmount(o.amount_min, o.amount_max)
  const firstDiscipline = o.disciplines[0]
  const discipline = firstDiscipline
    ? (DISCIPLINE_LABELS[firstDiscipline as DisciplineSlug] ?? firstDiscipline)
    : null
  const deadlineColor = isUrgent
    ? 'var(--vermillion)'
    : isPast
      ? 'var(--kelp)'
      : 'var(--ink)'

  return (
    <Link href={`/aides/${o.slug}`} className="opp-card-link" style={cardStyle}>
      <div style={emitStyle}>
        <span style={{ color: 'var(--ink)' }}>{o.emitter}</span>
        {discipline && (
          <>
            <span style={sepStyle}>·</span>
            {discipline}
          </>
        )}
      </div>

      <h3 style={titleStyle}>{o.title}</h3>

      {o.description && <p style={summaryStyle}>{o.description}</p>}

      <div style={factsStyle}>
        <Cell label="Type" value={OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType]} />
        <Cell label="Montant" value={amount ?? 'Voir le règlement'} />
        {o.region_code && <Cell label="Région" value={labelForRegion(o.region_code)} />}
        <Cell
          label="Échéance"
          value={o.deadline ? humanDeadline(o.deadline) : 'Voir le règlement'}
          valueColor={deadlineColor}
        />
      </div>
    </Link>
  )
}

function Cell({
  label,
  value,
  valueColor = 'var(--ink)',
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div style={cellStyle}>
      <span style={cellLabelStyle}>{label}</span>
      <span style={{ ...cellValueStyle, color: valueColor }}>{value}</span>
    </div>
  )
}

const cardStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: '22px 24px 18px',
  border: '1px solid var(--ink-rule)',
  background: 'rgba(255, 255, 255, 0.4)',
  textDecoration: 'none',
  color: 'inherit',
  height: '100%',
  transition: 'border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
}

const emitStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
}

const sepStyle: CSSProperties = { color: 'var(--ink-muted)', margin: '0 8px' }

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 500,
  fontSize: 22,
  lineHeight: 1.15,
  letterSpacing: '-0.012em',
  color: 'var(--ink)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const summaryStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 14.5,
  lineHeight: 1.5,
  color: 'var(--ink-muted)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const factsStyle: CSSProperties = {
  borderTop: '1px solid var(--ink-rule)',
  paddingTop: 14,
  marginTop: 2,
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px 28px',
  fontFamily: 'var(--font-mono)',
}

const cellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }

const cellLabelStyle: CSSProperties = {
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
}

const cellValueStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.04em',
  fontVariantNumeric: 'tabular-nums lining-nums',
}
