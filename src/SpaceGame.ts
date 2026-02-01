import { Vector2, Planet, Star, Particle, Ship, GameState, RewardType, OtherPlayer, ShipEffects as TypedShipEffects, PositionSnapshot, InterpolationState } from './types';
import { soundManager } from './SoundManager';

interface CustomPlanetData {
  id: string;
  name: string;
  description: string;
  type: 'business' | 'product' | 'achievement' | 'notion';
  size: 'small' | 'medium' | 'big';
  reward: RewardType;
  realWorldReward?: string;
  imageUrl?: string;
  createdBy: string;
}

interface GoalData {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'big';
  description: string;
  reward: RewardType;
  realWorldReward?: string;
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
  trailType: 'default' | 'fire' | 'ice' | 'rainbow';
  sizeBonus: number;
  speedBonus: number;
  ownedGlows: string[];
  ownedTrails: string[];
}

// Store terraform counts and size levels for scaling
const userPlanetTerraformCounts: Map<string, number> = new Map();
const userPlanetSizeLevels: Map<string, number> = new Map();

const USER_IDS = ['quentin', 'armel', 'alex', 'melia', 'hugue'];

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

// Layout: Center = Achievements/Upgrades, Bottom-left = Business, Bottom-right = Product
// Players arranged in arc around top: Right, Top-Right, Top, Top-Left, Left
const HUB_DISTANCE = 2800; // Distance from center to Business/Product hubs
const PLAYER_DISTANCE = 3000; // Distance from center to player zones

