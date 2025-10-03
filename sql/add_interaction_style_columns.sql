-- Add interaction style columns to participants table
-- These are matching determinants (not weighted) for compatibility filtering

-- Add humor/banter style column
ALTER TABLE public.participants 
ADD COLUMN humor_banter_style varchar(1) CHECK (humor_banter_style IN ('A', 'B', 'C', 'D'));

-- Add early openness comfort level column  
ALTER TABLE public.participants 
ADD COLUMN early_openness_comfort integer CHECK (early_openness_comfort IN (0, 1, 2, 3));

-- Add indexes for performance on interaction style queries
CREATE INDEX IF NOT EXISTS idx_participants_humor_banter_style 
ON public.participants USING btree (humor_banter_style) 
WHERE (humor_banter_style IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_participants_early_openness_comfort 
ON public.participants USING btree (early_openness_comfort) 
WHERE (early_openness_comfort IS NOT NULL);

-- Add composite index for interaction matching logic
CREATE INDEX IF NOT EXISTS idx_participants_interaction_styles 
ON public.participants USING btree (humor_banter_style, early_openness_comfort) 
WHERE (humor_banter_style IS NOT NULL AND early_openness_comfort IS NOT NULL);

-- Add comments to document the column purposes
COMMENT ON COLUMN public.participants.humor_banter_style IS 
'Humor/banter interaction style: A=Playful teasing, B=Light jokes, C=Warm sincerity, D=Direct & serious. Used for compatibility filtering (not weighted scoring).';

COMMENT ON COLUMN public.participants.early_openness_comfort IS 
'Early openness comfort level: 0=Very Private, 1=Light-only, 2=Balanced, 3=Fast Opener. Used for compatibility filtering (not weighted scoring).';
