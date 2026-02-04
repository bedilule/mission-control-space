// Howler.js Sound Manager for Mission Control Space
import { Howl, Howler } from 'howler';

interface SoundConfig {
  src: string[];
  volume?: number;
  loop?: boolean;
  rate?: number;
}

// Audio preferences storage key
const AUDIO_PREFS_KEY = 'mission-control-audio-prefs';

export interface AudioPreferences {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
}

const DEFAULT_PREFS: AudioPreferences = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.3,
  sfxVolume: 0.5,
};

const SOUNDS_PATH = '/sounds/';

// Sound definitions - using Kenney.nl Sci-Fi Sounds (CC0)
const SOUND_CONFIGS: Record<string, SoundConfig> = {
  // Engine sounds
  thrust: {
    src: [`${SOUNDS_PATH}thrust.ogg`],
    volume: 0.3,
    loop: true,
  },
  thrustBoost: {
    src: [`${SOUNDS_PATH}thrust-boost.ogg`],
    volume: 0.4,
    loop: true,
  },

  // Impact & collision
  collision: {
    src: [`${SOUNDS_PATH}collision.ogg`],
    volume: 0.5,
  },

  // Docking & success
  docking: {
    src: [`${SOUNDS_PATH}docking.ogg`],
    volume: 0.6,
  },
  sparkle: {
    src: [`${SOUNDS_PATH}sparkle.ogg`],
    volume: 0.4,
  },

  // Upgrades
  shipUpgrade: {
    src: [`${SOUNDS_PATH}ship-upgrade.ogg`],
    volume: 0.5,
  },
  planetUpgrade: {
    src: [`${SOUNDS_PATH}planet-upgrade.ogg`],
    volume: 0.5,
  },
  upgrade1: {
    src: [`${SOUNDS_PATH}upgrade1.mp3`],
    volume: 0.5,
  },
  upgrade2: {
    src: [`${SOUNDS_PATH}upgrade2.mp3`],
    volume: 0.5,
  },
  teleport: {
    src: [`${SOUNDS_PATH}teleport.mp3`],
    volume: 0.5,
    rate: 1.3,
  },
  warpHome: {
    src: [`${SOUNDS_PATH}teleport_02.ogg`],
    volume: 0.6,
  },
  powerUp: {
    src: [`${SOUNDS_PATH}powerUp7.mp3`],
    volume: 0.5,
  },
  upgradeLoading: {
    src: [`${SOUNDS_PATH}upgrade-loading.ogg`],
    volume: 0.35,
    loop: true,
  },

  // UI
  click: {
    src: [`${SOUNDS_PATH}click.ogg`],
    volume: 0.3,
  },
  select: {
    src: [`${SOUNDS_PATH}select.ogg`],
    volume: 0.4,
  },

  // Weapons
  laserShoot: {
    src: [`${SOUNDS_PATH}collision.ogg`], // Using collision sound with higher pitch
    volume: 0.25,
    rate: 2.5, // Higher pitch for laser effect
  },

  // Black hole
  blackHoleAmbient: {
    src: [`${SOUNDS_PATH}blackhole-ambient.ogg`],
    volume: 0,
    loop: true,
  },
  blackHoleSuck: {
    src: [`${SOUNDS_PATH}blackhole-suck.mp3`, `${SOUNDS_PATH}blackhole-suck.ogg`],
    volume: 0.7,
  },
};

// Background music configs (separate from SFX)
const MUSIC_CONFIGS: Record<string, SoundConfig> = {
  // Ambient space background - loops during gameplay
  ambient: {
    src: [`${SOUNDS_PATH}space-ambient.mp3`, `${SOUNDS_PATH}space-ambient.ogg`],
    volume: 0.25,
    loop: true,
  },
};

// Intro sound (treated as SFX, not music)
const INTRO_CONFIG: SoundConfig = {
  src: [`${SOUNDS_PATH}intro-music.mp3`, `${SOUNDS_PATH}intro-music.ogg`],
  volume: 0.4,
  loop: false,
};

