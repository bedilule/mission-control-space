// Notion Sync - Fetches all tickets from Notion and creates missing planets
// Run this to import existing tickets or re-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Notion database ID (from URL)
const NOTION_DATABASE_ID = '2467d5a8-0344-8198-a604-c6bd91473887';

interface ExistingPlanet {
  id: string;
  x: number;
  y: number;
}

// Player zone positions (must match SpaceGame.ts and webhook)
const CENTER_X = 5000;
const CENTER_Y = 5000;
const PLAYER_DISTANCE = 3000;
const HUB_DISTANCE = 2800;

// Mission Control position (bottom middle)
const MISSION_CONTROL_X = CENTER_X;
const MISSION_CONTROL_Y = CENTER_Y + HUB_DISTANCE * 1.1;

const PLAYER_ZONES: Record<string, { x: number; y: number }> = {
  'quentin': { x: CENTER_X + PLAYER_DISTANCE, y: CENTER_Y },
  'alex': { x: CENTER_X + PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 },
  'armel': { x: CENTER_X, y: CENTER_Y - PLAYER_DISTANCE },
  'milya': { x: CENTER_X - PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 },
  'hugues': { x: CENTER_X - PLAYER_DISTANCE, y: CENTER_Y },
};

// Default zone for unassigned tasks - near Mission Control
const DEFAULT_ZONE = { x: MISSION_CONTROL_X, y: MISSION_CONTROL_Y };

// Points based on priority
const PRIORITY_POINTS: Record<string, number> = {
  'critical': 150,
  '🧨 critical': 150,
  'high': 100,
  '🔥 high': 100,
  'medium': 50,
  '⚡️ medium': 50,
  'low': 25,
  '💡 low': 25,
  'default': 30,
};

const PLANET_RADIUS = 50;
const MIN_DISTANCE = PLANET_RADIUS * 3;

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// Minimum distance from home planet for assigned tasks
const MIN_HOME_DISTANCE = 380;

// Check if a position is in the correct zone for the assigned player
// Also checks that assigned planets are at least MIN_HOME_DISTANCE from home
function isInCorrectZone(
  position: { x: number; y: number },
  assignedTo: string | null | undefined
): boolean {
  const isAssigned = assignedTo && PLAYER_ZONES[assignedTo.toLowerCase()];
  const expectedZone = isAssigned
    ? PLAYER_ZONES[assignedTo.toLowerCase()]
    : DEFAULT_ZONE;

  // Consider "in zone" if within 2000 units of the zone center
  const MAX_ZONE_DISTANCE = 2000;
  const distFromZone = distance(position, expectedZone);

  if (distFromZone > MAX_ZONE_DISTANCE) {
    return false; // Too far from zone
  }

  // For assigned planets, also check minimum distance from home planet
  if (isAssigned && distFromZone < MIN_HOME_DISTANCE) {
    return false; // Too close to home planet
  }

  return true;
}

// Check if a planet overlaps with any other planet
function hasOverlap(
  position: { x: number; y: number },
  otherPlanets: ExistingPlanet[]
): boolean {
  for (const other of otherPlanets) {
    if (distance(position, other) < MIN_DISTANCE) {
      return true;
    }
  }
  return false;
}

