'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'

/**
 * Lien « Retour aux appels en cours » de la fiche détail.
 *
 * Bug fix : auparavant un <Link href="/aides"> en dur, qui
 * jetait toute la query string (page, filtres, recherche) au retour.
 * Maintenant : si l'utilisateur vient de la liste (referrer interne),
 * on fait router.back() pour préserver page+filtres+scroll position.
 * Fallback : navigation vers /aides si on arrive en direct
 * (partage de lien, Google, lien externe).
 *
 * Approche : on rend toujours un <a> pour que le clic droit / cmd-clic
 * fonctionne normalement (ouvrir dans nouvel onglet), mais on
 * intercepte le clic gauche simple pour décider entre back() et push().
 */
export function BackToList({
  label,
  style,
  className,
}: {
  label: string
  style?: CSSProperties
  className?: string
}) {
  const router = useRouter()

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Laisser passer les clics avec modificateur (ouvrir nouvel onglet, etc.)
    if (
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return
    }

    // On préserve l'historique uniquement si on vient bien de la liste.
    // document.referrer pointe vers la page de provenance dans la même
    // session de navigation ; en App Router avec navigations clients,
    // referrer reflète bien la dernière URL navigée.
    if (typeof document !== 'undefined') {
      const ref = document.referrer
      const sameOrigin = ref.startsWith(window.location.origin)
      const fromList = sameOrigin && /\/aides(\?|$)/.test(new URL(ref).pathname + new URL(ref).search)
      if (fromList) {
        e.preventDefault()
        router.back()
        return
      }
    }
    // Sinon, on laisse le <Link> faire son navigateur classique vers /aides.
  }

  return (
    <Link
      href="/aides"
      onClick={onClick}
      className={className}
      style={style}
    >
      {label}
    </Link>
  )
}
