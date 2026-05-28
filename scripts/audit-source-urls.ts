#!/usr/bin/env tsx
/**
 * Encre · audit des `source_url` des opportunités publiées.
 *
 * Pour chaque opp avec `is_published = true`, ping HEAD (fallback GET) et
 * collecte status code, latence, URL finale après redirections. Output CSV
 * stdout + résumé stderr.
 *
 * Usage :
 *   npm run audit:urls                  # audit dry-run, output CSV stdout
 *   npm run audit:urls -- --mark-dead   # idem + flip is_published=false sur 4xx/5xx
 *
 * Concurrency : 6 requêtes en parallèle, max 2 par hostname (anti-blacklist).
 * Timeout par requête : 12 secondes.
 *
 * Rate-limiting per hostname : politesse sur les sites institutionnels qui
 * peuvent bouder un crawler trop rapide (CNL, CNAP, DRAC, etc.).
 */

import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

// Charge .env.local d'abord (convention Next.js), puis .env en fallback.
// Les variables déjà définies ne sont pas écrasées.
loadEnv({ path: resolve(process.cwd(), '.env.local') })
loadEnv({ path: resolve(process.cwd(), '.env') })

import { createPublicClient, createServiceClient } from '../src/lib/supabase/server'

interface AuditRow {
  id: string
  slug: string
  emitter: string
  title: string
  source_url: string
  status: number | 'error' | 'timeout'
  latency_ms: number
  final_url: string | null
  error_msg: string | null
  semantic_match: number | null // null si pas de check, sinon ratio 0-1
  semantic_verdict: 'ok' | 'drift' | 'skipped' | null
}

const TIMEOUT_MS = 12_000
const GLOBAL_CONCURRENCY = 6
const PER_HOST_CONCURRENCY = 2
const USER_AGENT =
  'encre-bot/0.1 (+https://encre.xyz/bot; contact@encre.xyz)'

// ─────────────────────────────────────────────────────────────────────────────
// Per-host concurrency limiter
// ─────────────────────────────────────────────────────────────────────────────

class HostLimiter {
  private active = new Map<string, number>()
  private queue = new Map<string, Array<() => void>>()

  async acquire(host: string): Promise<void> {
    const current = this.active.get(host) ?? 0
    if (current < PER_HOST_CONCURRENCY) {
      this.active.set(host, current + 1)
      return
    }
    return new Promise((resolve) => {
      const list = this.queue.get(host) ?? []
      list.push(resolve)
      this.queue.set(host, list)
    })
  }

  release(host: string) {
    const current = this.active.get(host) ?? 0
    const queued = this.queue.get(host) ?? []
    if (queued.length > 0) {
      const next = queued.shift()!
      this.queue.set(host, queued)
      next()
    } else {
      this.active.set(host, Math.max(0, current - 1))
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP probe
// ─────────────────────────────────────────────────────────────────────────────

// Stop-words FR à exclure du check sémantique (mots vides, prépositions, etc.)
const STOP_WORDS_FR = new Set([
  'pour', 'avec', 'sans', 'dans', 'sous', 'sur', 'des', 'les', 'une', 'aux',
  'leur', 'leurs', 'cette', 'ces', 'son', 'ses', 'mon', 'mes', 'ton', 'tes',
  'qui', 'que', 'quoi', 'dont', 'est', 'sont', 'plus', 'moins', 'vers',
  'entre', 'jusqu', 'depuis', 'pendant', 'après', 'avant', 'lors', 'cependant',
  'aide', 'aides', 'appel', 'appels', 'projet', 'projets', // mots trop génériques
])

/**
 * Calcule un ratio de match entre les mots significatifs du titre stocké
 * et le contenu textuel de la page. Retourne 0 si la page n'apporte aucun
 * mot du titre, 1 si tous les mots du titre apparaissent.
 *
 * Tokens significatifs : mots ≥ 4 caractères, hors stop-words FR.
 */
function computeSemanticMatch(title: string, pageText: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9\s]/g, ' ')

  const titleTokens = new Set(
    norm(title)
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS_FR.has(w)),
  )
  if (titleTokens.size === 0) return 1 // pas évaluable, on considère OK

  const pageNorm = norm(pageText)
  let hits = 0
  for (const t of titleTokens) {
    if (pageNorm.includes(t)) hits++
  }
  return hits / titleTokens.size
}

