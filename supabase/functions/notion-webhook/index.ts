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
  assigned_to?: string; // For planet placement
  created_by?: string; // For points attribution
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

const PLAYER_ZONES: Record<string, { x: number; y: number }> = {
  'quentin': { x: CENTER_X + PLAYER_DISTANCE, y: CENTER_Y },
  'alex': { x: CENTER_X + PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 },
  'armel': { x: CENTER_X, y: CENTER_Y - PLAYER_DISTANCE },
  'melia': { x: CENTER_X - PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 },
  'hugue': { x: CENTER_X - PLAYER_DISTANCE, y: CENTER_Y },
};

// Default zone for unassigned tasks
const DEFAULT_ZONE = { x: CENTER_X, y: CENTER_Y + 500 };

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
  const baseZone = assignedTo && PLAYER_ZONES[assignedTo.toLowerCase()]
    ? PLAYER_ZONES[assignedTo.toLowerCase()]
    : DEFAULT_ZONE;

  const allObstacles: ExistingPlanet[] = [
    ...existingPlanets,
    { x: baseZone.x, y: baseZone.y },
  ];

  const maxAttempts = 50;

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
  if (props['Attributed to']?.people?.[0]?.name) {
    assignedTo = props['Attributed to'].people[0].name.toLowerCase();
  }

  // Extract "Created by" - for points attribution
  let createdBy = '';
  if (props['Créé par']?.created_by?.name) {
    createdBy = props['Créé par'].created_by.name.toLowerCase();
  } else if (props['Created by']?.created_by?.name) {
    createdBy = props['Created by'].created_by.name.toLowerCase();
  } else if (data.created_by?.name) {
    createdBy = data.created_by.name.toLowerCase();
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
    created_by: createdBy || undefined,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const notionSecret = req.headers.get('x-notion-secret') || url.searchParams.get('secret');
    const expectedSecret = Deno.env.get('NOTION_WEBHOOK_SECRET');

    if (!expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (notionSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Skip if status is "archived" (already done)
    if (payload.status === 'archived') {
      return new Response(
        JSON.stringify({ message: 'Task already archived, skipping', task_id: payload.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for duplicate
    const { data: existingPlanet } = await supabase
      .from('notion_planets')
      .select('id')
      .eq('notion_task_id', payload.id)
      .single();

    if (existingPlanet) {
      return new Response(
        JSON.stringify({ message: 'Planet already exists', task_id: payload.id, planet_id: existingPlanet.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate points based on priority
    const points = payload.points || calculatePoints(payload.priority);

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

    // Fetch existing planets
    const { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('x, y')
      .eq('team_id', team.id);

    // Calculate position based on assigned_to
    const position = findNonOverlappingPosition(
      payload.assigned_to,
      existingPlanets || []
    );

    // Create planet
    const { data: planet, error: planetError } = await supabase
      .from('notion_planets')
      .insert({
        team_id: team.id,
        notion_task_id: payload.id,
        name: payload.name,
        description: payload.description || null,
        notion_url: payload.url || null,
        assigned_to: payload.assigned_to || null,
        created_by: payload.created_by || null,
        task_type: payload.type || null,
        priority: payload.priority || null,
        points: points,
        x: Math.round(position.x),
        y: Math.round(position.y),
        completed: false,
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

    console.log(`Created planet "${payload.name}" for ${payload.assigned_to || 'unassigned'}, points to ${payload.created_by || 'unknown'}`);

    return new Response(
      JSON.stringify({
        success: true,
        planet_id: planet.id,
        planet_name: payload.name,
        assigned_to: payload.assigned_to || null,
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
