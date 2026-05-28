/**
 * Template HTML + plain text du digest email.
 *
 * Approche volontairement simple :
 *   - HTML inline style (compatible tous clients mail, Gmail, Outlook)
 *   - Palette éditoriale sobre alignée avec le reste du produit
 *   - Responsive via max-width + display:block
 *   - Plain text fallback pour lecteurs qui bloquent HTML
 *
 * Pas de React Email au MVP - on garde dépendances minimales.
 * Migration vers react-email possible en v2 si on veut templater plus.
 */

import type { Opportunity } from '@/lib/supabase/types'
import {
  OPPORTUNITY_TYPE_LABELS,
  DISCIPLINE_LABELS,
  type OpportunityType,
  type DisciplineSlug,
} from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount, humanDeadline } from '@/lib/utils'
import type { PersonalizedReading } from '@/features/personalization/match'

export type DigestOpportunity = Opportunity & {
  matchScore?: number
  matchReading?: PersonalizedReading
}

export interface DigestContext {
  profileName: string
  opportunities: DigestOpportunity[]
  siteUrl: string
  unsubscribeUrl: string
}

export interface GroupedDigestSection {
  profileName: string
  opportunities: DigestOpportunity[]
}

export interface GroupedDigestContext {
  sections: GroupedDigestSection[]
  siteUrl: string
  unsubscribeUrl: string
}

// Palette - tokens alignés avec globals.css
const COLORS = {
  background: '#fafaf7',
  foreground: '#1a1815',
  muted: '#67655f',
  subtle: '#e6e4df',
  accent: '#0c5c4a',
  accentSoft: '#e8f0ed',
}

// ==========================================================================
// HTML
// ==========================================================================

