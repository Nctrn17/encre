import type { Metadata } from 'next'
import { ConnexionForm } from './ConnexionForm'

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous pour gérer vos alertes et vos favoris.',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

export default async function ConnexionPage({ searchParams }: PageProps) {
  const params = await searchParams

  return (
    <div className="connexion-wrap">
      <div style={eyebrowStyle}>Encre · connexion</div>

      {params.error && (
        <div style={errorStyle}>
          Lien invalide ou expiré. Demandez-en un nouveau.
        </div>
      )}

      <ConnexionForm next={params.next ?? '/aides'} />
    </div>
  )
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--vermillion)',
  marginBottom: 36,
  fontWeight: 500,
}

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.04em',
  color: 'var(--vermillion)',
  border: '1px solid var(--vermillion)',
  padding: '10px 14px',
  marginBottom: 28,
  background: 'transparent',
}
