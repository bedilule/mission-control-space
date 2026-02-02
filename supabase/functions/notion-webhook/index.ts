// Notion Webhook Handler for Mission Control Space
// Receives webhooks from Notion when tasks are created/updated and creates planets in the game

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notion-secret',
};

interface NotionWebhookPayload {
  id: string;
  name: string;
  description?: string;
  type?: string; // bug, enhancement
  priority?: string; // critical, high, medium, low
  points?: number;
  assigned_to?: string; // Player username for planet placement
  assigned_to_notion_id?: string; // Notion user ID for mapping
  created_by?: string; // Player username for points attribution
  created_by_notion_id?: string; // Notion user ID for mapping
  status?: string;
  url?: string;
}

interface ExistingPlanet {
  x: number;
  y: number;
}

// Player zone positions (must match SpaceGame.ts)
const CENTER_X = 5000;
const CENTER_Y = 5000;
const PLAYER_DISTANCE = 3000;
const HUB_DISTANCE = 2800;

// Mission Control position (bottom middle, lower than Business and Product hubs)
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

// Planet radius for collision detection
const PLANET_RADIUS = 50;
const MIN_DISTANCE = PLANET_RADIUS * 3;

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function findNonOverlappingPosition(
  assignedTo: string | null | undefined,
  existingPlanets: ExistingPlanet[]
): { x: number; y: number } {
  const isUnassigned = !assignedTo || !PLAYER_ZONES[assignedTo.toLowerCase()];
  const baseZone = isUnassigned ? DEFAULT_ZONE : PLAYER_ZONES[assignedTo.toLowerCase()];

  // For unassigned tasks, also avoid the Shop and Factory stations
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

  const maxAttempts = 50;

  // For unassigned tasks: staggered honeycomb arcs ABOVE Mission Control
  // For assigned tasks: scatter around player zone
  if (isUnassigned) {
    const baseDistance = 350; // Clear of stations
    const arcSpacing = 110;
    const planetsPerArc = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const arcIndex = Math.floor(attempt / planetsPerArc);
      const posInArc = attempt % planetsPerArc;
      const arcRadius = baseDistance + arcIndex * arcSpacing;

      const arcSpread = Math.PI * 0.35;
      const baseAngle = -Math.PI / 2;
      // Stagger: odd arcs offset by half a position
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
  } else {
    // Assigned tasks: tight rings around player's home planet
    // Ring 1 at 380 units, Ring 2 at 480 units, etc.
    // Gap filling: tries each slot in order, skips occupied ones
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
  }

  // Fallback - place in outer arcs above Mission Control
  if (isUnassigned) {
    const fallbackArc = 3 + Math.floor(Math.random() * 4); // Arcs 3-6
    const fallbackRadius = 350 + fallbackArc * 110 + (Math.random() - 0.5) * 40;
    const fallbackAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.35 * 2;
    return {
      x: baseZone.x + Math.cos(fallbackAngle) * fallbackRadius,
      y: baseZone.y + Math.sin(fallbackAngle) * fallbackRadius,
    };
  }
  // For assigned tasks: outer rings around home planet
  const fallbackRing = 2 + Math.floor(Math.random() * 3); // Rings 2-4
  const fallbackRadius = 380 + fallbackRing * 100;
  const fallbackAngle = Math.random() * Math.PI * 2;
  return {
    x: baseZone.x + Math.cos(fallbackAngle) * fallbackRadius,
    y: baseZone.y + Math.sin(fallbackAngle) * fallbackRadius,
  };
}

// Parse native Notion automation payload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNativeNotionPayload(raw: any): NotionWebhookPayload | null {
  if (!raw.data?.properties) {
    return null;
  }

  const data = raw.data;
  const props = data.properties;

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
  } else if (data.created_by) {
    createdBy = data.created_by.name?.toLowerCase() || '';
    createdByNotionId = data.created_by.id || '';
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
    id: data.id,
    name: name || 'Untitled',
    description: description || undefined,
    type: type || undefined,
    priority: priority || undefined,
    assigned_to: assignedTo || undefined,
    assigned_to_notion_id: assignedToNotionId || undefined,
    created_by: createdBy || undefined,
    created_by_notion_id: createdByNotionId || undefined,
    status: status || undefined,
    url: data.url || undefined,
  };
}

// Calculate points based on priority
function calculatePoints(priority: string | undefined): number {
  if (!priority) return PRIORITY_POINTS.default;
  const key = priority.toLowerCase();
  return PRIORITY_POINTS[key] || PRIORITY_POINTS.default;
}

// Normalize UUID for consistent comparison (Notion IDs can have or not have dashes)
function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

