const ELEVENLABS_KEY = 'sk_3d39d8b1fae43e41bc56d8f67e1890fac778d2dcb464a69c';
const ELEVENLABS_VOICE = 'CwhRBWXzGAHq8TQ4Fs17'; // Roger - default ship AI
const ELEVENLABS_SHOP_VOICE = 'Z7RrOqZFTyLpIlzCgfsp'; // Toby - Little Mythical Monster (shop merchant goblin)
const ELEVENLABS_COLLISION_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George - British collision commentator
const ELEVENLABS_NOMAD_VOICE = 'WOY6pnQ1WCg0mrOZ54lM'; // Nomad merchant voice

const COLLISION_LINES = [
  "You can't park there, mate.",
  "Oi! That's a planet, not a parking spot.",
  "Bit close, don't you think?",
  "Steady on! That planet was here first.",
  "Right, that's not how landing works.",
  "Have you considered using the brakes?",
  "That'll buff right out. Probably.",
  "Brilliant flying. Truly.",
  "Perhaps try going around it next time?",
  "I don't think the planet appreciated that.",
  "Were you aiming for that?",
  "That's going on your insurance.",
  "Lovely. More dents for the collection.",
  "Do you always fly like this?",
  "The planet sends its regards.",
];
const SUPABASE_URL = 'https://qdizfhhsqolvuddoxugj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkaXpmaGhzcW9sdnVkZG94dWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NzY1MjMsImV4cCI6MjA4NTQ1MjUyM30.W00V-_gmfGT19HcSfpwmFNEDlXg6Wt6rZCE_gVPj4fw';

export type UpgradeType = 'ship' | 'planet';
export type UpgradePhase = 'start' | 'done';

export interface ShopContext {
  playerName: string;
  credits: number;
  unownedItems: string[];
}

export interface NomadContext {
  playerName: string;
  credits: number;
  unownedHorns: string[];
  unownedEmotes: string[];
}

export interface GreetingContext {
  playerName: string;
  playerRank: number;
  totalPlayers: number;
  currencyPoints: number;
  leaderName?: string;
  pointsGap?: number;
  onlinePlayers?: string[];
}

function buildUserMessage(ctx: GreetingContext): string {
  const parts: string[] = [];

  parts.push(`${ctx.playerName}, rank #${ctx.playerRank} of ${ctx.totalPlayers}.`);

  if (ctx.leaderName && ctx.pointsGap !== undefined && ctx.pointsGap > 0) {
    parts.push(`${ctx.leaderName} leads, ${ctx.pointsGap} pts ahead.`);
  } else if (ctx.playerRank === 1) {
    parts.push(`Currently #1 on the leaderboard.`);
  }

  if (ctx.onlinePlayers && ctx.onlinePlayers.length > 0) {
    parts.push(`Online: ${ctx.onlinePlayers.join(', ')}.`);
  }

  return parts.join(' ');
}

// Pre-written nomad battle voice lines (short, punchy, latino pimp-my-ride merchant)
const NOMAD_HIT_LINES = [
  'Ay! Watch the paint job, loco!',
  'You scratching my ride, pendejo!',
  'Oye! That one actually hurt!',
  'Is that all you got, gringo?',
  'My abuela hits harder than that!',
  'You gonna pay for that, ese!',
  'Ay caramba! Not the chrome!',
  'You dented my bumper, idiota!',
];

const NOMAD_BATTLE_LINES = [
  'Nobody shoots the Nomad and lives, amigo!',
  'You picked the wrong merchant, hermano!',
  'Time to pimp YOUR wreck, gringo!',
  'This is MY neighborhood, ese!',
  'You should have just bought something!',
  'The Nomad always gets the last ride!',
];

const NOMAD_ENRAGE_LINES = [
  'Now you made me angry, pendejo!',
  'Ay dios mio, you are DEAD!',
  'No more mister nice Nomad!',
];

const NOMAD_TAUNT_LINES = [
  'Hahaha! Come back when you learn to fly, gringo!',
  'That was too easy, amigo! The Nomad is undefeated!',
  'Run back to your little planet, pendejo!',
  'You want a rematch? Bring your wallet next time!',
  'Ay, did that hurt? Maybe buy some upgrades, cheapskate!',
  'The Nomad sends his regards, hermano!',
  'Better luck next time, loco! Hahahaha!',
  'Don\'t worry amigo, everyone loses to the Nomad!',
];

