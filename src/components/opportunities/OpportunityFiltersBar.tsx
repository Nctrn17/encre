'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FR_REGION_CODES, type FrRegionCode } from '@/lib/region-codes'

/**
 * Encre · barre de filtres horizontale pour /aides.
 *
 * Modèle Linear : une rangée de labels mono uppercase, chacun ouvre un
 * popover transient sous le label avec les options de cette facette.
 * Esprit Are.na : très peu de chrome au repos, le contenu (la liste) domine.
 *
 * État entièrement piloté par URL search params (Server Component compat).
 * Aucun state client autre que `open` (quel popover est ouvert).
 */

interface TypeOption {
  value: string
  label: string
}
interface DisciplineOption {
  tag: string
  label: string
}

const TYPE_OPTIONS: TypeOption[] = [
  { value: 'residence', label: 'Résidence' },
  { value: 'bourse', label: 'Bourse' },
  { value: 'subvention', label: 'Aide' },
  { value: 'concours', label: 'Concours' },
  { value: 'commande', label: 'Commande' },
  { value: 'prix', label: 'Prix' },
  // Type 'formation' ajouté en migration 0023 — couvre compagnonnages
  // (Cité Européenne des Scénaristes) et résidences-école (Series Mania
  // Institute Writers Campus / Eureka Series).
  { value: 'formation', label: 'Formation' },
]

const DISCIPLINE_OPTIONS: DisciplineOption[] = [
  { tag: 'scenario', label: 'Scénario' },
  { tag: 'long-metrage', label: 'Long métrage' },
  { tag: 'court-metrage', label: 'Court métrage' },
  { tag: 'serie', label: 'Série' },
  { tag: 'documentaire', label: 'Documentaire' },
  { tag: 'animation', label: 'Animation' },
  { tag: 'sonore', label: 'Sonore' },
  { tag: 'web', label: 'Web' },
]

const DEADLINE_OPTIONS = [
  { key: '', label: 'Toutes' },
  { key: '15', label: '< 15 j' },
  { key: '30', label: '< 1 mois' },
  { key: '90', label: '< 3 mois' },
] as const

const REGION_OPTIONS: FrRegionCode[] = [
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
]

type OpenId = 'type' | 'discipline' | 'region' | 'deadline' | 'horsreseau' | null

export interface OpportunityFiltersBarProps {
  types: string[]
  disciplinesTags: string[]
  sansProducteur: boolean
  sansEditeur: boolean
  premierProjet: boolean
  deadlineBucket: string | null
  regionCodes: string[]
}

