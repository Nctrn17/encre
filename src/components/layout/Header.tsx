import Link from 'next/link'
import { NavLinks } from './NavLinks'

/**
 * Masthead Encre · style revue éditoriale.
 *
 * Rendu côté serveur (RSC). Seule la nav avec état actif (`usePathname`) est
 * isolée dans `<NavLinks>` (Client Component). Ce split évite que la frontière
 * client remonte jusqu'au layout global, ce qui dégraderait le TTI sur toutes
 * les pages.
 */
export function Header() {
  return (
    <header className="band-paper">
      <div
        className="max-w-[1640px] mx-auto px-6 sm:px-12 pt-8 pb-6 flex items-baseline justify-between gap-8 flex-wrap"
        style={{ borderBottom: '1px solid var(--ink-rule)' }}
      >
        <Link
          href="/"
          className="serif text-[26px] tracking-tight"
          style={{ fontWeight: 600, letterSpacing: '-0.012em', color: 'var(--ink)' }}
        >
          Encre<span style={{ color: 'var(--vermillion)' }}>.</span>
        </Link>
        <NavLinks />
      </div>
    </header>
  )
}
