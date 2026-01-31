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