const NOMAD_VICTORY_LINES = [
  'Alright alright, you got me fair and square, gringo! Take my stuff!',
  'Ay caramba! Nobody has beaten the Nomad in years! Here, you earned this, amigo!',
  'Okay okay, I surrender, hermano! Don\'t tell anyone about this!',
  'You fight like a crazy man, loco! The Nomad respects that. Take this gift!',
  'Fine, you win! But next time, I\'m bringing my cousin! He\'s bigger than me!',
];

class VoiceService {
  private speaking = false;
  private enabled = true;

  // Nomad boss fight
  private nomadBattleGenerating = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async greet(ctx: GreetingContext): Promise<void> {
    if (!this.enabled || this.speaking) return;

    const t0 = performance.now();
    try {
      console.log('[Voice] Generating greeting for', ctx.playerName);

      // Step 1: Generate text with OpenAI
      const text = await this.generateText(ctx);
      const t1 = performance.now();
      console.log(`[Voice] OpenAI: ${Math.round(t1 - t0)}ms → "${text}"`);

      // Step 2: Speak it with ElevenLabs
      await this.tts(text);
      const t2 = performance.now();
      console.log(`[Voice] ElevenLabs: ${Math.round(t2 - t1)}ms`);
      console.log(`[Voice] Total: ${Math.round(t2 - t0)}ms`);
    } catch (e) {
      console.error('[Voice] Greeting failed:', e);
    }
  }

  private pendingShopAudio: Promise<Blob | null> | null = null;

  private static buildShopMessage(ctx: ShopContext): string {
    const parts = [`Player: ${ctx.playerName}. Credits: ${ctx.credits}.`];
    if (ctx.unownedItems.length > 0) {
      // Shuffle so the LLM doesn't always fixate on the first item
      const shuffled = [...ctx.unownedItems].sort(() => Math.random() - 0.5);
      parts.push(`Available to buy (in no particular order): ${shuffled.join(', ')}.`);
    } else {
      parts.push('Owns everything in the shop.');
    }
    return parts.join(' ');
  }

