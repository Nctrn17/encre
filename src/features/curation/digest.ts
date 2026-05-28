/**
 * Rendu + envoi de l'email digest curation.
 * Partagé entre :
 *   - scripts/curation-digest.ts (CLI local)
 *   - src/app/api/cron/curation-digest/route.ts (déclencheur GH Actions)
 */
import type { CurationOpp, CurationQueues } from './queues'

export interface RenderedDigest {
  subject: string
  text: string
  html: string
}

interface RenderOpts {
  siteUrl: string
}

function shortInfo(o: CurationOpp): string {
  return `${o.conditions.length}c · ${o.calendrier.length}cal · ${o.dossier.length}d`
}

function deeplink(o: CurationOpp, siteUrl: string): string {
  return `${siteUrl}/admin/curation?focus=${encodeURIComponent(o.id)}#opp-${o.id}`
}

function renderQueueText(title: string, opps: CurationOpp[], siteUrl: string, limit = 10): string {
  if (opps.length === 0) return ''
  const head = `\n## ${title} - ${opps.length} opp${opps.length === 1 ? '' : 's'}\n`
  const items = opps.slice(0, limit).map((o) =>
    `  · [${shortInfo(o).padEnd(14)}] ${o.title.slice(0, 70)}\n      ${o.emitter} - ${deeplink(o, siteUrl)}`
  ).join('\n')
  const more = opps.length > limit
    ? `\n  … et ${opps.length - limit} autre${opps.length - limit === 1 ? '' : 's'} sur ${siteUrl}/admin/curation`
    : ''
  return head + items + more + '\n'
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function renderQueueHtml(title: string, opps: CurationOpp[], color: string, siteUrl: string, limit = 10): string {
  if (opps.length === 0) return ''
  const items = opps.slice(0, limit).map((o) => `
    <tr>
      <td style="padding:8px 14px 8px 0;font-family:'JetBrains Mono',monospace;font-size:11px;color:#1c1817;letter-spacing:0.04em;white-space:nowrap;vertical-align:top;">${shortInfo(o)}</td>
      <td style="padding:8px 0;font-family:'Source Serif 4',Georgia,serif;font-size:14px;color:#1c1817;line-height:1.4;">
        <a href="${deeplink(o, siteUrl)}" style="color:#1c1817;text-decoration:none;border-bottom:1px solid ${color};">${escapeHtml(o.title.slice(0, 90))}</a>
        <span style="display:block;font-size:11px;color:#8a7d72;font-family:'JetBrains Mono',monospace;letter-spacing:0.06em;text-transform:uppercase;margin-top:2px;">${escapeHtml(o.emitter)}</span>
      </td>
    </tr>
  `).join('')
  const more = opps.length > limit
    ? `<p style="margin:6px 0 0;font-size:12px;color:#8a7d72;font-family:'JetBrains Mono',monospace;">… et ${opps.length - limit} autre${opps.length - limit === 1 ? '' : 's'}.</p>`
    : ''
  return `
    <section style="margin-bottom:36px;">
      <h2 style="font-family:'Source Serif 4',Georgia,serif;font-size:18px;font-weight:600;color:${color};margin:0 0 4px;">${title} <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:400;color:#8a7d72;letter-spacing:0.05em;">· ${opps.length}</span></h2>
      <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border-top:1px solid rgba(28,24,23,0.18);margin-top:8px;">
        ${items}
      </table>
      ${more}
    </section>
  `
}

export function renderCurationDigest(q: CurationQueues, opts: RenderOpts): RenderedDigest {
  const siteUrl = opts.siteUrl.replace(/\/$/, '')
  const date = new Date(q.generatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const total = q.awaitingDetails.length + q.partialExtraction.length + q.expired.length + q.newThisWeek.length
  const subject = `Encre · curation ${date} - ${total} opp${total === 1 ? '' : 's'} à voir`

  const text = `ENCRE · CURATION ${date.toUpperCase()}

${total} opp${total === 1 ? '' : 's'} à passer en revue avant la newsletter de lundi.
${renderQueueText('Awaiting details', q.awaitingDetails, siteUrl)}${renderQueueText('Extraction partielle', q.partialExtraction, siteUrl, 15)}${renderQueueText('Expirées', q.expired, siteUrl)}${renderQueueText('Nouvelles cette semaine', q.newThisWeek, siteUrl)}
Pour curer en place : ${siteUrl}/admin/curation
`

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 24px;background:#f4ede0;font-family:'Source Serif 4',Georgia,serif;color:#1c1817;">
<table cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;width:100%;">
<tr><td>
  <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#c8362b;margin-bottom:12px;">Encre · Curation</div>
  <h1 style="font-family:'Source Serif 4',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:-0.02em;margin:0 0 14px;color:#1c1817;">${date}</h1>
  <p style="font-size:15px;line-height:1.5;color:#6b5e54;margin:0 0 36px;max-width:60ch;">${total} opp${total === 1 ? '' : 's'} à passer en revue avant la newsletter de lundi. Tu peux curer en place sur la <a href="${siteUrl}/admin/curation" style="color:#1c1817;border-bottom:1px solid #c8362b;text-decoration:none;">page admin</a> - un clic sur chaque ligne ci-dessous t'y emmène directement.</p>
  ${renderQueueHtml('Awaiting details', q.awaitingDetails, '#c8362b', siteUrl)}
  ${renderQueueHtml('Extraction partielle', q.partialExtraction, '#1c1817', siteUrl, 15)}
  ${renderQueueHtml('Expirées', q.expired, '#7a6a2c', siteUrl)}
  ${renderQueueHtml('Nouvelles cette semaine', q.newThisWeek, '#1c1817', siteUrl)}
  <p style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(28,24,23,0.18);font-size:12px;color:#8a7d72;font-family:'JetBrains Mono',monospace;letter-spacing:0.04em;">Digest généré ${new Date(q.generatedAt).toLocaleString('fr-FR')}</p>
</td></tr>
</table>
</body></html>`

  return { subject, text, html }
}

export interface SendOpts {
  to: string
  apiKey: string
  from?: string
}

export async function sendCurationDigest(d: RenderedDigest, opts: SendOpts): Promise<void> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from || process.env.RESEND_FROM_EMAIL || 'Encre <onboarding@resend.dev>',
      to: [opts.to],
      subject: d.subject,
      html: d.html,
      text: d.text,
    }),
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Resend ${r.status} : ${body.slice(0, 300)}`)
  }
}
