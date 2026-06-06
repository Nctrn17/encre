import { createClient } from '@/lib/supabase/server'

export interface AlertProfile {
  id: string
  user_id: string
  name: string
  disciplines: string[]
  discipline_tags: string[]
  audience: string[]
  types: string[]
  geo_scopes: string[]
  region_codes: string[]
  min_amount: number | null
  frequency: 'daily' | 'weekly' | 'deadline_only'
  send_weekday: number
  has_producer: boolean | null
  films_produced_count: number | null
  age_range: 'under_30' | '30_45' | 'over_45' | 'not_specified' | null
  residency_context: 'france_metropole' | 'outremer' | 'pays_du_sud' | 'international' | 'not_specified'
  nationality_context: 'france' | 'foreign' | 'pays_du_sud' | 'not_specified'
  gender_context: 'woman' | 'gender_minority' | 'woman_or_gender_minority' | 'not_specified'
  professional_status_tags: string[]
  hors_reseau_only: boolean
  candidate_mode: 'strict' | 'balanced' | 'wide'
  is_active: boolean
  last_sent_at: string | null
  created_at: string
}

/**
 * Liste des profils d'alerte de l'utilisateur connecté.
 * Retourne [] si non connecté (pas d'erreur levée — UX plus douce).
 */
export async function listUserAlertProfiles(): Promise<AlertProfile[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
    .from('alert_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[listUserAlertProfiles]', error.message)
    return []
  }
  return (data as AlertProfile[]) ?? []
}

export async function getAlertProfile(id: string): Promise<AlertProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('alert_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  return (data as AlertProfile) ?? null
}

