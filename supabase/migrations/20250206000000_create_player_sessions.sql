-- Create player_sessions table for tracking login/logout activity
CREATE TABLE IF NOT EXISTS player_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_player_sessions_player_id ON player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_created_at ON player_sessions(created_at DESC);

-- Enable RLS with public access (matches existing pattern - no auth system)
ALTER TABLE player_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON player_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON player_sessions FOR INSERT WITH CHECK (true);
