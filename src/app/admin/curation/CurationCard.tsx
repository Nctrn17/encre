'use client'

import { useState, useTransition, useId, type CSSProperties } from 'react'
import type { CurationOpp } from '@/features/curation/queues'
import { applyCurationQuickAction, saveCurationOpp } from './actions'

/**
 * Carte d'édition curation pour une opp. Repliée par défaut (titre + meta),
 * dépliée à la demande pour éditer les arrays + flags. Sauvegarde via
 * server action ; transition pour préserver focus + scroll.
 */
export function CurationCard({
  opp,
  initiallyExpanded,
  reason,
}: {
  opp: CurationOpp
  initiallyExpanded?: boolean
  reason?: string
}) {
  const [expanded, setExpanded] = useState(Boolean(initiallyExpanded))
  const [conditions, setConditions] = useState(opp.conditions.join('\n'))
  const [calendrier, setCalendrier] = useState(opp.calendrier.join('\n'))
  const [dossier, setDossier] = useState(opp.dossier.join('\n'))
  const [awaiting, setAwaiting] = useState(opp.next_edition_status === 'awaiting_details')
  const [published, setPublished] = useState(opp.is_published)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const formId = useId()

  const c = opp.conditions.length
  const cal = opp.calendrier.length
  const d = opp.dossier.length
  const status =
    c > 0 && cal > 0 && d > 0 ? 'full' : c === 0 && cal === 0 && d === 0 ? 'empty' : 'partial'

  const meta: string[] = [
    `${c}c · ${cal}cal · ${d}d`,
    opp.deadline ? `deadline ${formatShortDate(opp.deadline)}` : 'no deadline',
  ]
  if (opp.human_review) meta.unshift('REVIEW')
  if (opp.next_edition_status === 'awaiting_details') meta.unshift('AWAITING')
  if (!opp.is_published) meta.unshift('UNPUBLISHED')

  function onSave() {
    setFeedback(null)
    startTransition(async () => {
      const res = await saveCurationOpp({
        id: opp.id,
        conditions: conditions.split('\n'),
        calendrier: calendrier.split('\n'),
        dossier: dossier.split('\n'),
        next_edition_status: awaiting ? 'awaiting_details' : null,
        is_published: published,
      })
      setFeedback(res.ok ? 'Sauvegardé' : `Erreur : ${res.error ?? 'inconnue'}`)
    })
  }

  function onQuickAction(action: 'mark_ok' | 'awaiting_details' | 'unpublish' | 'reject') {
    setFeedback(null)
    startTransition(async () => {
      const res = await applyCurationQuickAction({ id: opp.id, action })
      if (res.ok) {
        if (action === 'awaiting_details') {
          setAwaiting(true)
          setPublished(false)
        }
        if (action === 'unpublish' || action === 'reject') {
          setPublished(false)
        }
      }
      setFeedback(res.ok ? quickActionFeedback(action) : `Erreur : ${res.error ?? 'inconnue'}`)
    })
  }

  return (
    <article style={{ ...cardStyle, borderLeftColor: statusColor(status) }}>
      <header
        style={cardHeaderStyle}
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((x) => !x)
          }
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={metaStyle}>
            {meta.map((m, i) => (
              <span key={i} style={metaItemStyle}>
                {m}
              </span>
            ))}
            <span style={{ ...metaItemStyle, color: 'var(--ink-soft)' }}>{opp.emitter}</span>
          </div>
          <h3 style={titleStyle}>{opp.title}</h3>
          <div style={tagRowStyle}>
            {opp.requires_producer && <span style={warningTagStyle}>requires_producer</span>}
            {!opp.hors_reseau_friendly && <span style={warningTagStyle}>hors_reseau_friendly=false</span>}
            {opp.disciplines_tags.map((tag) => (
              <span key={tag} style={tagStyle}>
                {tag}
              </span>
            ))}
          </div>
          {reason && <p style={reasonStyle}>{reason}</p>}
        </div>
        <span aria-hidden="true" style={{ ...chevronStyle, transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
          ▾
        </span>
      </header>

      {expanded && (
        <div style={bodyStyle}>
          <div style={linksRowStyle}>
            <a
              href={opp.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
              style={smallLinkStyle}
            >
              Source ({hostOf(opp.source_url)}) →
            </a>
            <a
              href={`/aides/${opp.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
              style={smallLinkStyle}
            >
              Fiche publique →
            </a>
          </div>

          <Field
            id={`${formId}-cond`}
            label="Conditions"
            hint="1 item par ligne. Max 280 chars chacun."
            value={conditions}
            onChange={setConditions}
          />
          <Field
            id={`${formId}-cal`}
            label="Calendrier"
            hint="1 item par ligne. Max 200 chars chacun."
            value={calendrier}
            onChange={setCalendrier}
          />
          <Field
            id={`${formId}-dos`}
            label="Dossier (pièces)"
            hint="1 item par ligne. Max 280 chars chacun."
            value={dossier}
            onChange={setDossier}
          />

          <div style={togglesRowStyle}>
            <label style={toggleStyle}>
              <input
                type="checkbox"
                checked={awaiting}
                onChange={(e) => {
                  // Exclusivité : awaiting => hors registre (jamais published).
                  setAwaiting(e.target.checked)
                  if (e.target.checked) setPublished(false)
                }}
              />
              <span>
                Flag <strong>awaiting_details</strong> (bandeau « modalités à venir » sur la fiche)
              </span>
            </label>
            <label style={toggleStyle}>
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => {
                  // Exclusivité : publier => on lève le flag awaiting.
                  setPublished(e.target.checked)
                  if (e.target.checked) setAwaiting(false)
                }}
              />
              <span>
                <strong>is_published</strong> (visible sur le site public)
              </span>
            </label>
          </div>

          <div style={actionRowStyle}>
            <button
              type="button"
              onClick={onSave}
              disabled={isPending}
              style={saveBtnStyle}
            >
              {isPending ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button
              type="button"
              onClick={() => onQuickAction('mark_ok')}
              disabled={isPending}
              style={secondaryBtnStyle}
            >
              Marquer OK
            </button>
            <button
              type="button"
              onClick={() => onQuickAction('awaiting_details')}
              disabled={isPending}
              style={secondaryBtnStyle}
            >
              Attente prochaine édition
            </button>
            <button
              type="button"
              onClick={() => onQuickAction('unpublish')}
              disabled={isPending}
              style={dangerBtnStyle}
            >
              Dépublier
            </button>
            <button
              type="button"
              onClick={() => onQuickAction('reject')}
              disabled={isPending}
              style={dangerBtnStyle}
              title="Pierre tombale : l'annonce ne reviendra jamais au scrape. Action terminale."
            >
              Rejeter ⛔
            </button>
            {feedback && (
              <span
                style={{
                  ...feedbackStyle,
                  color: feedback.startsWith('Erreur') ? 'var(--vermillion)' : 'var(--kelp)',
                }}
              >
                {feedback}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function quickActionFeedback(
  action: 'mark_ok' | 'awaiting_details' | 'unpublish' | 'reject',
): string {
  if (action === 'awaiting_details') return 'Flaggé en attente'
  if (action === 'unpublish') return 'Dépublié'
  if (action === 'reject') return 'Rejeté (ne reviendra plus)'
  return 'Marqué OK'
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  const lineCount = value.split('\n').filter((l) => l.trim().length > 0).length
  return (
    <div style={fieldStyle}>
      <div style={fieldLabelRowStyle}>
        <label htmlFor={id} style={fieldLabelStyle}>
          {label}
        </label>
        <span style={fieldCountStyle}>{lineCount} item{lineCount === 1 ? '' : 's'}</span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(3, Math.min(10, lineCount + 2))}
        style={textareaStyle}
        spellCheck={false}
      />
      <div style={fieldHintStyle}>{hint}</div>
    </div>
  )
}

function statusColor(s: 'full' | 'partial' | 'empty') {
  return s === 'full' ? 'var(--kelp)' : s === 'empty' ? 'var(--vermillion)' : 'var(--ink-rule)'
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.slice(0, 30) }
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso.slice(0, 10) }
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--ink-rule)',
  borderLeftWidth: 3,
  background: 'var(--paper)',
  fontFamily: 'var(--font-serif)',
}

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '14px 18px',
  cursor: 'pointer',
  userSelect: 'none',
}

const metaStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  marginBottom: 6,
}

const metaItemStyle: CSSProperties = {
  display: 'inline-block',
}

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1rem',
  lineHeight: 1.35,
  fontWeight: 500,
  color: 'var(--ink)',
}

const tagRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 8,
}

const tagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 21,
  padding: '0 7px',
  border: '1px solid var(--ink-rule)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.62rem',
  letterSpacing: '0.04em',
  color: 'var(--ink-muted)',
}

const warningTagStyle: CSSProperties = {
  ...tagStyle,
  borderColor: 'var(--vermillion)',
  color: 'var(--vermillion)',
}

const reasonStyle: CSSProperties = {
  marginTop: 6,
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
  lineHeight: 1.4,
  color: 'var(--ink-muted)',
}

const chevronStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.95rem',
  color: 'var(--ink-soft)',
  transition: 'transform 180ms var(--ease-out)',
  flexShrink: 0,
}

const bodyStyle: CSSProperties = {
  padding: '8px 18px 22px',
  borderTop: '1px solid var(--ink-rule)',
}

const linksRowStyle: CSSProperties = {
  display: 'flex',
  gap: 18,
  marginBottom: 22,
  marginTop: 14,
}

const smallLinkStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
}

const fieldStyle: CSSProperties = {
  marginBottom: 18,
}

const fieldLabelRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: 6,
}

const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  fontWeight: 500,
}

const fieldCountStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  letterSpacing: '0.06em',
  color: 'var(--ink-soft)',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  lineHeight: 1.5,
  padding: '10px 12px',
  border: '1px solid var(--ink-rule)',
  background: 'var(--paper-soft)',
  color: 'var(--ink)',
  resize: 'vertical',
}

const fieldHintStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.62rem',
  letterSpacing: '0.04em',
  color: 'var(--ink-soft)',
  marginTop: 4,
}

const togglesRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 8,
  marginBottom: 18,
}

const toggleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontFamily: 'var(--font-serif)',
  fontSize: '0.92rem',
  color: 'var(--ink)',
  cursor: 'pointer',
}

const actionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
}

const saveBtnStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '10px 18px',
  border: '1px solid var(--vermillion)',
  background: 'var(--vermillion)',
  color: 'var(--paper)',
  cursor: 'pointer',
  transition: 'background 140ms var(--ease-out), transform 100ms var(--ease-out)',
}

const secondaryBtnStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  padding: '9px 13px',
  border: '1px solid var(--ink-rule)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  cursor: 'pointer',
}

const dangerBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  borderColor: 'var(--vermillion)',
  color: 'var(--vermillion)',
}

const feedbackStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}
