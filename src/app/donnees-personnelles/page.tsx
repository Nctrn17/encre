import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/layout/LegalPage'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Données personnelles',
  description:
    'Politique de confidentialité d’Encre : RGPD, données collectées, droits des utilisateurs.',
  alternates: { canonical: '/donnees-personnelles' },
}

export default function DonneesPersonnellesPage() {
  return (
    <LegalPage
      slug="III · Politique de confidentialité"
      title="Données personnelles."
      lastUpdate="18 mai 2026"
    >
      <LegalSection number="1" title="Responsable de traitement">
        <p>
          Le responsable du traitement est l&apos;éditeur d&apos;Encre,
          joignable à contact@encre.io. Aucun sous-traitant
          marketing n&apos;intervient sur les données personnelles collectées.
        </p>
      </LegalSection>

      <LegalSection number="2" title="Données collectées">
        <p>
          Seules les données strictement nécessaires à la veille sont collectées :
        </p>
        <ul className="space-y-2 list-none pl-0 mt-4">
          {[
            { k: 'Adresse email', v: 'requise pour l’envoi du digest' },
            { k: 'Disciplines, régions et préférences de cadence', v: 'renseignées volontairement au moment de la création de veille' },
            { k: 'Historique d’envoi des digests', v: 'pour éviter les doublons' },
            { k: 'Requêtes de recherche anonymes', v: 'pour comprendre les besoins non couverts, sans identifiant utilisateur, adresse IP ni cookie' },
            { k: 'Logs techniques (adresse IP anonymisée, horodatage)', v: 'conservés 30 jours à des fins de sécurité' },
          ].map((item, i) => (
            <li key={i} className="pl-6 relative">
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  color: 'var(--vermillion)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                }}
              >
                {String(i + 1).padStart(2, '0')}.
              </span>
              <strong>{item.k}</strong> : {item.v}.
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection number="3" title="Ce qui n’est PAS collecté">
        <p>
          Encre n&apos;utilise ni Google Analytics, ni pixel Facebook,
          ni Hotjar, ni aucun tracker publicitaire. Aucun cookie, ni de
          première ni de tierce partie. La seule mesure d&apos;audience est
          une statistique de fréquentation agrégée et sans cookie (Vercel
          Web Analytics) : nombre de pages vues, pays, type d&apos;appareil,
          site d&apos;origine. Elle n&apos;enregistre aucune adresse IP, ne
          pose aucun identifiant persistant et ne permet de suivre personne
          d&apos;une visite à l&apos;autre ni d&apos;un site à l&apos;autre.
          Pas de profilage commercial. Pas de revente d&apos;adresses à des
          tiers, sous aucune forme, ni directe ni indirecte.
        </p>
      </LegalSection>

      <LegalSection number="4" title="Base légale">
        <p>
          Le traitement repose sur le consentement explicite donné par
          l&apos;utilisateur·rice lors de la création de veille (article 6.1.a
          du RGPD), et sur l&apos;exécution du contrat de service pour les
          envois de digest (article 6.1.b).
        </p>
      </LegalSection>

      <LegalSection number="5" title="Durée de conservation">
        <p>
          Les données de profil sont conservées tant que la veille est active.
          En cas d&apos;inactivité prolongée (aucun email ouvert pendant 12
          mois consécutifs), le profil est automatiquement désactivé, et les
          données anonymisées puis supprimées dans un délai de 90 jours.
        </p>
        <p>
          Une désinscription manuelle (lien présent dans chaque digest) entraîne
          la suppression définitive du profil sous 48 heures.
        </p>
      </LegalSection>

      <LegalSection number="6" title="Vos droits">
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès,
          de rectification, d&apos;effacement, de portabilité, de limitation
          et d&apos;opposition sur vos données. Pour exercer ces droits, une
          simple demande à contact@encre.io suffit. Nous traitons
          chaque demande sous 30 jours calendaires.
        </p>
        <p>
          Vous pouvez également introduire une réclamation auprès de la CNIL
          (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="link" style={{ color: 'var(--vermillion)' }}>cnil.fr</a>)
          si vous estimez que vos droits ne sont pas respectés.
        </p>
      </LegalSection>

      <LegalSection number="7" title="Transferts hors UE">
        <p>
          Les infrastructures Vercel (hébergement web) et Supabase (base de
          données, située en UE) peuvent impliquer des transferts techniques
          ponctuels vers les États-Unis. Ces transferts sont encadrés par les
          clauses contractuelles types de la Commission européenne, garantissant
          un niveau de protection équivalent au RGPD.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
