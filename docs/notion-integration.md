# Notion Integration System

This document describes the complete Notion integration for Mission Control Space, a gamified task management system where Notion tasks appear as planets in a 2D space game.

## Overview

The integration provides bidirectional sync between Notion and the game:
- **Notion → Game**: Tasks created/updated in Notion appear as planets
- **Game → Notion**: Planet completions/claims update Notion tasks
- **Points System**: Players earn points for creating and completing tasks

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│                 │     │        Supabase Edge Functions       │
│     Notion      │────▶│  notion-webhook  (create/update)    │
│    Database     │     │  notion-sync     (full sync)        │
│                 │     │  notion-create   (new planets)      │
└─────────────────┘     │  notion-claim    (assign player)    │
                        │  notion-complete (mark done)        │
                        │  notion-delete   (remove planet)    │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────────┐
                        │     Supabase Database               │
                        │     notion_planets table            │
                        │     notion_user_mappings table      │
                        │     point_transactions table        │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────────┐
                        │     React Frontend                  │
                        │     useNotionPlanets hook           │
                        │     Realtime subscriptions          │
                        └─────────────────────────────────────┘
```

## Database Schema

### notion_planets Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `team_id` | UUID | Reference to teams table |
| `notion_task_id` | TEXT | Notion page ID (unique constraint) |
| `name` | TEXT | Task title |
| `description` | TEXT | Task description |
| `notion_url` | TEXT | Link to Notion page |
| `assigned_to` | TEXT | Player username (lowercase) |
| `created_by` | TEXT | Creator username (lowercase) |
| `task_type` | TEXT | bug, enhancement, etc. |
| `priority` | TEXT | critical, high, medium, low |
| `points` | INTEGER | Points awarded on completion |
| `x` | INTEGER | Planet X position |
| `y` | INTEGER | Planet Y position |
| `completed` | BOOLEAN | Whether task is done |
| `completed_at` | TIMESTAMP | When task was completed |
| `completed_by` | TEXT | Who completed it |

### point_transactions Table

Tracks all point awards for auditing:
- Points for creating tasks (10 points)
- Points for completing tasks (based on priority)

### notion_user_mappings Table

Maps Notion users to game players for correct identification:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `team_id` | UUID | Reference to teams table |
| `player_id` | UUID | Reference to players table |
| `notion_user_id` | TEXT | Notion user ID (unique per team) |
| `notion_user_name` | TEXT | Notion display name (for reference) |

**Why this table exists**: Notion user names don't always match game player usernames. This mapping allows the system to correctly identify players regardless of naming differences.

**Setup**: Populate this table via Supabase dashboard or SQL:
```sql
INSERT INTO notion_user_mappings (team_id, player_id, notion_user_id, notion_user_name)
VALUES (
  'your-team-uuid',
  'player-uuid',
  'notion-user-id',  -- Get from Notion API or webhook logs
  'Notion Display Name'
);
```

## Edge Functions

### 1. notion-sync

**Purpose**: Full synchronization of all Notion tasks to game planets.

**Endpoint**: `POST /functions/v1/notion-sync`

**What it does**:
1. Fetches all non-archived tasks from Notion database
2. Creates planets for new tasks
3. Updates existing planets with latest data
4. Deletes planets whose Notion tasks no longer exist
5. Awards 10 points to creators for new tasks

**Key Features**:
- UUID normalization for cross-format comparison
- Uses upsert with `onConflict: 'notion_task_id'` to handle duplicates
- Non-overlapping position calculation

**Response**:
```json
{
  "success": true,
  "summary": {
    "total_in_notion": 45,
    "created": 3,
    "updated": 40,
    "deleted": 2,
    "skipped": 0,
    "errors": 0,
    "creator_points_awarded": 30
  },
  "created": ["Task A", "Task B", "Task C"],
  "updated": ["..."],
  "deleted": ["Old Task"],
  "errors": []
}
```

### 2. notion-webhook

**Purpose**: Handle real-time updates from Notion automations.

**Endpoint**: `POST /functions/v1/notion-webhook`

**Trigger**: Notion automation when task is created or updated.

**What it does**:
1. Parses Notion's native automation payload
2. Creates new planet if task doesn't exist
3. Updates existing planet if task exists
4. Handles assignment changes (moves planet to new zone)
5. Detects completion status and awards points

**Payload Parsing**:
- Extracts title from `Ticket` property
- Extracts assignee from `Attributed to` (people)
- Extracts creator from `Créé par` or `Created by`
- Extracts type from `What is it ?` (select)
- Extracts priority from `Priority` (select)
- Extracts status from `Status` (status)

**Debug Mode**: Add `?debug=true` to see raw and parsed payload.

### 3. notion-create

**Purpose**: Create a new Notion page when planet is created in-game.

**Endpoint**: `POST /functions/v1/notion-create`

**Request**:
```json
{
  "name": "Fix login bug",
  "description": "Users can't log in with SSO",
  "type": "bug",
  "priority": "high",
  "assigned_to": "quentin"
}
```

**What it does**:
1. Creates page in Notion database
2. Creates corresponding planet in game
3. Awards 10 points to creator

### 4. notion-claim

**Purpose**: Assign a player to a task/planet.

**Endpoint**: `POST /functions/v1/notion-claim`

**Request**:
```json
{
  "planet_id": "uuid-here",
  "player_name": "quentin"
}
```

**What it does**:
1. Updates `assigned_to` in notion_planets
2. Updates `Attributed to` in Notion page
3. Moves planet to player's zone

### 5. notion-complete

**Purpose**: Mark a task as completed.

**Endpoint**: `POST /functions/v1/notion-complete`

**Request**:
```json
{
  "planet_id": "uuid-here",
  "player_name": "quentin"
}
```

**What it does**:
1. Sets `completed = true` and `completed_at`
2. Updates Notion page status to "Archived"
3. Awards points based on priority
4. Creates point_transaction record

### 6. notion-delete

**Purpose**: Remove a planet from the game (bypasses RLS).

**Endpoint**: `POST /functions/v1/notion-delete`

**Request**:
```json
{
  "planet_id": "uuid-here"
}
```

**Why it exists**: Client-side deletes are blocked by Row Level Security. This function uses the service role key to bypass RLS.

## Player Zones

Planets are positioned near their assigned player's "zone" in the game world.

### User Resolution Flow

When a task is assigned in Notion, the system:
1. Extracts the Notion user ID from the `Attributed to` property
2. Looks up the player in `notion_user_mappings` by Notion user ID
3. If found, uses the player's game username for zone placement
4. If not found, falls back to matching by Notion display name (case-insensitive)

This ensures correct zone placement even when Notion names differ from game usernames.

### Zone Configuration

```typescript
const CENTER_X = 5000;
const CENTER_Y = 5000;
const PLAYER_DISTANCE = 3000;