export function OpportunityFiltersBar(props: OpportunityFiltersBarProps) {
  const router = useRouter()
  const pathname = usePathname() ?? '/aides'
  const searchParams = useSearchParams()
  const [open, setOpen] = useState<OpenId>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside ferme le popover
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function setParams(updates: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    for (const [key, value] of Object.entries(updates)) {
      params.delete(key)
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v))
      } else if (value !== null && value !== '') {
        params.set(key, value)
      }
    }
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function toggleArray(current: string[], value: string, paramKey: string) {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    setParams({ [paramKey]: next })
  }
  function toggleBool(current: boolean, paramKey: string) {
    setParams({ [paramKey]: current ? null : '1' })
  }
  /**
   * Pour les filtres « par défaut actif » (V1 launch : sans producteur,
   * sans éditeur). Le param URL stocke `0` quand l'utilisateur a
   * explicitement opt-out. Absence de param = filtre actif (défaut).
   */
  function toggleBoolDefaultOn(current: boolean, paramKey: string) {
    // current=true (filtre actif, défaut) → user décoche → param='0'
    // current=false (filtre désactivé) → user recoche → remove param
    setParams({ [paramKey]: current ? '0' : null })
  }
  function setBucket(k: string) {
    setParams({ d: k === '' ? null : k })
  }
  function resetAll() {
    setOpen(null)
    router.push(pathname)
  }

  // Compteurs d'options actives par facette
  const activeCounts = {
    type: props.types.length,
    discipline: props.disciplinesTags.length,
    region: props.regionCodes.length,
    deadline: props.deadlineBucket ? 1 : 0,
    // sansProducteur/sansEditeur sont actifs par défaut (V1 launch).
    // On ne compte comme « action utilisateur » QUE l'opt-out (= filtre
    // désactivé), pas l'état par défaut.
    horsreseau:
      (props.sansProducteur ? 0 : 1) +
      (props.sansEditeur ? 0 : 1) +
      (props.premierProjet ? 1 : 0),
  }
  const totalActive =
    activeCounts.type +
    activeCounts.discipline +
    activeCounts.region +
    activeCounts.deadline +
    activeCounts.horsreseau

  // Active pills
  const pills: Array<{ label: string; remove: () => void }> = []
  props.types.forEach((t) => {
    const opt = TYPE_OPTIONS.find((o) => o.value === t)
    pills.push({
      label: opt?.label ?? t,
      remove: () => toggleArray(props.types, t, 'type'),
    })
  })
  props.disciplinesTags.forEach((t) => {
    const opt = DISCIPLINE_OPTIONS.find((o) => o.tag === t)
    pills.push({
      label: opt?.label ?? t,
      remove: () => toggleArray(props.disciplinesTags, t, 'tag'),
    })
  })
  props.regionCodes.forEach((r) => {
    pills.push({
      label: FR_REGION_CODES[r as FrRegionCode] ?? r,
      remove: () => toggleArray(props.regionCodes, r, 'region'),
    })
  })
  if (props.deadlineBucket) {
    const opt = DEADLINE_OPTIONS.find((o) => o.key === props.deadlineBucket)
    pills.push({
      label: opt?.label ?? props.deadlineBucket,
      remove: () => setBucket(''),
    })
  }
  // Pills uniquement pour les opt-outs explicites du défaut V1
  if (!props.sansProducteur) {
    pills.push({
      label: 'Avec aides via producteur',
      remove: () => toggleBoolDefaultOn(false, 'np'),
    })
  }
  if (!props.sansEditeur) {
    pills.push({
      label: 'Avec aides via éditeur',
      remove: () => toggleBoolDefaultOn(false, 'ne'),
    })
  }
  if (props.premierProjet) {
    pills.push({ label: 'Premier projet', remove: () => toggleBool(true, 'pp') })
  }

  return (
    <div ref={containerRef} style={wrapStyle}>
      <div style={rowStyle} role="toolbar" aria-label="Filtres">
        <span style={rowPrefixStyle} aria-hidden="true">
          Filtrer :
        </span>

        <FilterTrigger
          label="Type"
          count={TYPE_OPTIONS.length}
          activeCount={activeCounts.type}
          isOpen={open === 'type'}
          onClick={() => setOpen(open === 'type' ? null : 'type')}
        >
          <FilterPanel label="Type">
            {TYPE_OPTIONS.map((t) => (
              <PanelCheckbox
                key={t.value}
                label={t.label}
                checked={props.types.includes(t.value)}
                onChange={() => toggleArray(props.types, t.value, 'type')}
              />
            ))}
          </FilterPanel>
        </FilterTrigger>

        <FilterTrigger
          label="Discipline"
          count={DISCIPLINE_OPTIONS.length}
          activeCount={activeCounts.discipline}
          isOpen={open === 'discipline'}
          onClick={() => setOpen(open === 'discipline' ? null : 'discipline')}
        >
          <FilterPanel label="Discipline">
            {DISCIPLINE_OPTIONS.map((d) => (
              <PanelCheckbox
                key={d.tag}
                label={d.label}
                checked={props.disciplinesTags.includes(d.tag)}
                onChange={() => toggleArray(props.disciplinesTags, d.tag, 'tag')}
              />
            ))}
          </FilterPanel>
        </FilterTrigger>

        <FilterTrigger
          label="Région"
          count={REGION_OPTIONS.length}
          activeCount={activeCounts.region}
          isOpen={open === 'region'}
          onClick={() => setOpen(open === 'region' ? null : 'region')}
        >
          <FilterPanel label="Région">
            {REGION_OPTIONS.map((code) => (
              <PanelCheckbox
                key={code}
                label={FR_REGION_CODES[code] ?? code}
                checked={props.regionCodes.includes(code)}
                onChange={() => toggleArray(props.regionCodes, code, 'region')}
              />
            ))}
          </FilterPanel>
        </FilterTrigger>

        <FilterTrigger
          label="Échéance"
          count={DEADLINE_OPTIONS.length - 1}
          activeCount={activeCounts.deadline}
          isOpen={open === 'deadline'}
          onClick={() => setOpen(open === 'deadline' ? null : 'deadline')}
        >
          <FilterPanel label="Échéance">
            {DEADLINE_OPTIONS.map((d) => (
              <PanelRadio
                key={d.key || 'all'}
                label={d.label}
                checked={(props.deadlineBucket ?? '') === d.key}
                onChange={() => setBucket(d.key)}
                name="deadline"
              />
            ))}
          </FilterPanel>
        </FilterTrigger>

        <FilterTrigger
          label="Hors réseau"
          count={3}
          activeCount={activeCounts.horsreseau}
          isOpen={open === 'horsreseau'}
          onClick={() => setOpen(open === 'horsreseau' ? null : 'horsreseau')}
        >
          <FilterPanel label="Hors réseau">
            <PanelCheckbox
              label="Sans producteur"
              checked={props.sansProducteur}
              onChange={() => toggleBoolDefaultOn(props.sansProducteur, 'np')}
            />
            <PanelCheckbox
              label="Sans éditeur"
              checked={props.sansEditeur}
              onChange={() => toggleBoolDefaultOn(props.sansEditeur, 'ne')}
            />
            <PanelCheckbox
              label="Premier projet"
              checked={props.premierProjet}
              onChange={() => toggleBool(props.premierProjet, 'pp')}
            />
          </FilterPanel>
        </FilterTrigger>
      </div>

      {totalActive > 0 && (
        <div style={pillsRowStyle}>
          {pills.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={p.remove}
              style={pillStyle}
              className="opp-filter-pill"
            >
              {p.label} <span style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetAll}
            style={clearAllStyle}
            className="opp-filter-clear"
          >
            Tout effacer →
          </button>
        </div>
      )}
    </div>
  )
}

