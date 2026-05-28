/**
 * Helper temporaire pour la slash-command /curation-prep.
 * Liste l'état des 4 files de curation pour pré-mâchage manuel.
 * Ne push rien, lecture seule.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { getCurationQueues } from '../src/features/curation/queues'

function fmt(o: {
  conditions: string[]
  calendrier: string[]
  dossier: string[]
  title: string
  source_url: string
  deadline: string | null
  next_edition_status: string | null
  emitter: string
}) {
  const dl = o.deadline ? o.deadline.slice(0, 10) : 'no-dl'
  const nes = o.next_edition_status ? `[${o.next_edition_status}]` : ''
  return `[${o.conditions.length}c ${o.calendrier.length}cal ${o.dossier.length}d] ${dl} ${nes} ${o.emitter} : ${o.title.slice(0, 80)}\n     ${o.source_url}`
}

async function main() {
  const q = await getCurationQueues()
  console.log(`generatedAt: ${q.generatedAt}`)
  console.log(`\nAWAITING (${q.awaitingDetails.length})`)
  for (const o of q.awaitingDetails) console.log('  ' + fmt(o))
  console.log(`\nPARTIAL (${q.partialExtraction.length})`)
  for (const o of q.partialExtraction) console.log('  ' + fmt(o))
  console.log(`\nEXPIRED (${q.expired.length})`)
  for (const o of q.expired) console.log('  ' + fmt(o))
  console.log(`\nNEW THIS WEEK (${q.newThisWeek.length})`)
  for (const o of q.newThisWeek) console.log('  ' + fmt(o))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
