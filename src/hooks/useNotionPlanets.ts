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
});

// Convert NotionPlanet to game Planet
export const notionPlanetToGamePlanet = (np: NotionPlanet): Planet => {
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
    notionTaskId: np.notion_task_id,
    notionUrl: np.notion_url || undefined,
  };
};

interface UseNotionPlanetsOptions {
  teamId: string | null;
  onPlanetCreated?: (planet: NotionPlanet) => void;
  onPlanetCompleted?: (planet: NotionPlanet) => void;
}

interface UseNotionPlanetsReturn {
  notionPlanets: NotionPlanet[];
  gamePlanets: Planet[];
  isLoading: boolean;
  completePlanet: (notionPlanetId: string) => Promise<void>;
}

export function useNotionPlanets(options: UseNotionPlanetsOptions): UseNotionPlanetsReturn {
  const { teamId } = options;

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
      const response = await fetch(
        'https://qdizfhhsqolvuddoxugj.supabase.co/functions/v1/notion-complete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notion_planet_id: actualId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('Error completing notion planet:', error);
      }
    } catch (error) {
      console.error('Error completing notion planet:', error);
    }
  }, [teamId]);

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
        if (payload.eventType === 'INSERT') {
          const planet = rowToNotionPlanet(payload.new);
          setNotionPlanets((prev) => [planet, ...prev]);
          onPlanetCreatedRef.current?.(planet);
        } else if (payload.eventType === 'UPDATE') {
          const planet = rowToNotionPlanet(payload.new);
          setNotionPlanets((prev) =>
            prev.map((p) => (p.id === planet.id ? planet : p))
          );
          if (planet.completed) {
            onPlanetCompletedRef.current?.(planet);
          }
        } else if (payload.eventType === 'DELETE') {
          const oldPlanet = payload.old as { id: string };
          setNotionPlanets((prev) => prev.filter((p) => p.id !== oldPlanet.id));
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
  const gamePlanets = useMemo(
    () => notionPlanets.map(notionPlanetToGamePlanet),
    [notionPlanets]
  );

  return {
    notionPlanets,
    gamePlanets,
    isLoading,
    completePlanet,
  };
}
