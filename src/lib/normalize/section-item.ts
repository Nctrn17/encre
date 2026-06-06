/**
 * Grammaire éditoriale commune pour les items de conditions / calendrier
 * / dossier.
 *
 * Objectif : que toutes les opps Encre se sentent comme la même
 * publication, pas comme un dump de scraping. Règles minimales auto-
 * appliquées :
 *   - Capitalisation 1ère lettre (idempotent si déjà majuscule)
 *   - Pas de point final sur items courts (? et ! conservés)
 *   - Apostrophe typographique ' au lieu de '
 *   - Espaces insécables avant : ; ? !
 *   - Multi-espaces collapsés
 *   - Acronymes intouchés (CNC, RIB, URSSAF, Kbis, CV, BIC, IBAN…)
 *
 * Spécifique calendrier :
 *   - Mois en minuscule (30 octobre 2026, pas 30 Octobre 2026)
 *   - "1er" pour le 1er du mois
 *
 * Spécifique dossier :
 *   - Strip verbes parasites en début (Joindre/Fournir/Déposer/Transmettre)
 *
 * Appelé à 2 endroits :
 *   - À l'extraction LLM (clampClassifyArgs) : source de vérité en DB
 *   - Au rendu (BulletList/Timeline) : safeguard si une vieille opp a
 *     une casse hétérogène
 */

import { findSuspectChars, hasSuspectChars } from './quality'

export type SectionKind = 'conditions' | 'calendrier' | 'dossier'

const APOSTROPHE_RE = /'/g
const SMART_APOSTROPHE = '’'

const NBSP = ' '

const FRENCH_PRECEDED_PUNCT_RE = /\s*([:;?!])/g

const MULTI_SPACE_RE = / {2,}/g

const TRAILING_PERIOD_RE = /\.\s*$/

const STRIP_VERB_PREFIX_RE =
  /^(?:joindre|fournir|d[ée]poser|transmettre|envoyer|pr[ée]senter|remettre)\s+(?:un[e]?\s+|le\s+|la\s+|les\s+|votre\s+|vos\s+|son\s+|sa\s+|ses\s+|du\s+|de\s+la\s+)?/i

const MONTH_RE = /\b(Janvier|Février|Fevrier|Mars|Avril|Mai|Juin|Juillet|Août|Aout|Septembre|Octobre|Novembre|Décembre|Decembre)\b/g

const FIRST_OF_MONTH_RE = /\b1\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/gi

// Bug Gemma observé : certaines opps ont `2026-03-09 : clôture des candidatures`
// au lieu de `9 mars 2026 : clôture des candidatures`. Le LLM a parfois
// laissé le format ISO de la source en cas de doute. On normalise en FR.
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g

const FRENCH_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

function isoToFrench(year: string, month: string, day: string): string {
  const m = Number.parseInt(month, 10)
  const d = Number.parseInt(day, 10)
  if (!Number.isFinite(m) || m < 1 || m > 12) return `${year}-${month}-${day}`
  if (!Number.isFinite(d) || d < 1 || d > 31) return `${year}-${month}-${day}`
  const dayStr = d === 1 ? '1er' : String(d)
  return `${dayStr} ${FRENCH_MONTHS[m - 1]} ${year}`
}

/**
 * Normalise un item d'une section structurée. Idempotent.
 */
export function normalizeSectionItem(raw: string, kind: SectionKind): string {
  let s = raw.trim()
  if (!s) return s

  // 1. Apostrophe typographique
  s = s.replace(APOSTROPHE_RE, SMART_APOSTROPHE)

  // 2. Espaces insécables avant : ; ? !
  s = s.replace(FRENCH_PRECEDED_PUNCT_RE, NBSP + '$1')

  // 3. Collapse multi-espaces (en respectant les nbsp qu'on vient d'ajouter)
  s = s.replace(MULTI_SPACE_RE, ' ')

  // 4. Strip point final (mais garde ? !)
  s = s.replace(TRAILING_PERIOD_RE, '')

  // 5. Spécifique dossier : strip verbe parasite en début
  if (kind === 'dossier') {
    s = s.replace(STRIP_VERB_PREFIX_RE, '')
    s = s.trim()
  }

  // 6. Spécifique calendrier : mois en minuscule, "1er", ISO → FR
  if (kind === 'calendrier') {
    // Convertir d'abord ISO YYYY-MM-DD → forme française pour que les
    // étapes suivantes (mois minuscule, 1er) s'appliquent au résultat.
    s = s.replace(ISO_DATE_RE, (_match, y, m, d) => isoToFrench(y, m, d))
    s = s.replace(MONTH_RE, (m) => m.toLowerCase())
    s = s.replace(FIRST_OF_MONTH_RE, '1er $1')
  }

  // 7. Capitalize 1ère lettre (idempotent)
  if (s.length > 0 && /[a-zà-ÿ]/.test(s[0]!)) {
    s = s[0]!.toUpperCase() + s.slice(1)
  }

  return s.trim()
}

