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
  content: string;       // Single input — AI generates a title from this
  name?: string;         // Legacy: direct title (skips AI)
  description?: string;  // Legacy: direct description
  type: 'task' | 'bug' | 'feature' | 'achievement' | 'business' | 'roadmap';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string;  // Username or null for unassigned
  created_by: string;    // Username of creator
  auto_analyze?: boolean; // Whether to trigger deep analysis via GitHub Actions
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

// Default zone for unassigned tasks - near Mission Control
const DEFAULT_ZONE = { x: MISSION_CONTROL_X, y: MISSION_CONTROL_Y };

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

// Minimum distance from home planet for assigned tasks (must match other functions)
const MIN_HOME_DISTANCE = 380;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CreateRequest = await req.json();

    if ((!body.content && !body.name) || !body.created_by) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: content (or name), created_by' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate title from content using OpenAI, or use legacy name field
    let taskName: string;
    let taskDescription: string | null;

    if (body.content) {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                {
                  role: 'system',
                  content: 'You generate concise task titles from user input. Return ONLY the title, nothing else. The title should be a short, clear summary of the task (max 10 words). Do not add quotes or formatting. If the input is already short and clear enough to be a title, return it as-is.',
                },
                { role: 'user', content: body.content },
              ],
              max_tokens: 50,
              temperature: 0.3,
            }),
          });
          const aiData = await aiRes.json();
          taskName = aiData.choices?.[0]?.message?.content?.trim() || body.content;
        } catch (e) {
          console.error('OpenAI title generation failed, using raw content:', e);
          taskName = body.content;
        }
      } else {
        taskName = body.content;
      }
      // Keep original content as description if different from the generated title
      taskDescription = taskName.toLowerCase() === body.content.toLowerCase() ? null : body.content;
    } else {
      // Legacy path: name/description provided directly
      taskName = body.name!;
      taskDescription = body.description || null;
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
        title: [{ text: { content: taskName } }],
      },
      'Status': {
        select: { name: 'Ticket Open' },
      },
    };

    // Add description if provided
    if (taskDescription) {
      notionProperties['Description'] = {
        rich_text: [{ text: { content: taskDescription } }],
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
      'biz': '💼 Biz',
      'roadmap': '🗺️ Roadmap',
    };
    if (body.type && typeMapping[body.type]) {
      notionProperties['What is it ?'] = {
        select: { name: typeMapping[body.type] },
      };
    }

    // Add Auto Analyze checkbox if enabled
    if (body.auto_analyze) {
      notionProperties['Auto Analyze'] = {
        checkbox: true,
      };
    }

    // Find Notion user ID for assigned_to using mappings table
    if (body.assigned_to) {
      const { data: mapping } = await supabase
        .from('notion_user_mappings')
        .select('notion_user_id, players!inner(username)')
        .eq('team_id', team.id)
        .ilike('players.username', body.assigned_to)
        .single();

      if (mapping?.notion_user_id) {
        notionProperties['Attributed to'] = {
          people: [{ id: mapping.notion_user_id }],
        };
      } else {
        console.log(`No Notion user mapping found for player: ${body.assigned_to}`);
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
        name: taskName,
        description: taskDescription,
        notion_url: notionUrl,
        assigned_to: body.assigned_to?.toLowerCase() || null,
        created_by: body.created_by.toLowerCase(),
        task_type: body.type || 'task',
        priority: body.priority || null,
        points: points,
        x: Math.round(position.x),
        y: Math.round(position.y),
        completed: false,
        auto_analyze: body.auto_analyze || false,
        analysis_status: body.auto_analyze ? 'pending' : 'idle',
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

    // Award 10 personal points to creator
    const { data: creator } = await supabase
      .from('players')
      .select('id, personal_points')
      .eq('team_id', team.id)
      .ilike('username', body.created_by)
      .single();

    if (creator) {
      await supabase.from('point_transactions').insert({
        team_id: team.id,
        player_id: creator.id,
        source: 'notion',
        notion_task_id: notionTaskId,
        task_name: `Created: ${taskName}`,
        points: 10,
        point_type: 'personal',
      });

      // Update creator's personal points (not team points)
      await supabase
        .from('players')
        .update({ personal_points: (creator.personal_points || 0) + 10 })
        .eq('id', creator.id);
    }

    console.log(`Created Notion task "${taskName}" and planet at (${position.x}, ${position.y})`);

    return new Response(
      JSON.stringify({
        success: true,
        notion_task_id: notionTaskId,
        notion_url: notionUrl,
        planet_id: planet.id,
        planet_name: taskName,
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