// Voice line files for different events
const SHIP_VOICE_LINES = [
  `${SOUNDS_PATH}ship/9KWN_wDysXJ94T87fsIhV_music_generated.mp3`,
  `${SOUNDS_PATH}ship/-RS3xcx2iXOZmr6n8kc92_music_generated.mp3`,
  `${SOUNDS_PATH}ship/CRKO7KB_tQsNdV1EFwERx_music_generated.mp3`,
  `${SOUNDS_PATH}ship/ojVzw-mc8WaN8ddBGlrjR_music_generated.mp3`,
];

const PLANET_VOICE_LINES = [
  `${SOUNDS_PATH}planet/E86vbzqyFlFv1Upv8-RtW_music_generated.mp3`,
  `${SOUNDS_PATH}planet/KXI4R9P2wZABj1bL-gxJs_music_generated.mp3`,
  `${SOUNDS_PATH}planet/njMq_LvOdeiltf7CGL2KT_music_generated.mp3`,
];

const TASK_VOICE_LINES = [
  `${SOUNDS_PATH}tasks/hdx7UY7uuFhwNinypEkY4_music_generated.mp3`,
  `${SOUNDS_PATH}tasks/HZyyuyTpyA9AyEsRM3FYY_music_generated.mp3`,
  `${SOUNDS_PATH}tasks/ICMQ_Jpf7Tna346c3sZ8f_music_generated.mp3`,
  `${SOUNDS_PATH}tasks/obu406CoYZ1Vilipwia15_music_generated.mp3`,
  `${SOUNDS_PATH}tasks/Rk0RdJOqQQoF1beUcsqNQ_music_generated.mp3`,
  `${SOUNDS_PATH}tasks/vcWj8PPN9-U6V3BZHV73p_music_generated.mp3`,
];

export class SoundManager {
  private sounds: Map<string, Howl> = new Map();
  private music: Map<string, Howl> = new Map();
  private muted = false;
  private masterVolume = 0.5;
  private initialized = false;

  // Audio preferences
  private prefs: AudioPreferences = { ...DEFAULT_PREFS };

  // Voice lines
  private shipVoiceLines: Howl[] = [];
  private planetVoiceLines: Howl[] = [];
  private taskVoiceLines: Howl[] = [];
  private shipVoiceIndex = 0;
  private planetVoiceIndex = 0;
  private taskVoiceIndex = 0;

  // Track playing instances for looping sounds
  private thrustId: number | null = null;
  private blackHoleId: number | null = null;
  private loadingId: number | null = null;
  private ambientMusicId: number | null = null;
  private introMusicId: number | null = null;
  private isThrusting = false;
  private isBoosting = false;
  private introPlayed = false;

  constructor() {
    // Load saved preferences
    this.loadPreferences();
  }

  private loadPreferences() {
    try {
      const saved = localStorage.getItem(AUDIO_PREFS_KEY);
      if (saved) {
        this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load audio preferences:', e);
    }
  }

  private savePreferences() {
    try {
      localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(this.prefs));
    } catch (e) {
      console.warn('Failed to save audio preferences:', e);
    }
  }

