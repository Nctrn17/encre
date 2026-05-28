import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/layout/LegalPage'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Nous écrire pour signaler une erreur, proposer une source, ou poser une question.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact · Encre',
    description: 'Signaler une erreur, proposer une source, poser une question.',
    type: 'website',
    url: '/contact',
  },
}

export default function ContactPage() {
  return (
    <LegalPage
      slug="IV · Contact"
      title="Nous écrire."
      lastUpdate="20 avril 2026"
    >
      <LegalSection number="1" title="Une question, une remarque, une correction">
        <p>
          Encre est un projet en construction, porté par une personne.
          Chaque retour est lu attentivement et a une influence directe sur la
          suite du développement.
        </p>
        <p>
          Pour toute demande (signalement d&apos;une erreur, proposition d&apos;une
          source à intégrer, question produit, presse, candidature spontanée),
          une seule adresse :
        </p>
        <div
          className="mt-6 py-4"
          style={{ borderTop: '1px solid rgba(26,9,6,0.15)', borderBottom: '1px solid rgba(26,9,6,0.15)' }}
        >
          <a
            href="mailto:contact@encre.io"
            className="fraunces link"
            style={{
              fontSize: 28,
              color: 'var(--vermillion)',
              fontStyle: 'italic',
              fontVariationSettings: "'opsz' 144, 'SOFT' 80",
            }}
          >
            contact@encre.io
          </a>
          <div
            className="mono-meta mt-3"
            style={{ color: 'var(--muted-warm)' }}
          >
            Adresse provisoire jusqu&apos;au passage en production publique.
          </div>
        </div>
      </LegalSection>

      <LegalSection number="2" title="Délais de réponse">
        <p>
          Nous répondons sous cinq jours ouvrés maximum. Les signalements de
          fiche erronée ou obsolète sont traités en priorité (correction
          visible sur le site dans les 24 à 48 heures).
        </p>
      </LegalSection>

      <LegalSection number="3" title="Vous êtes un émetteur d'appel">
        <p>
          Si votre organisme n&apos;est pas référencé et que vous souhaitez
          l&apos;être, indiquez-le simplement par courriel. Aucune
          contrepartie, aucune facturation, aucun référencement payant.
        </p>
        <p>
          Pour signaler qu&apos;un appel comporte une erreur, est désormais
          clos, ou doit être corrigé, écrivez-nous : la mise à jour sera
          faite dans les 24 à 48 heures.
        </p>
        <p>
          Encre ne fonctionne ni sur la publicité ni sur la mise en avant
          payante. Le classement éditorial est neutre et aligné sur
          l&apos;échéance croissante.
        </p>
      </LegalSection>

      <LegalSection number="4" title="Presse, recherche, partenariats">
        <p>
          Pour une interview, un article, une contribution à un travail
          universitaire sur l&apos;accès aux aides culturelles, ou une
          proposition de partenariat non commercial : même adresse,
          réponse rapide.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
