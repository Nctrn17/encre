import Link from 'next/link'
import { requireAdmin, RestrictedAccessError } from '@/lib/auth/require-admin'
import {
  getBetaCurationExclusionReason,
  getCurationQueues,
  type CurationOpp,
} from '@/features/curation/queues'
import { CurationCard } from './CurationCard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Curation · Encre admin',
  robots: { index: false, follow: false },
}

export default async function CurationPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; scope?: string }>
}) {
  try {
    await requireAdmin('/admin/curation')
  } catch (e) {
    if (e instanceof RestrictedAccessError) return <AccessDenied />
    throw e
  }

  const params = await searchParams
  const scope = params.scope === 'all' ? 'all' : 'beta'
  const queues = await getCurationQueues({ scope })
  const focusId = params.focus
  const workQueue = buildWorkQueue(queues)

  return (
    <div style={wrapStyle}>
      <header style={headerStyle}>
        <div style={eyebrowStyle}>Encre · admin</div>
        <h1 style={h1Style}>Curation</h1>
        <p style={subStyle}>
          Files générées au {new Date(queues.generatedAt).toLocaleString('fr-FR')}.
          Édite chaque opp en place ; les changements sont sauvegardés en DB
          et pris en compte par le prochain rendu de <code>/aides</code>.
        </p>
      </header>

      <section style={routineStyle}>
        <h2 style={routineTitleStyle}>Routine simple</h2>
        <ol style={routineListStyle}>
          <li>Ouvrir cette file unique.</li>
          <li>Pour chaque carte : corriger les sections, ou choisir une action rapide.</li>
          <li>Ne laisser publié que ce qui est complet, fiable, ou explicitement en attente de prochaine édition.</li>
        </ol>
        <div style={scopeSwitchStyle}>
          <Link href="/admin/curation" style={scope === 'beta' ? scopeSwitchActiveStyle : scopeSwitchLinkStyle}>
            Mode beta
          </Link>
          <Link href="/admin/curation?scope=all" style={scope === 'all' ? scopeSwitchActiveStyle : scopeSwitchLinkStyle}>
            Tout voir
          </Link>
        </div>
        {queues.hiddenByBetaScope.length > 0 && (
          <p style={scopeNoteStyle}>
            {queues.hiddenByBetaScope.length} opp{queues.hiddenByBetaScope.length === 1 ? '' : 's'} masquee{queues.hiddenByBetaScope.length === 1 ? '' : 's'} par le filtre beta :
            aides producteur, pays du Sud, non-scenariste, ou bruit institutionnel CNL / Ministere.
          </p>
        )}
      </section>

      <QueueSection
        title="À traiter maintenant"
        accent="vermillion"
        description="File unique priorisée : extraction partielle, revue humaine, expirées, attente prochaine édition, éligibilité sensible, puis nouveautés. Les doublons sont masqués."
        items={workQueue}
        focusId={focusId}
      />

      {scope === 'beta' && (
        <QueueSection
          title="Masquees par le filtre beta"
          accent="kelp"
          description="Diagnostic seulement : ces opps restent en base et redeviennent visibles avec Tout voir. La raison affichee explique le signal de bruit."
          items={queues.hiddenByBetaScope.map((opp) => ({
            opp,
            reason: getBetaCurationExclusionReason(opp) ?? 'Masquee par le filtre beta.',
          }))}
          focusId={focusId}
        />
      )}

      <QueueSection
        title="À valider"
        accent="vermillion"
        description="Opps bloquées avant diffusion. Une sauvegarde depuis cette page vaut validation humaine et les rend éligibles au digest si elles restent publiées."
        items={queues.humanReview.map((opp) => ({ opp }))}
        focusId={focusId}
      />

      <QueueSection
        title="Awaiting details"
        accent="vermillion"
        description="Opps flaggées en attente d'annonce de la prochaine édition. À re-vérifier auprès de la source pour voir si du nouveau."
        items={queues.awaitingDetails.map((opp) => ({ opp }))}
        focusId={focusId}
      />

      <QueueSection
        title="Extraction partielle"
        accent="ink"
        description="Opps publiées avec au moins une dimension vide. Curation manuelle ou re-enrich ciblé."
        items={queues.partialExtraction.map((opp) => ({ opp }))}
        focusId={focusId}
      />

      <QueueSection
        title="Expirées"
        accent="kelp"
        description="Deadline passée mais l'opp est encore publiée. Désindexer ou flagger awaiting_details si nouveau cycle à venir."
        items={queues.expired.map((opp) => ({ opp }))}
        focusId={focusId}
      />

      <QueueSection
        title="Nouvelles cette semaine"
        accent="ink"
        description="Sanity check : les nouvelles opps publiées dans les 7 derniers jours."
        items={queues.newThisWeek.map((opp) => ({ opp }))}
        focusId={focusId}
      />

      <QueueSection
        title="Éligibilité à vérifier"
        accent="vermillion"
        description="Opps qui contiennent un signal d’éligibilité sensible, mais dont le profil structuré ne dit encore rien. À corriger avant de laisser le matching décider seul."
        items={queues.eligibilityReview.map((opp) => ({ opp }))}
        focusId={focusId}
      />

      <footer style={footerStyle}>
        <Link href="/admin" style={footerLinkStyle}>
          ← Retour au tableau de bord admin
        </Link>
      </footer>
    </div>
  )
}

