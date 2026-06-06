/**
 * Construction du broadcast waitlist.
 *
 * Cible : les adresses inscrites à la waitlist qui n'ont PAS de compte avec une
 * veille active. Elles reçoivent chaque semaine les opportunités publiées depuis
 * le dernier envoi (non personnalisées — audience non profilée).
 *
 * Découpage produit (cf. décision 2026-06-04) :
 *   - Mail seul (waitlist)  → toutes les nouvelles opps publiées (scope V1).
 *   - Compte + veille active → digest personnalisé (cf. build-digest.ts).
 *
 * Dédup : si une adresse waitlist correspond à un compte avec une veille active,
 * on COUPE le broadcast générique (le digest perso prime, pas de double mail).
 *
 * Borne « nouveau depuis » = last_broadcast_at. Au TOUT PREMIER envoi (jamais
 * broadcasté), on envoie les opps en cours (plafonné à MAX_ITEMS_PER_BROADCAST),
 * quelle que soit la date d'inscription — sinon un inscrit arrivé après la
 * dernière publication ne recevrait jamais son premier mail. Les envois suivants
 * ne contiennent que les nouveautés depuis le dernier envoi.
 *
 * Ne fait PAS l'envoi : le caller (send-broadcast.ts) gère Resend + l'update de
 * last_broadcast_at.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { getSiteUrl, absoluteUrl } from '@/lib/site'
import type { Opportunity } from '@/lib/supabase/types'
import { fetchPilotOpportunityPool } from './opportunity-pool'
import {
  renderBroadcastHtml,
  renderBroadcastText,
  type DigestOpportunity,
} from './template'

export const MAX_ITEMS_PER_BROADCAST = 20

export interface WaitlistSubscriber {
  email: string
  created_at: string
  last_broadcast_at: string | null
  unsub_token: string
}

export interface BroadcastPayload {
  email: string
  unsubToken: string
  opportunities: DigestOpportunity[]
  html: string
  text: string
  subject: string
}

export interface BuildBroadcastOptions {
  /** Override max items par broadcast */
  maxItems?: number
  /** Ignorer last_broadcast_at (rejouer un envoi, pour test/preview) */
  ignoreLastSent?: boolean
  /** Date de référence (test) */
  now?: Date
  /** Logs intermédiaires */
  verbose?: boolean
}

export interface BuildBroadcastDiagnostics {
  subscribers_active: number
  subscribers_skipped_has_veille: number
  subscribers_skipped_no_new: number
  opportunities_pool: number
}

/**
 * Sélectionne les opportunités publiées strictement après `sinceIso`, triées par
 * date de publication décroissante et plafonnées à `max`. Fonction pure (testable
 * sans DB). `sinceIso = null` → tout le pool (plafonné).
 */
export function selectNewOpportunities(
  pool: Opportunity[],
  sinceIso: string | null,
  max: number,
): Opportunity[] {
  const sinceTs = sinceIso ? Date.parse(sinceIso) : null
  return pool
    .filter((o) => {
      if (sinceTs === null) return true
      const pub = Date.parse(o.published_at)
      return Number.isFinite(pub) && pub > sinceTs
    })
    .slice()
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, max)
}

// Sujet du tout premier mail (starter) : pas de nombre — le corps montre une
// sélection (plafonnée) et un bouton renvoie au registre complet.
const STARTER_SUBJECT = 'Les opportunités ouvertes en ce moment · Encre'

function buildSubject(count: number): string {
  return count === 1
    ? '1 nouvelle opportunité · Encre'
    : `${count} nouvelles opportunités · Encre`
}

/**
 * Ensemble (lowercase) des emails ayant au moins une veille active.
 * Ces adresses sont servies par le digest personnalisé → exclues du broadcast.
 */
