import { Resend } from 'resend'
import { absoluteUrl } from '@/lib/site'

/**
 * Mail de bienvenue envoyé à une nouvelle inscription waitlist.
 *
 * Objectif : ne plus laisser les inscrits dans le vide. Aujourd'hui la waitlist
 * ne déclenche rien ; ce mail accueille la personne et l'oriente vers la
 * création d'une alerte (seul moyen de recevoir le digest hebdo).
 *
 * Non bloquant : un échec d'envoi ne doit JAMAIS faire échouer l'inscription
 * (le caller catch et logue). No-op si Resend n'est pas configuré (dev local),
 * pour ne pas casser la capture.
 */
export async function sendWaitlistWelcome(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    console.warn('[waitlist-welcome] Resend non configuré, mail de bienvenue ignoré')
    return
  }

  const registreUrl = absoluteUrl('/aides')
  const alerteUrl = absoluteUrl('/onboarding')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Bienvenue sur Encre',
    html: renderWelcomeHtml(registreUrl, alerteUrl),
    text: renderWelcomeText(registreUrl, alerteUrl),
  })
  if (error) throw new Error(error.message)
}

const TEXT_COLOR = '#2b2b2b'
const ACCENT = '#c0392b'
const MUTED = '#6b6b6b'

function renderWelcomeHtml(registreUrl: string, alerteUrl: string): string {
  const link = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;font-size:15px;color:${ACCENT};text-decoration:none;border-bottom:1px solid ${ACCENT};padding-bottom:1px;">${label}</a>`

  return `<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:only light;supported-color-schemes:only light}</style></head><body style="margin:0;padding:0;background:#f7f4ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:36px;font-family:Georgia,'Times New Roman',serif;color:${TEXT_COLOR};">
        <tr><td>
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};margin-bottom:24px;">Encre</div>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Merci de votre intérêt pour Encre.</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Le registre est en ligne : les bourses, résidences, prix et appels à projets ouverts pour les scénaristes et les auteurs de l'audiovisuel, classés par date limite et mis à jour chaque jour.</p>
          <p style="margin:0 0 24px;">${link(registreUrl, 'Parcourir le registre')}</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Chaque semaine, vous recevrez par email les nouvelles opportunités ouvertes. Pour ne recevoir que ce qui correspond à votre profil (discipline, région, situation), créez une alerte : cela prend deux minutes.</p>
          <p style="margin:0 0 28px;">${link(alerteUrl, 'Créer mon alerte')}</p>
          <p style="font-size:16px;line-height:1.6;margin:0;color:${MUTED};">À bientôt,<br/>Encre</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`
}

function renderWelcomeText(registreUrl: string, alerteUrl: string): string {
  return [
    'Bonjour,',
    '',
    'Merci de votre intérêt pour Encre.',
    '',
    "Le registre est en ligne : les bourses, résidences, prix et appels à projets ouverts pour les scénaristes et les auteurs de l'audiovisuel, classés par date limite et mis à jour chaque jour.",
    `Parcourir le registre : ${registreUrl}`,
    '',
    'Chaque semaine, vous recevrez par email les nouvelles opportunités ouvertes. Pour ne recevoir que ce qui correspond à votre profil (discipline, région, situation), créez une alerte : cela prend deux minutes.',
    `Créer mon alerte : ${alerteUrl}`,
    '',
    'À bientôt,',
    'Encre',
  ].join('\n')
}
