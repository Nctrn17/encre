import tseslint from 'typescript-eslint'

/**
 * Config flat lean basée sur typescript-eslint (sans eslint-config-next, qui
 * déclenche un bug de validation circulaire sous ESLint 9 + FlatCompat).
 * Couvre les règles à plus forte valeur : variables/imports inutilisés, types
 * dangereux. Volontairement non type-checked (rapide en CI, pas de projet TS à
 * charger). Les règles susceptibles d'apparaître sur du code stable sont en
 * `warn` (ESLint ne fait échouer la CI que sur les erreurs).
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'src/lib/supabase/types.ts', // stub manuel, à régénérer via db:types
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Le codebase utilise volontairement des expressions courtes
      // `condition && action()` ; on garde le signal en warning.
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },
)
