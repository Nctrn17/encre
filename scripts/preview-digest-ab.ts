#!/usr/bin/env tsx
/**
 * Génère 2 previews HTML du digest (variantes A et B) à partir de vraies
 * opportunités de la DB et les envoie en mail au destinataire DIGEST_PREVIEW_TO,
 * avec subject clair `[A]` / `[B]` pour comparer.
 *
 * Aussi écrit les 2 HTML dans tmp/digest-preview-AB/ pour comparaison disque.
 *
 * Script jetable — sera supprimé une fois la variante choisie portée dans
 * src/lib/digest/template.ts.
 *
 *   npm run preview:digest-ab            # dump disque + envoi mail
 *   npm run preview:digest-ab -- --no-send   # juste disque
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Opportunity } from '../src/lib/supabase/types'
import {
  OPPORTUNITY_TYPE_LABELS,
  DISCIPLINE_LABELS,
  type OpportunityType,
  type DisciplineSlug,
} from '../src/lib/discipline-taxonomy'
import { labelForRegion } from '../src/lib/region-codes'
import { formatAmount } from '../src/lib/utils'

const RECIPIENT = process.env.DIGEST_PREVIEW_TO ?? process.env.CURATION_DIGEST_TO ?? ''
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://encre.io'

// ─────────────────────────────────────────────────────────────────────────────
// Variante A — Palette Encre v9 (structure inchangée, chromaticité revue)
// ─────────────────────────────────────────────────────────────────────────────

// Palette mail = palette site (cf. globals.css). Mêmes tokens que
// --color-paper / --color-ink / --color-vermillion.
const A_COLORS = {
  paper: '#f4ede0',         // fond papier (= site)
  paperDeep: '#ece2cf',     // séparateurs
  paperSoft: '#eee5d2',     // surface secondaire
  ink: '#1c1817',           // texte principal
  inkMuted: '#6b5e54',      // texte secondaire
  inkSoft: '#8a7d72',       // marginalia
  vermillion: '#c8362b',    // accent
  surface: '#ffffff',       // cartes
}

function renderA(profileName: string, opps: Opportunity[]): string {
  const cards = opps.map((o) => renderACard(o)).join('\n')
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cette semaine sur Encre</title>
</head>
<body style="margin:0;padding:0;background:${A_COLORS.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${A_COLORS.ink};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${A_COLORS.paper};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="padding-bottom:24px;">
          <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:28px;font-weight:400;letter-spacing:-0.01em;color:${A_COLORS.ink};">
            Encre<span style="color:${A_COLORS.vermillion};">.</span>
          </div>
          <div style="font-size:12px;color:${A_COLORS.inkSoft};letter-spacing:0.08em;text-transform:uppercase;margin-top:14px;">
            Digest hebdomadaire · ${escapeHtml(profileName)}
          </div>
        </td></tr>
        <tr><td style="padding-bottom:20px;font-size:15px;line-height:1.55;color:${A_COLORS.ink};">
          ${opps.length === 1
            ? '1 nouvelle opportunité correspondant à votre alerte.'
            : `${opps.length} nouvelles opportunités correspondant à votre alerte.`}
        </td></tr>
        ${cards}
        <tr><td style="padding-top:32px;border-top:1px solid ${A_COLORS.paperDeep};">
          <div style="font-size:13px;color:${A_COLORS.inkSoft};line-height:1.6;">
            Informations indicatives. Le règlement officiel reste celui de l'émetteur.<br><br>
            <a href="${SITE_URL}/mes-alertes" style="color:${A_COLORS.vermillion};text-decoration:none;border-bottom:1px solid ${A_COLORS.vermillion};">Gérer ou désactiver cette alerte</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function renderACard(o: Opportunity): string {
  const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
  const disciplines = (o.disciplines ?? []).slice(0, 3).map((d) => DISCIPLINE_LABELS[d as DisciplineSlug] ?? d).join(' · ')
  const amount = formatAmount(o.amount_min, o.amount_max)
  const region = o.region_code ? labelForRegion(o.region_code) : null
  const detailUrl = `${SITE_URL}/aides/${o.slug}`
  const meta = [amount, region].filter(Boolean).join(' · ')
  const deadlineHuman = o.deadline ? humanDeadlineFR(o.deadline) : null

  return `<tr><td style="padding-bottom:14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${A_COLORS.surface};border:1px solid ${A_COLORS.paperDeep};border-radius:8px;">
    <tr><td style="padding:18px 20px;">
      <div style="font-size:11px;color:${A_COLORS.vermillion};font-weight:500;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">
        ${escapeHtml(typeLabel)}${disciplines ? ' · ' + escapeHtml(disciplines) : ''}
      </div>
      <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:18px;font-weight:500;line-height:1.3;margin-bottom:6px;letter-spacing:-0.01em;">
        <a href="${detailUrl}" style="color:${A_COLORS.ink};text-decoration:none;">${escapeHtml(o.title)}</a>
      </div>
      <div style="font-size:14px;color:${A_COLORS.inkMuted};margin-bottom:12px;">
        ${escapeHtml(o.emitter)}${meta ? ' · ' + escapeHtml(meta) : ''}${deadlineHuman ? ' · ' + escapeHtml(deadlineHuman) : ''}
      </div>
      ${o.description ? `<div style="font-size:14px;color:${A_COLORS.ink};line-height:1.55;margin-bottom:12px;">${escapeHtml(truncate(o.description, 200))}</div>` : ''}
      <a href="${detailUrl}" style="font-size:13px;color:${A_COLORS.vermillion};text-decoration:none;border-bottom:1px solid ${A_COLORS.vermillion};padding-bottom:1px;">Consulter →</a>
    </td></tr>
  </table>
  </td></tr>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Variante B — Refonte éditoriale (hero + stats + sections + countdown)
// ─────────────────────────────────────────────────────────────────────────────

const B_COLORS = A_COLORS // même palette Encre v9

function renderB(profileName: string, opps: Opportunity[]): string {
  // Stats strip
  const disciplinesSet = new Set<string>()
  const regionsSet = new Set<string>()
  let cumul = 0
  for (const o of opps) {
    for (const d of o.disciplines ?? []) disciplinesSet.add(d)
    if (o.region_code) regionsSet.add(o.region_code)
    if (typeof o.amount_max === 'number') cumul += o.amount_max
  }

  // Highlight dynamique : top urgent (≤ 7j) à mettre en avant en intro.
  const now = Date.now()
  const veryUrgent = opps
    .filter((o) => {
      if (!o.deadline) return false
      const d = Math.ceil((new Date(o.deadline).getTime() - now) / (1000 * 60 * 60 * 24))
      return d >= 0 && d <= 7
    })
    .slice(0, 3)
  let highlightHtml = ''
  if (veryUrgent.length > 0) {
    const items = veryUrgent
      .map((o) => {
        const d = Math.ceil((new Date(o.deadline!).getTime() - now) / (1000 * 60 * 60 * 24))
        const label = d === 0 ? "aujourd'hui" : `dans ${d} j`
        return `${escapeHtml(o.emitter)} ${label}`
      })
      .join(' · ')
    highlightHtml = `<tr><td style="padding:14px 16px;background:${B_COLORS.paperSoft};border-left:3px solid ${B_COLORS.vermillion};margin-bottom:24px;">
      <div style="font-size:11px;color:${B_COLORS.vermillion};letter-spacing:0.08em;text-transform:uppercase;font-weight:500;margin-bottom:4px;">À ne pas rater cette semaine</div>
      <div style="font-size:14px;color:${B_COLORS.ink};line-height:1.5;">${items}.</div>
    </td></tr>
    <tr><td style="height:18px;line-height:18px;">&nbsp;</td></tr>`
  }

  // Mois en cours pour CTA calendrier
  const nowDate = new Date()
  const currentMonthSlug = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`
  const monthLabels = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  const currentMonthLabel = monthLabels[nowDate.getMonth()]
  const cumulFormatted = cumul >= 1_000_000
    ? `${(cumul / 1_000_000).toFixed(1).replace('.', ',')} M€`
    : cumul >= 1_000
      ? `${Math.round(cumul / 1000)} k€`
      : '·'

  // Tri puis split en 2 sections : urgentes (≤ 14j) vs plus tard
  // (utilise le `now` déjà déclaré plus haut pour le highlight)
  const sorted = [...opps].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  })
  const urgent: Opportunity[] = []
  const later: Opportunity[] = []
  const undated: Opportunity[] = []
  for (const o of sorted) {
    if (!o.deadline) { undated.push(o); continue }
    const days = Math.ceil((new Date(o.deadline).getTime() - now) / (1000 * 60 * 60 * 24))
    if (days <= 14) urgent.push(o)
    else later.push(o)
  }

  const sectionsHtml: string[] = []
  if (urgent.length > 0) sectionsHtml.push(renderBSection('Cette quinzaine', urgent))
  if (later.length > 0) sectionsHtml.push(renderBSection('Plus tard', later))
  if (undated.length > 0) sectionsHtml.push(renderBSection('Sans date limite annoncée', undated))

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cette semaine sur Encre</title>
</head>
<body style="margin:0;padding:0;background:${B_COLORS.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${B_COLORS.ink};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${B_COLORS.paper};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

        <!-- HERO -->
        <tr><td style="padding-bottom:14px;">
          <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-0.01em;">
            Encre<span style="color:${B_COLORS.vermillion};">.</span>
          </div>
        </td></tr>
        <tr><td style="padding-bottom:6px;">
          <div style="font-size:11px;color:${B_COLORS.inkSoft};letter-spacing:0.1em;text-transform:uppercase;">
            Cette semaine · ${escapeHtml(profileName)}
          </div>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:34px;line-height:1.05;font-weight:400;letter-spacing:-0.025em;color:${B_COLORS.ink};">
            ${opps.length} nouvelle${opps.length > 1 ? 's' : ''} opportunité${opps.length > 1 ? 's' : ''} pour vous<span style="color:${B_COLORS.vermillion};">.</span>
          </div>
        </td></tr>

        <!-- STATS STRIP -->
        <tr><td style="padding:16px 0 24px;border-top:1px solid ${B_COLORS.paperDeep};border-bottom:1px solid ${B_COLORS.paperDeep};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              ${renderBStatCell(opps.length, 'Deadlines')}
              ${renderBStatCell(disciplinesSet.size, 'Disciplines')}
              ${renderBStatCell(regionsSet.size, 'Régions')}
              ${renderBStatCell(cumulFormatted, 'Cumulé')}
            </tr>
          </table>
        </td></tr>

        <tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>

        <!-- ÉDITO : un mot court avant la liste -->
        <tr><td style="padding-bottom:24px;">
          <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:16px;line-height:1.6;color:${B_COLORS.ink};">
            Voici les appels que nous avons sélectionnés pour vous cette semaine. Bonne lecture.
          </div>
        </td></tr>

        ${highlightHtml}

        ${sectionsHtml.join('\n')}

        <!-- CTA secondaire : calendrier complet du mois -->
        <tr><td style="padding:24px 0 0;text-align:center;">
          <a href="${SITE_URL}/calendrier/${currentMonthSlug}" style="display:inline-block;font-size:14px;color:${B_COLORS.vermillion};text-decoration:none;border-bottom:1px solid ${B_COLORS.vermillion};padding-bottom:2px;">
            Voir tout le calendrier de ${currentMonthLabel} →
          </a>
        </td></tr>

        <!-- INTENTION -->
        <tr><td style="padding:32px 0 24px;border-top:1px solid ${B_COLORS.paperDeep};">
          <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:15px;line-height:1.6;color:${B_COLORS.inkMuted};font-style:italic;">
            Encre publie un calendrier ouvert des opportunités culturelles francophones.
            Chaque deadline a une page, chaque mois a une page, chaque saison a une page.
            Lisible sans connexion, archivable, au format ouvert.
          </div>
          <div style="font-size:12px;color:${B_COLORS.inkSoft};letter-spacing:0.08em;text-transform:uppercase;margin-top:18px;">
            La rédaction d'Encre · Paris
          </div>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding-top:28px;">
          <div style="font-size:13px;color:${B_COLORS.inkSoft};line-height:1.6;">
            Informations indicatives. Le règlement officiel reste celui de l'émetteur.<br><br>
            <a href="${SITE_URL}/mes-alertes" style="color:${B_COLORS.vermillion};text-decoration:none;border-bottom:1px solid ${B_COLORS.vermillion};">Gérer ou désactiver cette alerte</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

function renderBStatCell(num: number | string, label: string): string {
  return `<td align="center" style="padding:0 6px;vertical-align:top;">
    <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:24px;line-height:1;color:${B_COLORS.ink};margin-bottom:6px;">${num}</div>
    <div style="font-size:10px;color:${B_COLORS.inkSoft};letter-spacing:0.08em;text-transform:uppercase;">${label}</div>
  </td>`
}

function renderBSection(title: string, opps: Opportunity[]): string {
  const rows = opps.map((o, i) => renderBRow(o, i + 1)).join('\n')
  // Section label en mono uppercase (pattern marginalia Encre v9), beaucoup
  // plus aéré que du serif bold qui retombe lourdement sur Georgia dans
  // les clients mail (Source Serif 4 ne charge pas via @font-face).
  return `<tr><td style="padding-bottom:8px;border-bottom:1px solid ${B_COLORS.ink};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="font-family:'JetBrains Mono',ui-monospace,'SFMono-Regular','Menlo',monospace;font-size:11px;color:${B_COLORS.ink};letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">
          ${escapeHtml(title)}
        </td>
        <td align="right" style="font-family:'JetBrains Mono',ui-monospace,'SFMono-Regular','Menlo',monospace;font-size:11px;color:${B_COLORS.inkSoft};letter-spacing:0.04em;">
          ${opps.length} ${opps.length > 1 ? 'opps' : 'opp'}
        </td>
      </tr>
    </table>
  </td></tr>
  ${rows}
  <tr><td style="height:24px;line-height:24px;">&nbsp;</td></tr>`
}

function renderBRow(o: Opportunity, num: number): string {
  const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
  const detailUrl = `${SITE_URL}/aides/${o.slug}`
  const amount = formatAmount(o.amount_min, o.amount_max)
  const region = o.region_code ? labelForRegion(o.region_code) : null
  const meta = [amount, region].filter(Boolean).join(' · ')

  let countdownHtml = ''
  if (o.deadline) {
    const days = Math.ceil((new Date(o.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    const urgent = days >= 0 && days <= 7
    const past = days < 0
    const color = urgent ? B_COLORS.vermillion : past ? B_COLORS.inkSoft : B_COLORS.ink
    const label = past ? `J+${Math.abs(days)}` : days === 0 ? "aujourd'hui" : `J−${days}`
    countdownHtml = `<div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:${color};font-weight:500;letter-spacing:0.04em;">${label}</div>`
  }

  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${B_COLORS.paperDeep};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align:top;width:36px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:${B_COLORS.inkSoft};letter-spacing:0.04em;">#${num.toString().padStart(2, '0')}</td>
        <td style="vertical-align:top;padding-right:14px;">
          <div style="font-size:11px;color:${B_COLORS.vermillion};font-weight:500;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${escapeHtml(typeLabel)}<span style="color:${B_COLORS.inkSoft};font-weight:400;"> · ${escapeHtml(o.emitter)}</span></div>
          <div style="font-family:'Iowan Old Style','Charter','Palatino Linotype',Palatino,Georgia,serif;font-size:17px;font-weight:500;line-height:1.3;margin-bottom:6px;letter-spacing:-0.005em;">
            <a href="${detailUrl}" style="color:${B_COLORS.ink};text-decoration:none;">${escapeHtml(o.title)}</a>
          </div>
          ${meta ? `<div style="font-size:13px;color:${B_COLORS.inkMuted};">${escapeHtml(meta)}</div>` : ''}
        </td>
        <td align="right" style="vertical-align:top;width:80px;">${countdownHtml}</td>
      </tr>
    </table>
  </td></tr>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}
function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n).replace(/\s\S*$/, '') + '…'
}
function humanDeadlineFR(iso: string): string {
  const d = new Date(iso)
  const months = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
  return `jusqu'au ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

;(async () => {
  const noSend = process.argv.includes('--no-send')

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // Sample : 8 opps réelles, mix de cinéma/AV (cf. profil Walid)
  const { data: opps } = await sb.from('opportunities')
    .select('*')
    .eq('is_published', true)
    .or('deadline.is.null,deadline.gt.' + new Date().toISOString())
    .overlaps('disciplines', ['cinema', 'audiovisuel', 'litterature'])
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(8)
  const sample = (opps ?? []) as Opportunity[]
  if (sample.length === 0) { console.error('Aucune opp pour le sample'); process.exit(1) }

  console.log(`Sample : ${sample.length} opps (${sample.filter(o => o.deadline).length} datées, ${sample.filter(o => !o.deadline).length} non datées)`)

  const profileName = 'Mes opportunités'
  const htmlA = renderA(profileName, sample)
  const htmlB = renderB(profileName, sample)

  // Dump disque
  const dir = resolve(process.cwd(), 'tmp/digest-preview-AB')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'A.html'), htmlA)
  writeFileSync(resolve(dir, 'B.html'), htmlB)
  console.log(`✓ HTML écrits dans ${dir}/A.html et B.html`)

  if (noSend) return

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    console.warn('⚠ RESEND_API_KEY ou RESEND_FROM_EMAIL manquants, envoi sauté')
    return
  }
  const resend = new Resend(apiKey)
  const sendRes = await Promise.all([
    resend.emails.send({
      from: fromEmail,
      to: RECIPIENT,
      subject: `[B''' · serif allégé + édito + highlight + CTA] ${sample.length} opps · preview digest`,
      html: htmlB,
    }),
  ])
  for (const r of sendRes) {
    if (r.error) console.error('  ✗', r.error)
    else console.log(`  ✓ envoyé id=${r.data?.id}`)
  }
})()
