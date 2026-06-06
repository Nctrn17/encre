import { ClassificationOutputSchema, type ClassificationOutput, type RawItemPayload } from './schemas'
import {
  detectCalendarPattern,
  applyContinuousFlowOverride,
  synthesizeFormatAFromProchaineList,
  type CalendarPattern,
} from './calendar-pattern'
import { stripSuspectChars } from '../normalize/quality'
import { normalizeSectionList, type SectionKind } from '@/lib/normalize/section-item'
import {
  DISCIPLINE_SLUGS,
  AUDIENCE_SLUGS,
  OPPORTUNITY_TYPES,
  GEO_SCOPES,
} from '@/lib/discipline-taxonomy'

/**
 * Classification d'une opportunité brute via Google AI Studio (Gemini API).
 *
 * Modèles utilisés :
 * - Défaut : `gemma-4-31b-it` (1 500 RPD free tier, function calling natif).
 * - 2ᵉ passe optionnelle : `gemini-3-flash-preview` (20 RPD free tier) déclenchée
 *   par `process-raw.ts` quand la confidence Gemma < 0.6.
 *
 * Filet final si l'API échoue : `classifyLocalFallback` (regex).
 */

export const DEFAULT_CLASSIFY_MODEL = 'gemma-4-31b-it'
export const SECOND_PASS_MODEL = 'gemini-3-flash-preview'

