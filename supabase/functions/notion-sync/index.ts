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
  created_by?: string;
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
  if (props['Attributed to']?.people?.[0]?.name) {
    assignedTo = props['Attributed to'].people[0].name.toLowerCase();
  }

  // Extract "Created by" - for points attribution
  let createdBy = '';
  if (props['Créé par']?.created_by?.name) {
    createdBy = props['Créé par'].created_by.name.toLowerCase();
  } else if (props['Created by']?.created_by?.name) {
    createdBy = props['Created by'].created_by.name.toLowerCase();
  } else if (page.created_by?.name) {
    createdBy = page.created_by.name.toLowerCase();
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
    created_by: createdBy || undefined,
    status: status || undefined,
    url: page.url || undefined,
  };
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
    // Filter out archived tasks
    const notionResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'Status',
              status: {
                does_not_equal: 'Archived',
              },
            },
          ],
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
    const pages = notionData.results || [];

    console.log(`Found ${pages.length} non-archived tickets in Notion`);

    // Get existing notion_task_ids to avoid duplicates
    const { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('notion_task_id, x, y')
      .eq('team_id', team.id);

    const existingTaskIds = new Set((existingPlanets || []).map(p => p.notion_task_id));
    const existingPositions: ExistingPlanet[] = (existingPlanets || []).map(p => ({ x: p.x, y: p.y }));

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    let totalCreatorPoints = 0;

    for (const page of pages) {
      const parsed = parseNotionPage(page);
      if (!parsed) {
        errors.push(`Failed to parse page ${page.id}`);
        continue;
      }

      // Skip if already exists
      if (existingTaskIds.has(parsed.id)) {
        skipped.push(parsed.name);
        continue;
      }

      // Skip if status is archived
      if (parsed.status === 'archived') {
        skipped.push(`${parsed.name} (archived)`);
        continue;
      }

      // Calculate points based on priority
      const points = calculatePoints(parsed.priority);

      // Find position
      const position = findNonOverlappingPosition(parsed.assigned_to, existingPositions);

      // Add to existing positions for next iteration
      existingPositions.push(position);

      // Create planet
      const { error: insertError } = await supabase
        .from('notion_planets')
        .insert({
          team_id: team.id,
          notion_task_id: parsed.id,
          name: parsed.name,
          description: parsed.description || null,
          notion_url: parsed.url || null,
          assigned_to: parsed.assigned_to || null,
          created_by: parsed.created_by || null,
          task_type: parsed.type || null,
          priority: parsed.priority || null,
          points: points,
          x: Math.round(position.x),
          y: Math.round(position.y),
          completed: false,
        });

      if (insertError) {
        errors.push(`Failed to create ${parsed.name}: ${insertError.message}`);
        continue;
      }

      created.push(parsed.name);

      // Award 10 points to creator
      if (parsed.created_by) {
        const { data: creator } = await supabase
          .from('players')
          .select('id')
          .eq('team_id', team.id)
          .ilike('username', parsed.created_by)
          .single();

        if (creator) {
          await supabase.from('point_transactions').insert({
            team_id: team.id,
            player_id: creator.id,
            source: 'notion',
            notion_task_id: parsed.id,
            task_name: `Created: ${parsed.name}`,
            points: 10,
          });
          totalCreatorPoints += 10;
        }
      }
    }

    // Update team points if any creator points were awarded
    if (totalCreatorPoints > 0) {
      await supabase
        .from('teams')
        .update({ team_points: team.team_points + totalCreatorPoints })
        .eq('id', team.id);
    }

    console.log(`Sync complete: ${created.length} created, ${skipped.length} skipped, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_in_notion: pages.length,
          created: created.length,
          skipped: skipped.length,
          errors: errors.length,
          creator_points_awarded: totalCreatorPoints,
        },
        created,
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
