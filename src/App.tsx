import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { SpaceGame } from './SpaceGame';
import { Planet, RewardType, OtherPlayer, PointTransaction as PointTx, ShipEffects as TypedShipEffects } from './types';
import { soundManager } from './SoundManager';
import { useTeam } from './hooks/useTeam';
import { useMultiplayerSync } from './hooks/useMultiplayerSync';
import { usePlayerPositions } from './hooks/usePlayerPositions';
import { useNotionPlanets } from './hooks/useNotionPlanets';
import { useSupabaseData } from './hooks/useSupabaseData';
import { usePromptHistory } from './hooks/usePromptHistory';
import { getLocalPlayerId, supabase } from './lib/supabase';

const FAL_API_KEY = 'c2df5aba-75d9-4626-95bb-aa366317d09e:8f90bb335a773f0ce3f261354107daa6';
const STORAGE_KEY = 'mission-control-space-state';

// Prompt configs (loaded from JSON files) - Nano Banana format
interface PromptConfig {
  prompt: string;
  api?: string;
  settings: {
    num_images?: number;
    aspect_ratio?: string;
    output_format?: string;
  };
}

interface ShipPrompts {
  visualUpgrade: PromptConfig;
}

interface PlanetPrompts {
  basePlanet: PromptConfig;
  terraform: PromptConfig;
  customPlanet: PromptConfig;
}

// Default prompts (fallback if JSON fails to load) - Nano Banana format
const DEFAULT_SHIP_PROMPTS: ShipPrompts = {
  visualUpgrade: {
    prompt: "Edit this spaceship image: add {userInput}. Keep the spaceship design intact but make this new feature very visible and impressive. Sci-fi spacecraft style, transparent background.",
    api: "fal-ai/nano-banana/edit",
    settings: { num_images: 1, aspect_ratio: "1:1", output_format: "png" }
  }
};

const DEFAULT_PLANET_PROMPTS: PlanetPrompts = {
  basePlanet: {
    prompt: "A perfectly round spherical barren rocky planet. Desert wasteland with craters, no life, no vegetation. Subtle {userColor} colored glow on the edges. Game art style, pure black background.",
    api: "fal-ai/nano-banana",
    settings: { num_images: 1, aspect_ratio: "1:1", output_format: "png" }
  },
  terraform: {
    prompt: "Edit this planet image: add {userInput}. Keep the planet spherical and centered. Make this new feature clearly visible. Game art style, black background.",
    api: "fal-ai/nano-banana/edit",
    settings: { num_images: 1, aspect_ratio: "1:1", output_format: "png" }
  },
  customPlanet: {
    prompt: "{userInput}, spherical planet floating in space, game art style, dramatic lighting, black background",
    api: "fal-ai/nano-banana",
    settings: { num_images: 1, aspect_ratio: "1:1", output_format: "png" }
  }
};
const CUSTOM_PLANETS_KEY = 'mission-control-custom-planets';
const TEAM_POINTS_KEY = 'mission-control-team-points';
const USER_SHIPS_KEY = 'mission-control-user-ships';
const MASCOT_HISTORY_KEY = 'mission-control-mascot-history';
const GOALS_KEY = 'mission-control-goals';
const USER_PLANETS_KEY = 'mission-control-user-planets';

// Default planet image - empty string means use procedural barren planet
const DEFAULT_PLANET_IMAGE = '';

const USERS = [
  { id: 'quentin', name: 'Quentin', color: '#ffa500' },
  { id: 'armel', name: 'Armel', color: '#4ade80' },
  { id: 'alex', name: 'Alex', color: '#5490ff' },
  { id: 'milya', name: 'Milya', color: '#ff6b9d' },
  { id: 'hugues', name: 'Hugues', color: '#8b5cf6' },
];

// Points awarded per milestone size
const POINTS_PER_SIZE = { small: 50, medium: 100, big: 200 };

// AI visual upgrade cost
const VISUAL_UPGRADE_COST = 75;

// Programmatic ship effects (no AI needed - instant purchase)
// Size upgrades: 10 levels with increasing costs (ship)
const SIZE_COSTS = [40, 60, 90, 130, 180, 240, 310, 390, 480, 580]; // Cost per level

// Speed upgrades: 10 levels with increasing costs
const SPEED_COSTS = [30, 50, 80, 120, 170, 230, 300, 380, 470, 570]; // Cost per level

// Landing speed upgrades: 5 levels with increasing costs
const LANDING_SPEED_COSTS = [35, 55, 85, 125, 175]; // Cost per level

// Planet size upgrades: 5 levels with increasing costs
const PLANET_SIZE_COSTS = [50, 80, 120, 170, 230]; // Cost per level

const GLOW_EFFECTS = [
  { id: 'glow_orange', name: 'Orange', icon: '🟠', cost: 30, value: '#ff8800' },
  { id: 'glow_blue', name: 'Blue', icon: '🔵', cost: 30, value: '#00aaff' },
  { id: 'glow_purple', name: 'Purple', icon: '🟣', cost: 30, value: '#aa00ff' },
  { id: 'glow_green', name: 'Green', icon: '🟢', cost: 30, value: '#00ff88' },
];

const TRAIL_EFFECTS = [
  { id: 'trail_fire', name: 'Fire', icon: '🔥', cost: 40, value: 'fire' },
  { id: 'trail_ice', name: 'Ice', icon: '❄️', cost: 40, value: 'ice' },
  { id: 'trail_rainbow', name: 'Rainbow', icon: '🌈', cost: 60, value: 'rainbow' },
];

// Destroy Canon cost (one-time purchase)
const DESTROY_CANON_COST = 400;

// Default goals/milestones
const DEFAULT_GOALS = {
  business: [
    { id: 'b1', name: 'First Organic Signup', size: 'small', points: 20 },
    { id: 'b2', name: 'First Paying Customer', size: 'small', points: 30, realWorldReward: 'Team dinner' },
    { id: 'b3', name: 'First Referral', size: 'small', points: 40 },
    { id: 'b4', name: '5 Customers', size: 'small', points: 50 },
    { id: 'b5', name: '10 Customers', size: 'medium', points: 75 },
    { id: 'b6', name: '$5k MRR', size: 'medium', points: 100, realWorldReward: 'Team lunch (covers dev salaries)' },
    { id: 'b7', name: '10 Referrals', size: 'medium', points: 125 },
    { id: 'b8', name: '25 Customers', size: 'medium', points: 150 },
    { id: 'b9', name: '$10k MRR', size: 'medium', points: 200, realWorldReward: 'Owners start getting paid' },
    { id: 'b10', name: '50 Customers', size: 'medium', points: 250 },
    { id: 'b11', name: '$20k MRR', size: 'big', points: 400, realWorldReward: '+$1k/month everyone' },
    { id: 'b12', name: '100 Customers', size: 'big', points: 500 },
    { id: 'b13', name: '$50k MRR', size: 'big', points: 750, realWorldReward: 'Weekend trip for team' },
    { id: 'b14', name: '$55k MRR', size: 'big', points: 1000, realWorldReward: 'Owners at $10k — fancy dinner' },
    { id: 'b15', name: '200 Customers', size: 'big', points: 1250 },
    { id: 'b16', name: '$100k MRR', size: 'big', points: 2000, realWorldReward: '€5k bonus + equity for key people' },
    { id: 'b17', name: '500 Customers', size: 'big', points: 3000 },
    { id: 'b18', name: '$250k MRR', size: 'big', points: 5000, realWorldReward: 'Team trip anywhere in the world' },
    { id: 'b19', name: '$1M MRR', size: 'big', points: 10000, realWorldReward: 'Dream car or equivalent' },
  ],
  product: [
    { id: 'p1', name: '100 Videos Processed', size: 'small', points: 20 },
    { id: 'p2', name: 'Educational Videos', size: 'small', points: 30 },
    { id: 'p3', name: 'Templates Ready', size: 'small', points: 40 },
    { id: 'p4', name: 'Onboarding Wizard', size: 'medium', points: 60 },
    { id: 'p5', name: 'Public Launch', size: 'medium', points: 80 },
    { id: 'p6', name: 'Analytics Functioning', size: 'medium', points: 100 },
    { id: 'p7', name: '1,000 Videos Processed', size: 'medium', points: 150 },
    { id: 'p8', name: '50 Templates', size: 'medium', points: 200 },
    { id: 'p9', name: 'Smooth UX Achieved', size: 'big', points: 300 },
    { id: 'p10', name: '"Where Are The Bugs?"', size: 'big', points: 500 },
    { id: 'p11', name: '100,000 Videos Processed', size: 'big', points: 750 },
    { id: 'p12', name: 'AI Agent Builds Funnels', size: 'big', points: 1500 },
    { id: 'p13', name: 'Desktop Version', size: 'big', points: 2000 },
    { id: 'p14', name: '1,000,000 Videos Processed', size: 'big', points: 5000 },
  ],
  achievement: [
    { id: 'a1', name: 'First Week Streak', size: 'small', points: 50 },
    { id: 'a2', name: 'Customers in 10+ Countries', size: 'medium', points: 75 },
    { id: 'a3', name: 'First Podcast Appearance', size: 'medium', points: 100 },
    { id: 'a4', name: 'First $10k Day', size: 'medium', points: 150 },
    { id: 'a5', name: 'Big Podcast (100k+ audience)', size: 'medium', points: 250 },
    { id: 'a6', name: 'Customers in 50+ Countries', size: 'big', points: 300 },
    { id: 'a7', name: 'Competitor Copies Us', size: 'big', points: 400 },
    { id: 'a8', name: 'Product Hunt Top 5', size: 'big', points: 500 },
    { id: 'a9', name: 'Hacker News Front Page', size: 'big', points: 600 },
    { id: 'a10', name: 'TechCrunch/Forbes Mention', size: 'big', points: 750 },
    { id: 'a11', name: 'Product Hunt #1 of Day', size: 'big', points: 1000 },
    { id: 'a12', name: 'Remy Jupille Uses Us', size: 'big', points: 1000 },
    { id: 'a13', name: 'Yomi Denzel Uses Us', size: 'big', points: 1250 },
    { id: 'a14', name: 'Iman Gadzhi Uses Us', size: 'big', points: 1500 },
    { id: 'a15', name: 'Charlie Morgan Uses Us', size: 'big', points: 1500 },
    { id: 'a16', name: 'Viral Video (1M+ views)', size: 'big', points: 2000 },
    { id: 'a17', name: 'Gary Vee Notice', size: 'big', points: 3000 },
    { id: 'a18', name: 'Alex Hormozi Notice', size: 'big', points: 3000 },
    { id: 'a19', name: 'Wikipedia Page', size: 'big', points: 5000 },
    { id: 'a20', name: 'Customer Tattoos Logo', size: 'big', points: 10000 },
  ],
};

interface Goal {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'big';
  description?: string;
  realWorldReward?: string;
  points?: number;
}

interface Goals {
  business: Goal[];
  product: Goal[];
  achievement: Goal[];
}

interface UserPlanet {
  imageUrl: string;
  baseImage?: string; // Original base planet image (for reverting)
  terraformCount: number;
  history: { imageUrl: string; description: string; timestamp: number }[];
  sizeLevel: number; // 0-5 levels
}

const loadUserPlanets = (): Record<string, UserPlanet> => {
  try {
    const saved = localStorage.getItem(USER_PLANETS_KEY);
    if (saved) {
      const planets = JSON.parse(saved);
      // Migrate existing planets: if no baseImage but planet hasn't been terraformed,
      // the current imageUrl is the base
      for (const userId of Object.keys(planets)) {
        const planet = planets[userId];
        if (planet && planet.imageUrl && !planet.baseImage) {
          // Only set base if never terraformed (otherwise we don't know the original)
          if (!planet.terraformCount || planet.terraformCount === 0) {
            planet.baseImage = planet.imageUrl;
          }
        }
      }
      return planets;
    }
  } catch (e) {
    console.error('Failed to load user planets:', e);
  }
  return {};
};

const saveUserPlanets = (planets: Record<string, UserPlanet>) => {
  try {
    localStorage.setItem(USER_PLANETS_KEY, JSON.stringify(planets));
  } catch (e) {
    console.error('Failed to save user planets:', e);
  }
};

