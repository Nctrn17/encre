import Link from 'next/link'
import type { Opportunity } from '@/lib/supabase/types'
import {
  OPPORTUNITY_TYPE_LABELS,
  DISCIPLINE_LABELS,
  type OpportunityType,
  type DisciplineSlug,
} from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount, humanDeadline, daysUntil } from '@/lib/utils'

export function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
  const isUrgent = o.deadline && daysUntil(o.deadline) <= 14 && daysUntil(o.deadline) >= 0
  const amount = formatAmount(o.amount_min, o.amount_max)

  return (
    <Link
      href={`/aides/${o.slug}`}
      className="block group rounded-[var(--radius-lg)] border border-subtle bg-surface p-5 hover:border-accent/40 hover:shadow-[var(--shadow)] transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          <Badge variant="accent">
            {OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType]}
          </Badge>
          {o.disciplines.slice(0, 2).map((d) => (
            <Badge key={d} variant="subtle">
              {DISCIPLINE_LABELS[d as DisciplineSlug] ?? d}
            </Badge>
          ))}
          {o.disciplines.length > 2 && (
            <Badge variant="subtle">+{o.disciplines.length - 2}</Badge>
          )}
        </div>
        {isUrgent && (
          <Badge variant="warning">
            {humanDeadline(o.deadline)}
          </Badge>
        )}
      </div>

      <h3 className="text-base font-serif font-semibold mb-2 group-hover:text-accent transition-colors line-clamp-2">
        {o.title}
      </h3>
      <div className="text-sm text-muted mb-3">{o.emitter}</div>

      {o.description && (
        <p className="text-sm text-foreground/80 line-clamp-2 mb-4 leading-relaxed">
          {o.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-muted pt-3 border-t border-subtle">
        <div className="flex items-center gap-3">
          {amount && <span>{amount}</span>}
          {o.region_code && <span>{labelForRegion(o.region_code)}</span>}
        </div>
        {o.deadline && (
          <time dateTime={o.deadline} className={isUrgent ? 'text-warning font-medium' : ''}>
            {humanDeadline(o.deadline)}
          </time>
        )}
      </div>
    </Link>
  )
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'accent' | 'subtle' | 'warning'
}) {
  const classes = {
    accent: 'bg-accent-soft text-accent',
    subtle: 'bg-subtle text-muted',
    warning: 'bg-warning-soft text-warning',
  }[variant]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {children}
    </span>
  )
}