function QueueSection({
  title,
  description,
  items,
  accent,
  focusId,
}: {
  title: string
  description: string
  items: CurationWorkItem[]
  accent: 'ink' | 'vermillion' | 'kelp'
  focusId: string | undefined
}) {
  const accentColor =
    accent === 'vermillion' ? 'var(--vermillion)' : accent === 'kelp' ? 'var(--kelp)' : 'var(--ink)'

  return (
    <section style={sectionStyle}>
      <div style={sectionHeadStyle}>
        <h2 style={{ ...h2Style, color: accentColor }}>
          {title} <span style={countStyle}>· {items.length}</span>
        </h2>
        <p style={sectionDescStyle}>{description}</p>
      </div>

      {items.length === 0 ? (
        <div style={emptyStyle}>Rien à faire ici.</div>
      ) : (
        <div style={listStyle}>
          {items.map(({ opp, reason }) => (
            <CurationCard
              key={opp.id}
              opp={opp}
              reason={reason}
              initiallyExpanded={focusId === opp.id}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface CurationWorkItem {
  opp: CurationOpp
  reason?: string
}

function buildWorkQueue(queues: Awaited<ReturnType<typeof getCurationQueues>>): CurationWorkItem[] {
  const seen = new Set<string>()
  const out: CurationWorkItem[] = []

  const push = (items: CurationOpp[], reason: string) => {
    for (const opp of items) {
      if (seen.has(opp.id)) continue
      seen.add(opp.id)
      out.push({ opp, reason })
    }
  }

  push(queues.partialExtraction, 'À décider : sections manquantes. Enrichir, flagger en attente, ou dépublier.')
  push(queues.humanReview, 'À valider : bloquée avant diffusion.')
  push(queues.expired, 'À décider : deadline passée. Dépublier ou attente prochaine édition.')
  push(queues.awaitingDetails, 'À vérifier : prochaine édition annoncée, détails à recontrôler.')
  push(queues.eligibilityReview, 'À vérifier : éligibilité sensible non structurée.')
  push(queues.newThisWeek, 'Sanity check : nouvelle opportunité de la semaine.')

  return out
}

function AccessDenied() {
  return (
    <div style={{ maxWidth: 720, margin: '120px auto', padding: '0 32px', textAlign: 'center' }}>
      <h1 className="serif" style={{ fontSize: '2rem', marginBottom: 14 }}>
        Accès restreint
      </h1>
      <p style={{ color: 'var(--ink-muted)' }}>
        Cette page est réservée aux administrateurs.
      </p>
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '48px 32px 96px',
}

const headerStyle: React.CSSProperties = {
  paddingBottom: 36,
  marginBottom: 48,
  borderBottom: '2px solid var(--ink)',
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--vermillion)',
  marginBottom: 12,
}

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(2rem, 4vw, 2.8rem)',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'var(--ink)',
  marginBottom: 14,
}

const subStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1rem',
  lineHeight: 1.55,
  color: 'var(--ink-muted)',
  maxWidth: '60ch',
}

const routineStyle: React.CSSProperties = {
  marginBottom: 42,
  padding: '18px 20px',
  border: '1px solid var(--ink-rule)',
  background: 'var(--paper-soft)',
}

const routineTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--vermillion)',
  marginBottom: 10,
}

const routineListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: '0.92rem',
  lineHeight: 1.6,
  color: 'var(--ink-muted)',
}

const scopeNoteStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: '1px solid var(--ink-rule)',
  fontSize: '0.82rem',
  lineHeight: 1.45,
  color: 'var(--ink-muted)',
}

const scopeSwitchStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 14,
}

const scopeSwitchLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 32,
  padding: '0 11px',
  border: '1px solid var(--ink-rule)',
  color: 'var(--ink-muted)',
  textDecoration: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.68rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const scopeSwitchActiveStyle: React.CSSProperties = {
  ...scopeSwitchLinkStyle,
  borderColor: 'var(--ink)',
  background: 'var(--ink)',
  color: 'var(--paper)',
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 64,
}

const sectionHeadStyle: React.CSSProperties = {
  marginBottom: 24,
  paddingBottom: 12,
  borderBottom: '1px solid var(--ink-rule)',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1.5rem',
  fontWeight: 600,
  letterSpacing: '-0.015em',
  marginBottom: 6,
}

const countStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.05em',
  color: 'var(--ink-soft)',
  fontWeight: 400,
}

const sectionDescStyle: React.CSSProperties = {
  fontSize: '0.92rem',
  color: 'var(--ink-muted)',
  lineHeight: 1.5,
  maxWidth: '70ch',
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const emptyStyle: React.CSSProperties = {
  padding: '20px 0',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  color: 'var(--ink-soft)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const footerStyle: React.CSSProperties = {
  marginTop: 80,
  paddingTop: 32,
  borderTop: '1px solid var(--ink-rule)',
  textAlign: 'center',
}

const footerLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.06em',
  color: 'var(--ink)',
  textDecoration: 'none',
  borderBottom: '1px solid var(--vermillion)',
  paddingBottom: 2,
}
