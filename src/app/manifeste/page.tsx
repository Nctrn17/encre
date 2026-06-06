import type { Metadata } from 'next'

/**
 * Encre · manifeste éditorial.
 * Port du mockup mockups/v7-manifeste.html. Page statique, pas de data
 * dynamique. Le Header et le Footer sont fournis par layout.tsx.
 */

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Notre manifeste · pourquoi Encre existe',
  description:
    "Encre est indépendant, sans publicité, sans partenariat institutionnel. Pourquoi tenir un registre des aides à l'écriture, ce que nous sommes, ce que nous ne serons pas.",
  alternates: { canonical: '/manifeste' },
  openGraph: {
    title: 'Notre manifeste · pourquoi Encre existe',
    description:
      "Pourquoi Encre existe, ce qu'il fait, ce qu'il n'est pas, et ce qu'il restera.",
    type: 'article',
    url: '/manifeste',
  },
}

export default function ManifestePage() {
  return (
    <div className="max-w-[720px] mx-auto px-5 sm:px-8">
      {/* ─── TITLE BLOCK ───────────────────────────────── */}
      <div style={{ padding: '64px 0 40px' }}>
        <div
          className="mono"
          style={{
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--vermillion)',
            marginBottom: 18,
          }}
        >
          Édition de mai 2026 · v0.1
        </div>
        <h1
          className="serif"
          style={{
            fontSize: 'clamp(2.6rem, 5vw, 3.8rem)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: 'var(--ink)',
          }}
        >
          Manifeste<span style={{ color: 'var(--vermillion)' }}>.</span>
        </h1>
        <p
          className="serif"
          style={{
            marginTop: 28,
            fontStyle: 'italic',
            fontSize: '1.4rem',
            fontWeight: 400,
            color: 'var(--ink-muted)',
            maxWidth: '50ch',
            lineHeight: 1.45,
          }}
        >
          Pourquoi Encre existe, ce qu&apos;il fait, ce qu&apos;il n&apos;est
          pas, et ce qu&apos;il restera.
        </p>
        <div
          className="mono"
          style={{
            marginTop: 36,
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-soft)',
          }}
        >
          <span>La rédaction</span>
          <span style={pipeStyle}>·</span>
          <span>2 mai 2026</span>
        </div>
      </div>

      {/* ─── BODY (sections numérotées) ──────────────── */}
      <article style={{ padding: '64px 0 60px' }}>
        <Section num="I." title="Le constat">
          <p>
            Les appels à projets culturels sont publiés par décret. Ils ne
            circulent pourtant qu&apos;à travers les bons cercles. Les
            newsletters privées payantes, les groupes d&apos;anciens
            étudiants d&apos;écoles prestigieuses, la cafétéria de la SACD.
            Pour celles et ceux qui ne sont pas dans ces réseaux,
            l&apos;information n&apos;existe pas. Alors qu&apos;elle est,
            légalement, accessible à tous.
          </p>
        </Section>

        <Section num="II." title="La position">
          <p>
            Ce qui est public selon la loi doit l&apos;être en pratique. Nous rassemblons dans un seul endroit ce que les
            institutions publient déjà chacune dans leur coin. La liste est
            intégrale, ouverte. Personne ne décide à votre place ce qui est
            important. Tout est visible.
          </p>
          <p>
            Ce site vient de l&apos;expérience des galères qu&apos;on
            rencontre quand on essaye de se lancer. On sait à quel point ça
            peut être dur, et à cela s&apos;ajoutent les discriminations
            systémiques. Nous incluons donc dans le registre les appels
            réservés aux femmes et minorités de genre. Nous dédions une page
            du site aux programmes pour les pays du Sud Global, et une autre
            page regroupant les aides qui peuvent convenir aux ultramarins.
          </p>
        </Section>

        <Section num="III." title="Les limites">
          <p>
            Nous ne sommes pas affiliés aux institutions que nous
            référençons. Les conditions de candidature, les délais, la
            sélection finale relèvent exclusivement des émetteurs.
          </p>
          <p>
            Nous ne sommes pas un guide pour décrocher une bourse. La
            lecture personnalisée d&apos;une opportunité est un avis, du
            genre qu&apos;un confrère vous donnerait en passant son doigt
            sur une liste. Elle ne vous dit pas comment monter un dossier,
            ni si vous obtiendrez l&apos;aide.
          </p>
          <p>
            Nous indiquons ce que dit le règlement, à vous de juger si vous correspondez.
          </p>
        </Section>

        <Section num="IV." title="Le modèle">
          <p>
            Gratuit. Sans publicité. Sans tracking. Données hébergées en
            France. Newsletter facultative, désabonnement immédiat.
          </p>
          <p>
            Le registre est consultable sans inscription. La veille
            personnelle, en revanche, demande un compte minimal : une
            adresse mail et le profil que vous choisissez de partager, pour
            recevoir les annonces adaptées à vous. Aucune donnée n&apos;est
            revendue, aucune donnée n&apos;est exploitée pour autre chose
            que la veille elle-même.
          </p>
          <p>
            Le seul moyen de soutenir Encre sera le don libre. Pas de
            version Pro. Pas de freemium. Pas de mise en avant payante pour
            les institutions.
          </p>
        </Section>

        <Section num="V." title="L'engagement">
          <p>
            Encre restera gratuit pour toutes et tous, indéfiniment.
          </p>
          <p>
            Si l&apos;outil devient nécessaire à grande échelle, sa
            pérennité passera par les dons, par des partenariats
            institutionnels sans contrepartie commerciale, ou par des
            subventions publiques compatibles avec son indépendance
            éditoriale.
          </p>
          <p>Jamais en vous monétisant.</p>
        </Section>
      </article>

      {/* ─── PULL QUOTE ──────────────────────────────── */}
      <div style={{ margin: '80px 0 72px' }}>
        <div
          style={{
            width: 60,
            height: 2,
            background: 'var(--vermillion)',
            marginBottom: 28,
          }}
          aria-hidden="true"
        />
        <p
          className="serif"
          style={{
            fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)',
            lineHeight: 1.3,
            color: 'var(--ink)',
            fontWeight: 500,
            letterSpacing: '-0.015em',
            margin: 0,
          }}
        >
          La liste des aides publiques n&apos;est pas une faveur à distribuer.
          C&apos;est un droit à{' '}
          <span style={{ color: 'var(--vermillion)' }}>faire circuler</span>.
        </p>
      </div>

      {/* ─── COLOPHON ────────────────────────────────── */}
      <div style={{ padding: '60px 0 80px' }}>
        <div
          className="mono"
          style={{
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--ink-soft)',
            marginBottom: 16,
          }}
        >
          Colophon
        </div>
        <p style={colophonBodyStyle}>
          Encre est un projet d&apos;utilité publique, lancé en mai 2026,
          sans capital ni structure juridique commerciale. Les
          contributions, retours et signalements de sources manquantes sont
          bienvenus à{' '}
          <a href="mailto:bonjour@encre.io" style={colophonLinkStyle}>
            bonjour@encre.io
          </a>
          .
        </p>
        <p style={{ ...colophonBodyStyle, marginTop: 18 }}>
          Toute personne qui considère qu&apos;une fiche publiée ici contient
          une erreur ou un contenu indésirable peut écrire à la même adresse.
          Délai de réponse moyen : 48 h.
        </p>
        <div
          className="mono"
          style={{
            marginTop: 48,
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--ink)',
          }}
        >
          Encre
          <span style={pipeStyle}>·</span>
          indépendant
          <span style={pipeStyle}>·</span>
          sans publicité
          <span style={pipeStyle}>·</span>
          2026 →
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  num,
  title,
  children,
}: {
  num: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        marginBottom: 72,
        display: 'grid',
        gridTemplateColumns: '80px 1fr',
        gap: 32,
      }}
    >
      <div
        className="serif"
        style={{
          fontWeight: 600,
          fontSize: '2.4rem',
          color: 'var(--vermillion)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {num}
      </div>
      <div style={{ maxWidth: 640 }}>
        <div
          className="mono"
          style={{
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--ink)',
            marginBottom: 18,
            paddingBottom: 10,
            borderBottom: '1px solid var(--ink)',
          }}
        >
          {title}
        </div>
        <div
          className="serif"
          style={{
            fontSize: '1.22rem',
            lineHeight: 1.6,
            color: 'var(--ink)',
          }}
        >
          {children}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles partagés
// ─────────────────────────────────────────────────────────────────────────────

const pipeStyle: React.CSSProperties = {
  color: 'var(--ink-rule)',
  margin: '0 10px',
}

const colophonBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '1rem',
  lineHeight: 1.7,
  color: 'var(--ink-muted)',
  maxWidth: 640,
}

const colophonLinkStyle: React.CSSProperties = {
  color: 'var(--ink)',
  borderBottom: '1px solid var(--ink-rule)',
  paddingBottom: 1,
  transition:
    'color 160ms var(--ease-out), border-color 160ms var(--ease-out)',
}
