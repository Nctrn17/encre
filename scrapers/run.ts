#!/usr/bin/env tsx
/**
 * Orchestrator CLI pour scrapers.
 *
 * Usage :
 *   npx tsx scrapers/run.ts                        # tous les scrapers actifs
 *   npx tsx scrapers/run.ts --source data-culture-gouv
 *   npx tsx scrapers/run.ts --dry-run              # pas d'insert Supabase
 */

import { loadEnv } from './lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { pushToSupabase } from './lib/push-to-supabase'
import type { RawScrapedItem } from './lib/types'

// Lazy imports via slug → évite de charger Playwright inutilement
const SCRAPER_LOADERS: Record<string, () => Promise<{
  slug: string
  run: (config: Record<string, unknown>) => Promise<RawScrapedItem[]>
}>> = {
  'data-culture-gouv': () => import('./sources/data-culture-gouv'),
  'drac-grand-est': () => import('./sources/drac-rss'),
  'drac-rss': () => import('./sources/drac-rss'),
  'fondation-france-culture': () => import('./sources/fondation-france'),
  'cnap-residences': () => import('./sources/cnap-residences'),
  cnl: () => import('./sources/cnl'),
  cnc: () => import('./sources/cnc'),
  cnm: () => import('./sources/cnm'),
  'culture-gouv': () => import('./sources/culture-gouv'),
  grec: () => import('./sources/grec'),
  'scam-brouillon-dun-reve': () => import('./sources/scam-brouillon-dun-reve'),
  beaumarchais: () => import('./sources/beaumarchais'),
  sopadin: () => import('./sources/sopadin'),
  'fondation-lagardere': () => import('./sources/fondation-lagardere'),
  // Phase 5 — francophonie + formations séries (mai 2026)
  'oif-images-francophones': () => import('./sources/oif-images-francophones'),
  'series-mania-institute': () => import('./sources/series-mania-institute'),
  'cite-europeenne-scenaristes': () => import('./sources/cite-europeenne-scenaristes'),
  'pays-du-sud-international': () => import('./sources/pays-du-sud-international'),
  'niches-metropole': () => import('./sources/niches-metropole'),
  'outremer-territoires': () => import('./sources/outremer-territoires'),
  'region-idf-scenario': () => import('./sources/region-idf-scenario'),
  // P1B — agences régionales audiovisuelles + résidences scénario
  'alca-nouvelle-aquitaine': () => import('./sources/alca-nouvelle-aquitaine'),
  'aura-cinema': () => import('./sources/aura-cinema'),
  'emergence-cinema': () => import('./sources/emergence-cinema'),
  'le-groupe-ouest': () => import('./sources/le-groupe-ouest'),
  'moulin-ande-ceci': () => import('./sources/moulin-ande-ceci'),
  pictanovo: () => import('./sources/pictanovo'),
  'premiers-plans-angers': () => import('./sources/premiers-plans-angers'),
  'eurofilmfest-lille': () => import('./sources/eurofilmfest-lille'),
  'brive-moyen-metrage': () => import('./sources/brive-moyen-metrage'),
  'collectif-5050': () => import('./sources/collectif-5050'),
  'torino-film-lab': () => import('./sources/torino-film-lab'),
  'residences-internationales-fr': () => import('./sources/residences-internationales-fr'),
  'regional-av-manquantes': () => import('./sources/regional-av-manquantes'),
}

interface SourceRow {
  slug: string
  name: string
  kind: string
  config: Record<string, unknown>
  is_active: boolean
}

async function main() {
  const args = process.argv.slice(2)
  const sourceFilter = extractFlag(args, '--source')
  const dryRun = args.includes('--dry-run')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('❌ Missing Supabase credentials. Fill .env.local first.')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabase.from('sources').select('slug,name,kind,config,is_active').eq('is_active', true)
  if (sourceFilter) {
    query = query.eq('slug', sourceFilter)
  }

  const { data: sources, error } = await query
  if (error) {
    console.error('❌ Failed to fetch sources:', error.message)
    process.exit(1)
  }
  if (!sources || sources.length === 0) {
    console.error(`❌ No active sources found${sourceFilter ? ` matching "${sourceFilter}"` : ''}`)
    process.exit(1)
  }

  console.log(`🚀 Running ${sources.length} scraper(s)${dryRun ? ' [dry-run]' : ''}`)

  let totalItems = 0
  let totalInserted = 0

  for (const source of sources as SourceRow[]) {
    // Résoudre le loader : slug exact ou fallback sur le kind
    const loader = SCRAPER_LOADERS[source.slug] ?? SCRAPER_LOADERS[source.kind]
    if (!loader) {
      console.warn(`⚠️  No scraper implementation for ${source.slug} (${source.kind}), skipping`)
      continue
    }

    const start = Date.now()
    try {
      const module_ = await loader()
      const items = await module_.run(source.config)
      const durationMs = Date.now() - start

      console.log(
        `  ✓ ${source.slug.padEnd(30)} ${items.length} items in ${durationMs}ms`,
      )
      totalItems += items.length

      if (!dryRun && items.length > 0) {
        const { inserted } = await pushToSupabase(source.slug, items)
        totalInserted += inserted
      }
    } catch (err) {
      console.error(`  ✗ ${source.slug} failed: ${(err as Error).message}`)
    }
  }

  console.log(`\n📊 Total: ${totalItems} items scraped, ${totalInserted} inserted`)
}

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx === args.length - 1) return null
  return args[idx + 1]
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
