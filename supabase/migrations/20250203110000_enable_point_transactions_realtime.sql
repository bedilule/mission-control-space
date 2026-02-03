-- Enable realtime for point_transactions table (for instant transaction notifications)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'point_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE point_transactions;
  END IF;
END $$;
