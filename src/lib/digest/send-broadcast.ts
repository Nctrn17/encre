import { Resend } from 'resend'
import { getSiteUrl, absoluteUrl } from '@/lib/site'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPilotOpportunityPool } from './opportunity-pool'
import { renderBroadcastHtml, renderBroadcastText, type DigestOpportunity } from './template'
import {
  buildWaitlistBroadcasts,
  markBroadcastSent,
  selectNewOpportunities,
  MAX_ITEMS_PER_BROADCAST,
  type BroadcastPayload,
  type BuildBroadcastDiagnostics,
} from './build-broadcast'

export interface BroadcastResult {
  total_subscribers: number
  emails_sent: number
  skipped_empty: number
  errors: Array<{ email: string; message: string }>
  preview_mode: boolean
  diagnostics: BuildBroadcastDiagnostics
}

export interface BroadcastSendOptions {
  /** Construit sans envoyer (renvoie un échantillon de payloads) */
  preview?: boolean
  /** Détourne tous les mails vers cette adresse (test) — ne marque pas envoyé */
  overrideRecipient?: string
  /** Ignorer last_broadcast_at (rejouer, test) */
  ignoreLastSent?: boolean
  /** Date de référence (test) */
  now?: Date
  /** Logs intermédiaires */
  verbose?: boolean
}

/**
 * Build + send du broadcast waitlist. Appelé par /api/cron/waitlist-broadcast.
 *
 * En mode preview (ou si Resend non configuré) : ne fait que construire les
 * emails, retourne le count + un échantillon dans `preview_payloads`.
 */
export async function runBroadcastCycle(
  options: BroadcastSendOptions = {},
): Promise<BroadcastResult & { preview_payloads?: BroadcastPayload[] }> {
  const { payloads, diagnostics } = await buildWaitlistBroadcasts({
    ignoreLastSent: options.ignoreLastSent,
    now: options.now,
    verbose: options.verbose,
  })

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const effectivePreview = options.preview || !apiKey || !fromEmail
  const siteUrl = getSiteUrl()

  const result: BroadcastResult & { preview_payloads?: BroadcastPayload[] } = {
    total_subscribers: diagnostics.subscribers_active,
    emails_sent: 0,
    skipped_empty: diagnostics.subscribers_skipped_no_new,
    errors: [],
    preview_mode: effectivePreview,
    diagnostics,
  }

  if (effectivePreview) {
    result.preview_payloads = payloads
    return result
  }

  const resend = new Resend(apiKey)

  for (const payload of payloads) {
    const recipient = options.overrideRecipient ?? payload.email
    const unsubUrl = `${siteUrl}/api/waitlist/unsubscribe?token=${payload.unsubToken}`

    try {
      const { error } = await resend.emails.send({
        from: fromEmail!,
        to: recipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        // Désinscription native (Gmail/Apple Mail) — one-click RFC 8058.
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (error) {
        result.errors.push({ email: recipient, message: error.message ?? 'Resend error' })
        continue
      }

      if (!options.overrideRecipient) {
        // Ne pas marquer envoyé si on a détourné vers un mail de test.
        await markBroadcastSent(payload.unsubToken, options.now)
      }

      result.emails_sent++
    } catch (err) {
      result.errors.push({ email: recipient, message: (err as Error).message })
    }
  }

  return result
}

export interface BroadcastPreviewResult {
  recipient: string
  opportunities: number
  preview_mode: boolean
  sent: boolean
  error?: string
}

const PLACEHOLDER_TOKEN = '00000000-0000-0000-0000-000000000000'

/**
 * Envoi de VALIDATION à une seule adresse (avant le broadcast réel à tous).
 *
 * Construit UN broadcast représentatif (les ~20 opps les plus récentes du scope,
 * présentées comme nouveautés) et l'envoie uniquement au destinataire indiqué.
 * N'écrit RIEN en base (aucun last_broadcast_at), n'envoie à personne d'autre.
 *
 * Le contenu illustre le format ; le broadcast réel cadre par abonné selon sa
 * date d'inscription (cf. buildWaitlistBroadcasts), donc la liste exacte peut
 * varier d'un abonné à l'autre.
 */
export async function runBroadcastPreviewTo(
  recipient: string,
  options: { now?: Date } = {},
): Promise<BroadcastPreviewResult> {
  const supabase = createServiceClient()
  const pool = await fetchPilotOpportunityPool(supabase, { now: options.now })
  const opportunities: DigestOpportunity[] = selectNewOpportunities(
    pool,
    null,
    MAX_ITEMS_PER_BROADCAST,
  ).map((o) => ({ ...o, reminderReason: 'new' as const }))

  // Jeton réel si le destinataire est déjà inscrit (lien de désinscription
  // fonctionnel), sinon placeholder (preview).
  const { data: row } = await supabase
    .from('waitlist')
    .select('unsub_token')
    .eq('email', recipient.toLowerCase())
    .maybeSingle()
  const unsubToken = (row as { unsub_token?: string } | null)?.unsub_token ?? PLACEHOLDER_TOKEN

  const siteUrl = getSiteUrl()
  const ctx = {
    opportunities,
    siteUrl,
    unsubscribeUrl: `${siteUrl}/api/waitlist/unsubscribe?token=${unsubToken}`,
    createAlertUrl: absoluteUrl('/onboarding'),
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const result: BroadcastPreviewResult = {
    recipient,
    opportunities: opportunities.length,
    preview_mode: !apiKey || !fromEmail,
    sent: false,
  }
  if (result.preview_mode) {
    result.error = 'Resend non configuré (RESEND_API_KEY / RESEND_FROM_EMAIL absents)'
    return result
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: fromEmail!,
    to: recipient,
    subject: '[Test] Les opportunités ouvertes en ce moment · Encre',
    html: renderBroadcastHtml(ctx),
    text: renderBroadcastText(ctx),
    headers: {
      'List-Unsubscribe': `<${ctx.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) {
    result.error = error.message ?? 'Resend error'
    return result
  }
  result.sent = true
  return result
}
