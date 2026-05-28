-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- pg_cron doit être activé côté projet Supabase Pro
-- (décommenter si dispo localement)
-- CREATE EXTENSION IF NOT EXISTS "pg_cron";
