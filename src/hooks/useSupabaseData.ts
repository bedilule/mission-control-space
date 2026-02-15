import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Types matching App.tsx
interface Goal {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'big';
  description?: string;
  realWorldReward?: string;
  points?: number;
  targetDate?: string;
  imageUrl?: string;
}

interface Goals {
  business: Goal[];
  product: Goal[];
  achievement: Goal[];
}

interface CustomPlanet {
  id: string;
  name: string;
  description?: string;
  type: 'business' | 'product' | 'achievement' | 'notion';
  size: 'small' | 'medium' | 'big';
  realWorldReward?: string;
  imageUrl?: string;
  createdBy: string;
}

interface UserPlanet {
  imageUrl: string;
  baseImage?: string;
  moonImageUrl?: string;
  stationImageUrl?: string;
  terraformCount: number;
  history: { imageUrl: string; description: string; timestamp: number }[];
  sizeLevel: number;
}

interface MascotHistoryEntry {
  imageUrl: string;
  planetName: string;
  timestamp: number;
  earnedBy: string;
}

// Empty defaults — Supabase is the sole source of truth for goals.
// Goals are managed via the admin settings panel.
const EMPTY_GOALS: Goals = { business: [], product: [], achievement: [] };

// Sort goals by targetDate (goals without dates go to the end)
const sortGoalsByDate = (goals: Goal[]): Goal[] => {
  return [...goals].sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return a.targetDate.localeCompare(b.targetDate);
  });
};

interface UseSupabaseDataOptions {
  teamId: string | null;
  playerId: string | null;
  username: string;
}

interface UseSupabaseDataReturn {
  // Data (loaded from Supabase)
  goals: Goals;
  customPlanets: CustomPlanet[];
  userPlanets: Record<string, UserPlanet>;
  mascotHistory: MascotHistoryEntry[];

  // Loading state
  isLoading: boolean;

  // Save functions
  saveGoals: (goals: Goals) => Promise<void>;
  saveCustomPlanets: (planets: CustomPlanet[]) => Promise<void>;
  saveUserPlanet: (userId: string, planet: UserPlanet) => Promise<void>;
  saveMascotHistory: (history: MascotHistoryEntry[]) => Promise<void>;

  // Refresh
  refreshData: () => Promise<void>;
}

/**
 * Hook to load and save data from Supabase.
 * Supabase is the ONLY source of truth - no localStorage.
 */
