/**
 * Fetch d'une page + extraction du texte visible (sans script/style/HTML),
 * pour donner au LLM bien plus de matière que la description courte produite
 * par les scrapers de découverte (qui ne ramènent souvent que le pitch).
 *
 * Usage prévu : enrichissement des sections structurées (conditions /
 * calendrier / dossier) sur les opps déjà en base mais avec sections vides.
 *
 * Stratégie :
 *   - fetch via fetchWithRetry (User-Agent honnête, throttle hôte, robots.txt)
 *   - retire <script>, <style>, <noscript>, balises HTML
 *   - décodage des entités les plus fréquentes (&nbsp; &amp; etc.)
 *   - normalise whitespace
 *   - tronque à `maxChars` pour rester dans une fenêtre LLM raisonnable.
 *     Tronque sur une frontière de mot pour éviter de couper en plein milieu.
 *
 * Retourne `null` si la page ne répond pas en 2xx ou si le texte extrait
 * est trop court pour être utile (< 200 chars), pour ne pas appeler le LLM
 * inutilement.
 */

import * as cheerio from 'cheerio'
import { fetchWithRetry } from './fetch-helpers'

export interface ExtractPageOptions {
  /** Tronque le texte à ce nombre de caractères. Défaut 8000. */
  maxChars?: number
  /** Seuil min pour considérer le texte utile. Défaut 200. */
  minUsefulChars?: number
}

export interface ExtractedPage {
  /** Texte plein nettoyé. */
  text: string
  /** Nombre de chars du HTML brut (avant strip). */
  rawSize: number
  /** Nombre de chars du texte après strip + truncate. */
  textSize: number
  /** True si le texte a été tronqué. */
  truncated: boolean
  /**
   * URLs des PDFs candidats détectés dans la page (règlement, dossier,
   * cahier des charges…). Première position = candidat le plus pertinent.
   * Le caller décide d'en fetcher le contenu via extractPdfText().
   */
  pdfCandidates: string[]
  /**
   * URL d'une éventuelle page secondaire « Appels à candidatures /
   * Modalités / Comment candidater » sur le même hostname, si la page
   * principale est juste une description et que la procédure vit sur
   * une URL séparée (cas Moulin d'Andé). null si aucun lien pertinent.
   */
  followupUrl: string | null
}

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&apos;': "'",
  '&laquo;': '«',
  '&raquo;': '»',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&ecirc;': 'ê',
  '&agrave;': 'à',
  '&ocirc;': 'ô',
  '&icirc;': 'î',
  '&ucirc;': 'û',
  '&ccedil;': 'ç',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&euro;': '€',
}

/**
 * Strip HTML to plain text. Conserve l'ordre du contenu. Pas de parsing AST :
 * on reste sur des regex robustes pour gérer les pages mal formées des sites
 * institutionnels (souvent du WordPress / Drupal historique).
 */
/**
 * Convertit toutes les `<table>` du HTML en markdown table proprement
 * formaté, préservant l'info de colonne. Le strip HTML qui suit n'enlève
 * pas les `|`, donc la table markdown survit dans le texte plain final.
 *
 * Cas typique : CNC publie ses calendriers de sessions sous forme de
 * `<table>` avec colonnes "Session", "Date d'ouverture", "Date limite",
 * "Lien dépôt". Sans cette conversion, le strip ne préserve que la suite
 * brute des `<td>` text, le LLM ne peut pas distinguer les colonnes et
 * confond systématiquement ouverture vs clôture.
 *
 * Heuristique :
 *   - 1ère ligne (`<thead><tr>` si présent, sinon 1er `<tr>`) = en-têtes
 *   - Autres lignes = data
 *   - Cellules vides ou colspan/rowspan ignorés (rendu en cellule vide)
 *   - Caractères `|` dans le texte échappés en `\|` pour pas casser le markdown
 *   - Si la table est vide ou mal formée (0 lignes data), on la laisse
 *     dans le HTML pour que le strip général s'en occupe normalement
 */
