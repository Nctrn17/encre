/**
 * Pool d'opportunités candidates pour les envois email (digests + broadcast).
 *
 * MÊMES exclusions que le listing public /aides (cf. listOpportunities +
 * pilot-defaults) : on ne met JAMAIS dans un email une fiche que /aides ne
 * montrerait pas. Historiquement le pool ne filtrait que is_published + non
 * expiré, d'où des fiches hors-scope / sans dates (awaiting_details) qui
 * fuyaient en digest alors qu'elles sont cachées du registre public.
 *
 * Le filtrage producteur/éditeur reste DÉLÉGUÉ au matcher par profil pour les
 * digests (un user avec producteur opt-in doit recevoir ces aides). Le broadcast
 * waitlist, lui, n'applique pas de filtrage producteur (audience non profilée) —
 * il prend le pool tel quel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Opportunity } from '@/lib/supabase/types'
import { PILOT_SCENARISTE_TAGS, LISTING_DEFAULT_EXCLUDE_TAGS } from '@/lib/pilot-defaults'

const POOL_LIMIT = 1000

/**
 * Charge le pool d'opportunités publiées et dans le scope V1, ordonnées par
 * date de publication décroissante. `now` permet de figer l'horloge en test.
 */
export async function fetchPilotOpportunityPool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  options: { now?: Date } = {},
): Promise<Opportunity[]> {
  const nowIso = (options.now ?? new Date()).toISOString()

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('is_published', true)
    .eq('human_review', false)
    // Registre = appels datés seulement : exclut les fiches awaiting_details
    // sans dates publiées (garde-fou anti-zombie : OK si deadline future).
    .or(`next_edition_status.is.null,next_edition_status.neq.awaiting_details,deadline.gt.${nowIso}`)
    .or(`deadline.is.null,deadline.gt.${nowIso}`)
    // Scope V1 (tags AV) + exclusions par défaut du registre (non-scenariste).
    .overlaps('disciplines_tags', [...PILOT_SCENARISTE_TAGS])
    .not('disciplines_tags', 'ov', `{${[...LISTING_DEFAULT_EXCLUDE_TAGS].join(',')}}`)
    .order('published_at', { ascending: false })
    .limit(POOL_LIMIT)

  if (error) throw error
  return (data ?? []) as Opportunity[]
}
