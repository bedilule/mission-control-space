import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { NotionPlanet, Planet } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Colors for notion task types
const TASK_TYPE_COLORS: Record<string, { color: string; glowColor: string }> = {
  bug: { color: '#ff6b6b', glowColor: '#ff4444' },
  feature: { color: '#4ecdc4', glowColor: '#00bfae' },
  epic: { color: '#a855f7', glowColor: '#9333ea' },
  improvement: { color: '#60a5fa', glowColor: '#3b82f6' },
  task: { color: '#fbbf24', glowColor: '#f59e0b' },
  default: { color: '#94a3b8', glowColor: '#64748b' },
};

// Convert DB row to NotionPlanet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToNotionPlanet = (row: any): NotionPlanet => ({
  id: row.id,
  team_id: row.team_id,
  notion_task_id: row.notion_task_id,
  name: row.name,
  description: row.description,
  notion_url: row.notion_url,
  assigned_to: row.assigned_to,
  created_by: row.created_by,
  task_type: row.task_type,
  priority: row.priority,
  points: row.points,
  x: row.x,
  y: row.y,
  completed: row.completed,
  created_at: row.created_at,
  due_date: row.due_date || null,
  seen_by: row.seen_by || {},
  quick_prompt: row.quick_prompt || null,
  deep_analysis: row.deep_analysis || null,
  analysis_status: row.analysis_status || 'idle',
});

// Convert NotionPlanet to game Planet
// Note: Position is determined by the backend (notion-sync, notion-webhook, notion-claim)
// Frontend just uses the DB position directly - no client-side repositioning
export const notionPlanetToGamePlanet = (np: NotionPlanet, currentUser?: string): Planet => {
  const taskType = np.task_type?.toLowerCase() || 'default';
  const colors = TASK_TYPE_COLORS[taskType] || TASK_TYPE_COLORS.default;

  // Determine size based on priority
  let size: 'small' | 'medium' | 'big' = 'medium';
  let radius = 40;
  const priority = np.priority?.toLowerCase() || '';
  if (priority.includes('critical') || priority.includes('🧨')) {
    size = 'big';
    radius = 55;
  } else if (priority.includes('high') || priority.includes('🔥')) {
    size = 'medium';
    radius = 45;
  } else if (priority.includes('low') || priority.includes('💡')) {
    size = 'small';
    radius = 32;
  }

  return {
    id: `notion-${np.id}`,
    name: np.name,
    x: np.x,
    y: np.y,
    radius: radius,
    color: colors.color,
    glowColor: colors.glowColor,
    completed: np.completed,
    type: 'notion',
    size: size,
    description: np.description || undefined,
    hasRing: priority.includes('critical') || priority.includes('🧨'),
    hasMoon: taskType === 'enhancement',
    ownerId: np.assigned_to, // Assigned player can complete the planet
    createdBy: np.created_by, // Creator gets the points
    priority: np.priority,
    points: np.points,
    notionTaskId: np.notion_task_id,
    notionUrl: np.notion_url || undefined,
    taskType: np.task_type,
    targetDate: np.due_date ? np.due_date.slice(0, 10) : undefined,
    isNew: !np.completed && !!currentUser && !np.seen_by?.[currentUser]
      && (!np.assigned_to || np.assigned_to === currentUser),
    createdAt: np.created_at,
    quickPrompt: np.quick_prompt,
    deepAnalysis: np.deep_analysis,
    analysisStatus: np.analysis_status,
  };
};

interface UseNotionPlanetsOptions {
  teamId: string | null;
  currentUser?: string;
  onPlanetCreated?: (planet: NotionPlanet) => void;
  onPlanetCompleted?: (planet: NotionPlanet) => void;
}

interface UpdatePlanetFields {
  name?: string;
  description?: string;
  task_type?: 'bug' | 'feature' | 'task';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  due_date?: string | null;
  assigned_to?: string | null;
}

interface UpdatePlanetResult {
  success: boolean;
  new_position?: { x: number; y: number };
}