export function htmlTablesToMarkdown(html: string): string {
  const $ = cheerio.load(html)
  $('table').each((_, table) => {
    const $t = $(table)
    // En-têtes : <thead><tr> si présent, sinon 1ère <tr>
    let $headerRow = $t.find('thead tr').first()
    if (!$headerRow.length) $headerRow = $t.find('tr').first()
    const headers: string[] = $headerRow
      .find('th, td')
      .map((_i, c) => cleanCell($(c).text()))
      .get()
    if (headers.length === 0) return // table vide, on skip

    // Lignes data : <tbody tr> si présent, sinon toutes les <tr> sauf la 1ère
    const $bodyRows = $t.find('tbody tr').length
      ? $t.find('tbody tr')
      : $t.find('tr').slice(1)
    const rows: string[][] = []
    $bodyRows.each((_i, row) => {
      const cells: string[] = $(row)
        .find('td, th')
        .map((_j, c) => cleanCell($(c).text()))
        .get()
      if (cells.length > 0) rows.push(cells)
    })
    if (rows.length === 0) return // pas de data, on skip

    const colCount = headers.length
    const headerLine = '| ' + headers.map((h) => h || ' ').join(' | ') + ' |'
    const sepLine = '| ' + Array(colCount).fill('---').join(' | ') + ' |'
    const dataLines = rows.map((r) => {
      // Normaliser nb de colonnes : truncate si trop, pad si manque
      const padded = [...r.slice(0, colCount)]
      while (padded.length < colCount) padded.push('')
      return '| ' + padded.map((v) => v || ' ').join(' | ') + ' |'
    })
    const md = '\n\n' + [headerLine, sepLine, ...dataLines].join('\n') + '\n\n'
    $t.replaceWith(md)
  })
  return $.html()
}

function cleanCell(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|') // échappe les pipes pour ne pas casser le markdown
    .trim()
}

/**
 * Retire les blocs « contenu lié » (aides recommandées, articles liés,
 * voir-aussi…) avant extraction texte.
 *
 * Sur les sites Drupal institutionnels (CNL, culture.gouv, CNC, CNAP), un
 * module CMS injecte un slider « Aides du CNL qui pourraient vous
 * intéresser » avec d'autres aides ET LEURS PROPRES DATES. Sans nettoyage,
 * le LLM voit un mélange de l'aide principale + 3-5 aides sœurs, et il
 * extrait des dates qui appartiennent à des aides voisines en les
 * attribuant à l'aide consultée. Source confirmée du pattern CNL `0d`.
 *
 * Approche : double passe.
 *   1. Selectors connus (CMS Drupal, roles ARIA, classes courantes)
 *   2. Heading-based : tout h1-h4 dont le texte matche « qui pourraient
 *      vous intéresser », « voir aussi », etc., et on retire le bloc
 *      .paragraph / section / aside qui le contient.
 */
