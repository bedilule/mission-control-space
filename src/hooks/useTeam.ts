import { useState, useEffect, useCallback } from 'react';
import { supabase, setStoredTeamId } from '../lib/supabase';
import type { MultiplayerTeam } from '../types';

// Default team name - everyone joins the same team automatically
const DEFAULT_TEAM_NAME = 'Mission Control Team';

interface UseTeamReturn {
  team: MultiplayerTeam | null;
  isLoading: boolean;
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const teamRowToMultiplayer = (row: any): MultiplayerTeam => ({
  id: row.id,
  name: row.name,
  inviteCode: row.invite_code,
  teamPoints: row.team_points,
  completedPlanets: row.completed_planets || [],
});

export function useTeam(): UseTeamReturn {
  const [team, setTeam] = useState<MultiplayerTeam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-join or create the default team
  const initializeTeam = useCallback(async () => {
    console.log('[useTeam] Initializing team...');
    setIsLoading(true);
    setError(null);

    try {
      // Try to get the default team (there should only be one)
      console.log('[useTeam] Fetching existing team...');
      const { data: existingTeams, error: fetchError } = await supabase
        .from('teams')
        .select()
        .eq('name', DEFAULT_TEAM_NAME)
        .limit(1);

      console.log('[useTeam] Fetch result:', { existingTeams, fetchError });

      if (fetchError) {
        console.error('[useTeam] Error fetching team:', fetchError);
        setError(fetchError.message);
        setIsLoading(false);
        return;
      }

      if (existingTeams && existingTeams.length > 0) {
        // Join existing team
        const existingTeam = existingTeams[0];
        const multiplayerTeam = teamRowToMultiplayer(existingTeam);
        setTeam(multiplayerTeam);
        setStoredTeamId(existingTeam.id);
        console.log('Joined existing team:', existingTeam.id);
      } else {
        // Create the default team (first player to join creates it)
        console.log('[useTeam] No existing team, creating new one...');
        const { data: newTeam, error: createError } = await supabase
          .from('teams')
          .insert({ name: DEFAULT_TEAM_NAME })
          .select()
          .single();

        console.log('[useTeam] Create result:', { newTeam, createError });

        if (createError) {
          // Another player might have created it at the same time, try to fetch again
          const { data: retryTeams } = await supabase
            .from('teams')
            .select()
            .eq('name', DEFAULT_TEAM_NAME)
            .limit(1);

          if (retryTeams && retryTeams.length > 0) {
            const multiplayerTeam = teamRowToMultiplayer(retryTeams[0]);
            setTeam(multiplayerTeam);
            setStoredTeamId(retryTeams[0].id);
            console.log('Joined team after retry:', retryTeams[0].id);
          } else {
            console.error('Error creating team:', createError);
            setError(createError.message);
          }
        } else if (newTeam) {
          const multiplayerTeam = teamRowToMultiplayer(newTeam);
          setTeam(multiplayerTeam);
          setStoredTeamId(newTeam.id);
          console.log('Created new team:', newTeam.id);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to multiplayer';
      console.error('Team initialization error:', message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeTeam();
  }, [initializeTeam]);

  return {
    team,
    isLoading,
    error,
  };
}
