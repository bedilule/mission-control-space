-- Create prompts table for tracking AI generation history
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('ship_upgrade', 'planet_terraform', 'planet_create', 'planet_base')),
  prompt_text TEXT NOT NULL,
  user_input TEXT, -- What the user typed (e.g., "add laser cannons")
  api_used TEXT, -- e.g., 'fal-ai/nano-banana' or 'fal-ai/nano-banana/edit'
  source_image_url TEXT, -- Input image for edits
  result_image_url TEXT, -- Generated image URL in Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups by player
CREATE INDEX IF NOT EXISTS idx_prompts_player_id ON prompts(player_id);
CREATE INDEX IF NOT EXISTS idx_prompts_team_id ON prompts(team_id);
CREATE INDEX IF NOT EXISTS idx_prompts_type ON prompts(prompt_type);

-- Enable RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- Allow public access (same as other tables in this game)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompts' AND policyname = 'Public access') THEN
    CREATE POLICY "Public access" ON prompts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for prompts (ignore if already added)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'prompts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE prompts;
  END IF;
END $$;
