import { OpportunityDraftSchema, type RawItemPayload, type ClassificationOutput } from './schemas'
import { computeFingerprint, generateOpportunitySlug } from './fingerprint'
import { slugify, stripLongDashes } from '@/lib/utils'
import type { OpportunityDraft } from './schemas'
import { extractEligibility } from './eligibility'

/**
 * Normalise un payload brut en OpportunityDraft prêt pour insertion.
 *
 * Étapes :
 *   1. Parse deadline (ISO strict → fallback parsing FR → null)
 *   2. Parse amount (regex EUR dans amount_text → min/max)
 *   3. Injection de la classification IA (disciplines, audience, type, geo)
 *   4. Calcul fingerprint + slug
 *   5. Validation Zod finale
 *
 * Retourne `null` si le payload est inexploitable (pas de deadline,
 * pas de classification, ou title manquant).
 */
export function normalizeRawItem(params: {
  payload: RawItemPayload
  classification: ClassificationOutput
  sourceSlug: string
}): OpportunityDraft | null {
  const { payload, classification, sourceSlug } = params

  const rawTitle = payload.title?.trim()
  if (!rawTitle || rawTitle.length < 3) return null
  // Normalise les tirets longs dès l'ingestion (titre, émetteur, sections…)
  // pour qu'aucune opp n'en stocke jamais (règle produit, cf. stripLongDashes).
  const title = stripLongDashes(rawTitle)

  const emitter = stripLongDashes(payload.emitter?.trim() || inferEmitterFromSource(sourceSlug))
  const emitterSlug = slugify(emitter)

  const description = cleanDescription(payload.description)
  const deadline = parseDeadline(payload.deadline)
  const { amount_min, amount_max } = parseAmount(payload.amount_text)
  const region_code = parseRegion(payload.region_hint, classification.geo_scope)

  // On calcule le fingerprint d'abord pour pouvoir l'injecter dans la slug
  // et garantir l'unicité même sur des titres longs qui se tronquent pareil.
  const fingerprint = computeFingerprint({ title, emitter, deadline })

  // Extraction des hints pilote scénariste depuis raw_json (nos nouveaux
  // scrapers encodent ces hints directement ; fallback = inférence texte)
  const pilotFields = extractPilotFields({
    title,
    description,
    rawJson: (payload.raw_json ?? {}) as Record<string, unknown>,
    disciplines: classification.disciplines,
  })
  const eligibility = extractEligibility({
    title,
    description,
    rawJson: (payload.raw_json ?? {}) as Record<string, unknown>,
    tags: pilotFields.disciplines_tags,
    requiresProducer: pilotFields.requires_producer,
    requiresEditor: pilotFields.requires_editor,
    ageMax: pilotFields.age_max,
    minFilmsProduced: pilotFields.min_films_produits,
  })

  const draft = {
    slug: generateOpportunitySlug({ title, emitter, fingerprint }),
    title,
    description,
    emitter,
    emitter_slug: emitterSlug,
    type: classification.type,
    disciplines: classification.disciplines,
    audience: classification.audience,
    geo_scope: classification.geo_scope,
    region_code,
    amount_min,
    amount_max,
    currency: 'EUR',
    deadline,
    source_url: payload.url,
    mirror_urls: [],
    fingerprint,
    classify_confidence: classification.confidence,
    human_review: classification.confidence < 0.6,
    // Sections structurées extraites par le LLM (migration 0018).
    // Empty arrays par défaut si la classification ne les a pas remplies.
    conditions: (classification.conditions ?? []).map(stripLongDashes),
    calendrier: (classification.calendrier ?? []).map(stripLongDashes),
    dossier: (classification.dossier ?? []).map(stripLongDashes),
    ...pilotFields,
    ...eligibility,
    eligibility_summary: eligibility.eligibility_summary
      ? stripLongDashes(eligibility.eligibility_summary)
      : eligibility.eligibility_summary,
  }

  const parsed = OpportunityDraftSchema.safeParse(draft)
  if (!parsed.success) {
    console.warn('[normalize] Validation failed:', parsed.error.flatten())
    return null
  }
  return parsed.data
}

function cleanDescription(desc: string | null | undefined): string | null {
  if (!desc) return null
  const trimmed = desc
    .replace(/\s+/g, ' ')
    .replace(/[<][^>]*[>]/g, '') // strip remaining HTML
    .trim()
  if (trimmed.length < 10) return null
  return stripLongDashes(trimmed.slice(0, 10000))
}

