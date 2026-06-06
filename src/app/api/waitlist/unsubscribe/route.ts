import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Désinscription du broadcast waitlist.
 *
 *   GET  ?token=<uuid> → page de confirmation (bouton qui POST). Le GET ne
 *                        désinscrit PAS : un GET peut être pré-fetché par les
 *                        scanners mail et provoquerait des désinscriptions
 *                        accidentelles.
 *   POST ?token=<uuid> → désinscrit (idempotent). Sert aussi le one-click natif
 *                        (List-Unsubscribe-Post, RFC 8058) déclenché par Gmail /
 *                        Apple Mail.
 *
 * Pas d'auth : le jeton EST l'autorisation. Réponse identique que le jeton
 * existe ou non (pas d'oracle d'énumération).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token')
  if (!token || !UUID_RE.test(token)) {
    return htmlResponse(invalidPage(), 400)
  }

  try {
    const supabase = createServiceClient()
    await supabase
      .from('waitlist')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('unsub_token', token)
      .is('unsubscribed_at', null)
  } catch (err) {
    console.error('[waitlist/unsubscribe] failed:', (err as Error).message)
    // On reste rassurant côté user : la désinscription sera retentée au prochain clic.
    return htmlResponse(errorPage(), 500)
  }

  return htmlResponse(donePage())
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token')
  if (!token || !UUID_RE.test(token)) {
    return htmlResponse(invalidPage(), 400)
  }
  return htmlResponse(confirmPage(token))
}

// ==========================================================================
// Pages (HTML autonome, sans dépendance — tonalité éditoriale sobre)
// ==========================================================================

function htmlResponse(body: string, status = 200): Response {
  return new Response(page(body), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function page(inner: string): string {
  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Désinscription · Encre</title>
<style>
  body{margin:0;background:#f7f4ee;color:#2b2b2b;font-family:Georgia,'Times New Roman',serif;}
  .wrap{max-width:520px;margin:0 auto;padding:64px 20px;}
  .card{background:#fff;border-radius:8px;padding:36px;}
  .kicker{font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6b6b;margin-bottom:24px;}
  h1{font-size:22px;margin:0 0 12px;font-weight:600;}
  p{font-size:16px;line-height:1.6;color:#2b2b2b;}
  .muted{color:#6b6b6b;font-size:14px;}
  button{font:inherit;font-size:15px;cursor:pointer;background:#0c5c4a;color:#fff;border:0;border-radius:6px;padding:12px 20px;margin-top:8px;}
  a{color:#0c5c4a;}
</style></head><body><div class="wrap"><div class="card">
<div class="kicker">Encre</div>${inner}
</div></div></body></html>`
}

function confirmPage(token: string): string {
  const action = `/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`
  return `<h1>Se désinscrire</h1>
<p>Vous ne recevrez plus les nouvelles opportunités par email.</p>
<form method="post" action="${action}">
  <button type="submit">Confirmer la désinscription</button>
</form>
<p class="muted">Vous pourrez vous réinscrire à tout moment depuis le site.</p>`
}

function donePage(): string {
  return `<h1>C'est fait</h1>
<p>Vous êtes désinscrit. Vous ne recevrez plus d'emails d'opportunités.</p>
<p class="muted">Changé d'avis ? <a href="/">Retourner sur Encre</a>.</p>`
}

function invalidPage(): string {
  return `<h1>Lien invalide</h1>
<p>Ce lien de désinscription n'est pas valide ou a expiré.</p>
<p class="muted"><a href="/">Retourner sur Encre</a></p>`
}

function errorPage(): string {
  return `<h1>Une erreur est survenue</h1>
<p>La désinscription n'a pas pu aboutir. Réessayez dans un instant.</p>
<p class="muted"><a href="/">Retourner sur Encre</a></p>`
}