const ZONES: Zone[] = [
  // Central zone - Achievements & Upgrades
  { id: 'central', name: 'Mission Control', centerX: CENTER_X, centerY: CENTER_Y, color: '#ffd700', ownerId: null, zoneType: 'central' },

  // Goal hubs - Business (bottom-left) and Product (bottom-right)
  { id: 'hub-business', name: 'Business Hub', centerX: CENTER_X - HUB_DISTANCE * 0.7, centerY: CENTER_Y + HUB_DISTANCE * 0.7, color: '#4ade80', ownerId: null, zoneType: 'business' },
  { id: 'hub-product', name: 'Product Hub', centerX: CENTER_X + HUB_DISTANCE * 0.7, centerY: CENTER_Y + HUB_DISTANCE * 0.7, color: '#5490ff', ownerId: null, zoneType: 'product' },

  // Player zones in arc around top half (Right → Top-Right → Top → Top-Left → Left)
  { id: 'zone-quentin', name: "Quentin's Sector", centerX: CENTER_X + PLAYER_DISTANCE, centerY: CENTER_Y, color: '#ffa500', ownerId: 'quentin', zoneType: 'player' }, // Right
  { id: 'zone-alex', name: "Alex's Sector", centerX: CENTER_X + PLAYER_DISTANCE * 0.7, centerY: CENTER_Y - PLAYER_DISTANCE * 0.7, color: '#00bfff', ownerId: 'alex', zoneType: 'player' }, // Top-Right
  { id: 'zone-armel', name: "Armel's Sector", centerX: CENTER_X, centerY: CENTER_Y - PLAYER_DISTANCE, color: '#98fb98', ownerId: 'armel', zoneType: 'player' }, // Top
  { id: 'zone-melia', name: "Melia's Sector", centerX: CENTER_X - PLAYER_DISTANCE * 0.7, centerY: CENTER_Y - PLAYER_DISTANCE * 0.7, color: '#ff6b9d', ownerId: 'melia', zoneType: 'player' }, // Top-Left
  { id: 'zone-hugue', name: "Hugue's Sector", centerX: CENTER_X - PLAYER_DISTANCE, centerY: CENTER_Y, color: '#8b5cf6', ownerId: 'hugue', zoneType: 'player' }, // Left
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
const LERP_FACTOR = 0.15;              // 15% per frame - balance of smooth and responsive

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
  private animationId: number = 0;
  private onDock: (planet: Planet) => void;
  private logoImage: HTMLImageElement | null = null;
  private shipImage: HTMLImageElement | null = null;
  private baseShipImage: HTMLImageElement | null = null; // Default ship for players without custom skin
  private hormoziPlanetImage: HTMLImageElement | null = null;
  private shipLevel: number = 1;
  private shipEffects: ShipEffects = { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, ownedGlows: [], ownedTrails: [] };
  private blackHole: BlackHole;
  private shipBeingSucked: boolean = false;
  private suckProgress: number = 0;
  private customPlanetImages: Map<string, HTMLImageElement> = new Map();
  private userPlanetImages: Map<string, HTMLImageElement> = new Map();

  // Landing animation state
  private isLanding: boolean = false;
  private landingProgress: number = 0;
  private landingPlanet: Planet | null = null;
  private landingStartPos: { x: number; y: number; rotation: number } | null = null;

  // Landed state (player is on planet, showing details)
  private isLanded: boolean = false;
  private landedPlanet: Planet | null = null;

  // Callbacks for landing interactions
  private onLand: ((planet: Planet) => void) | null = null;
  private onTakeoff: (() => void) | null = null;
  private onColonize: ((planet: Planet) => void) | null = null;
  private onOpenNotion: ((url: string) => void) | null = null;
  private onTerraform: ((planet: Planet) => void) | null = null;

  // Claim animation state (laser beam + planet teleport)
  private isClaiming: boolean = false;
  private claimProgress: number = 0;
  private claimPlanet: Planet | null = null;
  private claimParticles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];

  // Upgrading animation state (orbiting satellites/robots)
  private isUpgrading: boolean = false;
  private upgradeTargetPlanetId: string | null = null; // null = orbit ship, string = orbit planet
  private upgradeSatellites: {
    angle: number;
    distance: number;
    speed: number;
    size: number;
    color: string;
    wobble: number;
    wobbleSpeed: number;
    type: 'satellite' | 'robot';
  }[] = [];

  // Current player (for zone-based interactions)
  private currentUser: string = 'quentin';

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
  // Snapshot interpolation for smooth rendering (replaces simple lerp)
  private playerSnapshots: Map<string, PositionSnapshot[]> = new Map();
  private renderStates: Map<string, InterpolationState> = new Map();

  constructor(canvas: HTMLCanvasElement, onDock: (planet: Planet) => void, customPlanets: CustomPlanetData[] = [], shipImageUrl?: string, goals?: GoalsData, upgradeCount: number = 0, userPlanets?: Record<string, UserPlanetData>, currentUser: string = 'quentin') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onDock = onDock;
    this.currentUser = currentUser;

    // Initialize state
    const basePlanets = this.createPlanets(goals);
    const customPlanetObjects = this.createCustomPlanets(customPlanets);
    const userPlanetObjects = this.createUserPlanets(userPlanets);

    this.state = {
      ship: {
        x: CENTER_X,
        y: CENTER_Y + 200, // Start in central zone
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
    img.src = '/logo.png';
    img.onload = () => {
      this.logoImage = img;
    };

    // Load ship image (use custom URL if provided)
    const shipImg = new Image();
    shipImg.crossOrigin = 'anonymous';
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
      { id: 'b1', name: 'First Customer', size: 'medium' as const, description: 'Land your very first paying customer', reward: 'speed_boost' as const, realWorldReward: 'Celebrate with the team!' },
      { id: 'b2', name: '$1k MRR', size: 'small' as const, description: 'Reach $1,000 monthly recurring revenue', reward: 'trail' as const },
      { id: 'b3', name: '$5k MRR', size: 'medium' as const, description: 'Hit $5,000 monthly recurring revenue', reward: 'glow' as const, realWorldReward: '+$500/month salary increase' },
      { id: 'b4', name: 'Break Even', size: 'big' as const, description: 'Revenue covers all expenses - sustainable!', reward: 'shield' as const, realWorldReward: 'Team dinner at a fancy restaurant' },
      { id: 'b5', name: '$10k MRR', size: 'medium' as const, description: 'Double digits! $10,000 MRR milestone', reward: 'acceleration' as const, realWorldReward: '+$1,000/month salary increase' },
      { id: 'b6', name: '$25k MRR', size: 'medium' as const, description: 'Quarter way to $100k MRR', reward: 'handling' as const, realWorldReward: 'New MacBook Pro' },
      { id: 'b7', name: '100 Customers', size: 'big' as const, description: 'Triple digit customer base achieved', reward: 'size' as const, realWorldReward: 'Weekend trip anywhere in Europe' },
      { id: 'b8', name: '$50k MRR', size: 'big' as const, description: 'Half way to the $100k MRR goal', reward: 'special' as const, realWorldReward: '+$2,500/month salary increase' },
      { id: 'b9', name: '$100k MRR', size: 'big' as const, description: 'The big one! $100,000 monthly recurring', reward: 'special' as const, realWorldReward: '10% equity bonus + $5k/month raise' },
      { id: 'b10', name: '$5M ARR', size: 'big' as const, description: 'Five million annual recurring revenue!', reward: 'special' as const, realWorldReward: 'Lambo or Tesla of your choice' },
    ];

    const productMilestones = goals?.product || [
      { id: 'p1', name: 'Ship v1', size: 'big' as const, description: 'Launch the first version of the product', reward: 'acceleration' as const, realWorldReward: 'Launch party!' },
      { id: 'p2', name: 'Case Study', size: 'medium' as const, description: 'Publish first customer success story', reward: 'trail' as const },
      { id: 'p3', name: 'Onboarding v2', size: 'medium' as const, description: 'Revamped onboarding with better activation', reward: 'handling' as const },
      { id: 'p4', name: 'Self-Serve', size: 'big' as const, description: 'Customers can sign up without sales call', reward: 'speed_boost' as const, realWorldReward: '+$1,500/month salary increase' },
      { id: 'p5', name: 'API Launch', size: 'big' as const, description: 'Public API for integrations and developers', reward: 'glow' as const, realWorldReward: 'Conference trip to speak about it' },
      { id: 'p6', name: 'Enterprise', size: 'big' as const, description: 'Enterprise tier with SSO, SLA, dedicated support', reward: 'shield' as const, realWorldReward: '+$3,000/month salary increase' },
    ];

    const achievements = goals?.achievement || [
      { id: 'a1', name: 'Alex Hormozi', size: 'big' as const, description: 'Get noticed by Alex Hormozi', reward: 'special' as const, realWorldReward: 'Lifetime bragging rights + framed tweet' },
      { id: 'a2', name: 'Gary Vee', size: 'big' as const, description: 'Get a shoutout from Gary Vaynerchuk', reward: 'special' as const, realWorldReward: 'VIP tickets to VeeCon' },
      { id: 'a3', name: 'Viral Post', size: 'medium' as const, description: 'A post goes viral (1M+ impressions)', reward: 'trail' as const, realWorldReward: 'Professional photoshoot' },
      { id: 'a4', name: '$10k Day', size: 'big' as const, description: 'Make $10,000 in a single day', reward: 'glow' as const, realWorldReward: 'Rolex or luxury watch' },
      { id: 'a5', name: 'First Hire', size: 'medium' as const, description: 'Hire the first team member', reward: 'size' as const, realWorldReward: 'CEO title officially earned' },
    ];

    const sizeRadius = { small: 35, medium: 50, big: 70 };

    // Get hub centers from ZONES
    const businessHub = ZONES.find(z => z.id === 'hub-business')!;
    const productHub = ZONES.find(z => z.id === 'hub-product')!;

    // Place BUSINESS planets in the Business Hub (bottom-left)
    // Arrange in a spiral pattern within the hub
    businessMilestones.forEach((m, i) => {
      const angle = (i / businessMilestones.length) * Math.PI * 1.8 - Math.PI * 0.5;
      const distance = 300 + i * 120;
      const style = planetStyles[i % planetStyles.length];
      // Override style to use green tones for business
      const businessStyle = { baseColor: '#4ade80', accent: '#22c55e', type: 'business' };
      planets.push({
        ...m,
        x: businessHub.centerX + Math.cos(angle) * distance,
        y: businessHub.centerY + Math.sin(angle) * distance * 0.6,
        radius: sizeRadius[m.size],
        color: businessStyle.baseColor,
        glowColor: 'rgba(74, 222, 128, 0.4)',
        completed: false,
        type: 'business',
        style: businessStyle,
        hasRing: i === 3 || i === 7,
        hasMoon: i === 4 || i === 9,
        description: m.description,
        reward: m.reward,
        realWorldReward: m.realWorldReward,
        ownerId: null, // Shared planet
      });
    });

    // Place PRODUCT planets in the Product Hub (bottom-right)
    // Arrange in a spiral pattern within the hub
    productMilestones.forEach((m, i) => {
      const angle = (i / productMilestones.length) * Math.PI * 1.5 + Math.PI * 0.75;
      const distance = 300 + i * 140;
      // Use blue tones for product
      const productStyle = { baseColor: '#5490ff', accent: '#3b82f6', type: 'product' };
      planets.push({
        ...m,
        x: productHub.centerX + Math.cos(angle) * distance,
        y: productHub.centerY + Math.sin(angle) * distance * 0.6,
        radius: sizeRadius[m.size],
        color: productStyle.baseColor,
        glowColor: 'rgba(84, 144, 255, 0.4)',
        completed: false,
        type: 'product',
        style: productStyle,
        hasRing: i === 2 || i === 5,
        hasMoon: i === 1,
        description: m.description,
        reward: m.reward,
        realWorldReward: m.realWorldReward,
        ownerId: null, // Shared planet
      });
    });

    // Place ACHIEVEMENTS as golden planets orbiting the central zone
    achievements.forEach((m, i) => {
      const angle = (i / achievements.length) * Math.PI * 2 - Math.PI / 2;
      const distance = 500 + i * 100;
      planets.push({
        ...m,
        x: CENTER_X + Math.cos(angle) * distance,
        y: CENTER_Y + Math.sin(angle) * distance * 0.5,
        radius: sizeRadius[m.size],
        color: '#ffd700',
        glowColor: 'rgba(255, 215, 0, 0.5)',
        completed: false,
        type: 'achievement',
        style: { baseColor: '#ffd700', accent: '#ffa500', type: 'golden' },
        hasRing: true,
        hasMoon: false,
        description: m.description,
        reward: m.reward,
        realWorldReward: m.realWorldReward,
        ownerId: null, // Shared planet
      });
    });

    // SPECIAL STATIONS - In the central zone, near spawn point
    // Memory Lane - View ship evolution (left of center)
    planets.push({
      id: 'memory-lane',
      name: 'Memory Lane',
      x: CENTER_X - 200,
      y: CENTER_Y + 350,
      radius: 55,
      color: '#ff6b9d',
      glowColor: 'rgba(255, 107, 157, 0.5)',
      completed: false,
      type: 'achievement',
      size: 'medium',
      style: { baseColor: '#ff6b9d', accent: '#ff4081', type: 'station' },
      hasRing: true,
      hasMoon: false,
      description: 'View your ship evolution gallery',
      ownerId: null, // Shared station
    });

    // Shop Station - Buy upgrades (right of center)
    planets.push({
      id: 'shop-station',
      name: 'Upgrade Shop',
      x: CENTER_X + 200,
      y: CENTER_Y + 350,
      radius: 55,
      color: '#5490ff',
      glowColor: 'rgba(84, 144, 255, 0.5)',
      completed: false,
      type: 'achievement',
      size: 'medium',
      style: { baseColor: '#5490ff', accent: '#3b82f6', type: 'station' },
      hasRing: true,
      hasMoon: true,
      description: 'Spend team points on ship upgrades',
      ownerId: null, // Shared station
    });

    // Planet Builder - Create custom planets (below center)
    planets.push({
      id: 'planet-builder',
      name: 'Planet Factory',
      x: CENTER_X,
      y: CENTER_Y + 500,
      radius: 50,
      color: '#ffa500',
      glowColor: 'rgba(255, 165, 0, 0.5)',
      completed: false,
      type: 'achievement',
      size: 'medium',
      style: { baseColor: '#ffa500', accent: '#ff8c00', type: 'station' },
      hasRing: false,
      hasMoon: true,
      description: 'Create new milestone planets',
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

    // Place custom planets in a dedicated area (center-bottom)
    const startX = WORLD_SIZE / 2;
    const startY = WORLD_SIZE - 800;

    customPlanets.forEach((cp, i) => {
      const angle = (i / Math.max(customPlanets.length, 1)) * Math.PI * 2;
      const distance = 300 + (i % 3) * 150;

      const typeColors: Record<string, { base: string; accent: string }> = {
        business: { base: '#4ade80', accent: '#22c55e' },
        product: { base: '#5490ff', accent: '#3b82f6' },
        achievement: { base: '#ffd700', accent: '#ffa500' },
      };

      const colors = typeColors[cp.type];

      planets.push({
        id: cp.id,
        name: cp.name,
        x: startX + Math.cos(angle) * distance,
        y: startY + Math.sin(angle) * distance * 0.5,
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
        reward: cp.reward,
        realWorldReward: cp.realWorldReward,
      });
    });

    return planets;
  }

  private loadCustomPlanetImage(planetId: string, imageUrl: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      this.customPlanetImages.set(planetId, img);
    };
  }

  public addCustomPlanet(customPlanet: CustomPlanetData) {
    const sizeRadius = { small: 35, medium: 50, big: 70 };
    const existingCustom = this.state.planets.filter(p => p.id.startsWith('custom-'));
    const i = existingCustom.length;

    const startX = WORLD_SIZE / 2;
    const startY = WORLD_SIZE - 800;
    const angle = (i / Math.max(i + 1, 1)) * Math.PI * 2;
    const distance = 300 + (i % 3) * 150;

    const typeColors: Record<string, { base: string; accent: string }> = {
      business: { base: '#4ade80', accent: '#22c55e' },
      product: { base: '#5490ff', accent: '#3b82f6' },
      achievement: { base: '#ffd700', accent: '#ffa500' },
    };

    const colors = typeColors[customPlanet.type];

    const planet: Planet = {
      id: customPlanet.id,
      name: customPlanet.name,
      x: startX + Math.cos(angle) * distance,
      y: startY + Math.sin(angle) * distance * 0.5,
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
      reward: customPlanet.reward,
      realWorldReward: customPlanet.realWorldReward,
    };

    this.state.planets.push(planet);

    if (customPlanet.imageUrl) {
      this.loadCustomPlanetImage(customPlanet.id, customPlanet.imageUrl);
    }
  }

  public syncNotionPlanets(notionPlanets: Planet[]) {
    // Remove old notion planets
    this.state.planets = this.state.planets.filter(p => !p.id.startsWith('notion-'));

    // Add new notion planets
    for (const planet of notionPlanets) {
      this.state.planets.push(planet);
    }
  }

  public setLandingCallbacks(callbacks: {
    onLand?: (planet: Planet) => void;
    onTakeoff?: () => void;
    onColonize?: (planet: Planet) => void;
    onOpenNotion?: (url: string) => void;
    onTerraform?: (planet: Planet) => void;
  }) {
    this.onLand = callbacks.onLand || null;
    this.onTakeoff = callbacks.onTakeoff || null;
    this.onColonize = callbacks.onColonize || null;
    this.onOpenNotion = callbacks.onOpenNotion || null;
    this.onTerraform = callbacks.onTerraform || null;
  }

  public isPlayerLanded(): boolean {
    return this.isLanded;
  }

  public getLandedPlanet(): Planet | null {
    return this.landedPlanet;
  }

  private setupInput() {
    window.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      this.keys.add(e.key.toLowerCase());
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'c', 'n', 't'].includes(e.key.toLowerCase())) {
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
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  public start() {
    // Initialize sound on game start (requires user interaction first)
    soundManager.init();
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
    }
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
      const baseRadius = 50 + tc * 3;
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
      const tc = userPlanetTerraformCounts.get(userId) ?? 0;
      const baseRadius = 50 + tc * 3;
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
      melia: { base: '#ff6b9d', accent: '#ff4081' },
      hugue: { base: '#8b5cf6', accent: '#7c3aed' },
    };

    USER_IDS.forEach((userId) => {
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

      // Base radius grows with terraform count and size level (20% per size level)
      const baseRadius = 50 + terraformCount * 3;
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

  private gameLoop = () => {
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
      return;
    }

    // Handle landed state (player is on planet, showing details)
    if (this.isLanded && this.landedPlanet) {
      this.updateLandedState();
      this.updateCamera();
      this.updateParticles();
      return;
    }

    // Handle claim animation
    if (this.isClaiming) {
      this.updateClaimAnimation();
      this.updateCamera();
      this.updateParticles();
      return;
    }

    // Handle rotation
    if (this.keys.has('a') || this.keys.has('arrowleft')) {
      ship.rotation -= SHIP_ROTATION_SPEED;
    }
    if (this.keys.has('d') || this.keys.has('arrowright')) {
      ship.rotation += SHIP_ROTATION_SPEED;
    }

    // Check if boosting
    const isBoosting = this.keys.has('shift');
    const speedMultiplier = 1 + ((this.shipEffects.speedBonus || 0) * 0.1); // Each level = +10%
    const acceleration = (isBoosting ? SHIP_BOOST_ACCELERATION : SHIP_ACCELERATION) * speedMultiplier;
    const maxSpeed = (isBoosting ? SHIP_BOOST_MAX_SPEED : SHIP_MAX_SPEED) * speedMultiplier;

    // Handle thrust
    const wasThrusting = ship.thrusting;
    ship.thrusting = this.keys.has('w') || this.keys.has('arrowup');
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.rotation) * acceleration;
      ship.vy += Math.sin(ship.rotation) * acceleration;
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
    if (this.keys.has('s') || this.keys.has('arrowdown')) {
      ship.vx *= 0.94;
      ship.vy *= 0.94;
    }

    // Apply friction
    ship.vx *= SHIP_FRICTION;
    ship.vy *= SHIP_FRICTION;

    // Limit speed
    const speed = Math.sqrt(ship.vx ** 2 + ship.vy ** 2);
    if (speed > maxSpeed) {
      ship.vx = (ship.vx / speed) * maxSpeed;
      ship.vy = (ship.vy / speed) * maxSpeed;
    }

    // Update position
    ship.x += ship.vx;
    ship.y += ship.vy;

    // Collision with planets (bounce off)
    for (const planet of planets) {
      const dx = ship.x - planet.x;
      const dy = ship.y - planet.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = planet.radius + 15; // Ship radius ~15

      if (dist < minDist) {
        // Push ship out and bounce
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        ship.x += nx * overlap;
        ship.y += ny * overlap;

        // Reflect velocity
        const dot = ship.vx * nx + ship.vy * ny;
        ship.vx -= 2 * dot * nx * 0.6;
        ship.vy -= 2 * dot * ny * 0.6;

        // Emit collision particles
        this.emitCollisionParticles(ship.x - nx * 15, ship.y - ny * 15);

        // Sound: collision
        soundManager.playCollision();
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
        ship.vx += nx * pullStrength;
        ship.vy += ny * pullStrength;

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
      }
    } else {
      // Ship is being sucked in - animate and then rick roll
      this.suckProgress += 0.02;
      const bhDx = this.blackHole.x - ship.x;
      const bhDy = this.blackHole.y - ship.y;
      const bhDist = Math.sqrt(bhDx * bhDx + bhDy * bhDy);
      ship.x += bhDx * 0.1;
      ship.y += bhDy * 0.1;
      ship.rotation += 0.3; // Spin while being sucked

      if (this.suckProgress >= 1 || bhDist < 5) {
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

    // World bounds (wrap around like classic arcade games)
    const wrapMargin = 50;
    if (ship.x < -wrapMargin) { ship.x = WORLD_SIZE + wrapMargin; }
    if (ship.x > WORLD_SIZE + wrapMargin) { ship.x = -wrapMargin; }
    if (ship.y < -wrapMargin) { ship.y = WORLD_SIZE + wrapMargin; }
    if (ship.y > WORLD_SIZE + wrapMargin) { ship.y = -wrapMargin; }

    this.updateCamera();
    this.updateParticles();
    this.updateUpgradeSatellites();
    this.updateOtherPlayersInterpolation();
    this.updateOtherPlayersParticles();
    this.updateZoneTitle();

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
      // Check if close enough to dock (and not completed)
      // Also check ownership: can interact with shared planets (ownerId null) or own planets
      const canInteract = closestPlanet.ownerId === null ||
                          closestPlanet.ownerId === undefined ||
                          closestPlanet.ownerId === this.currentUser;

      if (!closestPlanet.completed && closestDist < closestPlanet.radius + DOCKING_DISTANCE && canInteract) {
        this.state.dockingPlanet = closestPlanet;
        if (this.keys.has(' ') && !this.isLanding) {
          this.keys.delete(' ');
          this.startLandingAnimation(closestPlanet);
        }
      }

      // Shop/station proximity sound
      const isStation = closestPlanet.id === 'shop-station' || closestPlanet.id === 'planet-builder' || closestPlanet.id.startsWith('user-planet-');
      if (isStation) {
        const maxDist = closestPlanet.radius + PLANET_INFO_DISTANCE;
        const proximity = Math.max(0, 1 - (closestDist - closestPlanet.radius) / (maxDist - closestPlanet.radius));
        soundManager.updateShopProximity(proximity);
      } else {
        soundManager.updateShopProximity(0);
      }
    } else {
      soundManager.updateShopProximity(0);
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

    // ~3.5 second animation at 60fps
    this.landingProgress += 0.005;
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
      const specialPlanets = ['memory-lane', 'shop-station', 'planet-builder'];
      const isSpecial = specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-');
      if (!planet.completed && !isSpecial && this.onColonize) {
        const isNotionPlanet = planet.id.startsWith('notion-');
        const isUnassigned = isNotionPlanet && (!planet.ownerId || planet.ownerId === '');

        if (isUnassigned) {
          // Start claim animation for unassigned notion planets
          this.startClaimAnimation(planet);
        } else {
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

    // Handle T key - terraform (for user planets)
    if (this.keys.has('t')) {
      this.keys.delete('t');
      if (planet.id.startsWith('user-planet-') && this.onTerraform) {
        this.onTerraform(planet);
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

  // Start claim animation (laser beam + teleport effect)
  private startClaimAnimation(planet: Planet) {
    this.isClaiming = true;
    this.claimProgress = 0;
    this.claimPlanet = planet;
    this.claimParticles = [];

    // Clear landed state
    this.isLanded = false;
    this.landedPlanet = null;

    // Play a sound
    soundManager.playDockingSound();
  }

  // Update claim animation
  private updateClaimAnimation() {
    if (!this.isClaiming || !this.claimPlanet) return;

    const planet = this.claimPlanet;
    this.claimProgress += 0.02; // ~2.5 second animation

    const { ship } = this.state;

    // Keep ship in position
    ship.x = planet.x;
    ship.y = planet.y - planet.radius - 25;
    ship.vx = 0;
    ship.vy = 0;
    ship.rotation = -Math.PI / 2;

    // Phase 1: Laser beam charging (0-0.3)
    // Phase 2: Beam hits planet, planet shrinks (0.3-0.7)
    // Phase 3: Planet explodes into particles, flash (0.7-1.0)

    if (this.claimProgress < 0.3) {
      // Charging - emit energy particles toward ship
      if (Math.random() < 0.3) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 40;
        this.claimParticles.push({
          x: ship.x + Math.cos(angle) * dist,
          y: ship.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * 3,
          vy: -Math.sin(angle) * 3,
          life: 20,
          color: '#00ffff',
          size: 3 + Math.random() * 2,
        });
      }
    } else if (this.claimProgress < 0.7) {
      // Planet shrinking - emit particles from planet surface
      const shrinkProgress = (this.claimProgress - 0.3) / 0.4;
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const currentRadius = planet.radius * (1 - shrinkProgress * 0.8);
        this.claimParticles.push({
          x: planet.x + Math.cos(angle) * currentRadius,
          y: planet.y + Math.sin(angle) * currentRadius,
          vx: Math.cos(angle) * (2 + Math.random() * 2),
          vy: Math.sin(angle) * (2 + Math.random() * 2),
          life: 30 + Math.random() * 20,
          color: Math.random() < 0.5 ? planet.color : '#ffffff',
          size: 2 + Math.random() * 4,
        });
      }
    } else if (this.claimProgress < 0.85) {
      // Explosion burst
      if (this.claimProgress < 0.75) {
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 5;
          this.claimParticles.push({
            x: planet.x,
            y: planet.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 40 + Math.random() * 30,
            color: ['#ffffff', '#00ffff', '#ffff00', planet.color][Math.floor(Math.random() * 4)],
            size: 3 + Math.random() * 5,
          });
        }
      }
    }

    // Update claim particles
    for (let i = this.claimParticles.length - 1; i >= 0; i--) {
      const p = this.claimParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) {
        this.claimParticles.splice(i, 1);
      }
    }

    // Animation complete
    if (this.claimProgress >= 1) {
      this.isClaiming = false;
      this.claimParticles = [];

      // Call the colonize callback to actually claim
      if (this.onColonize && this.claimPlanet) {
        this.onColonize(this.claimPlanet);
      }
      this.claimPlanet = null;
    }
  }

  // Render claim animation effects
  private renderClaimAnimation() {
    if (!this.isClaiming || !this.claimPlanet) return;

    const { ctx } = this;
    const planet = this.claimPlanet;
    const { ship } = this.state;

    ctx.save();

    // Transform to world coordinates
    ctx.translate(-this.state.camera.x + this.canvas.width / 2, -this.state.camera.y + this.canvas.height / 2);

    // Phase 1: Charging glow around ship
    if (this.claimProgress < 0.3) {
      const chargeIntensity = this.claimProgress / 0.3;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, 30 + chargeIntensity * 20, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(ship.x, ship.y, 10, ship.x, ship.y, 50);
      gradient.addColorStop(0, `rgba(0, 255, 255, ${chargeIntensity * 0.5})`);
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Phase 2: Laser beam + shrinking planet
    if (this.claimProgress >= 0.3 && this.claimProgress < 0.7) {
      const beamProgress = (this.claimProgress - 0.3) / 0.4;

      // Draw laser beam from ship to planet
      const beamWidth = 8 + Math.sin(this.claimProgress * 50) * 2;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = beamWidth;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y + 20);
      ctx.lineTo(planet.x, planet.y);
      ctx.stroke();

      // Inner bright beam
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = beamWidth * 0.4;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y + 20);
      ctx.lineTo(planet.x, planet.y);
      ctx.stroke();

      // Draw shrinking planet
      const shrinkScale = 1 - beamProgress * 0.8;
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#00ffff';
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius * shrinkScale, 0, Math.PI * 2);
      ctx.fillStyle = planet.color;
      ctx.globalAlpha = 1 - beamProgress * 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Phase 3: Flash and explosion
    if (this.claimProgress >= 0.7 && this.claimProgress < 0.85) {
      const flashIntensity = 1 - (this.claimProgress - 0.7) / 0.15;
      ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity * 0.8})`;
      ctx.fillRect(
        planet.x - 200,
        planet.y - 200,
        400,
        400
      );
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

    // Smooth camera follow
    const targetCamX = ship.x - this.canvas.width / 2;
    const targetCamY = ship.y - this.canvas.height / 2;
    camera.x += (targetCamX - camera.x) * 0.06;
    camera.y += (targetCamY - camera.y) * 0.06;
  }

  private updateParticles() {
    this.state.particles = this.state.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.vx *= 0.97;
      p.vy *= 0.97;
      return p.life > 0;
    });
  }

  private updateZoneTitle() {
    const { ship } = this.state;

    // Find current zone (closest zone center)
    let closestZone: Zone | null = null;
    let closestDist = Infinity;

    for (const zone of ZONES) {
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
      // Use render state for interpolated thrusting
      const renderState = this.renderStates.get(player.id);
      const isThrusting = renderState?.renderThrusting ?? player.thrusting;
      if (isThrusting && Math.random() < 0.3) {
        this.emitOtherPlayerThrust(player);
      }
    }
  }

  private updateUpgradeSatellites() {
    if (!this.isUpgrading) return;

    const target = this.getUpgradeTargetPosition();

    for (const sat of this.upgradeSatellites) {
      // Orbit around
      sat.angle += sat.speed;
      // Wobble the distance
      sat.wobble += sat.wobbleSpeed;

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

  private renderUpgradeSatellites() {
    if (!this.isUpgrading || this.upgradeSatellites.length === 0) return;

    const { ctx, state } = this;
    const { camera } = state;
    const target = this.getUpgradeTargetPosition();
    const targetX = target.x - camera.x;
    const targetY = target.y - camera.y;

    for (const sat of this.upgradeSatellites) {
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

    // Draw zone backgrounds and boundaries
    this.drawZones();

    // Draw path lines between planets of same type
    this.drawPathLines();

    // Draw planets
    for (const planet of planets) {
      this.drawPlanet(planet);
    }

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

    // Draw other players' ships (behind local ship)
    this.renderOtherPlayers();

    // Draw local ship
    this.drawShip();

    // Draw upgrade satellites/robots orbiting the ship
    this.renderUpgradeSatellites();

    // Draw claim animation (laser beam + teleport effect)
    if (this.isClaiming) {
      this.renderClaimAnimation();
    }

    // Draw planet info panel when nearby OR landed panel when on planet
    if (this.isLanded && this.landedPlanet) {
      this.drawLandedPanel(this.landedPlanet);
    } else if (state.nearbyPlanet) {
      this.drawPlanetInfo(state.nearbyPlanet, state.dockingPlanet !== null);
    }

    // Draw minimap
    this.drawMinimap();

    // Draw zone title when entering a new zone
    if (this.zoneTitleOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = this.zoneTitleOpacity;
      ctx.font = 'bold 32px Space Grotesk';
      ctx.textAlign = 'center';

      // Draw text shadow/glow
      ctx.shadowColor = this.zoneTitleColor;
      ctx.shadowBlur = 20;
      ctx.fillStyle = this.zoneTitleColor;
      ctx.fillText(this.zoneTitleText, canvas.width / 2, 80);

      // Draw text again for more brightness
      ctx.shadowBlur = 10;
      ctx.fillText(this.zoneTitleText, canvas.width / 2, 80);

      ctx.restore();
    }

    // Draw controls hint (different controls when landed)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '11px Space Grotesk';
    ctx.textAlign = 'left';
    if (this.isLanded && this.landedPlanet) {
      const hasNotion = this.landedPlanet.notionUrl;
      const isCompleted = this.landedPlanet.completed;
      const isNotionPlanet = this.landedPlanet.id.startsWith('notion-');
      const isUnassigned = isNotionPlanet && (!this.landedPlanet.ownerId || this.landedPlanet.ownerId === '');
      let hint = 'SPACE Take Off';
      if (!isCompleted) {
        if (isUnassigned) {
          hint += '  •  C Claim Mission';
        } else {
          hint += '  •  C Complete';
        }
      }
      if (hasNotion) {
        hint += '  •  N Open in Notion';
      }
      ctx.fillText(hint, 20, canvas.height - 15);
    } else {
      ctx.fillText('W/↑ Thrust  •  A/← D/→ Rotate  •  S/↓ Brake  •  SHIFT Boost  •  SPACE Dock', 20, canvas.height - 15);
    }
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

    // Sort by Y position for proper path
    Object.values(planetsByType).forEach(group => {
      group.sort((a, b) => b.y - a.y);
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

  private drawPlanet(planet: Planet) {
    // Draw planet at all wrapped positions for seamless world wrapping
    const positions = this.getWrappedPositions(planet.x, planet.y, planet.radius * 2.5);
    for (const pos of positions) {
      this.drawPlanetAt(planet, pos.x, pos.y);
    }
  }

  private drawPlanetAt(planet: Planet, x: number, y: number) {
    const { ctx } = this;

    const style = (planet as any).style || { baseColor: planet.color, accent: planet.color };

    // Check if this is the Hormozi planet and we have the image
    const isHormoziPlanet = planet.id === 'a1' && this.hormoziPlanetImage;

    // Check if this is a custom planet with an image
    const customPlanetImage = this.customPlanetImages.get(planet.id);
    const hasCustomImage = !!customPlanetImage;

    // Check if this is a user planet with a terraformed image
    const isUserPlanet = planet.id.startsWith('user-planet-');
    const userId = isUserPlanet ? planet.id.replace('user-planet-', '') : null;
    const userPlanetImage = userId ? this.userPlanetImages.get(userId) : null;

    // Glow
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, planet.radius * 2.5);
    glowGradient.addColorStop(0, style.baseColor + '40');
    glowGradient.addColorStop(0.5, style.baseColor + '15');
    glowGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(x, y, planet.radius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Ring (if has ring and not custom image planet)
    if ((planet as any).hasRing && !isHormoziPlanet && !hasCustomImage) {
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
      const imgSize = planet.radius * 2.2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, planet.radius * 1.1, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        userPlanetImage,
        x - imgSize / 2,
        y - imgSize / 2,
        imgSize,
        imgSize
      );
      ctx.restore();

      // Add glow rim around the clipped image
      ctx.beginPath();
      ctx.arc(x, y, planet.radius * 1.1, 0, Math.PI * 2);
      ctx.strokeStyle = style.baseColor + '80';
      ctx.lineWidth = 2;
      ctx.stroke();
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
    } else if (isHormoziPlanet && !planet.completed) {
      // Draw Hormozi planet image
      const imgSize = planet.radius * 2.5;
      ctx.drawImage(
        this.hormoziPlanetImage!,
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

    // Atmosphere rim
    ctx.beginPath();
    ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
    ctx.strokeStyle = planet.completed ? '#4ade80' : style.baseColor + '60';
    ctx.lineWidth = planet.completed ? 3 : 2;
    ctx.stroke();

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

    // Label
    ctx.fillStyle = planet.completed ? '#4ade80' : '#fff';
    ctx.font = `${planet.completed ? 'bold ' : ''}12px Space Grotesk`;
    ctx.textAlign = 'center';
    ctx.fillText(planet.name, x, y + planet.radius + 25);

    // Type indicator
    const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700', notion: '#94a3b8' };
    ctx.fillStyle = (typeColors[planet.type] || '#94a3b8') + '80';
    ctx.font = '9px Space Grotesk';
    const typeLabel = planet.type === 'notion' ? 'NOTION' : planet.type.toUpperCase();
    ctx.fillText(typeLabel, x, y + planet.radius + 38);
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

    // Ship size scales with level + size bonus from effects
    const effectSizeMultiplier = 1 + (this.shipEffects.sizeBonus / 100);
    let scale = (0.9 + this.shipLevel * 0.12) * effectSizeMultiplier;

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

    // Label (mysterious)
    ctx.fillStyle = '#8844ff';
    ctx.font = '12px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.fillText('???', x, y + this.blackHole.radius + 25);
  }

  private drawPlanetInfo(planet: Planet, canDock: boolean) {
    const { ctx, canvas } = this;

    // Check if this planet belongs to another player (locked)
    const isLocked = planet.ownerId !== null &&
                     planet.ownerId !== undefined &&
                     planet.ownerId !== this.currentUser;
    const ownerName = planet.ownerId ? planet.ownerId.charAt(0).toUpperCase() + planet.ownerId.slice(1) : null;

    const boxWidth = 320;
    const hasRealReward = planet.realWorldReward && !planet.completed;
    const hasNotionUrl = planet.notionUrl && !planet.completed;
    let boxHeight = 110;
    if (hasRealReward) boxHeight += 30;
    if (hasNotionUrl) boxHeight += 20;
    const boxX = canvas.width / 2 - boxWidth / 2;
    const boxY = canvas.height - boxHeight - 20;

    // Background
    ctx.fillStyle = isLocked ? 'rgba(30, 10, 10, 0.95)' : 'rgba(10, 10, 20, 0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
    ctx.fill();

    // Border with planet color (dimmed if locked)
    ctx.strokeStyle = isLocked ? '#ff4444' : (planet.completed ? '#4ade80' : planet.color);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Planet name (with lock icon if locked)
    ctx.fillStyle = isLocked ? '#ff6666' : (planet.completed ? '#4ade80' : '#fff');
    ctx.font = 'bold 16px Space Grotesk';
    ctx.textAlign = 'center';
    const nameText = planet.completed ? `✓ ${planet.name}` : (isLocked ? `🔒 ${planet.name}` : planet.name);
    ctx.fillText(nameText, canvas.width / 2, boxY + 24);

    // Type badge + owner info
    const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700', notion: '#94a3b8' };
    ctx.fillStyle = typeColors[planet.type] || '#94a3b8';
    ctx.font = '10px Space Grotesk';
    const typeLabel = planet.type === 'notion' ? 'NOTION TASK' : planet.type.toUpperCase();
    const ownerText = ownerName ? ` • ${ownerName}'s Task` : ' • Shared Task';
    ctx.fillText(typeLabel + ownerText, canvas.width / 2, boxY + 40);

    // Description
    if (planet.description) {
      ctx.fillStyle = isLocked ? '#777' : '#aaa';
      ctx.font = '12px Space Grotesk';
      ctx.fillText(planet.description, canvas.width / 2, boxY + 60);
    }

    // Reward type
    if (planet.reward && !planet.completed) {
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
      ctx.fillStyle = isLocked ? '#886600' : '#ffa500';
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`Ship Reward: ${rewardLabels[planet.reward] || planet.reward}`, canvas.width / 2, boxY + 80);
    }

    // Real world reward
    if (hasRealReward) {
      ctx.fillStyle = isLocked ? '#884466' : '#ff6b9d';
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`🎁 Real Reward: ${planet.realWorldReward}`, canvas.width / 2, boxY + 100);
    }

    // Notion URL hint
    if (hasNotionUrl) {
      ctx.fillStyle = isLocked ? '#555' : '#64748b';
      ctx.font = '10px Space Grotesk';
      const notionY = hasRealReward ? boxY + 118 : boxY + 98;
      ctx.fillText('📋 Click to open in Notion', canvas.width / 2, notionY);
    }

    // Dock prompt / locked message / completed status
    const promptY = boxY + boxHeight - 18;
    if (isLocked) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '11px Space Grotesk';
      ctx.fillText(`This is ${ownerName}'s task`, canvas.width / 2, promptY);
    } else if (canDock && !planet.completed) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Space Grotesk';
      ctx.fillText('[ SPACE ] to dock', canvas.width / 2, promptY);
    } else if (planet.completed) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '11px Space Grotesk';
      ctx.fillText('Completed!', canvas.width / 2, promptY);
    }
  }

  private drawLandedPanel(planet: Planet) {
    const { ctx, canvas } = this;

    // Larger panel for landed state with more details
    const boxWidth = 400;
    let boxHeight = 180;

    // Calculate additional height for content
    const hasDescription = planet.description && planet.description.length > 0;
    const hasReward = planet.reward && !planet.completed;
    const hasRealReward = planet.realWorldReward && !planet.completed;
    const hasNotionUrl = planet.notionUrl;
    const hasPriority = planet.priority;

    if (hasDescription) boxHeight += 25;
    if (hasRealReward) boxHeight += 25;
    if (hasNotionUrl) boxHeight += 25;
    if (hasPriority) boxHeight += 20;

    const boxX = canvas.width / 2 - boxWidth / 2;
    const boxY = canvas.height / 2 - boxHeight / 2;

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

    // Planet name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.fillText(planet.name, boxX + boxWidth / 2, boxY + 45);

    // Type and owner info
    const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700', notion: '#94a3b8' };
    ctx.fillStyle = typeColors[planet.type] || '#94a3b8';
    ctx.font = '12px Space Grotesk';
    const typeLabel = planet.type === 'notion' ? 'NOTION TASK' : planet.type.toUpperCase();
    const ownerName = planet.ownerId ? planet.ownerId.charAt(0).toUpperCase() + planet.ownerId.slice(1) : null;
    const isUnassigned = planet.type === 'notion' && (!planet.ownerId || planet.ownerId === '');
    const ownerText = ownerName ? ` • ${ownerName}'s Task` : (isUnassigned ? ' • Unassigned' : ' • Shared Task');
    const sizeLabel = ` • ${planet.size.charAt(0).toUpperCase() + planet.size.slice(1)}`;
    ctx.fillText(typeLabel + ownerText + sizeLabel, boxX + boxWidth / 2, boxY + 65);

    let currentY = boxY + 90;

    // Priority badge (for notion tasks)
    if (hasPriority) {
      const priorityColors: Record<string, string> = {
        'urgent': '#ff4444',
        'high': '#ff8c00',
        'medium': '#ffd700',
        'low': '#4ade80',
        'none': '#666'
      };
      const priorityColor = priorityColors[planet.priority?.toLowerCase() || 'none'] || '#666';
      ctx.fillStyle = priorityColor;
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`Priority: ${planet.priority?.toUpperCase()}`, boxX + boxWidth / 2, currentY);
      currentY += 22;
    }

    // Description
    if (hasDescription) {
      ctx.fillStyle = '#aaa';
      ctx.font = '13px Space Grotesk';
      // Wrap text if too long
      const maxWidth = boxWidth - 40;
      const desc = planet.description || '';
      if (ctx.measureText(desc).width > maxWidth) {
        // Simple word wrap
        const words = desc.split(' ');
        let line = '';
        for (const word of words) {
          const testLine = line + word + ' ';
          if (ctx.measureText(testLine).width > maxWidth && line !== '') {
            ctx.fillText(line.trim(), boxX + boxWidth / 2, currentY);
            line = word + ' ';
            currentY += 18;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), boxX + boxWidth / 2, currentY);
      } else {
        ctx.fillText(desc, boxX + boxWidth / 2, currentY);
      }
      currentY += 25;
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

    if (!planet.completed) {
      const isNotionPlanet = planet.type === 'notion';
      const isUnassignedNotion = isNotionPlanet && (!planet.ownerId || planet.ownerId === '');

      // Claim or Complete hint
      ctx.fillStyle = isUnassignedNotion ? '#ffd700' : '#4ade80';
      ctx.font = 'bold 14px Space Grotesk';
      const actionText = isUnassignedNotion ? '[ C ] Claim Mission' : '[ C ] Complete';
      ctx.fillText(actionText, boxX + boxWidth / 2 - (hasNotionUrl ? 80 : 0), currentY);

      // Notion hint
      if (hasNotionUrl) {
        ctx.fillStyle = '#5490ff';
        ctx.fillText('[ N ] Open Notion', boxX + boxWidth / 2 + 80, currentY);
      }
    }

    // Takeoff hint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px Space Grotesk';
    ctx.fillText('[ SPACE ] to take off', boxX + boxWidth / 2, boxY + boxHeight - 12);

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

    // Preload ship images for new players
    for (const player of players) {
      if (player.shipImage && !this.otherPlayerImages.has(player.id)) {
        this.loadOtherPlayerImage(player.id, player.shipImage);
      }

      // Initialize render state if this is a new player
      if (!this.renderStates.has(player.id)) {
        this.renderStates.set(player.id, this.createInitialRenderState(player.x, player.y, player.rotation, player.vx, player.vy, player.thrusting));
      }
    }

    // Clean up render states and snapshots for players who left
    for (const id of this.renderStates.keys()) {
      if (!players.find(p => p.id === id)) {
        this.renderStates.delete(id);
        this.playerSnapshots.delete(id);
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
  private createInitialRenderState(x: number, y: number, rotation: number, vx: number, vy: number, thrusting: boolean): InterpolationState {
    return {
      renderX: x,
      renderY: y,
      renderRotation: rotation,
      renderVx: vx,
      renderVy: vy,
      renderThrusting: thrusting,
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
      player.x = data.x;
      player.y = data.y;
      player.vx = data.vx;
      player.vy = data.vy;
      player.rotation = data.rotation;
    }

    // Initialize render state if needed
    if (!this.renderStates.has(playerId)) {
      this.renderStates.set(playerId, this.createInitialRenderState(data.x, data.y, data.rotation, data.vx, data.vy, data.thrusting));
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
      } else {
        targetX = player.x;
        targetY = player.y;
        targetRotation = player.rotation;
        targetThrusting = player.thrusting;
      }

      // Unwrap target for world wrapping
      const unwrapped = this.unwrapPosition(renderState.renderX, renderState.renderY, targetX, targetY);

      // Lerp toward predicted target
      renderState.renderX += (unwrapped.x - renderState.renderX) * LERP_FACTOR;
      renderState.renderY += (unwrapped.y - renderState.renderY) * LERP_FACTOR;

      // Wrap back to world bounds
      const wrapped = this.wrapPosition(renderState.renderX, renderState.renderY);
      renderState.renderX = wrapped.x;
      renderState.renderY = wrapped.y;

      // Lerp rotation
      let rotDiff = targetRotation - renderState.renderRotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      renderState.renderRotation += rotDiff * LERP_FACTOR;

      // Thrusting - direct
      renderState.renderThrusting = targetThrusting;

      renderState.lastUpdateTime = now;
    }
  }

  /**
   * Get the current ship state for broadcasting to other players.
   */
  public getShipState(): { x: number; y: number; vx: number; vy: number; rotation: number; thrusting: boolean } {
    const { ship } = this.state;
    return {
      x: ship.x,
      y: ship.y,
      vx: ship.vx,
      vy: ship.vy,
      rotation: ship.rotation,
      thrusting: ship.thrusting,
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
    }
  }

  /**
   * Draw another player's ship at a specific screen position.
   */
  private drawOtherPlayerAt(player: OtherPlayer, x: number, y: number, rotation?: number, thrusting?: boolean) {
    const { ctx } = this;
    const shipImage = this.otherPlayerImages.get(player.id) || this.baseShipImage;
    const renderRotation = rotation ?? player.rotation;
    const renderThrusting = thrusting ?? player.thrusting;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(renderRotation + Math.PI / 2);

    // Ship size (same formula as local player: base + level bonus + effects)
    const effectSizeMultiplier = 1 + ((player.shipEffects?.sizeBonus || 0) / 100);
    const shipLevel = player.shipLevel || 1;
    const scale = (0.9 + shipLevel * 0.12) * effectSizeMultiplier;
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
   * Emit thrust particles for another player (simpler version).
   */
  private emitOtherPlayerThrust(player: OtherPlayer) {
    // Use render state for interpolated position
    const renderState = this.renderStates.get(player.id);
    const px = renderState?.renderX ?? player.x;
    const py = renderState?.renderY ?? player.y;
    const rotation = renderState?.renderRotation ?? player.rotation;
    const vx = renderState?.renderVx ?? player.vx;
    const vy = renderState?.renderVy ?? player.vy;

    const backAngle = rotation + Math.PI;
    const trailType = player.shipEffects?.trailType || 'default';

    // Choose colors based on trail type
    let colors: string[];
    switch (trailType) {
      case 'fire':
        colors = ['#ff4400', '#ff6600', '#ff8800'];
        break;
      case 'ice':
        colors = ['#88ddff', '#aaeeff', '#ccffff'];
        break;
      case 'rainbow':
        colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];
        break;
      default:
        colors = [player.color, player.color + 'cc', player.color + '88'];
    }

    const spread = (Math.random() - 0.5) * 0.6;
    const speed = Math.random() * 3 + 2;

    this.state.particles.push({
      x: px + Math.cos(backAngle) * 18,
      y: py + Math.sin(backAngle) * 18,
      vx: Math.cos(backAngle + spread) * speed + vx * 0.3,
      vy: Math.sin(backAngle + spread) * speed + vy * 0.3,
      life: 25 + Math.random() * 15,
      maxLife: 40,
      size: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}
