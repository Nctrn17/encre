-- ==========================================================================
-- Encre - profil de veille personnalise
-- ==========================================================================
-- Ces champs gardent la situation declaree dans l'onboarding. Ils servent a
-- produire une lecture metier des opportunites, pas seulement un filtre strict.

ALTER TABLE alert_profiles
  ADD COLUMN IF NOT EXISTS discipline_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS has_producer boolean,
  ADD COLUMN IF NOT EXISTS films_produced_count integer,
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS hors_reseau_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS candidate_mode text NOT NULL DEFAULT 'balanced';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'alert_profiles_films_produced_count_range'
      AND conrelid = 'public.alert_profiles'::regclass
  ) THEN
    ALTER TABLE alert_profiles
      ADD CONSTRAINT alert_profiles_films_produced_count_range
      CHECK (
        films_produced_count IS NULL
        OR (films_produced_count >= 0 AND films_produced_count <= 20)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'alert_profiles_age_range_values'
      AND conrelid = 'public.alert_profiles'::regclass
  ) THEN
    ALTER TABLE alert_profiles
      ADD CONSTRAINT alert_profiles_age_range_values
      CHECK (
        age_range IS NULL
        OR age_range IN ('under_30', '30_45', 'over_45', 'not_specified')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'alert_profiles_candidate_mode_values'
      AND conrelid = 'public.alert_profiles'::regclass
  ) THEN
    ALTER TABLE alert_profiles
      ADD CONSTRAINT alert_profiles_candidate_mode_values
      CHECK (candidate_mode IN ('strict', 'balanced', 'wide'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alert_profiles_discipline_tags
  ON alert_profiles USING GIN (discipline_tags);

COMMENT ON COLUMN alert_profiles.discipline_tags IS
  'Tags fins issus de l''onboarding scenario: court-metrage, long-metrage, serie, documentaire, animation, sonore, web.';

COMMENT ON COLUMN alert_profiles.has_producer IS
  'TRUE si l''utilisateur declare avoir un producteur attache au projet, FALSE sinon, NULL si indetermine.';

COMMENT ON COLUMN alert_profiles.films_produced_count IS
  'Nombre approximatif de films deja produits ou diffuses, utilise pour estimer l''accessibilite d''un appel.';

COMMENT ON COLUMN alert_profiles.age_range IS
  'Tranche d''age declaree, uniquement pour interpreter les appels avec limite d''age.';

COMMENT ON COLUMN alert_profiles.hors_reseau_only IS
  'TRUE si la veille doit privilegier les appels accessibles sans reseau, producteur, editeur ou cooptation.';

COMMENT ON COLUMN alert_profiles.candidate_mode IS
  'strict = tres adapte seulement, balanced = adapte + possible, wide = veille large avec avertissements.';