/**
 * Helper pour normaliser un array entier en filtrant les empty.
 *
 * Drop également les items contenant des caractères non-français
 * (hallucinations LLM observées). Doctrine projet : "Aucune opp publiée
 * avec donnée partielle ou non communiquée" — un item pollué par des
 * tokens arabes/devanagari/grecs/etc est de la donnée corrompue, pas
 * une donnée partielle légitime. On préfère perdre l'item que d'afficher
 * `Examenينdes dossiers` à l'utilisateur.
 *
 * Les items dropés sont loggés en warn pour observabilité — le caller
 * peut décider de re-classifier l'opp avec un autre modèle ou de la
 * flagger pour curation manuelle.
 */
export function normalizeSectionList(items: string[] | null | undefined, kind: SectionKind): string[] {
  if (!items) return []
  const out: string[] = []
  for (const raw of items) {
    const norm = normalizeSectionItem(raw, kind)
    if (norm.length === 0) continue
    if (hasSuspectChars(norm)) {
      const findings = findSuspectChars(norm)
      const kinds = [...new Set(findings.map((f) => f.kind))].join(', ')
      console.warn(
        `  [normalize] drop ${kind}#item — chars suspects (${kinds}) : "${norm.slice(0, 80)}"`,
      )
      continue
    }
    out.push(norm)
  }
  return sortSectionByCanonicalFamily(out, kind)
}

/**
 * Tri canonique par famille — homogénéise l'ordre interne des items
 * pour que toutes les fiches Encre se sentent comme la même publication.
 *
 * Conditions (6 familles) :
 *   1. Statut du candidat (auteur, compagnie, producteur…)
 *   2. Parcours / expérience requise
 *   3. Critères géographiques (résidence, nationalité, ancrage régional)
 *   4. Caractéristiques du projet (type, durée, langue, format)
 *   5. Contraintes de cycle (quota, déjà bénéficiaire, exclusivité)
 *   6. Exclusions ("Ne pas…", "Pas de…")
 *
 * Dossier (5 familles) :
 *   1. Formulaire et inscription
 *   2. Pièces artistiques (synopsis, scénario, note d'intention, bible…)
 *   3. Pièces économiques (budget, devis, plan de financement)
 *   4. Pièces juridiques (contrat option, cession, attestations, K-bis)
 *   5. Pièces personnelles (CV, pièce d'identité, RIB, domiciliation)
 *
 * Calendrier : ordre chronologique préservé tel quel (déjà cohérent par
 * construction Format A/B/C).
 *
 * Item non classifié → famille 99 (en fin de section).
 * Tri stable : ordre d'insertion préservé à l'intérieur d'une même famille.
 */
type FamilyRule = { family: number; re: RegExp }

// Ordre des regex = ordre de test (premier match wins). On teste les
// familles "spécifiques" (qui contiennent peu de mots, peu de faux positifs)
// AVANT les familles "larges" comme "projet" qui catch beaucoup de mots.
// Sans ça, "Non boursier : n'a jamais bénéficié d'une bourse pour un
// court-métrage" matcherait famille 4 (projet) au lieu de famille 5 (cycle)
// à cause du mot "court-métrage" présent dans l'exemple cycle.
// Note : `\b` (JS regex) ne fonctionne pas comme attendu avec les caractères
// accentués (é, à, ç…) car `é` n'est pas considéré comme un "word character".
// On utilise donc `(?:^|[\\s,;:.'’"«»()-])` comme word-boundary explicite.
const W = `(?:^|[\\s,;:.'’"«»()\\-])` // word-boundary FR-safe (start)
const WE = `(?=[\\s,;:.'’"«»()\\-]|$)` // word-boundary FR-safe (end, lookahead)

