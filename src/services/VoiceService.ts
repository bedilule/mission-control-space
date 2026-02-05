const ELEVENLABS_KEY = 'sk_3d39d8b1fae43e41bc56d8f67e1890fac778d2dcb464a69c';
const ELEVENLABS_VOICE = 'CwhRBWXzGAHq8TQ4Fs17'; // Roger - default ship AI
const ELEVENLABS_SHOP_VOICE = 'Z7RrOqZFTyLpIlzCgfsp'; // Toby - Little Mythical Monster (shop merchant goblin)
const SUPABASE_URL = 'https://qdizfhhsqolvuddoxugj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkaXpmaGhzcW9sdnVkZG94dWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NzY1MjMsImV4cCI6MjA4NTQ1MjUyM30.W00V-_gmfGT19HcSfpwmFNEDlXg6Wt6rZCE_gVPj4fw';

export type UpgradeType = 'ship' | 'planet';
export type UpgradePhase = 'start' | 'done';

export interface ShopContext {
  playerName: string;
  credits: number;
  unownedItems: string[];
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

  parts.push(`Has ${ctx.currencyPoints} credits to spend.`);

  if (ctx.onlinePlayers && ctx.onlinePlayers.length > 0) {
    parts.push(`Online: ${ctx.onlinePlayers.join(', ')}.`);
  }

  return parts.join(' ');
}

class VoiceService {
  private speaking = false;
  private enabled = true;

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

  async shopGreeting(ctx: ShopContext): Promise<void> {
    if (!this.enabled || this.speaking) return;

    const t0 = performance.now();
    try {
      const parts = [`Player: ${ctx.playerName}. Credits: ${ctx.credits}.`];
      if (ctx.unownedItems.length > 0) {
        parts.push(`Available to buy: ${ctx.unownedItems.join(', ')}.`);
      } else {
        parts.push('Owns everything in the shop.');
      }
      const userMessage = parts.join(' ');
      console.log('[Voice] Shop greeting:', ctx);
      console.log('[Voice] Shop prompt:', userMessage);

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

  async speak(text: string): Promise<void> {
    if (!this.enabled || this.speaking) return;
    try {
      await this.tts(text);
    } catch (e) {
      console.error('[Voice] Speak failed:', e);
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
