-- ==========================================================================
-- RLS policies
-- Principe général :
--   - opportunities / opportunity_embeddings : lecture publique si publié
--   - profiles / alert_profiles / saved_opportunities : propriétaire uniquement
--   - sources / raw_items / pending_digests / daily_counters : service_role only
--   - waitlist : insert public, lecture service_role
-- ==========================================================================

-- Opportunités : lecture publique si publiées
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunities_public_read" ON opportunities
  FOR SELECT
  USING (is_published = true);

CREATE POLICY "opportunities_admin_write" ON opportunities
  FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM profiles WHERE role = 'admin')
  )
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM profiles WHERE role = 'admin')
  );

-- Embeddings : lecture publique (via RPC recherche sémantique)
ALTER TABLE opportunity_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embeddings_public_read" ON opportunity_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM opportunities
      WHERE opportunities.id = opportunity_embeddings.opportunity_id
        AND opportunities.is_published = true
    )
  );

-- Profiles : self-access
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "profiles_self_write" ON profiles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_self_insert" ON profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Alert profiles : self-access
ALTER TABLE alert_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_profiles_owner_all" ON alert_profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Saved opportunities : self-access
ALTER TABLE saved_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_opportunities_owner_all" ON saved_opportunities
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Sources : service_role only (pas de policy user)
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
-- No user policies — seul le service_role bypass RLS

-- Raw items : service_role only
ALTER TABLE raw_items ENABLE ROW LEVEL SECURITY;

-- Pending digests : service_role only
ALTER TABLE pending_digests ENABLE ROW LEVEL SECURITY;

-- Daily counters : service_role only
ALTER TABLE daily_counters ENABLE ROW LEVEL SECURITY;

-- Waitlist : insert public, pas de read
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_public_insert" ON waitlist
  FOR INSERT
  WITH CHECK (true);

-- ==========================================================================
-- RPC fonction : auto-create profile au signup
-- ==========================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ==========================================================================
-- RPC fonction : recherche sémantique (public)
-- ==========================================================================

CREATE OR REPLACE FUNCTION search_similar_opportunities(
  query_embedding vector(768),
  match_count int DEFAULT 10,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  opportunity_id uuid,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.opportunity_id,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM opportunity_embeddings e
  INNER JOIN opportunities o ON o.id = e.opportunity_id AND o.is_published
  WHERE 1 - (e.embedding <=> query_embedding) > min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ==========================================================================
-- RPC fonction : incrémenter compteur quotidien (anti-surcoût)
-- ==========================================================================

CREATE OR REPLACE FUNCTION increment_daily_counter(
  counter_name_param text,
  by_amount int DEFAULT 1
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count int;
BEGIN
  INSERT INTO daily_counters (counter_date, counter_name, count)
  VALUES (CURRENT_DATE, counter_name_param, by_amount)
  ON CONFLICT (counter_date, counter_name)
  DO UPDATE SET count = daily_counters.count + by_amount
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;
