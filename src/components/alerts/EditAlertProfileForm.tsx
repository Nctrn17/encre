'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AlertProfile } from '@/features/alerts/queries'
import {
  previewAlertProfile,
  updateAlertProfile,
  type AlertProfilePreview,
} from '@/features/alerts/actions'
import type { AlertProfileInput } from '@/lib/pipeline/schemas'
import { AlertProfilePreviewPanel } from '@/components/alerts/AlertProfilePreviewPanel'
import { FR_REGION_CODES, type FrRegionCode } from '@/lib/region-codes'

type AgeRangeValue = 'under_30' | '30_45' | 'over_45' | 'not_specified'
type ResidencyContext = AlertProfile['residency_context']
type NationalityContext = AlertProfile['nationality_context']
type GenderContext = AlertProfile['gender_context']

interface DisciplineChoice {
  label: string
  macroSlugs: string[]
  fineTag: string
}

const PILOT_DISCIPLINES: DisciplineChoice[] = [
  { label: 'Scénario long métrage', macroSlugs: ['cinema', 'audiovisuel'], fineTag: 'long-metrage' },
  { label: 'Scénario court métrage', macroSlugs: ['cinema', 'audiovisuel'], fineTag: 'court-metrage' },
  { label: 'Série télévisée', macroSlugs: ['audiovisuel'], fineTag: 'serie' },
  { label: 'Documentaire', macroSlugs: ['cinema', 'audiovisuel'], fineTag: 'documentaire' },
  { label: 'Animation', macroSlugs: ['cinema', 'audiovisuel'], fineTag: 'animation' },
  { label: 'Création sonore', macroSlugs: ['audiovisuel'], fineTag: 'sonore' },
  { label: 'Web narratif', macroSlugs: ['audiovisuel'], fineTag: 'web' },
]

const REGION_ORDER: FrRegionCode[] = [
  'FR-IDF',
  'FR-NAQ',
  'FR-ARA',
  'FR-HDF',
  'FR-BRE',
  'FR-OCC',
  'FR-PAC',
  'FR-PDL',
  'FR-GES',
  'FR-NOR',
  'FR-BFC',
  'FR-CVL',
  'FR-COR',
]

const WEEKDAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
]