const CONDITIONS_FAMILIES: FamilyRule[] = [
  // 6 — Exclusions : tester en premier car "Ne pas être auteur…" doit gagner sur "auteur"
  { family: 6, re: /^(ne pas|pas d['’]|pas de |sans |aucune? |interdit|exclu)/i },
  // 5 — Cycle / quota (spécifique : "non boursier", "déjà bénéficié", etc.)
  { family: 5, re: new RegExp(`${W}(non boursier|n['’]a (?:pas |jamais )?bénéficié|déjà (?:lauréat|sélectionné|bénéficié)|une seule fois|au maximum|max(?:imum)?\\s+\\d|par an|par cycle|interdit de candidater|cumulable|non cumulable|antérieurement|précédemment|cumul|deux candidatures|nouvelle candidature)`, 'i') },
  // 3 — Géographique
  { family: 3, re: new RegExp(`${W}(résider|résidant|résidence en|domicilié|nationalité|ressortiss|région|territoire|adresse fiscale|établi[e]? en|installé[e]? (?:à|en)|francophone|européen|européenne|outre-mer|drom-com|drom|antilles|guadeloupe|martinique|guyane|réunion|mayotte|saint-pierre)`, 'i') },
  // 2 — Parcours / expérience
  { family: 2, re: new RegExp(`${W}(parcours|expérience|déjà réalisé|déjà produit|antérieur|antérieurs|précédent|précédents|filmographie|carrière|publié|au moins\\s+\\w+\\s+(film|projet|œuvre|publication)|prix|récompens|sélectionné en festival|première diffusion|festivals?|expériences professionnelles)`, 'i') },
  // 1 — Statut du candidat : restrictif au début de phrase pour éviter
  // de catcher "Dépôt fait par l'auteur" comme statut (le sujet est "Dépôt").
  { family: 1, re: /^(?:[\s·-]*)?(auteur|autrice|écrivain|écrivaine|réalisateur|réalisatrice|cinéaste|compagnie|association|collectif|étudiant|étudiante|émergent|émergente|producteur|productrice|société de production|porteur de projet|scénariste|jeune création|artiste|professionnel)/i },
  // 4 — Caractéristiques projet (large : fourre-tout pour ce qui décrit l'œuvre)
  { family: 4, re: new RegExp(`${W}(projet|fiction|documentaire|animation|court[- ]métrage|long[- ]métrage|série|web[- ]?série|format|durée|min(?:utes)?|originale?|adaptation|langue (?:française|originale)|expression française|écriture|développement|post[- ]production|production|tournage|sujet|thématique|première œuvre|inédit|en français)`, 'i') },
]

const DOSSIER_FAMILIES: FamilyRule[] = [
  // 1 — Formulaire
  { family: 1, re: new RegExp(`${W}(formulaire|inscription en ligne|candidature en ligne|fiche d['’]inscription|dossier de candidature|dépôt en ligne|portail)`, 'i') },
  // 2 — Artistique
  { family: 2, re: new RegExp(`${W}(synopsis|traitement|scénario|note d['’]intention|bible|extrait|extraits|pitch|résumé|note d['’]écriture|note de réécriture|continuité dialoguée|dossier artistique|dossier de présentation|projet artistique|graphique|storyboard|moodboard|teaser|montage|images|visuel|maquette|démo|portfolio)`, 'i') },
  // 3 — Économique
  { family: 3, re: new RegExp(`${W}(budget|devis|plan de financement|prévisionnel|chiffré|coût|montant demandé|estimation financière|comptes annuels|bilan|liasse fiscale)`, 'i') },
  // 4 — Juridique
  { family: 4, re: new RegExp(`${W}(contrat|cession (?:de )?droits|option|k[- ]?bis|statuts (?:juridiques|de l)|attestation|engagement|déclaration|partenariat|coproduction|courrier|lettre (?:d['’]engagement|d['’]intérêt|de soutien|de motivation)|libération de droits|licence|convention)`, 'i') },
  // 5 — Personnelles / identité
  { family: 5, re: new RegExp(`${W}(cv|curriculum|pièce d['’]identité|carte d['’]identité|passeport|rib|iban|bic|justificatif de domicil|domiciliation|adresse|coordonnées|biographie|bio[- ]filmographie)`, 'i') },
]

function classifyFamily(item: string, kind: SectionKind): number {
  if (kind === 'calendrier') return 0
  const rules = kind === 'conditions' ? CONDITIONS_FAMILIES : DOSSIER_FAMILIES
  for (const { family, re } of rules) {
    if (re.test(item)) return family
  }
  return 99
}

export function sortSectionByCanonicalFamily(items: string[], kind: SectionKind): string[] {
  // Calendrier : ordre chronologique préservé (Format A/B/C déjà ordonné)
  if (kind === 'calendrier') return items
  if (items.length <= 1) return items

  // Decorate-sort-undecorate avec index original → tri stable
  return items
    .map((item, idx) => ({ item, family: classifyFamily(item, kind), idx }))
    .sort((a, b) => a.family - b.family || a.idx - b.idx)
    .map(({ item }) => item)
}
