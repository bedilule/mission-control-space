import { Vector2, Planet, Star, Particle, Ship, GameState, RewardType, OtherPlayer, ShipEffects as TypedShipEffects, PositionSnapshot, InterpolationState, Projectile, PlasmaProjectile, Rocket, NuclearBomb } from './types';
import { soundManager } from './SoundManager';

interface CustomPlanetData {
  id: string;
  name: string;
  description?: string;
  type: 'business' | 'product' | 'achievement' | 'notion';
  size: 'small' | 'medium' | 'big';
  realWorldReward?: string;
  imageUrl?: string;
  createdBy: string;
}

interface GoalData {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'big';
  description?: string;
  realWorldReward?: string;
  points?: number;
  targetDate?: string;
  imageUrl?: string;
}

interface GoalsData {
  business: GoalData[];
  product: GoalData[];
  achievement: GoalData[];
}

interface UserPlanetData {
  imageUrl: string;
  terraformCount: number;
  sizeLevel?: number;
}

interface ShipEffects {
  glowColor: string | null;
  trailType: 'default' | 'fire' | 'ice' | 'rainbow' | 'plasma' | 'star';
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
  hasNuclearBomb: boolean;
  nuclearBombEquipped: boolean;
  hasWarpDrive: boolean;
  hasMissionControlPortal: boolean;
  healthBonus: number;
  ownedCompanions: string[];
  equippedCompanions: string[];
}

interface UpgradeSatellite {
  angle: number;
  distance: number;
  speed: number;
  size: number;
  color: string;
  wobble: number;
  wobbleSpeed: number;
  type: 'satellite' | 'robot';
}

interface CompanionDef {
  id: string;
  name: string;
  color: string;
  glowColor: string;
  size: number;
  cost: number;
  icon: string;
  planetsToHatch: number;
  isLegendary?: boolean;
}

interface Companion {
  type: string;
  worldX: number;
  worldY: number;
  prevWorldX: number;
  prevWorldY: number;
  vx: number;
  vy: number;
  wobble: number;
  angle: number;
  timer: number;
  stateFlag: number;
  idleWanderTarget: { x: number; y: number } | null;
  alpha: number;
}

const COMPANION_DEFS: CompanionDef[] = [
  { id: 'spark', name: 'Spark', color: '#ffff88', glowColor: '#ffff44', size: 8, cost: 100, icon: '\u2728', planetsToHatch: 5 },
  { id: 'nibbles', name: 'Nibbles', color: '#ff88aa', glowColor: '#ff4488', size: 8, cost: 150, icon: '\u{1F43E}', planetsToHatch: 5 },
  { id: 'astro_frog', name: 'Astro Frog', color: '#44ff66', glowColor: '#22cc44', size: 9, cost: 250, icon: '\u{1F438}', planetsToHatch: 5 },
  { id: 'void_kitten', name: 'Void Kitten', color: '#bb66ff', glowColor: '#9933ff', size: 10, cost: 400, icon: '\u{1F431}', planetsToHatch: 7 },
  { id: 'jellybloom', name: 'Jellybloom', color: '#66ffee', glowColor: '#33ddcc', size: 11, cost: 500, icon: '\u{1FAB7}', planetsToHatch: 7 },
  { id: 'frost_sprite', name: 'Frost Sprite', color: '#88ddff', glowColor: '#55bbff', size: 9, cost: 500, icon: '\u2744\uFE0F', planetsToHatch: 7 },
  { id: 'pixel_ghost', name: 'Pixel Ghost', color: '#eeeeff', glowColor: '#ccccff', size: 10, cost: 650, icon: '\u{1F47B}', planetsToHatch: 8 },
  { id: 'comet_fox', name: 'Comet Fox', color: '#ff8844', glowColor: '#ff6622', size: 9, cost: 800, icon: '\u{1F98A}', planetsToHatch: 10 },
  { id: 'crystal_bat', name: 'Crystal Bat', color: '#ff44ff', glowColor: '#cc22cc', size: 10, cost: 800, icon: '\u{1F987}', planetsToHatch: 10 },
  { id: 'flame_wisp', name: 'Flame Wisp', color: '#ff4422', glowColor: '#cc2200', size: 9, cost: 1000, icon: '\u{1F525}', planetsToHatch: 12 },
  { id: 'baby_black_hole', name: 'Baby Black Hole', color: '#222233', glowColor: '#ffffff', size: 12, cost: 1500, icon: '\u{1F573}\uFE0F', planetsToHatch: 15 },
  { id: 'golden_scarab', name: 'Golden Scarab', color: '#ffd700', glowColor: '#ccaa00', size: 11, cost: 2000, icon: '\u{1FAB2}', planetsToHatch: 15 },
  // Boss drops
  { id: 'mini_nomad', name: 'Mini Nomad', color: '#ff00ff', glowColor: '#00ffff', size: 14, cost: 0, icon: '\u{1F47E}', planetsToHatch: 10 },
  // Legendaries — massive companions (3x ship size)
  { id: 'cosmic_dragon', name: 'Cosmic Dragon', color: '#ff2222', glowColor: '#cc0000', size: 42, cost: 5000, icon: '\u{1F432}', planetsToHatch: 25, isLegendary: true },
  { id: 'phoenix_eternal', name: 'Phoenix Eternal', color: '#ffaa00', glowColor: '#ff8800', size: 40, cost: 7500, icon: '\u{1F985}', planetsToHatch: 35, isLegendary: true },
  { id: 'void_leviathan', name: 'Void Leviathan', color: '#8b5cf6', glowColor: '#6d28d9', size: 45, cost: 10000, icon: '\u{1F419}', planetsToHatch: 50, isLegendary: true },
];

// Store terraform counts and size levels for scaling
const userPlanetTerraformCounts: Map<string, number> = new Map();
const userPlanetSizeLevels: Map<string, number> = new Map();

const USER_IDS = ['quentin', 'armel', 'alex', 'milya', 'hugues', 'testpilot'];
const TEST_PLAYER_ID = 'testpilot';

// Achievement definitions
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  points: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'whale_encounter', name: 'The Leviathan', icon: '🐋', description: 'Get within 300px of the space whale', points: 100 },
  { id: 'explorer', name: 'Explorer', icon: '🧭', description: 'Visit all player zones', points: 100 },
  { id: 'black_hole_3', name: 'Close Call', icon: '🕳️', description: '3 black hole escapes', points: 50 },
  { id: 'black_hole_5', name: 'Gravity Dancer', icon: '🌀', description: '5 black hole escapes', points: 75 },
  { id: 'black_hole_10', name: 'The Maw Knows', icon: '👁️', description: '10 black hole escapes', points: 150 },
  { id: 'distance_50k', name: 'Voyager', icon: '🚀', description: 'Travel 50,000 pixels', points: 50 },
  { id: 'distance_100k', name: 'Star Wanderer', icon: '⭐', description: 'Travel 100,000 pixels', points: 75 },
  { id: 'distance_500k', name: 'Cosmic Drifter', icon: '🌌', description: 'Travel 500,000 pixels', points: 100 },
  { id: 'distance_1m', name: 'Light Traveler', icon: '💫', description: 'Travel 1,000,000 pixels', points: 200 },
  { id: 'tasks_5', name: 'Getting Started', icon: '✅', description: 'Complete 5 tasks in a session', points: 50 },
  { id: 'tasks_25', name: 'Workhorse', icon: '🔥', description: 'Complete 25 tasks in a session', points: 100 },
  { id: 'konami', name: '↑↑↓↓←→←→BA', icon: '🎮', description: 'Enter the Konami code', points: 50 },
  { id: 'whale_slap', name: 'Bad Idea', icon: '🐋💥', description: 'Shoot the space whale. Find out.', points: 75 },
  { id: 'nomad_slayer', name: 'Neon Nemesis', icon: '🏪💀', description: 'Defeat the Neon Nomad in combat', points: 200 },
];

// Expanded world to fit all zones
const WORLD_SIZE = 10000;
const ZONE_SIZE = 2000; // Zone radius
const CENTER_X = WORLD_SIZE / 2;
const CENTER_Y = WORLD_SIZE / 2;

// Zone types for organizing goals
type ZoneType = 'central' | 'business' | 'product' | 'player';

interface Zone {
  id: string;
  name: string;
  centerX: number;
  centerY: number;
  color: string;
  ownerId: string | null; // null = shared zone
  zoneType: ZoneType;
}

// Layout: Center = Achievements + Black Hole, Bottom-middle = Mission Control (Shop + Factory)
// Bottom-left = Business, Bottom-right = Product
// Players arranged in arc around top: Right, Top-Right, Top, Top-Left, Left
const HUB_DISTANCE = 2800; // Distance from center to Business/Product hubs
const PLAYER_DISTANCE = 3000; // Distance from center to player zones

// Mission Control - bottom middle, lower than Business and Product hubs
const MISSION_CONTROL_X = CENTER_X;
const MISSION_CONTROL_Y = CENTER_Y + HUB_DISTANCE * 1.1; // Lower on the map

const ZONES: Zone[] = [
  // Central zone - Achievements & Black Hole
  { id: 'central', name: 'Achievements', centerX: CENTER_X, centerY: CENTER_Y, color: '#ffd700', ownerId: null, zoneType: 'central' },

  // Mission Control - lower bottom middle (Shop + Planet Factory) - player spawn point
  { id: 'mission-control', name: 'Mission Control', centerX: MISSION_CONTROL_X, centerY: MISSION_CONTROL_Y, color: '#ff6b35', ownerId: null, zoneType: 'central' },

  // Goal hubs - Business (bottom-left) and Product (bottom-right)
  { id: 'hub-business', name: 'Business Hub', centerX: CENTER_X - HUB_DISTANCE * 0.7, centerY: CENTER_Y + HUB_DISTANCE * 0.7, color: '#4ade80', ownerId: null, zoneType: 'business' },
  { id: 'hub-product', name: 'Product Hub', centerX: CENTER_X + HUB_DISTANCE * 0.7, centerY: CENTER_Y + HUB_DISTANCE * 0.7, color: '#5490ff', ownerId: null, zoneType: 'product' },

  // Player zones in arc around top half (Right → Top-Right → Top → Top-Left → Left)
  { id: 'zone-quentin', name: "Quentin's Sector", centerX: CENTER_X + PLAYER_DISTANCE, centerY: CENTER_Y, color: '#ffa500', ownerId: 'quentin', zoneType: 'player' }, // Right
  { id: 'zone-alex', name: "Alex's Sector", centerX: CENTER_X + PLAYER_DISTANCE * 0.7, centerY: CENTER_Y - PLAYER_DISTANCE * 0.7, color: '#00bfff', ownerId: 'alex', zoneType: 'player' }, // Top-Right
  { id: 'zone-armel', name: "Armel's Sector", centerX: CENTER_X, centerY: CENTER_Y - PLAYER_DISTANCE, color: '#98fb98', ownerId: 'armel', zoneType: 'player' }, // Top
  { id: 'zone-milya', name: "Milya's Sector", centerX: CENTER_X - PLAYER_DISTANCE * 0.7, centerY: CENTER_Y - PLAYER_DISTANCE * 0.7, color: '#ff6b9d', ownerId: 'milya', zoneType: 'player' }, // Top-Left
  { id: 'zone-hugues', name: "Hugues's Sector", centerX: CENTER_X - PLAYER_DISTANCE, centerY: CENTER_Y, color: '#8b5cf6', ownerId: 'hugues', zoneType: 'player' }, // Left
  { id: 'zone-testpilot', name: "Test Sector", centerX: CENTER_X, centerY: CENTER_Y + PLAYER_DISTANCE, color: '#888888', ownerId: 'testpilot', zoneType: 'player' }, // Bottom
];
const SHIP_ACCELERATION = 0.18;
const SHIP_ROTATION_SPEED = 0.06;
const SHIP_MAX_SPEED = 7;
const SHIP_BOOST_MAX_SPEED = 14;
const SHIP_BOOST_ACCELERATION = 0.35;
const SHIP_FRICTION = 0.992;
const DOCKING_DISTANCE = 50;
const PLANET_INFO_DISTANCE = 200;

// Smooth multiplayer interpolation
const SNAPSHOT_BUFFER_SIZE = 30;
const LERP_FACTOR = 0.15;              // 15% per frame - smoother with 60Hz updates

interface BlackHole {
  x: number;
  y: number;
  radius: number;
  pullRadius: number;
  eventHorizon: number;
}

export class SpaceGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private keys: Set<string> = new Set();
  private keyboardLayout: 'qwerty' | 'azerty' = 'qwerty';
  private animationId: number = 0;
  private lastFrameTime: number = 0;
  private dt: number = 1; // Delta-time normalized to 60fps (1.0 = 16.67ms)
  private onDock: (planet: Planet) => void;
  private logoImage: HTMLImageElement | null = null;
  private shipImage: HTMLImageElement | null = null;
  private baseShipImage: HTMLImageElement | null = null; // Default ship for players without custom skin
  private hormoziPlanetImage: HTMLImageElement | null = null;
  private canonImage: HTMLImageElement | null = null; // Space TNT weapon image
  private rifleImage: HTMLImageElement | null = null; // Space Rifle weapon image
  private plasmaCanonImage: HTMLImageElement | null = null; // Plasma Canon weapon image
  private rocketLauncherImage: HTMLImageElement | null = null; // Rocket Launcher weapon image
  private nukeButtonImage: HTMLImageElement | null = null; // Nuclear Bomb weapon (ship mount - red button)
  private nukeWarheadImage: HTMLImageElement | null = null; // Nuclear Bomb projectile (flying warhead)
  private portalImage: HTMLImageElement | null = null; // Mission Control Portal image
  private shipLevel: number = 1;
  private shipEffects: ShipEffects = { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false, hasSpaceRifle: false, spaceRifleEquipped: false, hasPlasmaCanon: false, plasmaCanonEquipped: false, hasRocketLauncher: false, rocketLauncherEquipped: false, hasNuclearBomb: false, nuclearBombEquipped: false, hasWarpDrive: false, hasMissionControlPortal: false, healthBonus: 0, ownedCompanions: [], equippedCompanions: [] };
  private blackHole: BlackHole;
  private shipBeingSucked: boolean = false;
  private suckProgress: number = 0;
  private customPlanetImages: Map<string, HTMLImageElement> = new Map();
  private userPlanetImages: Map<string, HTMLImageElement> = new Map();
  private notionTypeImages: Map<string, HTMLImageElement> = new Map();
  private criticalFlameImage: HTMLImageElement | null = null;

  // Landing animation state
  private isLanding: boolean = false;
  private landingProgress: number = 0;
  private landingPlanet: Planet | null = null;
  private landingStartPos: { x: number; y: number; rotation: number } | null = null;

  // Landed state (player is on planet, showing details)
  private isLanded: boolean = false;
  private landedPlanet: Planet | null = null;
  private landedPanelBounds: { x: number; y: number; w: number; h: number } | null = null;

  // Callbacks for landing interactions
  private onLand: ((planet: Planet) => void) | null = null;
  private onShopApproach: (() => void) | null = null;
  private shopApproachFired = false;
  private onCollisionVoice: (() => void) | null = null;
  private collisionBumpCount = 0;
  private collisionBumpTimer = 0;
  private lastCollisionVoice = 0;
  private onTakeoff: (() => void) | null = null;
  private onColonize: ((planet: Planet) => void) | null = null;
  private onClaimRequest: ((planet: Planet) => void) | null = null; // Called when user wants to claim - App handles API then calls startClaimToPosition
  private onOpenNotion: ((url: string) => void) | null = null;
  private onTerraform: ((planet: Planet) => void) | null = null;
  private onDestroyPlanet: ((planet: Planet) => void) | null = null;
  private onBlackHoleDeath: (() => void) | null = null;
  private onReassignRequest: ((planet: Planet) => void) | null = null; // Called when user wants to reassign task to another user
  private onEditRequest: ((planet: Planet) => void) | null = null; // Called when user wants to edit task properties
  private onFeatureToggle: ((planet: Planet) => void) | null = null; // Called when user wants to pin/unpin a planet to HUD
  private featuredPlanetIds: Set<string> = new Set();
  private suppressLandedPanel: boolean = false; // When true, React modal handles landed UI instead of canvas

  // Destroy animation state (explosion effect)
  private isDestroying: boolean = false;
  private destroyProgress: number = 0;
  private destroyPlanet: Planet | null = null;
  private destroyParticles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
  private destroyFromRifle: boolean = false; // True if destroyed by rifle (skip ship effects)

  // Claim animation state (teleport ship + planet to home base)
  private isClaiming: boolean = false;
  private claimProgress: number = 0;
  private claimPlanet: Planet | null = null;
  private claimParticles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
  private claimStartX: number = 0; // Planet center X at start
  private claimStartY: number = 0; // Planet center Y at start
  private claimShipStartX: number = 0; // Ship X at start (exact position)
  private claimShipStartY: number = 0; // Ship Y at start (exact position)
  private claimPlanetRadius: number = 0; // Planet radius at start (frozen value)
  private claimTargetX: number = 0;
  private claimTargetY: number = 0;
  private claimTargetReady: boolean = false; // True when API has returned with actual target position
  private claimTrailPoints: { x: number; y: number; alpha: number }[] = [];
  private claimPendingPlanet: Planet | null = null; // New planet data to apply after animation ends

  // Warp home animation state (teleport ship to home planet with H key)
  private isWarping: boolean = false;
  private warpProgress: number = 0;
  private warpStartX: number = 0;
  private warpStartY: number = 0;
  private warpTargetX: number = 0;
  private warpTargetY: number = 0;
  private warpParticles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
  private warpTrailPoints: { x: number; y: number; alpha: number }[] = [];

  // Mission Control Portal state (teleport from home planet to Mission Control with G key)
  private isPortalTeleporting: boolean = false;
  private portalProgress: number = 0;
  private portalStartX: number = 0;
  private portalStartY: number = 0;
  private portalTargetX: number = 0;
  private portalTargetY: number = 0;
  private portalParticles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
  private portalTrailPoints: { x: number; y: number; alpha: number }[] = [];
  private portalAngle: number = 0; // Portal rotation animation

  // Send/Reassign animation state (rocket pushing planet across map)
  private isSending: boolean = false;
  private sendPlanetId: string | null = null;
  private sendTargetX: number = 0;
  private sendTargetY: number = 0;
  private sendTargetReady: boolean = false;
  private sendVelocityX: number = 0;
  private sendVelocityY: number = 0;
  private sendRocketFlame: number = 0;
  private sendPendingPlanet: Planet | null = null; // Updated planet data to add after animation
  private sendRealPlanetId: string | null = null; // Real planet ID from API (to suppress in sync)
  private sendKnownPlanetIds: Set<string> = new Set(); // Notion planet IDs that existed before animation
  private sendTrailPoints: { x: number; y: number; size: number; alpha: number }[] = [];

  // Upgrading animation state (orbiting satellites/robots)
  private isUpgrading: boolean = false;
  private upgradeTargetPlanetId: string | null = null; // null = orbit ship, string = orbit planet
  private upgradeSatellites: UpgradeSatellite[] = [];

  // Current player (for zone-based interactions)
  private currentUser: string = 'quentin';

  // "NEW" planet tracking
  private seenPlanetIds: Set<string> = new Set(); // session cache — no repeat DB calls
  private onMarkSeen: ((planetId: string, username: string) => void) | null = null;

  // For seamless world wrapping
  private prevShipX: number = 0;
  private prevShipY: number = 0;

  // Zone title display
  private currentZoneId: string | null = null;
  private zoneTitleOpacity: number = 0;
  private zoneTitleText: string = '';
  private zoneTitleColor: string = '#ffffff';

  // Multiplayer: other players' ships
  private otherPlayers: OtherPlayer[] = [];
  private otherPlayerImages: Map<string, HTMLImageElement> = new Map();
  private otherPlayerImageUrls: Map<string, string> = new Map(); // Track loaded URLs for change detection
  private otherPlayerPlanetUrls: Map<string, string> = new Map(); // Track planet image URLs for change detection
  // Snapshot interpolation for smooth rendering (replaces simple lerp)
  private playerSnapshots: Map<string, PositionSnapshot[]> = new Map();
  private renderStates: Map<string, InterpolationState> = new Map();
  // Other players' upgrade animations
  private otherPlayerUpgrading: Map<string, { targetPlanetId: string | null; satellites: UpgradeSatellite[] }> = new Map();
  // Other players' escort drones (persistent for smooth animation)
  private otherPlayerCompanions: Map<string, Companion[]> = new Map();
  // Other players' send/push animations (planet being pushed across map)
  private remoteSendAnimations: Map<string, {
    planetId: string;
    senderId: string;
    velocityX: number;
    velocityY: number;
    targetX: number;
    targetY: number;
    targetReady: boolean;
    rocketFlame: number;
    trailPoints: { x: number; y: number; size: number; alpha: number }[];
    frozenPlanetX: number;
    frozenPlanetY: number;
    startTime: number;
  }> = new Map();

  // Space Rifle projectile system
  private projectiles: Projectile[] = [];
  private planetHealth: Map<string, number> = new Map();
  private planetDamageEffects: Map<string, { shakeOffset: number; cracks: number }> = new Map();
  private lastShotTime: number = 0;
  private readonly FIRE_COOLDOWN: number = 200; // ms between shots
  private readonly BULLET_SPEED: number = 12;
  private readonly BULLET_DAMAGE: number = 10;
  private readonly BULLET_RANGE: number = 500; // max travel distance
  private readonly PLANET_MAX_HEALTH: number = 100;

  // Plasma Canon projectile system
  private plasmaProjectiles: PlasmaProjectile[] = [];
  private lastPlasmaTime: number = 0;
  private readonly PLASMA_COOLDOWN: number = 800; // ms between shots (slower)
  private readonly PLASMA_SPEED: number = 6; // slower than rifle
  private readonly PLASMA_DAMAGE: number = 50; // high damage
  private readonly PLASMA_RANGE: number = 600;
  private readonly PLASMA_SIZE: number = 18;

  // Rocket Launcher projectile system
  private rockets: Rocket[] = [];
  private lastRocketTime: number = 0;
  private readonly ROCKET_COOLDOWN: number = 1200; // ms between shots (slowest)
  private readonly ROCKET_SPEED: number = 8;
  private readonly ROCKET_DAMAGE: number = 100;
  private readonly ROCKET_TURN_SPEED: number = 0.08; // homing turn rate
  private readonly ROCKET_RANGE: number = 800;

  // Nuclear Bomb weapon system
  private nuclearBomb: NuclearBomb | null = null;
  private nukeCinematic: boolean = false;
  private nukeCameraTarget: { x: number; y: number } | null = null;
  private nukeDetonation: { x: number; y: number; progress: number; maxDuration: number; shockwaveRadius: number; flashAlpha: number; particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[] } | null = null;
  private lastNukeTime: number = 0;
  private readonly NUKE_COOLDOWN: number = 60000; // 60 seconds
  private readonly NUKE_SPEED: number = 10;
  private readonly NUKE_DETONATION_DURATION: number = 180; // ~3 seconds of explosion
  private readonly NUKE_ALARM_DURATION: number = 300; // 5 seconds at 60fps
  private nukeAlarmTimer: number = 0;
  private nukeLaunchStartTime: number = 0; // tracks when nuke.mp3 started for 11s max
  private onNukeComplete: (() => void) | null = null;

  // Remote projectiles (visual-only, no collision/damage)
  private remoteProjectiles: Projectile[] = [];
  private remotePlasmaProjectiles: PlasmaProjectile[] = [];
  private remoteRockets: Rocket[] = [];

  // Remote destroy animations (explosion effects from other players)
  private remoteDestroyAnimations: Map<string, {
    x: number;
    y: number;
    radius: number;
    progress: number;
    particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[];
    fromRifle: boolean;
  }> = new Map();

  // Callbacks for broadcasting weapon fire and planet destruction
  private onWeaponFire: ((weaponType: 'rifle' | 'plasma' | 'rocket', x: number, y: number, vx: number, vy: number, rotation: number, targetPlanetId: string | null) => void) | null = null;
  private onPlanetDestroyBroadcast: ((planetId: string, fromRifle: boolean) => void) | null = null;

  // Asset loading tracking
  private criticalAssetsLoaded = 0;
  private criticalAssetsTotal = 0;
  private assetsReady = false;
  private onAssetsReady: (() => void) | null = null;

  // Shooting stars (ambient cosmic events)
  private shootingStars: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; brightness: number; length: number; color: string }[] = [];
  private lastShootingStarSpawn: number = 0;

  // Konami code Easter egg
  private konamiBuffer: string[] = [];
  private konamiActivated: boolean = false;
  private konamiEffectTimer: number = 0;
  private readonly KONAMI_SEQUENCE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

  // Idle ship ambient effect
  private idleTimer: number = 0;
  private idleParticles: { angle: number; dist: number; speed: number; size: number; alpha: number }[] = [];

  // Passive achievements & ambient dynamics
  private visitedZones: Set<string> = new Set();
  private explorerTriggered: boolean = false;
  private explorerEffectTimer: number = 0;
  private sessionCompletions: number = 0;
  private completionGlowTimer: number = 0;
  private completionMilestone: number = 0;
  private completionMilestoneTimer: number = 0;
  private blackHoleCloseCallCount: number = 0;
  private wasInBlackHolePull: boolean = false;
  private totalDistanceTraveled: number = 0;
  private prevDistX: number = 0;
  private prevDistY: number = 0;
  private distanceMilestoneReached: number = 0;
  private distanceMilestoneTimer: number = 0;
  private milestoneText: string = '';
  private milestoneColor: string = '#ffd700';
  private lastBlackHoleWhisperCount: number = 0;

  // Space whale (rare ambient creature)
  private spaceWhaleImage: HTMLImageElement | null = null;
  // Whale uses deterministic parametric path from Date.now() for multiplayer sync
  private spaceWhale: { x: number; y: number; alpha: number; scale: number; rotation: number } = {
    x: 0, y: 0, alpha: 0, scale: 0.8, rotation: 0
  };
  private whaleEncountered: boolean = false;
  private whaleEncounterTimer: number = 0;
  private whaleSoundPlayed: boolean = false;
  private whaleSlapCooldown: number = 0; // Prevent spam-triggering
  private whaleSlapTextTimer: number = 0; // "The Leviathan is not amused" text
  private whaleKnockbackTimer: number = 0; // While > 0, bypass speed clamp (whale yeet!)
  // Steve Irwin popup (shown when shooting the whale) — cycles through images
  private steveIrwinImages: HTMLImageElement[] = [];
  private steveIrwinImageIndex: number = 0; // Cycles through all images
  private steveIrwinPopupTimer: number = 0; // While > 0, show popup and freeze ship
  private steveIrwinFreezeVx: number = 0; // Store velocity to restore after freeze
  private steveIrwinFreezeVy: number = 0;
  private screenShake: { intensity: number; timer: number } = { intensity: 0, timer: 0 };

  // Persistent achievements
  private unlockedAchievements: Set<string> = new Set();
  private onAchievement: ((achievementId: string) => void) | null = null;

  // Roaming merchant ship
  private neonNomadImage: HTMLImageElement | null = null;
  private neonNomad: {
    x: number; y: number; rotation: number; scale: number;
  } = { x: 5000, y: 5000, rotation: 0, scale: 1 };
  private nomadSparkles: { x: number; y: number; life: number; maxLife: number; color: string; size: number }[] = [];
  private nearNeonNomad: boolean = false;
  private nomadApproachFired: boolean = false;
  private landedOnNomad: boolean = false;
  // nomad landing uses the standard planet landing animation via startLandingAnimation()
  private onNomadDock: (() => void) | null = null;
  private onNomadApproach: (() => void) | null = null;
  private onHornActivate: (() => void) | null = null;
  private onEmoteActivate: (() => void) | null = null;
  private hornCooldown: number = 0;
  private emoteCooldown: number = 0;
  private activeEmote: { type: string; timer: number } | null = null;
  private remoteEmotes: Map<string, { type: string; timer: number }> = new Map();
  // No waypoints — merchant uses parametric path from Date.now() for deterministic sync
  private static readonly NOMAD_DOCKING_DISTANCE = 120;
  private static readonly NOMAD_RENDER_SIZE = 156;

  // Nomad boss fight (local only)
  private nomadFight: {
    active: boolean;
    nomadHP: number;
    playerHP: number;
    attackTimer: number;
    patternIndex: number;
    spiralAngle: number;
    phaseTimer: number;
    nomadVx: number;
    nomadVy: number;
    enraged: boolean;
    introTimer: number;
    defeatTimer: number;
    victoryTimer: number;
    strafeTimer: number;
    strafeDir: number;
    savedNomadPos: { x: number; y: number };
    damageFlashTimer: number;
    playerDamageFlashTimer: number;
    contactDamageCooldown: number;
    deathMessage: string;
    surrendered: boolean;
    surrenderTimer: number;
    surrenderMessage: string;
    lootCrate: { x: number; y: number; spawnTimer: number; bobTimer: number; glowPulse: number; collected: boolean } | null;
    nearCrate: boolean;
    hardMode: boolean;
  } | null = null;
  private nomadProjectiles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; damage: number; size: number; color: string }[] = [];
  private nomadFightCooldown: number = 0;
  private onNomadBossVictory: (() => void) | null = null;
  private onNomadLootCollected: (() => void) | null = null;
  private onNomadFightStart: (() => void) | null = null;
  private onNomadHit: (() => void) | null = null;
  private onNomadFightEnd: (() => void) | null = null;
  private onNomadDefeatTaunt: (() => void) | null = null;
  private nomadVictoryText: { text: string; x: number; y: number; timer: number } | null = null;
  private nomadSurrenderText: { text: string; x: number; y: number; timer: number } | null = null;

  // Companions (purchasable from The Hatchery)
  private companions: Companion[] = [];
  private companionImages: Map<string, HTMLImageElement> = new Map();

  // Companion Eggs
  private companionEggInstances: { companionId: string; worldX: number; worldY: number; vx: number; vy: number; wobble: number }[] = [];
  private eggImage: HTMLImageElement | null = null;
  private hatchAnimations: { companionId: string; x: number; y: number; timer: number; maxTimer: number; color: string }[] = [];

  // The Hatchery (roaming companion merchant)
  private hatcheryImage: HTMLImageElement | null = null;
  private hatchery: { x: number; y: number; rotation: number; scale: number } = { x: 9700, y: 9700, rotation: 0, scale: 1 };
  private hatcherySparkles: { x: number; y: number; life: number; maxLife: number; color: string; size: number }[] = [];
  private nearHatchery: boolean = false;
  private hatcheryApproachFired: boolean = false;
  private landedOnHatchery: boolean = false;
  private onHatcheryDock: (() => void) | null = null;
  private onHatcheryApproach: (() => void) | null = null;
  private static readonly HATCHERY_DOCKING_DISTANCE = 120;
  private static readonly HATCHERY_RENDER_SIZE = 140;

  constructor(canvas: HTMLCanvasElement, onDock: (planet: Planet) => void, customPlanets: CustomPlanetData[] = [], shipImageUrl?: string, goals?: GoalsData, upgradeCount: number = 0, userPlanets?: Record<string, UserPlanetData>, currentUser: string = 'quentin') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onDock = onDock;
    this.currentUser = currentUser;

    // Load keyboard layout preference
    const savedLayout = localStorage.getItem('mission-control-keyboard-layout');
    if (savedLayout === 'azerty') this.keyboardLayout = 'azerty';

    // Initialize state
    const basePlanets = this.createPlanets(goals);
    const customPlanetObjects = this.createCustomPlanets(customPlanets);
    const userPlanetObjects = this.createUserPlanets(userPlanets);

    this.state = {
      ship: {
        x: MISSION_CONTROL_X,
        y: MISSION_CONTROL_Y - 200, // Start at Mission Control (bottom middle)
        vx: 0,
        vy: 0,
        rotation: -Math.PI / 2,
        thrusting: false,
      },
      planets: [...basePlanets, ...customPlanetObjects, ...userPlanetObjects],
      stars: this.createStars(),
      particles: [],
      camera: { x: 0, y: 0 },
      dockingPlanet: null,
      nearbyPlanet: null,
      robotImage: '/robot.png',
      completedCount: 0,
    };

    // Load custom planet images
    customPlanets.forEach(cp => {
      if (cp.imageUrl) {
        this.loadCustomPlanetImage(cp.id, cp.imageUrl);
      }
    });

    // Load station skins (critical - visible immediately)
    this.loadCustomPlanetImage('shop-station', '/shop-station.png', true);
    this.loadCustomPlanetImage('planet-builder', '/planet-factory.png', true);
    this.loadCustomPlanetImage('control-hub', '/control-hub.png', true);

    // Load goal skins (achievements, business, product) from Supabase imageUrl
    if (goals) {
      const allGoals = [...(goals.achievement || []), ...(goals.business || []), ...(goals.product || [])];
      allGoals.forEach(g => {
        if (g.imageUrl) {
          this.loadCustomPlanetImage(g.id, g.imageUrl);
        }
      });
    }

    // Load Notion task type skins (critical - visible immediately)
    this.loadNotionTypeImage('bug', '/notion-bug.png', true);
    this.loadNotionTypeImage('enhancement', '/notion-enhancement.png', true);
    this.loadNotionTypeImage('feature', '/notion-enhancement.png');
    this.loadNotionTypeImage('task', '/notion-task.png', true);

    // Load critical priority flame overlay
    const flameImg = new Image();
    flameImg.crossOrigin = 'anonymous';
    flameImg.src = '/priority-critical.png';
    flameImg.onload = () => { this.criticalFlameImage = flameImg; };

    // Initialize black hole (more centered, slightly offset)
    // Black hole in the central zone
    this.blackHole = {
      x: CENTER_X + 150,
      y: CENTER_Y - 250,
      radius: 60,
      pullRadius: 350,
      eventHorizon: 30,
    };

    // Set ship level based on upgrades (affects size)
    this.shipLevel = 1 + upgradeCount;

    // Load logo for flags
    this.loadLogo(shipImageUrl);

    // Setup input
    this.setupInput();

    // Handle resize
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private loadLogo(shipImageUrl?: string) {
    const img = new Image();
    this.trackCriticalAsset(img);
    img.src = '/logo.png';
    img.onload = () => {
      this.logoImage = img;
    };

    // Load ship image (use custom URL if provided)
    const shipImg = new Image();
    shipImg.crossOrigin = 'anonymous';
    this.trackCriticalAsset(shipImg);
    shipImg.src = shipImageUrl || '/ship-base.png';
    shipImg.onload = () => {
      this.shipImage = shipImg;
    };

    // Always load the base ship image separately (for other players without custom skins)
    const baseShipImg = new Image();
    baseShipImg.crossOrigin = 'anonymous';
    baseShipImg.src = '/ship-base.png';
    baseShipImg.onload = () => {
      this.baseShipImage = baseShipImg;
    };

    // Load Hormozi planet image
    const hormoziImg = new Image();
    hormoziImg.src = '/planet-hormozi.png';
    hormoziImg.onload = () => {
      this.hormoziPlanetImage = hormoziImg;
    };

    // Load Space TNT image
    const canonImg = new Image();
    canonImg.crossOrigin = 'anonymous';
    canonImg.src = '/space-tnt.png';
    canonImg.onload = () => {
      this.canonImage = canonImg;
    };

    // Load Space Rifle image
    const rifleImg = new Image();
    rifleImg.crossOrigin = 'anonymous';
    rifleImg.src = '/space-rifle.png';
    rifleImg.onload = () => {
      this.rifleImage = rifleImg;
    };

    // Load Plasma Canon image
    const plasmaImg = new Image();
    plasmaImg.crossOrigin = 'anonymous';
    plasmaImg.src = '/plasma-canon.png';
    plasmaImg.onload = () => {
      this.plasmaCanonImage = plasmaImg;
    };

    // Load Rocket Launcher image
    const rocketImg = new Image();
    rocketImg.crossOrigin = 'anonymous';
    rocketImg.src = '/rocket-launcher.png';
    rocketImg.onload = () => {
      this.rocketLauncherImage = rocketImg;
    };

    // Load Nuclear Bomb images (button for ship mount, warhead for projectile)
    const nukeButtonImg = new Image();
    nukeButtonImg.crossOrigin = 'anonymous';
    nukeButtonImg.src = '/nuke-button.png';
    nukeButtonImg.onload = () => {
      this.nukeButtonImage = nukeButtonImg;
    };
    const nukeWarheadImg = new Image();
    nukeWarheadImg.crossOrigin = 'anonymous';
    nukeWarheadImg.src = '/nuke-warhead.png';
    nukeWarheadImg.onload = () => {
      this.nukeWarheadImage = nukeWarheadImg;
    };

    // Load Portal image
    const portalImg = new Image();
    portalImg.crossOrigin = 'anonymous';
    portalImg.src = '/portal.png';
    portalImg.onload = () => {
      this.portalImage = portalImg;
    };

    // Load Space Whale image
    const whaleImg = new Image();
    whaleImg.crossOrigin = 'anonymous';
    whaleImg.src = '/space-whale.png';
    whaleImg.onload = () => {
      this.spaceWhaleImage = whaleImg;
    };

    // Load Steve Irwin images (whale protection program) — escalating sequence
    const steveFiles = [
      '/steve/seriously1.png',
      '/steve/seriously_2.png',
      '/steve/mate_no.png',
      '/steve/not_cool.png',
      '/steve/didntdieforthis.png',
      '/steve/joking.png',
    ];
    for (const src of steveFiles) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.onload = () => {
        this.steveIrwinImages.push(img);
      };
    }

    // Load Neon Nomad image
    const nomadImg = new Image();
    nomadImg.crossOrigin = 'anonymous';
    nomadImg.src = '/neon-nomad.png';
    nomadImg.onload = () => {
      this.neonNomadImage = nomadImg;
    };

    // Load Hatchery image
    const hatcheryImg = new Image();
    hatcheryImg.crossOrigin = 'anonymous';
    hatcheryImg.src = '/hatchery.png';
    hatcheryImg.onload = () => {
      this.hatcheryImage = hatcheryImg;
    };

    // Load egg image
    const eggImg = new Image();
    eggImg.crossOrigin = 'anonymous';
    eggImg.src = '/companions/egg.png';
    eggImg.onload = () => { this.eggImage = eggImg; };

    // Load companion images
    for (const def of COMPANION_DEFS) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = def.id === 'mini_nomad' ? '/neon-nomad.png' : `/companions/${def.id}.png`;
      img.onload = () => {
        this.companionImages.set(def.id, img);
      };
    }
  }

  private createPlanets(goals?: GoalsData): Planet[] {
    const planets: Planet[] = [];

    // Planet visual styles
    const planetStyles = [
      { baseColor: '#e74c3c', accent: '#c0392b', type: 'rocky' },      // Mars-like red
      { baseColor: '#3498db', accent: '#2980b9', type: 'ocean' },      // Ocean blue
      { baseColor: '#f39c12', accent: '#d68910', type: 'desert' },     // Desert gold
      { baseColor: '#9b59b6', accent: '#8e44ad', type: 'gas' },        // Purple gas giant
      { baseColor: '#1abc9c', accent: '#16a085', type: 'toxic' },      // Teal toxic
      { baseColor: '#e91e63', accent: '#c2185b', type: 'crystal' },    // Pink crystal
      { baseColor: '#ff7043', accent: '#e64a19', type: 'volcanic' },   // Volcanic orange
      { baseColor: '#26c6da', accent: '#00acc1', type: 'ice' },        // Ice blue
    ];

    // Use provided goals or fallback to defaults
    const businessMilestones = goals?.business || [
      { id: 'b1', name: 'Gates open — 5 paying customers', size: 'small' as const, points: 100, targetDate: '2026-02-12' },
      { id: 'b2', name: '10 customers / $5k MRR', size: 'small' as const, points: 200, targetDate: '2026-02-19' },
      { id: 'b3', name: '20 customers / $10k MRR', size: 'small' as const, points: 400, targetDate: '2026-02-28' },
      { id: 'b4', name: 'Hugues starts to open the gates', size: 'medium' as const, points: 300, targetDate: '2026-03-07' },
      { id: 'b5', name: '$20k MRR', size: 'medium' as const, points: 500, targetDate: '2026-03-14' },
      { id: 'b6', name: 'Affiliate/referral program live', size: 'medium' as const, points: 300, targetDate: '2026-03-21' },
      { id: 'b7', name: '100 customers / $50k MRR', size: 'medium' as const, points: 750, targetDate: '2026-03-31' },
      { id: 'b8', name: 'First agency partnership signed', size: 'medium' as const, points: 500, targetDate: '2026-04-15' },
      { id: 'b9', name: '$100k MRR', size: 'big' as const, points: 1000, targetDate: '2026-04-30' },
      { id: 'b10', name: '$150k MRR', size: 'big' as const, points: 1500, targetDate: '2026-05-31' },
      { id: 'b11', name: '$250k MRR', size: 'big' as const, points: 2500, targetDate: '2026-06-30' },
      { id: 'b12', name: '$500k MRR', size: 'big' as const, points: 5000, targetDate: '2026-09-30' },
      { id: 'b13', name: '$1M MRR', size: 'big' as const, points: 10000, targetDate: '2026-12-31' },
      { id: 'b14', name: '$3M MRR / $36M ARR', size: 'big' as const, points: 15000, targetDate: '2027-06-30' },
      { id: 'b15', name: '$5M MRR / $60M ARR', size: 'big' as const, points: 25000, targetDate: '2027-12-31' },
    ];

    const productMilestones = goals?.product || [
      { id: 'p1', name: 'Templates Ready', size: 'small' as const, points: 20, targetDate: '2026-02-06' },
      { id: 'p2', name: 'Public Launch', size: 'small' as const, points: 30, targetDate: '2026-02-10' },
      { id: 'p3', name: 'Onboarding Wizard', size: 'small' as const, points: 40, targetDate: '2026-02-21' },
      { id: 'p4', name: 'Educational Videos', size: 'medium' as const, points: 60, targetDate: '2026-03-07' },
      { id: 'p5', name: '100 Videos Processed', size: 'medium' as const, points: 80, targetDate: '2026-03-14' },
      { id: 'p6', name: 'Analytics Functioning', size: 'medium' as const, points: 100, targetDate: '2026-03-31' },
      { id: 'p7', name: '1,000 Videos Processed', size: 'medium' as const, points: 150, targetDate: '2026-04-30' },
      { id: 'p8', name: '50 Templates', size: 'medium' as const, points: 200, targetDate: '2026-05-31' },
      { id: 'p9', name: 'Smooth UX Achieved', size: 'big' as const, points: 300, targetDate: '2026-06-30' },
      { id: 'p10', name: '"Where Are The Bugs?"', size: 'big' as const, points: 500, targetDate: '2026-09-30' },
      { id: 'p11', name: '100,000 Videos Processed', size: 'big' as const, points: 750, targetDate: '2026-12-31' },
      { id: 'p12', name: 'AI Agent Builds Funnels', size: 'big' as const, points: 1500, targetDate: '2027-06-30' },
      { id: 'p13', name: 'Desktop Version', size: 'big' as const, points: 2000, targetDate: '2027-09-30' },
      { id: 'p14', name: '1,000,000 Videos Processed', size: 'big' as const, points: 5000, targetDate: '2027-12-31' },
    ];

    const achievements = goals?.achievement || [
      { id: 'a1', name: 'First Organic Signup', size: 'small' as const, points: 20 },
      { id: 'a2', name: 'First Paying Customer', size: 'small' as const, points: 30 },
      { id: 'a3', name: 'First Referral', size: 'small' as const, points: 40 },
      { id: 'a4', name: 'First Week Streak', size: 'small' as const, points: 50 },
      { id: 'a5', name: '10 Referrals', size: 'medium' as const, points: 75 },
      { id: 'a6', name: 'Customers in 10+ Countries', size: 'medium' as const, points: 100 },
      { id: 'a7', name: 'First Podcast Appearance', size: 'medium' as const, points: 100 },
      { id: 'a8', name: 'First $10k Day', size: 'medium' as const, points: 150 },
      { id: 'a9', name: 'Big Podcast (100k+ audience)', size: 'medium' as const, points: 250 },
      { id: 'a10', name: 'Customers in 50+ Countries', size: 'big' as const, points: 300 },
      { id: 'a11', name: 'Competitor Copies Us', size: 'big' as const, points: 400 },
      { id: 'a12', name: 'Product Hunt Top 5', size: 'big' as const, points: 500 },
      { id: 'a13', name: 'Hacker News Front Page', size: 'big' as const, points: 600 },
      { id: 'a14', name: 'TechCrunch/Forbes Mention', size: 'big' as const, points: 750 },
      { id: 'a15', name: 'Product Hunt #1 of Day', size: 'big' as const, points: 1000 },
      { id: 'a16', name: 'Remy Jupille Uses Us', size: 'big' as const, points: 1000 },
      { id: 'a17', name: 'Yomi Denzel Uses Us', size: 'big' as const, points: 1250 },
      { id: 'a18', name: 'Iman Gadzhi Uses Us', size: 'big' as const, points: 1500 },
      { id: 'a19', name: 'Charlie Morgan Uses Us', size: 'big' as const, points: 1500 },
      { id: 'a20', name: 'Viral Video (1M+ views)', size: 'big' as const, points: 2000 },
      { id: 'a21', name: 'Gary Vee Notice', size: 'big' as const, points: 3000 },
      { id: 'a22', name: 'Alex Hormozi Notice', size: 'big' as const, points: 3000 },
      { id: 'a23', name: 'Wikipedia Page', size: 'big' as const, points: 5000 },
      { id: 'a24', name: 'Customer Tattoos Logo', size: 'big' as const, points: 10000 },
    ];

    const sizeRadius = { small: 35, medium: 50, big: 70 };

    // Get hub centers from ZONES
    const businessHub = ZONES.find(z => z.id === 'hub-business')!;
    const productHub = ZONES.find(z => z.id === 'hub-product')!;

    // Place BUSINESS planets in the Business Hub (bottom-left)
    // True Archimedean spiral: r = a + b*θ
    businessMilestones.forEach((m, i) => {
      const totalPlanets = businessMilestones.length;
      // Archimedean spiral parameters
      const startRadius = 150;
      const radiusGrowth = 45; // How much radius increases per radian
      const startAngle = -Math.PI / 2; // Start from top
      // Each planet is evenly spaced along the spiral
      const theta = (i / (totalPlanets - 1)) * Math.PI * 5; // ~2.5 full rotations
      const radius = startRadius + radiusGrowth * theta;
      const angle = startAngle + theta;
      // Override style to use green tones for business
      const businessStyle = { baseColor: '#4ade80', accent: '#22c55e', type: 'business' };
      planets.push({
        ...m,
        x: businessHub.centerX + Math.cos(angle) * radius,
        y: businessHub.centerY + Math.sin(angle) * radius,
        radius: sizeRadius[m.size],
        color: businessStyle.baseColor,
        glowColor: 'rgba(74, 222, 128, 0.4)',
        completed: false,
        type: 'business',
        style: businessStyle,
        hasRing: i === 5 || i === 10 || i === 15,
        hasMoon: i === 8 || i === 13 || i === 18,
        ownerId: null, // Shared planet
      });
    });

    // Place PRODUCT planets in the Product Hub (bottom-right)
    // True Archimedean spiral: r = a + b*θ
    productMilestones.forEach((m, i) => {
      const totalPlanets = productMilestones.length;
      // Archimedean spiral parameters
      const startRadius = 150;
      const radiusGrowth = 50; // How much radius increases per radian
      const startAngle = -Math.PI / 2; // Start from top
      // Each planet is evenly spaced along the spiral
      const theta = (i / (totalPlanets - 1)) * Math.PI * 4; // ~2 full rotations
      const radius = startRadius + radiusGrowth * theta;
      const angle = startAngle + theta;
      // Use blue tones for product
      const productStyle = { baseColor: '#5490ff', accent: '#3b82f6', type: 'product' };
      planets.push({
        ...m,
        x: productHub.centerX + Math.cos(angle) * radius,
        y: productHub.centerY + Math.sin(angle) * radius,
        radius: sizeRadius[m.size],
        color: productStyle.baseColor,
        glowColor: 'rgba(84, 144, 255, 0.4)',
        completed: false,
        type: 'product',
        style: productStyle,
        hasRing: i === 4 || i === 9 || i === 13,
        hasMoon: i === 6 || i === 11,
        ownerId: null, // Shared planet
      });
    });

    // Place ACHIEVEMENTS as golden planets spiraling around the BLACK HOLE
    // Black hole is at CENTER_X + 150, CENTER_Y - 250
    const blackHoleX = CENTER_X + 150;
    const blackHoleY = CENTER_Y - 250;
    // Sort achievements by size: small → medium → big (bigger planets on outer rings to avoid overlap)
    const sizeOrder: Record<string, number> = { small: 0, medium: 1, big: 2 };
    const sortedAchievements = [...achievements].sort((a, b) => (sizeOrder[a.size] || 0) - (sizeOrder[b.size] || 0));
    // True Archimedean spiral: r = a + b*θ
    sortedAchievements.forEach((m, i) => {
      const totalPlanets = sortedAchievements.length;
      // Archimedean spiral parameters
      const startRadius = 200; // Start outside black hole pull radius (350)
      const radiusGrowth = 35; // How much radius increases per radian
      const startAngle = -Math.PI / 2; // Start from top
      // Each planet is evenly spaced along the spiral
      const theta = (i / (totalPlanets - 1)) * Math.PI * 5; // ~2.5 full rotations
      const radius = startRadius + radiusGrowth * theta;
      const angle = startAngle + theta;
      planets.push({
        ...m,
        x: blackHoleX + Math.cos(angle) * radius,
        y: blackHoleY + Math.sin(angle) * radius,
        radius: sizeRadius[m.size],
        color: '#ffd700',
        glowColor: 'rgba(255, 215, 0, 0.5)',
        completed: false,
        type: 'achievement',
        style: { baseColor: '#ffd700', accent: '#ffa500', type: 'golden' },
        hasRing: i === 7 || i === 14 || i === 19,
        hasMoon: i === 4 || i === 11 || i === 17,
        ownerId: null, // Shared planet
      });
    });

    // SPECIAL STATIONS - At Mission Control (pushed down a bit)
    // Shop Station - Buy upgrades (right of Mission Control)
    planets.push({
      id: 'shop-station',
      name: 'Upgrade Shop',
      x: MISSION_CONTROL_X + 280,
      y: MISSION_CONTROL_Y + 180,
      radius: 110,
      color: '#5490ff',
      glowColor: 'rgba(84, 144, 255, 0.5)',
      completed: false,
      type: 'station',
      size: 'big',
      style: { baseColor: '#5490ff', accent: '#3b82f6', type: 'station' },
      hasRing: false,
      hasMoon: false,
      description: 'Spend team points on ship upgrades',
      ownerId: null, // Shared station
    });

    // Planet Builder - Create custom planets (left of Mission Control)
    planets.push({
      id: 'planet-builder',
      name: 'Planet Factory',
      x: MISSION_CONTROL_X - 280,
      y: MISSION_CONTROL_Y + 180,
      radius: 100,
      color: '#ffa500',
      glowColor: 'rgba(255, 165, 0, 0.5)',
      completed: false,
      type: 'station',
      size: 'big',
      style: { baseColor: '#ffa500', accent: '#ff8c00', type: 'station' },
      hasRing: false,
      hasMoon: false,
      description: 'Create new milestone planets',
      ownerId: null, // Shared station
    });

    // Control Hub station - below Mission Control (centered under Shop + Factory)
    planets.push({
      id: 'control-hub',
      name: 'Control Hub',
      x: MISSION_CONTROL_X,
      y: MISSION_CONTROL_Y + 420,
      radius: 105,
      color: '#9944ff',
      glowColor: 'rgba(153, 68, 255, 0.5)',
      completed: false,
      type: 'station',
      size: 'big',
      style: { baseColor: '#9944ff', accent: '#7722dd', type: 'station' },
      hasRing: false,
      hasMoon: false,
      description: 'Business data dashboard',
      ownerId: null, // Shared station
    });

    return planets;
  }

  private createStars(): Star[] {
    const stars: Star[] = [];
    // More stars, varied sizes
    for (let i = 0; i < 800; i++) {
      const layer = Math.floor(Math.random() * 3);
      stars.push({
        x: Math.random() * WORLD_SIZE * 2 - WORLD_SIZE / 2,
        y: Math.random() * WORLD_SIZE * 2 - WORLD_SIZE / 2,
        size: layer === 0 ? Math.random() * 1 + 0.5 : layer === 1 ? Math.random() * 1.5 + 0.5 : Math.random() * 2.5 + 1,
        brightness: Math.random() * 0.6 + 0.4,
        layer,
        color: Math.random() > 0.9 ? '#fff5e0' : Math.random() > 0.95 ? '#e0e5ff' : '#ffffff',
      });
    }
    return stars;
  }

  private createCustomPlanets(customPlanets: CustomPlanetData[]): Planet[] {
    const planets: Planet[] = [];
    const sizeRadius = { small: 35, medium: 50, big: 70 };

    // Place custom planets in organic curved arcs ABOVE Mission Control
    // Staggered honeycomb pattern - each arc offset so planets sit between previous arc's planets
    const baseDistance = 350; // First arc distance from Mission Control (clear of stations)
    const arcSpacing = 110; // Distance between arcs
    const planetsPerArc = 5;

    customPlanets.forEach((cp, i) => {
      const arcIndex = Math.floor(i / planetsPerArc);
      const posInArc = i % planetsPerArc;
      const arcRadius = baseDistance + arcIndex * arcSpacing;

      // Gentle arc curving upward (toward center)
      const arcSpread = Math.PI * 0.35;
      const baseAngle = -Math.PI / 2; // Point upward

      // Stagger: odd arcs are offset by half a position
      const staggerOffset = (arcIndex % 2 === 1) ? 0.5 : 0;
      const t = planetsPerArc > 1 ? (posInArc + staggerOffset) / planetsPerArc : 0.5;
      const angle = baseAngle + (t - 0.5) * arcSpread * 2;

      // Subtle organic variation (seeded by index for consistency)
      const seed = (i * 137.5) % 1;
      const radiusVariation = (seed - 0.5) * 25; // ±12.5 units
      const angleVariation = (((i * 97.3) % 1) - 0.5) * 0.06; // Smaller wobble

      const finalRadius = arcRadius + radiusVariation;
      const finalAngle = angle + angleVariation;

      const x = MISSION_CONTROL_X + Math.cos(finalAngle) * finalRadius;
      const y = MISSION_CONTROL_Y + Math.sin(finalAngle) * finalRadius;

      const typeColors: Record<string, { base: string; accent: string }> = {
        business: { base: '#4ade80', accent: '#22c55e' },
        product: { base: '#5490ff', accent: '#3b82f6' },
        achievement: { base: '#ffd700', accent: '#ffa500' },
      };

      const colors = typeColors[cp.type];

      planets.push({
        id: cp.id,
        name: cp.name,
        x: x,
        y: y,
        radius: sizeRadius[cp.size],
        color: colors.base,
        glowColor: colors.base + '60',
        completed: false,
        type: cp.type,
        size: cp.size,
        style: { baseColor: colors.base, accent: colors.accent, type: 'custom' },
        hasRing: cp.size === 'big',
        hasMoon: false,
        description: cp.description,
        realWorldReward: cp.realWorldReward,
      });
    });

    return planets;
  }

  private loadCustomPlanetImage(planetId: string, imageUrl: string, critical = false) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    if (critical) this.trackCriticalAsset(img);
    img.src = imageUrl;
    img.onload = () => {
      this.customPlanetImages.set(planetId, img);
    };
  }

  private loadNotionTypeImage(taskType: string, imageUrl: string, critical = false) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    if (critical) this.trackCriticalAsset(img);
    img.src = imageUrl;
    img.onload = () => {
      this.notionTypeImages.set(taskType, img);
    };
  }

  public setOnAssetsReady(cb: () => void) {
    this.onAssetsReady = cb;
    if (this.assetsReady) cb();
  }

  private trackCriticalAsset(img: HTMLImageElement) {
    this.criticalAssetsTotal++;
    const onDone = () => {
      this.criticalAssetsLoaded++;
      if (this.criticalAssetsLoaded >= this.criticalAssetsTotal && !this.assetsReady) {
        this.assetsReady = true;
        this.onAssetsReady?.();
      }
    };
    img.addEventListener('load', onDone, { once: true });
    img.addEventListener('error', onDone, { once: true });
  }

  public addCustomPlanet(customPlanet: CustomPlanetData) {
    const sizeRadius = { small: 35, medium: 50, big: 70 };
    const existingCustom = this.state.planets.filter(p => p.id.startsWith('custom-'));
    const i = existingCustom.length;

    // Place in organic curved arcs above Mission Control (staggered honeycomb)
    const baseDistance = 350; // Clear of stations
    const arcSpacing = 110;
    const planetsPerArc = 5;
    const arcIndex = Math.floor(i / planetsPerArc);
    const posInArc = i % planetsPerArc;
    const arcRadius = baseDistance + arcIndex * arcSpacing;

    const arcSpread = Math.PI * 0.35;
    const baseAngle = -Math.PI / 2;
    // Stagger: odd arcs offset by half a position
    const staggerOffset = (arcIndex % 2 === 1) ? 0.5 : 0;
    const t = planetsPerArc > 1 ? (posInArc + staggerOffset) / planetsPerArc : 0.5;
    const angle = baseAngle + (t - 0.5) * arcSpread * 2;

    // Organic variation
    const seed = (i * 137.5) % 1;
    const radiusVariation = (seed - 0.5) * 25;
    const angleVariation = (((i * 97.3) % 1) - 0.5) * 0.06;

    const finalRadius = arcRadius + radiusVariation;
    const finalAngle = angle + angleVariation;
    const x = MISSION_CONTROL_X + Math.cos(finalAngle) * finalRadius;
    const y = MISSION_CONTROL_Y + Math.sin(finalAngle) * finalRadius;

    const typeColors: Record<string, { base: string; accent: string }> = {
      business: { base: '#4ade80', accent: '#22c55e' },
      product: { base: '#5490ff', accent: '#3b82f6' },
      achievement: { base: '#ffd700', accent: '#ffa500' },
    };

    const colors = typeColors[customPlanet.type];

    const planet: Planet = {
      id: customPlanet.id,
      name: customPlanet.name,
      x: x,
      y: y,
      radius: sizeRadius[customPlanet.size],
      color: colors.base,
      glowColor: colors.base + '60',
      completed: false,
      type: customPlanet.type,
      size: customPlanet.size,
      style: { baseColor: colors.base, accent: colors.accent, type: 'custom' },
      hasRing: customPlanet.size === 'big',
      hasMoon: false,
      description: customPlanet.description,
      realWorldReward: customPlanet.realWorldReward,
    };

    this.state.planets.push(planet);

    if (customPlanet.imageUrl) {
      this.loadCustomPlanetImage(customPlanet.id, customPlanet.imageUrl);
    }
  }

  public syncNotionPlanets(notionPlanets: Planet[]) {
    // If we're in a claim animation, preserve that planet's reference
    // so the animation can continue controlling its position
    const claimingPlanetId = this.isClaiming && this.claimPlanet ? this.claimPlanet.id : null;

    // If we're in a send animation, preserve that planet's reference
    // so the animation can continue controlling its position
    const sendingPlanetId = this.isSending ? this.sendPlanetId : null;

    // Collect planet IDs being animated by remote players
    const remoteSendingPlanetIds = new Set(this.remoteSendAnimations.keys());

    // If landed on a notion planet, track it so we can update the reference
    const landedPlanetId = this.isLanded && this.landedPlanet?.id.startsWith('notion-') ? this.landedPlanet.id : null;

    // Claiming/sending planet is protected during animation (not replaced by sync)

    // Remove old notion planets EXCEPT ones being claimed/sent/remote-animated
    this.state.planets = this.state.planets.filter(p =>
      !p.id.startsWith('notion-') || p.id === claimingPlanetId || p.id === sendingPlanetId || remoteSendingPlanetIds.has(p.id)
    );

    // Check if we're sending a temp new-task planet (needs to find matching real planet)
    const isSendingTempTask = sendingPlanetId?.startsWith('temp-new-task-');

    // Add new notion planets EXCEPT ones being claimed/sent/remote-animated (keep animation's reference)
    for (const planet of notionPlanets) {
      if (planet.id === claimingPlanetId) {
        // Store the new planet data to apply after animation completes
        this.claimPendingPlanet = planet;
      } else if (planet.id === sendingPlanetId) {
        // Store the updated planet data to add after animation completes
        this.sendPendingPlanet = planet;
      } else if (remoteSendingPlanetIds.has(planet.id)) {
        // Remote send animation controls this planet — skip replacement
      } else if (isSendingTempTask && this.sendRealPlanetId && planet.id === this.sendRealPlanetId) {
        // Real planet matched by ID from API — suppress until animation finishes
        this.sendPendingPlanet = planet;
      } else if (isSendingTempTask && !this.sendRealPlanetId && !this.sendKnownPlanetIds.has(planet.id)) {
        // API hasn't returned yet but a new planet appeared — likely ours, suppress it
        // Also set the real ID + target so the animation knows where to go
        this.sendRealPlanetId = planet.id;
        this.sendPendingPlanet = planet;
        if (!this.sendTargetReady) {
          this.setSendTarget(planet.x, planet.y, planet.id);
        }
      } else {
        this.state.planets.push(planet);

        // If this is the planet we're landed on, update the reference to the new object
        // This prevents stale references when the user presses C to claim
        if (planet.id === landedPlanetId) {
          this.landedPlanet = planet;
        }
      }
    }

    // Safety check: ensure the claiming planet is still in state.planets
    if (claimingPlanetId) {
      const stillExists = this.state.planets.some(p => p.id === claimingPlanetId);
      if (!stillExists) {
        console.error('[ClaimSync] WARNING: Claiming planet was removed from state.planets!');
      }
    }

    // Safety check: ensure the sending planet is still in state.planets
    if (sendingPlanetId) {
      const stillExists = this.state.planets.some(p => p.id === sendingPlanetId);
      if (!stillExists) {
        console.error('[SendSync] WARNING: Sending planet was removed from state.planets!');
      }
    }
  }

  public setLandingCallbacks(callbacks: {
    onLand?: (planet: Planet) => void;
    onTakeoff?: () => void;
    onColonize?: (planet: Planet) => void;
    onClaimRequest?: (planet: Planet) => void;
    onOpenNotion?: (url: string) => void;
    onTerraform?: (planet: Planet) => void;
    onDestroyPlanet?: (planet: Planet) => void;
    onBlackHoleDeath?: () => void;
    onReassignRequest?: (planet: Planet) => void;
    onEditRequest?: (planet: Planet) => void;
    onFeatureToggle?: (planet: Planet) => void;
    onShopApproach?: () => void;
    onCollisionVoice?: () => void;
    onNomadDock?: () => void;
    onNomadApproach?: () => void;
    onHatcheryDock?: () => void;
    onHatcheryApproach?: () => void;
    onHornActivate?: () => void;
    onEmoteActivate?: () => void;
    onNomadBossVictory?: () => void;
    onNomadLootCollected?: () => void;
    onNomadFightStart?: () => void;
    onNomadHit?: () => void;
    onNomadFightEnd?: () => void;
    onNomadDefeatTaunt?: () => void;
  }) {
    this.onLand = callbacks.onLand || null;
    this.onTakeoff = callbacks.onTakeoff || null;
    this.onColonize = callbacks.onColonize || null;
    this.onClaimRequest = callbacks.onClaimRequest || null;
    this.onOpenNotion = callbacks.onOpenNotion || null;
    this.onTerraform = callbacks.onTerraform || null;
    this.onDestroyPlanet = callbacks.onDestroyPlanet || null;
    this.onBlackHoleDeath = callbacks.onBlackHoleDeath || null;
    this.onReassignRequest = callbacks.onReassignRequest || null;
    this.onEditRequest = callbacks.onEditRequest || null;
    this.onFeatureToggle = callbacks.onFeatureToggle || null;
    this.onShopApproach = callbacks.onShopApproach || null;
    this.onCollisionVoice = callbacks.onCollisionVoice || null;
    this.onNomadDock = callbacks.onNomadDock || null;
    this.onNomadApproach = callbacks.onNomadApproach || null;
    this.onHatcheryDock = callbacks.onHatcheryDock || null;
    this.onHatcheryApproach = callbacks.onHatcheryApproach || null;
    this.onHornActivate = callbacks.onHornActivate || null;
    this.onEmoteActivate = callbacks.onEmoteActivate || null;
    this.onNomadBossVictory = callbacks.onNomadBossVictory || null;
    this.onNomadLootCollected = callbacks.onNomadLootCollected || null;
    this.onNomadFightStart = callbacks.onNomadFightStart || null;
    this.onNomadHit = callbacks.onNomadHit || null;
    this.onNomadFightEnd = callbacks.onNomadFightEnd || null;
    this.onNomadDefeatTaunt = callbacks.onNomadDefeatTaunt || null;
  }

  public setAchievementCallback(callback: ((achievementId: string) => void) | null) {
    this.onAchievement = callback;
  }

  public setMarkSeenCallback(callback: ((planetId: string, username: string) => void) | null) {
    this.onMarkSeen = callback;
  }

  public setAchievements(achievements: Record<string, string>) {
    this.unlockedAchievements = new Set(Object.keys(achievements));
  }

  private tryUnlockAchievement(id: string) {
    if (this.unlockedAchievements.has(id)) return;
    this.unlockedAchievements.add(id);
    this.onAchievement?.(id);
  }

  public setFeaturedPlanetIds(ids: Set<string>) {
    this.featuredPlanetIds = ids;
  }

  public setWeaponFireCallback(callback: ((weaponType: 'rifle' | 'plasma' | 'rocket', x: number, y: number, vx: number, vy: number, rotation: number, targetPlanetId: string | null) => void) | null) {
    this.onWeaponFire = callback;
  }

  public setNukeCompleteCallback(callback: (() => void) | null) {
    this.onNukeComplete = callback;
  }

  public setPlanetDestroyBroadcastCallback(callback: ((planetId: string, fromRifle: boolean) => void) | null) {
    this.onPlanetDestroyBroadcast = callback;
  }

  public isPlayerLanded(): boolean {
    return this.isLanded;
  }

  public getLandedPlanet(): Planet | null {
    return this.landedPlanet;
  }

  public clearLandedState(): void {
    this.isLanded = false;
    this.landedPlanet = null;
    this.landedPanelBounds = null;
    this.landedOnNomad = false;
    this.landedOnHatchery = false;
  }

  public setSuppressLandedPanel(suppress: boolean): void {
    this.suppressLandedPanel = suppress;
  }

  public setKeyboardLayout(layout: 'qwerty' | 'azerty'): void {
    this.keyboardLayout = layout;
  }

  private get layoutKeys() {
    return this.keyboardLayout === 'azerty'
      ? { thrust: 'z', left: 'q', brake: 's', right: 'd' }
      : { thrust: 'w', left: 'a', brake: 's', right: 'd' };
  }

  private setupInput() {
    window.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      this.keys.add(e.key.toLowerCase());

      // Track Konami code sequence
      this.konamiBuffer.push(e.key.toLowerCase());
      if (this.konamiBuffer.length > this.KONAMI_SEQUENCE.length) {
        this.konamiBuffer.shift();
      }
      if (this.konamiBuffer.length === this.KONAMI_SEQUENCE.length &&
          this.konamiBuffer.every((k, i) => k === this.KONAMI_SEQUENCE[i]) &&
          !this.konamiActivated) {
        this.konamiActivated = true;
        this.konamiEffectTimer = 180; // 3 seconds at 60fps
        this.konamiBuffer = [];
        this.tryUnlockAchievement('konami');
      }

      // Reset idle timer on any key
      this.idleTimer = 0;

      if (['w', 'a', 's', 'd', 'z', 'q', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'c', 'n', 't', 'f', 'g', 'v'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      // Don't capture keys when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      this.keys.delete(e.key.toLowerCase());
    });

    // Click outside landed panel to close it
    this.canvas.addEventListener('click', (e) => {
      if (!this.isLanded || !this.landedPlanet || !this.landedPanelBounds) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const b = this.landedPanelBounds;
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) {
        this.isLanded = false;
        this.landedPlanet = null;
        this.landedPanelBounds = null;
        if (this.onTakeoff) {
          this.onTakeoff();
        }
      }
    });
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  public start() {
    // Initialize sound on game start (requires user interaction first)
    soundManager.init();

    // Initialize prevShip tracking to ship's starting position
    // This prevents the camera from incorrectly detecting a "wrap" on the first frame
    this.prevShipX = this.state.ship.x;
    this.prevShipY = this.state.ship.y;

    // Initialize camera centered on ship
    this.state.camera.x = this.state.ship.x - this.canvas.width / 2;
    this.state.camera.y = this.state.ship.y - this.canvas.height / 2;

    this.gameLoop();
  }

  public stop() {
    cancelAnimationFrame(this.animationId);
  }

  public completePlanet(id: string) {
    const planet = this.state.planets.find(p => p.id === id);
    if (planet) {
      planet.completed = true;
      this.state.completedCount++;
      // Note: shipLevel is only updated via upgradeShip/updateShipImage to match multiplayer sync

      // Track session completions for passive achievements
      this.sessionCompletions++;
      this.completionGlowTimer = 90; // Brief glow for 1.5 seconds

      // Task completion achievements
      if (this.sessionCompletions >= 5) this.tryUnlockAchievement('tasks_5');
      if (this.sessionCompletions >= 25) this.tryUnlockAchievement('tasks_25');

      // Milestone celebrations at 5, 10, 25, 50
      const milestones = [5, 10, 25, 50];
      for (const m of milestones) {
        if (this.sessionCompletions === m && this.completionMilestone < m) {
          this.completionMilestone = m;
          this.completionMilestoneTimer = 180;
          break;
        }
      }
    }
  }

  public resetCompletedPlanets() {
    for (const planet of this.state.planets) {
      planet.completed = false;
    }
    this.state.completedCount = 0;
  }

  public upgradeShip() {
    this.shipLevel = Math.min(10, this.shipLevel + 1);
  }

  public updateShipImage(imageUrl: string, newUpgradeCount?: number) {
    const shipImg = new Image();
    shipImg.crossOrigin = 'anonymous';
    shipImg.src = imageUrl;
    shipImg.onload = () => {
      this.shipImage = shipImg;
    };
    // Increase ship level/size
    if (newUpgradeCount !== undefined) {
      this.shipLevel = 1 + newUpgradeCount;
    } else {
      this.shipLevel += 1;
    }
  }

  public updateShipEffects(effects: ShipEffects) {
    this.shipEffects = effects;
  }

  public updateUserPlanetImage(userId: string, imageUrl: string, terraformCount?: number, sizeLevel?: number) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      this.userPlanetImages.set(userId, img);
    };

    // Update terraform count and size level
    if (terraformCount !== undefined) {
      userPlanetTerraformCounts.set(userId, terraformCount);
    }
    if (sizeLevel !== undefined) {
      userPlanetSizeLevels.set(userId, sizeLevel);
    }

    // Update the planet's radius in state
    const planet = this.state.planets.find(p => p.id === `user-planet-${userId}`);
    if (planet) {
      const tc = terraformCount ?? userPlanetTerraformCounts.get(userId) ?? 0;
      const sl = sizeLevel ?? userPlanetSizeLevels.get(userId) ?? 0;
      // Home planets are 2x larger for visibility (matches createUserPlanets formula)
      // Size only grows with purchased size level, not terraform count
      const baseRadius = 100;
      const sizeMultiplier = 1 + (sl * 0.2);
      planet.radius = baseRadius * sizeMultiplier;
      // Add ring after 3 terraforms
      (planet as any).hasRing = tc >= 3;
      // Add moon after 5 terraforms
      (planet as any).hasMoon = tc >= 5;
    }
  }

  public updateUserPlanetSize(userId: string, sizeLevel: number) {
    userPlanetSizeLevels.set(userId, sizeLevel);

    const planet = this.state.planets.find(p => p.id === `user-planet-${userId}`);
    if (planet) {
      // Home planets are 2x larger for visibility (matches createUserPlanets formula)
      // Size only grows with purchased size level
      const baseRadius = 100;
      const sizeMultiplier = 1 + (sizeLevel * 0.2);
      planet.radius = baseRadius * sizeMultiplier;
    }
  }

  private createUserPlanets(userPlanets?: Record<string, UserPlanetData>): Planet[] {
    const planets: Planet[] = [];

    const userColors: Record<string, { base: string; accent: string }> = {
      quentin: { base: '#ffa500', accent: '#ff8c00' },
      armel: { base: '#4ade80', accent: '#22c55e' },
      alex: { base: '#5490ff', accent: '#3b82f6' },
      milya: { base: '#ff6b9d', accent: '#ff4081' },
      hugues: { base: '#8b5cf6', accent: '#7c3aed' },
      testpilot: { base: '#888888', accent: '#666666' },
    };

    USER_IDS.forEach((userId) => {
      // Hide test player's planet from non-test players
      if (userId === TEST_PLAYER_ID && this.currentUser !== TEST_PLAYER_ID) return;
      const colors = userColors[userId];
      const planetData = userPlanets?.[userId];

      // Get zone center for this user
      const zone = ZONES.find(z => z.ownerId === userId);
      const pos = zone ? { x: zone.centerX, y: zone.centerY } : { x: CENTER_X, y: CENTER_Y };
      const terraformCount = planetData?.terraformCount || 0;
      const sizeLevel = planetData?.sizeLevel || 0;

      // Store terraform count and size level for scaling during render
      userPlanetTerraformCounts.set(userId, terraformCount);
      userPlanetSizeLevels.set(userId, sizeLevel);

      // Base radius grows only with purchased size level (20% per size level)
      // Home planets are 2x larger for visibility
      const baseRadius = 100;
      const sizeMultiplier = 1 + (sizeLevel * 0.2); // 20% per level
      const finalRadius = baseRadius * sizeMultiplier;

      const planet: Planet = {
        id: `user-planet-${userId}`,
        name: `${userId.charAt(0).toUpperCase() + userId.slice(1)}'s World`,
        x: pos.x,
        y: pos.y,
        radius: finalRadius,
        color: colors.base,
        glowColor: colors.base + '60',
        completed: false,
        type: 'achievement',
        size: 'big',
        style: { baseColor: colors.base, accent: colors.accent, type: 'user-planet' },
        hasRing: (planetData?.terraformCount || 0) >= 3,
        hasMoon: (planetData?.terraformCount || 0) >= 5,
        description: `${userId.charAt(0).toUpperCase() + userId.slice(1)}'s personal planet`,
        ownerId: userId, // This user owns this planet
      };

      planets.push(planet);

      // Load custom image if exists
      if (planetData?.imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = planetData.imageUrl;
        img.onload = () => {
          this.userPlanetImages.set(userId, img);
        };
      }
    });

    return planets;
  }

  private gameLoop = (timestamp: number = 0) => {
    // Calculate delta-time normalized to 60fps (dt=1.0 at 60fps, dt=0.5 at 120fps)
    if (this.lastFrameTime > 0) {
      const elapsed = timestamp - this.lastFrameTime;
      this.dt = Math.min(elapsed / (1000 / 60), 3); // Cap at 3x to prevent huge jumps
    }
    this.lastFrameTime = timestamp;

    this.update();
    this.render();
    this.animationId = requestAnimationFrame(this.gameLoop);
  };

  private update() {
    const { ship, planets } = this.state;

    // Handle landing animation (skip normal controls while landing)
    if (this.isLanding) {
      this.updateLandingAnimation();
      // Still update camera and particles
      this.updateCamera();
      this.updateParticles();
      // Keep nomad music low during landing animation
      if (this.landingPlanet?.id === '__nomad__') soundManager.updateNomadProximity(1, true);
      return;
    }

    // Handle landed state (player is on planet, showing details)
    if (this.isLanded && this.landedPlanet) {
      this.updateLandedState();
      this.updateCamera();
      this.updateParticles();
      // Keep nomad music low while in shop
      if (this.landedOnNomad) soundManager.updateNomadProximity(1, true);
      return;
    }

    // Handle claim animation
    if (this.isClaiming) {
      this.updateClaimAnimation();
      this.updateCamera();
      this.updateParticles();
      return;
    }

    // Handle warp home animation
    if (this.isWarping) {
      this.updateWarpAnimation();
      this.updateCamera();
      this.updateParticles();
      return;
    }

    // Handle portal teleport animation
    if (this.isPortalTeleporting) {
      this.updatePortalAnimation();
      this.updateCamera();
      this.updateParticles();
      return;
    }

    // Handle nuclear bomb cinematic (blocks all other input once rocket launches)
    if (this.nukeCinematic) {
      this.updateNuclearBomb();
      this.updateNukeCinematicCamera();
      this.updateParticles();
      return;
    }

    // Update nuke alarm phase (player can still move during alarm)
    if (this.nuclearBomb && this.nuclearBomb.phase === 'alarm') {
      this.updateNuclearBomb();
    }

    // Handle destroy animation
    if (this.isDestroying) {
      this.updateDestroyAnimation();
      this.updateRemoteProjectiles();
      this.updateRemoteDestroyAnimations();
      this.updateCamera();
      this.updateParticles();
      return;
    }

    // Handle send/reassign animation (doesn't block - planet just moves with rocket)
    if (this.isSending) {
      this.updateSendAnimation();
    }

    // Handle remote send animations from other players
    this.updateRemoteSendAnimations();

    // Steve Irwin popup freeze — block all ship input while popup is showing
    if (this.steveIrwinPopupTimer > 0) {
      ship.thrusting = false;
      // Still update everything else (camera, particles, whale, etc.)
      this.updateSpaceWhale();
      this.updateParticles();
      this.updateCamera();
      this.updateRemoteProjectiles();
      this.updateRemoteDestroyAnimations();
      this.updateRemoteSendAnimations();
      return;
    }

    // Handle rotation
    if (this.keys.has(this.layoutKeys.left) || this.keys.has('arrowleft')) {
      ship.rotation -= SHIP_ROTATION_SPEED * this.dt;
    }
    if (this.keys.has(this.layoutKeys.right) || this.keys.has('arrowright')) {
      ship.rotation += SHIP_ROTATION_SPEED * this.dt;
    }

    // Check if boosting
    const isBoosting = this.keys.has('shift');
    const speedMultiplier = 1 + ((this.shipEffects.speedBonus || 0) * 0.2); // Each level = +20%
    const acceleration = (isBoosting ? SHIP_BOOST_ACCELERATION : SHIP_ACCELERATION) * speedMultiplier;
    const maxSpeed = (isBoosting ? SHIP_BOOST_MAX_SPEED : SHIP_MAX_SPEED) * speedMultiplier;

    // Handle thrust
    const wasThrusting = ship.thrusting;
    ship.thrusting = this.keys.has(this.layoutKeys.thrust) || this.keys.has('arrowup');
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.rotation) * acceleration * this.dt;
      ship.vy += Math.sin(ship.rotation) * acceleration * this.dt;
      this.emitThrustParticles(isBoosting);

      // Sound: start or update thrust
      if (!wasThrusting) {
        soundManager.startThrust(isBoosting);
      } else {
        soundManager.updateThrust(isBoosting);
      }
    } else if (wasThrusting) {
      // Sound: stop thrust
      soundManager.stopThrust();
    }

    // Brake
    if (this.keys.has(this.layoutKeys.brake) || this.keys.has('arrowdown')) {
      ship.vx *= Math.pow(0.94, this.dt);
      ship.vy *= Math.pow(0.94, this.dt);
    }

    // Apply friction (exponential decay scales with dt)
    ship.vx *= Math.pow(SHIP_FRICTION, this.dt);
    ship.vy *= Math.pow(SHIP_FRICTION, this.dt);

    // Limit speed (bypass during whale knockback)
    if (this.whaleKnockbackTimer > 0) {
      this.whaleKnockbackTimer -= this.dt;
    } else {
      const speed = Math.sqrt(ship.vx ** 2 + ship.vy ** 2);
      if (speed > maxSpeed) {
        ship.vx = (ship.vx / speed) * maxSpeed;
        ship.vy = (ship.vy / speed) * maxSpeed;
      }
    }

    // Update position
    ship.x += ship.vx * this.dt;
    ship.y += ship.vy * this.dt;

    // Collision with planets (bounce off) — skip Notion planets (fly through them)
    for (const planet of planets) {
      if (planet.id.startsWith('notion-')) continue;

      const dx = ship.x - planet.x;
      const dy = ship.y - planet.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = planet.radius + 15; // Ship radius ~15

      if (dist < minDist) {
        // Skip if dist is 0 (would cause division by zero)
        if (dist === 0) {
          ship.x += 1; // Nudge ship to avoid NaN
          continue;
        }

        // Push ship out and bounce
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        ship.x += nx * overlap;
        ship.y += ny * overlap;

        // Capture speed BEFORE reflection for collision voice check
        const preCollisionSpeed = Math.sqrt(ship.vx ** 2 + ship.vy ** 2);

        // Reflect velocity
        const dot = ship.vx * nx + ship.vy * ny;
        ship.vx -= 2 * dot * nx * 0.6;
        ship.vy -= 2 * dot * ny * 0.6;

        // Emit collision particles
        this.emitCollisionParticles(ship.x - nx * 15, ship.y - ny * 15);

        // Sound: collision
        soundManager.playCollision();

        // Collision voice: trigger on full-speed hit or 100+ bumps in 3s
        const isBoosting = this.keys.has('shift');
        const now = performance.now();
        if (now - this.collisionBumpTimer > 3000) {
          this.collisionBumpCount = 0;
        }
        this.collisionBumpCount++;
        this.collisionBumpTimer = now;

        // Check if player was at max boosted speed before bounce (90%+ of boost max)
        const collisionSpeedMultiplier = 1 + ((this.shipEffects.speedBonus || 0) * 0.2);
        const boostMaxSpeed = SHIP_BOOST_MAX_SPEED * collisionSpeedMultiplier;
        const isFullSpeed = preCollisionSpeed >= boostMaxSpeed * 0.9;

        if (isFullSpeed && this.onCollisionVoice && now - this.lastCollisionVoice > 30000) {
          this.collisionBumpCount = 0;
          this.lastCollisionVoice = now;
          this.onCollisionVoice();
        }
      }
    }

    // Black hole gravitational pull
    if (!this.shipBeingSucked) {
      const bhDx = this.blackHole.x - ship.x;
      const bhDy = this.blackHole.y - ship.y;
      const bhDist = Math.sqrt(bhDx * bhDx + bhDy * bhDy);

      if (bhDist < this.blackHole.pullRadius) {
        // Gravitational pull increases as you get closer
        const pullStrength = Math.pow((this.blackHole.pullRadius - bhDist) / this.blackHole.pullRadius, 2) * 0.5;
        const nx = bhDx / bhDist;
        const ny = bhDy / bhDist;
        ship.vx += nx * pullStrength * this.dt;
        ship.vy += ny * pullStrength * this.dt;

        // Track black hole close calls
        if (!this.wasInBlackHolePull) {
          this.wasInBlackHolePull = true;
        }

        // Sound: update black hole proximity
        const proximity = 1 - (bhDist / this.blackHole.pullRadius);
        soundManager.updateBlackHoleProximity(proximity);

        // Emit particles being sucked in
        if (Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const dist = this.blackHole.radius + Math.random() * 100;
          this.state.particles.push({
            x: this.blackHole.x + Math.cos(angle) * dist,
            y: this.blackHole.y + Math.sin(angle) * dist,
            vx: -Math.cos(angle) * 2,
            vy: -Math.sin(angle) * 2,
            life: 30,
            maxLife: 30,
            size: 2,
            color: '#8844ff',
          });
        }

        // Check if crossed event horizon
        if (bhDist < this.blackHole.eventHorizon) {
          this.shipBeingSucked = true;
          this.suckProgress = 0;
          soundManager.playBlackHoleSuck();
        }
      } else {
        // Far from black hole - silence it
        soundManager.updateBlackHoleProximity(0);

        // Escaped the pull radius - count as close call
        if (this.wasInBlackHolePull) {
          this.wasInBlackHolePull = false;
          this.blackHoleCloseCallCount++;

          // Black hole escape achievements
          if (this.blackHoleCloseCallCount >= 3) this.tryUnlockAchievement('black_hole_3');
          if (this.blackHoleCloseCallCount >= 5) this.tryUnlockAchievement('black_hole_5');
          if (this.blackHoleCloseCallCount >= 10) this.tryUnlockAchievement('black_hole_10');

          // Trigger black hole whispers at milestones
          if (this.blackHoleCloseCallCount >= 10 && this.lastBlackHoleWhisperCount < 10) {
            this.lastBlackHoleWhisperCount = 10;
            soundManager.playBlackHoleWhisper(3);
          } else if (this.blackHoleCloseCallCount >= 5 && this.lastBlackHoleWhisperCount < 5) {
            this.lastBlackHoleWhisperCount = 5;
            soundManager.playBlackHoleWhisper(2);
          } else if (this.blackHoleCloseCallCount >= 3 && this.lastBlackHoleWhisperCount < 3) {
            this.lastBlackHoleWhisperCount = 3;
            soundManager.playBlackHoleWhisper(1);
          }
        }
      }
    } else {
      // Ship is being sucked in - animate and then rick roll
      this.suckProgress += 0.02 * this.dt;
      const bhDx = this.blackHole.x - ship.x;
      const bhDy = this.blackHole.y - ship.y;
      const bhDist = Math.sqrt(bhDx * bhDx + bhDy * bhDy);
      ship.x += bhDx * 0.1 * this.dt;
      ship.y += bhDy * 0.1 * this.dt;
      ship.rotation += 0.3 * this.dt; // Spin while being sucked

      if (this.suckProgress >= 1 || bhDist < 5) {
        // Notify about black hole death
        this.onBlackHoleDeath?.();
        // Rick roll time!
        window.open('https://www.youtube.com/watch?v=oHg5SJYRHA0', '_blank');
        // Reset ship position
        this.shipBeingSucked = false;
        ship.x = WORLD_SIZE / 2;
        ship.y = WORLD_SIZE - 400;
        ship.vx = 0;
        ship.vy = 0;
        ship.rotation = -Math.PI / 2;
      }
    }

    // All weapons fire with X key (only one weapon can be equipped at a time)
    if (this.keys.has('x') && !this.shipBeingSucked && !this.nukeCinematic) {
      if (this.shipEffects.nuclearBombEquipped) {
        this.fireNuclearBomb();
      } else if (this.shipEffects.spaceRifleEquipped) {
        this.fireProjectile();
      } else if (this.shipEffects.plasmaCanonEquipped) {
        this.firePlasma();
      } else if (this.shipEffects.rocketLauncherEquipped) {
        this.fireRocket();
      }
      // Space TNT (destroyCanonEquipped) is handled in handleLandedControls when landed
    }

    // Warp home with H key (requires Warp Drive upgrade)
    if (this.keys.has('h') && this.shipEffects.hasWarpDrive && !this.shipBeingSucked && !this.isLanded) {
      this.keys.delete('h'); // Consume key
      this.startWarpHomeAnimation();
    }

    // Mission Control Portal - auto-teleport when ship enters any player's portal
    if (!this.shipBeingSucked && !this.isLanded && !this.isPortalTeleporting && !this.isWarping) {
      const allPortals = this.getAllPortalPositions();
      for (const portal of allPortals) {
        const dist = Math.sqrt((ship.x - portal.x) ** 2 + (ship.y - portal.y) ** 2);
        if (dist < 40) { // Enter portal to teleport (smaller radius for actual entry)
          this.startPortalTeleportAnimation();
          break;
        }
      }
    }

    // Update projectiles (movement, collision, damage)
    this.updateProjectiles();
    this.updatePlasmaProjectiles();
    this.updateRockets();

    // Update remote projectiles and destroy animations (visual only)
    this.updateRemoteProjectiles();
    this.updateRemoteDestroyAnimations();

    // World bounds (wrap around like classic arcade games)
    const wrapMargin = 50;
    if (ship.x < -wrapMargin) { ship.x = WORLD_SIZE + wrapMargin; }
    if (ship.x > WORLD_SIZE + wrapMargin) { ship.x = -wrapMargin; }
    if (ship.y < -wrapMargin) { ship.y = WORLD_SIZE + wrapMargin; }
    if (ship.y > WORLD_SIZE + wrapMargin) { ship.y = -wrapMargin; }

    this.updateCamera();
    this.updateParticles();
    this.updateUpgradeSatellites();
    this.updateCompanionPositions();
    this.updateEggPositions();
    this.updateOtherPlayersInterpolation();
    this.updateOtherPlayerCompanions();
    this.updateOtherPlayersParticles();
    this.updateZoneTitle();
    this.updateShootingStars();
    this.updateIdleEffect();
    this.updatePassiveAchievements();
    this.updateSpaceWhale();
    this.updateNeonNomad();
    this.updateHatchery();
    if (this.konamiEffectTimer > 0) {
      this.konamiEffectTimer -= this.dt;
      if (this.konamiEffectTimer <= 0) {
        this.konamiActivated = false;
      }
    }

    // Check nearby and docking
    this.state.dockingPlanet = null;
    this.state.nearbyPlanet = null;

    // Find closest planet within info range
    let closestDist = Infinity;
    let closestPlanet: Planet | null = null;

    for (const planet of planets) {
      const dist = Math.sqrt((ship.x - planet.x) ** 2 + (ship.y - planet.y) ** 2);
      if (dist < planet.radius + PLANET_INFO_DISTANCE && dist < closestDist) {
        closestDist = dist;
        closestPlanet = planet;
      }
    }

    if (closestPlanet) {
      this.state.nearbyPlanet = closestPlanet;

      // F key to pin/unpin Notion planets assigned to current user (works at full info range)
      if (this.keys.has('f') && closestPlanet.id.startsWith('notion-') && closestPlanet.ownerId === this.currentUser && this.onFeatureToggle) {
        this.keys.delete('f');
        this.onFeatureToggle(closestPlanet);
      }

      // N key to open Notion URL directly without landing
      if (this.keys.has('n') && closestPlanet.notionUrl && this.onOpenNotion) {
        this.keys.delete('n');
        this.onOpenNotion(closestPlanet.notionUrl);
      }

      // Check if close enough to dock (and not completed)
      // Also check ownership: can interact with shared planets (ownerId null) or own planets
      // User planets can always be landed on (for viewing other players' planets)
      // Notion planets owned by others can be landed on for viewing (but not completing)
      const isUserPlanetType = closestPlanet.id.startsWith('user-planet-');
      const isNotionPlanetType = closestPlanet.id.startsWith('notion-');
      const isOwnedByCurrentUser = closestPlanet.ownerId === null ||
                                   closestPlanet.ownerId === undefined ||
                                   closestPlanet.ownerId === this.currentUser;
      const canInteract = isUserPlanetType || isOwnedByCurrentUser || isNotionPlanetType;

      // Allow landing on: uncompleted planets OR completed Notion planets (to destroy them)
      const isNotionPlanet = closestPlanet.id.startsWith('notion-');
      const canLand = !closestPlanet.completed || (closestPlanet.completed && isNotionPlanet);
      if (canLand && closestDist < closestPlanet.radius + DOCKING_DISTANCE && canInteract) {
        this.state.dockingPlanet = closestPlanet;
        if (this.keys.has(' ') && !this.isLanding) {
          this.keys.delete(' ');
          this.startLandingAnimation(closestPlanet);
        }
      }

      // Shop approach — fire once when entering docking range
      if (closestPlanet.id === 'shop-station' && closestDist < closestPlanet.radius + DOCKING_DISTANCE) {
        if (!this.shopApproachFired && this.onShopApproach) {
          this.shopApproachFired = true;
          this.onShopApproach();
        }
      } else if (closestPlanet.id !== 'shop-station') {
        this.shopApproachFired = false;
      }

      // Shop/station proximity sound
      const isStation = closestPlanet.id === 'shop-station' || closestPlanet.id === 'planet-builder' || closestPlanet.id === 'control-hub' || closestPlanet.id.startsWith('user-planet-');
      if (isStation) {
        const maxDist = closestPlanet.radius + PLANET_INFO_DISTANCE;
        const proximity = Math.max(0, 1 - (closestDist - closestPlanet.radius) / (maxDist - closestPlanet.radius));
        soundManager.updateShopProximity(proximity);
      } else {
        soundManager.updateShopProximity(0);
        this.shopApproachFired = false;
      }
    } else {
      soundManager.updateShopProximity(0);
    }

    // "NEW" planet proximity marking — instantly mark as seen within 100px
    for (const planet of planets) {
      if (!planet.isNew || planet.completed || this.seenPlanetIds.has(planet.id)) continue;
      const dx = ship.x - planet.x;
      const dy = ship.y - planet.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < planet.radius + 100) {
        this.seenPlanetIds.add(planet.id);
        planet.isNew = false;
        this.onMarkSeen?.(planet.id, this.currentUser);
      }
    }

    // Upgrade proximity sound - fade based on distance to upgrade target
    if (this.isUpgrading) {
      let targetX: number, targetY: number;
      if (this.upgradeTargetPlanetId) {
        const targetPlanet = this.state.planets.find(p => p.id === this.upgradeTargetPlanetId);
        if (targetPlanet) {
          targetX = targetPlanet.x;
          targetY = targetPlanet.y;
        } else {
          targetX = this.state.ship.x;
          targetY = this.state.ship.y;
        }
      } else {
        // Upgrading ship itself - always at full volume
        soundManager.updateUpgradeProximity(1);
        return;
      }

      const dx = this.state.ship.x - targetX;
      const dy = this.state.ship.y - targetY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 500; // Fade out over 500 pixels
      const proximity = Math.max(0, 1 - dist / maxDist);
      soundManager.updateUpgradeProximity(proximity);
    }
  }

  private startLandingAnimation(planet: Planet) {
    this.isLanding = true;
    this.landingProgress = 0;
    this.landingPlanet = planet;

    const ship = this.state.ship;
    const orbitRadius = planet.radius + 80;

    // Calculate starting angle relative to planet center
    const dx = ship.x - planet.x;
    const dy = ship.y - planet.y;
    const startAngle = Math.atan2(dy, dx);

    // Landing is at the top of the planet (angle = -π/2)
    const landAngle = -Math.PI / 2;

    // Calculate orbit arc - go counter-clockwise and do at least 270° for drama
    let arcLength = landAngle - startAngle;
    // Normalize to counter-clockwise direction (negative = counter-clockwise)
    while (arcLength > 0) arcLength -= Math.PI * 2;
    while (arcLength < -Math.PI * 2) arcLength += Math.PI * 2;
    // Ensure minimum 270° arc for a satisfying orbit
    if (arcLength > -Math.PI * 1.5) {
      arcLength -= Math.PI * 2;
    }

    this.landingStartPos = {
      x: ship.x,
      y: ship.y,
      rotation: ship.rotation,
    };

    // Store orbit parameters
    (this as any).orbitStartAngle = startAngle;
    (this as any).orbitArcLength = arcLength;
    (this as any).orbitRadius = orbitRadius;

    // Stop any thrust sound
    soundManager.stopThrust();
  }

  private updateLandingAnimation() {
    if (!this.isLanding || !this.landingPlanet || !this.landingStartPos) return;

    // ~3.5 second animation at 60fps, faster with landing speed upgrades (+15% per level)
    const landingSpeedMultiplier = 1 + (this.shipEffects.landingSpeedBonus || 0) * 0.15;
    this.landingProgress += 0.005 * landingSpeedMultiplier * this.dt;
    const progress = Math.min(this.landingProgress, 1);

    const planet = this.landingPlanet;
    const orbitRadius = (this as any).orbitRadius || planet.radius + 80;
    const startAngle = (this as any).orbitStartAngle || 0;
    const arcLength = (this as any).orbitArcLength || -Math.PI * 2;
    const landAngle = -Math.PI / 2; // Top of planet
    const landingY = planet.y - planet.radius - 25;

    // Phase 1 (0-0.12): Smooth approach to orbit altitude
    // Phase 2 (0.12-0.70): Orbit around the planet from current position
    // Phase 3 (0.70-0.88): Exit orbit and retro burn descent
    // Phase 4 (0.88-1.0): Touchdown with dust

    if (progress < 0.12) {
      // Phase 1: Smooth transition to orbit - move to orbit radius while starting the arc
      const approachT = progress / 0.12;
      const easeApproach = this.easeInOutQuad(approachT);

      // Current distance from planet
      const currentDist = Math.sqrt(
        Math.pow(this.landingStartPos.x - planet.x, 2) +
        Math.pow(this.landingStartPos.y - planet.y, 2)
      );

      // Blend from current position to orbit radius, while starting to curve
      const blendedRadius = currentDist + (orbitRadius - currentDist) * easeApproach;
      const angleProgress = approachT * 0.1; // Start 10% of the arc during approach
      const currentAngle = startAngle + arcLength * angleProgress;

      this.state.ship.x = planet.x + Math.cos(currentAngle) * blendedRadius;
      this.state.ship.y = planet.y + Math.sin(currentAngle) * blendedRadius;

      // Rotate to face direction of travel (tangent, counter-clockwise)
      const tangentAngle = currentAngle - Math.PI / 2;
      let rotDiff = tangentAngle - this.landingStartPos.rotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      this.state.ship.rotation = this.landingStartPos.rotation + rotDiff * easeApproach;

      // Thrust particles during approach
      if (Math.random() < 0.4) {
        this.emitOrbitTrail();
      }

    } else if (progress < 0.70) {
      // Phase 2: ORBIT - follow the arc around the planet
      const orbitT = (progress - 0.12) / 0.58;

      // Continue from 10% to 100% of the arc
      const angleProgress = 0.1 + orbitT * 0.9;
      const currentAngle = startAngle + arcLength * angleProgress;

      this.state.ship.x = planet.x + Math.cos(currentAngle) * orbitRadius;
      this.state.ship.y = planet.y + Math.sin(currentAngle) * orbitRadius;

      // Ship faces direction of travel (tangent to orbit, counter-clockwise)
      this.state.ship.rotation = currentAngle - Math.PI / 2;

      // Emit orbit trail particles
      if (Math.random() < 0.6) {
        this.emitOrbitTrail();
      }

      // Start engine sound during orbit
      if (progress > 0.13 && progress < 0.15) {
        soundManager.startThrust(false);
      }

    } else if (progress < 0.88) {
      // Phase 3: Exit orbit at top, flip and retro burn down
      const descentT = (progress - 0.70) / 0.18;
      const easeDescent = this.easeInOutQuad(descentT);

      // We're at the top of the planet (landAngle = -π/2)
      const exitX = planet.x + Math.cos(landAngle) * orbitRadius;
      const exitY = planet.y + Math.sin(landAngle) * orbitRadius;

      // Descend from orbit to landing position
      this.state.ship.x = exitX + (planet.x - exitX) * easeDescent;
      this.state.ship.y = exitY + (landingY - exitY) * easeDescent;

      // Flip to point up (engines down) for retro burn
      // Start rotation: facing left (tangent at top) = 0 or π
      // End rotation: pointing up = -π/2
      const startRot = landAngle - Math.PI / 2; // Tangent direction at top
      const endRot = -Math.PI / 2; // Pointing up
      const flipProgress = this.easeOutBack(Math.min(descentT * 1.8, 1));
      this.state.ship.rotation = startRot + (endRot - startRot + Math.PI) * flipProgress;

      // Heavy retro flames during descent
      this.emitRetroThrustFlames(0.8 - descentT * 0.3);

      // Switch to boost sound for retro burn
      if (progress > 0.71 && progress < 0.73) {
        soundManager.stopThrust();
        soundManager.startThrust(true);
      }

    } else {
      // Phase 4: Touchdown with bounce and dust
      const touchT = (progress - 0.88) / 0.12;
      const easeTouch = this.easeOutBounce(touchT);

      this.state.ship.x = planet.x;
      this.state.ship.y = landingY + (1 - easeTouch) * 8; // Slight bounce down
      this.state.ship.rotation = -Math.PI / 2; // Pointing up

      // Stop thrust
      if (progress > 0.89 && progress < 0.91) {
        soundManager.stopThrust();
      }

      // Dust explosion on touchdown
      if (touchT < 0.25) {
        this.emitTouchdownDust();
      }
    }

    // Stop ship velocity during animation
    this.state.ship.vx = 0;
    this.state.ship.vy = 0;

    // Animation complete
    if (this.landingProgress >= 1.05) {
      setTimeout(() => {
        if (this.landingPlanet) {
          soundManager.playDockingSound();

          // Set landed state (player is now on planet)
          this.isLanded = true;
          this.landedPlanet = this.landingPlanet;

          // If landing on nomad merchant, set flag so ship follows it
          if (this.landingPlanet.id === '__nomad__') {
            this.landedOnNomad = true;
          }
          // If landing on hatchery, set flag so ship follows it
          if (this.landingPlanet.id === '__hatchery__') {
            this.landedOnHatchery = true;
          }

          // Call onLand callback if set
          if (this.onLand) {
            this.onLand(this.landingPlanet);
          } else {
            // Fallback to old behavior if no landing callbacks set
            this.onDock(this.landingPlanet);
            this.isLanded = false;
            this.landedPlanet = null;
          }
        }
        this.isLanding = false;
        this.landingPlanet = null;
        this.landingStartPos = null;
        this.landingProgress = 0;
        // Clean up orbit params
        delete (this as any).orbitStartAngle;
        delete (this as any).orbitArcLength;
        delete (this as any).orbitRadius;
      }, 100);
    }
  }

  private updateLandedState() {
    if (!this.isLanded || !this.landedPlanet) return;

    const planet = this.landedPlanet;

    // Keep ship positioned on planet
    this.state.ship.x = planet.x;
    this.state.ship.y = planet.y - planet.radius - 25;
    this.state.ship.vx = 0;
    this.state.ship.vy = 0;
    this.state.ship.rotation = -Math.PI / 2; // Pointing up

    // When React modal handles the landed UI, skip all keyboard handling
    if (this.suppressLandedPanel) return;

    // Handle Space key - close panel and resume normal controls
    if (this.keys.has(' ')) {
      this.keys.delete(' ');
      // Just clear landed state - normal controls will resume
      this.isLanded = false;
      this.landedPlanet = null;
      if (this.onTakeoff) {
        this.onTakeoff();
      }
      return;
    }

    // Handle C key - colonize (complete) or claim (unassigned)
    if (this.keys.has('c')) {
      this.keys.delete('c');
      // Special planets cannot be completed
      const specialPlanets = ['shop-station', 'planet-builder', 'control-hub'];
      const isSpecial = specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-');
      // Check if player can modify this planet (owns it or it's unassigned)
      const isOwnedByOther = planet.ownerId !== null &&
                             planet.ownerId !== undefined &&
                             planet.ownerId !== '' &&
                             planet.ownerId !== this.currentUser;
      if (!planet.completed && !isSpecial && !isOwnedByOther) {
        const isNotionPlanet = planet.id.startsWith('notion-');
        const isUnassigned = isNotionPlanet && (!planet.ownerId || planet.ownerId === '');

        if (isUnassigned && this.onClaimRequest) {
          // Request claim - App starts animation immediately, calls API in parallel, sets target when ready
          this.onClaimRequest(planet);
        } else if (this.onColonize) {
          // Direct complete for assigned planets
          this.onColonize(planet);
        }
      }
      return;
    }

    // Handle N key - open Notion URL
    if (this.keys.has('n')) {
      this.keys.delete('n');
      if (planet.notionUrl && this.onOpenNotion) {
        this.onOpenNotion(planet.notionUrl);
      }
      return;
    }

    // Handle R key - reassign task to another user
    if (this.keys.has('r')) {
      this.keys.delete('r');
      const isNotionPlanet = planet.id.startsWith('notion-');
      if (isNotionPlanet && !planet.completed && this.onReassignRequest) {
        this.onReassignRequest(planet);
      }
      return;
    }

    // Handle E key - edit task properties
    if (this.keys.has('e')) {
      this.keys.delete('e');
      const isNotionPlanet = planet.id.startsWith('notion-');
      if (isNotionPlanet && !planet.completed && this.onEditRequest) {
        this.onEditRequest(planet);
      }
      return;
    }

    // Handle T key - terraform (for user planets)
    if (this.keys.has('t')) {
      this.keys.delete('t');
      if (planet.id.startsWith('user-planet-') && this.onTerraform) {
        this.onTerraform(planet);
      }
      return;
    }

    // Handle X key - destroy Notion planet
    if (this.keys.has('x')) {
      this.keys.delete('x');
      const specialPlanets = ['shop-station', 'planet-builder', 'control-hub'];
      const isSpecial = specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-');
      const isNotionPlanet = planet.id.startsWith('notion-');
      const isUnassigned = isNotionPlanet && (!planet.ownerId || planet.ownerId === '');

      // Unassigned tasks can be deleted without the Destroy Canon (no points)
      if (isUnassigned && !isSpecial && isNotionPlanet && this.onDestroyPlanet) {
        this.startDestroyAnimation(planet);
        return;
      }

      // Completed Notion planets require the Destroy Canon equipped
      if (planet.completed && !isSpecial && isNotionPlanet && this.onDestroyPlanet && this.shipEffects.destroyCanonEquipped) {
        this.startDestroyAnimation(planet);
      }
      return;
    }

    // Handle F key - pin/unpin planet to HUD (own planets only)
    if (this.keys.has('f')) {
      this.keys.delete('f');
      if (planet.id.startsWith('notion-') && planet.ownerId === this.currentUser && this.onFeatureToggle) {
        this.onFeatureToggle(planet);
      }
      return;
    }
  }

  private emitOrbitTrail() {
    const { ship } = this.state;
    const trailAngle = ship.rotation + Math.PI;

    // Colorful orbit trail
    const colors = ['#00ffff', '#00aaff', '#0088ff', '#ffffff'];

    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 0.4;
      const speed = Math.random() * 1.5 + 0.5;

      this.state.particles.push({
        x: ship.x + Math.cos(trailAngle) * 18,
        y: ship.y + Math.sin(trailAngle) * 18,
        vx: Math.cos(trailAngle + spread) * speed,
        vy: Math.sin(trailAngle + spread) * speed,
        life: 35 + Math.random() * 15,
        maxLife: 50,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  private emitRetroThrustFlames(intensity: number) {
    const { ship } = this.state;
    // Flames shoot DOWN (opposite of ship nose direction, which points up)
    const flameAngle = ship.rotation + Math.PI; // Down toward planet

    // More particles = more intense flames during heavy braking
    const particleCount = Math.floor(4 + intensity * 6);
    const flameIntensity = 0.5 + (1 - intensity) * 0.5; // Stronger at start

    for (let i = 0; i < particleCount; i++) {
      const spread = (Math.random() - 0.5) * 1.0;
      const speed = (Math.random() * 4 + 3) * flameIntensity;

      // Fire colors - white core, orange/red outer
      const colors = ['#ffffff', '#ffff88', '#ffaa00', '#ff6600', '#ff3300'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      this.state.particles.push({
        x: ship.x + Math.cos(flameAngle) * 20,
        y: ship.y + Math.sin(flameAngle) * 20,
        vx: Math.cos(flameAngle + spread) * speed,
        vy: Math.sin(flameAngle + spread) * speed,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        size: Math.random() * 6 + 3,
        color,
      });
    }

    // Add some smoke/exhaust
    if (Math.random() < 0.4) {
      const smokeAngle = flameAngle + (Math.random() - 0.5) * 0.8;
      this.state.particles.push({
        x: ship.x + Math.cos(flameAngle) * 25,
        y: ship.y + Math.sin(flameAngle) * 25,
        vx: Math.cos(smokeAngle) * 1.5,
        vy: Math.sin(smokeAngle) * 1.5,
        life: 40 + Math.random() * 20,
        maxLife: 60,
        size: Math.random() * 8 + 4,
        color: '#888888',
      });
    }
  }

  private emitTouchdownDust() {
    const { ship } = this.state;

    // Dust spreads outward from landing point
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const speed = Math.random() * 3 + 2;

      // Dust colors - browns and grays
      const colors = ['#aa8866', '#997755', '#888888', '#776655', '#665544'];

      this.state.particles.push({
        x: ship.x + Math.cos(angle) * 15,
        y: ship.y + 20, // At the bottom of the ship
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.3 + Math.random(), // Mostly horizontal spread
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Public method to start claim animation immediately (called when user presses C)
  // Animation starts with charging phase while API call happens in parallel
  public startClaimAnimation(planet: Planet) {
    const { ship } = this.state;

    // FREEZE all starting values immediately - these won't change during animation
    // Store exact ship position
    this.claimShipStartX = ship.x;
    this.claimShipStartY = ship.y;
    // Store planet radius (frozen - won't use planet.radius during animation)
    this.claimPlanetRadius = planet.radius;
    // Calculate planet center from ship position (ship is above planet)
    this.claimStartX = ship.x;
    this.claimStartY = ship.y + planet.radius + 25;

    console.log('[ClaimStart] Planet:', planet.id, 'Ship at:', ship.x, ship.y, 'Planet at:', planet.x, planet.y, 'Captured start:', this.claimStartX, this.claimStartY);

    // Clear landed state so claim animation takes priority in update loop
    this.isLanded = false;
    this.landedPlanet = null;

    this.isClaiming = true;
    this.claimProgress = 0;
    this.claimPlanet = planet;
    this.claimParticles = [];
    this.claimTrailPoints = [];
    this.claimTargetReady = false; // Target not known yet, API is being called
    this.claimPendingPlanet = null; // Clear any stale pending data

    // Temporary target (will be updated when API returns)
    // Use player zone center as fallback
    const playerZone = ZONES.find(z => z.ownerId === this.currentUser);
    if (playerZone) {
      this.claimTargetX = playerZone.centerX;
      this.claimTargetY = playerZone.centerY;
    } else {
      this.claimTargetX = CENTER_X;
      this.claimTargetY = CENTER_Y;
    }

    // Clear landed state
    this.isLanded = false;
    this.landedPlanet = null;

    // Play a sound
    soundManager.playDockingSound();
  }

  // Public method to set the actual target position when API returns
  // Called by App.tsx after claim API succeeds
  public setClaimTarget(targetX: number, targetY: number) {
    if (!this.isClaiming) return;

    console.log('[ClaimTarget] API returned target:', targetX, targetY);
    this.claimTargetX = targetX;
    this.claimTargetY = targetY;
    this.claimTargetReady = true;
  }

  // Public method to cancel claim animation (if API fails)
  public cancelClaimAnimation() {
    if (!this.isClaiming) return;

    this.isClaiming = false;
    this.claimProgress = 0;
    this.claimPlanet = null;
    this.claimParticles = [];
    this.claimTrailPoints = [];
    this.claimTargetReady = false;
    this.claimPendingPlanet = null;
  }

  // Public method to start send/reassign animation (rocket pushing planet)
  public startSendAnimation(planet: Planet) {
    this.sendPlanetId = planet.id;
    this.sendTargetReady = false;
    this.sendTrailPoints = [];
    this.sendRocketFlame = 0;
    this.sendPendingPlanet = null;
    this.sendRealPlanetId = null;

    // Start flying immediately in a random direction
    const randomAngle = Math.random() * Math.PI * 2;
    const speed = 18; // Fast delivery ships
    this.sendVelocityX = Math.cos(randomAngle) * speed;
    this.sendVelocityY = Math.sin(randomAngle) * speed;

    // Clear landed state
    this.isLanded = false;
    this.landedPlanet = null;

    this.isSending = true;
  }

  // Create a temporary planet at ship position and animate it toward a player's zone
  // Target is set when the real planet arrives via realtime sync (smooth redirect, no teleport)
  // assignedTo: player name, empty string for unassigned, undefined defaults to current user
  public startNewTaskSendAnimation(taskName: string, taskType: string, priority: string, assignedTo?: string): { vx: number; vy: number } | null {
    const { ship } = this.state;
    const owner = assignedTo === undefined ? this.currentUser : (assignedTo || null);

    // Determine color based on task type
    const typeColors: Record<string, { color: string; glowColor: string }> = {
      bug: { color: '#ff6b6b', glowColor: '#ff4444' },
      feature: { color: '#4ecdc4', glowColor: '#00bfae' },
      task: { color: '#fbbf24', glowColor: '#f59e0b' },
    };
    const colors = typeColors[taskType] || typeColors.task;

    // Determine radius based on priority
    let radius = 40;
    let size: 'small' | 'medium' | 'big' = 'medium';
    if (priority === 'critical') { radius = 55; size = 'big'; }
    else if (priority === 'high') { radius = 45; size = 'medium'; }
    else if (priority === 'low') { radius = 32; size = 'small'; }

    // Create temporary planet at ship position
    const tempPlanet: Planet = {
      id: `temp-new-task-${Date.now()}`,
      name: taskName,
      x: ship.x,
      y: ship.y,
      radius,
      color: colors.color,
      glowColor: colors.glowColor,
      completed: false,
      type: 'notion',
      size,
      ownerId: owner,
      taskType,
      priority,
    };

    this.state.planets.push(tempPlanet);

    // Snapshot existing notion planet IDs so we can identify new ones during animation
    this.sendKnownPlanetIds = new Set(
      this.state.planets.filter(p => p.id.startsWith('notion-')).map(p => p.id)
    );

    // Start send animation — flies in random direction until real planet arrives via sync
    this.startSendAnimation(tempPlanet);

    return this.getSendVelocity();
  }

  // Public method to set target position when API returns
  public setSendTarget(targetX: number, targetY: number, realPlanetId?: string) {
    if (!this.isSending) return;
    this.sendTargetX = targetX;
    this.sendTargetY = targetY;
    this.sendTargetReady = true;
    if (realPlanetId) {
      this.sendRealPlanetId = realPlanetId;
    }
  }

  // Get the current send velocity (so App.tsx can broadcast it after startSendAnimation)
  public getSendVelocity(): { vx: number; vy: number } | null {
    if (!this.isSending) return null;
    return { vx: this.sendVelocityX, vy: this.sendVelocityY };
  }

  // Start a remote send animation (another player pushing a planet)
  public startRemoteSendAnimation(playerId: string, planetId: string, velocityX: number, velocityY: number) {
    const planet = this.state.planets.find(p => p.id === planetId);
    if (!planet) {
      console.warn('[RemoteSend] Planet not found:', planetId);
      return;
    }

    this.remoteSendAnimations.set(planetId, {
      planetId,
      senderId: playerId,
      velocityX,
      velocityY,
      targetX: 0,
      targetY: 0,
      targetReady: false,
      rocketFlame: 0,
      trailPoints: [],
      frozenPlanetX: planet.x,
      frozenPlanetY: planet.y,
      startTime: Date.now(),
    });
  }

  // Set target for a remote send animation
  public setRemoteSendTarget(planetId: string, targetX: number, targetY: number) {
    const anim = this.remoteSendAnimations.get(planetId);
    if (!anim) return; // No animation for this planet — drop silently
    anim.targetX = targetX;
    anim.targetY = targetY;
    anim.targetReady = true;
  }

  // Update all remote send animations (same physics as local updateSendAnimation)
  private updateRemoteSendAnimations() {
    if (this.remoteSendAnimations.size === 0) return;

    const now = Date.now();
    const speed = 18;

    for (const [planetId, anim] of this.remoteSendAnimations) {
      // 30-second timeout
      if (now - anim.startTime > 30000) {
        this.remoteSendAnimations.delete(planetId);
        continue;
      }

      const planet = this.state.planets.find(p => p.id === planetId);
      if (!planet) {
        this.remoteSendAnimations.delete(planetId);
        continue;
      }

      if (anim.targetReady) {
        // Steer toward target
        const dx = anim.targetX - planet.x;
        const dy = anim.targetY - planet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 50) {
          // Arrived — remove animation, let Supabase realtime deliver final position
          this.remoteSendAnimations.delete(planetId);
          continue;
        }

        // Smoothly turn toward target (steering behavior)
        const targetAngle = Math.atan2(dy, dx);
        const currentAngle = Math.atan2(anim.velocityY, anim.velocityX);
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurn = 0.05 * this.dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        const newAngle = currentAngle + turn;
        anim.velocityX = Math.cos(newAngle) * speed;
        anim.velocityY = Math.sin(newAngle) * speed;
      }

      // Move the planet
      planet.x += anim.velocityX * this.dt;
      planet.y += anim.velocityY * this.dt;

      // Rocket flame flicker
      anim.rocketFlame = 0.7 + Math.random() * 0.3;

      // Add trail points (rocket exhaust)
      const angle = Math.atan2(anim.velocityY, anim.velocityX);
      if (Math.random() < 0.6) {
        anim.trailPoints.push({
          x: planet.x - Math.cos(angle) * (planet.radius + 20) + (Math.random() - 0.5) * 10,
          y: planet.y - Math.sin(angle) * (planet.radius + 20) + (Math.random() - 0.5) * 10,
          size: 6 + Math.random() * 10,
          alpha: 1,
        });
      }

      // Update trail points (fade out)
      for (let i = anim.trailPoints.length - 1; i >= 0; i--) {
        const p = anim.trailPoints[i];
        p.alpha -= 0.03 * this.dt;
        p.size *= Math.pow(0.94, this.dt);
        if (p.alpha <= 0 || p.size < 1) {
          anim.trailPoints.splice(i, 1);
        }
      }
    }
  }

  // Render all remote send animations (same visuals as local renderSendAnimation)
  private renderRemoteSendAnimations() {
    if (this.remoteSendAnimations.size === 0) return;

    const { ctx } = this;

    for (const [planetId, anim] of this.remoteSendAnimations) {
      const planet = this.state.planets.find(p => p.id === planetId);
      if (!planet) continue;

      ctx.save();
      ctx.translate(-this.state.camera.x, -this.state.camera.y);

      // Draw trail points (rocket exhaust smoke)
      for (const p of anim.trailPoints) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, `rgba(255, 200, 50, ${p.alpha * 0.8})`);
        gradient.addColorStop(0.4, `rgba(255, 100, 20, ${p.alpha * 0.6})`);
        gradient.addColorStop(1, `rgba(100, 50, 20, ${p.alpha * 0.2})`);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Calculate rocket angle from velocity
      const rocketAngle = Math.atan2(anim.velocityY, anim.velocityX);

      // Draw the rocket pushing the planet
      ctx.save();
      ctx.translate(planet.x, planet.y);
      ctx.rotate(rocketAngle + Math.PI); // Rocket on the back, pushing

      const rocketX = planet.radius + 10;

      // Use sender's ship image if available, otherwise fallback
      const shipImg = this.otherPlayerImages.get(anim.senderId) || this.baseShipImage;

      if (shipImg) {
        const shipSize = 36;
        ctx.save();
        ctx.translate(rocketX - shipSize * 0.3 + shipSize / 2, 0);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(shipImg, -shipSize / 2, -shipSize / 2, shipSize, shipSize);
        ctx.restore();

        // Draw flame behind it
        const flameLength = 12 + anim.rocketFlame * 15;
        ctx.beginPath();
        ctx.moveTo(rocketX + 15, 0);
        ctx.lineTo(rocketX + 15 + flameLength, -4 - Math.random() * 2);
        ctx.lineTo(rocketX + 15 + flameLength * 0.6, 0);
        ctx.lineTo(rocketX + 15 + flameLength, 4 + Math.random() * 2);
        ctx.closePath();
        const flameGradient = ctx.createLinearGradient(rocketX + 15, 0, rocketX + 15 + flameLength, 0);
        flameGradient.addColorStop(0, '#ffff00');
        flameGradient.addColorStop(0.4, '#ff8800');
        flameGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
        ctx.fillStyle = flameGradient;
        ctx.fill();
      } else {
        // Fallback: simple triangle ship shape
        const shipSize = 16;

        const flameLength = 12 + anim.rocketFlame * 18;
        ctx.beginPath();
        ctx.moveTo(rocketX + shipSize * 0.7, 0);
        ctx.lineTo(rocketX + shipSize * 0.7 + flameLength, -4 - Math.random() * 2);
        ctx.lineTo(rocketX + shipSize * 0.7 + flameLength * 0.6, 0);
        ctx.lineTo(rocketX + shipSize * 0.7 + flameLength, 4 + Math.random() * 2);
        ctx.closePath();
        const flameGradient = ctx.createLinearGradient(rocketX + shipSize, 0, rocketX + shipSize + flameLength, 0);
        flameGradient.addColorStop(0, '#ffff00');
        flameGradient.addColorStop(0.4, '#ff8800');
        flameGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
        ctx.fillStyle = flameGradient;
        ctx.fill();

        ctx.fillStyle = '#aaaacc';
        ctx.beginPath();
        ctx.moveTo(rocketX - shipSize, 0);
        ctx.lineTo(rocketX + shipSize * 0.5, -shipSize * 0.5);
        ctx.lineTo(rocketX + shipSize * 0.5, shipSize * 0.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
      ctx.restore();
    }
  }

  // Update send/reassign animation - rocket pushing planet across map
  private updateSendAnimation() {
    if (!this.isSending || !this.sendPlanetId) return;

    // Find the planet in state
    const planet = this.state.planets.find(p => p.id === this.sendPlanetId);
    if (!planet) {
      this.isSending = false;
      this.sendRealPlanetId = null;
      this.sendKnownPlanetIds.clear();
      return;
    }

    const speed = 18; // Fast delivery ships

    if (this.sendTargetReady) {
      // Steer toward target
      const dx = this.sendTargetX - planet.x;
      const dy = this.sendTargetY - planet.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 50) {
        // Arrived! Replace with updated planet at new position
        this.isSending = false;
        this.sendRealPlanetId = null;
        this.sendKnownPlanetIds.clear();
        this.sendTrailPoints = [];
        this.state.planets = this.state.planets.filter(p => p.id !== this.sendPlanetId);

        // Add the pending planet (with updated position from DB)
        if (this.sendPendingPlanet) {
          this.state.planets.push(this.sendPendingPlanet);
          this.sendPendingPlanet = null;
        }

        this.sendPlanetId = null;
        return;
      }

      // Smoothly turn toward target (steering behavior)
      const targetAngle = Math.atan2(dy, dx);
      const currentAngle = Math.atan2(this.sendVelocityY, this.sendVelocityX);
      let angleDiff = targetAngle - currentAngle;

      // Normalize angle difference
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Gradual turn (max 3 degrees per frame)
      const maxTurn = 0.05 * this.dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
      const newAngle = currentAngle + turn;

      this.sendVelocityX = Math.cos(newAngle) * speed;
      this.sendVelocityY = Math.sin(newAngle) * speed;
    }

    // Move the planet
    planet.x += this.sendVelocityX * this.dt;
    planet.y += this.sendVelocityY * this.dt;

    // Rocket flame flicker
    this.sendRocketFlame = 0.7 + Math.random() * 0.3;

    // Add trail points (rocket exhaust)
    const angle = Math.atan2(this.sendVelocityY, this.sendVelocityX);
    if (Math.random() < 0.6) {
      const spread = (Math.random() - 0.5) * 0.5;
      this.sendTrailPoints.push({
        x: planet.x - Math.cos(angle) * (planet.radius + 20) + (Math.random() - 0.5) * 10,
        y: planet.y - Math.sin(angle) * (planet.radius + 20) + (Math.random() - 0.5) * 10,
        size: 6 + Math.random() * 10,
        alpha: 1,
      });
    }

    // Update trail points (fade out)
    for (let i = this.sendTrailPoints.length - 1; i >= 0; i--) {
      const p = this.sendTrailPoints[i];
      p.alpha -= 0.03 * this.dt;
      p.size *= Math.pow(0.94, this.dt);
      if (p.alpha <= 0 || p.size < 1) {
        this.sendTrailPoints.splice(i, 1);
      }
    }
  }

  // Render send/reassign animation effects (just the rocket, planet renders normally)
  private renderSendAnimation() {
    if (!this.isSending || !this.sendPlanetId) return;

    const planet = this.state.planets.find(p => p.id === this.sendPlanetId);
    if (!planet) return;

    const { ctx } = this;

    ctx.save();
    ctx.translate(-this.state.camera.x, -this.state.camera.y);

    // Draw trail points (rocket exhaust smoke)
    for (const p of this.sendTrailPoints) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      gradient.addColorStop(0, `rgba(255, 200, 50, ${p.alpha * 0.8})`);
      gradient.addColorStop(0.4, `rgba(255, 100, 20, ${p.alpha * 0.6})`);
      gradient.addColorStop(1, `rgba(100, 50, 20, ${p.alpha * 0.2})`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Calculate rocket angle from velocity
    const rocketAngle = Math.atan2(this.sendVelocityY, this.sendVelocityX);

    // Draw the rocket pushing the planet
    ctx.save();
    ctx.translate(planet.x, planet.y);
    ctx.rotate(rocketAngle + Math.PI); // Rocket on the back, pushing

    const rocketX = planet.radius + 10;

    if (this.shipImage) {
      // Draw mini version of the player's current ship
      // Ship image points up by default, rotate -90° so it faces the push direction (left)
      const shipSize = 36;
      ctx.save();
      ctx.translate(rocketX - shipSize * 0.3 + shipSize / 2, 0);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(
        this.shipImage,
        -shipSize / 2,
        -shipSize / 2,
        shipSize,
        shipSize
      );
      ctx.restore();

      // Draw flame behind it
      const flameLength = 12 + this.sendRocketFlame * 15;
      ctx.beginPath();
      ctx.moveTo(rocketX + 15, 0);
      ctx.lineTo(rocketX + 15 + flameLength, -4 - Math.random() * 2);
      ctx.lineTo(rocketX + 15 + flameLength * 0.6, 0);
      ctx.lineTo(rocketX + 15 + flameLength, 4 + Math.random() * 2);
      ctx.closePath();
      const flameGradient = ctx.createLinearGradient(rocketX + 15, 0, rocketX + 15 + flameLength, 0);
      flameGradient.addColorStop(0, '#ffff00');
      flameGradient.addColorStop(0.4, '#ff8800');
      flameGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = flameGradient;
      ctx.fill();
    } else {
      // Fallback: simple triangle ship shape
      const shipSize = 16;

      // Flame
      const flameLength = 12 + this.sendRocketFlame * 18;
      ctx.beginPath();
      ctx.moveTo(rocketX + shipSize * 0.7, 0);
      ctx.lineTo(rocketX + shipSize * 0.7 + flameLength, -4 - Math.random() * 2);
      ctx.lineTo(rocketX + shipSize * 0.7 + flameLength * 0.6, 0);
      ctx.lineTo(rocketX + shipSize * 0.7 + flameLength, 4 + Math.random() * 2);
      ctx.closePath();
      const flameGradient = ctx.createLinearGradient(rocketX + shipSize, 0, rocketX + shipSize + flameLength, 0);
      flameGradient.addColorStop(0, '#ffff00');
      flameGradient.addColorStop(0.4, '#ff8800');
      flameGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = flameGradient;
      ctx.fill();

      // Simple ship body
      ctx.fillStyle = '#aaaacc';
      ctx.beginPath();
      ctx.moveTo(rocketX - shipSize, 0);
      ctx.lineTo(rocketX + shipSize * 0.5, -shipSize * 0.5);
      ctx.lineTo(rocketX + shipSize * 0.5, shipSize * 0.5);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }

  // Update claim animation - teleport ship + planet together to home base
  private updateClaimAnimation() {
    if (!this.isClaiming || !this.claimPlanet) return;

    const planet = this.claimPlanet;
    const { ship } = this.state;


    // Phase timings (adjusted for longer charging that waits for API)
    // Phase 1 (0-0.25): Charging - energy gathers, can extend if waiting for API
    // Phase 2 (0.25-0.35): Warp flash initiation (only starts when target is ready)
    // Phase 3 (0.35-0.85): Teleport movement - ship+planet fly together
    // Phase 4 (0.85-1.0): Arrival flash at destination

    const CHARGING_END = 0.25;

    // Use FROZEN values from when animation started (immune to realtime updates)
    const startX = this.claimStartX;
    const startY = this.claimStartY;
    const shipStartX = this.claimShipStartX;
    const shipStartY = this.claimShipStartY;
    const radius = this.claimPlanetRadius;

    // Only advance past charging phase if target is ready
    if (this.claimProgress < CHARGING_END || !this.claimTargetReady) {
      // Charging phase - keep progressing up to CHARGING_END, then hold
      if (this.claimProgress < CHARGING_END) {
        this.claimProgress += 0.012 * this.dt; // Slower charging for more dramatic effect
      }
      // If we hit the end but target isn't ready, clamp progress and keep charging effects
      if (this.claimProgress >= CHARGING_END && !this.claimTargetReady) {
        this.claimProgress = CHARGING_END - 0.001; // Hold just before transition
      }

      // Phase 1: Charging - ship AND planet stay at EXACT frozen start position
      ship.x = shipStartX;
      ship.y = shipStartY;
      ship.vx = 0;
      ship.vy = 0;
      ship.rotation = -Math.PI / 2;
      // CRITICAL: Force planet to stay at original position (immune to sync updates)
      planet.x = startX;
      planet.y = startY;

      // Emit charging particles converging on ORIGINAL planet location
      const chargeIntensity = Math.min(1, this.claimProgress / CHARGING_END);
      if (Math.random() < 0.4 + chargeIntensity * 0.3) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 150 + Math.random() * 100;
        const particleTargetX = startX + (Math.random() - 0.5) * radius;
        const particleTargetY = startY + (Math.random() - 0.5) * radius;
        const particleStartX = particleTargetX + Math.cos(angle) * dist;
        const particleStartY = particleTargetY + Math.sin(angle) * dist;
        this.claimParticles.push({
          x: particleStartX,
          y: particleStartY,
          vx: (particleTargetX - particleStartX) * (0.06 + chargeIntensity * 0.04),
          vy: (particleTargetY - particleStartY) * (0.06 + chargeIntensity * 0.04),
          life: 18,
          color: '#00ffff',
          size: 2 + Math.random() * 3,
        });
      }
    } else {
      // Target is ready, continue with rest of animation
      this.claimProgress += 0.018 * this.dt; // Slightly faster for the action phases
    }

    // Phase 2: Warp flash (0.25-0.35) - still at ORIGINAL location
    if (this.claimProgress >= 0.25 && this.claimProgress < 0.35) {
      // Keep ship AND planet at exact frozen start position
      ship.x = shipStartX;
      ship.y = shipStartY;
      ship.vx = 0;
      ship.vy = 0;
      // CRITICAL: Force planet to stay at original position (immune to sync updates)
      planet.x = startX;
      planet.y = startY;

      // Emit bright flash particles from ORIGINAL location
      if (this.claimProgress < 0.32) {
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          this.claimParticles.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * (1 + Math.random() * 2),
            vy: Math.sin(angle) * (1 + Math.random() * 2),
            life: 20,
            color: Math.random() < 0.5 ? '#ffffff' : '#00ffff',
            size: 4 + Math.random() * 4,
          });
        }
      }
    }

    // Phase 3: Teleport movement (0.35-0.85)
    if (this.claimProgress >= 0.35 && this.claimProgress < 0.85) {
      const moveProgress = (this.claimProgress - 0.35) / 0.5;
      // Use easeInOutCubic for smooth acceleration/deceleration
      const eased = moveProgress < 0.5
        ? 4 * moveProgress * moveProgress * moveProgress
        : 1 - Math.pow(-2 * moveProgress + 2, 3) / 2;

      // Interpolate position (planet center)
      const currentX = startX + (this.claimTargetX - startX) * eased;
      const currentY = startY + (this.claimTargetY - startY) * eased;

      // Update planet position (this moves the actual planet during animation)
      planet.x = currentX;
      planet.y = currentY;

      // Ship stays docked on planet (use frozen radius)
      ship.x = currentX;
      ship.y = currentY - radius - 25;
      ship.vx = 0;
      ship.vy = 0;

      // Calculate direction of travel for ship rotation
      const dx = this.claimTargetX - startX;
      const dy = this.claimTargetY - startY;
      ship.rotation = Math.atan2(dy, dx) - Math.PI / 2;

      // Add trail points
      if (Math.random() < 0.6) {
        this.claimTrailPoints.push({ x: currentX, y: currentY, alpha: 1 });
      }

      // Emit speed trail particles behind (use frozen radius)
      const trailAngle = Math.atan2(dy, dx) + Math.PI; // Opposite direction
      for (let i = 0; i < 3; i++) {
        const spread = (Math.random() - 0.5) * 0.8;
        this.claimParticles.push({
          x: currentX + Math.cos(trailAngle + spread) * (radius + 10),
          y: currentY + Math.sin(trailAngle + spread) * (radius + 10),
          vx: Math.cos(trailAngle + spread) * (2 + Math.random() * 3),
          vy: Math.sin(trailAngle + spread) * (2 + Math.random() * 3),
          life: 25 + Math.random() * 15,
          color: ['#00ffff', '#ffffff', planet.color][Math.floor(Math.random() * 3)],
          size: 2 + Math.random() * 3,
        });
      }
    }

    // Phase 4: Arrival (0.85-1.0) - planet at destination, arrival flash
    if (this.claimProgress >= 0.85) {
      planet.x = this.claimTargetX;
      planet.y = this.claimTargetY;
      ship.x = this.claimTargetX;
      ship.y = this.claimTargetY - radius - 25; // Use frozen radius
      ship.vx = 0;
      ship.vy = 0;

      // Arrival burst particles
      if (this.claimProgress < 0.92) {
        for (let i = 0; i < 8; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 4;
          this.claimParticles.push({
            x: this.claimTargetX,
            y: this.claimTargetY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 35 + Math.random() * 25,
            color: ['#ffffff', '#00ffff', '#ffff00', planet.color][Math.floor(Math.random() * 4)],
            size: 3 + Math.random() * 5,
          });
        }
      }
    }

    // Fade trail points
    for (let i = this.claimTrailPoints.length - 1; i >= 0; i--) {
      this.claimTrailPoints[i].alpha -= 0.03;
      if (this.claimTrailPoints[i].alpha <= 0) {
        this.claimTrailPoints.splice(i, 1);
      }
    }

    // Update claim particles
    for (let i = this.claimParticles.length - 1; i >= 0; i--) {
      const p = this.claimParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98; // Slight drag
      p.vy *= 0.98;
      p.life--;
      if (p.life <= 0) {
        this.claimParticles.splice(i, 1);
      }
    }

    // Animation complete
    if (this.claimProgress >= 1) {
      // If we have pending planet data (from sync during animation), apply it now
      // This updates metadata like ownerId while preserving the animated position
      if (this.claimPendingPlanet && this.claimPlanet) {
        const planetId = this.claimPlanet.id;
        const finalX = this.claimTargetX;
        const finalY = this.claimTargetY;

        // Replace old planet with new one in state.planets
        const idx = this.state.planets.findIndex(p => p.id === planetId);
        if (idx >= 0) {
          // Use the pending planet but keep the animated final position
          this.claimPendingPlanet.x = finalX;
          this.claimPendingPlanet.y = finalY;
          this.state.planets[idx] = this.claimPendingPlanet;
        }
        this.claimPendingPlanet = null;
      }

      this.isClaiming = false;
      this.claimParticles = [];
      this.claimTrailPoints = [];
      this.claimTargetReady = false;

      // Claim API was already called at animation start (via onClaimRequest)
      // No need to call onColonize here - the planet is already claimed and at its final position
      this.claimPlanet = null;
    }
  }

  // Start warp home animation (teleport ship to home planet)
  private startWarpHomeAnimation() {
    // Find home planet zone for current user
    const playerZone = ZONES.find(z => z.ownerId === this.currentUser);
    if (!playerZone) return;

    const { ship } = this.state;

    // Set start position (current ship location)
    this.warpStartX = ship.x;
    this.warpStartY = ship.y;

    // Set target position (zone center, offset to not land inside planet)
    this.warpTargetX = playerZone.centerX;
    this.warpTargetY = playerZone.centerY - 150; // Offset above planet center

    // Initialize animation state
    this.isWarping = true;
    this.warpProgress = 0;
    this.warpParticles = [];
    this.warpTrailPoints = [];

    // Play warp home sound
    soundManager.playWarpHome();
  }

  // Update warp home animation - 3 phases: charging, movement, arrival
  private updateWarpAnimation() {
    if (!this.isWarping) return;

    const { ship } = this.state;
    const CHARGING_END = 0.2;
    const MOVEMENT_END = 0.8;

    // Update particles (decay)
    this.warpParticles = this.warpParticles.filter(p => {
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;
      return p.life > 0;
    });

    // Update trail points (fade)
    this.warpTrailPoints = this.warpTrailPoints.filter(tp => {
      tp.alpha -= 0.02 * this.dt;
      return tp.alpha > 0;
    });

    // Phase 1: Charging (0 - 0.2)
    if (this.warpProgress < CHARGING_END) {
      this.warpProgress += 0.015 * this.dt;

      // Keep ship at start position during charging
      ship.x = this.warpStartX;
      ship.y = this.warpStartY;
      ship.vx = 0;
      ship.vy = 0;

      // Emit charging particles converging on ship
      const chargeIntensity = Math.min(1, this.warpProgress / CHARGING_END);
      if (Math.random() < 0.4 + chargeIntensity * 0.4) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 80;
        this.warpParticles.push({
          x: ship.x + Math.cos(angle) * dist,
          y: ship.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * (3 + chargeIntensity * 3),
          vy: -Math.sin(angle) * (3 + chargeIntensity * 3),
          life: 25,
          color: `hsl(${180 + Math.random() * 40}, 100%, ${60 + chargeIntensity * 30}%)`, // Cyan hue
          size: 2 + Math.random() * 2,
        });
      }
      return;
    }

    // Phase 2: Movement (0.2 - 0.8)
    if (this.warpProgress >= CHARGING_END && this.warpProgress < MOVEMENT_END) {
      this.warpProgress += 0.025 * this.dt;

      const moveProgress = (this.warpProgress - CHARGING_END) / (MOVEMENT_END - CHARGING_END);
      // Use easeInOutCubic for smooth acceleration/deceleration
      const eased = moveProgress < 0.5
        ? 4 * moveProgress * moveProgress * moveProgress
        : 1 - Math.pow(-2 * moveProgress + 2, 3) / 2;

      // Interpolate ship position
      ship.x = this.warpStartX + (this.warpTargetX - this.warpStartX) * eased;
      ship.y = this.warpStartY + (this.warpTargetY - this.warpStartY) * eased;
      ship.vx = 0;
      ship.vy = 0;

      // Rotate ship to face target
      const targetAngle = Math.atan2(this.warpTargetY - this.warpStartY, this.warpTargetX - this.warpStartX);
      ship.rotation = targetAngle;

      // Add trail points
      if (moveProgress > 0.1) {
        this.warpTrailPoints.push({
          x: ship.x,
          y: ship.y,
          alpha: 0.8,
        });
      }

      // Emit speed particles along trajectory
      if (Math.random() < 0.6) {
        const perpAngle = targetAngle + Math.PI / 2;
        const offset = (Math.random() - 0.5) * 30;
        this.warpParticles.push({
          x: ship.x + Math.cos(perpAngle) * offset,
          y: ship.y + Math.sin(perpAngle) * offset,
          vx: -Math.cos(targetAngle) * 2,
          vy: -Math.sin(targetAngle) * 2,
          life: 15,
          color: `hsl(${180 + Math.random() * 30}, 100%, 70%)`,
          size: 1.5 + Math.random() * 1.5,
        });
      }
      return;
    }

    // Phase 3: Arrival (0.8 - 1.0)
    if (this.warpProgress >= MOVEMENT_END) {
      this.warpProgress += 0.02 * this.dt;

      // Ship at destination
      ship.x = this.warpTargetX;
      ship.y = this.warpTargetY;
      ship.vx = 0;
      ship.vy = 0;
      ship.rotation = -Math.PI / 2; // Face up

      // Arrival burst particles
      if (this.warpProgress < 0.9) {
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 4;
          this.warpParticles.push({
            x: ship.x,
            y: ship.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 20 + Math.random() * 15,
            color: `hsl(${170 + Math.random() * 40}, 100%, ${50 + Math.random() * 30}%)`,
            size: 2 + Math.random() * 3,
          });
        }
      }
    }

    // Animation complete
    if (this.warpProgress >= 1) {
      this.isWarping = false;
      this.warpParticles = [];
      this.warpTrailPoints = [];
    }
  }

  // Render warp animation effects (rendered on top of everything)
  private renderWarpAnimation() {
    if (!this.isWarping) return;

    const { ctx, canvas } = this;
    const { ship, camera } = this.state;
    const CHARGING_END = 0.2;
    const MOVEMENT_END = 0.8;

    // Save context for screen-space effects
    ctx.save();

    // Reset transform for screen-space overlay effects
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Screen-space ship position
    const screenX = ship.x - camera.x;
    const screenY = ship.y - camera.y;

    // Phase 1: Charging - screen vignette builds up
    if (this.warpProgress < CHARGING_END) {
      const chargeIntensity = Math.min(1, this.warpProgress / CHARGING_END);

      // Cyan vignette around edges
      const vignetteGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
      );
      vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignetteGradient.addColorStop(0.5, `rgba(0, 50, 80, ${0.1 * chargeIntensity})`);
      vignetteGradient.addColorStop(1, `rgba(0, 100, 150, ${0.3 * chargeIntensity})`);
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Glow around ship (screen space)
      ctx.beginPath();
      ctx.arc(screenX, screenY, 50 + chargeIntensity * 40, 0, Math.PI * 2);
      const glowGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 50 + chargeIntensity * 40);
      glowGradient.addColorStop(0, `rgba(0, 255, 255, ${0.4 * chargeIntensity})`);
      glowGradient.addColorStop(0.5, `rgba(0, 200, 255, ${0.2 * chargeIntensity})`);
      glowGradient.addColorStop(1, 'rgba(0, 200, 255, 0)');
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Multiple pulsing rings
      for (let i = 0; i < 3; i++) {
        const ringOffset = i * 15;
        const phase = this.warpProgress * 50 + i * 2;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 35 + ringOffset + Math.sin(phase) * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, ${(0.6 - i * 0.15) * chargeIntensity})`;
        ctx.lineWidth = 3 - i * 0.5;
        ctx.stroke();
      }
    }

    // Phase 1.5: Departure flash (at transition from charging to movement)
    if (this.warpProgress >= CHARGING_END - 0.03 && this.warpProgress < CHARGING_END + 0.05) {
      const flashProgress = (this.warpProgress - (CHARGING_END - 0.03)) / 0.08;
      const flashIntensity = flashProgress < 0.5 ? flashProgress * 2 : (1 - flashProgress) * 2;

      // Full screen flash
      ctx.fillStyle = `rgba(0, 255, 255, ${0.3 * flashIntensity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Bright center flash
      ctx.beginPath();
      ctx.arc(screenX, screenY, 100 + flashIntensity * 50, 0, Math.PI * 2);
      const flashGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 100 + flashIntensity * 50);
      flashGradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * flashIntensity})`);
      flashGradient.addColorStop(0.3, `rgba(0, 255, 255, ${0.5 * flashIntensity})`);
      flashGradient.addColorStop(1, 'rgba(0, 200, 255, 0)');
      ctx.fillStyle = flashGradient;
      ctx.fill();
    }

    // Phase 2: Movement - speed lines and tunnel effect
    if (this.warpProgress >= CHARGING_END && this.warpProgress < MOVEMENT_END) {
      const moveProgress = (this.warpProgress - CHARGING_END) / (MOVEMENT_END - CHARGING_END);

      // Tunnel vignette effect
      const tunnelGradient = ctx.createRadialGradient(
        screenX, screenY, 0,
        screenX, screenY, canvas.width * 0.6
      );
      tunnelGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      tunnelGradient.addColorStop(0.4, 'rgba(0, 20, 40, 0.1)');
      tunnelGradient.addColorStop(0.7, `rgba(0, 50, 80, ${0.2 + moveProgress * 0.1})`);
      tunnelGradient.addColorStop(1, `rgba(0, 80, 120, ${0.4 + moveProgress * 0.2})`);
      ctx.fillStyle = tunnelGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Speed lines radiating from center
      const numLines = 24;
      const targetAngle = Math.atan2(this.warpTargetY - this.warpStartY, this.warpTargetX - this.warpStartX);
      for (let i = 0; i < numLines; i++) {
        const angle = (i / numLines) * Math.PI * 2;
        const lineLength = 100 + Math.random() * 200 * moveProgress;
        const startDist = 80 + Math.random() * 40;

        ctx.beginPath();
        ctx.moveTo(
          screenX + Math.cos(angle) * startDist,
          screenY + Math.sin(angle) * startDist
        );
        ctx.lineTo(
          screenX + Math.cos(angle) * (startDist + lineLength),
          screenY + Math.sin(angle) * (startDist + lineLength)
        );
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + Math.random() * 0.3})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.stroke();
      }

      // Core glow around ship
      ctx.beginPath();
      ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
      const coreGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 40);
      coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      coreGradient.addColorStop(0.3, 'rgba(0, 255, 255, 0.4)');
      coreGradient.addColorStop(1, 'rgba(0, 200, 255, 0)');
      ctx.fillStyle = coreGradient;
      ctx.fill();
    }

    // Phase 3: Arrival flash
    if (this.warpProgress >= MOVEMENT_END) {
      const arrivalProgress = (this.warpProgress - MOVEMENT_END) / (1 - MOVEMENT_END);
      const flashIntensity = 1 - arrivalProgress;

      // Screen flash at arrival
      if (arrivalProgress < 0.3) {
        ctx.fillStyle = `rgba(0, 255, 255, ${0.25 * (1 - arrivalProgress / 0.3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Multiple expanding rings
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, 40 + arrivalProgress * (80 + i * 30), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, ${(0.7 - i * 0.2) * flashIntensity})`;
        ctx.lineWidth = (4 - i) * flashIntensity;
        ctx.stroke();
      }

      // Fading glow
      ctx.beginPath();
      ctx.arc(screenX, screenY, 60 * flashIntensity, 0, Math.PI * 2);
      const arrivalGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 60 * flashIntensity);
      arrivalGradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 * flashIntensity})`);
      arrivalGradient.addColorStop(0.4, `rgba(0, 255, 255, ${0.4 * flashIntensity})`);
      arrivalGradient.addColorStop(1, 'rgba(0, 200, 255, 0)');
      ctx.fillStyle = arrivalGradient;
      ctx.fill();
    }

    // Restore context
    ctx.restore();

    // Draw warp particles (in world space, so they transform with camera)
    for (const p of this.warpParticles) {
      const alpha = p.life / 25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('hsl', 'hsla');
      ctx.fill();
    }
  }

  // Get the position of a Mission Control Portal for a given player zone owner
  private getPortalPositionForPlayer(ownerId: string): { x: number; y: number } | null {
    const playerZone = ZONES.find(z => z.ownerId === ownerId);
    if (!playerZone) return null;

    // Calculate direction from map center to player zone (outward direction toward edge)
    const dx = playerZone.centerX - CENTER_X;
    const dy = playerZone.centerY - CENTER_Y;
    const outwardAngle = Math.atan2(dy, dx);

    // Portal is 1000 units away from the home planet, toward the edge of the map
    const portalDistance = 1000;

    return {
      x: playerZone.centerX + Math.cos(outwardAngle) * portalDistance,
      y: playerZone.centerY + Math.sin(outwardAngle) * portalDistance,
    };
  }

  // Get portal position for the current player (convenience wrapper)
  private getPortalPosition(): { x: number; y: number } | null {
    if (!this.shipEffects.hasMissionControlPortal) return null;
    return this.getPortalPositionForPlayer(this.currentUser);
  }

  // Get all portal positions (local player + other players who own portals)
  private getAllPortalPositions(): { x: number; y: number; ownerId: string; color: string }[] {
    const portals: { x: number; y: number; ownerId: string; color: string }[] = [];

    // Local player's portal
    if (this.shipEffects.hasMissionControlPortal) {
      const pos = this.getPortalPositionForPlayer(this.currentUser);
      const zone = ZONES.find(z => z.ownerId === this.currentUser);
      if (pos && zone) {
        portals.push({ ...pos, ownerId: this.currentUser, color: zone.color });
      }
    }

    // Other players' portals
    for (const player of this.otherPlayers) {
      if (player.shipEffects?.hasMissionControlPortal) {
        const zone = ZONES.find(z => z.ownerId === player.username);
        if (zone) {
          const pos = this.getPortalPositionForPlayer(player.username);
          if (pos) {
            portals.push({ ...pos, ownerId: player.username, color: zone.color });
          }
        }
      }
    }

    return portals;
  }

  // Start portal teleport animation (teleport ship to Mission Control)
  private startPortalTeleportAnimation() {
    // Find Mission Control zone
    const mcZone = ZONES.find(z => z.id === 'mission-control');
    if (!mcZone) return;

    const { ship } = this.state;

    // Set start position (current ship location, should be near the portal)
    this.portalStartX = ship.x;
    this.portalStartY = ship.y;

    // Set target position (Mission Control, offset above the center)
    this.portalTargetX = mcZone.centerX;
    this.portalTargetY = mcZone.centerY - 150;

    // Initialize animation state
    this.isPortalTeleporting = true;
    this.portalProgress = 0;
    this.portalParticles = [];
    this.portalTrailPoints = [];

    // Play teleport sound (teleport_02.ogg)
    soundManager.playWarpHome();
  }

  // Update portal teleport animation - 3 phases: charging, movement, arrival
  private updatePortalAnimation() {
    if (!this.isPortalTeleporting) return;

    const { ship } = this.state;
    const CHARGING_END = 0.2;
    const MOVEMENT_END = 0.8;

    // Update portal rotation for visual effect
    this.portalAngle += 0.05 * this.dt;

    // Update particles (decay)
    this.portalParticles = this.portalParticles.filter(p => {
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;
      return p.life > 0;
    });

    // Update trail points (fade)
    this.portalTrailPoints = this.portalTrailPoints.filter(tp => {
      tp.alpha -= 0.02 * this.dt;
      return tp.alpha > 0;
    });

    // Phase 1: Charging (0 - 0.2)
    if (this.portalProgress < CHARGING_END) {
      this.portalProgress += 0.015 * this.dt;

      // Keep ship at start position during charging
      ship.x = this.portalStartX;
      ship.y = this.portalStartY;
      ship.vx = 0;
      ship.vy = 0;

      // Emit charging particles converging on ship (purple/magenta hue for portal)
      const chargeIntensity = Math.min(1, this.portalProgress / CHARGING_END);
      if (Math.random() < 0.4 + chargeIntensity * 0.4) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 80;
        this.portalParticles.push({
          x: ship.x + Math.cos(angle) * dist,
          y: ship.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * (3 + chargeIntensity * 3),
          vy: -Math.sin(angle) * (3 + chargeIntensity * 3),
          life: 25,
          color: `hsl(${200 + Math.random() * 30}, 100%, ${60 + chargeIntensity * 30}%)`, // Blue/cyan hue
          size: 2 + Math.random() * 2,
        });
      }
      return;
    }

    // Phase 2: Movement (0.2 - 0.8)
    if (this.portalProgress >= CHARGING_END && this.portalProgress < MOVEMENT_END) {
      this.portalProgress += 0.025 * this.dt;

      const moveProgress = (this.portalProgress - CHARGING_END) / (MOVEMENT_END - CHARGING_END);
      // Use easeInOutCubic for smooth acceleration/deceleration
      const eased = moveProgress < 0.5
        ? 4 * moveProgress * moveProgress * moveProgress
        : 1 - Math.pow(-2 * moveProgress + 2, 3) / 2;

      // Interpolate ship position
      ship.x = this.portalStartX + (this.portalTargetX - this.portalStartX) * eased;
      ship.y = this.portalStartY + (this.portalTargetY - this.portalStartY) * eased;
      ship.vx = 0;
      ship.vy = 0;

      // Rotate ship to face target
      const targetAngle = Math.atan2(this.portalTargetY - this.portalStartY, this.portalTargetX - this.portalStartX);
      ship.rotation = targetAngle;

      // Add trail points
      if (moveProgress > 0.1) {
        this.portalTrailPoints.push({
          x: ship.x,
          y: ship.y,
          alpha: 0.8,
        });
      }

      // Emit speed particles along trajectory (blue/cyan)
      if (Math.random() < 0.6) {
        const perpAngle = targetAngle + Math.PI / 2;
        const offset = (Math.random() - 0.5) * 30;
        this.portalParticles.push({
          x: ship.x + Math.cos(perpAngle) * offset,
          y: ship.y + Math.sin(perpAngle) * offset,
          vx: -Math.cos(targetAngle) * 2,
          vy: -Math.sin(targetAngle) * 2,
          life: 15,
          color: `hsl(${200 + Math.random() * 30}, 100%, 70%)`,
          size: 1.5 + Math.random() * 1.5,
        });
      }
      return;
    }

    // Phase 3: Arrival (0.8 - 1.0)
    if (this.portalProgress >= MOVEMENT_END) {
      this.portalProgress += 0.02 * this.dt;

      // Ship at destination
      ship.x = this.portalTargetX;
      ship.y = this.portalTargetY;
      ship.vx = 0;
      ship.vy = 0;
      ship.rotation = -Math.PI / 2; // Face up

      // Arrival burst particles
      if (this.portalProgress < 0.9) {
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 4;
          this.portalParticles.push({
            x: ship.x,
            y: ship.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 20 + Math.random() * 15,
            color: `hsl(${195 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`,
            size: 2 + Math.random() * 3,
          });
        }
      }
    }

    // Animation complete
    if (this.portalProgress >= 1) {
      this.isPortalTeleporting = false;
      this.portalParticles = [];
      this.portalTrailPoints = [];
    }
  }

  // Render all Mission Control Portals (local player + other players who own one)
  private renderPortal() {
    const allPortals = this.getAllPortalPositions();
    if (allPortals.length === 0) return;

    const { ctx } = this;
    const { camera } = this.state;

    // Update portal animation angle
    this.portalAngle += 0.025;

    for (const portal of allPortals) {
      // Convert world coordinates to screen coordinates
      const x = portal.x - camera.x;
      const y = portal.y - camera.y;

      // Skip portals far off screen
      if (x < -200 || x > this.canvas.width + 200 || y < -200 || y > this.canvas.height + 200) continue;

      const isLocalPlayer = portal.ownerId === this.currentUser;

      ctx.save();

      // Large outer glow (pulsing) - bigger for visibility
      const pulseIntensity = 0.8 + Math.sin(this.portalAngle * 2) * 0.2;
      const glowRadius = 120 * pulseIntensity;
      const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      outerGlow.addColorStop(0, 'rgba(50, 180, 255, 0.6)');
      outerGlow.addColorStop(0.3, 'rgba(30, 140, 255, 0.4)');
      outerGlow.addColorStop(0.6, 'rgba(20, 100, 220, 0.2)');
      outerGlow.addColorStop(1, 'rgba(10, 60, 150, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Portal base - use image if loaded (for local player), otherwise fallback to solid color
      const baseRadius = 50;
      if (isLocalPlayer && this.portalImage) {
        const imgSize = baseRadius * 2.2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.portalAngle * 0.5);
        ctx.drawImage(this.portalImage, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
        ctx.restore();
      } else {
        const baseGradient = ctx.createRadialGradient(x - 15, y - 15, 0, x, y, baseRadius);
        baseGradient.addColorStop(0, '#60a5fa');
        baseGradient.addColorStop(0.5, '#3b82f6');
        baseGradient.addColorStop(1, '#1e40af');
        ctx.fillStyle = baseGradient;
        ctx.beginPath();
        ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Swirling energy rings on top
      for (let i = 0; i < 4; i++) {
        const ringRadius = 30 + i * 15;
        const ringAngle = this.portalAngle * (1.5 - i * 0.2);
        const ringAlpha = 0.9 - i * 0.15;

        ctx.beginPath();
        ctx.ellipse(x, y, ringRadius, ringRadius * 0.4, ringAngle, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${100 + i * 20}, ${180 + i * 20}, 255, ${ringAlpha})`;
        ctx.lineWidth = 5 - i * 0.8;
        ctx.stroke();
      }

      // Inner vortex spiral effect
      for (let i = 0; i < 4; i++) {
        const vortexRadius = 25 - i * 5;
        const vortexAngle = -this.portalAngle * 3 + i * 0.7;
        ctx.beginPath();
        ctx.ellipse(x, y, vortexRadius, vortexRadius * 0.5, vortexAngle, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(200, 240, 255, ${0.8 - i * 0.15})`;
        ctx.lineWidth = 3 - i * 0.5;
        ctx.stroke();
      }

      // Bright white center core
      const coreRadius = 20;
      const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, coreRadius);
      coreGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      coreGradient.addColorStop(0.3, 'rgba(200, 230, 255, 0.9)');
      coreGradient.addColorStop(0.7, 'rgba(150, 200, 255, 0.6)');
      coreGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Sparkle particles orbiting the portal
      for (let i = 0; i < 10; i++) {
        const sparkleAngle = this.portalAngle * 2.5 + (i / 10) * Math.PI * 2;
        const sparkleRadius = 55 + Math.sin(this.portalAngle * 4 + i) * 15;
        const sx = x + Math.cos(sparkleAngle) * sparkleRadius;
        const sy = y + Math.sin(sparkleAngle) * sparkleRadius;
        const sparkleSize = 3 + Math.sin(this.portalAngle * 5 + i * 2) * 2;

        ctx.beginPath();
        ctx.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 230, 255, ${0.8 + Math.sin(this.portalAngle * 6 + i) * 0.2})`;
        ctx.fill();
      }

      // Owner color ring at the base (so players can tell whose portal it is)
      ctx.beginPath();
      ctx.arc(x, y, baseRadius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = portal.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + Math.sin(this.portalAngle * 3) * 0.2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }

  // Render portal teleport animation effects
  private renderPortalAnimation() {
    if (!this.isPortalTeleporting) return;

    const { ctx, canvas } = this;
    const { ship, camera } = this.state;
    const CHARGING_END = 0.2;
    const MOVEMENT_END = 0.8;

    // Save context for screen-space effects
    ctx.save();

    // Reset transform for screen-space overlay effects
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Screen-space ship position
    const screenX = ship.x - camera.x;
    const screenY = ship.y - camera.y;

    // Phase 1: Charging - screen vignette builds up (blue/cyan)
    if (this.portalProgress < CHARGING_END) {
      const chargeIntensity = Math.min(1, this.portalProgress / CHARGING_END);

      // Blue vignette around edges
      const vignetteGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
      );
      vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignetteGradient.addColorStop(0.5, `rgba(0, 40, 80, ${0.1 * chargeIntensity})`);
      vignetteGradient.addColorStop(1, `rgba(0, 80, 150, ${0.3 * chargeIntensity})`);
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Glow around ship (screen space)
      ctx.beginPath();
      ctx.arc(screenX, screenY, 50 + chargeIntensity * 40, 0, Math.PI * 2);
      const glowGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 50 + chargeIntensity * 40);
      glowGradient.addColorStop(0, `rgba(100, 200, 255, ${0.4 * chargeIntensity})`);
      glowGradient.addColorStop(0.5, `rgba(50, 150, 255, ${0.2 * chargeIntensity})`);
      glowGradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Multiple pulsing rings
      for (let i = 0; i < 3; i++) {
        const ringOffset = i * 15;
        const phase = this.portalProgress * 50 + i * 2;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 35 + ringOffset + Math.sin(phase) * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100, 200, 255, ${(0.6 - i * 0.15) * chargeIntensity})`;
        ctx.lineWidth = 3 - i * 0.5;
        ctx.stroke();
      }
    }

    // Phase 1.5: Departure flash (at transition from charging to movement)
    if (this.portalProgress >= CHARGING_END - 0.03 && this.portalProgress < CHARGING_END + 0.05) {
      const flashProgress = (this.portalProgress - (CHARGING_END - 0.03)) / 0.08;
      const flashIntensity = flashProgress < 0.5 ? flashProgress * 2 : (1 - flashProgress) * 2;

      // Full screen flash (blue)
      ctx.fillStyle = `rgba(100, 180, 255, ${0.3 * flashIntensity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Bright center flash
      ctx.beginPath();
      ctx.arc(screenX, screenY, 100 + flashIntensity * 50, 0, Math.PI * 2);
      const flashGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 100 + flashIntensity * 50);
      flashGradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * flashIntensity})`);
      flashGradient.addColorStop(0.3, `rgba(100, 200, 255, ${0.5 * flashIntensity})`);
      flashGradient.addColorStop(1, 'rgba(50, 150, 200, 0)');
      ctx.fillStyle = flashGradient;
      ctx.fill();
    }

    // Phase 2: Movement - speed lines and tunnel effect
    if (this.portalProgress >= CHARGING_END && this.portalProgress < MOVEMENT_END) {
      const moveProgress = (this.portalProgress - CHARGING_END) / (MOVEMENT_END - CHARGING_END);

      // Tunnel vignette effect (blue)
      const tunnelGradient = ctx.createRadialGradient(
        screenX, screenY, 0,
        screenX, screenY, canvas.width * 0.6
      );
      tunnelGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      tunnelGradient.addColorStop(0.4, 'rgba(0, 20, 40, 0.1)');
      tunnelGradient.addColorStop(0.7, `rgba(0, 50, 100, ${0.2 + moveProgress * 0.1})`);
      tunnelGradient.addColorStop(1, `rgba(0, 80, 140, ${0.4 + moveProgress * 0.2})`);
      ctx.fillStyle = tunnelGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Speed lines radiating from center (blue)
      const numLines = 24;
      for (let i = 0; i < numLines; i++) {
        const angle = (i / numLines) * Math.PI * 2;
        const lineLength = 100 + Math.random() * 200 * moveProgress;
        const startDist = 80 + Math.random() * 40;

        ctx.beginPath();
        ctx.moveTo(
          screenX + Math.cos(angle) * startDist,
          screenY + Math.sin(angle) * startDist
        );
        ctx.lineTo(
          screenX + Math.cos(angle) * (startDist + lineLength),
          screenY + Math.sin(angle) * (startDist + lineLength)
        );
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 + Math.random() * 0.3})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.stroke();
      }

      // Core glow around ship (blue)
      ctx.beginPath();
      ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
      const coreGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 40);
      coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      coreGradient.addColorStop(0.3, 'rgba(100, 200, 255, 0.4)');
      coreGradient.addColorStop(1, 'rgba(50, 150, 200, 0)');
      ctx.fillStyle = coreGradient;
      ctx.fill();
    }

    // Phase 3: Arrival flash
    if (this.portalProgress >= MOVEMENT_END) {
      const arrivalProgress = (this.portalProgress - MOVEMENT_END) / (1 - MOVEMENT_END);
      const flashIntensity = 1 - arrivalProgress;

      // Screen flash at arrival (blue)
      if (arrivalProgress < 0.3) {
        ctx.fillStyle = `rgba(100, 180, 255, ${0.25 * (1 - arrivalProgress / 0.3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Multiple expanding rings (blue)
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, 40 + arrivalProgress * (80 + i * 30), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100, 200, 255, ${(0.7 - i * 0.2) * flashIntensity})`;
        ctx.lineWidth = (4 - i) * flashIntensity;
        ctx.stroke();
      }

      // Fading glow (blue)
      ctx.beginPath();
      ctx.arc(screenX, screenY, 60 * flashIntensity, 0, Math.PI * 2);
      const arrivalGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 60 * flashIntensity);
      arrivalGradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 * flashIntensity})`);
      arrivalGradient.addColorStop(0.4, `rgba(100, 200, 255, ${0.4 * flashIntensity})`);
      arrivalGradient.addColorStop(1, 'rgba(50, 150, 200, 0)');
      ctx.fillStyle = arrivalGradient;
      ctx.fill();
    }

    // Restore context
    ctx.restore();

    // Draw portal particles (in world space, so they transform with camera)
    for (const p of this.portalParticles) {
      const alpha = p.life / 25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('hsl', 'hsla');
      ctx.fill();
    }
  }

  // Render claim animation effects
  private renderClaimAnimation() {
    if (!this.isClaiming || !this.claimPlanet) return;

    const { ctx } = this;
    const planet = this.claimPlanet;
    const { ship } = this.state;

    ctx.save();

    // Transform to world coordinates (same as getWrappedPositions)
    ctx.translate(-this.state.camera.x, -this.state.camera.y);

    // Use FROZEN values from when animation started (immune to realtime updates)
    const startX = this.claimStartX;
    const startY = this.claimStartY;
    const radius = this.claimPlanetRadius;

    // Phase 1 (0-0.25): Charging glow around ship + planet at ORIGINAL location
    if (this.claimProgress < 0.25) {
      const chargeIntensity = Math.min(1, this.claimProgress / 0.25);

      // Glow around planet - more intense glow that builds up
      ctx.beginPath();
      const planetGlowRadius = radius + 20 + chargeIntensity * 40;
      const planetGradient = ctx.createRadialGradient(
        startX, startY, radius * 0.5,
        startX, startY, planetGlowRadius
      );
      planetGradient.addColorStop(0, `rgba(0, 255, 255, ${chargeIntensity * 0.4})`);
      planetGradient.addColorStop(0.5, `rgba(0, 255, 255, ${chargeIntensity * 0.25})`);
      planetGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.arc(startX, startY, planetGlowRadius, 0, Math.PI * 2);
      ctx.fillStyle = planetGradient;
      ctx.fill();

      // Pulsing ring around planet - faster pulse as charge builds
      const pulseSpeed = 30 + chargeIntensity * 20;
      ctx.beginPath();
      ctx.arc(startX, startY, radius + 15 + Math.sin(this.claimProgress * pulseSpeed) * 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + chargeIntensity * 0.5})`;
      ctx.lineWidth = 2 + chargeIntensity * 2;
      ctx.stroke();

      // Second ring (outer) for more dramatic effect
      if (chargeIntensity > 0.5) {
        ctx.beginPath();
        ctx.arc(startX, startY, radius + 35 + Math.sin(this.claimProgress * pulseSpeed + 1) * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, ${(chargeIntensity - 0.5) * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Phase 2 (0.25-0.35): Warp flash - bright glow before departure at ORIGINAL location
    if (this.claimProgress >= 0.25 && this.claimProgress < 0.35) {
      const flashProgress = (this.claimProgress - 0.25) / 0.1;
      const flashIntensity = flashProgress < 0.5 ? flashProgress * 2 : (1 - flashProgress) * 2;

      // Bright flash circle
      ctx.beginPath();
      ctx.arc(startX, startY, radius + 50 + flashProgress * 100, 0, Math.PI * 2);
      const flashGradient = ctx.createRadialGradient(
        startX, startY, 0,
        startX, startY, radius + 100
      );
      flashGradient.addColorStop(0, `rgba(255, 255, 255, ${flashIntensity * 0.9})`);
      flashGradient.addColorStop(0.3, `rgba(0, 255, 255, ${flashIntensity * 0.6})`);
      flashGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = flashGradient;
      ctx.fill();
    }

    // Phase 3 (0.35-0.85): Teleport movement - draw trail and warp effect
    if (this.claimProgress >= 0.35 && this.claimProgress < 0.85) {
      // Draw warp trail from start to current position
      if (this.claimTrailPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(this.claimTrailPoints[0].x, this.claimTrailPoints[0].y);
        for (let i = 1; i < this.claimTrailPoints.length; i++) {
          ctx.lineTo(this.claimTrailPoints[i].x, this.claimTrailPoints[i].y);
        }
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = planet.radius * 0.8;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Inner bright trail
        ctx.beginPath();
        ctx.moveTo(this.claimTrailPoints[0].x, this.claimTrailPoints[0].y);
        for (let i = 1; i < this.claimTrailPoints.length; i++) {
          ctx.lineTo(this.claimTrailPoints[i].x, this.claimTrailPoints[i].y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = planet.radius * 0.3;
        ctx.stroke();
      }

      // Warp glow around planet during travel
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius + 25, 0, Math.PI * 2);
      const warpGradient = ctx.createRadialGradient(
        planet.x, planet.y, planet.radius * 0.5,
        planet.x, planet.y, planet.radius + 40
      );
      warpGradient.addColorStop(0, 'rgba(0, 255, 255, 0.2)');
      warpGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = warpGradient;
      ctx.fill();

      // Speed lines effect (elongated glow in direction of travel)
      const dx = this.claimTargetX - this.claimStartX;
      const dy = this.claimTargetY - this.claimStartY;
      const travelAngle = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(planet.x, planet.y);
      ctx.rotate(travelAngle);
      ctx.beginPath();
      ctx.ellipse(0, 0, planet.radius + 60, planet.radius + 15, 0, 0, Math.PI * 2);
      const speedGradient = ctx.createRadialGradient(0, 0, planet.radius * 0.5, 0, 0, planet.radius + 60);
      speedGradient.addColorStop(0, 'rgba(0, 255, 255, 0.15)');
      speedGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = speedGradient;
      ctx.fill();
      ctx.restore();
    }

    // Phase 4 (0.85-1.0): Arrival flash at destination
    if (this.claimProgress >= 0.85) {
      const arrivalProgress = (this.claimProgress - 0.85) / 0.15;
      const flashIntensity = 1 - arrivalProgress;

      // Expanding ring
      ctx.beginPath();
      ctx.arc(this.claimTargetX, this.claimTargetY, planet.radius + arrivalProgress * 150, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 255, 255, ${flashIntensity * 0.8})`;
      ctx.lineWidth = 4 * flashIntensity;
      ctx.stroke();

      // Inner glow
      ctx.beginPath();
      ctx.arc(this.claimTargetX, this.claimTargetY, planet.radius + 30 * flashIntensity, 0, Math.PI * 2);
      const arrivalGradient = ctx.createRadialGradient(
        this.claimTargetX, this.claimTargetY, 0,
        this.claimTargetX, this.claimTargetY, planet.radius + 50
      );
      arrivalGradient.addColorStop(0, `rgba(255, 255, 255, ${flashIntensity * 0.5})`);
      arrivalGradient.addColorStop(0.5, `rgba(0, 255, 255, ${flashIntensity * 0.3})`);
      arrivalGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = arrivalGradient;
      ctx.fill();
    }

    // Draw claim particles
    for (const p of this.claimParticles) {
      const alpha = p.life / 50;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ==================== SPACE RIFLE SYSTEM ====================

  // Fire a projectile from the ship
  private fireProjectile() {
    const now = Date.now();
    if (now - this.lastShotTime < this.FIRE_COOLDOWN) return;

    this.lastShotTime = now;
    const { ship } = this.state;

    // Spawn bullet at front of ship
    const spawnDist = 25;
    const bx = ship.x + Math.cos(ship.rotation) * spawnDist;
    const by = ship.y + Math.sin(ship.rotation) * spawnDist;
    const bvx = Math.cos(ship.rotation) * this.BULLET_SPEED + ship.vx * 0.3;
    const bvy = Math.sin(ship.rotation) * this.BULLET_SPEED + ship.vy * 0.3;

    this.projectiles.push({
      x: bx,
      y: by,
      vx: bvx,
      vy: bvy,
      life: this.BULLET_RANGE / this.BULLET_SPEED,
      maxLife: this.BULLET_RANGE / this.BULLET_SPEED,
      damage: this.BULLET_DAMAGE,
      size: 4,
      color: '#ffcc00',
    });

    // Broadcast to other players
    this.onWeaponFire?.('rifle', bx, by, bvx, bvy, ship.rotation, null);

    // Muzzle flash particles
    this.emitMuzzleFlash(ship.x, ship.y, ship.rotation);

    // Play sound
    soundManager.playLaserShoot();
  }

  // Update all projectiles (movement, collision, cleanup)
  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      // Move
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;

      let bulletRemoved = false;

      // Check collision with space whale (tail slap!)
      if (this.checkWhaleProjectileHit(p.x, p.y)) {
        this.projectiles.splice(i, 1);
        bulletRemoved = true;
      }

      // Check collision with Neon Nomad (boss fight!)
      if (!bulletRemoved && this.checkNomadProjectileHit(p.x, p.y, p.damage)) {
        this.projectiles.splice(i, 1);
        bulletRemoved = true;
      }

      // Check collision with ALL planets
      if (!bulletRemoved) {
        for (const planet of this.state.planets) {
          const dx = p.x - planet.x;
          const dy = p.y - planet.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < planet.radius) {
            if (this.canDamagePlanet(planet)) {
              // Hit damageable planet - apply damage and remove bullet
              this.damagePlanet(planet, p.damage, p.x, p.y);
              this.projectiles.splice(i, 1);
              bulletRemoved = true;
              break;
            } else {
              // Hit shielded planet - bounce off
              const nx = dx / dist;
              const ny = dy / dist;

              // Push bullet out of planet
              p.x = planet.x + nx * (planet.radius + 2);
              p.y = planet.y + ny * (planet.radius + 2);

              // Reflect velocity (like ship bounce)
              const dot = p.vx * nx + p.vy * ny;
              p.vx -= 2 * dot * nx * 0.8;
              p.vy -= 2 * dot * ny * 0.8;

              // Emit shield particles
              this.emitShieldParticles(
                planet.x + nx * planet.radius,
                planet.y + ny * planet.radius,
                nx, ny, planet.color
              );

              // Play bounce sound
              soundManager.playCollision();

              // Reduce bullet life on bounce
              p.life = Math.min(p.life, 20);
              break;
            }
          }
        }
      }

      // Remove if life expired (and not already removed)
      if (!bulletRemoved && p.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  // Check if a planet can be damaged by the space rifle
  private canDamagePlanet(planet: Planet): boolean {
    // Only completed planets can be destroyed
    if (!planet.completed) return false;

    // Special planets cannot be destroyed
    const specialPlanets = ['shop-station', 'planet-builder', 'control-hub'];
    if (specialPlanets.includes(planet.id)) return false;
    if (planet.id.startsWith('user-planet-')) return false;

    // Only Notion planets can be destroyed
    if (!planet.id.startsWith('notion-')) return false;

    return true;
  }

  // Apply damage to a planet
  private damagePlanet(planet: Planet, damage: number, hitX: number, hitY: number) {
    // Initialize health if not tracked
    if (!this.planetHealth.has(planet.id)) {
      this.planetHealth.set(planet.id, this.PLANET_MAX_HEALTH);
    }

    const currentHealth = this.planetHealth.get(planet.id)!;
    const newHealth = Math.max(0, currentHealth - damage);
    this.planetHealth.set(planet.id, newHealth);

    // Update damage effects
    const effects = this.planetDamageEffects.get(planet.id) || { shakeOffset: 0, cracks: 0 };
    effects.shakeOffset = 8; // Will decay each frame in render
    effects.cracks = Math.min(5, effects.cracks + 0.5); // More cracks with more damage
    this.planetDamageEffects.set(planet.id, effects);

    // Impact particles
    this.emitImpactParticles(hitX, hitY, planet.color);

    // Sound
    soundManager.playCollision();

    // If health depleted, trigger destruction
    if (newHealth <= 0) {
      this.planetHealth.delete(planet.id);
      this.planetDamageEffects.delete(planet.id);
      this.startDestroyAnimation(planet, true); // From rifle - skip ship effects
    }
  }

  // Emit muzzle flash particles when firing
  private emitMuzzleFlash(x: number, y: number, rotation: number) {
    const colors = ['#ffcc00', '#ffaa00', '#ff8800', '#ffffff'];
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const speed = Math.random() * 4 + 2;
      this.state.particles.push({
        x: x + Math.cos(rotation) * 25,
        y: y + Math.sin(rotation) * 25,
        vx: Math.cos(rotation + spread) * speed,
        vy: Math.sin(rotation + spread) * speed,
        life: 10 + Math.random() * 5,
        maxLife: 15,
        size: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Emit impact particles when bullet hits planet
  private emitImpactParticles(x: number, y: number, planetColor: string) {
    const colors = [planetColor, '#ffffff', '#ffcc00', '#ff6600'];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 10,
        maxLife: 30,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Emit shield particles when bullet bounces off protected planet
  private emitShieldParticles(x: number, y: number, nx: number, ny: number, planetColor: string) {
    // Cyan/blue shield colors mixed with planet color
    const colors = ['#00ffff', '#44aaff', '#88ddff', '#ffffff', planetColor];
    for (let i = 0; i < 8; i++) {
      // Spread particles along the shield surface
      const perpAngle = Math.atan2(ny, nx) + Math.PI / 2;
      const spread = (Math.random() - 0.5) * 1.5;
      const outSpeed = Math.random() * 3 + 1;

      this.state.particles.push({
        x: x + Math.cos(perpAngle + spread) * 5,
        y: y + Math.sin(perpAngle + spread) * 5,
        vx: nx * outSpeed + Math.cos(perpAngle + spread) * 2,
        vy: ny * outSpeed + Math.sin(perpAngle + spread) * 2,
        life: 15 + Math.random() * 10,
        maxLife: 25,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Render all projectiles
  private renderProjectiles() {
    const { ctx } = this;
    const camera = this.state.camera;

    for (const p of this.projectiles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const alpha = Math.min(1, p.life / p.maxLife + 0.3);

      // Glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;

      // Bullet
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // Trail
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * 2, y - p.vy * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.6;
      ctx.globalAlpha = alpha * 0.5;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // Draw cracks on a damaged planet
  private drawPlanetCracks(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, crackLevel: number) {
    ctx.save();
    ctx.strokeStyle = '#331100';
    ctx.lineWidth = 2;
    ctx.globalAlpha = Math.min(0.8, crackLevel * 0.2);

    // Draw crack lines radiating from center
    const numCracks = Math.floor(crackLevel * 2);
    for (let i = 0; i < numCracks; i++) {
      const angle = (i / numCracks) * Math.PI * 2 + Math.random() * 0.3;
      const length = radius * (0.5 + Math.random() * 0.4);

      ctx.beginPath();
      ctx.moveTo(x, y);

      // Jagged line
      let cx = x, cy = y;
      const segments = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < segments; j++) {
        const segAngle = angle + (Math.random() - 0.5) * 0.5;
        const segLen = length / segments;
        cx += Math.cos(segAngle) * segLen;
        cy += Math.sin(segAngle) * segLen;
        ctx.lineTo(cx, cy);
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw the currently equipped weapon on the ship
  private drawEquippedWeapon(ctx: CanvasRenderingContext2D, shipSize: number, scale: number) {
    const weaponSize = shipSize * 0.7;
    const weaponX = shipSize * 0.25;
    const weaponY = -shipSize * 0.1;

    // Determine which weapon is equipped and get its image and glow color
    let weaponImage: HTMLImageElement | null = null;
    let glowColor = '#ffffff';

    if (this.shipEffects.spaceRifleEquipped && this.rifleImage) {
      weaponImage = this.rifleImage;
      glowColor = '#ffcc00'; // Yellow for rifle
    } else if (this.shipEffects.destroyCanonEquipped && this.canonImage) {
      weaponImage = this.canonImage;
      glowColor = '#ff6600'; // Orange for Space TNT
    } else if (this.shipEffects.plasmaCanonEquipped && this.plasmaCanonImage) {
      weaponImage = this.plasmaCanonImage;
      glowColor = '#8844ff'; // Purple for plasma
    } else if (this.shipEffects.rocketLauncherEquipped && this.rocketLauncherImage) {
      weaponImage = this.rocketLauncherImage;
      glowColor = '#ff4444'; // Red for rockets
    } else if (this.shipEffects.nuclearBombEquipped && this.nukeButtonImage) {
      weaponImage = this.nukeButtonImage;
      glowColor = '#ff6600'; // Orange for nuke
    }

    if (weaponImage) {
      ctx.save();
      ctx.translate(weaponX, weaponY);
      ctx.rotate(-Math.PI / 4); // Angle forward-right (45 degrees)

      // Draw the weapon image
      ctx.drawImage(
        weaponImage,
        -weaponSize / 2,
        -weaponSize / 2,
        weaponSize,
        weaponSize
      );

      // Add glow effect
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.3;
      ctx.drawImage(
        weaponImage,
        -weaponSize / 2,
        -weaponSize / 2,
        weaponSize,
        weaponSize
      );
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      ctx.restore();
    } else if (this.shipEffects.destroyCanonEquipped) {
      // Fallback procedural weapon if image not loaded (Space TNT)
      const canonScale = scale * 0.8;
      const canonX = shipSize * 0.35;
      const canonY = -shipSize * 0.05;

      ctx.save();
      ctx.translate(canonX, canonY);
      ctx.rotate(-Math.PI / 6);

      ctx.fillStyle = '#444';
      ctx.fillRect(-4 * canonScale, -15 * canonScale, 8 * canonScale, 18 * canonScale);

      ctx.beginPath();
      ctx.arc(0, -15 * canonScale, 5 * canonScale, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6600';
      ctx.fill();

      ctx.restore();
    }
  }

  // Draw the currently equipped weapon for other players
  private drawOtherPlayerWeapon(ctx: CanvasRenderingContext2D, player: OtherPlayer, shipSize: number) {
    const weaponSize = shipSize * 0.7;
    const weaponX = shipSize * 0.25;
    const weaponY = -shipSize * 0.1;

    // Determine which weapon is equipped
    let weaponImage: HTMLImageElement | null = null;
    let glowColor = '#ffffff';

    if (player.shipEffects?.spaceRifleEquipped && this.rifleImage) {
      weaponImage = this.rifleImage;
      glowColor = '#ffcc00';
    } else if (player.shipEffects?.destroyCanonEquipped && this.canonImage) {
      weaponImage = this.canonImage;
      glowColor = '#ff6600';
    } else if (player.shipEffects?.plasmaCanonEquipped && this.plasmaCanonImage) {
      weaponImage = this.plasmaCanonImage;
      glowColor = '#8844ff';
    } else if (player.shipEffects?.rocketLauncherEquipped && this.rocketLauncherImage) {
      weaponImage = this.rocketLauncherImage;
      glowColor = '#ff4444';
    } else if (player.shipEffects?.nuclearBombEquipped && this.nukeButtonImage) {
      weaponImage = this.nukeButtonImage;
      glowColor = '#ff6600';
    }

    if (weaponImage) {
      ctx.save();
      ctx.translate(weaponX, weaponY);
      ctx.rotate(-Math.PI / 4);

      ctx.drawImage(
        weaponImage,
        -weaponSize / 2,
        -weaponSize / 2,
        weaponSize,
        weaponSize
      );

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.3;
      ctx.drawImage(
        weaponImage,
        -weaponSize / 2,
        -weaponSize / 2,
        weaponSize,
        weaponSize
      );
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      ctx.restore();
    }
  }

  // ==================== END SPACE RIFLE SYSTEM ====================

  // ==================== PLASMA CANON SYSTEM ====================

  // Fire a plasma ball from the ship
  private firePlasma() {
    const now = Date.now();
    if (now - this.lastPlasmaTime < this.PLASMA_COOLDOWN) return;

    this.lastPlasmaTime = now;
    const { ship } = this.state;

    const spawnDist = 30;
    const px = ship.x + Math.cos(ship.rotation) * spawnDist;
    const py = ship.y + Math.sin(ship.rotation) * spawnDist;
    const pvx = Math.cos(ship.rotation) * this.PLASMA_SPEED + ship.vx * 0.2;
    const pvy = Math.sin(ship.rotation) * this.PLASMA_SPEED + ship.vy * 0.2;

    this.plasmaProjectiles.push({
      x: px,
      y: py,
      vx: pvx,
      vy: pvy,
      life: this.PLASMA_RANGE / this.PLASMA_SPEED,
      maxLife: this.PLASMA_RANGE / this.PLASMA_SPEED,
      damage: this.PLASMA_DAMAGE,
      size: this.PLASMA_SIZE,
      rotation: 0,
    });

    // Broadcast to other players
    this.onWeaponFire?.('plasma', px, py, pvx, pvy, ship.rotation, null);

    // Plasma burst particles
    this.emitPlasmaBurst(ship.x, ship.y, ship.rotation);
    soundManager.playPlasmaFire();
  }

  // Update plasma projectiles
  private updatePlasmaProjectiles() {
    for (let i = this.plasmaProjectiles.length - 1; i >= 0; i--) {
      const p = this.plasmaProjectiles[i];

      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;
      p.rotation += 0.1 * this.dt; // Spin effect

      let removed = false;

      // Check collision with space whale (tail slap!)
      if (this.checkWhaleProjectileHit(p.x, p.y)) {
        this.emitPlasmaExplosion(p.x, p.y);
        this.plasmaProjectiles.splice(i, 1);
        removed = true;
      }

      // Check collision with Neon Nomad (boss fight!)
      if (!removed && this.checkNomadProjectileHit(p.x, p.y, p.damage)) {
        this.emitPlasmaExplosion(p.x, p.y);
        this.plasmaProjectiles.splice(i, 1);
        removed = true;
      }

      // Check collision with planets
      if (!removed) for (const planet of this.state.planets) {
        const dx = p.x - planet.x;
        const dy = p.y - planet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < planet.radius + p.size / 2) {
          if (this.canDamagePlanet(planet)) {
            this.damagePlanet(planet, p.damage, p.x, p.y);
            this.emitPlasmaExplosion(p.x, p.y);
            this.plasmaProjectiles.splice(i, 1);
            removed = true;
            break;
          } else {
            // Bounce off shielded planet
            const nx = dx / dist;
            const ny = dy / dist;
            p.x = planet.x + nx * (planet.radius + p.size / 2 + 2);
            p.y = planet.y + ny * (planet.radius + p.size / 2 + 2);
            const dot = p.vx * nx + p.vy * ny;
            p.vx -= 2 * dot * nx * 0.6;
            p.vy -= 2 * dot * ny * 0.6;
            this.emitShieldParticles(planet.x + nx * planet.radius, planet.y + ny * planet.radius, nx, ny, planet.color);
            soundManager.playCollision();
            p.life = Math.min(p.life, 30);
            break;
          }
        }
      }

      if (!removed && p.life <= 0) {
        this.plasmaProjectiles.splice(i, 1);
      }
    }
  }

  // Emit plasma burst particles when firing
  private emitPlasmaBurst(x: number, y: number, rotation: number) {
    const colors = ['#8844ff', '#aa66ff', '#cc88ff', '#ffffff'];
    for (let i = 0; i < 10; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const speed = Math.random() * 5 + 3;
      this.state.particles.push({
        x: x + Math.cos(rotation) * 30,
        y: y + Math.sin(rotation) * 30,
        vx: Math.cos(rotation + spread) * speed,
        vy: Math.sin(rotation + spread) * speed,
        life: 15 + Math.random() * 10,
        maxLife: 25,
        size: Math.random() * 4 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Emit plasma explosion on impact
  private emitPlasmaExplosion(x: number, y: number) {
    const colors = ['#8844ff', '#aa66ff', '#ff44aa', '#ffffff'];
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 4;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Render plasma projectiles
  private renderPlasmaProjectiles() {
    const { ctx } = this;
    const camera = this.state.camera;

    for (const p of this.plasmaProjectiles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const alpha = Math.min(1, p.life / p.maxLife + 0.3);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rotation);

      // Outer glow
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#8844ff';

      // Plasma ball gradient
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(0.3, `rgba(170, 102, 255, ${alpha})`);
      gradient.addColorStop(0.7, `rgba(136, 68, 255, ${alpha * 0.8})`);
      gradient.addColorStop(1, 'rgba(136, 68, 255, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Inner core
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();

      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // ==================== END PLASMA CANON SYSTEM ====================

  // ==================== ROCKET LAUNCHER SYSTEM ====================

  // Fire a homing rocket from the ship
  private fireRocket() {
    const now = Date.now();
    if (now - this.lastRocketTime < this.ROCKET_COOLDOWN) return;

    this.lastRocketTime = now;
    const { ship } = this.state;

    // During boss fight, always target the Nomad
    const targetingNomad = !!(this.nomadFight?.active);

    // Find nearest damageable planet as target (only when not in boss fight)
    let nearestTarget: Planet | null = null;
    if (!targetingNomad) {
      let nearestDist = Infinity;
      for (const planet of this.state.planets) {
        if (!this.canDamagePlanet(planet)) continue;
        const dx = planet.x - ship.x;
        const dy = planet.y - ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist && dist < this.ROCKET_RANGE * 1.5) {
          nearestDist = dist;
          nearestTarget = planet;
        }
      }
    }

    const spawnDist = 25;
    const rx = ship.x + Math.cos(ship.rotation) * spawnDist;
    const ry = ship.y + Math.sin(ship.rotation) * spawnDist;
    const rvx = Math.cos(ship.rotation) * this.ROCKET_SPEED + ship.vx * 0.3;
    const rvy = Math.sin(ship.rotation) * this.ROCKET_SPEED + ship.vy * 0.3;
    const targetId = targetingNomad ? null : (nearestTarget?.id || null);

    this.rockets.push({
      x: rx,
      y: ry,
      vx: rvx,
      vy: rvy,
      life: this.ROCKET_RANGE / this.ROCKET_SPEED,
      maxLife: this.ROCKET_RANGE / this.ROCKET_SPEED,
      damage: this.ROCKET_DAMAGE,
      rotation: ship.rotation,
      targetPlanetId: targetId,
      targetNomad: targetingNomad,
    });

    // Broadcast to other players
    this.onWeaponFire?.('rocket', rx, ry, rvx, rvy, ship.rotation, targetId);

    // Rocket launch particles
    this.emitRocketSmoke(ship.x, ship.y, ship.rotation);
    soundManager.playRocketFire();
  }

  // Update rockets with homing behavior
  private updateRockets() {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];

      // Homing logic - turn towards target (Nomad priority during boss fight)
      if (r.targetNomad && this.nomadFight?.active) {
        const dx = this.neonNomad.x - r.x;
        const dy = this.neonNomad.y - r.y;
        const targetAngle = Math.atan2(dy, dx);

        let angleDiff = targetAngle - r.rotation;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        r.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.ROCKET_TURN_SPEED * this.dt);
      } else if (r.targetNomad && !this.nomadFight?.active) {
        // Boss fight ended, stop homing
        r.targetNomad = false;
      } else if (r.targetPlanetId) {
        const target = this.state.planets.find(p => p.id === r.targetPlanetId);
        if (target && this.canDamagePlanet(target)) {
          const dx = target.x - r.x;
          const dy = target.y - r.y;
          const targetAngle = Math.atan2(dy, dx);

          let angleDiff = targetAngle - r.rotation;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          r.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.ROCKET_TURN_SPEED * this.dt);
        } else {
          r.targetPlanetId = null;
        }
      }

      // Update velocity based on rotation
      const speed = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
      r.vx = Math.cos(r.rotation) * speed;
      r.vy = Math.sin(r.rotation) * speed;

      r.x += r.vx * this.dt;
      r.y += r.vy * this.dt;
      r.life -= this.dt;

      // Emit trail
      if (Math.random() < 0.5) {
        this.state.particles.push({
          x: r.x - Math.cos(r.rotation) * 10,
          y: r.y - Math.sin(r.rotation) * 10,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 15 + Math.random() * 10,
          maxLife: 25,
          size: Math.random() * 3 + 2,
          color: Math.random() < 0.5 ? '#ff6600' : '#ffaa00',
        });
      }

      let removed = false;

      // Check collision with space whale (tail slap!)
      if (this.checkWhaleProjectileHit(r.x, r.y)) {
        this.emitRocketExplosion(r.x, r.y);
        this.rockets.splice(i, 1);
        removed = true;
      }

      // Check collision with Neon Nomad (boss fight!)
      if (!removed && this.checkNomadProjectileHit(r.x, r.y, r.damage)) {
        this.emitRocketExplosion(r.x, r.y);
        this.rockets.splice(i, 1);
        removed = true;
      }

      // Check collision with planets
      if (!removed) for (const planet of this.state.planets) {
        const dx = r.x - planet.x;
        const dy = r.y - planet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < planet.radius + 8) {
          if (this.canDamagePlanet(planet)) {
            this.damagePlanet(planet, r.damage, r.x, r.y);
            this.emitRocketExplosion(r.x, r.y);
            this.rockets.splice(i, 1);
            removed = true;
            break;
          } else {
            // Rockets explode on shields (no bounce)
            this.emitShieldParticles(planet.x + dx / dist * planet.radius, planet.y + dy / dist * planet.radius, dx / dist, dy / dist, planet.color);
            this.emitRocketExplosion(r.x, r.y);
            soundManager.playCollision();
            this.rockets.splice(i, 1);
            removed = true;
            break;
          }
        }
      }

      if (!removed && r.life <= 0) {
        this.emitRocketExplosion(r.x, r.y);
        this.rockets.splice(i, 1);
      }
    }
  }

  // Emit smoke when rocket launches
  private emitRocketSmoke(x: number, y: number, rotation: number) {
    const colors = ['#666666', '#888888', '#aaaaaa', '#ff6600'];
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 1.5;
      const speed = Math.random() * 3 + 2;
      this.state.particles.push({
        x: x - Math.cos(rotation) * 20,
        y: y - Math.sin(rotation) * 20,
        vx: -Math.cos(rotation + spread) * speed,
        vy: -Math.sin(rotation + spread) * speed,
        life: 20 + Math.random() * 15,
        maxLife: 35,
        size: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Emit rocket explosion on impact
  private emitRocketExplosion(x: number, y: number) {
    const colors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffffff'];
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 5;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 35 + Math.random() * 25,
        maxLife: 60,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // Render rockets
  private renderRockets() {
    const { ctx } = this;
    const camera = this.state.camera;

    for (const r of this.rockets) {
      const x = r.x - camera.x;
      const y = r.y - camera.y;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r.rotation);

      // Rocket body
      ctx.fillStyle = '#cc4444';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -5);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();

      // Fins
      ctx.fillStyle = '#aa3333';
      ctx.beginPath();
      ctx.moveTo(-8, -5);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-8, -3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, 5);
      ctx.lineTo(-12, 8);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();

      // Thruster glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff6600';
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(-10, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // ==================== END ROCKET LAUNCHER SYSTEM ====================

  // ==================== NUCLEAR BOMB SYSTEM ====================

  private fireNuclearBomb() {
    const now = Date.now();
    if (now - this.lastNukeTime < this.NUKE_COOLDOWN) return;
    if (this.nuclearBomb || this.nukeCinematic) return;

    this.lastNukeTime = now;
    const { ship } = this.state;

    // Find player's home zone
    const playerZone = ZONES.find(z => z.ownerId === this.currentUser);
    if (!playerZone) return;

    const targetX = playerZone.centerX;
    const targetY = playerZone.centerY;

    // Generate scenic waypoints: ship → mid-space loop → home zone
    const midX = (ship.x + targetX) / 2 + (Math.random() - 0.5) * 2000;
    const midY = (ship.y + targetY) / 2 + (Math.random() - 0.5) * 2000;
    const clampedMidX = Math.max(500, Math.min(9500, midX));
    const clampedMidY = Math.max(500, Math.min(9500, midY));

    const waypoints = [
      { x: ship.x + Math.cos(ship.rotation) * 200, y: ship.y + Math.sin(ship.rotation) * 200 },
      { x: clampedMidX, y: clampedMidY },
      { x: targetX, y: targetY },
    ];

    // Start alarm phase — siren plays, red alarm light, player can still move
    this.nuclearBomb = {
      x: ship.x,
      y: ship.y,
      vx: 0,
      vy: 0,
      rotation: ship.rotation,
      phase: 'alarm',
      phaseTimer: 0,
      waypoints,
      waypointIndex: 0,
      detonationTimer: 0,
      detonationRadius: 0,
    };

    // Don't set nukeCinematic yet — player can still move during alarm
    this.nukeAlarmTimer = 0;
    this.nukeLaunchStartTime = Date.now();

    // Play siren sound (nuke.mp3) during alarm phase
    soundManager.playNukeLaunch();
  }

  private updateNuclearBomb() {
    if (!this.nuclearBomb) return;
    const nuke = this.nuclearBomb;

    // Stop nuke.mp3 after 11 seconds max
    if (this.nukeLaunchStartTime > 0 && Date.now() - this.nukeLaunchStartTime >= 11000) {
      soundManager.stopNukeLaunch();
      this.nukeLaunchStartTime = 0;
    }

    if (nuke.phase === 'alarm') {
      // Alarm phase: red light pulses around ship for 5 seconds, siren plays
      this.nukeAlarmTimer += this.dt;
      const { ship } = this.state;

      // Keep nuke position on ship during alarm (player is still moving)
      nuke.x = ship.x;
      nuke.y = ship.y;
      nuke.rotation = ship.rotation;

      // Transition to flight after alarm duration
      if (this.nukeAlarmTimer >= this.NUKE_ALARM_DURATION) {
        nuke.phase = 'flight';

        // Recalculate waypoints from current ship position (player may have moved)
        const playerZone = ZONES.find(z => z.ownerId === this.currentUser);
        const targetX = playerZone ? playerZone.centerX : 5000;
        const targetY = playerZone ? playerZone.centerY : 5000;
        const midX = (ship.x + targetX) / 2 + (Math.random() - 0.5) * 2000;
        const midY = (ship.y + targetY) / 2 + (Math.random() - 0.5) * 2000;
        nuke.waypoints = [
          { x: ship.x + Math.cos(ship.rotation) * 200, y: ship.y + Math.sin(ship.rotation) * 200 },
          { x: Math.max(500, Math.min(9500, midX)), y: Math.max(500, Math.min(9500, midY)) },
          { x: targetX, y: targetY },
        ];
        nuke.waypointIndex = 0;

        const spawnDist = 30;
        nuke.x = ship.x + Math.cos(ship.rotation) * spawnDist;
        nuke.y = ship.y + Math.sin(ship.rotation) * spawnDist;
        nuke.vx = Math.cos(ship.rotation) * this.NUKE_SPEED;
        nuke.vy = Math.sin(ship.rotation) * this.NUKE_SPEED;
        nuke.rotation = ship.rotation;

        // Now lock camera to follow the nuke
        this.nukeCinematic = true;
        this.nukeCameraTarget = { x: nuke.x, y: nuke.y };
        this.screenShake = { intensity: 15, timer: 20 };

        // Play flying sound immediately, thrust kicks in after 2 seconds
        soundManager.playNukeFlying();
        setTimeout(() => soundManager.playNukeThrust(), 2000);
      }

    } else if (nuke.phase === 'flight') {
      // Waypoint homing: smoothly rotate toward current waypoint and fly at NUKE_SPEED
      const wp = nuke.waypoints[nuke.waypointIndex];
      if (wp) {
        const dx = wp.x - nuke.x;
        const dy = wp.y - nuke.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const targetAngle = Math.atan2(dy, dx);

        // Smooth rotation toward waypoint
        let angleDiff = targetAngle - nuke.rotation;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const turnSpeed = 0.04;
        nuke.rotation += angleDiff * turnSpeed * this.dt;

        // Update velocity based on current rotation
        nuke.vx = Math.cos(nuke.rotation) * this.NUKE_SPEED;
        nuke.vy = Math.sin(nuke.rotation) * this.NUKE_SPEED;

        // Move
        nuke.x += nuke.vx * this.dt;
        nuke.y += nuke.vy * this.dt;

        // Advance to next waypoint when close enough
        if (dist < 100) {
          nuke.waypointIndex++;
        }
      }

      // Update camera target
      this.nukeCameraTarget = { x: nuke.x, y: nuke.y };

      // Emit trail particles
      if (Math.random() < 0.7) {
        const trailColors = ['#ff6600', '#ff4400', '#ffaa00', '#ff0000'];
        this.state.particles.push({
          x: nuke.x - Math.cos(nuke.rotation) * 15,
          y: nuke.y - Math.sin(nuke.rotation) * 15,
          vx: (Math.random() - 0.5) * 3 - Math.cos(nuke.rotation) * 2,
          vy: (Math.random() - 0.5) * 3 - Math.sin(nuke.rotation) * 2,
          life: 20 + Math.random() * 15,
          maxLife: 35,
          size: Math.random() * 5 + 3,
          color: trailColors[Math.floor(Math.random() * trailColors.length)],
        });
      }

      // Detonate when all waypoints reached
      if (nuke.waypointIndex >= nuke.waypoints.length) {
        nuke.phase = 'detonation';
        nuke.detonationTimer = 0;

        const playerZone = ZONES.find(z => z.ownerId === this.currentUser);
        const detX = playerZone ? playerZone.centerX : nuke.x;
        const detY = playerZone ? playerZone.centerY : nuke.y;

        const detonationParticles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[] = [];
        const detonationColors = ['#ff6600', '#ff4400', '#ffaa00', '#ff0000', '#ffffff', '#ffcc00', '#ff8800'];
        for (let i = 0; i < 150; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 12 + 3;
          const life = 60 + Math.random() * 100;
          detonationParticles.push({
            x: detX, y: detY,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life, maxLife: life,
            color: detonationColors[Math.floor(Math.random() * detonationColors.length)],
            size: Math.random() * 8 + 2,
          });
        }

        this.nukeDetonation = {
          x: detX, y: detY, progress: 0,
          maxDuration: this.NUKE_DETONATION_DURATION,
          shockwaveRadius: 0, flashAlpha: 0.8,
          particles: detonationParticles,
        };

        this.nukeCameraTarget = { x: detX, y: detY };
        this.screenShake = { intensity: 40, timer: 60 };

        // Stop flying sounds, play explosion
        soundManager.stopNukeFlying();
        soundManager.stopNukeThrust();
        soundManager.playNukeExplosion();
      }

    } else if (nuke.phase === 'detonation') {
      nuke.detonationTimer += this.dt;

      if (this.nukeDetonation) {
        const det = this.nukeDetonation;
        det.progress = nuke.detonationTimer / det.maxDuration;

        // Expanding shockwave
        det.shockwaveRadius = det.progress * 1500;

        // Flash fades out
        det.flashAlpha = Math.max(0, 0.8 * (1 - det.progress));

        // Update detonation particles
        for (let i = det.particles.length - 1; i >= 0; i--) {
          const p = det.particles[i];
          p.x += p.vx * this.dt;
          p.y += p.vy * this.dt;
          p.life -= this.dt;
          p.vx *= Math.pow(0.98, this.dt);
          p.vy *= Math.pow(0.98, this.dt);
          if (p.life <= 0) {
            det.particles.splice(i, 1);
          }
        }

        // Continuous screen shake during detonation (decreasing)
        if (det.progress < 0.7) {
          this.screenShake = { intensity: 30 * (1 - det.progress), timer: 5 };
        }
      }

      // End detonation
      if (nuke.detonationTimer >= this.NUKE_DETONATION_DURATION) {
        this.endNukeCinematic();
      }
    }
  }

  private updateNukeCinematicCamera() {
    if (!this.nukeCameraTarget) return;
    const { camera } = this.state;

    const targetCamX = this.nukeCameraTarget.x - this.canvas.width / 2;
    const targetCamY = this.nukeCameraTarget.y - this.canvas.height / 2;
    const camLerp = 1 - Math.pow(1 - 0.04, this.dt);
    camera.x += (targetCamX - camera.x) * camLerp;
    camera.y += (targetCamY - camera.y) * camLerp;

    // Screen shake
    if (this.screenShake.timer > 0) {
      this.screenShake.timer -= this.dt;
      const shakeProgress = this.screenShake.timer / 30;
      const magnitude = this.screenShake.intensity * shakeProgress;
      camera.x += (Math.random() - 0.5) * magnitude;
      camera.y += (Math.random() - 0.5) * magnitude;
    }
  }

  private endNukeCinematic() {
    this.nuclearBomb = null;
    this.nukeDetonation = null;
    this.nukeCinematic = false;
    this.nukeCameraTarget = null;
    this.nukeAlarmTimer = 0;
    this.nukeLaunchStartTime = 0;
    soundManager.stopNukeLaunch();
    soundManager.stopNukeFlying();
    soundManager.stopNukeThrust();
    this.onNukeComplete?.();
  }

  private renderNukeAlarm() {
    if (!this.nuclearBomb || this.nuclearBomb.phase !== 'alarm') return;
    const { ctx } = this;
    const camera = this.state.camera;
    const { ship } = this.state;

    const x = ship.x - camera.x;
    const y = ship.y - camera.y;

    // Pulsing red alarm light — bounces in and out
    const progress = this.nukeAlarmTimer / this.NUKE_ALARM_DURATION;
    const pulse = Math.abs(Math.sin(progress * Math.PI * 8)); // fast bouncing pulse
    const maxRadius = 200;
    const radius = maxRadius * (0.4 + pulse * 0.6);

    ctx.save();

    // Outer red glow
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${0.3 * pulse})`);
    gradient.addColorStop(0.5, `rgba(255, 30, 0, ${0.15 * pulse})`);
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    const innerGradient = ctx.createRadialGradient(x, y, 0, x, y, 40);
    innerGradient.addColorStop(0, `rgba(255, 50, 0, ${0.6 * pulse})`);
    innerGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing ring
    ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderNuclearBomb() {
    if (!this.nuclearBomb || this.nuclearBomb.phase !== 'flight') return;
    const { ctx } = this;
    const camera = this.state.camera;
    const nuke = this.nuclearBomb;

    const x = nuke.x - camera.x;
    const y = nuke.y - camera.y;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(nuke.rotation);

    // Pulsing outer glow
    const pulsePhase = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
    ctx.shadowBlur = 30 * pulsePhase;
    ctx.shadowColor = '#ff4400';

    if (this.nukeWarheadImage) {
      // Draw the warhead image (pointing right at rotation=0)
      const imgW = 60;
      const imgH = 30;
      ctx.drawImage(this.nukeWarheadImage, -imgW / 2, -imgH / 2, imgW, imgH);
    } else {
      // Fallback: procedural missile
      ctx.fillStyle = '#444444';
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-12, -7);
      ctx.lineTo(-12, 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(12, -4);
      ctx.lineTo(12, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ff4400';
      ctx.fillRect(-2, -5, 4, 10);

      ctx.fillStyle = '#666666';
      ctx.beginPath();
      ctx.moveTo(-12, -7);
      ctx.lineTo(-18, -12);
      ctx.lineTo(-12, -4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-12, 7);
      ctx.lineTo(-18, 12);
      ctx.lineTo(-12, 4);
      ctx.closePath();
      ctx.fill();
    }

    // Animated thruster flame (always rendered on top)
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff6600';
    const flameSize = 7 + Math.sin(Date.now() * 0.02) * 4;
    const flameX = this.nukeWarheadImage ? -34 : -15;
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.arc(flameX, 0, flameSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(flameX + 1, 0, flameSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Secondary flickering flame
    const flame2Size = 4 + Math.sin(Date.now() * 0.035) * 2.5;
    ctx.fillStyle = '#ff4400';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(flameX - flameSize * 0.8, (Math.sin(Date.now() * 0.03)) * 3, flame2Size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private renderNukeDetonation() {
    if (!this.nukeDetonation) return;
    const { ctx, canvas } = this;
    const camera = this.state.camera;
    const det = this.nukeDetonation;

    const cx = det.x - camera.x;
    const cy = det.y - camera.y;

    // Expanding shockwave ring
    if (det.shockwaveRadius > 0) {
      ctx.save();
      const ringAlpha = Math.max(0, 1 - det.progress * 1.2);

      // Outer shockwave ring
      ctx.strokeStyle = `rgba(255, 140, 0, ${ringAlpha * 0.8})`;
      ctx.lineWidth = 4 + (1 - det.progress) * 8;
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ff6600';
      ctx.beginPath();
      ctx.arc(cx, cy, det.shockwaveRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner shockwave ring
      ctx.strokeStyle = `rgba(255, 255, 200, ${ringAlpha * 0.5})`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffaa00';
      ctx.beginPath();
      ctx.arc(cx, cy, det.shockwaveRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      // Core glow
      if (det.progress < 0.4) {
        const coreAlpha = (0.4 - det.progress) * 2.5;
        const coreRadius = 50 + det.progress * 200;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
        gradient.addColorStop(0, `rgba(255, 255, 200, ${coreAlpha})`);
        gradient.addColorStop(0.3, `rgba(255, 140, 0, ${coreAlpha * 0.6})`);
        gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      ctx.shadowBlur = 0;
    }

    // Render detonation particles
    for (const p of det.particles) {
      const px = p.x - camera.x;
      const py = p.y - camera.y;
      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(px, py, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Screen flash overlay
    if (det.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 200, 100, ${det.flashAlpha * 0.3})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ==================== END NUCLEAR BOMB SYSTEM ====================

  // Start destroy animation (for cleaning up completed planets)
  public startDestroyAnimation(planet: Planet, fromRifle: boolean = false) {
    this.isDestroying = true;
    this.destroyProgress = fromRifle ? 0.6 : 0; // Skip charging phase for rifle
    this.destroyPlanet = planet;
    this.destroyParticles = [];
    this.destroyFromRifle = fromRifle;

    // Broadcast to other players
    this.onPlanetDestroyBroadcast?.(planet.id, fromRifle);

    // Clear landed state (only relevant for canon)
    if (!fromRifle) {
      this.isLanded = false;
      this.landedPlanet = null;
    }

    // Play sound
    soundManager.playDockingSound();
  }

  // Update destroy animation
  private updateDestroyAnimation() {
    if (!this.isDestroying || !this.destroyPlanet) return;

    const planet = this.destroyPlanet;
    const { ship } = this.state;

    // Rifle destruction is faster and starts at explosion phase
    const animSpeed = this.destroyFromRifle ? 0.04 : 0.025;
    this.destroyProgress += animSpeed * this.dt;

    // Only position ship for canon destruction (not rifle)
    if (!this.destroyFromRifle) {
      ship.x = planet.x;
      ship.y = planet.y - planet.radius - 25;
      ship.vx = 0;
      ship.vy = 0;
      ship.rotation = -Math.PI / 2;
    }

    // Phase 1: Charging red laser (0-0.3) - Canon only
    if (!this.destroyFromRifle && this.destroyProgress < 0.3) {
      if (Math.random() < 0.4) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 30;
        this.destroyParticles.push({
          x: ship.x + Math.cos(angle) * dist,
          y: ship.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * 4,
          vy: -Math.sin(angle) * 4,
          life: 15,
          color: '#ff4444',
          size: 3 + Math.random() * 2,
        });
      }
    }
    // Phase 2: Red beam hits planet, planet cracks (0.3-0.6) - Canon only
    else if (!this.destroyFromRifle && this.destroyProgress < 0.6) {
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.destroyParticles.push({
          x: planet.x + Math.cos(angle) * planet.radius * 0.8,
          y: planet.y + Math.sin(angle) * planet.radius * 0.8,
          vx: Math.cos(angle) * (1 + Math.random()),
          vy: Math.sin(angle) * (1 + Math.random()),
          life: 25,
          color: Math.random() < 0.5 ? '#ff6600' : '#ffaa00',
          size: 2 + Math.random() * 3,
        });
      }
    }
    // Phase 3: Massive explosion (0.6-0.85)
    else if (this.destroyProgress < 0.85) {
      // Rifle destruction has more intense explosion
      const particleCount = this.destroyFromRifle ? 35 : 20;
      const burstWindow = this.destroyFromRifle ? 0.75 : 0.7;

      if (this.destroyProgress < burstWindow) {
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = this.destroyFromRifle ? (6 + Math.random() * 12) : (4 + Math.random() * 8);
          this.destroyParticles.push({
            x: planet.x + (Math.random() - 0.5) * planet.radius,
            y: planet.y + (Math.random() - 0.5) * planet.radius,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: this.destroyFromRifle ? (60 + Math.random() * 50) : (50 + Math.random() * 40),
            color: ['#ff4444', '#ff8800', '#ffcc00', '#ffffff', '#ff2200'][Math.floor(Math.random() * 5)],
            size: this.destroyFromRifle ? (5 + Math.random() * 8) : (4 + Math.random() * 6),
          });
        }
      }
    }

    // Update destroy particles
    for (let i = this.destroyParticles.length - 1; i >= 0; i--) {
      const p = this.destroyParticles[i];
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.vx *= Math.pow(0.98, this.dt);
      p.vy *= Math.pow(0.98, this.dt);
      p.life -= this.dt;
      if (p.life <= 0) {
        this.destroyParticles.splice(i, 1);
      }
    }

    // Animation complete
    if (this.destroyProgress >= 1) {
      this.isDestroying = false;
      this.destroyParticles = [];

      // Remove planet from state
      this.state.planets = this.state.planets.filter(p => p.id !== this.destroyPlanet?.id);

      // Call the destroy callback
      if (this.onDestroyPlanet && this.destroyPlanet) {
        this.onDestroyPlanet(this.destroyPlanet);
      }
      this.destroyPlanet = null;
    }
  }

  // Render destroy animation effects
  private renderDestroyAnimation() {
    if (!this.isDestroying || !this.destroyPlanet) return;

    const { ctx } = this;
    const planet = this.destroyPlanet;
    const { ship } = this.state;

    ctx.save();
    // Transform to world coordinates (same as getWrappedPositions)
    ctx.translate(-this.state.camera.x, -this.state.camera.y);

    // Phase 1: Red charging glow - Canon only
    if (!this.destroyFromRifle && this.destroyProgress < 0.3) {
      const chargeIntensity = this.destroyProgress / 0.3;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, 25 + chargeIntensity * 25, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(ship.x, ship.y, 5, ship.x, ship.y, 50);
      gradient.addColorStop(0, `rgba(255, 68, 68, ${chargeIntensity * 0.6})`);
      gradient.addColorStop(1, 'rgba(255, 68, 68, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Phase 2: Red destruction beam - Canon only
    if (!this.destroyFromRifle && this.destroyProgress >= 0.3 && this.destroyProgress < 0.6) {
      const beamProgress = (this.destroyProgress - 0.3) / 0.3;
      const beamWidth = 12 + Math.sin(this.destroyProgress * 60) * 3;

      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = beamWidth;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y + 20);
      ctx.lineTo(planet.x, planet.y);
      ctx.stroke();

      // Inner bright beam
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = beamWidth * 0.3;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y + 20);
      ctx.lineTo(planet.x, planet.y);
      ctx.stroke();

      // Draw cracking planet
      const crackIntensity = beamProgress;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff4444';
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
      ctx.fillStyle = planet.color;
      ctx.globalAlpha = 1 - crackIntensity * 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Draw cracks
      ctx.strokeStyle = `rgba(255, 100, 0, ${crackIntensity})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(planet.x, planet.y);
        ctx.lineTo(
          planet.x + Math.cos(angle) * planet.radius * (0.8 + crackIntensity * 0.3),
          planet.y + Math.sin(angle) * planet.radius * (0.8 + crackIntensity * 0.3)
        );
        ctx.stroke();
      }
    }

    // Phase 3: Flash and explosion (circular, planet-sized)
    if (this.destroyProgress >= 0.6 && this.destroyProgress < 0.8) {
      const flashIntensity = 1 - (this.destroyProgress - 0.6) / 0.2;
      const flashRadius = planet.radius * (this.destroyFromRifle ? 2.5 : 2);

      // Radial gradient flash centered on planet
      const gradient = ctx.createRadialGradient(
        planet.x, planet.y, 0,
        planet.x, planet.y, flashRadius
      );
      gradient.addColorStop(0, `rgba(255, 255, 200, ${flashIntensity * 0.9})`);
      gradient.addColorStop(0.3, `rgba(255, 200, 100, ${flashIntensity * 0.7})`);
      gradient.addColorStop(0.7, `rgba(255, 150, 50, ${flashIntensity * 0.4})`);
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

      ctx.beginPath();
      ctx.arc(planet.x, planet.y, flashRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw destroy particles
    for (const p of this.destroyParticles) {
      const alpha = p.life / 60;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.shadowBlur = this.destroyFromRifle ? 12 : 8;
      ctx.shadowColor = p.color;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ==================== REMOTE WEAPON & DESTROY SYSTEM ====================

  // Handle remote weapon fire — spawn visual-only projectile
  public onRemoteWeaponFire(_playerId: string, data: {
    weaponType: 'rifle' | 'plasma' | 'rocket';
    x: number; y: number; vx: number; vy: number;
    rotation: number; targetPlanetId: string | null;
  }) {
    if (data.weaponType === 'rifle') {
      this.remoteProjectiles.push({
        x: data.x, y: data.y,
        vx: data.vx, vy: data.vy,
        life: this.BULLET_RANGE / this.BULLET_SPEED,
        maxLife: this.BULLET_RANGE / this.BULLET_SPEED,
        damage: 0, size: 4, color: '#ffcc00',
      });
    } else if (data.weaponType === 'plasma') {
      this.remotePlasmaProjectiles.push({
        x: data.x, y: data.y,
        vx: data.vx, vy: data.vy,
        life: this.PLASMA_RANGE / this.PLASMA_SPEED,
        maxLife: this.PLASMA_RANGE / this.PLASMA_SPEED,
        damage: 0, size: this.PLASMA_SIZE, rotation: 0,
      });
    } else if (data.weaponType === 'rocket') {
      this.remoteRockets.push({
        x: data.x, y: data.y,
        vx: data.vx, vy: data.vy,
        life: this.ROCKET_RANGE / this.ROCKET_SPEED,
        maxLife: this.ROCKET_RANGE / this.ROCKET_SPEED,
        damage: 0, rotation: data.rotation,
        targetPlanetId: data.targetPlanetId,
      });
    }
  }

  // Handle remote planet destroy — start explosion from current planet snapshot
  public onRemotePlanetDestroy(_playerId: string, data: { planetId: string; fromRifle: boolean }) {
    const planet = this.state.planets.find(p => p.id === data.planetId);
    if (!planet) return;

    this.remoteDestroyAnimations.set(data.planetId, {
      x: planet.x,
      y: planet.y,
      radius: planet.radius,
      progress: 0.6, // Skip charge/beam, jump straight to explosion
      particles: [],
      fromRifle: data.fromRifle,
    });
  }

  // Update remote projectiles (movement only, no collision)
  private updateRemoteProjectiles() {
    // Rifle bullets
    for (let i = this.remoteProjectiles.length - 1; i >= 0; i--) {
      const p = this.remoteProjectiles[i];
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;
      if (p.life <= 0) this.remoteProjectiles.splice(i, 1);
    }

    // Plasma
    for (let i = this.remotePlasmaProjectiles.length - 1; i >= 0; i--) {
      const p = this.remotePlasmaProjectiles[i];
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.rotation += 0.15 * this.dt;
      p.life -= this.dt;
      if (p.life <= 0) this.remotePlasmaProjectiles.splice(i, 1);
    }

    // Rockets (with homing toward target planet)
    for (let i = this.remoteRockets.length - 1; i >= 0; i--) {
      const r = this.remoteRockets[i];

      // Homing behavior (same as local rockets but visual only)
      if (r.targetPlanetId) {
        const target = this.state.planets.find(p => p.id === r.targetPlanetId);
        if (target) {
          const dx = target.x - r.x;
          const dy = target.y - r.y;
          const targetAngle = Math.atan2(dy, dx);
          let angleDiff = targetAngle - r.rotation;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          r.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.ROCKET_TURN_SPEED * this.dt);
          const speed = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
          r.vx = Math.cos(r.rotation) * speed;
          r.vy = Math.sin(r.rotation) * speed;
        }
      }

      r.x += r.vx * this.dt;
      r.y += r.vy * this.dt;
      r.life -= this.dt;
      if (r.life <= 0) this.remoteRockets.splice(i, 1);
    }
  }

  // Update remote destroy animations (explosion particles)
  private updateRemoteDestroyAnimations() {
    for (const [planetId, anim] of this.remoteDestroyAnimations) {
      anim.progress += 0.04 * this.dt; // Same speed as rifle destroy

      // Spawn explosion particles (phase 3: 0.6 - 0.85)
      if (anim.progress < 0.75) {
        for (let i = 0; i < 35; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 6 + Math.random() * 12;
          anim.particles.push({
            x: anim.x, y: anim.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 60 + Math.random() * 50,
            color: ['#ff4444', '#ff8800', '#ffcc00', '#ffffff'][Math.floor(Math.random() * 4)],
            size: 5 + Math.random() * 8,
          });
        }
      }

      // Update particles
      for (let i = anim.particles.length - 1; i >= 0; i--) {
        const p = anim.particles[i];
        p.x += p.vx * this.dt;
        p.y += p.vy * this.dt;
        p.vx *= Math.pow(0.96, this.dt);
        p.vy *= Math.pow(0.96, this.dt);
        p.life -= this.dt;
        if (p.life <= 0) anim.particles.splice(i, 1);
      }

      // Clean up when done
      if (anim.progress >= 1 && anim.particles.length === 0) {
        this.remoteDestroyAnimations.delete(planetId);
      }
    }
  }

  // Render remote destroy animations
  private renderRemoteDestroyAnimations() {
    const { ctx } = this;
    const camera = this.state.camera;

    for (const [, anim] of this.remoteDestroyAnimations) {
      ctx.save();

      // Screen flash during early explosion
      if (anim.progress >= 0.6 && anim.progress < 0.8) {
        const flashIntensity = 1 - (anim.progress - 0.6) / 0.2;
        const flashRadius = anim.radius * 2.5;
        const gradient = ctx.createRadialGradient(
          anim.x - camera.x, anim.y - camera.y, 0,
          anim.x - camera.x, anim.y - camera.y, flashRadius
        );
        gradient.addColorStop(0, `rgba(255, 200, 100, ${flashIntensity * 0.4})`);
        gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');
        ctx.beginPath();
        ctx.arc(anim.x - camera.x, anim.y - camera.y, flashRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Draw particles
      for (const p of anim.particles) {
        const alpha = p.life / 60;
        ctx.beginPath();
        ctx.arc(p.x - camera.x, p.y - camera.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // Render remote rifle projectiles (same visual as local, different array)
  private renderRemoteProjectiles() {
    if (this.remoteProjectiles.length === 0) return;
    const { ctx } = this;
    const camera = this.state.camera;

    for (const p of this.remoteProjectiles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const alpha = Math.min(1, p.life / p.maxLife + 0.3);

      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;

      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * 2, y - p.vy * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.6;
      ctx.globalAlpha = alpha * 0.5;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // Render remote plasma projectiles
  private renderRemotePlasmaProjectiles() {
    if (this.remotePlasmaProjectiles.length === 0) return;
    const { ctx } = this;
    const camera = this.state.camera;

    for (const p of this.remotePlasmaProjectiles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const alpha = Math.min(1, p.life / p.maxLife + 0.3);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rotation);

      ctx.shadowBlur = 25;
      ctx.shadowColor = '#8844ff';

      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(0.3, `rgba(170, 102, 255, ${alpha})`);
      gradient.addColorStop(0.7, `rgba(136, 68, 255, ${alpha * 0.8})`);
      gradient.addColorStop(1, 'rgba(136, 68, 255, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();

      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // Render remote rockets
  private renderRemoteRockets() {
    if (this.remoteRockets.length === 0) return;
    const { ctx } = this;
    const camera = this.state.camera;

    for (const r of this.remoteRockets) {
      const x = r.x - camera.x;
      const y = r.y - camera.y;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r.rotation);

      ctx.fillStyle = '#cc4444';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -5);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#aa3333';
      ctx.beginPath();
      ctx.moveTo(-8, -5);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-8, -3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, 5);
      ctx.lineTo(-12, 8);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff6600';
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(-10, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // ==================== END REMOTE WEAPON & DESTROY SYSTEM ====================

  // Additional easing functions for the landing
  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private easeOutBounce(t: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private updateCamera() {
    const { ship, camera } = this.state;

    // Detect if ship wrapped (large position jump)
    const wrapThreshold = WORLD_SIZE * 0.5;
    const deltaX = ship.x - this.prevShipX;
    const deltaY = ship.y - this.prevShipY;

    // If ship wrapped, snap camera to match
    if (Math.abs(deltaX) > wrapThreshold) {
      camera.x += deltaX > 0 ? WORLD_SIZE : -WORLD_SIZE;
    }
    if (Math.abs(deltaY) > wrapThreshold) {
      camera.y += deltaY > 0 ? WORLD_SIZE : -WORLD_SIZE;
    }

    // Store for next frame
    this.prevShipX = ship.x;
    this.prevShipY = ship.y;

    // Smooth camera follow (exponential interpolation scales with dt)
    const targetCamX = ship.x - this.canvas.width / 2;
    const targetCamY = ship.y - this.canvas.height / 2;
    const camLerp = 1 - Math.pow(1 - 0.06, this.dt);
    camera.x += (targetCamX - camera.x) * camLerp;
    camera.y += (targetCamY - camera.y) * camLerp;

    // Screen shake
    if (this.screenShake.timer > 0) {
      this.screenShake.timer -= this.dt;
      const shakeProgress = this.screenShake.timer / 30; // Fade out over duration
      const magnitude = this.screenShake.intensity * shakeProgress;
      camera.x += (Math.random() - 0.5) * magnitude;
      camera.y += (Math.random() - 0.5) * magnitude;
    }
  }

  private updateParticles() {
    this.state.particles = this.state.particles.filter(p => {
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;
      p.vx *= Math.pow(0.97, this.dt);
      p.vy *= Math.pow(0.97, this.dt);
      return p.life > 0;
    });
  }

  private updateZoneTitle() {
    const { ship } = this.state;

    // Find current zone (closest zone center)
    let closestZone: Zone | null = null;
    let closestDist = Infinity;

    for (const zone of ZONES) {
      // Hide test zone from non-test players
      if (zone.ownerId === TEST_PLAYER_ID && this.currentUser !== TEST_PLAYER_ID) continue;
      const dx = ship.x - zone.centerX;
      const dy = ship.y - zone.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestZone = zone;
      }
    }

    if (closestZone && closestZone.id !== this.currentZoneId) {
      // Entered a new zone - show title
      this.currentZoneId = closestZone.id;
      this.zoneTitleText = closestZone.name;
      this.zoneTitleColor = closestZone.color;
      this.zoneTitleOpacity = 1.0;

      // Track zone visits for explorer achievement
      this.visitedZones.add(closestZone.id);
      // Check if all non-test zones visited (9 zones minus test = 8)
      const requiredZones = ZONES.filter(z => z.ownerId !== TEST_PLAYER_ID || this.currentUser === TEST_PLAYER_ID);
      if (!this.explorerTriggered && this.visitedZones.size >= requiredZones.length) {
        this.explorerTriggered = true;
        this.explorerEffectTimer = 240; // 4 seconds
        this.tryUnlockAchievement('explorer');
      }
    }

    // Fade out the title over time
    if (this.zoneTitleOpacity > 0) {
      this.zoneTitleOpacity -= 0.008; // Fade over ~2 seconds
      if (this.zoneTitleOpacity < 0) {
        this.zoneTitleOpacity = 0;
      }
    }
  }

  // Upgrading animation with orbiting satellites/robots
  // planetId: null = orbit ship, string = orbit that planet
  public startUpgradeAnimation(planetId: string | null = null) {
    if (this.isUpgrading) return;
    this.isUpgrading = true;
    this.upgradeTargetPlanetId = planetId;
    soundManager.startLoadingSound();

    // Play appropriate voice line
    if (planetId && planetId.startsWith('user-planet-')) {
      soundManager.playPlanetVoiceLine(); // Terraform
    } else {
      soundManager.playShipVoiceLine(); // Ship upgrade
    }

    // Get target size for appropriate orbit distance
    let baseDistance = 50;
    if (planetId) {
      const planet = this.state.planets.find(p => p.id === planetId);
      if (planet) {
        baseDistance = planet.radius + 30;
      }
    }

    // Create 4-6 satellites/robots with random properties
    const count = 4 + Math.floor(Math.random() * 3);
    const colors = ['#00ffff', '#ff6b9d', '#ffd700', '#4ade80', '#a855f7', '#ff8c00'];

    this.upgradeSatellites = [];
    for (let i = 0; i < count; i++) {
      this.upgradeSatellites.push({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
        distance: baseDistance + Math.random() * 30,
        speed: 0.02 + Math.random() * 0.02,
        size: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.05,
        type: Math.random() > 0.5 ? 'satellite' : 'robot',
      });
    }
  }

  public stopUpgradeAnimation() {
    this.isUpgrading = false;
    this.upgradeTargetPlanetId = null;
    this.upgradeSatellites = [];
    soundManager.stopLoadingSound();
  }

  /**
   * Start upgrade animation for another player (called from multiplayer sync).
   */
  public setOtherPlayerUpgrading(playerId: string, planetId: string | null) {
    // Get target size for appropriate orbit distance
    let baseDistance = 50;
    if (planetId) {
      const planet = this.state.planets.find(p => p.id === planetId);
      if (planet) {
        baseDistance = planet.radius + 30;
      }
    }

    // Create satellites for this player
    const count = 4 + Math.floor(Math.random() * 3);
    const colors = ['#00ffff', '#ff6b9d', '#ffd700', '#4ade80', '#a855f7', '#ff8c00'];

    const satellites: UpgradeSatellite[] = [];
    for (let i = 0; i < count; i++) {
      satellites.push({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
        distance: baseDistance + Math.random() * 30,
        speed: 0.02 + Math.random() * 0.02,
        size: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.05,
        type: Math.random() > 0.5 ? 'satellite' : 'robot',
      });
    }

    this.otherPlayerUpgrading.set(playerId, { targetPlanetId: planetId, satellites });
  }

  /**
   * Stop upgrade animation for another player.
   */
  public clearOtherPlayerUpgrading(playerId: string) {
    this.otherPlayerUpgrading.delete(playerId);
  }

  private getUpgradeTargetPosition(): { x: number; y: number } {
    if (this.upgradeTargetPlanetId) {
      const planet = this.state.planets.find(p => p.id === this.upgradeTargetPlanetId);
      if (planet) {
        return { x: planet.x, y: planet.y };
      }
    }
    return { x: this.state.ship.x, y: this.state.ship.y };
  }

  /**
   * Emit thrust particles for other thrusting players.
   */
  private updateOtherPlayersParticles() {
    for (const player of this.otherPlayers) {
      // Use render state for interpolated thrusting and boosting
      const renderState = this.renderStates.get(player.id);
      const isThrusting = renderState?.renderThrusting ?? player.thrusting;
      const isBoosting = renderState?.renderBoosting ?? player.boosting ?? false;
      if (isThrusting) {
        this.emitOtherPlayerThrust(player, isBoosting);
      }
    }
  }

  private updateUpgradeSatellites() {
    // Update local player's upgrade satellites
    if (this.isUpgrading) {
      const target = this.getUpgradeTargetPosition();

      for (const sat of this.upgradeSatellites) {
        // Orbit around
        sat.angle += sat.speed * this.dt;
        // Wobble the distance
        sat.wobble += sat.wobbleSpeed * this.dt;

        // Emit tiny sparkle particles occasionally
        if (Math.random() < 0.05) {
          const x = target.x + Math.cos(sat.angle) * (sat.distance + Math.sin(sat.wobble) * 10);
          const y = target.y + Math.sin(sat.angle) * (sat.distance + Math.sin(sat.wobble) * 10);

          this.state.particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            life: 15 + Math.random() * 10,
            maxLife: 25,
            size: 2 + Math.random() * 2,
            color: sat.color,
          });
        }
      }
    }

    // Update other players' upgrade satellites
    for (const [playerId, upgradeData] of this.otherPlayerUpgrading) {
      const player = this.otherPlayers.find(p => p.id === playerId);
      if (!player) continue;

      // Get target position (player's ship or a planet)
      let target: { x: number; y: number };
      if (upgradeData.targetPlanetId) {
        const planet = this.state.planets.find(p => p.id === upgradeData.targetPlanetId);
        target = planet ? { x: planet.x, y: planet.y } : { x: player.x, y: player.y };
      } else {
        // Use interpolated position for smooth animation
        const renderState = this.renderStates.get(playerId);
        target = { x: renderState?.renderX ?? player.x, y: renderState?.renderY ?? player.y };
      }

      for (const sat of upgradeData.satellites) {
        sat.angle += sat.speed;
        sat.wobble += sat.wobbleSpeed;

        // Emit particles for other players too (less frequent)
        if (Math.random() < 0.03) {
          const x = target.x + Math.cos(sat.angle) * (sat.distance + Math.sin(sat.wobble) * 10);
          const y = target.y + Math.sin(sat.angle) * (sat.distance + Math.sin(sat.wobble) * 10);

          this.state.particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            life: 15 + Math.random() * 10,
            maxLife: 25,
            size: 2 + Math.random() * 2,
            color: sat.color,
          });
        }
      }
    }
  }

  private renderUpgradeSatellites() {
    const { ctx, state } = this;
    const { camera } = state;

    // Helper to render a single satellite
    const renderSatellite = (sat: typeof this.upgradeSatellites[0], targetX: number, targetY: number) => {
      const wobbleOffset = Math.sin(sat.wobble) * 10;
      const x = targetX + Math.cos(sat.angle) * (sat.distance + wobbleOffset);
      const y = targetY + Math.sin(sat.angle) * (sat.distance + wobbleOffset);

      ctx.save();
      ctx.translate(x, y);

      if (sat.type === 'satellite') {
        // Draw satellite: body + solar panels
        ctx.rotate(sat.angle + Math.PI / 2);

        // Glow
        ctx.shadowColor = sat.color;
        ctx.shadowBlur = 8;

        // Body (hexagon-ish)
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(0, 0, sat.size * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Solar panels
        ctx.fillStyle = sat.color;
        ctx.fillRect(-sat.size * 1.5, -sat.size * 0.2, sat.size, sat.size * 0.4);
        ctx.fillRect(sat.size * 0.5, -sat.size * 0.2, sat.size, sat.size * 0.4);

        // Center light
        ctx.beginPath();
        ctx.arc(0, 0, sat.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = sat.color;
        ctx.fill();

      } else {
        // Draw robot: small cute bot
        ctx.rotate(sat.angle * 2); // Spin faster

        // Glow
        ctx.shadowColor = sat.color;
        ctx.shadowBlur = 6;

        // Body
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.roundRect(-sat.size * 0.5, -sat.size * 0.5, sat.size, sat.size, 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = sat.color;
        ctx.beginPath();
        ctx.arc(-sat.size * 0.2, -sat.size * 0.1, sat.size * 0.15, 0, Math.PI * 2);
        ctx.arc(sat.size * 0.2, -sat.size * 0.1, sat.size * 0.15, 0, Math.PI * 2);
        ctx.fill();

        // Antenna
        ctx.strokeStyle = sat.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -sat.size * 0.5);
        ctx.lineTo(0, -sat.size * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -sat.size * 0.9, 2, 0, Math.PI * 2);
        ctx.fillStyle = sat.color;
        ctx.fill();
      }

      ctx.restore();
    };

    // Render local player's upgrade satellites
    if (this.isUpgrading && this.upgradeSatellites.length > 0) {
      const target = this.getUpgradeTargetPosition();
      const targetX = target.x - camera.x;
      const targetY = target.y - camera.y;

      for (const sat of this.upgradeSatellites) {
        renderSatellite(sat, targetX, targetY);
      }
    }

    // Render other players' upgrade satellites
    for (const [playerId, upgradeData] of this.otherPlayerUpgrading) {
      const player = this.otherPlayers.find(p => p.id === playerId);
      if (!player) continue;

      // Get target position (player's ship or a planet)
      let target: { x: number; y: number };
      if (upgradeData.targetPlanetId) {
        const planet = this.state.planets.find(p => p.id === upgradeData.targetPlanetId);
        target = planet ? { x: planet.x, y: planet.y } : { x: player.x, y: player.y };
      } else {
        // Use interpolated position for smooth animation
        const renderState = this.renderStates.get(playerId);
        target = { x: renderState?.renderX ?? player.x, y: renderState?.renderY ?? player.y };
      }

      const targetX = target.x - camera.x;
      const targetY = target.y - camera.y;

      for (const sat of upgradeData.satellites) {
        renderSatellite(sat, targetX, targetY);
      }
    }
  }

  // Set equipped companions from App.tsx (rebuilds companion instances)
  public setEquippedCompanions(types: string[]) {
    const { ship } = this.state;
    // Preserve existing companion instances that are still equipped
    const existing = new Map<string, Companion>();
    for (const c of this.companions) {
      existing.set(c.type, c);
    }
    this.companions = types.map(type => {
      const prev = existing.get(type);
      if (prev) return prev;
      return {
        type,
        worldX: ship.x + (Math.random() - 0.5) * 60,
        worldY: ship.y + (Math.random() - 0.5) * 60,
        prevWorldX: ship.x,
        prevWorldY: ship.y,
        vx: 0,
        vy: 0,
        wobble: Math.random() * Math.PI * 2,
        angle: Math.random() * Math.PI * 2,
        timer: 0,
        stateFlag: 0,
        idleWanderTarget: null,
        alpha: 1,
      };
    });
  }

  // Set companion eggs from App.tsx (rebuilds egg instances)
  public setCompanionEggs(eggs: { companionId: string; planetsNeeded: number; planetsCompleted: number; purchasedAt: number }[]) {
    const { ship } = this.state;
    const existing = new Map<string, typeof this.companionEggInstances[0]>();
    for (const e of this.companionEggInstances) {
      existing.set(e.companionId, e);
    }
    this.companionEggInstances = eggs.map(egg => {
      const prev = existing.get(egg.companionId);
      if (prev) return prev;
      return {
        companionId: egg.companionId,
        worldX: ship.x + (Math.random() - 0.5) * 60,
        worldY: ship.y + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        wobble: Math.random() * Math.PI * 2,
      };
    });
  }

  // Trigger hatch animation at egg position, then remove egg instance
  public triggerHatchAnimation(companionId: string) {
    const egg = this.companionEggInstances.find(e => e.companionId === companionId);
    const def = COMPANION_DEFS.find(d => d.id === companionId);
    const x = egg?.worldX ?? this.state.ship.x;
    const y = egg?.worldY ?? this.state.ship.y;
    const color = def?.color ?? '#ffffff';

    // Burst of colored particles
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.random() * 20,
        maxLife: 45,
        size: 2 + Math.random() * 4,
        color: Math.random() > 0.5 ? color : '#ffffff',
      });
    }

    // White flash ring animation
    this.hatchAnimations.push({ companionId, x, y, timer: 0, maxTimer: 30, color });

    // Remove egg instance
    this.companionEggInstances = this.companionEggInstances.filter(e => e.companionId !== companionId);
  }

  // Update egg positions (follow ship/companions chain)
  private updateEggPositions() {
    if (this.companionEggInstances.length === 0 || this.shipBeingSucked) return;
    const { ship } = this.state;

    // Eggs follow after the last companion in the chain (or ship if no companions)
    for (let i = 0; i < this.companionEggInstances.length; i++) {
      const egg = this.companionEggInstances[i];
      egg.wobble += 0.04 * this.dt;

      let targetX: number;
      let targetY: number;

      if (i === 0 && this.companions.length > 0) {
        // Follow last companion
        const last = this.companions[this.companions.length - 1];
        const dx = egg.worldX - last.worldX;
        const dy = egg.worldY - last.worldY;
        const angle = Math.atan2(dy, dx);
        targetX = last.worldX + Math.cos(angle) * 30;
        targetY = last.worldY + Math.sin(angle) * 30;
      } else if (i === 0) {
        // Follow ship directly
        const backAngle = ship.rotation + Math.PI;
        targetX = ship.x + Math.cos(backAngle) * 50;
        targetY = ship.y + Math.sin(backAngle) * 50;
      } else {
        // Follow previous egg
        const prev = this.companionEggInstances[i - 1];
        const dx = egg.worldX - prev.worldX;
        const dy = egg.worldY - prev.worldY;
        const angle = Math.atan2(dy, dx);
        targetX = prev.worldX + Math.cos(angle) * 28;
        targetY = prev.worldY + Math.sin(angle) * 28;
      }

      // Gentle wobble
      targetX += Math.sin(egg.wobble) * 3;
      targetY += Math.cos(egg.wobble * 1.3) * 3;

      const dx = targetX - egg.worldX;
      const dy = targetY - egg.worldY;
      egg.vx += dx * 0.06 * this.dt;
      egg.vy += dy * 0.06 * this.dt;
      egg.vx *= Math.pow(0.85, this.dt);
      egg.vy *= Math.pow(0.85, this.dt);
      egg.worldX += egg.vx * this.dt;
      egg.worldY += egg.vy * this.dt;
    }
  }

  // Render eggs following the ship
  private renderEggs() {
    if (this.companionEggInstances.length === 0 || this.shipBeingSucked) return;
    const { ctx, state } = this;
    const { camera } = state;

    for (const egg of this.companionEggInstances) {
      const screenX = egg.worldX - camera.x;
      const screenY = egg.worldY - camera.y;
      if (screenX < -50 || screenX > this.canvas.width + 50 || screenY < -50 || screenY > this.canvas.height + 50) continue;

      const def = COMPANION_DEFS.find(d => d.id === egg.companionId);
      const glowColor = def?.glowColor ?? '#aaaaff';
      const pulseIntensity = 8 + Math.sin(Date.now() * 0.005 + egg.wobble) * 4;

      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = pulseIntensity;

      if (this.eggImage) {
        ctx.drawImage(this.eggImage, screenX - 16, screenY - 16, 32, 32);
      } else {
        // Fallback: glowing oval
        ctx.fillStyle = glowColor + '88';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, 8, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Render hatch flash animations
  private renderHatchAnimations() {
    if (this.hatchAnimations.length === 0) return;
    const { ctx, state } = this;
    const { camera } = state;

    for (let i = this.hatchAnimations.length - 1; i >= 0; i--) {
      const anim = this.hatchAnimations[i];
      anim.timer += this.dt;
      const progress = anim.timer / anim.maxTimer;
      if (progress >= 1) {
        this.hatchAnimations.splice(i, 1);
        continue;
      }

      const screenX = anim.x - camera.x;
      const screenY = anim.y - camera.y;
      const radius = 20 + progress * 60;
      const alpha = 1 - progress;

      ctx.save();
      ctx.strokeStyle = anim.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3 * (1 - progress);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20 * alpha;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Get idle wander offset for a companion based on its type
  // Called only when ship is stationary so each type has a unique idle personality
  private getCompanionIdleOffset(c: Companion): { ox: number; oy: number } {
    switch (c.type) {
      case 'spark': {
        // Zigzag firefly — picks random offset every 20-40 frames
        c.timer += this.dt;
        if (c.timer > 20 + c.stateFlag * 20) {
          c.timer = 0;
          c.stateFlag = Math.random();
          c.idleWanderTarget = { x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 50 };
        }
        const w = c.idleWanderTarget;
        return w ? { ox: w.x, oy: w.y } : { ox: 0, oy: 0 };
      }
      case 'nibbles': {
        // Frantic tiny circles
        c.angle += 0.15 * this.dt;
        return { ox: Math.cos(c.angle) * 18, oy: Math.sin(c.angle) * 18 };
      }
      case 'astro_frog': {
        // Discrete hops with pauses
        c.timer += this.dt;
        if (c.timer > 45) {
          c.timer = 0;
          c.idleWanderTarget = { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60 };
        }
        if (c.timer < 10 && c.idleWanderTarget) return { ox: c.idleWanderTarget.x, oy: c.idleWanderTarget.y };
        return { ox: 0, oy: 0 };
      }
      case 'void_kitten': {
        // Alpha flickers, stays very close
        c.alpha = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() * 0.008 + c.wobble * 10));
        return { ox: Math.sin(c.wobble) * 8, oy: Math.cos(c.wobble * 1.3) * 8 };
      }
      case 'jellybloom': {
        // Lazy sine-wave drift
        c.wobble += 0.02 * this.dt;
        return { ox: Math.sin(c.wobble) * 30, oy: Math.cos(c.wobble * 0.7) * 20 };
      }
      case 'frost_sprite': {
        // Hover still, then dart to new position
        c.timer += this.dt;
        if (c.timer > 70) {
          c.timer = 0;
          c.idleWanderTarget = { x: (Math.random() - 0.5) * 80, y: (Math.random() - 0.5) * 80 };
        }
        const fw = c.idleWanderTarget;
        return fw ? { ox: fw.x, oy: fw.y } : { ox: 0, oy: 0 };
      }
      case 'pixel_ghost': {
        // Random drift, phases in/out
        c.wobble += 0.015 * this.dt;
        c.alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(c.wobble * 3));
        return { ox: Math.sin(c.wobble * 2.1) * 25, oy: Math.cos(c.wobble * 1.9) * 25 };
      }
      case 'comet_fox': {
        // Fast tight orbit
        c.angle += 0.12 * this.dt;
        return { ox: Math.cos(c.angle) * 35, oy: Math.sin(c.angle) * 35 };
      }
      case 'crystal_bat': {
        // Swoops out, snaps back
        c.timer += this.dt;
        const swoopCycle = c.timer % 80;
        if (swoopCycle < 30) {
          const swoopDist = 50 + 40 * (swoopCycle / 30);
          return { ox: Math.cos(c.angle + c.timer * 0.05) * swoopDist, oy: Math.sin(c.angle + c.timer * 0.05) * swoopDist };
        }
        return { ox: 0, oy: 0 };
      }
      case 'flame_wisp': {
        // Expanding spiral, ember particles
        c.timer += this.dt;
        const spiralR = 20 + (c.timer % 100) * 0.5;
        c.angle += 0.08 * this.dt;
        if (Math.random() < 0.3) {
          this.state.particles.push({
            x: c.worldX, y: c.worldY,
            vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5 - 0.5,
            life: 15 + Math.random() * 10, maxLife: 25,
            size: Math.random() * 3 + 1,
            color: Math.random() > 0.5 ? '#ff4422' : '#ff8844',
          });
        }
        return { ox: Math.cos(c.angle) * spiralR, oy: Math.sin(c.angle) * spiralR };
      }
      case 'baby_black_hole': {
        // Medium orbit
        c.angle += 0.04 * this.dt;
        return { ox: Math.cos(c.angle) * 50, oy: Math.sin(c.angle) * 50 };
      }
      case 'golden_scarab': {
        // Slow dignified orbit, gold particles
        c.angle += 0.025 * this.dt;
        if (Math.random() < 0.25) {
          this.state.particles.push({
            x: c.worldX, y: c.worldY,
            vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
            life: 20 + Math.random() * 15, maxLife: 35,
            size: Math.random() * 2.5 + 1,
            color: Math.random() > 0.5 ? '#ffd700' : '#ffaa00',
          });
        }
        return { ox: Math.cos(c.angle) * 45, oy: Math.sin(c.angle) * 45 };
      }
      case 'cosmic_dragon': {
        // Sweeping figure-8 orbit
        c.angle += 0.03 * this.dt;
        const fx = Math.sin(c.angle) * 80;
        const fy = Math.sin(c.angle * 2) * 40;
        return { ox: fx, oy: fy };
      }
      case 'phoenix_eternal': {
        // Slow majestic wide circle
        c.angle += 0.02 * this.dt;
        return { ox: Math.cos(c.angle) * 90, oy: Math.sin(c.angle) * 90 };
      }
      case 'void_leviathan': {
        // Undulating serpentine drift
        c.wobble += 0.015 * this.dt;
        return { ox: Math.sin(c.wobble) * 70, oy: Math.cos(c.wobble * 0.6) * 50 };
      }
      default:
        return { ox: 0, oy: 0 };
    }
  }

  // Update companion positions (called each frame)
  // Chain-follow when ship is moving, idle personality when stationary.
  // Each companion follows the one in front, with increasing elasticity further back.
  private updateCompanionPositions() {
    if (this.companions.length === 0 || this.shipBeingSucked) return;

    const { ship } = this.state;
    const shipSpeed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    // 0 = fully idle, 1 = fully chaining
    const moveBlend = Math.min(shipSpeed / 2.5, 1);

    const total = this.companions.length;
    for (let i = 0; i < total; i++) {
      const c = this.companions[i];

      // Update wobble (always ticking for organic feel)
      c.wobble += (0.03 + i * 0.005) * this.dt;

      // ── Chain target: follow ship (first) or previous companion ──
      let chainX: number;
      let chainY: number;
      if (i === 0) {
        const backAngle = ship.rotation + Math.PI;
        const followDist = 50;
        chainX = ship.x + Math.cos(backAngle) * followDist;
        chainY = ship.y + Math.sin(backAngle) * followDist;
      } else {
        const leader = this.companions[i - 1];
        const dx = c.worldX - leader.worldX;
        const dy = c.worldY - leader.worldY;
        const angleToLeader = Math.atan2(dy, dx);
        const followDist = 32;
        chainX = leader.worldX + Math.cos(angleToLeader) * followDist;
        chainY = leader.worldY + Math.sin(angleToLeader) * followDist;
      }

      // ── Idle target: ship position + type-specific personality offset ──
      // Always update idle behaviors (timers, angles) so they stay alive
      const idleOffset = this.getCompanionIdleOffset(c);
      const { ox, oy } = idleOffset;
      // Spread idle companions around ship so they don't stack
      const idleAngle = (Math.PI * 2 * i) / Math.max(total, 1) + c.wobble * 0.1;
      const idleBaseDist = 60;
      const idleX = ship.x + Math.cos(idleAngle) * idleBaseDist + ox;
      const idleY = ship.y + Math.sin(idleAngle) * idleBaseDist + oy;

      // ── Blend between chain and idle based on ship speed ──
      const targetX = chainX * moveBlend + idleX * (1 - moveBlend);
      const targetY = chainY * moveBlend + idleY * (1 - moveBlend);

      // Add small wobble for organic movement
      const wobbleX = Math.sin(c.wobble) * 2;
      const wobbleY = Math.cos(c.wobble * 1.3) * 2;

      // Store previous position
      c.prevWorldX = c.worldX;
      c.prevWorldY = c.worldY;

      // Distance to target
      const dx = (targetX + wobbleX) - c.worldX;
      const dy = (targetY + wobbleY) - c.worldY;

      // Increasing elasticity for companions further back in chain
      // First companion is snappy, later ones are increasingly laggy/elastic
      const elasticityFactor = 1 + (i * 0.6); // 1.0, 1.6, 2.2, 2.8, ...
      const baseSpringK = 0.1;
      const baseDamping = 0.8;

      const springK = baseSpringK / elasticityFactor;
      const damping = Math.min(baseDamping + (i * 0.03), 0.92);

      c.vx += dx * springK * this.dt;
      c.vy += dy * springK * this.dt;
      c.vx *= Math.pow(damping, this.dt);
      c.vy *= Math.pow(damping, this.dt);

      c.worldX += c.vx * this.dt;
      c.worldY += c.vy * this.dt;

      // Emit trail particles based on speed
      const cSpeed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      if (cSpeed > 0.5 && Math.random() > 0.6) {
        const def = COMPANION_DEFS.find(d => d.id === c.type);
        if (def) {
          const moveAngle = Math.atan2(c.vy, c.vx) + Math.PI;
          this.state.particles.push({
            x: c.worldX + Math.cos(moveAngle) * 5,
            y: c.worldY + Math.sin(moveAngle) * 5,
            vx: Math.cos(moveAngle) * 0.8 - c.vx * 0.1,
            vy: Math.sin(moveAngle) * 0.8 - c.vy * 0.1,
            life: 12 + Math.random() * 8,
            maxLife: 20,
            size: Math.random() * 3 + 1,
            color: def.color,
          });
        }
      }
    }
  }

  // Render companions as glowing orbs
  private renderCompanions() {
    const { ctx, state } = this;
    const { camera } = state;

    if (this.companions.length === 0 || this.shipBeingSucked) return;

    for (const c of this.companions) {
      const def = COMPANION_DEFS.find(d => d.id === c.type);
      if (!def) continue;

      const screenX = c.worldX - camera.x;
      const screenY = c.worldY - camera.y;
      const isLegendary = def.isLegendary ?? false;
      const margin = isLegendary ? 200 : 50;

      // Off-screen check
      if (screenX < -margin || screenX > this.canvas.width + margin || screenY < -margin || screenY > this.canvas.height + margin) continue;

      ctx.save();
      ctx.globalAlpha = c.alpha;

      const size = def.size;
      const img = this.companionImages.get(c.type);

      // Determine colors (Crystal Bat cycles hue)
      let glowColor = def.glowColor;
      if (c.type === 'crystal_bat') {
        const hue = (Date.now() * 0.1 + c.wobble * 100) % 360;
        glowColor = `hsl(${hue}, 80%, 50%)`;
      }

      // Mini Nomad: Nomad-style pulsing magenta/cyan underglow
      if (c.type === 'mini_nomad') {
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.003 + c.wobble);
        const auraRadius = size * 3;
        const grad = ctx.createRadialGradient(screenX, screenY, 5, screenX, screenY, auraRadius);
        grad.addColorStop(0, `rgba(255, 0, 255, ${0.3 * pulse})`);
        grad.addColorStop(0.4, `rgba(0, 255, 255, ${0.15 * pulse})`);
        grad.addColorStop(0.7, `rgba(255, 165, 0, ${0.08 * pulse})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, auraRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Legendary pulsing glow aura
      if (isLegendary) {
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.003 + c.wobble);
        const auraRadius = size * 4 * 0.7;
        const grad = ctx.createRadialGradient(screenX, screenY, auraRadius * 0.3, screenX, screenY, auraRadius);
        grad.addColorStop(0, glowColor + '44');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = pulse * 0.5;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, auraRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = c.alpha;

        // Legendary particles
        if (Math.random() < 0.4) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * size * 2;
          this.state.particles.push({
            x: c.worldX + Math.cos(angle) * dist,
            y: c.worldY + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 1.2,
            vy: (Math.random() - 0.5) * 1.2 - 0.3,
            life: 15 + Math.random() * 15,
            maxLife: 30,
            size: 1.5 + Math.random() * 3,
            color: Math.random() > 0.5 ? def.color : '#ffd700',
          });
        }
      }

      if (img) {
        // Render with image sprite
        const renderSize = size * 4; // Images are larger than the orb radius
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isLegendary ? 25 : (c.type === 'mini_nomad' ? 20 : 14);
        // Mini Nomad gets lowrider bounce like the boss
        let imgY = screenY;
        if (c.type === 'mini_nomad') {
          const beatPhase = (Date.now() / 1000) * (40 / 60) * Math.PI * 2;
          imgY -= Math.abs(Math.sin(beatPhase)) * 3;
        }
        ctx.drawImage(img, screenX - renderSize / 2, imgY - renderSize / 2, renderSize, renderSize);
      } else {
        // Fallback: glowing orb
        let color = def.color;
        if (c.type === 'crystal_bat') {
          const hue = (Date.now() * 0.1 + c.wobble * 100) % 360;
          color = `hsl(${hue}, 90%, 70%)`;
        }

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isLegendary ? 25 : 12;

        if (c.type === 'baby_black_hole') {
          const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size);
          grad.addColorStop(0, '#111122');
          grad.addColorStop(0.5, '#333355');
          grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.6)');
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, color);
          grad.addColorStop(0.7, glowColor + 'aa');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  private emitThrustParticles(isBoosting: boolean = false) {
    const { ship } = this.state;
    const backAngle = ship.rotation + Math.PI;
    const trailType = this.shipEffects.trailType;

    // More particles for special trails
    let particleCount = isBoosting ? 5 : 2;
    if (trailType !== 'default') {
      particleCount = isBoosting ? 7 : 4;
    }

    for (let i = 0; i < particleCount; i++) {
      const spread = (Math.random() - 0.5) * (isBoosting ? 0.8 : 0.6);
      const speed = Math.random() * (isBoosting ? 5 : 3) + (isBoosting ? 4 : 2);

      // Choose colors based on trail type
      let colors: string[];
      let life: number;
      let size: number;

      switch (trailType) {
        case 'fire':
          colors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00'];
          life = isBoosting ? 40 + Math.random() * 25 : 30 + Math.random() * 20;
          size = Math.random() * (isBoosting ? 8 : 6) + (isBoosting ? 5 : 4);
          break;
        case 'ice':
          colors = ['#88ddff', '#aaeeff', '#ccffff', '#ffffff', '#66ccff'];
          life = isBoosting ? 45 + Math.random() * 20 : 35 + Math.random() * 15;
          size = Math.random() * (isBoosting ? 6 : 4) + (isBoosting ? 3 : 2);
          break;
        case 'rainbow':
          colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];
          life = isBoosting ? 50 + Math.random() * 30 : 40 + Math.random() * 20;
          size = Math.random() * (isBoosting ? 7 : 5) + (isBoosting ? 4 : 3);
          break;
        case 'plasma':
          colors = ['#cc44ff', '#aa22dd', '#ee66ff', '#8800cc', '#ff88ff'];
          life = isBoosting ? 55 + Math.random() * 25 : 40 + Math.random() * 20;
          size = Math.random() * (isBoosting ? 9 : 7) + (isBoosting ? 5 : 4);
          break;
        case 'star':
          colors = ['#ffd700', '#ffec80', '#fff4cc', '#ffaa00', '#ffe44d'];
          life = isBoosting ? 60 + Math.random() * 30 : 50 + Math.random() * 25;
          size = Math.random() * (isBoosting ? 5 : 3) + (isBoosting ? 2 : 1.5);
          break;
        default:
          colors = isBoosting
            ? ['#00ffff', '#00ccff', '#ffffff', '#88ffff']
            : ['#ffa500', '#ff6b4a', '#ffcc00', '#ff4500'];
          life = isBoosting ? 35 + Math.random() * 20 : 25 + Math.random() * 15;
          size = Math.random() * (isBoosting ? 7 : 5) + (isBoosting ? 4 : 3);
      }

      this.state.particles.push({
        x: ship.x + Math.cos(backAngle) * 18,
        y: ship.y + Math.sin(backAngle) * 18,
        vx: Math.cos(backAngle + spread) * speed + ship.vx * 0.3,
        vy: Math.sin(backAngle + spread) * speed + ship.vy * 0.3,
        life: life,
        maxLife: isBoosting ? 55 : 40,
        size: size,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  private emitCollisionParticles(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 10,
        maxLife: 30,
        size: Math.random() * 3 + 1,
        color: '#ffffff',
      });
    }
  }

  private render() {
    const { ctx, canvas, state } = this;
    const { camera, ship, planets, stars, particles, dockingPlanet } = state;

    // Get zone color blend for background/star tinting
    const zoneColor = this.getZoneColorBlend();

    // Helper to blend a base color with zone color
    const blendWithZone = (baseR: number, baseG: number, baseB: number): string => {
      const r = Math.round(baseR + (zoneColor.r - baseR) * zoneColor.intensity);
      const g = Math.round(baseG + (zoneColor.g - baseG) * zoneColor.intensity);
      const b = Math.round(baseB + (zoneColor.b - baseB) * zoneColor.intensity);
      return `rgb(${r}, ${g}, ${b})`;
    };

    // Clear with gradient (tinted by zone color)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, blendWithZone(10, 10, 21));   // #0a0a15
    bgGradient.addColorStop(0.5, blendWithZone(15, 15, 26)); // #0f0f1a
    bgGradient.addColorStop(1, blendWithZone(10, 10, 18));   // #0a0a12
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars with parallax (some tinted by zone color)
    for (const star of stars) {
      const parallax = 0.2 + star.layer * 0.25;
      const x = star.x - camera.x * parallax;
      const y = star.y - camera.y * parallax;

      const wrappedX = ((x % canvas.width) + canvas.width) % canvas.width;
      const wrappedY = ((y % canvas.height) + canvas.height) % canvas.height;

      ctx.beginPath();
      ctx.arc(wrappedX, wrappedY, star.size, 0, Math.PI * 2);

      // Tint some stars with zone color (based on layer - closer stars get more tint)
      if (star.layer > 1 && zoneColor.intensity > 0.02) {
        const starTint = zoneColor.intensity * 2 * star.layer;
        const sr = Math.round(255 + (zoneColor.r - 255) * starTint);
        const sg = Math.round(255 + (zoneColor.g - 255) * starTint);
        const sb = Math.round(255 + (zoneColor.b - 255) * starTint);
        ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${star.brightness})`;
      } else {
        ctx.fillStyle = star.color || `rgba(255, 255, 255, ${star.brightness})`;
      }

      ctx.globalAlpha = star.brightness;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw space whale (deep background, behind everything)
    this.renderSpaceWhale();

    // Draw Neon Nomad (roaming merchant, behind planets)
    this.renderNeonNomad();
    this.renderNomadLootCrate();

    // Draw The Hatchery (companion merchant, behind planets)
    this.renderHatchery();

    // Draw shooting stars (behind everything, just above stars)
    this.renderShootingStars();

    // Draw speed lines when going fast
    this.renderSpeedLines();

    // Draw zone backgrounds and boundaries
    this.drawZones();

    // Draw path lines between planets of same type
    this.drawPathLines();

    // Draw planets
    for (const planet of planets) {
      this.drawPlanet(planet);
    }

    // Draw Mission Control Portal (if owned)
    this.renderPortal();

    // Draw black hole
    this.drawBlackHole();

    // Draw particles
    for (const p of particles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(x, y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw projectiles (space rifle bullets) — local + remote
    this.renderProjectiles();
    this.renderRemoteProjectiles();

    // Draw plasma projectiles — local + remote
    this.renderPlasmaProjectiles();
    this.renderRemotePlasmaProjectiles();

    // Draw rockets — local + remote
    this.renderRockets();
    this.renderRemoteRockets();

    // Draw nuclear bomb alarm + flight
    this.renderNukeAlarm();
    this.renderNuclearBomb();

    // Draw nomad boss fight projectiles
    this.renderNomadProjectiles();

    // Draw other players' ships (behind local ship)
    this.renderOtherPlayers();

    // Draw emote effects on ships (local + remote)
    this.renderEmoteEffects();

    // Draw local ship (hide during nomad death animation)
    if (!(this.nomadFight?.defeatTimer && this.nomadFight.defeatTimer > 0)) {
      this.drawShip();
    }

    // Draw companions (following pets)
    this.renderCompanions();

    // Draw companion eggs
    this.renderEggs();
    this.renderHatchAnimations();

    // Draw upgrade satellites/robots orbiting the ship
    this.renderUpgradeSatellites();

    // Draw claim animation (laser beam + teleport effect)
    if (this.isClaiming) {
      this.renderClaimAnimation();
    }

    // Draw destroy animation (explosion effect)
    if (this.isDestroying) {
      this.renderDestroyAnimation();
    }

    // Draw remote destroy animations from other players
    this.renderRemoteDestroyAnimations();

    // Draw send/reassign animation (balloon deflate effect)
    if (this.isSending) {
      this.renderSendAnimation();
    }

    // Draw remote send animations from other players
    this.renderRemoteSendAnimations();

    // Draw planet info panel when nearby OR landed panel when on planet
    // Station planets (shop-station, planet-builder, user-planet-*) don't show the landed panel - they only have shop functionality
    if (this.isLanded && this.landedPlanet) {
      const isStation = this.landedPlanet.id === 'shop-station' || this.landedPlanet.id === 'planet-builder' || this.landedPlanet.id === 'control-hub' || this.landedPlanet.id.startsWith('user-planet-');
      if (!isStation && !this.suppressLandedPanel) {
        this.drawLandedPanel(this.landedPlanet);
      }
    } else if (state.nearbyPlanet) {
      this.drawPlanetInfo(state.nearbyPlanet, state.dockingPlanet !== null);
    }

    // Draw minimap
    this.drawMinimap();

    // Draw nomad boss fight HUD (HP bars, victory text)
    this.renderNomadFightHUD();

    // Draw zone title when entering a new zone
    if (this.zoneTitleOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = this.zoneTitleOpacity;
      ctx.font = 'bold 32px Space Grotesk';
      ctx.textAlign = 'center';

      const titleY = canvas.height * 0.25; // 1/4 from top

      // Draw text shadow/glow
      ctx.shadowColor = this.zoneTitleColor;
      ctx.shadowBlur = 20;
      ctx.fillStyle = this.zoneTitleColor;
      ctx.fillText(this.zoneTitleText, canvas.width / 2, titleY);

      // Draw text again for more brightness
      ctx.shadowBlur = 10;
      ctx.fillText(this.zoneTitleText, canvas.width / 2, titleY);

      ctx.restore();
    }

    // Draw idle ship particles
    this.renderIdleEffect();

    // Draw completion glow
    this.renderCompletionEffects();

    // Draw milestone/achievement text
    this.renderMilestoneText();

    // Draw Konami code effect
    if (this.konamiActivated) {
      this.renderKonamiEffect();
    }

    // Draw nuclear bomb detonation (ON TOP of everything)
    this.renderNukeDetonation();

    // Draw warp home animation ON TOP of everything (including UI)
    if (this.isWarping) {
      this.renderWarpAnimation();
    }

    // Draw portal teleport animation ON TOP of everything (including UI)
    if (this.isPortalTeleporting) {
      this.renderPortalAnimation();
    }

    // Steve Irwin popup ON TOP of absolutely everything
    this.renderSteveIrwinPopup();
  }

  // Get the current zone color blend based on ship position
  private getZoneColorBlend(): { r: number; g: number; b: number; intensity: number } {
    const { ship } = this.state;

    // Find distances to all zone centers
    const zoneDistances: { zone: Zone; distance: number }[] = ZONES.map(zone => {
      const dx = ship.x - zone.centerX;
      const dy = ship.y - zone.centerY;
      return { zone, distance: Math.sqrt(dx * dx + dy * dy) };
    });

    // Sort by distance
    zoneDistances.sort((a, b) => a.distance - b.distance);

    const closest = zoneDistances[0];
    const zoneRadius = closest.zone.id === 'central' ? ZONE_SIZE * 0.6 : ZONE_SIZE * 0.8;

    // If in central zone, return neutral
    if (closest.zone.id === 'central') {
      return { r: 255, g: 255, b: 255, intensity: 0.02 };
    }

    // Parse hex color to RGB
    const hex = closest.zone.color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Calculate intensity based on how deep into the zone we are
    // Full intensity at center, fading toward edges - kept subtle
    const distanceRatio = Math.min(1, closest.distance / zoneRadius);
    const intensity = Math.max(0, 0.035 * (1 - distanceRatio * 0.7));

    return { r, g, b, intensity };
  }

  private drawZones() {
    // Zone visuals are now handled via background tint and star colors
    // This method is kept for potential future zone indicators
  }

  // Get all positions where an object should be rendered for seamless wrapping
  private getWrappedPositions(worldX: number, worldY: number, objectRadius: number): { x: number; y: number }[] {
    const { camera } = this.state;
    const positions: { x: number; y: number }[] = [];
    const margin = objectRadius + 200; // Buffer for visibility

    // Check all 9 possible positions (original + 8 wrapped)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const wrappedWorldX = worldX + dx * WORLD_SIZE;
        const wrappedWorldY = worldY + dy * WORLD_SIZE;
        const screenX = wrappedWorldX - camera.x;
        const screenY = wrappedWorldY - camera.y;

        // Only include if potentially visible on screen
        if (screenX > -margin && screenX < this.canvas.width + margin &&
            screenY > -margin && screenY < this.canvas.height + margin) {
          positions.push({ x: screenX, y: screenY });
        }
      }
    }

    return positions;
  }

  private drawPathLines() {
    const { ctx, state } = this;
    const { camera, planets } = state;

    const planetsByType: Record<string, Planet[]> = { business: [], product: [], achievement: [], notion: [] };
    planets.forEach(p => {
      if (planetsByType[p.type]) {
        planetsByType[p.type].push(p);
      }
    });

    // Sort by targetDate for dated planets (business/product), fallback to ID order
    const extractNumber = (id: string): number => {
      const match = id.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    Object.values(planetsByType).forEach(group => {
      group.sort((a, b) => {
        const aDate = (a as any).targetDate;
        const bDate = (b as any).targetDate;
        if (aDate && bDate) return aDate.localeCompare(bDate);
        if (aDate) return -1;
        if (bDate) return 1;
        return extractNumber(a.id) - extractNumber(b.id);
      });
    });

    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);

    // Business path (green)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.15)';
    this.drawPath(planetsByType.business);

    // Product path (blue)
    ctx.strokeStyle = 'rgba(84, 144, 255, 0.15)';
    this.drawPath(planetsByType.product);

    ctx.setLineDash([]);
  }

  private drawPath(planets: Planet[]) {
    const { ctx, state } = this;
    const { camera } = state;

    if (planets.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(planets[0].x - camera.x, planets[0].y - camera.y);
    for (let i = 1; i < planets.length; i++) {
      ctx.lineTo(planets[i].x - camera.x, planets[i].y - camera.y);
    }
    ctx.stroke();
  }

  private wrapText(text: string, maxWidth: number, maxLines: number = 2): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;

        if (lines.length >= maxLines) {
          // Truncate last line with ellipsis
          const lastLine = lines[lines.length - 1];
          let truncated = lastLine;
          while (this.ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          lines[lines.length - 1] = truncated + '...';
          return lines;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      if (lines.length >= maxLines) {
        // Already at max lines, need to append to last line with truncation
        const combined = lines[lines.length - 1] + ' ' + currentLine;
        let truncated = combined;
        while (this.ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        lines[lines.length - 1] = truncated + '...';
      } else {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  private drawPlanet(planet: Planet) {
    // Draw planet at all wrapped positions for seamless world wrapping
    const positions = this.getWrappedPositions(planet.x, planet.y, planet.radius * 2.5);
    for (const pos of positions) {
      this.drawPlanetAt(planet, pos.x, pos.y);
    }
  }

  private drawPlanetAt(planet: Planet, origX: number, origY: number) {
    const { ctx } = this;

    // Check for damage effects (shake and cracks from space rifle)
    const damageEffects = this.planetDamageEffects.get(planet.id);
    let x = origX;
    let y = origY;

    if (damageEffects) {
      // Apply shake
      if (damageEffects.shakeOffset > 0) {
        x += (Math.random() - 0.5) * damageEffects.shakeOffset;
        y += (Math.random() - 0.5) * damageEffects.shakeOffset;
        damageEffects.shakeOffset *= 0.85; // Decay shake
      }
    }

    const style = (planet as any).style || { baseColor: planet.color, accent: planet.color };

    // Check if this is a custom planet with an image
    const customPlanetImage = this.customPlanetImages.get(planet.id);
    const hasCustomImage = !!customPlanetImage;

    // Check if this is a user planet with a terraformed image
    const isUserPlanet = planet.id.startsWith('user-planet-');
    const userId = isUserPlanet ? planet.id.replace('user-planet-', '') : null;
    const userPlanetImage = userId ? this.userPlanetImages.get(userId) : null;

    // Check if this is a Notion planet with special effects
    const isNotionPlanet = planet.type === 'notion';
    const taskType = (planet as any).taskType?.toLowerCase() || '';
    const priority = planet.priority?.toLowerCase() || '';
    const isCritical = priority.includes('critical') || priority.includes('🧨');
    const isHigh = priority.includes('high') || priority.includes('🔥');
    const isBug = taskType === 'bug';
    const isFeature = taskType === 'feature' || taskType === 'enhancement';

    // Get Notion type image if available
    const notionTypeImage = isNotionPlanet ? this.notionTypeImages.get(taskType) || this.notionTypeImages.get('task') : null;

    // Pulsing glow for critical priority
    const pulseIntensity = isCritical ? 0.3 + Math.sin(Date.now() * 0.005) * 0.2 : 0;
    const glowMultiplier = isCritical ? 3.5 : (isHigh ? 3 : 2.5);

    // Glow
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, planet.radius * glowMultiplier);
    const glowAlpha = isCritical ? Math.floor((0.4 + pulseIntensity) * 255).toString(16).padStart(2, '0') : '40';
    glowGradient.addColorStop(0, style.baseColor + glowAlpha);
    glowGradient.addColorStop(0.5, style.baseColor + '15');
    glowGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(x, y, planet.radius * glowMultiplier, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Ring (if has ring and not custom image planet)
    if ((planet as any).hasRing && !hasCustomImage) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.3);
      ctx.beginPath();
      ctx.arc(0, 0, planet.radius * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = style.accent + '60';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = style.baseColor + '30';
      ctx.lineWidth = 4;
      ctx.arc(0, 0, planet.radius * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (userPlanetImage) {
      // Draw user's terraformed planet image - use circular clip for perfect centering
      // Size increased by 10% to compensate for image generation reduction
      const imgSize = planet.radius * 2.42;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, planet.radius * 1.21, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        userPlanetImage,
        x - imgSize / 2,
        y - imgSize / 2,
        imgSize,
        imgSize
      );
      ctx.restore();
    } else if (isUserPlanet && !userPlanetImage) {
      // Draw barren user planet with their color glow
      const barrenGradient = ctx.createRadialGradient(
        x - planet.radius * 0.3, y - planet.radius * 0.3, 0,
        x, y, planet.radius
      );
      barrenGradient.addColorStop(0, '#555');
      barrenGradient.addColorStop(0.5, '#3a3a3a');
      barrenGradient.addColorStop(1, '#222');

      ctx.beginPath();
      ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
      ctx.fillStyle = barrenGradient;
      ctx.fill();

      // Add some crater details for barren look
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 5; i++) {
        const craterX = x + (Math.sin(i * 1.5) * planet.radius * 0.5);
        const craterY = y + (Math.cos(i * 2) * planet.radius * 0.4);
        const craterR = planet.radius * (0.1 + Math.random() * 0.1);
        ctx.beginPath();
        ctx.arc(craterX, craterY, craterR, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // User color glow rim
      ctx.beginPath();
      ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
      ctx.strokeStyle = style.baseColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (hasCustomImage && !planet.completed) {
      // Draw custom planet image
      const imgSize = planet.radius * 2.5;
      ctx.drawImage(
        customPlanetImage!,
        x - imgSize / 2,
        y - imgSize / 2,
        imgSize,
        imgSize
      );
    } else if (notionTypeImage && !planet.completed) {
      // Draw Notion task type planet image
      const imgSize = planet.radius * 2.5;
      ctx.drawImage(
        notionTypeImage,
        x - imgSize / 2,
        y - imgSize / 2,
        imgSize,
        imgSize
      );
    } else {
      // Planet body with gradient
      const planetGradient = ctx.createRadialGradient(
        x - planet.radius * 0.3, y - planet.radius * 0.3, 0,
        x, y, planet.radius
      );
      planetGradient.addColorStop(0, style.baseColor);
      planetGradient.addColorStop(0.7, style.accent);
      planetGradient.addColorStop(1, style.accent + '80');

      ctx.beginPath();
      ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
      ctx.fillStyle = planet.completed ? '#2a2a35' : planetGradient;
      ctx.fill();

      // Surface details (craters/bands)
      if (!planet.completed) {
        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 3; i++) {
          const craterX = x + (Math.random() - 0.5) * planet.radius;
          const craterY = y + (Math.random() - 0.5) * planet.radius;
          const craterR = planet.radius * 0.15;
          ctx.beginPath();
          ctx.arc(craterX, craterY, craterR, 0, Math.PI * 2);
          ctx.fillStyle = style.accent;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }


    // Moon (if has moon)
    if ((planet as any).hasMoon && !planet.completed) {
      const moonAngle = Date.now() * 0.001;
      const moonDist = planet.radius * 1.8;
      const moonX = x + Math.cos(moonAngle) * moonDist;
      const moonY = y + Math.sin(moonAngle) * moonDist * 0.4;
      ctx.beginPath();
      ctx.arc(moonX, moonY, planet.radius * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#888';
      ctx.fill();
    }

    // Priority effects for Notion planets
    if (isNotionPlanet && !planet.completed) {
      const time = Date.now() * 0.001;

      if (isCritical) {
        // Meteor storm effect - meteors falling toward planet from all directions
        ctx.save();
        const meteorCount = 6;
        for (let i = 0; i < meteorCount; i++) {
          const angle = (i / meteorCount) * Math.PI * 2 + time * 0.5;
          const progress = ((time * 0.8 + i * 0.3) % 1);
          const startDist = planet.radius * 2.5;
          const endDist = planet.radius * 0.3;
          const dist = startDist - (startDist - endDist) * progress;

          const meteorX = x + Math.cos(angle) * dist;
          const meteorY = y + Math.sin(angle) * dist;
          const meteorSize = 4 + (1 - progress) * 4;

          // Meteor trail
          const trailLength = 15 * (1 - progress * 0.5);
          const trailX = meteorX + Math.cos(angle) * trailLength;
          const trailY = meteorY + Math.sin(angle) * trailLength;

          const gradient = ctx.createLinearGradient(trailX, trailY, meteorX, meteorY);
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(0.5, '#ff660066');
          gradient.addColorStop(1, '#ff4400');

          ctx.beginPath();
          ctx.moveTo(trailX, trailY);
          ctx.lineTo(meteorX, meteorY);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = meteorSize * 0.8;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Meteor head
          ctx.beginPath();
          ctx.arc(meteorX, meteorY, meteorSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffaa00';
          ctx.fill();
        }
        ctx.restore();

        // Flame aura overlay on top
        if (this.criticalFlameImage) {
          const flameSize = planet.radius * 3.5;
          const pulse = 1 + Math.sin(time * 4) * 0.1;
          ctx.globalAlpha = 0.8;
          ctx.drawImage(
            this.criticalFlameImage,
            x - (flameSize * pulse) / 2,
            y - (flameSize * pulse) / 2,
            flameSize * pulse,
            flameSize * pulse
          );
          ctx.globalAlpha = 1;
        }
      } else if (isHigh) {
        // Lightning storm effect - random lightning bolts around planet
        ctx.save();
        const boltCount = 3;
        for (let i = 0; i < boltCount; i++) {
          // Each bolt flickers at different times
          const boltPhase = (time * 3 + i * 1.7) % 1;
          const visible = boltPhase < 0.15; // Quick flash

          if (visible) {
            const angle = (i / boltCount) * Math.PI * 2 + Math.sin(time + i) * 0.5;
            const startDist = planet.radius * 1.8;
            const boltStartX = x + Math.cos(angle) * startDist;
            const boltStartY = y + Math.sin(angle) * startDist;
            const boltEndX = x + Math.cos(angle) * planet.radius * 0.5;
            const boltEndY = y + Math.sin(angle) * planet.radius * 0.5;

            // Draw jagged lightning bolt
            ctx.beginPath();
            ctx.moveTo(boltStartX, boltStartY);
            const segments = 4;
            for (let j = 1; j <= segments; j++) {
              const t = j / segments;
              const midX = boltStartX + (boltEndX - boltStartX) * t;
              const midY = boltStartY + (boltEndY - boltStartY) * t;
              const offset = j < segments ? (Math.random() - 0.5) * 15 : 0;
              ctx.lineTo(midX + offset, midY + offset);
            }
            ctx.strokeStyle = '#ffff88';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // Dated goal effects - rotating dashed ring + breathing glow
    const hasTargetDate = (planet as any).targetDate && !planet.completed &&
      (planet.type === 'business' || planet.type === 'product' || planet.type === 'achievement');
    if (hasTargetDate) {
      const targetDate = new Date((planet as any).targetDate + 'T00:00:00');
      const daysLeft = Math.ceil((targetDate.getTime() - Date.now()) / 86400000);
      const time = Date.now() * 0.001;

      // Breathing glow (white/cyan, slower than critical pulse)
      const breathAlpha = 0.12 + Math.sin(time * 1.5) * 0.06;
      const glowRadius = planet.radius * 2.2;
      const breathGlow = ctx.createRadialGradient(x, y, planet.radius * 0.8, x, y, glowRadius);
      const cyanTint = daysLeft <= 0 ? '#ff4444' : daysLeft <= 3 ? '#ffa500' : '#88eeff';
      breathGlow.addColorStop(0, cyanTint + Math.floor(breathAlpha * 255).toString(16).padStart(2, '0'));
      breathGlow.addColorStop(0.6, cyanTint + '08');
      breathGlow.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = breathGlow;
      ctx.fill();

      // Rotating dashed ring
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.3); // Slow rotation
      const ringRadius = planet.radius * 1.5;
      const dashCount = 16;
      const dashArc = (Math.PI * 2) / dashCount;
      const gapRatio = 0.4;
      ctx.strokeStyle = daysLeft <= 0 ? '#ff444488' : daysLeft <= 3 ? '#ffa50088' : '#ffffff44';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      for (let i = 0; i < dashCount; i++) {
        const startAngle = i * dashArc;
        const endAngle = startAngle + dashArc * (1 - gapRatio);
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, startAngle, endAngle);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw cracks on damaged planets (from space rifle)
    if (damageEffects && damageEffects.cracks > 0) {
      this.drawPlanetCracks(ctx, x, y, planet.radius, damageEffects.cracks);
    }

    // Flag if completed
    if (planet.completed && this.logoImage) {
      const flagX = x + planet.radius * 0.5;
      const flagY = y - planet.radius * 0.8;

      // Flag pole
      ctx.beginPath();
      ctx.moveTo(flagX, flagY + 30);
      ctx.lineTo(flagX, flagY - 15);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Flag with logo
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(flagX, flagY - 15, 25, 18);
      ctx.strokeStyle = '#ffa500';
      ctx.lineWidth = 1;
      ctx.strokeRect(flagX, flagY - 15, 25, 18);

      // Draw logo on flag
      ctx.drawImage(this.logoImage, flagX + 2, flagY - 13, 21, 14);
    }

    // Featured star indicator for pinned planets
    if (this.featuredPlanetIds.has(planet.id)) {
      const starX = x - planet.radius * 0.7;
      const starY = y - planet.radius - 12;
      ctx.save();
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 8;
      ctx.fillText('★', starX, starY);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // "NEW" badge for unseen notion planets
    if (planet.isNew && !planet.completed) {
      const time = Date.now() * 0.001;
      ctx.save();

      // Pulsing cyan ring (rotating dashed)
      ctx.translate(x, y);
      ctx.rotate(time * 0.6);
      const ringRadius = planet.radius * 1.6;
      const dashCount = 12;
      const dashArc = (Math.PI * 2) / dashCount;
      const gapRatio = 0.35;
      const ringAlpha = 0.5 + Math.sin(time * 3) * 0.2;
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < dashCount; i++) {
        const startAngle = i * dashArc;
        const endAngle = startAngle + dashArc * (1 - gapRatio);
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, startAngle, endAngle);
        ctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      ctx.restore();

      // "NEW" badge above planet
      ctx.save();
      const badgeX = x;
      const badgeY = y - planet.radius - 18;
      const badgeAlpha = 0.7 + Math.sin(time * 4) * 0.3;
      ctx.globalAlpha = badgeAlpha;

      // Badge background
      const badgeW = 32;
      const badgeH = 14;
      ctx.fillStyle = '#00cccc';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Badge text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEW', badgeX, badgeY);

      ctx.restore();
    }

    // Label (wrapped to show full title)
    ctx.fillStyle = planet.completed ? '#4ade80' : '#fff';
    ctx.font = `${planet.completed ? 'bold ' : ''}12px Space Grotesk`;
    ctx.textAlign = 'center';
    const nameLines = this.wrapText(planet.name, 180, 5);
    const lineHeight = 14;
    let labelY = y + planet.radius + 25;
    for (const line of nameLines) {
      ctx.fillText(line, x, labelY);
      labelY += lineHeight;
    }

    // Type indicator (skip for user home planets)
    if (!planet.id.startsWith('user-planet-')) {
      const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700', notion: '#94a3b8', station: '#a855f7' };
      ctx.fillStyle = (typeColors[planet.type] || '#94a3b8') + '80';
      ctx.font = '9px Space Grotesk';
      const typeLabel = planet.type === 'notion' ? 'NOTION' : planet.type.toUpperCase();
      ctx.fillText(typeLabel, x, labelY + 4);
      labelY += 14;
    }

    // Days-remaining badge for dated goals
    if (hasTargetDate) {
      const targetDate = new Date((planet as any).targetDate + 'T00:00:00');
      const daysLeft = Math.ceil((targetDate.getTime() - Date.now()) / 86400000);

      let badgeColor: string;
      let badgeText: string;
      if (daysLeft < 0) {
        badgeColor = '#ff4444';
        badgeText = `${Math.abs(daysLeft)}d OVERDUE`;
      } else if (daysLeft === 0) {
        badgeColor = '#ff4444';
        badgeText = 'DUE TODAY';
      } else if (daysLeft <= 3) {
        badgeColor = '#ffa500';
        badgeText = `${daysLeft}d left`;
      } else if (daysLeft <= 7) {
        badgeColor = '#dddd00';
        badgeText = `${daysLeft}d left`;
      } else if (daysLeft <= 14) {
        badgeColor = '#aadd00';
        badgeText = `${daysLeft}d left`;
      } else {
        badgeColor = '#4ade80';
        badgeText = `${daysLeft}d left`;
      }

      ctx.font = 'bold 9px Space Grotesk';
      const textWidth = ctx.measureText(badgeText).width;
      const badgePadX = 6;
      const badgePadY = 3;
      const badgeH = 14;
      const badgeW = textWidth + badgePadX * 2;
      const badgeX = x - badgeW / 2;
      const badgeY = labelY + 2;

      // Badge background
      ctx.fillStyle = badgeColor + '30';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      ctx.fill();
      ctx.strokeStyle = badgeColor + '60';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Badge text
      ctx.fillStyle = badgeColor;
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, x, badgeY + badgeH - badgePadY);
    }
  }

  private drawShip() {
    // Draw ship at all wrapped positions for seamless world wrapping
    const { ship } = this.state;
    const positions = this.getWrappedPositions(ship.x, ship.y, 80);
    for (const pos of positions) {
      this.drawShipAt(pos.x, pos.y);
    }
  }

  private drawShipAt(x: number, y: number) {
    const { ctx, state } = this;
    const { ship } = state;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.rotation + Math.PI / 2);

    // Ship size scales only with purchased size bonus from effects
    const effectSizeMultiplier = 1 + (this.shipEffects.sizeBonus / 100);
    let scale = 0.9 * effectSizeMultiplier;

    // Shrink when being sucked into black hole
    if (this.shipBeingSucked) {
      scale *= (1 - this.suckProgress);
      ctx.globalAlpha = 1 - this.suckProgress;
    }

    const shipSize = 60 * scale;

    // Purchased glow effect (drawn first, behind ship)
    if (this.shipEffects.glowColor) {
      const glowColor = this.shipEffects.glowColor;
      const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shipSize * 0.9);
      glowGradient.addColorStop(0, glowColor + 'cc');
      glowGradient.addColorStop(0.4, glowColor + '66');
      glowGradient.addColorStop(0.7, glowColor + '22');
      glowGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(0, 0, shipSize * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();
    }

    // Engine glow when thrusting
    if (ship.thrusting) {
      const glowGradient = ctx.createRadialGradient(0, shipSize * 0.4, 0, 0, shipSize * 0.4, shipSize * 0.8);
      glowGradient.addColorStop(0, 'rgba(255, 165, 0, 0.9)');
      glowGradient.addColorStop(0.5, 'rgba(255, 100, 50, 0.5)');
      glowGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(0, shipSize * 0.4, shipSize * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();
    }

    // Draw ship image if loaded
    if (this.shipImage) {
      ctx.drawImage(
        this.shipImage,
        -shipSize / 2,
        -shipSize / 2,
        shipSize,
        shipSize
      );

      // Draw equipped weapon on ship
      this.drawEquippedWeapon(ctx, shipSize, scale);

      // Level glow effect (legacy - kept for high levels)
      if (this.shipLevel >= 5 && !this.shipEffects.glowColor) {
        ctx.shadowColor = this.shipLevel >= 8 ? '#ffd700' : '#00ccff';
        ctx.shadowBlur = 10 + this.shipLevel * 2;
        ctx.globalAlpha = 0.3;
        ctx.drawImage(
          this.shipImage,
          -shipSize / 2,
          -shipSize / 2,
          shipSize,
          shipSize
        );
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      // Purchased glow overlay effect
      if (this.shipEffects.glowColor) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = this.shipEffects.glowColor;
        ctx.shadowBlur = 15;
        ctx.globalAlpha = 0.4;
        ctx.drawImage(
          this.shipImage,
          -shipSize / 2,
          -shipSize / 2,
          shipSize,
          shipSize
        );
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // Fallback procedural ship
      ctx.beginPath();
      ctx.moveTo(0, -22 * scale);
      ctx.lineTo(12 * scale, 8 * scale);
      ctx.lineTo(8 * scale, 5 * scale);
      ctx.lineTo(6 * scale, 18 * scale);
      ctx.lineTo(-6 * scale, 18 * scale);
      ctx.lineTo(-8 * scale, 5 * scale);
      ctx.lineTo(-12 * scale, 8 * scale);
      ctx.closePath();
      ctx.fillStyle = '#667788';
      ctx.fill();
      ctx.strokeStyle = '#ffffff40';
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBlackHole() {
    const { ctx, state } = this;
    const { camera } = state;
    const x = this.blackHole.x - camera.x;
    const y = this.blackHole.y - camera.y;

    // Skip if values are invalid (NaN/Infinity)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    // Skip if off screen
    if (x < -200 || x > this.canvas.width + 200 || y < -200 || y > this.canvas.height + 200) return;

    // Outer distortion ring
    const time = Date.now() * 0.002;
    ctx.save();

    // Accretion disk (swirling matter)
    for (let i = 0; i < 3; i++) {
      const diskRadius = this.blackHole.radius * (1.5 + i * 0.4);
      ctx.beginPath();
      ctx.ellipse(x, y, diskRadius, diskRadius * 0.3, time + i * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(136, 68, 255, ${0.4 - i * 0.1})`;
      ctx.lineWidth = 8 - i * 2;
      ctx.stroke();
    }

    // Pull radius indicator (faint)
    const pullGradient = ctx.createRadialGradient(x, y, this.blackHole.radius, x, y, this.blackHole.pullRadius);
    pullGradient.addColorStop(0, 'rgba(88, 44, 155, 0.2)');
    pullGradient.addColorStop(0.5, 'rgba(88, 44, 155, 0.05)');
    pullGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(x, y, this.blackHole.pullRadius, 0, Math.PI * 2);
    ctx.fillStyle = pullGradient;
    ctx.fill();

    // Event horizon glow
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, this.blackHole.radius * 1.5);
    glowGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    glowGradient.addColorStop(0.4, 'rgba(20, 0, 40, 1)');
    glowGradient.addColorStop(0.7, 'rgba(88, 44, 155, 0.8)');
    glowGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(x, y, this.blackHole.radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // The void (pure black center)
    ctx.beginPath();
    ctx.arc(x, y, this.blackHole.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Spinning particles around the black hole
    for (let i = 0; i < 8; i++) {
      const angle = time * 2 + (i / 8) * Math.PI * 2;
      const dist = this.blackHole.radius * (0.8 + Math.sin(time * 3 + i) * 0.2);
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 150, 255, ${0.5 + Math.sin(time + i) * 0.3})`;
      ctx.fill();
    }

    ctx.restore();

    // Label (evolves with close calls)
    ctx.font = '12px Space Grotesk';
    ctx.textAlign = 'center';
    if (this.blackHoleCloseCallCount >= 10) {
      ctx.fillStyle = '#cc88ff';
      ctx.fillText('The Maw', x, y + this.blackHole.radius + 25);
    } else if (this.blackHoleCloseCallCount >= 5) {
      ctx.fillStyle = '#aa66ff';
      ctx.fillText('...it remembers', x, y + this.blackHole.radius + 25);
    } else if (this.blackHoleCloseCallCount >= 3) {
      ctx.fillStyle = '#9955ff';
      ctx.fillText('??!', x, y + this.blackHole.radius + 25);
    } else {
      ctx.fillStyle = '#8844ff';
      ctx.fillText('???', x, y + this.blackHole.radius + 25);
    }
  }

  // Word-wrap text for canvas rendering, returns array of lines capped at maxLines
  private wrapCanvasText(text: string, font: string, maxWidth: number, maxLines: number): string[] {
    this.ctx.font = font;
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines: string[] = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (this.ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    if (lines.length > maxLines) {
      const hasOverflow = true;
      lines.length = maxLines;
      if (hasOverflow) {
        let last = lines[maxLines - 1];
        while (this.ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + '…';
      }
    }
    return lines;
  }

  private drawPlanetInfo(planet: Planet, canDock: boolean) {
    const { ctx, canvas } = this;
    const centerX = canvas.width / 2;

    const isUserPlanet = planet.id.startsWith('user-planet-');
    const isNotionPlanet = planet.id.startsWith('notion-');
    const isOwnedByOther = planet.ownerId !== null &&
                           planet.ownerId !== undefined &&
                           planet.ownerId !== this.currentUser;
    const isLocked = isOwnedByOther && !isNotionPlanet;
    const isViewOnly = isOwnedByOther && isNotionPlanet;
    const ownerName = planet.ownerId ? planet.ownerId.charAt(0).toUpperCase() + planet.ownerId.slice(1) : null;

    // ---- User planets: compact card (unchanged) ----
    if (isUserPlanet) {
      const boxWidth = 320;
      const boxHeight = 100;
      const boxX = centerX - boxWidth / 2;
      const boxY = canvas.height - boxHeight - 20;

      ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
      ctx.fill();
      ctx.strokeStyle = planet.completed ? '#4ade80' : planet.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Space Grotesk';
      ctx.textAlign = 'center';
      let nameText = planet.name;
      const maxW = boxWidth - 30;
      if (ctx.measureText(nameText).width > maxW) {
        while (ctx.measureText(nameText + '...').width > maxW && nameText.length > 0) nameText = nameText.slice(0, -1);
        nameText += '...';
      }
      ctx.fillText(nameText, centerX, boxY + 24);

      const userId = planet.id.replace('user-planet-', '');
      const terraformCount = userPlanetTerraformCounts.get(userId) || 0;
      const sizeLevel = userPlanetSizeLevels.get(userId) || 0;
      let population = 0;
      if (terraformCount >= 3) {
        population = Math.floor(100 * Math.pow(2.5, terraformCount - 3) * Math.pow(3, sizeLevel));
      }
      if (population > 0) {
        ctx.fillStyle = '#4ade80';
        ctx.font = '12px Space Grotesk';
        ctx.fillText(`🏘️ ${population.toLocaleString()} inhabitants`, centerX, boxY + 44);
      }
      ctx.fillStyle = '#aaa';
      ctx.font = '11px Space Grotesk';
      ctx.fillText(`🌱 ${terraformCount} terraform${terraformCount !== 1 ? 's' : ''}`, centerX, boxY + 62);

      if (canDock) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Space Grotesk';
        ctx.fillText('[ SPACE ] to dock', centerX, boxY + boxHeight - 18);
      }
      return;
    }

    // ---- All other planets: enhanced card ----
    const boxWidth = 380;
    const maxTextWidth = boxWidth - 40;

    // Pre-compute wrapped text
    const namePrefix = planet.completed ? '✓ ' : (isLocked ? '🔒 ' : (isViewOnly ? '👁 ' : ''));
    const titleFont = 'bold 15px Space Grotesk';
    const titleLines = this.wrapCanvasText(namePrefix + (planet.name || ''), titleFont, maxTextWidth, 2);

    const descFont = '12px Space Grotesk';
    const descLines = planet.description ? this.wrapCanvasText(planet.description, descFont, maxTextWidth, 2) : [];

    const hasTargetDate = !!(planet as any).targetDate && !planet.completed;
    const hasRealReward = !!planet.realWorldReward && !planet.completed;
    const hasReward = !!planet.reward && !planet.completed;
    const hasNotionUrl = !!planet.notionUrl;
    const isOwnNotionPlanet = isNotionPlanet && !isLocked && planet.ownerId === this.currentUser;
    const isPinned = this.featuredPlanetIds.has(planet.id);

    // Build action hints
    const actionHints: string[] = [];
    if (hasNotionUrl && !isLocked) actionHints.push('[ N ] Notion');
    if (isOwnNotionPlanet) actionHints.push(isPinned ? '[ F ] Unpin' : '[ F ] Pin');

    // Calculate box height using same Y increments as drawing
    let dy = 28; // top padding + type badge baseline
    dy += titleLines.length * 20; // title lines
    if (hasTargetDate) dy += 20;
    if (descLines.length > 0) dy += 6 + descLines.length * 16;
    if (hasReward) dy += 20;
    if (hasRealReward) dy += 18;
    if (actionHints.length > 0) dy += 22;
    if (isViewOnly && canDock && !planet.completed) dy += 16;
    dy += 20; // dock/status prompt
    dy += 10; // bottom padding

    const boxHeight = dy;
    const boxX = centerX - boxWidth / 2;
    const boxY = canvas.height - boxHeight - 20;

    // Background
    ctx.fillStyle = isLocked ? 'rgba(30, 10, 10, 0.95)' : (isViewOnly ? 'rgba(20, 15, 30, 0.95)' : 'rgba(10, 10, 20, 0.95)');
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = isLocked ? '#ff4444' : (planet.completed ? '#4ade80' : planet.color);
    ctx.lineWidth = 2;
    ctx.stroke();

    // --- Draw content (y = text baseline position) ---
    ctx.textAlign = 'center';

    // Type badge
    let y = boxY + 28;
    const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700', notion: '#94a3b8', station: '#a855f7' };
    ctx.fillStyle = typeColors[planet.type] || '#94a3b8';
    ctx.font = '10px Space Grotesk';
    const typeLabel = planet.type === 'notion' ? 'NOTION TASK' : planet.type.toUpperCase();
    const ownerBadge = planet.type === 'station' ? '' : (ownerName ? ` · ${ownerName}'s Task` : ' · Shared Task');
    ctx.fillText(typeLabel + ownerBadge, centerX, y);

    // Title (wrapped, max 2 lines)
    ctx.fillStyle = isLocked ? '#ff6666' : (planet.completed ? '#4ade80' : '#fff');
    ctx.font = titleFont;
    for (const line of titleLines) {
      y += 20;
      ctx.fillText(line, centerX, y);
    }

    // Due date
    if (hasTargetDate) {
      y += 20;
      const targetDate = new Date((planet as any).targetDate + 'T00:00:00');
      const daysLeft = Math.ceil((targetDate.getTime() - Date.now()) / 86400000);
      const dateStr = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      let dateColor = '#4ade80';
      let daysText = `${daysLeft}d left`;
      if (daysLeft < 0) { dateColor = '#ff4444'; daysText = `${Math.abs(daysLeft)}d overdue`; }
      else if (daysLeft === 0) { dateColor = '#ff4444'; daysText = 'due today'; }
      else if (daysLeft <= 3) { dateColor = '#ffa500'; }
      else if (daysLeft <= 7) { dateColor = '#dddd00'; }
      else if (daysLeft <= 14) { dateColor = '#aadd00'; }
      ctx.fillStyle = dateColor;
      ctx.font = '11px Space Grotesk';
      ctx.fillText(`📅 ${dateStr} · ${daysText}`, centerX, y);
    }

    // Description (wrapped, max 2 lines)
    if (descLines.length > 0) {
      y += 6;
      ctx.fillStyle = isLocked ? '#777' : '#aaa';
      ctx.font = descFont;
      for (const line of descLines) {
        y += 16;
        ctx.fillText(line, centerX, y);
      }
    }

    // Ship reward
    if (hasReward) {
      y += 20;
      const rewardLabels: Record<string, string> = {
        'speed_boost': '🚀 Speed Boost', 'acceleration': '⚡ Better Acceleration',
        'handling': '🎯 Improved Handling', 'shield': '🛡️ Shield Effect',
        'trail': '✨ Trail Effect', 'glow': '💫 Ship Glow',
        'size': '📈 Ship Size Up', 'special': '🌟 Special Upgrade',
      };
      ctx.fillStyle = isLocked ? '#886600' : '#ffa500';
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`Ship Reward: ${rewardLabels[planet.reward!] || planet.reward}`, centerX, y);
    }

    // Real world reward
    if (hasRealReward) {
      y += 18;
      ctx.fillStyle = isLocked ? '#884466' : '#ff6b9d';
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`🎁 Real Reward: ${planet.realWorldReward}`, centerX, y);
    }

    // Action hints row ([ N ] Notion · [ F ] Pin)
    if (actionHints.length > 0) {
      y += 22;
      ctx.font = '10px Space Grotesk';
      ctx.fillStyle = '#64748b';
      ctx.fillText(actionHints.join('    ·    '), centerX, y);
    }

    // View-only owner info
    if (isViewOnly && canDock && !planet.completed) {
      y += 16;
      ctx.fillStyle = '#a78bfa';
      ctx.font = '10px Space Grotesk';
      ctx.fillText(`Assigned to ${ownerName}`, centerX, y);
    }

    // Dock prompt / locked message / completed status
    y += 20;
    if (isLocked) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '11px Space Grotesk';
      ctx.fillText(`This is ${ownerName}'s task`, centerX, y);
    } else if (isViewOnly && canDock && !planet.completed) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Space Grotesk';
      ctx.fillText('[ SPACE ] to view', centerX, y);
    } else if (canDock && !planet.completed) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Space Grotesk';
      ctx.fillText('[ SPACE ] to dock', centerX, y);
    } else if (planet.completed && isNotionPlanet && canDock) {
      ctx.fillStyle = '#ff6600';
      ctx.font = 'bold 12px Space Grotesk';
      ctx.fillText('[ SPACE ] to dock', centerX, y);
    } else if (planet.completed) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '11px Space Grotesk';
      ctx.fillText('Completed!', centerX, y);
    }
  }

  private drawLandedPanel(planet: Planet) {
    const { ctx, canvas } = this;

    // Check if achievement planet has a custom image
    const isAchievement = planet.type === 'achievement';
    const achievementImage = isAchievement ? this.customPlanetImages.get(planet.id) : null;
    const achievementImageSize = 240;

    // Larger panel for landed state with more details
    const boxWidth = isAchievement ? 480 : 400;
    let boxHeight = isAchievement ? 220 : 180;

    // Add space for achievement image
    if (achievementImage) boxHeight += achievementImageSize + 20;

    // Pre-calculate name wrapping to determine box height (show full title)
    ctx.font = 'bold 22px Space Grotesk';
    const panelNameLines = this.wrapText(planet.name, boxWidth - 40, 6);
    const panelLineHeight = 26;
    const nameOffset = (panelNameLines.length - 1) * panelLineHeight;
    boxHeight += nameOffset;

    // Calculate additional height for content
    const hasDescription = planet.description && planet.description.length > 0;
    const hasReward = planet.reward && !planet.completed;
    const hasRealReward = planet.realWorldReward && !planet.completed;
    const hasNotionUrl = planet.notionUrl;
    const hasPriority = planet.priority;

    // Pre-calculate description lines for proper height
    ctx.font = '13px Space Grotesk';
    const descMaxWidth = boxWidth - 40;
    const descLines = hasDescription ? this.wrapText(planet.description || '', descMaxWidth, 4) : [];
    const descLineHeight = 18;
    if (hasDescription) boxHeight += 10 + (descLines.length * descLineHeight);
    if (hasRealReward) boxHeight += 25;
    if (hasNotionUrl) boxHeight += 25;
    if (hasPriority) boxHeight += 20;

    const boxX = canvas.width / 2 - boxWidth / 2;
    const boxY = canvas.height / 2 - boxHeight / 2;

    // Store bounds for click-outside detection
    this.landedPanelBounds = { x: boxX, y: boxY, w: boxWidth, h: boxHeight };

    // Background with glow effect
    ctx.save();

    // Outer glow
    ctx.shadowColor = planet.completed ? '#4ade80' : planet.color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(10, 10, 20, 0.98)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16);
    ctx.fill();

    // Reset shadow for content
    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = planet.completed ? '#4ade80' : planet.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Status badge
    const badgeWidth = planet.completed ? 100 : 80;
    const badgeX = boxX + boxWidth / 2 - badgeWidth / 2;
    const badgeY = boxY - 15;
    ctx.fillStyle = planet.completed ? '#4ade80' : planet.color;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, 28, 14);
    ctx.fill();

    // Badge text
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.fillText(planet.completed ? 'COMPLETED' : 'LANDED', boxX + boxWidth / 2, badgeY + 18);

    // Planet name (wrapped to 2 lines max, pre-calculated above)
    ctx.fillStyle = '#fff';
    ctx.font = isAchievement ? 'bold 26px Space Grotesk' : 'bold 22px Space Grotesk';
    ctx.textAlign = 'center';
    let nameY = boxY + 45;
    for (const line of panelNameLines) {
      ctx.fillText(line, boxX + boxWidth / 2, nameY);
      nameY += panelLineHeight;
    }

    // Achievement planet image (between title and owner text)
    let achievementImageOffset = 0;
    if (achievementImage) {
      const imgX = boxX + boxWidth / 2 - achievementImageSize / 2;
      const imgY = nameY + 8;
      // Subtle glow behind the image
      ctx.shadowColor = planet.color;
      ctx.shadowBlur = 20;
      ctx.drawImage(achievementImage, imgX, imgY, achievementImageSize, achievementImageSize);
      ctx.shadowBlur = 0;
      achievementImageOffset = achievementImageSize + 24;
    }

    // Type and owner info
    const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700', notion: '#94a3b8', station: '#a855f7' };
    ctx.fillStyle = typeColors[planet.type] || '#94a3b8';
    ctx.font = '12px Space Grotesk';
    const ownerName = planet.ownerId ? planet.ownerId.charAt(0).toUpperCase() + planet.ownerId.slice(1) : null;
    const isUnassigned = planet.type === 'notion' && (!planet.ownerId || planet.ownerId === '');
    const ownerText = ownerName ? `${ownerName}'s Task` : (isUnassigned ? 'Unassigned' : 'Shared Task');
    ctx.fillText(ownerText, boxX + boxWidth / 2, boxY + 65 + nameOffset + achievementImageOffset);

    let currentY = boxY + 85 + nameOffset + achievementImageOffset;

    // Task type and priority badges (for notion tasks)
    const taskType = (planet as any).taskType?.toLowerCase() || '';
    if (planet.type === 'notion' && (taskType || hasPriority)) {
      // Task type badge with icon
      const typeIcons: Record<string, string> = {
        'bug': '🐛',
        'feature': '✨',
        'enhancement': '✨',
        'task': '📋',
        'epic': '🎯',
      };
      const typeLabels: Record<string, string> = {
        'bug': 'Bug',
        'feature': 'Enhancement',
        'enhancement': 'Enhancement',
        'task': 'Task',
        'epic': 'Epic',
      };
      const typeBgColors: Record<string, string> = {
        'bug': '#ff4444',
        'feature': '#4ecdc4',
        'enhancement': '#60a5fa',
        'task': '#fbbf24',
        'epic': '#a855f7',
      };

      // Priority badge colors and icons
      const priorityIcons: Record<string, string> = {
        'critical': '🧨',
        'high': '🔥',
        'medium': '⚡',
        'low': '💡',
      };
      const priorityLabels: Record<string, string> = {
        'critical': 'Critical',
        'high': 'High',
        'medium': 'Medium',
        'low': 'Low',
      };
      const priorityBgColors: Record<string, string> = {
        'critical': '#dc2626',
        'high': '#ea580c',
        'medium': '#ca8a04',
        'low': '#16a34a',
      };

      const priorityKey = planet.priority?.toLowerCase().replace(/[🧨🔥⚡💡\s]/g, '').trim() || '';

      // Calculate badge positions
      const badgeGap = 10;
      const badges: { icon: string; label: string; bg: string }[] = [];

      if (taskType && typeLabels[taskType]) {
        badges.push({
          icon: typeIcons[taskType] || '📋',
          label: typeLabels[taskType],
          bg: typeBgColors[taskType] || '#666',
        });
      }

      if (priorityKey && priorityLabels[priorityKey]) {
        badges.push({
          icon: priorityIcons[priorityKey] || '',
          label: priorityLabels[priorityKey],
          bg: priorityBgColors[priorityKey] || '#666',
        });
      }

      if (badges.length > 0) {
        // Calculate total width
        ctx.font = 'bold 11px Space Grotesk';
        let totalWidth = 0;
        const badgeWidths: number[] = [];
        for (const badge of badges) {
          const textWidth = ctx.measureText(badge.icon + ' ' + badge.label).width + 20;
          badgeWidths.push(textWidth);
          totalWidth += textWidth;
        }
        totalWidth += (badges.length - 1) * badgeGap;

        let badgeX = boxX + boxWidth / 2 - totalWidth / 2;
        for (let i = 0; i < badges.length; i++) {
          const badge = badges[i];
          const bw = badgeWidths[i];

          // Badge background
          ctx.fillStyle = badge.bg;
          ctx.beginPath();
          ctx.roundRect(badgeX, currentY - 10, bw, 22, 6);
          ctx.fill();

          // Badge text
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px Space Grotesk';
          ctx.textAlign = 'center';
          ctx.fillText(badge.icon + ' ' + badge.label, badgeX + bw / 2, currentY + 5);

          badgeX += bw + badgeGap;
        }
        ctx.textAlign = 'center';
        currentY += 28;
      }

      // Points display
      if (planet.points) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 12px Space Grotesk';
        ctx.fillText(`💎 ${planet.points} pts`, boxX + boxWidth / 2, currentY + 5);
        currentY += 22;
      }
    } else if (planet.type !== 'notion') {
      // Non-notion planets: show type and size
      const typeLabel = planet.type.toUpperCase();
      const sizeLabel = planet.size.charAt(0).toUpperCase() + planet.size.slice(1);
      ctx.fillStyle = typeColors[planet.type] || '#94a3b8';
      ctx.font = '11px Space Grotesk';
      ctx.fillText(`${typeLabel} • ${sizeLabel}`, boxX + boxWidth / 2, currentY);
      currentY += 20;
    }

    // Description (using pre-calculated lines)
    if (hasDescription && descLines.length > 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = '13px Space Grotesk';
      for (const line of descLines) {
        ctx.fillText(line, boxX + boxWidth / 2, currentY);
        currentY += descLineHeight;
      }
      currentY += 7;
    }

    // Divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + 30, currentY);
    ctx.lineTo(boxX + boxWidth - 30, currentY);
    ctx.stroke();
    currentY += 20;

    // Ship reward
    if (hasReward) {
      const rewardLabels: Record<string, string> = {
        'speed_boost': '🚀 Speed Boost',
        'acceleration': '⚡ Better Acceleration',
        'handling': '🎯 Improved Handling',
        'shield': '🛡️ Shield Effect',
        'trail': '✨ Trail Effect',
        'glow': '💫 Ship Glow',
        'size': '📈 Ship Size Up',
        'special': '🌟 Special Upgrade',
      };
      ctx.fillStyle = '#ffa500';
      ctx.font = 'bold 13px Space Grotesk';
      ctx.fillText(`Ship Reward: ${rewardLabels[planet.reward!] || planet.reward}`, boxX + boxWidth / 2, currentY);
      currentY += 25;
    }

    // Real world reward
    if (hasRealReward) {
      ctx.fillStyle = '#ff6b9d';
      ctx.font = 'bold 13px Space Grotesk';
      ctx.fillText(`🎁 ${planet.realWorldReward}`, boxX + boxWidth / 2, currentY);
      currentY += 25;
    }

    // Action hints at the bottom
    currentY = boxY + boxHeight - 35;

    const isPlanetFactory = planet.id === 'planet-builder';
    const specialPlanets = ['shop-station', 'planet-builder', 'control-hub'];
    const isSpecialPlanet = specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-');
    // Check if this is another player's planet (view-only mode)
    const isViewOnlyPlanet = planet.ownerId !== null &&
                             planet.ownerId !== undefined &&
                             planet.ownerId !== '' &&
                             planet.ownerId !== this.currentUser;

    if (!planet.completed && !isPlanetFactory) {
      const isNotionPlanet = planet.type === 'notion';
      const isUnassignedNotion = isNotionPlanet && (!planet.ownerId || planet.ownerId === '');

      if (isViewOnlyPlanet && isNotionPlanet) {
        // View-only mode for Notion tasks: show Send, Edit and Notion buttons
        ctx.textAlign = 'left';
        const leftX = boxX + 30;

        // Send hint (reassign)
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 14px Space Grotesk';
        ctx.fillText('[ R ] Send', leftX, currentY - 8);

        // Edit hint
        ctx.fillStyle = '#a78bfa';
        ctx.fillText('[ E ] Edit', leftX, currentY + 10);

        // Notion hint on the right
        if (hasNotionUrl) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#5490ff';
          ctx.fillText('[ N ] Notion', boxX + boxWidth - 30, currentY);
        }

        ctx.textAlign = 'center';
      } else if (isViewOnlyPlanet) {
        // View-only mode for non-notion planets: no actions available
        // (just the close hint at the bottom)
      } else {
        // Claim or Complete hint
        ctx.fillStyle = isUnassignedNotion ? '#ffd700' : '#4ade80';
        ctx.font = 'bold 14px Space Grotesk';
        const actionText = isUnassignedNotion ? '[ C ] Claim Mission' : '[ C ] Complete';

        if (isUnassignedNotion) {
          // For unassigned: Claim, Send, Edit, Delete on left column, Notion on right
          ctx.textAlign = 'left';
          const leftX = boxX + 30;

          // Line 1: Claim Mission
          ctx.fillStyle = '#ffd700';
          ctx.fillText('[ C ] Claim Mission', leftX, currentY - 24);

          // Line 2: Send (reassign)
          ctx.fillStyle = '#f59e0b';
          ctx.fillText('[ R ] Send', leftX, currentY - 6);

          // Line 3: Edit
          ctx.fillStyle = '#a78bfa';
          ctx.fillText('[ E ] Edit', leftX, currentY + 12);

          // Line 4: Delete
          ctx.fillStyle = '#ff4444';
          ctx.fillText('[ X ] Delete', leftX, currentY + 30);

          // Notion hint on the right
          if (hasNotionUrl) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#5490ff';
            ctx.fillText('[ N ] Notion', boxX + boxWidth - 30, currentY);
          }

          ctx.textAlign = 'center';
        } else if (isNotionPlanet) {
          // For assigned Notion tasks: Complete, Send, Edit, and Notion
          ctx.textAlign = 'left';
          const leftX = boxX + 30;

          // Complete hint
          ctx.fillStyle = '#4ade80';
          ctx.font = 'bold 14px Space Grotesk';
          ctx.fillText('[ C ] Complete', leftX, currentY - 16);

          // Send hint (reassign)
          ctx.fillStyle = '#f59e0b';
          ctx.fillText('[ R ] Send', leftX, currentY + 2);

          // Edit hint
          ctx.fillStyle = '#a78bfa';
          ctx.fillText('[ E ] Edit', leftX, currentY + 20);

          // Notion hint on the right
          if (hasNotionUrl) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#5490ff';
            ctx.fillText('[ N ] Notion', boxX + boxWidth - 30, currentY);
          }

          ctx.textAlign = 'center';
        } else {
          // Non-notion planets (achievements, business, product): only Complete
          ctx.fillStyle = '#4ade80';
          ctx.font = 'bold 14px Space Grotesk';
          ctx.fillText('[ C ] Complete', boxX + boxWidth / 2, currentY);
        }
      }
    } else if (planet.completed && !isSpecialPlanet && planet.type === 'notion') {
      // Destroy hint for completed Notion planets (requires Space TNT equipped)
      if (this.shipEffects.destroyCanonEquipped) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 14px Space Grotesk';
        ctx.fillText('[ X ] Detonate Planet', boxX + boxWidth / 2 - (hasNotionUrl ? 80 : 0), currentY);
      } else if (this.shipEffects.hasDestroyCanon) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Space Grotesk';
        ctx.fillText('🔒 Equip Space TNT in Shop', boxX + boxWidth / 2 - (hasNotionUrl ? 80 : 0), currentY);
      } else {
        ctx.fillStyle = '#666';
        ctx.font = '12px Space Grotesk';
        ctx.fillText('🔒 Buy weapons to destroy (Shop)', boxX + boxWidth / 2 - (hasNotionUrl ? 80 : 0), currentY);
      }

      // Notion hint
      if (hasNotionUrl) {
        ctx.fillStyle = '#5490ff';
        ctx.fillText('[ N ] Open Notion', boxX + boxWidth / 2 + 80, currentY);
      }
    }

    // Close hint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px Space Grotesk';
    ctx.fillText('[ ESC ] to close', boxX + boxWidth / 2, boxY + boxHeight - 12);

    ctx.restore();
  }

  private drawMinimap() {
    const { ctx, canvas, state } = this;
    const { camera, ship, planets } = state;

    const mapSize = 140;
    const mapX = canvas.width - mapSize - 15;
    const mapY = 15;
    const scale = mapSize / WORLD_SIZE;

    // Background with subtle zone color tint
    const zoneColor = this.getZoneColorBlend();
    const bgR = Math.round(10 + (zoneColor.r - 10) * zoneColor.intensity * 0.5);
    const bgG = Math.round(10 + (zoneColor.g - 10) * zoneColor.intensity * 0.5);
    const bgB = Math.round(20 + (zoneColor.b - 20) * zoneColor.intensity * 0.5);
    ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, 0.85)`;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapSize, mapSize, 8);
    ctx.fill();

    // Border with subtle zone color
    const borderColor = zoneColor.intensity > 0.03
      ? `rgba(${zoneColor.r}, ${zoneColor.g}, ${zoneColor.b}, 0.3)`
      : 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Planets
    for (const planet of planets) {
      const px = mapX + planet.x * scale;
      const py = mapY + planet.y * scale;
      const pr = Math.max(3, planet.radius * scale * 1.5);

      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = planet.completed ? '#4ade80' : planet.color;
      ctx.fill();
    }

    // Black hole on minimap
    const bhX = mapX + this.blackHole.x * scale;
    const bhY = mapY + this.blackHole.y * scale;
    ctx.beginPath();
    ctx.arc(bhX, bhY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#8844ff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bhX, bhY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Ship
    ctx.beginPath();
    ctx.arc(mapX + ship.x * scale, mapY + ship.y * scale, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Viewport
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(
      mapX + camera.x * scale,
      mapY + camera.y * scale,
      canvas.width * scale,
      canvas.height * scale
    );

    // Neon Nomad on minimap (pulsing magenta dot)
    const nomadMx = mapX + this.neonNomad.x * scale;
    const nomadMy = mapY + this.neonNomad.y * scale;
    const nomadPulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
    ctx.beginPath();
    ctx.arc(nomadMx, nomadMy, 4 + nomadPulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 0, 255, ${0.3 + nomadPulse * 0.3})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(nomadMx, nomadMy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff00ff';
    ctx.fill();

    // The Hatchery — tiny green dot, no label
    ctx.beginPath();
    ctx.arc(mapX + this.hatchery.x * scale, mapY + this.hatchery.y * scale, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#44ff88';
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.fillText('MAP', mapX + mapSize / 2, mapY + mapSize + 12);

    // Draw other players on minimap
    for (const player of this.otherPlayers) {
      ctx.beginPath();
      ctx.arc(mapX + player.x * scale, mapY + player.y * scale, 3, 0, Math.PI * 2);
      ctx.fillStyle = player.color;
      ctx.fill();
    }
  }

  // =============================================
  // MULTIPLAYER METHODS
  // =============================================

  /**
   * Update the list of other players in the game.
   * Called from the React layer when player metadata changes.
   */
  public setOtherPlayers(players: OtherPlayer[]) {
    this.otherPlayers = players;

    // Preload ship images for new players or when image URL changes
    for (const player of players) {
      const cachedUrl = this.otherPlayerImageUrls.get(player.id);
      const newUrl = player.shipImage || '/ship-base.png';

      // Load image if: no cached image, or URL has changed
      if (!this.otherPlayerImages.has(player.id) || cachedUrl !== newUrl) {
        this.loadOtherPlayerImage(player.id, player.shipImage);
        this.otherPlayerImageUrls.set(player.id, newUrl);
      }

      // Update planet image if it changed
      if (player.planetImageUrl) {
        const cachedPlanetUrl = this.otherPlayerPlanetUrls.get(player.username);
        if (cachedPlanetUrl !== player.planetImageUrl) {
          this.updateUserPlanetImage(
            player.username,
            player.planetImageUrl,
            player.planetTerraformCount,
            player.planetSizeLevel
          );
          this.otherPlayerPlanetUrls.set(player.username, player.planetImageUrl);
        }
      }

      // Initialize render state if this is a new player
      if (!this.renderStates.has(player.id)) {
        this.renderStates.set(player.id, this.createInitialRenderState(player.x, player.y, player.rotation, player.vx, player.vy, player.thrusting));
      }

      // Sync companion instances for this player
      const equipped = player.shipEffects?.equippedCompanions ?? [];
      const existing = this.otherPlayerCompanions.get(player.id) ?? [];
      const existingMap = new Map<string, Companion>();
      for (const c of existing) existingMap.set(c.type, c);
      if (equipped.length > 0 || existing.length > 0) {
        const synced = equipped.map(type => {
          const prev = existingMap.get(type);
          if (prev) return prev;
          return {
            type,
            worldX: player.x + (Math.random() - 0.5) * 60,
            worldY: player.y + (Math.random() - 0.5) * 60,
            prevWorldX: player.x,
            prevWorldY: player.y,
            vx: 0, vy: 0,
            wobble: Math.random() * Math.PI * 2,
            angle: Math.random() * Math.PI * 2,
            timer: 0, stateFlag: 0,
            idleWanderTarget: null, alpha: 1,
          };
        });
        if (synced.length > 0) {
          this.otherPlayerCompanions.set(player.id, synced);
        } else {
          this.otherPlayerCompanions.delete(player.id);
        }
      }
    }

    // Clean up render states, snapshots, and image caches for players who left
    for (const id of this.renderStates.keys()) {
      if (!players.find(p => p.id === id)) {
        this.renderStates.delete(id);
        this.playerSnapshots.delete(id);
        this.otherPlayerImages.delete(id);
        this.otherPlayerImageUrls.delete(id);
        this.otherPlayerUpgrading.delete(id);
        this.otherPlayerCompanions.delete(id);
      }
    }
  }

  /**
   * Add a position snapshot for a player (called directly from network callback).
   * This bypasses React state for lower latency.
   */
  /**
   * Create initial render state for a new player.
   */
  private createInitialRenderState(x: number, y: number, rotation: number, vx: number, vy: number, thrusting: boolean, boosting: boolean = false): InterpolationState {
    return {
      renderX: x,
      renderY: y,
      renderRotation: rotation,
      renderVx: vx,
      renderVy: vy,
      renderThrusting: thrusting,
      renderBoosting: boosting,
      lastUpdateTime: Date.now(),
    };
  }

  /**
   * Receive position update from network. Adds to snapshot buffer.
   */
  public onPlayerPositionUpdate(playerId: string, data: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    thrusting: boolean;
    boosting: boolean;
    timestamp: number;
  }) {
    const now = Date.now();

    // Add snapshot to buffer
    let snapshots = this.playerSnapshots.get(playerId);
    if (!snapshots) {
      snapshots = [];
      this.playerSnapshots.set(playerId, snapshots);
    }

    const snapshot: PositionSnapshot = {
      x: data.x,
      y: data.y,
      vx: data.vx,
      vy: data.vy,
      rotation: data.rotation,
      thrusting: data.thrusting,
      boosting: data.boosting,
      timestamp: data.timestamp,
      receivedAt: now,
    };

    // Add to end (assume chronological order)
    snapshots.push(snapshot);

    // Keep buffer size limited
    while (snapshots.length > SNAPSHOT_BUFFER_SIZE) {
      snapshots.shift();
    }

    // Update player object (for metadata)
    const player = this.otherPlayers.find(p => p.id === playerId);
    if (player) {
      player.thrusting = data.thrusting;
      player.boosting = data.boosting;
      player.x = data.x;
      player.y = data.y;
      player.vx = data.vx;
      player.vy = data.vy;
      player.rotation = data.rotation;
    }

    // Initialize render state if needed
    if (!this.renderStates.has(playerId)) {
      this.renderStates.set(playerId, this.createInitialRenderState(data.x, data.y, data.rotation, data.vx, data.vy, data.thrusting, data.boosting));
    } else {
      // Update boosting state
      const renderState = this.renderStates.get(playerId);
      if (renderState) {
        renderState.renderBoosting = data.boosting;
      }
    }
  }

  /**
   * Calculate the shortest distance considering world wrapping.
   */
  private getWrappedDistance(x1: number, y1: number, x2: number, y2: number): { dx: number; dy: number; dist: number } {
    let dx = x2 - x1;
    let dy = y2 - y1;

    // Wrap around if shorter path exists
    if (dx > WORLD_SIZE / 2) dx -= WORLD_SIZE;
    else if (dx < -WORLD_SIZE / 2) dx += WORLD_SIZE;
    if (dy > WORLD_SIZE / 2) dy -= WORLD_SIZE;
    else if (dy < -WORLD_SIZE / 2) dy += WORLD_SIZE;

    return { dx, dy, dist: Math.sqrt(dx * dx + dy * dy) };
  }

  /**
   * Unwrap a position to be continuous with a reference position (for interpolation).
   */
  private unwrapPosition(refX: number, refY: number, x: number, y: number): { x: number; y: number } {
    let unwrappedX = x;
    let unwrappedY = y;

    const dx = x - refX;
    const dy = y - refY;

    if (dx > WORLD_SIZE / 2) unwrappedX -= WORLD_SIZE;
    else if (dx < -WORLD_SIZE / 2) unwrappedX += WORLD_SIZE;
    if (dy > WORLD_SIZE / 2) unwrappedY -= WORLD_SIZE;
    else if (dy < -WORLD_SIZE / 2) unwrappedY += WORLD_SIZE;

    return { x: unwrappedX, y: unwrappedY };
  }

  /**
   * Wrap a position back into world bounds [0, WORLD_SIZE).
   */
  private wrapPosition(x: number, y: number): { x: number; y: number } {
    let wrappedX = x % WORLD_SIZE;
    let wrappedY = y % WORLD_SIZE;
    if (wrappedX < 0) wrappedX += WORLD_SIZE;
    if (wrappedY < 0) wrappedY += WORLD_SIZE;
    return { x: wrappedX, y: wrappedY };
  }

  /**
   * Find two snapshots that bracket the render time (one before, one after).
   */
  private findBracketingSnapshots(snapshots: PositionSnapshot[], renderTime: number): {
    before: PositionSnapshot | null;
    after: PositionSnapshot | null;
  } {
    let before: PositionSnapshot | null = null;
    let after: PositionSnapshot | null = null;

    for (const snap of snapshots) {
      if (snap.receivedAt <= renderTime) {
        before = snap; // Keep updating - want the latest one before renderTime
      } else if (!after) {
        after = snap;  // First one after renderTime
        break;
      }
    }

    return { before, after };
  }

  /**
   * Calculate target position by interpolating between two known snapshots.
   * Returns the ideal position based on exact timestamps.
   */
  private calculateInterpolatedTarget(
    before: PositionSnapshot,
    after: PositionSnapshot,
    renderTime: number
  ): { x: number; y: number; rotation: number; vx: number; vy: number; thrusting: boolean } {
    // Calculate interpolation factor (0 = before, 1 = after)
    const duration = after.receivedAt - before.receivedAt;
    const t = duration > 0 ? (renderTime - before.receivedAt) / duration : 0;
    const clampedT = Math.max(0, Math.min(1, t));

    // Unwrap positions for smooth world-wrapping
    const unwrappedAfter = this.unwrapPosition(before.x, before.y, after.x, after.y);

    // Interpolate position
    let targetX = before.x + (unwrappedAfter.x - before.x) * clampedT;
    let targetY = before.y + (unwrappedAfter.y - before.y) * clampedT;

    // Wrap back to world bounds
    const wrapped = this.wrapPosition(targetX, targetY);
    targetX = wrapped.x;
    targetY = wrapped.y;

    // Interpolate rotation (handle wraparound)
    let rotDiff = after.rotation - before.rotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    const targetRotation = before.rotation + rotDiff * clampedT;

    // Interpolate velocity
    const targetVx = before.vx + (after.vx - before.vx) * clampedT;
    const targetVy = before.vy + (after.vy - before.vy) * clampedT;

    // Use the "after" thrusting state once we're past the midpoint
    const targetThrusting = clampedT > 0.5 ? after.thrusting : before.thrusting;

    return { x: targetX, y: targetY, rotation: targetRotation, vx: targetVx, vy: targetVy, thrusting: targetThrusting };
  }


  /**
   * Smoothly blend render state toward a target position.
   * This prevents snapping and ensures silky smooth movement.
   */
  private smoothTowardTarget(
    renderState: InterpolationState,
    target: { x: number; y: number; rotation: number; vx: number; vy: number; thrusting: boolean },
    smoothing: number
  ) {
    // Unwrap target position relative to current render position
    const unwrapped = this.unwrapPosition(renderState.renderX, renderState.renderY, target.x, target.y);

    // Smooth toward target position
    renderState.renderX += (unwrapped.x - renderState.renderX) * smoothing;
    renderState.renderY += (unwrapped.y - renderState.renderY) * smoothing;

    // Wrap back to world bounds
    const wrapped = this.wrapPosition(renderState.renderX, renderState.renderY);
    renderState.renderX = wrapped.x;
    renderState.renderY = wrapped.y;

    // Smooth rotation (handle wraparound)
    let rotDiff = target.rotation - renderState.renderRotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    renderState.renderRotation += rotDiff * smoothing;

    // Smooth velocity
    renderState.renderVx += (target.vx - renderState.renderVx) * smoothing;
    renderState.renderVy += (target.vy - renderState.renderVy) * smoothing;

    // Use target thrusting state
    renderState.renderThrusting = target.thrusting;
  }

  /**
   * Directly set render state to target (used when we have good interpolation data).
   */
  private setRenderStateDirectly(
    renderState: InterpolationState,
    target: { x: number; y: number; rotation: number; vx: number; vy: number; thrusting: boolean }
  ) {
    renderState.renderX = target.x;
    renderState.renderY = target.y;
    renderState.renderRotation = target.rotation;
    renderState.renderVx = target.vx;
    renderState.renderVy = target.vy;
    renderState.renderThrusting = target.thrusting;
  }

  /**
   * Lerp interpolation with velocity prediction.
   * Predicts where the ship should be NOW based on last snapshot + velocity.
   */
  private updateOtherPlayersInterpolation() {
    const now = Date.now();

    for (const player of this.otherPlayers) {
      const renderState = this.renderStates.get(player.id);
      if (!renderState) continue;

      const snapshots = this.playerSnapshots.get(player.id) || [];
      const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

      let targetX: number;
      let targetY: number;
      let targetRotation: number;
      let targetThrusting: boolean;
      let targetBoosting: boolean;

      if (latest) {
        // Predict where the ship should be NOW based on snapshot + velocity
        const timeSinceSnapshot = (now - latest.receivedAt) / 1000; // seconds
        // Cap prediction to 200ms to avoid overshooting
        const predictionTime = Math.min(timeSinceSnapshot, 0.2);
        // vx/vy are per-frame at 60fps, so multiply by 60 to get per-second
        targetX = latest.x + latest.vx * predictionTime * 60;
        targetY = latest.y + latest.vy * predictionTime * 60;
        targetRotation = latest.rotation;
        targetThrusting = latest.thrusting;
        targetBoosting = latest.boosting;
      } else {
        targetX = player.x;
        targetY = player.y;
        targetRotation = player.rotation;
        targetThrusting = player.thrusting;
        targetBoosting = player.boosting ?? false;
      }

      // Unwrap target for world wrapping
      const unwrapped = this.unwrapPosition(renderState.renderX, renderState.renderY, targetX, targetY);

      // Lerp toward predicted target (exponential interpolation scales with dt)
      const lerpFactor = 1 - Math.pow(1 - LERP_FACTOR, this.dt);
      renderState.renderX += (unwrapped.x - renderState.renderX) * lerpFactor;
      renderState.renderY += (unwrapped.y - renderState.renderY) * lerpFactor;

      // Wrap back to world bounds
      const wrapped = this.wrapPosition(renderState.renderX, renderState.renderY);
      renderState.renderX = wrapped.x;
      renderState.renderY = wrapped.y;

      // Lerp rotation
      let rotDiff = targetRotation - renderState.renderRotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      renderState.renderRotation += rotDiff * lerpFactor;

      // Thrusting and boosting - direct (no interpolation needed)
      renderState.renderThrusting = targetThrusting;
      renderState.renderBoosting = targetBoosting;

      renderState.lastUpdateTime = now;
    }
  }

  /**
   * Get the current ship state for broadcasting to other players.
   */
  public getShipState(): { x: number; y: number; vx: number; vy: number; rotation: number; thrusting: boolean; boosting: boolean } {
    const { ship } = this.state;
    return {
      x: ship.x,
      y: ship.y,
      vx: ship.vx,
      vy: ship.vy,
      rotation: ship.rotation,
      thrusting: ship.thrusting,
      boosting: this.keys.has('shift') && ship.thrusting,
    };
  }

  /**
   * Load a ship image for another player.
   */
  private loadOtherPlayerImage(playerId: string, imageUrl: string) {
    if (!imageUrl || imageUrl === '/ship-base.png') {
      // Use the base ship image (not the local player's custom ship)
      if (this.baseShipImage) {
        this.otherPlayerImages.set(playerId, this.baseShipImage);
      }
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      this.otherPlayerImages.set(playerId, img);
    };
    img.onerror = () => {
      // Fallback to base ship (not local player's custom ship)
      if (this.baseShipImage) {
        this.otherPlayerImages.set(playerId, this.baseShipImage);
      }
    };
  }

  /**
   * Render all other players' ships using interpolated positions for smooth movement.
   */
  private renderOtherPlayers() {
    for (const player of this.otherPlayers) {
      // Use render state for smooth interpolated position
      const renderState = this.renderStates.get(player.id);
      const renderX = renderState?.renderX ?? player.x;
      const renderY = renderState?.renderY ?? player.y;
      const renderRotation = renderState?.renderRotation ?? player.rotation;
      const renderThrusting = renderState?.renderThrusting ?? player.thrusting;

      // Draw at all wrapped positions for seamless world wrapping
      const positions = this.getWrappedPositions(renderX, renderY, 80);
      for (const pos of positions) {
        this.drawOtherPlayerAt(player, pos.x, pos.y, renderRotation, renderThrusting);
      }

      // Render companions for this player
      const companions = this.otherPlayerCompanions.get(player.id);
      if (companions && companions.length > 0) {
        this.renderOtherPlayerCompanions(companions);
      }
    }
  }

  /**
   * Draw another player's ship at a specific screen position.
   */
  // Update companion positions for all other players
  private updateOtherPlayerCompanions() {
    for (const player of this.otherPlayers) {
      const companions = this.otherPlayerCompanions.get(player.id);
      if (!companions || companions.length === 0) continue;

      const renderState = this.renderStates.get(player.id);
      const px = renderState?.renderX ?? player.x;
      const py = renderState?.renderY ?? player.y;
      const prot = renderState?.renderRotation ?? player.rotation;
      const pvx = renderState?.renderVx ?? player.vx;
      const pvy = renderState?.renderVy ?? player.vy;
      const speed = Math.sqrt(pvx * pvx + pvy * pvy);
      const moveBlend = Math.min(speed / 2.5, 1);

      for (let i = 0; i < companions.length; i++) {
        const c = companions[i];
        c.wobble += (0.03 + i * 0.005) * this.dt;

        // Chain target
        let chainX: number, chainY: number;
        if (i === 0) {
          const backAngle = prot + Math.PI;
          chainX = px + Math.cos(backAngle) * 50;
          chainY = py + Math.sin(backAngle) * 50;
        } else {
          const leader = companions[i - 1];
          const dx = c.worldX - leader.worldX;
          const dy = c.worldY - leader.worldY;
          const angle = Math.atan2(dy, dx);
          chainX = leader.worldX + Math.cos(angle) * 32;
          chainY = leader.worldY + Math.sin(angle) * 32;
        }

        // Idle target
        const idleAngle = (Math.PI * 2 * i) / Math.max(companions.length, 1) + c.wobble * 0.1;
        const idleX = px + Math.cos(idleAngle) * 60;
        const idleY = py + Math.sin(idleAngle) * 60;

        const targetX = chainX * moveBlend + idleX * (1 - moveBlend) + Math.sin(c.wobble) * 2;
        const targetY = chainY * moveBlend + idleY * (1 - moveBlend) + Math.cos(c.wobble * 1.3) * 2;

        c.prevWorldX = c.worldX;
        c.prevWorldY = c.worldY;

        const dx = targetX - c.worldX;
        const dy = targetY - c.worldY;
        const elasticity = 1 + i * 0.6;
        const springK = 0.1 / elasticity;
        const damping = Math.min(0.8 + i * 0.03, 0.92);

        c.vx += dx * springK * this.dt;
        c.vy += dy * springK * this.dt;
        c.vx *= Math.pow(damping, this.dt);
        c.vy *= Math.pow(damping, this.dt);
        c.worldX += c.vx * this.dt;
        c.worldY += c.vy * this.dt;
      }
    }
  }

  // Render companions for another player
  private renderOtherPlayerCompanions(companions: Companion[]) {
    const { ctx } = this;
    const { camera } = this.state;

    for (const c of companions) {
      const def = COMPANION_DEFS.find(d => d.id === c.type);
      if (!def) continue;

      const screenX = c.worldX - camera.x;
      const screenY = c.worldY - camera.y;
      const isLegendary = def.isLegendary ?? false;
      const margin = isLegendary ? 200 : 50;
      if (screenX < -margin || screenX > this.canvas.width + margin || screenY < -margin || screenY > this.canvas.height + margin) continue;

      ctx.save();
      ctx.globalAlpha = c.alpha * 0.85; // Slightly transparent for other players

      const size = def.size;
      const img = this.companionImages.get(c.type);
      const glowColor = def.glowColor;

      if (img) {
        const renderSize = size * 4;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isLegendary ? 20 : 10;
        ctx.drawImage(img, screenX - renderSize / 2, screenY - renderSize / 2, renderSize, renderSize);
      } else {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isLegendary ? 20 : 10;
        const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, def.color);
        grad.addColorStop(0.7, glowColor + 'aa');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawOtherPlayerAt(player: OtherPlayer, x: number, y: number, rotation?: number, thrusting?: boolean) {
    const { ctx } = this;
    const shipImage = this.otherPlayerImages.get(player.id) || this.baseShipImage;
    const renderRotation = rotation ?? player.rotation;
    const renderThrusting = thrusting ?? player.thrusting;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(renderRotation + Math.PI / 2);

    // Ship size (same formula as local player: base + purchased size bonus)
    const effectSizeMultiplier = 1 + ((player.shipEffects?.sizeBonus || 0) / 100);
    const scale = 0.9 * effectSizeMultiplier;
    const shipSize = 60 * scale;

    // Glow effect using player's color
    const glowColor = player.shipEffects?.glowColor || player.color;
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shipSize * 0.9);
    glowGradient.addColorStop(0, glowColor + '88');
    glowGradient.addColorStop(0.4, glowColor + '44');
    glowGradient.addColorStop(0.7, glowColor + '11');
    glowGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(0, 0, shipSize * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Engine glow when thrusting
    if (renderThrusting) {
      const engineGradient = ctx.createRadialGradient(0, shipSize * 0.4, 0, 0, shipSize * 0.4, shipSize * 0.8);
      engineGradient.addColorStop(0, player.color + 'ee');
      engineGradient.addColorStop(0.5, player.color + '88');
      engineGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(0, shipSize * 0.4, shipSize * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = engineGradient;
      ctx.fill();
    }

    // Draw ship image
    if (shipImage) {
      ctx.drawImage(
        shipImage,
        -shipSize / 2,
        -shipSize / 2,
        shipSize,
        shipSize
      );

      // Color tint overlay to identify player
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(0, 0, shipSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // Fallback procedural ship with player color
      ctx.beginPath();
      ctx.moveTo(0, -22 * scale);
      ctx.lineTo(12 * scale, 8 * scale);
      ctx.lineTo(8 * scale, 5 * scale);
      ctx.lineTo(6 * scale, 18 * scale);
      ctx.lineTo(-6 * scale, 18 * scale);
      ctx.lineTo(-8 * scale, 5 * scale);
      ctx.lineTo(-12 * scale, 8 * scale);
      ctx.closePath();
      ctx.fillStyle = player.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff40';
      ctx.stroke();
    }

    // Draw equipped weapon for other players
    this.drawOtherPlayerWeapon(ctx, player, shipSize);

    ctx.restore();

    // Draw player name above ship (always readable)
    ctx.save();
    ctx.fillStyle = player.color;
    ctx.font = 'bold 11px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(player.displayName, x, y - shipSize / 2 - 10);
    ctx.restore();
  }

  /**
   * Emit thrust particles for another player (matches local player trail).
   */
  private emitOtherPlayerThrust(player: OtherPlayer, isBoosting: boolean = false) {
    // Use render state for interpolated position
    const renderState = this.renderStates.get(player.id);
    const px = renderState?.renderX ?? player.x;
    const py = renderState?.renderY ?? player.y;
    const rotation = renderState?.renderRotation ?? player.rotation;
    const vx = renderState?.renderVx ?? player.vx;
    const vy = renderState?.renderVy ?? player.vy;

    const backAngle = rotation + Math.PI;
    const trailType = player.shipEffects?.trailType || 'default';

    // Match local player particle count based on trail type and boosting
    let particleCount = isBoosting ? 5 : 2;
    if (trailType !== 'default') {
      particleCount = isBoosting ? 7 : 4;
    }

    for (let i = 0; i < particleCount; i++) {
      // Choose colors based on trail type (same as local player)
      let colors: string[];
      let life: number;
      let size: number;

      switch (trailType) {
        case 'fire':
          colors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00'];
          life = isBoosting ? 40 + Math.random() * 25 : 30 + Math.random() * 20;
          size = Math.random() * (isBoosting ? 8 : 6) + (isBoosting ? 5 : 4);
          break;
        case 'ice':
          colors = ['#88ddff', '#aaeeff', '#ccffff', '#ffffff', '#66ccff'];
          life = isBoosting ? 45 + Math.random() * 20 : 35 + Math.random() * 15;
          size = Math.random() * (isBoosting ? 6 : 4) + (isBoosting ? 3 : 2);
          break;
        case 'rainbow':
          colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];
          life = isBoosting ? 50 + Math.random() * 30 : 40 + Math.random() * 20;
          size = Math.random() * (isBoosting ? 7 : 5) + (isBoosting ? 4 : 3);
          break;
        case 'plasma':
          colors = ['#cc44ff', '#aa22dd', '#ee66ff', '#8800cc', '#ff88ff'];
          life = isBoosting ? 55 + Math.random() * 25 : 40 + Math.random() * 20;
          size = Math.random() * (isBoosting ? 9 : 7) + (isBoosting ? 5 : 4);
          break;
        case 'star':
          colors = ['#ffd700', '#ffec80', '#fff4cc', '#ffaa00', '#ffe44d'];
          life = isBoosting ? 60 + Math.random() * 30 : 50 + Math.random() * 25;
          size = Math.random() * (isBoosting ? 5 : 3) + (isBoosting ? 2 : 1.5);
          break;
        default:
          colors = isBoosting
            ? ['#00ffff', '#00ccff', '#ffffff', '#88ffff']
            : ['#ffa500', '#ff6b4a', '#ffcc00', '#ff4500'];
          life = isBoosting ? 35 + Math.random() * 20 : 25 + Math.random() * 15;
          size = Math.random() * (isBoosting ? 7 : 5) + (isBoosting ? 4 : 3);
      }

      const spread = (Math.random() - 0.5) * (isBoosting ? 0.8 : 0.6);
      const speed = Math.random() * (isBoosting ? 5 : 3) + (isBoosting ? 4 : 2);

      this.state.particles.push({
        x: px + Math.cos(backAngle) * 18,
        y: py + Math.sin(backAngle) * 18,
        vx: Math.cos(backAngle + spread) * speed + vx * 0.3,
        vy: Math.sin(backAngle + spread) * speed + vy * 0.3,
        life: life,
        maxLife: isBoosting ? 55 : 40,
        size: size,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  // ===== EASTER EGGS & AMBIENT EFFECTS =====

  private updateShootingStars() {
    const now = Date.now();

    // Spawn a shooting star roughly every 25-45 seconds
    if (now - this.lastShootingStarSpawn > 25000 + Math.random() * 20000) {
      this.lastShootingStarSpawn = now;

      // Random start position along one edge of the visible area (in world space)
      const { camera } = this.state;
      const edge = Math.floor(Math.random() * 4);
      let sx: number, sy: number, angle: number;

      switch (edge) {
        case 0: // top
          sx = camera.x + Math.random() * this.canvas.width;
          sy = camera.y - 50;
          angle = Math.PI * 0.3 + Math.random() * 0.4; // downward-ish
          break;
        case 1: // right
          sx = camera.x + this.canvas.width + 50;
          sy = camera.y + Math.random() * this.canvas.height;
          angle = Math.PI * 0.6 + Math.random() * 0.4; // leftward-ish
          break;
        case 2: // bottom
          sx = camera.x + Math.random() * this.canvas.width;
          sy = camera.y + this.canvas.height + 50;
          angle = -Math.PI * 0.3 - Math.random() * 0.4; // upward-ish
          break;
        default: // left
          sx = camera.x - 50;
          sy = camera.y + Math.random() * this.canvas.height;
          angle = -Math.PI * 0.1 + Math.random() * 0.3;
          break;
      }

      const speed = 8 + Math.random() * 6;
      const starColors = ['#ffffff', '#ffe4b5', '#b0c4de', '#add8e6'];

      this.shootingStars.push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 60 + Math.random() * 40,
        maxLife: 100,
        brightness: 0.6 + Math.random() * 0.4,
        length: 40 + Math.random() * 60,
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    // Update existing shooting stars
    this.shootingStars = this.shootingStars.filter(s => {
      s.x += s.vx * this.dt;
      s.y += s.vy * this.dt;
      s.life -= this.dt;
      return s.life > 0;
    });
  }

  private renderShootingStars() {
    const { ctx, state } = this;
    const { camera } = state;

    for (const s of this.shootingStars) {
      const x = s.x - camera.x;
      const y = s.y - camera.y;
      const alpha = Math.min(1, s.life / (s.maxLife * 0.3)) * s.brightness;
      if (alpha <= 0) continue;

      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (speed === 0) continue;

      // Draw tail
      const dirX = s.vx / speed;
      const dirY = s.vy / speed;
      const tailX = x - dirX * s.length;
      const tailY = y - dirY * s.length;

      ctx.save();

      // Tail line with gradient opacity
      ctx.globalAlpha = alpha * 0.4;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Bright head
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();

      // Subtle glow around head
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  private updateIdleEffect() {
    // Increment idle timer
    const hasMovementInput = this.keys.has(this.layoutKeys.thrust) || this.keys.has(this.layoutKeys.left) ||
      this.keys.has(this.layoutKeys.right) || this.keys.has(this.layoutKeys.brake) ||
      this.keys.has('arrowup') || this.keys.has('arrowdown') || this.keys.has('arrowleft') || this.keys.has('arrowright');

    if (hasMovementInput) {
      this.idleTimer = 0;
      this.idleParticles = [];
      return;
    }

    this.idleTimer += this.dt;

    // After 60 seconds (3600 frames at 60fps), start idle effect
    if (this.idleTimer > 3600) {
      // Maintain a few orbiting particles
      if (this.idleParticles.length < 5) {
        this.idleParticles.push({
          angle: Math.random() * Math.PI * 2,
          dist: 30 + Math.random() * 25,
          speed: 0.005 + Math.random() * 0.008,
          size: 1 + Math.random() * 1.5,
          alpha: 0,
        });
      }

      // Update particles
      for (const p of this.idleParticles) {
        p.angle += p.speed * this.dt;
        // Fade in gently
        if (p.alpha < 0.4) p.alpha += 0.003 * this.dt;
      }
    }
  }

  private renderIdleEffect() {
    if (this.idleParticles.length === 0) return;

    const { ctx, state } = this;
    const { ship, camera } = state;
    const sx = ship.x - camera.x;
    const sy = ship.y - camera.y;

    ctx.save();
    for (const p of this.idleParticles) {
      const px = sx + Math.cos(p.angle) * p.dist;
      const py = sy + Math.sin(p.angle) * p.dist;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = '#8888cc';
      ctx.globalAlpha = p.alpha * (0.5 + 0.5 * Math.sin(p.angle * 3));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderKonamiEffect() {
    const { ctx, canvas } = this;
    const progress = 1 - (this.konamiEffectTimer / 180);

    ctx.save();

    // Rainbow border pulse
    const hue = (Date.now() * 0.5) % 360;
    const pulseAlpha = Math.max(0, 0.6 - progress * 0.8);

    // Top edge
    const edgeGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (let i = 0; i <= 6; i++) {
      edgeGrad.addColorStop(i / 6, `hsla(${(hue + i * 60) % 360}, 100%, 60%, ${pulseAlpha})`);
    }
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, canvas.width, 3);
    ctx.fillRect(0, canvas.height - 3, canvas.width, 3);

    // Side edges
    const sideGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (let i = 0; i <= 6; i++) {
      sideGrad.addColorStop(i / 6, `hsla(${(hue + i * 60 + 30) % 360}, 100%, 60%, ${pulseAlpha})`);
    }
    ctx.fillStyle = sideGrad;
    ctx.fillRect(0, 0, 3, canvas.height);
    ctx.fillRect(canvas.width - 3, 0, 3, canvas.height);

    // Brief center flash at start
    if (progress < 0.15) {
      const flashAlpha = (0.15 - progress) / 0.15 * 0.3;
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Small text that fades
    if (progress < 0.5) {
      ctx.globalAlpha = Math.max(0, 1 - progress * 2) * 0.7;
      ctx.font = '14px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
      ctx.fillText('// nice find //', canvas.width / 2, canvas.height * 0.4);
    }

    ctx.restore();
  }

  // ===== PASSIVE ACHIEVEMENTS & DYNAMICS =====

  private updatePassiveAchievements() {
    const { ship } = this.state;

    // Track distance traveled
    const dx = ship.x - this.prevDistX;
    const dy = ship.y - this.prevDistY;
    // Ignore large jumps (wrapping, teleporting)
    if (Math.abs(dx) < 100 && Math.abs(dy) < 100) {
      this.totalDistanceTraveled += Math.sqrt(dx * dx + dy * dy);
    }
    this.prevDistX = ship.x;
    this.prevDistY = ship.y;

    // Distance milestones (in pixels): 50k, 100k, 500k, 1M
    const distMilestones = [
      { dist: 50000, label: 'Voyager', achievementId: 'distance_50k' },
      { dist: 100000, label: 'Star Wanderer', achievementId: 'distance_100k' },
      { dist: 500000, label: 'Cosmic Drifter', achievementId: 'distance_500k' },
      { dist: 1000000, label: 'Light Traveler', achievementId: 'distance_1m' },
    ];
    for (const m of distMilestones) {
      if (this.totalDistanceTraveled >= m.dist && this.distanceMilestoneReached < m.dist) {
        this.distanceMilestoneReached = m.dist;
        this.distanceMilestoneTimer = 200;
        this.milestoneText = m.label;
        this.milestoneColor = '#88ccff';
        this.tryUnlockAchievement(m.achievementId);
      }
    }

    // Decay timers
    if (this.completionGlowTimer > 0) this.completionGlowTimer -= this.dt;
    if (this.completionMilestoneTimer > 0) this.completionMilestoneTimer -= this.dt;
    if (this.explorerEffectTimer > 0) this.explorerEffectTimer -= this.dt;
    if (this.distanceMilestoneTimer > 0) this.distanceMilestoneTimer -= this.dt;
  }

  private renderSpeedLines() {
    const { ctx, canvas, state } = this;
    const { ship } = state;

    const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    const speedMultiplier = 1 + ((this.shipEffects.speedBonus || 0) * 0.2);
    const maxSpeed = SHIP_BOOST_MAX_SPEED * speedMultiplier;
    const speedRatio = speed / maxSpeed;

    // Only show when going > 70% max speed
    if (speedRatio < 0.7) return;

    const intensity = (speedRatio - 0.7) / 0.3; // 0 to 1
    const alpha = intensity * 0.15; // Very subtle

    ctx.save();
    ctx.globalAlpha = alpha;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const lineCount = Math.floor(8 + intensity * 12);

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + Date.now() * 0.0003;
      const innerR = canvas.width * 0.35;
      const outerR = canvas.width * 0.55;

      const x1 = centerX + Math.cos(angle) * innerR;
      const y1 = centerY + Math.sin(angle) * innerR;
      const x2 = centerX + Math.cos(angle) * outerR;
      const y2 = centerY + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderCompletionEffects() {
    const { ctx, canvas } = this;

    // Orbital burst: light dots orbit the ship then shoot off
    if (this.completionGlowTimer > 0) {
      const { ship, camera } = this.state;
      const sx = ship.x - camera.x;
      const sy = ship.y - camera.y;
      const progress = 1 - (this.completionGlowTimer / 90);

      ctx.save();
      const dotCount = 4;
      const orbitPhase = progress * Math.PI * 4; // 2 full orbits
      const orbitRadius = 25 + progress * 10;

      for (let i = 0; i < dotCount; i++) {
        const baseAngle = (i / dotCount) * Math.PI * 2;
        const dotAlpha = Math.max(0, 1 - progress * 1.2) * 0.8;

        let px: number, py: number, dotSize: number;

        if (progress < 0.65) {
          // Orbiting phase - dots circle the ship
          const angle = baseAngle + orbitPhase;
          px = sx + Math.cos(angle) * orbitRadius;
          py = sy + Math.sin(angle) * orbitRadius;
          dotSize = 2.5;
        } else {
          // Launch phase - dots shoot outward
          const launchProgress = (progress - 0.65) / 0.35;
          const launchAngle = baseAngle + orbitPhase;
          const launchDist = orbitRadius + launchProgress * 120;
          px = sx + Math.cos(launchAngle) * launchDist;
          py = sy + Math.sin(launchAngle) * launchDist;
          dotSize = 2.5 * (1 - launchProgress);
        }

        // Dot glow
        ctx.beginPath();
        ctx.arc(px, py, dotSize + 2, 0, Math.PI * 2);
        ctx.fillStyle = '#88ccff';
        ctx.globalAlpha = dotAlpha * 0.2;
        ctx.fill();

        // Dot core
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = '#ccddff';
        ctx.globalAlpha = dotAlpha;
        ctx.fill();

        // Tiny trail behind each dot during orbit
        if (progress < 0.65) {
          const trailAngle = baseAngle + orbitPhase - 0.3;
          const tx = sx + Math.cos(trailAngle) * orbitRadius;
          const ty = sy + Math.sin(trailAngle) * orbitRadius;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(px, py);
          ctx.strokeStyle = '#88ccff';
          ctx.globalAlpha = dotAlpha * 0.3;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Milestone celebration (golden sparkles)
    if (this.completionMilestoneTimer > 0) {
      const progress = 1 - (this.completionMilestoneTimer / 180);
      ctx.save();

      // Sparkle particles around screen edges
      const sparkleCount = 15;
      for (let i = 0; i < sparkleCount; i++) {
        const t = (i / sparkleCount + progress * 0.5) % 1;
        const sparkleAlpha = Math.max(0, 1 - progress) * 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 6 + Date.now() * 0.01));
        const sparkleX = t * canvas.width;
        const sparkleY = 20 + Math.sin(t * Math.PI * 3 + Date.now() * 0.002) * 15;

        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = sparkleAlpha;
        ctx.fill();
      }

      // Show streak count
      if (progress < 0.6) {
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.7) * 0.6;
        ctx.font = '13px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`${this.completionMilestone} tasks`, canvas.width / 2, canvas.height * 0.18);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  private renderMilestoneText() {
    const { ctx, canvas } = this;

    // Explorer achievement
    if (this.explorerEffectTimer > 0) {
      const progress = 1 - (this.explorerEffectTimer / 240);
      ctx.save();

      // Constellation-like dots connecting in a pattern
      const dotCount = 8;
      const centerX = canvas.width / 2;
      const baseY = canvas.height * 0.15;
      const radius = 40;

      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2;
        const dotX = centerX + Math.cos(angle) * radius;
        const dotY = baseY + Math.sin(angle) * radius * 0.5;
        const dotAlpha = Math.max(0, Math.min(1, (progress * dotCount - i) * 2)) * Math.max(0, 1 - progress * 0.8);

        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#88ccff';
        ctx.globalAlpha = dotAlpha * 0.8;
        ctx.fill();

        // Connect to next dot
        if (i > 0) {
          const prevAngle = ((i - 1) / dotCount) * Math.PI * 2 - Math.PI / 2;
          const prevX = centerX + Math.cos(prevAngle) * radius;
          const prevY = baseY + Math.sin(prevAngle) * radius * 0.5;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(dotX, dotY);
          ctx.strokeStyle = '#88ccff';
          ctx.globalAlpha = dotAlpha * 0.3;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      if (progress > 0.3 && progress < 0.8) {
        ctx.globalAlpha = Math.min(1, (progress - 0.3) * 4) * Math.max(0, 1 - (progress - 0.5) * 3.3) * 0.7;
        ctx.font = '12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#88ccff';
        ctx.fillText('Explorer', canvas.width / 2, baseY + radius + 20);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Distance milestones
    if (this.distanceMilestoneTimer > 0) {
      const progress = 1 - (this.distanceMilestoneTimer / 200);
      ctx.save();

      if (progress < 0.7) {
        const fadeIn = Math.min(1, progress * 5);
        const fadeOut = Math.max(0, 1 - (progress - 0.4) * 3.3);
        ctx.globalAlpha = fadeIn * fadeOut * 0.5;
        ctx.font = '11px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.milestoneColor;
        ctx.fillText(this.milestoneText, canvas.width / 2, canvas.height * 0.85);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ===== SPACE WHALE - Rare ambient creature =====
  private updateSpaceWhale() {
    const now = Date.now();
    const t = now / 1000;

    // Deterministic parametric position — slow, graceful drift synced across all clients
    // Different frequencies than nomad so they move independently
    const rawX = 5000
      + 4200 * Math.sin(t * 0.0031 + 4.1)    // very slow sweep (~34 min)
      + 2200 * Math.sin(t * 0.0079 + 1.9)    // medium sweep (~13 min)
      + 500 * Math.sin(t * 0.0173 + 2.7);    // gentle jitter (~6 min)
    const rawY = 5000
      + 4200 * Math.cos(t * 0.0037 + 0.6)    // very slow sweep (~28 min)
      + 2200 * Math.cos(t * 0.0067 + 3.4)    // medium sweep (~16 min)
      + 500 * Math.cos(t * 0.0149 + 5.1);    // gentle jitter (~7 min)

    // Wrap around map edges
    this.spaceWhale.x = ((rawX % 10000) + 10000) % 10000;
    this.spaceWhale.y = ((rawY % 10000) + 10000) % 10000;

    // Velocity for rotation (analytical derivative)
    const vx = 4200 * 0.0031 * Math.cos(t * 0.0031 + 4.1)
      + 2200 * 0.0079 * Math.cos(t * 0.0079 + 1.9)
      + 500 * 0.0173 * Math.cos(t * 0.0173 + 2.7);
    const vy = -4200 * 0.0037 * Math.sin(t * 0.0037 + 0.6)
      - 2200 * 0.0067 * Math.sin(t * 0.0067 + 3.4)
      - 500 * 0.0149 * Math.sin(t * 0.0149 + 5.1);

    // Smooth rotation toward travel direction
    const targetRot = Math.atan2(vy, vx);
    let diff = targetRot - this.spaceWhale.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.spaceWhale.rotation += diff * 0.03;

    // Visibility cycle: visible ~60% of the time, fading in/out gracefully
    const visibilityCycle = Math.sin(t * 0.0052 + 0.8); // ~20 min full cycle
    const whaleVisible = visibilityCycle > -0.2;
    this.spaceWhale.alpha = whaleVisible ? Math.min(0.55, (visibilityCycle + 0.2) * 0.8) : 0;

    // Proximity to player - whale sound + encounter achievement (only when visible)
    if (this.spaceWhale.alpha > 0.1 && this.spaceWhaleImage) {
      const { ship } = this.state;
      const dx = ship.x - this.spaceWhale.x;
      const dy = ship.y - this.spaceWhale.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 500 && !this.whaleSoundPlayed) {
        this.whaleSoundPlayed = true;
        soundManager.playSpaceWhale();
      }
      if (dist > 600) {
        this.whaleSoundPlayed = false;
      }

      if (dist < 300 && !this.whaleEncountered) {
        this.whaleEncountered = true;
        this.whaleEncounterTimer = 240;
        this.tryUnlockAchievement('whale_encounter');
      }
    }

    // Achievement timer
    if (this.whaleEncounterTimer > 0) {
      this.whaleEncounterTimer -= this.dt;
    }

    // Whale slap cooldown
    if (this.whaleSlapCooldown > 0) {
      this.whaleSlapCooldown -= this.dt;
    }
    if (this.whaleSlapTextTimer > 0) {
      this.whaleSlapTextTimer -= this.dt;
    }

    // Steve Irwin popup timer — freeze ship while showing
    if (this.steveIrwinPopupTimer > 0) {
      this.steveIrwinPopupTimer -= this.dt;
      // Keep ship frozen
      this.state.ship.vx = 0;
      this.state.ship.vy = 0;
      // When popup ends, restore some velocity (gentle nudge away)
      if (this.steveIrwinPopupTimer <= 0) {
        this.state.ship.vx = this.steveIrwinFreezeVx * 0.3;
        this.state.ship.vy = this.steveIrwinFreezeVy * 0.3;
      }
    }
  }

  // Check if a projectile at (px, py) hits the whale. Uses a rotated ellipse matching the whale's elongated body.
  private checkWhaleProjectileHit(px: number, py: number): boolean {
    if (this.spaceWhale.alpha < 0.1 || this.whaleSlapCooldown > 0) return false;

    // Transform projectile position into whale's local space (rotated by whale's heading)
    const dx = px - this.spaceWhale.x;
    const dy = py - this.spaceWhale.y;
    const cos = Math.cos(-this.spaceWhale.rotation);
    const sin = Math.sin(-this.spaceWhale.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Ellipse hitbox: whale image is 1344x768, rendered at scale 0.4 → ~538x307
    // Semi-axes: ~270px along body (X), ~154px perpendicular (Y)
    const a = 270; // Half-length along body
    const b = 154; // Half-height perpendicular
    const ellipseDist = (localX * localX) / (a * a) + (localY * localY) / (b * b);

    if (ellipseDist < 1) {
      this.triggerWhaleTailSlap(px, py);
      return true;
    }
    return false;
  }

  // Steve Irwin disapproves of shooting whales
  private triggerWhaleTailSlap(hitX: number, hitY: number) {
    const { ship } = this.state;

    // Cooldown: 5 seconds at 60fps
    this.whaleSlapCooldown = 300;

    // Freeze the ship — store velocity, zero it out
    this.steveIrwinFreezeVx = ship.vx;
    this.steveIrwinFreezeVy = ship.vy;
    ship.vx = 0;
    ship.vy = 0;

    // Show Steve Irwin popup for ~3 seconds (180 frames), cycle to next image
    this.steveIrwinPopupTimer = 180;
    if (this.steveIrwinImages.length > 0) {
      this.steveIrwinImageIndex = (this.steveIrwinImageIndex + 1) % this.steveIrwinImages.length;
    }

    // Mild screen shake
    this.screenShake = { intensity: 12, timer: 15 };

    // Play Steve Irwin voice clip (random)
    soundManager.playSteveIrwin();

    // Achievement
    this.tryUnlockAchievement('whale_slap');

    // Emit a burst of whale-colored particles at the impact point
    const colors = ['#64c8ff', '#88ddff', '#44aaff', '#aaeeff', '#ffffff', '#00ccff'];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      this.state.particles.push({
        x: hitX + (Math.random() - 0.5) * 30,
        y: hitY + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 25,
        maxLife: 55,
        size: Math.random() * 6 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

  }

  // ─── NOMAD BOSS FIGHT ────────────────────────────────────────

  private checkNomadProjectileHit(px: number, py: number, damage: number = 15): boolean {
    if (this.nomadFightCooldown > 0) return false;
    const dx = px - this.neonNomad.x;
    const dy = py - this.neonNomad.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = SpaceGame.NOMAD_RENDER_SIZE / 2;

    if (dist < hitRadius) {
      if (this.nomadFight?.active) {
        // If already surrendered, keep HP at 1 and ignore further damage
        if (this.nomadFight.surrendered) {
          this.nomadFight.nomadHP = 1;
          return true;
        }

        // Deal damage to nomad during fight
        this.nomadFight.nomadHP -= damage;
        this.nomadFight.damageFlashTimer = 8;
        this.screenShake = { intensity: 4, timer: 6 };
        soundManager.playNomadBossHit();

        // Hit particles
        const colors = ['#ff00ff', '#00ffff', '#ffa500', '#ffffff'];
        for (let i = 0; i < 6; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 4 + 2;
          this.state.particles.push({
            x: px, y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 15 + Math.random() * 10,
            maxLife: 25,
            size: Math.random() * 3 + 1,
            color: colors[Math.floor(Math.random() * colors.length)],
          });
        }

        // Clamp at 1 HP and surrender instead of dying
        if (this.nomadFight.nomadHP <= 1) {
          this.nomadFight.nomadHP = 1;
          this.triggerNomadSurrender();
        }
      } else {
        // Start fight
        this.startNomadFight();
      }
      return true;
    }
    return false;
  }

  private getPlayerMaxHP(): number {
    return 100 + (this.shipEffects.healthBonus || 0) * 25;
  }

  private startNomadFight() {
    // Hard mode activates after first victory (nomad_slayer achievement unlocked)
    const isHard = this.unlockedAchievements.has('nomad_slayer');
    this.nomadFight = {
      active: true,
      nomadHP: isHard ? 4000 : 2000,
      playerHP: this.getPlayerMaxHP(),
      attackTimer: isHard ? 50 : 90, // shorter grace period in hard mode
      patternIndex: -1,
      spiralAngle: 0,
      phaseTimer: 0,
      nomadVx: 0,
      nomadVy: 0,
      enraged: false,
      introTimer: isHard ? 60 : 120, // shorter intro in hard mode
      defeatTimer: 0,
      victoryTimer: 0,
      strafeTimer: 0,
      strafeDir: 1,
      savedNomadPos: { x: this.neonNomad.x, y: this.neonNomad.y },
      damageFlashTimer: 0,
      playerDamageFlashTimer: 0,
      contactDamageCooldown: 0,
      deathMessage: '',
      surrendered: false,
      surrenderTimer: 0,
      surrenderMessage: '',
      lootCrate: null,
      nearCrate: false,
      hardMode: isHard,
    };
    this.nomadProjectiles = [];
    // Play boss theme immediately and trigger intro voice
    soundManager.playNomadBossTheme();
    this.onNomadFightStart?.();
  }

  private updateNomadFight() {
    const fight = this.nomadFight!;
    const { ship } = this.state;
    const nomad = this.neonNomad;

    // Decrement timers
    if (fight.damageFlashTimer > 0) fight.damageFlashTimer -= this.dt;
    if (fight.playerDamageFlashTimer > 0) fight.playerDamageFlashTimer -= this.dt;

    // Cooldown tick
    if (this.nomadFightCooldown > 0) this.nomadFightCooldown -= this.dt;

    // Intro timer (nomad pauses before attacking)
    if (fight.introTimer > 0) {
      fight.introTimer -= this.dt;
      return;
    }

    // Defeat timer — camera locks on death position during animation
    if (fight.defeatTimer > 0) {
      fight.defeatTimer -= this.dt;
      // Lock camera on explosion site
      const deathPos = fight.savedNomadPos;
      this.state.camera.x = deathPos.x - this.canvas.width / 2;
      this.state.camera.y = deathPos.y - this.canvas.height / 2;
      if (fight.defeatTimer <= 0) {
        this.endNomadFight(false);
      }
      return;
    }
    if (fight.victoryTimer > 0) {
      fight.victoryTimer -= this.dt;
      // Victory particles during celebration
      if (Math.random() < 0.3) {
        const colors = ['#ff00ff', '#00ffff', '#ffa500', '#ffff00', '#4ade80', '#ff6b9d'];
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        this.state.particles.push({
          x: nomad.x + (Math.random() - 0.5) * 100,
          y: nomad.y + (Math.random() - 0.5) * 100,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 25 + Math.random() * 20,
          maxLife: 45,
          size: Math.random() * 4 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      if (fight.victoryTimer <= 0) {
        this.endNomadFight(true);
      }
      return;
    }

    // ── Surrender phase: nomad stops attacking, drops loot crate ──
    if (fight.surrendered) {
      // Count down surrender timer, then spawn crate
      if (fight.surrenderTimer > 0) {
        fight.surrenderTimer -= this.dt;
        if (fight.surrenderTimer <= 0 && !fight.lootCrate) {
          this.spawnNomadLootCrate();
        }
      }
      // Update loot crate (bobbing, proximity, collection)
      if (fight.lootCrate && !fight.lootCrate.collected) {
        this.updateNomadLootCrate();
      }
      return; // Skip all chase/attack logic
    }

    // Check enrage (30% of max HP)
    const maxHP = fight.hardMode ? 4000 : 2000;
    fight.enraged = fight.nomadHP <= maxHP * 0.3;

    // ── Movement: chase player (shortest path across world wrap) ──
    let dx = ship.x - nomad.x;
    let dy = ship.y - nomad.y;
    // Wrap to shortest path
    if (dx > 5000) dx -= 10000;
    if (dx < -5000) dx += 10000;
    if (dy > 5000) dy -= 10000;
    if (dy < -5000) dy += 10000;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetAngle = Math.atan2(dy, dx);

    // Smooth rotation toward player
    let angleDiff = targetAngle - nomad.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    nomad.rotation += angleDiff * 0.04 * this.dt;

    // Hard mode: significantly faster movement
    const baseChase = fight.hardMode ? 14 : 10.5;
    const enragedChase = fight.hardMode ? 18 : 13;
    const chaseSpeed = fight.enraged ? enragedChase : baseChase;

    // Strafe logic: perpendicular dash every 180 frames (more frequent in hard mode)
    fight.strafeTimer -= this.dt;
    if (fight.strafeTimer <= 0) {
      fight.strafeTimer = fight.hardMode ? 90 + Math.random() * 40 : 150 + Math.random() * 60;
      fight.strafeDir = Math.random() < 0.5 ? 1 : -1;
    }
    const strafing = fight.strafeTimer > 120; // strafe for first 30 frames of cycle
    const perpX = -dy / dist;
    const perpY = dx / dist;

    if (strafing) {
      fight.nomadVx = (dx / dist) * chaseSpeed * 0.5 + perpX * fight.strafeDir * chaseSpeed * 0.8;
      fight.nomadVy = (dy / dist) * chaseSpeed * 0.5 + perpY * fight.strafeDir * chaseSpeed * 0.8;
    } else {
      fight.nomadVx = (dx / dist) * chaseSpeed;
      fight.nomadVy = (dy / dist) * chaseSpeed;
    }

    nomad.x += fight.nomadVx * this.dt;
    nomad.y += fight.nomadVy * this.dt;

    // Wrap around world boundaries (toroidal) — nomad can chase across edges
    nomad.x = ((nomad.x % 10000) + 10000) % 10000;
    nomad.y = ((nomad.y % 10000) + 10000) % 10000;

    // ── Body collision: nomad ramming into player deals damage ──
    if (fight.contactDamageCooldown > 0) fight.contactDamageCooldown -= this.dt;
    const contactRadius = SpaceGame.NOMAD_RENDER_SIZE / 2 + 15;
    if (dist < contactRadius && fight.contactDamageCooldown <= 0) {
      fight.playerHP -= fight.hardMode ? 20 : 12;
      fight.contactDamageCooldown = fight.hardMode ? 20 : 30; // faster ram cycle in hard mode
      fight.playerDamageFlashTimer = 6;
      this.screenShake = { intensity: 10, timer: 10 };
      soundManager.playCollision();

      // Knockback player away from nomad
      const knockStr = 12;
      ship.vx = (dx / dist) * knockStr;
      ship.vy = (dy / dist) * knockStr;

      // Contact sparks
      const midX = (ship.x + nomad.x) / 2;
      const midY = (ship.y + nomad.y) / 2;
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2;
        this.state.particles.push({
          x: midX, y: midY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 12 + Math.random() * 8,
          maxLife: 20,
          size: Math.random() * 3 + 1,
          color: Math.random() < 0.5 ? '#ff00ff' : '#ff4444',
        });
      }

      if (fight.playerHP <= 0) {
        this.triggerNomadDefeat();
        return;
      }
    }

    // ── Attack patterns ──
    fight.attackTimer -= this.dt;
    if (fight.attackTimer <= 0) {
      // Pick random pattern (avoid repeating) — 6 patterns now (0-5)
      let newPattern = Math.floor(Math.random() * 6);
      if (newPattern === fight.patternIndex) newPattern = (newPattern + 1) % 6;
      fight.patternIndex = newPattern;
      fight.phaseTimer = 0;
      fight.spiralAngle = 0;

      // Hard mode: much shorter cooldowns between attack patterns
      const baseCooldown = fight.hardMode
        ? (fight.enraged ? 35 : 60)
        : (fight.enraged ? 70 : 110);
      fight.attackTimer = baseCooldown + Math.random() * (fight.hardMode ? 15 : 30);
    }

    fight.phaseTimer += this.dt;
    const angleToPlayer = Math.atan2(dy, dx); // uses wrapped dx/dy
    // Hard mode: faster bullets across the board
    const hardMult = fight.hardMode ? 1.3 : 1;
    const bulletSpeedMult = (fight.enraged ? 1.3 : 1) * hardMult;

    // Spawn offset: bullets come from the front of the nomad
    const spawnDist = SpaceGame.NOMAD_RENDER_SIZE / 2;
    const spawnX = nomad.x + Math.cos(nomad.rotation) * spawnDist;
    const spawnY = nomad.y + Math.sin(nomad.rotation) * spawnDist;

    switch (fight.patternIndex) {
      case 0: { // Burst fire: aimed shots, 8-frame interval (more shots in hard mode)
        const burstDuration = fight.hardMode ? 64 : 40; // 8 vs 5 shots
        if (fight.phaseTimer % 8 < this.dt && fight.phaseTimer < burstDuration) {
          const speed = 8 * bulletSpeedMult;
          const spread = (Math.random() - 0.5) * 0.15;
          this.nomadProjectiles.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angleToPlayer + spread) * speed,
            vy: Math.sin(angleToPlayer + spread) * speed,
            life: 120, maxLife: 120, damage: fight.hardMode ? 12 : 8, size: 4,
            color: '#ff00ff',
          });
          soundManager.playNomadShoot();
        }
        break;
      }
      case 1: { // Spiral: continuous rotating fire (longer + tighter in hard mode)
        const spiralDuration = fight.hardMode ? 90 : 60;
        const spiralInterval = fight.hardMode ? 2 : 3;
        if (fight.phaseTimer < spiralDuration && fight.phaseTimer % spiralInterval < this.dt) {
          fight.spiralAngle += fight.hardMode ? 0.28 : 0.35;
          const speed = 6 * bulletSpeedMult;
          this.nomadProjectiles.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(fight.spiralAngle) * speed,
            vy: Math.sin(fight.spiralAngle) * speed,
            life: 100, maxLife: 100, damage: fight.hardMode ? 8 : 5, size: 3,
            color: '#00ffff',
          });
          // Hard mode: dual spiral (second arm offset by PI)
          if (fight.hardMode) {
            this.nomadProjectiles.push({
              x: spawnX, y: spawnY,
              vx: Math.cos(fight.spiralAngle + Math.PI) * speed,
              vy: Math.sin(fight.spiralAngle + Math.PI) * speed,
              life: 100, maxLife: 100, damage: 8, size: 3,
              color: '#ff00ff',
            });
          }
          soundManager.playNomadShoot();
        }
        break;
      }
      case 2: { // Radial burst: bullets in all directions (more bullets in hard mode)
        const radialCount = fight.hardMode ? 24 : 16;
        if (fight.phaseTimer < 2) {
          for (let i = 0; i < radialCount; i++) {
            const a = (i / radialCount) * Math.PI * 2;
            const speed = 7 * bulletSpeedMult;
            this.nomadProjectiles.push({
              x: nomad.x, y: nomad.y,
              vx: Math.cos(a) * speed,
              vy: Math.sin(a) * speed,
              life: 100, maxLife: 100, damage: fight.hardMode ? 10 : 6, size: 4,
              color: '#ffa500',
            });
          }
          soundManager.playNomadShoot();
        }
        break;
      }
      case 3: { // Spread fan: bullets in arc toward player (wider + more in hard mode)
        const fanCount = fight.hardMode ? 11 : 7;
        const fanArc = fight.hardMode ? Math.PI * 0.6 : Math.PI / 2; // 108° vs 90°
        if (fight.phaseTimer < 2) {
          for (let i = 0; i < fanCount; i++) {
            const fanAngle = angleToPlayer - fanArc / 2 + (i / (fanCount - 1)) * fanArc;
            const speed = 9 * bulletSpeedMult;
            this.nomadProjectiles.push({
              x: spawnX, y: spawnY,
              vx: Math.cos(fanAngle) * speed,
              vy: Math.sin(fanAngle) * speed,
              life: 90, maxLife: 90, damage: fight.hardMode ? 10 : 7, size: 4,
              color: '#ff6b9d',
            });
          }
          soundManager.playNomadShoot();
        }
        break;
      }
      case 4: // Random spray: bullets in random directions (more + faster in hard mode)
        if (fight.phaseTimer < (fight.hardMode ? 50 : 40) && fight.phaseTimer % 2 < this.dt) {
          const a = Math.random() * Math.PI * 2;
          const speed = (5 + Math.random() * 5) * bulletSpeedMult;
          this.nomadProjectiles.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life: 100, maxLife: 100,
            damage: fight.hardMode ? 7 + Math.floor(Math.random() * 6) : 4 + Math.floor(Math.random() * 5),
            size: 3 + Math.random() * 2,
            color: Math.random() < 0.5 ? '#ff00ff' : '#00ffff',
          });
          // Hard mode: double projectile per tick
          if (fight.hardMode) {
            const a2 = Math.random() * Math.PI * 2;
            this.nomadProjectiles.push({
              x: spawnX, y: spawnY,
              vx: Math.cos(a2) * speed * 0.8,
              vy: Math.sin(a2) * speed * 0.8,
              life: 100, maxLife: 100, damage: 6, size: 3,
              color: '#ff3333',
            });
          }
          soundManager.playNomadShoot();
        }
        break;
      case 5: { // Rockets: homing rockets (more + faster in hard mode)
        const rocketInterval = fight.hardMode ? 14 : 20;
        const rocketDuration = fight.hardMode ? 84 : 60; // 6 vs 3 rockets
        if (fight.phaseTimer % rocketInterval < this.dt && fight.phaseTimer < rocketDuration) {
          const speed = 5 * bulletSpeedMult;
          this.nomadProjectiles.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angleToPlayer) * speed,
            vy: Math.sin(angleToPlayer) * speed,
            life: fight.hardMode ? 240 : 180, maxLife: fight.hardMode ? 240 : 180,
            damage: fight.hardMode ? 22 : 15, size: 6,
            color: '#ff6600',
          });
          soundManager.playNomadRocket();
        }
        break;
      }
    }

    // Enraged: fire extra overlapping pattern (much more in hard mode)
    const enrageInterval = fight.hardMode ? 6 : 12;
    if (fight.enraged && fight.phaseTimer % enrageInterval < this.dt) {
      const a = angleToPlayer + (Math.random() - 0.5) * 0.5;
      const speed = 7 * bulletSpeedMult;
      this.nomadProjectiles.push({
        x: spawnX, y: spawnY,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 90, maxLife: 90, damage: fight.hardMode ? 10 : 6, size: 3,
        color: '#ff3333',
      });
      // Hard mode: second enraged shot at slight offset
      if (fight.hardMode) {
        const a2 = angleToPlayer + (Math.random() - 0.5) * 0.8;
        this.nomadProjectiles.push({
          x: spawnX, y: spawnY,
          vx: Math.cos(a2) * speed * 0.9,
          vy: Math.sin(a2) * speed * 0.9,
          life: 90, maxLife: 90, damage: 8, size: 3,
          color: '#ff0066',
        });
      }
    }

  }

  private updateNomadProjectiles() {
    const { ship } = this.state;
    for (let i = this.nomadProjectiles.length - 1; i >= 0; i--) {
      const p = this.nomadProjectiles[i];

      // Rockets (large orange) home toward player
      if (p.size >= 6 && p.color === '#ff6600') {
        const rdx = ship.x - p.x;
        const rdy = ship.y - p.y;
        const targetAngle = Math.atan2(rdy, rdx);
        const currentAngle = Math.atan2(p.vy, p.vx);
        let aDiff = targetAngle - currentAngle;
        while (aDiff > Math.PI) aDiff -= Math.PI * 2;
        while (aDiff < -Math.PI) aDiff += Math.PI * 2;
        const turnSpeed = 0.04 * this.dt;
        const newAngle = currentAngle + Math.sign(aDiff) * Math.min(Math.abs(aDiff), turnSpeed);
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = Math.cos(newAngle) * spd;
        p.vy = Math.sin(newAngle) * spd;

        // Rocket trail particles
        if (Math.random() < 0.4) {
          this.state.particles.push({
            x: p.x - p.vx * 0.5, y: p.y - p.vy * 0.5,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            life: 10 + Math.random() * 8,
            maxLife: 18,
            size: Math.random() * 2 + 1.5,
            color: Math.random() < 0.5 ? '#ff6600' : '#ffaa00',
          });
        }
      }

      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.life -= this.dt;

      if (p.life <= 0) {
        this.nomadProjectiles.splice(i, 1);
        continue;
      }

      // Check collision with player ship
      if (this.nomadFight?.active && this.nomadFight.defeatTimer <= 0) {
        const dx = p.x - ship.x;
        const dy = p.y - ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 20) {
          this.nomadFight.playerHP -= p.damage;
          this.nomadFight.playerDamageFlashTimer = 6;
          this.screenShake = { intensity: 6, timer: 8 };
          soundManager.playCollision();

          // Hit particles
          for (let j = 0; j < 4; j++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.state.particles.push({
              x: p.x, y: p.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 10 + Math.random() * 8,
              maxLife: 18,
              size: Math.random() * 2 + 1,
              color: '#ff4444',
            });
          }

          this.nomadProjectiles.splice(i, 1);

          if (this.nomadFight.playerHP <= 0) {
            this.triggerNomadDefeat();
          }
          continue;
        }
      }
    }
  }

  private static readonly NOMAD_DEATH_MESSAGES = [
    'ADIOS, GRINGO',
    'NO REFUNDS, ESE',
    'YOU MESS WITH THE NOMAD, YOU GET THE HORNS',
    'SHOULDA BOUGHT SOMETHING, PENDEJO',
    'THAT WAS FREE OF CHARGE, AMIGO',
    'COME BACK WHEN YOU GOT SKILLS, MIJO',
    'THE NOMAD ALWAYS COLLECTS',
    'YOU CRASHED HARDER THAN YOUR CREDIT SCORE',
    'PIMP MY WRECK',
    'ANOTHER SATISFIED CUSTOMER... NOT',
    'WASTED, GRINGO STYLE',
    'AY DIOS MIO, THAT WAS EASY',
    'REST IN PIECES, CHEAPSKATE',
    'NO HAGGLING IN SPACE, AMIGO',
    'VAYA CON DIOS',
    'WELCOME TO THE JUNKYARD, HERMANO',
    'THIS ONE\'S ON THE HOUSE',
    'DON\'T SHOOT THE MERCHANT, LOCO',
  ];

  private static readonly NOMAD_SURRENDER_MESSAGES = [
    'OKAY OKAY, YOU GOT ME... TAKE THIS!',
    'MERCY! HERE, A GIFT!',
    'ALRIGHT ESE, YOU WIN THIS ROUND!',
    'AY CARAMBA, TAKE MY STUFF!',
    'I YIELD, GRINGO! CHECK THIS OUT!',
    'FINE FINE, HERE\'S YOUR PRIZE, LOCO!',
    'YOU\'RE TOUGHER THAN YOU LOOK, AMIGO!',
    'THE NOMAD KNOWS WHEN HE\'S BEAT!',
  ];

  private triggerNomadSurrender() {
    if (!this.nomadFight || this.nomadFight.surrendered) return;
    const nomad = this.neonNomad;

    this.nomadFight.surrendered = true;
    this.nomadFight.surrenderTimer = 180; // 3 seconds until crate spawns
    this.nomadFight.nomadHP = 1;

    // Pick random surrender line
    const msgs = SpaceGame.NOMAD_SURRENDER_MESSAGES;
    this.nomadFight.surrenderMessage = msgs[Math.floor(Math.random() * msgs.length)];

    // Show floating surrender text above Nomad
    this.nomadSurrenderText = {
      text: this.nomadFight.surrenderMessage,
      x: nomad.x,
      y: nomad.y,
      timer: 240, // 4 seconds visible
    };

    // Clear all projectiles — nomad stops attacking
    this.nomadProjectiles = [];

    // Fade boss music
    soundManager.stopNomadBossTheme(3000);
  }

  private spawnNomadLootCrate() {
    if (!this.nomadFight) return;
    const nomad = this.neonNomad;
    const { ship } = this.state;

    // Spawn crate 80px from Nomad toward player
    const dx = ship.x - nomad.x;
    const dy = ship.y - nomad.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const crateX = nomad.x + (dx / dist) * 80;
    const crateY = nomad.y + (dy / dist) * 80;

    this.nomadFight.lootCrate = {
      x: crateX,
      y: crateY,
      spawnTimer: 0,
      bobTimer: 0,
      glowPulse: 0,
      collected: false,
    };

    // Screen shake on spawn
    this.screenShake = { intensity: 8, timer: 10 };
  }

  private updateNomadLootCrate() {
    if (!this.nomadFight?.lootCrate) return;
    const crate = this.nomadFight.lootCrate;
    const { ship } = this.state;

    crate.bobTimer += this.dt;
    crate.glowPulse += this.dt;

    // Gold sparkle particles around crate
    if (Math.random() < 0.4) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 20 + Math.random() * 15;
      this.state.particles.push({
        x: crate.x + Math.cos(angle) * radius,
        y: crate.y + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -Math.random() * 1.5 - 0.5,
        life: 20 + Math.random() * 15,
        maxLife: 35,
        size: Math.random() * 2.5 + 1,
        color: Math.random() < 0.5 ? '#ffd700' : '#ffaa00',
      });
    }

    // Check proximity to player
    const dx = ship.x - crate.x;
    const dy = ship.y - crate.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.nomadFight.nearCrate = dist < 60;

    // SPACEBAR collection
    if (this.nomadFight.nearCrate && this.keys.has(' ')) {
      this.keys.delete(' ');
      this.collectNomadLootCrate();
    }
  }

  private collectNomadLootCrate() {
    if (!this.nomadFight?.lootCrate) return;
    const crate = this.nomadFight.lootCrate;
    crate.collected = true;

    // Crate pickup sound
    soundManager.playLootCrateCollect();

    // Burst of gold particles
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.state.particles.push({
        x: crate.x,
        y: crate.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.random() * 20,
        maxLife: 45,
        size: Math.random() * 4 + 2,
        color: ['#ffd700', '#ffaa00', '#fff700', '#ffffff'][Math.floor(Math.random() * 4)],
      });
    }

    // Screen shake
    this.screenShake = { intensity: 12, timer: 15 };

    // Fire callback to open reward modal in App.tsx
    this.onNomadLootCollected?.();
  }

  public endNomadFightAfterLoot() {
    if (!this.nomadFight) return;
    const nomad = this.neonNomad;

    // Show "+1000 PTS" floating text
    this.nomadVictoryText = {
      text: '+1000 PTS',
      x: nomad.x,
      y: nomad.y,
      timer: 180,
    };

    // Victory particles
    const colors = ['#ff00ff', '#00ffff', '#ffa500', '#ffff00', '#4ade80', '#ff6b9d', '#8b5cf6'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.state.particles.push({
        x: nomad.x + (Math.random() - 0.5) * 40,
        y: nomad.y + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 25,
        maxLife: 55,
        size: Math.random() * 5 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    // Normal cleanup
    this.endNomadFight(true);
  }

  private triggerNomadDefeat() {
    if (!this.nomadFight) return;
    const { ship } = this.state;

    // Pick random death message
    const msgs = SpaceGame.NOMAD_DEATH_MESSAGES;
    this.nomadFight.deathMessage = msgs[Math.floor(Math.random() * msgs.length)];

    // 360 frames = 6 seconds (explosion → fade → death message → respawn)
    this.nomadFight.defeatTimer = 360;

    // Save death position for camera lock
    this.nomadFight.savedNomadPos = { x: ship.x, y: ship.y };

    // Massive ship explosion — 3 waves of particles
    const colors1 = ['#ff4444', '#ff8800', '#ffcc00', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 2;
      this.state.particles.push({
        x: ship.x + (Math.random() - 0.5) * 20,
        y: ship.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 40 + Math.random() * 30,
        maxLife: 70,
        size: Math.random() * 6 + 2,
        color: colors1[Math.floor(Math.random() * colors1.length)],
      });
    }
    // Secondary debris ring
    const colors2 = ['#ff2200', '#ff6600', '#882200', '#ffaa00'];
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      this.state.particles.push({
        x: ship.x + (Math.random() - 0.5) * 30,
        y: ship.y + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 50 + Math.random() * 40,
        maxLife: 90,
        size: Math.random() * 4 + 3,
        color: colors2[Math.floor(Math.random() * colors2.length)],
      });
    }

    // Hide ship immediately (move far offscreen)
    ship.x = -9999;
    ship.y = -9999;
    ship.vx = 0;
    ship.vy = 0;

    // Big screen shake
    this.screenShake = { intensity: 30, timer: 40 };

    // Fade out boss music over the death animation
    soundManager.stopNomadBossTheme(5000);
  }

  // Legacy method — no longer called directly (surrender flow replaces instant victory)
  // Kept for reference; rewards now handled via loot crate → modal flow
  private triggerNomadVictory() {
    if (!this.nomadFight) return;
    // Redirect to surrender flow
    this.triggerNomadSurrender();
  }

  private endNomadFight(victory: boolean) {
    const nomad = this.neonNomad;

    if (!victory && this.nomadFight) {
      // Player died or fled — respawn ship at player's zone center
      const { ship } = this.state;
      // Default to center if no zone found
      ship.x = 5000;
      ship.y = 5000;
      ship.vx = 0;
      ship.vy = 0;

      // Try to find player's zone
      const zones = [
        { name: 'quentin', x: 8000, y: 5000 },
        { name: 'alex', x: 7100, y: 2900 },
        { name: 'armel', x: 5000, y: 2000 },
        { name: 'milya', x: 2900, y: 2900 },
        { name: 'hugues', x: 2000, y: 5000 },
      ];
      const zone = zones.find(z => z.name === this.currentUser?.toLowerCase());
      if (zone) {
        ship.x = zone.x;
        ship.y = zone.y;
      }
    }

    this.nomadFightCooldown = victory ? 300 : 600;
    this.nomadFight = null;
    this.nomadProjectiles = [];
    soundManager.stopNomadBossTheme();
    this.onNomadFightEnd?.();
    if (!victory) {
      // Taunt the player after respawn (short delay so they see they're alive)
      setTimeout(() => this.onNomadDefeatTaunt?.(), 1500);
    }
  }

  private renderNomadProjectiles() {
    const { ctx } = this;
    const camera = this.state.camera;

    for (const p of this.nomadProjectiles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const alpha = Math.min(1, p.life / p.maxLife + 0.3);

      // Glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;

      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // Trail
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * 1.5, y - p.vy * 1.5);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.5;
      ctx.globalAlpha = alpha * 0.4;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  private renderNomadFightHUD() {
    if (!this.nomadFight) return;
    const ctx = this.ctx;
    const fight = this.nomadFight;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();

    // ═══ RETRO FIGHTING GAME HUD — just below top stats bar ═══
    const barW = Math.min(280, (w - 100) / 2); // responsive
    const barH = 18;
    const hudY = 120;
    const centerGap = 50;

    // ── Dark backing panel ──
    const panelW = barW * 2 + centerGap + 40;
    const panelX = (w - panelW) / 2;
    const panelY = hudY - 30;
    const panelH = 70;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    // Retro pixel border (double line)
    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 3;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6);

    // ── "FIGHT!" / "ROUND 1" header ──
    ctx.font = 'bold 10px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffa500';
    const hudLabel = fight.surrendered ? 'SURRENDERED!'
      : fight.enraged ? (fight.hardMode ? '!! FURIOUS !!' : '!! ENRAGED !!')
      : (fight.hardMode ? 'REMATCH!' : 'FIGHT!');
    ctx.fillText(hudLabel, w / 2, panelY + 12);

    // ── Nomad HP bar (LEFT side, fills left→right) ──
    const nomadBarX = (w - centerGap) / 2 - barW;
    const nomadMaxHP = fight.hardMode ? 4000 : 2000;
    const hpRatio = Math.max(0, fight.nomadHP / nomadMaxHP);

    // Name label
    ctx.font = 'bold 11px Orbitron';
    ctx.textAlign = 'left';
    ctx.fillStyle = fight.damageFlashTimer > 0 ? '#ff4444' : '#ff00ff';
    ctx.fillText('NOMAD', nomadBarX, hudY - 4);

    // Bar background + pixelated border
    ctx.fillStyle = '#1a0a2a';
    ctx.fillRect(nomadBarX, hudY, barW, barH);
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.strokeRect(nomadBarX, hudY, barW, barH);

    // HP fill (purple-to-cyan gradient)
    if (hpRatio > 0) {
      const grd = ctx.createLinearGradient(nomadBarX, hudY, nomadBarX + barW * hpRatio, hudY);
      grd.addColorStop(0, '#8b5cf6');
      grd.addColorStop(0.5, '#a855f7');
      grd.addColorStop(1, '#00ffff');
      ctx.fillStyle = fight.damageFlashTimer > 0 ? '#ff4444' : grd;
      ctx.fillRect(nomadBarX + 2, hudY + 2, (barW - 4) * hpRatio, barH - 4);
      // Retro shine line on top of bar
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(nomadBarX + 2, hudY + 2, (barW - 4) * hpRatio, 3);
    }

    // HP text on Nomad bar
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.max(0, Math.ceil(fight.nomadHP))} / ${nomadMaxHP}`, nomadBarX + barW / 2, hudY + barH / 2 + 3);

    // Enrage pulsing border
    if (fight.enraged) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
      ctx.strokeStyle = `rgba(255, 51, 51, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(nomadBarX - 1, hudY - 1, barW + 2, barH + 2);
    }

    // ── Player HP bar (RIGHT side, fills right→left) ──
    const pBarX = (w + centerGap) / 2;
    const pHpRatio = Math.max(0, fight.playerHP / this.getPlayerMaxHP());

    // Name label
    ctx.font = 'bold 11px Orbitron';
    ctx.textAlign = 'right';
    ctx.fillStyle = fight.playerDamageFlashTimer > 0 ? '#ff4444' : '#4ade80';
    ctx.fillText('YOU', pBarX + barW, hudY - 4);

    // Bar background + pixelated border
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(pBarX, hudY, barW, barH);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.strokeRect(pBarX, hudY, barW, barH);

    // HP fill (green → yellow → red), fills from right to left
    if (pHpRatio > 0) {
      let hpColor: string;
      let hpColorBright: string;
      if (pHpRatio > 0.6) { hpColor = '#22c55e'; hpColorBright = '#4ade80'; }
      else if (pHpRatio > 0.3) { hpColor = '#eab308'; hpColorBright = '#facc15'; }
      else { hpColor = '#dc2626'; hpColorBright = '#ef4444'; }
      const fillW = (barW - 4) * pHpRatio;
      const fillX = pBarX + 2 + (barW - 4) - fillW;
      ctx.fillStyle = fight.playerDamageFlashTimer > 0 ? '#ff0000' : hpColor;
      ctx.fillRect(fillX, hudY + 2, fillW, barH - 4);
      // Retro shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(fillX, hudY + 2, fillW, 3);
    }

    // HP text on Player bar
    const playerMaxHP = this.getPlayerMaxHP();
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.max(0, Math.ceil(fight.playerHP))} / ${playerMaxHP}`, pBarX + barW / 2, hudY + barH / 2 + 3);

    // ── VS medallion in center ──
    ctx.beginPath();
    ctx.arc(w / 2, hudY + barH / 2, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 12px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffa500';
    ctx.fillText('VS', w / 2, hudY + barH / 2 + 4);

    // ── Death screen overlay ──
    if (fight.defeatTimer > 0) {
      const total = 360;
      const elapsed = total - fight.defeatTimer;
      // Phase 1 (0-90): explosion plays, slight red vignette
      // Phase 2 (90-180): fade to black
      // Phase 3 (180-300): "YOU DIED" text appears
      // Phase 4 (300-360): fade out everything

      if (elapsed > 60) {
        // Red vignette → black fade
        const fadeProgress = Math.min(1, (elapsed - 60) / 120);
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeProgress * 0.95})`;
        ctx.fillRect(0, 0, w, h);

        // Red tint on top
        const redAlpha = Math.max(0, 0.15 - fadeProgress * 0.1);
        ctx.fillStyle = `rgba(180, 0, 0, ${redAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      if (elapsed > 150 && elapsed < 340) {
        // Death message — blood red dripping letters
        const deathMsg = fight.deathMessage || 'YOU DIED';
        const textProgress = Math.min(1, (elapsed - 150) / 40);
        const textFade = elapsed > 300 ? Math.max(0, 1 - (elapsed - 300) / 40) : 1;
        const alpha = textProgress * textFade;

        ctx.globalAlpha = alpha;

        // Drip offset — letters slide down slightly over time
        const drip = Math.min(8, (elapsed - 150) * 0.04);

        // Auto-size font based on message length
        const fontSize = deathMsg.length > 14 ? 42 : deathMsg.length > 10 ? 52 : 64;

        // Dark red shadow (blood drip effect)
        ctx.font = `bold ${fontSize}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#440000';
        ctx.fillText(deathMsg, w / 2 + 3, h / 2 + drip + 3);

        // Blood red main text
        ctx.fillStyle = '#cc0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 30;
        ctx.fillText(deathMsg, w / 2, h / 2 + drip);
        ctx.shadowBlur = 0;

        // Dripping effect — small red rectangles below some letters
        if (elapsed > 180) {
          const dripLen = Math.min(40, (elapsed - 180) * 0.5);
          ctx.fillStyle = '#990000';
          // 5 drip points at fixed positions
          const drips = [-120, -40, 20, 80, 140];
          for (let i = 0; i < drips.length; i++) {
            const dripX = w / 2 + drips[i];
            const dripW = 3 + (i % 2);
            ctx.fillRect(dripX, h / 2 + drip + 10, dripW, dripLen * (0.6 + (i % 3) * 0.2));
          }
        }

        ctx.globalAlpha = 1;
      }
    }

    // ── Surrender floating text ──
    if (this.nomadSurrenderText && this.nomadSurrenderText.timer > 0) {
      this.nomadSurrenderText.timer -= this.dt;
      const st = this.nomadSurrenderText;
      const nomad = this.neonNomad;
      // Track nomad position (follow him)
      st.x = nomad.x;
      st.y = nomad.y;
      const progress = 1 - st.timer / 240;
      const fadeIn = Math.min(1, progress * 6);
      const fadeOut = Math.max(0, 1 - (progress - 0.7) * 3.3);
      const sx = st.x - this.state.camera.x;
      const sy = st.y - this.state.camera.y - SpaceGame.NOMAD_RENDER_SIZE / 2 - 30;

      ctx.globalAlpha = fadeIn * fadeOut;
      // Auto-size font based on message length
      const fontSize = st.text.length > 30 ? 14 : st.text.length > 20 ? 16 : 18;
      ctx.font = `bold ${fontSize}px Orbitron`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffa500';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(st.text, sx, sy);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      if (st.timer <= 0) this.nomadSurrenderText = null;
    }

    // ── Victory floating text ──
    if (this.nomadVictoryText && this.nomadVictoryText.timer > 0) {
      this.nomadVictoryText.timer -= this.dt;
      const vt = this.nomadVictoryText;
      const progress = 1 - vt.timer / 180;
      const fadeIn = Math.min(1, progress * 4);
      const fadeOut = Math.max(0, 1 - (progress - 0.6) * 2.5);
      const sx = vt.x - this.state.camera.x;
      const sy = vt.y - this.state.camera.y - progress * 80;

      ctx.globalAlpha = fadeIn * fadeOut;
      ctx.font = 'bold 28px Orbitron';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffd700';
      ctx.fillText(vt.text, sx, sy);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      if (vt.timer <= 0) this.nomadVictoryText = null;
    }

    ctx.restore();
  }

  // ─── END NOMAD BOSS FIGHT ────────────────────────────────────

  private renderSpaceWhale() {
    if (this.spaceWhale.alpha < 0.01 || !this.spaceWhaleImage) return;

    const { camera } = this.state;
    const ctx = this.ctx;
    const sx = this.spaceWhale.x - camera.x;
    const sy = this.spaceWhale.y - camera.y;

    // Only render if on screen (with generous margin for the whale size)
    if (sx < -400 || sx > this.canvas.width + 400 || sy < -300 || sy > this.canvas.height + 300) return;

    const now = Date.now();
    const breathe = 1 + Math.sin(now * 0.0015) * 0.03;
    const w = this.spaceWhaleImage.width * this.spaceWhale.scale * 0.5 * breathe;
    const h = this.spaceWhaleImage.height * this.spaceWhale.scale * 0.5 * breathe;

    // Rotation from deterministic path + gentle oscillation for swimming feel
    const swimOscillation = Math.sin(now * 0.002) * 0.06;

    ctx.save();
    ctx.globalAlpha = this.spaceWhale.alpha;
    ctx.translate(sx, sy);
    ctx.rotate(this.spaceWhale.rotation + swimOscillation);

    // Draw whale (image faces right by default)
    ctx.drawImage(this.spaceWhaleImage, -w / 2, -h / 2, w, h);

    // Bioluminescent glow that pulses
    const glowAlpha = this.spaceWhale.alpha * 0.25 * (0.6 + Math.sin(now * 0.002) * 0.4);
    ctx.globalAlpha = glowAlpha;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
    glow.addColorStop(0, 'rgba(100, 200, 255, 0.2)');
    glow.addColorStop(0.5, 'rgba(80, 160, 255, 0.08)');
    glow.addColorStop(1, 'rgba(80, 160, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-w * 0.5, -w * 0.5, w, w);

    ctx.globalAlpha = 1;
    ctx.restore();

    // Whale encounter achievement text
    if (this.whaleEncounterTimer > 0) {
      const progress = 1 - (this.whaleEncounterTimer / 240);
      ctx.save();

      const fadeIn = Math.min(1, progress * 4);
      const fadeOut = Math.max(0, 1 - (progress - 0.6) * 2.5);
      ctx.globalAlpha = fadeIn * fadeOut * 0.7;

      ctx.font = '14px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#88ddff';
      ctx.fillText('The Leviathan', this.canvas.width / 2, this.canvas.height * 0.2);

      if (progress > 0.15 && progress < 0.75) {
        ctx.globalAlpha = fadeIn * fadeOut * 0.4;
        ctx.font = '11px "Space Grotesk"';
        ctx.fillStyle = '#aaccdd';
        ctx.fillText('A rare encounter', this.canvas.width / 2, this.canvas.height * 0.2 + 22);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

  }

  // Steve Irwin popup — rendered ON TOP of everything when you shoot the whale
  private renderSteveIrwinPopup() {
    if (this.steveIrwinPopupTimer <= 0 || this.steveIrwinImages.length === 0) return;

    const img = this.steveIrwinImages[this.steveIrwinImageIndex % this.steveIrwinImages.length];
    if (!img) return;

    const ctx = this.ctx;
    const totalFrames = 180;
    const progress = 1 - (this.steveIrwinPopupTimer / totalFrames);

    ctx.save();

    // Simple fade: quick in, hold, quick out — single clean transition
    let alpha: number;
    if (progress < 0.08) {
      alpha = progress / 0.08; // Fade in over first 8%
    } else if (progress > 0.85) {
      alpha = (1 - progress) / 0.15; // Fade out over last 15%
    } else {
      alpha = 1; // Fully visible in between
    }

    // Window dimensions — compact card style matching game UI
    const padding = 12;
    const imgSize = 380;
    const aspect = img.width / img.height;
    const imgW = aspect > 1 ? imgSize : imgSize * aspect;
    const imgH = aspect > 1 ? imgSize / aspect : imgSize;
    const boxW = imgW + padding * 2;
    const boxH = imgH + padding * 2;
    const boxX = (this.canvas.width - boxW) / 2;
    const boxY = (this.canvas.height - boxH) / 2;

    // Entrance slide: slight upward drift
    const slideY = progress < 0.1 ? (1 - progress / 0.1) * 15 : 0;

    ctx.globalAlpha = alpha;

    // Window background
    ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY + slideY, boxW, boxH, 12);
    ctx.fill();

    // Border glow (whale-blue)
    ctx.strokeStyle = '#64c8ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Clip image to rounded rect
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(boxX + padding, boxY + padding + slideY, imgW, imgH, 6);
    ctx.clip();

    // Draw Steve Irwin image
    ctx.drawImage(img, boxX + padding, boxY + padding + slideY, imgW, imgH);
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // =============================================
  // NEON NOMAD (Roaming Merchant)
  // =============================================

  private updateNeonNomad() {
    const nomad = this.neonNomad;

    // Boss fight cooldown tick (always)
    if (this.nomadFightCooldown > 0) this.nomadFightCooldown -= this.dt;

    // Boss fight active — override normal nomad behavior
    if (this.nomadFight?.active) {
      this.updateNomadFight();
      this.updateNomadProjectiles();

      // Still update sparkles during fight
      if (Math.random() < 0.4) {
        const colors = ['#ff00ff', '#00ffff', '#ffa500', '#ffff00', '#4ade80'];
        this.nomadSparkles.push({
          x: nomad.x + (Math.random() - 0.5) * 50,
          y: nomad.y + (Math.random() - 0.5) * 50,
          life: 40 + Math.random() * 30,
          maxLife: 40 + Math.random() * 30,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 1.5 + Math.random() * 2.5,
        });
      }
      for (let i = this.nomadSparkles.length - 1; i >= 0; i--) {
        this.nomadSparkles[i].life -= this.dt;
        if (this.nomadSparkles[i].life <= 0) {
          this.nomadSparkles.splice(i, 1);
        }
      }

      // Update emotes even during fight
      if (this.activeEmote) {
        this.activeEmote.timer -= this.dt;
        if (this.activeEmote.timer <= 0) this.activeEmote = null;
      }
      for (const [playerId, emote] of this.remoteEmotes) {
        emote.timer -= this.dt;
        if (emote.timer <= 0) this.remoteEmotes.delete(playerId);
      }
      return;
    }

    // Nomad invisible during victory cooldown (just defeated)
    // Skip rendering handled in renderNeonNomad via alpha check

    // Deterministic parametric position from Date.now()
    // Overlapping sine waves create seemingly random movement, synced across all clients
    const t = Date.now() / 1000;
    const newX = 5000
      + 3800 * Math.sin(t * 0.0047 + 1.7)    // slow large sweep (~22 min period)
      + 1800 * Math.sin(t * 0.0113 + 0.5)    // medium sweep (~9 min)
      + 600 * Math.sin(t * 0.0271 + 3.2);    // fast jitter (~4 min)
    const newY = 5000
      + 3800 * Math.cos(t * 0.0059 + 2.3)    // slow large sweep (~18 min)
      + 1800 * Math.cos(t * 0.0097 + 1.1)    // medium sweep (~11 min)
      + 600 * Math.cos(t * 0.0193 + 0.7);    // fast jitter (~5 min)

    // Compute velocity for rotation (analytical derivative)
    const vx = 3800 * 0.0047 * Math.cos(t * 0.0047 + 1.7)
      + 1800 * 0.0113 * Math.cos(t * 0.0113 + 0.5)
      + 600 * 0.0271 * Math.cos(t * 0.0271 + 3.2);
    const vy = -3800 * 0.0059 * Math.sin(t * 0.0059 + 2.3)
      - 1800 * 0.0097 * Math.sin(t * 0.0097 + 1.1)
      - 600 * 0.0193 * Math.sin(t * 0.0193 + 0.7);

    // Wrap around map edges (toroidal)
    nomad.x = ((newX % 10000) + 10000) % 10000;
    nomad.y = ((newY % 10000) + 10000) % 10000;

    // Rotation follows travel direction, smoothly interpolated
    const targetRot = Math.atan2(vy, vx);
    let diff = targetRot - nomad.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    nomad.rotation += diff * 0.05;

    // Emit neon sparkle particles
    if (Math.random() < 0.4) {
      const colors = ['#ff00ff', '#00ffff', '#ffa500', '#ffff00', '#4ade80'];
      this.nomadSparkles.push({
        x: nomad.x + (Math.random() - 0.5) * 50,
        y: nomad.y + (Math.random() - 0.5) * 50,
        life: 40 + Math.random() * 30,
        maxLife: 40 + Math.random() * 30,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.5 + Math.random() * 2.5,
      });
    }

    // Update sparkles
    for (let i = this.nomadSparkles.length - 1; i >= 0; i--) {
      this.nomadSparkles[i].life -= this.dt;
      if (this.nomadSparkles[i].life <= 0) {
        this.nomadSparkles.splice(i, 1);
      }
    }

    const { ship } = this.state;

    // G key to honk horn (2s cooldown = ~120 frames) — works anywhere
    if (this.hornCooldown > 0) this.hornCooldown -= this.dt;
    if (this.keys.has('g') && this.hornCooldown <= 0) {
      this.keys.delete('g');
      this.hornCooldown = 120;
      this.onHornActivate?.();
    }

    // V key to trigger emote (3s cooldown = ~180 frames) — works anywhere
    if (this.emoteCooldown > 0) this.emoteCooldown -= this.dt;
    if (this.keys.has('v') && this.emoteCooldown <= 0) {
      this.keys.delete('v');
      this.emoteCooldown = 180;
      this.onEmoteActivate?.();
    }

    // If landed on nomad: ship follows merchant position
    if (this.landedOnNomad) {
      const halfSize = SpaceGame.NOMAD_RENDER_SIZE / 2;
      ship.x = nomad.x;
      ship.y = nomad.y - halfSize - 25;
      ship.vx = 0;
      ship.vy = 0;
      ship.rotation = -Math.PI / 2; // Point up

      // Music at low volume when landed (in shop, don't overpower dialogue)
      soundManager.updateNomadProximity(1, true);
      return; // ESC to leave is handled by App.tsx closing the modal
    }

    // Proximity check
    const shipDx = ship.x - nomad.x;
    const shipDy = ship.y - nomad.y;
    const shipDist = Math.sqrt(shipDx * shipDx + shipDy * shipDy);

    // Music proximity (within 600px) — quiet during landing animation
    const isLandingOnNomad = this.isLanding && this.landingPlanet?.id === '__nomad__';
    if (shipDist < 600) {
      const proximity = 1 - shipDist / 600;
      soundManager.updateNomadProximity(proximity, isLandingOnNomad);
    } else {
      soundManager.updateNomadProximity(0);
    }

    // Docking range
    this.nearNeonNomad = shipDist < SpaceGame.NOMAD_DOCKING_DISTANCE;

    // Approach callback (fire once)
    if (shipDist < 350 && !this.nomadApproachFired) {
      this.nomadApproachFired = true;
      this.onNomadApproach?.();
    } else if (shipDist > 450) {
      this.nomadApproachFired = false;
    }

    // SPACE key to land on merchant — use the real planet landing animation (blocked during/after fight)
    if (this.nearNeonNomad && this.keys.has(' ') && !this.isLanding && !this.isLanded && !this.nomadFight && this.nomadFightCooldown <= 0) {
      this.keys.delete(' ');
      // Create a fake Planet object so startLandingAnimation works
      const halfSize = SpaceGame.NOMAD_RENDER_SIZE / 2;
      const fakePlanet = {
        id: '__nomad__', name: 'Merchant', x: nomad.x, y: nomad.y,
        radius: halfSize, color: '#ff00ff', glowColor: '#00ffff',
        completed: false, type: 'station' as const, size: 'medium' as const,
      };
      this.startLandingAnimation(fakePlanet as any);
    }

    // Update local active emote timer
    if (this.activeEmote) {
      this.activeEmote.timer -= this.dt;
      if (this.activeEmote.timer <= 0) {
        this.activeEmote = null;
      }
    }

    // Update remote emote timers
    for (const [playerId, emote] of this.remoteEmotes) {
      emote.timer -= this.dt;
      if (emote.timer <= 0) {
        this.remoteEmotes.delete(playerId);
      }
    }
  }

  private renderNomadLootCrate() {
    if (!this.nomadFight?.lootCrate || this.nomadFight.lootCrate.collected) return;
    const crate = this.nomadFight.lootCrate;
    const { camera } = this.state;
    const ctx = this.ctx;

    const sx = crate.x - camera.x;
    const sy = crate.y - camera.y;

    // Off-screen check
    if (sx < -100 || sx > this.canvas.width + 100 || sy < -100 || sy > this.canvas.height + 100) return;

    ctx.save();

    // Bob up and down
    const bob = Math.sin(crate.bobTimer * 0.08) * 5;
    // Glow pulse
    const glow = 0.5 + 0.5 * Math.sin(crate.glowPulse * 0.06);

    // Gold outer glow
    const glowGrad = ctx.createRadialGradient(sx, sy + bob, 5, sx, sy + bob, 40);
    glowGrad.addColorStop(0, `rgba(255, 215, 0, ${0.4 * glow})`);
    glowGrad.addColorStop(0.6, `rgba(255, 170, 0, ${0.15 * glow})`);
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(sx, sy + bob, 40, 0, Math.PI * 2);
    ctx.fill();

    // Crate body (box shape)
    const crateSize = 24;
    const cx = sx - crateSize / 2;
    const cy = sy + bob - crateSize / 2;

    // Main box
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(cx, cy, crateSize, crateSize);

    // Gold border
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, crateSize, crateSize);

    // Cross straps
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    // Horizontal strap
    ctx.beginPath();
    ctx.moveTo(cx, sy + bob);
    ctx.lineTo(cx + crateSize, sy + bob);
    ctx.stroke();
    // Vertical strap
    ctx.beginPath();
    ctx.moveTo(sx, cy);
    ctx.lineTo(sx, cy + crateSize);
    ctx.stroke();

    // Shine highlight
    ctx.fillStyle = `rgba(255, 255, 200, ${0.3 + glow * 0.2})`;
    ctx.fillRect(cx + 2, cy + 2, crateSize / 3, crateSize / 3);

    // "[ SPACE ]" prompt when near
    if (this.nomadFight.nearCrate) {
      ctx.font = 'bold 12px Space Grotesk';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffd700';
      ctx.fillText('[ SPACE ]', sx, sy + bob + crateSize / 2 + 22);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  private renderNeonNomad() {
    const { camera } = this.state;
    const ctx = this.ctx;
    const nomad = this.neonNomad;
    const sx = nomad.x - camera.x;
    const sy = nomad.y - camera.y;

    // Hide nomad during victory cooldown (just defeated, respawning)
    if (!this.nomadFight && this.nomadFightCooldown > 0 && this.nomadFightCooldown > 60) return;
    // Fade in during last 60 frames of cooldown
    const cooldownAlpha = (!this.nomadFight && this.nomadFightCooldown > 0)
      ? 1 - this.nomadFightCooldown / 60 : 1;

    // Off-screen check
    if (sx < -200 || sx > this.canvas.width + 200 || sy < -200 || sy > this.canvas.height + 200) return;

    ctx.save();

    // Apply fade-in alpha when respawning after fight
    if (cooldownAlpha < 1) ctx.globalAlpha = cooldownAlpha;

    // Damage flash during boss fight
    const fightFlash = this.nomadFight?.damageFlashTimer && this.nomadFight.damageFlashTimer > 0;

    // Pulsing underglow
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.003);
    const glowRadius = SpaceGame.NOMAD_RENDER_SIZE * 0.9;
    const gradient = ctx.createRadialGradient(sx, sy, 5, sx, sy, glowRadius);
    gradient.addColorStop(0, `rgba(255, 0, 255, ${0.3 * pulse})`);
    gradient.addColorStop(0.4, `rgba(0, 255, 255, ${0.15 * pulse})`);
    gradient.addColorStop(0.7, `rgba(255, 165, 0, ${0.08 * pulse})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle particles
    for (const sparkle of this.nomadSparkles) {
      const spx = sparkle.x - camera.x;
      const spy = sparkle.y - camera.y;
      const alpha = sparkle.life / sparkle.maxLife;
      ctx.beginPath();
      ctx.arc(spx, spy, sparkle.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = sparkle.color;
      ctx.globalAlpha = alpha * 0.7 * cooldownAlpha;
      ctx.fill();
      ctx.globalAlpha = cooldownAlpha;
    }

    // Draw nomad van image or fallback
    // Lowrider bounce — bumping to the beat like a pimped car
    const now = Date.now();
    const beatBPM = 40; // slow lowrider bounce
    const beatPhase = (now / 1000) * (beatBPM / 60) * Math.PI * 2;
    const isSurrendered = this.nomadFight?.surrendered;
    // Surrendered: slow droopy bob; fighting: no bounce; idle: full lowrider bounce
    const bounce = isSurrendered ? Math.abs(Math.sin(beatPhase * 0.3)) * 2
      : this.nomadFight?.active ? 0 : Math.abs(Math.sin(beatPhase)) * 4;
    const tilt = isSurrendered ? Math.sin(beatPhase * 0.2) * 0.06
      : this.nomadFight?.active ? 0 : Math.sin(beatPhase * 0.5) * 0.04;
    const scaleBreath = this.nomadFight?.active ? 1 : 1 + Math.abs(Math.sin(beatPhase)) * 0.03;

    ctx.translate(sx, sy - bounce);
    ctx.rotate(nomad.rotation + Math.PI / 2 + tilt);
    if (fightFlash) ctx.globalAlpha = 0.5 * cooldownAlpha; // flash white on damage
    if (this.neonNomadImage) {
      const size = SpaceGame.NOMAD_RENDER_SIZE * scaleBreath;
      ctx.drawImage(this.neonNomadImage, -size / 2, -size / 2, size, size);
    } else {
      // Fallback: colored diamond shape
      ctx.fillStyle = '#ff00ff';
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(18, 0);
      ctx.lineTo(0, 30);
      ctx.lineTo(-18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Dock prompt when in range (no name label) — hide during boss fight
    if (this.nearNeonNomad && !this.landedOnNomad && !this.isLanding && !this.nomadFight) {
      ctx.font = 'bold 12px Space Grotesk';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#00ffff';
      ctx.fillText('[ SPACE ]', sx, sy + SpaceGame.NOMAD_RENDER_SIZE / 2 + 20);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  private updateHatchery() {
    const hatch = this.hatchery;
    const { ship } = this.state;

    // Fixed position — head facing up
    hatch.rotation = -Math.PI / 2;

    if (Math.random() < 0.35) {
      const colors = ['#44ff88', '#22ddaa', '#88ffcc', '#66ffaa', '#aaffdd'];
      this.hatcherySparkles.push({
        x: hatch.x + (Math.random() - 0.5) * 50,
        y: hatch.y + (Math.random() - 0.5) * 50,
        life: 40 + Math.random() * 30,
        maxLife: 40 + Math.random() * 30,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.5 + Math.random() * 2.5,
      });
    }
    for (let i = this.hatcherySparkles.length - 1; i >= 0; i--) {
      this.hatcherySparkles[i].life -= this.dt;
      if (this.hatcherySparkles[i].life <= 0) this.hatcherySparkles.splice(i, 1);
    }

    if (this.landedOnHatchery) {
      const halfSize = SpaceGame.HATCHERY_RENDER_SIZE / 2;
      ship.x = hatch.x;
      ship.y = hatch.y - halfSize - 25;
      ship.vx = 0;
      ship.vy = 0;
      ship.rotation = -Math.PI / 2;
      return;
    }

    const shipDx = ship.x - hatch.x;
    const shipDy = ship.y - hatch.y;
    const shipDist = Math.sqrt(shipDx * shipDx + shipDy * shipDy);

    this.nearHatchery = shipDist < SpaceGame.HATCHERY_DOCKING_DISTANCE;

    if (shipDist < 350 && !this.hatcheryApproachFired) {
      this.hatcheryApproachFired = true;
      this.onHatcheryApproach?.();
    } else if (shipDist > 450) {
      this.hatcheryApproachFired = false;
    }

    if (this.nearHatchery && this.keys.has(' ') && !this.isLanding && !this.isLanded) {
      this.keys.delete(' ');
      const halfSize = SpaceGame.HATCHERY_RENDER_SIZE / 2;
      const fakePlanet = {
        id: '__hatchery__', name: 'The Hatchery', x: hatch.x, y: hatch.y,
        radius: halfSize, color: '#44ff88', glowColor: '#22ddaa',
        completed: false, type: 'station' as const, size: 'medium' as const,
      };
      this.startLandingAnimation(fakePlanet as any);
    }
  }

  private renderHatchery() {
    const { camera } = this.state;
    const ctx = this.ctx;
    const hatch = this.hatchery;
    const sx = hatch.x - camera.x;
    const sy = hatch.y - camera.y;

    if (sx < -200 || sx > this.canvas.width + 200 || sy < -200 || sy > this.canvas.height + 200) return;

    ctx.save();

    const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.003);
    const glowRadius = SpaceGame.HATCHERY_RENDER_SIZE * 0.9;
    const gradient = ctx.createRadialGradient(sx, sy, 5, sx, sy, glowRadius);
    gradient.addColorStop(0, `rgba(68, 255, 136, ${0.3 * pulse})`);
    gradient.addColorStop(0.4, `rgba(34, 221, 170, ${0.15 * pulse})`);
    gradient.addColorStop(0.7, `rgba(136, 68, 255, ${0.08 * pulse})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    for (const sparkle of this.hatcherySparkles) {
      const spx = sparkle.x - camera.x;
      const spy = sparkle.y - camera.y;
      const alpha = sparkle.life / sparkle.maxLife;
      ctx.beginPath();
      ctx.arc(spx, spy, sparkle.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = sparkle.color;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const now = Date.now();
    const beatBPM = 35;
    const beatPhase = (now / 1000) * (beatBPM / 60) * Math.PI * 2;
    const bounce = Math.abs(Math.sin(beatPhase)) * 3;
    const tilt = Math.sin(beatPhase * 0.5) * 0.03;
    const scaleBreath = 1 + Math.abs(Math.sin(beatPhase)) * 0.025;

    ctx.translate(sx, sy - bounce);
    ctx.rotate(hatch.rotation + Math.PI / 2 + tilt);
    if (this.hatcheryImage) {
      const size = SpaceGame.HATCHERY_RENDER_SIZE * scaleBreath;
      ctx.drawImage(this.hatcheryImage, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#44ff88';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#22ddaa';
      ctx.lineWidth = 2;
      ctx.stroke();
      const eggGrad = ctx.createRadialGradient(0, -5, 0, 0, 0, 25);
      eggGrad.addColorStop(0, 'rgba(136, 255, 204, 0.5)');
      eggGrad.addColorStop(1, 'rgba(68, 255, 136, 0)');
      ctx.fillStyle = eggGrad;
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (this.nearHatchery && !this.landedOnHatchery && !this.isLanding) {
      ctx.font = 'bold 12px Space Grotesk';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#44ff88';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#44ff88';
      ctx.fillText('[ SPACE ]', sx, sy + SpaceGame.HATCHERY_RENDER_SIZE / 2 + 20);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  private renderEmoteEffects() {
    const { camera } = this.state;
    const ctx = this.ctx;
    const now = Date.now();

    // Local player emote
    if (this.activeEmote) {
      const { ship } = this.state;
      const sx = ship.x - camera.x;
      const sy = ship.y - camera.y;
      this.drawEmoteEffect(ctx, sx, sy, this.activeEmote.type, this.activeEmote.timer / 120, now);
    }

    // Remote player emotes
    for (const [playerId, emote] of this.remoteEmotes) {
      const player = this.otherPlayers.find(p => p.id === playerId);
      if (!player) continue;
      const renderState = this.renderStates.get(playerId);
      const px = (renderState?.renderX ?? player.x) - camera.x;
      const py = (renderState?.renderY ?? player.y) - camera.y;
      this.drawEmoteEffect(ctx, px, py, emote.type, emote.timer / 120, now);
    }
  }

  private drawEmoteEffect(ctx: CanvasRenderingContext2D, x: number, y: number, type: string, progress: number, now: number) {
    ctx.save();
    const alpha = Math.min(1, progress * 3) * Math.min(1, progress);

    switch (type) {
      case 'neon_burst': {
        const radius = (1 - progress) * 80 + 10;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 0, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        // Sparkles
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + now * 0.005;
          const r = radius * 0.8;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
          ctx.fill();
        }
        break;
      }
      case 'rainbow_spin': {
        const arcRadius = 30;
        const sweep = Math.PI * 1.5;
        const startAngle = now * 0.008;
        const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];
        for (let i = 0; i < colors.length; i++) {
          const a = startAngle + (i / colors.length) * sweep;
          ctx.beginPath();
          ctx.arc(x, y, arcRadius, a, a + sweep / colors.length);
          ctx.strokeStyle = colors[i];
          ctx.globalAlpha = alpha * 0.8;
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'holo_heart': {
        const scale = 0.5 + progress * 0.5;
        const heartY = y - 25 - (1 - progress) * 15;
        ctx.translate(x, heartY);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-10, -5, -15, -12, 0, -20);
        ctx.bezierCurveTo(15, -12, 10, -5, 0, 5);
        ctx.fillStyle = `rgba(255, 100, 200, ${alpha * 0.7})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 150, 220, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        break;
      }
      case 'flash_colors': {
        const colorIdx = Math.floor(now / 80) % 6;
        const flashColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.fillStyle = flashColors[colorIdx];
        ctx.globalAlpha = alpha * 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'star_shower': {
        for (let i = 0; i < 6; i++) {
          const starX = x + (Math.sin(now * 0.003 + i * 1.2) * 25);
          const starY = y - 20 + ((now * 0.05 + i * 20) % 50) - 25;
          ctx.font = '10px serif';
          ctx.globalAlpha = alpha * 0.8;
          ctx.fillStyle = '#ffd700';
          ctx.fillText('\u2605', starX, starY);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'glitch_effect': {
        const offset = Math.sin(now * 0.02) * 4;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(x - 15 + offset, y - 15, 30, 30);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
        ctx.fillRect(x - 15 - offset, y - 15, 30, 30);
        ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
        ctx.fillRect(x - 15, y - 15 + offset, 30, 30);
        ctx.globalAlpha = 1;
        break;
      }
      case 'fire_ring': {
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + now * 0.004;
          const r = 25;
          const flicker = 0.6 + Math.random() * 0.4;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, 3 * flicker, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 === 0 ? `rgba(255, 100, 0, ${alpha * flicker})` : `rgba(255, 200, 0, ${alpha * flicker})`;
          ctx.fill();
        }
        break;
      }
      case 'wave_emoji': {
        const waveY = y - 30 - Math.sin(now * 0.005) * 5;
        ctx.font = '18px serif';
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.fillText('\uD83D\uDC4B', x, waveY);
        ctx.globalAlpha = 1;
        break;
      }
    }

    ctx.restore();
  }

  // Public methods for remote horn/emote from other players
  public playRemoteHorn(playerId: string, hornType: string) {
    const player = this.otherPlayers.find(p => p.id === playerId);
    if (!player) return;

    const renderState = this.renderStates.get(playerId);
    const px = renderState?.renderX ?? player.x;
    const py = renderState?.renderY ?? player.y;
    const { ship } = this.state;
    const dist = Math.sqrt((ship.x - px) ** 2 + (ship.y - py) ** 2);

    // Only audible within 1500px
    if (dist < 1500) {
      const volume = 1 - dist / 1500;
      soundManager.playHorn(hornType, volume);
    }
  }

  public showRemoteEmote(playerId: string, emoteType: string) {
    this.remoteEmotes.set(playerId, { type: emoteType, timer: 120 }); // ~2 seconds at 60fps
  }

  public setLocalEmote(emoteType: string) {
    this.activeEmote = { type: emoteType, timer: 120 };
  }
}
