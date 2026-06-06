/**
 * Set le password d'un user Supabase via l'API admin (service role key).
 * Évite le flow password-recovery email qui pointe vers localhost si la
 * Site URL Supabase n'a pas été configurée.
 *
 * Usage :
 *   npx tsx scripts/set-admin-password.ts <email> <password>
 *
 * Exemple :
 *   npx tsx scripts/set-admin-password.ts admin@example.com 'monMotDePasse123'
 *
 * Le password doit faire au moins 8 caractères. Mets-le entre guillemets
 * simples si jamais il contient des caractères spéciaux ($ ! & etc.).
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const [, , email, password] = process.argv
  if (!email || !password) {
    console.error('Usage : npx tsx scripts/set-admin-password.ts <email> <password>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password doit faire au moins 8 caractères.')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Récupère le user par email via l'API admin
  const { data: list, error: listErr } = await sb.auth.admin.listUsers()
  if (listErr) { console.error(listErr); process.exit(1) }

  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`User non trouvé pour email : ${email}`)
    process.exit(1)
  }

  console.log(`Found user ${user.email} (id ${user.id.slice(0, 8)}…)`)

  const { error: updateErr } = await sb.auth.admin.updateUserById(user.id, {
    password,
  })
  if (updateErr) { console.error(updateErr); process.exit(1) }

  console.log(`✓ Password mis à jour pour ${user.email}.`)
  console.log(`  Tu peux maintenant te connecter sur /connexion via le toggle "J'ai un mot de passe".`)
}

main().catch((e) => { console.error(e); process.exit(1) })
