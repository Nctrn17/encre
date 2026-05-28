'use client'

import { useState } from 'react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

/**
 * Waitlist form simplifié pour la hero Plateau - une seule ligne email
 * avec bouton Fraunces →. Pas de multi-select discipline/région ici,
 * l'utilisateur affinera son profil via /onboarding après inscription.
 */
export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg(null)
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          disciplines: [],
          region_codes: [],
          source: typeof window !== 'undefined' ? window.location.pathname : 'direct',
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${response.status}`)
      }
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg((err as Error).message)
    }
  }

  if (status === 'success') {
    return (
      <div className="max-w-[680px]" role="status" aria-live="polite">
        <div
          className="fraunces-italic text-[20px]"
          style={{ color: 'var(--ink)' }}
        >
          Merci. Un email à l&apos;ouverture publique.
        </div>
        <div
          className="mono-meta mt-3"
          style={{ color: 'var(--ink-muted)' }}
        >
          Vous pouvez affiner votre veille en attendant,{' '}
          <a href="/onboarding" className="link" style={{ color: 'var(--vermillion)' }}>
            composer une veille →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[680px]">
      <form
        onSubmit={handleSubmit}
        className="form-line-paper flex items-baseline gap-6 pb-3"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@courriel.fr"
          aria-label="Votre adresse email"
          aria-invalid={status === 'error' || undefined}
          aria-describedby={status === 'error' ? 'waitlist-error' : undefined}
          className="encre-input flex-1 fraunces-text text-[20px] py-2"
          style={{ color: 'var(--ink)' }}
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="fraunces text-[22px] hover:opacity-70 transition"
          style={{ color: 'var(--vermillion)' }}
          aria-label="S'abonner à la revue de la semaine"
        >
          {status === 'submitting' ? '…' : '→'}
        </button>
      </form>
      <div
        className="mono-meta mt-4"
        style={{ color: 'var(--ink-muted)' }}
      >
        Désinscription en un clic. Ni revente, ni tracking tiers.
      </div>
      {status === 'error' && errorMsg && (
        <div
          id="waitlist-error"
          role="alert"
          aria-live="assertive"
          className="mono-meta mt-2"
          style={{ color: 'var(--vermillion)' }}
        >
          Erreur : {errorMsg}
        </div>
      )}
    </div>
  )
}
