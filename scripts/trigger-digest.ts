#!/usr/bin/env tsx
/**
 * CLI pour déclencher (ou prévisualiser) les digests email.
 *
 * Usage :
 *   npm run digest:send                     # envoi réel (hebdo par défaut)
 *   npm run digest:send -- --preview        # construit sans envoyer, affiche le count
 *   npm run digest:send -- --preview --dump # idem + écrit un .html dans /tmp/digest-preview/
 *   npm run digest:send -- --frequency=daily
 *   npm run digest:send -- --now=2026-05-18T08:00:00+02:00
 *   npm run digest:send -- --to=test@example.com   # tous les mails vont là (test)
 *   npm run digest:send -- --ignore-last-sent      # rejouer sur des profils déjà envoyés
 *
 * Le script bypass la route API : appelle directement runDigestCycle.
 * Utile pour debug / rattraper un envoi manqué.
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runDigestCycle } from '../src/lib/digest/send-digests'

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx < args.length - 1) return args[idx + 1]
  const withEq = args.find((a) => a.startsWith(`${flag}=`))
  if (withEq) return withEq.split('=').slice(1).join('=')
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const preview = args.includes('--preview')
  const dump = args.includes('--dump')
  const ignoreLastSent = args.includes('--ignore-last-sent')
  const frequency = extractFlag(args, '--frequency') as
    | 'daily'
    | 'weekly'
    | 'deadline_only'
    | null
  const overrideRecipient = extractFlag(args, '--to')
  const nowArg = extractFlag(args, '--now')
  const now = nowArg ? new Date(nowArg) : undefined

  if (nowArg && Number.isNaN(now?.getTime())) {
    console.error(`Date --now invalide : ${nowArg}`)
    process.exit(1)
  }

  console.log('Digest run...')
  console.log('  preview          :', preview)
  console.log('  frequency        :', frequency ?? 'weekly (default)')
  console.log('  now              :', now ? now.toISOString() : '(current date)')
  console.log('  overrideRecipient:', overrideRecipient ?? '(none)')
  console.log('  ignoreLastSent   :', ignoreLastSent)
  console.log('')

  const result = await runDigestCycle({
    preview,
    frequencies: frequency ? [frequency] : ['weekly'],
    overrideRecipient: overrideRecipient ?? undefined,
    ignoreLastSent,
    now,
    verbose: true, // toujours verbose en CLI pour debug
  })

  console.log('┌─────────────────────────────────')
  console.log(`│ Profils fetchés DB      : ${result.diagnostics.profiles_fetched}`)
  console.log(`│ Users résolus (email)   : ${result.diagnostics.users_resolved}`)
  console.log(`│ Pool opportunités       : ${result.diagnostics.opportunities_pool}`)
  console.log(`│ Skip (pas d'email)      : ${result.diagnostics.profiles_skipped_no_email}`)
  console.log(`│ Skip (0 match)          : ${result.diagnostics.profiles_skipped_no_match}`)
  console.log('├─────────────────────────────────')
  console.log(`│ Digests construits      : ${result.total_profiles}`)
  console.log(`│ Emails envoyés          : ${result.emails_sent}`)
  console.log(`│ Errors                  : ${result.errors.length}`)
  console.log(`│ Preview mode            : ${result.preview_mode ? 'YES (no actual send)' : 'no'}`)
  console.log('└─────────────────────────────────')

  if (result.errors.length > 0) {
    console.log('\nErrors:')
    for (const e of result.errors) {
      console.log(`  • [${e.profile_id}] ${e.email} — ${e.message}`)
    }
  }

  if (dump && result.preview_payloads) {
    const outDir = join(process.cwd(), 'tmp', 'digest-preview')
    mkdirSync(outDir, { recursive: true })
    for (const p of result.preview_payloads) {
      const fname = `${p.profile.id}-${p.profile.name.replace(/[^a-z0-9]/gi, '_')}.html`
      writeFileSync(join(outDir, fname), p.html, 'utf8')
      writeFileSync(
        join(outDir, fname.replace('.html', '.txt')),
        p.text,
        'utf8',
      )
    }
    console.log(`\n✓ ${result.preview_payloads.length} fichier(s) preview dans ${outDir}`)
  }

  if (result.preview_mode && !dump && result.preview_payloads?.length) {
    console.log('\nAstuce : relance avec --dump pour écrire les HTML dans /tmp/digest-preview/')
    console.log('Exemple de 1er payload (extrait) :')
    const sample = result.preview_payloads[0]
    console.log(`  Profile : ${sample.profile.name} (user ${sample.profile.user_email})`)
    console.log(`  Subject : ${sample.subject}`)
    console.log(`  Items   : ${sample.opportunities.length}`)
    console.log(`  First   : ${sample.opportunities[0]?.title ?? '(none)'}`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
