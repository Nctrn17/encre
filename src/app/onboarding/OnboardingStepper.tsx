'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  completeOnboarding,
  previewAlertProfile,
  type AlertProfilePreview,
} from '@/features/alerts/actions'
import type { AlertProfile } from '@/features/alerts/queries'
import type { AlertProfileInput } from '@/lib/pipeline/schemas'
import { AlertProfilePreviewPanel } from '@/components/alerts/AlertProfilePreviewPanel'
import { FR_REGION_CODES, type FrRegionCode } from '@/lib/region-codes'

type Step = 1 | 2 | 3

// Disciplines pilote scénariste — affichées en chips Fraunces dans le mockup.
// Mappent vers les slugs taxonomie macro pour la création du alert_profile,
// plus vers disciplines_tags pour un matching fin.
interface DisciplineChoice {
  label: string
  macroSlugs: string[] // disciplines macro (DISCIPLINE_SLUGS)
  fineTag: string // tag fin pour disciplines_tags
}

const PILOT_DISCIPLINES: DisciplineChoice[] = [
  {
    label: 'Scénario long métrage',
    macroSlugs: ['cinema', 'audiovisuel'],
    fineTag: 'long-metrage',
  },
  {
    label: 'Scénario court métrage',
    macroSlugs: ['cinema', 'audiovisuel'],
    fineTag: 'court-metrage',
  },
  {
    label: 'Série télévisée',
    macroSlugs: ['audiovisuel'],
    fineTag: 'serie',
  },
  {
    label: 'Documentaire',
    macroSlugs: ['cinema', 'audiovisuel'],
    fineTag: 'documentaire',
  },
  {
    label: 'Animation',
    macroSlugs: ['cinema', 'audiovisuel'],
    fineTag: 'animation',
  },
  {
    label: 'Création sonore',
    macroSlugs: ['audiovisuel'],
    fineTag: 'sonore',
  },
  {
    label: 'Web narratif',
    macroSlugs: ['audiovisuel'],
    fineTag: 'web',
  },
]

type ProducerStatus = 'none' | 'yes' | 'unsure'
type FilmsDone = 'none' | 'few-shorts' | 'many-shorts' | 'long'
type AgeRange = 'u30' | '30-45' | '45p' | 'na'
type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'urgent'
type SendWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
type ResidencyContext = 'france_metropole' | 'outremer' | 'pays_du_sud' | 'international' | 'not_specified'
type GenderContext = 'woman' | 'gender_minority' | 'woman_or_gender_minority' | 'not_specified'

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

const WEEKDAYS: Array<{ value: SendWeekday; label: string }> = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
]

