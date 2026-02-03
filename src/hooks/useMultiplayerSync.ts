import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { MultiplayerTeam, PointTransaction as PointTx, ShipEffects } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PlayerData {
  id: string;
  username: string;
  displayName: string;
  color: string;
  isOnline: boolean;
  shipImage: string;
  shipEffects: ShipEffects;
  shipLevel: number; // 1 + upgrade count
  planetImageUrl: string;
  planetTerraformCount: number;
  planetSizeLevel: number;
  personalPoints: number;
  totalEarned: number; // Sum of all points earned (not spent)
}

interface UseMultiplayerSyncOptions {
  teamId: string | null;
  playerId: string;
  username: string;
  displayName: string;
  color: string;
  // Ship data is no longer passed here - it's loaded FROM Supabase, not written TO it on login
  onTeamUpdate?: (team: MultiplayerTeam) => void;
  onPlayerJoined?: (player: PlayerData) => void;
  onPlayerLeft?: (playerId: string) => void;
  onPointsEarned?: (transaction: PointTx) => void;
}

interface UseMultiplayerSyncReturn {
  players: PlayerData[];
  teamPoints: number;
  personalPoints: number;
  completedPlanets: string[];
  recentTransactions: PointTx[];
  isConnected: boolean;
  updateTeamPoints: (points: number, source: 'planet' | 'notion' | 'manual', taskName?: string) => Promise<void>;
  updatePersonalPoints: (amount: number, taskName?: string) => Promise<void>;
  completePlanet: (planetId: string, points: number) => Promise<void>;
  updatePlayerData: (updates: Record<string, unknown>) => Promise<void>;
  syncLocalState: (completedPlanets: string[], customPlanets: unknown[], goals: unknown) => Promise<void>;
}

const defaultShipEffects: ShipEffects = {
  glowColor: null,
  trailType: 'default',
  sizeBonus: 0,
  speedBonus: 0,
  landingSpeedBonus: 0,
  ownedGlows: [],
  ownedTrails: [],
  hasDestroyCanon: false,
  destroyCanonEquipped: false,
  hasSpaceRifle: false,
  spaceRifleEquipped: false,
  hasPlasmaCanon: false,
  plasmaCanonEquipped: false,
  hasRocketLauncher: false,
  rocketLauncherEquipped: false,
};

