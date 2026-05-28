/**
 * Helper /curate-paste : unpublish en batch d'opps identifiées hors-scope
 * ou clôturées sans cycle suivant annoncé.
 *
 * Usage :
 *   npx tsx scripts/curation-paste/unpublish-batch.ts \
 *     --reason "hors-scope V1 scénariste" \
 *     <uuid1> <uuid2> <uuid3>...
 *
 *   npx tsx scripts/curation-paste/unpublish-batch.ts --dry-run \
 *     --reason "test" <uuid1>
 *
 * Set `is_published = false` + `human_review = true` + `updated_at` sur
 * chaque id donné. Conditions/calendrier/dossier inchangés (l'historique
 * reste lisible si Walid republie plus tard).
 *
 * Output stdout : JSON par opp { id, ok, error?, title? }
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'

interface Args {
  reason: string
  ids: string[]
  dryRun: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let reason = ''
  let dryRun = false
  const ids: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--reason') {
      reason = argv[++i] ?? ''
    } else if (a === '--dry-run') {
      dryRun = true
    } else if (a.startsWith('--')) {
      throw new Error(`flag inconnu : ${a}`)
    } else {
      ids.push(a)
    }
  }
  if (!reason) throw new Error('--reason requis (sera loggé pour l\'audit trail)')
  if (ids.length === 0) throw new Error('au moins un id requis')
  return { reason, ids, dryRun }
}

async function main() {
  const { reason, ids, dryRun } = parseArgs()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.error(`mode : ${dryRun ? 'DRY-RUN' : 'WRITE'}`)
  console.error(`reason : ${reason}`)
  console.error(`ids : ${ids.length}\n`)

  const results: Array<{ id: string; ok: boolean; title?: string; error?: string }> = []

  for (const id of ids) {
    const { data: existing, error: fetchErr } = await sb
      .from('opportunities')
      .select('id,title,is_published')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) {
      results.push({ id, ok: false, error: fetchErr.message })
      continue
    }
    if (!existing) {
      results.push({ id, ok: false, error: 'not found' })
      continue
    }
    if (existing.is_published === false) {
      results.push({ id, ok: true, title: existing.title, error: 'already unpublished (no-op)' })
      continue
    }

    if (dryRun) {
      results.push({ id, ok: true, title: existing.title, error: 'dry-run, no write' })
      continue
    }

    const { error: updErr } = await sb
      .from('opportunities')
      .update({
        is_published: false,
        human_review: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) {
      results.push({ id, ok: false, error: updErr.message })
    } else {
      results.push({ id, ok: true, title: existing.title })
    }
  }

  console.log(JSON.stringify({ reason, dryRun, results }, null, 2))

  const okCount = results.filter((r) => r.ok && !r.error).length
  const noOpCount = results.filter((r) => r.ok && r.error).length
  const errCount = results.filter((r) => !r.ok).length
  console.error(
    `\nrésultat : ${okCount} unpublished, ${noOpCount} no-op, ${errCount} erreurs`,
  )
  if (errCount > 0) process.exit(1)
}

main().catch((e) => {
  console.error('error :', (e as Error).message)
  process.exit(1)
})
