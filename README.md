# Encre

Encre est un agrégateur francophone d'appels à projets, résidences d'artistes,
bourses, prix et aides à l'écriture, destiné aux scénaristes et aux auteurs de
l'audiovisuel (cinéma, série, documentaire, animation, création sonore,
narration web).

L'objectif : rendre accessibles, claires et actionnables les aides qui
circulent habituellement de bouche-à-oreille dans des réseaux fermés, pour
celles et ceux qui créent sans y avoir accès.

## Stack

| Couche | Choix |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript strict |
| Styling | Tailwind CSS v4 |
| Backend / DB | Supabase (Postgres, Auth, RLS) |
| Recherche | Postgres FTS (tsvector) + pgvector (déduplication sémantique) |
| Classification | LLM (Google AI Studio / OpenRouter) pour structurer les fiches |
| Emails | Resend + React Email |
| Déploiement | Vercel |

## Architecture du pipeline

```
Sources externes (API / RSS / HTML / PDF)
  ↓ ingestion
table raw_items (payload brut)
  ↓ traitement (normalize, fingerprint, dedup, classification LLM, embeddings)
table opportunities (source de vérité)
  ↓
Next.js ISR + recherche (tsvector + pgvector)
  ↓
digests email (Resend)
```

La couche d'ingestion par source (scrapers spécifiques) n'est pas incluse dans
ce dépôt public. Ce dépôt couvre l'application, le pipeline de traitement
générique, le schéma de base de données et les scripts d'outillage.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés
npm run dev                  # http://localhost:4000
```

Vérifications :

```bash
npm run typecheck
npm test
npm run build
```

## Structure

```
src/
  app/            Pages App Router (public, app authentifiée, API routes)
  features/       Logique métier par domaine (opportunités, alertes, sources)
  lib/            Pipeline de traitement, normalisation, helpers, types
  components/     Composants UI
scrapers/lib/     Utilitaires d'ingestion génériques (fetch, parsing, extraction)
scripts/          Outillage (enrichissement, audits, backfill, digests)
supabase/         Migrations SQL (schéma, RLS, fonctions)
tests/            Tests Vitest
```

## Conventions

- TypeScript strict, immutabilité, fichiers courts organisés par domaine.
- Server Components par défaut, `'use client'` seulement si nécessaire.
- Zod sur toutes les entrées API.
- Validation des entrées aux frontières du système.

## Licence

[AGPL-3.0](./LICENSE). Toute version modifiée déployée comme service réseau
doit rendre son code source disponible.
