import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OtherPlayer, ShipEffects } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PlayerInfo {
  id: string;
  username: string;
  displayName: string;
  color: string;
  shipImage: string;
  shipEffects: ShipEffects;
  shipLevel: number;
  isOnline: boolean;
}

interface UsePlayerPositionsOptions {
  teamId: string | null;
  playerId: string | null; // Database player ID (not local ID)
  players: PlayerInfo[]; // Player info from useMultiplayerSync
  localShip: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    thrusting: boolean;
  };
}

// Callback type for direct position updates (bypasses React state)
type PositionUpdateCallback = (playerId: string, data: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
  timestamp: number;
}) => void;

// Callback type for upgrade animation updates
type UpgradeUpdateCallback = (playerId: string, data: {
  isUpgrading: boolean;
  targetPlanetId: string | null;
}) => void;

interface UsePlayerPositionsReturn {
  otherPlayers: OtherPlayer[];
  broadcastPosition: () => void;
  broadcastUpgradeState: (isUpgrading: boolean, targetPlanetId?: string | null) => void;
  setPositionUpdateCallback: (callback: PositionUpdateCallback | null) => void;
  setUpgradeUpdateCallback: (callback: UpgradeUpdateCallback | null) => void;
}

interface CachedPosition {
  player_id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
  receivedAt: number;
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
};

