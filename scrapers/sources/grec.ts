/**
 * Scraper Le GREC — Groupe de Recherche et d'Essais Cinématographiques.
 *
 * Source liste : https://www.grec-info.com/appels.php
 * Détail :       https://www.grec-info.com/fiche_appel.php?id_appel=N
 * CMS : site statique custom (thème Bootstrap, structure changée
 * 2026-05-04 — la liste ne contient plus de `<li>` avec href).
 *
 * Le GREC est une référence pour les premiers courts-métrages / auteurs
 * cinéma débutants — pile la cible « hors réseau » de notre promesse.
 *
 * Stratégie :
 *   1. Fetch la page liste, extraire toutes les ancres `<a href*="id_appel">`.
 *   2. Dedup par id_appel.
 *   3. Pour chaque id_appel, fetch la page détail.
 *   4. Extraire titre H1 + description (corps) depuis la fiche.
 *
 * Filtre : on skip les fiches dont le détail signale "Inscriptions closes"
 * ou équivalent.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry, sleep } from '../lib/fetch-helpers'
import { isAdministrativeNoise } from '../lib/admin-noise-filter'
import { extractCleanDescription } from '../lib/clean-description'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'grec'

const DEFAULT_LIST_URL = 'https://www.grec-info.com/appels.php'
const BASE_URL = 'https://www.grec-info.com'
const DETAIL_THROTTLE_MS = 200

interface AppelLink {
  id: number
  url: string
  /** Premier label rencontré dans la page liste (souvent "En savoir plus"
   *  ou un titre court). On préfère le titre extrait de la fiche détail. */
  listLabel: string
}

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const listUrl = (config.url as string) || DEFAULT_LIST_URL

  const listResp = await fetchWithRetry(listUrl)
  if (!listResp.ok) {
    throw new Error(`GREC liste returned ${listResp.status}`)
  }
  const listHtml = await listResp.text()
  const $list = cheerio.load(listHtml)

  // Étape 1 : collecter toutes les ancres avec id_appel, dédupliquées
  const byId = new Map<number, AppelLink>()
  $list('a[href*="id_appel="]').each((_i, a) => {
    const $a = $list(a)
    const href = $a.attr('href') ?? ''
    const m = href.match(/id_appel=(\d+)/)
    if (!m) return
    const id = Number(m[1])
    if (Number.isNaN(id)) return
    const url = href.startsWith('http')
      ? href.replace(/^http:/, 'https:') // normalise
      : new URL(href, BASE_URL).toString()
    const text = $a.text().replace(/\s+/g, ' ').trim()
    // Garde le label le plus descriptif (≠ "En savoir plus")
    const existing = byId.get(id)
    const isMeaningful = text && !/en\s+savoir\s+plus/i.test(text)
    if (!existing || (isMeaningful && existing.listLabel.length < text.length)) {
      byId.set(id, { id, url, listLabel: isMeaningful ? text : (existing?.listLabel ?? text) })
    }
  })

  if (byId.size === 0) {
    console.warn('[grec] aucun lien fiche_appel détecté sur la page liste — structure peut-être à nouveau changée')
    return []
  }

  // Étape 2 : pour chaque id, fetch la fiche détail et en extraire
  // titre + description.
  const items: RawScrapedItem[] = []
  for (const link of byId.values()) {
    await sleep(DETAIL_THROTTLE_MS)
    const item = await scrapeFiche(link)
    if (item) items.push(item)
  }

  return items
}

async function scrapeFiche(link: AppelLink): Promise<RawScrapedItem | null> {
  let html: string
  try {
    const resp = await fetchWithRetry(link.url)
    if (!resp.ok) {
      console.warn(`[grec] fiche ${link.id} returned ${resp.status}, skip`)
      return null
    }
    html = await resp.text()
  } catch (e) {
    console.warn(`[grec] fiche ${link.id} fetch fail: ${(e as Error).message.slice(0, 80)}`)
    return null
  }

  const $ = cheerio.load(html)
  // Filtre prioritaire : si le titre de session (H3[1] ou H3[2]) signale
  // explicitement « Inscriptions closes », l'opp n'est pas actionable
  // pour l'édition courante. On la skip — le scraper la rattrapera quand
  // la nouvelle édition ouvrira.
  const h3First = $('h3').eq(0).text().replace(/\s+/g, ' ').trim()
  const h3Second = $('h3').eq(1).text().replace(/\s+/g, ' ').trim()
  const titleZone = `${h3First} ${h3Second}`
  if (/inscriptions?\s+clos/i.test(titleZone)) return null

  // Titre : la fiche GREC met le titre en H3[1] sous forme breadcrumb
  // "Faire un premier film // <titre>". On strip le préfixe, sinon
  // fallback H3[1] entier, H1, ou listLabel.
  const breadcrumbMatch = h3First.match(/^Faire un premier film\s*\/\/\s*(.+)$/i)
  let title = ''
  if (breadcrumbMatch && breadcrumbMatch[1].trim().length > 3) {
    title = breadcrumbMatch[1].trim()
  } else if (h3First && h3First.length > 3) {
    title = h3First
  } else {
    const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim()
    // Skip h1 banners type "Les inscriptions se feront sur la plateforme..."
    if (h1 && !/inscriptions?\s+(?:se\s+feront|sur)|veuillez|consultez/i.test(h1)) {
      title = h1
    } else {
      title = link.listLabel
    }
  }

  if (!title || title.length < 5) return null
  // Skip pages "Faire un premier film //" sans suffixe (id_appel=28 cas obs.)
  // ou "Calendrier général" qui n'est pas un appel à candidatures.
  if (/^faire\s+un\s+premier\s+film\s*\/\/?\s*$/i.test(title)) return null
  if (/^calendrier\s+(?:g[ée]n[ée]ral|annuel)/i.test(title)) return null

  const description = extractCleanDescription($)
  if (isAdministrativeNoise(title, description ?? '')) return null

  return {
    external_id: `grec-appel-${link.id}`,
    payload: {
      title,
      description,
      emitter: 'Le GREC',
      url: link.url,
      deadline: null, // dates en texte libre, parsing v2
      amount_text: null,
      discipline_hints: ['cinema', 'audiovisuel'],
      region_hint: null,
      raw_json: {
        source_slug: 'grec',
        id_appel: link.id,
      },
    },
  }
}
