'use client'

import { useState, useTransition, useRef, type CSSProperties } from 'react'
import { sendMagicLink, signInWithPassword } from '@/features/auth/actions'

export function ConnexionForm({ next }: { next: string }) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<
    { ok: true; email: string } | { error: string } | null
  >(null)
  // Conservé entre soumissions ratées pour ne pas faire retaper l'email
  const [emailValue, setEmailValue] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    const email = String(formData.get('email') ?? '')
    setEmailValue(email)
    startTransition(async () => {
      const result = await signInWithPassword(formData)
      // Succès → redirect serveur, on n'arrive pas ici
      if (result && 'error' in result) setFeedback(result)
    })
  }

  /**
   * Fallback : utilise l'email actuellement tapé pour envoyer un magic
   * link. Si l'email est vide ou invalide, on bascule juste le focus
   * sur le champ pour signaler.
   */
  function handleMagicLinkFallback() {
    const email = emailValue.trim()
    if (!email) {
      const input = formRef.current?.elements.namedItem('email') as HTMLInputElement | null
      input?.focus()
      setFeedback({ error: 'Saisissez votre email pour recevoir un lien.' })
      return
    }
    const fd = new FormData()
    fd.set('email', email)
    fd.set('next', next)
    startTransition(async () => {
      const result = await sendMagicLink(fd)
      setFeedback(result as typeof feedback)
    })
  }

  if (feedback && 'ok' in feedback && feedback.ok) {
    return (
      <div style={successStyle}>
        <div style={successLabelStyle}>Lien envoyé</div>
        <p style={successBodyStyle}>
          Consultez votre boîte mail{' '}
          <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {feedback.email}
          </strong>
          . Le lien est valide une heure.
        </p>
      </div>
    )
  }

  return (
    <form ref={formRef} action={handleSubmit} style={formStyle}>
      <input type="hidden" name="next" value={next} />

      {(() => {
        const hasError = Boolean(feedback && 'error' in feedback)
        return (
          <>
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="vous@domaine.fr"
                autoComplete="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? 'connexion-error' : undefined}
                style={inputStyle}
              />
            </Field>

            <Field label="Mot de passe" htmlFor="password">
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? 'connexion-error' : undefined}
                style={inputStyle}
              />
            </Field>

            {feedback && 'error' in feedback && (
              <div
                id="connexion-error"
                role="alert"
                aria-live="assertive"
                style={errorStyle}
              >
                {feedback.error}
              </div>
            )}
          </>
        )
      })()}

      <button type="submit" disabled={isPending} style={submitStyle}>
        {isPending ? 'Connexion…' : 'Se connecter →'}
      </button>

      <button
        type="button"
        onClick={handleMagicLinkFallback}
        disabled={isPending}
        style={fallbackStyle}
        className="link"
      >
        Mot de passe oublié ? Recevoir un lien par email
      </button>

      <p style={legalStyle}>
        En vous connectant, vous acceptez les{' '}
        <a href="/cgu" className="link" style={legalLinkStyle}>
          CGU
        </a>{' '}
        et la politique de{' '}
        <a
          href="/donnees-personnelles"
          className="link"
          style={legalLinkStyle}
        >
          confidentialité
        </a>
        .
      </p>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div style={fieldStyle}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  )
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  fontWeight: 500,
}

const inputStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontFeatureSettings: '"onum"',
  fontSize: '1rem',
  lineHeight: 1.4,
  padding: '12px 14px',
  border: '1px solid var(--ink-rule)',
  background: 'var(--paper-soft)',
  color: 'var(--ink)',
  // WCAG 2.4.7 : pas d'outline:none ici. Le :focus-visible global (vermillion)
  // s'applique au clavier sans perturber le hover/clic souris.
  borderRadius: 0,
}

const submitStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 500,
  padding: '14px 18px',
  border: '1px solid var(--vermillion)',
  background: 'var(--vermillion)',
  color: 'var(--paper)',
  cursor: 'pointer',
  marginTop: 8,
  transition: 'background 140ms var(--ease-out), transform 100ms var(--ease-out)',
}

const fallbackStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  color: 'var(--ink-soft)',
  background: 'transparent',
  border: 0,
  padding: '6px 0',
  cursor: 'pointer',
  textAlign: 'center',
  alignSelf: 'center',
}

const errorStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.04em',
  color: 'var(--vermillion)',
  border: '1px solid var(--vermillion)',
  padding: '10px 14px',
  background: 'transparent',
}

const successStyle: CSSProperties = {
  border: '1px solid var(--ink-rule)',
  padding: '20px 22px',
  background: 'var(--paper-soft)',
}

const successLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--vermillion)',
  marginBottom: 8,
  fontWeight: 500,
}

const successBodyStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '0.96rem',
  lineHeight: 1.55,
  color: 'var(--ink)',
  margin: 0,
}

const legalStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontFeatureSettings: '"onum"',
  fontSize: '0.78rem',
  lineHeight: 1.5,
  color: 'var(--ink-soft)',
  textAlign: 'center',
  marginTop: 14,
}

const legalLinkStyle: CSSProperties = {
  color: 'var(--ink)',
  fontStyle: 'italic',
}
