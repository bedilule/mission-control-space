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
import { QuickTaskModal } from './components/QuickTaskModal';
import { ReassignTaskModal } from './components/ReassignTaskModal';
import { EditTaskModal } from './components/EditTaskModal';
import type { EditTaskUpdates } from './components/EditTaskModal';
import { LandedPlanetModal } from './components/LandedPlanetModal';
import type { PlayerInfo } from './components/LandedPlanetModal';
import { ControlHubDashboard } from './components/ControlHubDashboard';
import { WarpTransition } from './components/WarpTransition';
import { voiceService } from './services/VoiceService';
import type { GreetingContext } from './services/VoiceService';

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

const TEST_PLAYER_ID = 'testpilot';
const isTestPlayer = (username: string) => username === TEST_PLAYER_ID;

// Points awarded per milestone size
const POINTS_PER_SIZE = { small: 50, medium: 100, big: 200 };

// AI visual upgrade cost
const VISUAL_UPGRADE_COST = 150;

// Sell prices (half of original cost)
const VISUAL_UPGRADE_SELL_PRICE = 75;  // Half of 150
const TERRAFORM_SELL_PRICE = 50;       // Half of 100

// Programmatic ship effects (no AI needed - instant purchase)
// Size upgrades: 10 levels with increasing costs (ship)
const SIZE_COSTS = [50, 100, 180, 300, 450, 650, 900, 1200, 1600, 2100]; // Cost per level (Total: 7,530)

// Speed upgrades: 10 levels with increasing costs
const SPEED_COSTS = [40, 80, 150, 250, 400, 600, 850, 1150, 1500, 2000]; // Cost per level (Total: 7,020)

// Landing speed upgrades: 5 levels with increasing costs
const LANDING_SPEED_COSTS = [50, 100, 175, 275, 400]; // Cost per level (Total: 1,000)

// Planet size upgrades: 5 levels with increasing costs
const PLANET_SIZE_COSTS = [75, 150, 250, 375, 525]; // Cost per level (Total: 1,375)

const GLOW_EFFECTS = [
  { id: 'glow_orange', name: 'Orange', icon: '🟠', cost: 50, value: '#ff8800' },
  { id: 'glow_blue', name: 'Blue', icon: '🔵', cost: 50, value: '#00aaff' },
  { id: 'glow_purple', name: 'Purple', icon: '🟣', cost: 75, value: '#aa00ff' },
  { id: 'glow_green', name: 'Green', icon: '🟢', cost: 100, value: '#00ff88' },
];

const TRAIL_EFFECTS = [
  { id: 'trail_fire', name: 'Fire', icon: '🔥', cost: 75, value: 'fire' },
  { id: 'trail_ice', name: 'Ice', icon: '❄️', cost: 100, value: 'ice' },
  { id: 'trail_rainbow', name: 'Rainbow', icon: '🌈', cost: 200, value: 'rainbow' },
];

// Weapon costs (one-time purchases)
const SPACE_RIFLE_COST = 500;
const WARP_DRIVE_COST = 750;
const MISSION_CONTROL_PORTAL_COST = 600;
const SPACE_TNT_COST = 1000;
const PLASMA_CANON_COST = 1500;
const ROCKET_LAUNCHER_COST = 2500;


