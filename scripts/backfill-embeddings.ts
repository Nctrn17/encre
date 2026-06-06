/**
 * Backfill des embeddings pour les opportunités publiées qui n'en ont pas.
 *
 * Nécessaire après l'activation de Voyage : sans ça, le dédup sémantique
 * (process-raw étape 5) ne compare les nouveaux items qu'aux opps embeddées
 * APRÈS activation, laissant tout le stock existant en angle mort.
 *
 * Idempotent : ne ré-embedde pas une opp déjà présente dans
 * opportunity_embeddings. Relançable sans risque.
 *
 *   npx tsx scripts/backfill-embeddings.ts
 *   npx tsx scripts/backfill-embeddings.ts --limit 20   # test sur un échantillon
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import { embedText } from '../src/lib/pipeline/similarity'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE creds manquants dans .env.local')
  if (!process.env.VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY manquant dans .env.local')

  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : null
  // Tier gratuit Voyage (sans moyen de paiement) = 3 RPM. Délai par défaut
  // calibré pour rester sous cette limite ; baisser via --delay-ms si tu as
  // débloqué les rate limits standard (carte ajoutée).
  const delayArg = process.argv.indexOf('--delay-ms')
  const delayMs = delayArg !== -1 ? Number(process.argv[delayArg + 1]) : 21000

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Opps publiées déjà embeddées → à exclure.
  const { data: existing, error: exErr } = await sb
    .from('opportunity_embeddings')
    .select('opportunity_id')
  if (exErr) throw new Error(`select embeddings: ${exErr.message}`)
  const done = new Set((existing ?? []).map((r: { opportunity_id: string }) => r.opportunity_id))

  let query = sb
    .from('opportunities')
    .select('id, title, emitter, description')
    .eq('is_published', true)
    .order('created_at', { ascending: true })
  if (limit) query = query.limit(limit)

  const { data: opps, error: oppErr } = await query
  if (oppErr) throw new Error(`select opportunities: ${oppErr.message}`)

  const todo = (opps ?? []).filter((o: { id: string }) => !done.has(o.id))
  console.log(`${todo.length} opp(s) à embedder (${done.size} déjà faites).`)

  let ok = 0
  let failed = 0
  for (const [i, o] of todo.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    const text = `${o.title}\n${o.emitter}\n${o.description ?? ''}`
    try {
      const embedding = await embedText(text)
      const { error } = await sb
        .from('opportunity_embeddings')
        .upsert({ opportunity_id: o.id, embedding }, { onConflict: 'opportunity_id' })
      if (error) throw new Error(error.message)
      ok++
    } catch (e) {
      failed++
      console.warn(`  ✗ ${o.id} (${o.title?.slice(0, 50)}): ${(e as Error).message}`)
    }
    if ((i + 1) % 20 === 0) console.log(`  ... ${i + 1}/${todo.length}`)
  }

  console.log(`\nTerminé : ${ok} embeddées, ${failed} échecs.`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL:', (e as Error).message)
  process.exit(1)
})