  public init() {
    if (this.initialized) return;

    // Set global volume
    Howler.volume(this.masterVolume);

    // Load all SFX sounds
    Object.entries(SOUND_CONFIGS).forEach(([name, config]) => {
      const sound = new Howl({
        src: config.src,
        volume: config.volume ?? 0.5,
        loop: config.loop ?? false,
        rate: config.rate ?? 1,
        preload: true,
        onloaderror: (_id, error) => {
          console.warn(`Failed to load sound "${name}":`, error);
        },
      });
      this.sounds.set(name, sound);
    });

    // Load background music
    Object.entries(MUSIC_CONFIGS).forEach(([name, config]) => {
      const music = new Howl({
        src: config.src,
        volume: config.volume ?? 0.3,
        loop: config.loop ?? false,
        preload: true,
        onloaderror: (_id, error) => {
          // Music files are optional - don't warn if missing
          console.log(`Music file "${name}" not found - add ${config.src[0]} to enable`);
        },
      });
      this.music.set(name, music);
    });

    // Load intro sound (treated as SFX)
    const introSound = new Howl({
      src: INTRO_CONFIG.src,
      volume: INTRO_CONFIG.volume ?? 0.4,
      loop: false,
      preload: true,
      onloaderror: () => {
        console.log(`Intro sound not found - add ${INTRO_CONFIG.src[0]} to enable`);
      },
      onend: () => {
        // When intro ends, start ambient music if music is enabled
        this.startAmbientMusic();
      },
    });
    this.sounds.set('intro', introSound);

    // Start black hole ambient (at 0 volume initially)
    const blackHoleAmbient = this.sounds.get('blackHoleAmbient');
    if (blackHoleAmbient) {
      this.blackHoleId = blackHoleAmbient.play();
    }

    // Load voice lines
    this.shipVoiceLines = SHIP_VOICE_LINES.map(src => new Howl({
      src: [src],
      volume: 0.7,
      preload: true,
    }));

    this.planetVoiceLines = PLANET_VOICE_LINES.map(src => new Howl({
      src: [src],
      volume: 0.7,
      preload: true,
    }));

    this.taskVoiceLines = TASK_VOICE_LINES.map(src => new Howl({
      src: [src],
      volume: 0.7,
      preload: true,
    }));

    // Shuffle indices for variety
    this.shipVoiceIndex = Math.floor(Math.random() * SHIP_VOICE_LINES.length);
    this.planetVoiceIndex = Math.floor(Math.random() * PLANET_VOICE_LINES.length);
    this.taskVoiceIndex = Math.floor(Math.random() * TASK_VOICE_LINES.length);

    this.initialized = true;
  }

  // Engine sounds
  public startThrust(boosting: boolean = false) {
    if (!this.initialized || this.isThrusting || !this.prefs.sfxEnabled) return;

    this.isThrusting = true;
    this.isBoosting = boosting;

    const soundName = boosting ? 'thrustBoost' : 'thrust';
    const sound = this.sounds.get(soundName);

    if (sound) {
      // Fade in
      this.thrustId = sound.play();
      sound.fade(0, sound.volume(), 100, this.thrustId);
    }
  }

  public updateThrust(boosting: boolean) {
    if (!this.initialized || !this.isThrusting) return;

    // Switch between normal and boost thrust
    if (boosting !== this.isBoosting) {
      this.stopThrust();
      this.startThrust(boosting);
    }
  }

  public stopThrust() {
    if (!this.isThrusting) return;
    this.isThrusting = false;

    const soundName = this.isBoosting ? 'thrustBoost' : 'thrust';
    const sound = this.sounds.get(soundName);

    if (sound && this.thrustId !== null) {
      // Fade out then stop
      sound.fade(sound.volume(), 0, 150, this.thrustId);
      const id = this.thrustId;
      setTimeout(() => sound.stop(id), 150);
    }

    this.thrustId = null;
  }

  // Black hole proximity effect
  public updateBlackHoleProximity(proximity: number) {
    // proximity: 0 = far away, 1 = at event horizon
    const sound = this.sounds.get('blackHoleAmbient');
    if (!sound || this.blackHoleId === null) return;

    // Exponential curve for more dramatic effect near the hole
    const volume = Math.pow(proximity, 2) * 0.6;
    sound.volume(volume, this.blackHoleId);

    // Also increase pitch as you get closer (1.0 to 1.5)
    const rate = 1 + proximity * 0.5;
    sound.rate(rate, this.blackHoleId);
  }

  public playBlackHoleSuck() {
    this.play('blackHoleSuck');
  }

  // Impact sounds
  public playCollision() {
    this.play('collision');
  }

  // Success sounds
  public playDockingSound() {
    this.play('docking');

    // Play sparkle slightly delayed for layered effect
    setTimeout(() => this.play('sparkle'), 200);
  }

  // UI sounds
  public playUIClick() {
    this.play('click');
  }

