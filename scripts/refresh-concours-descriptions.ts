/**
 * Re-fetch les pages des 4 sources concours nouvelles + applique
 * extractCleanDescription pour purger le boilerplate CNIL/RGPD/contact
 * des descriptions stockées.
 *
 * Pas de re-scrape : ne touche pas aux raw_items, ni aux conditions/
 * calendrier/dossier déjà enrichies. Update juste opportunities.description.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { fetchWithRetry } from '../scrapers/lib/fetch-helpers'
import { extractCleanDescription } from '../scrapers/lib/clean-description'

const SOURCE_URL_PREFIXES = [
  'https://www.grec-info.com/fiche_appel.php',
  'https://www.premiersplans.org/',
  'https://eurofilmfest-lille.com/',
  'https://www.festivalscinema-na.com/concours-de-scenario',
]

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Récupère toutes les opps concernées
  const orFilters = SOURCE_URL_PREFIXES.map((p) => `source_url.like.${p}%`).join(',')
  const { data, error } = await sb
    .from('opportunities')
    .select('id,title,source_url,description')
    .or(orFilters)
  if (error) { console.error(error); process.exit(1) }

  console.log(`${data?.length ?? 0} opps à refresh\n`)

  for (const o of data ?? []) {
    try {
      const r = await fetchWithRetry(o.source_url)
      if (!r.ok) {
        console.log(`  ⊘ ${r.status}  ${o.title.slice(0, 60)}`)
        continue
      }
      const html = await r.text()
      const $ = cheerio.load(html)
      const cleanDesc = extractCleanDescription($)
      const oldLen = (o.description as string | null)?.length ?? 0
      const newLen = cleanDesc?.length ?? 0
      const { error: upErr } = await sb
        .from('opportunities')
        .update({ description: cleanDesc, updated_at: new Date().toISOString() })
        .eq('id', o.id)
      if (upErr) {
        console.log(`  ✗ ${o.title.slice(0, 60)} : ${upErr.message}`)
      } else {
        console.log(`  ✓ ${o.title.slice(0, 60)} (${oldLen}c → ${newLen}c)`)
      }
    } catch (e) {
      console.log(`  ✗ ${o.title.slice(0, 60)} : ${(e as Error).message.slice(0, 80)}`)
    }
  }
}
main()
