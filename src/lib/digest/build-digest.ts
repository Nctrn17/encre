/**
 * Construction des digests d'alertes.
 *
 * Pour chaque alert_profile actif :
 *   1. Fetch les opportunités publiées après last_sent_at (ou toutes si null)
 *   2. Filtrer via matchOpportunity + tri par score
 *   3. Limiter à N items
 *   4. Produire un payload (html + text + métadonnées) prêt à envoyer
 */

import { createServiceClient } from '@/lib/supabase/server'
import { filterOpportunitiesSinceLastSent } from '@/features/alerts/matchers'
import { readOpportunityForProfile } from '@/features/personalization/match'
import type { AlertProfile } from '@/features/alerts/queries'
import type { Opportunity } from '@/lib/supabase/types'
import { fetchPilotOpportunityPool } from './opportunity-pool'
import { isoWeekdayInParis } from './weekday'
import {
  renderDigestHtml,
  renderDigestText,
  type DigestContext,
  type DigestOpportunity,
} from './template'

export interface ScheduledProfile extends AlertProfile {
  user_email: string
}

export interface DigestPayload {
  profile: ScheduledProfile
  alertProfileIds: string[]
  opportunities: DigestOpportunity[]
  html: string
  text: string
  subject: string
}

const MAX_ITEMS_PER_DIGEST = 20

export interface BuildDigestOptions {
  /** Filtrer par frequency (par défaut toutes) */
  frequencies?: Array<'daily' | 'weekly' | 'deadline_only'>
  /** Override max items par digest */
  maxItems?: number
  /** Forcer un user spécifique (test / preview) */
  onlyUserId?: string
  /** Ignorer last_sent_at (inclut tout, pour test) */
  ignoreLastSent?: boolean
  /** Date de référence pour filtrer les envois hebdomadaires par jour ISO */
  now?: Date
  /** Active les logs intermédiaires (debug) */
  verbose?: boolean
}

export interface BuildDigestDiagnostics {
  profiles_fetched: number
  users_resolved: number
  profiles_skipped_no_email: number
  profiles_skipped_no_match: number
  opportunities_pool: number
}

/**
 * Retourne la liste des digests à envoyer + diagnostic. Ne fait PAS l'envoi.
 * Le caller (route API ou script) se charge de Resend + update last_sent_at.
 */