const PLAYER_ZONES = {
  'quentin': { x: 8000, y: 5000 },  // East
  'alex':    { x: 7100, y: 2900 },  // Northeast
  'armel':   { x: 5000, y: 2000 },  // North
  'milya':   { x: 2900, y: 2900 },  // Northwest
  'hugues':  { x: 2000, y: 5000 },  // West
};

const DEFAULT_ZONE = { x: 5000, y: 5500 }; // Unassigned tasks
```

### Position Algorithm

The `findNonOverlappingPosition` function:
1. Starts at the player's zone center
2. Searches outward in rings of 8 positions each
3. Checks each candidate against existing planets
4. Returns first position with no collisions
5. Falls back to random position if all attempts fail

```
Ring 0: 8 positions at radius 200
Ring 1: 8 positions at radius 350
Ring 2: 8 positions at radius 500
...
```

## Points System

### Points by Priority

| Priority | Points |
|----------|--------|
| Critical | 150 |
| High | 100 |
| Medium | 50 |
| Low | 25 |
| Default | 30 |

### Point Awards

- **Creating a task**: 10 points to creator
- **Completing a task**: Priority points to assignee

## Frontend Integration

### useNotionPlanets Hook

Location: `src/hooks/useNotionPlanets.ts`

**Purpose**: Fetches and subscribes to Notion planets.

**Features**:
- Initial fetch of all non-completed planets
- Realtime subscription for INSERT, UPDATE, DELETE
- Converts database records to game Planet format

**Usage**:
```typescript
const { planets, isLoading, error } = useNotionPlanets(teamId);
```

### Planet Visual Effects

Based on priority and type, planets display:
- **Critical priority**: Pulsing red glow
- **High priority**: Pulsing orange glow
- **Bug type**: Crack patterns on surface
- **Enhancement type**: Sparkle effects

### Destroy Animation

Players can "destroy" completed planets with X key:
1. Explosion animation plays
2. `notion-delete` edge function called
3. Planet removed from game

## Notion Database Setup

### Required Properties

| Property Name | Type | Description |
|---------------|------|-------------|
| `Ticket` | Title | Task name |
| `Description` | Rich Text | Task details |
| `Status` | Select | Workflow status (see Status Values below) |
| `Priority` | Select | Critical, High, Medium, Low |
| `What is it ?` | Select | Bug, Enhancement, etc. |
| `Attributed to` | People | Assigned player |
| `Créé par` | Created by | Auto-filled creator |

### Status Values

The webhook handler recognizes these status values:

| Status | Game Action |
|--------|-------------|
| `Ticket Open` | Creates planet (if new) or updates it |
| `Archived` | Marks planet as completed, awards points |
| `Destroyed` | Deletes planet from game |
| Any other status | Skips planet creation (updates only if exists) |

**Note**: Status matching is case-insensitive and uses `includes()`, so "🗑️ Destroyed" or "Task Destroyed" will work.

### Database ID

```
NOTION_DATABASE_ID = '2467d5a8-0344-8198-a604-c6bd91473887'
```

## Notion Automation Setup (Recommended)

### Single Webhook Approach

**You only need ONE Notion automation** that fires on any property change. The webhook handler routes based on the Status value.

#### Step-by-Step Setup:

1. **Go to your Notion database** → Click `...` → `Automations`

2. **Create ONE automation:**
   - Trigger: "When a page is edited"
   - Filter: Database is your task database
   - Action: "Send HTTP request"
   - URL: `https://qdizfhhsqolvuddoxugj.supabase.co/functions/v1/notion-webhook`
   - Method: POST
   - Body: Include the page properties (Notion will send the full page data)