export function useSupabaseData(options: UseSupabaseDataOptions): UseSupabaseDataReturn {
  const { teamId, playerId, username } = options;

  const [goals, setGoals] = useState<Goals>(EMPTY_GOALS);
  const [customPlanets, setCustomPlanets] = useState<CustomPlanet[]>([]);
  const [userPlanets, setUserPlanets] = useState<Record<string, UserPlanet>>({});
  const [mascotHistory, setMascotHistory] = useState<MascotHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const initialLoadDone = useRef(false);

  // Fetch all data from Supabase
  const fetchFromSupabase = useCallback(async () => {
    if (!teamId) return;

    console.log('[useSupabaseData] Fetching from Supabase...');

    try {
      // Fetch team data (goals, custom_planets)
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('goals, custom_planets')
        .eq('id', teamId)
        .single();

      if (teamError) {
        console.error('[useSupabaseData] Error fetching team:', teamError);
      } else if (teamData) {
        // Load goals from Supabase (sole source of truth)
        if (teamData.goals && typeof teamData.goals === 'object') {
          const supabaseGoals = teamData.goals as Goals;
          setGoals({
            business: sortGoalsByDate(supabaseGoals.business || []),
            product: sortGoalsByDate(supabaseGoals.product || []),
            achievement: supabaseGoals.achievement || [],
          });
        }
        if (teamData.custom_planets && Array.isArray(teamData.custom_planets)) {
          setCustomPlanets(teamData.custom_planets as CustomPlanet[]);
        }
      }

      // Fetch all players' planet data for this team
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('username, planet_image_url, planet_base_image, planet_moon_image_url, planet_station_image_url, planet_terraform_count, planet_size_level, planet_history, mascot_history')
        .eq('team_id', teamId);

      if (playersError) {
        console.error('[useSupabaseData] Error fetching players:', playersError);
      } else if (playersData) {
        const planets: Record<string, UserPlanet> = {};
        let currentUserMascotHistory: MascotHistoryEntry[] = [];

        for (const player of playersData) {
          if (player.planet_image_url || player.planet_terraform_count > 0) {
            planets[player.username] = {
              imageUrl: player.planet_image_url || '',
              baseImage: player.planet_base_image || undefined,
              moonImageUrl: player.planet_moon_image_url || undefined,
              stationImageUrl: player.planet_station_image_url || undefined,
              terraformCount: player.planet_terraform_count || 0,
              sizeLevel: player.planet_size_level || 0,
              history: (player.planet_history as UserPlanet['history']) || [],
            };
          }

          // Get mascot history for current user
          if (player.username === username && player.mascot_history) {
            currentUserMascotHistory = player.mascot_history as MascotHistoryEntry[];
          }
        }

        setUserPlanets(planets);
        setMascotHistory(currentUserMascotHistory);
      }

      console.log('[useSupabaseData] Fetch complete');
    } catch (err) {
      console.error('[useSupabaseData] Fetch error:', err);
    }
  }, [teamId, username]);

  // Refresh data from Supabase
  const refreshData = useCallback(async () => {
    await fetchFromSupabase();
  }, [fetchFromSupabase]);

  // Save goals to Supabase
  const saveGoals = useCallback(async (newGoals: Goals) => {
    setGoals(newGoals);

    if (!teamId) return;

    try {
      const { error } = await supabase
        .from('teams')
        .update({ goals: newGoals })
        .eq('id', teamId);

      if (error) {
        console.error('[useSupabaseData] Error saving goals:', error);
      }
    } catch (err) {
      console.error('[useSupabaseData] Exception saving goals:', err);
    }
  }, [teamId]);

  // Save custom planets to Supabase
  const saveCustomPlanets = useCallback(async (planets: CustomPlanet[]) => {
    setCustomPlanets(planets);

    if (!teamId) return;

    try {
      const { error } = await supabase
        .from('teams')
        .update({ custom_planets: planets })
        .eq('id', teamId);

      if (error) {
        console.error('[useSupabaseData] Error saving custom planets:', error);
      }
    } catch (err) {
      console.error('[useSupabaseData] Exception saving custom planets:', err);
    }
  }, [teamId]);

  // Save user planet to Supabase
  const saveUserPlanet = useCallback(async (userId: string, planet: UserPlanet) => {
    setUserPlanets(prev => ({ ...prev, [userId]: planet }));

    if (!playerId || userId !== username) return;

    try {
      const { error } = await supabase
        .from('players')
        .update({
          planet_image_url: planet.imageUrl,
          planet_base_image: planet.baseImage,
          planet_moon_image_url: planet.moonImageUrl || null,
          planet_station_image_url: planet.stationImageUrl || null,
          planet_terraform_count: planet.terraformCount,
          planet_size_level: planet.sizeLevel,
          planet_history: planet.history,
        })
        .eq('id', playerId);

      if (error) {
        console.error('[useSupabaseData] Error saving user planet:', error);
      }
    } catch (err) {
      console.error('[useSupabaseData] Exception saving user planet:', err);
    }
  }, [playerId, username]);

  // Save mascot history to Supabase
  const saveMascotHistory = useCallback(async (history: MascotHistoryEntry[]) => {
    const cleanHistory = history
      .filter(entry => !entry.imageUrl.startsWith('data:'))
      .slice(-50);

    setMascotHistory(cleanHistory);

    if (!playerId) return;

    try {
      const { error } = await supabase
        .from('players')
        .update({ mascot_history: cleanHistory })
        .eq('id', playerId);

      if (error) {
        console.error('[useSupabaseData] Error saving mascot history:', error);
      }
    } catch (err) {
      console.error('[useSupabaseData] Exception saving mascot history:', err);
    }
  }, [playerId]);

  // Initial load from Supabase
  useEffect(() => {
    if (!teamId || initialLoadDone.current) return;

    const init = async () => {
      setIsLoading(true);
      await fetchFromSupabase();
      initialLoadDone.current = true;
      setIsLoading(false);
    };

    init();
  }, [teamId, fetchFromSupabase]);

  // Reset initialLoadDone when teamId or username changes (so data re-fetches for the correct user)
  useEffect(() => {
    initialLoadDone.current = false;
  }, [teamId, username]);

  // Subscribe to real-time updates for team data
  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`supabase-data:${teamId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` },
        (payload) => {
          const data = payload.new;
          if (data.goals && typeof data.goals === 'object') {
            const supabaseGoals = data.goals as Goals;
            const hasContent = supabaseGoals.business?.length > 0 ||
                              supabaseGoals.product?.length > 0 ||
                              supabaseGoals.achievement?.length > 0;
            if (hasContent) {
              setGoals(supabaseGoals);
            }
          }
          if (data.custom_planets && Array.isArray(data.custom_planets)) {
            setCustomPlanets(data.custom_planets as CustomPlanet[]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  // Subscribe to player updates (for seeing other players' planet changes)
  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`player-planets:${teamId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `team_id=eq.${teamId}` },
        (payload) => {
          const data = payload.new as {
            username: string;
            planet_image_url: string;
            planet_base_image: string;
            planet_moon_image_url: string;
            planet_station_image_url: string;
            planet_terraform_count: number;
            planet_size_level: number;
            planet_history: UserPlanet['history'];
          };

          if (data.planet_image_url || data.planet_terraform_count > 0) {
            setUserPlanets(prev => ({
              ...prev,
              [data.username]: {
                imageUrl: data.planet_image_url || '',
                baseImage: data.planet_base_image || prev[data.username]?.baseImage,
                moonImageUrl: data.planet_moon_image_url || prev[data.username]?.moonImageUrl,
                stationImageUrl: data.planet_station_image_url || prev[data.username]?.stationImageUrl,
                terraformCount: data.planet_terraform_count || 0,
                sizeLevel: data.planet_size_level || 0,
                history: data.planet_history || [],
              }
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  return {
    goals,
    customPlanets,
    userPlanets,
    mascotHistory,
    isLoading,
    saveGoals,
    saveCustomPlanets,
    saveUserPlanet,
    saveMascotHistory,
    refreshData,
  };
}
