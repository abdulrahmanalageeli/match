-- Add updated_at column to event3_matches with auto-update trigger

ALTER TABLE public.event3_matches
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone null default now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER event3_matches_updated_at
  BEFORE UPDATE ON public.event3_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
