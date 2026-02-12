// Notion Webhook Handler for Mission Control Space
// Receives webhooks from Notion when tasks are created/updated and creates planets in the game

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notion-secret',
};

interface Assignee {
  name: string;
  notionId: string;
}

interface NotionWebhookPayload {
  id: string;
  name: string;
  description?: string;
  type?: string; // bug, enhancement
  priority?: string; // critical, high, medium, low
  points?: number;
  assignees: Assignee[]; // All people assigned to this task
  created_by?: string; // Player username for points attribution
  created_by_notion_id?: string; // Notion user ID for mapping
  status?: string;
  url?: string;
  due_date?: string; // ISO date from Notion "Due Date" property
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

// Minimum distance from home planet for assigned tasks
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

  const maxAttempts = 200;

  // For unassigned tasks: staggered honeycomb arcs ABOVE Mission Control
  // For assigned tasks: scatter around player zone
  if (isUnassigned) {
    const baseDistance = 350; // Clear of stations
    const arcSpacing = 110;
    const planetsPerArc = 5;
    const arcSpread = Math.PI * 0.35;
    const baseAngle = -Math.PI / 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const arcIndex = Math.floor(attempt / planetsPerArc);
      const posInArc = attempt % planetsPerArc;
      const arcRadius = baseDistance + arcIndex * arcSpacing;

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
}

// Parse native Notion automation payload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNativeNotionPayload(raw: any): NotionWebhookPayload | null {
  if (!raw.data?.properties) {
    return null;
  }

  const data = raw.data;
  const props = data.properties;

  // Debug: log all property keys and their types
  console.log('NOTION PROPERTY KEYS:', Object.keys(props).join(', '));
  console.log('AUTO ANALYZE RAW:', JSON.stringify(props['Auto Analyze']));

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

  // Extract ALL people from "Attributed to" - for planet placement (one planet per assignee)
  const assignees: Assignee[] = [];
  if (props['Attributed to']?.people?.length > 0) {
    for (const person of props['Attributed to'].people) {
      assignees.push({
        name: person.name?.toLowerCase() || '',
        notionId: person.id || '',
      });
    }
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

  // Extract "What is it ?" (type: bug/enhancement/biz/task)
  let type = '';
  if (props['What is it ?']?.select?.name) {
    const rawType = props['What is it ?'].select.name.toLowerCase();
    if (rawType.includes('bug') || rawType.includes('problem')) {
      type = 'bug';
    } else if (rawType.includes('enhancement')) {
      type = 'enhancement';
    } else if (rawType.includes('biz') || rawType.includes('business')) {
      type = 'biz';
    } else if (rawType.includes('task')) {
      type = 'task';
    } else {
      type = rawType;
    }
  }

  // Extract Priority
  let priority = '';
  if (props['Priority']?.select?.name) {
    priority = props['Priority'].select.name.toLowerCase();
  }

  // Extract Status - handle multiple property types
  let status = '';
  const statusProp = props['Status'];
  if (statusProp?.select?.name) {
    status = statusProp.select.name.toLowerCase();
  } else if (statusProp?.status?.name) {
    status = statusProp.status.name.toLowerCase();
  } else if (statusProp?.multi_select?.[0]?.name) {
    status = statusProp.multi_select[0].name.toLowerCase();
  } else if (typeof statusProp?.formula?.string === 'string') {
    status = statusProp.formula.string.toLowerCase();
  } else if (typeof statusProp?.rollup?.array?.[0]?.title?.[0]?.plain_text === 'string') {
    status = statusProp.rollup.array[0].title[0].plain_text.toLowerCase();
  }

  // Extract Due Date — undefined if property missing from payload, null if cleared, string if set
  const hasDueDate = 'Due Date' in props;
  const dueDate = hasDueDate ? (props['Due Date']?.date?.start || null) : undefined;

  // Extract "Auto Analyze" checkbox
  const autoAnalyze = props['Auto Analyze']?.checkbox === true;

  return {
    id: data.id,
    name: name || 'Untitled',
    description: description || undefined,
    type: type || undefined,
    priority: priority || undefined,
    assignees: assignees,
    created_by: createdBy || undefined,
    created_by_notion_id: createdByNotionId || undefined,
    status: status || undefined,
    url: data.url || undefined,
    due_date: dueDate,
    auto_analyze: autoAnalyze,
  };
}

// Calculate points based on priority
function calculatePoints(priority: string | undefined): number {
  if (!priority) return PRIORITY_POINTS.default;
  const key = priority.toLowerCase();
  return PRIORITY_POINTS[key] || PRIORITY_POINTS.default;
}

// Generate a quick prompt template from task metadata
function generateQuickPrompt(payload: NotionWebhookPayload): string {
  const typeLabel = payload.type || 'task';
  const priorityLabel = payload.priority || 'medium';
  const description = payload.description || '(no description provided)';

  return `Task: ${payload.name}
Type: ${typeLabel} | Priority: ${priorityLabel}

Description:
${description}

Instructions:
1. Read the CLAUDE.md in the relevant repository to understand the project structure and conventions
2. Search the codebase for files related to this task
3. Read the relevant source files and understand the current behavior
4. Propose the required changes
5. Implement after approval`;
}

// Trigger GitHub Actions deep analysis workflow
async function triggerDeepAnalysis(
  payload: NotionWebhookPayload,
  notionPlanetId: string
): Promise<boolean> {
  const githubPat = Deno.env.get('GITHUB_PAT');
  if (!githubPat) {
    console.log('No GITHUB_PAT configured, skipping deep analysis trigger');
    return false;
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/Q-organization/mission-control-space/actions/workflows/analyze-task.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            task_title: payload.name,
            task_description: payload.description || '',
            task_type: payload.type || '',
            task_priority: payload.priority || '',
            notion_planet_id: notionPlanetId,
            notion_task_id: formatUuidWithDashes(payload.id),
          },
        }),
      }
    );

    if (response.status === 204) {
      console.log(`Triggered deep analysis for "${payload.name}" (planet ${notionPlanetId})`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`Failed to trigger deep analysis: ${response.status} ${errorText}`);
      return false;
    }
  } catch (err) {
    console.error('Error triggering GitHub Actions:', err);
    return false;
  }
}

