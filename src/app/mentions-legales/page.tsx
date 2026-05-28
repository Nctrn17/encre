import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/layout/LegalPage'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Éditeur, hébergement et responsabilités légales de Encre.',
  alternates: { canonical: '/mentions-legales' },
}

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      slug="I · Mentions légales"
      title="Mentions légales."
      lastUpdate="20 avril 2026"
    >
      <LegalSection number="1" title="Éditeur du site">
        <p>
          Encre est un projet en phase de pilote édité par une
          personne physique, en France. Les coordonnées complètes seront
          publiées au plus tard au passage en production publique.
        </p>
        <p className="italic" style={{ color: 'var(--muted-warm)' }}>
          En attendant, pour toute question contractuelle, légale ou presse :
          contact@encre.io (adresse provisoire).
        </p>
      </LegalSection>

      <LegalSection number="2" title="Hébergement">
        <p>
          Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133,
          Walnut, CA 91789, États-Unis. La base de données et
          l&apos;authentification sont hébergées par Supabase Inc., 970 Toa Payoh N,
          Singapour 318992.
        </p>
        <p>
          Les deux prestataires disposent d&apos;engagements contractuels de
          conformité RGPD et de transferts encadrés par des clauses contractuelles
          types de la Commission européenne.
        </p>
      </LegalSection>

      <LegalSection number="3" title="Directeur de publication">
        <p>
          Le directeur de la publication est l&apos;éditeur lui-même,
          jusqu&apos;à constitution d&apos;une entité juridique dédiée.
        </p>
      </LegalSection>

      <LegalSection number="4" title="Propriété intellectuelle">
        <p>
          Les éléments graphiques, typographiques et la structure éditoriale
          du site (charte Encre, typographies Source Serif 4, Inter Tight et
          JetBrains Mono) sont régis par les licences respectives de leurs
          auteurs.
        </p>
        <p>
          Les contenus informationnels publiés sur le site sont des reprises
          synthétisées d&apos;appels publics à candidatures émanant d&apos;organismes
          culturels français et européens. Chaque fiche redirige systématiquement
          vers la source officielle de l&apos;émetteur, seule faisant foi.
          Aucune donnée n&apos;est revendue.
        </p>
      </LegalSection>

      <LegalSection number="5" title="Responsabilité">
        <p>
          Les informations présentées sur Encre sont mises à jour
          quotidiennement depuis les pages publiques des émetteurs. Elles ont
          une valeur indicative. L&apos;éditeur ne garantit ni l&apos;exhaustivité,
          ni l&apos;actualité stricte, ni la conformité au règlement officiel
          de chaque dispositif.
        </p>
        <p>
          <strong
            style={{
              color: 'var(--kelp)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Avant toute candidature
          </strong>
          se référer impérativement au règlement publié sur le site officiel
          de l&apos;émetteur. Encre ne saurait être tenu responsable
          d&apos;une candidature rejetée ou hors délai du fait d&apos;une
          information partielle ou obsolète publiée sur ce site.
        </p>
      </LegalSection>

      <LegalSection number="6" title="Signalement d'un contenu">
        <p>
          Pour signaler une information incorrecte, obsolète ou manquante sur
          une fiche, ou pour demander le retrait d&apos;un lien vers votre
          dispositif : contact@encre.io. Nous traitons toute demande
          sous cinq jours ouvrés.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
