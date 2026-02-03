-- Enable realtime for players table (for instant personal_points updates)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE players;
  END IF;
END $$;

-- Enable realtime for point_transactions table (for instant transaction notifications)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'point_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE point_transactions;
  END IF;
END $$;
