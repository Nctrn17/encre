/**
 * Template HTML + plain text du digest email.
 *
 * Approche volontairement simple :
 *   - HTML inline style (compatible tous clients mail, Gmail, Outlook)
 *   - Palette éditoriale sobre alignée avec le reste du produit
 *   - Responsive via max-width + display:block
 *   - Plain text fallback pour lecteurs qui bloquent HTML
 *
 * Pas de React Email au MVP — on garde dépendances minimales.
 * Migration vers react-email possible en v2 si on veut templater plus.
 */

import type { Opportunity } from '@/lib/supabase/types'
import {
  OPPORTUNITY_TYPE_LABELS,
  type OpportunityType,
} from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount, humanDeadline } from '@/lib/utils'
import type { PersonalizedReading } from '@/features/personalization/match'

export type DigestOpportunity = Opportunity & {
  matchScore?: number
  matchReading?: PersonalizedReading
  /** 'closing_soon' = rappel d'échéance (deadline ≤ 14 j), pas une nouveauté. */
  reminderReason?: 'new' | 'closing_soon'
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

/**
 * Broadcast waitlist : envoi non personnalisé à une adresse sans veille.
 * Pas de `matchReading` (audience non profilée) — on liste les nouveautés telles
 * quelles et on invite à créer une alerte pour filtrer.
 */
export interface BroadcastContext {
  opportunities: DigestOpportunity[]
  siteUrl: string
  /** Lien de désinscription (jeton waitlist) — obligatoire (RGPD). */
  unsubscribeUrl: string
  /** Lien onboarding pour convertir l'inscrit en veille personnalisée. */
  createAlertUrl: string
}

// Palette — alignée sur la DA « Plateau » du site (globals.css : --color-*).
// Les clients mail ne chargent pas les web-fonts (Fraunces/Source Serif) → on
// rend en serif système (Georgia), comme le mail de bienvenue. Couleurs en hex
// car rgba/var() ne passent pas partout en email.
const COLORS = {
  background: '#f4ede0', // --color-paper (crème)
  foreground: '#1c1817', // --color-ink (charcoal)
  muted: '#6b5e54', // --color-ink-muted (texte secondaire)
  inkSoft: '#8a7d72', // marginalia (kickers, marges)
  subtle: '#ddd2c0', // hairline crème (≈ --ink-rule sur paper)
  paperDeep: '#ece2cf', // séparateurs
  paperSoft: '#eee5d2', // surface secondaire (highlight)
  surface: '#ffffff', // cartes
  accent: '#c8362b', // --color-vermillion
  accentSoft: '#f6e7e1', // tint vermillon doux (bloc lecture)
}

// Stacks fidèles à la DA : display serif (Fraunces → fallback Iowan/Charter/
// Palatino/Georgia), marginalia mono (JetBrains → fallback système), corps sans
// (Inter → fallback système). Les web-fonts ne se chargent pas en mail, d'où les
// fallbacks soignés.
const SERIF = "'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif"
const MONO = "'JetBrains Mono',ui-monospace,'SFMono-Regular','Menlo',monospace"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"

// Force le mode clair : sans ça, les clients mail (Apple Mail, Outlook, Gmail)
// inversent automatiquement le fond crème en foncé en dark-mode utilisateur,
// cassant la DA. On déclare que l'email ne supporte QUE le clair → pas d'auto-
// inversion sur les clients qui respectent la spec (Apple Mail notamment).
const FORCE_LIGHT =
  '<meta name="color-scheme" content="light">' +
  '<meta name="supported-color-schemes" content="light">' +
  '<style>:root{color-scheme:only light;supported-color-schemes:only light}</style>'

// ==========================================================================
// HTML
// ==========================================================================

// Bandeau de stats partagé par les digests (réutilise renderBroadcastStat).
function renderStatsStrip(opps: DigestOpportunity[]): string {
  const disciplinesSet = new Set<string>()
  const regionsSet = new Set<string>()
  let cumul = 0
  for (const o of opps) {
    for (const d of o.disciplines ?? []) disciplinesSet.add(d)
    if (o.region_code) regionsSet.add(o.region_code)
    if (typeof o.amount_max === 'number') cumul += o.amount_max
  }
  const cumulFormatted =
    cumul >= 1_000_000
      ? `${(cumul / 1_000_000).toFixed(1).replace('.', ',')} M€`
      : cumul >= 1_000
        ? `${Math.round(cumul / 1000)} k€`
        : '·'
  return `<tr><td style="padding:16px 0 24px;border-top:1px solid ${COLORS.paperDeep};border-bottom:1px solid ${COLORS.paperDeep};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            ${renderBroadcastStat(opps.length, 'Deadlines')}
            ${renderBroadcastStat(disciplinesSet.size, 'Disciplines')}
            ${renderBroadcastStat(regionsSet.size, 'Régions')}
            ${renderBroadcastStat(cumulFormatted, 'Cumulé')}
          </tr></table>
        </td></tr>`
}

// Découpe les opps en sections par urgence (digest simple).
function buildUrgencySections(
  opps: DigestOpportunity[],
  now: number,
): { title: string; opps: DigestOpportunity[] }[] {
  const sorted = [...opps].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  })
  const urgent: DigestOpportunity[] = []
  const later: DigestOpportunity[] = []
  const undated: DigestOpportunity[] = []
  for (const o of sorted) {
    if (!o.deadline) {
      undated.push(o)
      continue
    }
    const days = Math.ceil((new Date(o.deadline).getTime() - now) / 86_400_000)
    if (days <= 14) urgent.push(o)
    else later.push(o)
  }
  const secs: { title: string; opps: DigestOpportunity[] }[] = []
  if (urgent.length) secs.push({ title: 'Cette quinzaine', opps: urgent })
  if (later.length) secs.push({ title: 'Plus tard', opps: later })
  if (undated.length) secs.push({ title: 'Sans date limite annoncée', opps: undated })
  return secs
}