function findNonOverlappingPosition(
  assignedTo: string | null | undefined,
  existingPlanets: ExistingPlanet[]
): { x: number; y: number } {
  const isUnassigned = !assignedTo || !PLAYER_ZONES[assignedTo.toLowerCase()];
  const baseZone = isUnassigned ? DEFAULT_ZONE : PLAYER_ZONES[assignedTo.toLowerCase()];

  const allObstacles: ExistingPlanet[] = [
    ...existingPlanets,
    { x: baseZone.x, y: baseZone.y },
  ];

  // Add Mission Control stations and ship spawn as obstacles for unassigned tasks
  if (isUnassigned) {
    allObstacles.push(
      { x: MISSION_CONTROL_X + 200, y: MISSION_CONTROL_Y }, // Shop
      { x: MISSION_CONTROL_X - 200, y: MISSION_CONTROL_Y }, // Factory
      { x: MISSION_CONTROL_X, y: MISSION_CONTROL_Y - 200 }, // Ship spawn point
    );
  }

  const maxAttempts = 200;

  // For unassigned tasks: place in arcs ABOVE Mission Control (negative Y direction)
  if (isUnassigned) {
    const baseDistance = 350; // Clear of stations
    const arcSpacing = 110;
    const planetsPerArc = 5;
    const arcSpread = Math.PI * 0.35;
    const baseAngle = -Math.PI / 2; // Points UP (above Mission Control)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const arcIndex = Math.floor(attempt / planetsPerArc);
      const posInArc = attempt % planetsPerArc;
      const arcRadius = baseDistance + arcIndex * arcSpacing;

      const staggerOffset = (arcIndex % 2 === 1) ? 0.5 : 0;
      const t = planetsPerArc > 1 ? (posInArc + staggerOffset) / planetsPerArc : 0.5;
      const angle = baseAngle + (t - 0.5) * arcSpread * 2;

      // Organic variation
      const seed = (attempt * 137.5) % 1;
      const radiusVariation = (seed - 0.5) * 25;
      const angleVariation = (((attempt * 97.3) % 1) - 0.5) * 0.06;

      const finalRadius = arcRadius + radiusVariation;
      const finalAngle = angle + angleVariation;

      const candidate = {
        x: baseZone.x + Math.cos(finalAngle) * finalRadius,
        y: baseZone.y + Math.sin(finalAngle) * finalRadius,
      };

      let isValid = true;
      for (const planet of allObstacles) {
        if (distance(candidate, planet) < MIN_DISTANCE) {
          isValid = false;
          break;
        }
      }

      if (isValid) {
        return candidate;
      }
    }

    // Fallback: keep trying outer arcs with overlap checking
    const startArc = Math.floor(maxAttempts / planetsPerArc) + 1;
    for (let arcIdx = startArc; arcIdx < startArc + 20; arcIdx++) {
      const arcRad = baseDistance + arcIdx * arcSpacing;
      const stagger = (arcIdx % 2 === 1) ? 0.5 : 0;
      for (let pos = 0; pos < planetsPerArc; pos++) {
        const t2 = planetsPerArc > 1 ? (pos + stagger) / planetsPerArc : 0.5;
        const a2 = baseAngle + (t2 - 0.5) * arcSpread * 2;
        const seed2 = ((startArc * planetsPerArc + pos) * 137.5) % 1;
        const rv = (seed2 - 0.5) * 25;
        const av = ((((startArc * planetsPerArc + pos) * 97.3) % 1) - 0.5) * 0.06;
        const candidate = {
          x: baseZone.x + Math.cos(a2 + av) * (arcRad + rv),
          y: baseZone.y + Math.sin(a2 + av) * (arcRad + rv),
        };
        let isValid = true;
        for (const planet of allObstacles) {
          if (distance(candidate, planet) < MIN_DISTANCE) {
            isValid = false;
            break;
          }
        }
        if (isValid) return candidate;
      }
    }
    // Last resort
    const lastResortArcRadius = baseDistance + (startArc + 20) * arcSpacing;
    return {
      x: baseZone.x,
      y: baseZone.y - lastResortArcRadius,
    };
  }

  // For assigned tasks: tight rings around player's home planet
  // Ring 1 at 380 units, Ring 2 at 480 units, etc.
  // 9 planets per ring, offset so they don't line up
  // MUST match notion-webhook and notion-claim for consistency
  const baseRadius = 380;
  const ringSpacing = 100;
  const angleStep = 0.7; // ~40 degrees, fits ~9 planets per ring
  const planetsPerRing = 9;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ring = Math.floor(attempt / planetsPerRing);
    const slotInRing = attempt % planetsPerRing;
    const radius = baseRadius + ring * ringSpacing;
    const angle = slotInRing * angleStep + (ring * 0.35); // Offset each ring

    const candidate = {
      x: baseZone.x + Math.cos(angle) * radius,
      y: baseZone.y + Math.sin(angle) * radius,
    };

    let isValid = true;
    for (const planet of allObstacles) {
      if (distance(candidate, planet) < MIN_DISTANCE) {
        isValid = false;
        break;
      }
    }

    if (isValid) {
      return candidate;
    }
  }

  // Fallback: keep trying outer rings with overlap checking
  const startRing = Math.floor(maxAttempts / planetsPerRing) + 1;
  for (let ring = startRing; ring < startRing + 20; ring++) {
    const radius = baseRadius + ring * ringSpacing;
    for (let slot = 0; slot < planetsPerRing; slot++) {
      const angle = slot * angleStep + (ring * 0.35);
      const candidate = {
        x: baseZone.x + Math.cos(angle) * radius,
        y: baseZone.y + Math.sin(angle) * radius,
      };
      let isValid = true;
      for (const planet of allObstacles) {
        if (distance(candidate, planet) < MIN_DISTANCE) {
          isValid = false;
          break;
        }
      }
      if (isValid) return candidate;
    }
  }
  // Last resort: far out ring at a fixed angle
  const lastResortRadius = baseRadius + (startRing + 20) * ringSpacing;
  return {
    x: baseZone.x + lastResortRadius,
    y: baseZone.y,
  };
}