export function usePlayerPositions(options: UsePlayerPositionsOptions): UsePlayerPositionsReturn {
  const { teamId, playerId, players, localShip } = options;

  const [otherPlayers, setOtherPlayers] = useState<OtherPlayer[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const lastDbUpdateRef = useRef<number>(0);
  const lastBroadcastPositionRef = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const positionCacheRef = useRef<Map<string, CachedPosition>>(new Map());
  const playersRef = useRef<PlayerInfo[]>(players);
  // Direct callback for position updates (bypasses React state for lower latency)
  const positionUpdateCallbackRef = useRef<PositionUpdateCallback | null>(null);
  // Direct callback for upgrade animation updates
  const upgradeUpdateCallbackRef = useRef<UpgradeUpdateCallback | null>(null);

  // Set the callback for direct position updates
  const setPositionUpdateCallback = useCallback((callback: PositionUpdateCallback | null) => {
    positionUpdateCallbackRef.current = callback;
  }, []);

  // Set the callback for upgrade animation updates
  const setUpgradeUpdateCallback = useCallback((callback: UpgradeUpdateCallback | null) => {
    upgradeUpdateCallbackRef.current = callback;
  }, []);

  // Keep players ref updated without triggering effects
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Broadcast position via realtime (fast, ephemeral)
  const broadcastPosition = useCallback(() => {
    if (!channelRef.current || !playerId) return;

    const now = Date.now();
    // Throttle broadcasts to 10Hz (100ms) - still smooth, 3x fewer messages than 30Hz
    if (now - lastBroadcastRef.current < 100) return;

    // Only broadcast if actually moving or rotating
    const speed = Math.sqrt(localShip.vx * localShip.vx + localShip.vy * localShip.vy);
    const isMoving = speed > 0.1 || localShip.thrusting;
    const lastPos = lastBroadcastPositionRef.current;
    const rotationChanged = lastPos && Math.abs(localShip.rotation - lastPos.rotation) > 0.01;
    const positionChanged = lastPos && (
      Math.abs(localShip.x - lastPos.x) > 1 ||
      Math.abs(localShip.y - lastPos.y) > 1
    );

    // Skip broadcast if stationary and no significant change
    if (!isMoving && lastPos && !rotationChanged && !positionChanged) {
      return;
    }

    lastBroadcastRef.current = now;
    lastBroadcastPositionRef.current = { x: localShip.x, y: localShip.y, rotation: localShip.rotation };

    channelRef.current.send({
      type: 'broadcast',
      event: 'position',
      payload: {
        player_id: playerId,
        x: localShip.x,
        y: localShip.y,
        vx: localShip.vx,
        vy: localShip.vy,
        rotation: localShip.rotation,
        thrusting: localShip.thrusting,
        timestamp: now,
      },
    });

    // Persist to database less frequently (every 5 seconds)
    if (now - lastDbUpdateRef.current > 5000) {
      lastDbUpdateRef.current = now;
      supabase
        .from('ship_positions')
        .update({
          x: localShip.x,
          y: localShip.y,
          vx: localShip.vx,
          vy: localShip.vy,
          rotation: localShip.rotation,
          thrusting: localShip.thrusting,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', playerId)
        .then(() => {});
    }
  }, [playerId, localShip]);

  // Broadcast upgrade state (when player starts/stops upgrading)
  const broadcastUpgradeState = useCallback((isUpgrading: boolean, targetPlanetId: string | null = null) => {
    if (!channelRef.current || !playerId) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'upgrade',
      payload: {
        player_id: playerId,
        isUpgrading,
        targetPlanetId,
      },
    });
  }, [playerId]);

  // Fetch initial positions from database
  const fetchInitialPositions = useCallback(async () => {
    if (!teamId || !playerId) return;

    // Get all player IDs in this team
    const currentPlayers = playersRef.current;
    const playerIds = currentPlayers.map((p) => p.id);
    if (playerIds.length === 0) return;

    const { data: positions } = await supabase
      .from('ship_positions')
      .select()
      .in('player_id', playerIds);

    if (positions) {
      const now = Date.now();
      const others: OtherPlayer[] = [];

      for (const pos of positions) {
        if (pos.player_id === playerId) continue; // Skip self

        const playerInfo = currentPlayers.find((p) => p.id === pos.player_id);
        // Skip offline players
        if (!playerInfo || !playerInfo.isOnline) continue;

        others.push({
          id: pos.player_id,
          username: playerInfo.username,
          displayName: playerInfo.displayName,
          color: playerInfo.color,
          x: pos.x,
          y: pos.y,
          vx: pos.vx,
          vy: pos.vy,
          rotation: pos.rotation,
          thrusting: pos.thrusting,
          shipImage: playerInfo.shipImage,
          shipEffects: playerInfo.shipEffects || defaultShipEffects,
          shipLevel: playerInfo.shipLevel || 1,
        });
        positionCacheRef.current.set(pos.player_id, {
          player_id: pos.player_id,
          x: pos.x,
          y: pos.y,
          vx: pos.vx,
          vy: pos.vy,
          rotation: pos.rotation,
          thrusting: pos.thrusting,
          receivedAt: now,
        });
      }

      setOtherPlayers(others);
    }
  }, [teamId, playerId]);

  // Set up realtime channel for position broadcasts
  useEffect(() => {
    if (!teamId || !playerId) {
      setOtherPlayers([]);
      return;
    }

    // Create presence channel for positions
    const channel = supabase.channel(`positions:${teamId}`, {
      config: {
        broadcast: {
          self: false, // Don't receive own broadcasts
        },
      },
    });

    // Handle position broadcasts from other players
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on('broadcast', { event: 'position' }, (payload: any) => {
      const data = payload.payload as {
        player_id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        rotation: number;
        thrusting: boolean;
        timestamp: number;
      };

      if (data.player_id === playerId) return; // Skip self

      const now = Date.now();
      const cached = positionCacheRef.current.get(data.player_id);

      // Only update if this is newer than what we have
      if (cached && cached.receivedAt > data.timestamp) return;

      // Update cache
      positionCacheRef.current.set(data.player_id, {
        player_id: data.player_id,
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy,
        rotation: data.rotation,
        thrusting: data.thrusting,
        receivedAt: now,
      });

      // Call direct callback first (bypasses React for lower latency)
      if (positionUpdateCallbackRef.current) {
        positionUpdateCallbackRef.current(data.player_id, {
          x: data.x,
          y: data.y,
          vx: data.vx,
          vy: data.vy,
          rotation: data.rotation,
          thrusting: data.thrusting,
          timestamp: data.timestamp,
        });
      }

      // Still update React state for player metadata (but position comes from snapshots now)
      setOtherPlayers((prev) => {
        const playerInfo = playersRef.current.find((p) => p.id === data.player_id);
        if (!playerInfo) return prev;

        const existing = prev.findIndex((p) => p.id === data.player_id);
        const updatedPlayer: OtherPlayer = {
          id: data.player_id,
          username: playerInfo.username,
          displayName: playerInfo.displayName,
          color: playerInfo.color,
          x: data.x,
          y: data.y,
          vx: data.vx,
          vy: data.vy,
          rotation: data.rotation,
          thrusting: data.thrusting,
          shipImage: playerInfo.shipImage,
          shipEffects: playerInfo.shipEffects || defaultShipEffects,
          shipLevel: playerInfo.shipLevel || 1,
        };

        if (existing >= 0) {
          const newPlayers = [...prev];
          newPlayers[existing] = updatedPlayer;
          return newPlayers;
        } else {
          return [...prev, updatedPlayer];
        }
      });
    });

    // Handle upgrade animation broadcasts from other players
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on('broadcast', { event: 'upgrade' }, (payload: any) => {
      const data = payload.payload as {
        player_id: string;
        isUpgrading: boolean;
        targetPlanetId: string | null;
      };

      if (data.player_id === playerId) return; // Skip self

      // Call direct callback (bypasses React for smoother animation)
      if (upgradeUpdateCallbackRef.current) {
        upgradeUpdateCallbackRef.current(data.player_id, {
          isUpgrading: data.isUpgrading,
          targetPlanetId: data.targetPlanetId,
        });
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Fetch initial positions after subscribing
        await fetchInitialPositions();
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [teamId, playerId, fetchInitialPositions]);

  // Update other players when player list changes (for new ship images, etc.)
  // Also remove offline players from the map
  useEffect(() => {
    setOtherPlayers((prev) =>
      prev
        // Filter out offline players
        .filter((op) => {
          const playerInfo = players.find((p) => p.id === op.id);
          return playerInfo?.isOnline !== false;
        })
        // Update remaining players' info
        .map((op) => {
          const playerInfo = players.find((p) => p.id === op.id);
          if (playerInfo) {
            return {
              ...op,
              username: playerInfo.username,
              displayName: playerInfo.displayName,
              color: playerInfo.color,
              shipImage: playerInfo.shipImage,
              shipEffects: playerInfo.shipEffects || defaultShipEffects,
              shipLevel: playerInfo.shipLevel || 1,
            };
          }
          return op;
        })
    );
  }, [players]);

  // Remove stale players (no update in 10 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 10000; // 10 seconds

      setOtherPlayers((prev) => {
        const fresh = prev.filter((p) => {
          const cached = positionCacheRef.current.get(p.id);
          if (!cached) return false;
          return now - cached.receivedAt < staleThreshold;
        });

        // Clean up cache
        for (const [id, cached] of positionCacheRef.current.entries()) {
          if (now - cached.receivedAt >= staleThreshold) {
            positionCacheRef.current.delete(id);
          }
        }

        return fresh;
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return {
    otherPlayers,
    broadcastPosition,
    broadcastUpgradeState,
    setPositionUpdateCallback,
    setUpgradeUpdateCallback,
  };
}