async function fetchEmailsWithActiveVeille(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
): Promise<Set<string>> {
  const { data: profiles, error } = await supabase
    .from('alert_profiles')
    .select('user_id')
    .eq('is_active', true)
  if (error) throw error

  const userIds = new Set((profiles ?? []).map((p: { user_id: string }) => p.user_id))
  if (userIds.size === 0) return new Set()

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (usersError) throw usersError

  const emails = new Set<string>()
  for (const u of users.users) {
    if (u.email && userIds.has(u.id)) emails.add(u.email.toLowerCase())
  }
  return emails
}

/**
 * Retourne les broadcasts à envoyer + diagnostic. Ne fait PAS l'envoi.
 */
export async function buildWaitlistBroadcasts(
  options: BuildBroadcastOptions = {},
): Promise<{ payloads: BroadcastPayload[]; diagnostics: BuildBroadcastDiagnostics }> {
  const supabase = createServiceClient()
  const maxItems = options.maxItems ?? MAX_ITEMS_PER_BROADCAST
  const siteUrl = getSiteUrl()
  const createAlertUrl = absoluteUrl('/onboarding')
  const log = options.verbose ? console.log : () => {}

  const diagnostics: BuildBroadcastDiagnostics = {
    subscribers_active: 0,
    subscribers_skipped_has_veille: 0,
    subscribers_skipped_no_new: 0,
    opportunities_pool: 0,
  }

  // 1. Abonnés actifs (non désinscrits).
  const { data: rows, error } = await supabase
    .from('waitlist')
    .select('email, created_at, last_broadcast_at, unsub_token')
    .is('unsubscribed_at', null)
  if (error) throw error

  const subscribers = (rows ?? []) as WaitlistSubscriber[]
  diagnostics.subscribers_active = subscribers.length
  if (subscribers.length === 0) {
    return { payloads: [], diagnostics }
  }

  // 2. Emails déjà couverts par une veille → exclus (le digest perso prime).
  const veilleEmails = await fetchEmailsWithActiveVeille(supabase)

  // 3. Pool d'opportunités (scope V1, identique à /aides et aux digests).
  const pool = await fetchPilotOpportunityPool(supabase, { now: options.now })
  diagnostics.opportunities_pool = pool.length

  // 4. Un broadcast par abonné.
  const payloads: BroadcastPayload[] = []
  for (const sub of subscribers) {
    if (veilleEmails.has(sub.email.toLowerCase())) {
      diagnostics.subscribers_skipped_has_veille++
      continue
    }

    // 1er broadcast (jamais envoyé) → starter : les opps en cours (since=null,
    // plafonné à maxItems), quelle que soit la date d'inscription. Sinon un
    // inscrit arrivé APRÈS la dernière publication ne recevrait jamais rien.
    // Ensuite → nouveau depuis le dernier envoi.
    const isStarter = !sub.last_broadcast_at
    const since = options.ignoreLastSent ? null : sub.last_broadcast_at
    const newOpps = selectNewOpportunities(pool, since, maxItems)
    if (newOpps.length === 0) {
      diagnostics.subscribers_skipped_no_new++
      continue
    }

    const opportunities: DigestOpportunity[] = newOpps.map((o) => ({
      ...o,
      reminderReason: 'new' as const,
    }))

    const unsubscribeUrl = `${siteUrl}/api/waitlist/unsubscribe?token=${sub.unsub_token}`
    const ctx = { opportunities, siteUrl, unsubscribeUrl, createAlertUrl }

    payloads.push({
      email: sub.email,
      unsubToken: sub.unsub_token,
      opportunities,
      html: renderBroadcastHtml(ctx),
      text: renderBroadcastText(ctx),
      subject: isStarter ? STARTER_SUBJECT : buildSubject(opportunities.length),
    })
  }

  log(`[build-broadcast] ${payloads.length} broadcasts à envoyer`)
  return { payloads, diagnostics }
}

/**
 * Marque un broadcast comme envoyé (update last_broadcast_at par jeton).
 * Appelé par le caller après succès Resend.
 */
export async function markBroadcastSent(unsubToken: string, now?: Date): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('waitlist')
    .update({ last_broadcast_at: (now ?? new Date()).toISOString() })
    .eq('unsub_token', unsubToken)
}
