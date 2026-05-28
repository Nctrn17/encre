import type { RawItemPayload, ClassificationOutput } from '@/lib/pipeline/schemas'

export interface LlmExtractionEvalCase {
  id: string
  label: string
  emitterName: string
  payload: RawItemPayload
  expected: {
    type?: ClassificationOutput['type']
    geoScope?: ClassificationOutput['geo_scope']
    mustContain?: Partial<Record<'conditions' | 'calendrier' | 'dossier', string[]>>
    mustBeEmpty?: Array<'conditions' | 'calendrier' | 'dossier'>
    shouldBlockDigest: boolean
  }
}

export const LLM_EXTRACTION_EVAL_CASES: LlmExtractionEvalCase[] = [
  {
    id: 'cnc-format-c-recurring',
    label: 'CNC recurring calendar table: closure column only',
    emitterName: 'CNC',
    payload: {
      title: "Aide a l'ecriture de long metrage",
      emitter: 'CNC',
      url: 'https://example.test/cnc-format-c',
      deadline: '29 juin 2026',
      discipline_hints: ['scenario', 'long-metrage'],
      description: `
Le dispositif soutient les auteurs et autrices de long metrage.

Conditions :
- auteur ou autrice de langue francaise ;
- projet de long metrage de fiction ;
- aucun producteur n'est requis au moment du depot.

Calendrier des depots 2026 :
Session | Ouverture du depot | Horaires | Cloture du depot | Commission
1 | 17 novembre 2025 | 10h00-18h00 | 30 janvier 2026 | mars 2026
2 | 6 janvier 2026 | 10h00-18h00 | 30 mars 2026 | mai 2026
3 | 18 fevrier 2026 | 10h00-18h00 | 27 avril 2026 | juin 2026
4 | 16 avril 2026 | 10h00-18h00 | 29 juin 2026 | septembre 2026

Dossier :
- synopsis de 5 pages maximum ;
- note d'intention ;
- CV de l'auteur ou autrice.
`,
    },
    expected: {
      type: 'subvention',
      geoScope: 'national',
      mustContain: {
        conditions: ['aucun producteur'],
        calendrier: ['4 sessions', '30 janvier', '29 juin'],
        dossier: ['synopsis', 'CV'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'beaumarchais-single-cycle',
    label: 'Beaumarchais single cycle with explicit dossier',
    emitterName: 'Association Beaumarchais-SACD',
    payload: {
      title: 'Bourse Beaumarchais cinema',
      emitter: 'Association Beaumarchais-SACD',
      url: 'https://example.test/beaumarchais',
      deadline: '23 mars 2026',
      discipline_hints: ['scenario'],
      description: `
La bourse accompagne l'ecriture de projets cinematographiques.

Conditions :
- etre auteur ou autrice du projet ;
- ne pas avoir de producteur attache au moment de la candidature ;
- une seule candidature par auteur.

Calendrier :
23 mars 2026 : cloture des candidatures.
Juin 2026 : annonce des laureats.

Pieces a fournir :
- formulaire de candidature ;
- synopsis ;
- note d'intention ;
- dix pages dialoguees.
`,
    },
    expected: {
      type: 'bourse',
      mustContain: {
        conditions: ['producteur'],
        calendrier: ['Juin 2026'],
        dossier: ['formulaire', 'dix pages'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'sopadin-age-limit',
    label: 'Prize with age limit and no dossier details',
    emitterName: 'Sopadin',
    payload: {
      title: 'Prix Junior du scenario',
      emitter: 'Sopadin',
      url: 'https://example.test/sopadin',
      deadline: '15 mai 2026',
      description: `
Le Prix Junior du scenario est ouvert aux auteurs de moins de 28 ans.
La candidature concerne un premier scenario de long metrage.
La date limite de depot est fixee au 15 mai 2026.
Le reglement detaille est publie sur le site officiel.
`,
    },
    expected: {
      type: 'prix',
      mustContain: {
        conditions: ['moins de 28 ans'],
      },
      mustBeEmpty: ['dossier'],
      shouldBlockDigest: false,
    },
  },
  {
    id: 'awaiting-next-cycle',
    label: 'Closed cycle, next edition not announced',
    emitterName: 'Residence scenario',
    payload: {
      title: 'Residence annuelle scenario',
      emitter: 'Residence scenario',
      url: 'https://example.test/awaiting',
      deadline: null,
      description: `
L'edition 2025 est cloturee.
La prochaine edition sera annoncee prochainement.
Les modalites a venir seront publiees sur cette page.
`,
    },
    expected: {
      shouldBlockDigest: true,
    },
  },
  {
    id: 'continuous-flow',
    label: 'Continuous flow without deadline',
    emitterName: 'Fondation exemple',
    payload: {
      title: 'Aide au developpement au fil de l eau',
      emitter: 'Fondation exemple',
      url: 'https://example.test/continuous',
      deadline: null,
      description: `
Les candidatures sont examinees au fil de l'eau.
Il n'y a pas de date limite.
Le dossier comprend une presentation du projet et un budget previsionnel.
`,
    },
    expected: {
      mustContain: {
        calendrier: ['Flux continu'],
        dossier: ['presentation du projet', 'budget'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'producer-required',
    label: 'Producer required should be explicit',
    emitterName: 'Region Ile-de-France',
    payload: {
      title: 'Aide au developpement audiovisuel',
      emitter: 'Region Ile-de-France',
      url: 'https://example.test/producer',
      deadline: '30 juin 2026',
      region_hint: 'IDF',
      description: `
Cette aide est reservee aux societes de production etablies en Ile-de-France.
Le producteur doit etre attache au projet au moment du depot.
Date limite : 30 juin 2026.
Dossier : formulaire, devis, plan de financement, note artistique.
`,
    },
    expected: {
      type: 'subvention',
      mustContain: {
        conditions: ['societes de production', 'producteur'],
        dossier: ['plan de financement'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'dossier-marker-empty-is-bad',
    label: 'Dossier marker must not produce empty dossier',
    emitterName: 'ALCA Nouvelle-Aquitaine',
    payload: {
      title: 'Residence documentaire',
      emitter: 'ALCA Nouvelle-Aquitaine',
      url: 'https://example.test/alca',
      deadline: '10 juillet 2026',
      region_hint: 'NAQ',
      description: `
La residence s'adresse aux auteurs et autrices de documentaire.
Date limite : 10 juillet 2026.
Documents a joindre :
- CV ;
- note d'intention ;
- traitement de 10 pages maximum.
`,
    },
    expected: {
      mustContain: {
        dossier: ['CV', '10 pages'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'multi-college-calendar',
    label: 'Two parallel calendars must not be merged',
    emitterName: 'CNC',
    payload: {
      title: 'Aide selective deux colleges',
      emitter: 'CNC',
      url: 'https://example.test/multi-calendar',
      deadline: '18 juin 2026',
      description: `
Calendrier 2026.
Premier college :
Session | Cloture du depot
1 | 29 janvier 2026
2 | 26 mars 2026
3 | 18 juin 2026

Deuxieme college :
Session | Cloture du depot
1 | 26 janvier 2026
2 | 23 mars 2026
3 | 15 juin 2026
`,
    },
    expected: {
      mustContain: {
        calendrier: ['2 calendriers', 'Premier college', 'Deuxieme college'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'pays-du-sud-restriction',
    label: 'Geographic restriction for pays du Sud',
    emitterName: 'Organisation internationale de la Francophonie',
    payload: {
      title: 'Fonds images francophones',
      emitter: 'Organisation internationale de la Francophonie',
      url: 'https://example.test/oif',
      deadline: '1 juillet 2026',
      description: `
Le fonds est reserve aux ressortissants des pays du Sud membres de la Francophonie.
Les candidats francais de metropole ne sont pas eligibles.
Date limite : 1 juillet 2026.
Dossier : formulaire, scenario, budget, contrat de cession des droits.
`,
    },
    expected: {
      geoScope: 'international',
      mustContain: {
        conditions: ['pays du Sud', 'francais de metropole'],
        dossier: ['contrat de cession'],
      },
      shouldBlockDigest: false,
    },
  },
  {
    id: 'no-sections-source',
    label: 'Source with no explicit sections should omit instead of inventing',
    emitterName: 'Collectif exemple',
    payload: {
      title: 'Appel a projets courts metrages',
      emitter: 'Collectif exemple',
      url: 'https://example.test/no-sections',
      deadline: '12 septembre 2026',
      description: `
Un appel a projets est ouvert pour accompagner des courts metrages en ecriture.
La date limite est le 12 septembre 2026.
Le lien de candidature sera disponible sur la page officielle.
`,
    },
    expected: {
      mustBeEmpty: ['conditions', 'dossier'],
      shouldBlockDigest: false,
    },
  },
]
