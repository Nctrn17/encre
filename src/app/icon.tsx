import { ImageResponse } from 'next/og'

/**
 * Favicon dynamique - wordmark Encre miniature.
 * Charcoal "E" sur fond paper, point vermillon.
 */

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#f4ede0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1c1817',
          fontSize: 24,
          fontWeight: 700,
          fontFamily: 'Georgia, serif',
          letterSpacing: '-0.04em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline' }}>
          E<span style={{ color: '#c8362b' }}>.</span>
        </span>
      </div>
    ),
    { ...size },
  )
}