3. **Delete redundant automations** if you have separate ones for "edited", "archived", "destroyed"

#### Why Single Automation Works:

The `notion-webhook` handler checks the Status property and routes accordingly:

```
Status = "Ticket Open"  → Create/update planet
Status = "Archived"     → Complete planet + award points
Status = "Destroyed"    → Delete planet from game
Status = anything else  → Skip (no planet created)
```

This means:
- When you change status to "Destroyed" in Notion → webhook fires → planet deleted
- When you change status to "Archived" in Notion → webhook fires → planet completed
- When you edit any property → webhook fires → planet updated

#### Debugging

If planets aren't being deleted when status changes to "Destroyed":

1. **Check Supabase logs** for the `notion-webhook` function
2. Look for these log lines:
   ```
   STATUS ROUTING CHECK:
     - Raw status value: "destroyed"
     - isDestroyed: true
   >>> ENTERING DESTROY BLOCK <<<
   ```

3. **Test manually** with debug mode:
   ```bash
   curl -X POST "https://qdizfhhsqolvuddoxugj.supabase.co/functions/v1/notion-webhook?debug=true" \
     -H "Content-Type: application/json" \
     -d '{"data":{"id":"PAGE-ID","properties":{"Status":{"select":{"name":"Destroyed"}},"Ticket":{"title":[{"plain_text":"Test"}]}}}}'
   ```

4. **Verify Notion is sending the webhook** by checking:
   - Notion automation is enabled
   - Automation triggers on property changes (not just creation)
   - No filters excluding "Destroyed" status

## Environment Variables

Required in Supabase Edge Functions:

| Variable | Description |
|----------|-------------|
| `NOTION_API_TOKEN` | Notion integration token |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |

## Error Handling

### Common Issues

1. **Duplicate key errors**: Resolved by using upsert with `onConflict`
2. **RLS blocking deletes**: Use `notion-delete` edge function
3. **UUID format mismatch**: Normalize with `.replace(/-/g, '')`
4. **Notion rate limits**: Batch operations in sync function

### Sync Button

Admin panel includes a sync button that:
- Triggers `notion-sync`
- Shows detailed results (created, updated, deleted, errors)
- Expandable dropdown for full details

## End-to-End Flows

### Creating a Task in Notion

1. User creates task in Notion
2. Notion automation triggers webhook
3. `notion-webhook` creates planet
4. Realtime subscription updates frontend
5. Planet appears in game

### Completing a Task in Game

1. Player lands on planet
2. Player clicks "Complete" or presses C
3. `notion-complete` called
4. Notion page status updated to "Archived"
5. Points awarded to player
6. Planet marked as completed (trophy state)

### Destroying a Completed Planet

1. Player lands on completed planet
2. Player presses X
3. Explosion animation plays
4. `notion-delete` removes from database
5. Planet disappears from game

### Destroying a Task from Notion

1. User changes task status to "Destroyed" in Notion
2. Notion automation sends webhook
3. `notion-webhook` detects `isDestroyed = true`
4. Planet deleted from database
5. Realtime subscription triggers DELETE event
6. Planet disappears from all players' games

### Full Sync (Admin)

1. Admin clicks sync button
2. `notion-sync` fetches all Notion tasks
3. Creates new planets, updates existing, deletes removed
4. Results displayed in dropdown
5. All players see updated planets via realtime
