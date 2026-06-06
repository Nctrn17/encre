/**
 * Email digest curation hebdomadaire — version CLI locale.
 *
 * Pour le déclenchement réel (GitHub Actions samedi 8 h Paris), c'est
 * /api/cron/curation-digest qui tourne en prod. Ce script sert à
 * tester le rendu en local OU à envoyer manuellement depuis la machine
 * de dev en cas de problème côté Vercel.
 *
 * Usage :
 *   npx tsx scripts/curation-digest.ts             # dry-run
 *   npx tsx scripts/curation-digest.ts --send      # envoi réel via Resend
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { getCurationQueues, queuesHaveContent } from '../src/features/curation/queues'
import { renderCurationDigest, sendCurationDigest } from '../src/features/curation/digest'

async function main() {
  const send = process.argv.includes('--send')
  console.log(`mode : ${send ? 'SEND via Resend' : 'DRY-RUN (preview)'}`)

  const q = await getCurationQueues()
  const totals = {
    awaiting: q.awaitingDetails.length,
    partial: q.partialExtraction.length,
    expired: q.expired.length,
    new_week: q.newThisWeek.length,
  }
  console.log(`\nFiles : ${JSON.stringify(totals)}`)

  if (!queuesHaveContent(q)) {
    console.log("\nRien à curer cette semaine. Pas d'email envoyé.")
    return
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://encre.fr'
  const digest = renderCurationDigest(q, { siteUrl })

  console.log('\n--- SUBJECT ---')
  console.log(digest.subject)
  console.log('\n--- TEXT BODY (preview) ---')
  console.log(digest.text)

  if (!send) {
    console.log('\n[dry-run] Re-lancer avec --send pour envoyer.')
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('❌ RESEND_API_KEY missing dans .env.local')
    process.exit(1)
  }
  const to = process.env.CURATION_DIGEST_TO
  if (!to) {
    console.error('❌ CURATION_DIGEST_TO missing dans .env.local')
    process.exit(1)
  }
  await sendCurationDigest(digest, { to, apiKey })
  console.log(`\n✓ Envoyé à ${to}`)
}

main().catch((e) => { console.error('ERR:', (e as Error).message); process.exit(1) })