export function removeRelatedBlocks(html: string): string {
  const $ = cheerio.load(html)

  const SELECTORS = [
    // Drupal CNL/CNC/CNAP/culture-gouv
    '.paragraph--type--aides-list',
    '.paragraph--type--related',
    '.field-related',
    '.aid-teaser',
    '.row-teaser',
    '.swiper-slide',
    // Génériques CMS
    '[class*="related"]',
    '[class*="recommend"]',
    '[class*="see-also"]',
    '[class*="also-see"]',
    '[class*="suggested"]',
    '[class*="similar"]',
    // ARIA
    '[role="complementary"]',
    '[role="navigation"]',
    // Méta-nav usuelle
    '.breadcrumb',
    '.fil-ariane',
    '.share-bar',
    '.social-share',
  ]
  for (const sel of SELECTORS) $(sel).remove()

  const RELATED_HEADING_RE = /(qui\s+pourrai(?:en)?t\s+vous\s+int[ée]resser|voir\s+aussi|articles?\s+li[ée]s|sur\s+le\s+m[êe]me\s+sujet|dans\s+la\s+m[êe]me\s+cat[ée]gorie|(?:nos\s+)?aides?\s+similaires?|[àa]\s+lire\s+aussi|(?:nos\s+)?(?:articles?|appels?|aides?)\s+(?:recommand[ée]s?|connexes?))/i

  // Recherche dans les éléments « heading-like » : balises sémantiques h1-h6,
  // role="heading", et divs/spans avec classes title/heading/section-title.
  // Sans restriction de balise on risquerait de matcher la regex au milieu
  // d'un paragraphe légitime (ex. « cumulable avec les autres aides »).
  // Contrainte longueur ≤ 80 chars pour limiter encore le risque.
  const HEADING_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    '[role="heading"]',
    '.section-title',
    '.heading',
    '[class*="-title"]',
    '[class*="_title"]',
    '[class*="-heading"]',
    '[class*="_heading"]',
  ].join(', ')

  $(HEADING_SELECTOR).each((_i, el) => {
    const $el = $(el)
    const text = $el.text().replace(/\s+/g, ' ').trim()
    if (text.length === 0 || text.length > 80) return
    if (!RELATED_HEADING_RE.test(text)) return

    // Stratégie 1 : si le heading est dans un container manifestement
    // « related » (aside, paragraph--type--related, classe related/aides-list…),
    // on supprime ce container — il est borné et sûr.
    //
    // ⚠ NE PAS utiliser `article`, `section`, ou `.article-content-scroll`
    // ici : sur certaines pages (CNC FAJV par ex.), TOUT le body est wrappé
    // dans un seul `<article>` ou `.article-content-scroll`, et un .closest()
    // à ce niveau supprime aussi le contenu utile (calendrier, conditions).
    const SAFE_RELATED_CONTAINERS = [
      'aside',
      '.paragraph--type--related',
      '.paragraph--type--aides-list',
      '[class*="related"]',
      '[class*="recommend"]',
      '[class*="see-also"]',
      '[class*="similar"]',
    ].join(', ')
    const $container = $el.closest(SAFE_RELATED_CONTAINERS)
    if ($container.length && $container.get(0) !== $el.get(0)) {
      $container.remove()
      return
    }

    // Stratégie 2 (fallback) : flat sibling sweep. On supprime le heading
    // lui-même, puis ses siblings suivants jusqu'au prochain heading de
    // niveau ÉGAL OU SUPÉRIEUR (h1=1 plus haut, h6=plus bas). Borné par
    // la structure DOM, ne peut pas remonter en haut de page.
    const tagName = (el as { tagName?: string }).tagName?.toLowerCase() ?? ''
    const headingMatch = /^h([1-6])$/.exec(tagName)
    const currentLevel = headingMatch ? Number.parseInt(headingMatch[1], 10) : 0

    if (currentLevel > 0) {
      // Construit un sélecteur des headings de niveau ≤ currentLevel
      // (pour s'arrêter sur un titre frère ou plus haut hiérarchiquement).
      const stopLevels: string[] = []
      for (let lvl = 1; lvl <= currentLevel; lvl++) stopLevels.push(`h${lvl}`)
      const stopSelector = stopLevels.join(', ')

      // Supprime tous les siblings suivants jusqu'au prochain heading
      // d'arrêt (exclusif), puis supprime le heading lui-même.
      $el.nextUntil(stopSelector).remove()
      $el.remove()
    } else {
      // Pas un h1-h6 standard : supprime juste le heading.
      $el.remove()
    }
  })

  return $.html()
}

