-- Add DELETE policy for notion_planets table
-- This was missing and could cause issues with RLS-enabled clients

-- Drop if exists to avoid conflicts
DROP POLICY IF EXISTS "Enable delete for all users" ON notion_planets;

-- Create permissive DELETE policy
CREATE POLICY "Enable delete for all users" ON notion_planets
  FOR DELETE USING (true);
