/**
 * Scraper Le Groupe Ouest (Bretagne).
 *
 * Site : https://www.legroupeouest.com/
 * 5 workshops en résidence : Sélection annuelle (LA référence), LIM / Less
 * is More (européen), Groupe Ouest Développement, Pré-écriture, Le Raconte-moi.
 *
 * Réf : docs/PILOTE-SCENARISTES.md section 3.2
 */

import { extractPageText } from '../lib/extract-page-text'
import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'le-groupe-ouest'

const BASE = 'https://www.legroupeouest.com'
const ROOT_URL = `${BASE}/workshops-en-residence/`
const EMITTER = 'Le Groupe Ouest'

const WORKSHOPS = [
  {
    slug: 'selection-annuelle',
    path: '/workshops-en-residence/selection-annuelle/',
    title: 'Le Groupe Ouest — Sélection Annuelle (scénario long métrage)',
    description:
      'Accompagnement de 9 mois pour 8 projets-lauréats de long métrage de fiction chaque année. Programme phare du Groupe Ouest, très sélectif. Scénaristes avec expérience de production ou passage en festival. Appel annuel automne.',
    hors_reseau_friendly: false, // requires some experience
  },
  {
    slug: 'lim-less-is-more',
    path: '/workshops-en-residence/lim-less-is-more/',
    title: 'Le Groupe Ouest — LIM (Less is More)',
    description:
      'Programme européen de développement de long métrage pour cinéastes engagés dans un monde en mutation. Réservé aux auteurs avec projet développé.',
    hors_reseau_friendly: false,
  },
  {
    slug: 'groupe-ouest-developpement',
    path: '/workshops-en-residence/groupe-ouest-developpement/',
    title: 'Le Groupe Ouest — Développement (long, court, séries, producteurs)',
    description:
      'Workshops en résidence pour auteur·e·s de long métrage, court métrage, série, ainsi que producteur·rice·s. Formats et durées variables selon les sessions.',
    hors_reseau_friendly: true,
  },
  // NB : pre-ecriture et raconte-moi ont été retirés 2026-05-04 après
  // review humaine /curation-prep. Ce sont des PAGES OUTILS pédagogiques
  // (concept, manifeste, accompagnement narratif) et NON des appels à
  // candidatures publics. Leur scraping créait des opps fantômes sans
  // conditions, calendrier ni dossier — pollution de l'inventaire V1.
  // À ne PAS réintroduire sans vérifier sur le site qu'une vraie page
  // de candidature existe.
] as const

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(ROOT_URL)
  if (!resp.ok) {
    console.warn(`  [groupe-ouest] HTTP ${resp.status}`)
    return []
  }

  const items: RawScrapedItem[] = []

  for (const workshop of WORKSHOPS) {
    const url = `${BASE}${workshop.path}`
    const page = await extractPageText(url, {
      maxChars: 16_000,
      minUsefulChars: 400,
    })

    if (!page) {
      console.warn(`  [groupe-ouest] page workshop inexploitable : ${url}`)
    }

    const followupText = page?.followupUrl
      ? await extractFollowupText(page.followupUrl)
      : null

    items.push({
      external_id: `groupe-ouest-${workshop.slug}`,
      payload: {
        title: workshop.title,
        description: buildDescription(workshop.description, page?.text, followupText),
        emitter: EMITTER,
        url,
        deadline: null,
        amount_text: null,
        discipline_hints: ['cinema', 'audiovisuel'],
        region_hint: 'BRE', // Bretagne
        raw_json: {
          source_slug: 'le-groupe-ouest',
          workshop_slug: workshop.slug,
          hint_hors_reseau_friendly: workshop.hors_reseau_friendly,
          hint_requires_producer: false,
          source_text_chars: page?.textSize ?? 0,
          followup_url: page?.followupUrl ?? null,
          followup_text_chars: followupText?.length ?? 0,
        },
      },
    })
  }

  return items
}

async function extractFollowupText(url: string): Promise<string | null> {
  const followup = await extractPageText(url, {
    maxChars: 8_000,
    minUsefulChars: 300,
  })
  return followup?.text ?? null
}

function buildDescription(
  fallbackDescription: string,
  pageText: string | null | undefined,
  followupText: string | null,
): string {
  const chunks = [
    fallbackDescription,
    pageText ? `Texte source de la page workshop :\n${pageText}` : null,
    followupText ? `Texte source de la page candidature liée :\n${followupText}` : null,
  ].filter(Boolean)

  return chunks.join('\n\n').slice(0, 24_000)
}
