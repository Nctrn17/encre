import { ImageResponse } from 'next/og'

/**
 * OG image dynamique Encre · générée par Next.js au build/runtime.
 * Affichée sur LinkedIn, X/Twitter, Discord, etc. quand on partage le site.
 *
 * Taille OG standard : 1200x630. Design sobre pour respecter le ton éditorial
 * (pas d'emoji, pas de gradient fluo). System fonts serif pour rester simple :
 * Source Serif 4 variable n'est pas embarquée ici, fallback Georgia.
 */

export const runtime = 'edge'
export const alt = "Encre · Aides à l'écriture pour scénaristes et auteurs"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PAPER = '#f4ede0'
const INK = '#1c1817'
const VERMILLION = '#c8362b'
const INK_SOFT = '#8a7d72'
const KELP = '#7a6a2c'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: PAPER,
          color: INK,
          display: 'flex',
          flexDirection: 'column',
          padding: '80px',
          position: 'relative',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Crop marks · décoratif, style épreuve d'imprimeur */}
        <div style={{ position: 'absolute', top: 40, left: 40, width: 20, height: 20 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 20, background: VERMILLION }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 1, background: VERMILLION }} />
        </div>
        <div style={{ position: 'absolute', top: 40, right: 40, width: 20, height: 20 }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 1, height: 20, background: VERMILLION }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 1, background: VERMILLION }} />
        </div>
        <div style={{ position: 'absolute', bottom: 40, left: 40, width: 20, height: 20 }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 20, background: VERMILLION }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 1, background: VERMILLION }} />
        </div>
        <div style={{ position: 'absolute', bottom: 40, right: 40, width: 20, height: 20 }}>
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 20, background: VERMILLION }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 1, background: VERMILLION }} />
        </div>

        {/* Slug */}
        <div
          style={{
            fontSize: 18,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: VERMILLION,
            fontFamily: 'monospace',
          }}
        >
          Encre · Aides à l&apos;écriture · Scénaristes et auteurs
        </div>

        {/* Titre principal */}
        <div
          style={{
            fontSize: 112,
            lineHeight: 1.02,
            fontWeight: 500,
            letterSpacing: '-0.025em',
            marginTop: 60,
            marginBottom: 40,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>Les aides qui, d&apos;habitude,</span>
          <span style={{ fontStyle: 'italic' }}>
            circulent en bouche-à-oreille.
          </span>
        </div>

        {/* Baseline */}
        <div
          style={{
            fontSize: 28,
            fontStyle: 'italic',
            color: INK_SOFT,
            lineHeight: 1.4,
            maxWidth: 900,
          }}
        >
          Pour scénaristes, auteurs-réalisateurs, auteurs documentaires
          et auteurs littéraires hors-réseau.
        </div>

        {/* Footer mono */}
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 80,
            right: 80,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingTop: 24,
            borderTop: `1px solid ${VERMILLION}`,
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: INK,
              letterSpacing: '-0.01em',
            }}
          >
            Encre<span style={{ color: VERMILLION }}>.</span>
          </div>
          <div
            style={{
              fontSize: 14,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: KELP,
              fontFamily: 'monospace',
            }}
          >
            encre · n° 1
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