function parseDeadline(raw: string | null | undefined): string | null {
  if (!raw) return null

  // Tentative 1 : ISO 8601
  const iso = new Date(raw)
  if (!Number.isNaN(iso.getTime()) && iso.getFullYear() > 2020) {
    return iso.toISOString()
  }

  // Tentative 2 : formats FR "DD/MM/YYYY" ou "DD-MM-YYYY"
  const frMatch = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (frMatch) {
    const [, d, m, y] = frMatch
    const parsed = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T23:59:59+02:00`)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  // Tentative 3 : "31 mai 2026", "15 avril 2026", etc.
  const months: Record<string, string> = {
    janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04',
    mai: '05', juin: '06', juillet: '07', août: '08', aout: '08',
    septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
  }
  const frMonthMatch = raw.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (frMonthMatch) {
    const [, d, mName, y] = frMonthMatch
    const m = months[mName as keyof typeof months]
    if (m) {
      const parsed = new Date(`${y}-${m}-${d.padStart(2, '0')}T23:59:59+02:00`)
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
    }
  }

  return null
}

function parseAmount(raw: string | null | undefined): { amount_min: number | null; amount_max: number | null } {
  if (!raw) return { amount_min: null, amount_max: null }

  const normalized = raw
    .replace(/\u00A0/g, ' ')
    .replace(/(\d)\s+(\d)/g, '$1$2') // "5 000" → "5000"
    .replace(/,/g, '.')

  // "5000€" ou "5000 €"
  const simple = normalized.match(/(\d+)\s*(?:€|EUR|euros?)/i)
  // "de 5000 à 30000€" / "5000-30000€"
  const range = normalized.match(/(\d+)\s*(?:à|-)\s*(\d+)\s*(?:€|EUR|euros?)/i)

  if (range) {
    return {
      amount_min: Number.parseInt(range[1], 10),
      amount_max: Number.parseInt(range[2], 10),
    }
  }
  if (simple) {
    const val = Number.parseInt(simple[1], 10)
    return { amount_min: val, amount_max: val }
  }

  return { amount_min: null, amount_max: null }
}

function parseRegion(
  hint: string | null | undefined,
  geoScope: string,
): string | null {
  if (!hint) return null

  // Cas 1 : le scraper a déjà passé un code (IDF, NA, ARA, BRE, NOR, HDF...)
  // sans préfixe FR-. On le complète.
  const upperHint = hint.toUpperCase().trim()
  const CODE_MAP: Record<string, string> = {
    IDF: 'FR-IDF',
    ARA: 'FR-ARA',
    BRE: 'FR-BRE',
    NOR: 'FR-NOR',
    HDF: 'FR-HDF',
    NA: 'FR-NAQ', // Nouvelle-Aquitaine
    NAQ: 'FR-NAQ',
    GES: 'FR-GES',
    OCC: 'FR-OCC',
    PDL: 'FR-PDL',
    PAC: 'FR-PAC',
    BFC: 'FR-BFC',
    CVL: 'FR-CVL',
    COR: 'FR-COR',
  }
  if (CODE_MAP[upperHint]) return CODE_MAP[upperHint]
  if (upperHint.startsWith('FR-') && upperHint.length <= 10) return upperHint

  // Cas 2 : nom en français — ancien mapping
  const map: Record<string, string> = {
    'grand est': 'FR-GES',
    'grand-est': 'FR-GES',
    'hauts-de-france': 'FR-HDF',
    'hauts de france': 'FR-HDF',
    'île-de-france': 'FR-IDF',
    'ile-de-france': 'FR-IDF',
    paris: 'FR-IDF',
    'auvergne-rhône-alpes': 'FR-ARA',
    'auvergne-rhone-alpes': 'FR-ARA',
    lyon: 'FR-ARA',
    bretagne: 'FR-BRE',
    rennes: 'FR-BRE',
    occitanie: 'FR-OCC',
    toulouse: 'FR-OCC',
    montpellier: 'FR-OCC',
    'nouvelle-aquitaine': 'FR-NAQ',
    bordeaux: 'FR-NAQ',
    normandie: 'FR-NOR',
    'pays de la loire': 'FR-PDL',
    'pays-de-la-loire': 'FR-PDL',
    nantes: 'FR-PDL',
    'provence-alpes-côte d\'azur': 'FR-PAC',
    marseille: 'FR-PAC',
    'bourgogne-franche-comté': 'FR-BFC',
    'centre-val de loire': 'FR-CVL',
    corse: 'FR-COR',
  }
  const key = hint.toLowerCase().trim()
  return map[key] ?? null
}

/**
 * Extraction des champs pilote scénariste (migration 0011) + filtre auteurs
 * (migration 0019) depuis le raw_json + inférence texte en fallback.
 *
 * Priorité aux hints explicites encodés par les scrapers :
 *   - raw_json.hint_hors_reseau_friendly (boolean)
 *   - raw_json.hint_requires_producer (boolean)
 *   - raw_json.hint_requires_editor (boolean)
 *   - raw_json.hint_min_films_produits (0 | 1 | 2)
 *   - raw_json.hint_age_max (int)
 *
 * Pour les items sans hints (anciens scrapers CNL/CNC/CNM/culture-gouv/
 * fondation-france/drac-rss/GREC), inférence par regex sur title+description.
 */
export function extractPilotFields(params: {
  title: string
  description: string | null
  rawJson: Record<string, unknown>
  disciplines: readonly string[]
}): {
  hors_reseau_friendly: boolean
  min_films_produits: number | null
  requires_producer: boolean
  requires_editor: boolean
  age_max: number | null
  disciplines_tags: string[]
} {
  const { title, description, rawJson, disciplines } = params
  const text = `${title}\n${description ?? ''}`.toLowerCase()

  // Lecture prioritaire des hints explicites
  const hintHorsReseau = typeof rawJson.hint_hors_reseau_friendly === 'boolean'
    ? rawJson.hint_hors_reseau_friendly
    : undefined
  const hintRequiresProducer = typeof rawJson.hint_requires_producer === 'boolean'
    ? rawJson.hint_requires_producer
    : undefined
  const hintRequiresEditor = typeof rawJson.hint_requires_editor === 'boolean'
    ? rawJson.hint_requires_editor
    : undefined
  const hintMinFilms = typeof rawJson.hint_min_films_produits === 'number'
    ? rawJson.hint_min_films_produits
    : undefined
  const hintAgeMax = typeof rawJson.hint_age_max === 'number'
    ? rawJson.hint_age_max
    : undefined

  // Inférence fallback — patterns FR de fermeture hors-réseau
  const requiresProducerInferred =
    /entreprises?\s+de\s+production/i.test(text) ||
    /société\s+de\s+production|producteur\s+(?:obligatoire|requis|attaché)|portée?\s+par\s+(?:un|une|le|la)\s+producteur/i.test(text) ||
    /(?:sociétaire\s+sacd|dans\s+le\s+cadre\s+d'une\s+société\s+de\s+production)/i.test(text)

  // Inférence fallback — patterns FR exigence d'éditeur (migration 0019)
  // Couvre : aides destinées aux maisons d'édition (CNL, régions),
  //          candidature déposée par l'éditeur, livre déjà publié, etc.
  const requiresEditorInferred =
    /\béditeur\s+(?:obligatoire|requis|attaché)\b/i.test(text) ||
    /candidature\s+(?:via|par)\s+(?:l['']\s*)?éditeur/i.test(text) ||
    /(?:déposée?|portée?)\s+par\s+(?:l['']\s*|un\s+|une\s+|votre\s+)?éditeur/i.test(text) ||
    /(?:aide|subvention|soutien|prêt)\s+(?:aux?|destinée?\s+aux?|réservée?\s+aux?)\s+(?:maisons?\s+d['']?édition|éditeurs?)/i.test(text) ||
    // "à compte d'éditeur" est une expression idiomatique qui implique un éditeur ;
    // pas besoin de la lier à un mot précédent. Pas de \b autour des chars
    // non-ASCII (à, é) car JS regex ne les considère pas comme word chars.
    /(?:^|\s)à\s+compte\s+d['']\s*éditeur(?:[^a-z0-9]|$)/i.test(text) ||
    /\béditeur\s+français\s+(?:doit|devra)\b/i.test(text)

  const horsReseauInferred =
    hintHorsReseau !== undefined
      ? hintHorsReseau
      : !(requiresProducerInferred || requiresEditorInferred)

  // Age max — regex "moins de XX ans"
  const ageMatch = text.match(/moins\s+de\s+(\d{2})\s+ans|(\d{2})\s+ans\s+(?:ou\s+moins|maximum)/i)
  const ageMaxInferred = ageMatch
    ? Number.parseInt(ageMatch[1] ?? ageMatch[2], 10)
    : null

  // Min films produits — indices rares dans le texte
  const isFirstTimer = /premier\s+(?:court|long|film|projet)|1er\s+(?:court|long|film)|débutant|émergent|jamais\s+produit/i.test(text)
  const minFilmsInferred = hintMinFilms !== undefined ? hintMinFilms : isFirstTimer ? 0 : null

  // disciplines_tags = enrichissement de disciplines avec tags fins
  const tags = new Set<string>(disciplines)
  const hintTags = Array.isArray(rawJson.hint_disciplines_tags)
    ? rawJson.hint_disciplines_tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  for (const tag of hintTags) {
    tags.add(tag)
  }

  // Garde-fou : si l'opp est déjà étiquetée comme photographie / arts-visuels
  // au niveau discipline, on n'auto-tag PAS serie / documentaire / scenario
  // depuis le texte. Cas typique : la bourse Photographe Lagardère 2026 dont
  // la description mentionne « projet photographique […] (reportage, série,
  // documentaire visuel) » — le mot « série » désigne ici un objet photo,
  // pas un format AV. Sans ce garde-fou on remonte la bourse photo dans le
  // listing pilote scénariste, ce qui pollue la V1.
  const visualOnlyContext =
    disciplines.includes('photographie') ||
    disciplines.includes('arts_visuels') ||
    disciplines.includes('arts_plastiques')

  if (!visualOnlyContext) {
    if (/scénario/i.test(text)) tags.add('scenario')
    if (/documentaire\b/i.test(text)) tags.add('documentaire')
  }
  if (/court(?:-|\s+)?métrage/i.test(text)) tags.add('court-metrage')
  if (/long(?:-|\s+)?métrage/i.test(text)) tags.add('long-metrage')

  // Séries — détection large : « série » seul, mini-série, feuilleton,
  // série d'animation, websérie, fiction sérielle, unitaire (90 min).
  // Évite « série de bourses » / « série de prix » (faux positifs).
  const seriePattern =
    /(?:mini[\s-]?)?séri(?:e|elle)s?(?:\s+(?:de\s+)?(?:fiction|tv|télé|télévis|d['']animation|animation|web|documentaire|courte|longue))?|feuilleton|fiction\s+sérielle|écriture\s+sérielle|création\s+sérielle|format\s+sériel|unitaire\s+(?:tv|télé|fiction|90)|épisode\s+pilote|premier\s+épisode|saison\s+\d|web[\s-]?séri/i
  const serieFalsePositive =
    /série\s+de\s+(?:bourses|prix|résidences|rencontres|conférences|publications|photos?|photographiques?|d['']?images?)/i
  if (seriePattern.test(text) && !serieFalsePositive.test(text) && !visualOnlyContext) {
    tags.add('serie')
  }

  // Bible de série — document fondateur (personnages, arche, ton).
  // Spécifique au workflow scénariste TV/streaming.
  if (!visualOnlyContext && /\bbible\s+(?:de\s+)?séri|bible[\s-]?série|série\s+(?:et|avec)\s+bible|écriture\s+(?:de\s+la\s+)?bible|développement\s+(?:de\s+la\s+)?bible/i.test(text)) {
    tags.add('bible')
    tags.add('serie')
  }

  // Pilote TV — épisode pilote, pitch série, concept série
  if (!visualOnlyContext && /\bpilote\s+(?:de\s+)?(?:série|fiction|tv|télé)|épisode\s+pilote|écriture\s+(?:du\s+)?pilote|pitch\s+(?:de\s+)?séri/i.test(text)) {
    tags.add('pilote-tv')
    tags.add('serie')
  }

  if (/animation\b/i.test(text)) tags.add('animation')
  if (/sonore|podcast|radio\s|création\s+sonore/i.test(text)) tags.add('sonore')
  if (/vidéaste|web\s+narrat|youtube|internet|web[\s-]?séri/i.test(text)) tags.add('web')
  if (/roman\b|poésie|essai\b|nouvelle\b/i.test(text)) tags.add('litterature')
  if (/théâtre/i.test(text)) tags.add('theatre')

  // Pays du Sud — éligibilité réservée aux créateurs des pays
  // francophones du Sud (zone OIF / TV5MONDE+). On capte la mention
  // explicite, le nom des fonds majeurs, et les listes-pays types.
  // Volontairement strict pour éviter les faux positifs sur les opps FR
  // qui mentionneraient juste un partenariat avec un pays du Sud.
  const paysDuSudPattern =
    /\bfonds\s+image\s+(?:de\s+la\s+)?francophonie\b|tv5[\s-]?monde\s*(?:\+|plus)+|fonds\s+francophonie\s+tv5|pays\s+(?:du\s+)?sud|pays\s+francophones?\s+du\s+sud|sud\s+global\b|(?:réservé|destiné|ouvert)\s+(?:aux\s+)?(?:auteurs?|créateurs?|producteurs?)\s+(?:des\s+|du\s+)?(?:pays\s+)?(?:du\s+)?sud|(?:éligibilité|nationalité)\s+(?:pays\s+)?(?:du\s+)?sud/i
  if (paysDuSudPattern.test(text)) {
    tags.add('pays-du-sud')
  }

  // Formation — programmes pédagogiques (compagnonnage, writers' room,
  // résidence-école, atelier de formation). Distinct des résidences
  // de pure création.
  const formationPattern =
    /\bcompagnonnage\b|writers?[\s-]?room\b|workshop\s+(?:écriture|scénario)|atelier\s+de\s+formation|résidence[\s-]école|formation\s+(?:professionnelle\s+)?(?:au|en|à\s+l['']?)\s*(?:écriture|scénario|série)|programme\s+(?:de\s+)?formation|writers?\s+campus|series\s+lab|series\s+mania\s+institute|cité\s+européenne\s+des\s+scénaristes/i
  if (formationPattern.test(text)) {
    tags.add('formation')
  }

  // Outre-mer — deux cas distincts qui méritent tous les deux le tag :
  //   1. Aides spécifiquement ouvertes (ou réservées en priorité) aux
  //      auteurs ultra-marins.
  //   2. Aides métropolitaines qui couvrent transport/logement pour les
  //      candidats d'outre-mer (signal accessibilité critique : sans ça,
  //      le ticket d'avion + un mois d'hébergement à Paris exclut de fait
  //      la majorité des candidats DROM-COM).
  // Les territoires individuels (Guadeloupe, Martinique, etc.) en mention
  // simple ne suffisent PAS — il faut un cadre d'éligibilité ou d'aide.
  const outremerEligibilityPattern =
    /(?:réservée?s?|destinée?s?|prioritaires?|ouverte?s?|accessibles?|exclusivement|principalement|habitants?)[^.]{0,80}(?:ultra[\s-]?marins?|ultramarins?|d['']outre[\s-]?mer|outre[\s-]?mer|territoires?\s+ultramarins?|drom|guadeloupéens?|martiniquais|guyanais|réunionnais|mahorais|calédoniens?|polynésiens?|antillais)/i
  const outremerEligibilityTerritoriesPattern =
    /(?:réservée?s?|destinée?s?|prioritaires?|ouverte?s?|accessibles?|priorité)[^.]{0,80}(?:candidats?|auteurs?|créateurs?|résidents?|projets?)[^.]{0,40}(?:de\s+(?:la\s+|l['']\s*)?|du\s+|en\s+|à\s+(?:la\s+|l['']\s*)?)?(?:guadeloupe|martinique|guyane|(?:la\s+)?réunion|mayotte|nouvelle[\s-]?calédonie|polynésie\s+française)/i
  const outremerLocalAidPattern =
    /drac\s+(?:guadeloupe|martinique|guyane|(?:la\s+)?réunion|mayotte|nouvelle[\s-]?calédonie|polynésie|saint[\s-]?pierre)|(?:fonds|aide|bourse|dispositif|conseil\s+régional|région|territoire|office)(?:\s+\S+){0,5}\s+(?:de\s+|du\s+|à\s+|en\s+|au\s+)?(?:la\s+|l['']\s*)?(?:outre[\s-]?mer|territoires?\s+ultramarins?|guadeloupe|martinique|guyane|réunion|mayotte|nouvelle[\s-]?calédonie|polynésie)/i
  const outremerTravelCoveragePattern =
    /(?:transport|déplacement|voyage|logement|hébergement|billet|trajet)[^.]{0,80}(?:outre[\s-]?mer|ultra[\s-]?marin|drom|d['']outre[\s-]?mer|guadeloupe|martinique|guyane|réunion|mayotte)/i
  if (
    outremerEligibilityPattern.test(text) ||
    outremerEligibilityTerritoriesPattern.test(text) ||
    outremerLocalAidPattern.test(text) ||
    outremerTravelCoveragePattern.test(text)
  ) {
    tags.add('outremer')
  }

  // Audience non-auteur — aides destinées à des producteurs, distributeurs,
  // exploitants (salles), techniques (effets visuels), agréments investissements.
  // Toutes ces aides peuvent être correctement taguées « cinéma » ou
  // « audiovisuel » au niveau discipline, mais elles sont structurellement
  // hors scope pour le pilote V1 scénariste qui cible les auteurs en phase
  // écriture. On les marque pour pouvoir les exclure côté listing /aides.
  //
  // Exemple concret : « Aide aux moyens techniques : collège tournage »,
  // « Aide sélective à la petite et moyenne exploitation », « Agrément des
  // investissements » — tous CNC, tous cinéma, tous inutiles pour le pilote.
  // Pattern à 2 niveaux pour réduire les faux positifs :
  //   - amorce  : « aide », « fonds », « dispositif », « soutien »,
  //               « programme », « agrément »
  //   - keyword : terme industriel typique (exploitation, distribution,
  //               effets visuels, coproduction, etc.) à 80 chars max.
  // Plus quelques patterns stand-alone très spécifiques.
  const audienceNonAuteurPattern =
    /\b(?:aide|fonds|dispositif|soutien|programme|agrément)\b[^.\n]{0,80}\b(?:exploitation|distribution\b(?!\s+des\s+r[ôo]les)|diffusion\s+en\s+ligne|effets?\s+visuels?|moyens?\s+techniques?|techniques?\s+d['']?animation|coproduction|co[\s-]?d[ée]veloppement|exploitants?|distributeurs?|diffuseurs?|salles?\s+de\s+cinéma|programme\s+de\s+production|production\s+(?:de\s+(?:musique|films?|œuvres)|déléguée)|investissements?|exploitation\s+itinérante|édition\s+en\s+vidéo\s+physique|édition\s+de\s+livres?\s+de\s+cinéma|éducation\s+aux?\s+images?|dispositifs?\s+innovants?|inspiration\s+tour)\b|\bagrément\s+des\s+investissements\b|collège\s+«\s*tournage\s*»|développement\s+de\s+l['']?emploi|inspiration\s+tour/i
  const audienceNonAuteurAsciiPattern =
    /\b(?:aide|fonds|dispositif|soutien|programme|agrement)\b[^.\n]{0,100}\b(?:edition\s+en\s+video\s+physique|edition\s+de\s+livres?\s+de\s+cinema|education\s+aux?\s+images?|dispositifs?\s+innovants?|inspiration\s+tour)\b|inspiration\s+tour/i
  if (audienceNonAuteurPattern.test(text) || audienceNonAuteurAsciiPattern.test(text)) {
    tags.add('non-scenariste')
  }

  return {
    hors_reseau_friendly: horsReseauInferred,
    min_films_produits: minFilmsInferred,
    requires_producer: hintRequiresProducer ?? requiresProducerInferred,
    requires_editor: hintRequiresEditor ?? requiresEditorInferred,
    age_max: hintAgeMax ?? ageMaxInferred,
    disciplines_tags: Array.from(tags),
  }
}

function inferEmitterFromSource(sourceSlug: string): string {
  const map: Record<string, string> = {
    'data-culture-gouv': 'Ministère de la Culture',
    'drac-grand-est': 'DRAC Grand Est',
    'drac-hauts-de-france': 'DRAC Hauts-de-France',
    'drac-ara': 'DRAC Auvergne-Rhône-Alpes',
    'fondation-france-culture': 'Fondation de France',
    'fondation-carasso': 'Fondation Carasso',
    'cnap-residences': 'CNAP',
    'artcena-appels': 'ARTCENA',
    'arts-en-residence': 'Arts en résidence',
  }
  return map[sourceSlug] ?? 'Émetteur inconnu'
}
