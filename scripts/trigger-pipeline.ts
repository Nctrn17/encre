#!/usr/bin/env tsx
/**
 * Déclencheur manuel du pipeline de traitement des raw_items.
 *
 * Charge .env.local pour récupérer CRON_SECRET et NEXT_PUBLIC_SITE_URL,
 * puis POST /api/cron/process-raw.
 *
 * Usage :
 *   npm run pipeline:process
 *   npm run pipeline:process -- --batch=100
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

async function main() {
  const args = process.argv.slice(2)
  const batchArg = args.find((a) => a.startsWith('--batch='))
  const batch = batchArg ? Number.parseInt(batchArg.split('=')[1], 10) : 50

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000'
  const secret = process.env.CRON_SECRET

  if (!secret) {
    console.error('❌ CRON_SECRET manquant dans .env.local')
    process.exit(1)
  }

  const url = `${siteUrl}/api/cron/process-raw?batch=${batch}`
  console.log(`Déclenchement pipeline sur ${url}...`)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'x-cron-secret': secret,
        'Content-Type': 'application/json',
      },
    })

    const text = await resp.text()

    if (!resp.ok) {
      console.error(`❌ HTTP ${resp.status}`)
      console.error(text)
      process.exit(1)
    }

    try {
      const json = JSON.parse(text)
      console.log('✓ Pipeline OK')
      console.log('Résultat :', JSON.stringify(json.result ?? json, null, 2))
    } catch {
      console.log('✓ Réponse (non-JSON) :', text)
    }
  } catch (err) {
    console.error('❌ Requête échouée :', (err as Error).message)
    console.error('')
    console.error('Vérifier que le dev server tourne (npm run dev) sur', siteUrl)
    process.exit(1)
  }
}

main()
