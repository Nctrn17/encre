import { describe, it, expect } from 'vitest'
import {
  stripHtmlToText,
  htmlTablesToMarkdown,
  removeRelatedBlocks,
} from '../scrapers/lib/extract-page-text'

describe('stripHtmlToText', () => {
  it('retire les scripts et leur contenu', () => {
    const html = '<p>Bonjour</p><script>alert("hack")</script><p>Au revoir</p>'
    expect(stripHtmlToText(html)).toContain('Bonjour')
    expect(stripHtmlToText(html)).toContain('Au revoir')
    expect(stripHtmlToText(html)).not.toContain('alert')
    expect(stripHtmlToText(html)).not.toContain('hack')
  })

  it('retire les styles', () => {
    const html = '<style>.a{color:red}</style><p>Texte</p>'
    expect(stripHtmlToText(html)).toBe('Texte')
  })

  it('retire les noscript et commentaires', () => {
    const html = '<!-- caché --><noscript>JS off</noscript><p>Visible</p>'
    expect(stripHtmlToText(html)).toBe('Visible')
  })

  it('décode les entités HTML communes', () => {
    expect(stripHtmlToText('Café &amp; thé &eacute;t&eacute;')).toBe('Café & thé été')
    expect(stripHtmlToText('Auteurs &laquo;émergents&raquo;')).toBe('Auteurs «émergents»')
    expect(stripHtmlToText('5 000&nbsp;&euro;')).toBe('5 000 €')
  })

  it('décode les entités numériques', () => {
    expect(stripHtmlToText('Caf&#233; &#x263A;')).toBe('Café ☺')
  })

  it('préserve la structure en remplaçant les balises de bloc par des newlines', () => {
    const html = '<h1>Titre</h1><p>Para 1</p><ul><li>A</li><li>B</li></ul>'
    const txt = stripHtmlToText(html)
    expect(txt).toContain('Titre')
    expect(txt).toContain('Para 1')
    expect(txt).toContain('A')
    expect(txt).toContain('B')
    // chaque bloc est sur sa propre ligne (pas de "TitrePara 1AB")
    expect(txt.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(3)
  })

  it('limite les newlines à 2 max consécutifs', () => {
    const html = '<p>A</p><p></p><p></p><p></p><p>B</p>'
    const txt = stripHtmlToText(html)
    expect(txt).not.toMatch(/\n{3,}/)
  })

  it('normalise les multiples espaces', () => {
    const html = '<p>Texte    avec     espaces</p>'
    expect(stripHtmlToText(html)).toBe('Texte avec espaces')
  })

  it('extrait le texte de pages réelles institutionnelles (mocked Beaumarchais)', () => {
    const html = `<html><body>
      <header><nav>Accueil > Danse</nav></header>
      <main>
        <h1>Danse</h1>
        <p>Chaque année, l'association Beaumarchais attribue plusieurs bourses.</p>
        <h2>Qui peut candidater ?</h2>
        <p>Les bourses sont destinées aux chorégraphes émergents.</p>
        <ul>
          <li>Émergent : pas plus d'une œuvre créée</li>
          <li>Sans limite d'âge</li>
        </ul>
        <h2>Dossier à constituer</h2>
        <p>Note d'intention, CV, vidéo de présentation.</p>
      </main>
    </body></html>`
    const txt = stripHtmlToText(html)
    expect(txt).toContain('Qui peut candidater')
    expect(txt).toContain('Émergent')
    expect(txt).toContain('Dossier à constituer')
    expect(txt).toContain('Note d\'intention, CV, vidéo')
  })

  it('résiste à un HTML mal formé', () => {
    const html = '<p>Texte <b>partiel sans fermeture <p>Suite'
    const txt = stripHtmlToText(html)
    expect(txt).toContain('Texte')
    expect(txt).toContain('partiel')
    expect(txt).toContain('Suite')
  })
})

describe('htmlTablesToMarkdown', () => {
  it('convertit une table simple <thead>/<tbody>', () => {
    const html = `<table>
      <thead><tr><th>Session</th><th>Ouverture</th><th>Clôture</th></tr></thead>
      <tbody>
        <tr><td>1 - 2026</td><td>17 nov 2025</td><td>30 jan 2026</td></tr>
        <tr><td>2 - 2026</td><td>06 jan 2026</td><td>30 mars 2026</td></tr>
      </tbody>
    </table>`
    const out = htmlTablesToMarkdown(html)
    expect(out).toContain('| Session | Ouverture | Clôture |')
    expect(out).toContain('| --- | --- | --- |')
    expect(out).toContain('| 1 - 2026 | 17 nov 2025 | 30 jan 2026 |')
    expect(out).toContain('| 2 - 2026 | 06 jan 2026 | 30 mars 2026 |')
  })

  it('utilise la 1ère <tr> comme header si pas de <thead>', () => {
    const html = `<table>
      <tr><td>Discipline</td><td>Montant</td></tr>
      <tr><td>Cinéma</td><td>4 500 €</td></tr>
      <tr><td>Théâtre</td><td>3 500 €</td></tr>
    </table>`
    const out = htmlTablesToMarkdown(html)
    expect(out).toContain('| Discipline | Montant |')
    expect(out).toContain('| Cinéma | 4 500 € |')
    expect(out).toContain('| Théâtre | 3 500 € |')
  })

  it('échappe les pipes dans le contenu des cellules', () => {
    const html = `<table><tr><td>A|B</td><td>C</td></tr><tr><td>1</td><td>2</td></tr></table>`
    const out = htmlTablesToMarkdown(html)
    expect(out).toContain('A\\|B')
  })

  it('tolère les colspan en paddant les cellules manquantes', () => {
    const html = `<table>
      <tr><th>A</th><th>B</th><th>C</th></tr>
      <tr><td>1</td><td>2</td></tr>
    </table>`
    const out = htmlTablesToMarkdown(html)
    expect(out).toContain('| A | B | C |')
    // Cellule C manquante est paddée en vide
    expect(out).toMatch(/\|\s*1\s*\|\s*2\s*\|\s*\|/)
  })

  it('skip les tables vides ou sans data', () => {
    const html = `<table><thead><tr><th>X</th></tr></thead></table>`
    const out = htmlTablesToMarkdown(html)
    // Pas de markdown table ajouté, la table HTML reste (sera strippée plus tard)
    expect(out).not.toContain('| X |')
  })

  it('garde le reste du HTML intact', () => {
    const html = `<p>Avant</p><table><tr><th>A</th></tr><tr><td>1</td></tr></table><p>Après</p>`
    const out = htmlTablesToMarkdown(html)
    expect(out).toContain('<p>Avant</p>')
    expect(out).toContain('<p>Après</p>')
    expect(out).toContain('| A |')
  })

  it('intégration : stripHtmlToText sur HTML avec table préserve le markdown', () => {
    const html = `<html><body>
      <p>Calendrier des sessions :</p>
      <table>
        <thead><tr><th>Session</th><th>Clôture</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>30 janvier 2026</td></tr>
          <tr><td>2</td><td>30 mars 2026</td></tr>
        </tbody>
      </table>
      <p>Téléchargez le règlement.</p>
    </body></html>`
    const txt = stripHtmlToText(html)
    expect(txt).toContain('Calendrier des sessions')
    expect(txt).toContain('| Session | Clôture |')
    expect(txt).toContain('| 1 | 30 janvier 2026 |')
    expect(txt).toContain('| 2 | 30 mars 2026 |')
    expect(txt).toContain('Téléchargez le règlement')
  })
})

describe('removeRelatedBlocks', () => {
  it('supprime un bloc « Articles liés » sans tuer le contenu principal de la page', () => {
    // Cas réel reproduit du CNC FAJV (mai 2026) : tout le content body
    // est wrappé dans un seul <article>, et un h2 "Articles liés"
    // apparaît à la fin de l'article. L'ancien comportement faisait un
    // .closest('article') qui remontait au wrapper global → tout le
    // contenu était supprimé.
    const html = `<html><body>
      <article class="article-content-scroll">
        <h1>Fonds d'aide au jeu vidéo</h1>
        <p>Le fonds soutient la création.</p>
        <h2>Prochaines Commissions</h2>
        <p>Prochaine date limite de dépôt :</p>
        <ul>
          <li>lundi 2 février 2026</li>
          <li>lundi 11 mai 2026</li>
          <li>lundi 21 septembre 2026</li>
        </ul>
        <h2>Articles liés</h2>
        <div class="aid-teaser"><a href="/x">Aide voisine 1</a></div>
        <div class="aid-teaser"><a href="/y">Aide voisine 2</a></div>
      </article>
    </body></html>`
    const out = removeRelatedBlocks(html)
    // Le contenu utile DOIT survivre
    expect(out).toContain('Fonds d\'aide au jeu vidéo')
    expect(out).toContain('Prochaines Commissions')
    expect(out).toContain('lundi 2 février 2026')
    expect(out).toContain('lundi 11 mai 2026')
    expect(out).toContain('lundi 21 septembre 2026')
    // Le bloc « Articles liés » ET ses items DOIVENT être retirés
    expect(out).not.toContain('Articles liés')
    expect(out).not.toContain('Aide voisine 1')
    expect(out).not.toContain('Aide voisine 2')
  })

  it('s\'arrête au prochain heading de niveau égal et préserve les sections suivantes', () => {
    // Si après "Articles liés" (h2) il y a une autre h2 légitime, on ne
    // doit pas supprimer la section suivante.
    const html = `<body>
      <h2>Articles liés</h2>
      <p>Un autre article.</p>
      <p>Encore un.</p>
      <h2>Calendrier</h2>
      <p>30 janvier 2026 : clôture.</p>
    </body>`
    const out = removeRelatedBlocks(html)
    expect(out).not.toContain('Articles liés')
    expect(out).not.toContain('Un autre article')
    expect(out).toContain('Calendrier')
    expect(out).toContain('30 janvier 2026')
  })

  it('s\'arrête au prochain heading de niveau supérieur', () => {
    // h3 "Voir aussi" devrait s'arrêter à h2 (niveau supérieur)
    const html = `<body>
      <h3>Voir aussi</h3>
      <p>Lien 1.</p>
      <h2>Section principale</h2>
      <p>Contenu majeur.</p>
    </body>`
    const out = removeRelatedBlocks(html)
    expect(out).not.toContain('Voir aussi')
    expect(out).not.toContain('Lien 1')
    expect(out).toContain('Section principale')
    expect(out).toContain('Contenu majeur')
  })

  it('supprime quand même via .closest() un container spécifique « related »', () => {
    // Le fast-path closest doit fonctionner sur containers explicites :
    // aside, .paragraph--type--related, [class*="related"]
    const html = `<body>
      <p>Contenu principal.</p>
      <aside>
        <h2>À lire aussi</h2>
        <a href="/x">Article voisin</a>
      </aside>
    </body>`
    const out = removeRelatedBlocks(html)
    expect(out).toContain('Contenu principal')
    expect(out).not.toContain('À lire aussi')
    expect(out).not.toContain('Article voisin')
  })
})