export function EditAlertProfileForm({ profile }: { profile: AlertProfile }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPreviewPending, startPreviewTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AlertProfilePreview | null>(null)
  const [saved, setSaved] = useState(false)

  const [name, setName] = useState(profile.name)
  const [tags, setTags] = useState<Set<string>>(new Set(profile.discipline_tags ?? []))
  const [hasProducer, setHasProducer] = useState<'yes' | 'no' | 'unsure'>(
    profile.has_producer === null ? 'unsure' : profile.has_producer ? 'yes' : 'no',
  )
  const [filmsCount, setFilmsCount] = useState(String(profile.films_produced_count ?? 0))
  const [ageRange, setAgeRange] = useState<AgeRangeValue>(profile.age_range ?? 'not_specified')
  const [residencyContext, setResidencyContext] = useState<ResidencyContext>(profile.residency_context)
  const [nationalityContext, setNationalityContext] = useState<NationalityContext>(profile.nationality_context)
  const [genderContext, setGenderContext] = useState<GenderContext>(profile.gender_context)
  const [professionalStatuses, setProfessionalStatuses] = useState<Set<string>>(
    new Set(profile.professional_status_tags ?? []),
  )
  const [horsReseauOnly, setHorsReseauOnly] = useState(profile.hors_reseau_only)
  const [candidateMode, setCandidateMode] = useState(profile.candidate_mode)
  const [regions, setRegions] = useState<Set<FrRegionCode>>(
    new Set(profile.region_codes as FrRegionCode[]),
  )
  const [nationalOnly, setNationalOnly] = useState(profile.region_codes.length === 0)
  const [sendWeekday, setSendWeekday] = useState(profile.send_weekday)
  const [isActive, setIsActive] = useState(profile.is_active)

  const selectedChoices = useMemo(
    () => PILOT_DISCIPLINES.filter((choice) => tags.has(choice.fineTag)),
    [tags],
  )

  function buildInput(): AlertProfileInput | null {
    setError(null)
    if (!name.trim()) {
      setError("Le nom de l'alerte est requis.")
      return null
    }
    if (selectedChoices.length === 0) {
      setError('Sélectionnez au moins un format.')
      return null
    }

    const macroSet = new Set<string>()
    selectedChoices.forEach((choice) => {
      choice.macroSlugs.forEach((slug) => macroSet.add(slug))
    })

    return {
      name: name.trim(),
      disciplines: Array.from(macroSet) as never[],
      discipline_tags: selectedChoices.map((choice) => choice.fineTag),
      audience: profile.audience as never[],
      types: profile.types as never[],
      geo_scopes: nationalOnly
        ? (['national', 'regional', 'metropole', 'europe', 'international'] as never[])
        : ([] as never[]),
      region_codes: nationalOnly ? [] : Array.from(regions),
      min_amount: profile.min_amount,
      frequency: profile.frequency,
      send_weekday: sendWeekday,
      has_producer: hasProducer === 'unsure' ? null : hasProducer === 'yes',
      films_produced_count: Number(filmsCount),
      age_range: ageRange,
      residency_context: residencyContext,
      nationality_context: nationalityContext,
      gender_context: genderContext,
      professional_status_tags: Array.from(professionalStatuses),
      hors_reseau_only: horsReseauOnly,
      candidate_mode: candidateMode,
      is_active: isActive,
    }
  }

  function handlePreview() {
    setPreviewError(null)
    const input = buildInput()
    if (!input) return

    startPreviewTransition(async () => {
      const result = await previewAlertProfile(input)
      if ('error' in result) {
        setPreviewError(result.error ?? 'Aperçu impossible.')
        return
      }
      setPreview(result.preview)
    })
  }

  function submit() {
    const input = buildInput()
    if (!input) return

    setSaved(false)
    startTransition(async () => {
      const result = await updateAlertProfile(profile.id, input)

      if ('error' in result) {
        setError(result.error ?? 'Mise à jour impossible.')
        return
      }

      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5 space-y-8">
      <label className="block">
        <span className="block text-sm text-muted mb-2">Nom de l'alerte</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
        />
      </label>

      <Fieldset title="Formats">
        <ChipGrid>
          {PILOT_DISCIPLINES.map((choice) => (
            <Chip
              key={choice.fineTag}
              label={choice.label}
              checked={tags.has(choice.fineTag)}
              onClick={() => {
                const next = new Set(tags)
                next.has(choice.fineTag) ? next.delete(choice.fineTag) : next.add(choice.fineTag)
                setTags(next)
              }}
            />
          ))}
        </ChipGrid>
      </Fieldset>

      <Fieldset title="Situation">
        <ChipGrid>
          <Chip label="Producteur attaché" checked={hasProducer === 'yes'} onClick={() => setHasProducer('yes')} />
          <Chip label="Sans producteur" checked={hasProducer === 'no'} onClick={() => setHasProducer('no')} />
          <Chip label="À préciser plus tard" checked={hasProducer === 'unsure'} onClick={() => setHasProducer('unsure')} />
        </ChipGrid>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm text-muted mb-2">Films déjà produits</span>
            <input
              type="number"
              min={0}
              max={20}
              value={filmsCount}
              onChange={(event) => setFilmsCount(event.target.value)}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-muted mb-2">Âge</span>
            <select
              value={ageRange}
              onChange={(event) => setAgeRange(event.target.value as AgeRangeValue)}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            >
              <option value="not_specified">Non précisé</option>
              <option value="under_30">Moins de 30 ans</option>
              <option value="30_45">30-45 ans</option>
              <option value="over_45">Plus de 45 ans</option>
            </select>
          </label>
        </div>
      </Fieldset>

      <Fieldset title="Géographie">
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={nationalOnly}
            onChange={(event) => setNationalOnly(event.target.checked)}
          />
          Dispositifs nationaux, européens et internationaux
        </label>
        {!nationalOnly && (
          <ChipGrid>
            {REGION_ORDER.map((code) => (
              <Chip
                key={code}
                label={FR_REGION_CODES[code]}
                checked={regions.has(code)}
                onClick={() => {
                  const next = new Set(regions)
                  next.has(code) ? next.delete(code) : next.add(code)
                  setRegions(next)
                }}
              />
            ))}
          </ChipGrid>
        )}
      </Fieldset>

      <Fieldset title="Eligibilite">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="block text-sm text-muted mb-2">Residence</span>
            <select
              value={residencyContext}
              onChange={(event) => setResidencyContext(event.target.value as ResidencyContext)}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            >
              <option value="france_metropole">France metropolitaine</option>
              <option value="outremer">Outre-mer</option>
              <option value="pays_du_sud">Pays du Sud / francophonie</option>
              <option value="international">Hors France</option>
              <option value="not_specified">Non precise</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm text-muted mb-2">Nationalite</span>
            <select
              value={nationalityContext}
              onChange={(event) => setNationalityContext(event.target.value as NationalityContext)}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            >
              <option value="france">France</option>
              <option value="foreign">Non francaise</option>
              <option value="pays_du_sud">Pays du Sud</option>
              <option value="not_specified">Non precise</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm text-muted mb-2">Programmes cibles</span>
            <select
              value={genderContext}
              onChange={(event) => setGenderContext(event.target.value as GenderContext)}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            >
              <option value="not_specified">Non precise</option>
              <option value="woman">Femme</option>
              <option value="gender_minority">Minorite de genre</option>
              <option value="woman_or_gender_minority">Femme ou minorite de genre</option>
            </select>
          </label>
        </div>
        <div className="mt-4">
          <ChipGrid>
            <Chip
              label="SACD"
              checked={professionalStatuses.has('sacd_member')}
              onClick={() => setProfessionalStatuses(toggleTag(professionalStatuses, 'sacd_member'))}
            />
            <Chip
              label="SCAM"
              checked={professionalStatuses.has('scam_member')}
              onClick={() => setProfessionalStatuses(toggleTag(professionalStatuses, 'scam_member'))}
            />
          </ChipGrid>
        </div>
      </Fieldset>

      <Fieldset title="Envoi et niveau de veille">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm text-muted mb-2">Jour d'envoi</span>
            <select
              value={sendWeekday}
              onChange={(event) => setSendWeekday(Number(event.target.value))}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            >
              {WEEKDAYS.map((weekday) => (
                <option key={weekday.value} value={weekday.value}>
                  {weekday.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm text-muted mb-2">Mode de veille</span>
            <select
              value={candidateMode}
              onChange={(event) => setCandidateMode(event.target.value as AlertProfile['candidate_mode'])}
              className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
            >
              <option value="strict">Strict</option>
              <option value="balanced">Équilibré</option>
              <option value="wide">Large</option>
            </select>
          </label>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={horsReseauOnly}
              onChange={(event) => setHorsReseauOnly(event.target.checked)}
            />
            Prioriser les opportunités accessibles hors réseau
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Alerte active
          </label>
        </div>
      </Fieldset>

      <AlertProfilePreviewPanel
        preview={preview}
        error={previewError}
        isLoading={isPreviewPending}
        onPreview={handlePreview}
      />

      {error && <div className="rounded bg-danger-soft p-3 text-sm text-danger">{error}</div>}

      <div
        className="sticky bottom-0 -mx-5 px-5 pt-4 pb-4 mt-5 flex items-center justify-between gap-3 border-t border-subtle bg-surface flex-wrap"
        style={{ boxShadow: '0 -4px 12px rgba(28, 24, 23, 0.04)' }}
      >
        <div className="text-sm">
          {saved && !isPending ? (
            <span className="text-success">Modifications enregistrées.</span>
          ) : (
            <span className="text-muted">Vos modifications ne sont enregistrées qu'après avoir cliqué.</span>
          )}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <button
            type="button"
            onClick={() => router.push('/mes-alertes')}
            className="rounded-[var(--radius)] px-4 py-2 text-sm text-foreground hover:bg-subtle inline-flex items-center gap-2"
          >
            <span aria-hidden="true">←</span> Retour aux alertes
          </button>
          <button
            type="button"
            onClick={() => router.push(`/mes-alertes/${profile.id}/aides`)}
            className="rounded-[var(--radius)] px-4 py-2 text-sm text-foreground hover:bg-subtle inline-flex items-center gap-2"
          >
            Voir les opportunités <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="rounded-[var(--radius)] bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  )
}

function ChipGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

function toggleTag(tags: Set<string>, tag: string): Set<string> {
  const next = new Set(tags)
  next.has(tag) ? next.delete(tag) : next.add(tag)
  return next
}

function Chip({
  label,
  checked,
  onClick,
}: {
  label: string
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        checked
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-subtle bg-background text-foreground hover:bg-subtle'
      }`}
    >
      {label}
    </button>
  )
}
