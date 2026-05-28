import { ImageResponse } from 'next/og'

/**
 * Apple touch icon - wordmark Encre, 180x180, paper background.
 */

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontSize: 132,
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