export const CLASSIFY_SYSTEM_PROMPT = `Tu es un classificateur expert du secteur culturel français. Tu reçois une annonce d'appel à projets, de résidence d'artiste, de subvention, de bourse, de commande ou de prix, et tu la classifies selon une taxonomie stricte.

Réponds UNIQUEMENT via l'outil "classify_opportunity" avec les champs exacts demandés.

Règles classification :
- "disciplines" : 1 à 5 tags maximum parmi la liste fournie. Si l'appel est multi-disciplinaire sans précision, utiliser "transdisciplinaire".
- "audience" : qui peut candidater (individuel artiste, compagnie, association, collectif, étudiant, émergent, établi). 1 à 4 tags.
- "type" : un seul parmi résidence / subvention / bourse / commande / concours / prix.
- "geo_scope" : portée géographique du bénéficiaire (local / régional / national / métropole / europe / international).
- "confidence" : 0 à 1, ta confiance réelle. En dessous de 0.6, l'item sera flaggé pour revue humaine.
- "reasoning" : 1 phrase courte expliquant les choix.

Règles classification : tu peux inférer le contexte émetteur (DRAC = régional). Mais ne brode pas.

═══════════════════════════════════════════════════════════════════════════
EXTRACTION STRICTE : sections structurées (conditions / calendrier / dossier)
═══════════════════════════════════════════════════════════════════════════

Trois listes à extraire LITTÉRALEMENT du texte source. Règles non négociables :

1. NE JAMAIS INVENTER. Si une information n'est pas explicitement présente dans le texte source, retourner [] (liste vide). Aucune extrapolation, aucune supposition basée sur ce que des appels similaires demandent habituellement.

2. EXTRACTION FIDÈLE. Reformule en français clair mais reste fidèle au sens exact. N'invente pas de chiffre, de date, de seuil, de pièce qui n'est pas dans le texte.

3. UNE LIGNE = UNE INFORMATION. Format télégraphique, phrase courte (max 280 caractères pour conditions/dossier, 200 pour calendrier).

4. SI DOUTE = OMETTRE. Préfère omettre une ligne incertaine plutôt que d'inventer.

────────────────────────────────────────────────────────────────────────────
"conditions" (text[] · max 12 items)
────────────────────────────────────────────────────────────────────────────
Critères d'éligibilité explicites mentionnés dans le texte. Exemples :
  ["Compagnie professionnelle constituée (association, coopérative, etc.)",
   "Au moins une création antérieure portée publiquement",
   "Pas d'exigence de producteur"]
Empty si la source ne précise aucune condition.

────────────────────────────────────────────────────────────────────────────
"calendrier" (text[] · max 10 items)
────────────────────────────────────────────────────────────────────────────
DEUX FORMATS selon la structure de la source :

FORMAT A — Calendrier ponctuel (un seul cycle, étapes uniques type Beaumarchais)
  Une ligne par étape, format "DATE : ÉTAPE".
  Exemple :
    ["30 juin 2026 : clôture des candidatures",
     "Septembre 2026 : auditions",
     "Octobre 2026 : notification des résultats"]

FORMAT C — Cycle récurrent (sessions multiples dans l'année, fréquent sur CNC,
culture.gouv.fr, certaines DRAC). Quand la source liste un tableau ≥ 3
sessions répétitives la même année.

  ⚠ ATTENTION CRITIQUE — Identification de la colonne "clôture" :

  Ces tableaux ont SYSTÉMATIQUEMENT plusieurs colonnes de dates :
    - "Ouverture du dépôt" (≈ "ouverture", "depuis le", "début")
    - "Horaires" (heure d'ouverture, plage horaire — IGNORE)
    - "Clôture du dépôt" (≈ "clôture", "fin", "date limite", "deadline",
       "jusqu'au", "avant le")
    - éventuellement "lien dépôt", "session", "n° de commission" — IGNORE

  RÈGLES DE LECTURE :
  1. Lis l'EN-TÊTE du tableau. Identifie la colonne dont le libellé contient
     "clôture", "fin", "date limite", "deadline", "jusqu'au" ou "avant le".
  2. N'extrais QUE les valeurs de CETTE colonne — pas les autres.
  3. Le NOMBRE DE DATES extraites DOIT être ÉGAL au nombre de sessions :
     5 sessions = 5 dates de clôture, pas 10.
  4. Si tu hésites entre 2 colonnes ou si l'en-tête est ambigu : OMETS le
     calendrier (renvoie []). Mieux vaut vide qu'inventé.
  5. NE JAMAIS alterner entre 2 colonnes. NE JAMAIS lister les ouvertures.

  Structure FIXE en 2 lignes :
    Ligne 1 : "N sessions par an, calendrier annuel récurrent"
    Ligne 2 : "Clôtures YYYY : <date1>, <date2>, <date3>, …"
              (toutes les clôtures de l'année dans l'ordre chronologique,
              passées ET futures, séparées par des virgules)
              ⚠ Le nombre de dates de la ligne 2 DOIT être égal au N de la ligne 1.

  CAS MULTI-TABLEAUX (ex CNC : 1er collège + 2ème collège, ou aide à
  l'écriture + aide au développement) — si la source liste PLUSIEURS
  tableaux distincts pour la MÊME aide avec des calendriers DIFFÉRENTS
  selon la catégorie de candidat, structure étendue à 1 + 2K lignes :
    Ligne 1 : "N sessions par an, M calendriers parallèles (<labels>)"
    Ligne 2 : "Clôtures <label1> YYYY : date1, date2, …"
    Ligne 3 : "Clôtures <label2> YYYY : date1, date2, …"
    (etc, une ligne par tableau)
  Exemple :
    ["5 sessions par an, 2 calendriers parallèles (1er collège, 2ème collège)",
     "Clôtures 1er collège 2026 : 29 janvier, 26 mars, 18 juin, 17 septembre, 19 novembre",
     "Clôtures 2ème collège 2026 : 26 janvier, 23 mars, 15 juin, 14 septembre, 16 novembre"]
  ⚠ NE JAMAIS mélanger les dates de tableaux différents dans une seule ligne.

  Si toutes les sessions de l'année sont passées :
    Ligne 1 : "N sessions par an, calendrier annuel récurrent"
    Ligne 2 : "Sessions YYYY terminées, calendrier YYYY+1 à venir"

  Exemple — tableau source :
    SESSION   ouverture     horaire        clôture          lien
    1 - 2026   17 nov 2025   10h00-18h00   30 jan 2026     dépôt 1
    2 - 2026   06 jan 2026   10h00-18h00   30 mars 2026    dépôt 2
    3 - 2026   18 fev 2026   10h00-18h00   27 avr 2026     dépôt 3
    4 - 2026   16 avr 2026   10h00-18h00   29 juin 2026    dépôt 4
    5 - 2026   18 jun 2026   10h00-18h00   28 sep 2026     dépôt 5
    6 - 2026   04 sep 2026   10h00-18h00   30 nov 2026     dépôt 6

  Extraction attendue :
    ["6 sessions par an, calendrier annuel récurrent",
     "Clôtures 2026 : 30 janvier, 30 mars, 27 avril, 29 juin, 28 septembre, 30 novembre"]

  Note : pas besoin de calculer "prochaine" vs "passée" — l'UI le gérera
  au rendu. Liste juste les clôtures dans l'ordre chronologique.

CHOIX DU FORMAT :
  Si la source présente clairement un tableau de sessions répétitives (≥ 3)
  AVEC une colonne clôture identifiable → FORMAT C
  Sinon (1-2 étapes, calendrier prose, étapes hétérogènes, colonnes ambiguës)
  → FORMAT A
  Doute = FORMAT A (plus sûr)

La deadline principale est déjà dans un autre champ.
Empty si seule la deadline est connue, sans cycle ni étapes secondaires.
NE JAMAIS INVENTER UNE DATE. Si la source dit "sélection à l'automne" sans
date précise, écrire "Automne 2026 : sélection".

────────────────────────────────────────────────────────────────────────────
RÈGLE D'EXPIRATION (CRITIQUE — appliquée avant émission du calendrier)
────────────────────────────────────────────────────────────────────────────
Tu reçois "Date du jour" en tête du message. Compare-la à chaque date du
calendrier que tu t'apprêtes à émettre.

Si TOUTES les dates du calendrier sont strictement antérieures à Date du
jour → renvoie calendrier vide (empty array []).

Raison : la page source contient souvent le calendrier de l'édition
précédente. Émettre ce calendrier expose un cycle déjà fermé comme s'il
était ouvert. Mieux vaut vide qu'expiré : l'UI affichera alors un lien
vers la source officielle et le sticker "Prochaine édition · informations
à venir" plutôt qu'un planning trompeur.

Cas mixtes (dates passées + dates futures dans le même cycle) :
  - Si la deadline principale est passée mais des étapes postérieures
    existent (sélection, festival, restitution) → conserver le calendrier
    complet (il documente le suivi du cycle en cours).
  - Si seules des étapes "ouverture/clôture/dépôt" sont passées et rien
    de futur → renvoie vide.

Cas calendrier récurrent (Format C) : conserver toutes les clôtures de
l'année listées dans la source, même les passées (l'UI sait gérer). Sauf
si TOUTES les sessions de l'année sont passées → utiliser la ligne
"Sessions YYYY terminées, calendrier YYYY+1 à venir".

────────────────────────────────────────────────────────────────────────────
"dossier" (text[] · max 15 items)
────────────────────────────────────────────────────────────────────────────
Pièces à fournir au dossier de candidature, telles que listées dans la source. Exemples :
  ["Présentation de la structure (3 pages maximum)",
   "Synopsis du projet avec note d'intention (5 pages maximum)",
   "Échantillon d'écriture représentatif (10 pages maximum)",
   "Statuts juridiques et RIB"]
Empty si la source ne détaille pas les pièces.

═══════════════════════════════════════════════════════════════════════════
HYGIÈNE LINGUISTIQUE (appliquée à conditions / calendrier / dossier)
═══════════════════════════════════════════════════════════════════════════

1. FRANÇAIS UNIQUEMENT. Aucun mot anglais ni terme technique non-français
   ne doit apparaître dans les items. Bannis en particulier :
   - "deposits", "deadline", "deliverables", "singularity", "submission",
     "applicant", "selection committee"…
   - Termes camelCase issus de variables informatiques : "dateLimite",
     "endDate", "submitForm"…
   Si un mot non français t'échappe, c'est un bug. Traduis ou omets.

2. PAS DE CODE NI DE JSON. Aucun item ne doit contenir :
   - Caractères de structure JSON : accolades, crochets, ou la séquence
     guillemet+deux-points en milieu de chaîne (style "key":)
   - Séquences d'échappement comme \\n, \\t, ou guillemets échappés
   - Noms de clés API ou champs JSON style "conditions": ou "calendrier":
   Si tu vois ces caractères, c'est que tu as confondu output structuré
   et contenu. Le contenu doit être en prose française naturelle.

3. UN ITEM = UNE LIGNE COHÉRENTE. Pas de demi-phrase tronquée, pas de
   fragment qui commence par une accolade ou se termine par une virgule
   suspecte.

═══════════════════════════════════════════════════════════════════════════
RAPPEL : empty array est une réponse VALIDE et SOUVENT correcte. Le pipeline
préfère un champ vide à du contenu inventé. La page de détail rendra alors
un lien vers la source officielle, ce qui est exactement le comportement
souhaité quand l'information n'est pas disponible.
═══════════════════════════════════════════════════════════════════════════`

