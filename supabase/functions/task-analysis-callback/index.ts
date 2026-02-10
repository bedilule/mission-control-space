// Task Analysis Callback
// Receives deep analysis from GitHub Actions and saves it to Supabase + Notion

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { notion_planet_id, notion_task_id, analysis } = await req.json();

    if (!notion_planet_id || !analysis) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: notion_planet_id, analysis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Received analysis for planet ${notion_planet_id} (${analysis.length} chars)`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save analysis to notion_planets table and mark status as complete
    // First get the notion_task_id from the planet so we can update ALL planets for this task
    const { data: planetRow } = await supabase
      .from('notion_planets')
      .select('notion_task_id')
      .eq('id', notion_planet_id)
      .single();

    const taskId = planetRow?.notion_task_id;

    // Update all planets for this Notion task (multi-assignee support)
    const query = taskId
      ? supabase.from('notion_planets').update({ deep_analysis: analysis, analysis_status: 'complete' }).eq('notion_task_id', taskId)
      : supabase.from('notion_planets').update({ deep_analysis: analysis, analysis_status: 'complete' }).eq('id', notion_planet_id);

    const { error: updateError } = await query;

    if (updateError) {
      console.error('Failed to update notion_planets:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save analysis', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Saved analysis to notion_planets.deep_analysis for ${notion_planet_id}`);

    // Also write to Notion page "Deep Analysis" property
    if (notion_task_id) {
      const notionToken = Deno.env.get('NOTION_API_TOKEN');
      if (notionToken) {
        // Notion rich_text has a 2000 char limit per block, so truncate if needed
        const truncatedAnalysis = analysis.length > 2000
          ? analysis.substring(0, 1997) + '...'
          : analysis;

        try {
          const notionResponse = await fetch(`https://api.notion.com/v1/pages/${notion_task_id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${notionToken}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
              properties: {
                'Deep Analysis': {
                  rich_text: [{
                    type: 'text',
                    text: { content: truncatedAnalysis },
                  }],
                },
              },
            }),
          });

          if (notionResponse.ok) {
            console.log(`Wrote analysis to Notion page ${notion_task_id}`);
          } else {
            const notionError = await notionResponse.text();
            console.error(`Failed to write to Notion: ${notionResponse.status} ${notionError}`);
          }
        } catch (notionErr) {
          console.error('Notion API call failed:', notionErr);
        }
      } else {
        console.log('No NOTION_API_TOKEN configured, skipping Notion write');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notion_planet_id,
        analysis_length: analysis.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Callback error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
