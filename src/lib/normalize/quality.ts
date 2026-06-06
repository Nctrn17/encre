/**
 * Détection de qualité texte FR — quality.ts.
 *
 * Détecte les caractères / tokens manifestement non-français qui peuvent
 * apparaître dans la sortie d'un LLM hallucinant (cas observés sur Gemma
 * 4 31B en mai 2026 : « localizar », « särskilt », « cứrtal », ينand
 * combinaisons arabes au milieu de mots français).
 *
 * Ne corrige PAS — flagge uniquement. La correction est manuelle via
 * `/curate-paste` ou re-classify, parce que stripper automatiquement
 * un caractère non-français risque de couper du contenu légitime
 * (titre étranger référencé, citation, etc.).
 *
 * Pure : pas d'IO, déterministe.
 */

// ──────────────────────────────────────────────────────────────────────
// Plages Unicode SUSPECTES dans un texte censé être en français.
// ──────────────────────────────────────────────────────────────────────
// Le français utilise UNIQUEMENT :
//   - ASCII (U+0000–U+007F)
//   - Une partie de Latin-1 Supplement (U+0080–U+00FF) : à â æ ç è é ê ë
//     î ï ô ù û ü ÿ œ + majuscules + ponctuation typographique « » … —
//
// Tout caractère hors ces plages dans une opp culture FR mérite review.
// On considère AUSSI suspects quelques caractères Latin-1 (ä ö å ñ ã õ ø)
// qui ne sont pas du français mais d'autres langues européennes.

const SUSPECT_LATIN_1_CHARS = new Set([
  'ä', 'Ä', // allemand, suédois
  'ö', 'Ö', // allemand, suédois
  'ü', // allemand (mais ü est aussi français dans « capharnaüm »…)
  // → on le retire, faux positifs
  'å', 'Å', // suédois, danois
  'ñ', 'Ñ', // espagnol
  'ã', 'Ã', // portugais
  'õ', 'Õ', // portugais
  'ø', 'Ø', // norvégien, danois
])
// Retire ü de la set (faux positifs en français)
SUSPECT_LATIN_1_CHARS.delete('ü')

/**
 * Test si un char est dans une plage Unicode non-française.
 * Retourne le label de la plage (pour log/debug) ou null.
 */
export function classifyChar(ch: string): string | null {
  const cp = ch.codePointAt(0)
  if (cp == null) return null

  // ASCII : OK
  if (cp <= 0x007f) return null

  // Latin-1 Supplement : OK pour la plupart, sauf chars spécifiques
  if (cp >= 0x0080 && cp <= 0x00ff) {
    if (SUSPECT_LATIN_1_CHARS.has(ch)) return 'latin-1-non-fr'
    return null
  }

  // Latin Extended A (U+0100–U+017F) : non-français (polonais, tchèque,
  // turc…). Whitelist : ŒœŸ qui SONT français (et techniquement
  // dans cette plage Unicode).
  if (cp >= 0x0100 && cp <= 0x017f) {
    if (ch === 'œ' || ch === 'Œ' || ch === 'Ÿ') return null
    return 'latin-extended-a'
  }

  // Latin Extended B (U+0180–U+024F)
  if (cp >= 0x0180 && cp <= 0x024f) return 'latin-extended-b'

  // Latin Extended Additional (U+1E00–U+1EFF) — vietnamien, gallois,
  // certaines langues africaines.
  if (cp >= 0x1e00 && cp <= 0x1eff) return 'latin-extended-additional'

  // Greek (U+0370–U+03FF)
  if (cp >= 0x0370 && cp <= 0x03ff) return 'greek'

  // Cyrillic (U+0400–U+04FF)
  if (cp >= 0x0400 && cp <= 0x04ff) return 'cyrillic'

  // Hebrew (U+0590–U+05FF)
  if (cp >= 0x0590 && cp <= 0x05ff) return 'hebrew'

  // Arabic (U+0600–U+06FF)
  if (cp >= 0x0600 && cp <= 0x06ff) return 'arabic'

  // Devanagari (U+0900–U+097F)
  if (cp >= 0x0900 && cp <= 0x097f) return 'devanagari'

  // Thai (U+0E00–U+0E7F)
  if (cp >= 0x0e00 && cp <= 0x0e7f) return 'thai'

  // CJK Unified (U+4E00–U+9FFF) — chinois, japonais kanji
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'cjk'

  // Hiragana (U+3040–U+309F), Katakana (U+30A0–U+30FF)
  if (cp >= 0x3040 && cp <= 0x30ff) return 'kana'

  // Hangul (U+AC00–U+D7AF)
  if (cp >= 0xac00 && cp <= 0xd7af) return 'hangul'

  // Symbols, punctuation, etc. : on accepte (em dash, ellipsis, NBSP…
  // sont tous dans des plages spécifiques, et certains sont attendus).
  return null
}