  public playSelect() {
    this.play('select');
  }

  // Weapon sounds
  public playLaserShoot() {
    this.play('laserShoot');
  }

  // Upgrade sounds - for regular shop purchases (stats, weapons, etc.)
  public playShipUpgrade() {
    this.play('powerUp');
  }

  public playPlanetUpgrade() {
    this.play('powerUp');
  }

  // Visual upgrade sounds - for skin/terraform upgrades with drone animation
  public playVisualUpgrade() {
    this.play('upgrade1');
    this.play('upgrade2');
  }

  // Voice lines - play next in sequence for variety
  public playShipVoiceLine() {
    if (!this.initialized || !this.prefs.sfxEnabled || this.shipVoiceLines.length === 0) return;
    const voice = this.shipVoiceLines[this.shipVoiceIndex];
    if (voice) voice.play();
    this.shipVoiceIndex = (this.shipVoiceIndex + 1) % this.shipVoiceLines.length;
  }

  public playPlanetVoiceLine() {
    if (!this.initialized || !this.prefs.sfxEnabled || this.planetVoiceLines.length === 0) return;
    const voice = this.planetVoiceLines[this.planetVoiceIndex];
    if (voice) voice.play();
    this.planetVoiceIndex = (this.planetVoiceIndex + 1) % this.planetVoiceLines.length;
  }

  public playTaskVoiceLine() {
    if (!this.initialized || !this.prefs.sfxEnabled || this.taskVoiceLines.length === 0) return;
    const voice = this.taskVoiceLines[this.taskVoiceIndex];
    if (voice) voice.play();
    this.taskVoiceIndex = (this.taskVoiceIndex + 1) % this.taskVoiceLines.length;
  }

  // Teleport/claim sound
  public playTeleport() {
    this.play('teleport');
  }

  // Warp home sound (teleport to home planet)
  public playWarpHome() {
    this.play('warpHome');
  }

  // Power-up sound for regular shop purchases
  public playPowerUp() {
    this.play('powerUp');
  }

  // Loading/processing sound (for upgrade animations)
  public startLoadingSound() {
    if (!this.initialized || this.loadingId !== null || !this.prefs.sfxEnabled) return;

    const sound = this.sounds.get('upgradeLoading');
    if (sound) {
      this.loadingId = sound.play();
      sound.fade(0, sound.volume(), 300, this.loadingId);
    }
  }

  public stopLoadingSound() {
    const sound = this.sounds.get('upgradeLoading');
    if (sound && this.loadingId !== null) {
      sound.fade(sound.volume(), 0, 300, this.loadingId);
      const id = this.loadingId;
      setTimeout(() => sound.stop(id), 300);
    }
    this.loadingId = null;
  }

  // Upgrade proximity effect - fades loading sound based on distance
  public updateUpgradeProximity(proximity: number) {
    // proximity: 0 = far away, 1 = close to upgrade target
    const sound = this.sounds.get('upgradeLoading');
    if (!sound || this.loadingId === null) return;

    // Scale volume from 0 to base volume (0.35) based on proximity
    const baseVolume = 0.35;
    const volume = proximity * baseVolume;
    sound.volume(volume, this.loadingId);
  }

  // Shop/station proximity effect (disabled)
  public updateShopProximity(_proximity: number) {
    // No-op - shop ambient sound removed
  }

  // Generic play method
  private play(name: string) {
    if (!this.initialized || !this.prefs.sfxEnabled) return;

    const sound = this.sounds.get(name);
    if (sound) {
      sound.play();
    }
  }

