-- Communication Style Migration
-- Adds communication_style column and related functionality

-- Add communication_style column to participants table
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS communication_style VARCHAR(50);

-- Add validation constraint for communication styles
ALTER TABLE participants 
ADD CONSTRAINT valid_communication_style 
CHECK (communication_style IS NULL OR communication_style IN (
  'Assertive', 'Passive', 'Aggressive', 'Passive-Aggressive'
));

-- Add index for performance on communication style queries
CREATE INDEX IF NOT EXISTS idx_participants_communication_style 
ON participants(communication_style);

-- Create or replace trigger function to sync communication style from JSON
CREATE OR REPLACE FUNCTION sync_communication_style_from_json()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract communication style from survey_data JSON and update dedicated column
  IF NEW.survey_data IS NOT NULL AND NEW.survey_data ? 'communicationStyle' THEN
    NEW.communication_style = NEW.survey_data->>'communicationStyle';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS trigger_sync_communication_style ON participants;
CREATE TRIGGER trigger_sync_communication_style
  BEFORE INSERT OR UPDATE ON participants
  FOR EACH ROW
  EXECUTE FUNCTION sync_communication_style_from_json();

-- Update existing records to sync communication style from JSON
UPDATE participants 
SET communication_style = survey_data->>'communicationStyle'
WHERE survey_data IS NOT NULL 
  AND survey_data ? 'communicationStyle' 
  AND communication_style IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN participants.communication_style IS 'Communication style derived from survey: Assertive, Passive, Aggressive, or Passive-Aggressive'; 