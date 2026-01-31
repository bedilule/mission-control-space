import { Vector2, Planet, Star, Particle, Ship, GameState, RewardType } from './types';
import { soundManager } from './SoundManager';

interface CustomPlanetData {
  id: string;
  name: string;
  description: string;
  type: 'business' | 'product' | 'achievement';
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
}

interface ShipEffects {
  glowColor: string | null;
  trailType: 'default' | 'fire' | 'ice' | 'rainbow';
  sizeBonus: number;
  speedBonus: number;
  ownedGlows: string[];
  ownedTrails: string[];
}

// Store terraform counts for scaling
const userPlanetTerraformCounts: Map<string, number> = new Map();

const USER_IDS = ['quentin', 'armel', 'alex', 'melia', 'hugue'];

const WORLD_SIZE = 5000;
const SHIP_ACCELERATION = 0.18;
const SHIP_ROTATION_SPEED = 0.06;
const SHIP_MAX_SPEED = 7;
const SHIP_BOOST_MAX_SPEED = 14;
const SHIP_BOOST_ACCELERATION = 0.35;
const SHIP_FRICTION = 0.992;
const DOCKING_DISTANCE = 50;
const PLANET_INFO_DISTANCE = 200;

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

  // Upgrading animation state (orbiting satellites/robots)
  private isUpgrading: boolean = false;
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

  constructor(canvas: HTMLCanvasElement, onDock: (planet: Planet) => void, customPlanets: CustomPlanetData[] = [], shipImageUrl?: string, goals?: GoalsData, upgradeCount: number = 0, userPlanets?: Record<string, UserPlanetData>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onDock = onDock;

    // Initialize state
    const basePlanets = this.createPlanets(goals);
    const customPlanetObjects = this.createCustomPlanets(customPlanets);
    const userPlanetObjects = this.createUserPlanets(userPlanets);

    this.state = {
      ship: {
        x: WORLD_SIZE / 2,
        y: WORLD_SIZE - 400,
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
    this.blackHole = {
      x: WORLD_SIZE / 2 + 200,
      y: WORLD_SIZE / 2 - 300,
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

    // Place business planets in a winding path on the left
    const businessStartX = WORLD_SIZE / 2 - 600;
    const businessStartY = WORLD_SIZE - 600;
    businessMilestones.forEach((m, i) => {
      const zigzag = (i % 2 === 0) ? -150 : 150;
      const style = planetStyles[i % planetStyles.length];
      planets.push({
        ...m,
        x: businessStartX + zigzag + Math.sin(i * 0.5) * 100,
        y: businessStartY - i * 350,
        radius: sizeRadius[m.size],
        color: style.baseColor,
        glowColor: style.baseColor.replace(')', ', 0.4)').replace('rgb', 'rgba'),
        completed: false,
        type: 'business',
        style: style,
        hasRing: i === 3 || i === 7,
        hasMoon: i === 4 || i === 9,
        description: m.description,
        reward: m.reward,
        realWorldReward: m.realWorldReward,
      });
    });

    // Place product planets in a path on the right
    const productStartX = WORLD_SIZE / 2 + 600;
    const productStartY = WORLD_SIZE - 600;
    productMilestones.forEach((m, i) => {
      const zigzag = (i % 2 === 0) ? 150 : -150;
      const style = planetStyles[(i + 3) % planetStyles.length];
      planets.push({
        ...m,
        x: productStartX + zigzag + Math.cos(i * 0.7) * 80,
        y: productStartY - i * 400,
        radius: sizeRadius[m.size],
        color: style.baseColor,
        glowColor: style.baseColor.replace(')', ', 0.4)').replace('rgb', 'rgba'),
        completed: false,
        type: 'product',
        style: style,
        hasRing: i === 2 || i === 5,
        hasMoon: i === 1,
        description: m.description,
        reward: m.reward,
        realWorldReward: m.realWorldReward,
      });
    });

    // Place achievements as special golden planets scattered around
    achievements.forEach((m, i) => {
      const angle = (i / achievements.length) * Math.PI * 0.8 - Math.PI * 0.4;
      const distance = 800 + i * 200;
      planets.push({
        ...m,
        x: WORLD_SIZE / 2 + Math.cos(angle) * distance,
        y: WORLD_SIZE / 2 - 500 + Math.sin(angle) * distance * 0.5,
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
      });
    });

    // SPECIAL STATIONS - Always accessible, near spawn
    // Memory Lane - View ship evolution (left of spawn)
    planets.push({
      id: 'memory-lane',
      name: 'Memory Lane',
      x: WORLD_SIZE / 2 - 250,
      y: WORLD_SIZE - 250,
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
    });

    // Shop Station - Buy upgrades (right of spawn)
    planets.push({
      id: 'shop-station',
      name: 'Upgrade Shop',
      x: WORLD_SIZE / 2 + 250,
      y: WORLD_SIZE - 250,
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
    });

    // Planet Builder - Create custom planets (above spawn)
    planets.push({
      id: 'planet-builder',
      name: 'Planet Factory',
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE - 150,
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

  private setupInput() {
    window.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      this.keys.add(e.key.toLowerCase());
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
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
      this.shipLevel = Math.min(10, this.state.completedCount + 1);
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

  public updateUserPlanetImage(userId: string, imageUrl: string, terraformCount?: number) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      this.userPlanetImages.set(userId, img);
    };

    // Update terraform count and planet size
    if (terraformCount !== undefined) {
      userPlanetTerraformCounts.set(userId, terraformCount);

      // Update the planet's radius in state
      const planet = this.state.planets.find(p => p.id === `user-planet-${userId}`);
      if (planet) {
        planet.radius = 50 + terraformCount * 3;
        // Add ring after 3 terraforms
        (planet as any).hasRing = terraformCount >= 3;
        // Add moon after 5 terraforms
        (planet as any).hasMoon = terraformCount >= 5;
      }
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

    // Position user planets scattered at the top of the map
    const planetPositions = [
      { x: WORLD_SIZE / 2 - 600, y: 500 },      // Quentin - top left
      { x: WORLD_SIZE / 2 + 600, y: 450 },      // Armel - top right
      { x: WORLD_SIZE / 2 - 300, y: 350 },      // Alex - upper middle left
      { x: WORLD_SIZE / 2 + 300, y: 300 },      // Melia - upper middle right
      { x: WORLD_SIZE / 2, y: 600 },            // Hugue - top center
    ];

    USER_IDS.forEach((userId, i) => {
      const colors = userColors[userId];
      const planetData = userPlanets?.[userId];
      const pos = planetPositions[i];
      const terraformCount = planetData?.terraformCount || 0;

      // Store terraform count for scaling during render
      userPlanetTerraformCounts.set(userId, terraformCount);

      // Base radius grows with each terraform (5% per terraform)
      const baseRadius = 50 + terraformCount * 3;

      const planet: Planet = {
        id: `user-planet-${userId}`,
        name: `${userId.charAt(0).toUpperCase() + userId.slice(1)}'s World`,
        x: pos.x,
        y: pos.y,
        radius: baseRadius,
        color: colors.base,
        glowColor: colors.base + '60',
        completed: false,
        type: 'achievement',
        size: 'big',
        style: { baseColor: colors.base, accent: colors.accent, type: 'user-planet' },
        hasRing: (planetData?.terraformCount || 0) >= 3,
        hasMoon: (planetData?.terraformCount || 0) >= 5,
        description: `${userId.charAt(0).toUpperCase() + userId.slice(1)}'s personal planet`,
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

    // World bounds (soft bounce)
    const margin = 100;
    if (ship.x < margin) { ship.x = margin; ship.vx *= -0.5; }
    if (ship.x > WORLD_SIZE - margin) { ship.x = WORLD_SIZE - margin; ship.vx *= -0.5; }
    if (ship.y < margin) { ship.y = margin; ship.vy *= -0.5; }
    if (ship.y > WORLD_SIZE - margin) { ship.y = WORLD_SIZE - margin; ship.vy *= -0.5; }

    this.updateCamera();
    this.updateParticles();

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
      if (!closestPlanet.completed && closestDist < closestPlanet.radius + DOCKING_DISTANCE) {
        this.state.dockingPlanet = closestPlanet;
        if (this.keys.has(' ') && !this.isLanding) {
          this.keys.delete(' ');
          this.startLandingAnimation(closestPlanet);
        }
      }
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
          this.onDock(this.landingPlanet);
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
    const { ship } = this.state;
    const targetCamX = ship.x - this.canvas.width / 2;
    const targetCamY = ship.y - this.canvas.height / 2;
    this.state.camera.x += (targetCamX - this.state.camera.x) * 0.06;
    this.state.camera.y += (targetCamY - this.state.camera.y) * 0.06;
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

  // Upgrading animation with orbiting satellites/robots
  public startUpgradeAnimation() {
    if (this.isUpgrading) return;
    this.isUpgrading = true;

    // Create 4-6 satellites/robots with random properties
    const count = 4 + Math.floor(Math.random() * 3);
    const colors = ['#00ffff', '#ff6b9d', '#ffd700', '#4ade80', '#a855f7', '#ff8c00'];

    this.upgradeSatellites = [];
    for (let i = 0; i < count; i++) {
      this.upgradeSatellites.push({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
        distance: 50 + Math.random() * 30,
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
    this.upgradeSatellites = [];
  }

  private updateUpgradeSatellites() {
    if (!this.isUpgrading) return;

    for (const sat of this.upgradeSatellites) {
      // Orbit around
      sat.angle += sat.speed;
      // Wobble the distance
      sat.wobble += sat.wobbleSpeed;

      // Emit tiny sparkle particles occasionally
      if (Math.random() < 0.05) {
        const { ship } = this.state;
        const x = ship.x + Math.cos(sat.angle) * (sat.distance + Math.sin(sat.wobble) * 10);
        const y = ship.y + Math.sin(sat.angle) * (sat.distance + Math.sin(sat.wobble) * 10);

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
    const { camera, ship } = state;
    const shipX = ship.x - camera.x;
    const shipY = ship.y - camera.y;

    for (const sat of this.upgradeSatellites) {
      const wobbleOffset = Math.sin(sat.wobble) * 10;
      const x = shipX + Math.cos(sat.angle) * (sat.distance + wobbleOffset);
      const y = shipY + Math.sin(sat.angle) * (sat.distance + wobbleOffset);

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

    // Clear with gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#0a0a15');
    bgGradient.addColorStop(0.5, '#0f0f1a');
    bgGradient.addColorStop(1, '#0a0a12');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars with parallax
    for (const star of stars) {
      const parallax = 0.2 + star.layer * 0.25;
      const x = star.x - camera.x * parallax;
      const y = star.y - camera.y * parallax;

      const wrappedX = ((x % canvas.width) + canvas.width) % canvas.width;
      const wrappedY = ((y % canvas.height) + canvas.height) % canvas.height;

      ctx.beginPath();
      ctx.arc(wrappedX, wrappedY, star.size, 0, Math.PI * 2);
      ctx.fillStyle = star.color || `rgba(255, 255, 255, ${star.brightness})`;
      ctx.globalAlpha = star.brightness;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

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

    // Draw ship
    this.drawShip();

    // Draw planet info panel when nearby
    if (state.nearbyPlanet) {
      this.drawPlanetInfo(state.nearbyPlanet, state.dockingPlanet !== null);
    }

    // Draw minimap
    this.drawMinimap();

    // Draw controls hint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '11px Space Grotesk';
    ctx.textAlign = 'left';
    ctx.fillText('W/↑ Thrust  •  A/← D/→ Rotate  •  S/↓ Brake  •  SHIFT Boost  •  SPACE Dock', 20, canvas.height - 15);
  }

  private drawPathLines() {
    const { ctx, state } = this;
    const { camera, planets } = state;

    const planetsByType: Record<string, Planet[]> = { business: [], product: [], achievement: [] };
    planets.forEach(p => planetsByType[p.type].push(p));

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
    const { ctx, state } = this;
    const { camera } = state;
    const x = planet.x - camera.x;
    const y = planet.y - camera.y;

    // Skip if off screen
    if (x < -150 || x > this.canvas.width + 150 || y < -150 || y > this.canvas.height + 150) return;

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
    const typeColors = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700' };
    ctx.fillStyle = typeColors[planet.type] + '80';
    ctx.font = '9px Space Grotesk';
    ctx.fillText(planet.type.toUpperCase(), x, y + planet.radius + 38);
  }

  private drawShip() {
    const { ctx, state } = this;
    const { camera, ship } = state;
    const x = ship.x - camera.x;
    const y = ship.y - camera.y;

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

    const boxWidth = 320;
    const hasRealReward = planet.realWorldReward && !planet.completed;
    const boxHeight = hasRealReward ? 140 : 110;
    const boxX = canvas.width / 2 - boxWidth / 2;
    const boxY = canvas.height - boxHeight - 20;

    // Background
    ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
    ctx.fill();

    // Border with planet color
    ctx.strokeStyle = planet.completed ? '#4ade80' : planet.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Planet name
    ctx.fillStyle = planet.completed ? '#4ade80' : '#fff';
    ctx.font = 'bold 16px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.fillText(planet.completed ? `✓ ${planet.name}` : planet.name, canvas.width / 2, boxY + 24);

    // Type badge
    const typeColors: Record<string, string> = { business: '#4ade80', product: '#5490ff', achievement: '#ffd700' };
    ctx.fillStyle = typeColors[planet.type];
    ctx.font = '10px Space Grotesk';
    ctx.fillText(planet.type.toUpperCase(), canvas.width / 2, boxY + 40);

    // Description
    if (planet.description) {
      ctx.fillStyle = '#aaa';
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
      ctx.fillStyle = '#ffa500';
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`Ship Reward: ${rewardLabels[planet.reward] || planet.reward}`, canvas.width / 2, boxY + 80);
    }

    // Real world reward
    if (hasRealReward) {
      ctx.fillStyle = '#ff6b9d';
      ctx.font = 'bold 11px Space Grotesk';
      ctx.fillText(`🎁 Real Reward: ${planet.realWorldReward}`, canvas.width / 2, boxY + 100);
    }

    // Dock prompt if close enough and not completed
    if (canDock && !planet.completed) {
      const promptY = boxY + boxHeight - 18;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Space Grotesk';
      ctx.fillText('[ SPACE ] to dock', canvas.width / 2, promptY);
    } else if (planet.completed) {
      const promptY = boxY + boxHeight - 18;
      ctx.fillStyle = '#4ade80';
      ctx.font = '11px Space Grotesk';
      ctx.fillText('Completed!', canvas.width / 2, promptY);
    }
  }

  private drawMinimap() {
    const { ctx, canvas, state } = this;
    const { camera, ship, planets } = state;

    const mapSize = 140;
    const mapX = canvas.width - mapSize - 15;
    const mapY = 15;
    const scale = mapSize / WORLD_SIZE;

    // Background
    ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapSize, mapSize, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
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
  }
}
