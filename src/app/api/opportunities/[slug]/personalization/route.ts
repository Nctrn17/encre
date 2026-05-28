import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AlertProfile } from '@/features/alerts/queries'
import type { Opportunity } from '@/lib/supabase/types'
import { matchOpportunity } from '@/features/alerts/matchers'
import { readOpportunityForProfile } from '@/features/personalization/match'

export const dynamic = 'force-dynamic'

interface RouteProps {
  params: Promise<{ slug: string }>
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ authenticated: false, readings: [] })
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from('opportunities')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('human_review', false)
    .maybeSingle()

  if (opportunityError) {
    console.error('[opportunity-personalization]', opportunityError.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }

  if (!opportunity) {
    return NextResponse.json({ error: 'Opportunité introuvable' }, { status: 404 })
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('alert_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (profilesError) {
    console.error('[opportunity-personalization]', profilesError.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }

  const rows = ((profiles ?? []) as AlertProfile[])
    .map((profile) => {
      const reading = readOpportunityForProfile(opportunity as Opportunity, profile)
      const strictMatch = matchOpportunity(opportunity as Opportunity, profile)
      return {
        profile: {
          id: profile.id,
          name: profile.name,
        },
        retained: strictMatch.match && reading.level !== 'not_recommended',
        rejectionReasons: strictMatch.match ? [] : strictMatch.reasons,
        reading,
      }
    })
    .sort((a, b) => {
      if (a.retained !== b.retained) return a.retained ? -1 : 1
      return b.reading.score - a.reading.score
    })

  return NextResponse.json({ authenticated: true, readings: rows })
}
