// Howler.js Sound Manager for Mission Control Space
import { Howl, Howler } from 'howler';

interface SoundConfig {
  src: string[];
  volume?: number;
  loop?: boolean;
  rate?: number;
}

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

  // UI
  click: {
    src: [`${SOUNDS_PATH}click.ogg`],
    volume: 0.3,
  },

  // Black hole
  blackHoleAmbient: {
    src: [`${SOUNDS_PATH}blackhole-ambient.ogg`],
    volume: 0,
    loop: true,
  },
  blackHoleSuck: {
    src: [`${SOUNDS_PATH}blackhole-suck.ogg`],
    volume: 0.7,
  },
};

export class SoundManager {
  private sounds: Map<string, Howl> = new Map();
  private muted = false;
  private masterVolume = 0.5;
  private initialized = false;

  // Track playing instances for looping sounds
  private thrustId: number | null = null;
  private blackHoleId: number | null = null;
  private isThrusting = false;
  private isBoosting = false;

  constructor() {
    // Sounds will be initialized on first user interaction
  }

  public init() {
    if (this.initialized) return;

    // Set global volume
    Howler.volume(this.masterVolume);

    // Load all sounds
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

    // Start black hole ambient (at 0 volume initially)
    const blackHoleAmbient = this.sounds.get('blackHoleAmbient');
    if (blackHoleAmbient) {
      this.blackHoleId = blackHoleAmbient.play();
    }

    this.initialized = true;
  }

  // Engine sounds
  public startThrust(boosting: boolean = false) {
    if (!this.initialized || this.isThrusting) return;

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

  // Generic play method
  private play(name: string) {
    if (!this.initialized) return;

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

  // Cleanup
  public destroy() {
    this.sounds.forEach((sound) => sound.unload());
    this.sounds.clear();
    this.initialized = false;
  }
}

// Singleton instance
export const soundManager = new SoundManager();
