import Link from 'next/link'
import type { CSSProperties } from 'react'
import { requireAdmin, RestrictedAccessError } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { DISCIPLINE_LABELS, type DisciplineSlug } from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'

export const dynamic = 'force-dynamic'

interface WaitlistRow {
  email: string
  source: string | null
  disciplines: string[] | null
  region_codes: string[] | null
  created_at: string
}

const DAY_MS = 86_400_000

export default async function AdminWaitlistPage() {
  try {
    await requireAdmin('/admin/waitlist')
  } catch (e) {
    if (e instanceof RestrictedAccessError) return <AccessDenied />
    throw e
  }

  const service = createServiceClient()

  const { data, error } = await service
    .from('waitlist')
    .select('email, source, disciplines, region_codes, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  const { count: alertsActive } = await service
    .from('alert_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  if (error) {
    return (
      <div style={wrapStyle}>
        <p style={{ color: 'var(--vermillion)' }}>Erreur de lecture : {error.message}</p>
      </div>
    )
  }

  const rows = (data ?? []) as WaitlistRow[]
  const now = Date.now()
  const ts = (r: WaitlistRow) => new Date(r.created_at).getTime()
  const total = rows.length
  const last24h = rows.filter((r) => now - ts(r) < DAY_MS).length
  const last7d = rows.filter((r) => now - ts(r) < 7 * DAY_MS).length

  // Inscriptions par jour, 14 derniers jours (le plus récent à droite).
  const byDay = buildDailySeries(rows, 14)
  const maxDay = Math.max(1, ...byDay.map((d) => d.count))

  return (
    <div style={wrapStyle}>
      <header style={headerStyle}>
        <div style={eyebrowStyle}>Admin · Liste d&apos;attente</div>
        <h1 style={h1Style}>Inscriptions à la revue</h1>
        <p style={subStyle}>
          Emails capturés depuis la landing. Pour les alertes personnalisées des
          comptes connectés, voir la table <code>alert_profiles</code>.
        </p>
        <Link href="/admin" style={backLinkStyle}>
          ← Retour à l&apos;admin
        </Link>
      </header>

      <section style={statsRowStyle}>
        <Stat label="Total" value={total} accent="ink" />
        <Stat label="Dernières 24 h" value={last24h} accent={last24h > 0 ? 'vermillion' : 'ink'} />
        <Stat label="7 derniers jours" value={last7d} accent="ink" />
        <Stat label="Alertes actives" value={alertsActive ?? 0} accent="kelp" />
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeadStyle}>Par jour · 14 derniers jours</div>
        <div style={chartStyle}>
          {byDay.map((d) => (
            <div key={d.key} style={barCellStyle} title={`${d.label} : ${d.count}`}>
              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle,
                    height: `${(d.count / maxDay) * 100}%`,
                    background: d.count > 0 ? 'var(--vermillion)' : 'var(--ink-rule)',
                  }}
                />
              </div>
              <div style={barCountStyle}>{d.count || ''}</div>
              <div style={barLabelStyle}>{d.short}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeadStyle}>
          {total} inscrit{total > 1 ? 's' : ''}
        </div>
        {rows.length === 0 ? (
          <p style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-serif)' }}>
            Aucune inscription pour le moment.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date (Paris)</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Disciplines / régions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.email}-${r.created_at}`} style={trStyle}>
                  <td style={tdMonoStyle}>{formatDate(r.created_at)}</td>
                  <td style={tdEmailStyle}>{r.email}</td>
                  <td style={tdMonoMutedStyle}>{r.source || '-'}</td>
                  <td style={tdMutedStyle}>{formatTags(r.disciplines, r.region_codes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'ink' | 'vermillion' | 'kelp'
}) {
  const color =
    accent === 'vermillion' ? 'var(--vermillion)' : accent === 'kelp' ? 'var(--kelp)' : 'var(--ink)'
  return (
    <div style={statCardStyle}>
      <div style={{ ...statValueStyle, color }}>{value}</div>
      <div style={statLabelStyle}>{label}</div>
    </div>
  )
}

function buildDailySeries(rows: WaitlistRow[], days: number) {
  const fmtKey = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }) // YYYY-MM-DD
  const fmtShort = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
  })
  const fmtLong = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = fmtKey.format(new Date(r.created_at))
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const out: Array<{ key: string; short: string; label: string; count: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS)
    const key = fmtKey.format(d)
    out.push({ key, short: fmtShort.format(d), label: fmtLong.format(d), count: counts.get(key) ?? 0 })
  }
  return out
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function formatTags(disciplines: string[] | null, regions: string[] | null): string {
  const d = (disciplines ?? []).map((s) => DISCIPLINE_LABELS[s as DisciplineSlug] ?? s)
  const r = (regions ?? []).map((c) => labelForRegion(c))
  const all = [...d, ...r]
  return all.length ? all.join(', ') : '-'
}

function AccessDenied() {
  return (
    <div style={{ maxWidth: 720, margin: '120px auto', padding: '0 32px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)' }}>
        Accès restreint
      </h1>
      <p style={{ color: 'var(--ink-muted)', marginTop: 12 }}>
        Cette page est réservée aux administrateurs.
      </p>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const wrapStyle: CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '48px 32px 96px' }

const headerStyle: CSSProperties = { paddingBottom: 24, marginBottom: 28, borderBottom: '2px solid var(--ink)' }
const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--vermillion)',
  marginBottom: 10,
}
const h1Style: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 34,
  fontWeight: 500,
  letterSpacing: '-0.015em',
  color: 'var(--ink)',
}
const subStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 15,
  lineHeight: 1.5,
  color: 'var(--ink-muted)',
  maxWidth: '62ch',
  marginTop: 8,
}
const backLinkStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 16,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--ink-muted)',
  textDecoration: 'none',
}

const statsRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 16,
  marginBottom: 36,
}
const statCardStyle: CSSProperties = {
  border: '1px solid var(--ink-rule)',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const statValueStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 40,
  fontWeight: 500,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums lining-nums',
}
const statLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
}

const sectionStyle: CSSProperties = { marginBottom: 40 }
const sectionHeadStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  paddingBottom: 10,
  marginBottom: 16,
  borderBottom: '1px solid var(--ink-rule)',
}

const chartStyle: CSSProperties = { display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }
const barCellStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}
const barTrackStyle: CSSProperties = {
  width: '100%',
  height: 80,
  display: 'flex',
  alignItems: 'flex-end',
}
const barFillStyle: CSSProperties = { width: '100%', minHeight: 2, transition: 'height 200ms' }
const barCountStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--ink)',
  height: 14,
}
const barLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--ink-muted)',
  whiteSpace: 'nowrap',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
}
const thStyle: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-muted)',
  padding: '8px 12px',
  borderBottom: '1px solid var(--ink-rule)',
}
const trStyle: CSSProperties = { borderBottom: '1px solid var(--ink-rule)' }
const tdBase: CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const tdMonoStyle: CSSProperties = { ...tdBase, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', whiteSpace: 'nowrap' }
const tdEmailStyle: CSSProperties = { ...tdBase, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }
const tdMonoMutedStyle: CSSProperties = { ...tdBase, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-muted)' }
const tdMutedStyle: CSSProperties = { ...tdBase, color: 'var(--ink-muted)', fontFamily: 'var(--font-serif)' }
