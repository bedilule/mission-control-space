# Multiplayer Architecture

## URLs

- **Game:** http://mission-control-space.s3-website-us-east-1.amazonaws.com
- **WebSocket Server:** ws://13.250.26.247:8080

## Overview

Mission Control uses a hybrid approach for multiplayer synchronization:

- **WebSocket Server (AWS)** - High-frequency position updates (60Hz)
- **Supabase** - Database persistence, authentication, and upgrade animations

## Why Two Systems?

Supabase Realtime was dropping ~85% of position messages due to rate limits and geographic latency. A dedicated WebSocket server provides:

- Direct connection (no message broker overhead)
- No rate limiting on position updates
- Lower latency (Singapore region closer to users)

## Architecture

```
┌─────────────────┐     Position Updates (60Hz)     ┌──────────────────┐
│                 │ ◄──────────────────────────────► │                  │
│   Browser A     │                                  │   Browser B      │
│                 │ ◄──────────────────────────────► │                  │
└────────┬────────┘      WebSocket Server           └────────┬─────────┘
         │                (AWS Singapore)                     │
         │                                                    │
         │           Upgrades, Auth, DB (low freq)           │
         └──────────────────► Supabase ◄─────────────────────┘
```

## WebSocket Server

### Location
- **Server code:** `ws-server/`
- **Deployed to:** AWS EC2 Singapore (`ap-southeast-1`)
- **URL:** `ws://13.250.26.247:8080`

### Message Types

**Join (client → server)**
```json
{
  "type": "join",
  "playerId": "uuid",
  "teamId": "uuid"
}
```

**Position (bidirectional)**
```json
{
  "type": "position",
  "x": 100,
  "y": 200,
  "vx": 1.5,
  "vy": -0.5,
  "rotation": 1.57,
  "thrusting": true,
  "timestamp": 1706889600000
}
```

**Upgrade (bidirectional)**
```json
{
  "type": "upgrade",
  "isUpgrading": true,
  "targetPlanetId": "planet-uuid"
}
```

### Server Features
- Team-based rooms (players only receive messages from their team)
- Heartbeat/ping-pong for connection health (30s interval)
- Auto-cleanup of empty teams
- Stats logging every 60 seconds

## Client Configuration

Environment variable in `.env`:
```
VITE_WS_SERVER_URL=ws://13.250.26.247:8080
```

For production with SSL:
```
VITE_WS_SERVER_URL=wss://your-domain.com
```

## EC2 Server Management

### SSH Access
```bash
ssh -i ~/.ssh/mission-control-ws.pem ec2-user@13.250.26.247
```

### PM2 Commands
```bash
pm2 status                    # Check if running
pm2 logs mission-control-ws   # View logs
pm2 restart mission-control-ws # Restart server
```

### Update Server Code
```bash
# From local machine
scp -i ~/.ssh/mission-control-ws.pem -r ws-server/* ec2-user@13.250.26.247:~/ws-server/

# Then SSH in and restart
ssh -i ~/.ssh/mission-control-ws.pem ec2-user@13.250.26.247 "cd ~/ws-server && npm install && pm2 restart mission-control-ws"
```

## Smoothness Optimizations

### Send Rate
- 60Hz (16ms throttle) - matches typical frame rate
- Configured in `usePlayerPositions.ts`

### Interpolation
- LERP factor: 0.15 (15% per frame)
- Velocity prediction capped at 200ms
- Configured in `SpaceGame.ts`

### Trail Particles
- Other players emit same particle count as local player
- 2 particles (default) or 4 particles (special trails) per frame

## Supabase (Still Used For)

| Feature | Frequency | Why Supabase |
|---------|-----------|--------------|
| Database persistence | Every 5s | Permanent storage |
| Upgrade animations | On event | Low frequency, tolerates some loss |
| Player/team data | On change | Authoritative source |
| Authentication | On login | Security |

## Security Notes

- `.pem` key file is gitignored - never commit
- EC2 Security Group allows port 8080 from anywhere
- Consider adding SSL (wss://) for production
