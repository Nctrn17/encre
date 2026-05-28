import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Encre · page À propos.
 *
 * Format revue éditoriale, cohérent avec la landing et le manifeste.
 * Largeur 720px, h2 serif sans numérotation pour différencier du
 * manifeste numéroté. Détaille la mécanique du produit : collecte,
 * classification, éligibilité, lecture personnalisée, revue, infra.
 */

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'À propos · comment Encre fonctionne',
  description:
    "La collecte, la classification, l'éligibilité, la lecture personnalisée, la revue, l'infrastructure. Tout ce qui se passe entre une page DRAC et votre boîte mail.",
  alternates: { canonical: '/a-propos' },
  openGraph: {
    title: 'À propos · comment Encre fonctionne',
    description:
      "La collecte, la classification, l'éligibilité, la lecture personnalisée, la revue, l'infrastructure.",
    type: 'article',
    url: '/a-propos',
  },
}

export default function AboutPage() {
  return (
    <article style={pageStyle}>
      {/* ─── BANDEAU ───────────────────────────────────────── */}
      <header style={mastheadStyle}>
        <div style={mastheadLineStyle}>À propos · Édition de mai 2026 · v0.1</div>
        <div style={mastheadTaglineStyle}>
          Comment Encre fonctionne, dans le détail.
        </div>
      </header>

      {/* ─── TITRE ─────────────────────────────────────────── */}
      <h1 style={titleStyle}>
        À propos<span style={{ color: 'var(--vermillion)' }}>.</span>
      </h1>

      <p style={chapeauStyle}>
        La collecte, la classification, la lecture, la revue, l&apos;infrastructure.
      </p>

      {/* ─── LA COLLECTE ───────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>La collecte</h2>
        <p style={paragraphStyle}>
          Chaque jour, un scraper parcourt les pages publiques de plusieurs
          dizaines d&apos;organismes qui financent l&apos;écriture,
          l&apos;image et le son : DRAC, CNC, CNL, ARTCENA, SCAM, SACD,
          fondations, agences régionales, programmes pour les pays du Sud
          Global, dispositifs ouverts aux territoires d&apos;Outre-mer,
          appels réservés aux femmes et minorités de genre, et aux
          sociétaires des sociétés d&apos;auteurs. La liste complète est
          consultable sur{' '}
          <Link href="/sources" style={inlineLinkStyle}>
            la page Sources
          </Link>
          .
        </p>
        <p style={paragraphStyle}>
          Les annonces sont récupérées au format brut (HTML, RSS, PDF, API
          quand elle existe), avec leur URL d&apos;origine conservée en
          clair. Tout ce qui est ouvert à candidature entre dans le
          registre, sans tri éditorial.
        </p>
      </section>

      {/* ─── LA CLASSIFICATION ─────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>La classification</h2>
        <p style={paragraphStyle}>
          Une fois récupérée, chaque annonce est normalisée par un modèle de
          langage (Mistral) qui en extrait les champs structurés : titre,
          émetteur, montant, deadline, type d&apos;opportunité, discipline,
          géographie, conditions d&apos;éligibilité.
        </p>
        <p style={paragraphStyle}>
          Le résultat est déposé dans le registre avec un niveau de
          confiance attaché. Les annonces dont la classification est
          incertaine sont signalées pour relecture humaine avant
          publication. L&apos;objectif à terme est une autonomie complète
          du modèle, sans intervention manuelle.
        </p>
      </section>

      {/* ─── L'ÉLIGIBILITÉ STRUCTURÉE ──────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>L&apos;éligibilité structurée</h2>
        <p style={paragraphStyle}>
          Pour chaque appel, nous extrayons les critères d&apos;éligibilité
          explicites du règlement : résidence, nationalité, public visé
          (femmes, minorités de genre, sociétaires), conditions de carrière
          (premier projet, producteur attaché, expérience), âge limite
          quand il est précisé.
        </p>
        <p style={paragraphStyle}>
          Ces critères ne sont pas une opinion sur l&apos;opportunité. Ce
          sont les informations brutes du règlement, structurées pour
          pouvoir être croisées avec votre profil au moment de la lecture
          personnalisée.
        </p>
      </section>

      {/* ─── LA LECTURE PERSONNALISÉE ──────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>La lecture personnalisée</h2>
        <p style={paragraphStyle}>
          Quand vous composez une veille, vous remplissez un profil
          minimal : discipline, situation, géographie, mode de candidature.
          Ce profil est ensuite croisé avec les critères d&apos;éligibilité
          de chaque opportunité ouverte.
        </p>
        <p style={paragraphStyle}>
          Pour chacune, nous indiquons un niveau de lecture :{' '}
          <em>très adapté</em>, <em>possible à vérifier</em>,{' '}
          <em>exigeant pour votre situation</em>, ou{' '}
          <em>non retenu pour ce profil</em>. Ce n&apos;est pas un score
          sur 100. C&apos;est un avis fondé sur ce que dit le règlement.
          La décision finale vous appartient : vous postulez quand vous
          voulez, à ce que vous voulez.
        </p>
      </section>

      {/* ─── LA REVUE DE LA SEMAINE ────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>La revue de la semaine</h2>
        <p style={paragraphStyle}>
          Une fois par semaine, à l&apos;heure et au jour de votre choix,
          vous recevez un courriel avec les nouveautés du registre qui
          correspondent à votre veille. Pas de relance, pas de publicité,
          pas de tracker. Désabonnement en un clic, à tout moment.
        </p>
        <p style={paragraphStyle}>
          L&apos;aperçu de votre page{' '}
          <Link href="/aujourdhui" style={inlineLinkStyle}>
            Aujourd&apos;hui
          </Link>{' '}
          reste consultable dans votre espace, avec la même lecture
          personnalisée et les échéances à venir, sans dépendre de
          l&apos;envoi du courriel.
        </p>
      </section>

      {/* ─── L'INFRASTRUCTURE ──────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>L&apos;infrastructure</h2>
        <p style={paragraphStyle}>
          Encre est construit avec Next.js pour le site, Supabase pour la
          base de données (hébergée en France), Mistral pour la
          classification automatique, Resend pour l&apos;envoi des
          courriels. Tous les flux passent par des connexions chiffrées.
        </p>
        <p style={paragraphStyle}>
          Aucune donnée personnelle n&apos;est revendue, aucune
          n&apos;est exploitée pour autre chose que la veille elle-même.
          Le code est encore privé en phase pilote. Il sera publié en open
          source dès que la base est stabilisée, pour permettre
          vérification publique et reprise par d&apos;autres acteurs qui
          voudraient adapter le modèle.
        </p>
      </section>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '64px 24px 96px',
}

const mastheadStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--ink-rule)',
  paddingBottom: 18,
  marginBottom: 48,
}

const mastheadLineStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--vermillion)',
  marginBottom: 8,
}

const mastheadTaglineStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.02rem',
  fontStyle: 'italic',
  color: 'var(--ink-muted)',
  letterSpacing: '-0.005em',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(2.6rem, 5.4vw, 3.8rem)',
  fontWeight: 600,
  lineHeight: 1.05,
  letterSpacing: '-0.025em',
  color: 'var(--ink)',
  marginTop: 0,
  marginBottom: 22,
}

const chapeauStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'italic',
  fontSize: 'clamp(1.05rem, 1.5vw, 1.2rem)',
  lineHeight: 1.55,
  color: 'var(--ink-muted)',
  marginBottom: 64,
  letterSpacing: '-0.005em',
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 64,
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(1.5rem, 2.2vw, 1.85rem)',
  fontWeight: 600,
  lineHeight: 1.15,
  letterSpacing: '-0.015em',
  color: 'var(--ink)',
  marginBottom: 20,
  marginTop: 0,
}

const paragraphStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(1.05rem, 1.4vw, 1.15rem)',
  lineHeight: 1.7,
  color: 'var(--ink)',
  marginBottom: 22,
}

const inlineLinkStyle: React.CSSProperties = {
  color: 'var(--ink)',
  borderBottom: '1px solid var(--vermillion)',
  paddingBottom: 1,
  textDecoration: 'none',
}
