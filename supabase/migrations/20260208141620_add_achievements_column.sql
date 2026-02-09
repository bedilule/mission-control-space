ALTER TABLE players ADD COLUMN IF NOT EXISTS achievements jsonb DEFAULT '{}'::jsonb;