const loadGoals = (): Goals => {
  try {
    const saved = localStorage.getItem(GOALS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load goals:', e);
  }
  return DEFAULT_GOALS as Goals;
};

const saveGoals = (goals: Goals) => {
  try {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch (e) {
    console.error('Failed to save goals:', e);
  }
};

interface CustomPlanet {
  id: string;
  name: string;
  description: string;
  type: 'business' | 'product' | 'achievement' | 'notion';
  size: 'small' | 'medium' | 'big';
  realWorldReward?: string;
  imageUrl?: string;
  createdBy: string;
}

interface MascotHistoryEntry {
  imageUrl: string;
  planetName: string;
  timestamp: number;
  earnedBy: string;
}

interface ShipEffects {
  glowColor: string | null;
  trailType: 'default' | 'fire' | 'ice' | 'rainbow';
  sizeBonus: number; // Percentage bonus (e.g., 10 = +10%)
  speedBonus: number; // 0-10 levels, each gives +10% speed
  landingSpeedBonus: number; // 0-5 levels, each gives +15% faster landing
  ownedGlows: string[]; // Owned glow colors
  ownedTrails: string[]; // Owned trail types
  hasDestroyCanon: boolean; // Owns Destroy Canon weapon
  destroyCanonEquipped: boolean; // Canon is equipped and visible on ship
}

interface UserShip {
  baseImage: string;
  upgrades: string[]; // List of upgrade IDs applied
  currentImage: string;
  effects: ShipEffects;
}

interface SavedState {
  completedPlanets: string[];
  robotImage: string;
  robotDescription: string;
  upgradeCount: number;
  currentUser?: string;
}

// Storage helpers
// Use sessionStorage for currentUser so each tab has its own user
const SESSION_USER_KEY = 'mission-control-current-user';

const loadState = (): SavedState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const baseState = saved ? JSON.parse(saved) : {
      completedPlanets: [],
      robotImage: '/ship-base.png',
      robotDescription: 'A small friendly spaceship',
      upgradeCount: 0,
    };
    // Load currentUser from sessionStorage (per-tab) instead of localStorage
    const sessionUser = sessionStorage.getItem(SESSION_USER_KEY);
    return {
      ...baseState,
      currentUser: sessionUser || undefined, // Don't use localStorage value
    };
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return {
    completedPlanets: [],
    robotImage: '/ship-base.png',
    robotDescription: 'A small friendly spaceship',
    upgradeCount: 0,
  };
};

const saveState = (state: SavedState) => {
  try {
    // Save currentUser to sessionStorage (per-tab)
    if (state.currentUser) {
      sessionStorage.setItem(SESSION_USER_KEY, state.currentUser);
    }
    // Save rest to localStorage (but exclude currentUser from localStorage)
    const { currentUser, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
};

const loadCustomPlanets = (): CustomPlanet[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_PLANETS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load custom planets:', e);
  }
  return [];
};

const saveCustomPlanets = (planets: CustomPlanet[]) => {
  try {
    localStorage.setItem(CUSTOM_PLANETS_KEY, JSON.stringify(planets));
  } catch (e) {
    console.error('Failed to save custom planets:', e);
  }
};

const loadTeamPoints = (): number => {
  try {
    const saved = localStorage.getItem(TEAM_POINTS_KEY);
    if (saved) return parseInt(saved, 10);
  } catch (e) {
    console.error('Failed to load team points:', e);
  }
  return 0;
};

const saveTeamPoints = (points: number) => {
  try {
    localStorage.setItem(TEAM_POINTS_KEY, points.toString());
  } catch (e) {
    console.error('Failed to save team points:', e);
  }
};

const loadUserShips = (): Record<string, UserShip> => {
  try {
    const saved = localStorage.getItem(USER_SHIPS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load user ships:', e);
  }
  return {};
};

const saveUserShips = (ships: Record<string, UserShip>) => {
  try {
    // Filter out base64 images to avoid localStorage quota issues
    // Only store URL-based images
    const filteredShips: Record<string, UserShip> = {};
    for (const [userId, ship] of Object.entries(ships)) {
      filteredShips[userId] = {
        ...ship,
        baseImage: ship.baseImage.startsWith('data:') ? '/ship-base.png' : ship.baseImage,
        currentImage: ship.currentImage.startsWith('data:') ? '/ship-base.png' : ship.currentImage,
      };
    }
    localStorage.setItem(USER_SHIPS_KEY, JSON.stringify(filteredShips));
  } catch (e) {
    console.error('Failed to save user ships:', e);
  }
};

const loadMascotHistory = (): MascotHistoryEntry[] => {
  try {
    const saved = localStorage.getItem(MASCOT_HISTORY_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load mascot history:', e);
  }
  return [];
};

const saveMascotHistory = (history: MascotHistoryEntry[]) => {
  try {
    // Limit history to 20 entries and skip base64 images (too large for localStorage)
    const filteredHistory = history
      .filter(entry => !entry.imageUrl.startsWith('data:')) // Skip base64 images
      .slice(-20); // Keep only last 20 entries
    localStorage.setItem(MASCOT_HISTORY_KEY, JSON.stringify(filteredHistory));
  } catch (e) {
    console.error('Failed to save mascot history:', e);
    // If still failing, try clearing old entries
    try {
      const minimalHistory = history.slice(-5);
      localStorage.setItem(MASCOT_HISTORY_KEY, JSON.stringify(minimalHistory));
    } catch {
      // Give up and clear history
      localStorage.removeItem(MASCOT_HISTORY_KEY);
    }
  }
};

// Convert image URL to base64
const getImageAsBase64 = async (imageUrl: string): Promise<string> => {
  if (imageUrl.startsWith('data:')) return imageUrl;
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Save image to Supabase Storage
// Returns the public URL of the uploaded image
const saveImageToStorage = async (
  base64: string,
  type: 'ship' | 'planet',
  userId: string,
  name: string,
  originalUrl?: string
): Promise<string> => {
  try {
    // Extract base64 data (remove data:image/png;base64, prefix)
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    // Generate filename
    const timestamp = Date.now();
    const safeName = (name || 'image').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `${type}s/${userId || 'unknown'}-${safeName}-${timestamp}.png`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('images')
      .upload(filename, blob, {
        contentType: 'image/png',
        upsert: false
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(data.path);

    console.log(`Image saved to Supabase Storage: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) {
    console.warn('Failed to save to Supabase Storage, using original URL as fallback:', err);
  }
  // Fallback to original URL if provided (FAL.ai URLs are temporary but better than base64)
  // Base64 is huge and breaks localStorage/database storage
  return originalUrl || base64;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SpaceGame | null>(null);
  const onDockRef = useRef<(planet: Planet) => void>(() => {});
  const landingCallbacksRef = useRef<{
    onLand: (planet: Planet) => void;
    onTakeoff: () => void;
    onColonize: (planet: Planet) => void;
    onClaimRequest: (planet: Planet) => void;
    onOpenNotion: (url: string) => void;
    onTerraform: (planet: Planet) => void;
    onDestroyPlanet: (planet: Planet) => void;
  }>({
    onLand: () => {},
    onTakeoff: () => {},
    onColonize: () => {},
    onClaimRequest: () => {},
    onOpenNotion: () => {},
    onTerraform: () => {},
    onDestroyPlanet: () => {},
  });
  const [state, setState] = useState<SavedState>(loadState);
  const [customPlanets, setCustomPlanets] = useState<CustomPlanet[]>([]); // Loaded from Supabase
  const [teamPoints, setTeamPoints] = useState(0); // Loaded from Supabase via useMultiplayerSync
  const [gameReady, setGameReady] = useState(false); // Track when game is initialized
  const [personalPoints, setPersonalPoints] = useState(0);
  const [userShips, setUserShips] = useState<Record<string, UserShip>>({}); // Loaded from Supabase via teamPlayers
  const [mascotHistory, setMascotHistory] = useState<MascotHistoryEntry[]>([]); // Loaded from Supabase
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS as Goals); // Loaded from Supabase
  const [userPlanets, setUserPlanets] = useState<Record<string, UserPlanet>>({}); // Loaded from Supabase
  const [showTerraform, setShowTerraform] = useState(false);
  const [terraformPrompt, setTerraformPrompt] = useState('');
  const [viewingPlanetOwner, setViewingPlanetOwner] = useState<string | null>(null);
  const [viewingPlanetPreview, setViewingPlanetPreview] = useState<string | null>(null); // Preview image when browsing versions

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [showUserSelect, setShowUserSelect] = useState(!state.currentUser);
  const [showPlanetCreator, setShowPlanetCreator] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [shopTab, setShopTab] = useState<'stats' | 'cosmetics' | 'weapons'>('stats');
  const [isMuted, setIsMuted] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any | null>(null);
  const [landedPlanet, setLandedPlanet] = useState<Planet | null>(null);

  // Planet creator form state
  const [newPlanet, setNewPlanet] = useState<Partial<CustomPlanet>>({
    size: 'medium',
  });
  const [planetImageFile, setPlanetImageFile] = useState<File | null>(null);
  const [planetImagePreview, setPlanetImagePreview] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  // Notion task options for planet creator
  const [notionPriority, setNotionPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [notionAssignedTo, setNotionAssignedTo] = useState<string>('');
  const [notionTaskType, setNotionTaskType] = useState<'task' | 'bug' | 'feature'>('task');
  const [isCreatingPlanet, setIsCreatingPlanet] = useState(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    created: string[];
    updated: string[];
    deleted: string[];
    errors: string[];
    skipped: number;
  } | null>(null);
  const [showSyncDetails, setShowSyncDetails] = useState(false);

  // Admin panel state
  const [adminTab, setAdminTab] = useState<'goals' | 'players' | 'notion' | 'reset'>('goals');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerPointsInput, setPlayerPointsInput] = useState('');

  // Prompt configs (loaded from JSON)
  const [shipPrompts, setShipPrompts] = useState<ShipPrompts>(DEFAULT_SHIP_PROMPTS);
  const [planetPrompts, setPlanetPrompts] = useState<PlanetPrompts>(DEFAULT_PLANET_PROMPTS);

  // Multiplayer state
  const [pointToast, setPointToast] = useState<PointTx | null>(null);
  const positionBroadcastRef = useRef<number>(0);

  // Get local player ID (persisted in localStorage)
  const localPlayerId = useRef(getLocalPlayerId());

  // Team hook - auto-joins default team
  const {
    team,
    isLoading: isTeamLoading,
    error: teamError,
  } = useTeam();

  // Current user info for multiplayer
  const currentUserInfo = USERS.find(u => u.id === state.currentUser);
  const currentShipInfo = userShips[state.currentUser || ''] || {
    baseImage: '/ship-base.png',
    upgrades: [],
    currentImage: '/ship-base.png',
    effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false },
  };

  // Multiplayer sync hook - handles team state sync
  const {
    players: teamPlayers,
    teamPoints: syncedTeamPoints,
    personalPoints: syncedPersonalPoints,
    completedPlanets: syncedCompletedPlanets,
    recentTransactions,
    isConnected,
    updateTeamPoints: updateRemoteTeamPoints,
    updatePersonalPoints: updateRemotePersonalPoints,
    completePlanet: completeRemotePlanet,
    updatePlayerData,
    syncLocalState,
  } = useMultiplayerSync({
    teamId: team?.id || null,
    playerId: localPlayerId.current,
    username: state.currentUser || 'anonymous',
    displayName: currentUserInfo?.name || 'Anonymous',
    color: currentUserInfo?.color || '#ffa500',
    shipImage: currentShipInfo.currentImage,
    shipEffects: currentShipInfo.effects,
    shipUpgrades: currentShipInfo.upgrades,
    onTeamUpdate: (t) => {
      // Sync team state to local
      if (t.teamPoints !== teamPoints) {
        setTeamPoints(t.teamPoints);
      }
    },
    onPlayerJoined: (player) => {
      console.log('Player joined:', player.displayName);
    },
    onPlayerLeft: (playerId) => {
      console.log('Player left:', playerId);
    },
    onPointsEarned: (tx) => {
      // Show toast for points earned by other players
      setPointToast(tx);
      setTimeout(() => setPointToast(null), 4000);
    },
  });

  // Memoize player data for positions hook to prevent infinite loops
  const currentDbPlayerId = useMemo(() => {
    const found = teamPlayers.find(p => p.username === state.currentUser);
    console.log('[Player ID Lookup]', {
      currentUser: state.currentUser,
      teamPlayersUsernames: teamPlayers.map(p => ({ username: p.username, id: p.id, isOnline: p.isOnline })),
      foundPlayer: found ? { username: found.username, id: found.id } : null,
    });
    return found?.id || null;
  }, [teamPlayers, state.currentUser]);

  const playersForPositions = useMemo(() =>
    teamPlayers.map(p => ({
      id: p.id,
      username: p.username,
      displayName: p.displayName,
      color: p.color,
      shipImage: p.shipImage,
      shipEffects: p.shipEffects,
      shipLevel: p.shipLevel,
      isOnline: p.isOnline,
      planetImageUrl: p.planetImageUrl,
      planetTerraformCount: p.planetTerraformCount,
      planetSizeLevel: p.planetSizeLevel,
    })),
    [teamPlayers]
  );

  // Player positions hook - handles real-time ship positions
  const { otherPlayers, broadcastPosition, broadcastUpgradeState, setPositionUpdateCallback, setUpgradeUpdateCallback } = usePlayerPositions({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
    players: playersForPositions,
  });

  // Notion planets hook - fetches and syncs planets from Notion tasks
  const {
    gamePlanets: notionGamePlanets,
    completePlanet: completeNotionPlanet,
    claimPlanet: claimNotionPlanet,
  } = useNotionPlanets({
    teamId: team?.id || null,
  });

  // Supabase data hook - SINGLE SOURCE OF TRUTH for goals, custom planets, user planets, mascot history
  const {
    goals: supabaseGoals,
    customPlanets: supabaseCustomPlanets,
    userPlanets: supabaseUserPlanets,
    mascotHistory: supabaseMascotHistory,
    isLoading: isSupabaseLoading,
    saveGoals: saveGoalsToSupabase,
    saveCustomPlanets: saveCustomPlanetsToSupabase,
    saveUserPlanet: saveUserPlanetToSupabase,
    saveMascotHistory: saveMascotHistoryToSupabase,
    migrateFromLocalStorage,
  } = useSupabaseData({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
    username: state.currentUser || 'anonymous',
  });

  // Migration state
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);

  // Prompt history hook - tracks all AI generation prompts
  const { recordPrompt } = usePromptHistory({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
  });

  // Sync notion planets to game (store ref for immediate sync on game init)
  const notionPlanetsRef = useRef(notionGamePlanets);
  notionPlanetsRef.current = notionGamePlanets;

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.syncNotionPlanets(notionGamePlanets);
    }
  }, [notionGamePlanets]);

  // Set up direct position update callback (bypasses React state for smoother movement)
  // Uses refs to always call the latest game instance, avoiding stale closure issues
  const positionCallbackRef = useRef<((playerId: string, data: { x: number; y: number; vx: number; vy: number; rotation: number; thrusting: boolean; boosting: boolean; timestamp: number }) => void) | null>(null);
  const upgradeCallbackRef = useRef<((playerId: string, data: { isUpgrading: boolean; targetPlanetId: string | null }) => void) | null>(null);

  // Update callback refs when game is available
  useEffect(() => {
    positionCallbackRef.current = (playerId, data) => {
      gameRef.current?.onPlayerPositionUpdate(playerId, data);
    };
    upgradeCallbackRef.current = (playerId, data) => {
      if (data.isUpgrading) {
        gameRef.current?.setOtherPlayerUpgrading(playerId, data.targetPlanetId);
      } else {
        gameRef.current?.clearOtherPlayerUpgrading(playerId);
      }
    };
  }, []);

  // Register the callback wrappers with the hook (these stay stable)
  useEffect(() => {
    setPositionUpdateCallback((playerId, data) => {
      positionCallbackRef.current?.(playerId, data);
    });
    return () => {
      setPositionUpdateCallback(null);
    };
  }, [setPositionUpdateCallback]);

  useEffect(() => {
    setUpgradeUpdateCallback((playerId, data) => {
      upgradeCallbackRef.current?.(playerId, data);
    });
    return () => {
      setUpgradeUpdateCallback(null);
    };
  }, [setUpgradeUpdateCallback]);

  // Update game with other players (for metadata like ship images, effects, etc.)
  useEffect(() => {
    if (gameRef.current && otherPlayers.length > 0) {
      gameRef.current.setOtherPlayers(otherPlayers);
    }
  }, [otherPlayers]);

  // Broadcast position regularly when game is running
  useEffect(() => {
    console.log('[Broadcast Effect] team:', !!team, 'gameReady:', gameReady);
    if (!team || !gameReady) {
      console.log('[Broadcast Effect] Skipping - missing team or game not ready');
      return;
    }

    console.log('[Broadcast Effect] Starting broadcast loop');
    const broadcastLoop = () => {
      if (gameRef.current) {
        // Get fresh ship state directly from game (not stale React state)
        const shipState = gameRef.current.getShipState();
        broadcastPosition(shipState);
      }
      positionBroadcastRef.current = requestAnimationFrame(broadcastLoop);
    };

    positionBroadcastRef.current = requestAnimationFrame(broadcastLoop);

    return () => {
      if (positionBroadcastRef.current) {
        cancelAnimationFrame(positionBroadcastRef.current);
      }
    };
  }, [team, gameReady, broadcastPosition]);

  // Sync local state to team when team is joined
  useEffect(() => {
    if (team && state.completedPlanets.length > 0) {
      syncLocalState(state.completedPlanets, customPlanets, goals);
    }
  }, [team?.id]);

  // Sync personal points from multiplayer hook
  useEffect(() => {
    if (syncedPersonalPoints !== undefined) {
      setPersonalPoints(syncedPersonalPoints);
    }
  }, [syncedPersonalPoints]);

  // Load prompts from JSON files on mount
  useEffect(() => {
    fetch('/prompts/ship.json')
      .then(res => res.json())
      .then(data => setShipPrompts(data))
      .catch(err => console.warn('Failed to load ship prompts, using defaults:', err));

    fetch('/prompts/planet.json')
      .then(res => res.json())
      .then(data => setPlanetPrompts(data))
      .catch(err => console.warn('Failed to load planet prompts, using defaults:', err));
  }, []);

  // Save state when it changes
  // Save currentUser to sessionStorage (this is the only thing in localStorage now)
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Sync userShips from teamPlayers (Supabase is the source of truth)
  useEffect(() => {
    if (teamPlayers.length === 0) return;

    const shipsFromSupabase: Record<string, UserShip> = {};
    for (const player of teamPlayers) {
      if (player.shipImage) {
        shipsFromSupabase[player.username] = {
          baseImage: player.shipImage,
          currentImage: player.shipImage,
          upgrades: [], // Upgrade count is tracked via shipLevel
          effects: player.shipEffects || {
            glowColor: null,
            trailType: 'default',
            sizeBonus: 0,
            speedBonus: 0,
            landingSpeedBonus: 0,
            ownedGlows: [],
            ownedTrails: [],
            hasDestroyCanon: false,
            destroyCanonEquipped: false,
          },
        };
      }
    }

    // Merge with local state (local state may have pending changes)
    setUserShips(prev => {
      const merged = { ...shipsFromSupabase };
      // Keep any local ships that aren't in Supabase yet
      for (const [userId, ship] of Object.entries(prev)) {
        if (!merged[userId] && ship.currentImage) {
          merged[userId] = ship;
        }
      }
      return merged;
    });
  }, [teamPlayers]);

  // Sync data FROM Supabase to local state when it loads/changes
  useEffect(() => {
    if (!isSupabaseLoading && supabaseGoals) {
      setGoals(supabaseGoals);
    }
  }, [supabaseGoals, isSupabaseLoading]);

  useEffect(() => {
    if (!isSupabaseLoading && supabaseCustomPlanets) {
      setCustomPlanets(supabaseCustomPlanets);
    }
  }, [supabaseCustomPlanets, isSupabaseLoading]);

  useEffect(() => {
    if (!isSupabaseLoading && supabaseUserPlanets) {
      setUserPlanets(supabaseUserPlanets);
    }
  }, [supabaseUserPlanets, isSupabaseLoading]);

  useEffect(() => {
    if (!isSupabaseLoading && supabaseMascotHistory) {
      setMascotHistory(supabaseMascotHistory);
    }
  }, [supabaseMascotHistory, isSupabaseLoading]);

  // Reset Points (local + Supabase)
  const resetPoints = async () => {
    if (!confirm('Reset all points and transaction history? This cannot be undone!')) return;

    try {
      // Reset Supabase
      if (team?.id) {
        // Delete all point transactions for this team
        await supabase
          .from('point_transactions')
          .delete()
          .eq('team_id', team.id);

        // Reset team points to 0
        await supabase
          .from('teams')
          .update({ team_points: 0 })
          .eq('id', team.id);
      }

      // Reset local state
      localStorage.removeItem(TEAM_POINTS_KEY);
      setTeamPoints(0);

      alert('Points have been reset!');
    } catch (err) {
      console.error('Failed to reset points:', err);
      alert('Failed to reset points. Check console for details.');
    }
  };

  // Reset Ship Upgrades (local + Supabase)
  const resetShipUpgrades = async () => {
    if (!confirm('Reset all ship upgrades for all players? This cannot be undone!')) return;

    try {
      // Reset Supabase - all players in this team
      if (team?.id) {
        await supabase
          .from('players')
          .update({
            ship_current_image: '/ship-base.png',
            ship_effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false },
            ship_upgrades: [],
          })
          .eq('team_id', team.id);
      }

      // Reset local state
      localStorage.removeItem(USER_SHIPS_KEY);
      localStorage.removeItem(MASCOT_HISTORY_KEY);
      setUserShips({});
      setMascotHistory([]);
      setState(prev => ({
        ...prev,
        robotImage: '/ship-base.png',
        robotDescription: 'A small friendly spaceship',
        upgradeCount: 0,
      }));

      alert('Ship upgrades have been reset!');
    } catch (err) {
      console.error('Failed to reset ship upgrades:', err);
      alert('Failed to reset ship upgrades. Check console for details.');
    }
  };

  // Reset Planet Progress (completed planets - local + Supabase)
  const resetPlanetProgress = async () => {
    if (!confirm('Reset all planet completion progress? This cannot be undone!')) return;

    try {
      // Reset Supabase
      if (team?.id) {
        await supabase
          .from('teams')
          .update({ completed_planets: [] })
          .eq('id', team.id);
      }

      // Reset local state
      setState(prev => ({ ...prev, completedPlanets: [] }));

      alert('Planet progress has been reset!');
    } catch (err) {
      console.error('Failed to reset planet progress:', err);
      alert('Failed to reset planet progress. Check console for details.');
    }
  };

  // Reset Planet Upgrades (terraform levels - local + Supabase)
  const resetPlanetUpgrades = async () => {
    if (!confirm('Reset all planet upgrades (terraform levels) for all players? This cannot be undone!')) return;

    try {
      // Reset Supabase - all players in this team
      if (team?.id) {
        await supabase
          .from('players')
          .update({
            planet_image_url: null,
            planet_terraform_count: 0,
            planet_size_level: 0,
          })
          .eq('team_id', team.id);
      }

      // Reset local state
      localStorage.removeItem(USER_PLANETS_KEY);
      setUserPlanets({});

      alert('Planet upgrades have been reset!');
    } catch (err) {
      console.error('Failed to reset planet upgrades:', err);
      alert('Failed to reset planet upgrades. Check console for details.');
    }
  };

  // Reset Custom Planets (local only)
  const resetCustomPlanets = () => {
    if (!confirm('Delete all custom planets? This cannot be undone!')) return;

    localStorage.removeItem(CUSTOM_PLANETS_KEY);
    setCustomPlanets([]);

    alert('Custom planets have been deleted!');
  };

  // Reset Goals (local only)
  const resetGoals = () => {
    if (!confirm('Reset all goals to defaults? This cannot be undone!')) return;

    localStorage.removeItem(GOALS_KEY);
    setGoals(DEFAULT_GOALS as Goals);

    alert('Goals have been reset to defaults!');
  };

  // Reset everything (all of the above)
  const resetEverything = async () => {
    if (!confirm('Are you sure you want to reset EVERYTHING? This cannot be undone!')) return;

    try {
      // Reset Supabase
      if (team?.id) {
        // Delete all point transactions
        await supabase
          .from('point_transactions')
          .delete()
          .eq('team_id', team.id);

        // Reset team data
        await supabase
          .from('teams')
          .update({
            team_points: 0,
            completed_planets: [],
          })
          .eq('id', team.id);

        // Reset all players
        await supabase
          .from('players')
          .update({
            ship_current_image: '/ship-base.png',
            ship_effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false },
            ship_upgrades: [],
            planet_image_url: null,
            planet_terraform_count: 0,
            planet_size_level: 0,
          })
          .eq('team_id', team.id);
      }

      // Reset all local storage
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CUSTOM_PLANETS_KEY);
      localStorage.removeItem(TEAM_POINTS_KEY);
      localStorage.removeItem(USER_SHIPS_KEY);
      localStorage.removeItem(MASCOT_HISTORY_KEY);
      localStorage.removeItem(GOALS_KEY);
      localStorage.removeItem(USER_PLANETS_KEY);

      // Reset all state
      setState({ completedPlanets: [], robotImage: '/ship-base.png', robotDescription: 'A small friendly spaceship', upgradeCount: 0 });
      setCustomPlanets([]);
      setTeamPoints(0);
      setUserShips({});
      setMascotHistory([]);
      setGoals(DEFAULT_GOALS as Goals);
      setUserPlanets({});
      setShowSettings(false);
      setShowWelcome(true);
      setShowUserSelect(true);

      alert('Everything has been reset!');
    } catch (err) {
      console.error('Failed to reset everything:', err);
      alert('Failed to reset everything. Check console for details.');
    }
  };

  // ============ Individual Player Management Functions ============

  // Set player's points to a specific value
  const setPlayerPoints = async (playerId: string, points: number) => {
    if (!team?.id) return;

    try {
      const player = teamPlayers.find(p => p.id === playerId);
      if (!player) return;

      // Update player's personal_points in Supabase
      await supabase
        .from('players')
        .update({ personal_points: points })
        .eq('id', playerId);

      // Log as a manual adjustment transaction
      const adjustment = points - player.personalPoints;
      if (adjustment !== 0) {
        await supabase.from('point_transactions').insert({
          team_id: team.id,
          player_id: playerId,
          source: 'manual',
          points: adjustment,
          point_type: 'personal',
          task_name: `Admin adjustment: set to ${points}`,
        });
      }

      alert(`${player.displayName}'s points set to ${points}`);
    } catch (err) {
      console.error('Failed to set player points:', err);
      alert('Failed to set player points. Check console for details.');
    }
  };

  // Reset individual player's points to 0
  const resetPlayerPoints = async (playerId: string) => {
    if (!confirm('Reset this player\'s points to 0?')) return;

    const player = teamPlayers.find(p => p.id === playerId);
    if (!player) return;

    await setPlayerPoints(playerId, 0);
  };

  // Reset individual player's ship
  const resetPlayerShip = async (playerId: string) => {
    if (!confirm('Reset this player\'s ship to default?')) return;

    try {
      const player = teamPlayers.find(p => p.id === playerId);
      if (!player) return;

      await supabase
        .from('players')
        .update({
          ship_current_image: '/ship-base.png',
          ship_effects: {
            glowColor: null,
            trailType: 'default',
            sizeBonus: 0,
            speedBonus: 0,
            landingSpeedBonus: 0,
            ownedGlows: [],
            ownedTrails: [],
            hasDestroyCanon: false,
            destroyCanonEquipped: false,
          },
          ship_upgrades: [],
        })
        .eq('id', playerId);

      // If it's the current user, also reset local state
      if (player.username === state.currentUser) {
        setUserShips(prev => {
          const updated = { ...prev };
          delete updated[player.username];
          return updated;
        });
        setState(prev => ({
          ...prev,
          robotImage: '/ship-base.png',
          robotDescription: 'A small friendly spaceship',
          upgradeCount: 0,
        }));
      }

      alert(`${player.displayName}'s ship has been reset!`);
    } catch (err) {
      console.error('Failed to reset player ship:', err);
      alert('Failed to reset player ship. Check console for details.');
    }
  };

  // Reset individual player's planet
  const resetPlayerPlanet = async (playerId: string) => {
    if (!confirm('Reset this player\'s planet? This will remove their terraforming progress.')) return;

    try {
      const player = teamPlayers.find(p => p.id === playerId);
      if (!player) return;

      await supabase
        .from('players')
        .update({
          planet_image_url: null,
          planet_terraform_count: 0,
          planet_size_level: 0,
          planet_history: [],
        })
        .eq('id', playerId);

      // If it's the current user, also reset local state
      if (player.username === state.currentUser) {
        setUserPlanets(prev => {
          const updated = { ...prev };
          delete updated[player.username];
          return updated;
        });
      }

      alert(`${player.displayName}'s planet has been reset!`);
    } catch (err) {
      console.error('Failed to reset player planet:', err);
      alert('Failed to reset player planet. Check console for details.');
    }
  };

  // Reset individual player's everything
  const resetPlayerAll = async (playerId: string) => {
    if (!confirm('Reset ALL data for this player (points, ship, planet)?')) return;

    try {
      const player = teamPlayers.find(p => p.id === playerId);
      if (!player) return;

      // Delete player's point transactions
      await supabase
        .from('point_transactions')
        .delete()
        .eq('player_id', playerId);

      // Reset all player data
      await supabase
        .from('players')
        .update({
          personal_points: 0,
          ship_current_image: '/ship-base.png',
          ship_effects: {
            glowColor: null,
            trailType: 'default',
            sizeBonus: 0,
            speedBonus: 0,
            landingSpeedBonus: 0,
            ownedGlows: [],
            ownedTrails: [],
            hasDestroyCanon: false,
            destroyCanonEquipped: false,
          },
          ship_upgrades: [],
          planet_image_url: null,
          planet_terraform_count: 0,
          planet_size_level: 0,
          planet_history: [],
        })
        .eq('id', playerId);

      // If it's the current user, also reset local state
      if (player.username === state.currentUser) {
        setUserShips(prev => {
          const updated = { ...prev };
          delete updated[player.username];
          return updated;
        });
        setUserPlanets(prev => {
          const updated = { ...prev };
          delete updated[player.username];
          return updated;
        });
        setState(prev => ({
          ...prev,
          robotImage: '/ship-base.png',
          robotDescription: 'A small friendly spaceship',
          upgradeCount: 0,
        }));
      }

      alert(`${player.displayName}'s data has been completely reset!`);
    } catch (err) {
      console.error('Failed to reset player:', err);
      alert('Failed to reset player. Check console for details.');
    }
  };

  // ============ End Individual Player Management Functions ============

  // Sync with Notion (admin only)
  const syncWithNotion = async () => {
    setIsSyncingNotion(true);
    setSyncResult(null);

    try {
      const { data: result, error } = await supabase.functions.invoke('notion-sync', {
        body: {},
      });

      if (error) {
        console.error('Notion sync failed:', error);
        setSyncResult({
          created: [],
          updated: [],
          deleted: [],
          errors: [error.message || 'Unknown error'],
          skipped: 0,
        });
      } else {
        console.log('Notion sync result:', result);
        setSyncResult({
          created: result.created || [],
          updated: result.updated || [],
          deleted: result.deleted || [],
          errors: result.errors || [],
          skipped: result.summary?.skipped || 0,
        });
        setShowSyncDetails(true);
      }
    } catch (err) {
      console.error('Notion sync error:', err);
      alert('Sync failed: Network error');
    } finally {
      setIsSyncingNotion(false);
    }
  };

  // Update a goal (saves to Supabase)
  const updateGoal = (type: 'business' | 'product' | 'achievement', goalId: string, updates: Partial<Goal>) => {
    const newGoals = {
      ...goals,
      [type]: goals[type].map(g => g.id === goalId ? { ...g, ...updates } : g)
    };
    setGoals(newGoals);
    saveGoalsToSupabase(newGoals);
  };

  // Add a new goal (saves to Supabase)
  const addGoal = (type: 'business' | 'product' | 'achievement') => {
    const newId = `${type[0]}${Date.now()}`;
    const newGoal: Goal = {
      id: newId,
      name: 'New Goal',
      size: 'medium',
      description: 'Description here',
    };
    const newGoals = {
      ...goals,
      [type]: [...goals[type], newGoal]
    };
    setGoals(newGoals);
    saveGoalsToSupabase(newGoals);
    setEditingGoal({ ...newGoal, type });
  };

  // Delete a goal (saves to Supabase)
  const deleteGoal = (type: 'business' | 'product' | 'achievement', goalId: string) => {
    if (!confirm('Delete this goal?')) return;
    const newGoals = {
      ...goals,
      [type]: goals[type].filter(g => g.id !== goalId)
    };
    setGoals(newGoals);
    saveGoalsToSupabase(newGoals);
  };

  // Generate base planet (for first-time setup)
  const generateBasePlanet = async () => {
    if (personalPoints < 25) return;

    const userId = state.currentUser || 'default';
    const userColor = USERS.find(u => u.id === userId)?.color || '#ffa500';
    const planetId = `user-planet-${userId}`;

    // Close modal immediately
    setShowTerraform(false);
    gameRef.current?.clearLandedState();
    setIsUpgrading(true);
    setUpgradeMessage('Creating your planet...');
    gameRef.current?.startUpgradeAnimation(planetId);
    broadcastUpgradeState(true, planetId);

    try {
      const config = planetPrompts.basePlanet;
      const prompt = config.prompt.replace('{userColor}', userColor);
      const apiEndpoint = config.api || 'fal-ai/nano-banana';

      const response = await fetch(`https://fal.run/${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          num_images: config.settings.num_images || 1,
          aspect_ratio: config.settings.aspect_ratio || '1:1',
          output_format: config.settings.output_format || 'png'
        })
      });

      const data = await response.json();
      let newImageUrl = data.images?.[0]?.url;

      if (newImageUrl) {
        setUpgradeMessage('Removing background...');
        const bgResponse = await fetch('https://fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image_url: newImageUrl })
        });
        const bgData = await bgResponse.json();
        const bgRemovedUrl = bgData.image?.url || newImageUrl;

        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(bgRemovedUrl);
        newImageUrl = await saveImageToStorage(base64Image, 'planet', userId, 'base', bgRemovedUrl);

        // Deduct personal points and sync to backend
        setPersonalPoints(prev => prev - 25);
        updateRemotePersonalPoints(-25);

        setUserPlanets(prev => ({
          ...prev,
          [userId]: {
            imageUrl: newImageUrl,
            baseImage: newImageUrl, // Store base for reverting later
            terraformCount: 0,
            history: [],
            sizeLevel: 0,
          }
        }));

        gameRef.current?.updateUserPlanetImage(userId, newImageUrl, 0, 0);

        // Sync planet to backend for multiplayer
        updatePlayerData({
          planet_image_url: newImageUrl,
          planet_terraform_count: 0,
          planet_size_level: 0,
        });

        // Record prompt for history
        recordPrompt({
          promptType: 'planet_base',
          promptText: prompt,
          userInput: userColor,
          apiUsed: apiEndpoint,
          resultImageUrl: newImageUrl,
        });
      }

      setIsUpgrading(false);
      gameRef.current?.stopUpgradeAnimation();
      broadcastUpgradeState(false);
    } catch (error) {
      console.error('Failed to generate base planet:', error);
      setUpgradeMessage('Generation failed');
      setTimeout(() => {
        setIsUpgrading(false);
        gameRef.current?.stopUpgradeAnimation();
        broadcastUpgradeState(false);
      }, 1500);
    }
  };

  // Terraform planet
  const terraformPlanet = async () => {
    if (!terraformPrompt || personalPoints < 50) return;

    const userId = state.currentUser || 'default';
    const currentPlanet = getUserPlanet(userId);
    const promptText = terraformPrompt; // Save before clearing
    const planetId = `user-planet-${userId}`;

    // Close modal immediately
    setShowTerraform(false);
    gameRef.current?.clearLandedState();
    setTerraformPrompt('');
    setIsUpgrading(true);
    setUpgradeMessage('Terraforming planet...');
    gameRef.current?.startUpgradeAnimation(planetId);
    broadcastUpgradeState(true, planetId);

    try {
      // Get current planet image
      const imageBase64 = await getImageAsBase64(currentPlanet.imageUrl);
      const config = planetPrompts.terraform;
      const prompt = config.prompt.replace('{userInput}', promptText);
      const apiEndpoint = config.api || 'fal-ai/nano-banana/edit';

      console.log('Terraforming with prompt:', prompt);

      const response = await fetch(`https://fal.run/${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_urls: [imageBase64],
          prompt: prompt,
          num_images: config.settings.num_images || 1,
          aspect_ratio: config.settings.aspect_ratio || '1:1',
          output_format: config.settings.output_format || 'png'
        })
      });

      const data = await response.json();
      let newImageUrl = data.images?.[0]?.url;

      if (newImageUrl) {
        // Remove background
        setUpgradeMessage('Removing background...');
        const bgResponse = await fetch('https://fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image_url: newImageUrl })
        });
        const bgData = await bgResponse.json();
        const bgRemovedUrl = bgData.image?.url || newImageUrl;

        // Save locally
        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(bgRemovedUrl);
        newImageUrl = await saveImageToStorage(base64Image, 'planet', userId, 'terraform', bgRemovedUrl);

        // Deduct personal points and sync to backend
        setPersonalPoints(prev => prev - 50);
        updateRemotePersonalPoints(-50);

        // Update user's planet
        const newTerraformCount = currentPlanet.terraformCount + 1;
        setUserPlanets(prev => ({
          ...prev,
          [userId]: {
            imageUrl: newImageUrl,
            terraformCount: newTerraformCount,
            history: [...currentPlanet.history, {
              imageUrl: newImageUrl,
              description: promptText,
              timestamp: Date.now(),
            }],
            sizeLevel: currentPlanet.sizeLevel,
          }
        }));

        // Update in game (with new size)
        gameRef.current?.updateUserPlanetImage(userId, newImageUrl, newTerraformCount, currentPlanet.sizeLevel);
        soundManager.playPlanetUpgrade();

        // Sync planet to backend for multiplayer
        updatePlayerData({
          planet_image_url: newImageUrl,
          planet_terraform_count: newTerraformCount,
        });

        // Record prompt for history
        recordPrompt({
          promptType: 'planet_terraform',
          promptText: prompt,
          userInput: promptText,
          apiUsed: apiEndpoint,
          sourceImageUrl: currentPlanet.imageUrl,
          resultImageUrl: newImageUrl,
        });
      }

      setIsUpgrading(false);
      gameRef.current?.stopUpgradeAnimation();
      broadcastUpgradeState(false);
    } catch (error) {
      console.error('Failed to terraform:', error);
      setUpgradeMessage('Terraform failed');
      setTimeout(() => {
        setIsUpgrading(false);
        gameRef.current?.stopUpgradeAnimation();
        broadcastUpgradeState(false);
      }, 1500);
    }
  };

  // Download an image
  const downloadImage = (imageUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get current user's ship
  const getCurrentUserShip = (): UserShip => {
    const userId = state.currentUser || 'default';
    return userShips[userId] || {
      baseImage: '/ship-base.png',
      upgrades: [],
      currentImage: '/ship-base.png',
      effects: { glowColor: null, trailType: 'default', sizeBonus: 0 },
    };
  };

  // Get a user's planet (checks local state first, then teamPlayers for multiplayer data)
  const getUserPlanet = (userId: string): UserPlanet => {
    // First check local userPlanets (your own data with full history)
    const planet = userPlanets[userId];
    if (planet?.imageUrl) {
      return {
        imageUrl: planet.imageUrl,
        baseImage: planet.baseImage,
        terraformCount: planet.terraformCount || 0,
        history: planet.history || [],
        sizeLevel: planet.sizeLevel || 0,
      };
    }

    // For other players, check teamPlayers (synced from Supabase, no history)
    const teamPlayer = teamPlayers.find(p => p.username === userId);
    if (teamPlayer?.planetImageUrl) {
      return {
        imageUrl: teamPlayer.planetImageUrl,
        baseImage: undefined, // Not synced via multiplayer
        terraformCount: teamPlayer.planetTerraformCount || 0,
        history: [], // Not synced via multiplayer
        sizeLevel: teamPlayer.planetSizeLevel || 0,
      };
    }

    // Default empty planet
    return {
      imageUrl: DEFAULT_PLANET_IMAGE,
      baseImage: undefined,
      terraformCount: 0,
      history: [],
      sizeLevel: 0,
    };
  };

  // Calculate planet population (vanity metric)
  // Population starts after 3 terraformings, grows with each terraform and size upgrade
  const getPlanetPopulation = (terraformCount: number, sizeLevel: number): number => {
    if (terraformCount < 3) return 0;

    // Base population after 3 terraforms
    const basePop = 100;
    // Each terraform after 3 multiplies population
    const terraformMultiplier = Math.pow(2.5, terraformCount - 3);
    // Each size level adds significant population
    const sizeMultiplier = Math.pow(3, sizeLevel);

    const population = Math.floor(basePop * terraformMultiplier * sizeMultiplier);
    return population;
  };

  // Format population number with commas
  const formatPopulation = (pop: number): string => {
    return pop.toLocaleString();
  };

  // Select a planet image from history
  const selectPlanetFromHistory = (userId: string, imageUrl: string) => {
    const currentPlanet = getUserPlanet(userId);
    setUserPlanets(prev => ({
      ...prev,
      [userId]: {
        ...currentPlanet,
        imageUrl,
      }
    }));
    gameRef.current?.updateUserPlanetImage(userId, imageUrl);
    soundManager.playUIClick();
  };

  // Buy planet size upgrade (max 5 levels)
  const buyPlanetSizeUpgrade = () => {
    const userId = state.currentUser || '';
    const currentPlanet = getUserPlanet(userId);
    const currentLevel = currentPlanet.sizeLevel;

    if (currentLevel >= 5) return;
    const cost = PLANET_SIZE_COSTS[currentLevel];
    if (personalPoints < cost) return;

    const newLevel = currentLevel + 1;
    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - cost);
    updateRemotePersonalPoints(-cost);
    setUserPlanets(prev => ({
      ...prev,
      [userId]: {
        ...currentPlanet,
        sizeLevel: newLevel,
      }
    }));
    gameRef.current?.updateUserPlanetSize(userId, newLevel);
    soundManager.playPlanetUpgrade();

    // Sync planet size to backend for multiplayer
    updatePlayerData({ planet_size_level: newLevel });
  };

  // Fire confetti based on size
  const fireConfetti = (size: 'small' | 'medium' | 'big') => {
    const base = { origin: { y: 0.7 } };
    if (size === 'small') {
      confetti({ ...base, particleCount: 30, spread: 50 });
    } else if (size === 'medium') {
      confetti({ ...base, particleCount: 70, spread: 80 });
    } else {
      confetti({ ...base, particleCount: 100, spread: 100 });
      setTimeout(() => {
        confetti({ ...base, particleCount: 50, spread: 120, origin: { x: 0.25, y: 0.7 } });
        confetti({ ...base, particleCount: 50, spread: 120, origin: { x: 0.75, y: 0.7 } });
      }, 200);
    }
  };

  // Handle docking at a planet
  const handleDock = useCallback((planet: Planet) => {
    // Check if this is the Shop planet
    if (planet.id === 'shop-station') {
      setShowShop(true);
      return;
    }

    // Check if this is the Planet Builder
    if (planet.id === 'planet-builder') {
      setShowPlanetCreator(true);
      return;
    }

    // Check if this is a user's personal planet
    if (planet.id.startsWith('user-planet-')) {
      const planetOwnerId = planet.id.replace('user-planet-', '');
      if (planetOwnerId === state.currentUser) {
        // Your own planet - can terraform
        setShowTerraform(true);
      } else {
        // Someone else's planet - view only
        setViewingPlanetOwner(planetOwnerId);
      }
      return;
    }

    // Check if this is a Notion planet
    if (planet.id.startsWith('notion-')) {
      if (planet.completed) return;

      // Open Notion URL if available
      if (planet.notionUrl) {
        window.open(planet.notionUrl, '_blank');
      }

      fireConfetti(planet.size);
      soundManager.playDockingSound();

      // Mark as completed in database - backend awards points to assigned player
      completeNotionPlanet(planet.id);

      gameRef.current?.completePlanet(planet.id);
      return;
    }

    if (state.completedPlanets.includes(planet.id)) return;

    fireConfetti(planet.size);

    // Sound: docking celebration
    soundManager.playDockingSound();

    // Award team points
    const pointsEarned = POINTS_PER_SIZE[planet.size];
    setTeamPoints(prev => prev + pointsEarned);

    setState(prev => ({
      ...prev,
      completedPlanets: [...prev.completedPlanets, planet.id],
      upgradeCount: prev.upgradeCount + 1,
    }));

    gameRef.current?.completePlanet(planet.id);

    // Sync to multiplayer (if connected)
    if (team) {
      completeRemotePlanet(planet.id, pointsEarned);
    }

  }, [state.completedPlanets, state.currentUser, team, completeRemotePlanet, completeNotionPlanet, updateRemotePersonalPoints]);

  // Keep the ref updated with latest handleDock
  useEffect(() => {
    onDockRef.current = handleDock;
  }, [handleDock]);

  // Stable callback that uses the ref
  const stableOnDock = useCallback((planet: Planet) => {
    onDockRef.current(planet);
  }, []);

  // Handle landing on a planet (new system - shows details panel)
  const handleLand = useCallback((planet: Planet) => {
    // Special station planets open modals instead of showing landed panel
    if (planet.id === 'shop-station') {
      setShowShop(true);
      return;
    }
    if (planet.id === 'planet-builder') {
      setShowPlanetCreator(true);
      return;
    }
    // User planets open terraform modal
    if (planet.id.startsWith('user-planet-')) {
      const planetOwnerId = planet.id.replace('user-planet-', '');
      if (planetOwnerId === state.currentUser) {
        setShowTerraform(true);
      } else {
        setViewingPlanetOwner(planetOwnerId);
      }
      return;
    }

    // For all other planets, show the landed panel
    setLandedPlanet(planet);
  }, [state.currentUser]);

  // Handle takeoff from a planet
  const handleTakeoff = useCallback(() => {
    setLandedPlanet(null);
  }, []);

  // Handle colonizing a planet (completing it) or claiming an unassigned mission
  const handleColonize = useCallback(async (planet: Planet) => {
    if (planet.completed) return;

    // Special planets cannot be completed
    const specialPlanets = ['shop-station', 'planet-builder'];
    if (specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-')) {
      return;
    }

    // Handle Notion planets
    if (planet.id.startsWith('notion-')) {
      // Check if unassigned - then CLAIM instead of complete
      if ((!planet.ownerId || planet.ownerId === '') && state.currentUser) {
        // Claim the mission (moves it to player's zone)
        const success = await claimNotionPlanet(planet.id, state.currentUser);
        if (success) {
          soundManager.playDockingSound();
          // Planet will be updated via realtime subscription
          setLandedPlanet(null);
        }
        return;
      }

      // Already assigned - complete it
      fireConfetti(planet.size);
      soundManager.playDockingSound();

      // Mark as completed in database - backend awards points to assigned player
      completeNotionPlanet(planet.id);

      gameRef.current?.completePlanet(planet.id);

      // Archive the task in Notion (fire and forget)
      const actualId = planet.id.replace('notion-', '');
      supabase.functions.invoke('notion-update-status', {
        body: { planet_id: actualId, action: 'archive' },
      }).catch(err => console.error('Failed to archive in Notion:', err));
    } else {
      // Regular planets
      if (state.completedPlanets.includes(planet.id)) return;

      fireConfetti(planet.size);
      soundManager.playDockingSound();

      const pointsEarned = POINTS_PER_SIZE[planet.size];
      setTeamPoints(prev => prev + pointsEarned);

      setState(prev => ({
        ...prev,
        completedPlanets: [...prev.completedPlanets, planet.id],
        upgradeCount: prev.upgradeCount + 1,
      }));

      gameRef.current?.completePlanet(planet.id);

      if (team) {
        completeRemotePlanet(planet.id, pointsEarned);
      }
    }

    // Clear landed state after colonizing
    setLandedPlanet(null);
  }, [state.completedPlanets, state.currentUser, team, completeRemotePlanet, completeNotionPlanet, claimNotionPlanet, updateRemotePersonalPoints]);

  // Handle claim request - called when user wants to claim an unassigned planet
  // Starts animation IMMEDIATELY, then calls API in parallel
  const handleClaimRequest = useCallback(async (planet: Planet) => {
    if (!state.currentUser) return;

    console.log('[ClaimRequest] Starting claim for planet:', planet.id, 'at position:', planet.x, planet.y);

    // Start animation immediately for instant feedback
    gameRef.current?.startClaimAnimation(planet);
    setLandedPlanet(null);

    // Call API in parallel - animation will wait during charging phase if needed
    const newPosition = await claimNotionPlanet(planet.id, state.currentUser);

    console.log('[ClaimRequest] API returned:', newPosition);

    if (newPosition) {
      // Set the actual target position - animation will proceed to movement phase
      gameRef.current?.setClaimTarget(newPosition.x, newPosition.y);
    } else {
      // API failed - cancel the animation
      console.error('Failed to claim planet');
      gameRef.current?.cancelClaimAnimation();
    }
  }, [state.currentUser, claimNotionPlanet]);

  // Handle opening Notion URL
  const handleOpenNotion = useCallback((url: string) => {
    window.open(url, '_blank');
  }, []);

  // Handle terraforming a user planet
  const handleTerraform = useCallback((planet: Planet) => {
    if (!planet.id.startsWith('user-planet-')) return;

    const planetOwnerId = planet.id.replace('user-planet-', '');
    if (planetOwnerId === state.currentUser) {
      // Your own planet - can terraform
      setShowTerraform(true);
      setLandedPlanet(null); // Close landed panel when opening terraform modal
    } else {
      // Someone else's planet - view only
      setViewingPlanetOwner(planetOwnerId);
      setLandedPlanet(null);
    }
  }, [state.currentUser]);

  // Handle destroying a completed planet (cleanup feature)
  const handleDestroyPlanet = useCallback(async (planet: Planet) => {
    if (!planet.completed) return;

    // Special planets cannot be destroyed
    const specialPlanets = ['shop-station', 'planet-builder'];
    if (specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-')) {
      return;
    }

    // Clear landed state
    setLandedPlanet(null);

    // Handle Notion planets - mark as destroyed in Notion and delete from our DB
    if (planet.id.startsWith('notion-')) {
      const actualId = planet.id.replace('notion-', '');
      try {
        const { data, error } = await supabase.functions.invoke('notion-update-status', {
          body: { planet_id: actualId, action: 'destroy' },
        });

        if (error) {
          console.error('Failed to destroy planet:', error);
        } else {
          console.log(`Destroyed planet: ${data?.planet_name}`);
        }
      } catch (err) {
        console.error('Error destroying planet:', err);
      }
      return;
    }

    // Handle custom planets - remove from local state and save to Supabase
    const newCustomPlanets = customPlanets.filter(p => p.id !== planet.id);
    setCustomPlanets(newCustomPlanets);
    saveCustomPlanetsToSupabase(newCustomPlanets);

    // Remove from completed planets
    setState(prev => ({
      ...prev,
      completedPlanets: prev.completedPlanets.filter(id => id !== planet.id),
    }));
  }, [customPlanets, saveCustomPlanetsToSupabase]);

  // Keep landing callbacks ref updated
  useEffect(() => {
    landingCallbacksRef.current = {
      onLand: handleLand,
      onTakeoff: handleTakeoff,
      onColonize: handleColonize,
      onClaimRequest: handleClaimRequest,
      onOpenNotion: handleOpenNotion,
      onTerraform: handleTerraform,
      onDestroyPlanet: handleDestroyPlanet,
    };
  }, [handleLand, handleTakeoff, handleColonize, handleClaimRequest, handleOpenNotion, handleTerraform, handleDestroyPlanet]);

  // Close all modals with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUpgrading) {
        const isGameLanded = gameRef.current?.isPlayerLanded();
        const hasOpenModal = editingGoal || showSettings || showTerraform ||
          viewingPlanetOwner || showShop || showPlanetCreator || landedPlanet || isGameLanded;

        if (hasOpenModal) {
          e.preventDefault();
          // Close everything at once
          setEditingGoal(null);
          setShowSettings(false);
          setShowTerraform(false);
          setViewingPlanetOwner(null);
          setShowShop(false);
          setShowPlanetCreator(false);
          setLandedPlanet(null);
          // Also clear SpaceGame's internal landed state
          gameRef.current?.clearLandedState();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTerraform, viewingPlanetOwner, showShop, showPlanetCreator, showSettings, editingGoal, landedPlanet, isUpgrading]);

  // Buy visual upgrade from shop (AI-generated changes to ship appearance)
  const buyVisualUpgrade = async () => {
    if (personalPoints < VISUAL_UPGRADE_COST) return;

    if (!upgradePrompt) {
      alert('Please describe how you want to modify your vessel!');
      return;
    }

    const promptText = upgradePrompt; // Save before clearing

    // Close modal immediately
    setShowShop(false);
    gameRef.current?.clearLandedState();
    setUpgradePrompt('');
    setIsUpgrading(true);
    setUpgradeMessage('Modifying your vessel...');
    gameRef.current?.startUpgradeAnimation();
    broadcastUpgradeState(true, null); // null = ship upgrade

    try {
      const currentShip = getCurrentUserShip();
      const imageBase64 = await getImageAsBase64(currentShip.currentImage);

      const config = shipPrompts.visualUpgrade;
      const prompt = config.prompt.replace('{userInput}', promptText);
      const apiEndpoint = config.api || 'fal-ai/nano-banana/edit';

      console.log('Generating visual upgrade with prompt:', prompt);

      const response = await fetch(`https://fal.run/${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_urls: [imageBase64],
          prompt: prompt,
          num_images: config.settings.num_images || 1,
          aspect_ratio: config.settings.aspect_ratio || '1:1',
          output_format: config.settings.output_format || 'png'
        })
      });

      const data = await response.json();
      let newImageUrl = data.images?.[0]?.url;

      // Remove background to get transparent PNG
      if (newImageUrl) {
        setUpgradeMessage('Removing background...');
        const bgResponse = await fetch('https://fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image_url: newImageUrl })
        });
        const bgData = await bgResponse.json();
        const bgRemovedUrl = bgData.image?.url || newImageUrl;

        // Save to local filesystem
        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(bgRemovedUrl);
        const userId = state.currentUser || 'default';
        newImageUrl = await saveImageToStorage(base64Image, 'ship', userId, 'visual-upgrade', bgRemovedUrl);
      }

      if (newImageUrl) {
        // Deduct personal points and sync to backend
        setPersonalPoints(prev => prev - VISUAL_UPGRADE_COST);
        updateRemotePersonalPoints(-VISUAL_UPGRADE_COST);

        // Update user's ship
        const userId = state.currentUser || 'default';
        const upgradeId = `visual-${Date.now()}`;

        setUserShips(prev => ({
          ...prev,
          [userId]: {
            ...currentShip,
            upgrades: [...currentShip.upgrades, upgradeId],
            currentImage: newImageUrl,
          }
        }));

        // Update the ship in the game canvas
        gameRef.current?.updateShipImage(newImageUrl, currentShip.upgrades.length + 1);

        // Sync ship image to backend for multiplayer
        updatePlayerData({
          ship_current_image: newImageUrl,
          ship_upgrades: [...currentShip.upgrades, upgradeId],
        });

        // Add to mascot history and save to Supabase
        const newHistoryEntry = {
          imageUrl: newImageUrl,
          planetName: promptText.substring(0, 30) + (promptText.length > 30 ? '...' : ''),
          timestamp: Date.now(),
          earnedBy: state.currentUser || 'unknown',
        };
        const newMascotHistory = [...mascotHistory, newHistoryEntry];
        setMascotHistory(newMascotHistory);
        saveMascotHistoryToSupabase(newMascotHistory);

        // Record prompt for history
        recordPrompt({
          promptType: 'ship_upgrade',
          promptText: prompt,
          userInput: promptText,
          apiUsed: apiEndpoint,
          sourceImageUrl: currentShip.currentImage,
          resultImageUrl: newImageUrl,
        });
      }

      setIsUpgrading(false);
      gameRef.current?.stopUpgradeAnimation();
      broadcastUpgradeState(false);
    } catch (error) {
      console.error('Failed to generate visual upgrade:', error);
      setUpgradeMessage('Upgrade failed');
      setTimeout(() => {
        setIsUpgrading(false);
        gameRef.current?.stopUpgradeAnimation();
        broadcastUpgradeState(false);
      }, 1500);
    }
  };

  // Buy size upgrade (max 5 levels)
  const buySizeUpgrade = () => {
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const currentLevel = Math.floor(currentEffects.sizeBonus / 10); // Convert old percentage to level

    if (currentLevel >= 10) return;
    const cost = SIZE_COSTS[currentLevel];
    if (personalPoints < cost) return;

    const userId = state.currentUser || 'default';
    const newEffects = { ...currentEffects, sizeBonus: (currentLevel + 1) * 10 }; // Store as percentage for compatibility

    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - cost);
    updateRemotePersonalPoints(-cost);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
  };

  // Buy speed upgrade (max 10 levels)
  const buySpeedUpgrade = () => {
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const currentLevel = currentEffects.speedBonus;

    if (currentLevel >= 10) return;
    const cost = SPEED_COSTS[currentLevel];
    if (personalPoints < cost) return;

    const userId = state.currentUser || 'default';
    const newEffects = { ...currentEffects, speedBonus: currentLevel + 1 };

    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - cost);
    updateRemotePersonalPoints(-cost);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
  };

  // Buy landing speed upgrade (faster landing animation)
  const buyLandingSpeedUpgrade = () => {
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const currentLevel = currentEffects.landingSpeedBonus;

    if (currentLevel >= 5) return;
    const cost = LANDING_SPEED_COSTS[currentLevel];
    if (personalPoints < cost) return;

    const userId = state.currentUser || 'default';
    const newEffects = { ...currentEffects, landingSpeedBonus: currentLevel + 1 };

    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - cost);
    updateRemotePersonalPoints(-cost);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
  };

  // Buy or switch glow
  const handleGlow = (glowId: string) => {
    const glow = GLOW_EFFECTS.find(g => g.id === glowId);
    if (!glow) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const owned = currentEffects.ownedGlows.includes(glow.value);

    if (owned) {
      // Already owned - toggle (free switch or turn off)
      const newGlow = currentEffects.glowColor === glow.value ? null : glow.value;
      const newEffects = { ...currentEffects, glowColor: newGlow };
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playUIClick();
    } else {
      // Buy it
      if (personalPoints < glow.cost) return;
      const newEffects = {
        ...currentEffects,
        ownedGlows: [...currentEffects.ownedGlows, glow.value],
        glowColor: glow.value,
      };
      // Deduct personal points and sync to backend
      setPersonalPoints(prev => prev - glow.cost);
      updateRemotePersonalPoints(-glow.cost);
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playShipUpgrade();
    }
  };

  // Buy or switch trail
  const handleTrail = (trailId: string) => {
    const trail = TRAIL_EFFECTS.find(t => t.id === trailId);
    if (!trail) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const owned = currentEffects.ownedTrails.includes(trail.value);

    if (owned) {
      // Already owned - toggle (free switch or turn off)
      const newTrail: ShipEffects['trailType'] = currentEffects.trailType === trail.value ? 'default' : trail.value as 'fire' | 'ice' | 'rainbow';
      const newEffects: ShipEffects = { ...currentEffects, trailType: newTrail };
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playUIClick();
    } else {
      // Buy it
      if (personalPoints < trail.cost) return;
      const newEffects: ShipEffects = {
        ...currentEffects,
        ownedTrails: [...currentEffects.ownedTrails, trail.value],
        trailType: trail.value as 'fire' | 'ice' | 'rainbow',
      };
      // Deduct personal points and sync to backend
      setPersonalPoints(prev => prev - trail.cost);
      updateRemotePersonalPoints(-trail.cost);
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playShipUpgrade();
    }
  };

  // Buy Destroy Canon (one-time purchase)
  const buyDestroyCanon = () => {
    if (personalPoints < DESTROY_CANON_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasDestroyCanon) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasDestroyCanon: true,
      destroyCanonEquipped: true, // Auto-equip when purchased
    };

    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - DESTROY_CANON_COST);
    updateRemotePersonalPoints(-DESTROY_CANON_COST);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
  };

  // Toggle Destroy Canon equip state
  const toggleDestroyCanon = () => {
    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (!currentEffects.hasDestroyCanon) return; // Doesn't own it

    const newEffects: ShipEffects = {
      ...currentEffects,
      destroyCanonEquipped: !currentEffects.destroyCanonEquipped,
    };

    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playUIClick();
  };

  // Helper to get effects with defaults
  const getEffectsWithDefaults = (effects: ShipEffects | undefined): ShipEffects => ({
    glowColor: effects?.glowColor ?? null,
    trailType: effects?.trailType ?? 'default',
    sizeBonus: effects?.sizeBonus ?? 0,
    speedBonus: effects?.speedBonus ?? 0,
    landingSpeedBonus: effects?.landingSpeedBonus ?? 0,
    ownedGlows: effects?.ownedGlows ?? [],
    ownedTrails: effects?.ownedTrails ?? [],
    hasDestroyCanon: effects?.hasDestroyCanon ?? false,
    destroyCanonEquipped: effects?.destroyCanonEquipped ?? false,
  });

  // Helper to update ship effects
  const updateUserShipEffects = (userId: string, currentShip: UserShip, newEffects: ShipEffects) => {
    setUserShips(prev => ({
      ...prev,
      [userId]: { ...currentShip, effects: newEffects }
    }));
    gameRef.current?.updateShipEffects(newEffects);

    // Sync effects to backend for multiplayer
    updatePlayerData({ ship_effects: newEffects });
  };

  // Select user
  const selectUser = (userId: string) => {
    soundManager.init();
    soundManager.playUIClick();
    setState(prev => ({ ...prev, currentUser: userId }));
    setShowUserSelect(false);

    // Initialize ship for user if not exists
    if (!userShips[userId]) {
      setUserShips(prev => ({
        ...prev,
        [userId]: {
          baseImage: '/ship-base.png',
          upgrades: [],
          currentImage: '/ship-base.png',
          effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false },
        }
      }));
    }
  };

  // Handle image file selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPlanetImageFile(file);
      const base64 = await fileToBase64(file);
      setPlanetImagePreview(base64);
    }
  };

  // Generate planet image with AI
  const generatePlanetImage = async () => {
    if (!imagePrompt) return;

    setIsGeneratingImage(true);
    try {
      const config = planetPrompts.customPlanet;
      const prompt = config.prompt.replace('{userInput}', imagePrompt);
      const apiEndpoint = config.api || 'fal-ai/nano-banana';

      const response = await fetch(`https://fal.run/${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          num_images: config.settings.num_images || 1,
          aspect_ratio: config.settings.aspect_ratio || '1:1',
          output_format: config.settings.output_format || 'png'
        })
      });

      const data = await response.json();
      const imageUrl = data.images?.[0]?.url;

      if (imageUrl) {
        const bgResponse = await fetch('https://fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image_url: imageUrl })
        });

        const bgData = await bgResponse.json();
        const finalUrl = bgData.image?.url || imageUrl;

        // Save to local filesystem
        const base64Image = await getImageAsBase64(finalUrl);
        const localPath = await saveImageToStorage(
          base64Image,
          'planet',
          state.currentUser || 'unknown',
          newPlanet.name || 'planet',
          finalUrl
        );
        setPlanetImagePreview(localPath);

        // Record prompt for history
        recordPrompt({
          promptType: 'planet_create',
          promptText: prompt,
          userInput: imagePrompt,
          apiUsed: apiEndpoint,
          resultImageUrl: localPath,
        });
      }
    } catch (error) {
      console.error('Failed to generate planet image:', error);
    }
    setIsGeneratingImage(false);
  };

  // Save new planet (Notion tasks sync automatically, others are local)
  const savePlanet = async () => {
    if (!newPlanet.name || !newPlanet.description) return;

    const isNotionTask = newPlanet.type === 'notion';

    if (isNotionTask) {
      // Create Notion task via edge function
      setIsCreatingPlanet(true);
      try {
        const { data: result, error } = await supabase.functions.invoke('notion-create', {
          body: {
            name: newPlanet.name,
            description: newPlanet.description,
            type: notionTaskType,
            priority: notionPriority,
            assigned_to: notionAssignedTo || null,
            created_by: state.currentUser || 'unknown',
          },
        });

        if (error) {
          console.error('Failed to create Notion task:', error);
          alert('Failed to create task in Notion');
        } else {
          console.log('Created Notion task:', result);
          // Planet will appear via realtime subscription
        }
      } catch (error) {
        console.error('Error creating Notion task:', error);
        alert('Error creating task in Notion');
      }
      setIsCreatingPlanet(false);
    } else {
      // Local planet (Achievement, Business, Product)
      const planet: CustomPlanet = {
        id: `custom-${Date.now()}`,
        name: newPlanet.name,
        description: newPlanet.description,
        type: newPlanet.type || 'business',
        size: newPlanet.size || 'medium',
        realWorldReward: newPlanet.realWorldReward,
        imageUrl: planetImagePreview || undefined,
        createdBy: state.currentUser || 'unknown',
      };

      const newCustomPlanets = [...customPlanets, planet];
      setCustomPlanets(newCustomPlanets);
      saveCustomPlanetsToSupabase(newCustomPlanets);
      gameRef.current?.addCustomPlanet(planet);
    }

    // Reset form
    setNewPlanet({ size: 'medium' });
    setPlanetImageFile(null);
    setPlanetImagePreview(null);
    setImagePrompt('');
    setNotionPriority('medium');
    setNotionAssignedTo('');
    setNotionTaskType('task');
    setShowPlanetCreator(false);
    gameRef.current?.clearLandedState();
  };

  // Initialize game
  useEffect(() => {
    if (!canvasRef.current || showWelcome || showUserSelect) return;

    const currentShip = getCurrentUserShip();
    const game = new SpaceGame(canvasRef.current, stableOnDock, customPlanets, currentShip.currentImage, goals, currentShip.upgrades.length, userPlanets, state.currentUser || 'quentin');
    gameRef.current = game;

    // Set up landing callbacks for the new interaction system (use refs for stable references)
    game.setLandingCallbacks({
      onLand: (planet) => landingCallbacksRef.current.onLand(planet),
      onTakeoff: () => landingCallbacksRef.current.onTakeoff(),
      onColonize: (planet) => landingCallbacksRef.current.onColonize(planet),
      onClaimRequest: (planet) => landingCallbacksRef.current.onClaimRequest(planet),
      onOpenNotion: (url) => landingCallbacksRef.current.onOpenNotion(url),
      onTerraform: (planet) => landingCallbacksRef.current.onTerraform(planet),
      onDestroyPlanet: (planet) => landingCallbacksRef.current.onDestroyPlanet(planet),
    });

    // Sync notion planets immediately if already loaded
    if (notionPlanetsRef.current.length > 0) {
      game.syncNotionPlanets(notionPlanetsRef.current);
    }

    // Initialize ship effects if present
    if (currentShip.effects) {
      game.updateShipEffects(currentShip.effects);
    }

    state.completedPlanets.forEach(id => game.completePlanet(id));
    game.start();
    setGameReady(true); // Signal that game is ready for broadcasting

    return () => {
      game.stop();
      setGameReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome, showUserSelect, customPlanets, goals]);

  // User selection screen
  if (showUserSelect) {
    return (
      <div style={styles.welcome}>
        <img src="/logo.png" alt="Custom One" style={styles.logo} />
        <h1 style={styles.title}>Mission Control</h1>
        <p style={styles.subtitle}>Who are you?</p>
        <div style={styles.userGrid}>
          {USERS.map(user => (
            <button
              key={user.id}
              style={{ ...styles.userButton, borderColor: user.color }}
              onClick={() => selectUser(user.id)}
            >
              <span style={{ ...styles.userEmoji, background: user.color }}>
                {user.name[0]}
              </span>
              <span>{user.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Welcome screen
  if (showWelcome) {
    const currentUser = USERS.find(u => u.id === state.currentUser);
    const currentShip = getCurrentUserShip();

    return (
      <div style={styles.welcome}>
        <img src="/logo.png" alt="Custom One" style={styles.logo} />
        <h1 style={styles.title}>Mission Control</h1>
        <p style={styles.subtitle}>Space Edition</p>

        <p style={{ color: currentUser?.color, marginBottom: '1rem' }}>
          Welcome, {currentUser?.name}!
        </p>

        {/* Ship Preview */}
        <div style={styles.shipPreviewLarge}>
          <img src={currentShip.currentImage} alt="Your Ship" style={styles.shipPreviewImage} />
          <p style={styles.shipUpgradeCount}>{currentShip.upgrades.length} upgrades</p>
        </div>

        <div style={styles.instructions}>
          <p><strong>Controls:</strong></p>
          <p>W / ↑ - Thrust &nbsp;|&nbsp; A / ← D / → - Rotate</p>
          <p>S / ↓ - Brake &nbsp;|&nbsp; SHIFT - Boost</p>
          <p>SPACE - Dock at planet</p>
        </div>

        <button style={styles.startButton} onClick={() => {
          soundManager.init();
          soundManager.playUIClick();
          setShowWelcome(false);
        }}>
          Launch Mission
        </button>

        <p style={{ ...styles.progress, marginTop: '1.5rem' }}>
          {state.completedPlanets.length} planets completed | {customPlanets.length} custom planets
        </p>

        <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Fly to special stations near spawn: 🛒 Shop • 📸 Gallery • 🏭 Factory
        </p>

        <button style={styles.switchUserButton} onClick={() => setShowUserSelect(true)}>
          Switch User
        </button>
      </div>
    );
  }

  const currentUser = USERS.find(u => u.id === state.currentUser);
  const currentShip = getCurrentUserShip();

  return (
    <div style={styles.container}>
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* Upgrade overlay */}
      {isUpgrading && (
        <div style={styles.upgradeOverlay}>
          <div style={styles.upgradeBox}>
            <div style={styles.spinner} />
            <span>{upgradeMessage}</span>
          </div>
        </div>
      )}

      {/* HUD */}
      <div style={styles.hud}>
        <img
          src="/logo.png"
          alt="Logo"
          style={{ ...styles.hudLogo, cursor: state.currentUser === 'quentin' ? 'pointer' : 'default' }}
          onClick={() => state.currentUser === 'quentin' && setShowSettings(true)}
          title={state.currentUser === 'quentin' ? 'Admin Settings' : ''}
        />
        <span style={styles.hudText}>Mission Control</span>
        <span style={{ color: currentUser?.color, marginLeft: 8 }}>
          ({currentUser?.name})
        </span>

        {/* Multiplayer indicator */}
        {team && (
          <div style={styles.multiplayerIndicator}>
            <span style={{ color: isConnected ? '#4ade80' : '#888' }}>
              {isConnected ? '●' : '○'}
            </span>
            <span style={{ marginLeft: 4, fontSize: '0.75rem', color: '#aaa' }}>
              {teamPlayers.filter(p => p.isOnline).length} online
            </span>
          </div>
        )}
      </div>

      {/* Leaderboard button - always available when connected */}
      {team && (
        <div style={styles.multiplayerButtons}>
          <button
            style={styles.leaderboardButton}
            onClick={() => setShowLeaderboard(true)}
            title="View leaderboard"
          >
            🏆 Leaderboard
          </button>
        </div>
      )}

      {/* Points earned toast */}
      {pointToast && (
        <div style={styles.pointToast}>
          <span style={{ color: '#4ade80' }}>+{pointToast.points}</span>
          <span style={{ marginLeft: 6, color: '#aaa' }}>
            {pointToast.playerName || 'Someone'} earned points
            {pointToast.taskName && ` for: ${pointToast.taskName}`}
          </span>
        </div>
      )}

      {/* Online players sidebar */}
      {team && teamPlayers.filter(p => p.isOnline && p.username !== state.currentUser).length > 0 && (
        <div style={styles.onlinePlayers}>
          <div style={styles.onlinePlayersTitle}>Online</div>
          {teamPlayers
            .filter(p => p.isOnline && p.username !== state.currentUser)
            .map(p => (
              <div key={p.id} style={styles.onlinePlayer}>
                <span style={{ ...styles.onlinePlayerDot, background: p.color }} />
                <span>{p.displayName}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* Stats */}
      <div style={styles.stats}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{state.completedPlanets.length}</span>
          <span style={styles.statLabel}>Planets</span>
        </div>
        <div style={styles.statItem}>
          <span style={{ ...styles.statValue, color: '#5490ff' }}>💎 {teamPoints}</span>
          <span style={styles.statLabel}>Team Points</span>
        </div>
        <div style={styles.statItem}>
          <span style={{ ...styles.statValue, color: '#ffa500' }}>⭐ {personalPoints}</span>
          <span style={styles.statLabel}>Your Points</span>
        </div>
      </div>

      {/* Ship preview */}
      <div style={styles.robotPreview}>
        <img src={currentShip.currentImage} alt="Ship" style={styles.robotImage} />
      </div>

      {/* Sound toggle */}
      <button
        style={styles.muteButton}
        onClick={() => {
          const muted = soundManager.toggleMute();
          setIsMuted(muted);
        }}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div style={styles.modalOverlay} onClick={() => setShowLeaderboard(false)}>
          <div style={{ ...styles.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🏆 Leaderboard</h2>
            <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0' }}>Total points earned</p>
            <div style={{ marginTop: '1rem' }}>
              {[...teamPlayers]
                .sort((a, b) => b.totalEarned - a.totalEarned)
                .map((player, index) => (
                  <div
                    key={player.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: player.username === state.currentUser
                        ? 'rgba(255, 200, 0, 0.15)'
                        : 'rgba(255,255,255,0.03)',
                      borderRadius: '10px',
                      marginBottom: '8px',
                      border: player.username === state.currentUser
                        ? '1px solid rgba(255, 200, 0, 0.3)'
                        : '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <span style={{
                      fontSize: index === 0 ? '1.5rem' : '1rem',
                      width: '32px',
                      textAlign: 'center',
                    }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </span>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: player.color,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      flex: 1,
                      color: '#fff',
                      fontWeight: player.username === state.currentUser ? 600 : 400,
                    }}>
                      {player.displayName}
                      {player.username === state.currentUser && (
                        <span style={{ color: '#888', fontWeight: 400, marginLeft: '6px' }}>(you)</span>
                      )}
                    </span>
                    <span style={{
                      color: '#ffc800',
                      fontWeight: 600,
                      fontSize: '1rem',
                    }}>
                      ⭐ {player.totalEarned}
                    </span>
                  </div>
                ))}
            </div>
            <button
              style={{ ...styles.closeButton, marginTop: '1.5rem' }}
              onClick={() => setShowLeaderboard(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Shop Modal */}
      {showShop && (
        <div style={styles.modalOverlay} onClick={() => { if (!isUpgrading) { setShowShop(false); gameRef.current?.clearLandedState(); } }}>
          <div style={{ ...styles.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🛒 Upgrade Shop</h2>
            <p style={styles.shopPoints}>⭐ {personalPoints} Your Points Available</p>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
              {(['stats', 'cosmetics', 'weapons'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setShopTab(tab)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: 'none',
                    borderRadius: '6px',
                    background: shopTab === tab ? 'rgba(255, 165, 0, 0.2)' : 'transparent',
                    color: shopTab === tab ? '#ffa500' : '#888',
                    fontWeight: shopTab === tab ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab === 'stats' && '⚡ Stats'}
                  {tab === 'cosmetics' && '🎨 Cosmetics'}
                  {tab === 'weapons' && '🔫 Weapons'}
                </button>
              ))}
            </div>

            {/* Stats Tab */}
            {shopTab === 'stats' && (
              <div style={styles.shopSection}>
                {/* Size Upgrade with dots */}
                {(() => {
                  const currentLevel = Math.floor(getEffectsWithDefaults(getCurrentUserShip().effects).sizeBonus / 10);
                  const nextCost = currentLevel < 10 ? SIZE_COSTS[currentLevel] : null;
                  const canBuy = nextCost !== null && personalPoints >= nextCost;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>📈</span>
                        <span>Size</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <div style={styles.speedDots}>
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                            <div
                              key={i}
                              style={{
                                ...styles.speedDot,
                                background: i < currentLevel ? '#ffa500' : 'rgba(255,255,255,0.15)',
                              }}
                            />
                          ))}
                        </div>
                        <span style={styles.effectLaneValue}>+{currentLevel * 10}%</span>
                        {nextCost !== null ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                            }}
                            onClick={buySizeUpgrade}
                            disabled={!canBuy}
                          >
                            +10% ({nextCost} ⭐)
                          </button>
                        ) : (
                          <span style={styles.effectMaxed}>MAX</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Speed Upgrade with dots */}
                {(() => {
                  const currentLevel = getEffectsWithDefaults(getCurrentUserShip().effects).speedBonus;
                  const nextCost = currentLevel < 10 ? SPEED_COSTS[currentLevel] : null;
                  const canBuy = nextCost !== null && personalPoints >= nextCost;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>⚡</span>
                        <span>Speed</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <div style={styles.speedDots}>
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                            <div
                              key={i}
                              style={{
                                ...styles.speedDot,
                                background: i < currentLevel ? '#ffa500' : 'rgba(255,255,255,0.15)',
                              }}
                            />
                          ))}
                        </div>
                        <span style={styles.effectLaneValue}>+{currentLevel * 10}%</span>
                        {nextCost !== null ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                            }}
                            onClick={buySpeedUpgrade}
                            disabled={!canBuy}
                          >
                            +10% ({nextCost} ⭐)
                          </button>
                        ) : (
                          <span style={styles.effectMaxed}>MAX</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Landing Speed Upgrade with dots */}
                {(() => {
                  const currentLevel = getEffectsWithDefaults(getCurrentUserShip().effects).landingSpeedBonus;
                  const nextCost = currentLevel < 5 ? LANDING_SPEED_COSTS[currentLevel] : null;
                  const canBuy = nextCost !== null && personalPoints >= nextCost;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🛬</span>
                        <span>Landing</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <div style={styles.speedDots}>
                          {[0, 1, 2, 3, 4].map(i => (
                            <div
                              key={i}
                              style={{
                                ...styles.speedDot,
                                background: i < currentLevel ? '#ffa500' : 'rgba(255,255,255,0.15)',
                              }}
                            />
                          ))}
                        </div>
                        <span style={styles.effectLaneValue}>+{currentLevel * 15}%</span>
                        {nextCost !== null ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                            }}
                            onClick={buyLandingSpeedUpgrade}
                            disabled={!canBuy}
                          >
                            +15% ({nextCost} ⭐)
                          </button>
                        ) : (
                          <span style={styles.effectMaxed}>MAX</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Cosmetics Tab */}
            {shopTab === 'cosmetics' && (
              <div style={styles.shopSection}>
                {/* Current ship preview */}
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <img
                    src={getCurrentUserShip().currentImage}
                    alt="Your Ship"
                    style={{ width: 70, height: 70, borderRadius: 10, border: '2px solid #ffa500' }}
                  />
                  <p style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.4rem' }}>
                    {getCurrentUserShip().upgrades.length} visual upgrades
                  </p>
                </div>

                {/* AI Visual Upgrade */}
                <div style={{ marginBottom: '1rem' }}>
                  <textarea
                    style={{ ...styles.upgradeInput, fontSize: '0.85rem' }}
                    value={upgradePrompt}
                    onChange={e => setUpgradePrompt(e.target.value)}
                    placeholder="Describe what you want to add..."
                    rows={2}
                  />
                  <button
                    style={{
                      ...styles.saveButton,
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '10px',
                      fontSize: '0.85rem',
                      opacity: personalPoints >= VISUAL_UPGRADE_COST && upgradePrompt ? 1 : 0.5,
                    }}
                    onClick={buyVisualUpgrade}
                    disabled={!upgradePrompt || personalPoints < VISUAL_UPGRADE_COST || isUpgrading}
                  >
                    {isUpgrading ? 'Generating...' : `Modify Vessel (${VISUAL_UPGRADE_COST} ⭐)`}
                  </button>
                </div>

                {/* Shield Lane */}
                <div style={styles.effectLane}>
                  <div style={styles.effectLaneLabel}>
                    <span style={styles.effectLaneIcon}>🛡️</span>
                    <span>Shield</span>
                  </div>
                  <div style={styles.effectLaneItems}>
                    {GLOW_EFFECTS.map(glow => {
                      const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                      const owned = effects.ownedGlows.includes(glow.value);
                      const active = effects.glowColor === glow.value;
                      return (
                        <button
                          key={glow.id}
                          style={{
                            ...styles.effectItemSmall,
                            borderColor: active ? '#ffa500' : owned ? '#555' : '#333',
                            background: active ? 'rgba(255, 165, 0, 0.15)' : owned ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                            opacity: owned || personalPoints >= glow.cost ? 1 : 0.5,
                          }}
                          onClick={() => handleGlow(glow.id)}
                          disabled={!owned && personalPoints < glow.cost}
                          title={owned ? (active ? 'Click to deactivate' : 'Click to activate') : `Buy for ${glow.cost} points`}
                        >
                          <span style={{ fontSize: '1.2rem' }}>{glow.icon}</span>
                          <span style={{ fontSize: '0.65rem', color: '#aaa' }}>{glow.name}</span>
                          {!owned && <span style={{ fontSize: '0.6rem', color: '#ffa500' }}>{glow.cost} ⭐</span>}
                          {owned && active && <span style={{ fontSize: '0.55rem', color: '#ffa500' }}>ON</span>}
                          {owned && !active && <span style={{ fontSize: '0.55rem', color: '#666' }}>owned</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Trails Lane */}
                <div style={styles.effectLane}>
                  <div style={styles.effectLaneLabel}>
                    <span style={styles.effectLaneIcon}>💨</span>
                    <span>Trail</span>
                  </div>
                  <div style={styles.effectLaneItems}>
                    {TRAIL_EFFECTS.map(trail => {
                      const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                      const owned = effects.ownedTrails.includes(trail.value);
                      const active = effects.trailType === trail.value;
                      return (
                        <button
                          key={trail.id}
                          style={{
                            ...styles.effectItemSmall,
                            borderColor: active ? '#ffa500' : owned ? '#555' : '#333',
                            background: active ? 'rgba(255, 165, 0, 0.15)' : owned ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                            opacity: owned || personalPoints >= trail.cost ? 1 : 0.5,
                          }}
                          onClick={() => handleTrail(trail.id)}
                          disabled={!owned && personalPoints < trail.cost}
                          title={owned ? (active ? 'Click to deactivate' : 'Click to activate') : `Buy for ${trail.cost} points`}
                        >
                          <span style={{ fontSize: '1.2rem' }}>{trail.icon}</span>
                          <span style={{ fontSize: '0.65rem', color: '#aaa' }}>{trail.name}</span>
                          {!owned && <span style={{ fontSize: '0.6rem', color: '#ffa500' }}>{trail.cost} ⭐</span>}
                          {owned && active && <span style={{ fontSize: '0.55rem', color: '#ffa500' }}>ON</span>}
                          {owned && !active && <span style={{ fontSize: '0.55rem', color: '#666' }}>owned</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Weapons Tab */}
            {shopTab === 'weapons' && (
              <div style={styles.shopSection}>
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasDestroyCanon;
                  const equipped = effects.destroyCanonEquipped;
                  const canBuy = !owned && personalPoints >= DESTROY_CANON_COST;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>💥</span>
                        <span>Destroy Canon</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Destroy completed Notion planets
                        </span>
                        {owned ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              background: equipped ? 'rgba(255, 165, 0, 0.2)' : 'rgba(255,255,255,0.05)',
                              borderColor: equipped ? '#ffa500' : '#444',
                              color: equipped ? '#ffa500' : '#888',
                              minWidth: 80,
                            }}
                            onClick={toggleDestroyCanon}
                          >
                            {equipped ? 'EQUIPPED' : 'EQUIP'}
                          </button>
                        ) : (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                              minWidth: 100,
                            }}
                            onClick={buyDestroyCanon}
                            disabled={!canBuy}
                          >
                            {DESTROY_CANON_COST} ⭐
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <button style={{ ...styles.cancelButton, width: '100%', marginTop: '1rem' }} onClick={() => { setShowShop(false); gameRef.current?.clearLandedState(); }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Planet Creator Modal */}
      {showPlanetCreator && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, minWidth: newPlanet.type ? '400px' : '500px' }}>
            <h2 style={styles.modalTitle}>Create New Planet</h2>

            {/* Big Type Selection Buttons - Always visible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '20px 0' }}>
              <button
                onClick={() => setNewPlanet(p => ({ ...p, type: 'achievement' }))}
                style={{
                  padding: '40px 24px',
                  border: newPlanet.type === 'achievement' ? '3px solid #ffd700' : '2px solid #333',
                  borderRadius: '16px',
                  background: newPlanet.type === 'achievement' ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: '#ffd700',
                  cursor: 'pointer',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '48px' }}>🏆</span>
                Achievement
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#888' }}>Local milestone</span>
              </button>
              <button
                onClick={() => setNewPlanet(p => ({ ...p, type: 'notion' }))}
                style={{
                  padding: '40px 24px',
                  border: newPlanet.type === 'notion' ? '3px solid #00c8ff' : '2px solid #333',
                  borderRadius: '16px',
                  background: newPlanet.type === 'notion' ? 'rgba(0, 200, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: '#00c8ff',
                  cursor: 'pointer',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '48px' }}>📋</span>
                Task
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#4ade80' }}>+10 ⭐</span>
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#888' }}>Syncs to Notion</span>
              </button>
            </div>

            {/* Form appears below when type is selected */}
            {newPlanet.type ? (
              <>
                {/* Common Fields */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>{newPlanet.type === 'notion' ? 'Task Title' : 'Planet Name'} *</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={newPlanet.name || ''}
                    onChange={e => setNewPlanet(p => ({ ...p, name: e.target.value }))}
                    placeholder={newPlanet.type === 'notion' ? 'e.g., Fix login bug' : 'e.g., $1M ARR'}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Description *</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={newPlanet.description || ''}
                    onChange={e => setNewPlanet(p => ({ ...p, description: e.target.value }))}
                    placeholder={newPlanet.type === 'notion' ? 'What needs to be done?' : 'What does this milestone represent?'}
                  />
                </div>

                {/* Fields for Achievement */}
                {newPlanet.type === 'achievement' && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Size (Points)</label>
                    <select
                      style={styles.select}
                      value={newPlanet.size}
                      onChange={e => setNewPlanet(p => ({ ...p, size: e.target.value as any }))}
                    >
                      <option value="small">Small (50 pts)</option>
                      <option value="medium">Medium (100 pts)</option>
                      <option value="big">Big (200 pts)</option>
                    </select>
                  </div>
                )}

                {/* Fields for Notion Task */}
                {newPlanet.type === 'notion' && (
                  <div style={{ background: 'rgba(0, 200, 255, 0.05)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                    <div style={styles.formRow}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Task Type</label>
                        <select
                          style={styles.select}
                          value={notionTaskType}
                          onChange={e => setNotionTaskType(e.target.value as any)}
                        >
                          <option value="task">📋 Task</option>
                          <option value="bug">🐛 Bug</option>
                          <option value="feature">✨ Feature</option>
                        </select>
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Priority</label>
                        <select
                          style={styles.select}
                          value={notionPriority}
                          onChange={e => setNotionPriority(e.target.value as any)}
                        >
                          <option value="low">💡 Low (25 pts)</option>
                          <option value="medium">⚡ Medium (50 pts)</option>
                          <option value="high">🔥 High (100 pts)</option>
                          <option value="critical">🧨 Critical (150 pts)</option>
                        </select>
                      </div>
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Assign To</label>
                      <select
                        style={styles.select}
                        value={notionAssignedTo}
                        onChange={e => setNotionAssignedTo(e.target.value)}
                      >
                        <option value="">Unassigned (Center Zone)</option>
                        <option value="quentin">Quentin</option>
                        <option value="alex">Alex</option>
                        <option value="armel">Armel</option>
                        <option value="milya">Milya</option>
                        <option value="hugues">Hugues</option>
                      </select>
                    </div>
                  </div>
                )}

                <div style={styles.modalButtons}>
                  <button style={styles.cancelButton} onClick={() => { setShowPlanetCreator(false); gameRef.current?.clearLandedState(); }} disabled={isCreatingPlanet}>
                    Cancel
                  </button>
                  <button
                    style={{
                      ...styles.saveButton,
                      background: newPlanet.type === 'notion'
                        ? 'linear-gradient(135deg, #00c8ff, #0088cc)'
                        : styles.saveButton.background,
                    }}
                    onClick={savePlanet}
                    disabled={!newPlanet.name || !newPlanet.description || isCreatingPlanet}
                  >
                    {isCreatingPlanet ? 'Creating...' : newPlanet.type === 'notion' ? 'Create Notion Task' : 'Create Planet'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Terraform Modal */}
      {showTerraform && (
        <div style={styles.modalOverlay} onClick={() => { if (!isUpgrading) { setShowTerraform(false); gameRef.current?.clearLandedState(); } }}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🌍 Terraform Your Planet</h2>
            <p style={styles.shopPoints}>⭐ {personalPoints} Your Points Available</p>

            {/* Current planet preview */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              {getUserPlanet(state.currentUser || '').imageUrl ? (
                <img
                  src={getUserPlanet(state.currentUser || '').imageUrl}
                  alt="Your Planet"
                  style={{ width: 120, height: 120, borderRadius: '50%', border: `3px solid ${currentUser?.color || '#ffa500'}`, objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 120, height: 120, borderRadius: '50%',
                  background: `radial-gradient(circle at 30% 30%, ${currentUser?.color || '#ffa500'}40, #333)`,
                  border: `3px solid ${currentUser?.color || '#ffa500'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#666', fontSize: '0.75rem', margin: '0 auto'
                }}>
                  No Planet Yet
                </div>
              )}
              <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {!getUserPlanet(state.currentUser || '').imageUrl
                  ? 'Generate your base planet first!'
                  : `Terraformed ${getUserPlanet(state.currentUser || '').terraformCount} times`}
              </p>
              {(() => {
                const planet = getUserPlanet(state.currentUser || '');
                const population = getPlanetPopulation(planet.terraformCount, planet.sizeLevel);
                return population > 0 ? (
                  <p style={{ color: '#4ade80', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 500 }}>
                    🏘️ Population: {formatPopulation(population)} inhabitants
                  </p>
                ) : null;
              })()}
            </div>

            {/* Show generate base planet button if no planet yet */}
            {!getUserPlanet(state.currentUser || '').imageUrl ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  First, create your base planet. Then you can terraform it!
                </p>
                <button
                  style={{ ...styles.saveButton, width: '100%' }}
                  onClick={generateBasePlanet}
                  disabled={personalPoints < 25 || isUpgrading}
                >
                  {isUpgrading ? 'Generating...' : 'Generate Base Planet (25 ⭐)'}
                </button>
                <button style={{ ...styles.cancelButton, marginTop: '1rem' }} onClick={() => { setShowTerraform(false); gameRef.current?.clearLandedState(); }}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {/* Planet Size Upgrade */}
                {(() => {
                  const currentLevel = getUserPlanet(state.currentUser || '').sizeLevel;
                  const nextCost = currentLevel < 5 ? PLANET_SIZE_COSTS[currentLevel] : null;
                  const canBuy = nextCost !== null && personalPoints >= nextCost;
                  return (
                    <div style={{ ...styles.effectLane, marginBottom: '1rem' }}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🌍</span>
                        <span>Size</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <div style={styles.speedDots}>
                          {[0, 1, 2, 3, 4].map(i => (
                            <div
                              key={i}
                              style={{
                                ...styles.speedDot,
                                background: i < currentLevel ? currentUser?.color || '#ffa500' : 'rgba(255,255,255,0.15)',
                              }}
                            />
                          ))}
                        </div>
                        <span style={styles.effectLaneValue}>+{currentLevel * 20}%</span>
                        {nextCost !== null ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                            }}
                            onClick={buyPlanetSizeUpgrade}
                            disabled={!canBuy}
                          >
                            +20% ({nextCost} ⭐)
                          </button>
                        ) : (
                          <span style={styles.effectMaxed}>MAX</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Terraform history */}
                {(getUserPlanet(state.currentUser || '').baseImage || getUserPlanet(state.currentUser || '').history.length > 0) && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      Planet Versions
                    </h4>
                    <div className="hidden-scrollbar" style={{ maxHeight: 120, overflowY: 'auto' }}>
                      {/* Base planet option */}
                      {getUserPlanet(state.currentUser || '').baseImage && (
                        <div style={{
                          ...styles.historyItem,
                          cursor: 'pointer',
                          border: getUserPlanet(state.currentUser || '').imageUrl === getUserPlanet(state.currentUser || '').baseImage ? '2px solid #4ade80' : '2px solid transparent',
                        }} onClick={() => selectPlanetFromHistory(state.currentUser || '', getUserPlanet(state.currentUser || '').baseImage!)}>
                          <img src={getUserPlanet(state.currentUser || '').baseImage} alt="" style={styles.historyThumb} />
                          <div style={styles.historyInfo}>
                            <span style={styles.historyDesc}>Base Planet</span>
                            <span style={styles.historyDate}>Original</span>
                          </div>
                          {getUserPlanet(state.currentUser || '').imageUrl === getUserPlanet(state.currentUser || '').baseImage && (
                            <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✓</span>
                          )}
                        </div>
                      )}
                      {/* Terraform history */}
                      {getUserPlanet(state.currentUser || '').history.map((entry, i) => (
                        <div key={i} style={{
                          ...styles.historyItem,
                          cursor: 'pointer',
                          border: getUserPlanet(state.currentUser || '').imageUrl === entry.imageUrl ? '2px solid #4ade80' : '2px solid transparent',
                        }} onClick={() => selectPlanetFromHistory(state.currentUser || '', entry.imageUrl)}>
                          <img src={entry.imageUrl} alt="" style={styles.historyThumb} />
                          <div style={styles.historyInfo}>
                            <span style={styles.historyDesc}>{entry.description}</span>
                            <span style={styles.historyDate}>
                              {new Date(entry.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          {getUserPlanet(state.currentUser || '').imageUrl === entry.imageUrl && (
                            <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✓</span>
                          )}
                          <button
                            style={styles.downloadButton}
                            onClick={(e) => { e.stopPropagation(); downloadImage(entry.imageUrl, `planet-${state.currentUser}-${i + 1}`); }}
                            title="Download"
                          >
                            ⬇
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.75rem', textAlign: 'center' }}>
                  Terraform: 50 ⭐
                </p>

                <div style={styles.formGroup}>
                  <textarea
                    style={styles.upgradeInput}
                    value={terraformPrompt}
                    onChange={e => setTerraformPrompt(e.target.value)}
                    placeholder="Describe what you want to add..."
                    rows={3}
                  />
                </div>

                <div style={styles.modalButtons}>
                  <button style={styles.cancelButton} onClick={() => { setShowTerraform(false); gameRef.current?.clearLandedState(); }}>
                    Cancel
                  </button>
                  <button
                    style={styles.saveButton}
                    onClick={terraformPlanet}
                    disabled={!terraformPrompt || personalPoints < 50 || isUpgrading}
                  >
                    {isUpgrading ? 'Terraforming...' : 'Terraform (50 ⭐)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* View Other Player's Planet Modal */}
      {viewingPlanetOwner && (
        <div style={styles.modalOverlay} onClick={() => { setViewingPlanetOwner(null); setViewingPlanetPreview(null); gameRef.current?.clearLandedState(); }}>
          <div style={{ ...styles.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              🌍 {viewingPlanetOwner.charAt(0).toUpperCase() + viewingPlanetOwner.slice(1)}'s World
            </h2>

            {/* Planet preview */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              {(viewingPlanetPreview || getUserPlanet(viewingPlanetOwner).imageUrl) ? (
                <img
                  src={viewingPlanetPreview || getUserPlanet(viewingPlanetOwner).imageUrl}
                  alt={`${viewingPlanetOwner}'s Planet`}
                  style={{ width: 150, height: 150, borderRadius: '50%', border: `3px solid ${USERS.find(u => u.id === viewingPlanetOwner)?.color || '#ffa500'}` }}
                />
              ) : (
                <div style={{
                  width: 150, height: 150, borderRadius: '50%',
                  background: `radial-gradient(circle at 30% 30%, ${USERS.find(u => u.id === viewingPlanetOwner)?.color || '#ffa500'}40, #333)`,
                  border: `3px solid ${USERS.find(u => u.id === viewingPlanetOwner)?.color || '#ffa500'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#666', fontSize: '0.9rem', margin: '0 auto'
                }}>
                  Barren
                </div>
              )}
              <p style={{ color: USERS.find(u => u.id === viewingPlanetOwner)?.color, marginTop: '0.75rem', fontWeight: 600 }}>
                {getUserPlanet(viewingPlanetOwner).terraformCount === 0
                  ? 'Not terraformed yet'
                  : `Terraformed ${getUserPlanet(viewingPlanetOwner).terraformCount} times`}
              </p>
              {(() => {
                const planet = getUserPlanet(viewingPlanetOwner);
                const population = getPlanetPopulation(planet.terraformCount, planet.sizeLevel);
                return population > 0 ? (
                  <p style={{ color: '#4ade80', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    🏘️ Population: {formatPopulation(population)} inhabitants
                  </p>
                ) : null;
              })()}
            </div>

            {/* Planet versions - only show if we have history data (your own planet) */}
            {(getUserPlanet(viewingPlanetOwner).baseImage || getUserPlanet(viewingPlanetOwner).history.length > 0) && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Planet Versions
                </h4>
                <div className="hidden-scrollbar" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {/* Base planet option */}
                  {getUserPlanet(viewingPlanetOwner).baseImage && (() => {
                    const isOwner = viewingPlanetOwner === state.currentUser;
                    const baseImg = getUserPlanet(viewingPlanetOwner).baseImage!;
                    const isSelected = (viewingPlanetPreview || getUserPlanet(viewingPlanetOwner).imageUrl) === baseImg;
                    return (
                      <div
                        style={{
                          ...styles.historyItem,
                          cursor: 'pointer',
                          border: isSelected ? '2px solid #4ade80' : '2px solid transparent',
                        }}
                        onClick={() => {
                          setViewingPlanetPreview(baseImg);
                          if (isOwner) selectPlanetFromHistory(viewingPlanetOwner, baseImg);
                        }}
                      >
                        <img src={baseImg} alt="" style={styles.historyThumb} />
                        <div style={styles.historyInfo}>
                          <span style={styles.historyDesc}>Base Planet</span>
                          <span style={styles.historyDate}>Original</span>
                        </div>
                        {isSelected && (
                          <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✓</span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Terraform history */}
                  {getUserPlanet(viewingPlanetOwner).history.map((entry, i) => {
                    const isOwner = viewingPlanetOwner === state.currentUser;
                    const isSelected = (viewingPlanetPreview || getUserPlanet(viewingPlanetOwner).imageUrl) === entry.imageUrl;
                    return (
                      <div
                        key={i}
                        style={{
                          ...styles.historyItem,
                          cursor: 'pointer',
                          border: isSelected ? '2px solid #4ade80' : '2px solid transparent',
                        }}
                        onClick={() => {
                          setViewingPlanetPreview(entry.imageUrl);
                          if (isOwner) selectPlanetFromHistory(viewingPlanetOwner, entry.imageUrl);
                        }}
                      >
                        <img src={entry.imageUrl} alt="" style={styles.historyThumb} />
                        <div style={styles.historyInfo}>
                          <span style={styles.historyDesc}>{entry.description}</span>
                          <span style={styles.historyDate}>
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        {isSelected && (
                          <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✓</span>
                        )}
                        {isOwner && (
                          <button
                            style={{ ...styles.downloadButton, position: 'relative', top: 'auto', right: 'auto' }}
                            onClick={(e) => { e.stopPropagation(); downloadImage(entry.imageUrl, `planet-${viewingPlanetOwner}-${i + 1}`); }}
                            title="Download"
                          >
                            ⬇
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button style={styles.cancelButton} onClick={() => { setViewingPlanetOwner(null); setViewingPlanetPreview(null); gameRef.current?.clearLandedState(); }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Admin Settings Modal (Quentin only) */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => !editingGoal && setShowSettings(false)}>
          <div style={{ ...styles.modal, maxWidth: 700, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>⚙️ Admin Settings</h2>

            {!editingGoal ? (
              <>
                {/* Tab Navigation */}
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  marginBottom: '1rem',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  padding: '4px',
                }}>
                  {([
                    { id: 'goals', label: '🎯 Goals' },
                    { id: 'players', label: '👥 Players' },
                    { id: 'notion', label: '📋 Notion' },
                    { id: 'reset', label: '🗑️ Reset' },
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: '6px',
                        background: adminTab === tab.id ? 'rgba(255, 165, 0, 0.2)' : 'transparent',
                        color: adminTab === tab.id ? '#ffa500' : '#888',
                        fontWeight: adminTab === tab.id ? 'bold' : 'normal',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => setAdminTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Goals Tab */}
                {adminTab === 'goals' && (
                  <>
                    {(['business', 'product', 'achievement'] as const).map(type => (
                      <div key={type} style={styles.goalsSection}>
                        <div style={styles.goalsSectionHeader}>
                          <h3 style={{ ...styles.goalsSectionTitle, color: type === 'business' ? '#4ade80' : type === 'product' ? '#5490ff' : '#ffd700' }}>
                            {type === 'business' ? '💼' : type === 'product' ? '🚀' : '🏆'} {type.charAt(0).toUpperCase() + type.slice(1)}
                          </h3>
                          <button style={styles.addGoalButton} onClick={() => addGoal(type)}>+ Add</button>
                        </div>
                        <div style={styles.goalsList}>
                          {goals[type].map(goal => (
                            <div
                              key={goal.id}
                              style={{
                                ...styles.goalItem,
                                borderLeftColor: type === 'business' ? '#4ade80' : type === 'product' ? '#5490ff' : '#ffd700',
                                opacity: state.completedPlanets.includes(goal.id) ? 0.5 : 1,
                              }}
                            >
                              <div style={styles.goalInfo}>
                                <span style={styles.goalName}>
                                  {state.completedPlanets.includes(goal.id) && '✓ '}
                                  {goal.name}
                                </span>
                                <span style={styles.goalSize}>{goal.size}</span>
                              </div>
                              <div style={styles.goalActions}>
                                <button
                                  style={styles.editButton}
                                  onClick={() => setEditingGoal({ ...goal, type })}
                                >
                                  Edit
                                </button>
                                <button
                                  style={styles.deleteButton}
                                  onClick={() => deleteGoal(type, goal.id)}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Players Tab */}
                {adminTab === 'players' && (
                  <div style={{ ...styles.resetSection, borderColor: '#a855f7' }}>
                    <h3 style={{ ...styles.resetSectionTitle, color: '#a855f7' }}>👥 Player Management</h3>

                    {/* Player Selector */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Select Player</label>
                      <select
                        style={{
                          ...styles.select,
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '0.9rem',
                        }}
                        value={selectedPlayerId || ''}
                        onChange={e => {
                          setSelectedPlayerId(e.target.value || null);
                          const player = teamPlayers.find(p => p.id === e.target.value);
                          setPlayerPointsInput(player ? String(player.personalPoints) : '');
                        }}
                      >
                        <option value="">Choose a player...</option>
                        {teamPlayers.map(player => (
                          <option key={player.id} value={player.id}>
                            {player.displayName} ({player.username}) - ⭐ {player.personalPoints}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Selected Player Info & Actions */}
                    {selectedPlayerId && (() => {
                      const player = teamPlayers.find(p => p.id === selectedPlayerId);
                      if (!player) return null;

                      return (
                        <div style={{
                          background: 'rgba(168, 85, 247, 0.1)',
                          borderRadius: '8px',
                          padding: '1rem',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                        }}>
                          {/* Player Info Header */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '1rem',
                            paddingBottom: '1rem',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                          }}>
                            <div style={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              background: player.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.2rem',
                              fontWeight: 'bold',
                              color: '#fff',
                            }}>
                              {player.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                {player.displayName}
                              </div>
                              <div style={{ color: '#888', fontSize: '0.8rem' }}>
                                {player.isOnline ? '🟢 Online' : '⚫ Offline'} • Ship Lv.{player.shipLevel} • Planet Lv.{player.planetSizeLevel}
                              </div>
                            </div>
                          </div>

                          {/* Points Adjustment */}
                          <div style={{ marginBottom: '1rem' }}>
                            <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Points</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="number"
                                style={{
                                  ...styles.input,
                                  flex: 1,
                                  padding: '10px 12px',
                                }}
                                value={playerPointsInput}
                                onChange={e => setPlayerPointsInput(e.target.value)}
                                placeholder="Enter points..."
                              />
                              <button
                                style={{
                                  ...styles.saveButton,
                                  padding: '10px 16px',
                                  whiteSpace: 'nowrap',
                                }}
                                onClick={() => {
                                  const points = parseInt(playerPointsInput, 10);
                                  if (!isNaN(points) && points >= 0) {
                                    setPlayerPoints(selectedPlayerId, points);
                                  }
                                }}
                              >
                                Set Points
                              </button>
                            </div>
                          </div>

                          {/* Individual Reset Actions */}
                          <div style={{ marginBottom: '0.5rem' }}>
                            <label style={{ ...styles.label, marginBottom: '8px', display: 'block' }}>Reset Actions</label>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(2, 1fr)',
                              gap: '8px',
                            }}>
                              <button
                                style={{
                                  ...styles.resetButtonSmall,
                                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                }}
                                onClick={() => resetPlayerPoints(selectedPlayerId)}
                              >
                                💰 Reset Points
                              </button>
                              <button
                                style={{
                                  ...styles.resetButtonSmall,
                                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                }}
                                onClick={() => resetPlayerShip(selectedPlayerId)}
                              >
                                🚀 Reset Ship
                              </button>
                              <button
                                style={{
                                  ...styles.resetButtonSmall,
                                  background: 'linear-gradient(135deg, #a855f7, #9333ea)',
                                }}
                                onClick={() => resetPlayerPlanet(selectedPlayerId)}
                              >
                                🌍 Reset Planet
                              </button>
                              <button
                                style={{
                                  ...styles.resetButtonSmall,
                                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                }}
                                onClick={() => resetPlayerAll(selectedPlayerId)}
                              >
                                🗑️ Reset All
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {!selectedPlayerId && (
                      <p style={{ color: '#666', textAlign: 'center', padding: '2rem 0' }}>
                        Select a player to manage their data
                      </p>
                    )}
                  </div>
                )}

                {/* Notion Tab */}
                {adminTab === 'notion' && (
                  <div style={{ ...styles.resetSection, borderColor: '#00c8ff' }}>
                    <h3 style={{ ...styles.resetSectionTitle, color: '#00c8ff' }}>📋 Notion Sync</h3>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
                      Sync planets with Notion database. Creates missing planets and removes deleted ones.
                    </p>
                    <button
                      style={{
                        ...styles.resetButtonSmall,
                        background: isSyncingNotion ? '#333' : 'linear-gradient(135deg, #00c8ff, #0088cc)',
                        color: '#fff',
                        width: '100%',
                      }}
                      onClick={syncWithNotion}
                      disabled={isSyncingNotion}
                    >
                      {isSyncingNotion ? '🔄 Syncing...' : '🔄 Sync with Notion'}
                    </button>
                    {syncResult && (
                      <div style={{ marginTop: '12px' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            padding: '8px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '6px',
                          }}
                          onClick={() => setShowSyncDetails(!showSyncDetails)}
                        >
                          <span style={{ fontSize: '12px', color: '#aaa' }}>
                            ✅ {syncResult.created.length} | 🔄 {syncResult.updated.length} | 🗑️ {syncResult.deleted.length} | ❌ {syncResult.errors.length}
                          </span>
                          <span style={{ color: '#888' }}>{showSyncDetails ? '▲' : '▼'}</span>
                        </div>
                        {showSyncDetails && (
                          <div style={{
                            marginTop: '8px',
                            padding: '10px',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: '6px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            fontSize: '11px',
                          }}>
                            {syncResult.created.length > 0 && (
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>✅ Created ({syncResult.created.length}):</div>
                                {syncResult.created.map((name, i) => (
                                  <div key={i} style={{ color: '#888', paddingLeft: '10px' }}>• {name}</div>
                                ))}
                              </div>
                            )}
                            {syncResult.updated.length > 0 && (
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ color: '#60a5fa', fontWeight: 'bold', marginBottom: '4px' }}>🔄 Updated ({syncResult.updated.length}):</div>
                                {syncResult.updated.map((name, i) => (
                                  <div key={i} style={{ color: '#888', paddingLeft: '10px' }}>• {name}</div>
                                ))}
                              </div>
                            )}
                            {syncResult.deleted.length > 0 && (
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ color: '#f97316', fontWeight: 'bold', marginBottom: '4px' }}>🗑️ Deleted ({syncResult.deleted.length}):</div>
                                {syncResult.deleted.map((name, i) => (
                                  <div key={i} style={{ color: '#888', paddingLeft: '10px' }}>• {name}</div>
                                ))}
                              </div>
                            )}
                            {syncResult.errors.length > 0 && (
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '4px' }}>❌ Errors ({syncResult.errors.length}):</div>
                                {syncResult.errors.map((err, i) => (
                                  <div key={i} style={{ color: '#888', paddingLeft: '10px', wordBreak: 'break-word' }}>• {err}</div>
                                ))}
                              </div>
                            )}
                            {syncResult.created.length === 0 && syncResult.updated.length === 0 && syncResult.deleted.length === 0 && syncResult.errors.length === 0 && (
                              <div style={{ color: '#888' }}>Everything is in sync!</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Reset Tab */}
                {adminTab === 'reset' && (
                  <div style={styles.resetSection}>
                    <h3 style={styles.resetSectionTitle}>Reset All Players</h3>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
                      These actions affect ALL players in the team.
                    </p>

                    <div style={styles.resetGrid}>
                      <button style={styles.resetButtonSmall} onClick={resetPoints}>
                        💰 Reset Points
                      </button>
                      <button style={styles.resetButtonSmall} onClick={resetShipUpgrades}>
                        🚀 Reset Ships
                      </button>
                      <button style={styles.resetButtonSmall} onClick={resetPlanetProgress}>
                        🌍 Reset Progress
                      </button>
                      <button style={styles.resetButtonSmall} onClick={resetPlanetUpgrades}>
                        🔧 Reset Planet Upgrades
                      </button>
                      <button style={styles.resetButtonSmall} onClick={resetCustomPlanets}>
                        🪐 Delete Custom Planets
                      </button>
                      <button style={styles.resetButtonSmall} onClick={resetGoals}>
                        🎯 Reset Goals
                      </button>
                    </div>

                    <div style={styles.resetDivider} />

                    <button style={styles.resetButton} onClick={resetEverything}>
                      🗑️ Reset Everything
                    </button>
                    <p style={styles.resetWarning}>
                      Resets all of the above (points, ships, planets, goals)
                    </p>

                    <div style={styles.resetDivider} />

                    <h3 style={styles.resetSectionTitle}>Data Migration</h3>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
                      One-time migration from localStorage to Supabase. Run this once to sync your local data.
                    </p>
                    <button
                      style={{
                        ...styles.resetButtonSmall,
                        background: migrationStatus ? (migrationStatus.includes('complete') ? '#22c55e' : '#ef4444') : '#3b82f6',
                        width: '100%',
                      }}
                      onClick={async () => {
                        setMigrationStatus('Migrating...');
                        const result = await migrateFromLocalStorage();
                        setMigrationStatus(result.message);
                      }}
                      disabled={migrationStatus === 'Migrating...'}
                    >
                      {migrationStatus === 'Migrating...' ? '⏳ Migrating...' : '📤 Migrate Local Data to Supabase'}
                    </button>
                    {migrationStatus && migrationStatus !== 'Migrating...' && (
                      <p style={{
                        color: migrationStatus.includes('complete') || migrationStatus.includes('already') ? '#4ade80' : '#ef4444',
                        fontSize: '12px',
                        marginTop: '8px',
                      }}>
                        {migrationStatus}
                      </p>
                    )}
                  </div>
                )}

                <button style={styles.cancelButton} onClick={() => setShowSettings(false)}>
                  Close
                </button>
              </>
            ) : (
              /* Edit Goal Form */
              <div style={styles.editGoalForm}>
                <h3 style={{ color: '#fff', marginBottom: '1rem' }}>
                  Edit {editingGoal.type} goal
                </h3>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Name</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editingGoal.name}
                    onChange={e => setEditingGoal({ ...editingGoal, name: e.target.value })}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Description</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editingGoal.description}
                    onChange={e => setEditingGoal({ ...editingGoal, description: e.target.value })}
                  />
                </div>

                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Size (Points)</label>
                    <select
                      style={styles.select}
                      value={editingGoal.size}
                      onChange={e => setEditingGoal({ ...editingGoal, size: e.target.value })}
                    >
                      <option value="small">Small (50 pts)</option>
                      <option value="medium">Medium (100 pts)</option>
                      <option value="big">Big (200 pts)</option>
                    </select>
                  </div>

                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Real World Reward (optional)</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editingGoal.realWorldReward || ''}
                    onChange={e => setEditingGoal({ ...editingGoal, realWorldReward: e.target.value })}
                    placeholder="e.g., +$1,000/month salary increase"
                  />
                </div>

                <div style={styles.modalButtons}>
                  <button style={styles.cancelButton} onClick={() => setEditingGoal(null)}>
                    Cancel
                  </button>
                  <button
                    style={styles.saveButton}
                    onClick={() => {
                      updateGoal(editingGoal.type, editingGoal.id, {
                        name: editingGoal.name,
                        description: editingGoal.description,
                        size: editingGoal.size,
                        realWorldReward: editingGoal.realWorldReward,
                      });
                      setEditingGoal(null);
                    }}
                  >
                    Save Goal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' },
  canvas: { display: 'block', width: '100%', height: '100%' },
  welcome: {
    width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(180deg, #0a0a12 0%, #1a1a2e 100%)',
    color: '#fff', textAlign: 'center', padding: '2rem', overflow: 'auto',
  },
  logo: { height: 60, marginBottom: '1rem' },
  title: {
    fontFamily: 'Orbitron, sans-serif', fontSize: '3rem', fontWeight: 700, margin: 0,
    background: 'linear-gradient(90deg, #ffa500, #ff6b4a)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  subtitle: { fontFamily: 'Space Grotesk', fontSize: '1.25rem', color: '#8888aa', marginBottom: '1rem' },
  shipPreviewLarge: {
    width: 120, height: 120, borderRadius: 16, overflow: 'hidden',
    border: '2px solid rgba(255, 165, 0, 0.5)', background: 'rgba(0,0,0,0.3)',
    marginBottom: '1rem', position: 'relative',
  },
  shipPreviewImage: { width: '100%', height: '100%', objectFit: 'cover' },
  shipUpgradeCount: {
    position: 'absolute', bottom: 4, left: 0, right: 0,
    fontSize: '0.7rem', color: '#ffa500', background: 'rgba(0,0,0,0.7)', padding: '2px',
  },
  teamPointsDisplay: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    background: 'rgba(84, 144, 255, 0.1)', border: '1px solid #5490ff',
    padding: '0.75rem 1.5rem', borderRadius: 30, marginBottom: '1rem',
  },
  pointsIcon: { fontSize: '1.5rem' },
  pointsValue: { fontSize: '1.5rem', fontWeight: 700, color: '#5490ff', fontFamily: 'Orbitron' },
  pointsLabel: { fontSize: '0.8rem', color: '#888' },
  userGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', maxWidth: 400 },
  userButton: {
    background: 'rgba(255,255,255,0.05)', border: '2px solid', borderRadius: 12, padding: '1rem',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    color: '#fff', fontSize: '1rem', transition: 'transform 0.2s',
  },
  userEmoji: {
    width: 50, height: 50, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700,
  },
  instructions: {
    background: 'rgba(255,255,255,0.05)', padding: '1rem 1.5rem', borderRadius: 12,
    marginBottom: '1rem', fontSize: '0.85rem', color: '#aaa', lineHeight: 1.6,
  },
  welcomeButtons: { display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' },
  startButton: {
    background: 'linear-gradient(90deg, #ffa500, #ff6b4a)', border: 'none', color: '#fff',
    padding: '1rem 2.5rem', fontSize: '1.1rem', fontFamily: 'Orbitron', fontWeight: 600,
    borderRadius: 30, cursor: 'pointer', boxShadow: '0 0 30px rgba(255,165,0,0.3)',
  },
  secondaryButton: {
    background: 'transparent', border: '2px solid #ffa500', color: '#ffa500',
    padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontFamily: 'Space Grotesk', fontWeight: 600,
    borderRadius: 30, cursor: 'pointer',
  },
  switchUserButton: {
    background: 'transparent', border: 'none', color: '#666', fontSize: '0.8rem',
    cursor: 'pointer', marginTop: '1rem', textDecoration: 'underline',
  },
  progress: { marginTop: '0.5rem', color: '#555', fontSize: '0.8rem' },
  hud: { position: 'absolute', top: 20, left: 20, display: 'flex', alignItems: 'center', gap: '0.75rem' },
  hudLogo: { height: 30 },
  hudText: { fontFamily: 'Space Grotesk', fontSize: '1rem', fontWeight: 600, color: '#fff' },
  stats: { position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '2rem' },
  statItem: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  statValue: { fontFamily: 'Orbitron', fontSize: '1.25rem', fontWeight: 700, color: '#ffa500' },
  statLabel: { fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' },
  robotPreview: {
    position: 'absolute', bottom: 20, right: 20, width: 80, height: 80, borderRadius: 12,
    overflow: 'hidden', border: '2px solid rgba(255,165,0,0.3)', background: 'rgba(0,0,0,0.5)',
    cursor: 'pointer', transition: 'border-color 0.2s',
  },
  muteButton: {
    position: 'absolute', bottom: 110, right: 20, width: 40, height: 40, borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)',
    color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  robotImage: { width: '100%', height: '100%', objectFit: 'cover' },
  upgradeOverlay: { position: 'absolute', bottom: 110, right: 20, zIndex: 100 },
  upgradeBox: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.8)',
    padding: '0.75rem 1rem', borderRadius: 20, border: '1px solid #ffa500', color: '#ffa500', fontSize: '0.8rem',
  },
  spinner: {
    width: 14, height: 14, border: '2px solid rgba(255,165,0,0.3)', borderTopColor: '#ffa500',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#1a1a2e', borderRadius: 16, padding: '2rem', width: '90%', maxWidth: 500,
    maxHeight: '90vh', overflowY: 'auto', border: '1px solid #333',
  },
  modalTitle: { fontFamily: 'Orbitron', fontSize: '1.5rem', color: '#ffa500', marginTop: 0, marginBottom: '1rem' },
  shopPoints: { color: '#5490ff', fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 600 },
  shopGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' },
  shopItem: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 12, padding: '1rem',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    transition: 'border-color 0.2s',
  },
  shopIcon: { fontSize: '2rem' },
  shopName: { fontWeight: 600, color: '#fff' },
  shopCost: { color: '#5490ff', fontSize: '0.9rem' },
  shopDesc: { color: '#666', fontSize: '0.75rem', textAlign: 'center' },
  upgradeForm: { marginBottom: '1rem' },
  upgradeTitle: { color: '#fff', marginBottom: '0.5rem' },
  upgradeHint: { color: '#888', fontSize: '0.85rem', marginBottom: '0.75rem' },
  shopSection: {
    background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '1rem',
    marginBottom: '1rem', border: '1px solid #333',
  },
  shopSectionTitle: {
    color: '#fff', fontSize: '1rem', fontWeight: 600, marginTop: 0, marginBottom: '0.5rem',
  },
  effectsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem',
  },
  effectItem: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 8,
    padding: '0.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '0.25rem', transition: 'border-color 0.2s',
  },
  effectLane: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.6rem 0.75rem',
    marginBottom: '0.5rem', border: '1px solid rgba(255,255,255,0.06)',
  },
  effectLaneLabel: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '0.85rem',
    fontWeight: 500, minWidth: 70,
  },
  effectLaneIcon: { fontSize: '1rem' },
  effectLaneContent: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
  },
  effectLaneValue: {
    color: '#ffa500', fontSize: '0.8rem', fontWeight: 600, minWidth: 40, textAlign: 'right',
  },
  effectBuyButton: {
    padding: '0.35rem 0.6rem', background: 'rgba(84, 144, 255, 0.2)', border: '1px solid #5490ff',
    borderRadius: 6, color: '#5490ff', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  effectMaxed: {
    padding: '0.35rem 0.6rem', background: 'rgba(255, 165, 0, 0.15)', border: '1px solid #ffa500',
    borderRadius: 6, color: '#ffa500', fontSize: '0.7rem', fontWeight: 600,
  },
  speedDots: {
    display: 'flex', gap: '4px', alignItems: 'center',
  },
  speedDot: {
    width: 10, height: 10, borderRadius: '50%', transition: 'background 0.2s',
  },
  effectLaneItems: {
    display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1,
  },
  effectItemSmall: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid #333', borderRadius: 6,
    padding: '0.35rem 0.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '0.15rem', transition: 'border-color 0.2s, background 0.2s',
    minWidth: 52,
  },
  upgradeInput: {
    width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
    borderRadius: 8, color: '#fff', fontSize: '1rem', resize: 'none', boxSizing: 'border-box',
  },
  galleryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' },
  galleryItem: {
    background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', border: '1px solid #333',
  },
  galleryImageWrapper: {
    position: 'relative',
  },
  galleryImage: { width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' },
  downloadButton: {
    position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(0,0,0,0.7)', border: '1px solid #555', color: '#fff',
    fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  currentShipBadge: {
    position: 'absolute', bottom: 4, left: 4, right: 4, textAlign: 'center',
    background: 'rgba(255, 165, 0, 0.9)', color: '#000', fontSize: '0.65rem',
    fontWeight: 600, padding: '2px 0', borderRadius: 4,
  },
  galleryInfo: { padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  galleryPlanet: { fontSize: '0.75rem', color: '#fff', fontWeight: 600 },
  galleryMeta: { fontSize: '0.65rem', color: '#666' },
  formGroup: { marginBottom: '1rem' },
  formRow: { display: 'flex', gap: '1rem' },
  label: {
    display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    width: '100%', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: '1rem',
    outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer',
  },
  imageOptions: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  imageUpload: { display: 'flex' },
  uploadButton: {
    padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid #444',
    borderRadius: 8, color: '#aaa', cursor: 'pointer', fontSize: '0.9rem',
  },
  aiGenerate: { display: 'flex', gap: '0.5rem' },
  generateButton: {
    padding: '0.75rem 1rem', background: '#5490ff', border: 'none', borderRadius: 8,
    color: '#fff', cursor: 'pointer', fontSize: '0.9rem',
  },
  imagePreview: { marginTop: '1rem', width: 100, height: 100, borderRadius: 8, overflow: 'hidden', border: '1px solid #333' },
  previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
  modalButtons: { display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' },
  cancelButton: {
    padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid #444',
    borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: '1rem',
  },
  saveButton: {
    padding: '0.75rem 1.5rem', background: 'linear-gradient(90deg, #ffa500, #ff6b4a)',
    border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 600,
  },
  goalsSection: {
    marginBottom: '1.5rem',
  },
  goalsSectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem',
  },
  goalsSectionTitle: {
    margin: 0, fontSize: '1rem', fontWeight: 600,
  },
  addGoalButton: {
    background: 'rgba(255,255,255,0.1)', border: '1px solid #444', borderRadius: 6,
    color: '#888', fontSize: '0.75rem', padding: '0.25rem 0.5rem', cursor: 'pointer',
  },
  goalsList: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 200, overflowY: 'auto',
  },
  goalItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '0.5rem 0.75rem',
    borderLeft: '3px solid', fontSize: '0.85rem',
  },
  goalInfo: {
    display: 'flex', flexDirection: 'column', gap: '0.15rem',
  },
  goalName: {
    color: '#fff', fontWeight: 500,
  },
  goalSize: {
    color: '#666', fontSize: '0.7rem', textTransform: 'uppercase',
  },
  goalActions: {
    display: 'flex', gap: '0.5rem',
  },
  editButton: {
    background: 'transparent', border: '1px solid #5490ff', borderRadius: 4,
    color: '#5490ff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', cursor: 'pointer',
  },
  deleteButton: {
    background: 'transparent', border: '1px solid #ff4444', borderRadius: 4,
    color: '#ff4444', fontSize: '0.8rem', padding: '0.2rem 0.4rem', cursor: 'pointer', fontWeight: 'bold',
  },
  resetSection: {
    marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #333', textAlign: 'center',
  },
  resetSectionTitle: {
    color: '#ff6666', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  resetGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem',
  },
  resetButtonSmall: {
    background: 'rgba(255, 68, 68, 0.15)', border: '1px solid #ff4444', borderRadius: 6,
    color: '#ff6666', fontSize: '0.75rem', padding: '0.5rem 0.5rem', cursor: 'pointer', fontWeight: 500,
    transition: 'background 0.2s, border-color 0.2s',
  },
  resetDivider: {
    height: 1, background: '#333', margin: '1rem 0',
  },
  resetButton: {
    background: '#ff4444', border: 'none', borderRadius: 8,
    color: '#fff', fontSize: '1rem', padding: '0.75rem 1.5rem', cursor: 'pointer', fontWeight: 600,
  },
  resetWarning: {
    color: '#888', fontSize: '0.75rem', marginTop: '0.5rem',
  },
  editGoalForm: {
    padding: '0.5rem 0',
  },
  historyItem: {
    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem',
    background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: '0.5rem',
  },
  historyThumb: {
    width: 40, height: 40, borderRadius: 8, objectFit: 'cover',
  },
  historyInfo: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem',
  },
  historyDesc: {
    color: '#fff', fontSize: '0.85rem',
  },
  historyDate: {
    color: '#666', fontSize: '0.7rem',
  },
  // Multiplayer styles
  multiplayerIndicator: {
    display: 'flex', alignItems: 'center', gap: '0.25rem',
    marginLeft: '1rem', padding: '0.25rem 0.5rem',
    background: 'rgba(0,0,0,0.3)', borderRadius: 12,
    fontSize: '0.75rem',
  },
  multiplayerButtons: {
    position: 'absolute', top: 20, right: 180, display: 'flex', gap: '0.5rem',
  },
  leaderboardButton: {
    background: 'rgba(255,200,0,0.15)', border: '1px solid rgba(255,200,0,0.3)',
    borderRadius: 8, padding: '0.4rem 0.75rem', color: '#ffc800', fontSize: '0.8rem',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
  },
  toast: {
    position: 'absolute', top: 70, right: 180, background: 'rgba(74, 222, 128, 0.9)',
    color: '#000', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem',
    fontWeight: 600, animation: 'fadeIn 0.3s ease',
  },
  pointToast: {
    position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.9)', border: '1px solid #4ade80',
    color: '#fff', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem',
    display: 'flex', alignItems: 'center', animation: 'fadeIn 0.3s ease',
  },
  onlinePlayers: {
    position: 'absolute', left: 20, top: 70, background: 'rgba(0,0,0,0.7)',
    borderRadius: 8, padding: '0.5rem', minWidth: 120, border: '1px solid rgba(255,255,255,0.1)',
  },
  onlinePlayersTitle: {
    color: '#888', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem',
    letterSpacing: '0.1em',
  },
  onlinePlayer: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0',
    color: '#fff', fontSize: '0.8rem',
  },
  onlinePlayerDot: {
    width: 8, height: 8, borderRadius: '50%',
  },
};

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  button:hover { transform: scale(1.02); }
  select option { background: #1a1a2e; }
  .hidden-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .hidden-scrollbar::-webkit-scrollbar { display: none; }
`;
document.head.appendChild(styleSheet);

export default App;
