-- Add personal_points column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS personal_points INTEGER DEFAULT 0;

-- Add point_type to track personal vs team points
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS point_type TEXT DEFAULT 'team'
  CHECK (point_type IN ('personal', 'team'));

-- Create index for faster queries on point_type
CREATE INDEX IF NOT EXISTS idx_point_transactions_point_type ON point_transactions(point_type);
