-- Add survey_data column to participants table
-- This column will store the comprehensive survey responses as JSON
ALTER TABLE participants 
ADD COLUMN survey_data JSONB;

-- Add a comment to document the column purpose
COMMENT ON COLUMN participants.survey_data IS 'Stores comprehensive survey responses including demographics, values, preferences, and personality traits';

-- Create an index for better query performance on survey_data
CREATE INDEX idx_participants_survey_data ON participants USING GIN (survey_data);

-- Optional: Add a constraint to ensure survey_data is valid JSON
ALTER TABLE participants 
ADD CONSTRAINT check_survey_data_valid 
CHECK (survey_data IS NULL OR jsonb_typeof(survey_data) = 'object'); 