interface Goal {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'big';
  description?: string;
  realWorldReward?: string;
  points?: number;
  targetDate?: string;
  imageUrl?: string;
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


interface CustomPlanet {
  id: string;
  name: string;
  description?: string;
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
  speedBonus: number; // 0-10 levels, each gives +20% speed
  landingSpeedBonus: number; // 0-5 levels, each gives +15% faster landing
  ownedGlows: string[]; // Owned glow colors
  ownedTrails: string[]; // Owned trail types
  hasDestroyCanon: boolean; // Owns Destroy Canon weapon
  destroyCanonEquipped: boolean; // Canon is equipped and visible on ship
  hasSpaceRifle: boolean; // Owns Space Rifle weapon
  spaceRifleEquipped: boolean; // Space Rifle is equipped
  hasPlasmaCanon: boolean; // Owns Plasma Canon weapon
  plasmaCanonEquipped: boolean; // Plasma Canon is equipped
  hasRocketLauncher: boolean; // Owns Rocket Launcher weapon
  rocketLauncherEquipped: boolean; // Rocket Launcher is equipped
  hasWarpDrive: boolean; // Owns Warp Drive (teleport home with H key)
  hasMissionControlPortal: boolean; // Owns Mission Control Portal (teleport to MC from home)
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
    onBlackHoleDeath: () => void;
    onReassignRequest: (planet: Planet) => void;
    onEditRequest: (planet: Planet) => void;
    onFeatureToggle: (planet: Planet) => void;
    onShopApproach: () => void;
    onCollisionVoice: () => void;
  }>({
    onLand: () => {},
    onTakeoff: () => {},
    onColonize: () => {},
    onClaimRequest: () => {},
    onOpenNotion: () => {},
    onTerraform: () => {},
    onDestroyPlanet: () => {},
    onBlackHoleDeath: () => {},
    onReassignRequest: () => {},
    onEditRequest: () => {},
    onFeatureToggle: () => {},
    onShopApproach: () => {},
    onCollisionVoice: () => {},
  });
  const [state, setState] = useState<SavedState>(loadState);
  const [customPlanets, setCustomPlanets] = useState<CustomPlanet[]>([]); // Loaded from Supabase
  const [teamPoints, setTeamPoints] = useState(0); // Loaded from Supabase via useMultiplayerSync
  const [gameReady, setGameReady] = useState(false); // Track when game is initialized
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [warpComplete, setWarpComplete] = useState(false);
  const [personalPoints, setPersonalPoints] = useState(0);
  const [userShips, setUserShips] = useState<Record<string, UserShip>>(() => {
    try {
      const cached = localStorage.getItem('mission-control-user-ships-cache');
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });
  const [mascotHistory, setMascotHistory] = useState<MascotHistoryEntry[]>([]); // Loaded from Supabase
  const [goals, setGoals] = useState<Goals>({ business: [], product: [], achievement: [] }); // Loaded from Supabase
  const [userPlanets, setUserPlanets] = useState<Record<string, UserPlanet>>({}); // Loaded from Supabase
  const [showTerraform, setShowTerraform] = useState(false);
  const [terraformPrompt, setTerraformPrompt] = useState('');
  const [showShipHistory, setShowShipHistory] = useState(false);
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignPlanet, setReassignPlanet] = useState<Planet | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPlanet, setEditPlanet] = useState<Planet | null>(null);
  const [viewingPlanetOwner, setViewingPlanetOwner] = useState<string | null>(null);
  const [viewingPlanetPreview, setViewingPlanetPreview] = useState<string | null>(null); // Preview image when browsing versions
  const [featuredPlanetIds, setFeaturedPlanetIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('mission-control-featured-tasks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [featuredViewPlanet, setFeaturedViewPlanet] = useState<Planet | null>(null);

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [showUserSelect, setShowUserSelect] = useState(!state.currentUser);
  const [showPlanetCreator, setShowPlanetCreator] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showControlHub, setShowControlHub] = useState(false);
  const [shopTab, setShopTab] = useState<'stats' | 'cosmetics' | 'weapons' | 'utility'>('stats');
  const [musicEnabled, setMusicEnabled] = useState(soundManager.isMusicEnabled());
  const [sfxEnabled, setSfxEnabled] = useState(soundManager.isSfxEnabled());
  const [upgradePrompt, setUpgradePrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showGameSettings, setShowGameSettings] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState<'qwerty' | 'azerty'>(
    () => (localStorage.getItem('mission-control-keyboard-layout') as 'qwerty' | 'azerty') || 'qwerty'
  );
  const [autoOpenNotion, setAutoOpenNotion] = useState(
    () => localStorage.getItem('mission-control-auto-open-notion') === 'true'
  );
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showPointsHistory, setShowPointsHistory] = useState(false);
  const [pointsHistoryTab, setPointsHistoryTab] = useState<'personal' | 'team'>('personal');
  const [pointsHistory, setPointsHistory] = useState<PointTx[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedLeaderboardPlayer, setSelectedLeaderboardPlayer] = useState<{ id: string; displayName: string; color: string; totalEarned: number } | null>(null);
  const [playerBreakdownHistory, setPlayerBreakdownHistory] = useState<PointTx[]>([]);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any | null>(null);
  const [landedPlanet, setLandedPlanet] = useState<Planet | null>(null);
  const [missionFilters, setMissionFilters] = useState<Set<string>>(new Set(['business', 'product', 'notion']));
  const [showMissionFilter, setShowMissionFilter] = useState(false);

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
  const [adminTab, setAdminTab] = useState<'goals' | 'players' | 'activity' | 'notion' | 'reset' | 'debug'>('goals');
  const [activityLog, setActivityLog] = useState<Array<{
    id: string;
    username: string;
    display_name: string;
    event_type: 'login' | 'logout';
    created_at: string;
  }>>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerPointsInput, setPlayerPointsInput] = useState('');
  const [debugShipLevel, setDebugShipLevel] = useState(1);

  // Prompt configs (loaded from JSON)
  const [shipPrompts, setShipPrompts] = useState<ShipPrompts>(DEFAULT_SHIP_PROMPTS);
  const [planetPrompts, setPlanetPrompts] = useState<PlanetPrompts>(DEFAULT_PLANET_PROMPTS);

  // Multiplayer state
  const [pointToast, setPointToast] = useState<PointTx | null>(null);
  const [eventNotification, setEventNotification] = useState<{ message: string; type: 'join' | 'leave' | 'blackhole' | 'upgrade' | 'mission' } | null>(null);
  const positionBroadcastRef = useRef<number>(0);

  // Black hole death messages (randomly selected)
  const blackHoleMessages = [
    '{name} got spaghettified',
    '{name} found out what\'s inside a black hole',
    '{name} crossed the event horizon. RIP.',
    '{name} is now one with the singularity',
    '{name} made a poor life choice',
    '{name} got yeeted into the void',
  ];

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
    effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false, hasSpaceRifle: false, spaceRifleEquipped: false, hasPlasmaCanon: false, plasmaCanonEquipped: false, hasRocketLauncher: false, rocketLauncherEquipped: false },
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
    // Ship data is no longer passed here - it's loaded FROM Supabase via teamPlayers
    // and only written TO Supabase when the user actually purchases upgrades
    onTeamUpdate: (t) => {
      // Sync team state to local
      if (t.teamPoints !== teamPoints) {
        setTeamPoints(t.teamPoints);
      }
    },
    onPlayerJoined: (player) => {
      console.log('Player joined:', player.displayName);
      if (isTestPlayer(player.username)) return;
      setEventNotification({ message: `${player.displayName} warped into the party`, type: 'join' });
      setTimeout(() => setEventNotification(null), 4000);
    },
    onPlayerLeft: (playerId) => {
      console.log('Player left:', playerId);
      const player = teamPlayers.find(p => p.id === playerId);
      if (player && isTestPlayer(player.username)) return;
      const name = player?.displayName || 'Someone';
      setEventNotification({ message: `${name} has left the galaxy`, type: 'leave' });
      setTimeout(() => setEventNotification(null), 4000);
    },
    onPointsEarned: (tx) => {
      // Show toast for points earned by other players (suppress test player)
      const txPlayer = teamPlayers.find(p => p.id === tx.playerId);
      if (txPlayer && isTestPlayer(txPlayer.username)) return;
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
  const { otherPlayers, broadcastPosition, broadcastUpgradeState, broadcastSendStart, broadcastSendTarget, broadcastWeaponFire, broadcastPlanetDestroy, setPositionUpdateCallback, setUpgradeUpdateCallback, setSendAnimationCallback, setWeaponFireCallback, setPlanetDestroyCallback } = usePlayerPositions({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
    players: playersForPositions,
  });

  // Notion planets hook - fetches and syncs planets from Notion tasks
  const {
    gamePlanets: notionGamePlanets,
    completePlanet: completeNotionPlanet,
    claimPlanet: claimNotionPlanet,
    reassignPlanet: reassignNotionPlanet,
    updatePlanet: updateNotionPlanet,
  } = useNotionPlanets({
    teamId: team?.id || null,
    onPlanetCreated: (planet) => {
      setEventNotification({ message: `New mission: ${planet.name}`, type: 'mission' });
      setTimeout(() => setEventNotification(null), 4000);
    },
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
  } = useSupabaseData({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
    username: state.currentUser || 'anonymous',
  });

  // Next missions - up to 5 closest upcoming dated, uncompleted goals (filtered by type)
  // Includes overdue missions (past dates) — they sort first and show as "Xd late"
  const nextMissions = useMemo(() => {
    const entries: { name: string; targetDate: string; type: string }[] = [];
    for (const type of ['business', 'product'] as const) {
      if (!missionFilters.has(type)) continue;
      for (const goal of goals[type]) {
        if (goal.targetDate && !state.completedPlanets.includes(goal.id)) {
          entries.push({ name: goal.name, targetDate: goal.targetDate, type });
        }
      }
    }
    // Include notion planets if filter is on
    if (missionFilters.has('notion')) {
      const currentUser = state.currentUser?.toLowerCase();
      const notionWithDates = notionGamePlanets.filter(np => np.targetDate && !np.completed && np.ownerId?.toLowerCase() === currentUser);
      for (const np of notionWithDates) {
        entries.push({ name: np.name, targetDate: np.targetDate!, type: 'notion' });
      }
    }
    if (entries.length === 0) return null;
    entries.sort((a, b) =>
      new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
    );
    const result = entries.slice(0, 5).map(({ name, targetDate, type }) => {
      const daysLeft = Math.ceil((new Date(targetDate + 'T00:00:00').getTime() - Date.now()) / 86400000);
      let urgencyColor: string;
      if (daysLeft <= 0) urgencyColor = '#ff4444';
      else if (daysLeft <= 3) urgencyColor = '#ffa500';
      else if (daysLeft <= 7) urgencyColor = '#dddd00';
      else if (daysLeft <= 14) urgencyColor = '#aadd00';
      else urgencyColor = '#4ade80';
      return { name, daysLeft, urgencyColor, type };
    });
    return result;
  }, [goals, state.completedPlanets, missionFilters, notionGamePlanets]);

  // Prompt history hook - tracks all AI generation prompts
  const { recordPrompt } = usePromptHistory({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
  });

  // Fetch full points history when modal opens
  const fetchPointsHistory = useCallback(async (type: 'personal' | 'team') => {
    if (!team?.id) {
      console.log('[fetchPointsHistory] No team ID');
      return;
    }

    // For personal view, we need the player ID
    if (type === 'personal' && !currentDbPlayerId) {
      console.log('[fetchPointsHistory] No player ID for personal view');
      return;
    }

    console.log('[fetchPointsHistory] Fetching', type, 'history. teamId:', team.id, 'playerId:', currentDbPlayerId);

    setIsLoadingHistory(true);
    try {
      let query = supabase
        .from('point_transactions')
        .select('*, players(display_name)')
        .eq('team_id', team.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (type === 'personal' && currentDbPlayerId) {
        // Get current player's transactions (they performed or earned)
        query = query.eq('player_id', currentDbPlayerId);
      }
      // For team, get all transactions (no filter on player_id)

      const { data, error } = await query;

      console.log('[fetchPointsHistory] Result:', {
        type,
        teamId: team.id,
        playerId: currentDbPlayerId,
        error,
        count: data?.length,
        transactions: data?.map(t => ({
          source: t.source,
          points: t.points,
          task: t.task_name,
          player_id: t.player_id,
        })),
      });

      if (error) {
        console.error('Failed to fetch points history:', error);
        return;
      }

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = data.map((t: any) => ({
          id: t.id,
          teamId: t.team_id,
          playerId: t.player_id,
          playerName: t.players?.display_name || undefined,
          source: t.source,
          notionTaskId: t.notion_task_id,
          taskName: t.task_name,
          points: t.points,
          createdAt: t.created_at,
        }));
        setPointsHistory(mapped);
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [team?.id, currentDbPlayerId]);

  // Fetch positive points breakdown for a specific player (for leaderboard click)
  const fetchPlayerBreakdown = useCallback(async (playerId: string) => {
    if (!team?.id) return;

    setIsLoadingBreakdown(true);
    try {
      const { data, error } = await supabase
        .from('point_transactions')
        .select('*, players(display_name)')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .gt('points', 0) // Only positive points for leaderboard breakdown
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Failed to fetch player breakdown:', error);
        return;
      }

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = data.map((t: any) => ({
          id: t.id,
          teamId: t.team_id,
          playerId: t.player_id,
          playerName: t.players?.display_name || undefined,
          source: t.source,
          notionTaskId: t.notion_task_id,
          taskName: t.task_name,
          points: t.points,
          createdAt: t.created_at,
        }));
        setPlayerBreakdownHistory(mapped);
      }
    } finally {
      setIsLoadingBreakdown(false);
    }
  }, [team?.id]);

  // Sync notion planets to game (store ref for immediate sync on game init)
  const notionPlanetsRef = useRef(notionGamePlanets);
  notionPlanetsRef.current = notionGamePlanets;

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.syncNotionPlanets(notionGamePlanets);
    }
  }, [notionGamePlanets]);

  // Sync featured planet IDs to game engine for visual star indicator
  useEffect(() => {
    gameRef.current?.setFeaturedPlanetIds(featuredPlanetIds);
  }, [featuredPlanetIds]);

  // Cleanup stale featured IDs when planets change (deleted planets)
  useEffect(() => {
    if (featuredPlanetIds.size === 0) return;
    const notionIds = new Set(notionGamePlanets.map(p => p.id));
    const staleIds = [...featuredPlanetIds].filter(id => !notionIds.has(id));
    if (staleIds.length > 0) {
      setFeaturedPlanetIds(prev => {
        const next = new Set(prev);
        staleIds.forEach(id => next.delete(id));
        localStorage.setItem('mission-control-featured-tasks', JSON.stringify([...next]));
        return next;
      });
    }
  }, [notionGamePlanets, featuredPlanetIds]);

  // Update featuredViewPlanet reference when planet data changes (realtime updates)
  useEffect(() => {
    if (!featuredViewPlanet) return;
    const updated = notionGamePlanets.find(p => p.id === featuredViewPlanet.id);
    if (!updated) {
      setFeaturedViewPlanet(null); // Planet was deleted
    } else if (updated !== featuredViewPlanet) {
      setFeaturedViewPlanet(updated);
    }
  }, [notionGamePlanets, featuredViewPlanet]);

  // Set up direct position update callback (bypasses React state for smoother movement)
  // Uses refs to always call the latest game instance, avoiding stale closure issues
  const positionCallbackRef = useRef<((playerId: string, data: { x: number; y: number; vx: number; vy: number; rotation: number; thrusting: boolean; boosting: boolean; timestamp: number }) => void) | null>(null);
  const upgradeCallbackRef = useRef<((playerId: string, data: { isUpgrading: boolean; targetPlanetId: string | null }) => void) | null>(null);
  const sendAnimCallbackRef = useRef<((playerId: string, data: { type: 'start' | 'target'; planetId: string; velocityX?: number; velocityY?: number; targetX?: number; targetY?: number }) => void) | null>(null);
  const weaponFireCallbackRef = useRef<((playerId: string, data: { weaponType: 'rifle' | 'plasma' | 'rocket'; x: number; y: number; vx: number; vy: number; rotation: number; targetPlanetId: string | null }) => void) | null>(null);
  const planetDestroyCallbackRef = useRef<((playerId: string, data: { planetId: string; fromRifle: boolean }) => void) | null>(null);

  // Update callback refs when game is available
  useEffect(() => {
    positionCallbackRef.current = (playerId, data) => {
      gameRef.current?.onPlayerPositionUpdate(playerId, data);
    };
    upgradeCallbackRef.current = (playerId, data) => {
      if (data.isUpgrading) {
        gameRef.current?.setOtherPlayerUpgrading(playerId, data.targetPlanetId);
        // Show notification for other player's upgrade
        const player = teamPlayers.find(p => p.id === playerId);
        const name = player?.displayName || 'Someone';
        const message = data.targetPlanetId
          ? `${name} is terraforming their planet`
          : `${name} is upgrading their ship`;
        setEventNotification({ message, type: 'upgrade' });
        setTimeout(() => setEventNotification(null), 4000);
      } else {
        gameRef.current?.clearOtherPlayerUpgrading(playerId);
      }
    };
    sendAnimCallbackRef.current = (playerId, data) => {
      if (data.type === 'start') {
        gameRef.current?.startRemoteSendAnimation(playerId, data.planetId, data.velocityX ?? 0, data.velocityY ?? 0);
      } else if (data.type === 'target') {
        gameRef.current?.setRemoteSendTarget(data.planetId, data.targetX ?? 0, data.targetY ?? 0);
      }
    };
    weaponFireCallbackRef.current = (playerId, data) => {
      gameRef.current?.onRemoteWeaponFire(playerId, data);
    };
    planetDestroyCallbackRef.current = (playerId, data) => {
      gameRef.current?.onRemotePlanetDestroy(playerId, data);
    };
  }, [teamPlayers]);

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

  useEffect(() => {
    setSendAnimationCallback((playerId, data) => {
      sendAnimCallbackRef.current?.(playerId, data);
    });
    return () => {
      setSendAnimationCallback(null);
    };
  }, [setSendAnimationCallback]);

  useEffect(() => {
    setWeaponFireCallback((playerId, data) => {
      weaponFireCallbackRef.current?.(playerId, data);
    });
    return () => {
      setWeaponFireCallback(null);
    };
  }, [setWeaponFireCallback]);

  useEffect(() => {
    setPlanetDestroyCallback((playerId, data) => {
      planetDestroyCallbackRef.current?.(playerId, data);
    });
    return () => {
      setPlanetDestroyCallback(null);
    };
  }, [setPlanetDestroyCallback]);

  // Update game with other players (for metadata like ship images, effects, etc.)
  // Hide test player's ship from non-test players
  const visibleOtherPlayers = useMemo(() => {
    if (state.currentUser && isTestPlayer(state.currentUser)) return otherPlayers;
    return otherPlayers.filter(p => !isTestPlayer(p.username));
  }, [otherPlayers, state.currentUser]);

  useEffect(() => {
    if (gameRef.current && visibleOtherPlayers.length > 0) {
      gameRef.current.setOtherPlayers(visibleOtherPlayers);
    }
  }, [visibleOtherPlayers]);

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
          baseImage: '/ship-base.png', // Base ship is always the same
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
            hasSpaceRifle: false,
            spaceRifleEquipped: false,
            hasPlasmaCanon: false,
            plasmaCanonEquipped: false,
            hasRocketLauncher: false,
            rocketLauncherEquipped: false,
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
      // Cache to localStorage for instant load next time
      try { localStorage.setItem('mission-control-user-ships-cache', JSON.stringify(merged)); } catch {}
      return merged;
    });
  }, [teamPlayers]);

  // Build playerInfo for LandedPlanetModal (colors + ship images)
  const playerInfoForModal = useMemo((): Record<string, PlayerInfo> => {
    const info: Record<string, PlayerInfo> = {};
    for (const user of USERS) {
      info[user.id] = {
        color: user.color,
        shipImage: userShips[user.id]?.currentImage || '/ship-base.png',
      };
    }
    return info;
  }, [userShips]);

  // Sync current user's ship effects and image to game when they change (e.g., loaded from Supabase)
  useEffect(() => {
    if (!gameRef.current || !state.currentUser) return;
    const currentShip = userShips[state.currentUser];
    if (currentShip?.effects) {
      gameRef.current.updateShipEffects(currentShip.effects);
    }
    if (currentShip?.currentImage) {
      gameRef.current.updateShipImage(currentShip.currentImage, currentShip.upgrades?.length || 0);
    }
  }, [userShips, state.currentUser]);

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

        // Reset all players' personal points to 0
        await supabase
          .from('players')
          .update({ personal_points: 0 })
          .eq('team_id', team.id);
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
            ship_effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false, hasSpaceRifle: false, spaceRifleEquipped: false, hasPlasmaCanon: false, plasmaCanonEquipped: false, hasRocketLauncher: false, rocketLauncherEquipped: false },
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
            planet_history: [],
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

  // Reset Goals completion state (uncomplete all goals)
  const resetGoals = async () => {
    if (!confirm('Reset all goal completion progress? This cannot be undone!')) return;

    try {
      // Get all goal IDs
      const goalIds = [
        ...goals.business.map(g => g.id),
        ...goals.product.map(g => g.id),
        ...goals.achievement.map(g => g.id),
      ];

      // Remove goal IDs from completedPlanets
      const newCompleted = state.completedPlanets.filter(id => !goalIds.includes(id));

      // Update Supabase
      if (team?.id) {
        await supabase
          .from('teams')
          .update({ completed_planets: newCompleted })
          .eq('id', team.id);
      }

      // Update local state
      setState(prev => ({ ...prev, completedPlanets: newCompleted }));

      alert('Goal progress has been reset!');
    } catch (err) {
      console.error('Failed to reset goal progress:', err);
      alert('Failed to reset goal progress. Check console for details.');
    }
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
            personal_points: 0,
            ship_current_image: '/ship-base.png',
            ship_effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false, hasSpaceRifle: false, spaceRifleEquipped: false, hasPlasmaCanon: false, plasmaCanonEquipped: false, hasRocketLauncher: false, rocketLauncherEquipped: false },
            ship_upgrades: [],
            planet_image_url: null,
            planet_terraform_count: 0,
            planet_size_level: 0,
            planet_history: [],
          })
          .eq('team_id', team.id);
      }

      // Reset all local storage
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CUSTOM_PLANETS_KEY);
      localStorage.removeItem(TEAM_POINTS_KEY);
      localStorage.removeItem(USER_SHIPS_KEY);
      localStorage.removeItem(MASCOT_HISTORY_KEY);
      localStorage.removeItem(USER_PLANETS_KEY);

      // Reset all state
      setState({ completedPlanets: [], robotImage: '/ship-base.png', robotDescription: 'A small friendly spaceship', upgradeCount: 0 });
      setCustomPlanets([]);
      setTeamPoints(0);
      setUserShips({});
      setMascotHistory([]);
      setGoals({ business: [], product: [], achievement: [] });
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

  // Reset individual player's points to 0 and clear their leaderboard history
  const resetPlayerPoints = async (playerId: string) => {
    if (!confirm('Reset this player\'s points to 0? This will also reset their leaderboard position.')) return;

    const player = teamPlayers.find(p => p.id === playerId);
    if (!player) return;

    try {
      // Delete all point transactions for this player (resets leaderboard)
      await supabase
        .from('point_transactions')
        .delete()
        .eq('player_id', playerId);

      // Reset personal_points to 0
      await supabase
        .from('players')
        .update({ personal_points: 0 })
        .eq('id', playerId);

      alert(`${player.displayName}'s points and leaderboard position have been reset!`);
    } catch (err) {
      console.error('Failed to reset player points:', err);
      alert('Failed to reset player points. Check console for details.');
    }
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
    if (personalPoints < 50) return;

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
        setPersonalPoints(prev => prev - 50);
        updateRemotePersonalPoints(-50, 'Planet generation');

        const newPlanet = {
          imageUrl: newImageUrl,
          baseImage: newImageUrl, // Store base for reverting later
          terraformCount: 0,
          history: [] as { imageUrl: string; description: string; timestamp: number }[],
          sizeLevel: 0,
        };

        // Update local state immediately AND sync to Supabase
        setUserPlanets(prev => ({ ...prev, [userId]: newPlanet }));
        saveUserPlanetToSupabase(userId, newPlanet);

        gameRef.current?.updateUserPlanetImage(userId, newImageUrl, 0, 0);

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
    if (!terraformPrompt || personalPoints < 100) return;

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
    voiceService.commentOnUpgrade('planet', 'start', promptText);

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

        // Start voice review generation in parallel with saving
        const voicePromise = voiceService.prepareUpgradeReview('planet', promptText, bgRemovedUrl);

        // Save locally
        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(bgRemovedUrl);
        newImageUrl = await saveImageToStorage(base64Image, 'planet', userId, 'terraform', bgRemovedUrl);

        // Deduct personal points and sync to backend
        setPersonalPoints(prev => prev - 100);
        updateRemotePersonalPoints(-100, 'Planet terraforming');

        // Update user's planet
        const newTerraformCount = currentPlanet.terraformCount + 1;
        const newHistory = [...currentPlanet.history, {
          imageUrl: newImageUrl,
          description: promptText,
          timestamp: Date.now(),
        }];

        const updatedPlanet = {
          imageUrl: newImageUrl,
          baseImage: currentPlanet.baseImage,
          terraformCount: newTerraformCount,
          history: newHistory,
          sizeLevel: currentPlanet.sizeLevel,
        };

        // Update local state immediately AND sync to Supabase
        setUserPlanets(prev => ({ ...prev, [userId]: updatedPlanet }));
        saveUserPlanetToSupabase(userId, updatedPlanet);

        // Update in game (with new size)
        gameRef.current?.updateUserPlanetImage(userId, newImageUrl, newTerraformCount, currentPlanet.sizeLevel);
        soundManager.playPlanetUpgrade();

        // Record prompt for history
        recordPrompt({
          promptType: 'planet_terraform',
          promptText: prompt,
          userInput: promptText,
          apiUsed: apiEndpoint,
          sourceImageUrl: currentPlanet.imageUrl,
          resultImageUrl: newImageUrl,
        });

        // Play pre-generated voice (should be ready by now)
        if (voicePromise) {
          const voiceBlob = await voicePromise;
          if (voiceBlob) voiceService.playBlob(voiceBlob);
        }
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
      effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, landingSpeedBonus: 0, ownedGlows: [], ownedTrails: [], hasDestroyCanon: false, destroyCanonEquipped: false, hasSpaceRifle: false, spaceRifleEquipped: false, hasPlasmaCanon: false, plasmaCanonEquipped: false, hasRocketLauncher: false, rocketLauncherEquipped: false },
    };
  };

  // Get a user's planet (checks Supabase data first, then local state, then teamPlayers)
  const getUserPlanet = (userId: string): UserPlanet => {
    // First check supabaseUserPlanets (source of truth from hook)
    const supabasePlanet = supabaseUserPlanets?.[userId];
    if (supabasePlanet?.imageUrl) {
      return {
        imageUrl: supabasePlanet.imageUrl,
        baseImage: supabasePlanet.baseImage,
        terraformCount: supabasePlanet.terraformCount || 0,
        history: supabasePlanet.history || [],
        sizeLevel: supabasePlanet.sizeLevel || 0,
      };
    }

    // Fallback to local userPlanets (for immediate updates before hook syncs)
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
    const updatedPlanet = {
      ...currentPlanet,
      imageUrl,
    };

    // Update local state immediately AND sync to Supabase
    setUserPlanets(prev => ({ ...prev, [userId]: updatedPlanet }));
    saveUserPlanetToSupabase(userId, updatedPlanet);
    gameRef.current?.updateUserPlanetImage(userId, imageUrl);
    soundManager.playSelect();
  };

  // Sell the latest terraformation (refund half the cost)
  const sellLatestTerraform = () => {
    const userId = state.currentUser || '';
    const currentPlanet = getUserPlanet(userId);

    // Must have terraforms to sell
    if (currentPlanet.history.length === 0) return;

    // Get the last terraform entry
    const newHistory = currentPlanet.history.slice(0, -1);
    const newTerraformCount = Math.max(0, currentPlanet.terraformCount - 1);

    // Determine the new image URL (previous in history, base image, or empty for procedural)
    const newImageUrl = newHistory.length > 0
      ? newHistory[newHistory.length - 1].imageUrl
      : (currentPlanet.baseImage || '');

    // Refund half the cost
    setPersonalPoints(prev => prev + TERRAFORM_SELL_PRICE);
    updateRemotePersonalPoints(TERRAFORM_SELL_PRICE, 'Sold terraformation');

    // Update planet state
    const updatedPlanet: typeof currentPlanet = {
      ...currentPlanet,
      imageUrl: newImageUrl,
      terraformCount: newTerraformCount,
      history: newHistory,
    };

    // Update local state and sync to Supabase
    setUserPlanets(prev => ({ ...prev, [userId]: updatedPlanet }));
    saveUserPlanetToSupabase(userId, updatedPlanet);
    gameRef.current?.updateUserPlanetImage(userId, newImageUrl, newTerraformCount, currentPlanet.sizeLevel);
    soundManager.playSelect();
  };

  // Select a ship image from history
  const selectShipFromHistory = (imageUrl: string) => {
    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();

    // Update local state
    setUserShips(prev => ({
      ...prev,
      [userId]: {
        ...currentShip,
        currentImage: imageUrl,
      }
    }));

    // Update the ship in the game canvas
    gameRef.current?.updateShipImage(imageUrl, currentShip.upgrades.length);

    // Sync to Supabase
    updatePlayerData({
      ship_current_image: imageUrl,
    });

    soundManager.playSelect();
  };

  // Sell the latest ship visual upgrade (refund half the cost)
  const sellLatestShipUpgrade = () => {
    // Must have upgrades to sell
    if (mascotHistory.length === 0) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();

    // Get the last upgrade entry
    const lastEntry = mascotHistory[mascotHistory.length - 1];
    const newMascotHistory = mascotHistory.slice(0, -1);

    // Remove the last upgrade ID from userShips
    const newUpgrades = currentShip.upgrades.slice(0, -1);

    // Determine the new image URL (previous in history or base ship)
    const newImageUrl = newMascotHistory.length > 0
      ? newMascotHistory[newMascotHistory.length - 1].imageUrl
      : (currentShip.baseImage || '/ship-base.png');

    // Refund half the cost
    setPersonalPoints(prev => prev + VISUAL_UPGRADE_SELL_PRICE);
    updateRemotePersonalPoints(VISUAL_UPGRADE_SELL_PRICE, 'Sold ship visual upgrade');

    // Update mascot history
    setMascotHistory(newMascotHistory);
    saveMascotHistoryToSupabase(newMascotHistory);

    // Update user ships state
    setUserShips(prev => ({
      ...prev,
      [userId]: {
        ...currentShip,
        upgrades: newUpgrades,
        currentImage: newImageUrl,
      }
    }));

    // Update the ship in the game canvas
    gameRef.current?.updateShipImage(newImageUrl, newUpgrades.length);

    // Sync to Supabase
    updatePlayerData({
      ship_current_image: newImageUrl,
      ship_upgrades: newUpgrades,
    });

    soundManager.playSelect();
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
    updateRemotePersonalPoints(-cost, `Planet size upgrade (level ${newLevel})`);

    const updatedPlanet = {
      ...currentPlanet,
      sizeLevel: newLevel,
    };

    // Update local state immediately AND sync to Supabase
    setUserPlanets(prev => ({ ...prev, [userId]: updatedPlanet }));
    saveUserPlanetToSupabase(userId, updatedPlanet);
    gameRef.current?.updateUserPlanetSize(userId, newLevel);
    soundManager.playPlanetUpgrade();
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

    // Check if this is the Control Hub
    if (planet.id === 'control-hub') {
      setShowControlHub(true);
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
      soundManager.playTaskVoiceLine();

      // Optimistic update: add points instantly (based on priority, stored on planet)
      if (planet.points) {
        setPersonalPoints(prev => prev + planet.points!);
      }

      // Mark as completed in database - backend awards points to assigned player
      completeNotionPlanet(planet.id);

      gameRef.current?.completePlanet(planet.id);
      return;
    }

    if (state.completedPlanets.includes(planet.id)) return;

    fireConfetti(planet.size);

    // Sound: docking celebration
    soundManager.playDockingSound();
    soundManager.playTaskVoiceLine();

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
      // Build shop context for greedy merchant voice
      const currentShip = getCurrentUserShip();
      const effects = currentShip.effects || {};
      const unowned: string[] = [];
      // Weapons
      if (!effects.hasSpaceRifle) unowned.push('Space Rifle');
      if (!effects.hasDestroyCanon) unowned.push('Space TNT');
      if (!effects.hasPlasmaCanon) unowned.push('Plasma Canon');
      if (!effects.hasRocketLauncher) unowned.push('Rocket Launcher');
      // Utilities
      if (!effects.hasWarpDrive) unowned.push('Warp Drive');
      if (!effects.hasMissionControlPortal) unowned.push('Mission Control Portal');
      // Stats
      if ((effects.sizeBonus || 0) < 10) unowned.push('Size upgrade');
      if ((effects.speedBonus || 0) < 10) unowned.push('Speed upgrade');
      if ((effects.landingSpeedBonus || 0) < 5) unowned.push('Landing Speed upgrade');
      // Cosmetics
      const ownedGlows = effects.ownedGlows || [];
      if (!ownedGlows.includes('orange')) unowned.push('Orange Glow');
      if (!ownedGlows.includes('blue')) unowned.push('Blue Glow');
      if (!ownedGlows.includes('purple')) unowned.push('Purple Glow');
      if (!ownedGlows.includes('green')) unowned.push('Green Glow');
      const ownedTrails = effects.ownedTrails || [];
      if (!ownedTrails.includes('fire')) unowned.push('Fire Trail');
      if (!ownedTrails.includes('ice')) unowned.push('Ice Trail');
      if (!ownedTrails.includes('rainbow')) unowned.push('Rainbow Trail');
      unowned.push('Visual upgrade');
      voiceService.shopGreeting({
        playerName: USERS.find(u => u.id === state.currentUser)?.name || state.currentUser || 'friend',
        credits: personalPoints,
        unownedItems: unowned,
      });
      return;
    }
    if (planet.id === 'planet-builder') {
      setShowPlanetCreator(true);
      return;
    }
    if (planet.id === 'control-hub') {
      setShowControlHub(true);
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

    // For Notion planets, suppress the canvas panel so React modal handles it
    if (planet.type === 'notion') {
      gameRef.current?.setSuppressLandedPanel(true);
    }

    // For all other planets, show the landed panel
    setLandedPlanet(planet);
  }, [state.currentUser]);

  // Handle takeoff from a planet
  const handleTakeoff = useCallback(() => {
    gameRef.current?.setSuppressLandedPanel(false);
    setLandedPlanet(null);
  }, []);

  // Handle colonizing a planet (completing it) or claiming an unassigned mission
  const handleColonize = useCallback(async (planet: Planet) => {
    if (planet.completed) return;

    // Clear suppress flag in case called from React modal
    gameRef.current?.setSuppressLandedPanel(false);

    // Special planets cannot be completed
    const specialPlanets = ['shop-station', 'planet-builder', 'control-hub'];
    if (specialPlanets.includes(planet.id) || planet.id.startsWith('user-planet-')) {
      return;
    }

    // Handle Notion planets
    if (planet.id.startsWith('notion-')) {
      // Check if unassigned - then CLAIM instead of complete
      if ((!planet.ownerId || planet.ownerId === '') && state.currentUser) {
        // Claim the mission via push animation (mini ship pushes planet to home zone)
        gameRef.current?.startSendAnimation(planet);
        const sendVel = gameRef.current?.getSendVelocity();
        if (sendVel) broadcastSendStart(planet.id, sendVel.vx, sendVel.vy);
        soundManager.playClaimVoiceLine();
        setLandedPlanet(null);

        const newPosition = await claimNotionPlanet(planet.id, state.currentUser);
        if (newPosition) {
          gameRef.current?.setSendTarget(newPosition.x, newPosition.y);
          broadcastSendTarget(planet.id, newPosition.x, newPosition.y);
        }
        return;
      }

      // Already assigned - complete it
      fireConfetti(planet.size);
      soundManager.playDockingSound();
      soundManager.playTaskVoiceLine();

      // Optimistic update: add points instantly (based on priority, stored on planet)
      if (planet.points) {
        setPersonalPoints(prev => prev + planet.points!);
      }

      // Mark as completed in database - backend awards points to assigned player
      completeNotionPlanet(planet.id);

      gameRef.current?.completePlanet(planet.id);
    } else {
      // Regular planets
      if (state.completedPlanets.includes(planet.id)) return;

      fireConfetti(planet.size);
      soundManager.playDockingSound();
      soundManager.playTaskVoiceLine();

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
  }, [state.completedPlanets, state.currentUser, team, completeRemotePlanet, completeNotionPlanet, claimNotionPlanet, updateRemotePersonalPoints, broadcastSendStart, broadcastSendTarget]);

  // Handle claim request - called when user wants to claim an unassigned planet
  // Uses send/push animation (mini ship pushes planet to home zone)
  const handleClaimRequest = useCallback(async (planet: Planet) => {
    if (!state.currentUser) return;

    console.log('[ClaimRequest] Starting claim for planet:', planet.id, 'at position:', planet.x, planet.y);

    // Clear suppress flag in case called from React modal
    gameRef.current?.setSuppressLandedPanel(false);

    // Start push animation immediately for instant feedback
    gameRef.current?.startSendAnimation(planet);
    const sendVel = gameRef.current?.getSendVelocity();
    if (sendVel) broadcastSendStart(planet.id, sendVel.vx, sendVel.vy);
    soundManager.playClaimVoiceLine();
    setLandedPlanet(null);

    // Call API in parallel - animation flies in random direction until target is set
    const newPosition = await claimNotionPlanet(planet.id, state.currentUser);

    console.log('[ClaimRequest] API returned:', newPosition);

    if (newPosition) {
      gameRef.current?.setSendTarget(newPosition.x, newPosition.y);
      broadcastSendTarget(planet.id, newPosition.x, newPosition.y);
    } else {
      console.error('Failed to claim planet');
    }
  }, [state.currentUser, claimNotionPlanet, broadcastSendStart, broadcastSendTarget]);

  // Handle opening Notion URL
  const handleOpenNotion = useCallback((url: string) => {
    window.open(url, '_blank');
  }, []);

  // Handle reassign request - opens modal to select new owner
  const handleReassignRequest = useCallback((planet: Planet) => {
    if (!planet.id.startsWith('notion-')) return;
    if (planet.completed) return;

    setReassignPlanet(planet);
    setShowReassignModal(true);
    setLandedPlanet(null);
    gameRef.current?.clearLandedState();
  }, []);

  // Handle actual reassignment after user selects new owner
  const handleReassign = useCallback(async (newOwner: string) => {
    if (!reassignPlanet) return;

    // Start the rocket animation and play voice line immediately
    gameRef.current?.startSendAnimation(reassignPlanet);
    const sendVel = gameRef.current?.getSendVelocity();
    if (sendVel) broadcastSendStart(reassignPlanet.id, sendVel.vx, sendVel.vy);
    const isSelf = newOwner === state.currentUser;
    if (isSelf) {
      soundManager.playClaimVoiceLine();
    } else {
      soundManager.playSendVoiceLine();
    }

    if (!newOwner) {
      // Unassigning - use notion-update edge function
      setEventNotification({ message: `Unassigning task...`, type: 'mission' });

      const result = await updateNotionPlanet(reassignPlanet.id, { assigned_to: null });

      if (result?.success && result.new_position) {
        gameRef.current?.setSendTarget(result.new_position.x, result.new_position.y);
        broadcastSendTarget(reassignPlanet.id, result.new_position.x, result.new_position.y);
        setEventNotification({ message: `Task unassigned`, type: 'mission' });
      } else {
        setEventNotification({ message: `Failed to unassign task`, type: 'blackhole' });
      }
      setTimeout(() => setEventNotification(null), 3000);
    } else {
      // Show notification
      const ownerName = newOwner.charAt(0).toUpperCase() + newOwner.slice(1);
      setEventNotification({ message: `Sending task to ${ownerName}...`, type: 'mission' });

      // Call API in parallel (rocket flies in random direction until target is set)
      const newPosition = await reassignNotionPlanet(reassignPlanet.id, newOwner);

      if (newPosition) {
        // Set target - rocket will steer toward it
        gameRef.current?.setSendTarget(newPosition.x, newPosition.y);
        broadcastSendTarget(reassignPlanet.id, newPosition.x, newPosition.y);
        setEventNotification({ message: `Task sent to ${ownerName}!`, type: 'mission' });
        setTimeout(() => setEventNotification(null), 3000);
      } else {
        setEventNotification({ message: `Failed to send task`, type: 'blackhole' });
        setTimeout(() => setEventNotification(null), 3000);
      }
    }

    setReassignPlanet(null);
  }, [reassignPlanet, reassignNotionPlanet, updateNotionPlanet, broadcastSendStart, broadcastSendTarget]);

  // Handle edit request - opens modal to edit task properties
  const handleEditRequest = useCallback((planet: Planet) => {
    if (!planet.id.startsWith('notion-')) return;
    if (planet.completed) return;

    setEditPlanet(planet);
    setShowEditModal(true);
    setLandedPlanet(null);
    gameRef.current?.clearLandedState();
  }, []);

  // Handle actual edit save after user modifies fields
  const handleEditSave = useCallback(async (updates: EditTaskUpdates) => {
    if (!editPlanet) return;

    // Check if assignee changed - if so, trigger send animation
    const assigneeChanged = updates.assigned_to !== undefined &&
      (updates.assigned_to || '') !== (editPlanet.ownerId || '');

    if (assigneeChanged && updates.assigned_to) {
      // Start rocket animation for reassignment
      gameRef.current?.startSendAnimation(editPlanet);
      const sendVel = gameRef.current?.getSendVelocity();
      if (sendVel) broadcastSendStart(editPlanet.id, sendVel.vx, sendVel.vy);
      const isSelf = updates.assigned_to === state.currentUser;
      if (isSelf) {
        soundManager.playClaimVoiceLine();
      } else {
        soundManager.playSendVoiceLine();
      }
      const ownerName = updates.assigned_to.charAt(0).toUpperCase() + updates.assigned_to.slice(1);
      setEventNotification({ message: isSelf ? `Claiming task...` : `Sending task to ${ownerName}...`, type: 'mission' });
    }

    const result = await updateNotionPlanet(editPlanet.id, updates);

    if (result?.success) {
      if (assigneeChanged && result.new_position) {
        gameRef.current?.setSendTarget(result.new_position.x, result.new_position.y);
        broadcastSendTarget(editPlanet.id, result.new_position.x, result.new_position.y);
        if (updates.assigned_to) {
          const ownerName = updates.assigned_to.charAt(0).toUpperCase() + updates.assigned_to.slice(1);
          setEventNotification({ message: `Task updated and sent to ${ownerName}!`, type: 'mission' });
        } else {
          setEventNotification({ message: `Task unassigned and moved`, type: 'mission' });
        }
      } else {
        setEventNotification({ message: `Task updated`, type: 'mission' });
      }
      setTimeout(() => setEventNotification(null), 3000);
    } else {
      setEventNotification({ message: `Failed to update task`, type: 'blackhole' });
      setTimeout(() => setEventNotification(null), 3000);
    }

    setEditPlanet(null);
  }, [editPlanet, updateNotionPlanet, broadcastSendStart, broadcastSendTarget]);

  // Handle take-off from React landed modal
  const handleModalTakeOff = useCallback(() => {
    gameRef.current?.setSuppressLandedPanel(false);
    gameRef.current?.clearLandedState();
    setLandedPlanet(null);
  }, []);

  // Handle send from React landed modal
  const handleLandedSend = useCallback(async (planet: Planet, newOwner: string) => {
    // Close modal first
    gameRef.current?.setSuppressLandedPanel(false);
    gameRef.current?.clearLandedState();
    setLandedPlanet(null);

    // Start rocket animation + sound
    gameRef.current?.startSendAnimation(planet);
    const sendVel = gameRef.current?.getSendVelocity();
    if (sendVel) broadcastSendStart(planet.id, sendVel.vx, sendVel.vy);
    const isSelf = newOwner === state.currentUser;
    if (isSelf) {
      soundManager.playClaimVoiceLine();
    } else {
      soundManager.playSendVoiceLine();
    }

    if (!newOwner) {
      // Unassigning
      setEventNotification({ message: `Unassigning task...`, type: 'mission' });
      const result = await updateNotionPlanet(planet.id, { assigned_to: null });
      if (result?.success && result.new_position) {
        gameRef.current?.setSendTarget(result.new_position.x, result.new_position.y);
        broadcastSendTarget(planet.id, result.new_position.x, result.new_position.y);
        setEventNotification({ message: `Task unassigned`, type: 'mission' });
      } else {
        setEventNotification({ message: `Failed to unassign task`, type: 'blackhole' });
      }
      setTimeout(() => setEventNotification(null), 3000);
    } else {
      const ownerName = newOwner.charAt(0).toUpperCase() + newOwner.slice(1);
      setEventNotification({ message: isSelf ? `Claiming task...` : `Sending task to ${ownerName}...`, type: 'mission' });
      const newPosition = await reassignNotionPlanet(planet.id, newOwner);
      if (newPosition) {
        gameRef.current?.setSendTarget(newPosition.x, newPosition.y);
        broadcastSendTarget(planet.id, newPosition.x, newPosition.y);
        setEventNotification({ message: isSelf ? `Task claimed!` : `Task sent to ${ownerName}!`, type: 'mission' });
      } else {
        setEventNotification({ message: isSelf ? `Failed to claim task` : `Failed to send task`, type: 'blackhole' });
      }
      setTimeout(() => setEventNotification(null), 3000);
    }
  }, [state.currentUser, updateNotionPlanet, reassignNotionPlanet, broadcastSendStart, broadcastSendTarget]);

  // Handle delete from React landed modal
  const handleLandedDelete = useCallback((planet: Planet) => {
    // Close modal first
    gameRef.current?.setSuppressLandedPanel(false);
    gameRef.current?.clearLandedState();
    setLandedPlanet(null);

    // Start destroy animation (the animation callback will call handleDestroyPlanet)
    gameRef.current?.startDestroyAnimation(planet);
  }, []);

  // Handle inline field update from React landed modal
  const handleLandedUpdate = useCallback(async (updates: EditTaskUpdates) => {
    if (!landedPlanet) return;

    // Check if assignee changed — if so, close modal and animate
    const assigneeChanged = updates.assigned_to !== undefined &&
      (updates.assigned_to || '') !== (landedPlanet.ownerId || '');

    if (assigneeChanged) {
      // Close modal and send
      handleLandedSend(landedPlanet, updates.assigned_to || '');
      return;
    }

    const result = await updateNotionPlanet(landedPlanet.id, updates);
    if (result?.success) {
      setEventNotification({ message: `Task updated`, type: 'mission' });
    } else {
      setEventNotification({ message: `Failed to update task`, type: 'blackhole' });
    }
    setTimeout(() => setEventNotification(null), 3000);
  }, [landedPlanet, updateNotionPlanet, handleLandedSend]);

  // Handle feature toggle (pin/unpin planet to HUD)
  const handleFeatureToggle = useCallback((planet: Planet) => {
    setFeaturedPlanetIds(prev => {
      const next = new Set(prev);
      if (next.has(planet.id)) {
        next.delete(planet.id);
        soundManager.playUnpin();
      } else {
        next.add(planet.id);
        soundManager.playPin();
      }
      localStorage.setItem('mission-control-featured-tasks', JSON.stringify([...next]));
      return next;
    });
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

  // Handle destroying a planet (completed planets with cannon, or unassigned tasks)
  const handleDestroyPlanet = useCallback(async (planet: Planet) => {
    const isNotionPlanet = planet.id.startsWith('notion-');
    const isUnassigned = isNotionPlanet && (!planet.ownerId || planet.ownerId === '');

    // Allow destroying: any uncompleted Notion planet, or completed planets, or unassigned
    if (!planet.completed && !isNotionPlanet && !isUnassigned) return;

    // Special planets cannot be destroyed
    const specialPlanets = ['shop-station', 'planet-builder', 'control-hub'];
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

  // Handle black hole death - show random funny message
  const handleBlackHoleDeath = useCallback(() => {
    const currentPlayer = teamPlayers.find(p => p.username === state.currentUser);
    const name = currentPlayer?.displayName || 'Someone';
    const randomMessage = blackHoleMessages[Math.floor(Math.random() * blackHoleMessages.length)].replace('{name}', name);
    setEventNotification({ message: randomMessage, type: 'blackhole' });
    setTimeout(() => setEventNotification(null), 4000);
  }, [teamPlayers, state.currentUser, blackHoleMessages]);

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
      onBlackHoleDeath: handleBlackHoleDeath,
      onReassignRequest: handleReassignRequest,
      onEditRequest: handleEditRequest,
      onFeatureToggle: handleFeatureToggle,
      onShopApproach: () => {
        const currentShip = getCurrentUserShip();
        const effects = currentShip.effects || {};
        const unowned: string[] = [];
        if (!effects.hasSpaceRifle) unowned.push('Space Rifle');
        if (!effects.hasDestroyCanon) unowned.push('Space TNT');
        if (!effects.hasPlasmaCanon) unowned.push('Plasma Canon');
        if (!effects.hasRocketLauncher) unowned.push('Rocket Launcher');
        if (!effects.hasWarpDrive) unowned.push('Warp Drive');
        if (!effects.hasMissionControlPortal) unowned.push('Mission Control Portal');
        if ((effects.sizeBonus || 0) < 10) unowned.push('Size upgrade');
        if ((effects.speedBonus || 0) < 10) unowned.push('Speed upgrade');
        if ((effects.landingSpeedBonus || 0) < 5) unowned.push('Landing Speed upgrade');
        const ownedGlows = effects.ownedGlows || [];
        if (!ownedGlows.includes('orange')) unowned.push('Orange Glow');
        if (!ownedGlows.includes('blue')) unowned.push('Blue Glow');
        if (!ownedGlows.includes('purple')) unowned.push('Purple Glow');
        if (!ownedGlows.includes('green')) unowned.push('Green Glow');
        const ownedTrails = effects.ownedTrails || [];
        if (!ownedTrails.includes('fire')) unowned.push('Fire Trail');
        if (!ownedTrails.includes('ice')) unowned.push('Ice Trail');
        if (!ownedTrails.includes('rainbow')) unowned.push('Rainbow Trail');
        unowned.push('Visual upgrade');
        voiceService.prepareShopGreeting({
          playerName: USERS.find(u => u.id === state.currentUser)?.name || state.currentUser || 'friend',
          credits: personalPoints,
          unownedItems: unowned,
        });
      },
      onCollisionVoice: () => {
        voiceService.collisionComment();
      },
    };
  });

  // Keyboard shortcuts: Escape to close modals, T to open quick task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close modals
      if (e.key === 'Escape' && !isUpgrading) {
        const isGameLanded = gameRef.current?.isPlayerLanded();
        const hasOpenModal = editingGoal || showSettings || showGameSettings || showTerraform ||
          viewingPlanetOwner || showShop || showControlHub || showPlanetCreator || landedPlanet || isGameLanded || showQuickTaskModal || showReassignModal || showEditModal || featuredViewPlanet;

        if (hasOpenModal) {
          e.preventDefault();
          // Close everything at once
          setEditingGoal(null);
          setShowSettings(false);
          setShowGameSettings(false);
          setShowTerraform(false);
          setViewingPlanetOwner(null);
          setShowShop(false);
          setShowControlHub(false);
          setShowPlanetCreator(false);
          setLandedPlanet(null);
          setShowQuickTaskModal(false);
          setShowReassignModal(false);
          setReassignPlanet(null);
          setShowEditModal(false);
          setEditPlanet(null);
          setFeaturedViewPlanet(null);
          // Also clear SpaceGame's internal landed state
          gameRef.current?.setSuppressLandedPanel(false);
          gameRef.current?.clearLandedState();
        }
      }

      // T key to open quick task modal (only when no modal is open and not typing)
      if (e.key === 't' || e.key === 'T') {
        const target = e.target as HTMLElement;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        const isGameLanded = gameRef.current?.isPlayerLanded();
        const hasOpenModal = editingGoal || showSettings || showGameSettings || showTerraform ||
          viewingPlanetOwner || showShop || showControlHub || showPlanetCreator || landedPlanet || isGameLanded || showQuickTaskModal ||
          showWelcome || showUserSelect || showLeaderboard || showPointsHistory || showReassignModal || showEditModal || featuredViewPlanet;

        if (!isTyping && !hasOpenModal && !isUpgrading) {
          e.preventDefault();
          setShowQuickTaskModal(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTerraform, viewingPlanetOwner, showShop, showControlHub, showPlanetCreator, showSettings, showGameSettings, editingGoal, landedPlanet, isUpgrading, showQuickTaskModal, showWelcome, showUserSelect, showLeaderboard, showPointsHistory, showReassignModal, showEditModal, featuredViewPlanet]);

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
    voiceService.commentOnUpgrade('ship', 'start', promptText);

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
      let voicePromise: Promise<Blob | null> | null = null;

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

        // Start voice review generation in parallel with saving
        voicePromise = voiceService.prepareUpgradeReview('ship', promptText, bgRemovedUrl);

        // Save to local filesystem
        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(bgRemovedUrl);
        const userId = state.currentUser || 'default';
        newImageUrl = await saveImageToStorage(base64Image, 'ship', userId, 'visual-upgrade', bgRemovedUrl);
      }

      if (newImageUrl) {
        // Deduct personal points and sync to backend
        setPersonalPoints(prev => prev - VISUAL_UPGRADE_COST);
        updateRemotePersonalPoints(-VISUAL_UPGRADE_COST, 'Ship visual upgrade');

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

        // Play pre-generated voice (should be ready by now)
        if (voicePromise) {
          const voiceBlob = await voicePromise;
          if (voiceBlob) voiceService.playBlob(voiceBlob);
        }
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
    updateRemotePersonalPoints(-cost, `Ship size upgrade (level ${currentLevel + 1})`);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice(`size-${currentLevel + 1}`);
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
    updateRemotePersonalPoints(-cost, `Ship speed upgrade (level ${currentLevel + 1})`);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice(`speed-${currentLevel + 1}`);
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
    updateRemotePersonalPoints(-cost, `Landing speed upgrade (level ${currentLevel + 1})`);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice(`landing-${currentLevel + 1}`);
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
      soundManager.playSelect();
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
      updateRemotePersonalPoints(-glow.cost, `Ship glow: ${glow.name}`);
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playShipUpgrade();
      // Map glow id to voice key: glow_orange -> glow-orange
      soundManager.playShopPurchaseVoice(glow.id.replace('_', '-'));
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
      soundManager.playSelect();
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
      updateRemotePersonalPoints(-trail.cost, `Ship trail: ${trail.name}`);
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playShipUpgrade();
      // Map trail id to voice key: trail_fire -> trail-fire
      soundManager.playShopPurchaseVoice(trail.id.replace('_', '-'));
    }
  };

  // Buy Space TNT (one-time purchase)
  const buySpaceTNT = () => {
    if (personalPoints < SPACE_TNT_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasDestroyCanon) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasDestroyCanon: true,
      destroyCanonEquipped: true, // Auto-equip when purchased
      // Unequip other weapons
      spaceRifleEquipped: false,
      plasmaCanonEquipped: false,
      rocketLauncherEquipped: false,
    };

    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - SPACE_TNT_COST);
    updateRemotePersonalPoints(-SPACE_TNT_COST, 'Space TNT');
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice('weapon-tnt');
  };

  // Toggle Space TNT equip state (only one weapon at a time)
  const toggleSpaceTNT = () => {
    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (!currentEffects.hasDestroyCanon) return; // Doesn't own it

    const willEquip = !currentEffects.destroyCanonEquipped;
    const newEffects: ShipEffects = {
      ...currentEffects,
      destroyCanonEquipped: willEquip,
      // Unequip other weapons if equipping this one
      spaceRifleEquipped: willEquip ? false : currentEffects.spaceRifleEquipped,
      plasmaCanonEquipped: willEquip ? false : currentEffects.plasmaCanonEquipped,
      rocketLauncherEquipped: willEquip ? false : currentEffects.rocketLauncherEquipped,
    };

    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playSelect();
  };

  // Buy Space Rifle (one-time purchase)
  const buySpaceRifle = () => {
    if (personalPoints < SPACE_RIFLE_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasSpaceRifle) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasSpaceRifle: true,
      spaceRifleEquipped: true, // Auto-equip when purchased
      // Unequip other weapons
      destroyCanonEquipped: false,
      plasmaCanonEquipped: false,
      rocketLauncherEquipped: false,
    };

    // Deduct personal points and sync to backend
    setPersonalPoints(prev => prev - SPACE_RIFLE_COST);
    updateRemotePersonalPoints(-SPACE_RIFLE_COST, 'Space Rifle');
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice('weapon-rifle');
  };

  // Toggle Space Rifle equip state (only one weapon at a time)
  const toggleSpaceRifle = () => {
    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (!currentEffects.hasSpaceRifle) return; // Doesn't own it

    const willEquip = !currentEffects.spaceRifleEquipped;
    const newEffects: ShipEffects = {
      ...currentEffects,
      spaceRifleEquipped: willEquip,
      // Unequip other weapons if equipping this one
      destroyCanonEquipped: willEquip ? false : currentEffects.destroyCanonEquipped,
      plasmaCanonEquipped: willEquip ? false : currentEffects.plasmaCanonEquipped,
      rocketLauncherEquipped: willEquip ? false : currentEffects.rocketLauncherEquipped,
    };

    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playSelect();
  };

  // Buy Plasma Canon (one-time purchase)
  const buyPlasmaCanon = () => {
    if (personalPoints < PLASMA_CANON_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasPlasmaCanon) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasPlasmaCanon: true,
      plasmaCanonEquipped: true, // Auto-equip when purchased
      // Unequip other weapons
      destroyCanonEquipped: false,
      spaceRifleEquipped: false,
      rocketLauncherEquipped: false,
    };

    setPersonalPoints(prev => prev - PLASMA_CANON_COST);
    updateRemotePersonalPoints(-PLASMA_CANON_COST, 'Plasma Canon');
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice('weapon-plasma');
  };

  // Toggle Plasma Canon equip state (only one weapon at a time)
  const togglePlasmaCanon = () => {
    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (!currentEffects.hasPlasmaCanon) return;

    const willEquip = !currentEffects.plasmaCanonEquipped;
    const newEffects: ShipEffects = {
      ...currentEffects,
      plasmaCanonEquipped: willEquip,
      // Unequip other weapons if equipping this one
      destroyCanonEquipped: willEquip ? false : currentEffects.destroyCanonEquipped,
      spaceRifleEquipped: willEquip ? false : currentEffects.spaceRifleEquipped,
      rocketLauncherEquipped: willEquip ? false : currentEffects.rocketLauncherEquipped,
    };

    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playSelect();
  };

  // Buy Rocket Launcher (one-time purchase)
  const buyRocketLauncher = () => {
    if (personalPoints < ROCKET_LAUNCHER_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasRocketLauncher) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasRocketLauncher: true,
      rocketLauncherEquipped: true, // Auto-equip when purchased
      // Unequip other weapons
      destroyCanonEquipped: false,
      spaceRifleEquipped: false,
      plasmaCanonEquipped: false,
    };

    setPersonalPoints(prev => prev - ROCKET_LAUNCHER_COST);
    updateRemotePersonalPoints(-ROCKET_LAUNCHER_COST, 'Rocket Launcher');
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice('weapon-rocket');
  };

  // Toggle Rocket Launcher equip state (only one weapon at a time)
  const toggleRocketLauncher = () => {
    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (!currentEffects.hasRocketLauncher) return;

    const willEquip = !currentEffects.rocketLauncherEquipped;
    const newEffects: ShipEffects = {
      ...currentEffects,
      rocketLauncherEquipped: willEquip,
      // Unequip other weapons if equipping this one
      destroyCanonEquipped: willEquip ? false : currentEffects.destroyCanonEquipped,
      spaceRifleEquipped: willEquip ? false : currentEffects.spaceRifleEquipped,
      plasmaCanonEquipped: willEquip ? false : currentEffects.plasmaCanonEquipped,
    };

    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playSelect();
  };

  // Buy Warp Drive (one-time purchase - teleport home with H key)
  const buyWarpDrive = () => {
    if (personalPoints < WARP_DRIVE_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasWarpDrive) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasWarpDrive: true,
    };

    setPersonalPoints(prev => prev - WARP_DRIVE_COST);
    updateRemotePersonalPoints(-WARP_DRIVE_COST, 'Warp Drive');
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice('warp-drive');
  };

  // Buy Mission Control Portal (one-time purchase - teleport to MC from home planet with G key)
  const buyMissionControlPortal = () => {
    if (personalPoints < MISSION_CONTROL_PORTAL_COST) return;

    const userId = state.currentUser || 'default';
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);

    if (currentEffects.hasMissionControlPortal) return; // Already owns it

    const newEffects: ShipEffects = {
      ...currentEffects,
      hasMissionControlPortal: true,
    };

    setPersonalPoints(prev => prev - MISSION_CONTROL_PORTAL_COST);
    updateRemotePersonalPoints(-MISSION_CONTROL_PORTAL_COST, 'Mission Control Portal');
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
    soundManager.playShopPurchaseVoice('portal');
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
    hasSpaceRifle: effects?.hasSpaceRifle ?? false,
    spaceRifleEquipped: effects?.spaceRifleEquipped ?? false,
    hasPlasmaCanon: effects?.hasPlasmaCanon ?? false,
    plasmaCanonEquipped: effects?.plasmaCanonEquipped ?? false,
    hasRocketLauncher: effects?.hasRocketLauncher ?? false,
    rocketLauncherEquipped: effects?.rocketLauncherEquipped ?? false,
    hasWarpDrive: effects?.hasWarpDrive ?? false,
    hasMissionControlPortal: effects?.hasMissionControlPortal ?? false,
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
    soundManager.playSelect();
    setState(prev => ({ ...prev, currentUser: userId }));
    setShowUserSelect(false);
    // DO NOT initialize userShips with defaults here!
    // Ship data is loaded from Supabase via teamPlayers in the effect at line ~845
    // Initializing with defaults here would cause a race condition that overwrites
    // the user's existing upgrades when useMultiplayerSync runs
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
  const savePlanet = () => {
    if (!newPlanet.name) return;

    const isNotionTask = newPlanet.type === 'notion';

    if (isNotionTask) {
      // Capture values before resetting form
      const payload = {
        name: newPlanet.name,
        description: newPlanet.description || null,
        type: notionTaskType,
        priority: notionPriority,
        assigned_to: notionAssignedTo || null,
        created_by: state.currentUser || 'unknown',
      };

      // Reset form and close immediately
      setNewPlanet({ size: 'medium' });
      setPlanetImageFile(null);
      setPlanetImagePreview(null);
      setImagePrompt('');
      setNotionPriority('medium');
      setNotionAssignedTo('');
      setNotionTaskType('task');
      setShowPlanetCreator(false);
      gameRef.current?.clearLandedState();

      // Create Notion task in background
      supabase.functions.invoke('notion-create', { body: payload })
        .then(({ data, error }) => {
          if (error) {
            console.error('Failed to create Notion task:', error);
            return;
          }
          if (autoOpenNotion && data?.notion_url) {
            window.open(data.notion_url, '_blank');
          }
        })
        .catch((error) => {
          console.error('Error creating Notion task:', error);
        });

      return;
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
      onBlackHoleDeath: () => landingCallbacksRef.current.onBlackHoleDeath(),
      onReassignRequest: (planet) => landingCallbacksRef.current.onReassignRequest(planet),
      onEditRequest: (planet) => landingCallbacksRef.current.onEditRequest(planet),
      onFeatureToggle: (planet) => landingCallbacksRef.current.onFeatureToggle(planet),
      onShopApproach: () => landingCallbacksRef.current.onShopApproach(),
      onCollisionVoice: () => landingCallbacksRef.current.onCollisionVoice(),
    });

    // Set up weapon fire broadcast callback (game → WS)
    game.setWeaponFireCallback((weaponType, x, y, vx, vy, rotation, targetPlanetId) => {
      broadcastWeaponFire(weaponType, x, y, vx, vy, rotation, targetPlanetId);
    });

    // Set up planet destroy broadcast callback (game → WS)
    game.setPlanetDestroyBroadcastCallback((planetId, fromRifle) => {
      broadcastPlanetDestroy(planetId, fromRifle);
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
    game.setOnAssetsReady(() => setAssetsLoaded(true));
    game.start();
    setGameReady(true); // Signal that game is ready for broadcasting

    return () => {
      game.stop();
      setGameReady(false);
      setAssetsLoaded(false);
      setWarpComplete(false);
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
          {USERS
            .filter(user => {
              if (!isTestPlayer(user.id)) return true;
              return new URLSearchParams(window.location.search).has('test');
            })
            .map(user => (
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
        <p style={styles.subtitle}>Custom One Edition</p>

        <p style={{ color: currentUser?.color, marginBottom: '1rem' }}>
          Welcome, {currentUser?.name}!
        </p>

        {/* Ship Preview */}
        <div style={styles.shipPreviewLarge}>
          <img src={currentShip.currentImage} alt="Your Ship" style={styles.shipPreviewImage} />
        </div>

        <button style={styles.startButton} onClick={() => {
          soundManager.init();
          soundManager.playSelect();
          setShowWelcome(false);

          // Build greeting context from already-loaded data
          const currentPlayer = teamPlayers.find(p => p.username === state.currentUser);
          const ranked = [...teamPlayers]
            .filter(p => p.username !== 'anonymous' && !isTestPlayer(p.username))
            .sort((a, b) => b.totalEarned - a.totalEarned);
          const playerRank = ranked.findIndex(p => p.username === state.currentUser) + 1;
          const leader = ranked[0];
          const isLeader = leader?.username === state.currentUser;

          const online = teamPlayers
            .filter(p => p.isOnline && p.username !== state.currentUser && p.username !== 'anonymous' && !isTestPlayer(p.username))
            .map(p => p.displayName);

          const greetingCtx: GreetingContext = {
            playerName: currentPlayer?.displayName || state.currentUser || 'Commander',
            playerRank: playerRank || 1,
            totalPlayers: ranked.length,
            currencyPoints: personalPoints,
            ...(leader && !isLeader ? {
              leaderName: leader.displayName,
              pointsGap: leader.totalEarned - (currentPlayer?.totalEarned || 0),
            } : {}),
            ...(online.length > 0 ? { onlinePlayers: online } : {}),
          };

          // Fire and forget - plays during warp transition
          voiceService.greet(greetingCtx);
        }}>
          Launch Mission
        </button>

        <p style={{ ...styles.progress, marginTop: '1.5rem' }}>
          {Math.max(0, (teamPlayers.find(p => p.username === state.currentUser)?.shipLevel || 1) - 1)} ship upgrades | {userPlanets[state.currentUser || '']?.terraformCount || 0} terraforms
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

      {/* Warp transition - hyperspace animation while assets load */}
      {gameReady && !warpComplete && (
        <WarpTransition
          assetsReady={assetsLoaded}
          onComplete={() => setWarpComplete(true)}
        />
      )}

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
          style={{ ...styles.hudLogo, cursor: state.currentUser && ['quentin', 'armel', TEST_PLAYER_ID].includes(state.currentUser) ? 'pointer' : 'default' }}
          onClick={() => state.currentUser && ['quentin', 'armel', TEST_PLAYER_ID].includes(state.currentUser) && setShowSettings(true)}
          title={state.currentUser && ['quentin', 'armel', TEST_PLAYER_ID].includes(state.currentUser) ? 'Admin Settings' : ''}
        />
        <span style={styles.hudText}>Mission Control</span>
        <span style={{ color: currentUser?.color, marginLeft: 8 }}>
          ({currentUser?.name})
        </span>
        {state.currentUser && isTestPlayer(state.currentUser) && (
          <span style={{ marginLeft: 10, padding: '2px 8px', background: 'rgba(255,0,0,0.3)', border: '1px solid rgba(255,0,0,0.5)', borderRadius: 4, fontSize: '0.7rem', color: '#ff6b6b', fontWeight: 700, letterSpacing: 1 }}>
            TEST MODE
          </span>
        )}

        {/* Multiplayer indicator */}
        {team && (
          <div style={styles.multiplayerIndicator}>
            <span style={{ color: isConnected ? '#4ade80' : '#888' }}>
              {isConnected ? '●' : '○'}
            </span>
            <span style={{ marginLeft: 4, fontSize: '0.75rem', color: '#aaa' }}>
              {teamPlayers.filter(p => p.isOnline && !isTestPlayer(p.username)).length} online
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

      {/* Event notification (join/leave/blackhole/upgrade/mission) */}
      {eventNotification && (
        <div style={{
          ...styles.eventNotification,
          borderColor: {
            join: '#4ade80',
            leave: '#666',
            blackhole: '#8b5cf6',
            upgrade: '#22d3ee',
            mission: '#f59e0b',
          }[eventNotification.type],
        }}>
          <span style={{
            color: {
              join: '#4ade80',
              leave: '#888',
              blackhole: '#a78bfa',
              upgrade: '#67e8f9',
              mission: '#fbbf24',
            }[eventNotification.type],
          }}>
            {eventNotification.message}
          </span>
        </div>
      )}

      {/* Online players sidebar */}
      {team && teamPlayers.filter(p => p.isOnline && p.username !== state.currentUser && !isTestPlayer(p.username)).length > 0 && (
        <div style={styles.onlinePlayers}>
          <div style={styles.onlinePlayersTitle}>Online</div>
          {teamPlayers
            .filter(p => p.isOnline && p.username !== state.currentUser && !isTestPlayer(p.username))
            .map(p => (
              <div key={p.id} style={styles.onlinePlayer}>
                <span style={{ ...styles.onlinePlayerDot, background: p.color }} />
                <span>{p.displayName}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* Next Missions widget */}
      {!editingGoal && !showSettings && !showGameSettings && !showTerraform && !showShop && !showControlHub && !showPlanetCreator && !showLeaderboard && !showPointsHistory && (
        <div style={{
          position: 'absolute', left: 20, top: team && teamPlayers.filter(p => p.isOnline && p.username !== state.currentUser && !isTestPlayer(p.username)).length > 0 ? 150 : 70,
          background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: '8px 12px',
          border: '1px solid rgba(255,255,255,0.08)', minWidth: 140, maxWidth: 200,
        }}>
          <div
            onClick={() => setShowMissionFilter(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, cursor: 'pointer' }}
          >
            <div style={{ color: '#666', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Next Missions
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([
                { key: 'business', color: '#4ade80' },
                { key: 'product', color: '#5490ff' },
                { key: 'notion', color: '#94a3b8' },
              ] as const).map(f => (
                <div
                  key={f.key}
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: missionFilters.has(f.key) ? f.color : 'transparent',
                    border: `1.5px solid ${missionFilters.has(f.key) ? f.color : f.color + '40'}`,
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Filter popover */}
          {showMissionFilter && (
            <>
            <div onClick={() => setShowMissionFilter(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} />
            <div style={{
              position: 'relative', zIndex: 1,
              background: 'rgba(20,20,30,0.95)', borderRadius: 6, padding: '6px 0',
              border: '1px solid rgba(255,255,255,0.12)', marginBottom: 6,
            }}>
              {([
                { key: 'business', label: 'Business', color: '#4ade80' },
                { key: 'product', label: 'Product', color: '#5490ff' },
                { key: 'notion', label: 'Notion', color: '#94a3b8' },
              ] as const).map(f => (
                <div
                  key={f.key}
                  onClick={() => setMissionFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(f.key)) next.delete(f.key); else next.add(f.key);
                    return next;
                  })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                    background: missionFilters.has(f.key) ? f.color : 'transparent',
                    border: `1.5px solid ${missionFilters.has(f.key) ? f.color : 'rgba(255,255,255,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}>
                    {missionFilters.has(f.key) && (
                      <span style={{ color: '#000', fontSize: '0.55rem', fontWeight: 'bold', lineHeight: 1 }}>✓</span>
                    )}
                  </div>
                  <span style={{ color: f.color, fontSize: '0.7rem' }}>{f.label}</span>
                </div>
              ))}
            </div>
            </>
          )}

          {nextMissions ? nextMissions.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: i < nextMissions.length - 1 ? 5 : 0 }}>
              <div style={{ color: '#fff', fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
              </div>
              <div style={{ color: m.urgencyColor, fontSize: '0.65rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {m.daysLeft < 0
                  ? `${Math.abs(m.daysLeft)}d late`
                  : m.daysLeft === 0
                    ? 'TODAY'
                    : `${m.daysLeft}d`}
              </div>
            </div>
          )) : (
            <div style={{ color: '#555', fontSize: '0.7rem', fontStyle: 'italic' }}>No dated missions</div>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={styles.stats}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{state.completedPlanets.length}</span>
          <span style={styles.statLabel}>Planets</span>
        </div>
        <div
          style={{ ...styles.statItem, cursor: 'pointer' }}
          onClick={() => {
            setPointsHistoryTab('team');
            fetchPointsHistory('team');
            setShowPointsHistory(true);
          }}
          title="Click to view team points history"
        >
          <span style={{ ...styles.statValue, color: '#5490ff' }}>💎 {teamPoints}</span>
          <span style={styles.statLabel}>Team Points</span>
        </div>
        <div
          style={{ ...styles.statItem, cursor: 'pointer' }}
          onClick={() => {
            setPointsHistoryTab('personal');
            fetchPointsHistory('personal');
            setShowPointsHistory(true);
          }}
          title="Click to view your points history"
        >
          <span style={{ ...styles.statValue, color: '#ffa500' }}>⭐ {personalPoints}</span>
          <span style={styles.statLabel}>Your Points</span>
        </div>
      </div>

      {/* Featured Tasks HUD Bar */}
      {(() => {
        const featuredPlanets = notionGamePlanets.filter(p => featuredPlanetIds.has(p.id));
        if (featuredPlanets.length === 0) return null;
        const priorityColors: Record<string, string> = {
          critical: '#ff4444', high: '#ffa500', medium: '#5490ff', low: '#4ade80',
        };
        return (
          <div style={{
            position: 'absolute', top: 75, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, flexWrap: 'wrap' as const, justifyContent: 'center',
            maxWidth: '80vw',
          }}>
            {featuredPlanets.map(planet => {
              const prio = (planet.priority || 'medium').toLowerCase();
              const borderColor = priorityColors[prio] || '#5490ff';
              return (
                <div
                  key={planet.id}
                  onClick={() => setFeaturedViewPlanet(planet)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 20,
                    background: 'rgba(10,10,18,0.85)',
                    border: `1px solid ${borderColor}44`,
                    cursor: 'pointer', transition: 'border-color 0.2s',
                    maxWidth: 200,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = borderColor)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = borderColor + '44')}
                >
                  <span style={{ color: '#ffd700', fontSize: '0.7rem' }}>★</span>
                  <span style={{
                    fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.7rem', color: '#ccc',
                    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {planet.name}
                  </span>
                  {planet.completed && <span style={{ color: '#4ade80', fontSize: '0.65rem' }}>✓</span>}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Ship preview */}
      <div
        style={styles.robotPreview}
        onClick={() => setShowShipHistory(true)}
        title="Click to view ship history"
      >
        <img src={currentShip.currentImage} alt="Ship" style={styles.robotImage} />
        {(() => {
          const planet = getUserPlanet(state.currentUser || '');
          const population = getPlanetPopulation(planet.terraformCount, planet.sizeLevel);
          return population > 0 ? (
            <div style={{
              position: 'absolute',
              bottom: 2,
              left: 0,
              right: 0,
              background: 'rgba(0,0,0,0.7)',
              padding: '2px 4px',
              fontSize: '0.6rem',
              color: '#4ade80',
              textAlign: 'center',
            }}>
              🏘️ {formatPopulation(population)}
            </div>
          ) : null;
        })()}
      </div>

      {/* Game Settings Button - bottom right */}
      <button
        style={{
          ...styles.audioToggleIcon,
          bottom: 110,
          borderColor: 'rgba(255, 255, 255, 0.3)',
        }}
        onClick={() => setShowGameSettings(true)}
        title="Game Settings"
      >
        ⚙️
      </button>

      {/* Quick Task FAB - hidden when modals are open */}
      {!editingGoal && !showSettings && !showGameSettings && !showTerraform && !viewingPlanetOwner && !showShop && !showControlHub && !showPlanetCreator && !landedPlanet && !showQuickTaskModal && !showLeaderboard && !showPointsHistory && !showShipHistory && !gameRef.current?.isPlayerLanded() && (
        <button
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            padding: '12px 20px',
            borderRadius: '28px',
            background: 'linear-gradient(135deg, #00c8ff 0%, #0088cc 100%)',
            border: 'none',
            boxShadow: '0 4px 20px rgba(0, 200, 255, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '1rem',
            fontWeight: 600,
            color: '#fff',
            transition: 'transform 0.2s, box-shadow 0.2s',
            zIndex: 900,
          }}
          onClick={() => setShowQuickTaskModal(true)}
          title="Quick Add Task (T)"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 200, 255, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 200, 255, 0.4)';
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>+</span> Add Task (T)
        </button>
      )}

      {/* Quick Task Modal */}
      {showQuickTaskModal && (
        <QuickTaskModal
          isOpen={showQuickTaskModal}
          onClose={() => setShowQuickTaskModal(false)}
          currentUser={state.currentUser || 'unknown'}
          teamMembers={USERS.map(u => ({
            id: u.id,
            name: u.name,
            color: u.color,
            shipImage: userShips[u.id]?.currentImage || '/ship-base.png',
          }))}
          onCreatedForSelf={(taskName, taskType, priority) => {
            soundManager.playClaimVoiceLine();
            gameRef.current?.startNewTaskSendAnimation(taskName, taskType, priority);
          }}
          onCreatedForOther={(taskName, taskType, priority, assignedTo) => {
            soundManager.playSendVoiceLine();
            gameRef.current?.startNewTaskSendAnimation(taskName, taskType, priority, assignedTo);
          }}
        />
      )}

      {/* Reassign Task Modal */}
      {showReassignModal && reassignPlanet && (
        <ReassignTaskModal
          isOpen={showReassignModal}
          onClose={() => {
            setShowReassignModal(false);
            setReassignPlanet(null);
          }}
          onReassign={handleReassign}
          currentOwner={reassignPlanet.ownerId || null}
          taskName={reassignPlanet.name}
        />
      )}

      {showEditModal && editPlanet && (
        <EditTaskModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditPlanet(null);
          }}
          onSave={handleEditSave}
          planet={editPlanet}
        />
      )}

      {/* Landed Planet Modal (Notion planets only) */}
      {landedPlanet && landedPlanet.type === 'notion' && (
        <LandedPlanetModal
          planet={landedPlanet}
          currentUser={state.currentUser || ''}
          destroyCanonEquipped={getCurrentUserShip().effects.destroyCanonEquipped}
          playerInfo={playerInfoForModal}
          onComplete={handleColonize}
          onClaim={handleClaimRequest}
          onSend={handleLandedSend}
          onOpenNotion={handleOpenNotion}
          onDelete={handleLandedDelete}
          onTakeOff={handleModalTakeOff}
          onUpdate={handleLandedUpdate}
          onFeatureToggle={handleFeatureToggle}
          featuredPlanetIds={featuredPlanetIds}
        />
      )}

      {/* Featured Planet View Modal */}
      {featuredViewPlanet && (
        <LandedPlanetModal
          planet={featuredViewPlanet}
          currentUser={state.currentUser || ''}
          destroyCanonEquipped={getCurrentUserShip().effects.destroyCanonEquipped}
          playerInfo={playerInfoForModal}
          mode="featured"
          onComplete={() => {}}
          onClaim={() => {}}
          onSend={() => {}}
          onOpenNotion={handleOpenNotion}
          onDelete={() => {}}
          onTakeOff={() => setFeaturedViewPlanet(null)}
          onUpdate={async (updates) => {
            const result = await updateNotionPlanet(featuredViewPlanet.id, updates);
            if (result?.success) {
              setEventNotification({ message: 'Task updated', type: 'mission' });
            } else {
              setEventNotification({ message: 'Failed to update task', type: 'blackhole' });
            }
            setTimeout(() => setEventNotification(null), 3000);
          }}
          onFeatureToggle={handleFeatureToggle}
          featuredPlanetIds={featuredPlanetIds}
        />
      )}

      {/* Game Settings Modal */}
      {showGameSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowGameSettings(false)}>
          <div style={{ ...styles.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>⚙️ Settings</h2>

            {/* Sound Controls */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sound</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    const newValue = !musicEnabled;
                    setMusicEnabled(newValue);
                    soundManager.setMusicEnabled(newValue);
                  }}
                >
                  <span>🎵 Music</span>
                  <span style={{ color: musicEnabled ? '#4ade80' : '#666' }}>{musicEnabled ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    const newValue = !sfxEnabled;
                    setSfxEnabled(newValue);
                    soundManager.setSfxEnabled(newValue);
                  }}
                >
                  <span>🔊 Sound Effects</span>
                  <span style={{ color: sfxEnabled ? '#4ade80' : '#666' }}>{sfxEnabled ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>

            {/* Keyboard Layout */}
            <div>
              <h3 style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Keyboard Layout</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['qwerty', 'azerty'] as const).map((layout) => (
                  <button
                    key={layout}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: keyboardLayout === layout ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${keyboardLayout === layout ? '#4ade80' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '8px',
                      color: keyboardLayout === layout ? '#4ade80' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: keyboardLayout === layout ? 600 : 400,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      fontFamily: 'Orbitron, sans-serif',
                    }}
                    onClick={() => {
                      setKeyboardLayout(layout);
                      localStorage.setItem('mission-control-keyboard-layout', layout);
                      gameRef.current?.setKeyboardLayout(layout);
                    }}
                  >
                    {layout}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div>
              <h3 style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Controls</h3>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '0.9rem',
                lineHeight: '1.8',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', color: '#ccc' }}>
                  <span style={{ color: '#888' }}>{keyboardLayout === 'azerty' ? 'Z' : 'W'} / ↑</span><span>Thrust</span>
                  <span style={{ color: '#888' }}>{keyboardLayout === 'azerty' ? 'Q' : 'A'} / ←</span><span>Rotate Left</span>
                  <span style={{ color: '#888' }}>D / →</span><span>Rotate Right</span>
                  <span style={{ color: '#888' }}>S / ↓</span><span>Brake</span>
                  <span style={{ color: '#888' }}>SHIFT</span><span>Boost</span>
                  <span style={{ color: '#888' }}>SPACE</span><span>Dock / Take Off</span>
                  <span style={{ color: '#888' }}>T</span><span>Add Task</span>
                  <span style={{ color: '#888' }}>ESC</span><span>Close Menus</span>
                </div>
              </div>
            </div>

            <button
              style={{ ...styles.cancelButton, marginTop: '1.5rem', width: '100%' }}
              onClick={() => setShowGameSettings(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div style={styles.modalOverlay} onClick={() => setShowLeaderboard(false)}>
          <div style={{ ...styles.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🏆 Leaderboard</h2>
            <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0' }}>Click a player to see breakdown</p>
            <div style={{ marginTop: '1rem' }}>
              {[...teamPlayers]
                .filter(p => p.username !== 'anonymous' && !isTestPlayer(p.username))
                .sort((a, b) => b.totalEarned - a.totalEarned)
                .map((player, index) => (
                  <div
                    key={player.id}
                    onClick={() => {
                      setSelectedLeaderboardPlayer({
                        id: player.id,
                        displayName: player.displayName,
                        color: player.color,
                        totalEarned: player.totalEarned,
                      });
                      fetchPlayerBreakdown(player.id);
                    }}
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
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = player.username === state.currentUser
                        ? 'rgba(255, 200, 0, 0.25)'
                        : 'rgba(255,255,255,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = player.username === state.currentUser
                        ? 'rgba(255, 200, 0, 0.15)'
                        : 'rgba(255,255,255,0.03)';
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

      {/* Player Breakdown Modal */}
      {selectedLeaderboardPlayer && (
        <div style={styles.modalOverlay} onClick={() => setSelectedLeaderboardPlayer(null)}>
          <div style={{ ...styles.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              <span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: selectedLeaderboardPlayer.color,
                marginRight: '10px',
              }} />
              {selectedLeaderboardPlayer.displayName}
            </h2>

            {/* Total Earned */}
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' }}>
                Total Points Earned
              </div>
              <div style={{
                fontSize: '1.8rem',
                fontWeight: 700,
                color: '#ffc800',
              }}>
                ⭐ {selectedLeaderboardPlayer.totalEarned}
              </div>
            </div>

            {/* Transaction List */}
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {isLoadingBreakdown ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  Loading breakdown...
                </div>
              ) : playerBreakdownHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  No points earned yet
                </div>
              ) : (
                playerBreakdownHistory.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #4ade80',
                    }}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: tx.source === 'notion' ? 'rgba(100, 100, 255, 0.2)' : tx.source === 'planet' ? 'rgba(255, 165, 0, 0.2)' : 'rgba(128, 128, 128, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}>
                      {tx.source === 'notion' ? '📋' : tx.source === 'planet' ? '🪐' : '⚙️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {tx.taskName || (tx.source === 'notion' ? 'Notion task' : tx.source === 'planet' ? 'Planet completed' : 'Points earned')}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '2px' }}>
                        {new Date(tx.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: '#4ade80',
                      flexShrink: 0,
                    }}>
                      +{tx.points}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              style={{ ...styles.closeButton, marginTop: '1.5rem', width: '100%' }}
              onClick={() => setSelectedLeaderboardPlayer(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Points History Modal */}
      {showPointsHistory && (
        <div style={styles.modalOverlay} onClick={() => setShowPointsHistory(false)}>
          <div style={{ ...styles.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {pointsHistoryTab === 'personal' ? '⭐ Your Points History' : '💎 Team Points History'}
            </h2>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
              <button
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', cursor: 'pointer',
                  background: pointsHistoryTab === 'personal' ? 'rgba(255, 165, 0, 0.3)' : 'transparent',
                  color: pointsHistoryTab === 'personal' ? '#ffa500' : '#888',
                  fontWeight: pointsHistoryTab === 'personal' ? 600 : 400,
                }}
                onClick={() => {
                  setPointsHistoryTab('personal');
                  fetchPointsHistory('personal');
                }}
              >
                ⭐ Your Points
              </button>
              <button
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', cursor: 'pointer',
                  background: pointsHistoryTab === 'team' ? 'rgba(84, 144, 255, 0.3)' : 'transparent',
                  color: pointsHistoryTab === 'team' ? '#5490ff' : '#888',
                  fontWeight: pointsHistoryTab === 'team' ? 600 : 400,
                }}
                onClick={() => {
                  setPointsHistoryTab('team');
                  fetchPointsHistory('team');
                }}
              >
                💎 Team Points
              </button>
            </div>

            {/* Current Balance */}
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' }}>
                {pointsHistoryTab === 'personal' ? 'Available Balance' : 'Total Team Points'}
              </div>
              <div style={{
                fontSize: '1.8rem',
                fontWeight: 700,
                color: pointsHistoryTab === 'personal' ? '#ffa500' : '#5490ff',
              }}>
                {pointsHistoryTab === 'personal' ? `⭐ ${personalPoints}` : `💎 ${teamPoints}`}
              </div>
            </div>

            {/* Transaction List */}
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {isLoadingHistory ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  Loading history...
                </div>
              ) : pointsHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  No transactions yet
                </div>
              ) : (
                pointsHistory.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      borderLeft: `3px solid ${tx.points > 0 ? '#4ade80' : '#ff6b6b'}`,
                    }}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: tx.source === 'notion' ? 'rgba(100, 100, 255, 0.2)' : tx.source === 'planet' ? 'rgba(255, 165, 0, 0.2)' : 'rgba(128, 128, 128, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}>
                      {tx.source === 'notion' ? '📋' : tx.source === 'planet' ? '🪐' : '⚙️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {tx.taskName || (tx.source === 'notion' ? 'Notion task' : tx.source === 'planet' ? 'Planet completed' : 'Manual adjustment')}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '2px' }}>
                        {pointsHistoryTab === 'team' && tx.playerName && (
                          <span style={{ color: '#888' }}>{tx.playerName} · </span>
                        )}
                        {new Date(tx.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: tx.points > 0 ? '#4ade80' : '#ff6b6b',
                      flexShrink: 0,
                    }}>
                      {tx.points > 0 ? '+' : ''}{tx.points}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              style={{ ...styles.closeButton, marginTop: '1.5rem', width: '100%' }}
              onClick={() => setShowPointsHistory(false)}
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
              {(['stats', 'cosmetics', 'weapons', 'utility'] as const).map(tab => (
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
                    fontSize: '0.8rem',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab === 'stats' && '⚡ Stats'}
                  {tab === 'cosmetics' && '🎨 Cosmetics'}
                  {tab === 'weapons' && '🔫 Weapons'}
                  {tab === 'utility' && '🔧 Utility'}
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
                    {Math.max(0, (teamPlayers.find(p => p.username === state.currentUser)?.shipLevel || 1) - 1)} visual upgrades
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
                {/* Space Rifle - 500 pts */}
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasSpaceRifle;
                  const equipped = effects.spaceRifleEquipped;
                  const canBuy = !owned && personalPoints >= SPACE_RIFLE_COST;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🔫</span>
                        <span>Space Rifle</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Fast bullets (X key)
                        </span>
                        {owned ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              background: equipped ? 'rgba(255, 204, 0, 0.2)' : 'rgba(255,255,255,0.05)',
                              borderColor: equipped ? '#ffcc00' : '#444',
                              color: equipped ? '#ffcc00' : '#888',
                              minWidth: 80,
                            }}
                            onClick={toggleSpaceRifle}
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
                            onClick={buySpaceRifle}
                            disabled={!canBuy}
                          >
                            {SPACE_RIFLE_COST} ⭐
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* Space TNT - 1000 pts */}
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasDestroyCanon;
                  const equipped = effects.destroyCanonEquipped;
                  const canBuy = !owned && personalPoints >= SPACE_TNT_COST;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>💥</span>
                        <span>Space TNT</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Land & detonate (X key)
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
                            onClick={toggleSpaceTNT}
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
                            onClick={buySpaceTNT}
                            disabled={!canBuy}
                          >
                            {SPACE_TNT_COST} ⭐
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* Plasma Canon - 1500 pts */}
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasPlasmaCanon;
                  const equipped = effects.plasmaCanonEquipped;
                  const canBuy = !owned && personalPoints >= PLASMA_CANON_COST;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🟣</span>
                        <span>Plasma Canon</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Heavy plasma shots (X key)
                        </span>
                        {owned ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              background: equipped ? 'rgba(136, 68, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                              borderColor: equipped ? '#8844ff' : '#444',
                              color: equipped ? '#8844ff' : '#888',
                              minWidth: 80,
                            }}
                            onClick={togglePlasmaCanon}
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
                            onClick={buyPlasmaCanon}
                            disabled={!canBuy}
                          >
                            {PLASMA_CANON_COST} ⭐
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* Rocket Launcher - 2500 pts */}
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasRocketLauncher;
                  const equipped = effects.rocketLauncherEquipped;
                  const canBuy = !owned && personalPoints >= ROCKET_LAUNCHER_COST;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🚀</span>
                        <span>Rocket Launcher</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Homing missiles (X key)
                        </span>
                        {owned ? (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              background: equipped ? 'rgba(255, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                              borderColor: equipped ? '#ff4444' : '#444',
                              color: equipped ? '#ff4444' : '#888',
                              minWidth: 80,
                            }}
                            onClick={toggleRocketLauncher}
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
                            onClick={buyRocketLauncher}
                            disabled={!canBuy}
                          >
                            {ROCKET_LAUNCHER_COST} ⭐
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Utility Tab */}
            {shopTab === 'utility' && (
              <div style={styles.shopSection}>
                {/* Warp Drive */}
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasWarpDrive;
                  const canBuy = !owned && personalPoints >= WARP_DRIVE_COST;
                  return (
                    <div style={styles.effectLane}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🌀</span>
                        <span>Warp Drive</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Teleport home (H key)
                        </span>
                        {owned ? (
                          <span style={{
                            color: '#00ff88',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            padding: '6px 12px',
                          }}>
                            OWNED
                          </span>
                        ) : (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                              minWidth: 100,
                            }}
                            onClick={buyWarpDrive}
                            disabled={!canBuy}
                          >
                            {WARP_DRIVE_COST} ⭐
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

      {/* Control Hub Modal */}
      {showControlHub && (
        <ControlHubDashboard onClose={() => { setShowControlHub(false); gameRef.current?.clearLandedState(); }} />
      )}

      {/* Planet Creator Modal */}
      {showPlanetCreator && (
        <div style={styles.modalOverlay} onClick={() => { if (!isCreatingPlanet) { setShowPlanetCreator(false); gameRef.current?.clearLandedState(); } }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...styles.modal, minWidth: newPlanet.type ? '400px' : '500px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !(e.target as HTMLElement).tagName.match(/TEXTAREA/i) && newPlanet.name && !isCreatingPlanet) {
                e.preventDefault();
                savePlanet();
              }
            }}
          >
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
                  <label style={styles.label}>Description</label>
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
                    disabled={!newPlanet.name || isCreatingPlanet}
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
                  disabled={personalPoints < 50 || isUpgrading}
                >
                  {isUpgrading ? 'Generating...' : 'Generate Base Planet (50 ⭐)'}
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

                {/* Mission Control Portal */}
                {(() => {
                  const effects = getEffectsWithDefaults(getCurrentUserShip().effects);
                  const owned = effects.hasMissionControlPortal;
                  const canBuy = !owned && personalPoints >= MISSION_CONTROL_PORTAL_COST;
                  return (
                    <div style={{ ...styles.effectLane, marginBottom: '1rem' }}>
                      <div style={styles.effectLaneLabel}>
                        <span style={styles.effectLaneIcon}>🌌</span>
                        <span>Portal</span>
                      </div>
                      <div style={styles.effectLaneContent}>
                        <span style={{ fontSize: '0.75rem', color: '#888', flex: 1 }}>
                          Teleport to Mission Control
                        </span>
                        {owned ? (
                          <span style={{
                            color: '#00ff88',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            padding: '6px 12px',
                          }}>
                            BUILT
                          </span>
                        ) : (
                          <button
                            style={{
                              ...styles.effectBuyButton,
                              opacity: canBuy ? 1 : 0.5,
                            }}
                            onClick={buyMissionControlPortal}
                            disabled={!canBuy}
                          >
                            Build ({MISSION_CONTROL_PORTAL_COST} ⭐)
                          </button>
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
                    <div className="hidden-scrollbar" style={{ maxHeight: 200, overflowY: 'auto' }}>
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
                      {getUserPlanet(state.currentUser || '').history.map((entry, i, arr) => (
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
                          {i === arr.length - 1 && (
                            <button
                              style={styles.sellButton}
                              onClick={(e) => { e.stopPropagation(); sellLatestTerraform(); }}
                              title="Sell for 50 points"
                            >
                              Sell (50 ⭐)
                            </button>
                          )}
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
                    disabled={!terraformPrompt || personalPoints < 100 || isUpgrading}
                  >
                    {isUpgrading ? 'Terraforming...' : 'Terraform (100 ⭐)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Ship History Modal */}
      {showShipHistory && (
        <div style={styles.modalOverlay} onClick={() => setShowShipHistory(false)}>
          <div style={{ ...styles.modal, maxWidth: 450 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🚀 Ship Versions</h2>

            {/* Current ship preview */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <img
                src={getCurrentUserShip().currentImage}
                alt="Current Ship"
                style={{ width: 100, height: 100, borderRadius: 12, border: '3px solid #ffa500' }}
              />
              <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {Math.max(0, (teamPlayers.find(p => p.username === state.currentUser)?.shipLevel || 1) - 1)} visual upgrades
              </p>
            </div>

            {/* Ship versions history */}
            {(getCurrentUserShip().baseImage || mascotHistory.length > 0) && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Select Version
                </h4>
                <div className="hidden-scrollbar" style={{ maxHeight: 250, overflowY: 'auto' }}>
                  {/* Base ship option */}
                  {(() => {
                    const baseShipUrl = getCurrentUserShip().baseImage || '/ship-base.png';
                    const isBaseSelected = getCurrentUserShip().currentImage === baseShipUrl;
                    return (
                      <div style={{
                        ...styles.historyItem,
                        cursor: 'pointer',
                        border: isBaseSelected ? '2px solid #4ade80' : '2px solid transparent',
                      }} onClick={() => selectShipFromHistory(baseShipUrl)}>
                        <img src={baseShipUrl} alt="" style={styles.historyThumb} />
                        <div style={styles.historyInfo}>
                          <span style={styles.historyDesc}>Base Ship</span>
                          <span style={styles.historyDate}>Original</span>
                        </div>
                        {isBaseSelected && (
                          <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✓</span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Upgrade history */}
                  {mascotHistory.map((entry, i, arr) => (
                    <div key={i} style={{
                      ...styles.historyItem,
                      cursor: 'pointer',
                      border: getCurrentUserShip().currentImage === entry.imageUrl ? '2px solid #4ade80' : '2px solid transparent',
                    }} onClick={() => selectShipFromHistory(entry.imageUrl)}>
                      <img src={entry.imageUrl} alt="" style={styles.historyThumb} />
                      <div style={styles.historyInfo}>
                        <span style={styles.historyDesc}>{entry.planetName}</span>
                        <span style={styles.historyDate}>
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {getCurrentUserShip().currentImage === entry.imageUrl && (
                        <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>✓</span>
                      )}
                      <button
                        style={styles.downloadButton}
                        onClick={(e) => { e.stopPropagation(); downloadImage(entry.imageUrl, `ship-${state.currentUser}-${i + 1}`); }}
                        title="Download"
                      >
                        ⬇
                      </button>
                      {i === arr.length - 1 && (
                        <button
                          style={styles.sellButton}
                          onClick={(e) => { e.stopPropagation(); sellLatestShipUpgrade(); }}
                          title="Sell for 75 points"
                        >
                          Sell (75 ⭐)
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mascotHistory.length === 0 && (
              <p style={{ color: '#666', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>
                No upgrade history yet. Visit the shop to customize your ship!
              </p>
            )}

            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={() => setShowShipHistory(false)}>
                Close
              </button>
            </div>
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
                    { id: 'activity', label: '📊 Activity' },
                    { id: 'notion', label: '📋 Notion' },
                    { id: 'reset', label: '🗑️ Reset' },
                    { id: 'debug', label: '🔧 Debug' },
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
                      onClick={async () => {
                        setAdminTab(tab.id);
                        if (tab.id === 'activity' && activityLog.length === 0) {
                          setActivityLoading(true);
                          const { data } = await supabase
                            .from('player_sessions')
                            .select('*')
                            .order('created_at', { ascending: false })
                            .limit(100);
                          if (data) setActivityLog(data);
                          setActivityLoading(false);
                        }
                      }}
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
                                {goal.targetDate && (
                                  <span style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: (() => {
                                      const days = Math.ceil((new Date(goal.targetDate + 'T00:00:00').getTime() - Date.now()) / 86400000);
                                      if (days <= 0) return 'rgba(255,60,60,0.2)';
                                      if (days <= 3) return 'rgba(255,165,0,0.2)';
                                      if (days <= 7) return 'rgba(255,255,0,0.15)';
                                      return 'rgba(255,255,255,0.1)';
                                    })(),
                                    color: (() => {
                                      const days = Math.ceil((new Date(goal.targetDate + 'T00:00:00').getTime() - Date.now()) / 86400000);
                                      if (days <= 0) return '#ff4444';
                                      if (days <= 3) return '#ffa500';
                                      if (days <= 7) return '#ffdd00';
                                      return '#888';
                                    })(),
                                  }}>
                                    {(() => {
                                      const days = Math.ceil((new Date(goal.targetDate + 'T00:00:00').getTime() - Date.now()) / 86400000);
                                      if (days < 0) return `${Math.abs(days)}d overdue`;
                                      if (days === 0) return 'Due today';
                                      return `${days}d left`;
                                    })()}
                                  </span>
                                )}
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
                        {teamPlayers
                          .filter(p => p.username !== 'anonymous' && (!isTestPlayer(p.username) || isTestPlayer(state.currentUser || '')))
                          .map(player => (
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

                {/* Activity Log Tab */}
                {adminTab === 'activity' && (
                  <div style={{ ...styles.resetSection, borderColor: '#22d3ee' }}>
                    <h3 style={{ ...styles.resetSectionTitle, color: '#22d3ee' }}>📊 Activity Log</h3>

                    <button
                      style={{
                        ...styles.saveButton,
                        marginBottom: '1rem',
                        width: '100%',
                        opacity: activityLoading ? 0.6 : 1,
                      }}
                      disabled={activityLoading}
                      onClick={async () => {
                        setActivityLoading(true);
                        const { data, error } = await supabase
                          .from('player_sessions')
                          .select('*')
                          .order('created_at', { ascending: false })
                          .limit(100);
                        if (data && !error) {
                          setActivityLog(data);
                        }
                        setActivityLoading(false);
                      }}
                    >
                      {activityLoading ? 'Loading...' : 'Refresh'}
                    </button>

                    {activityLog.length === 0 ? (
                      <p style={{ color: '#666', textAlign: 'center', padding: '2rem 0' }}>
                        {activityLoading ? 'Loading activity...' : 'No activity yet. Click Refresh to load.'}
                      </p>
                    ) : (
                      <div style={{
                        maxHeight: '50vh',
                        overflow: 'auto',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                      }}>
                        <style>{`.activity-scroll::-webkit-scrollbar { display: none; }`}</style>
                        <div className="activity-scroll" style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}>
                          {activityLog.map((entry) => {
                            const player = teamPlayers.find(p => p.username === entry.username);
                            const playerColor = player?.color || '#888';
                            const isLogin = entry.event_type === 'login';
                            const time = new Date(entry.created_at);
                            const now = new Date();
                            const diffMs = now.getTime() - time.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMins / 60);
                            const diffDays = Math.floor(diffHours / 24);
                            let timeAgo = '';
                            if (diffMins < 1) timeAgo = 'just now';
                            else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
                            else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
                            else timeAgo = `${diffDays}d ago`;

                            return (
                              <div
                                key={entry.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 12px',
                                  background: isLogin
                                    ? 'rgba(74, 222, 128, 0.06)'
                                    : 'rgba(239, 68, 68, 0.06)',
                                  borderRadius: '6px',
                                  borderLeft: `3px solid ${isLogin ? '#4ade80' : '#ef4444'}`,
                                }}
                              >
                                <div style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: isLogin ? '#4ade80' : '#ef4444',
                                  flexShrink: 0,
                                }} />
                                <div style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  background: playerColor,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  color: '#fff',
                                  flexShrink: 0,
                                }}>
                                  {(entry.display_name || entry.username).charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ color: playerColor, fontWeight: 600, fontSize: '0.85rem' }}>
                                    {entry.display_name || entry.username}
                                  </span>
                                  <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: '6px' }}>
                                    {isLogin ? 'logged in' : 'logged out'}
                                  </span>
                                </div>
                                <div style={{
                                  color: '#666',
                                  fontSize: '0.75rem',
                                  flexShrink: 0,
                                  textAlign: 'right',
                                }}>
                                  <div>{timeAgo}</div>
                                  <div style={{ fontSize: '0.65rem', color: '#555' }}>
                                    {time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
                  </div>
                )}

                {/* Debug Tab */}
                {adminTab === 'debug' && (
                  <div style={{ ...styles.resetSection, borderColor: '#f59e0b' }}>
                    <h3 style={{ ...styles.resetSectionTitle, color: '#f59e0b' }}>🔧 Debug Tools</h3>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
                      Testing tools for development. Changes are local only (visual).
                    </p>

                    {/* Ship Level Tester */}
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      borderRadius: '8px',
                      padding: '1rem',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      marginBottom: '1rem',
                    }}>
                      <label style={{ ...styles.label, marginBottom: '12px', display: 'block' }}>
                        🚀 Ship Level (for Escort Drones)
                      </label>
                      <p style={{ color: '#888', fontSize: '11px', marginBottom: '12px' }}>
                        Drones unlock every 5 levels: Lv.5 = 1 drone, Lv.10 = 2 drones, etc.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <input
                          type="range"
                          min="1"
                          max="30"
                          value={debugShipLevel}
                          onChange={e => setDebugShipLevel(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: '#f59e0b' }}
                        />
                        <span style={{
                          color: '#f59e0b',
                          fontWeight: 'bold',
                          fontSize: '1.2rem',
                          minWidth: '40px',
                          textAlign: 'center',
                        }}>
                          {debugShipLevel}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          style={{
                            ...styles.resetButtonSmall,
                            flex: 1,
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          }}
                          onClick={() => {
                            if (gameRef.current) {
                              // Directly set ship level for testing
                              (gameRef.current as any).shipLevel = debugShipLevel;
                              (gameRef.current as any).updateEscortDrones();
                            }
                          }}
                        >
                          Apply Ship Level
                        </button>
                        <button
                          style={{
                            ...styles.resetButtonSmall,
                            flex: 1,
                            background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                          }}
                          onClick={() => {
                            if (gameRef.current) {
                              // Reset to actual level
                              const actualLevel = 1 + state.upgradeCount;
                              (gameRef.current as any).shipLevel = actualLevel;
                              (gameRef.current as any).updateEscortDrones();
                              setDebugShipLevel(actualLevel);
                            }
                          }}
                        >
                          Reset to Actual
                        </button>
                      </div>
                      <p style={{ color: '#666', fontSize: '10px', marginTop: '8px', textAlign: 'center' }}>
                        Current drones: {Math.floor(debugShipLevel / 5)} | Actual ship level: {1 + state.upgradeCount}
                      </p>
                    </div>
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

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Target Date (optional)</label>
                    <input
                      type="date"
                      style={styles.input}
                      value={editingGoal.targetDate || ''}
                      onChange={e => setEditingGoal({ ...editingGoal, targetDate: e.target.value || undefined })}
                    />
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
                        targetDate: editingGoal.targetDate,
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
  logo: { height: 60, marginBottom: '1rem', filter: 'drop-shadow(0 0 20px rgba(255, 165, 0, 0.6)) drop-shadow(0 0 40px rgba(255, 107, 74, 0.4))' },
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
  audioToggleIcon: {
    position: 'absolute', right: 20, width: 36, height: 36, borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)',
    color: '#fff', fontSize: '1rem', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
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
  sellButton: {
    background: '#ff6b35', border: 'none', borderRadius: 4,
    padding: '4px 8px', color: 'white', fontSize: '0.7rem',
    cursor: 'pointer', marginLeft: 4, whiteSpace: 'nowrap',
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
  eventNotification: {
    position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.9)', border: '1px solid #666',
    color: '#fff', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem',
    animation: 'fadeIn 0.3s ease', whiteSpace: 'nowrap',
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
  closeButton: {
    padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid #444',
    borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: '1rem',
  },
};

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  button:hover { transform: scale(1.02); }
  select option { background: #1a1a2e; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
  *::-webkit-scrollbar { display: none; }
`;
document.head.appendChild(styleSheet);

export default App;
