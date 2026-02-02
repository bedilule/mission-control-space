const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Store connections by team: teamId -> Map<playerId, WebSocket>
const teams = new Map();

// Stats for monitoring
let messageCount = 0;
let lastStatsTime = Date.now();

wss.on('connection', (ws, req) => {
  let playerId = null;
  let teamId = null;

  // Get client IP for logging
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[CONNECT] New connection from ${clientIp}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      messageCount++;

      // Join a team room
      if (msg.type === 'join') {
        playerId = msg.playerId;
        teamId = msg.teamId;

        if (!teams.has(teamId)) {
          teams.set(teamId, new Map());
        }
        teams.get(teamId).set(playerId, ws);

        console.log(`[JOIN] Player ${playerId.slice(0, 8)}... joined team ${teamId.slice(0, 8)}... (${teams.get(teamId).size} players)`);

        // Send confirmation
        ws.send(JSON.stringify({ type: 'joined', playerId, teamId }));
        return;
      }

      // Position update - broadcast to same team
      if (msg.type === 'position' && teamId) {
        const teamPlayers = teams.get(teamId);
        if (!teamPlayers) return;

        // Prepare payload once
        const payload = JSON.stringify({
          type: 'position',
          playerId: playerId,
          x: msg.x,
          y: msg.y,
          vx: msg.vx,
          vy: msg.vy,
          rotation: msg.rotation,
          thrusting: msg.thrusting,
          timestamp: msg.timestamp || Date.now(),
        });

        // Send to all OTHER players in the team
        for (const [otherPlayerId, otherWs] of teamPlayers) {
          if (otherPlayerId !== playerId && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(payload);
          }
        }
        return;
      }

      // Upgrade animation broadcast
      if (msg.type === 'upgrade' && teamId) {
        const teamPlayers = teams.get(teamId);
        if (!teamPlayers) return;

        const payload = JSON.stringify({
          type: 'upgrade',
          playerId: playerId,
          isUpgrading: msg.isUpgrading,
          targetPlanetId: msg.targetPlanetId,
        });

        for (const [otherPlayerId, otherWs] of teamPlayers) {
          if (otherPlayerId !== playerId && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(payload);
          }
        }
        return;
      }

    } catch (err) {
      console.error('[ERROR] Failed to parse message:', err.message);
    }
  });

  ws.on('close', () => {
    if (teamId && playerId) {
      const teamPlayers = teams.get(teamId);
      if (teamPlayers) {
        teamPlayers.delete(playerId);
        console.log(`[LEAVE] Player ${playerId.slice(0, 8)}... left team ${teamId.slice(0, 8)}... (${teamPlayers.size} players remaining)`);

        // Clean up empty teams
        if (teamPlayers.size === 0) {
          teams.delete(teamId);
          console.log(`[CLEANUP] Team ${teamId.slice(0, 8)}... removed (empty)`);
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[ERROR] WebSocket error for ${playerId || 'unknown'}:`, err.message);
  });

  // Heartbeat to keep connection alive
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Ping all clients every 30 seconds to detect dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('[HEARTBEAT] Terminating dead connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Log stats every 60 seconds
const statsInterval = setInterval(() => {
  const now = Date.now();
  const elapsed = (now - lastStatsTime) / 1000;
  const msgPerSec = (messageCount / elapsed).toFixed(1);

  let totalPlayers = 0;
  for (const team of teams.values()) {
    totalPlayers += team.size;
  }

  console.log(`[STATS] ${msgPerSec} msg/sec | ${teams.size} teams | ${totalPlayers} players | ${wss.clients.size} connections`);

  messageCount = 0;
  lastStatsTime = now;
}, 60000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  clearInterval(statsInterval);
});

console.log(`
=========================================
  Mission Control WebSocket Server
  Running on port ${PORT}
=========================================
`);
