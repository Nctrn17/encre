import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAlertProfile } from '@/features/alerts/queries'
import { EditAlertProfileForm } from '@/components/alerts/EditAlertProfileForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ModifierAlertePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/connexion?next=/mes-alertes/${id}/modifier`)

  const profile = await getAlertProfile(id)
  if (!profile) redirect('/mes-alertes')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-8">
        <Link href="/mes-alertes" className="text-sm text-muted underline">
          Retour aux alertes
        </Link>
        <h1 className="font-serif mt-4 mb-2">Modifier une alerte</h1>
        <p className="text-muted max-w-xl">
          Ajuster les formats, la situation, la zone géographique et le jour d'envoi.
        </p>
      </header>

      <EditAlertProfileForm profile={profile} />
    </div>
  )
}