function calculatePoints(priority: string | undefined): number {
  if (!priority) return PRIORITY_POINTS.default;
  const key = priority.toLowerCase();
  return PRIORITY_POINTS[key] || PRIORITY_POINTS.default;
}

interface Assignee {
  name: string;
  notionId: string;
}

interface ParsedNotionPage {
  id: string;
  name: string;
  description?: string;
  type?: string;
  priority?: string;
  assignees: Assignee[];
  created_by?: string;
  created_by_notion_id?: string;
  status?: string;
  url?: string;
  due_date?: string;
}

// Parse a Notion page into our format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNotionPage(page: any): ParsedNotionPage | null {
  const props = page.properties;
  if (!props) return null;

  // Extract title from "Ticket" property
  let name = '';
  if (props['Ticket']?.title?.[0]?.plain_text) {
    name = props['Ticket'].title[0].plain_text;
  } else {
    // Fallback: find any title property
    for (const key of Object.keys(props)) {
      if (props[key].type === 'title' && props[key].title?.[0]?.plain_text) {
        name = props[key].title[0].plain_text;
        break;
      }
    }
  }

  if (!name) return null;

  // Extract ALL people from "Attributed to" - for planet placement (one planet per assignee)
  const assignees: Assignee[] = [];
  if (props['Attributed to']?.people?.length > 0) {
    for (const person of props['Attributed to'].people) {
      assignees.push({
        name: person.name?.toLowerCase() || '',
        notionId: person.id || '',
      });
    }
  }

  // Extract "Created by" - for points attribution
  let createdBy = '';
  let createdByNotionId = '';
  if (props['Créé par']?.created_by) {
    createdBy = props['Créé par'].created_by.name?.toLowerCase() || '';
    createdByNotionId = props['Créé par'].created_by.id || '';
  } else if (props['Created by']?.created_by) {
    createdBy = props['Created by'].created_by.name?.toLowerCase() || '';
    createdByNotionId = props['Created by'].created_by.id || '';
  } else if (page.created_by) {
    createdBy = page.created_by.name?.toLowerCase() || '';
    createdByNotionId = page.created_by.id || '';
  }

  // Extract description
  let description = '';
  if (props['Description']?.rich_text?.[0]?.plain_text) {
    description = props['Description'].rich_text[0].plain_text;
  }

  // Extract "What is it ?" (type: bug/enhancement/biz/task)
  let type = '';
  if (props['What is it ?']?.select?.name) {
    const rawType = props['What is it ?'].select.name.toLowerCase();
    if (rawType.includes('bug') || rawType.includes('problem')) {
      type = 'bug';
    } else if (rawType.includes('enhancement')) {
      type = 'enhancement';
    } else if (rawType.includes('biz') || rawType.includes('business')) {
      type = 'biz';
    } else if (rawType.includes('task')) {
      type = 'task';
    } else {
      type = rawType;
    }
  }

  // Extract Priority
  let priority = '';
  if (props['Priority']?.select?.name) {
    priority = props['Priority'].select.name.toLowerCase();
  }

  // Extract Status
  let status = '';
  if (props['Status']?.select?.name) {
    status = props['Status'].select.name.toLowerCase();
  } else if (props['Status']?.status?.name) {
    status = props['Status'].status.name.toLowerCase();
  }

  // Extract Due Date
  const dueDate = props['Due Date']?.date?.start || null;

  return {
    id: page.id,
    name: name,
    description: description || undefined,
    type: type || undefined,
    priority: priority || undefined,
    assignees: assignees,
    created_by: createdBy || undefined,
    created_by_notion_id: createdByNotionId || undefined,
    status: status || undefined,
    url: page.url || undefined,
    due_date: dueDate || undefined,
  };
}