  // Volume controls
  public setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    Howler.volume(this.muted ? 0 : this.masterVolume);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    Howler.volume(this.muted ? 0 : this.masterVolume);
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  // Intro sound (treated as SFX, not music)
  public playIntroMusic() {
    if (!this.initialized || this.introPlayed || !this.prefs.sfxEnabled) return;

    const intro = this.sounds.get('intro');
    if (!intro) {
      // No intro sound configured, start ambient directly
      this.startAmbientMusic();
      return;
    }

    this.introPlayed = true;

    // If already loaded, play immediately
    if (intro.state() === 'loaded') {
      intro.volume(INTRO_CONFIG.volume ?? 0.4);
      this.introMusicId = intro.play();
    } else {
      // Wait for load, then play
      intro.once('load', () => {
        if (this.prefs.sfxEnabled) {
          intro.volume(INTRO_CONFIG.volume ?? 0.4);
          this.introMusicId = intro.play();
        }
      });
      // If load fails, start ambient instead
      intro.once('loaderror', () => {
        this.startAmbientMusic();
      });
    }
  }

  public startAmbientMusic() {
    if (!this.initialized || !this.prefs.musicEnabled) return;
    if (this.ambientMusicId !== null) return; // Already playing

    const ambient = this.music.get('ambient');
    if (!ambient) return;

    // If already loaded, play immediately
    if (ambient.state() === 'loaded') {
      ambient.volume(this.prefs.musicVolume);
      this.ambientMusicId = ambient.play();
    } else {
      // Wait for load, then play
      ambient.once('load', () => {
        if (this.prefs.musicEnabled && this.ambientMusicId === null) {
          ambient.volume(this.prefs.musicVolume);
          this.ambientMusicId = ambient.play();
        }
      });
    }
  }

  public stopAmbientMusic() {
    const ambient = this.music.get('ambient');
    if (ambient && this.ambientMusicId !== null) {
      ambient.fade(this.prefs.musicVolume, 0, 500, this.ambientMusicId);
      const id = this.ambientMusicId;
      setTimeout(() => ambient.stop(id), 500);
      this.ambientMusicId = null;
    }
  }

  public stopAllMusic() {
    // Stop intro sound (it's in sounds, not music)
    const intro = this.sounds.get('intro');
    if (intro && this.introMusicId !== null) {
      intro.stop(this.introMusicId);
      this.introMusicId = null;
    }
    this.stopAmbientMusic();
  }

  // Preference getters/setters
  public isMusicEnabled(): boolean {
    return this.prefs.musicEnabled;
  }

  public setMusicEnabled(enabled: boolean) {
    this.prefs.musicEnabled = enabled;
    this.savePreferences();

    if (enabled) {
      // Start ambient music if not playing intro
      if (!this.introMusicId) {
        this.startAmbientMusic();
      }
    } else {
      this.stopAllMusic();
    }
  }

  public isSfxEnabled(): boolean {
    return this.prefs.sfxEnabled;
  }

  public setSfxEnabled(enabled: boolean) {
    this.prefs.sfxEnabled = enabled;
    this.savePreferences();

    // Update mute state based on SFX preference
    // Note: This affects all non-music sounds
    if (!enabled) {
      // Stop any currently playing SFX loops
      this.stopThrust();
      this.stopLoadingSound();
    }
  }

  public getMusicVolume(): number {
    return this.prefs.musicVolume;
  }

  public setMusicVolume(volume: number) {
    this.prefs.musicVolume = Math.max(0, Math.min(1, volume));
    this.savePreferences();

    // Update currently playing music
    this.music.forEach((music, name) => {
      if (name === 'ambient' && this.ambientMusicId !== null) {
        music.volume(this.prefs.musicVolume, this.ambientMusicId);
      }
      if (name === 'intro' && this.introMusicId !== null) {
        music.volume(this.prefs.musicVolume, this.introMusicId);
      }
    });
  }

  public getSfxVolume(): number {
    return this.prefs.sfxVolume;
  }

  public setSfxVolume(volume: number) {
    this.prefs.sfxVolume = Math.max(0, Math.min(1, volume));
    this.savePreferences();
  }

  public getPreferences(): AudioPreferences {
    return { ...this.prefs };
  }

  // Cleanup
  public destroy() {
    this.sounds.forEach((sound) => sound.unload());
    this.music.forEach((m) => m.unload());
    this.sounds.clear();
    this.music.clear();
    this.initialized = false;
  }
}

// Singleton instance
export const soundManager = new SoundManager();
