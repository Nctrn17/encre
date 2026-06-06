/**
 * Scraper niches-metropole — fonds métropolitains additionnels.
 *
 * Sources curées en mai 2026 : Procirep (2 commissions), Trégor Cinéma,
 * Cinéma de Demain (Festival Cannes), L'Atelier des cinéastes Lyon,
 * Atelier 105 CNC (post-prod expérimental).
 *
 * Skippées faute de données fiables :
 *   - France TV Slash « Appel à concepts » — pas d'édition 2026 référencée
 *     en mai. À retenter à l'automne 2026.
 *   - Festival Polar Cognac « Polar Connection » — prix roman pour
 *     adaptation, pas une bourse scénariste directe ; intérêt limité
 *     pour le pilote AV strict.
 *   - Femmes&Cinéma « Plus Belle La Bourse » — programme introuvable
 *     en ligne, possiblement renommé.
 *
 * Pattern « health-check + static emit ». Comme pays-du-sud-international,
 * chaque item porte son propre `emitter` correct.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'niches-metropole'

interface NicheItem {
  externalId: string
  emitter: string
  title: string
  description: string
  url: string
  amountText: string | null
  deadline: string | null
  healthCheckUrl: string
  healthCheckKeyword: string
  hintRequiresProducer: boolean
  hintHorsReseauFriendly: boolean
  hintDisciplinesTags: string[]
  hintType?: string
}

const NICHES_2026: NicheItem[] = [
  {
    externalId: 'procirep-commission-cinema-2026-q3',
    emitter: 'Procirep · Commission Cinéma',
    title: 'Procirep · Commission Cinéma — aide au développement long métrage',
    description:
      "Aide remboursable à 50 % aux sociétés de production cinéma françaises pour le " +
      "développement de leurs projets de long métrage, fondée sur leur politique " +
      "d'investissement en écriture de scénario. Montants 12 000 à 50 000 € selon la " +
      "société et le projet. 4 commissions par an (mars, juin, septembre, décembre) ; " +
      "deadlines respectives : 5 janvier, 1er avril, 1er juillet, 1er octobre. " +
      "Société de production française obligatoire — l'auteur·rice candidate via son " +
      "producteur attaché, pas en direct.",
    url: 'https://www.procirep.fr/Commission-Cinema.html',
    amountText: '12 000 à 50 000 €',
    deadline: '2026-07-01T23:59:59+02:00', // Commission septembre 2026
    healthCheckUrl: 'https://www.procirep.fr/',
    healthCheckKeyword: 'procirep',
    hintRequiresProducer: true,
    hintHorsReseauFriendly: false,
    hintDisciplinesTags: ['long-metrage', 'scenario'],
  },
  {
    externalId: 'procirep-commission-tv-2026-q3',
    emitter: 'Procirep · Commission Télévision',
    title: 'Procirep · Commission Télévision — aide au développement audiovisuel',
    description:
      "Aide aux sociétés de production audiovisuelle françaises pour le développement " +
      "de fictions, documentaires, séries, animation. Calendrier de 4 commissions par " +
      "an aligné sur la Commission Cinéma. Société de production française obligatoire. " +
      "Particulièrement utile pour les scénaristes séries dont le producteur cherche un " +
      "soutien au développement avant tournage.",
    url: 'https://www.procirep.fr/Commission-Television.html',
    amountText: null,
    deadline: '2026-07-01T23:59:59+02:00',
    healthCheckUrl: 'https://www.procirep.fr/',
    healthCheckKeyword: 'procirep',
    hintRequiresProducer: true,
    hintHorsReseauFriendly: false,
    hintDisciplinesTags: ['serie', 'documentaire', 'animation', 'scenario'],
  },
  {
    externalId: 'tregor-cinema-residence-2026',
    emitter: 'Trégor Cinéma',
    title: 'Trégor Cinéma — résidence d\'écriture individuelle 2026',
    description:
      "Résidence d'écriture individuelle de 15 jours pour scénaristes francophones " +
      "travaillant sur un court métrage, une série ou un premier long métrage. " +
      "Sessions étalées d'octobre à juin. Espace bureau privé, hébergement avec " +
      "cuisine, bibliothèque cinéma + littérature, et accompagnement personnalisé " +
      "d'un·e professionnel·le du cinéma. Candidatures ouvertes du 4 mai au 30 juin " +
      "2026 — seules les 150 premières candidatures complètes sont examinées, ne pas " +
      "attendre la dernière minute. Candidature libre par l'auteur·rice, pas de " +
      "producteur requis.",
    url: 'https://www.tregorcinema.com/',
    amountText: 'Résidence (hébergement + accompagnement) — pas de bourse directe',
    deadline: '2026-06-30T23:59:59+02:00',
    healthCheckUrl: 'https://www.tregorcinema.com/',
    healthCheckKeyword: 'résidence',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'court-metrage', 'serie', 'long-metrage'],
  },
  {
    externalId: 'cinema-de-demain-residence-52',
    emitter: 'Festival de Cannes · Cinéma de Demain',
    title: 'Résidence Cinéma de Demain — 52e session (Festival de Cannes)',
    description:
      "Résidence d'écriture du Festival de Cannes destinée à 12 jeunes cinéastes " +
      "étrangers (non résidents ni citoyens français) qui ont réalisé un ou plusieurs " +
      "courts métrages et pas plus d'un long métrage. Travail sur scénario de 1er ou " +
      "2e long métrage de fiction. 52e session : du 1er octobre 2026 au 15 février " +
      "2027, séjour parisien du 16 mars au 31 juillet 2026 selon les profils. " +
      "Accompagnement sur mesure + rencontres professionnelles. Inscriptions jusqu'au " +
      "31 mai 2026.",
    url: 'https://cinemadedemain.festival-cannes.com/participer/sinscrire-a-la-residence/',
    amountText: 'Résidence Paris (hébergement + accompagnement)',
    deadline: '2026-05-31T23:59:59+02:00',
    healthCheckUrl: 'https://cinemadedemain.festival-cannes.com/',
    healthCheckKeyword: 'résidence',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'foreign-only'],
  },
  {
    externalId: 'atelier-des-cineastes-lyon-2027',
    emitter: "L'Échappée · L'Atelier des cinéastes (Métropole de Lyon)",
    title: "L'Atelier des cinéastes — bourse écriture + atelier transmission",
    description:
      "Programme d'accompagnement de l'association L'Échappée, soutenu par la Métropole " +
      "de Lyon. Triple soutien : bourse d'écriture pour développer un projet de film, " +
      "financement dédié à la mise en place d'un atelier de pratique cinématographique " +
      "auprès d'un public amateur, et accompagnement personnalisé par des professionnels " +
      "du secteur. Cible : auteur·ices-réalisateur·ices en phase d'écriture. " +
      "Édition 2026 close depuis le 2 mars 2026. Prochaine édition 2027 ouvrira au " +
      "début 2027.",
    url: 'https://www.lechappee-asso.fr/latelier-des-cineastes-metropole-de-lyon/',
    amountText: "Bourse d'écriture + atelier transmission",
    deadline: null, // édition 2026 close
    healthCheckUrl: 'https://www.lechappee-asso.fr/',
    healthCheckKeyword: 'écha', // tolère "L'Échappée" / "Lechappee"
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'court-metrage'],
  },
  {
    externalId: 'atelier-105-cnc-post-prod-2026',
    emitter: 'Atelier 105 · CNC',
    title: 'Atelier 105 — résidence de post-production vidéo (cinéma expérimental)',
    description:
      "Programme de résidence de post-production CNC dédié aux films du spectre cinéma " +
      "expérimental. Cible : courts, moyens et longs métrages en production ou déjà " +
      "tournés, avec ou sans producteur. Durée : 2 à 3 semaines maximum sur place. " +
      "Particularité hors-réseau : la résidence est accessible aux auteur·ices sans " +
      "société de production rattachée, ce qui est rare pour ce stade de production. " +
      "Calendrier des candidatures publié par le CNC.",
    url: 'https://www.cnc.fr/cinema/actualites/appel-a-projets-atelier-105-residence-de-postproduction-video_137933',
    amountText: 'Résidence (équipement + accompagnement)',
    deadline: null,
    healthCheckUrl: 'https://www.cnc.fr/',
    healthCheckKeyword: 'cnc',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['court-metrage', 'long-metrage', 'documentaire'],
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const results = await Promise.allSettled(
    NICHES_2026.map(async (n) => {
      try {
        const resp = await fetchWithRetry(n.healthCheckUrl, { timeoutMs: 8000 })
        if (!resp.ok) {
          console.warn(`  [niches-metropole] ${n.emitter}: HTTP ${resp.status} — skip`)
          return null
        }
        const html = (await resp.text()).toLowerCase()
        if (!html.includes(n.healthCheckKeyword)) {
          console.warn(
            `  [niches-metropole] ${n.emitter}: keyword "${n.healthCheckKeyword}" absent — skip`,
          )
          return null
        }
        return n
      } catch (err) {
        console.warn(`  [niches-metropole] ${n.emitter}: ${(err as Error).message} — skip`)
        return null
      }
    }),
  )

  const surviving = results
    .filter((r): r is PromiseFulfilledResult<NicheItem | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is NicheItem => v !== null)

  return surviving.map((n) => ({
    external_id: n.externalId,
    payload: {
      emitter: n.emitter,
      title: n.title,
      description: n.description,
      deadline: n.deadline,
      url: n.url,
      amount_text: n.amountText,
      region_hint: null,
      discipline_hints: ['audiovisuel'],
      raw_json: {
        source_slug: slug,
        item_external_id: n.externalId,
        hint_disciplines_tags: n.hintDisciplinesTags,
        hint_requires_producer: n.hintRequiresProducer,
        hint_hors_reseau_friendly: n.hintHorsReseauFriendly,
        hint_requires_editor: false,
      },
    },
  }))
}
