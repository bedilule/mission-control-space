// Notion Create - Creates a task in Notion and a planet in the game
// Used when creating planets from the in-game Planet Factory

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Notion database ID
const NOTION_DATABASE_ID = '2467d5a8-0344-8198-a604-c6bd91473887';

interface CreateRequest {
  name: string;
  description?: string;
  type: 'task' | 'bug' | 'feature' | 'achievement' | 'business' | 'roadmap';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string; // Username or null for unassigned
  created_by: string;   // Username of creator
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

const DEFAULT_ZONE = { x: CENTER_X, y: CENTER_Y + 500 };

// Points based on priority
const PRIORITY_POINTS: Record<string, number> = {
  'critical': 150,
  'high': 100,
  'medium': 50,
  'low': 25,
  'default': 30,
};

// Priority emoji mapping for Notion
const PRIORITY_EMOJI: Record<string, string> = {
  'critical': '🧨 Critical',
  'high': '🔥 High',
  'medium': '⚡️ Medium',
  'low': '💡 Low',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CreateRequest = await req.json();

    if (!body.name || !body.created_by) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name, created_by' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Build Notion page properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notionProperties: Record<string, any> = {
      'Ticket': {
        title: [{ text: { content: body.name } }],
      },
    };

    // Add description if provided
    if (body.description) {
      notionProperties['Description'] = {
        rich_text: [{ text: { content: body.description } }],
      };
    }

    // Add priority if provided
    if (body.priority) {
      notionProperties['Priority'] = {
        select: { name: PRIORITY_EMOJI[body.priority] || body.priority },
      };
    }

    // Add type mapping (What is it?)
    const typeMapping: Record<string, string> = {
      'bug': '🐛 Bug / Problem',
      'feature': '✨ Enhancement',
      'task': '📋 Task',
      'achievement': '🏆 Achievement',
      'business': '💼 Business',
      'roadmap': '🗺️ Roadmap',
    };
    if (body.type && typeMapping[body.type]) {
      notionProperties['What is it ?'] = {
        select: { name: typeMapping[body.type] },
      };
    }

    // Find Notion user ID for assigned_to
    let notionUserId: string | null = null;
    if (body.assigned_to) {
      const usersResponse = await fetch('https://api.notion.com/v1/users', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
        },
      });

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        const notionUser = usersData.results?.find((user: { name?: string; type: string }) =>
          user.type === 'person' &&
          user.name?.toLowerCase() === body.assigned_to?.toLowerCase()
        );
        if (notionUser) {
          notionUserId = notionUser.id;
          notionProperties['Attributed to'] = {
            people: [{ id: notionUser.id }],
          };
        }
      }
    }

    // Create page in Notion
    const notionResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: notionProperties,
      }),
    });

    if (!notionResponse.ok) {
      const errorText = await notionResponse.text();
      console.error('Notion API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create Notion page', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notionPage = await notionResponse.json();
    const notionTaskId = notionPage.id;
    const notionUrl = notionPage.url;

    // Calculate points based on priority
    const points = body.priority ? PRIORITY_POINTS[body.priority] : PRIORITY_POINTS.default;

    // Get existing planets for position calculation
    const { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('x, y')
      .eq('team_id', team.id);

    // Calculate position
    const position = findNonOverlappingPosition(
      body.assigned_to,
      existingPlanets || []
    );

    // Create planet in our database
    const { data: planet, error: planetError } = await supabase
      .from('notion_planets')
      .insert({
        team_id: team.id,
        notion_task_id: notionTaskId,
        name: body.name,
        description: body.description || null,
        notion_url: notionUrl,
        assigned_to: body.assigned_to?.toLowerCase() || null,
        created_by: body.created_by.toLowerCase(),
        task_type: body.type || 'task',
        priority: body.priority || null,
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

    // Award 10 points to creator
    const { data: creator } = await supabase
      .from('players')
      .select('id')
      .eq('team_id', team.id)
      .ilike('username', body.created_by)
      .single();

    if (creator) {
      await supabase.from('point_transactions').insert({
        team_id: team.id,
        player_id: creator.id,
        source: 'notion',
        notion_task_id: notionTaskId,
        task_name: `Created: ${body.name}`,
        points: 10,
      });

      await supabase
        .from('teams')
        .update({ team_points: team.team_points + 10 })
        .eq('id', team.id);
    }

    console.log(`Created Notion task "${body.name}" and planet at (${position.x}, ${position.y})`);

    return new Response(
      JSON.stringify({
        success: true,
        notion_task_id: notionTaskId,
        notion_url: notionUrl,
        planet_id: planet.id,
        planet_name: body.name,
        assigned_to: body.assigned_to?.toLowerCase() || null,
        position: position,
        points: points,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Create error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
