/**
 * Layout partagé pour les pages utilitaires (contact, mentions légales,
 * CGU, données personnelles). Format revue éditoriale, cohérent avec
 * la landing, le manifeste et la page À propos.
 *
 * Largeur 720px, bandeau eyebrow mono vermillon, h1 serif, prose-cream
 * pour les sections, numérotation en mono vermillon.
 */

export function LegalPage({
  slug,
  title,
  lastUpdate,
  children,
}: {
  slug: string
  title: string
  lastUpdate: string
  children: React.ReactNode
}) {
  return (
    <article style={pageStyle}>
      {/* ─── BANDEAU ─────────────────────────────────────── */}
      <header style={mastheadStyle}>
        <div style={mastheadLineStyle}>{slug}</div>
        <div style={mastheadTaglineStyle}>
          Dernière mise à jour : {lastUpdate}
        </div>
      </header>

      {/* ─── TITRE ───────────────────────────────────────── */}
      <h1 style={titleStyle}>
        {title}
      </h1>

      {/* ─── CORPS ───────────────────────────────────────── */}
      <div className="prose-cream" style={bodyStyle}>
        {children}
      </div>
    </article>
  )
}

export function LegalSection({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div style={sectionHeadStyle}>
        <span style={sectionNumberStyle}>{number}.</span>
        <h2 style={h2Style}>{title}</h2>
      </div>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
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
  fontFamily: 'var(--font-mono)',
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-soft)',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(2.6rem, 5.4vw, 3.8rem)',
  fontWeight: 600,
  lineHeight: 1.05,
  letterSpacing: '-0.025em',
  color: 'var(--ink)',
  marginTop: 0,
  marginBottom: 48,
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 48,
}

const sectionHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 14,
  marginBottom: 16,
}

const sectionNumberStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  color: 'var(--vermillion)',
  fontWeight: 500,
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(1.35rem, 1.9vw, 1.65rem)',
  fontWeight: 600,
  lineHeight: 1.15,
  letterSpacing: '-0.015em',
  color: 'var(--ink)',
  margin: 0,
}

const sectionBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}
