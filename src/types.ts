export interface Vector2 {
  x: number;
  y: number;
}

export interface PlanetStyle {
  baseColor: string;
  accent: string;
  type: string;
}

export type RewardType =
  | 'speed_boost'      // Faster max speed
  | 'acceleration'     // Better acceleration
  | 'handling'         // Better rotation
  | 'shield'           // Visual shield effect
  | 'trail'            // Cool trail effect
  | 'glow'             // Ship glow upgrade
  | 'size'             // Ship size increase
  | 'special';         // Special visual upgrade

export interface Planet {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  glowColor: string;
  completed: boolean;
  type: 'business' | 'product' | 'achievement';
  size: 'small' | 'medium' | 'big';
  style?: PlanetStyle;
  hasRing?: boolean;
  hasMoon?: boolean;
  description?: string;
  reward?: RewardType;
  realWorldReward?: string;
  ownerId?: string | null; // null = shared, string = player-owned
}

export interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  layer: number; // for parallax
  color?: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
}

export interface GameState {
  ship: Ship;
  planets: Planet[];
  stars: Star[];
  particles: Particle[];
  camera: Vector2;
  dockingPlanet: Planet | null;
  nearbyPlanet: Planet | null;
  robotImage: string;
  completedCount: number;
}

// Multiplayer types
export interface OtherPlayer {
  id: string;
  username: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
  shipImage: string;
  shipEffects: ShipEffects;
  shipLevel: number; // 1 + upgrade count (affects ship size)
}

export interface ShipEffects {
  glowColor: string | null;
  trailType: 'default' | 'fire' | 'ice' | 'rainbow';
  sizeBonus: number;
  speedBonus: number;
  ownedGlows: string[];
  ownedTrails: string[];
}

export interface MultiplayerTeam {
  id: string;
  name: string;
  inviteCode: string;
  teamPoints: number;
  completedPlanets: string[];
}

export interface PointTransaction {
  id: string;
  teamId: string;
  playerId: string | null;
  playerName?: string;
  source: 'planet' | 'notion' | 'manual';
  notionTaskId?: string | null;
  taskName?: string | null;
  points: number;
  createdAt: string;
}

// Snapshot interpolation types for smooth multiplayer movement
export interface PositionSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  thrusting: boolean;
  timestamp: number;      // Sender's timestamp
  receivedAt: number;     // When we received it (local time)
}

export interface InterpolationState {
  // Current render position (what we display)
  renderX: number;
  renderY: number;
  renderRotation: number;
  renderVx: number;
  renderVy: number;
  renderThrusting: boolean;
  lastUpdateTime: number;
  // Dead reckoning state (for extrapolation when no data)
  deadReckonX: number;
  deadReckonY: number;
  deadReckonVx: number;
  deadReckonVy: number;
  deadReckonRotation: number;
  isDeadReckoning: boolean;
  // Blend correction (smooth transition when prediction was wrong)
  blendStartX: number;
  blendStartY: number;
  blendStartRotation: number;
  blendTargetX: number;
  blendTargetY: number;
  blendTargetRotation: number;
  blendProgress: number;           // 0 = at start, 1 = at target
  isBlending: boolean;
  // Collision physics (visual offset that decays back to real position)
  collisionOffsetX: number;
  collisionOffsetY: number;
  collisionVx: number;
  collisionVy: number;
}
