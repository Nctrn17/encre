/**
 * Constantes du périmètre V1 pilote scénariste / auteur AV.
 *
 * Cf. memory project_le_carnet et docs/PILOTE-SCENARISTES.md : Encre cible
 * en V1 les scénaristes et auteurs de l'audiovisuel (cinéma, série,
 * documentaire, court / long, animation, sonore, web).
 *
 * Ces tags servent de filtre par défaut sur la home (compteur d'appels
 * en cours) et sur /aides (liste). Toujours utiliser cette source
 * unique pour rester cohérent — sinon le compteur de la home promet plus
 * d'opps que la liste n'en affiche réellement.
 */
export const PILOT_SCENARISTE_TAGS = [
  'cinema',
  'audiovisuel',
  'scenario',
  'documentaire',
  'court-metrage',
  'long-metrage',
  'serie',
  'animation',
  'sonore',
  'web',
] as const

export type PilotScenaristeTag = (typeof PILOT_SCENARISTE_TAGS)[number]

/**
 * Tags exclus par défaut du listing /aides ET du compteur de la home.
 *
 * Source unique partagée : la home (compteur) et /aides (liste) DOIVENT
 * appliquer la même exclusion, sinon le compteur annonce plus d'aides que
 * la liste n'en montre (bug observé le 28/05 : home 114 vs /aides 99).
 *
 *   - 'non-scenariste' : aides producteurs / distributeurs / exploitants /
 *     techniques (CNC industriel), structurellement hors scope auteur.
 *   Décision 2026-05-29 : 'pays-du-sud' N'EST PLUS exclu. Ces aides sont
 *   rares, on choisit de les inclure dans le listing par défaut (en plus de
 *   la section dédiée /pays-du-sud) plutôt que de les masquer.
 *
 * Note : 'outremer' n'est PAS exclu (les auteurs ultra-marins sont FR et
 * éligibles aux aides DROM-COM comme aux aides métropole).
 */
export const LISTING_DEFAULT_EXCLUDE_TAGS = ['non-scenariste'] as const

/**
 * Toggles activés par défaut sur /aides (cible V1 = auteurs hors-réseau, qui
 * n'ont structurellement ni producteur ni éditeur attaché). Source unique
 * partagée avec le compteur de la home — sinon le compteur promet plus d'opps
 * que la liste n'en affiche réellement (cf. divergence corrigée le 2026-05-30).
 *
 * /aides applique ces filtres côté requête (excludeRequiresProducer /
 * excludeRequiresEditor de listOpportunities) ; le compteur de la home les passe
 * à l'identique pour rester aligné au nombre affiché après clic.
 */
export const LISTING_DEFAULT_SANS_PRODUCTEUR = true
export const LISTING_DEFAULT_SANS_EDITEUR = true

/**
 * Macro-disciplines incluses dans le scope V1 launch.
 *
 * V1 = scénaristes/auteurs uniquement. Pas de musique, danse, cirque,
 * arts plastiques, etc. Le champ DB `opportunities.disciplines` est un
 * `text[]` ; une opp est V1 si au moins une de ses disciplines macro
 * est dans cette liste.
 *
 * Inclut :
 *   - cinema      : scénaristes / réalisateurs (court & long métrage)
 *   - audiovisuel : auteurs TV, sonore, animation, fiction sonore
 *   - litterature : romanciers, essayistes, poètes, traducteurs
 *   - theatre     : auteurs dramatiques (écriture seulement, pas mise en scène)
 *   - numerique   : écritures web, jeux vidéo narratifs, podcast audio,
 *                   écritures innovantes
 *
 * Usage côté pipeline : si la classification LLM donne une discipline hors
 * de cette liste, l'opp est insérée mais marquée `is_published = false`
 * (filtre côté query + source d'audit pour décider d'élargir le scope plus
 * tard).
 */
export const V1_MACRO_DISCIPLINES = [
  'cinema',
  'audiovisuel',
  'litterature',
  'theatre',
  'numerique',
] as const

export type V1MacroDiscipline = (typeof V1_MACRO_DISCIPLINES)[number]

export function isV1Discipline(discipline: string): boolean {
  return (V1_MACRO_DISCIPLINES as readonly string[]).includes(discipline)
}

/**
 * True si au moins une des disciplines fournies est dans le scope V1.
 * `disciplines` correspond au champ DB text[] de la table opportunities.
 */
export function hasV1Discipline(disciplines: readonly string[] | null | undefined): boolean {
  if (!disciplines?.length) return false
  return disciplines.some(isV1Discipline)
}