export interface SuspectFinding {
  /** Catégorie Unicode (latin-extended-a, arabic, cyrillic, …). */
  kind: string
  /** Index dans la string où apparaît le char suspect. */
  index: number
  /** Le caractère suspect lui-même. */
  char: string
  /** Bout de contexte (15 chars avant + 15 après) pour debug. */
  context: string
}

/**
 * Scanne un texte et renvoie tous les caractères non-français trouvés.
 * Liste dédupliquée par index (pas de double-comptage).
 */
export function findSuspectChars(text: string): SuspectFinding[] {
  const findings: SuspectFinding[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const kind = classifyChar(ch)
    if (kind) {
      const start = Math.max(0, i - 15)
      const end = Math.min(text.length, i + 16)
      findings.push({
        kind,
        index: i,
        char: ch,
        context: text.slice(start, end),
      })
    }
  }
  return findings
}

/**
 * Helper : true si un item contient au moins un char suspect.
 */
export function hasSuspectChars(text: string): boolean {
  return findSuspectChars(text).length > 0
}

// ──────────────────────────────────────────────────────────────────────
// Strip — supprime les chars non-français d'un texte.
//
// USAGE PRÉVU : sanitizer le texte source AVANT de l'envoyer au LLM.
// Les pages institutionnelles FR contiennent parfois du texte non-FR
// résiduel (titres d'œuvres en VO, alt-text d'images, exemples de
// langues étrangères sur les pages de bourses traducteurs…). Ces
// chars dans la fenêtre d'attention de Gemma augmentent la probabilité
// d'hallucinations multilingues à l'output.
//
// ⚠ NE PAS UTILISER pour nettoyer la sortie du LLM : risque de
// supprimer du contenu légitime au milieu d'un mot. Pour la sortie,
// on flagge uniquement (cf. findSuspectChars + audit-suspect-tokens.ts).
// ──────────────────────────────────────────────────────────────────────

export interface StripResult {
  /** Texte nettoyé. */
  text: string
  /** Nombre de chars supprimés. 0 si rien à faire. */
  removedCount: number
  /** Tally par catégorie pour log/observabilité. */
  removedByKind: Record<string, number>
}

/**
 * Supprime tous les chars suspects d'un texte. Conservatif :
 *   - Garde tout l'ASCII et la Latin-1 française
 *   - Retire les chars non-FR (cf. classifyChar) et leurs variantes
 *   - Conserve la structure (newlines, espaces, ponctuation)
 *
 * Renvoie un StripResult avec compteur. Utile pour log côté caller.
 */
export function stripSuspectChars(text: string | null | undefined): StripResult {
  if (!text) return { text: '', removedCount: 0, removedByKind: {} }

  const removedByKind: Record<string, number> = {}
  let removedCount = 0
  const out: string[] = []

  for (const ch of text) {
    const kind = classifyChar(ch)
    if (kind) {
      removedByKind[kind] = (removedByKind[kind] ?? 0) + 1
      removedCount++
      // Skip — on ne remplace pas par un espace pour éviter de créer
      // des trous de mots qui ne sont plus des mots français.
      // Gemma préfère "Examendes" mal collé à "Examen[espace]des"
      // qui est ambigu sur la frontière de mot.
      continue
    }
    out.push(ch)
  }

  return {
    text: out.join(''),
    removedCount,
    removedByKind,
  }
}
