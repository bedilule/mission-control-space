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

// Check if a position is in the correct zone for the assigned player
function isInCorrectZone(
  position: { x: number; y: number },
  assignedTo: string | null | undefined
): boolean {
  const expectedZone = assignedTo && PLAYER_ZONES[assignedTo.toLowerCase()]
    ? PLAYER_ZONES[assignedTo.toLowerCase()]
    : DEFAULT_ZONE;

  // Consider "in zone" if within 1000 units of the zone center
  const MAX_ZONE_DISTANCE = 1000;
  return distance(position, expectedZone) <= MAX_ZONE_DISTANCE;
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

  // Add Mission Control stations as obstacles for unassigned tasks
  if (isUnassigned) {
    allObstacles.push(
      { x: MISSION_CONTROL_X + 200, y: MISSION_CONTROL_Y }, // Shop
      { x: MISSION_CONTROL_X - 200, y: MISSION_CONTROL_Y }, // Factory
    );
  }

  const maxAttempts = 50;

  // For unassigned tasks: place in arcs ABOVE Mission Control (negative Y direction)
  if (isUnassigned) {
    const baseDistance = 350; // Clear of stations
    const arcSpacing = 110;
    const planetsPerArc = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const arcIndex = Math.floor(attempt / planetsPerArc);
      const posInArc = attempt % planetsPerArc;
      const arcRadius = baseDistance + arcIndex * arcSpacing;

      const arcSpread = Math.PI * 0.35;
      const baseAngle = -Math.PI / 2; // Points UP (above Mission Control)
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

    // Fallback for unassigned: outer arcs above Mission Control
    const fallbackArc = 3 + Math.floor(Math.random() * 4);
    const fallbackRadius = 350 + fallbackArc * 110 + (Math.random() - 0.5) * 40;
    const fallbackAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.35 * 2;
    return {
      x: baseZone.x + Math.cos(fallbackAngle) * fallbackRadius,
      y: baseZone.y + Math.sin(fallbackAngle) * fallbackRadius,
    };
  }

  // For assigned tasks: rings around player zone
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ring = Math.floor(attempt / 8);
    const angleIndex = attempt % 8;
    const baseRadius = 200 + ring * 150;
    const angle = (angleIndex / 8) * Math.PI * 2 + (ring * 0.3);

    const candidate = {
      x: baseZone.x + Math.cos(angle) * baseRadius,
      y: baseZone.y + Math.sin(angle) * baseRadius,
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

  const fallbackRadius = 600 + Math.random() * 400;
  const fallbackAngle = Math.random() * Math.PI * 2;
  return {
    x: baseZone.x + Math.cos(fallbackAngle) * fallbackRadius,
    y: baseZone.y + Math.sin(fallbackAngle) * fallbackRadius,
  };
}

function calculatePoints(priority: string | undefined): number {
  if (!priority) return PRIORITY_POINTS.default;
  const key = priority.toLowerCase();
  return PRIORITY_POINTS[key] || PRIORITY_POINTS.default;
}

// Parse a Notion page into our format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNotionPage(page: any): {
  id: string;
  name: string;
  description?: string;
  type?: string;
  priority?: string;
  assigned_to?: string;
  assigned_to_notion_id?: string;
  created_by?: string;
  created_by_notion_id?: string;
  status?: string;
  url?: string;
} | null {
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

  // Extract "Attributed to" (people) - for planet placement
  let assignedTo = '';
  let assignedToNotionId = '';
  if (props['Attributed to']?.people?.[0]) {
    const person = props['Attributed to'].people[0];
    assignedTo = person.name?.toLowerCase() || '';
    assignedToNotionId = person.id || '';
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

  // Extract "What is it ?" (type: bug/enhancement)
  let type = '';
  if (props['What is it ?']?.select?.name) {
    const rawType = props['What is it ?'].select.name.toLowerCase();
    if (rawType.includes('bug') || rawType.includes('problem')) {
      type = 'bug';
    } else if (rawType.includes('enhancement')) {
      type = 'enhancement';
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

  return {
    id: page.id,
    name: name,
    description: description || undefined,
    type: type || undefined,
    priority: priority || undefined,
    assigned_to: assignedTo || undefined,
    assigned_to_notion_id: assignedToNotionId || undefined,
    created_by: createdBy || undefined,
    created_by_notion_id: createdByNotionId || undefined,
    status: status || undefined,
    url: page.url || undefined,
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

    // Fetch all pages from Notion database
    // Only get "Ticket Open" tasks (live planets)
    // Using "select" filter since the Status property is a Select field
    const notionResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'Status',
          select: {
            equals: 'Ticket Open',
          },
        },
        page_size: 100,
      }),
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
    let pages = notionData.results || [];

    console.log(`Notion API returned ${pages.length} pages`);

    // Double-check: filter to only "Ticket Open" status (safeguard against API quirks)
    // This ensures we never recreate Archived or Destroyed tasks
    pages = pages.filter((page: any) => {
      const props = page.properties;
      const status = props['Status']?.select?.name || props['Status']?.status?.name || '';
      const isTicketOpen = status.toLowerCase() === 'ticket open';
      if (!isTicketOpen) {
        console.log(`Filtering out "${props['Ticket']?.title?.[0]?.plain_text || page.id}" - status is "${status}", not "Ticket Open"`);
      }
      return isTicketOpen;
    });

    console.log(`After filtering: ${pages.length} "Ticket Open" tasks`);

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

    // Build lookup map for existing planets by normalized notion_task_id
    type ExistingPlanetData = { id: string; notion_task_id: string; name: string; assigned_to: string | null; x: number; y: number; completed: boolean };
    const existingByTaskId = new Map<string, ExistingPlanetData>();
    const existingPositions: ExistingPlanet[] = [];
    for (const planet of allPlanets || []) {
      existingByTaskId.set(normalizeId(planet.notion_task_id), { ...planet });
      existingPositions.push({ x: planet.x, y: planet.y });
    }

    // Find planets whose Notion tasks are no longer "Ticket Open"
    // Only delete non-completed planets (completed ones should stay with flag)
    for (const planet of allPlanets || []) {
      if (!notionTaskIds.has(normalizeId(planet.notion_task_id))) {
        // Task is no longer "Ticket Open" in Notion
        if (planet.completed) {
          // Keep completed planets - they have a flag, were archived/destroyed in Notion
          skipped.push(`${planet.name} (keeping completed)`);
          continue;
        }

        // Non-completed planet whose task is no longer open - remove it
        const { error: deleteError } = await supabase
          .from('notion_planets')
          .delete()
          .eq('id', planet.id);

        if (deleteError) {
          errors.push(`Failed to delete ${planet.name}: ${deleteError.message}`);
        } else {
          deleted.push(planet.name);
          console.log(`Deleted planet "${planet.name}" - Notion task no longer "Ticket Open"`);
        }
      }
    }

    for (const page of pages) {
      const parsed = parseNotionPage(page);
      if (!parsed) {
        errors.push(`Failed to parse page ${page.id}`);
        continue;
      }

      // Resolve assigned player's game username using mapping
      let resolvedAssignedTo = parsed.assigned_to || null;
      if (parsed.assigned_to || parsed.assigned_to_notion_id) {
        const assignedPlayer = await findPlayerByNotionUser(
          supabase,
          team.id,
          parsed.assigned_to_notion_id,
          parsed.assigned_to
        );
        if (assignedPlayer) {
          resolvedAssignedTo = assignedPlayer.username.toLowerCase();
        }
      }

      // Check if already exists (using normalized ID for comparison)
      const existing = existingByTaskId.get(normalizeId(parsed.id));
      if (existing) {
        // Update existing planet with latest data
        const points = calculatePoints(parsed.priority);

        // Check if assignment changed or planet is in wrong zone - need to reposition planet
        const assignmentChanged = existing.assigned_to !== resolvedAssignedTo;
        const inWrongZone = !isInCorrectZone({ x: existing.x, y: existing.y }, resolvedAssignedTo);
        const needsReposition = assignmentChanged || inWrongZone;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
          name: parsed.name,
          description: parsed.description || null,
          assigned_to: resolvedAssignedTo,
          task_type: parsed.type || null,
          priority: parsed.priority || null,
          points: points,
          notion_url: parsed.url || null,
        };

        // Recalculate position if assignment changed or planet is in wrong zone
        if (needsReposition) {
          // Get other planets' positions (excluding this one)
          const otherPositions = existingPositions.filter(
            p => p.x !== existing.x || p.y !== existing.y
          );
          const newPosition = findNonOverlappingPosition(resolvedAssignedTo, otherPositions);
          updateData.x = Math.round(newPosition.x);
          updateData.y = Math.round(newPosition.y);

          // Update our tracking of positions
          const idx = existingPositions.findIndex(p => p.x === existing.x && p.y === existing.y);
          if (idx >= 0) {
            existingPositions[idx] = newPosition;
          }
        }

        const { error: updateError } = await supabase
          .from('notion_planets')
          .update(updateData)
          .eq('id', existing.id);

        if (updateError) {
          errors.push(`Failed to update ${parsed.name}: ${updateError.message}`);
        } else {
          updated.push(parsed.name);
        }
        continue;
      }

      // Calculate points based on priority
      const points = calculatePoints(parsed.priority);

      // Find position for new planet using resolved player username
      const position = findNonOverlappingPosition(resolvedAssignedTo, existingPositions);

      // Add to existing positions for next iteration
      existingPositions.push(position);

      // Create or update planet (upsert on notion_task_id conflict)
      const { data: upsertResult, error: upsertError } = await supabase
        .from('notion_planets')
        .upsert({
          team_id: team.id,
          notion_task_id: parsed.id,
          name: parsed.name,
          description: parsed.description || null,
          notion_url: parsed.url || null,
          assigned_to: resolvedAssignedTo,
          created_by: parsed.created_by || null,
          task_type: parsed.type || null,
          priority: parsed.priority || null,
          points: points,
          x: Math.round(position.x),
          y: Math.round(position.y),
          completed: false,
        }, {
          onConflict: 'notion_task_id',
          ignoreDuplicates: false,
        })
        .select('id')
        .single();

      if (upsertError) {
        errors.push(`Failed to create ${parsed.name}: ${upsertError.message}`);
        continue;
      }

      // Check if this was a new insert or an update (we track as created for simplicity)
      created.push(parsed.name);

      // Award 10 personal points to creator - find by Notion ID or name
      if (parsed.created_by || parsed.created_by_notion_id) {
        const creator = await findPlayerByNotionUser(
          supabase,
          team.id,
          parsed.created_by_notion_id,
          parsed.created_by
        );

        if (creator) {
          await supabase.from('point_transactions').insert({
            team_id: team.id,
            player_id: creator.id,
            source: 'notion',
            notion_task_id: parsed.id,
            task_name: `Created: ${parsed.name}`,
            points: 10,
            point_type: 'personal',
          });

          // Update creator's personal points
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
        }
      }
    }

    // Note: totalCreatorPoints is now tracked for logging purposes only
    // Personal points are updated per-player, not team-wide

    console.log(`Sync complete: ${created.length} created, ${updated.length} updated, ${deleted.length} deleted, ${skipped.length} skipped, ${errors.length} errors`);

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
