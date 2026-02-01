// Notion Webhook Handler for Mission Control Space
// Receives webhooks from Notion when tasks are created/updated and creates planets in the game

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notion-secret',
};

interface NotionWebhookPayload {
  // Simplified format (manual/Zapier)
  id: string;
  name: string;
  description?: string;
  type?: string;
  points?: number;
  assigned_to?: string;
  status?: string;
  url?: string;
}

// Parse native Notion automation payload into our simplified format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNativeNotionPayload(raw: any): NotionWebhookPayload | null {
  // Check if this is a native Notion payload (has data.properties)
  if (!raw.data?.properties) {
    return null; // Not a native Notion payload
  }

  const data = raw.data;
  const props = data.properties;

  // Extract title - look for title type property
  let name = '';
  for (const key of Object.keys(props)) {
    if (props[key].type === 'title' && props[key].title?.[0]?.plain_text) {
      name = props[key].title[0].plain_text;
      break;
    }
  }

  // Extract assigned person - look for people type property
  let assignedTo = '';
  for (const key of Object.keys(props)) {
    if (props[key].type === 'people' && props[key].people?.[0]?.name) {
      assignedTo = props[key].people[0].name.toLowerCase();
      break;
    }
  }

  // Extract description - look for rich_text type property named Description
  let description = '';
  if (props['Description']?.rich_text?.[0]?.plain_text) {
    description = props['Description'].rich_text[0].plain_text;
  }

  // Extract type - look for select property
  let type = '';
  for (const key of Object.keys(props)) {
    if (props[key].type === 'select' && props[key].select?.name) {
      type = props[key].select.name.toLowerCase();
      break;
    }
  }

  return {
    id: data.id,
    name: name || 'Untitled',
    description: description || undefined,
    type: type || undefined,
    assigned_to: assignedTo || undefined,
    url: data.url || undefined,
  };
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
  'quentin': { x: CENTER_X + PLAYER_DISTANCE, y: CENTER_Y }, // Right
  'alex': { x: CENTER_X + PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 }, // Top-Right
  'armel': { x: CENTER_X, y: CENTER_Y - PLAYER_DISTANCE }, // Top
  'melia': { x: CENTER_X - PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 }, // Top-Left
  'hugue': { x: CENTER_X - PLAYER_DISTANCE, y: CENTER_Y }, // Left
};

// Default zone for unassigned tasks
const DEFAULT_ZONE = { x: CENTER_X, y: CENTER_Y + 500 }; // Below center

// Planet radius for collision detection
const PLANET_RADIUS = 50;
const MIN_DISTANCE = PLANET_RADIUS * 3; // Minimum distance between planet centers

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

  // Also avoid the home planet at zone center
  const allObstacles: ExistingPlanet[] = [
    ...existingPlanets,
    { x: baseZone.x, y: baseZone.y }, // Home planet at zone center
  ];

  // Try to find a non-overlapping position
  // Start with a spiral pattern around the zone center
  const maxAttempts = 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Spiral outward: increasing radius with each attempt
    const ring = Math.floor(attempt / 8); // Which ring (0, 1, 2, ...)
    const angleIndex = attempt % 8; // Position in ring (0-7)
    const baseRadius = 200 + ring * 150; // Start 200px out, expand by 150px per ring
    const angle = (angleIndex / 8) * Math.PI * 2 + (ring * 0.3); // Offset angle per ring

    const candidate = {
      x: baseZone.x + Math.cos(angle) * baseRadius,
      y: baseZone.y + Math.sin(angle) * baseRadius,
    };

    // Check if this position is far enough from all existing planets
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

  // Fallback: random position further out if spiral fails
  const fallbackRadius = 600 + Math.random() * 400;
  const fallbackAngle = Math.random() * Math.PI * 2;
  return {
    x: baseZone.x + Math.cos(fallbackAngle) * fallbackRadius,
    y: baseZone.y + Math.sin(fallbackAngle) * fallbackRadius,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret (from header or query param)
    const url = new URL(req.url);
    const notionSecret = req.headers.get('x-notion-secret') || url.searchParams.get('secret');
    const expectedSecret = Deno.env.get('NOTION_WEBHOOK_SECRET');

    if (!expectedSecret) {
      console.error('NOTION_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (notionSecret !== expectedSecret) {
      console.error('Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse webhook payload
    const rawPayload = await req.json();
    console.log('RAW PAYLOAD:', JSON.stringify(rawPayload, null, 2));

    // Debug mode: if ?debug=true, just return what we received
    if (url.searchParams.get('debug') === 'true') {
      const parsed = parseNativeNotionPayload(rawPayload);
      return new Response(
        JSON.stringify({ received: rawPayload, parsed: parsed }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to parse as native Notion payload first, fall back to simple format
    const payload: NotionWebhookPayload = parseNativeNotionPayload(rawPayload) || rawPayload;

    // Validate required fields
    if (!payload.id || !payload.name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id and name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for duplicate planet (idempotency)
    const { data: existingPlanet } = await supabase
      .from('notion_planets')
      .select('id')
      .eq('notion_task_id', payload.id)
      .single();

    if (existingPlanet) {
      console.log('Planet already exists for task:', payload.id);
      return new Response(
        JSON.stringify({ message: 'Planet already exists', task_id: payload.id, planet_id: existingPlanet.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get point configuration for this task type
    let points = payload.points; // Use custom points if provided

    if (!points) {
      // Look up points from config
      const taskType = payload.type?.toLowerCase() || 'default';
      const { data: config } = await supabase
        .from('point_config')
        .select('points')
        .eq('source', 'notion')
        .eq('task_type', taskType)
        .single();

      if (config) {
        points = config.points;
      } else {
        // Fallback to default
        const { data: defaultConfig } = await supabase
          .from('point_config')
          .select('points')
          .eq('source', 'notion')
          .eq('task_type', 'default')
          .single();

        points = defaultConfig?.points || 30;
      }
    }

    // Find the team
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_points')
      .limit(1);

    if (!teams || teams.length === 0) {
      console.error('No teams found');
      return new Response(
        JSON.stringify({ error: 'No team configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const team = teams[0];

    // Fetch existing notion planets to avoid overlap
    const { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('x, y')
      .eq('team_id', team.id);

    // Calculate planet position avoiding overlaps
    const position = findNonOverlappingPosition(
      payload.assigned_to,
      existingPlanets || []
    );

    // Create the planet
    const { data: planet, error: planetError } = await supabase
      .from('notion_planets')
      .insert({
        team_id: team.id,
        notion_task_id: payload.id,
        name: payload.name,
        description: payload.description || null,
        notion_url: payload.url || null,
        assigned_to: payload.assigned_to?.toLowerCase() || null,
        task_type: payload.type || null,
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
        JSON.stringify({ error: 'Failed to create planet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Created planet "${payload.name}" at (${position.x}, ${position.y}) for ${payload.assigned_to || 'unassigned'}`);

    return new Response(
      JSON.stringify({
        success: true,
        planet_id: planet.id,
        planet_name: payload.name,
        assigned_to: payload.assigned_to || null,
        position: position,
        points: points,
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
