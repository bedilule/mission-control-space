import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { OtherPlayer, ShipEffects } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// WebSocket server URL - use environment variable or default to localhost for dev
// @ts-ignore - Vite injects import.meta.env at build time
const WS_SERVER_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_SERVER_URL) || 'ws://localhost:8080';

interface PlayerInfo {
  id: string;
  username: string;
  displayName: string;
  color: string;
  shipImage: string;
  shipEffects: ShipEffects;
  shipLevel: number;
  isOnline: boolean;
  planetImageUrl?: string;
  planetTerraformCount?: number;
  planetSizeLevel?: number;
}

interface UsePlayerPositionsOptions {
  teamId: string | null;
  playerId: string | null; // Database player ID (not local ID)
  players: PlayerInfo[]; // Player info from useMultiplayerSync
}

// Callback type for direct position updates (bypasses React state)
type PositionUpdateCallback = (playerId: string, data: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
  boosting: boolean;
  timestamp: number;
}) => void;

// Callback type for upgrade animation updates
type UpgradeUpdateCallback = (playerId: string, data: {
  isUpgrading: boolean;
  targetPlanetId: string | null;
}) => void;

// Callback type for send animation updates (planet push)
type SendAnimationCallback = (playerId: string, data: {
  type: 'start' | 'target';
  planetId: string;
  velocityX?: number;
  velocityY?: number;
  targetX?: number;
  targetY?: number;
}) => void;

interface ShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
  boosting: boolean;
}

interface UsePlayerPositionsReturn {
  otherPlayers: OtherPlayer[];
  broadcastPosition: (shipState: ShipState) => void;
  broadcastUpgradeState: (isUpgrading: boolean, targetPlanetId?: string | null) => void;
  broadcastSendStart: (planetId: string, velocityX: number, velocityY: number) => void;
  broadcastSendTarget: (planetId: string, targetX: number, targetY: number) => void;
  setPositionUpdateCallback: (callback: PositionUpdateCallback | null) => void;
  setUpgradeUpdateCallback: (callback: UpgradeUpdateCallback | null) => void;
  setSendAnimationCallback: (callback: SendAnimationCallback | null) => void;
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
  senderTimestamp: number; // Timestamp from sender's clock (for ordering comparison)
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
  hasWarpDrive: false,
  hasMissionControlPortal: false,
};