interface UseNotionPlanetsReturn {
  notionPlanets: NotionPlanet[];
  gamePlanets: Planet[];
  isLoading: boolean;
  completePlanet: (notionPlanetId: string) => Promise<void>;
  claimPlanet: (notionPlanetId: string, playerUsername: string) => Promise<{ x: number; y: number } | null>;
  reassignPlanet: (notionPlanetId: string, newOwnerUsername: string) => Promise<{ x: number; y: number } | null>;
  updatePlanet: (notionPlanetId: string, updates: UpdatePlanetFields) => Promise<UpdatePlanetResult | null>;
  markPlanetSeen: (notionPlanetId: string, username: string) => Promise<void>;
}

export function useNotionPlanets(options: UseNotionPlanetsOptions): UseNotionPlanetsReturn {
  const { teamId, currentUser } = options;

  const [notionPlanets, setNotionPlanets] = useState<NotionPlanet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // Store callbacks in refs to avoid re-renders
  const onPlanetCreatedRef = useRef(options.onPlanetCreated);
  const onPlanetCompletedRef = useRef(options.onPlanetCompleted);

  // Update refs when callbacks change
  useEffect(() => {
    onPlanetCreatedRef.current = options.onPlanetCreated;
    onPlanetCompletedRef.current = options.onPlanetCompleted;
  }, [options.onPlanetCreated, options.onPlanetCompleted]);

  // Mark a notion planet as completed (also updates Notion)
  const completePlanet = useCallback(async (notionPlanetId: string) => {
    if (!teamId) return;

    // Extract the actual ID (remove 'notion-' prefix if present)
    const actualId = notionPlanetId.startsWith('notion-')
      ? notionPlanetId.slice(7)
      : notionPlanetId;

    try {
      // Call edge function to complete in both our DB and Notion
      // Use supabase.functions.invoke which handles auth automatically
      const { error } = await supabase.functions.invoke('notion-complete', {
        body: { notion_planet_id: actualId },
      });

      if (error) {
        console.error('Error completing notion planet:', error);
      }
    } catch (error) {
      console.error('Error completing notion planet:', error);
    }
  }, [teamId]);

  // Claim an unassigned notion planet (moves it to player's zone)
  // Returns the new position if successful, null if failed
  const claimPlanet = useCallback(async (notionPlanetId: string, playerUsername: string): Promise<{ x: number; y: number } | null> => {
    if (!teamId) return null;

    // Extract the actual ID (remove 'notion-' prefix if present)
    const actualId = notionPlanetId.startsWith('notion-')
      ? notionPlanetId.slice(7)
      : notionPlanetId;

    try {
      // Use supabase.functions.invoke which handles auth automatically
      const { data, error } = await supabase.functions.invoke('notion-claim', {
        body: {
          notion_planet_id: actualId,
          player_username: playerUsername,
        },
      });

      if (error) {
        console.error('Error claiming notion planet:', error);
        return null;
      }

      return data?.new_position || null;
    } catch (error) {
      console.error('Error claiming notion planet:', error);
      return null;
    }
  }, [teamId]);

  // Reassign a notion planet to a different user (moves it to their zone)
  // Returns the new position if successful, null if failed
  const reassignPlanet = useCallback(async (notionPlanetId: string, newOwnerUsername: string): Promise<{ x: number; y: number } | null> => {
    if (!teamId) return null;

    // Extract the actual ID (remove 'notion-' prefix if present)
    const actualId = notionPlanetId.startsWith('notion-')
      ? notionPlanetId.slice(7)
      : notionPlanetId;

    try {
      const { data, error } = await supabase.functions.invoke('notion-reassign', {
        body: {
          notion_planet_id: actualId,
          new_owner_username: newOwnerUsername,
        },
      });

      if (error) {
        console.error('Error reassigning notion planet:', error);
        return null;
      }

      return data?.new_position || null;
    } catch (error) {
      console.error('Error reassigning notion planet:', error);
      return null;
    }
  }, [teamId]);

  // Update a notion planet's properties (title, description, type, priority, due date, assignee)
  const updatePlanet = useCallback(async (notionPlanetId: string, updates: UpdatePlanetFields): Promise<UpdatePlanetResult | null> => {
    if (!teamId) return null;

    const actualId = notionPlanetId.startsWith('notion-')
      ? notionPlanetId.slice(7)
      : notionPlanetId;

    try {
      const { data, error } = await supabase.functions.invoke('notion-update', {
        body: {
          notion_planet_id: actualId,
          ...updates,
        },
      });

      if (error) {
        console.error('Error updating notion planet:', error);
        return null;
      }

      return {
        success: data?.success || false,
        new_position: data?.new_position || undefined,
      };
    } catch (error) {
      console.error('Error updating notion planet:', error);
      return null;
    }
  }, [teamId]);

  // Mark a planet as seen by a user (removes "NEW" badge)
  const markPlanetSeen = useCallback(async (notionPlanetId: string, username: string) => {
    // Extract the actual ID (remove 'notion-' prefix if present)
    const actualId = notionPlanetId.startsWith('notion-')
      ? notionPlanetId.slice(7)
      : notionPlanetId;

    // Optimistic local update — set seen_by immediately so badge vanishes
    setNotionPlanets((prev) =>
      prev.map((p) =>
        p.id === actualId
          ? { ...p, seen_by: { ...p.seen_by, [username]: true } }
          : p
      )
    );

    // Persist to Supabase: fetch current seen_by, merge, and update
    try {
      const { data } = await supabase
        .from('notion_planets')
        .select('seen_by')
        .eq('id', actualId)
        .single();

      const currentSeenBy = (data?.seen_by as Record<string, boolean>) || {};
      await supabase
        .from('notion_planets')
        .update({ seen_by: { ...currentSeenBy, [username]: true } })
        .eq('id', actualId);
    } catch {
      // Optimistic update already applied, non-critical
    }
  }, []);

  // Set up realtime subscriptions
  useEffect(() => {
    if (!teamId) {
      setNotionPlanets([]);
      setIsLoading(false);
      return;
    }

    // Fetch initial data
    const fetchNotionPlanets = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('notion_planets')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notion planets:', error);
        setNotionPlanets([]);
      } else {
        setNotionPlanets((data || []).map(rowToNotionPlanet));
      }
      setIsLoading(false);
    };

    fetchNotionPlanets();

    // Subscribe to changes
    const channel = supabase.channel(`notion-planets:${teamId}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notion_planets', filter: `team_id=eq.${teamId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        console.log('[useNotionPlanets] Realtime event received:', payload.eventType, payload);

        if (payload.eventType === 'INSERT') {
          const planet = rowToNotionPlanet(payload.new);
          console.log('[useNotionPlanets] INSERT - Adding planet:', planet.name);
          setNotionPlanets((prev) => [planet, ...prev]);
          onPlanetCreatedRef.current?.(planet);
        } else if (payload.eventType === 'UPDATE') {
          const planet = rowToNotionPlanet(payload.new);
          console.log('[useNotionPlanets] UPDATE - Updating planet:', planet.name);
          setNotionPlanets((prev) =>
            prev.map((p) => (p.id === planet.id ? planet : p))
          );
          if (planet.completed) {
            onPlanetCompletedRef.current?.(planet);
          }
        } else if (payload.eventType === 'DELETE') {
          const oldPlanet = payload.old as { id: string };
          console.log('[useNotionPlanets] DELETE - Removing planet with id:', oldPlanet?.id, 'payload.old:', payload.old);
          if (oldPlanet?.id) {
            setNotionPlanets((prev) => {
              const filtered = prev.filter((p) => p.id !== oldPlanet.id);
              console.log('[useNotionPlanets] DELETE - Filtered from', prev.length, 'to', filtered.length, 'planets');
              return filtered;
            });
          } else {
            console.warn('[useNotionPlanets] DELETE - No id in payload.old, cannot remove planet');
          }
        }
      }
    );

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [teamId]);

  // Memoize game planets to prevent unnecessary re-renders
  // Pass index for positioning planets that need repositioning from old center
  const gamePlanets = useMemo(
    () => notionPlanets.map((np) => notionPlanetToGamePlanet(np, currentUser)),
    [notionPlanets, currentUser]
  );

  return {
    notionPlanets,
    gamePlanets,
    isLoading,
    completePlanet,
    claimPlanet,
    reassignPlanet,
    updatePlanet,
    markPlanetSeen,
  };
}