export const CLASSIFY_FUNCTION_DECLARATION = {
  name: 'classify_opportunity',
  description: "Classifie une opportunité culturelle selon la taxonomie Encre.",
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: OPPORTUNITY_TYPES,
        description: "Type d'opportunité",
      },
      disciplines: {
        type: 'array',
        items: { type: 'string', enum: DISCIPLINE_SLUGS },
        minItems: 1,
        maxItems: 5,
      },
      audience: {
        type: 'array',
        items: { type: 'string', enum: AUDIENCE_SLUGS },
        minItems: 1,
        maxItems: 4,
      },
      geo_scope: {
        type: 'string',
        enum: GEO_SCOPES,
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      reasoning: {
        type: 'string',
        maxLength: 500,
      },
      conditions: {
        type: 'array',
        description:
          "Critères d'éligibilité extraits LITTÉRALEMENT du texte source. Empty array si aucun critère n'est explicitement mentionné. NE PAS INVENTER.",
        items: { type: 'string', maxLength: 280 },
        maxItems: 12,
      },
      calendrier: {
        type: 'array',
        description:
          'Étapes du calendrier de sélection au format "Date : étape". Empty array si seule la deadline est connue. NE PAS INVENTER de date absente du texte source.',
        items: { type: 'string', maxLength: 200 },
        maxItems: 10,
      },
      dossier: {
        type: 'array',
        description:
          'Pièces du dossier de candidature, telles que listées dans la source. Empty array si non détaillé. NE PAS INVENTER de pièce.',
        items: { type: 'string', maxLength: 280 },
        maxItems: 15,
      },
    },
    required: [
      'type',
      'disciplines',
      'audience',
      'geo_scope',
      'confidence',
      'conditions',
      'calendrier',
      'dossier',
    ],
  },
}