export function stripHtmlToText(html: string): string {
  // 0a. Retire les blocs de contenu lié (aides recommandées, voir aussi…)
  //     AVANT toute autre transformation, pour éviter que le LLM
  //     attribue les dates des aides sœurs à l'aide principale.
  let s = removeRelatedBlocks(html)
  // 0b. Convertir les <table> HTML en markdown table AVANT le strip général.
  //    Préserve l'info de colonne (Session × Ouverture × Clôture sur CNC,
  //    culture-gouv, etc.) que le LLM ne peut pas reconstituer sinon.
  s = htmlTablesToMarkdown(s)
  // Retire scripts/styles/noscripts (avec leur contenu)
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  // Retire les blocs structurels de navigation qui pollueraient l'extraction.
  // Sur les sites institutionnels (CNC, culture-gouv, etc.), la nav répète
  // les mêmes labels de menu (4-5 KB) à chaque page → tronque le contenu utile.
  s = s.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
  s = s.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
  s = s.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
  s = s.replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, ' ')
  // Forms (cookie banners, search inputs) souvent inutiles au contenu.
  s = s.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, ' ')
  // Commentaires HTML
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  // Remplace les balises de bloc par un saut de ligne (pour préserver la
  // structure visuelle et aider le LLM à voir les sections)
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|nav|main|aside|br|hr)\s*>/gi, '\n')
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n')
  // Strip toutes les autres balises
  s = s.replace(/<[^>]+>/g, ' ')
  // Décode les entités les plus communes
  for (const [ent, char] of Object.entries(HTML_ENTITIES)) {
    s = s.split(ent).join(char)
  }
  // Décode les entités numériques (&#1234;)
  s = s.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number.parseInt(n, 10)))
  s = s.replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Number.parseInt(n, 16)))
  // Normalise whitespace : tabs → space, multiples newlines → 2 max,
  // multiples spaces → 1
  s = s.replace(/\t/g, ' ')
  s = s.replace(/[  ]{2,}/g, ' ')
  // Trim ligne par ligne AVANT la collapse newlines, sinon ` \n \n ` ne se
  // collapse pas (le pattern \n{3,} ne matche que des newlines purement
  // consécutifs).
  s = s.split('\n').map((line) => line.trim()).join('\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/**
 * Tronque sur une frontière de mot pour éviter de couper au milieu d'un mot.
 */
function truncateOnWord(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}

export async function extractPageText(
  url: string,
  options: ExtractPageOptions = {},
): Promise<ExtractedPage | null> {
  const { maxChars = 8000, minUsefulChars = 200 } = options
  let resp: Response
  try {
    resp = await fetchWithRetry(url)
  } catch (err) {
    console.warn(`  [extract-page] fetch fail ${url} : ${(err as Error).message.slice(0, 120)}`)
    return null
  }
  if (!resp.ok) {
    console.warn(`  [extract-page] HTTP ${resp.status} sur ${url}`)
    return null
  }
  const ct = resp.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml/i.test(ct)) {
    console.warn(`  [extract-page] content-type non-html (${ct}) sur ${url}`)
    return null
  }
  const html = await resp.text()
  const stripped = stripHtmlToText(html)
  if (stripped.length < minUsefulChars) {
    console.warn(`  [extract-page] texte trop court (${stripped.length} chars) sur ${url}`)
    return null
  }
  const truncated = stripped.length > maxChars
  const text = truncated ? truncateOnWord(stripped, maxChars) : stripped
  // Détection PDF aussi sur le HTML nettoyé : sans ça, on remonte les
  // PDFs des « aides liées » et on fetche les pièces d'autres aides en
  // croyant qu'elles appartiennent à la principale.
  const cleanedHtml = removeRelatedBlocks(html)
  const pdfCandidates = detectPdfCandidates(cleanedHtml, url)
  const followupUrl = await detectFollowupCandidatureUrl(cleanedHtml, url)
  return {
    text,
    rawSize: html.length,
    textSize: text.length,
    truncated,
    pdfCandidates,
    followupUrl,
  }
}

/**
 * Scanne le HTML pour les `<a href>` pointant vers des PDFs, et trie par
 * pertinence pour extraction règlement/dossier/calendrier d'opportunité.
 *
 * Heuristique :
 *   - URL doit finir en .pdf (ou contenir .pdf? avant query string)
 *   - URL résolue en absolu (relative → absolute)
 *   - Score basé sur les mots-clés du texte du lien ET de l'URL
 *
 * Mots-clés POSITIFS (règlement, dossier de candidature) :
 *   règlement, dossier, cahier des charges, appel à projets, candidature,
 *   notice, modalités
 *
 * Mots-clés NÉGATIFS (à filtrer, formulaires accessoires ou résultats) :
 *   cv, curriculum, lauréat, palmarès, bilan, rapport-annuel, charte,
 *   compte-rendu, statuts, formulaire-budget
 *
 * Retourne au max 3 PDFs (1er = meilleur score). Empty si aucun PDF
 * pertinent trouvé.
 */
