import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { SpaceGame } from './SpaceGame';
import { Planet, RewardType, OtherPlayer, PointTransaction as PointTx, ShipEffects as TypedShipEffects } from './types';
import { soundManager } from './SoundManager';
import { useTeam } from './hooks/useTeam';
import { useMultiplayerSync } from './hooks/useMultiplayerSync';
import { usePlayerPositions } from './hooks/usePlayerPositions';
import { getLocalPlayerId, getShareUrl as buildShareUrl } from './lib/supabase';

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
  { id: 'melia', name: 'Melia', color: '#ff6b9d' },
  { id: 'hugue', name: 'Hugue', color: '#8b5cf6' },
];

// Points awarded per milestone size
const POINTS_PER_SIZE = { small: 50, medium: 100, big: 200 };

// AI visual upgrade cost
const VISUAL_UPGRADE_COST = 75;

// Programmatic ship effects (no AI needed - instant purchase)
// Size upgrades: 5 levels with increasing costs (ship)
const SIZE_COSTS = [40, 60, 90, 130, 180]; // Cost per level

// Speed upgrades: 5 levels with increasing costs
const SPEED_COSTS = [30, 50, 80, 120, 180]; // Cost per level

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

// Default goals/milestones
const DEFAULT_GOALS = {
  business: [
    { id: 'b1', name: 'First Customer', size: 'medium', description: 'Land your very first paying customer', reward: 'speed_boost', realWorldReward: 'Celebrate with the team!' },
    { id: 'b2', name: '$1k MRR', size: 'small', description: 'Reach $1,000 monthly recurring revenue', reward: 'trail' },
    { id: 'b3', name: '$5k MRR', size: 'medium', description: 'Hit $5,000 monthly recurring revenue', reward: 'glow', realWorldReward: '+$500/month salary increase' },
    { id: 'b4', name: 'Break Even', size: 'big', description: 'Revenue covers all expenses - sustainable!', reward: 'shield', realWorldReward: 'Team dinner at a fancy restaurant' },
    { id: 'b5', name: '$10k MRR', size: 'medium', description: 'Double digits! $10,000 MRR milestone', reward: 'acceleration', realWorldReward: '+$1,000/month salary increase' },
    { id: 'b6', name: '$25k MRR', size: 'medium', description: 'Quarter way to $100k MRR', reward: 'handling', realWorldReward: 'New MacBook Pro' },
    { id: 'b7', name: '100 Customers', size: 'big', description: 'Triple digit customer base achieved', reward: 'size', realWorldReward: 'Weekend trip anywhere in Europe' },
    { id: 'b8', name: '$50k MRR', size: 'big', description: 'Half way to the $100k MRR goal', reward: 'special', realWorldReward: '+$2,500/month salary increase' },
    { id: 'b9', name: '$100k MRR', size: 'big', description: 'The big one! $100,000 monthly recurring', reward: 'special', realWorldReward: '10% equity bonus + $5k/month raise' },
    { id: 'b10', name: '$5M ARR', size: 'big', description: 'Five million annual recurring revenue!', reward: 'special', realWorldReward: 'Lambo or Tesla of your choice' },
  ],
  product: [
    { id: 'p1', name: 'Ship v1', size: 'big', description: 'Launch the first version of the product', reward: 'acceleration', realWorldReward: 'Launch party!' },
    { id: 'p2', name: 'Case Study', size: 'medium', description: 'Publish first customer success story', reward: 'trail' },
    { id: 'p3', name: 'Onboarding v2', size: 'medium', description: 'Revamped onboarding with better activation', reward: 'handling' },
    { id: 'p4', name: 'Self-Serve', size: 'big', description: 'Customers can sign up without sales call', reward: 'speed_boost', realWorldReward: '+$1,500/month salary increase' },
    { id: 'p5', name: 'API Launch', size: 'big', description: 'Public API for integrations and developers', reward: 'glow', realWorldReward: 'Conference trip to speak about it' },
    { id: 'p6', name: 'Enterprise', size: 'big', description: 'Enterprise tier with SSO, SLA, dedicated support', reward: 'shield', realWorldReward: '+$3,000/month salary increase' },
  ],
  achievement: [
    { id: 'a1', name: 'Alex Hormozi', size: 'big', description: 'Get noticed by Alex Hormozi', reward: 'special', realWorldReward: 'Lifetime bragging rights + framed tweet' },
    { id: 'a2', name: 'Gary Vee', size: 'big', description: 'Get a shoutout from Gary Vaynerchuk', reward: 'special', realWorldReward: 'VIP tickets to VeeCon' },
    { id: 'a3', name: 'Viral Post', size: 'medium', description: 'A post goes viral (1M+ impressions)', reward: 'trail', realWorldReward: 'Professional photoshoot' },
    { id: 'a4', name: '$10k Day', size: 'big', description: 'Make $10,000 in a single day', reward: 'glow', realWorldReward: 'Rolex or luxury watch' },
    { id: 'a5', name: 'First Hire', size: 'medium', description: 'Hire the first team member', reward: 'size', realWorldReward: 'CEO title officially earned' },
  ],
};