// Coquille Variante B commune aux digests : hero, kicker, titre, stats,
// sections, CTA Aujourd'hui, pied. Le CTA pointe sur /aujourdhui (vue perso),
// pas sur le registre (qui, lui, est le CTA du broadcast).
function renderDigestShell(opts: {
  kicker: string
  headline: string
  sections: { title: string; opps: DigestOpportunity[] }[]
  siteUrl: string
  now: number
  manageLabel: string
  manageUrl: string
}): string {
  const allOpps = opts.sections.flatMap((s) => s.opps)
  const sectionsHtml = opts.sections
    .map((s) => renderBroadcastSection(s.title, s.opps, opts.siteUrl, opts.now))
    .join('\n')
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${FORCE_LIGHT}
<title>La revue de la semaine</title>
</head>
<body bgcolor="${COLORS.background}" style="margin:0;padding:0;background:${COLORS.background};font-family:${SANS};color:${COLORS.foreground};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLORS.background}" style="background:${COLORS.background};">
    <tr><td align="center" bgcolor="${COLORS.background}" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

        <tr><td style="padding-bottom:14px;">
          <div style="font-family:${SERIF};font-size:24px;font-weight:400;letter-spacing:-0.01em;">Encre<span style="color:${COLORS.accent};">.</span></div>
        </td></tr>
        <tr><td style="padding-bottom:6px;">
          <div style="font-size:11px;color:${COLORS.inkSoft};letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(opts.kicker)}</div>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <div style="font-family:${SERIF};font-size:32px;line-height:1.08;font-weight:400;letter-spacing:-0.025em;color:${COLORS.foreground};">${opts.headline}<span style="color:${COLORS.accent};">.</span></div>
        </td></tr>

        ${renderStatsStrip(allOpps)}

        <tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>

        ${sectionsHtml}

        <tr><td style="padding:24px 0 0;text-align:center;">
          <a href="${opts.siteUrl}/aujourdhui" style="display:inline-block;font-size:14px;color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};padding-bottom:2px;">Voir tout sur Aujourd'hui →</a>
        </td></tr>

        <tr><td style="padding-top:32px;border-top:1px solid ${COLORS.paperDeep};">
          <div style="font-size:13px;color:${COLORS.inkSoft};line-height:1.6;">
            Informations indicatives. Le règlement officiel reste celui de l'émetteur.<br><br>
            <a href="${opts.manageUrl}" style="color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};">${escapeHtml(opts.manageLabel)}</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

export function renderDigestHtml(ctx: DigestContext): string {
  const now = Date.now()
  const n = ctx.opportunities.length
  return renderDigestShell({
    kicker: `La revue de la semaine · ${ctx.profileName}`,
    headline: `${n} opportunité${n > 1 ? 's' : ''} pour vous`,
    sections: buildUrgencySections(ctx.opportunities, now),
    siteUrl: ctx.siteUrl,
    now,
    manageLabel: 'Gérer ou désactiver cette alerte',
    manageUrl: ctx.unsubscribeUrl,
  })
}

export function renderGroupedDigestHtml(ctx: GroupedDigestContext): string {
  const now = Date.now()
  const total = ctx.sections.reduce((sum, section) => sum + section.opportunities.length, 0)
  return renderDigestShell({
    kicker: 'La revue de la semaine · vos veilles',
    headline: `${total} nouvelle${total > 1 ? 's' : ''} opportunité${total > 1 ? 's' : ''}`,
    sections: ctx.sections.map((s) => ({ title: s.profileName, opps: s.opportunities })),
    siteUrl: ctx.siteUrl,
    now,
    manageLabel: 'Gérer ou désactiver vos alertes',
    manageUrl: ctx.unsubscribeUrl,
  })
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

    lines.push(`• ${stripLongDashes(o.title)}`)
    lines.push(`  ${stripLongDashes(o.emitter)}${metaParts ? ' · ' + metaParts : ''}`)
    if (o.description) lines.push(`  ${stripLongDashes(truncate(o.description, 180))}`)
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

      lines.push(`• ${stripLongDashes(o.title)}`)
      lines.push(`  ${stripLongDashes(o.emitter)}${metaParts ? ' · ' + metaParts : ''}`)
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
// Broadcast waitlist (non personnalisé)
// ==========================================================================

export function renderBroadcastHtml(ctx: BroadcastContext): string {
  const opps = ctx.opportunities
  const count = opps.length
  const now = Date.now()

  // Stats strip
  const disciplinesSet = new Set<string>()
  const regionsSet = new Set<string>()
  let cumul = 0
  for (const o of opps) {
    for (const d of o.disciplines ?? []) disciplinesSet.add(d)
    if (o.region_code) regionsSet.add(o.region_code)
    if (typeof o.amount_max === 'number') cumul += o.amount_max
  }
  const cumulFormatted =
    cumul >= 1_000_000
      ? `${(cumul / 1_000_000).toFixed(1).replace('.', ',')} M€`
      : cumul >= 1_000
        ? `${Math.round(cumul / 1000)} k€`
        : '·'

  // Tri puis sections : cette quinzaine (≤14j) / plus tard / sans date
  const sorted = [...opps].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  })
  const urgent: DigestOpportunity[] = []
  const later: DigestOpportunity[] = []
  const undated: DigestOpportunity[] = []
  for (const o of sorted) {
    if (!o.deadline) {
      undated.push(o)
      continue
    }
    const days = Math.ceil((new Date(o.deadline).getTime() - now) / 86_400_000)
    if (days <= 14) urgent.push(o)
    else later.push(o)
  }
  const sectionsHtml: string[] = []
  if (urgent.length) sectionsHtml.push(renderBroadcastSection('Cette quinzaine', urgent, ctx.siteUrl, now))
  if (later.length) sectionsHtml.push(renderBroadcastSection('Plus tard', later, ctx.siteUrl, now))
  if (undated.length)
    sectionsHtml.push(renderBroadcastSection('Sans date limite annoncée', undated, ctx.siteUrl, now))

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${FORCE_LIGHT}
<title>Cette semaine sur Encre</title>
</head>
<body bgcolor="${COLORS.background}" style="margin:0;padding:0;background:${COLORS.background};font-family:${SANS};color:${COLORS.foreground};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLORS.background}" style="background:${COLORS.background};">
    <tr><td align="center" bgcolor="${COLORS.background}" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

        <!-- HERO -->
        <tr><td style="padding-bottom:14px;">
          <div style="font-family:${SERIF};font-size:24px;font-weight:400;letter-spacing:-0.01em;">Encre<span style="color:${COLORS.accent};">.</span></div>
        </td></tr>
        <tr><td style="padding-bottom:6px;">
          <div style="font-size:11px;color:${COLORS.inkSoft};letter-spacing:0.1em;text-transform:uppercase;">Cette semaine</div>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <div style="font-family:${SERIF};font-size:34px;line-height:1.05;font-weight:400;letter-spacing:-0.025em;color:${COLORS.foreground};">
            ${count} nouvelle${count > 1 ? 's' : ''} opportunité${count > 1 ? 's' : ''}<span style="color:${COLORS.accent};">.</span>
          </div>
        </td></tr>

        <!-- STATS -->
        <tr><td style="padding:16px 0 24px;border-top:1px solid ${COLORS.paperDeep};border-bottom:1px solid ${COLORS.paperDeep};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            ${renderBroadcastStat(count, 'Deadlines')}
            ${renderBroadcastStat(disciplinesSet.size, 'Disciplines')}
            ${renderBroadcastStat(regionsSet.size, 'Régions')}
            ${renderBroadcastStat(cumulFormatted, 'Cumulé')}
          </tr></table>
        </td></tr>

        <tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>

        <!-- ÉDITO -->
        <tr><td style="padding-bottom:24px;">
          <div style="font-family:${SERIF};font-size:16px;line-height:1.6;color:${COLORS.foreground};">
            Les nouvelles opportunités publiées cette semaine pour les scénaristes et auteurs de l'audiovisuel. Bonne lecture.
          </div>
        </td></tr>

        ${sectionsHtml.join('\n')}

        <!-- CTA registre (bouton) -->
        <tr><td style="padding:28px 0 4px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr><td bgcolor="${COLORS.accent}" style="border-radius:6px;">
              <a href="${ctx.siteUrl}/aides" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">Voir tout le registre →</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- INTENTION -->
        <tr><td style="padding:32px 0 24px;border-top:1px solid ${COLORS.paperDeep};">
          <div style="font-family:${SERIF};font-size:15px;line-height:1.6;color:${COLORS.muted};font-style:italic;">
            Encre publie un calendrier ouvert des opportunités culturelles francophones. Chaque deadline a une page, chaque mois a une page, chaque saison a une page. Lisible sans connexion, archivable.
          </div>
          <div style="font-size:12px;color:${COLORS.inkSoft};letter-spacing:0.08em;text-transform:uppercase;margin-top:18px;">La rédaction d'Encre · Paris</div>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding-top:28px;border-top:1px solid ${COLORS.paperDeep};">
          <div style="font-size:13px;color:${COLORS.foreground};line-height:1.6;margin-bottom:14px;">
            Pour ne recevoir que ce qui correspond à votre profil,
            <a href="${ctx.createAlertUrl}" style="color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};">créez une alerte</a>.
          </div>
          <div style="font-size:13px;color:${COLORS.inkSoft};line-height:1.6;">
            Informations indicatives. Le règlement officiel reste celui de l'émetteur.<br><br>
            Vous recevez cet email car vous êtes inscrit à Encre.
            <a href="${ctx.unsubscribeUrl}" style="color:${COLORS.accent};text-decoration:none;border-bottom:1px solid ${COLORS.accent};">Se désinscrire</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

function renderBroadcastStat(num: number | string, label: string): string {
  return `<td align="center" style="padding:0 6px;vertical-align:top;">
    <div style="font-family:${SERIF};font-size:24px;line-height:1;color:${COLORS.foreground};margin-bottom:6px;">${num}</div>
    <div style="font-size:10px;color:${COLORS.inkSoft};letter-spacing:0.08em;text-transform:uppercase;">${label}</div>
  </td>`
}

function renderBroadcastSection(
  title: string,
  opps: DigestOpportunity[],
  siteUrl: string,
  now: number,
): string {
  const rows = opps.map((o, i) => renderBroadcastRow(o, i + 1, siteUrl, now)).join('\n')
  return `<tr><td style="padding-bottom:8px;border-bottom:1px solid ${COLORS.foreground};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="font-family:${MONO};font-size:11px;color:${COLORS.foreground};letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">${escapeHtml(title)}</td>
      <td align="right" style="font-family:${MONO};font-size:11px;color:${COLORS.inkSoft};letter-spacing:0.04em;">${opps.length} ${opps.length > 1 ? 'opps' : 'opp'}</td>
    </tr></table>
  </td></tr>
  ${rows}
  <tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>`
}

function renderBroadcastRow(o: DigestOpportunity, num: number, siteUrl: string, now: number): string {
  const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
  const detailUrl = `${siteUrl}/aides/${o.slug}`
  const amount = formatAmount(o.amount_min, o.amount_max)
  const region = o.region_code ? labelForRegion(o.region_code) : null
  const meta = [amount, region].filter(Boolean).join(' · ')
  // Lecture personnalisée : présente seulement pour les digests de veille
  // (les opps du broadcast n'ont pas de matchReading → rien affiché).
  const reading = formatReading(o.matchReading)

  let countdownHtml = ''
  if (o.deadline) {
    const days = Math.ceil((new Date(o.deadline).getTime() - now) / 86_400_000)
    const isUrgent = days >= 0 && days <= 7
    const past = days < 0
    const color = isUrgent ? COLORS.accent : past ? COLORS.inkSoft : COLORS.foreground
    const label = past ? `J+${Math.abs(days)}` : days === 0 ? "aujourd'hui" : `J−${days}`
    countdownHtml = `<div style="font-family:${MONO};font-size:12px;color:${color};font-weight:500;letter-spacing:0.04em;">${label}</div>`
  }

  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${COLORS.paperDeep};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="vertical-align:top;width:36px;font-family:${MONO};font-size:11px;color:${COLORS.inkSoft};letter-spacing:0.04em;">#${num.toString().padStart(2, '0')}</td>
      <td style="vertical-align:top;padding-right:14px;">
        <div style="font-size:11px;color:${COLORS.accent};font-weight:500;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${escapeHtml(typeLabel)}<span style="color:${COLORS.inkSoft};font-weight:400;"> · ${escapeHtml(o.emitter)}</span></div>
        <div style="font-family:${SERIF};font-size:17px;font-weight:500;line-height:1.3;margin-bottom:6px;letter-spacing:-0.005em;">
          <a href="${detailUrl}" style="color:${COLORS.foreground};text-decoration:none;">${escapeHtml(o.title)}</a>
        </div>
        ${meta ? `<div style="font-size:13px;color:${COLORS.muted};">${escapeHtml(meta)}</div>` : ''}
        ${reading
          ? `<div style="margin-top:8px;font-size:12px;line-height:1.45;padding:8px 10px;background:${COLORS.accentSoft};border-left:3px solid ${levelColor(reading.level)};"><span style="font-family:${MONO};font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${levelColor(reading.level)};font-weight:600;">${escapeHtml(reading.label)}</span>${reading.details ? `<div style="margin-top:4px;color:${COLORS.muted};">${escapeHtml(reading.details)}</div>` : ''}</div>`
          : ''}
      </td>
      <td align="right" style="vertical-align:top;width:80px;">${countdownHtml}</td>
    </tr></table>
  </td></tr>`
}

export function renderBroadcastText(ctx: BroadcastContext): string {
  const lines: string[] = []
  const count = ctx.opportunities.length

  lines.push('La revue de la semaine : nouvelles opportunités')
  lines.push('─'.repeat(50))
  lines.push('')
  lines.push(
    count === 1
      ? '1 nouvelle opportunité publiée cette semaine.'
      : `${count} nouvelles opportunités publiées cette semaine.`,
  )
  lines.push(`Créer une alerte personnalisée : ${ctx.createAlertUrl}`)
  lines.push(`Voir tout le registre : ${ctx.siteUrl}/aides`)
  lines.push('')

  for (const o of ctx.opportunities) {
    const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
    const amount = formatAmount(o.amount_min, o.amount_max)
    const deadline = o.deadline ? humanDeadline(o.deadline) : null
    const region = o.region_code ? labelForRegion(o.region_code) : null
    const metaParts = [typeLabel, amount, region, deadline].filter(Boolean).join(' · ')

    lines.push(`• ${stripLongDashes(o.title)}`)
    lines.push(`  ${stripLongDashes(o.emitter)}${metaParts ? ' · ' + metaParts : ''}`)
    if (o.description) lines.push(`  ${stripLongDashes(truncate(o.description, 180))}`)
    lines.push(`  ${ctx.siteUrl}/aides/${o.slug}`)
    lines.push('')
  }

  lines.push('─'.repeat(50))
  lines.push("Informations indicatives. Le règlement officiel reste celui de l'émetteur.")
  lines.push(`Se désinscrire : ${ctx.unsubscribeUrl}`)

  return lines.join('\n')
}

// ==========================================================================
// Helpers
// ==========================================================================

// Normalise les tirets longs (em-dash —, en-dash –, signe moins −) en trait
// d'union court. Les données externes (titres en base, scraping) en contiennent ;
// règle produit : jamais de tiret long dans la copie affichée.
function stripLongDashes(s: string): string {
  return s.replace(/[—–−]/g, '-')
}

function escapeHtml(s: string): string {
  return stripLongDashes(s)
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