/** Top-N de PDFs candidates renvoyés. Augmenté de 3 à 5 le 2026-05-04 pour
 * les sources qui listent une fiche par sous-genre (ALCA NA : règlement +
 * fiche fiction + fiche doc + fiche animation + calendrier dépôts). */
const PDF_CANDIDATES_TOP_N = 5

function detectPdfCandidates(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const base = (() => {
    try { return new URL(baseUrl) } catch { return null }
  })()

  // Élargi pour capter les patterns « pièces du dossier », « documents
  // utiles », « composition du dossier », « fiche fiction/documentaire »
  // (ALCA NA), « liste des documents à fournir » (PictanovO).
  const POSITIVE = /règlement|reglement|dossier(?!\s+budget)|cahier\s+des\s+charges|appel\s+(?:à|a)\s+projets?|candidature|modalité|notice|guide\s+du\s+candidat|fiche\s+(?:technique|fiction|documentaire|animation|pratique|s[ée]rie)|pi[èe]ces?\s+(?:du\s+dossier|à\s+fournir)|documents?\s+(?:utiles?|à\s+fournir|de\s+r[ée]f[ée]rence)|composition\s+(?:du\s+)?dossier|liste\s+des\s+documents/i
  const NEGATIVE = /\bcv\b|curriculum|lauréat|laureat|palmar[èe]s|bilan|rapport[-\s]annuel|charte|compte[-\s]rendu|statuts|formulaire[-\s]budget|attestation|d[ée]claration\s+sur\s+l['']honneur|annexe[-\s]budget/i

  interface Candidate { url: string; score: number; label: string }
  const candidates: Candidate[] = []

  $('a[href]').each((_i, a) => {
    const $a = $(a)
    const href = ($a.attr('href') ?? '').trim()
    if (!href) return

    // === Filtre dur : le lien doit ressembler à un FICHIER ===
    // Les anciens critères acceptaient un lien si son contexte mentionnait
    // « dossier », ce qui aspirait des navigations type « Déposer un dossier »
    // (URL = page d'accueil) en faux positifs avec un score élevé. Cas
    // PictanovO où 2 navs « Déposer un dossier » volaient les top-3 et
    // éjectaient le vrai PDF « Pieces-a-fournir ».
    const hasPdfExt = /\.pdf(\?|#|$)/i.test(href)
    const hasOtherFileExt = /\.(docx?|odt|rtf|xlsx?|zip|pages|key|numbers)(\?|#|$)/i.test(href)
    const hasDownloadAttr = $a.attr('download') !== undefined
    const hasDownloadQuery = /[?&](download|attachment)=/i.test(href)
    const looksLikeFile = hasPdfExt || hasOtherFileExt || hasDownloadAttr || hasDownloadQuery
    if (!looksLikeFile) return

    const label = ($a.text() || '').replace(/\s+/g, ' ').trim()
    const ariaLabel = ($a.attr('aria-label') ?? '').replace(/\s+/g, ' ').trim()
    const parentTitle = $a
      .closest('div, section, article, li')
      .find('h2, h3, h4')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
    const ctx = `${label} ${ariaLabel} ${parentTitle}`

    let abs: string
    try {
      abs = base ? new URL(href, base).toString() : href
    } catch { return }
    if (!/^https?:/i.test(abs)) return

    const haystack = `${ctx} ${abs}`.toLowerCase()
    if (NEGATIVE.test(haystack)) return

    // === Scoring ===
    let score = 0
    if (POSITIVE.test(haystack)) score += 10
    if (hasPdfExt) score += 3
    if (hasOtherFileExt) score += 2
    if (hasDownloadAttr) score += 2
    // Bonus contextuels
    if (/règlement|reglement|notice/i.test(ctx)) score += 5
    if (/dossier/i.test(ctx) && !/budget/i.test(ctx)) score += 3
    if (/\.pdf/i.test(parentTitle)) score += 2

    // === Bonus filename ===
    // Le filename porte souvent le signal le plus fort : `Pieces-a-fournir.pdf`,
    // `composition_dossier.pdf`, `fiche_fiction_developpement.pdf`. Ce sont
    // les PDFs où le LLM trouvera les pièces. Sans ce bonus, ils sont
    // souvent éjectés du top par les règlements généraux.
    const filename = (abs.split('/').pop() ?? '').toLowerCase()
    const filenameNorm = decodeURIComponent(filename).toLowerCase()
    if (/pi[èe]ces?[-_\s]*(?:à[-_\s]*fournir|du[-_\s]*dossier)/.test(filenameNorm)) score += 8
    if (/documents?[-_\s]*(?:utiles?|à[-_\s]*fournir|de[-_\s]*r[ée]f[ée]rence)/.test(filenameNorm)) score += 6
    if (/composition[-_\s]*(?:du[-_\s]*)?dossier/.test(filenameNorm)) score += 5
    if (/^fiche[-_\s]*(?:fiction|documentaire|animation|pratique|s[ée]rie)/.test(filenameNorm)) score += 4
    if (/r[èe]glement|reglement/.test(filenameNorm)) score += 3
    if (/notice/.test(filenameNorm)) score += 2
    if (/calendrier/.test(filenameNorm)) score += 2
    // Pénalise les filenames manifestement non pertinents
    if (/\b(charte|statut|budget|laureat|lauréat|cv)/.test(filenameNorm)) score -= 5

    if (score <= 0) return

    candidates.push({ url: abs, score, label: parentTitle || label || abs })
  })

  const seen = new Set<string>()
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      if (seen.has(c.url)) return false
      seen.add(c.url)
      return true
    })
    .slice(0, PDF_CANDIDATES_TOP_N)
    .map((c) => c.url)
}