// Format UUID with dashes (standard format)
function formatUuidWithDashes(id: string): string {
  const normalized = id.replace(/-/g, '').toLowerCase();
  if (normalized.length !== 32) return id; // Invalid UUID, return as-is
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
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
    const url = new URL(req.url);
    const rawPayload = await req.json();
    console.log('RAW PAYLOAD:', JSON.stringify(rawPayload, null, 2));

    // Debug mode
    if (url.searchParams.get('debug') === 'true') {
      const parsed = parseNativeNotionPayload(rawPayload);
      return new Response(
        JSON.stringify({ received: rawPayload, parsed: parsed }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: NotionWebhookPayload = parseNativeNotionPayload(rawPayload) || rawPayload;

    if (!payload.id || !payload.name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id and name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check status for proper handling
    const statusLower = (payload.status || '').toLowerCase();
    const isTicketOpen = statusLower === 'ticket open';
    const isArchived = statusLower === 'archived' || statusLower.includes('archived');
    const isDestroyed = statusLower === 'destroyed';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find team (needed for all operations)
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

    // Resolve assigned player's game username using mapping (for correct zone placement)
    let resolvedAssignedTo = payload.assigned_to || null;
    if (payload.assigned_to || payload.assigned_to_notion_id) {
      const assignedPlayer = await findPlayerByNotionUser(
        supabase,
        team.id,
        payload.assigned_to_notion_id,
        payload.assigned_to
      );
      if (assignedPlayer) {
        resolvedAssignedTo = assignedPlayer.username.toLowerCase();
      }
    }

    // Normalize the Notion task ID for consistent comparison
    // Notion API sometimes returns IDs with dashes, sometimes without
    const normalizedTaskId = formatUuidWithDashes(payload.id);

    // Check if planet already exists (try with normalized ID)
    let { data: existingPlanet } = await supabase
      .from('notion_planets')
      .select('id, team_id, assigned_to, completed, x, y, notion_task_id')
      .eq('notion_task_id', normalizedTaskId)
      .single();

    // If not found, try with original ID (in case DB has different format)
    if (!existingPlanet && payload.id !== normalizedTaskId) {
      const { data: altPlanet } = await supabase
        .from('notion_planets')
        .select('id, team_id, assigned_to, completed, x, y, notion_task_id')
        .eq('notion_task_id', payload.id)
        .single();
      existingPlanet = altPlanet;
    }

    // Handle destroyed status - ALWAYS delete/skip, never create or keep
    if (isDestroyed) {
      if (existingPlanet) {
        const { error: deleteError } = await supabase
          .from('notion_planets')
          .delete()
          .eq('id', existingPlanet.id);

        if (deleteError) {
          console.error('Failed to delete destroyed planet:', deleteError);
        } else {
          console.log(`Deleted planet "${payload.name}" - status is Destroyed`);
        }
      } else {
        console.log(`Skipping "${payload.name}" - status is Destroyed, planet doesn't exist`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: existingPlanet ? 'deleted' : 'skipped',
          reason: 'status_destroyed',
          planet_name: payload.name,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle archived status - mark as completed but never recreate if deleted
    if (isArchived) {
      if (existingPlanet) {
        // Mark as completed
        await supabase
          .from('notion_planets')
          .update({ completed: true })
          .eq('id', existingPlanet.id);
        console.log(`Marked planet "${payload.name}" as completed - status is Archived`);
      } else {
        console.log(`Skipping "${payload.name}" - status is Archived, planet doesn't exist (was destroyed)`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: existingPlanet ? 'completed' : 'skipped',
          reason: 'status_archived',
          planet_name: payload.name,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If status is not "Ticket Open" and planet doesn't exist, skip creating it
    if (!isTicketOpen && !existingPlanet) {
      console.log(`Skipping "${payload.name}" - status is "${payload.status}", not Ticket Open`);
      return new Response(
        JSON.stringify({
          success: true,
          action: 'skipped',
          reason: 'status_not_ticket_open',
          planet_name: payload.name,
          status: payload.status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If planet exists, update it instead of creating a new one
    if (existingPlanet) {
      // Calculate points based on priority
      const points = payload.points || calculatePoints(payload.priority);

      // Check if assignment changed - need to move planet
      const assignmentChanged = existingPlanet.assigned_to !== resolvedAssignedTo;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = {
        name: payload.name,
        description: payload.description || null,
        task_type: payload.type || null,
        priority: payload.priority || null,
        points: points,
        notion_url: payload.url || null,
      };

      // If assignment changed, calculate new position
      if (assignmentChanged) {
        const { data: existingPlanets } = await supabase
          .from('notion_planets')
          .select('x, y')
          .eq('team_id', team.id)
          .neq('id', existingPlanet.id);

        const newPosition = findNonOverlappingPosition(
          resolvedAssignedTo,
          existingPlanets || []
        );
        updates.assigned_to = resolvedAssignedTo;
        updates.x = Math.round(newPosition.x);
        updates.y = Math.round(newPosition.y);

        console.log(`Moving planet "${payload.name}" to ${resolvedAssignedTo || 'unassigned'} zone`);
      }

      // Check if status indicates completion (archived = done)
      const isCompleted = isArchived;

      if (isCompleted && !existingPlanet.completed) {
        updates.completed = true;

        // Award personal points for completion - find player by Notion ID or name
        if (payload.assigned_to || payload.assigned_to_notion_id) {
          const player = await findPlayerByNotionUser(
            supabase,
            team.id,
            payload.assigned_to_notion_id,
            payload.assigned_to
          );

          if (player) {
            await supabase.from('point_transactions').insert({
              team_id: team.id,
              player_id: player.id,
              source: 'notion',
              notion_task_id: payload.id,
              task_name: `Completed: ${payload.name}`,
              points: points,
              point_type: 'personal',
            });

            // Update player's personal points (not team points)
            const { data: playerData } = await supabase
              .from('players')
              .select('personal_points')
              .eq('id', player.id)
              .single();

            await supabase
              .from('players')
              .update({ personal_points: (playerData?.personal_points || 0) + points })
              .eq('id', player.id);

            console.log(`Awarded ${points} personal points to ${player.username} for completing "${payload.name}"`);
          }
        }
      }

      // Apply updates
      const { error: updateError } = await supabase
        .from('notion_planets')
        .update(updates)
        .eq('id', existingPlanet.id);

      if (updateError) {
        console.error('Failed to update planet:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update planet', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Updated planet "${payload.name}" - priority: ${payload.priority}, type: ${payload.type}`);

      return new Response(
        JSON.stringify({
          success: true,
          action: 'updated',
          planet_id: existingPlanet.id,
          planet_name: payload.name,
          changes: { assignmentChanged, completed: isCompleted },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate points based on priority
    const points = payload.points || calculatePoints(payload.priority);

    // Fetch existing planets
    const { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('x, y')
      .eq('team_id', team.id);

    // Calculate position based on resolved assigned player
    const position = findNonOverlappingPosition(
      resolvedAssignedTo,
      existingPlanets || []
    );

    // Create planet using upsert to prevent duplicates
    const { data: planet, error: planetError } = await supabase
      .from('notion_planets')
      .upsert({
        team_id: team.id,
        notion_task_id: normalizedTaskId,
        name: payload.name,
        description: payload.description || null,
        notion_url: payload.url || null,
        assigned_to: resolvedAssignedTo,
        created_by: payload.created_by || null,
        task_type: payload.type || null,
        priority: payload.priority || null,
        points: points,
        x: Math.round(position.x),
        y: Math.round(position.y),
        completed: false,
      }, {
        onConflict: 'notion_task_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (planetError) {
      console.error('Failed to create planet:', planetError);
      return new Response(
        JSON.stringify({ error: 'Failed to create planet', details: planetError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Award 10 personal points to the creator for creating the task
    if (payload.created_by || payload.created_by_notion_id) {
      // Find the player by Notion user ID or username
      const creator = await findPlayerByNotionUser(
        supabase,
        team.id,
        payload.created_by_notion_id,
        payload.created_by
      );

      if (creator) {
        // Check if creator already received points for this task (avoid duplicate awards)
        const { data: existingTransaction } = await supabase
          .from('point_transactions')
          .select('id')
          .eq('notion_task_id', normalizedTaskId)
          .eq('player_id', creator.id)
          .eq('task_name', `Created: ${payload.name}`)
          .single();

        if (!existingTransaction) {
          // Insert point transaction for creation (personal points)
          await supabase.from('point_transactions').insert({
            team_id: team.id,
            player_id: creator.id,
            source: 'notion',
            notion_task_id: normalizedTaskId,
            task_name: `Created: ${payload.name}`,
            points: 10,
            point_type: 'personal',
          });

          // Update creator's personal points (not team points)
          const { data: creatorData } = await supabase
            .from('players')
            .select('personal_points')
            .eq('id', creator.id)
            .single();

          await supabase
            .from('players')
            .update({ personal_points: (creatorData?.personal_points || 0) + 10 })
            .eq('id', creator.id);

          console.log(`Awarded 10 personal points to ${creator.username} for creating "${payload.name}"`);
        }
      }
    }

    console.log(`Created planet "${payload.name}" for ${resolvedAssignedTo || 'unassigned'}`);

    return new Response(
      JSON.stringify({
        success: true,
        planet_id: planet.id,
        planet_name: payload.name,
        assigned_to: resolvedAssignedTo,
        created_by: payload.created_by || null,
        position: position,
        points: points,
        priority: payload.priority || null,
        notion_url: payload.url || null,
        team_id: team.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
