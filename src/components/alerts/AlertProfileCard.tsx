'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import type { AlertProfile } from '@/features/alerts/queries'
import { toggleAlertProfileActive, deleteAlertProfile } from '@/features/alerts/actions'
import {
  DISCIPLINE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  type DisciplineSlug,
  type OpportunityType,
} from '@/lib/discipline-taxonomy'
import { FR_REGION_CODES, type FrRegionCode } from '@/lib/region-codes'

const FREQUENCY_LABELS: Record<AlertProfile['frequency'], string> = {
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  deadline_only: 'Approches de deadline uniquement',
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
}

export function AlertProfileCard({ profile }: { profile: AlertProfile }) {
  const [isActive, setIsActive] = useState(profile.is_active)
  const [deleted, setDeleted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (deleted) return null

  function handleToggle() {
    setError(null)
    startTransition(async () => {
      const result = await toggleAlertProfileActive(profile.id)
      if ('error' in result) {
        setError(result.error ?? 'Erreur')
        return
      }
      setIsActive(result.is_active ?? !isActive)
    })
  }

  function handleDelete() {
    if (!confirm(`Supprimer l'alerte « ${profile.name} » ? Cette action est irréversible.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteAlertProfile(profile.id)
      if ('error' in result) {
        setError(result.error ?? 'Erreur')
        return
      }
      setDeleted(true)
    })
  }

  const disciplineLabels = profile.disciplines
    .map((d) => DISCIPLINE_LABELS[d as DisciplineSlug] ?? d)
    .slice(0, 5)

  const regionLabels = profile.region_codes
    .map((code) => FR_REGION_CODES[code as FrRegionCode] ?? code)
    .slice(0, 3)

  const typeLabels = profile.types.map((t) => OPPORTUNITY_TYPE_LABELS[t as OpportunityType] ?? t)
  const fineTagLabels = (profile.discipline_tags ?? [])
    .map((tag) => FINE_TAG_LABELS[tag] ?? tag)
    .slice(0, 5)
  const situation = formatSituation(profile)
  const nextSend = formatNextSend(profile)

  return (
    <div
      className={`rounded-[var(--radius-lg)] border p-5 transition-opacity ${
        isActive ? 'bg-surface border-subtle' : 'bg-surface border-subtle opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-serif font-semibold">{profile.name}</h3>
            {!isActive && (
              <span className="px-2 py-0.5 rounded-full bg-subtle text-muted text-xs">
                En pause
              </span>
            )}
          </div>
          <div className="text-sm text-muted">
            {FREQUENCY_LABELS[profile.frequency]}
            {profile.frequency === 'weekly' && (
              <> · {WEEKDAY_LABELS[profile.send_weekday] ?? 'lundi'}</>
            )}
            {profile.last_sent_at && (
              <>
                {' · '}
                Dernier envoi le{' '}
                {new Date(profile.last_sent_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                })}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/mes-alertes/${profile.id}/modifier`}
            aria-label="Modifier l'alerte"
            className="p-2 rounded-[var(--radius)] text-muted hover:bg-subtle hover:text-foreground"
            title="Modifier"
          >
            <Pencil className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            aria-label={isActive ? "Mettre l'alerte en pause" : "Réactiver l'alerte"}
            className="p-2 rounded-[var(--radius)] text-muted hover:bg-subtle hover:text-foreground disabled:opacity-50"
            title={isActive ? 'Mettre en pause' : 'Réactiver'}
          >
            {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            aria-label="Supprimer l'alerte"
            className="p-2 rounded-[var(--radius)] text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            title="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {disciplineLabels.length > 0 && (
          <InfoLine label="Disciplines">
            {disciplineLabels.join(', ')}
            {profile.disciplines.length > 5 && ` +${profile.disciplines.length - 5}`}
          </InfoLine>
        )}

        {fineTagLabels.length > 0 && (
          <InfoLine label="Formats">
            {fineTagLabels.join(', ')}
            {(profile.discipline_tags ?? []).length > 5 &&
              ` +${(profile.discipline_tags ?? []).length - 5}`}
          </InfoLine>
        )}

        {situation && (
          <InfoLine label="Situation">{situation}</InfoLine>
        )}

        {typeLabels.length > 0 && (
          <InfoLine label="Types">{typeLabels.join(', ')}</InfoLine>
        )}

        {regionLabels.length > 0 && (
          <InfoLine label="Régions">
            {regionLabels.join(', ')}
            {profile.region_codes.length > 3 && ` +${profile.region_codes.length - 3}`}
          </InfoLine>
        )}

        {profile.region_codes.length === 0 && profile.geo_scopes.length > 0 && (
          <InfoLine label="Géographie">Toute la France + Europe + international</InfoLine>
        )}

        {profile.min_amount != null && (
          <InfoLine label="Montant minimum">
            {new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }).format(profile.min_amount)}
          </InfoLine>
        )}

        {nextSend && (
          <InfoLine label="Prochain envoi">{nextSend}</InfoLine>
        )}
      </div>

      {error && (
        <div className="mt-3 p-2 rounded bg-danger-soft text-danger text-xs">{error}</div>
      )}

      <div className="mt-4 pt-4 border-t border-subtle">
        <Link
          href={`/mes-alertes/${profile.id}/aides`}
          className="text-sm text-accent underline underline-offset-4"
        >
          Voir les opportunités adaptées
        </Link>
      </div>
    </div>
  )
}

const FINE_TAG_LABELS: Record<string, string> = {
  scenario: 'Scénario',
  documentaire: 'Documentaire',
  'court-metrage': 'Court métrage',
  'long-metrage': 'Long métrage',
  serie: 'Série',
  animation: 'Animation',
  sonore: 'Création sonore',
  web: 'Web narratif',
}

function formatSituation(profile: AlertProfile): string | null {
  const parts: string[] = []

  if (profile.has_producer === false) {
    parts.push('sans producteur attaché')
  } else if (profile.has_producer === true) {
    parts.push('producteur attaché')
  }

  if (profile.films_produced_count === 0) {
    parts.push('premier projet accepté')
  } else if (typeof profile.films_produced_count === 'number') {
    parts.push(`${profile.films_produced_count} film${profile.films_produced_count > 1 ? 's' : ''} déjà produit${profile.films_produced_count > 1 ? 's' : ''}`)
  }

  if (profile.hors_reseau_only) {
    parts.push('veille hors réseau')
  }

  return parts.length > 0 ? parts.join(', ') : null
}

function formatNextSend(profile: AlertProfile): string | null {
  if (!profile.is_active) return null
  if (profile.frequency === 'daily') return 'demain matin'
  if (profile.frequency === 'deadline_only') return 'uniquement en cas de date limite proche'

  const next = nextWeekday(profile.send_weekday)
  return next.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function nextWeekday(targetIsoWeekday: number): Date {
  const now = new Date()
  const currentIsoWeekday = now.getDay() === 0 ? 7 : now.getDay()
  let delta = targetIsoWeekday - currentIsoWeekday
  if (delta <= 0) delta += 7
  const next = new Date(now)
  next.setDate(now.getDate() + delta)
  return next
}

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="text-muted w-24 flex-shrink-0">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  )
}