  prepareShopGreeting(ctx: ShopContext): void {
    if (!this.enabled) return;

    const t0 = performance.now();
    const userMessage = VoiceService.buildShopMessage(ctx);
    console.log('[Voice] Pre-generating shop greeting...');
    console.log('[Voice] Shop context:', ctx);

    this.pendingShopAudio = fetch(`${SUPABASE_URL}/functions/v1/voice-greeting`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userMessage, mode: 'shop' }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const text = data?.text;
        if (!text) return null;
        console.log(`[Voice] Shop pre-gen OpenAI: ${Math.round(performance.now() - t0)}ms → "${text}"`);
        return fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_SHOP_VOICE}?output_format=mp3_22050_32`,
          {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
          }
        );
      })
      .then(res => res && res.ok ? res.blob() : null)
      .then(blob => {
        if (blob) console.log(`[Voice] Shop pre-gen total: ${Math.round(performance.now() - t0)}ms`);
        return blob;
      })
      .catch(e => {
        console.error('[Voice] Shop pre-gen failed:', e);
        return null;
      });
  }

  async playShopGreeting(): Promise<void> {
    if (!this.enabled || this.speaking || !this.pendingShopAudio) return;
    try {
      const blob = await this.pendingShopAudio;
      this.pendingShopAudio = null;
      if (blob) await this.playBlob(blob);
    } catch (e) {
      console.error('[Voice] Shop greeting play failed:', e);
    }
  }

  private pendingNomadAudio: Promise<Blob | null> | null = null;

  private static buildNomadMessage(ctx: NomadContext): string {
    const parts = [`Player: ${ctx.playerName}. Credits: ${ctx.credits}.`];
    const totalUnowned = ctx.unownedHorns.length + ctx.unownedEmotes.length;
    if (totalUnowned > 0) {
      parts.push(`${ctx.unownedHorns.length} horns and ${ctx.unownedEmotes.length} emotes available to buy.`);
    } else {
      parts.push('Owns ALL horns and emotes. Complete collection!');
    }
    return parts.join(' ');
  }

  prepareNomadGreeting(ctx: NomadContext): void {
    if (!this.enabled) return;

    const t0 = performance.now();
    const userMessage = VoiceService.buildNomadMessage(ctx);
    console.log('[Voice] Pre-generating nomad greeting...');

    this.pendingNomadAudio = fetch(`${SUPABASE_URL}/functions/v1/voice-greeting`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userMessage, mode: 'nomad' }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const text = data?.text;
        if (!text) return null;
        console.log(`[Voice] Nomad pre-gen OpenAI: ${Math.round(performance.now() - t0)}ms → "${text}"`);
        return fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_NOMAD_VOICE}?output_format=mp3_22050_32`,
          {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
          }
        );
      })
      .then(res => res && res.ok ? res.blob() : null)
      .then(blob => {
        if (blob) console.log(`[Voice] Nomad pre-gen total: ${Math.round(performance.now() - t0)}ms`);
        return blob;
      })
      .catch(e => {
        console.error('[Voice] Nomad pre-gen failed:', e);
        return null;
      });
  }

  async playNomadGreeting(): Promise<void> {
    if (!this.enabled || this.speaking || !this.pendingNomadAudio) return;
    try {
      const blob = await this.pendingNomadAudio;
      this.pendingNomadAudio = null;
      if (blob) await this.playBlob(blob, 0.5);
    } catch (e) {
      console.error('[Voice] Nomad greeting play failed:', e);
    }
  }

  async shopGreeting(ctx: ShopContext): Promise<void> {
    // If we have a pre-generated greeting ready, play it
    if (this.pendingShopAudio) {
      await this.playShopGreeting();
      return;
    }
    // Otherwise generate and play inline (fallback)
    if (!this.enabled || this.speaking) return;

    const t0 = performance.now();
    try {
      const userMessage = VoiceService.buildShopMessage(ctx);
      console.log('[Voice] Shop greeting (not pre-generated):', ctx);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/voice-greeting`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userMessage, mode: 'shop' }),
      });

      if (!res.ok) {
        console.error('[Voice] Shop greeting error:', res.status);
        return;
      }

      const data = await res.json();
      const text = data.text;
      if (!text) return;

      console.log(`[Voice] OpenAI: ${Math.round(performance.now() - t0)}ms → "${text}"`);
      await this.tts(text, ELEVENLABS_SHOP_VOICE);
      console.log(`[Voice] Total: ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.error('[Voice] Shop greeting failed:', e);
    }
  }

  async commentOnUpgrade(type: UpgradeType, phase: UpgradePhase, prompt: string, imageUrl?: string): Promise<void> {
    if (!this.enabled || this.speaking) return;

    const t0 = performance.now();
    try {
      console.log('[Voice] Upgrade comment:', { type, phase, prompt, imageUrl: imageUrl ? '(provided)' : '(none)' });

      const body: Record<string, string> = {
        mode: phase === 'done' ? 'upgrade_review' : 'upgrade_react',
        userMessage: `Type: ${type} upgrade. Player's prompt: "${prompt}"`,
      };
      if (phase === 'done' && imageUrl) {
        body.imageUrl = imageUrl;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/voice-greeting`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error('[Voice] Upgrade comment error:', res.status);
        return;
      }

      const data = await res.json();
      const text = data.text;
      if (!text) return;

      console.log(`[Voice] OpenAI: ${Math.round(performance.now() - t0)}ms → "${text}"`);
      await this.tts(text);
      console.log(`[Voice] Total: ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.error('[Voice] Upgrade comment failed:', e);
    }
  }

  // Pre-generate the review voice line (text + TTS audio blob) while image is being saved
  prepareUpgradeReview(type: UpgradeType, prompt: string, imageUrl: string): Promise<Blob | null> {
    if (!this.enabled) return Promise.resolve(null);

    const t0 = performance.now();
    console.log('[Voice] Pre-generating review audio...');

    return fetch(`${SUPABASE_URL}/functions/v1/voice-greeting`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'upgrade_review',
        userMessage: `Type: ${type} upgrade. Player's prompt: "${prompt}"`,
        imageUrl,
      }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const text = data?.text;
        if (!text) return null;
        console.log(`[Voice] Pre-gen OpenAI: ${Math.round(performance.now() - t0)}ms → "${text}"`);
        return fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}?output_format=mp3_22050_32`,
          {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
          }
        );
      })
      .then(res => res && res.ok ? res.blob() : null)
      .then(blob => {
        if (blob) console.log(`[Voice] Pre-gen total: ${Math.round(performance.now() - t0)}ms`);
        return blob;
      })
      .catch(e => {
        console.error('[Voice] Pre-gen failed:', e);
        return null;
      });
  }

  // Play a pre-generated audio blob
  async playBlob(blob: Blob, volume: number = 1): Promise<void> {
    if (!this.enabled || this.speaking) return;
    this.speaking = true;
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = Math.min(Math.max(volume, 0), 1);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        audio.play().catch(reject);
      });
    } finally {
      this.speaking = false;
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.enabled || this.speaking) return;
    try {
      await this.tts(text);
    } catch (e) {
      console.error('[Voice] Speak failed:', e);
    }
  }

  private lastCollisionLine = -1;

  async collisionComment(): Promise<void> {
    if (!this.enabled || this.speaking) return;

    // Pick a random line, avoid repeating the last one
    let idx = Math.floor(Math.random() * COLLISION_LINES.length);
    if (idx === this.lastCollisionLine) {
      idx = (idx + 1) % COLLISION_LINES.length;
    }
    this.lastCollisionLine = idx;
    const line = COLLISION_LINES[idx];

    console.log(`[Voice] Collision: "${line}"`);
    try {
      await this.tts(line, ELEVENLABS_COLLISION_VOICE);
    } catch (e) {
      console.error('[Voice] Collision comment failed:', e);
    }
  }

  private async generateText(ctx: GreetingContext): Promise<string> {
    const userMessage = buildUserMessage(ctx);
    console.log('[Voice] Context:', ctx);
    console.log('[Voice] System prompt:', 'You are a ship AI greeting a player returning to their spaceship in a multiplayer space game. Generate ONE short welcome line (max 15 words).\n\nRules:\n- IMPORTANT: Address the player using EXACTLY the title provided in the prompt. Do NOT use "Commander".\n- Be encouraging, fun, and space-themed\n- If they\'re #1, hype them up. If someone else leads, playful competitive nudge\n- Credits context: 1000+ is rich (joke about wealth), 500 is decent, a few hundred is not much, under 100 is broke (tease them)\n- Keep it varied — sometimes dramatic, sometimes chill, sometimes funny\n- Output ONLY the greeting line, nothing else\n\n(Title is randomly picked server-side from: Captain, Pilot, Admiral, Star Lord, Space Cowboy, Cadet, Astronaut, Navigator, Chief, Legend, etc.)');
    console.log('[Voice] User message:', userMessage);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/voice-greeting`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userMessage }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[Voice] Edge function error:', res.status, body);
      return `Welcome back, ${ctx.playerName}. Let's get to work.`;
    }

    const data = await res.json();
    return data.text || `Welcome back, ${ctx.playerName}.`;
  }

  // ── Nomad Boss Fight Voice ──

  /** Taunt the player after they die to the nomad */
  async playNomadDefeatTaunt(): Promise<void> {
    if (!this.enabled || this.speaking) return;

    const line = NOMAD_TAUNT_LINES[Math.floor(Math.random() * NOMAD_TAUNT_LINES.length)];
    console.log(`[Voice] Nomad taunt: "${line}"`);
    try {
      await this.tts(line, ELEVENLABS_NOMAD_VOICE);
    } catch (e) {
      console.error('[Voice] Nomad taunt failed:', e);
    }
  }

  /** Nomad says a funny line after surrendering (player wins) */
  async playNomadVictoryLine(): Promise<void> {
    if (!this.enabled || this.speaking) return;

    const line = NOMAD_VICTORY_LINES[Math.floor(Math.random() * NOMAD_VICTORY_LINES.length)];
    console.log(`[Voice] Nomad victory line: "${line}"`);
    try {
      await this.tts(line, ELEVENLABS_NOMAD_VOICE);
    } catch (e) {
      console.error('[Voice] Nomad victory line failed:', e);
    }
  }

  private async tts(text: string, voice: string = ELEVENLABS_VOICE): Promise<void> {
    this.speaking = true;
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_22050_32`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        console.error('[Voice] ElevenLabs error:', res.status, body);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        audio.play().catch(reject);
      });
    } finally {
      this.speaking = false;
    }
  }
}

export const voiceService = new VoiceService();