function FilterTrigger({
  label,
  count,
  activeCount,
  isOpen,
  onClick,
  children,
}: {
  label: string
  count: number
  activeCount: number
  isOpen: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const isActive = activeCount > 0
  return (
    <div style={triggerWrapStyle}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="opp-filter-trigger"
        style={{
          ...triggerStyle,
          color: isActive || isOpen ? 'var(--vermillion)' : 'var(--ink)',
          borderBottomColor: isOpen ? 'var(--vermillion)' : 'transparent',
        }}
      >
        {label}
        <span style={triggerCountStyle}>
          {' · '}
          {isActive ? `${activeCount}/${count}` : count}
        </span>
        <span
          aria-hidden="true"
          style={{
            ...chevronStyle,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>
      {isOpen && children}
    </div>
  )
}

function FilterPanel({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="group" aria-label={label} style={panelStyle} className="opp-filter-panel">
      <ul style={panelListStyle}>{children}</ul>
    </div>
  )
}

function PanelCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <li style={panelItemStyle} className="opp-filter-item">
      <label style={panelLabelStyle}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          style={inputStyle}
        />
        <span>{label}</span>
      </label>
    </li>
  )
}

function PanelRadio({
  label,
  checked,
  onChange,
  name,
}: {
  label: string
  checked: boolean
  onChange: () => void
  name: string
}) {
  return (
    <li style={panelItemStyle} className="opp-filter-item">
      <label style={panelLabelStyle}>
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          style={inputStyle}
        />
        <span>{label}</span>
      </label>
    </li>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────

const wrapStyle: CSSProperties = {
  position: 'relative',
  marginBottom: 28,
  paddingBottom: 14,
  borderBottom: '1px solid var(--ink-rule)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 4,
}

const rowPrefixStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-soft)',
  paddingRight: 6,
  userSelect: 'none',
}

const triggerWrapStyle: CSSProperties = {
  position: 'relative',
}

const triggerStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid transparent',
  padding: '8px 14px 6px',
  cursor: 'pointer',
  transition: 'color 140ms var(--ease-out), border-color 140ms var(--ease-out)',
}

const triggerCountStyle: CSSProperties = {
  color: 'inherit',
  opacity: 0.55,
  fontWeight: 400,
}

const chevronStyle: CSSProperties = {
  display: 'inline-block',
  marginLeft: 8,
  fontSize: '0.95rem',
  lineHeight: 1,
  opacity: 0.65,
  transition: 'transform 180ms var(--ease-out)',
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 20,
  minWidth: 220,
  maxWidth: 280,
  maxHeight: '60vh',
  overflowY: 'auto',
  background: 'var(--paper)',
  border: '1px solid var(--ink)',
  padding: '12px 14px 14px',
  boxShadow: '0 6px 22px rgba(28, 24, 23, 0.08)',
  transformOrigin: 'top left',
}

const panelListStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
}

const panelItemStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  padding: '6px 0',
  cursor: 'pointer',
  transition: 'color 140ms var(--ease-out)',
}

const panelLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  cursor: 'pointer',
}

const inputStyle: CSSProperties = {
  accentColor: 'var(--vermillion)',
  width: 12,
  height: 12,
  flex: '0 0 auto',
  cursor: 'pointer',
}

const pillsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 14,
  alignItems: 'center',
}

const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 9px',
  border: '1px solid var(--vermillion)',
  color: 'var(--vermillion)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: 'transparent',
  cursor: 'pointer',
  transition:
    'background 140ms var(--ease-out), color 140ms var(--ease-out), transform 100ms var(--ease-out)',
}

const clearAllStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-soft)',
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
  padding: '4px 0',
  marginLeft: 4,
  transition: 'color 140ms var(--ease-out)',
}
