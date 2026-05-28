import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as dotenvConfig } from 'dotenv'

/**
 * Charge l'environnement depuis `.env.local` à la racine du projet.
 * Format dotenv standard, même fichier que celui lu par Next dev/build.
 *
 * `override: true` est crucial : sans ça, toute variable déjà définie au
 * niveau shell/OS l'emporte sur `.env.local`. Or l'utilisateur a parfois
 * d'autres projets qui exportent les mêmes noms de var (ex: GEMINI_API_KEY)
 * pour leur propre compte. On veut que le projet encre utilise toujours
 * SA clé, indépendamment du contexte shell.
 */
export function loadEnv(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath, override: true })
  }
}
