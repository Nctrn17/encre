import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/layout/LegalPage'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Conditions générales d’utilisation',
  description:
    'Règles d’utilisation du service Encre : agrégation éditoriale d’aides à l’écriture audiovisuelle.',
  alternates: { canonical: '/cgu' },
}

export default function CguPage() {
  return (
    <LegalPage
      slug="II · Conditions générales d’utilisation"
      title="Conditions d’utilisation."
      lastUpdate="20 avril 2026"
    >
      <LegalSection number="1" title="Objet">
        <p>
          Encre est un service éditorial qui agrège et synthétise des
          appels à candidatures publiques (bourses, résidences, prix, fonds)
          à destination des auteur·rices d&apos;œuvres audiovisuelles résidant
          en France.
        </p>
        <p>
          Le service est proposé gratuitement, en accès libre. Aucune
          contribution financière n&apos;est demandée à l&apos;utilisateur·rice.
        </p>
      </LegalSection>

      <LegalSection number="2" title="Usage autorisé">
        <p>
          L&apos;utilisateur·rice peut consulter le catalogue, créer une veille
          personnelle, recevoir un digest périodique, et partager les fiches
          dans un cadre personnel ou professionnel. La reprise intégrale ou
          massive du catalogue à des fins commerciales n&apos;est pas autorisée
          sans accord préalable écrit de l&apos;éditeur.
        </p>
      </LegalSection>

      <LegalSection number="3" title="Compte utilisateur et veille">
        <p>
          La création d&apos;une veille nécessite la fourniture d&apos;une
          adresse email. Un lien de confirmation est envoyé avant la mise en
          service. L&apos;utilisateur·rice peut modifier ou supprimer son
          profil à tout moment, depuis son espace personnel ou par simple
          courriel à contact@encre.io.
        </p>
        <p>
          Chaque digest comporte un lien de désinscription en un clic.
        </p>
      </LegalSection>

      <LegalSection number="4" title="Qualité et actualité des informations">
        <p>
          Les fiches sont issues de pages publiques d&apos;organismes émetteurs
          (CNC, GREC, SCAM, SACD, Sopadin, agences régionales, etc.).
          Elles sont actualisées quotidiennement par des routines automatiques.
        </p>
        <p>
          L&apos;éditeur ne garantit ni l&apos;exhaustivité ni la conformité
          stricte au règlement officiel de chaque dispositif. Avant toute
          candidature, l&apos;utilisateur·rice est tenu·e de consulter la
          source officielle de l&apos;émetteur, lien toujours mis en avant
          dans chaque fiche.
        </p>
      </LegalSection>

      <LegalSection number="5" title="Responsabilité">
        <p>
          Encre fournit une information synthétique à titre indicatif.
          Le service ne peut être tenu responsable :
        </p>
        <ul className="space-y-2 list-none pl-0 mt-4">
          {[
            'des candidatures rejetées, hors délai, incomplètes ou non conformes ;',
            'des décisions prises par les jurys et commissions de sélection ;',
            'de la modification ou de l\'interruption d\'un dispositif par son émetteur ;',
            'des dommages indirects résultant de l\'usage du service.',
          ].map((t, i) => (
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
              {t}
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection number="6" title="Modifications des CGU">
        <p>
          Les présentes conditions peuvent évoluer, notamment lors du passage
          à la version publique du service. Les utilisateurs inscrits à la
          veille seront informés par courriel de toute modification substantielle,
          avec un délai minimum de quinze jours avant application.
        </p>
      </LegalSection>

      <LegalSection number="7" title="Droit applicable">
        <p>
          Les présentes conditions sont soumises au droit français. Tout litige
          relève de la compétence des tribunaux français, sans préjudice des
          règles protectrices applicables aux consommateurs.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
