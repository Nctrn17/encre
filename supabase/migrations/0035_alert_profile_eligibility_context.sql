-- Profil d'eligibilite pour eviter les faux "Tres adapte" sur les appels
-- reserves a une situation personnelle precise.

ALTER TABLE public.alert_profiles
  ADD COLUMN IF NOT EXISTS residency_context text NOT NULL DEFAULT 'france_metropole',
  ADD COLUMN IF NOT EXISTS nationality_context text NOT NULL DEFAULT 'france',
  ADD COLUMN IF NOT EXISTS gender_context text NOT NULL DEFAULT 'not_specified',
  ADD COLUMN IF NOT EXISTS professional_status_tags text[] NOT NULL DEFAULT ARRAY[]::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_profiles_residency_context_check'
  ) THEN
    ALTER TABLE public.alert_profiles
      ADD CONSTRAINT alert_profiles_residency_context_check
      CHECK (residency_context IN (
        'france_metropole',
        'outremer',
        'pays_du_sud',
        'international',
        'not_specified'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_profiles_nationality_context_check'
  ) THEN
    ALTER TABLE public.alert_profiles
      ADD CONSTRAINT alert_profiles_nationality_context_check
      CHECK (nationality_context IN (
        'france',
        'foreign',
        'pays_du_sud',
        'not_specified'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_profiles_gender_context_check'
  ) THEN
    ALTER TABLE public.alert_profiles
      ADD CONSTRAINT alert_profiles_gender_context_check
      CHECK (gender_context IN (
        'woman',
        'gender_minority',
        'woman_or_gender_minority',
        'not_specified'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alert_profiles_professional_status_tags
  ON public.alert_profiles USING gin (professional_status_tags);

COMMENT ON COLUMN public.alert_profiles.residency_context IS
  'Contexte de residence declare pour lire les opportunites reservees a un territoire ou une zone.';

COMMENT ON COLUMN public.alert_profiles.nationality_context IS
  'Contexte de nationalite declare pour lire les opportunites reservees a certains publics geographiques.';

COMMENT ON COLUMN public.alert_profiles.gender_context IS
  'Contexte de genre optionnel pour les programmes explicitement reserves ou prioritaires.';

COMMENT ON COLUMN public.alert_profiles.professional_status_tags IS
  'Statuts professionnels optionnels utiles a l eligibilite, par exemple sacd_member ou scam_member.';