// Write quick prompt back to Notion page
async function writeQuickPromptToNotion(
  notionTaskId: string,
  quickPrompt: string
): Promise<void> {
  const notionToken = Deno.env.get('NOTION_API_TOKEN');
  if (!notionToken) return;

  const truncated = quickPrompt.length > 2000
    ? quickPrompt.substring(0, 1997) + '...'
    : quickPrompt;

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${notionTaskId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        properties: {
          'Quick Prompt': {
            rich_text: [{
              type: 'text',
              text: { content: truncated },
            }],
          },
        },
      }),
    });

    if (response.ok) {
      console.log(`Wrote quick prompt to Notion page ${notionTaskId}`);
    } else {
      const errorText = await response.text();
      console.error(`Failed to write quick prompt to Notion: ${response.status} ${errorText}`);
    }
  } catch (err) {
    console.error('Error writing quick prompt to Notion:', err);
  }
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

    console.log('='.repeat(60));
    console.log('NOTION WEBHOOK RECEIVED AT:', new Date().toISOString());
    console.log('='.repeat(60));
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
    const isDestroyed = statusLower === 'destroyed' || statusLower.includes('destroyed');

    const debugInfo = {
      payloadStatus: payload.status,
      statusLower,
      isTicketOpen,
      isArchived,
      isDestroyed,
      payloadId: payload.id,
      payloadName: payload.name,
    };
    console.log('WEBHOOK DEBUG:', JSON.stringify(debugInfo));

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

    // Resolve all assignees to game usernames using mapping (for correct zone placement)
    const resolvedAssignees: Array<{ username: string | null; notionId: string; notionName: string }> = [];
    for (const assignee of payload.assignees) {
      const player = await findPlayerByNotionUser(
        supabase,
        team.id,
        assignee.notionId,
        assignee.name
      );
      resolvedAssignees.push({
        username: player ? player.username.toLowerCase() : null,
        notionId: assignee.notionId,
        notionName: assignee.name,
      });
    }
    // If no assignees, create a single "unassigned" entry
    if (resolvedAssignees.length === 0) {
      resolvedAssignees.push({ username: null, notionId: '', notionName: '' });
    }

    // Normalize the Notion task ID for consistent comparison
    // Notion API sometimes returns IDs with dashes, sometimes without
    const normalizedTaskId = formatUuidWithDashes(payload.id);

    // Check if planets already exist for this task (may have multiple for multi-assignee)
    let { data: existingPlanets } = await supabase
      .from('notion_planets')
      .select('id, team_id, assigned_to, completed, x, y, notion_task_id')
      .eq('notion_task_id', normalizedTaskId);

    // If not found, try with original ID (in case DB has different format)
    if ((!existingPlanets || existingPlanets.length === 0) && payload.id !== normalizedTaskId) {
      const { data: altPlanets } = await supabase
        .from('notion_planets')
        .select('id, team_id, assigned_to, completed, x, y, notion_task_id')
        .eq('notion_task_id', payload.id);
      existingPlanets = altPlanets;
    }
    existingPlanets = existingPlanets || [];

    // Handle destroyed status - ALWAYS delete/skip, never create or keep
    console.log('='.repeat(40));
    console.log('STATUS ROUTING CHECK:');
    console.log('  - Raw status value:', JSON.stringify(payload.status));
    console.log('  - Lowercase status:', statusLower);
    console.log('  - isTicketOpen:', isTicketOpen);
    console.log('  - isArchived:', isArchived);
    console.log('  - isDestroyed:', isDestroyed);
    console.log('  - Planets count in DB:', existingPlanets.length);
    console.log('  - Assignees count:', resolvedAssignees.length);
    if (existingPlanets.length > 0) {
      console.log('  - Existing planet IDs:', existingPlanets.map(p => p.id).join(', '));
    }
    console.log('  - Payload ID (raw):', payload.id);
    console.log('  - Payload ID (normalized):', normalizedTaskId);
    console.log('='.repeat(40));

    if (isDestroyed) {
      console.log('>>> ENTERING DESTROY BLOCK <<<');
      if (existingPlanets.length > 0) {
        console.log(`Attempting to DELETE ${existingPlanets.length} planet(s) for "${payload.name}"`);
        const planetIds = existingPlanets.map(p => p.id);
        const { data: deleteData, error: deleteError } = await supabase
          .from('notion_planets')
          .delete()
          .in('id', planetIds)
          .select();

        if (deleteError) {
          console.error('!!! DELETE FAILED !!!');
          console.error('Error code:', deleteError.code);
          console.error('Error message:', deleteError.message);
          console.error('Error details:', deleteError.details);
          console.error('Error hint:', deleteError.hint);
          return new Response(
            JSON.stringify({
              success: false,
              action: 'delete_failed',
              error: deleteError.message,
              planet_name: payload.name,
              debug: debugInfo,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.log('>>> DELETE SUCCESSFUL <<<');
          console.log(`Deleted ${existingPlanets.length} planet(s) for "${payload.name}"`);
          console.log('Delete response data:', JSON.stringify(deleteData));
        }
      } else {
        console.log(`SKIP - No planets found for "${payload.name}" (already deleted or never created)`);
        console.log('  Searched with normalized ID:', normalizedTaskId);
        console.log('  Also tried raw ID:', payload.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: existingPlanets.length > 0 ? 'deleted' : 'skipped',
          reason: 'status_destroyed',
          planet_name: payload.name,
          planets_deleted: existingPlanets.length,
          debug: debugInfo,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle archived status - mark all planets as completed and award points to each assignee
    if (isArchived) {
      const incompletePlanets = existingPlanets.filter(p => !p.completed);
      if (incompletePlanets.length > 0) {
        // Mark ALL planets as completed
        const planetIds = incompletePlanets.map(p => p.id);
        await supabase
          .from('notion_planets')
          .update({ completed: true })
          .in('id', planetIds);
        console.log(`Marked ${incompletePlanets.length} planet(s) for "${payload.name}" as completed - status is Archived`);

        // Award personal points to EACH assigned player (matches notion-complete logic)
        const pointsAwarded: string[] = [];
        for (const incompletePlanet of incompletePlanets) {
          const assignedTo = incompletePlanet.assigned_to;
          console.log(`[POINTS] Processing planet ${incompletePlanet.id}, assigned_to="${assignedTo}"`);

          if (!assignedTo) {
            console.log(`[POINTS] Skipping - no assigned_to`);
            continue;
          }

          // Find player directly by username (same approach as notion-complete)
          const { data: player, error: playerError } = await supabase
            .from('players')
            .select('id, username, personal_points')
            .eq('team_id', team.id)
            .ilike('username', assignedTo)
            .single();

          if (playerError || !player) {
            console.error(`[POINTS] Could not find player "${assignedTo}" in team ${team.id}:`, playerError?.message);
            continue;
          }

          console.log(`[POINTS] Found player: ${player.username} (${player.id}), current pts: ${player.personal_points}`);

          // Get points from planet
          const { data: planetData } = await supabase
            .from('notion_planets')
            .select('points')
            .eq('id', incompletePlanet.id)
            .single();

          const points = planetData?.points || calculatePoints(payload.priority);
          console.log(`[POINTS] Points to award: ${points}`);

          // Check for duplicate transaction
          const { data: existingTx } = await supabase
            .from('point_transactions')
            .select('id')
            .eq('notion_task_id', normalizedTaskId)
            .eq('player_id', player.id)
            .ilike('task_name', 'Completed:%')
            .single();

          if (existingTx) {
            console.log(`[POINTS] Already awarded to ${player.username} for this task - skipping`);
            continue;
          }

          // Insert point transaction
          const txData = {
            team_id: team.id,
            player_id: player.id,
            source: 'notion',
            notion_task_id: normalizedTaskId,
            task_name: `Completed: ${payload.name}`,
            points: points,
            point_type: 'personal',
          };
          console.log(`[POINTS] Inserting transaction:`, JSON.stringify(txData));

          const { error: txError } = await supabase.from('point_transactions').insert(txData);

          if (txError) {
            console.error(`[POINTS] Failed to insert transaction:`, JSON.stringify(txError));
            continue;
          }

          // Update player's personal points
          const newPoints = (player.personal_points || 0) + points;
          const { error: updateError } = await supabase
            .from('players')
            .update({ personal_points: newPoints })
            .eq('id', player.id);

          if (updateError) {
            console.error(`[POINTS] Failed to update player points:`, JSON.stringify(updateError));
          } else {
            pointsAwarded.push(`${player.username}: +${points}`);
            console.log(`[POINTS] Awarded ${points} pts to ${player.username} (${player.personal_points} -> ${newPoints})`);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            action: 'completed',
            reason: 'status_archived',
            planet_name: payload.name,
            planets_completed: incompletePlanets.length,
            points_awarded: pointsAwarded,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (existingPlanets.length > 0) {
        console.log(`Skipping "${payload.name}" - all ${existingPlanets.length} planet(s) already completed`);
        return new Response(
          JSON.stringify({
            success: true,
            action: 'skipped',
            reason: 'already_completed',
            planet_name: payload.name,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`Skipping "${payload.name}" - status is Archived, no planets exist (was destroyed)`);
        return new Response(
          JSON.stringify({
            success: true,
            action: 'skipped',
            reason: 'planet_not_found',
            planet_name: payload.name,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If status is not "Ticket Open" and no planets exist, skip creating them
    if (!isTicketOpen && existingPlanets.length === 0) {
      console.log('>>> SKIPPING - Status is not "Ticket Open" and no planets exist <<<');
      console.log(`  Status: "${payload.status}"`);
      console.log(`  Task: "${payload.name}"`);
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

    // Calculate points based on priority
    const points = payload.points || calculatePoints(payload.priority);

    // Build a map of existing planets by assigned_to for this task
    const existingByAssignee = new Map<string, typeof existingPlanets[0]>();
    for (const planet of existingPlanets) {
      existingByAssignee.set(planet.assigned_to || '', planet);
    }

    // Determine which planets to create, update, or delete
    const newAssignees = new Set(resolvedAssignees.map(a => a.username || ''));
    const existingAssignees = new Set(existingByAssignee.keys());

    // Assignees to add (in new list but not in existing)
    const toAdd = resolvedAssignees.filter(a => !existingByAssignee.has(a.username || ''));
    // Assignees to remove (in existing but not in new)
    const toRemove = [...existingAssignees].filter(a => !newAssignees.has(a));
    // Assignees to update (in both)
    const toUpdate = resolvedAssignees.filter(a => existingByAssignee.has(a.username || ''));

    const createdPlanets: string[] = [];
    const updatedPlanets: string[] = [];
    const deletedPlanets: string[] = [];

    // Delete planets for removed assignees
    for (const assignee of toRemove) {
      const planet = existingByAssignee.get(assignee);
      if (planet) {
        await supabase
          .from('notion_planets')
          .delete()
          .eq('id', planet.id);
        deletedPlanets.push(assignee || 'unassigned');
        console.log(`Deleted planet for "${payload.name}" - assignee "${assignee || 'unassigned'}" was removed`);
      }
    }

    // Update existing planets with latest data (but don't reposition —
    // position was already set by the function that created/claimed/reassigned the planet;
    // notion-sync handles position correction if truly needed)
    for (const assignee of toUpdate) {
      const existingPlanet = existingByAssignee.get(assignee.username || '');
      if (!existingPlanet) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = {
        name: payload.name,
        description: payload.description || null,
        task_type: payload.type || null,
        priority: payload.priority || null,
        points: points,
        notion_url: payload.url || null,
        ...(isTicketOpen && { completed: false }),
      };
      // Only touch due_date if it was actually in the Notion payload
      if (payload.due_date !== undefined) {
        updates.due_date = payload.due_date;
      }

      await supabase
        .from('notion_planets')
        .update(updates)
        .eq('id', existingPlanet.id);

      updatedPlanets.push(assignee.username || 'unassigned');

      // When resetting a completed planet back to Ticket Open, clean up old point transactions
      // so that re-archiving can award fresh points (otherwise duplicate check blocks it)
      if (isTicketOpen && existingPlanet.completed && existingPlanet.assigned_to) {
        console.log(`[POINTS-CLEANUP] Resetting "${payload.name}" from completed → active for ${existingPlanet.assigned_to}`);
        const { data: cleanupPlayer } = await supabase
          .from('players')
          .select('id, username, personal_points')
          .eq('team_id', team.id)
          .ilike('username', existingPlanet.assigned_to)
          .single();

        if (cleanupPlayer) {
          const { data: oldTxs } = await supabase
            .from('point_transactions')
            .select('id, points')
            .eq('notion_task_id', normalizedTaskId)
            .eq('player_id', cleanupPlayer.id)
            .ilike('task_name', 'Completed:%');

          if (oldTxs && oldTxs.length > 0) {
            const totalPoints = oldTxs.reduce((sum, tx) => sum + (tx.points || 0), 0);
            const txIds = oldTxs.map(tx => tx.id);

            await supabase
              .from('point_transactions')
              .delete()
              .in('id', txIds);

            const newPoints = Math.max(0, (cleanupPlayer.personal_points || 0) - totalPoints);
            await supabase
              .from('players')
              .update({ personal_points: newPoints })
              .eq('id', cleanupPlayer.id);

            console.log(`[POINTS-CLEANUP] Deleted ${oldTxs.length} old "Completed:" tx, subtracted ${totalPoints} pts from ${cleanupPlayer.username} (${cleanupPlayer.personal_points} -> ${newPoints})`);
          } else {
            console.log(`[POINTS-CLEANUP] No old "Completed:" transactions found for ${cleanupPlayer.username}`);
          }
        }
      }
    }

    // Create planets for new assignees
    let creatorPointsAwarded = false;
    for (const assignee of toAdd) {
      // Calculate position in this assignee's zone
      // Refresh positions to account for newly created planets
      const { data: currentPlanets } = await supabase
        .from('notion_planets')
        .select('x, y')
        .eq('team_id', team.id);

      const position = findNonOverlappingPosition(assignee.username, currentPlanets || []);

      // Create planet using insert (we already verified it doesn't exist)
      const { data: newPlanet, error: planetError } = await supabase
        .from('notion_planets')
        .insert({
          team_id: team.id,
          notion_task_id: normalizedTaskId,
          name: payload.name,
          description: payload.description || null,
          notion_url: payload.url || null,
          assigned_to: assignee.username,
          created_by: payload.created_by || null,
          task_type: payload.type || null,
          priority: payload.priority || null,
          points: points,
          x: Math.round(position.x),
          y: Math.round(position.y),
          completed: false,
          due_date: payload.due_date ?? null,
        })
        .select()
        .single();

      if (planetError) {
        console.error(`Failed to create planet for ${assignee.username || 'unassigned'}:`, planetError);
        continue;
      }

      createdPlanets.push(assignee.username || 'unassigned');
      console.log(`Created planet "${payload.name}" for ${assignee.username || 'unassigned'} at (${Math.round(position.x)}, ${Math.round(position.y)})`);

      // Post-insert overlap check for race conditions
      const { data: overlappingPlanets } = await supabase
        .from('notion_planets')
        .select('id, x, y')
        .eq('team_id', team.id)
        .neq('id', newPlanet.id)
        .gte('x', newPlanet.x - MIN_DISTANCE)
        .lte('x', newPlanet.x + MIN_DISTANCE)
        .gte('y', newPlanet.y - MIN_DISTANCE)
        .lte('y', newPlanet.y + MIN_DISTANCE);

      const hasOverlap = overlappingPlanets?.some(other =>
        distance({ x: newPlanet.x, y: newPlanet.y }, { x: other.x, y: other.y }) < MIN_DISTANCE
      );

      if (hasOverlap) {
        console.log(`Race condition detected for "${payload.name}" (${assignee.username}) - repositioning`);
        const { data: freshPlanets } = await supabase
          .from('notion_planets')
          .select('x, y')
          .eq('team_id', team.id)
          .neq('id', newPlanet.id);

        const newPosition = findNonOverlappingPosition(assignee.username, freshPlanets || []);
        await supabase
          .from('notion_planets')
          .update({ x: Math.round(newPosition.x), y: Math.round(newPosition.y) })
          .eq('id', newPlanet.id);
      }

      // Award creator points only once per task (not per planet)
      if (!creatorPointsAwarded && (payload.created_by || payload.created_by_notion_id)) {
        const creator = await findPlayerByNotionUser(
          supabase,
          team.id,
          payload.created_by_notion_id,
          payload.created_by
        );

        if (creator) {
          // Check for existing creator transaction
          const { data: existingTransaction } = await supabase
            .from('point_transactions')
            .select('id')
            .eq('notion_task_id', normalizedTaskId)
            .eq('player_id', creator.id)
            .ilike('task_name', 'Created:%')
            .single();

          if (!existingTransaction) {
            await supabase.from('point_transactions').insert({
              team_id: team.id,
              player_id: creator.id,
              source: 'notion',
              notion_task_id: normalizedTaskId,
              task_name: `Created: ${payload.name}`,
              points: 10,
              point_type: 'personal',
            });

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
            creatorPointsAwarded = true;
          }
        }
      }
    }

    const action = createdPlanets.length > 0 ? 'created' : (updatedPlanets.length > 0 ? 'updated' : 'no_change');
    console.log(`Processed "${payload.name}": created=${createdPlanets.length}, updated=${updatedPlanets.length}, deleted=${deletedPlanets.length}`);

    // Generate quick prompt and handle auto-analysis for created/updated planets
    if (createdPlanets.length > 0 || updatedPlanets.length > 0) {
      const quickPrompt = generateQuickPrompt(payload);

      // Get all planets for this task (including auto_analyze flag set by the game)
      const { data: taskPlanets } = await supabase
        .from('notion_planets')
        .select('id, auto_analyze, deep_analysis')
        .eq('notion_task_id', normalizedTaskId);

      if (taskPlanets && taskPlanets.length > 0) {
        // Save quick prompt to all planets for this task
        // Don't overwrite auto_analyze — it's set by the game (Quick Add modal)
        await supabase
          .from('notion_planets')
          .update({ quick_prompt: quickPrompt })
          .eq('notion_task_id', normalizedTaskId);

        console.log(`Saved quick prompt for "${payload.name}" (${taskPlanets.length} planet(s))`);

        // Write quick prompt to Notion (fire and forget)
        writeQuickPromptToNotion(normalizedTaskId, quickPrompt);

        // Trigger deep analysis if auto_analyze is set in DB (by game) or Notion payload
        const shouldAnalyze = payload.auto_analyze || taskPlanets.some(p => p.auto_analyze);
        console.log(`Auto analyze check: payload=${payload.auto_analyze}, db=${taskPlanets.map(p => p.auto_analyze)}, shouldAnalyze=${shouldAnalyze}`);
        if (shouldAnalyze) {
          // Check if any planet already has a deep analysis to avoid re-triggering
          if (!taskPlanets.some(p => p.deep_analysis)) {
            const firstPlanetId = taskPlanets[0].id;
            const triggered = await triggerDeepAnalysis(payload, firstPlanetId);
            // Set analysis_status to 'pending' on all planets for this task
            if (triggered) {
              await supabase
                .from('notion_planets')
                .update({ analysis_status: 'pending' })
                .eq('notion_task_id', normalizedTaskId);
            }
            console.log(`Deep analysis trigger for "${payload.name}": ${triggered ? 'success' : 'failed'}`);
          } else {
            console.log(`Deep analysis already exists for "${payload.name}", skipping trigger`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        planet_name: payload.name,
        created: createdPlanets,
        updated: updatedPlanets,
        deleted: deletedPlanets,
        assignees: resolvedAssignees.map(a => a.username || 'unassigned'),
        points: points,
        priority: payload.priority || null,
        notion_url: payload.url || null,
        team_id: team.id,
        quick_prompt_generated: createdPlanets.length > 0 || updatedPlanets.length > 0,
        deep_analysis_triggered: payload.auto_analyze && createdPlanets.length > 0,
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
