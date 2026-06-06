/**
 * Skeleton pour /aides — affiché pendant le fetch DB
 * (listOpportunities). Reflète le layout actuel : main full-width avec
 * recherche + barre de filtres horizontale Linear-style + list-head +
 * liste plate. Évite le layout shift à l'arrivée des données.
 */
export default function OpportunitesLoading() {
  return (
    <div className="opp-list-wrap">
      <main>
        {/* Search input */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: 14,
            padding: '12px 16px',
            border: '1px solid var(--ink-rule)',
            marginBottom: 28,
          }}
        >
          <SkeletonLine w="32px" h="11px" />
          <SkeletonLine w="60%" h="14px" />
          <SkeletonLine w="14px" h="14px" />
        </div>

        {/* Barre de filtres horizontale */}
        <div
          style={{
            position: 'relative',
            marginBottom: 28,
            paddingBottom: 14,
            borderBottom: '1px solid var(--ink-rule)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <SkeletonLine w="60px" h="11px" />
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonLine key={i} w="110px" h="22px" />
            ))}
          </div>
        </div>

        {/* List head */}
        <div style={{ paddingBottom: 24, marginBottom: 8, borderBottom: '2px solid var(--ink)' }}>
          <SkeletonLine w="35%" h="32px" className="mb-3" />
          <SkeletonLine w="22%" h="11px" />
        </div>

        {/* 6 rows */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="opp-row-link"
              style={{
                borderBottom: '1px solid var(--ink-rule)',
                display: 'grid',
                gridTemplateColumns: '56px 1fr 140px',
                gap: '12px 28px',
                alignItems: 'baseline',
                padding: '26px 0',
              }}
            >
              <SkeletonLine w="36px" h="11px" />
              <div>
                <SkeletonLine w="35%" h="11px" className="mb-3" />
                <SkeletonLine w="85%" h="22px" className="mb-3" />
                <SkeletonLine w="55%" h="14px" />
              </div>
              <div style={{ textAlign: 'right' }}>
                <SkeletonLine w="60%" h="14px" className="mb-2" style={{ marginLeft: 'auto' }} />
                <SkeletonLine w="40%" h="11px" style={{ marginLeft: 'auto' }} />
              </div>
            </li>
          ))}
        </ul>
      </main>

      <style>{`
        @keyframes encre-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}

function SkeletonLine({
  w,
  h,
  className = '',
  style = {},
}: {
  w: string
  h: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        width: w,
        height: h,
        background: 'rgba(28, 24, 23, 0.07)',
        borderRadius: 2,
        animation: 'encre-pulse 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}