export interface ClassifyOptions {
  apiKey?: string
  /** Override du modèle. Défaut : `gemma-4-31b-it`. Pour la 2ᵉ passe : `gemini-3-flash-preview`. */
  model?: string
  /** Hook pour mock en tests unitaires */
  fetchImpl?: typeof fetch
}

/**
 * Pré-filtre déterministe pour le `type` — évite un appel LLM quand
 * le titre contient clairement le type (réduction ~30% du coût).
 */
export function guessTypeFromText(text: string): (typeof OPPORTUNITY_TYPES)[number] | null {
  const t = text.toLowerCase()
  if (/\brésidence|\bresidence\b/.test(t)) return 'residence'
  if (/\bsubvention|\baide à la création|\bsoutien\b/.test(t)) return 'subvention'
  if (/\bbourse\b/.test(t)) return 'bourse'
  if (/\bprix\b/.test(t)) return 'prix'
  if (/\bconcours\b/.test(t)) return 'concours'
  if (/\bcommande\b|1% artistique/.test(t)) return 'commande'
  return null
}

/**
 * Tronque les chaînes de conditions/calendrier/dossier au max autorisé par
 * le schéma. Gemma respecte les contraintes ; Gemini 2.5 Flash a tendance à
 * être plus verbeux. Plutôt que rejeter une extraction valide pour quelques
 * caractères en trop, on clamp silencieusement.
 */
export function clampClassifyArgs(args: unknown): unknown {
  if (!args || typeof args !== 'object') return args
  const out = { ...(args as Record<string, unknown>) }
  const clampList = (raw: unknown, max: number, kind: SectionKind): string[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const items = raw
      .map((s) => (typeof s === 'string' ? s.slice(0, max).trim() : s))
      .filter((s) => typeof s === 'string' && s.length > 0) as string[]
    // Applique la grammaire éditoriale Encre (capitalize, ponct, espaces
    // insécables, mois minuscule…) pour que toutes les opps se sentent
    // comme la même publication.
    return normalizeSectionList(items, kind)
  }
  const conds = clampList(out.conditions, 280, 'conditions')
  if (conds) out.conditions = conds
  const cal = clampList(out.calendrier, 200, 'calendrier')
  if (cal) out.calendrier = cal
  const dos = clampList(out.dossier, 280, 'dossier')
  if (dos) out.dossier = dos
  if (typeof out.reasoning === 'string') {
    out.reasoning = out.reasoning.slice(0, 500)
  }
  return out
}

/**
 * Classifie une opportunité via l'API Gemini (Google AI Studio) en forçant
 * un appel d'outil sur `classify_opportunity`. Modèle par défaut : Gemma 4 31B.
 *
 * Retourne ClassificationOutput ou throw si échec réseau / parsing.
 * Le caller (`process-raw.ts`) doit gérer les erreurs et la 2ᵉ passe.
 */
