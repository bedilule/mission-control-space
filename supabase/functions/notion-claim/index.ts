// Notion Claim - Allows a player to claim an unassigned mission
// Updates assigned_to and moves the planet to the player's zone

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClaimRequest {
  notion_planet_id: string; // Our database ID (not the notion task ID)
  player_username: string;  // Username of the player claiming
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
  'milya': { x: CENTER_X - PLAYER_DISTANCE * 0.7, y: CENTER_Y - PLAYER_DISTANCE * 0.7 },
  'hugues': { x: CENTER_X - PLAYER_DISTANCE, y: CENTER_Y },
};

const PLANET_RADIUS = 50;
const MIN_DISTANCE = PLANET_RADIUS * 3;

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function findNonOverlappingPosition(
  assignedTo: string,
  existingPlanets: ExistingPlanet[]
): { x: number; y: number } {
  const baseZone = PLAYER_ZONES[assignedTo.toLowerCase()];
  if (!baseZone) {
    // Unknown player, keep in center
    return { x: CENTER_X, y: CENTER_Y + 500 };
  }

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
    const { notion_planet_id, player_username }: ClaimRequest = await req.json();

    if (!notion_planet_id || !player_username) {
      return new Response(
        JSON.stringify({ error: 'Missing notion_planet_id or player_username' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the planet
    const { data: planet, error: fetchError } = await supabase
      .from('notion_planets')
      .select('id, team_id, notion_task_id, name, assigned_to, completed')
      .eq('id', notion_planet_id)
      .single();

    if (fetchError || !planet) {
      return new Response(
        JSON.stringify({ error: 'Planet not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already assigned
    if (planet.assigned_to) {
      return new Response(
        JSON.stringify({ error: 'Planet already assigned', assigned_to: planet.assigned_to }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if completed
    if (planet.completed) {
      return new Response(
        JSON.stringify({ error: 'Planet already completed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing planets in the player's zone to avoid overlaps
    const { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('x, y')
      .eq('team_id', planet.team_id)
      .ilike('assigned_to', player_username);

    // Calculate new position in player's zone
    const newPosition = findNonOverlappingPosition(
      player_username,
      existingPlanets || []
    );

    // Update the planet
    const { error: updateError } = await supabase
      .from('notion_planets')
      .update({
        assigned_to: player_username.toLowerCase(),
        x: Math.round(newPosition.x),
        y: Math.round(newPosition.y),
      })
      .eq('id', notion_planet_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update planet', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also update Notion to set "Attributed to" field
    const notionToken = Deno.env.get('NOTION_API_TOKEN');
    if (notionToken) {
      try {
        // Fetch Notion workspace users to find the matching user ID
        const usersResponse = await fetch('https://api.notion.com/v1/users', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28',
          },
        });

        if (usersResponse.ok) {
          const usersData = await usersResponse.json();
          // Find user whose name matches (case-insensitive)
          const notionUser = usersData.results?.find((user: { name?: string; type: string }) =>
            user.type === 'person' &&
            user.name?.toLowerCase() === player_username.toLowerCase()
          );

          if (notionUser) {
            // Update the Notion page with the "Attributed to" field
            const updateResponse = await fetch(`https://api.notion.com/v1/pages/${planet.notion_task_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
              body: JSON.stringify({
                properties: {
                  'Attributed to': {
                    people: [{ id: notionUser.id }],
                  },
                },
              }),
            });

            if (updateResponse.ok) {
              console.log(`Updated Notion task ${planet.notion_task_id} - assigned to ${notionUser.name} (${notionUser.id})`);
            } else {
              const errorText = await updateResponse.text();
              console.error('Failed to update Notion page:', errorText);
            }
          } else {
            console.log(`Notion user not found for username: ${player_username}`);
          }
        } else {
          console.error('Failed to fetch Notion users:', await usersResponse.text());
        }
      } catch (notionError) {
        console.error('Failed to update Notion:', notionError);
      }
    }

    console.log(`${player_username} claimed "${planet.name}" - moved to (${newPosition.x}, ${newPosition.y})`);

    return new Response(
      JSON.stringify({
        success: true,
        planet_id: notion_planet_id,
        planet_name: planet.name,
        assigned_to: player_username.toLowerCase(),
        new_position: newPosition,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Claim error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
