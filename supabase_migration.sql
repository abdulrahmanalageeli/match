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

-- Create the missing function that is referenced in the schema
CREATE OR REPLACE FUNCTION update_personality_types_from_survey_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract MBTI type from survey_data JSON and update dedicated column
  IF NEW.survey_data IS NOT NULL AND NEW.survey_data ? 'mbtiType' THEN
    NEW.mbti_personality_type = NEW.survey_data->>'mbtiType';
  END IF;
  
  -- Extract attachment style from survey_data JSON and update dedicated column
  IF NEW.survey_data IS NOT NULL AND NEW.survey_data ? 'attachmentStyle' THEN
    NEW.attachment_style = NEW.survey_data->>'attachmentStyle';
  END IF;
  
  -- Extract communication style from survey_data JSON and update dedicated column
  IF NEW.survey_data IS NOT NULL AND NEW.survey_data ? 'communicationStyle' THEN
    NEW.communication_style = NEW.survey_data->>'communicationStyle';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update personality type columns from survey_data
DROP TRIGGER IF EXISTS trigger_update_personality_types ON participants;
CREATE TRIGGER trigger_update_personality_types
  BEFORE INSERT OR UPDATE ON participants
  FOR EACH ROW
  EXECUTE FUNCTION update_personality_types_from_survey_data();

-- Add missing personality-related columns to match_results table
ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_a_lifestyle_preferences TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_b_lifestyle_preferences TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_a_core_values TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_b_core_values TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_a_vibe_description TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_b_vibe_description TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_a_ideal_person_description TEXT;

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS participant_b_ideal_person_description TEXT;

-- Add comments for the new columns
COMMENT ON COLUMN match_results.participant_a_lifestyle_preferences IS 'Lifestyle preferences for participant A';
COMMENT ON COLUMN match_results.participant_b_lifestyle_preferences IS 'Lifestyle preferences for participant B';
COMMENT ON COLUMN match_results.participant_a_core_values IS 'Core values for participant A';
COMMENT ON COLUMN match_results.participant_b_core_values IS 'Core values for participant B';
COMMENT ON COLUMN match_results.participant_a_vibe_description IS 'Vibe description for participant A';
COMMENT ON COLUMN match_results.participant_b_vibe_description IS 'Vibe description for participant B';
COMMENT ON COLUMN match_results.participant_a_ideal_person_description IS 'Ideal person description for participant A';
COMMENT ON COLUMN match_results.participant_b_ideal_person_description IS 'Ideal person description for participant B'; 