export async function classifyOpportunity(
  payload: RawItemPayload,
  emitterName: string,
  options: ClassifyOptions = {},
): Promise<ClassificationOutput> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? DEFAULT_CLASSIFY_MODEL

  // Truncation à 12000 chars (3000 → 6000 → 12000 progressivement).
  // Les pages CNC/Beaumarchais font 20-26KB post-strip avec sections
  // critiques (calendrier session multiples, liste dossier détaillée)
  // souvent en 2e moitié. Gemma TPM = 1M, large marge.
  const dateFr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  // Strip des chars non-français AVANT envoi au LLM. Réduit fortement
  // les hallucinations multilingues (audit DB 2026-05-07 : 13 opps avec
  // tokens arabes/devanagari/grec/suédois/vietnamien injectés au milieu
  // de mots français). Les pages institutionnelles FR contiennent
  // parfois des chars étrangers résiduels (titres VO, alt-text, exemples
  // sur les pages traducteurs) qu'on retire ici plutôt que de laisser
  // Gemma les voir dans sa fenêtre d'attention.
  const cleanedTitle = stripSuspectChars(payload.title).text
  const descStrip = payload.description ? stripSuspectChars(payload.description) : null
  if (descStrip && descStrip.removedCount > 0) {
    console.warn(
      `  [classify] strip input : ${descStrip.removedCount} chars retirés ` +
        `(${JSON.stringify(descStrip.removedByKind)})`,
    )
  }
  const cleanedDesc = descStrip?.text ?? null

  const userContent = [
    `Date du jour : ${dateFr}`,
    `Émetteur : ${emitterName}`,
    `Titre : ${cleanedTitle}`,
    cleanedDesc ? `Description : ${cleanedDesc.slice(0, 25000)}` : null,
    payload.region_hint ? `Indice géographique : ${payload.region_hint}` : null,
    payload.discipline_hints?.length
      ? `Indices disciplines : ${payload.discipline_hints.join(', ')}`
      : null,
    payload.amount_text ? `Montant : ${payload.amount_text}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Gemma n'accepte pas system_instruction → on inline le prompt système dans la 1re partie user.
  // Gemini accepte system_instruction mais l'inline marche aussi → un seul code path.
  //
  // generationConfig dépend du modèle :
  // - Gemma : 512 tokens suffisent (pas de thinking).
  // - Gemini 2.5 Flash : thinking activé par défaut bouffe le budget AVANT
  //   d'émettre le functionCall → on désactive (thinkingBudget = 0) et on
  //   monte maxOutputTokens à 2048 pour laisser de la place aux 12+10+15
  //   items de conditions/calendrier/dossier.
  const isFlash25 = model.startsWith('gemini-2.5-flash')
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: isFlash25 ? 2048 : 512,
    temperature: 0,
  }
  if (isFlash25) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 }
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${CLASSIFY_SYSTEM_PROMPT}\n\n---\n\n${userContent}` }],
      },
    ],
    tools: [{ functionDeclarations: [CLASSIFY_FUNCTION_DECLARATION] }],
    toolConfig: {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['classify_opportunity'],
      },
    },
    generationConfig,
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini API error ${response.status} (${model}): ${text.slice(0, 300)}`)
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown }; text?: string }> }
      finishReason?: string
      finishMessage?: string
    }>
    usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number }
  }

  const candidate = json.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const fnCall = parts.find((p) => p.functionCall?.name === 'classify_opportunity')
  if (!fnCall?.functionCall?.args) {
    const finish = candidate?.finishReason ?? 'unknown'
    const thoughts = json.usageMetadata?.thoughtsTokenCount
    const cand = json.usageMetadata?.candidatesTokenCount
    const textPart = parts.find((p) => p.text)?.text?.slice(0, 200)
    throw new Error(
      `No functionCall "classify_opportunity" in Gemini response (${model}) — finish=${finish} thoughts=${thoughts ?? 'n/a'} cand=${cand ?? 'n/a'}${textPart ? ` text="${textPart}"` : ''}`,
    )
  }

  // Pré-clamp : Gemini 2.5 Flash est plus verbeux que Gemma et dépasse parfois
  // les maxLength du schéma sur conditions/dossier. On tronque silencieusement
  // pour éviter de jeter une extraction par ailleurs valide.
  const clampedArgs = clampClassifyArgs(fnCall.functionCall.args)
  const parsed = ClassificationOutputSchema.safeParse(clampedArgs)
  if (!parsed.success) {
    throw new Error(`Classification schema invalid (${model}): ${JSON.stringify(parsed.error.flatten())}`)
  }

  // Post-process 1 : si le LLM a renvoyé un calendrier vide, on tente
  // une synthèse Format A depuis le pattern « Prochaine date limite de
  // dépôt : <liste> » très courant côté CNC. Bug Gemma observé sur FAJV
  // par exemple : Gemma confond la liste avec une deadline simple et
  // n'extrait rien. Le synthesizer est déterministe et conservateur
  // (≥ 2 dates requises pour fire).
  if (parsed.data.calendrier.length === 0) {
    const synthesized = synthesizeFormatAFromProchaineList(payload.description)
    if (synthesized) {
      parsed.data.calendrier = normalizeSectionList(synthesized, 'calendrier')
    }
  }

  // Post-process 2 : détection des cas de calendrier vide/partiel.
  // - `continuous` → on écrase calendrier par l'item canonique.
  // - autres patterns (`partial_format_c`, `awaiting_next`, `unknown_empty`)
  //   sont laissés inchangés ici ; c'est le job du script de backfill
  //   `scripts/auto-flag-calendar-patterns.ts` (qui peut set
  //   `next_edition_status='awaiting_details'`, hors ClassificationOutput).
  const calendarPattern = detectCalendarPattern(
    payload.description,
    parsed.data.calendrier,
  )
  if (calendarPattern.pattern === 'continuous') {
    parsed.data.calendrier = applyContinuousFlowOverride(
      parsed.data.calendrier,
      calendarPattern.pattern,
    )
  }

  return parsed.data
}

/**
 * Fallback classification sans appel API — utilisée en dev quand pas de clé,
 * ou en fallback si API down / rate limitée. Précision médiocre mais permet
 * à la pipeline de fonctionner end-to-end.
 */
export function classifyLocalFallback(
  payload: RawItemPayload,
  emitterName: string,
): ClassificationOutput {
  const text = `${payload.title} ${payload.description ?? ''} ${emitterName}`.toLowerCase()

  const type = guessTypeFromText(text) ?? 'subvention'

  const disciplines: string[] = []
  if (/théâtre|theatre|dramaturg/.test(text)) disciplines.push('theatre')
  if (/danse|choréograph/.test(text)) disciplines.push('danse')
  if (/musique|musiciens?|composit/.test(text)) disciplines.push('musique')
  if (/arts visuels|plasticien|plastique/.test(text)) disciplines.push('arts_visuels')
  if (/photo/.test(text)) disciplines.push('photographie')
  if (/cirque/.test(text)) disciplines.push('cirque')
  if (/cinéma|cinema|film/.test(text)) disciplines.push('cinema')
  if (/littérature|litterature|écrivain|ecrivain|auteur|poésie/.test(text)) disciplines.push('litterature')
  if (/numérique|numerique|vr|ia|algorithmique/.test(text)) disciplines.push('numerique')
  if (disciplines.length === 0) disciplines.push('transdisciplinaire')

  const audience: string[] = []
  if (/compagnie/.test(text)) audience.push('compagnie')
  if (/association/.test(text)) audience.push('association')
  if (/collectif/.test(text)) audience.push('collectif')
  if (/émergent|emergent|jeune création/.test(text)) audience.push('emergent')
  if (audience.length === 0) audience.push('individuel')

  const geo_scope: (typeof GEO_SCOPES)[number] =
    /europe|creative europe|erasmus/.test(text) ? 'europe' :
    /drac|région|region|métropole|departement|département/.test(text) ? 'regional' :
    /international|kujoyama|albertine|médicis|medicis/.test(text) ? 'international' :
    'national'

  return {
    type,
    disciplines: disciplines.slice(0, 5) as ClassificationOutput['disciplines'],
    audience: audience.slice(0, 4) as ClassificationOutput['audience'],
    geo_scope,
    confidence: 0.45, // fallback force toujours human_review
    reasoning: 'Classification de secours (pas d\'appel LLM)',
    // Sections structurées : empty en mode fallback (regex local
    // ne peut pas extraire de manière fiable, on préfère vide qu'inventé).
    conditions: [],
    calendrier: [],
    dossier: [],
  }
}