// How long before we consider a player offline even if is_online is true
// This handles cases where browser crashed and beforeunload didn't fire
const ONLINE_TIMEOUT_MS = 60000; // 60 seconds

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const playerRowToData = (row: any, totalEarned: number = 0): PlayerData => {
  // Check if player is truly online based on last_seen timestamp
  const lastSeen = row.last_seen ? new Date(row.last_seen).getTime() : 0;
  const isRecentlyActive = Date.now() - lastSeen < ONLINE_TIMEOUT_MS;
  const isOnline = row.is_online && isRecentlyActive;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    color: row.color,
    isOnline,
    shipImage: row.ship_current_image,
    shipEffects: (row.ship_effects as unknown as ShipEffects) || defaultShipEffects,
    shipLevel: 1 + (Array.isArray(row.ship_upgrades) ? row.ship_upgrades.length : 0),
    planetImageUrl: row.planet_image_url,
    planetTerraformCount: row.planet_terraform_count,
    planetSizeLevel: row.planet_size_level,
    personalPoints: row.personal_points || 0,
    totalEarned,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const transactionRowToTx = (row: any, playerName?: string): PointTx => ({
  id: row.id,
  teamId: row.team_id,
  playerId: row.player_id,
  playerName,
  source: row.source,
  notionTaskId: row.notion_task_id,
  taskName: row.task_name,
  points: row.points,
  createdAt: row.created_at,
});

export function useMultiplayerSync(options: UseMultiplayerSyncOptions): UseMultiplayerSyncReturn {
  const {
    teamId,
    playerId,
    username,
    displayName,
    color,
    onTeamUpdate,
    onPlayerJoined,
    onPlayerLeft,
    onPointsEarned,
  } = options;

  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [teamPoints, setTeamPoints] = useState(0);
  const [personalPoints, setPersonalPoints] = useState(0);
  const [completedPlanets, setCompletedPlanets] = useState<string[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<PointTx[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerDbIdRef = useRef<string | null>(null);
  // Track player ID we're switching away from (to suppress "Player left" for self)
  const previousPlayerIdRef = useRef<string | null>(null);

  // Register/update player in the team
  // IMPORTANT: This function only updates online status and display info.
  // Ship data is NEVER written here - it's only written when the user actually purchases upgrades.
  // This prevents overwriting existing ship data when a user logs back in.
  const registerPlayer = useCallback(async () => {
    if (!teamId) return;

    // Don't register anonymous users - wait for real user selection
    if (username === 'anonymous') {
      console.log('[registerPlayer] Skipping registration for anonymous user');
      return;
    }

    console.log('[registerPlayer] Starting with username:', username, 'teamId:', teamId);

    // Check if player already exists in this team
    const { data: existingPlayers } = await supabase
      .from('players')
      .select()
      .eq('team_id', teamId)
      .eq('username', username)
      .limit(1);

    const existing = existingPlayers?.[0];
    console.log('[registerPlayer] Existing player:', existing ? { id: existing.id, username: existing.username } : 'none');

    if (existing) {
      // Update existing player - only online status and display info, NOT ship data
      playerDbIdRef.current = existing.id;
      const updateData: Record<string, unknown> = {
        display_name: displayName,
        color,
        is_online: true,
        last_seen: new Date().toISOString(),
      };
      // DO NOT update ship_current_image, ship_effects, or ship_upgrades here!
      // Those are only updated when the user actually makes purchases via updatePlayerData()
      await supabase
        .from('players')
        .update(updateData)
        .eq('id', existing.id);

      // Also ensure ship_positions entry exists
      const { data: posDataArr } = await supabase
        .from('ship_positions')
        .select()
        .eq('player_id', existing.id)
        .limit(1);

      if (!posDataArr || posDataArr.length === 0) {
        await supabase.from('ship_positions').insert({
          player_id: existing.id,
        });
      }
    } else {
      // Create new player with default ship (no upgrades yet)
      const newPlayer: Record<string, unknown> = {
        team_id: teamId,
        username,
        display_name: displayName,
        color,
        is_online: true,
        last_seen: new Date().toISOString(),
        // New players start with defaults - these will be updated when they purchase upgrades
        ship_current_image: '/ship-base.png',
        ship_effects: defaultShipEffects,
        ship_upgrades: [],
      };

      const { data: created, error } = await supabase
        .from('players')
        .insert(newPlayer)
        .select()
        .single();

      if (created && !error) {
        playerDbIdRef.current = created.id;
        // Create ship_positions entry
        await supabase.from('ship_positions').insert({
          player_id: created.id,
        });
      }
    }
  }, [teamId, username, displayName, color]);

  // Update player online status
  const updateOnlineStatus = useCallback(async (isOnline: boolean) => {
    if (!playerDbIdRef.current) return;

    await supabase
      .from('players')
      .update({
        is_online: isOnline,
        last_seen: new Date().toISOString(),
      })
      .eq('id', playerDbIdRef.current);
  }, []);

  // Fetch initial team data
  const fetchTeamData = useCallback(async () => {
    if (!teamId) return;

    // Fetch team
    const { data: teamData } = await supabase
      .from('teams')
      .select()
      .eq('id', teamId)
      .single();

    if (teamData) {
      setTeamPoints(teamData.team_points);
      setCompletedPlanets(teamData.completed_planets || []);
      onTeamUpdate?.({
        id: teamData.id,
        name: teamData.name,
        inviteCode: teamData.invite_code,
        teamPoints: teamData.team_points,
        completedPlanets: teamData.completed_planets || [],
      });
    }

    // Fetch players
    const { data: playersData } = await supabase
      .from('players')
      .select()
      .eq('team_id', teamId);

    // Fetch total earned per player (sum of all positive transactions)
    const { data: earnedData } = await supabase
      .from('point_transactions')
      .select('player_id, points')
      .eq('team_id', teamId)
      .gt('points', 0);

    // Build a map of player_id -> total earned
    const earnedByPlayer: Record<string, number> = {};
    if (earnedData) {
      for (const tx of earnedData) {
        if (tx.player_id) {
          earnedByPlayer[tx.player_id] = (earnedByPlayer[tx.player_id] || 0) + tx.points;
        }
      }
    }

    if (playersData) {
      // Map to PlayerData, but ensure current player is always marked online
      // (the fetch might return stale data due to replication lag)
      const mappedPlayers = playersData.map((row) => {
        const totalEarned = earnedByPlayer[row.id] || 0;
        const player = playerRowToData(row, totalEarned);
        // Force current player to be online - we just registered them
        if (playerDbIdRef.current && player.id === playerDbIdRef.current) {
          return { ...player, isOnline: true };
        }
        return player;
      });
      setPlayers(mappedPlayers);

      // Find current player's personal points
      const currentPlayer = playersData.find(p => p.username === username);
      if (currentPlayer) {
        setPersonalPoints(currentPlayer.personal_points || 0);
      }
    }

    // Fetch recent transactions
    const { data: transactionsData } = await supabase
      .from('point_transactions')
      .select('*, players(display_name)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (transactionsData) {
      setRecentTransactions(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transactionsData.map((t: any) =>
          transactionRowToTx(t, t.players?.display_name || undefined)
        )
      );
    }
  }, [teamId, username, onTeamUpdate]); // Added username since it's used to find current player

  // Update team points (add to current)
  const updateTeamPoints = useCallback(async (
    points: number,
    source: 'planet' | 'notion' | 'manual',
    taskName?: string
  ) => {
    if (!teamId || !playerDbIdRef.current) return;

    // Insert transaction
    await supabase.from('point_transactions').insert({
      team_id: teamId,
      player_id: playerDbIdRef.current,
      source,
      task_name: taskName,
      points,
    });

    // Update team points (use RPC or simple update)
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('team_points')
      .eq('id', teamId)
      .single();

    if (currentTeam) {
      await supabase
        .from('teams')
        .update({ team_points: currentTeam.team_points + points })
        .eq('id', teamId);
    }
  }, [teamId]);

  // Complete a planet and award points
  const completePlanet = useCallback(async (planetId: string, points: number) => {
    if (!teamId) return;

    // Get current completed planets
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('completed_planets, team_points')
      .eq('id', teamId)
      .single();

    if (!currentTeam) return;

    const currentCompleted = currentTeam.completed_planets || [];
    if (currentCompleted.includes(planetId)) return; // Already completed

    // Update team
    await supabase
      .from('teams')
      .update({
        completed_planets: [...currentCompleted, planetId],
        team_points: currentTeam.team_points + points,
      })
      .eq('id', teamId);

    // Insert transaction
    if (playerDbIdRef.current) {
      await supabase.from('point_transactions').insert({
        team_id: teamId,
        player_id: playerDbIdRef.current,
        source: 'planet',
        task_name: `Completed planet: ${planetId}`,
        points,
        point_type: 'team',
      });
    }
  }, [teamId]);

  // Update player data (ship, planet, etc.)
  const updatePlayerData = useCallback(async (updates: Record<string, unknown>) => {
    if (!playerDbIdRef.current) return;

    await supabase
      .from('players')
      .update(updates)
      .eq('id', playerDbIdRef.current);
  }, []);

  // Update personal points (for spending on upgrades)
  const updatePersonalPoints = useCallback(async (amount: number, taskName?: string) => {
    if (!playerDbIdRef.current || !teamId) {
      console.error('updatePersonalPoints: No player ID or team ID available');
      return;
    }

    try {
      // Get current personal points
      const { data: currentPlayer, error: fetchError } = await supabase
        .from('players')
        .select('personal_points')
        .eq('id', playerDbIdRef.current)
        .single();

      if (fetchError) {
        console.error('updatePersonalPoints: Failed to fetch player', fetchError);
        return;
      }

      if (currentPlayer) {
        const newPoints = (currentPlayer.personal_points || 0) + amount;
        const { error: updateError } = await supabase
          .from('players')
          .update({ personal_points: newPoints })
          .eq('id', playerDbIdRef.current);

        if (updateError) {
          console.error('updatePersonalPoints: Failed to update', updateError);
          return;
        }

        // Log transaction for tracking
        await supabase.from('point_transactions').insert({
          team_id: teamId,
          player_id: playerDbIdRef.current,
          source: 'manual',
          task_name: taskName || (amount < 0 ? 'Ship upgrade purchase' : 'Points earned'),
          points: amount,
          point_type: 'personal',
        });

        console.log(`Personal points updated: ${currentPlayer.personal_points || 0} + ${amount} = ${newPoints}`);
        setPersonalPoints(newPoints);
      }
    } catch (err) {
      console.error('updatePersonalPoints: Exception', err);
    }
  }, [teamId]);

  // Sync local state to team (for initial setup or migration)
  const syncLocalState = useCallback(async (
    localCompletedPlanets: string[],
    customPlanets: unknown[],
    goals: unknown
  ) => {
    if (!teamId) return;

    // Get current team state
    const { data: currentTeam } = await supabase
      .from('teams')
      .select()
      .eq('id', teamId)
      .single();

    if (!currentTeam) return;

    // Merge completed planets (union of local and remote)
    const mergedCompleted = [
      ...new Set([...(currentTeam.completed_planets || []), ...localCompletedPlanets]),
    ];

    // Only update if there are changes
    if (mergedCompleted.length !== (currentTeam.completed_planets || []).length) {
      await supabase
        .from('teams')
        .update({
          completed_planets: mergedCompleted,
          custom_planets: customPlanets,
          goals,
        })
        .eq('id', teamId);
    }
  }, [teamId]);

  // Set up realtime subscriptions
  useEffect(() => {
    if (!teamId) {
      setIsConnected(false);
      return;
    }

    const setupSubscriptions = async () => {
      // IMPORTANT: Create and subscribe to channel FIRST, before registering
      // This prevents a race condition where Player 2's registration event
      // is missed because Player 1 hasn't subscribed yet

      // Create channel for this team
      const channel = supabase.channel(`team:${teamId}`);

      // Subscribe to team changes
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const team = payload.new;
          setTeamPoints(team.team_points);
          setCompletedPlanets(team.completed_planets || []);
          onTeamUpdate?.({
            id: team.id,
            name: team.name,
            inviteCode: team.invite_code,
            teamPoints: team.team_points,
            completedPlanets: team.completed_planets || [],
          });
        }
      );

      // Subscribe to player changes
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${teamId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const player = playerRowToData(payload.new);
            setPlayers((prev) => [...prev.filter((p) => p.id !== player.id), player]);
            if (player.id !== playerDbIdRef.current) {
              onPlayerJoined?.(player);
            }
          } else if (payload.eventType === 'UPDATE') {
            const player = playerRowToData(payload.new);
            setPlayers((prev) => {
              const existingIndex = prev.findIndex((p) => p.id === player.id);
              if (existingIndex >= 0) {
                // Update existing player
                return prev.map((p) => (p.id === player.id ? player : p));
              } else {
                // Player not in list (edge case: missed INSERT) - add them
                return [...prev, player];
              }
            });
            // Update personal points if this is the current player
            if (player.id === playerDbIdRef.current && payload.new.personal_points !== undefined) {
              setPersonalPoints(payload.new.personal_points || 0);
            }
            // Suppress "Player left" for current player or the player we just switched from
            if (!player.isOnline && player.id !== playerDbIdRef.current && player.id !== previousPlayerIdRef.current) {
              onPlayerLeft?.(player.id);
            }
          } else if (payload.eventType === 'DELETE') {
            const oldPlayer = payload.old as { id: string };
            setPlayers((prev) => prev.filter((p) => p.id !== oldPlayer.id));
            onPlayerLeft?.(oldPlayer.id);
          }
        }
      );

      // Subscribe to point transactions
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_transactions', filter: `team_id=eq.${teamId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (payload: any) => {
          const tx = payload.new;
          // Fetch player name
          let playerName: string | undefined;
          if (tx.player_id) {
            const { data: player } = await supabase
              .from('players')
              .select('display_name')
              .eq('id', tx.player_id)
              .single();
            playerName = player?.display_name;
          }

          const transaction = transactionRowToTx(tx, playerName);
          setRecentTransactions((prev) => [transaction, ...prev.slice(0, 19)]);

          // Only trigger callback for transactions from other players
          if (tx.player_id !== playerDbIdRef.current) {
            onPointsEarned?.(transaction);
          }
        }
      );

      // Subscribe and wait for it to be ready BEFORE registering player
      await channel.subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

      channelRef.current = channel;

      // NOW register player and fetch data - subscription is active so we won't miss events
      await registerPlayer();
      await fetchTeamData();
    };

    setupSubscriptions();

    // Cleanup
    return () => {
      // Track the player we're switching away from (to suppress "Player left" for self)
      previousPlayerIdRef.current = playerDbIdRef.current;
      updateOnlineStatus(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      // Clear player ref when effect re-runs (e.g., user switch)
      playerDbIdRef.current = null;
    };
  }, [teamId, username]); // Re-register when username changes

  // Handle page visibility for online status
  useEffect(() => {
    const handleVisibilityChange = () => {
      updateOnlineStatus(!document.hidden);
    };

    const handleBeforeUnload = () => {
      updateOnlineStatus(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [updateOnlineStatus]);

  // Periodic heartbeat to keep online status fresh
  useEffect(() => {
    if (!teamId || !playerDbIdRef.current) return;

    const interval = setInterval(() => {
      updateOnlineStatus(true);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [teamId, updateOnlineStatus]);

  return {
    players,
    teamPoints,
    personalPoints,
    completedPlanets,
    recentTransactions,
    isConnected,
    updateTeamPoints,
    updatePersonalPoints,
    completePlanet,
    updatePlayerData,
    syncLocalState,
  };
}
