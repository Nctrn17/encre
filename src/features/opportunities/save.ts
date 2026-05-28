'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleSaveOpportunity(opportunityId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Vous devez être connecté·e pour sauvegarder des opportunités' }
  }

  const { data: existing } = await supabase
    .from('saved_opportunities')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('opportunity_id', opportunityId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('saved_opportunities')
      .delete()
      .eq('user_id', user.id)
      .eq('opportunity_id', opportunityId)
    revalidatePath('/mes-favoris')
    return { saved: false }
  }

  await supabase.from('saved_opportunities').insert({
    user_id: user.id,
    opportunity_id: opportunityId,
  })
  revalidatePath('/mes-favoris')
  return { saved: true }
}

export async function listSavedOpportunities() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data } = await supabase
    .from('saved_opportunities')
    .select('opportunity_id, saved_at, note, opportunities(*)')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false })

  return data ?? []
}