interface Goal {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'big';
  description: string;
  reward: RewardType;
  realWorldReward?: string;
}

interface Goals {
  business: Goal[];
  product: Goal[];
  achievement: Goal[];
}

interface UserPlanet {
  imageUrl: string;
  terraformCount: number;
  history: { imageUrl: string; description: string; timestamp: number }[];
  sizeLevel: number; // 0-5 levels
}

const loadUserPlanets = (): Record<string, UserPlanet> => {
  try {
    const saved = localStorage.getItem(USER_PLANETS_KEY);
    if (saved) return JSON.parse(saved);
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
  type: 'business' | 'product' | 'achievement';
  size: 'small' | 'medium' | 'big';
  reward: RewardType;
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
  speedBonus: number; // 0-5 levels, each gives +10% speed
  ownedGlows: string[]; // Owned glow colors
  ownedTrails: string[]; // Owned trail types
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
const loadState = (): SavedState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    localStorage.setItem(USER_SHIPS_KEY, JSON.stringify(ships));
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
    localStorage.setItem(MASCOT_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save mascot history:', e);
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

// Save image locally via the save-image-server
const saveImageLocally = async (
  base64: string,
  type: 'ship' | 'planet',
  userId: string,
  name: string
): Promise<string> => {
  try {
    const response = await fetch('http://localhost:3456/save-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, type, userId, name })
    });
    const data = await response.json();
    if (data.success) {
      console.log(`Image saved to: ${data.fullPath}`);
      return data.path; // Returns path like /ships/quentin-engine-123.png
    }
  } catch (err) {
    console.warn('Local save server not running, using base64 fallback');
  }
  // Fallback to base64 if server not running
  return base64;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SpaceGame | null>(null);
  const onDockRef = useRef<(planet: Planet) => void>(() => {});
  const [state, setState] = useState<SavedState>(loadState);
  const [customPlanets, setCustomPlanets] = useState<CustomPlanet[]>(loadCustomPlanets);
  const [teamPoints, setTeamPoints] = useState(loadTeamPoints);
  const [userShips, setUserShips] = useState<Record<string, UserShip>>(loadUserShips);
  const [mascotHistory, setMascotHistory] = useState<MascotHistoryEntry[]>(loadMascotHistory);
  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [userPlanets, setUserPlanets] = useState<Record<string, UserPlanet>>(loadUserPlanets);
  const [showTerraform, setShowTerraform] = useState(false);
  const [terraformPrompt, setTerraformPrompt] = useState('');
  const [viewingPlanetOwner, setViewingPlanetOwner] = useState<string | null>(null);

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [showUserSelect, setShowUserSelect] = useState(!state.currentUser);
  const [showPlanetCreator, setShowPlanetCreator] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showMemoryGallery, setShowMemoryGallery] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any | null>(null);

  // Planet creator form state
  const [newPlanet, setNewPlanet] = useState<Partial<CustomPlanet>>({
    type: 'business',
    size: 'medium',
    reward: 'glow',
  });
  const [planetImageFile, setPlanetImageFile] = useState<File | null>(null);
  const [planetImagePreview, setPlanetImagePreview] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');

  // Prompt configs (loaded from JSON)
  const [shipPrompts, setShipPrompts] = useState<ShipPrompts>(DEFAULT_SHIP_PROMPTS);
  const [planetPrompts, setPlanetPrompts] = useState<PlanetPrompts>(DEFAULT_PLANET_PROMPTS);

  // Multiplayer state
  const [shareToast, setShareToast] = useState<string | null>(null);
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
    effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, ownedGlows: [], ownedTrails: [] },
  };

  // Multiplayer sync hook - handles team state sync
  const {
    players: teamPlayers,
    teamPoints: syncedTeamPoints,
    completedPlanets: syncedCompletedPlanets,
    recentTransactions,
    isConnected,
    updateTeamPoints: updateRemoteTeamPoints,
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
  const currentDbPlayerId = useMemo(() =>
    teamPlayers.find(p => p.username === state.currentUser)?.id || null,
    [teamPlayers, state.currentUser]
  );

  const playersForPositions = useMemo(() =>
    teamPlayers.map(p => ({
      id: p.id,
      username: p.username,
      displayName: p.displayName,
      color: p.color,
      shipImage: p.shipImage,
      shipEffects: p.shipEffects,
    })),
    [teamPlayers]
  );

  // Player positions hook - handles real-time ship positions
  const { otherPlayers, broadcastPosition } = usePlayerPositions({
    teamId: team?.id || null,
    playerId: currentDbPlayerId,
    players: playersForPositions,
    localShip: gameRef.current?.getShipState() || { x: 5000, y: 5200, vx: 0, vy: 0, rotation: -1.5708, thrusting: false },
  });

  // Update game with other players
  useEffect(() => {
    if (gameRef.current && otherPlayers.length > 0) {
      gameRef.current.setOtherPlayers(otherPlayers);
    }
  }, [otherPlayers]);

  // Broadcast position regularly when game is running
  useEffect(() => {
    if (!team || !gameRef.current) return;

    const broadcastLoop = () => {
      if (gameRef.current) {
        broadcastPosition();
      }
      positionBroadcastRef.current = requestAnimationFrame(broadcastLoop);
    };

    positionBroadcastRef.current = requestAnimationFrame(broadcastLoop);

    return () => {
      if (positionBroadcastRef.current) {
        cancelAnimationFrame(positionBroadcastRef.current);
      }
    };
  }, [team, broadcastPosition]);

  // Sync local state to team when team is joined
  useEffect(() => {
    if (team && state.completedPlanets.length > 0) {
      syncLocalState(state.completedPlanets, customPlanets, goals);
    }
  }, [team?.id]);

  // Copy share URL to clipboard
  const copyShareUrl = () => {
    if (team?.inviteCode) {
      const url = buildShareUrl(team.inviteCode);
      navigator.clipboard.writeText(url).then(() => {
        setShareToast('Link copied!');
        setTimeout(() => setShareToast(null), 2000);
      });
    }
  };

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
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveCustomPlanets(customPlanets);
  }, [customPlanets]);

  useEffect(() => {
    saveTeamPoints(teamPoints);
  }, [teamPoints]);

  useEffect(() => {
    saveUserShips(userShips);
  }, [userShips]);

  useEffect(() => {
    saveMascotHistory(mascotHistory);
  }, [mascotHistory]);

  useEffect(() => {
    saveGoals(goals);
  }, [goals]);

  useEffect(() => {
    saveUserPlanets(userPlanets);
  }, [userPlanets]);

  // Reset everything
  const resetEverything = () => {
    if (!confirm('Are you sure you want to reset EVERYTHING? This cannot be undone!')) return;

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
  };

  // Update a goal
  const updateGoal = (type: 'business' | 'product' | 'achievement', goalId: string, updates: Partial<Goal>) => {
    setGoals(prev => ({
      ...prev,
      [type]: prev[type].map(g => g.id === goalId ? { ...g, ...updates } : g)
    }));
  };

  // Add a new goal
  const addGoal = (type: 'business' | 'product' | 'achievement') => {
    const newId = `${type[0]}${Date.now()}`;
    const newGoal: Goal = {
      id: newId,
      name: 'New Goal',
      size: 'medium',
      description: 'Description here',
      reward: 'glow',
    };
    setGoals(prev => ({
      ...prev,
      [type]: [...prev[type], newGoal]
    }));
    setEditingGoal({ ...newGoal, type });
  };

  // Delete a goal
  const deleteGoal = (type: 'business' | 'product' | 'achievement', goalId: string) => {
    if (!confirm('Delete this goal?')) return;
    setGoals(prev => ({
      ...prev,
      [type]: prev[type].filter(g => g.id !== goalId)
    }));
  };

  // Generate base planet (for first-time setup)
  const generateBasePlanet = async () => {
    if (teamPoints < 25) return;

    const userId = state.currentUser || 'default';
    const userColor = USERS.find(u => u.id === userId)?.color || '#ffa500';
    const planetId = `user-planet-${userId}`;

    // Close modal immediately
    setShowTerraform(false);
    setIsUpgrading(true);
    setUpgradeMessage('Creating your planet...');
    gameRef.current?.startUpgradeAnimation(planetId);

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
        newImageUrl = bgData.image?.url || newImageUrl;

        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(newImageUrl);
        newImageUrl = await saveImageLocally(base64Image, 'planet', userId, 'base');

        setTeamPoints(prev => prev - 25);

        setUserPlanets(prev => ({
          ...prev,
          [userId]: {
            imageUrl: newImageUrl,
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
      }

      setIsUpgrading(false);
      gameRef.current?.stopUpgradeAnimation();
    } catch (error) {
      console.error('Failed to generate base planet:', error);
      setUpgradeMessage('Generation failed');
      setTimeout(() => {
        setIsUpgrading(false);
        gameRef.current?.stopUpgradeAnimation();
      }, 1500);
    }
  };

  // Terraform planet
  const terraformPlanet = async () => {
    if (!terraformPrompt || teamPoints < 50) return;

    const userId = state.currentUser || 'default';
    const currentPlanet = getUserPlanet(userId);
    const promptText = terraformPrompt; // Save before clearing
    const planetId = `user-planet-${userId}`;

    // Close modal immediately
    setShowTerraform(false);
    setTerraformPrompt('');
    setIsUpgrading(true);
    setUpgradeMessage('Terraforming planet...');
    gameRef.current?.startUpgradeAnimation(planetId);

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
        newImageUrl = bgData.image?.url || newImageUrl;

        // Save locally
        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(newImageUrl);
        newImageUrl = await saveImageLocally(base64Image, 'planet', userId, 'terraform');

        // Deduct points
        setTeamPoints(prev => prev - 50);

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
      }

      setIsUpgrading(false);
      gameRef.current?.stopUpgradeAnimation();
    } catch (error) {
      console.error('Failed to terraform:', error);
      setUpgradeMessage('Terraform failed');
      setTimeout(() => {
        setIsUpgrading(false);
        gameRef.current?.stopUpgradeAnimation();
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

  // Get a user's planet
  const getUserPlanet = (userId: string): UserPlanet => {
    const planet = userPlanets[userId];
    return {
      imageUrl: planet?.imageUrl || DEFAULT_PLANET_IMAGE,
      terraformCount: planet?.terraformCount || 0,
      history: planet?.history || [],
      sizeLevel: planet?.sizeLevel || 0,
    };
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
    if (teamPoints < cost) return;

    const newLevel = currentLevel + 1;
    setTeamPoints(prev => prev - cost);
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
    // Check if this is the Memory planet
    if (planet.id === 'memory-lane') {
      setShowMemoryGallery(true);
      return;
    }

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

  }, [state.completedPlanets, state.currentUser, team, completeRemotePlanet]);

  // Keep the ref updated with latest handleDock
  useEffect(() => {
    onDockRef.current = handleDock;
  }, [handleDock]);

  // Stable callback that uses the ref
  const stableOnDock = useCallback((planet: Planet) => {
    onDockRef.current(planet);
  }, []);

  // Buy visual upgrade from shop (AI-generated changes to ship appearance)
  const buyVisualUpgrade = async () => {
    if (teamPoints < VISUAL_UPGRADE_COST) return;

    if (!upgradePrompt) {
      alert('Please describe how you want to modify your vessel!');
      return;
    }

    const promptText = upgradePrompt; // Save before clearing

    // Close modal immediately
    setShowShop(false);
    setUpgradePrompt('');
    setIsUpgrading(true);
    setUpgradeMessage('Modifying your vessel...');
    gameRef.current?.startUpgradeAnimation();

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
        newImageUrl = bgData.image?.url || newImageUrl;

        // Save to local filesystem
        setUpgradeMessage('Saving...');
        const base64Image = await getImageAsBase64(newImageUrl);
        const userId = state.currentUser || 'default';
        newImageUrl = await saveImageLocally(base64Image, 'ship', userId, 'visual-upgrade');
      }

      if (newImageUrl) {
        // Deduct points
        setTeamPoints(prev => prev - VISUAL_UPGRADE_COST);

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

        // Add to mascot history
        setMascotHistory(prev => [...prev, {
          imageUrl: newImageUrl,
          planetName: promptText.substring(0, 30) + (promptText.length > 30 ? '...' : ''),
          timestamp: Date.now(),
          earnedBy: state.currentUser || 'unknown',
        }]);
      }

      setIsUpgrading(false);
      gameRef.current?.stopUpgradeAnimation();
    } catch (error) {
      console.error('Failed to generate visual upgrade:', error);
      setUpgradeMessage('Upgrade failed');
      setTimeout(() => {
        setIsUpgrading(false);
        gameRef.current?.stopUpgradeAnimation();
      }, 1500);
    }
  };

  // Buy size upgrade (max 5 levels)
  const buySizeUpgrade = () => {
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const currentLevel = Math.floor(currentEffects.sizeBonus / 10); // Convert old percentage to level

    if (currentLevel >= 5) return;
    const cost = SIZE_COSTS[currentLevel];
    if (teamPoints < cost) return;

    const userId = state.currentUser || 'default';
    const newEffects = { ...currentEffects, sizeBonus: (currentLevel + 1) * 10 }; // Store as percentage for compatibility

    setTeamPoints(prev => prev - cost);
    updateUserShipEffects(userId, currentShip, newEffects);
    soundManager.playShipUpgrade();
  };

  // Buy speed upgrade (max 5 levels)
  const buySpeedUpgrade = () => {
    const currentShip = getCurrentUserShip();
    const currentEffects = getEffectsWithDefaults(currentShip.effects);
    const currentLevel = currentEffects.speedBonus;

    if (currentLevel >= 5) return;
    const cost = SPEED_COSTS[currentLevel];
    if (teamPoints < cost) return;

    const userId = state.currentUser || 'default';
    const newEffects = { ...currentEffects, speedBonus: currentLevel + 1 };

    setTeamPoints(prev => prev - cost);
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
      if (teamPoints < glow.cost) return;
      const newEffects = {
        ...currentEffects,
        ownedGlows: [...currentEffects.ownedGlows, glow.value],
        glowColor: glow.value,
      };
      setTeamPoints(prev => prev - glow.cost);
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
      if (teamPoints < trail.cost) return;
      const newEffects: ShipEffects = {
        ...currentEffects,
        ownedTrails: [...currentEffects.ownedTrails, trail.value],
        trailType: trail.value as 'fire' | 'ice' | 'rainbow',
      };
      setTeamPoints(prev => prev - trail.cost);
      updateUserShipEffects(userId, currentShip, newEffects);
      soundManager.playShipUpgrade();
    }
  };

  // Helper to get effects with defaults
  const getEffectsWithDefaults = (effects: ShipEffects | undefined): ShipEffects => ({
    glowColor: effects?.glowColor ?? null,
    trailType: effects?.trailType ?? 'default',
    sizeBonus: effects?.sizeBonus ?? 0,
    speedBonus: effects?.speedBonus ?? 0,
    ownedGlows: effects?.ownedGlows ?? [],
    ownedTrails: effects?.ownedTrails ?? [],
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
          effects: { glowColor: null, trailType: 'default', sizeBonus: 0, speedBonus: 0, ownedGlows: [], ownedTrails: [] },
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
        const localPath = await saveImageLocally(
          base64Image,
          'planet',
          state.currentUser || 'unknown',
          newPlanet.name || 'planet'
        );
        setPlanetImagePreview(localPath);
      }
    } catch (error) {
      console.error('Failed to generate planet image:', error);
    }
    setIsGeneratingImage(false);
  };

  // Save new planet
  const savePlanet = () => {
    if (!newPlanet.name || !newPlanet.description) return;

    const planet: CustomPlanet = {
      id: `custom-${Date.now()}`,
      name: newPlanet.name,
      description: newPlanet.description,
      type: newPlanet.type || 'business',
      size: newPlanet.size || 'medium',
      reward: newPlanet.reward || 'glow',
      realWorldReward: newPlanet.realWorldReward,
      imageUrl: planetImagePreview || undefined,
      createdBy: state.currentUser || 'unknown',
    };

    setCustomPlanets(prev => [...prev, planet]);
    gameRef.current?.addCustomPlanet(planet);

    setNewPlanet({ type: 'business', size: 'medium', reward: 'glow' });
    setPlanetImageFile(null);
    setPlanetImagePreview(null);
    setImagePrompt('');
    setShowPlanetCreator(false);
  };

  // Initialize game
  useEffect(() => {
    if (!canvasRef.current || showWelcome || showUserSelect) return;

    const currentShip = getCurrentUserShip();
    const game = new SpaceGame(canvasRef.current, stableOnDock, customPlanets, currentShip.currentImage, goals, currentShip.upgrades.length, userPlanets, state.currentUser || 'quentin');
    gameRef.current = game;

    // Initialize ship effects if present
    if (currentShip.effects) {
      game.updateShipEffects(currentShip.effects);
    }

    state.completedPlanets.forEach(id => game.completePlanet(id));
    game.start();

    return () => {
      game.stop();
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

      {/* Share button - always available when connected */}
      {team && (
        <div style={styles.multiplayerButtons}>
          <button
            style={styles.shareButton}
            onClick={copyShareUrl}
            title="Copy invite link"
          >
            🔗 Share
          </button>
        </div>
      )}

      {/* Share toast */}
      {shareToast && (
        <div style={styles.toast}>
          {shareToast}
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
      </div>

      {/* Ship preview - clickable to show evolution */}
      <div
        style={styles.robotPreview}
        onClick={() => setShowMemoryGallery(true)}
        title="View ship evolution"
      >
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

      {/* Shop Modal */}
      {showShop && (
        <div style={styles.modalOverlay} onClick={() => !isUpgrading && setShowShop(false)}>
          <div style={{ ...styles.modal, maxWidth: 550 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🛒 Upgrade Shop</h2>
            <p style={styles.shopPoints}>💎 {teamPoints} Team Points Available</p>

            {/* Current ship preview */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <img
                src={getCurrentUserShip().currentImage}
                alt="Your Ship"
                style={{ width: 80, height: 80, borderRadius: 12, border: '2px solid #ffa500' }}
              />
              <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {getCurrentUserShip().upgrades.length} visual upgrades
              </p>
            </div>

            {/* AI Visual Upgrade Section */}
            <div style={styles.shopSection}>
              <h3 style={styles.shopSectionTitle}>🎨 Visual Modification</h3>
              <textarea
                style={styles.upgradeInput}
                value={upgradePrompt}
                onChange={e => setUpgradePrompt(e.target.value)}
                placeholder="Describe what you want to add..."
                rows={2}
              />
              <button
                style={{
                  ...styles.saveButton,
                  width: '100%',
                  marginTop: '0.75rem',
                  opacity: teamPoints >= VISUAL_UPGRADE_COST && upgradePrompt ? 1 : 0.5,
                }}
                onClick={buyVisualUpgrade}
                disabled={!upgradePrompt || teamPoints < VISUAL_UPGRADE_COST || isUpgrading}
              >
                {isUpgrading ? 'Generating...' : `Modify Vessel (${VISUAL_UPGRADE_COST} 💎)`}
              </button>
            </div>

            {/* Instant Effects Section */}
            <div style={styles.shopSection}>
              <h3 style={styles.shopSectionTitle}>⚡ Instant Effects</h3>

              {/* Size Upgrade with dots */}
              {(() => {
                const currentLevel = Math.floor(getEffectsWithDefaults(getCurrentUserShip().effects).sizeBonus / 10);
                const nextCost = currentLevel < 5 ? SIZE_COSTS[currentLevel] : null;
                const canBuy = nextCost !== null && teamPoints >= nextCost;
                return (
                  <div style={styles.effectLane}>
                    <div style={styles.effectLaneLabel}>
                      <span style={styles.effectLaneIcon}>📈</span>
                      <span>Size</span>
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
                          +10% ({nextCost} 💎)
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
                const nextCost = currentLevel < 5 ? SPEED_COSTS[currentLevel] : null;
                const canBuy = nextCost !== null && teamPoints >= nextCost;
                return (
                  <div style={styles.effectLane}>
                    <div style={styles.effectLaneLabel}>
                      <span style={styles.effectLaneIcon}>⚡</span>
                      <span>Speed</span>
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
                          +10% ({nextCost} 💎)
                        </button>
                      ) : (
                        <span style={styles.effectMaxed}>MAX</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Glows Lane */}
              <div style={styles.effectLane}>
                <div style={styles.effectLaneLabel}>
                  <span style={styles.effectLaneIcon}>✨</span>
                  <span>Glow</span>
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
                          opacity: owned || teamPoints >= glow.cost ? 1 : 0.5,
                        }}
                        onClick={() => handleGlow(glow.id)}
                        disabled={!owned && teamPoints < glow.cost}
                        title={owned ? (active ? 'Click to deactivate' : 'Click to activate') : `Buy for ${glow.cost} points`}
                      >
                        <span style={{ fontSize: '1.2rem' }}>{glow.icon}</span>
                        <span style={{ fontSize: '0.65rem', color: '#aaa' }}>{glow.name}</span>
                        {!owned && <span style={{ fontSize: '0.6rem', color: '#5490ff' }}>{glow.cost} 💎</span>}
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
                          opacity: owned || teamPoints >= trail.cost ? 1 : 0.5,
                        }}
                        onClick={() => handleTrail(trail.id)}
                        disabled={!owned && teamPoints < trail.cost}
                        title={owned ? (active ? 'Click to deactivate' : 'Click to activate') : `Buy for ${trail.cost} points`}
                      >
                        <span style={{ fontSize: '1.2rem' }}>{trail.icon}</span>
                        <span style={{ fontSize: '0.65rem', color: '#aaa' }}>{trail.name}</span>
                        {!owned && <span style={{ fontSize: '0.6rem', color: '#5490ff' }}>{trail.cost} 💎</span>}
                        {owned && active && <span style={{ fontSize: '0.55rem', color: '#ffa500' }}>ON</span>}
                        {owned && !active && <span style={{ fontSize: '0.55rem', color: '#666' }}>owned</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button style={{ ...styles.cancelButton, width: '100%', marginTop: '1rem' }} onClick={() => setShowShop(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Memory Gallery Modal */}
      {showMemoryGallery && (
        <div style={styles.modalOverlay} onClick={() => setShowMemoryGallery(false)}>
          <div style={{ ...styles.modal, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>📸 Ship Evolution Gallery</h2>
            <p style={{ color: '#888', marginBottom: '1rem' }}>
              {mascotHistory.length} versions • Click to select
            </p>

            {mascotHistory.length === 0 ? (
              <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
                Complete milestones or buy upgrades to see your ship evolve!
              </p>
            ) : (
              <div style={styles.galleryGrid}>
                {mascotHistory.map((entry, i) => {
                  const isCurrentShip = getCurrentUserShip().currentImage === entry.imageUrl;
                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.galleryItem,
                        border: isCurrentShip ? '2px solid #ffa500' : '1px solid #333',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        if (!isCurrentShip) {
                          const userId = state.currentUser || 'default';
                          setUserShips(prev => ({
                            ...prev,
                            [userId]: {
                              ...prev[userId],
                              currentImage: entry.imageUrl,
                            }
                          }));
                          gameRef.current?.updateShipImage(entry.imageUrl);
                          soundManager.playUIClick();
                        }
                      }}
                    >
                      <div style={styles.galleryImageWrapper}>
                        <img src={entry.imageUrl} alt={entry.planetName} style={styles.galleryImage} />
                        {isCurrentShip && (
                          <div style={styles.currentShipBadge}>Current</div>
                        )}
                        <button
                          style={styles.downloadButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadImage(entry.imageUrl, `ship-${entry.earnedBy}-${i + 1}`);
                          }}
                          title="Download"
                        >
                          ⬇
                        </button>
                      </div>
                      <div style={styles.galleryInfo}>
                        <span style={styles.galleryPlanet}>{entry.planetName}</span>
                        <span style={styles.galleryMeta}>
                          by {USERS.find(u => u.id === entry.earnedBy)?.name || entry.earnedBy}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button style={styles.cancelButton} onClick={() => setShowMemoryGallery(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Planet Creator Modal */}
      {showPlanetCreator && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>Create New Planet</h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>Planet Name *</label>
              <input
                type="text"
                style={styles.input}
                value={newPlanet.name || ''}
                onChange={e => setNewPlanet(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., $1M ARR"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description *</label>
              <input
                type="text"
                style={styles.input}
                value={newPlanet.description || ''}
                onChange={e => setNewPlanet(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g., Reach one million in annual recurring revenue"
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Type</label>
                <select
                  style={styles.select}
                  value={newPlanet.type}
                  onChange={e => setNewPlanet(p => ({ ...p, type: e.target.value as any }))}
                >
                  <option value="business">Business</option>
                  <option value="product">Product</option>
                  <option value="achievement">Achievement</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Size</label>
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
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Real World Reward (optional)</label>
              <input
                type="text"
                style={styles.input}
                value={newPlanet.realWorldReward || ''}
                onChange={e => setNewPlanet(p => ({ ...p, realWorldReward: e.target.value }))}
                placeholder="e.g., +$2,000/month salary increase"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Planet Image</label>
              <div style={styles.imageOptions}>
                <div style={styles.imageUpload}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    style={{ display: 'none' }}
                    id="planet-image"
                  />
                  <label htmlFor="planet-image" style={styles.uploadButton}>
                    Upload
                  </label>
                </div>
                <span style={{ color: '#666' }}>or</span>
                <div style={styles.aiGenerate}>
                  <input
                    type="text"
                    style={{ ...styles.input, flex: 1 }}
                    value={imagePrompt}
                    onChange={e => setImagePrompt(e.target.value)}
                    placeholder="Describe..."
                  />
                  <button
                    style={styles.generateButton}
                    onClick={generatePlanetImage}
                    disabled={isGeneratingImage || !imagePrompt}
                  >
                    {isGeneratingImage ? '...' : 'AI'}
                  </button>
                </div>
              </div>
              {planetImagePreview && (
                <div style={styles.imagePreview}>
                  <img src={planetImagePreview} alt="Preview" style={styles.previewImage} />
                </div>
              )}
            </div>

            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={() => setShowPlanetCreator(false)}>
                Cancel
              </button>
              <button
                style={styles.saveButton}
                onClick={savePlanet}
                disabled={!newPlanet.name || !newPlanet.description}
              >
                Create Planet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terraform Modal */}
      {showTerraform && (
        <div style={styles.modalOverlay} onClick={() => !isUpgrading && setShowTerraform(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🌍 Terraform Your Planet</h2>
            <p style={styles.shopPoints}>💎 {teamPoints} Team Points Available</p>

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
                  disabled={teamPoints < 25 || isUpgrading}
                >
                  {isUpgrading ? 'Generating...' : 'Generate Base Planet (25 💎)'}
                </button>
                <button style={{ ...styles.cancelButton, marginTop: '1rem' }} onClick={() => setShowTerraform(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {/* Planet Size Upgrade */}
                {(() => {
                  const currentLevel = getUserPlanet(state.currentUser || '').sizeLevel;
                  const nextCost = currentLevel < 5 ? PLANET_SIZE_COSTS[currentLevel] : null;
                  const canBuy = nextCost !== null && teamPoints >= nextCost;
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
                            +20% ({nextCost} 💎)
                          </button>
                        ) : (
                          <span style={styles.effectMaxed}>MAX</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Terraform history */}
                {getUserPlanet(state.currentUser || '').history.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      Terraform History
                    </h4>
                    <div className="hidden-scrollbar" style={{ maxHeight: 120, overflowY: 'auto' }}>
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
                  Terraform: 50 💎
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
                  <button style={styles.cancelButton} onClick={() => setShowTerraform(false)}>
                    Cancel
                  </button>
                  <button
                    style={styles.saveButton}
                    onClick={terraformPlanet}
                    disabled={!terraformPrompt || teamPoints < 50 || isUpgrading}
                  >
                    {isUpgrading ? 'Terraforming...' : 'Terraform (50 💎)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* View Other Player's Planet Modal */}
      {viewingPlanetOwner && (
        <div style={styles.modalOverlay} onClick={() => setViewingPlanetOwner(null)}>
          <div style={{ ...styles.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              🌍 {viewingPlanetOwner.charAt(0).toUpperCase() + viewingPlanetOwner.slice(1)}'s World
            </h2>

            {/* Planet preview */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              {getUserPlanet(viewingPlanetOwner).imageUrl ? (
                <img
                  src={getUserPlanet(viewingPlanetOwner).imageUrl}
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
            </div>

            {/* Terraform history */}
            {getUserPlanet(viewingPlanetOwner).history.length > 0 ? (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Terraform History
                </h4>
                <div className="hidden-scrollbar" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {getUserPlanet(viewingPlanetOwner).history.map((entry, i) => {
                    const isOwner = viewingPlanetOwner === state.currentUser;
                    const isSelected = getUserPlanet(viewingPlanetOwner).imageUrl === entry.imageUrl;
                    return (
                      <div
                        key={i}
                        style={{
                          ...styles.historyItem,
                          cursor: isOwner ? 'pointer' : 'default',
                          border: isSelected ? '2px solid #4ade80' : '2px solid transparent',
                        }}
                        onClick={isOwner ? () => selectPlanetFromHistory(viewingPlanetOwner, entry.imageUrl) : undefined}
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
                        <button
                          style={{ ...styles.downloadButton, position: 'relative', top: 'auto', right: 'auto' }}
                          onClick={(e) => { e.stopPropagation(); downloadImage(entry.imageUrl, `planet-${viewingPlanetOwner}-${i + 1}`); }}
                          title="Download"
                        >
                          ⬇
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p style={{ color: '#666', textAlign: 'center', marginBottom: '1rem' }}>
                This planet hasn't been terraformed yet.
              </p>
            )}

            <button style={styles.cancelButton} onClick={() => setViewingPlanetOwner(null)}>
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
                {/* Goals by type */}
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

                {/* Reset button */}
                <div style={styles.resetSection}>
                  <button style={styles.resetButton} onClick={resetEverything}>
                    🗑️ Reset Everything
                  </button>
                  <p style={styles.resetWarning}>
                    This will delete all progress, ships, custom planets, and goals
                  </p>
                </div>

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
                    <label style={styles.label}>Ship Reward</label>
                    <select
                      style={styles.select}
                      value={editingGoal.reward}
                      onChange={e => setEditingGoal({ ...editingGoal, reward: e.target.value })}
                    >
                      <option value="speed_boost">🚀 Speed Boost</option>
                      <option value="acceleration">⚡ Acceleration</option>
                      <option value="handling">🎯 Handling</option>
                      <option value="shield">🛡️ Shield</option>
                      <option value="trail">✨ Trail</option>
                      <option value="glow">💫 Glow</option>
                      <option value="size">📈 Size</option>
                      <option value="special">🌟 Special</option>
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
                        reward: editingGoal.reward,
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
  shareButton: {
    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8, padding: '0.4rem 0.75rem', color: '#fff', fontSize: '0.8rem',
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
