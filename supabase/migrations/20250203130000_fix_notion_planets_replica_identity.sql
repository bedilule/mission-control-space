-- Enable REPLICA IDENTITY FULL for notion_planets table
-- This ensures DELETE events include the full row data in realtime subscriptions
-- Without this, DELETE events only include primary key columns in payload.old

ALTER TABLE notion_planets REPLICA IDENTITY FULL;
