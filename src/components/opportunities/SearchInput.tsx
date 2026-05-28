'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Props {
  initialQuery: string
}

const DEBOUNCE_MS = 300

/**
 * Recherche libre /aides.
 *
 * URL-piloted (?q=) avec debounce, replace plutôt que push pour ne pas
 * polluer l'historique. Re-sync sur changement externe (back/forward,
 * "tout effacer"). Esc vide, Enter flush immédiat.
 */
export function OpportunitySearchInput({ initialQuery }: Props) {
  const router = useRouter()
  const pathname = usePathname() ?? '/aides'
  const searchParams = useSearchParams()

  const [value, setValue] = useState(initialQuery)
  const [focused, setFocused] = useState(false)
  const skipNextSync = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    setValue(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function pushQuery(next: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.delete('page')
    const trimmed = next.trim()
    if (trimmed) params.set('q', trimmed)
    else params.delete('q')
    const qs = params.toString()
    skipNextSync.current = true
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushQuery(next), DEBOUNCE_MS)
  }

  function onClear() {
    setValue('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pushQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && value) {
      e.preventDefault()
      onClear()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      pushQuery(value)
    }
  }

  return (
    <div
      style={{
        ...wrapStyle,
        borderColor: focused ? 'var(--vermillion)' : 'var(--ink-rule)',
      }}
      className="opp-search"
    >
      <span aria-hidden="true" style={labelStyle}>
        Rech.
      </span>
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Titre, émetteur, mots-clés"
        aria-label="Rechercher dans les opportunités"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={inputStyle}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Effacer la recherche"
          className="opp-search-clear"
          style={clearStyle}
        >
          ×
        </button>
      )}
    </div>
  )
}

const wrapStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: 14,
  padding: '12px 16px',
  border: '1px solid var(--ink-rule)',
  marginBottom: 28,
  background: 'transparent',
  transition: 'border-color 160ms var(--ease-out)',
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-soft)',
  userSelect: 'none',
}

const inputStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  // WCAG 2.4.7 : pas d'outline:none ici. Le :focus-visible global (vermillion)
  // s'applique au clavier sans masquer l'indicateur de focus.
  background: 'transparent',
  fontFamily: 'var(--font-serif)',
  fontSize: '1rem',
  lineHeight: 1.4,
  color: 'var(--ink)',
  padding: 0,
  appearance: 'none',
  WebkitAppearance: 'none',
}

const clearStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: '1.25rem',
  lineHeight: 1,
  color: 'var(--ink-soft)',
  padding: '6px 10px',
  margin: '-6px -10px',
  transition: 'transform 160ms var(--ease-out), color 140ms ease',
}
