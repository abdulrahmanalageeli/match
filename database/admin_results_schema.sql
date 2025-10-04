-- Admin Results Storage Table
-- Stores match generation sessions for persistent viewing in admin panel

CREATE TABLE public.admin_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text NOT NULL, -- Unique identifier for each match generation session
  event_id integer NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('individual', 'group')),
  generation_type text NOT NULL CHECK (generation_type IN ('ai', 'no-ai', 'cached', 'manual')),
  
  -- Session metadata
  created_at timestamp with time zone DEFAULT NOW(),
  created_by text DEFAULT 'admin',
  total_matches integer NOT NULL DEFAULT 0,
  total_participants integer NOT NULL DEFAULT 0,
  
  -- Match results data (JSONB for flexibility)
  match_results jsonb NOT NULL DEFAULT '[]',
  calculated_pairs jsonb DEFAULT '[]',
  participant_results jsonb NOT NULL DEFAULT '[]',
  
  -- Session parametersظ
  skip_ai boolean DEFAULT false,
  excluded_pairs jsonb DEFAULT '[]',
  excluded_participants jsonb DEFAULT '[]',
  locked_matches jsonb DEFAULT '[]',
  
  -- Performance metrics
  generation_duration_ms integer,
  cache_hit_rate numeric(5,2),
  ai_calls_made integer DEFAULT 0,
  
  -- Status and visibility
  is_active boolean DEFAULT true,
  is_pinned boolean DEFAULT false,
  notes text,
  
  CONSTRAINT admin_results_pkey PRIMARY KEY (id),
  CONSTRAINT admin_results_event_id_positive CHECK (event_id > 0),
  CONSTRAINT admin_results_total_matches_positive CHECK (total_matches >= 0),
  CONSTRAINT admin_results_total_participants_positive CHECK (total_participants >= 0)
);

-- Indexes for performance
CREATE INDEX idx_admin_results_event_id ON admin_results(event_id);
CREATE INDEX idx_admin_results_session_id ON admin_results(session_id);
CREATE INDEX idx_admin_results_created_at ON admin_results(created_at DESC);
CREATE INDEX idx_admin_results_active ON admin_results(is_active) WHERE is_active = true;
CREATE INDEX idx_admin_results_pinned ON admin_results(is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_admin_results_match_type ON admin_results(match_type);

-- Unique constraint for session identification
CREATE UNIQUE INDEX idx_admin_results_unique_session 
ON admin_results(event_id, session_id);

-- Comments for documentation
COMMENT ON TABLE admin_results IS 'Stores admin match generation sessions for persistent viewing and analysis';
COMMENT ON COLUMN admin_results.session_id IS 'Unique identifier for each match generation session (e.g., "individual_2024_01_15_14_30")';
COMMENT ON COLUMN admin_results.match_results IS 'Raw match results from trigger-match API';
COMMENT ON COLUMN admin_results.calculated_pairs IS 'All calculated compatibility pairs with scores';
COMMENT ON COLUMN admin_results.participant_results IS 'Processed participant results for modal display';
COMMENT ON COLUMN admin_results.is_active IS 'Whether this session is still relevant (false for old/superseded sessions)';
COMMENT ON COLUMN admin_results.is_pinned IS 'Whether admin has pinned this session for easy access';