/**
 * Détecte un éventuel lien « page candidature/postuler/modalités » pointant
 * vers une page interne de la même source, et la fetch.
 *
 * Cas typique : Moulin d'Andé. La page principale liste les programmes
 * mais renvoie « Appels à candidatures » → /ceci-candidature/. Sans suivre
 * ce lien, le LLM ne voit rien sur les pièces, le calendrier, etc.
 *
 * Limite : 1 page suivie max, même hostname uniquement, max 8000c
 * extraits, pour ne pas exploser le contexte LLM ni risquer du crawling
 * profond.
 */
async function detectFollowupCandidatureUrl(
  html: string,
  mainUrl: string,
): Promise<string | null> {
  const $ = cheerio.load(html)
  const main = (() => {
    try { return new URL(mainUrl) } catch { return null }
  })()
  if (!main) return null

  const FOLLOWUP_LABEL_RE = /^\s*(?:appels?\s+(?:à\s+)?candidatures?|comment\s+(?:candidater|postuler|d[ée]poser)|modalit[ée]s(?:\s+(?:de\s+)?candidature)?|d[ée]poser\s+(?:un|votre|sa)\s+(?:dossier|candidature|projet)|postuler|candidater|constituer\s+(?:son|votre)\s+dossier)\s*$/i

  interface FollowupBest { url: string; depth: number }
  let best: FollowupBest | null = null
  const mainDepth = main.pathname.split('/').filter(Boolean).length
  $('a[href]').each((_i, a) => {
    const $a = $(a)
    const label = $a.text().replace(/\s+/g, ' ').trim()
    if (!FOLLOWUP_LABEL_RE.test(label)) return
    const href = $a.attr('href') ?? ''
    if (!href) return
    let abs: string
    try { abs = new URL(href, main).toString() } catch { return }
    let u: URL
    try { u = new URL(abs) } catch { return }
    if (u.hostname !== main.hostname) return
    if (abs === mainUrl) return
    if (!/^https?:/i.test(abs)) return
    const depth = u.pathname.split('/').filter(Boolean).length
    const candidate: FollowupBest = { url: abs, depth }
    if (!best || Math.abs(candidate.depth - mainDepth) < Math.abs(best.depth - mainDepth)) {
      best = candidate
    }
  })

  return best ? (best as FollowupBest).url : null
}
