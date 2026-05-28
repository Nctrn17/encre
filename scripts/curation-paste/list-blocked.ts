/**
 * Helper /curate-paste : liste les opps qui nécessitent un paste manuel
 * de Walid, après tentative d'auto-fetch.
 *
 * Stratégie :
 *   1. Récupère les opps partial extraction (depuis getCurationQueues)
 *   2. Trie par proximité de deadline (les plus urgentes en 1er)
 *   3. Pour chaque, tente extractPageText sur source_url
 *      → si page utile (size > 500c) ET pas déjà 100% rempli → garde
 *      → si page bloquée (404, JS-heavy, content-type non html, vide) → flag "blocked"
 *
 * Output JSON sur stdout :
 *   {
 *     auto: [{ id, title, url, missing: ['conditions',...], pageSize, pdfCount }, ...],
 *     blocked: [{ id, title, url, missing, blockReason, pasteHint }, ...]
 *   }
 *
 * `auto` = je peux probablement extraire moi-même via Gemini ; je proposerai
 * un patch sans déranger Walid.
 * `blocked` = besoin d'un paste manuel, on précise pourquoi et quoi
 * paster.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { getCurationQueues } from '../../src/features/curation/queues'
import { extractPageText } from '../../scrapers/lib/extract-page-text'
import { detectCalendarPattern, type CalendarPattern } from '../../src/lib/pipeline/calendar-pattern'

interface OppListItem {
  id: string
  slug: string
  title: string
  emitter: string
  url: string
  deadline: string | null
  missing: ('conditions' | 'calendrier' | 'dossier')[]
  calendarPattern?: CalendarPattern
  calendarEvidence?: string | null
}

async function main() {
  const args = process.argv.slice(2)
  const scope = args.includes('--all') ? 'all' : 'beta'
  const q = await getCurationQueues({ scope })
  const candidates = uniqueById([
    ...q.partialExtraction,
    ...q.awaitingDetails.filter((o) => o.calendrier.length === 0),
  ])
  const partial = candidates
    .map((o) => ({
      id: o.id,
      slug: o.slug,
      title: o.title,
      emitter: o.emitter,
      url: o.source_url,
      deadline: o.deadline,
      missing: ([
        o.conditions.length === 0 && 'conditions',
        o.calendrier.length === 0 && 'calendrier',
        o.dossier.length === 0 && 'dossier',
      ].filter(Boolean) as ('conditions' | 'calendrier' | 'dossier')[]),
    }))
    .sort((a, b) => {
      // Priorise par proximité de deadline (les + proches en 1er)
      const da = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER
      const db = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER
      return da - db
    })

  const auto: Array<OppListItem & { pageSize: number; pdfCount: number }> = []
  const blocked: Array<OppListItem & { blockReason: string; pasteHint: string }> = []

  for (const o of partial) {
    process.stderr.write(`probing ${o.url.slice(0, 70)}...\n`)
    let page: Awaited<ReturnType<typeof extractPageText>> = null
    try {
      page = await extractPageText(o.url, { maxChars: 25000, minUsefulChars: 200 })
    } catch (e) {
      blocked.push({
        ...o,
        blockReason: `fetch fail : ${(e as Error).message.slice(0, 80)}`,
        pasteHint: `Va sur ${o.url}, copie tout le contenu pertinent (eligibilité, calendrier, pièces du dossier).`,
      })
      continue
    }
    if (!page) {
      blocked.push({
        ...o,
        blockReason: 'page non récupérable (404, ct non-html, ou < 200c)',
        pasteHint: `Va sur ${o.url}, copie tout le contenu pertinent.`,
      })
      continue
    }
    if (page.textSize < 500) {
      blocked.push({
        ...o,
        blockReason: `page trop courte (${page.textSize}c, JS-heavy probable)`,
        pasteHint: `Va sur ${o.url}, copie le contenu visible côté navigateur (pas le source HTML).`,
      })
      continue
    }
    const calendarVerdict = o.missing.includes('calendrier')
      ? detectCalendarPattern(page.text, [])
      : null
    auto.push({
      ...o,
      calendarPattern: calendarVerdict?.pattern,
      calendarEvidence: calendarVerdict?.evidence ?? null,
      pageSize: page.textSize,
      pdfCount: page.pdfCandidates.length,
    })
  }

  console.log(JSON.stringify({ scope, auto, blocked }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}
