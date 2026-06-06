'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/features/auth/actions'
import { createClient } from '@/lib/supabase/client'

/**
 * Lien actif vermillon, autres en ink-muted. Isolé en Client Component pour
 * laisser le `Header` parent en RSC pur — sans cela, la frontière `"use
 * client"` remonterait jusqu'au layout global et coûterait du TTI sur toutes
 * les routes.
 */

const NAV_LINKS: Array<{ href: string; label: string; activePrefixes: string[] }> = [
  { href: '/aujourdhui', label: "Aujourd'hui", activePrefixes: ['/aujourdhui'] },
  {
    href: '/aides',
    label: 'Registre',
    activePrefixes: ['/aides'],
  },
  {
    href: '/mes-alertes',
    label: 'Mes alertes',
    activePrefixes: ['/onboarding', '/mes-alertes'],
  },
]

function isActiveLink(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function NavLinks() {
  const pathname = usePathname() ?? '/'
  const connexionActive =
    pathname === '/connexion' || pathname.startsWith('/connexion/')

  // État d'auth lu côté client : garder cette lecture hors du root layout
  // serveur permet aux pages publiques de rester statiques/ISR (edge-cachées).
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsLoggedIn(Boolean(data.session))
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session))
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <nav className="flex items-baseline gap-5 sm:gap-10 mono flex-wrap">
      {NAV_LINKS.map((link) => {
        const active = isActiveLink(pathname, link.activePrefixes)
        return (
          <Link
            key={link.href}
            href={link.href}
            className="link"
            style={{
              color: active ? 'var(--vermillion)' : 'var(--ink-muted)',
              ...(active ? { backgroundSize: '100% 1.5px' } : {}),
            }}
          >
            {link.label}
          </Link>
        )
      })}

      {isLoggedIn ? (
        <form action={signOut} style={{ display: 'inline' }}>
          <button type="submit" className="link" style={authButtonStyle}>
            Se déconnecter
          </button>
        </form>
      ) : (
        <Link
          href="/connexion"
          className="link"
          style={{
            color: connexionActive ? 'var(--vermillion)' : 'var(--ink-muted)',
            ...(connexionActive ? { backgroundSize: '100% 1.5px' } : {}),
          }}
        >
          Se connecter
        </Link>
      )}
    </nav>
  )
}

const authButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  letterSpacing: 'inherit',
  textTransform: 'inherit',
  color: 'var(--ink-muted)',
}
