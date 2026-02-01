-- Add new fields to notion_planets table
ALTER TABLE notion_planets
ADD COLUMN IF NOT EXISTS created_by TEXT,
ADD COLUMN IF NOT EXISTS priority TEXT;
