import { createClient } from '@/lib/supabase/server'
import type { AlertProfile } from '@/features/alerts/queries'
import type { Opportunity } from '@/lib/supabase/types'
import {
  buildPersonalizedOpportunityList,
  type PersonalizedOpportunity,
} from './rank'

export interface ListPersonalizedOpportunitiesOptions {
  includeNotRecommended?: boolean
  limit?: number
  poolLimit?: number
}

export async function listPersonalizedOpportunitiesForProfile(
  profileId: string,
  options: ListPersonalizedOpportunitiesOptions = {},
): Promise<PersonalizedOpportunity[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data: profile, error: profileError } = await supabase
    .from('alert_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    if (profileError) console.error('[listPersonalizedOpportunitiesForProfile]', profileError.message)
    return []
  }

  const { data: opportunities, error: opportunitiesError } = await supabase
    .from('opportunities')
    .select('*')
    .eq('is_published', true)
    .eq('human_review', false)
    .or(`deadline.is.null,deadline.gt.${new Date().toISOString()}`)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(options.poolLimit ?? 1000)

  if (opportunitiesError) {
    console.error('[listPersonalizedOpportunitiesForProfile]', opportunitiesError.message)
    return []
  }

  return buildPersonalizedOpportunityList(
    (opportunities ?? []) as Opportunity[],
    profile as AlertProfile,
    {
      includeNotRecommended: options.includeNotRecommended,
      limit: options.limit,
    },
  )
}
