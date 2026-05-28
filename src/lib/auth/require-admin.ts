/**
 * Garde d'authentification pour les pages admin.
 *
 * Pattern : appeler `await requireAdmin()` en début de Server Component.
 *   - Pas connecté → redirect vers /connexion?next=…
 *   - Connecté mais profile.role !== 'admin' → throw RestrictedAccessError
 *     que l'appelant catch et rend en page 403 sobre.
 *
 * Centralise la logique pour éviter qu'une nouvelle page admin oublie
 * la vérification du rôle (gros risque de fuite de données).
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export class RestrictedAccessError extends Error {
  constructor() {
    super('Accès restreint : rôle admin requis')
    this.name = 'RestrictedAccessError'
  }
}

export interface AdminUser {
  id: string
  email: string | null
}

/**
 * Garantit qu'un user admin est connecté. Retourne `{ id, email }` du
 * user courant si OK. Sinon : redirect (pas connecté) ou throw
 * RestrictedAccessError (rôle insuffisant).
 *
 * Utilisation dans un Server Component :
 *   try {
 *     const admin = await requireAdmin()
 *     // ...
 *   } catch (e) {
 *     if (e instanceof RestrictedAccessError) return <AdminAccessDenied />
 *     throw e
 *   }
 */
/**
 * @param redirectAfterLogin chemin vers lequel revenir après /connexion
 *   (par défaut '/admin'). Passer le path de la page admin courante
 *   pour que l'utilisateur revienne au bon endroit après auth.
 */
export async function requireAdmin(
  redirectAfterLogin: string = '/admin',
): Promise<AdminUser> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/connexion?next=${encodeURIComponent(redirectAfterLogin)}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin') {
    throw new RestrictedAccessError()
  }

  return { id: user.id, email: user.email ?? null }
}
