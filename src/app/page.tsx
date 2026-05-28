import Link from 'next/link'
import type { Metadata } from 'next'
import { WaitlistForm } from '@/components/forms/WaitlistForm'
import { listOpportunities } from '@/features/opportunities/queries'
import { PILOT_SCENARISTE_TAGS, LISTING_DEFAULT_EXCLUDE_TAGS } from '@/lib/pilot-defaults'

/**
 * Encre · première page de revue.
 *
 * Structure : Bandeau de numéro · Titre · Chapeau · Édito · Signature ·
 * Ce mois-ci · À l'intérieur · S'abonner à la lettre.
 *
 * Texte du brouillon N° 1 (mai 2026). À réécrire en édition.
 * Le Header et Footer sont fournis par layout.tsx.
 */

// Rendu dynamique : le compteur d'aides ouvertes est lu en live à chaque
// requête. Évite la divergence ISR entre la landing et /aides (chaque page
// se régénérant indépendamment, elles affichaient des totaux différents).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    absolute: "Encre · La revue des aides à l'écriture",
  },
  description:
    "Résidences, bourses, prix et aides à l'écriture pour scénaristes et auteurs. Tous métiers de l'écriture, toutes régions. Sans publicité, sans rétention.",
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  // Mêmes filtres que /aides pour que le compteur reflète exactement ce que
  // l'utilisateur verra en cliquant (cf. LISTING_DEFAULT_EXCLUDE_TAGS).
  const { total } = await listOpportunities({
    limit: 1,
    offset: 0,
    disciplinesTagsAny: [...PILOT_SCENARISTE_TAGS],
    disciplinesTagsExclude: [...LISTING_DEFAULT_EXCLUDE_TAGS],
  })

  return (
    <article style={pageStyle}>
      {/* ─── BANDEAU DE NUMÉRO ─────────────────────────────── */}
      <header style={mastheadStyle}>
        <div style={mastheadLineStyle}>Encre · N° 1 · Mai 2026</div>
        <div style={mastheadTaglineStyle}>
          La revue qui rend publiques les aides à la création.
        </div>
      </header>

      {/* ─── TITRE ─────────────────────────────────────────── */}
      <h1 style={titleStyle}>Tenir un registre.</h1>

      {/* ─── ÉDITO ─────────────────────────────────────────── */}
      <p style={paragraphStyle}>
        <span style={dropCapStyle}>C</span>ombien de jeunes scénaristes savent
        que leur écriture peut être financée, même avant leur premier film ?
        Parmi eux, combien connaissent toutes les aides qui existent, avec
        toutes les conditions, les deadlines, et les détails ?
      </p>

      <p style={paragraphStyle}>
        Tout le monde n&apos;est pas passé par la Fémis ou n&apos;a pas un
        oncle producteur. Alors, depuis mai 2026, nous tenons le registre.
        Nous parcourons chaque jour les pages des organismes qui financent
        l&apos;écriture, l&apos;image et le son, et regroupons tout ici.
        L&apos;intégralité de ce qui est ouvert à candidature est listée. Pas
        de groupe privé, pas de rétention d&apos;informations.
      </p>

      <p style={paragraphStyle}>
        Mais simplement lister ne suffit pas, nous lisons chaque opportunité à
        vos côtés. Votre veille est personnalisée et vous permet de viser
        juste.
      </p>

      <p style={paragraphStyle}>
        Écrire est déjà assez compliqué, on garde l&apos;œil sur le reste pour
        vous.
      </p>

      {/* ─── SIGNATURE ─────────────────────────────────────── */}
      <p style={signatureStyle}>La rédaction. Le 15 mai 2026.</p>

      {/* ─── ORNEMENT DE FIN D'ARTICLE ─────────────────────── */}
      <div style={ornamentStyle} aria-hidden="true" />

      {/* ─── CE MOIS-CI ────────────────────────────────────── */}
      <section style={monthlySectionStyle}>
        <div style={eyebrowStyle}>Ce mois-ci</div>
        <p style={monthlyParagraphStyle}>
          Le registre liste {total} aides ouvertes à candidature. Ouvertures
          notables : la bourse Doha Film Institute pour les cinéastes des pays
          du Sud (clôture fin juin), la Bourse Émergence (clôture mi-juin).
        </p>
      </section>

      {/* ─── À L'INTÉRIEUR ─────────────────────────────────── */}
      <section style={insideSectionStyle}>
        <div style={shortRuleStyle} aria-hidden="true" />
        <div style={eyebrowStyle}>À l&apos;intérieur</div>
        <ul style={insideListStyle}>
          <li style={insideItemStyle}>
            <Link href="/aides" style={insideLinkStyle}>
              <em>Le registre du mois</em> · {total} aides ouvertes à
              candidature. →
            </Link>
          </li>
          <li style={insideItemStyle}>
            <Link href="/onboarding" style={insideLinkStyle}>
              <em>Composer ma veille</em> · pour suivre uniquement ce qui vous
              concerne. →
            </Link>
          </li>
          <li style={insideItemStyle}>
            <a href="#recevoir" style={insideLinkStyle}>
              <em>La revue de la semaine</em> · un courriel hebdomadaire
              personnalisable. →
            </a>
          </li>
        </ul>
      </section>

      {/* ─── S'ABONNER À LA LETTRE ─────────────────────────── */}
      <section id="recevoir" style={waitlistSectionStyle}>
        <div style={eyebrowStyle}>S&apos;abonner à la revue de la semaine</div>
        <p style={waitlistDescStyle}>
          Un courriel hebdomadaire avec les nouveautés du registre, et un
          aperçu de ce qui ferme dans la semaine. Pas de relance, pas de
          publicité, désabonnement en un clic.
        </p>
        <WaitlistForm />
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
  marginBottom: 28,
  marginTop: 0,
}

const chapeauStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(1.1rem, 1.65vw, 1.28rem)',
  lineHeight: 1.55,
  fontWeight: 600,
  color: 'var(--ink)',
  marginBottom: 52,
  letterSpacing: '-0.005em',
}

const paragraphStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(1.05rem, 1.4vw, 1.15rem)',
  lineHeight: 1.7,
  color: 'var(--ink)',
  marginBottom: 22,
}

const dropCapStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '4.4rem',
  fontWeight: 600,
  lineHeight: 0.82,
  color: 'var(--vermillion)',
  float: 'left',
  marginRight: 10,
  marginTop: 4,
  paddingTop: 4,
}

const signatureStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'italic',
  fontSize: '1.02rem',
  color: 'var(--ink-muted)',
  marginTop: 40,
  marginBottom: 36,
}

const ornamentStyle: React.CSSProperties = {
  width: 80,
  height: 1,
  background: 'var(--vermillion)',
  margin: '0 auto 56px',
}

const monthlySectionStyle: React.CSSProperties = {
  marginBottom: 72,
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--vermillion)',
  marginBottom: 16,
  fontWeight: 500,
}

const monthlyParagraphStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.06rem',
  lineHeight: 1.62,
  color: 'var(--ink)',
  margin: 0,
}

const insideSectionStyle: React.CSSProperties = {
  marginBottom: 80,
}

const shortRuleStyle: React.CSSProperties = {
  width: 60,
  height: 2,
  background: 'var(--vermillion)',
  marginBottom: 20,
}

const insideListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
}

const insideItemStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.06rem',
  lineHeight: 1.5,
  marginBottom: 14,
}

const insideLinkStyle: React.CSSProperties = {
  color: 'var(--ink)',
  textDecoration: 'none',
  borderBottom: '1px solid var(--ink-rule)',
  paddingBottom: 1,
  transition: 'border-color 160ms var(--ease-out), color 160ms var(--ease-out)',
}

const waitlistSectionStyle: React.CSSProperties = {
  paddingTop: 32,
  borderTop: '2px solid var(--ink-rule)',
  scrollMarginTop: '120px',
}

const waitlistDescStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1rem',
  lineHeight: 1.6,
  color: 'var(--ink-muted)',
  marginBottom: 22,
  maxWidth: '56ch',
}
