import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAlertProfile } from '@/features/alerts/queries'
import { listPersonalizedOpportunitiesForProfile } from '@/features/personalization/queries'
import type { PersonalizedOpportunity } from '@/features/personalization/rank'
import {
  OPPORTUNITY_TYPE_LABELS,
  type OpportunityType,
} from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount, humanDeadline } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PersonalizedAlertOpportunitiesPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/connexion?next=/mes-alertes/${id}/aides`)

  const profile = await getAlertProfile(id)
  if (!profile) notFound()

  const rows = await listPersonalizedOpportunitiesForProfile(id, { limit: 80 })

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <Link href="/mes-alertes" className="text-sm text-muted underline">
          Retour aux alertes
        </Link>
        <h1 className="font-serif mt-4 mb-2">Opportunités adaptées</h1>
        <p className="text-muted max-w-2xl">
          Lecture provisoire pour l'alerte « {profile.name} ». Cette page expose
          les données de personnalisation avant reprise UI.
        </p>
      </div>

      <div className="mb-5 text-sm text-muted">
        {rows.length} opportunité{rows.length > 1 ? 's' : ''} retenue{rows.length > 1 ? 's' : ''}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-subtle p-8 text-sm text-muted">
          Aucune opportunité ouverte ne ressort pour ce profil.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PersonalizedOpportunityRow key={row.opportunity.id} row={row} />
          ))}
        </div>
      )}
    </main>
  )
}

function PersonalizedOpportunityRow({ row }: { row: PersonalizedOpportunity }) {
  const { opportunity, reading } = row
  const typeLabel =
    OPPORTUNITY_TYPE_LABELS[opportunity.type as OpportunityType] ?? opportunity.type
  const amount = formatAmount(opportunity.amount_min, opportunity.amount_max)
  const region = opportunity.region_code ? labelForRegion(opportunity.region_code) : null
  const deadline = opportunity.deadline ? humanDeadline(opportunity.deadline) : null
  const facts = [typeLabel, amount, region, deadline].filter(Boolean).join(' · ')

  return (
    <article className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-muted mb-1">{facts}</div>
          <h2 className="font-serif text-lg">
            <Link href={`/aides/${opportunity.slug}`} className="hover:underline">
              {opportunity.title}
            </Link>
          </h2>
          <div className="text-sm text-muted mt-1">{opportunity.emitter}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-accent">{reading.decisionLabel}</div>
        </div>
      </div>

      {(reading.reasons.length > 0 || reading.warnings.length > 0) && (
        <div className="mt-4 grid gap-2 text-sm">
          {reading.reasons.map((reason) => (
            <div key={reason} className="text-foreground">
              {reason}
            </div>
          ))}
          {reading.warnings.map((warning) => (
            <div key={warning} className="text-muted">
              {warning}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