export function usePlayerPositions(options: UsePlayerPositionsOptions): UsePlayerPositionsReturn {
  const { teamId, playerId, players } = options;

  const [otherPlayers, setOtherPlayers] = useState<OtherPlayer[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const lastDbUpdateRef = useRef<number>(0);
  const lastBroadcastPositionRef = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const positionCacheRef = useRef<Map<string, CachedPosition>>(new Map());
  const playersRef = useRef<PlayerInfo[]>(players);
  // Direct callback for position updates (bypasses React state for lower latency)
  const positionUpdateCallbackRef = useRef<PositionUpdateCallback | null>(null);
  // Direct callback for upgrade animation updates
  const upgradeUpdateCallbackRef = useRef<UpgradeUpdateCallback | null>(null);
  // Direct callback for send animation updates (planet push)
  const sendAnimationCallbackRef = useRef<SendAnimationCallback | null>(null);

  // Set the callback for direct position updates
  const setPositionUpdateCallback = useCallback((callback: PositionUpdateCallback | null) => {
    positionUpdateCallbackRef.current = callback;
  }, []);

  // Set the callback for upgrade animation updates
  const setUpgradeUpdateCallback = useCallback((callback: UpgradeUpdateCallback | null) => {
    upgradeUpdateCallbackRef.current = callback;
  }, []);

  // Set the callback for send animation updates
  const setSendAnimationCallback = useCallback((callback: SendAnimationCallback | null) => {
    sendAnimationCallbackRef.current = callback;
  }, []);

  // Keep players ref updated without triggering effects
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Broadcast position via WebSocket (fast, direct connection)
  // Takes ship state as parameter to get fresh data every call (not stale React state)
  const broadcastPosition = useCallback((ship: ShipState) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !playerId) return;

    const now = Date.now();
    // Throttle broadcasts to 60Hz (16ms) - matches typical frame rate
    if (now - lastBroadcastRef.current < 16) return;

    // Only broadcast if actually moving or rotating
    const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    const isMoving = speed > 0.1 || ship.thrusting;
    const lastPos = lastBroadcastPositionRef.current;
    const rotationChanged = lastPos && Math.abs(ship.rotation - lastPos.rotation) > 0.01;
    const positionChanged = lastPos && (
      Math.abs(ship.x - lastPos.x) > 1 ||
      Math.abs(ship.y - lastPos.y) > 1
    );

    // Skip broadcast if stationary and no significant change
    if (!isMoving && lastPos && !rotationChanged && !positionChanged) {
      return;
    }

    lastBroadcastRef.current = now;
    lastBroadcastPositionRef.current = { x: ship.x, y: ship.y, rotation: ship.rotation };

    // Send position via WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'position',
      x: ship.x,
      y: ship.y,
      vx: ship.vx,
      vy: ship.vy,
      rotation: ship.rotation,
      thrusting: ship.thrusting,
      boosting: ship.boosting,
      timestamp: now,
    }));

    // Persist to database less frequently (every 5 seconds)
    if (now - lastDbUpdateRef.current > 5000) {
      lastDbUpdateRef.current = now;
      supabase
        .from('ship_positions')
        .update({
          x: ship.x,
          y: ship.y,
          vx: ship.vx,
          vy: ship.vy,
          rotation: ship.rotation,
          thrusting: ship.thrusting,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', playerId)
        .then(() => {});
    }
  }, [playerId]);

  // Broadcast upgrade state (when player starts/stops upgrading)
  // Sends via both WebSocket (primary) and Supabase (backup)
  const broadcastUpgradeState = useCallback((isUpgrading: boolean, targetPlanetId: string | null = null) => {
    if (!playerId) {
      console.warn('[Upgrade Broadcast] No playerId - skipping');
      return;
    }

    console.log('[Upgrade Broadcast] Sending:', { playerId, isUpgrading, targetPlanetId });

    // Send via WebSocket (primary - lower latency)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'upgrade',
        isUpgrading,
        targetPlanetId,
      }));
    }

    // Also send via Supabase (backup)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'upgrade',
        payload: {
          player_id: playerId,
          isUpgrading,
          targetPlanetId,
        },
      });
    }
  }, [playerId]);

  // Broadcast send animation start (planet pushed in random direction)
  const broadcastSendStart = useCallback((planetId: string, velocityX: number, velocityY: number) => {
    if (!playerId) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'send_start',
        planetId,
        velocityX,
        velocityY,
      }));
    }
  }, [playerId]);

  // Broadcast send animation target (planet steers toward destination)
  const broadcastSendTarget = useCallback((planetId: string, targetX: number, targetY: number) => {
    if (!playerId) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'send_target',
        planetId,
        targetX,
        targetY,
      }));
    }
  }, [playerId]);

  // Fetch initial positions from database
  const fetchInitialPositions = useCallback(async () => {
    if (!teamId || !playerId) return;

    // Get all player IDs in this team
    const currentPlayers = playersRef.current;
    const playerIds = currentPlayers.map((p) => p.id);
    if (playerIds.length === 0) return;

    // Only fetch positions updated in the last 10 seconds (staleness threshold)
    // This prevents showing inactive players who haven't moved recently
    const staleThreshold = new Date(Date.now() - 10000).toISOString();

    const { data: positions } = await supabase
      .from('ship_positions')
      .select()
      .in('player_id', playerIds)
      .gte('updated_at', staleThreshold);

    if (positions) {
      const now = Date.now();
      const others: OtherPlayer[] = [];

      for (const pos of positions) {
        if (pos.player_id === playerId) continue; // Skip self

        const playerInfo = currentPlayers.find((p) => p.id === pos.player_id);
        // Only skip if player doesn't exist at all (not based on isOnline status)
        // The WebSocket staleness check (10 second timeout) handles removing inactive players
        if (!playerInfo) continue;

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
          planetImageUrl: playerInfo.planetImageUrl,
          planetTerraformCount: playerInfo.planetTerraformCount,
          planetSizeLevel: playerInfo.planetSizeLevel,
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
          senderTimestamp: 0, // Initial fetch - any WebSocket message will be newer
        });
      }

      setOtherPlayers(others);
    }
  }, [teamId, playerId]);

  // Set up WebSocket connection for position updates (high frequency)
  useEffect(() => {
    console.log('[WS Effect] Running with teamId:', teamId, 'playerId:', playerId);
    if (!teamId || !playerId) {
      console.log('[WS Effect] Missing teamId or playerId, skipping');
      return;
    }

    const connectWebSocket = () => {
      console.log('[WS] Connecting to', WS_SERVER_URL, 'with playerId:', playerId);
      const ws = new WebSocket(WS_SERVER_URL);

      ws.onopen = () => {
        console.log('[WS] Connected');
        // Join the team room
        ws.send(JSON.stringify({
          type: 'join',
          playerId,
          teamId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'joined') {
            console.log('[WS] Joined team room');
            return;
          }

          if (data.type === 'position') {
            // Skip self (shouldn't receive due to server logic, but double-check)
            if (data.playerId === playerId) return;

            const now = Date.now();
            const cached = positionCacheRef.current.get(data.playerId);

            // Only update if this is newer than what we have
            // IMPORTANT: Compare sender timestamps (same clock source) to avoid clock skew issues
            if (cached && cached.senderTimestamp > data.timestamp) return;

            // Update cache
            positionCacheRef.current.set(data.playerId, {
              player_id: data.playerId,
              x: data.x,
              y: data.y,
              vx: data.vx,
              vy: data.vy,
              rotation: data.rotation,
              thrusting: data.thrusting,
              receivedAt: now,
              senderTimestamp: data.timestamp,
            });

            // Call direct callback first (bypasses React for lower latency)
            if (positionUpdateCallbackRef.current) {
              positionUpdateCallbackRef.current(data.playerId, {
                x: data.x,
                y: data.y,
                vx: data.vx,
                vy: data.vy,
                rotation: data.rotation,
                thrusting: data.thrusting,
                boosting: data.boosting || false,
                timestamp: data.timestamp,
              });
            }

            // Still update React state for player metadata
            setOtherPlayers((prev) => {
              const playerInfo = playersRef.current.find((p) => p.id === data.playerId);
              if (!playerInfo) return prev;

              const existing = prev.findIndex((p) => p.id === data.playerId);
              const updatedPlayer: OtherPlayer = {
                id: data.playerId,
                username: playerInfo.username,
                displayName: playerInfo.displayName,
                color: playerInfo.color,
                x: data.x,
                y: data.y,
                vx: data.vx,
                vy: data.vy,
                rotation: data.rotation,
                thrusting: data.thrusting,
                boosting: data.boosting || false,
                shipImage: playerInfo.shipImage,
                shipEffects: playerInfo.shipEffects || defaultShipEffects,
                shipLevel: playerInfo.shipLevel || 1,
                planetImageUrl: playerInfo.planetImageUrl,
                planetTerraformCount: playerInfo.planetTerraformCount,
                planetSizeLevel: playerInfo.planetSizeLevel,
              };

              if (existing >= 0) {
                const newPlayers = [...prev];
                newPlayers[existing] = updatedPlayer;
                return newPlayers;
              } else {
                return [...prev, updatedPlayer];
              }
            });
          }

          if (data.type === 'upgrade') {
            // Skip self
            if (data.playerId === playerId) return;

            console.log('[WS Upgrade] From:', data.playerId, 'Data:', data);

            // Call direct callback (bypasses React for smoother animation)
            if (upgradeUpdateCallbackRef.current) {
              upgradeUpdateCallbackRef.current(data.playerId, {
                isUpgrading: data.isUpgrading,
                targetPlanetId: data.targetPlanetId,
              });
            }
          }

          if (data.type === 'send_start') {
            if (data.playerId === playerId) return;
            if (sendAnimationCallbackRef.current) {
              sendAnimationCallbackRef.current(data.playerId, {
                type: 'start',
                planetId: data.planetId,
                velocityX: data.velocityX,
                velocityY: data.velocityY,
              });
            }
          }

          if (data.type === 'send_target') {
            if (data.playerId === playerId) return;
            if (sendAnimationCallbackRef.current) {
              sendAnimationCallbackRef.current(data.playerId, {
                type: 'target',
                planetId: data.planetId,
                targetX: data.targetX,
                targetY: data.targetY,
              });
            }
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 2s...');
        wsRef.current = null;
        // Reconnect after 2 seconds
        wsReconnectTimeoutRef.current = setTimeout(() => {
          if (teamId && playerId) {
            connectWebSocket();
          }
        }, 2000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      console.log('[WS Effect] Cleanup running - closing WebSocket');
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [teamId, playerId]);

  // Set up Supabase realtime channel for upgrade broadcasts (less frequent, can use Supabase)
  useEffect(() => {
    if (!teamId || !playerId) {
      setOtherPlayers([]);
      return;
    }

    // Create channel for upgrade broadcasts only
    const channel = supabase.channel(`upgrades:${teamId}`, {
      config: {
        broadcast: {
          self: false, // Don't receive own broadcasts
        },
      },
    });

    // Handle upgrade animation broadcasts from other players
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on('broadcast', { event: 'upgrade' }, (payload: any) => {
      const data = payload.payload as {
        player_id: string;
        isUpgrading: boolean;
        targetPlanetId: string | null;
      };

      console.log('[Upgrade Received] From:', data.player_id, 'Self:', playerId, 'Data:', data);

      if (data.player_id === playerId) {
        console.log('[Upgrade Received] Skipping self');
        return;
      }

      // Call direct callback (bypasses React for smoother animation)
      if (upgradeUpdateCallbackRef.current) {
        console.log('[Upgrade Received] Calling callback');
        upgradeUpdateCallbackRef.current(data.player_id, {
          isUpgrading: data.isUpgrading,
          targetPlanetId: data.targetPlanetId,
        });
      } else {
        console.warn('[Upgrade Received] No callback registered!');
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

  // Update other players when player list changes (for new ship images, planet images, etc.)
  // NOTE: We do NOT filter based on database isOnline status here.
  // The WebSocket position updates have their own staleness check (10 second timeout).
  // Filtering based on isOnline causes jitter when there's clock skew between clients,
  // as players get constantly added/removed from the render list.
  useEffect(() => {
    setOtherPlayers((prev) =>
      prev
        // Update players' info (ship image, planet image, effects, etc.)
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
              planetImageUrl: playerInfo.planetImageUrl,
              planetTerraformCount: playerInfo.planetTerraformCount,
              planetSizeLevel: playerInfo.planetSizeLevel,
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
    broadcastSendStart,
    broadcastSendTarget,
    setPositionUpdateCallback,
    setUpgradeUpdateCallback,
    setSendAnimationCallback,
  };
}
