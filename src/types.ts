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
  type: 'business' | 'product' | 'achievement' | 'notion' | 'station';
  size: 'small' | 'medium' | 'big';
  style?: PlanetStyle;
  hasRing?: boolean;
  hasMoon?: boolean;
  description?: string;
  reward?: RewardType;
  realWorldReward?: string;
  ownerId?: string | null; // null = shared, string = player-owned (assigned_to)
  createdBy?: string | null; // Who created it (gets creation bonus)
  priority?: string | null; // For notion planets
  points?: number; // Completion points (for notion planets, based on priority)
  // Notion-specific fields
  notionTaskId?: string;
  notionUrl?: string;
  taskType?: string | null; // bug, feature, task, etc.
}

export interface NotionPlanet {
  id: string;
  team_id: string;
  notion_task_id: string;
  name: string;
  description: string | null;
  notion_url: string | null;
  assigned_to: string | null;
  created_by: string | null;
  task_type: string | null;
  priority: string | null;
  points: number;
  x: number;
  y: number;
  completed: boolean;
  created_at: string;
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

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  size: number;
  color: string;
}

export interface PlasmaProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  size: number;
  rotation: number;
}

export interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  rotation: number;
  targetPlanetId: string | null;
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
  boosting?: boolean;
  shipImage: string;
  shipEffects: ShipEffects;
  shipLevel: number; // 1 + upgrade count (affects ship size)
  // Planet data for multiplayer sync
  planetImageUrl?: string;
  planetTerraformCount?: number;
  planetSizeLevel?: number;
}

export interface ShipEffects {
  glowColor: string | null;
  trailType: 'default' | 'fire' | 'ice' | 'rainbow';
  sizeBonus: number;
  speedBonus: number;
  landingSpeedBonus: number;
  ownedGlows: string[];
  ownedTrails: string[];
  hasDestroyCanon: boolean;
  destroyCanonEquipped: boolean;
  hasSpaceRifle: boolean;
  spaceRifleEquipped: boolean;
  hasPlasmaCanon: boolean;
  plasmaCanonEquipped: boolean;
  hasRocketLauncher: boolean;
  rocketLauncherEquipped: boolean;
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
  boosting: boolean;
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
  renderBoosting: boolean;
  lastUpdateTime: number;
}
