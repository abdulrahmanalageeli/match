-- Compatibility Cache Table for BlindMatch
-- Stores calculated compatibility results to avoid duplicate AI API calls and computations

CREATE TABLE public.compatibility_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  
  -- Participant identification (ordered for consistency - smaller number first)
  participant_a_number integer NOT NULL,
  participant_b_number integer NOT NULL,
  
  -- Content hashes for cache invalidation (when participant data changes)
  combined_content_hash text NOT NULL,
  vibe_content_hash text NOT NULL,
  mbti_hash text NOT NULL,
  attachment_hash text NOT NULL,
  communication_hash text NOT NULL,
  lifestyle_hash text NOT NULL,
  core_values_hash text NOT NULL,
  
  -- Cached compatibility scores
  ai_vibe_score numeric(5,2) NOT NULL,
  mbti_score numeric(5,2) NOT NULL,
  attachment_score numeric(5,2) NOT NULL,
  communication_score numeric(5,2) NOT NULL,
  lifestyle_score numeric(5,2) NOT NULL,
  core_values_score numeric(5,2) NOT NULL,
  total_compatibility_score numeric(5,2) NOT NULL,
  
  -- Cache metadata for analytics and cleanup
  created_at timestamp with time zone DEFAULT NOW(),
  last_used timestamp with time zone DEFAULT NOW(),
  use_count integer DEFAULT 1,
  
  -- Constraints
  CONSTRAINT compatibility_cache_pkey PRIMARY KEY (id),
  
  -- Ensure smaller participant number comes first for consistency
  CONSTRAINT compatibility_cache_ordered CHECK (participant_a_number < participant_b_number),
  
  -- Unique constraint prevents duplicate cache entries
  CONSTRAINT compatibility_cache_unique UNIQUE (participant_a_number, participant_b_number, combined_content_hash)
);

-- Performance indexes for fast lookups
CREATE INDEX idx_compatibility_cache_participants ON compatibility_cache(participant_a_number, participant_b_number);
CREATE INDEX idx_compatibility_cache_hash ON compatibility_cache(combined_content_hash);
CREATE INDEX idx_compatibility_cache_usage ON compatibility_cache(last_used DESC);
CREATE INDEX idx_compatibility_cache_created ON compatibility_cache(created_at DESC);

-- Partial index for frequently used cache entries
CREATE INDEX idx_compatibility_cache_popular ON compatibility_cache(use_count DESC) WHERE use_count > 1;

-- Comments for documentation
COMMENT ON TABLE compatibility_cache IS 'Caches compatibility calculation results to avoid duplicate AI API calls and improve performance';
COMMENT ON COLUMN compatibility_cache.participant_a_number IS 'Smaller participant number (for consistent ordering)';
COMMENT ON COLUMN compatibility_cache.participant_b_number IS 'Larger participant number (for consistent ordering)';
COMMENT ON COLUMN compatibility_cache.combined_content_hash IS 'Hash of all participant data used in compatibility calculation';
COMMENT ON COLUMN compatibility_cache.vibe_content_hash IS 'Hash of vibe descriptions for AI analysis caching';
COMMENT ON COLUMN compatibility_cache.ai_vibe_score IS 'Cached AI vibe compatibility score (0-35 points)';
COMMENT ON COLUMN compatibility_cache.total_compatibility_score IS 'Sum of all compatibility scores (0-100 points)';
COMMENT ON COLUMN compatibility_cache.use_count IS 'Number of times this cache entry has been used';
COMMENT ON COLUMN compatibility_cache.last_used IS 'Last time this cache entry was accessed';

-- Example queries for cache analytics:

-- Cache hit rate analysis
-- SELECT 
--   DATE(created_at) as date,
--   COUNT(*) as new_calculations,
--   SUM(use_count) as total_uses,
--   ROUND(AVG(use_count), 2) as avg_reuse_rate
-- FROM compatibility_cache 
-- GROUP BY DATE(created_at)
-- ORDER BY date DESC;

-- Most frequently reused calculations
-- SELECT 
--   participant_a_number,
--   participant_b_number,
--   use_count,
--   total_compatibility_score,
--   created_at,
--   last_used
-- FROM compatibility_cache 
-- ORDER BY use_count DESC 
-- LIMIT 10;

-- Estimated cost savings (assuming $0.002 per AI call)
-- SELECT 
--   SUM(use_count - 1) as saved_ai_calls,
--   SUM(use_count - 1) * 0.002 as dollars_saved,
--   SUM(use_count - 1) * 2.5 as seconds_saved
-- FROM compatibility_cache;

-- Cache cleanup (remove old unused entries)
-- DELETE FROM compatibility_cache 
-- WHERE last_used < NOW() - INTERVAL '30 days' 
-- AND use_count = 1;
