import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { listUserAlertProfiles } from '@/features/alerts/queries'
import { OnboardingStepper } from './OnboardingStepper'

export const metadata: Metadata = {
  title: 'Composer une veille',
  description:
    'Discipline, situation, géographie, et vous recevez les bonnes aides.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/connexion?next=/onboarding')
  }

  const existingProfiles = await listUserAlertProfiles()

  return (
    <div className="band-charcoal">
      {/* HERO */}
      <section className="band-charcoal pinstripe-bg relative overflow-hidden">
        <div className="grain" />
        <span className="crop-mark tl" />
        <span className="crop-mark tr" />

        <div className="max-w-[1200px] mx-auto px-6 sm:px-12 pt-20 sm:pt-24 pb-12 sm:pb-16 relative">
          <div className="slug mb-6 sm:mb-8">Composer une veille · édition courante</div>
          <h1
            className="fraunces hang"
            style={{
              fontSize: 'clamp(40px, 6.8vw, 108px)',
              lineHeight: 0.96,
              fontWeight: 400,
              letterSpacing: '-0.025em',
              maxWidth: '20ch',
            }}
          >
            Trois réponses,
            <br />
            <span style={{ color: 'var(--vermillion)' }}>
              et vous recevez les bonnes aides.
            </span>
          </h1>

          <div
            className="mt-8 sm:mt-10 max-w-[700px] prose-charcoal"
            style={{
              fontSize: 'clamp(15px, 1.4vw, 18px)',
              color: 'var(--muted-cream)',
              lineHeight: 1.65,
            }}
          >
            Indiquer la discipline, la zone géographique, et la cadence qui vous
            concernent. La base filtre. Vous recevez uniquement les guichets qui
            correspondent : ni newsletter générique, ni contenu sponsorisé, ni
            revente d&apos;adresses.
          </div>
        </div>
      </section>

      {/* STEPPER - rendu par le client component */}
      <OnboardingStepper existingProfiles={existingProfiles} />
    </div>
  )
}
