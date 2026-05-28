import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { listSavedOpportunities } from '@/features/opportunities/save'
import { OpportunityCard } from '@/components/opportunities/OpportunityCard'
import type { Opportunity } from '@/lib/supabase/types'

export const metadata: Metadata = {
  title: 'Mes favoris',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function MesFavorisPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/connexion?next=/mes-favoris')

  const saved = await listSavedOpportunities()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-serif mb-3">Mes favoris</h1>
      <p className="text-muted mb-8">
        Les opportunités que vous avez mises de côté pour y revenir plus tard.
      </p>

      {saved.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-subtle p-12 text-center text-muted">
          Aucun favori pour l'instant. Parcourez les{' '}
          <a href="/aides" className="text-accent hover:underline">
            opportunités
          </a>{' '}
          et ajoutez-en en cliquant sur l'étoile.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {saved.map((row: any) => (
            <OpportunityCard
              key={row.opportunity_id}
              opportunity={row.opportunities as Opportunity}
            />
          ))}
        </div>
      )}
    </div>
  )
}
