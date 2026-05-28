/**
 * Taxonomie des disciplines couvertes par l'agrégateur.
 * Source unique de vérité utilisée par :
 *   - classification IA (prompt Gemini API - Gemma 4 31B / Gemini 3 Flash)
 *   - formulaires d'alerte utilisateur
 *   - pages hub SEO `/disciplines/[slug]`
 *   - normalisation des scrapers
 */

export const DISCIPLINE_SLUGS = [
  'spectacle_vivant',
  'theatre',
  'danse',
  'musique',
  'arts_visuels',
  'arts_plastiques',
  'photographie',
  'litterature',
  'cinema',
  'audiovisuel',
  'numerique',
  'cirque',
  'arts_rue',
  'marionnette',
  'transdisciplinaire',
] as const

export type DisciplineSlug = (typeof DISCIPLINE_SLUGS)[number]

export const DISCIPLINE_LABELS: Record<DisciplineSlug, string> = {
  spectacle_vivant: 'Spectacle vivant',
  theatre: 'Théâtre',
  danse: 'Danse',
  musique: 'Musique',
  arts_visuels: 'Arts visuels',
  arts_plastiques: 'Arts plastiques',
  photographie: 'Photographie',
  litterature: 'Littérature',
  cinema: 'Cinéma',
  audiovisuel: 'Audiovisuel',
  numerique: 'Arts numériques',
  cirque: 'Cirque',
  arts_rue: 'Arts de la rue',
  marionnette: 'Marionnette',
  transdisciplinaire: 'Transdisciplinaire',
}

export const DISCIPLINE_DESCRIPTIONS: Record<DisciplineSlug, string> = {
  spectacle_vivant: 'Toutes formes de performance en direct (théâtre, danse, musique, cirque, rue, marionnette).',
  theatre: 'Création et diffusion théâtrale, texte contemporain et patrimoine.',
  danse: 'Danse contemporaine, classique, traditionnelle, performatif.',
  musique: 'Musiques actuelles, classique, jazz, musiques du monde.',
  arts_visuels: 'Ensemble des pratiques visuelles (peinture, sculpture, installation, photo, vidéo).',
  arts_plastiques: 'Peinture, sculpture, dessin, installations.',
  photographie: 'Photographie documentaire, plasticienne, reportage.',
  litterature: 'Écriture, poésie, essais, création littéraire.',
  cinema: 'Long-métrage, court-métrage, documentaire, fiction.',
  audiovisuel: "Vidéo d'art, web-série, audiovisuel expérimental.",
  numerique: "Création numérique, art génératif, jeu vidéo d'auteur, VR.",
  cirque: 'Cirque contemporain, arts du mouvement, acrobatie.',
  arts_rue: 'Arts de la rue, déambulations, performance publique.',
  marionnette: "Théâtre d'objet, marionnettes, formes animées.",
  transdisciplinaire: 'Projets qui croisent plusieurs disciplines artistiques.',
}

// ==========================================================================
// Audiences cibles
// ==========================================================================

export const AUDIENCE_SLUGS = [
  'individuel',
  'compagnie',
  'association',
  'collectif',
  'etudiant',
  'emergent',
  'etabli',
] as const

export type AudienceSlug = (typeof AUDIENCE_SLUGS)[number]

// ==========================================================================
// Types d'opportunité
// ==========================================================================

export const OPPORTUNITY_TYPES = [
  'residence',
  'subvention',
  'bourse',
  'commande',
  'concours',
  'prix',
  'formation',
] as const

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  residence: 'Résidence',
  subvention: 'Subvention',
  bourse: 'Bourse',
  commande: 'Commande',
  concours: 'Concours',
  prix: 'Prix',
  // Formation : valeur ajoutée à l'enum pour couvrir les programmes
  // type compagnonnage (Cité Européenne des Scénaristes), résidence-école
  // (Series Mania Institute) et bourses de formation.
  formation: 'Formation',
}

// ==========================================================================
// Scopes géographiques
// ==========================================================================

export const GEO_SCOPES = [
  'local',
  'regional',
  'national',
  'metropole',
  'europe',
  'international',
] as const

export type GeoScope = (typeof GEO_SCOPES)[number]