// Find player by Notion user ID (via mapping table) or fall back to name matching
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findPlayerByNotionUser(
  supabase: any,
  teamId: string,
  notionUserId: string | undefined,
  notionUserName: string | undefined
): Promise<{ id: string; username: string } | null> {
  // First try to find by Notion user ID mapping
  if (notionUserId) {
    const { data: mapping } = await supabase
      .from('notion_user_mappings')
      .select('player_id, players!inner(id, username)')
      .eq('team_id', teamId)
      .eq('notion_user_id', notionUserId)
      .single();

    if (mapping?.players) {
      return { id: mapping.players.id, username: mapping.players.username };
    }
  }

  // Fall back to name matching
  if (notionUserName) {
    const { data: player } = await supabase
      .from('players')
      .select('id, username')
      .eq('team_id', teamId)
      .ilike('username', notionUserName)
      .single();

    if (player) {
      return player;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const notionToken = Deno.env.get('NOTION_API_TOKEN');
    if (!notionToken) {
      return new Response(
        JSON.stringify({ error: 'NOTION_API_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find team
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_points')
      .limit(1);

    if (!teams || teams.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No team configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const team = teams[0];

    // Fetch ALL pages from Notion database with pagination
    // Get both "Ticket Open" and "Archived" tasks so we can:
    // - Keep active planets for "Ticket Open"
    // - Keep completed planets for "Archived"
    // - Delete planets only for "Destroyed" or tasks missing from Notion
    let pages: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    while (hasMore) {
      const requestBody: any = {
        filter: {
          or: [
            {
              property: 'Status',
              select: { equals: 'Ticket Open' },
            },
            {
              property: 'Status',
              select: { equals: 'Archived' },
            },
          ],
        },
        page_size: 100,
      };

      if (nextCursor) {
        requestBody.start_cursor = nextCursor;
      }

      const notionResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify(requestBody),
      });

      if (!notionResponse.ok) {
        const errorText = await notionResponse.text();
        console.error('Notion API error:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch from Notion', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const notionData = await notionResponse.json();
      pages = pages.concat(notionData.results || []);
      hasMore = notionData.has_more || false;
      nextCursor = notionData.next_cursor;

      console.log(`Fetched ${notionData.results?.length || 0} pages (total: ${pages.length}, has_more: ${hasMore})`);
    }

    console.log(`Notion API returned ${pages.length} total pages across all pagination`);

    // Safeguard: filter to only "Ticket Open" and "Archived" statuses
    pages = pages.filter((page: any) => {
      const props = page.properties;
      const status = (props['Status']?.select?.name || props['Status']?.status?.name || '').toLowerCase();
      const isValid = status === 'ticket open' || status === 'archived';
      if (!isValid) {
        console.log(`Filtering out "${props['Ticket']?.title?.[0]?.plain_text || page.id}" - status is "${status}"`);
      }
      return isValid;
    });

    console.log(`After filtering: ${pages.length} tasks (Ticket Open + Archived)`);

    const created: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    let totalCreatorPoints = 0;

    // Normalize UUID - remove dashes for consistent comparison
    const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();

    // Get all Notion task IDs from the API response (normalized)
    const notionTaskIds = new Set(pages.map((p: { id: string }) => normalizeId(p.id)));

    // Get all existing planets to check for deletions and existing entries
    const { data: allPlanets } = await supabase
      .from('notion_planets')
      .select('id, notion_task_id, name, assigned_to, x, y, completed')
      .eq('team_id', team.id);

    // Build lookup map for existing planets by normalized notion_task_id + assigned_to
    type ExistingPlanetData = { id: string; notion_task_id: string; name: string; assigned_to: string | null; x: number; y: number; completed: boolean };
    // Map: taskId -> Map<assignedTo, planet>
    const existingByTaskAndAssignee = new Map<string, Map<string, ExistingPlanetData>>();
    const existingPositions: ExistingPlanet[] = [];

    for (const planet of allPlanets || []) {
      const normalizedTaskId = normalizeId(planet.notion_task_id);
      if (!existingByTaskAndAssignee.has(normalizedTaskId)) {
        existingByTaskAndAssignee.set(normalizedTaskId, new Map());
      }
      existingByTaskAndAssignee.get(normalizedTaskId)!.set(planet.assigned_to || '', planet);
      existingPositions.push({ id: planet.id, x: planet.x, y: planet.y });
    }

    // Find planets whose Notion tasks are no longer in "Ticket Open" or "Archived"
    // These are "Destroyed" tasks or tasks deleted from Notion entirely
    for (const planet of allPlanets || []) {
      if (!notionTaskIds.has(normalizeId(planet.notion_task_id))) {
        // Task is Destroyed or missing from Notion - remove the planet
        const { error: deleteError } = await supabase
          .from('notion_planets')
          .delete()
          .eq('id', planet.id);

        if (deleteError) {
          errors.push(`Failed to delete ${planet.name}: ${deleteError.message}`);
        } else {
          deleted.push(`${planet.name} (${planet.assigned_to || 'unassigned'})`);
          console.log(`Deleted planet "${planet.name}" (${planet.assigned_to || 'unassigned'}) - Notion task is Destroyed or missing`);
        }
      }
    }

    for (const page of pages) {
      const parsed = parseNotionPage(page);
      if (!parsed) {
        errors.push(`Failed to parse page ${page.id}`);
        continue;
      }

      const normalizedTaskId = normalizeId(parsed.id);

      // Resolve ALL assignees to game usernames
      const resolvedAssignees: Array<{ username: string | null; notionId: string; notionName: string }> = [];
      for (const assignee of parsed.assignees) {
        const player = await findPlayerByNotionUser(
          supabase,
          team.id,
          assignee.notionId,
          assignee.name
        );
        resolvedAssignees.push({
          username: player ? player.username.toLowerCase() : null,
          notionId: assignee.notionId,
          notionName: assignee.name,
        });
      }
      // If no assignees, create a single "unassigned" entry
      if (resolvedAssignees.length === 0) {
        resolvedAssignees.push({ username: null, notionId: '', notionName: '' });
      }

      // Get existing planets for this task
      const existingPlanetsForTask = existingByTaskAndAssignee.get(normalizedTaskId) || new Map<string, ExistingPlanetData>();

      // Calculate points based on priority
      const points = calculatePoints(parsed.priority);

      // Determine completed state from Notion status
      const isArchived = (parsed.status || '').toLowerCase() === 'archived';

      // Determine which planets to create, update, or delete
      const newAssignees = new Set(resolvedAssignees.map(a => a.username || ''));
      const existingAssignees = new Set(existingPlanetsForTask.keys());

      // Assignees to remove (in existing but not in new)
      const toRemove = [...existingAssignees].filter(a => !newAssignees.has(a));

      // Delete planets for removed assignees
      for (const assignee of toRemove) {
        const planet = existingPlanetsForTask.get(assignee);
        if (planet) {
          const { error: deleteError } = await supabase
            .from('notion_planets')
            .delete()
            .eq('id', planet.id);

          if (deleteError) {
            errors.push(`Failed to delete ${parsed.name} (${assignee || 'unassigned'}): ${deleteError.message}`);
          } else {
            deleted.push(`${parsed.name} (${assignee || 'unassigned'})`);
            console.log(`Deleted planet "${parsed.name}" (${assignee || 'unassigned'}) - assignee removed`);
            // Remove from position tracking
            const idx = existingPositions.findIndex(p => p.id === planet.id);
            if (idx >= 0) existingPositions.splice(idx, 1);
          }
        }
      }

      // Process each assignee (create new or update existing)
      let creatorPointsAwarded = false;
      for (const assignee of resolvedAssignees) {
        const assigneeKey = assignee.username || '';
        const existingPlanet = existingPlanetsForTask.get(assigneeKey);

        if (existingPlanet) {
          // Update existing planet
          const otherPositions = existingPositions.filter(p => p.id !== existingPlanet.id);
          const inWrongZone = !isInCorrectZone({ x: existingPlanet.x, y: existingPlanet.y }, assignee.username);
          const overlapsOther = hasOverlap({ x: existingPlanet.x, y: existingPlanet.y }, otherPositions);
          const needsReposition = inWrongZone || overlapsOther;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateData: any = {
            name: parsed.name,
            description: parsed.description || null,
            task_type: parsed.type || null,
            priority: parsed.priority || null,
            points: points,
            notion_url: parsed.url || null,
            due_date: parsed.due_date || null,
            completed: isArchived,
          };

          if (needsReposition) {
            const newPosition = findNonOverlappingPosition(assignee.username, otherPositions);
            updateData.x = Math.round(newPosition.x);
            updateData.y = Math.round(newPosition.y);

            const idx = existingPositions.findIndex(p => p.id === existingPlanet.id);
            if (idx >= 0) {
              existingPositions[idx] = { id: existingPlanet.id, x: newPosition.x, y: newPosition.y };
            }
          }

          const { error: updateError } = await supabase
            .from('notion_planets')
            .update(updateData)
            .eq('id', existingPlanet.id);

          if (updateError) {
            errors.push(`Failed to update ${parsed.name} (${assigneeKey || 'unassigned'}): ${updateError.message}`);
          } else {
            updated.push(`${parsed.name} (${assigneeKey || 'unassigned'})`);

            // When resetting a completed planet back to active, clean up old point transactions
            if (!isArchived && existingPlanet.completed && assigneeKey) {
              const cleanupPlayer = await findPlayerByNotionUser(supabase, team.id, undefined, assigneeKey);
              if (cleanupPlayer) {
                const { data: oldTxs } = await supabase
                  .from('point_transactions')
                  .select('id, points')
                  .eq('notion_task_id', parsed.id)
                  .eq('player_id', cleanupPlayer.id)
                  .ilike('task_name', 'Completed:%');

                if (oldTxs && oldTxs.length > 0) {
                  const totalPoints = oldTxs.reduce((sum, tx) => sum + (tx.points || 0), 0);
                  const txIds = oldTxs.map(tx => tx.id);

                  await supabase
                    .from('point_transactions')
                    .delete()
                    .in('id', txIds);

                  const { data: playerData } = await supabase
                    .from('players')
                    .select('personal_points')
                    .eq('id', cleanupPlayer.id)
                    .single();

                  const newPoints = Math.max(0, (playerData?.personal_points || 0) - totalPoints);
                  await supabase
                    .from('players')
                    .update({ personal_points: newPoints })
                    .eq('id', cleanupPlayer.id);

                  console.log(`Sync: Cleaned up ${oldTxs.length} old "Completed:" tx for ${cleanupPlayer.username}, subtracted ${totalPoints} pts`);
                }
              }
            }

            // Award completion points if transitioning to archived and not already awarded
            if (isArchived && !existingPlanet.completed && assigneeKey) {
              const player = await findPlayerByNotionUser(supabase, team.id, undefined, assigneeKey);
              if (player) {
                const { data: existingTx } = await supabase
                  .from('point_transactions')
                  .select('id')
                  .eq('notion_task_id', parsed.id)
                  .eq('player_id', player.id)
                  .ilike('task_name', 'Completed:%')
                  .single();

                if (!existingTx) {
                  await supabase.from('point_transactions').insert({
                    team_id: team.id,
                    player_id: player.id,
                    source: 'notion',
                    notion_task_id: parsed.id,
                    task_name: `Completed: ${parsed.name}`,
                    points: points,
                    point_type: 'personal',
                  });

                  const { data: playerData } = await supabase
                    .from('players')
                    .select('personal_points')
                    .eq('id', player.id)
                    .single();

                  await supabase
                    .from('players')
                    .update({ personal_points: (playerData?.personal_points || 0) + points })
                    .eq('id', player.id);

                  console.log(`Sync: Awarded ${points} points to ${player.username} for completing "${parsed.name}"`);
                }
              }
            }
          }
        } else {
          // Create new planet for this assignee
          const position = findNonOverlappingPosition(assignee.username, existingPositions);

          const { data: newPlanet, error: createError } = await supabase
            .from('notion_planets')
            .insert({
              team_id: team.id,
              notion_task_id: parsed.id,
              name: parsed.name,
              description: parsed.description || null,
              notion_url: parsed.url || null,
              assigned_to: assignee.username,
              created_by: parsed.created_by || null,
              task_type: parsed.type || null,
              priority: parsed.priority || null,
              points: points,
              x: Math.round(position.x),
              y: Math.round(position.y),
              completed: isArchived,
              due_date: parsed.due_date || null,
            })
            .select('id')
            .single();

          if (createError) {
            errors.push(`Failed to create ${parsed.name} (${assigneeKey || 'unassigned'}): ${createError.message}`);
            continue;
          }

          created.push(`${parsed.name} (${assigneeKey || 'unassigned'})`);

          // Add to position tracking
          if (newPlanet) {
            existingPositions.push({ id: newPlanet.id, x: position.x, y: position.y });
          }

          // Award completion points for newly created archived planets
          if (isArchived && assignee.username) {
            const player = await findPlayerByNotionUser(supabase, team.id, undefined, assignee.username);
            if (player) {
              const { data: existingTx } = await supabase
                .from('point_transactions')
                .select('id')
                .eq('notion_task_id', parsed.id)
                .eq('player_id', player.id)
                .ilike('task_name', 'Completed:%')
                .single();

              if (!existingTx) {
                await supabase.from('point_transactions').insert({
                  team_id: team.id,
                  player_id: player.id,
                  source: 'notion',
                  notion_task_id: parsed.id,
                  task_name: `Completed: ${parsed.name}`,
                  points: points,
                  point_type: 'personal',
                });

                const { data: playerData } = await supabase
                  .from('players')
                  .select('personal_points')
                  .eq('id', player.id)
                  .single();

                await supabase
                  .from('players')
                  .update({ personal_points: (playerData?.personal_points || 0) + points })
                  .eq('id', player.id);

                console.log(`Sync: Awarded ${points} points to ${player.username} for archived task "${parsed.name}"`);
              }
            }
          }

          // Award creator points only once per task
          if (!creatorPointsAwarded && (parsed.created_by || parsed.created_by_notion_id)) {
            const creator = await findPlayerByNotionUser(
              supabase,
              team.id,
              parsed.created_by_notion_id,
              parsed.created_by
            );

            if (creator) {
              // Check for existing transaction
              const { data: existingTx } = await supabase
                .from('point_transactions')
                .select('id')
                .eq('notion_task_id', parsed.id)
                .eq('player_id', creator.id)
                .ilike('task_name', 'Created:%')
                .single();

              if (!existingTx) {
                await supabase.from('point_transactions').insert({
                  team_id: team.id,
                  player_id: creator.id,
                  source: 'notion',
                  notion_task_id: parsed.id,
                  task_name: `Created: ${parsed.name}`,
                  points: 10,
                  point_type: 'personal',
                });

                const { data: creatorData } = await supabase
                  .from('players')
                  .select('personal_points')
                  .eq('id', creator.id)
                  .single();

                await supabase
                  .from('players')
                  .update({ personal_points: (creatorData?.personal_points || 0) + 10 })
                  .eq('id', creator.id);

                totalCreatorPoints += 10;
                creatorPointsAwarded = true;
              }
            }
          }
        }
      }
    }

    console.log(`Sync complete: ${created.length} created, ${updated.length} updated, ${deleted.length} deleted, ${skipped.length} skipped, ${errors.length} errors`);

    // ── Reposition pass: recalculate ALL planet positions deterministically ──
    // This eliminates any overlaps caused by race conditions or stale data
    console.log('Starting reposition pass...');

    const { data: allRemainingPlanets } = await supabase
      .from('notion_planets')
      .select('id, assigned_to, completed, name')
      .eq('team_id', team.id);

    let repositioned = 0;

    if (allRemainingPlanets && allRemainingPlanets.length > 0) {
      // Group planets by assigned_to
      const groups = new Map<string, typeof allRemainingPlanets>();
      for (const planet of allRemainingPlanets) {
        const key = (planet.assigned_to || '').toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(planet);
      }

      const repositionUpdates: Array<{ id: string; x: number; y: number }> = [];

      for (const [assignee, groupPlanets] of groups) {
        // Stable sort: active planets first (inner rings), completed last (outer rings)
        // Within each group, alphabetical by name for deterministic ordering
        groupPlanets.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return a.name.localeCompare(b.name);
        });

        const isUnassigned = !assignee || !PLAYER_ZONES[assignee];
        const baseZone = isUnassigned ? DEFAULT_ZONE : PLAYER_ZONES[assignee];

        if (isUnassigned) {
          // Arcs above Mission Control (deterministic, no random jitter)
          const baseDistance = 350;
          const arcSpacing = 110;
          const planetsPerArc = 5;

          for (let i = 0; i < groupPlanets.length; i++) {
            const arcIndex = Math.floor(i / planetsPerArc);
            const posInArc = i % planetsPerArc;
            const arcRadius = baseDistance + arcIndex * arcSpacing;

            const arcSpread = Math.PI * 0.35;
            const baseAngle = -Math.PI / 2;
            const staggerOffset = (arcIndex % 2 === 1) ? 0.5 : 0;
            const t = planetsPerArc > 1 ? (posInArc + staggerOffset) / planetsPerArc : 0.5;
            const angle = baseAngle + (t - 0.5) * arcSpread * 2;

            // Deterministic organic variation (seed-based, not random)
            const seed = (i * 137.5) % 1;
            const radiusVariation = (seed - 0.5) * 25;
            const angleVariation = (((i * 97.3) % 1) - 0.5) * 0.06;

            repositionUpdates.push({
              id: groupPlanets[i].id,
              x: Math.round(baseZone.x + Math.cos(angle + angleVariation) * (arcRadius + radiusVariation)),
              y: Math.round(baseZone.y + Math.sin(angle + angleVariation) * (arcRadius + radiusVariation)),
            });
          }
        } else {
          // Rings around player's home planet (deterministic, no random jitter)
          const baseRadius = 380;
          const ringSpacing = 100;
          const angleStep = 0.7; // ~40°, fits 9 planets per ring
          const planetsPerRing = 9;

          for (let i = 0; i < groupPlanets.length; i++) {
            const ring = Math.floor(i / planetsPerRing);
            const slotInRing = i % planetsPerRing;
            const radius = baseRadius + ring * ringSpacing;
            const angle = slotInRing * angleStep + (ring * 0.35); // Offset each ring

            repositionUpdates.push({
              id: groupPlanets[i].id,
              x: Math.round(baseZone.x + Math.cos(angle) * radius),
              y: Math.round(baseZone.y + Math.sin(angle) * radius),
            });
          }
        }

        console.log(`Reposition: ${assignee || 'unassigned'} → ${groupPlanets.length} planets`);
      }

      // Apply all position updates
      for (const update of repositionUpdates) {
        const { error: updateError } = await supabase
          .from('notion_planets')
          .update({ x: update.x, y: update.y })
          .eq('id', update.id);

        if (!updateError) repositioned++;
      }

      console.log(`Repositioned ${repositioned}/${repositionUpdates.length} planets`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_in_notion: pages.length,
          created: created.length,
          updated: updated.length,
          deleted: deleted.length,
          skipped: skipped.length,
          errors: errors.length,
          creator_points_awarded: totalCreatorPoints,
          repositioned,
        },
        created,
        updated,
        deleted,
        skipped,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
