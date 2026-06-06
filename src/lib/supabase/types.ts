/**
 * Types DB générés depuis Supabase.
 * Stub initial — à régénérer avec `npm run db:types` une fois Supabase connecté.
 *
 * NOTE: tant que les types ne sont pas générés, les `as any` sont tolérés
 * dans le code (cf. problèmes connus du projet).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      sources: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      // Vue publique (migration 0037) : sources actives, config purgée de ses
      // clés sensibles. Lue par le client anon (page /sources).
      sources_public: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      raw_items: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      opportunities: {
        Row: {
          id: string
          slug: string
          title: string
          description: string | null
          emitter: string
          emitter_slug: string
          type: 'residence' | 'subvention' | 'bourse' | 'commande' | 'concours' | 'prix' | 'formation'
          disciplines: string[]
          audience: string[]
          geo_scope: 'local' | 'regional' | 'national' | 'metropole' | 'europe' | 'international'
          region_code: string | null
          amount_min: number | null
          amount_max: number | null
          currency: string
          deadline: string | null
          published_at: string
          source_url: string
          mirror_urls: string[]
          fingerprint: string
          classify_confidence: number | null
          human_review: boolean
          is_published: boolean
          created_at: string
          updated_at: string
          // ── Champs pilote scénariste (migration 0011) ──────────────
          // Marqués optionnels car ils peuvent être absents des fixtures de tests
          // et de toute Row sélectionnée avant application de la migration.
          hors_reseau_friendly?: boolean
          min_films_produits?: number | null
          requires_producer?: boolean
          age_max?: number | null
          disciplines_tags?: string[]
          // ── Sections structurées (migration 0018) ──────────────────
          // Optionnels pour la même raison : compat fixtures pré-migration.
          conditions?: string[]
          calendrier?: string[]
          dossier?: string[]
          // ── Filtre auteurs littéraires (migration 0019) ────────────
          requires_editor?: boolean
          // ── Statut prochaine édition (migration 0022) ──────────────
          // null = cycle ouvert avec toutes infos. 'awaiting_details' = la
          // prochaine édition est annoncée mais ses modalités ne sont pas
          // encore publiées ; UI affiche un bandeau d'alerte au-dessus
          // des sections conditions/calendrier/dossier.
          next_edition_status?: 'open' | 'awaiting_details' | null
          eligibility_profile?: Json | null
          eligibility_summary?: string | null
          eligibility_confidence?: 'explicit' | 'inferred' | 'unknown' | null
          // ── État `rejected` (migration 0040) ───────────────────────
          // Pierre tombale : annonce écartée par curation humaine. Ligne
          // conservée (fingerprint bloque la recréation) mais jamais
          // republiée ni reproposée. Optionnel : compat fixtures pré-migration.
          rejected?: boolean
        }
        Insert: any
        Update: any
        Relationships: []
      }
      opportunity_embeddings: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          display_name: string | null
          role: 'user' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: any
        Update: any
        Relationships: []
      }
      alert_profiles: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      saved_opportunities: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      pending_digests: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      waitlist: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      daily_counters: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      search_queries: {
        Row: {
          id: string
          query: string
          normalized_query: string
          result_count: number
          filters: Json
          page_path: string
          created_at: string
        }
        Insert: {
          id?: string
          query: string
          normalized_query: string
          result_count?: number
          filters?: Json
          page_path?: string
          created_at?: string
        }
        Update: {
          id?: string
          query?: string
          normalized_query?: string
          result_count?: number
          filters?: Json
          page_path?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      search_similar_opportunities: {
        Args: {
          query_embedding: number[]
          match_count: number
          min_similarity: number
        }
        Returns: Array<{ opportunity_id: string; similarity: number }>
      }
      increment_daily_counter: {
        Args: { counter_name_param: string; by_amount: number }
        Returns: number
      }
      search_opportunities_fuzzy: {
        Args: { q: string }
        Returns: Array<{ id: string; score: number }>
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Shortcuts
export type Opportunity = Database['public']['Tables']['opportunities']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
