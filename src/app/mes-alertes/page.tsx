import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { listUserAlertProfiles } from '@/features/alerts/queries'
import { AlertProfileCard } from '@/components/alerts/AlertProfileCard'

export const metadata: Metadata = {
  title: 'Mes alertes',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ welcome?: string }>
}

export default async function MesAlertesPage({ searchParams }: PageProps) {
  const { welcome } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/connexion?next=/mes-alertes')

  const profiles = await listUserAlertProfiles()

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif mb-2">Mes alertes</h1>
          <p className="text-muted max-w-xl">
            Chaque alerte déclenche un email périodique avec les opportunités correspondant à ses
            critères. Plusieurs alertes peuvent coexister (une par projet, par discipline, etc.).
          </p>
        </div>
        <Link
          href="/onboarding"
          className="inline-flex items-center px-5 py-2.5 rounded-[var(--radius)] bg-accent text-white text-sm font-medium hover:bg-accent-hover whitespace-nowrap"
        >
          + Nouvelle alerte
        </Link>
      </header>

      {welcome && profiles.length > 0 && (
        <div className="mb-8 p-4 rounded-[var(--radius-lg)] bg-accent-soft border border-accent/20">
          <div className="font-medium text-accent mb-1">Alerte configurée.</div>
          <p className="text-sm text-foreground/80">
            Le premier email arrivera avec la prochaine revue de la semaine. En attendant, les
            opportunités correspondant à ce profil sont consultables dans{' '}
            <Link href="/aides" className="underline">
              la liste des opportunités
            </Link>
            .
          </p>
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-subtle p-12 text-center">
          <div className="font-medium mb-2">Aucune alerte configurée pour l'instant.</div>
          <p className="text-sm text-muted mb-6">
            Une alerte permet de recevoir par email les nouvelles opportunités qui correspondent à
            un profil précis (discipline, géographie, type).
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center px-5 py-2.5 rounded-[var(--radius)] bg-accent text-white text-sm font-medium hover:bg-accent-hover"
          >
            Configurer une première alerte
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((p) => (
            <AlertProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </div>
  )
}
