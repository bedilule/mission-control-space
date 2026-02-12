// Notion Update - Edit properties of a Notion task from in-game
// Updates both our Supabase DB and the Notion page

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateRequest {
  notion_planet_id: string;
  name?: string;
  description?: string;
  task_type?: 'bug' | 'feature' | 'task' | 'biz';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  due_date?: string | null; // ISO date string or null to clear
  assigned_to?: string | null; // Username or null/empty to unassign
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

const DEFAULT_ZONE = { x: MISSION_CONTROL_X, y: MISSION_CONTROL_Y };

const PRIORITY_POINTS: Record<string, number> = {
  'critical': 150,
  'high': 100,
  'medium': 50,
  'low': 25,
};

const PRIORITY_EMOJI: Record<string, string> = {
  'critical': '🧨 Critical',
  'high': '🔥 High',
  'medium': '⚡️ Medium',
  'low': '💡 Low',
};

const TYPE_MAPPING: Record<string, string> = {
  'bug': '🐛 Bug / Problem',
  'feature': '✨ Enhancement',
  'task': '📋 Task',
  'biz': '💼 Biz',
};

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

  const allObstacles: ExistingPlanet[] = [
    ...existingPlanets,
    { x: baseZone.x, y: baseZone.y },
  ];

  if (isUnassigned) {
    allObstacles.push(
      { x: MISSION_CONTROL_X + 200, y: MISSION_CONTROL_Y },
      { x: MISSION_CONTROL_X - 200, y: MISSION_CONTROL_Y },
      { x: MISSION_CONTROL_X, y: MISSION_CONTROL_Y - 200 },
    );
  }

  const maxAttempts = 200;

  if (isUnassigned) {
    const baseDistance = 350;
    const arcSpacing = 110;
    const planetsPerArc = 5;
    const arcSpread = Math.PI * 0.35;
    const baseAngle = -Math.PI / 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const arcIndex = Math.floor(attempt / planetsPerArc);
      const posInArc = attempt % planetsPerArc;
      const arcRadius = baseDistance + arcIndex * arcSpacing;

      const staggerOffset = (arcIndex % 2 === 1) ? 0.5 : 0;
      const t = planetsPerArc > 1 ? (posInArc + staggerOffset) / planetsPerArc : 0.5;
      const angle = baseAngle + (t - 0.5) * arcSpread * 2;

      const seed = (attempt * 137.5) % 1;
      const radiusVariation = (seed - 0.5) * 25;
      const angleVariation = (((attempt * 97.3) % 1) - 0.5) * 0.06;

      const candidate = {
        x: baseZone.x + Math.cos(angle + angleVariation) * (arcRadius + radiusVariation),
        y: baseZone.y + Math.sin(angle + angleVariation) * (arcRadius + radiusVariation),
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

  // Assigned tasks: tight rings around player's home planet
  const baseRadius = 380;
  const ringSpacing = 100;
  const angleStep = 0.7;
  const planetsPerRing = 9;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ring = Math.floor(attempt / planetsPerRing);
    const slotInRing = attempt % planetsPerRing;
    const radius = baseRadius + ring * ringSpacing;
    const angle = slotInRing * angleStep + (ring * 0.35);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: UpdateRequest = await req.json();

    if (!body.notion_planet_id) {
      return new Response(
        JSON.stringify({ error: 'Missing notion_planet_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the planet
    const { data: planet, error: fetchError } = await supabase
      .from('notion_planets')
      .select('id, team_id, notion_task_id, name, assigned_to, completed, priority, task_type')
      .eq('id', body.notion_planet_id)
      .single();

    if (fetchError || !planet) {
      return new Response(
        JSON.stringify({ error: 'Planet not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (planet.completed) {
      return new Response(
        JSON.stringify({ error: 'Cannot edit completed task' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Supabase update object (only changed fields)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbUpdate: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notionProperties: Record<string, any> = {};

    let newPosition: { x: number; y: number } | null = null;
    const assigneeChanged = body.assigned_to !== undefined &&
      (body.assigned_to || '').toLowerCase() !== (planet.assigned_to || '').toLowerCase();

    // Name
    if (body.name !== undefined && body.name !== planet.name) {
      dbUpdate.name = body.name;
      notionProperties['Ticket'] = {
        title: [{ text: { content: body.name } }],
      };
    }

    // Description
    if (body.description !== undefined) {
      dbUpdate.description = body.description || null;
      notionProperties['Description'] = {
        rich_text: body.description ? [{ text: { content: body.description } }] : [],
      };
    }

    // Task type
    if (body.task_type !== undefined && body.task_type !== planet.task_type) {
      dbUpdate.task_type = body.task_type;
      if (TYPE_MAPPING[body.task_type]) {
        notionProperties['What is it ?'] = {
          select: { name: TYPE_MAPPING[body.task_type] },
        };
      }
    }

    // Priority
    if (body.priority !== undefined) {
      const currentPriority = (planet.priority || '').toLowerCase();
      const newPriorityLower = body.priority.toLowerCase();
      const priorityActuallyChanged = !currentPriority.includes(newPriorityLower);

      if (priorityActuallyChanged) {
        dbUpdate.priority = body.priority;
        dbUpdate.points = PRIORITY_POINTS[body.priority] || 30;
        if (PRIORITY_EMOJI[body.priority]) {
          notionProperties['Priority'] = {
            select: { name: PRIORITY_EMOJI[body.priority] },
          };
        }
      }
    }

    // Due date
    if (body.due_date !== undefined) {
      dbUpdate.due_date = body.due_date;
      notionProperties['Due Date'] = {
        date: body.due_date ? { start: body.due_date } : null,
      };
    }

    // Assigned to
    if (assigneeChanged) {
      const newOwner = body.assigned_to || null;
      dbUpdate.assigned_to = newOwner ? newOwner.toLowerCase() : null;

      // Get existing planets in target zone for positioning
      const targetOwner = newOwner ? newOwner.toLowerCase() : null;
      const { data: existingPlanets } = targetOwner
        ? await supabase
            .from('notion_planets')
            .select('x, y')
            .eq('team_id', planet.team_id)
            .ilike('assigned_to', targetOwner)
            .neq('id', planet.id)
        : await supabase
            .from('notion_planets')
            .select('x, y')
            .eq('team_id', planet.team_id)
            .is('assigned_to', null);

      newPosition = findNonOverlappingPosition(targetOwner, existingPlanets || []);
      dbUpdate.x = Math.round(newPosition.x);
      dbUpdate.y = Math.round(newPosition.y);
    }

    // Check if there's anything to update
    if (Object.keys(dbUpdate).length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No changes detected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update Supabase
    const { error: updateError } = await supabase
      .from('notion_planets')
      .update(dbUpdate)
      .eq('id', body.notion_planet_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update planet', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update Notion page
    const notionToken = Deno.env.get('NOTION_API_TOKEN');
    if (notionToken && (Object.keys(notionProperties).length > 0 || assigneeChanged)) {
      // Handle assignee change in Notion
      if (assigneeChanged) {
        if (body.assigned_to) {
          // Look up Notion user ID from mappings table
          const { data: mapping } = await supabase
            .from('notion_user_mappings')
            .select('notion_user_id, players!inner(username)')
            .eq('team_id', planet.team_id)
            .ilike('players.username', body.assigned_to)
            .single();

          if (mapping?.notion_user_id) {
            notionProperties['Attributed to'] = {
              people: [{ id: mapping.notion_user_id }],
            };
          } else {
            console.log(`No Notion user mapping found for player: ${body.assigned_to}`);
          }
        } else {
          // Clear assignee
          notionProperties['Attributed to'] = {
            people: [],
          };
        }
      }

      try {
        const updateResponse = await fetch(`https://api.notion.com/v1/pages/${planet.notion_task_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({ properties: notionProperties }),
        });

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('Failed to update Notion page:', errorText);
        } else {
          console.log(`Updated Notion page ${planet.notion_task_id}`);
        }
      } catch (notionError) {
        console.error('Failed to update Notion:', notionError);
      }
    }

    console.log(`Task "${planet.name}" updated:`, Object.keys(dbUpdate).join(', '));

    return new Response(
      JSON.stringify({
        success: true,
        planet_id: body.notion_planet_id,
        updated_fields: Object.keys(dbUpdate),
        new_position: newPosition,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Update error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
