import { Resend } from 'resend'
import {
  buildPendingDigests,
  markDigestSent,
  type DigestPayload,
  type BuildDigestDiagnostics,
} from './build-digest'
import {
  renderGroupedDigestHtml,
  renderGroupedDigestText,
} from './template'

export interface SendResult {
  total_profiles: number
  emails_sent: number
  skipped_empty: number
  errors: Array<{ profile_id: string; email: string; message: string }>
  preview_mode: boolean
  diagnostics: BuildDigestDiagnostics
}

export interface SendOptions {
  /** Si true, construit les digests mais ne fait pas l'envoi Resend */
  preview?: boolean
  /** Filtrer par frequency */
  frequencies?: Array<'daily' | 'weekly' | 'deadline_only'>
  /** Override destinataire (pour test — tous les mails iront là) */
  overrideRecipient?: string
  /** Forcer un user (test) */
  onlyUserId?: string
  /** Ignorer last_sent_at pour rejouer un digest (test) */
  ignoreLastSent?: boolean
  /** Date de référence pour les tests de planification */
  now?: Date
  /** Affiche les logs intermédiaires */
  verbose?: boolean
}

/**
 * Build + send des digests. Appelé par :
 *   - /api/cron/send-digests (route API)
 *   - scripts/trigger-digest.ts (CLI)
 *
 * En mode preview (ou si RESEND_API_KEY absent) : ne fait que construire
 * les HTML, retourne le count + un échantillon dans `preview_payloads`.
 */
export async function runDigestCycle(
  options: SendOptions = {},
): Promise<SendResult & { preview_payloads?: DigestPayload[] }> {
  const { payloads, diagnostics } = await buildPendingDigests({
    frequencies: options.frequencies,
    onlyUserId: options.onlyUserId,
    ignoreLastSent: options.ignoreLastSent,
    now: options.now,
    verbose: options.verbose,
  })
  const sendPayloads = groupPayloadsByRecipient(payloads)

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const effectivePreview = options.preview || !apiKey || !fromEmail

  const result: SendResult & { preview_payloads?: DigestPayload[] } = {
    total_profiles: payloads.length,
    emails_sent: 0,
    skipped_empty: diagnostics.profiles_skipped_no_match,
    errors: [],
    preview_mode: effectivePreview,
    diagnostics,
  }

  if (effectivePreview) {
    result.preview_payloads = sendPayloads
    return result
  }

  const resend = new Resend(apiKey)

  for (const payload of sendPayloads) {
    const recipient = options.overrideRecipient ?? payload.profile.user_email

    try {
      const { error } = await resend.emails.send({
        from: fromEmail!,
        to: recipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      })

      if (error) {
        result.errors.push({
          profile_id: payload.profile.id,
          email: recipient,
          message: error.message ?? 'Resend error',
        })
        continue
      }

      if (!options.overrideRecipient) {
        // Ne pas marquer comme envoyé si on a détourné vers un mail de test
        for (const profileId of payload.alertProfileIds) {
          await markDigestSent(profileId)
        }
      }

      result.emails_sent++
    } catch (err) {
      result.errors.push({
        profile_id: payload.profile.id,
        email: recipient,
        message: (err as Error).message,
      })
    }
  }

  return result
}

function groupPayloadsByRecipient(payloads: DigestPayload[]): DigestPayload[] {
  const groups = new Map<string, DigestPayload[]>()
  for (const payload of payloads) {
    const current = groups.get(payload.profile.user_email) ?? []
    current.push(payload)
    groups.set(payload.profile.user_email, current)
  }

  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return group[0]

    const first = group[0]
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000'
    const unsubscribeUrl = `${siteUrl}/mes-alertes`
    const total = group.reduce((sum, payload) => sum + payload.opportunities.length, 0)
    const sections = group.map((payload) => ({
      profileName: payload.profile.name,
      opportunities: payload.opportunities,
    }))

    return {
      profile: first.profile,
      alertProfileIds: group.flatMap((payload) => payload.alertProfileIds),
      opportunities: group.flatMap((payload) => payload.opportunities),
      html: renderGroupedDigestHtml({ sections, siteUrl, unsubscribeUrl }),
      text: renderGroupedDigestText({ sections, siteUrl, unsubscribeUrl }),
      subject:
        total === 1
          ? '1 nouvelle opportunité · vos veilles Encre'
          : `${total} nouvelles opportunités · vos veilles Encre`,
    }
  })
}