export async function buildPendingDigests(
  options: BuildDigestOptions = {},
): Promise<{ payloads: DigestPayload[]; diagnostics: BuildDigestDiagnostics }> {
  const supabase = createServiceClient()
  const maxItems = options.maxItems ?? MAX_ITEMS_PER_DIGEST
  const todayWeekday = isoWeekdayInParis(options.now ?? new Date())
  const log = options.verbose ? console.log : () => {}

  const diagnostics: BuildDigestDiagnostics = {
    profiles_fetched: 0,
    users_resolved: 0,
    profiles_skipped_no_email: 0,
    profiles_skipped_no_match: 0,
    opportunities_pool: 0,
  }

  // 1. Fetch les profils actifs + email du user
  let profileQuery = supabase
    .from('alert_profiles')
    .select(
      'id, user_id, name, disciplines, discipline_tags, audience, types, geo_scopes, region_codes, min_amount, frequency, send_weekday, has_producer, films_produced_count, age_range, residency_context, nationality_context, gender_context, professional_status_tags, hors_reseau_only, candidate_mode, is_active, last_sent_at, created_at',
    )
    .eq('is_active', true)

  if (options.frequencies?.length) {
    profileQuery = profileQuery.in('frequency', options.frequencies)
  }
  if (options.onlyUserId) {
    profileQuery = profileQuery.eq('user_id', options.onlyUserId)
  }

  const { data: profiles, error: profilesError } = await profileQuery
  if (profilesError) throw profilesError

  diagnostics.profiles_fetched = profiles?.length ?? 0
  log(`[build-digest] profils fetchés : ${diagnostics.profiles_fetched}`)

  if (!profiles || profiles.length === 0) {
    return { payloads: [], diagnostics }
  }

  // 2. Fetch emails des users concernés (auth.users n'est accessible qu'en service_role)
  const userIds = [...new Set((profiles as AlertProfile[]).map((p) => p.user_id))]
  log(`[build-digest] user_ids attendus : ${userIds.join(', ')}`)

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (usersError) throw usersError

  const emailMap = new Map<string, string>()
  for (const u of users.users) {
    if (userIds.includes(u.id) && u.email) emailMap.set(u.id, u.email)
  }
  diagnostics.users_resolved = emailMap.size
  log(`[build-digest] emails résolus : ${diagnostics.users_resolved}/${userIds.length}`)

  // 3. Pool d'opportunités candidates (scope V1 = mêmes exclusions que /aides).
  // Source unique partagée avec le broadcast waitlist (cf. opportunity-pool.ts).
  // Le filtrage producteur/éditeur reste DÉLÉGUÉ au matcher par profil (un user
  // avec producteur opt-in doit recevoir ces aides).
  const opps: Opportunity[] = await fetchPilotOpportunityPool(supabase)
  diagnostics.opportunities_pool = opps.length
  log(`[build-digest] pool opportunités : ${diagnostics.opportunities_pool}`)

  // 4. Pour chaque profil, construire le digest
  const payloads: DigestPayload[] = []
  for (const rawProfile of profiles as AlertProfile[]) {
    if (rawProfile.frequency === 'weekly' && rawProfile.send_weekday !== todayWeekday) {
      continue
    }

    const email = emailMap.get(rawProfile.user_id)
    if (!email) {
      diagnostics.profiles_skipped_no_email++
      log(`[build-digest] skip profil ${rawProfile.id} (user_id=${rawProfile.user_id}) : pas d'email`)
      continue
    }

    const profile: ScheduledProfile = { ...rawProfile, user_email: email }
    const filteringProfile = options.ignoreLastSent
      ? { ...profile, last_sent_at: null }
      : profile

    const matches: DigestOpportunity[] = filterOpportunitiesSinceLastSent(
      opps,
      filteringProfile,
      { logRejections: options.verbose, now: options.now },
    )
      .slice(0, maxItems)
      .map((opportunity) => {
        // Une fiche publiée AVANT le dernier envoi n'est entrée dans la
        // sélection que par la porte « ferme bientôt » → on la tague comme
        // rappel d'échéance (badge dans le template). Sinon c'est une nouveauté.
        const sinceTs = filteringProfile.last_sent_at
          ? Date.parse(filteringProfile.last_sent_at)
          : null
        const reminderReason: 'new' | 'closing_soon' =
          sinceTs !== null && Date.parse(opportunity.published_at) <= sinceTs
            ? 'closing_soon'
            : 'new'
        return {
          ...opportunity,
          matchReading: readOpportunityForProfile(opportunity, profile),
          reminderReason,
        }
      })
    log(`[build-digest] profil "${profile.name}" : ${matches.length} matches`)
    if (options.verbose) {
      log(
        `[build-digest] profil criteria :`,
        JSON.stringify(
          {
            disciplines: profile.disciplines,
            types: profile.types,
            geo_scopes: profile.geo_scopes,
            region_codes: profile.region_codes,
            min_amount: profile.min_amount,
          },
          null,
          2,
        ),
      )
    }

    if (matches.length === 0) {
      diagnostics.profiles_skipped_no_match++
      continue
    }

    const ctx: DigestContext = {
      profileName: profile.name,
      opportunities: matches,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000',
      unsubscribeUrl: `${
        process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000'
      }/mes-alertes`,
    }

    const html = renderDigestHtml(ctx)
    const text = renderDigestText(ctx)
    const soonCount = matches.filter((m) => m.reminderReason === 'closing_soon').length
    const subject = buildSubject(profile.name, matches.length - soonCount, soonCount)

    payloads.push({
      profile,
      alertProfileIds: [profile.id],
      opportunities: matches,
      html,
      text,
      subject,
    })
  }

  return { payloads, diagnostics }
}

function buildSubject(profileName: string, newCount: number, soonCount: number): string {
  const total = newCount + soonCount
  // Que des nouveautés.
  if (soonCount === 0) {
    return total === 1
      ? `1 nouvelle opportunité · ${profileName}`
      : `${total} nouvelles opportunités · ${profileName}`
  }
  // Que des rappels d'échéance.
  if (newCount === 0) {
    return soonCount === 1
      ? `1 opportunité ferme bientôt · ${profileName}`
      : `${soonCount} opportunités ferment bientôt · ${profileName}`
  }
  // Mélange des deux : on ne ment pas en disant « nouvelles ».
  return `${total} opportunités à suivre · ${profileName}`
}

/**
 * Marque un digest comme envoyé (update last_sent_at).
 * Appelé par le caller après succès Resend.
 */
export async function markDigestSent(alertProfileId: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('alert_profiles')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', alertProfileId)
}