export function OnboardingStepper({
  existingProfiles = [],
}: {
  existingProfiles?: AlertProfile[]
}) {
  const [step, setStep] = useState<Step>(1)

  const [disciplines, setDisciplines] = useState<Set<string>>(new Set())
  const [producer, setProducer] = useState<ProducerStatus>('none')
  const [films, setFilms] = useState<FilmsDone>('none')
  const [age, setAge] = useState<AgeRange>('na')
  const [residencyContext, setResidencyContext] = useState<ResidencyContext>('france_metropole')
  const [genderContext, setGenderContext] = useState<GenderContext>('not_specified')
  const [professionalStatuses, setProfessionalStatuses] = useState<Set<string>>(new Set())
  const [horsReseau, setHorsReseau] = useState(true)
  const [regions, setRegions] = useState<Set<FrRegionCode>>(new Set())
  const [nationalOnly, setNationalOnly] = useState(true)
  const [international, setInternational] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>('biweekly')
  const [sendWeekday, setSendWeekday] = useState<SendWeekday>(1)

  const [isPending, startTransition] = useTransition()
  const [isPreviewPending, startPreviewTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AlertProfilePreview | null>(null)

  // Live counter — approximé localement, le backend pourrait renvoyer un
  // compte réel via une query côté serveur (à brancher plus tard)
  const matchCount = useMemo(() => {
    const base = 40
    const disc = disciplines.size
    const mult = disc === 0 ? 0 : Math.min(1, 0.3 + disc * 0.18)
    return Math.round(base * mult)
  }, [disciplines])

  function next() {
    setError(null)
    if (step === 1 && disciplines.size === 0) {
      setError('Sélectionnez au moins une discipline.')
      return
    }
    if (step < 3) setStep((step + 1) as Step)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function back() {
    setError(null)
    if (step > 1) setStep((step - 1) as Step)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function buildInput(): AlertProfileInput {
    setError(null)
    const chosenChoices = PILOT_DISCIPLINES.filter((d) => disciplines.has(d.fineTag))
    const macroSet = new Set<string>()
    chosenChoices.forEach((c) => c.macroSlugs.forEach((s) => macroSet.add(s)))

    return {
      name: 'Ma veille audiovisuelle',
      disciplines: Array.from(macroSet) as never[],
      discipline_tags: chosenChoices.map((choice) => choice.fineTag),
      audience: [],
      types: [],
      geo_scopes: nationalOnly
        ? (['national', 'regional', 'metropole', ...(international ? ['europe', 'international'] : [])] as never[])
        : ([] as never[]),
      region_codes: nationalOnly ? [] : Array.from(regions),
      min_amount: null,
      frequency: frequency === 'urgent' ? 'deadline_only' : frequency === 'biweekly' ? 'weekly' : frequency === 'monthly' ? 'weekly' : 'weekly',
      send_weekday: sendWeekday,
      has_producer: producer === 'unsure' ? null : producer === 'yes',
      films_produced_count: filmsToCount(films),
      age_range: ageToProfileRange(age),
      residency_context: residencyContext,
      nationality_context: nationalityFromResidency(residencyContext),
      gender_context: genderContext,
      professional_status_tags: Array.from(professionalStatuses),
      hors_reseau_only: horsReseau,
      candidate_mode: horsReseau ? 'balanced' : 'wide',
      is_active: true,
    }
  }

  function previewCurrentAlert() {
    setPreviewError(null)
    if (disciplines.size === 0) {
      setError('Sélectionnez au moins une discipline.')
      return
    }
    const input = buildInput()

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

    startTransition(async () => {
      const result = await completeOnboarding(input)
      if (result && 'error' in result) {
        setError(result.error ?? 'Une erreur est survenue')
      }
    })
  }

  return (
    <>
      {/* Step indicator dans hero */}
      <section className="band-charcoal">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-12 pb-16 sm:pb-20">
          <div className="step-indicator flex-wrap gap-2 sm:gap-6">
            <span
              className={`step ${step === 1 ? 'current' : step > 1 ? 'done' : ''}`}
            >
              I · Discipline
            </span>
            <span className={`bar ${step > 1 ? 'done' : ''}`} />
            <span
              className={`step ${step === 2 ? 'current' : step > 2 ? 'done' : ''}`}
            >
              II · Situation
            </span>
            <span className={`bar ${step > 2 ? 'done' : ''}`} />
            <span className={`step ${step === 3 ? 'current' : ''}`}>
              III · Géographie &amp; cadence
            </span>
          </div>
        </div>
      </section>

      {step === 1 && (
        <StepDisciplines
          selected={disciplines}
          onToggle={(tag) => {
            const n = new Set(disciplines)
            n.has(tag) ? n.delete(tag) : n.add(tag)
            setDisciplines(n)
          }}
          matchCount={matchCount}
        />
      )}

      {step === 2 && (
        <StepSituation
          producer={producer}
          films={films}
          age={age}
          residencyContext={residencyContext}
          genderContext={genderContext}
          professionalStatuses={professionalStatuses}
          horsReseau={horsReseau}
          onProducer={setProducer}
          onFilms={setFilms}
          onAge={setAge}
          onResidencyContext={setResidencyContext}
          onGenderContext={setGenderContext}
          onToggleProfessionalStatus={(tag) => {
            const n = new Set(professionalStatuses)
            n.has(tag) ? n.delete(tag) : n.add(tag)
            setProfessionalStatuses(n)
          }}
          onHorsReseau={setHorsReseau}
        />
      )}

      {step === 3 && (
        <StepGeoCadence
          regions={regions}
          nationalOnly={nationalOnly}
          international={international}
          frequency={frequency}
          sendWeekday={sendWeekday}
          existingProfiles={existingProfiles}
          preview={preview}
          previewError={previewError}
          isPreviewPending={isPreviewPending}
          onPreview={previewCurrentAlert}
          onToggleRegion={(code) => {
            setNationalOnly(false)
            const n = new Set(regions)
            n.has(code) ? n.delete(code) : n.add(code)
            setRegions(n)
          }}
          onToggleNational={() => setNationalOnly(!nationalOnly)}
          onToggleInternational={() => setInternational(!international)}
          onFrequency={setFrequency}
          onSendWeekday={setSendWeekday}
        />
      )}

      {/* Navigation */}
      <section className="band-ink" style={{ borderTop: '1px solid var(--charcoal-rule)' }}>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-12 py-10 flex items-center justify-between flex-wrap gap-4">
          <button
            type="button"
            onClick={back}
            disabled={step === 1}
            className="mono link"
            style={{
              color: step === 1 ? 'var(--muted-warm)' : 'var(--muted-cream)',
              opacity: step === 1 ? 0.4 : 1,
              cursor: step === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Précédent
          </button>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mono-meta"
              style={{ color: 'var(--vermillion)' }}
            >
              {error}
            </div>
          )}

          {step < 3 ? (
            <button type="button" onClick={next} className="btn-next">
              Suite →
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="btn-next"
            >
              {isPending ? '…' : 'Composer ma veille →'}
            </button>
          )}
        </div>
      </section>
    </>
  )
}

function filmsToCount(value: FilmsDone): number {
  if (value === 'few-shorts') return 1
  if (value === 'many-shorts') return 3
  if (value === 'long') return 5
  return 0
}

function ageToProfileRange(
  value: AgeRange,
): 'under_30' | '30_45' | 'over_45' | 'not_specified' {
  if (value === 'u30') return 'under_30'
  if (value === '30-45') return '30_45'
  if (value === '45p') return 'over_45'
  return 'not_specified'
}

function nationalityFromResidency(
  value: ResidencyContext,
): 'france' | 'foreign' | 'pays_du_sud' | 'not_specified' {
  if (value === 'pays_du_sud') return 'pays_du_sud'
  if (value === 'international') return 'foreign'
  if (value === 'not_specified') return 'not_specified'
  return 'france'
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP I — Discipline
// ─────────────────────────────────────────────────────────────────────────────

function StepDisciplines({
  selected,
  onToggle,
  matchCount,
}: {
  selected: Set<string>
  onToggle: (tag: string) => void
  matchCount: number
}) {
  return (
    <section className="band-cream">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-12 py-16 sm:py-24">
        <div className="grid grid-cols-12 gap-6 sm:gap-12 mb-8 sm:mb-12">
          <div className="col-span-12 md:col-span-4">
            <div className="slug mb-4">I · Discipline</div>
            <h2
              className="fraunces"
              style={{
                fontSize: 'clamp(28px, 3.4vw, 52px)',
                lineHeight: 1.05,
                fontWeight: 400,
                letterSpacing: '-0.02em',
              }}
            >
              Sur quoi
              <br />
              écrivez-vous ?
            </h2>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p
              className="prose-cream mb-10"
              style={{
                fontSize: '16.5px',
                color: 'var(--muted-warm)',
                lineHeight: 1.65,
                maxWidth: '56ch',
              }}
            >
              Cochez les formats qui vous concernent, un ou plusieurs. La
              plateforme couvre aujourd&apos;hui l&apos;écriture audiovisuelle. Les
              autres disciplines (littérature, arts visuels, musique, scène
              vivante) seront ouvertes progressivement.
            </p>

            <div className="chip-picker">
              {PILOT_DISCIPLINES.map((d) => (
                <label key={d.fineTag}>
                  <input
                    type="checkbox"
                    checked={selected.has(d.fineTag)}
                    onChange={() => onToggle(d.fineTag)}
                  />
                  <span className="chip-label">{d.label}</span>
                </label>
              ))}
            </div>

            <div
              className="mt-10 hr-cream pt-5 mono-meta"
              style={{ color: 'var(--muted-warm)' }}
            >
              Sélection actuelle · {selected.size} discipline
              {selected.size > 1 ? 's' : ''}
              {selected.size > 0 && ` · ≈ ${matchCount} guichets matchent dans la base`}
              .
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP II — Situation
// ─────────────────────────────────────────────────────────────────────────────

function StepSituation({
  producer,
  films,
  age,
  residencyContext,
  genderContext,
  professionalStatuses,
  horsReseau,
  onProducer,
  onFilms,
  onAge,
  onResidencyContext,
  onGenderContext,
  onToggleProfessionalStatus,
  onHorsReseau,
}: {
  producer: ProducerStatus
  films: FilmsDone
  age: AgeRange
  residencyContext: ResidencyContext
  genderContext: GenderContext
  professionalStatuses: Set<string>
  horsReseau: boolean
  onProducer: (p: ProducerStatus) => void
  onFilms: (f: FilmsDone) => void
  onAge: (a: AgeRange) => void
  onResidencyContext: (r: ResidencyContext) => void
  onGenderContext: (g: GenderContext) => void
  onToggleProfessionalStatus: (tag: string) => void
  onHorsReseau: (h: boolean) => void
}) {
  return (
    <section className="band-charcoal">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-12 py-16 sm:py-24">
        <div className="grid grid-cols-12 gap-6 sm:gap-12">
          <div className="col-span-12 md:col-span-4">
            <div className="slug mb-4">II · Situation</div>
            <h2
              className="fraunces"
              style={{
                fontSize: 'clamp(28px, 3.4vw, 52px)',
                lineHeight: 1.05,
                fontWeight: 400,
                letterSpacing: '-0.02em',
              }}
            >
              Où en
              <br />
              êtes-vous ?
            </h2>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p
              className="prose-charcoal mb-10"
              style={{
                fontSize: '16.5px',
                color: 'var(--muted-cream)',
                lineHeight: 1.65,
                maxWidth: '56ch',
              }}
            >
              Plusieurs guichets exigent un producteur attaché, un nombre
              minimum de films précédemment produits, ou imposent une condition
              d&apos;âge. Indiquez votre situation : la base n&apos;affichera que
              les appels réellement ouverts à vous.
            </p>

            <Question label="Avez-vous un producteur attaché au projet ?">
              <Radio name="prod" checked={producer === 'yes'} onClick={() => onProducer('yes')} label="Oui" />
              <Radio
                name="prod"
                checked={producer === 'none'}
                onClick={() => onProducer('none')}
                label="Non, j’écris seul·e"
              />
              <Radio
                name="prod"
                checked={producer === 'unsure'}
                onClick={() => onProducer('unsure')}
                label="Je ne sais pas encore"
              />
            </Question>

            <Question label="Films précédemment produits">
              <Radio name="films" checked={films === 'none'} onClick={() => onFilms('none')} label="Aucun pour l’instant" />
              <Radio name="films" checked={films === 'few-shorts'} onClick={() => onFilms('few-shorts')} label="1 à 2 courts métrages" />
              <Radio name="films" checked={films === 'many-shorts'} onClick={() => onFilms('many-shorts')} label="Plusieurs courts, pas de long" />
              <Radio name="films" checked={films === 'long'} onClick={() => onFilms('long')} label="Un ou plusieurs longs" />
            </Question>

            <Question label="Âge, optionnel, utilisé uniquement pour filtrer les aides jeunesse">
              <Radio name="age" checked={age === 'u30'} onClick={() => onAge('u30')} label="Moins de 30 ans" />
              <Radio name="age" checked={age === '30-45'} onClick={() => onAge('30-45')} label="30-45 ans" />
              <Radio name="age" checked={age === '45p'} onClick={() => onAge('45p')} label="Plus de 45 ans" />
              <Radio name="age" checked={age === 'na'} onClick={() => onAge('na')} label="Ne pas préciser" />
            </Question>

            {/* Hors-réseau */}
            <Question label="Residence ou contexte geographique personnel, optionnel">
              <Radio name="residency" checked={residencyContext === 'france_metropole'} onClick={() => onResidencyContext('france_metropole')} label="France metropolitaine" />
              <Radio name="residency" checked={residencyContext === 'outremer'} onClick={() => onResidencyContext('outremer')} label="Outre-mer" />
              <Radio name="residency" checked={residencyContext === 'pays_du_sud'} onClick={() => onResidencyContext('pays_du_sud')} label="Pays du Sud / francophonie" />
              <Radio name="residency" checked={residencyContext === 'international'} onClick={() => onResidencyContext('international')} label="Hors France" />
              <Radio name="residency" checked={residencyContext === 'not_specified'} onClick={() => onResidencyContext('not_specified')} label="Ne pas preciser" />
            </Question>

            <Question label="Programmes cibles, optionnel">
              <Radio name="gender" checked={genderContext === 'not_specified'} onClick={() => onGenderContext('not_specified')} label="Ne pas preciser" />
              <Radio name="gender" checked={genderContext === 'woman'} onClick={() => onGenderContext('woman')} label="Femme" />
              <Radio name="gender" checked={genderContext === 'gender_minority'} onClick={() => onGenderContext('gender_minority')} label="Minorite de genre" />
              <Radio name="gender" checked={genderContext === 'woman_or_gender_minority'} onClick={() => onGenderContext('woman_or_gender_minority')} label="Femme ou minorite de genre" />
            </Question>

            <Question label="Statuts utiles à certains guichets">
              <ToggleChip checked={professionalStatuses.has('sacd_member')} onClick={() => onToggleProfessionalStatus('sacd_member')} label="SACD" />
              <ToggleChip checked={professionalStatuses.has('scam_member')} onClick={() => onToggleProfessionalStatus('scam_member')} label="SCAM" />
            </Question>

            <div
              className="memo mb-6"
              style={{
                borderColor: 'var(--vermillion)',
                background: 'rgba(212,69,42,0.04)',
              }}
            >
              <label
                className="flex gap-3 items-baseline cursor-pointer"
                style={{ color: 'var(--cream-text)', fontSize: '16px' }}
              >
                <input
                  type="checkbox"
                  checked={horsReseau}
                  onChange={(e) => onHorsReseau(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--vermillion)' }}
                />
                <span>
                  <strong
                    style={{
                      color: 'var(--vermillion)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10.5px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    Recommandé · filtre hors-réseau
                  </strong>
                  Ne pas afficher les appels réservés aux réseaux fermés
                  (Fémis, résidences cooptées, prix sur invitation), ni ceux
                  exigeant un appui institutionnel préalable.
                </span>
              </label>
            </div>

            <div
              className="hr-charcoal pt-5 mono-meta slug-muted"
            >
              Ces réponses ne sont jamais partagées. Elles servent uniquement
              à filtrer la base pour vous.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="filter-group-title">{label}</div>
      <div className="chip-picker">{children}</div>
    </div>
  )
}

function Radio({
  name,
  checked,
  onClick,
  label,
}: {
  name: string
  checked: boolean
  onClick: () => void
  label: string
}) {
  return (
    <label onClick={onClick}>
      <input type="radio" name={name} checked={checked} onChange={() => {}} />
      <span className="chip-label">{label}</span>
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP III — Géographie & cadence
// ─────────────────────────────────────────────────────────────────────────────

function ToggleChip({
  checked,
  onClick,
  label,
}: {
  checked: boolean
  onClick: () => void
  label: string
}) {
  return (
    <label onClick={onClick}>
      <input type="checkbox" checked={checked} onChange={() => {}} />
      <span className="chip-label">{label}</span>
    </label>
  )
}

function StepGeoCadence({
  regions,
  nationalOnly,
  international,
  frequency,
  sendWeekday,
  existingProfiles,
  preview,
  previewError,
  isPreviewPending,
  onPreview,
  onToggleRegion,
  onToggleNational,
  onToggleInternational,
  onFrequency,
  onSendWeekday,
}: {
  regions: Set<FrRegionCode>
  nationalOnly: boolean
  international: boolean
  frequency: Frequency
  sendWeekday: SendWeekday
  existingProfiles: AlertProfile[]
  preview: AlertProfilePreview | null
  previewError: string | null
  isPreviewPending: boolean
  onPreview: () => void
  onToggleRegion: (c: FrRegionCode) => void
  onToggleNational: () => void
  onToggleInternational: () => void
  onFrequency: (f: Frequency) => void
  onSendWeekday: (day: SendWeekday) => void
}) {
  return (
    <section className="band-cream">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-12 py-16 sm:py-24">
        {/* Géo */}
        <div className="grid grid-cols-12 gap-6 sm:gap-12 mb-16 sm:mb-20">
          <div className="col-span-12 md:col-span-4">
            <div className="slug mb-4">III · Géographie</div>
            <h2
              className="fraunces"
              style={{
                fontSize: 'clamp(28px, 3.4vw, 52px)',
                lineHeight: 1.05,
                fontWeight: 400,
                letterSpacing: '-0.02em',
              }}
            >
              Où
              <br />
              résidez-vous ?
            </h2>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p
              className="prose-cream mb-10"
              style={{
                fontSize: '16.5px',
                color: 'var(--muted-warm)',
                lineHeight: 1.65,
                maxWidth: '56ch',
              }}
            >
              Les fonds régionaux exigent une résidence ou un attachement au
              territoire. Les appels nationaux sont ouverts à tout·e
              résident·e en France. Cochez votre région, et les zones
              voisines où vous seriez prêt·e à candidater.
            </p>

            <div className="chip-picker">
              {REGION_ORDER.map((code) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={regions.has(code)}
                    onChange={() => onToggleRegion(code)}
                  />
                  <span className="chip-label">{FR_REGION_CODES[code]}</span>
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={nationalOnly}
                  onChange={onToggleNational}
                />
                <span className="chip-label">Appels nationaux</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={international}
                  onChange={onToggleInternational}
                />
                <span className="chip-label">
                  Résidences européennes &amp; internationales
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Cadence */}
        <div
          className="grid grid-cols-12 gap-6 sm:gap-12 pt-16 sm:pt-20"
          style={{ borderTop: '1px solid rgba(26,9,6,0.15)' }}
        >
          <div className="col-span-12 md:col-span-4">
            <div className="slug mb-4">Cadence</div>
            <h2
              className="fraunces"
              style={{
                fontSize: 'clamp(24px, 2.8vw, 44px)',
                lineHeight: 1.1,
                fontWeight: 400,
                letterSpacing: '-0.02em',
              }}
            >
              À quel rythme
              <br />
              voulez-vous lire ?
            </h2>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p
              className="prose-cream mb-10"
              style={{
                fontSize: '16.5px',
                color: 'var(--muted-warm)',
                lineHeight: 1.65,
                maxWidth: '56ch',
              }}
            >
              Le courriel est envoyé depuis une adresse humaine, sans tracking.
              Désinscription en un clic. Les guichets urgents sont signalés en
              vermillon dans l&apos;en-tête.
            </p>

            <div className="chip-picker">
              <Radio
                name="freq"
                checked={frequency === 'weekly'}
                onClick={() => onFrequency('weekly')}
                label="Chaque semaine"
              />
              <Radio
                name="freq"
                checked={frequency === 'biweekly'}
                onClick={() => onFrequency('biweekly')}
                label="Deux fois par mois"
              />
              <Radio
                name="freq"
                checked={frequency === 'monthly'}
                onClick={() => onFrequency('monthly')}
                label="Une fois par mois · synthèse longue"
              />
              <Radio
                name="freq"
                checked={frequency === 'urgent'}
                onClick={() => onFrequency('urgent')}
                label="Alerte immédiate · urgences seulement"
              />
            </div>

            {frequency !== 'urgent' && (
              <div className="mt-10">
                <div className="filter-group-title">Jour d'envoi</div>
                <div className="chip-picker">
                  {WEEKDAYS.map((day) => (
                    <Radio
                      key={day.value}
                      name="weekday"
                      checked={sendWeekday === day.value}
                      onClick={() => onSendWeekday(day.value)}
                      label={day.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {existingProfiles.length > 0 && (
              <div className="memo mt-10">
                <strong
                  style={{
                    display: 'block',
                    marginBottom: 12,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--vermillion)',
                  }}
                >
                  Alertes déjà configurées
                </strong>
                <div className="space-y-2">
                  {existingProfiles.slice(0, 6).map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-baseline justify-between gap-4 text-sm"
                      style={{ color: 'var(--cream-text)' }}
                    >
                      <span>{profile.name}</span>
                      <span className="mono-meta" style={{ color: 'var(--muted-warm)' }}>
                        {formatFrequencySummary(profile)}
                      </span>
                    </div>
                  ))}
                  {existingProfiles.length > 6 && (
                    <div className="mono-meta" style={{ color: 'var(--muted-warm)' }}>
                      +{existingProfiles.length - 6} autres alertes
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-10">
              <AlertProfilePreviewPanel
                preview={preview}
                error={previewError}
                isLoading={isPreviewPending}
                onPreview={onPreview}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function formatFrequencySummary(profile: AlertProfile): string {
  if (profile.frequency === 'daily') return 'quotidien'
  if (profile.frequency === 'deadline_only') return 'deadlines proches'
  const day = WEEKDAYS.find((item) => item.value === profile.send_weekday)
  return `hebdo · ${day?.label.toLowerCase() ?? 'lundi'}`
}
