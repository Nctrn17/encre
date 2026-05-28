-- Jour d'envoi des alertes hebdomadaires.
-- Convention ISO: 1 = lundi, 7 = dimanche.

ALTER TABLE alert_profiles
  ADD COLUMN IF NOT EXISTS send_weekday integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alert_profiles_send_weekday_range'
      AND conrelid = 'public.alert_profiles'::regclass
  ) THEN
    ALTER TABLE alert_profiles
      ADD CONSTRAINT alert_profiles_send_weekday_range
      CHECK (send_weekday BETWEEN 1 AND 7);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alert_profiles_weekly_send_day
  ON alert_profiles (send_weekday)
  WHERE frequency = 'weekly' AND is_active = true;

COMMENT ON COLUMN alert_profiles.send_weekday IS
  'Jour ISO d''envoi des alertes hebdomadaires: 1=lundi, 7=dimanche.';