async function fetchPageText(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    })
    if (!r.ok) return null
    const html = await r.text()
    // Strip HTML tags + scripts + styles, garde juste le texte visible
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 50_000) // cap pour les pages énormes
  } catch {
    return null
  }
}

async function probeUrl(
  url: string,
  limiter: HostLimiter,
): Promise<Pick<AuditRow, 'status' | 'latency_ms' | 'final_url' | 'error_msg'>> {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return {
      status: 'error',
      latency_ms: 0,
      final_url: null,
      error_msg: 'invalid URL',
    }
  }

  await limiter.acquire(host)
  const started = Date.now()

  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)

    // Tentative 1 : HEAD
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': USER_AGENT },
    }).catch((err) => err as Error)

    // Si HEAD pas supporté (405) ou bloqué (403), retry GET
    if (
      response instanceof Response &&
      (response.status === 405 || response.status === 403)
    ) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      }).catch((err) => err as Error)
    }

    clearTimeout(timer)
    const latency = Date.now() - started

    if (response instanceof Error) {
      const msg = response.name === 'AbortError' ? 'timeout' : response.message
      return {
        status: msg === 'timeout' ? 'timeout' : 'error',
        latency_ms: latency,
        final_url: null,
        error_msg: msg.slice(0, 120),
      }
    }

    return {
      status: response.status,
      latency_ms: latency,
      final_url: response.url !== url ? response.url : null,
      error_msg: null,
    }
  } finally {
    limiter.release(host)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker pool · global concurrency cap
// ─────────────────────────────────────────────────────────────────────────────

async function runWithPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function csvEscape(v: string | number | null): string {
  if (v === null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const argv = process.argv.slice(2)
  const markDead = argv.includes('--mark-dead')
  const withSemantic = argv.includes('--with-semantic')
  const semanticThreshold = (() => {
    const i = argv.indexOf('--threshold')
    return i >= 0 ? Number.parseFloat(argv[i + 1]) : 0.3
  })()
  const limit = (() => {
    const i = argv.indexOf('--limit')
    return i >= 0 ? Number.parseInt(argv[i + 1], 10) : null
  })()

  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const supabase = hasServiceKey ? createServiceClient() : createPublicClient()

  if (markDead && !hasServiceKey) {
    process.stderr.write(
      'WARN · --mark-dead demandé mais SUPABASE_SERVICE_ROLE_KEY absente. ' +
        'Lecture en mode ANON (les UPDATE sur is_published seront refusés ' +
        "par les RLS). Audit lecture-seule.\n",
    )
  }

  process.stderr.write(
    `Fetching published opportunities (${hasServiceKey ? 'service_role' : 'anon'} client)…\n`,
  )
  let query = supabase
    .from('opportunities')
    .select('id, slug, emitter, title, source_url')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
  if (limit) query = query.limit(limit)

  const { data: opps, error } = await query
  if (error) {
    process.stderr.write(`SELECT failed: ${error.message}\n`)
    process.exit(1)
  }
  if (!opps || opps.length === 0) {
    process.stderr.write('No published opportunities to audit.\n')
    return
  }

  process.stderr.write(
    `Auditing ${opps.length} URLs · concurrency=${GLOBAL_CONCURRENCY} · ` +
      `per-host=${PER_HOST_CONCURRENCY} · timeout=${TIMEOUT_MS / 1000}s` +
      (withSemantic
        ? ` · semantic check ON (threshold=${semanticThreshold})`
        : '') +
      '\n',
  )

  const limiter = new HostLimiter()
  let done = 0

  const rows: AuditRow[] = await runWithPool(
    opps as Array<{
      id: string
      slug: string
      emitter: string
      title: string
      source_url: string
    }>,
    GLOBAL_CONCURRENCY,
    async (opp) => {
      const probe = await probeUrl(opp.source_url, limiter)
      done++
      if (done % 25 === 0 || done === opps.length) {
        process.stderr.write(`  · ${done}/${opps.length} probed\n`)
      }

      let semantic_match: number | null = null
      let semantic_verdict: AuditRow['semantic_verdict'] = null

      if (
        withSemantic &&
        typeof probe.status === 'number' &&
        probe.status >= 200 &&
        probe.status < 300
      ) {
        // Fetch GET pour extraire le texte (avec timeout dédié)
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
        const finalUrl = probe.final_url ?? opp.source_url
        const pageText = await fetchPageText(finalUrl, ac.signal)
        clearTimeout(timer)

        if (pageText === null) {
          semantic_verdict = 'skipped'
        } else {
          semantic_match = computeSemanticMatch(opp.title, pageText)
          semantic_verdict =
            semantic_match >= semanticThreshold ? 'ok' : 'drift'
        }
      }

      return {
        id: opp.id,
        slug: opp.slug,
        emitter: opp.emitter,
        title: opp.title,
        source_url: opp.source_url,
        ...probe,
        semantic_match,
        semantic_verdict,
      }
    },
  )

  // CSV header + rows on stdout
  process.stdout.write(
    'slug,emitter,status,latency_ms,semantic_match,semantic_verdict,source_url,final_url,error_msg\n',
  )
  for (const r of rows) {
    process.stdout.write(
      [
        csvEscape(r.slug),
        csvEscape(r.emitter),
        csvEscape(r.status),
        csvEscape(r.latency_ms),
        csvEscape(r.semantic_match !== null ? r.semantic_match.toFixed(2) : ''),
        csvEscape(r.semantic_verdict ?? ''),
        csvEscape(r.source_url),
        csvEscape(r.final_url),
        csvEscape(r.error_msg),
      ].join(',') + '\n',
    )
  }

  // Résumé sur stderr
  const ok = rows.filter((r) => typeof r.status === 'number' && r.status >= 200 && r.status < 300)
  const redirected = rows.filter((r) => typeof r.status === 'number' && r.status >= 300 && r.status < 400)
  const dead = rows.filter((r) => typeof r.status === 'number' && r.status >= 400 && r.status < 600)
  const errors = rows.filter((r) => r.status === 'error' || r.status === 'timeout')
  const finalUrlChanged = rows.filter((r) => r.final_url !== null)
  const drifts = rows.filter((r) => r.semantic_verdict === 'drift')

  process.stderr.write('\n─────────────── RÉSUMÉ ───────────────\n')
  process.stderr.write(`  ✓ 2xx          : ${ok.length}\n`)
  process.stderr.write(`  → redirect 3xx : ${redirected.length}\n`)
  process.stderr.write(`  ✗ 4xx/5xx      : ${dead.length}\n`)
  process.stderr.write(`  ⚠ erreur réseau: ${errors.length}\n`)
  process.stderr.write(`  ↪ final_url ≠  : ${finalUrlChanged.length}\n`)
  if (withSemantic) {
    process.stderr.write(`  ✗ content drift : ${drifts.length}\n`)
  }
  process.stderr.write(`  TOTAL          : ${rows.length}\n`)
  process.stderr.write('───────────────────────────────────────\n\n')

  if (withSemantic && drifts.length > 0) {
    process.stderr.write(`Content drifts (premiers 10) :\n`)
    for (const d of drifts.slice(0, 10)) {
      process.stderr.write(
        `  [match=${d.semantic_match?.toFixed(2)}] ${d.slug}\n` +
          `      title  : ${d.title.slice(0, 80)}\n` +
          `      url    : ${d.final_url ?? d.source_url}\n`,
      )
    }
    process.stderr.write('\n')
  }

  if (dead.length > 0) {
    process.stderr.write(`URLs cassées (premières 10) :\n`)
    for (const d of dead.slice(0, 10)) {
      process.stderr.write(`  [${d.status}] ${d.slug} → ${d.source_url}\n`)
    }
    process.stderr.write('\n')
  }

  // Mark-dead pass : 4xx/5xx + drifts si --with-semantic actif
  const toUnpublish = withSemantic
    ? [...dead, ...drifts]
    : dead

  if (markDead && toUnpublish.length > 0) {
    process.stderr.write(
      `--mark-dead actif · flip is_published=false sur ${toUnpublish.length} opps ` +
        `(${dead.length} dead + ${withSemantic ? drifts.length : 0} drift)…\n`,
    )
    const ids = toUnpublish.map((d) => d.id)
    const { error: updateErr } = await supabase
      .from('opportunities')
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .in('id', ids)
    if (updateErr) {
      process.stderr.write(`UPDATE failed: ${updateErr.message}\n`)
      process.exit(2)
    }
    process.stderr.write(`✓ ${toUnpublish.length} opps unpublished.\n`)
  } else if (toUnpublish.length > 0) {
    process.stderr.write(
      `Pour les retirer du site : ré-exécuter avec --mark-dead.\n`,
    )
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.stack ?? err.message}\n`)
  process.exit(1)
})