export function renderDigestHtml(ctx: DigestContext): string {
  const cards = ctx.opportunities
    .map((o) => renderOpportunityCard(o, ctx.siteUrl))
    .join('\n')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nouvelles opportunités culturelles</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLORS.foreground};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr><td style="padding-bottom:24px;">
            <div style="font-size:13px;color:${COLORS.muted};letter-spacing:0.05em;text-transform:uppercase;">La revue de la semaine</div>
            <div style="font-size:20px;font-weight:600;margin-top:4px;">${escapeHtml(ctx.profileName)}</div>
          </td></tr>

          <!-- Intro -->
          <tr><td style="padding-bottom:20px;font-size:15px;line-height:1.5;color:${COLORS.foreground};">
            ${ctx.opportunities.length === 1
              ? '1 nouvelle opportunité correspondant aux critères de cette alerte.'
              : `${ctx.opportunities.length} nouvelles opportunités correspondant aux critères de cette alerte.`}
            <br>
            <span style="color:${COLORS.muted};font-size:14px;">
              Pour la vue complète et les échéances proches, consulter
              <a href="${ctx.siteUrl}/aujourdhui" style="color:${COLORS.accent};text-decoration:underline;">votre page Aujourd'hui</a>.
            </span>
          </td></tr>

          <!-- Cards -->
          ${cards}

          <!-- Footer -->
          <tr><td style="padding-top:32px;border-top:1px solid ${COLORS.subtle};margin-top:24px;">
            <div style="font-size:14px;color:${COLORS.foreground};line-height:1.6;margin-bottom:16px;">
              <a href="${ctx.siteUrl}/aujourdhui" style="color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};padding-bottom:1px;">Voir tout sur Aujourd'hui →</a>
            </div>
            <div style="font-size:13px;color:${COLORS.muted};line-height:1.6;">
              Informations indicatives. Le règlement officiel reste celui de l'émetteur.<br><br>
              <a href="${ctx.unsubscribeUrl}" style="color:${COLORS.accent};text-decoration:underline;">Gérer ou désactiver cette alerte</a>
            </div>
          </td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderGroupedDigestHtml(ctx: GroupedDigestContext): string {
  const total = ctx.sections.reduce((sum, section) => sum + section.opportunities.length, 0)
  const sections = ctx.sections
    .map((section) => {
      const cards = section.opportunities
        .map((o) => renderOpportunityCard(o, ctx.siteUrl))
        .join('\n')

      return `<tr><td style="padding:24px 0 8px;">
        <div style="font-size:13px;color:${COLORS.accent};letter-spacing:0.05em;text-transform:uppercase;font-weight:600;">${escapeHtml(section.profileName)}</div>
        <div style="font-size:14px;color:${COLORS.muted};margin-top:4px;">
          ${section.opportunities.length === 1
            ? '1 opportunité'
            : `${section.opportunities.length} opportunités`}
        </div>
      </td></tr>
      ${cards}`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nouvelles opportunités culturelles</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLORS.foreground};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr><td style="padding-bottom:24px;">
            <div style="font-size:13px;color:${COLORS.muted};letter-spacing:0.05em;text-transform:uppercase;">La revue de la semaine</div>
            <div style="font-size:20px;font-weight:600;margin-top:4px;">Vos veilles Encre</div>
          </td></tr>
          <tr><td style="padding-bottom:10px;font-size:15px;line-height:1.5;color:${COLORS.foreground};">
            ${total === 1
              ? '1 nouvelle opportunité répartie dans vos alertes actives.'
              : `${total} nouvelles opportunités réparties dans vos alertes actives.`}
            <br>
            <span style="color:${COLORS.muted};font-size:14px;">
              Pour la vue complète et les échéances proches, consulter
              <a href="${ctx.siteUrl}/aujourdhui" style="color:${COLORS.accent};text-decoration:underline;">votre page Aujourd'hui</a>.
            </span>
          </td></tr>
          ${sections}
          <tr><td style="padding-top:32px;border-top:1px solid ${COLORS.subtle};margin-top:24px;">
            <div style="font-size:14px;color:${COLORS.foreground};line-height:1.6;margin-bottom:16px;">
              <a href="${ctx.siteUrl}/aujourdhui" style="color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};padding-bottom:1px;">Voir tout sur Aujourd'hui →</a>
            </div>
            <div style="font-size:13px;color:${COLORS.muted};line-height:1.6;">
              Informations indicatives. Le règlement officiel reste celui de l'émetteur.<br><br>
              <a href="${ctx.unsubscribeUrl}" style="color:${COLORS.accent};text-decoration:underline;">Gérer ou désactiver vos alertes</a>
            </div>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderOpportunityCard(o: DigestOpportunity, siteUrl: string): string {
  const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
  const disciplines = o.disciplines
    .slice(0, 3)
    .map((d) => DISCIPLINE_LABELS[d as DisciplineSlug] ?? d)
    .join(' · ')

  const amount = formatAmount(o.amount_min, o.amount_max)
  const deadline = o.deadline ? humanDeadline(o.deadline) : null
  const region = o.region_code ? labelForRegion(o.region_code) : null
  const detailUrl = `${siteUrl}/aides/${o.slug}`
  const reading = formatReading(o.matchReading)

  const metaParts: string[] = []
  if (amount) metaParts.push(amount)
  if (region) metaParts.push(region)
  if (deadline) metaParts.push(deadline)

  return `<tr><td style="padding-bottom:16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid ${COLORS.subtle};border-radius:8px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:12px;color:${COLORS.accent};font-weight:500;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:6px;">
          ${escapeHtml(typeLabel)}${disciplines ? ' · ' + escapeHtml(disciplines) : ''}
        </div>
        <div style="font-size:17px;font-weight:600;line-height:1.35;margin-bottom:6px;">
          <a href="${detailUrl}" style="color:${COLORS.foreground};text-decoration:none;">${escapeHtml(o.title)}</a>
        </div>
        <div style="font-size:14px;color:${COLORS.muted};margin-bottom:10px;">
          ${escapeHtml(o.emitter)}${metaParts.length ? ' · ' + escapeHtml(metaParts.join(' · ')) : ''}
        </div>
        ${o.description
          ? `<div style="font-size:14px;color:${COLORS.foreground};line-height:1.5;margin-bottom:12px;">${escapeHtml(truncate(o.description, 220))}</div>`
          : ''}
        ${reading
          ? `<div style="font-size:13px;color:${COLORS.foreground};line-height:1.45;margin-bottom:12px;padding:10px 12px;background:${COLORS.accentSoft};border-left:3px solid ${levelColor(reading.level)};"><span style="font-family:'Courier New',Courier,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${levelColor(reading.level)};font-weight:600;">${escapeHtml(reading.label)}</span>${reading.details ? `<div style="margin-top:6px;color:${COLORS.foreground};">${escapeHtml(reading.details)}</div>` : ''}</div>`
          : ''}
        <a href="${detailUrl}" style="display:inline-block;font-size:14px;color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};padding-bottom:1px;">
          Consulter les détails →
        </a>
      </td></tr>
    </table>
  </td></tr>`
}

// ==========================================================================
// Plain text fallback
// ==========================================================================

export function renderDigestText(ctx: DigestContext): string {
  const lines: string[] = []
  lines.push(`La revue de la semaine : ${ctx.profileName}`)
  lines.push('─'.repeat(50))
  lines.push('')
  lines.push(
    ctx.opportunities.length === 1
      ? '1 nouvelle opportunité correspondant à cette alerte.'
      : `${ctx.opportunities.length} nouvelles opportunités correspondant à cette alerte.`,
  )
  lines.push(`Vue complète : ${ctx.siteUrl}/aujourdhui`)
  lines.push('')

  for (const o of ctx.opportunities) {
    const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
    const amount = formatAmount(o.amount_min, o.amount_max)
    const deadline = o.deadline ? humanDeadline(o.deadline) : null
    const region = o.region_code ? labelForRegion(o.region_code) : null
    const metaParts = [typeLabel, amount, region, deadline].filter(Boolean).join(' · ')

    lines.push(`• ${o.title}`)
    lines.push(`  ${o.emitter}${metaParts ? ' · ' + metaParts : ''}`)
    if (o.description) lines.push(`  ${truncate(o.description, 180)}`)
    const reading = formatReading(o.matchReading)
    if (reading) {
      lines.push(`  ${reading.label.toUpperCase()}${reading.details ? ' - ' + reading.details : ''}`)
    }
    lines.push(`  ${ctx.siteUrl}/aides/${o.slug}`)
    lines.push('')
  }

  lines.push('─'.repeat(50))
  lines.push("Informations indicatives. Le règlement officiel reste celui de l'émetteur.")
  lines.push(`Gérer ou désactiver cette alerte : ${ctx.unsubscribeUrl}`)

  return lines.join('\n')
}

export function renderGroupedDigestText(ctx: GroupedDigestContext): string {
  const lines: string[] = []
  const total = ctx.sections.reduce((sum, section) => sum + section.opportunities.length, 0)

  lines.push('La revue de la semaine : vos veilles Encre')
  lines.push('─'.repeat(50))
  lines.push('')
  lines.push(
    total === 1
      ? '1 nouvelle opportunité répartie dans vos alertes actives.'
      : `${total} nouvelles opportunités réparties dans vos alertes actives.`,
  )
  lines.push(`Vue complète : ${ctx.siteUrl}/aujourdhui`)
  lines.push('')

  for (const section of ctx.sections) {
    lines.push(section.profileName)
    lines.push('─'.repeat(Math.min(50, section.profileName.length)))

    for (const o of section.opportunities) {
      const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
      const amount = formatAmount(o.amount_min, o.amount_max)
      const deadline = o.deadline ? humanDeadline(o.deadline) : null
      const region = o.region_code ? labelForRegion(o.region_code) : null
      const metaParts = [typeLabel, amount, region, deadline].filter(Boolean).join(' · ')

      lines.push(`• ${o.title}`)
      lines.push(`  ${o.emitter}${metaParts ? ' · ' + metaParts : ''}`)
      const reading = formatReading(o.matchReading)
      if (reading) {
        lines.push(`  ${reading.label.toUpperCase()}${reading.details ? ' - ' + reading.details : ''}`)
      }
      lines.push(`  ${ctx.siteUrl}/aides/${o.slug}`)
      lines.push('')
    }
  }

  lines.push('─'.repeat(50))
  lines.push("Informations indicatives. Le règlement officiel reste celui de l'émetteur.")
  lines.push(`Gérer ou désactiver vos alertes : ${ctx.unsubscribeUrl}`)

  return lines.join('\n')
}

// ==========================================================================
// Helpers
// ==========================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const LEVEL_SHORT = {
  strong: 'Très adapté',
  possible: 'Possible',
  difficult: 'Exigeant',
  not_recommended: 'Non retenu',
} as const

function levelColor(level: PersonalizedReading['level']): string {
  switch (level) {
    case 'strong':
      return COLORS.accent
    case 'possible':
      return COLORS.foreground
    case 'difficult':
    case 'not_recommended':
      return COLORS.muted
    default:
      return COLORS.foreground
  }
}

function formatReading(
  reading: PersonalizedReading | undefined,
):
  | {
      level: PersonalizedReading['level']
      label: string
      details: string
    }
  | null {
  if (!reading) return null
  const details = [...reading.reasons, ...reading.warnings].slice(0, 2).join(' ')
  return {
    level: reading.level,
    label: LEVEL_SHORT[reading.level],
    details,
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n).replace(/\s\S*$/, '') + '…'
}
