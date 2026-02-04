-- Support multiple planets per Notion task (one per assignee)
-- When a task has multiple people in "Attributed to", we create one planet per assignee

-- Drop the existing unique constraint on notion_task_id (allows multiple planets per task)
DROP INDEX IF EXISTS notion_planets_task_id_unique;
DROP INDEX IF EXISTS notion_planets_notion_task_id_key;

-- Add composite unique constraint (one planet per task per assignee)
-- COALESCE handles null assigned_to values (unassigned planets)
CREATE UNIQUE INDEX notion_planets_task_assignee_unique
ON notion_planets(notion_task_id, COALESCE(assigned_to, ''));

-- Index for fast lookups of related planets by Notion task ID
CREATE INDEX IF NOT EXISTS notion_planets_notion_task_id_idx
ON notion_planets(notion_task_id);
