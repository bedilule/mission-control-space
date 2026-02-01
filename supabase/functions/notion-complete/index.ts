// Notion Complete Handler - Updates Notion task status when planet is completed in-game

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompleteRequest {
  notion_planet_id: string; // Our database ID (not the notion task ID)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { notion_planet_id }: CompleteRequest = await req.json();

    if (!notion_planet_id) {
      return new Response(
        JSON.stringify({ error: 'Missing notion_planet_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the notion task ID from our database
    const { data: planet, error: fetchError } = await supabase
      .from('notion_planets')
      .select('notion_task_id, name, completed')
      .eq('id', notion_planet_id)
      .single();

    if (fetchError || !planet) {
      return new Response(
        JSON.stringify({ error: 'Planet not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (planet.completed) {
      return new Response(
        JSON.stringify({ message: 'Planet already completed', notion_task_id: planet.notion_task_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Notion API token
    const notionToken = Deno.env.get('NOTION_API_TOKEN');
    if (!notionToken) {
      console.error('NOTION_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Notion API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update Notion page status to "Archived"
    const notionResponse = await fetch(`https://api.notion.com/v1/pages/${planet.notion_task_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        properties: {
          'Status': {
            select: {
              name: 'Archived',
            },
          },
        },
      }),
    });

    if (!notionResponse.ok) {
      const errorText = await notionResponse.text();
      console.error('Notion API error:', errorText);

      // Still mark as completed in our database even if Notion fails
      await supabase
        .from('notion_planets')
        .update({ completed: true })
        .eq('id', notion_planet_id);

      return new Response(
        JSON.stringify({
          warning: 'Planet marked complete locally but Notion update failed',
          notion_error: errorText,
          notion_task_id: planet.notion_task_id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as completed in our database
    const { error: updateError } = await supabase
      .from('notion_planets')
      .update({ completed: true })
      .eq('id', notion_planet_id);

    if (updateError) {
      console.error('Failed to update local database:', updateError);
    }

    console.log(`Completed planet "${planet.name}" and updated Notion status to Archived`);

    return new Response(
      JSON.stringify({
        success: true,
        notion_task_id: planet.notion_task_id,
        planet_name: planet.name,
        notion_status: 'Archived',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Complete error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
