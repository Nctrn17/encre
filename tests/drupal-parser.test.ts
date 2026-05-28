import { describe, it, expect } from 'vitest'
import { parseDrupalListing, type DrupalListingConfig } from '../scrapers/lib/drupal-parser'

/**
 * Fixture simulant la structure CNL réelle (centrenationaldulivre.fr/aides).
 * Vérifié en live 2026-04-18 contre la vraie page.
 */
const CNL_SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<body>
<div class="view-content">
  <article data-history-node-id="3" role="article" about="/aides-financement/bourse-aux-auteurs-autrices" class="node row-teaser aid-teaser swiper-slide">
    <a href="/aides-financement/bourse-aux-auteurs-autrices">
      <div class="row-wrapper">
        <h3 class="row-title"><span>Bourse aux auteurs et autrices</span></h3>
        <div class="row-category">
          <div class="category-item">Auteur,</div>
          <div class="category-item">Traducteur</div>
        </div>
        <div class="field-subtitle aid__subtitle">Soutien aux auteurs en création</div>
      </div>
    </a>
  </article>

  <article data-history-node-id="42" role="article" about="/aides-financement/aide-a-la-traduction" class="node row-teaser aid-teaser swiper-slide">
    <a href="/aides-financement/aide-a-la-traduction">
      <div class="row-wrapper">
        <h3 class="row-title"><span>Aide à la traduction</span></h3>
        <div class="row-category">
          <div class="category-item">Traducteur,</div>
          <div class="category-item">Éditeur</div>
        </div>
        <div class="field-subtitle aid__subtitle">Financement de projets de traduction littéraire</div>
      </div>
    </a>
  </article>

  <article data-history-node-id="4423" role="article" about="/aides-financement/le-portail-numerique-des-demandes-d-aides" class="node row-teaser aid-teaser swiper-slide">
    <a href="/aides-financement/le-portail-numerique-des-demandes-d-aides">
      <div class="row-wrapper">
        <h3 class="row-title"><span>Le portail numérique des demandes d'aides</span></h3>
        <div class="row-category">
          <div class="category-item">Auteur</div>
        </div>
        <div class="field-subtitle aid__subtitle">Un service pour vous guider dans vos démarches</div>
      </div>
    </a>
  </article>
</div>
</body>
</html>
`

const CNL_CONFIG: DrupalListingConfig = {
  itemSelector: 'article.aid-teaser',
  titleSelector: '.row-title',
  linkSelector: 'a[href]',
  subtitleSelector: '.field-subtitle',
  categoriesSelector: '.category-item',
  externalIdAttribute: 'data-history-node-id',
  sourceSlug: 'cnl',
  emitterName: 'Centre national du livre',
  disciplineHints: ['litterature'],
  titleBlocklist: ['portail numérique', 'faq'],
}

describe('parseDrupalListing - CNL config', () => {
  it('extracts title, url, subtitle, categories from aid-teaser articles', () => {
    const items = parseDrupalListing(
      CNL_SAMPLE_HTML,
      'https://centrenationaldulivre.fr',
      CNL_CONFIG,
    )
    // 3 articles dans le fixture, mais 1 filtré par titleBlocklist (portail numérique)
    expect(items).toHaveLength(2)

    const bourse = items.find((i) => i.payload.title.includes('Bourse'))
    expect(bourse).toBeDefined()
    expect(bourse!.payload.emitter).toBe('Centre national du livre')
    expect(bourse!.payload.url).toBe(
      'https://centrenationaldulivre.fr/aides-financement/bourse-aux-auteurs-autrices',
    )
    expect(bourse!.payload.description).toContain('Soutien aux auteurs')
    expect(bourse!.payload.description).toContain('Auteur')
    expect(bourse!.payload.description).toContain('Traducteur')
    expect(bourse!.payload.discipline_hints).toContain('litterature')
    expect(bourse!.external_id).toBe('cnl-node-3')
  })

  it('filters blocklisted titles', () => {
    const items = parseDrupalListing(
      CNL_SAMPLE_HTML,
      'https://centrenationaldulivre.fr',
      CNL_CONFIG,
    )
    const portail = items.find((i) => i.payload.title.toLowerCase().includes('portail'))
    expect(portail).toBeUndefined()
  })

  it('resolves relative URLs to absolute', () => {
    const items = parseDrupalListing(
      CNL_SAMPLE_HTML,
      'https://centrenationaldulivre.fr',
      CNL_CONFIG,
    )
    for (const item of items) {
      expect(item.payload.url).toMatch(/^https:\/\/centrenationaldulivre\.fr/)
    }
  })

  it('uses node-id for stable external_id when attribute provided', () => {
    const items = parseDrupalListing(
      CNL_SAMPLE_HTML,
      'https://centrenationaldulivre.fr',
      CNL_CONFIG,
    )
    const ids = items.map((i) => i.external_id).sort()
    expect(ids).toEqual(['cnl-node-3', 'cnl-node-42'])
  })

  it('falls back to slug-based external_id when attribute absent', () => {
    const configNoId = { ...CNL_CONFIG, externalIdAttribute: undefined }
    const items = parseDrupalListing(
      CNL_SAMPLE_HTML,
      'https://centrenationaldulivre.fr',
      configNoId,
    )
    for (const item of items) {
      expect(item.external_id).toMatch(/^cnl-[a-z0-9-]+$/)
    }
  })

  it('deduplicates same external_id', () => {
    const duplicated = CNL_SAMPLE_HTML + CNL_SAMPLE_HTML
    const items = parseDrupalListing(
      duplicated,
      'https://centrenationaldulivre.fr',
      CNL_CONFIG,
    )
    // Même fixture × 2 → même nombre d'items après dedup
    expect(items).toHaveLength(2)
  })

  it('ignores articles with missing link', () => {
    const brokenHtml = `
      <article data-history-node-id="99" class="aid-teaser">
        <h3 class="row-title"><span>Titre sans lien</span></h3>
      </article>
    `
    const items = parseDrupalListing(brokenHtml, 'https://example.com', CNL_CONFIG)
    expect(items).toHaveLength(0)
  })

  it('ignores articles with too-short title', () => {
    const brokenHtml = `
      <article data-history-node-id="99" class="aid-teaser">
        <a href="/x"><h3 class="row-title"><span>X</span></h3></a>
      </article>
    `
    const items = parseDrupalListing(brokenHtml, 'https://example.com', CNL_CONFIG)
    expect(items).toHaveLength(0)
  })

  it('applies titleAllowlist filter', () => {
    const config = { ...CNL_CONFIG, titleAllowlist: ['Bourse'] }
    const items = parseDrupalListing(
      CNL_SAMPLE_HTML,
      'https://centrenationaldulivre.fr',
      config,
    )
    expect(items).toHaveLength(1)
    expect(items[0].payload.title).toContain('Bourse')
  })

  it('normalizes whitespace in titles', () => {
    const messyHtml = `
      <article class="aid-teaser">
        <a href="/x">
          <h3 class="row-title">
            <span>
               Bourse    multi-lignes
              avec   espaces
            </span>
          </h3>
        </a>
      </article>
    `
    const items = parseDrupalListing(messyHtml, 'https://example.com', CNL_CONFIG)
    expect(items).toHaveLength(1)
    expect(items[0].payload.title).toBe('Bourse multi-lignes avec espaces')
  })
})
