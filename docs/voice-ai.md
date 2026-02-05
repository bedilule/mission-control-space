# Voice AI System

## Overview

Dynamic AI-generated voice lines that play during gameplay. Uses OpenAI GPT-4o-mini to generate short witty text, then ElevenLabs Flash v2.5 to speak it.

**Active triggers:**
- **Launch greeting** — personalized welcome when clicking "Launch Mission"
- **Ship upgrade** — sarcastic reaction on submit + vision-based review of the result
- **Planet terraform** — same two-phase voice as ship upgrades

## Architecture

```
Frontend (VoiceService.ts)
  ├── Builds context from game state (no extra queries)
  ├── Calls Supabase Edge Function (voice-greeting)
  │     ├── mode: default → greeting with random title
  │     ├── mode: upgrade_react → sarcastic reaction to prompt
  │     └── mode: upgrade_review → OpenAI Vision compares image to prompt
  ├── Sends text to ElevenLabs API (direct, supports CORS)
  └── Plays audio blob
```

**Why the edge function?** OpenAI's API blocks browser CORS requests. The edge function proxies the call and keeps the API key server-side.

## Key Files

| File | Purpose |
|------|---------|
| `src/services/VoiceService.ts` | Client-side service — context building, edge function call, ElevenLabs TTS, audio playback |
| `supabase/functions/voice-greeting/index.ts` | Edge function — system prompts, random title injection, OpenAI text + vision calls |

## Voice Triggers

### 1. Launch Greeting

**When:** Player clicks "Launch Mission"

`VoiceService.greet()` is called with a `GreetingContext` built from already-loaded data:

- **playerName** — display name
- **playerRank** — position on leaderboard (1-indexed)
- **totalPlayers** — how many players total
- **currencyPoints** — spendable credits (not lifetime earned)
- **leaderName / pointsGap** — who's #1 and how far ahead (if not current player)
- **onlinePlayers** — other players currently in-game

This gets turned into a plain text user message like:
```
Quentin, rank #2 of 5. Armel leads, 250 pts ahead. Has 85 credits to spend. Online: Alex, Milya.
```

**Edge function behavior:**
1. Picks a random title from a list (Captain, Pilot, Star Lord, Space Cowboy, etc.)
2. Prepends `Use title "X" for this player.` to the user message
3. Sends system prompt + user message to GPT-4o-mini (`temperature: 1.1`, `max_tokens: 60`)

**System prompt rules:**
- Always include the player's name
- Use the randomly provided title (not always "Commander")
- Don't start with "Welcome back" — vary openings
- Reference credits (1000+ = rich, under 100 = broke)
- Competitive nudges based on leaderboard position
- Max 15 words

### 2. Ship & Planet Upgrades (Two-Phase Voice)

**When:** Player submits a ship visual upgrade or planet terraform

`VoiceService.commentOnUpgrade(type, phase, prompt, imageUrl?)` handles both phases:

#### Phase 1: Prompt Reaction (`upgrade_react`)
- **Triggered:** Immediately when the player submits their customization prompt
- **Mode:** `upgrade_react`
- **Context:** The player's prompt text + upgrade type (ship/planet)
- **Tone:** Sarcastic mechanic/architect reacting to the work order
- Examples: "Donuts on a spaceship? Bold choice." / "Flame decals? What is this, a space minivan?"

#### Phase 2: Vision Review (`upgrade_review`)
- **Triggered:** After the image is generated and saved
- **Mode:** `upgrade_review`
- **Context:** The player's original prompt + the generated image URL
- **How it works:** Uses OpenAI Vision (gpt-4o-mini) to look at the actual generated image, compares it to what the player asked for, and reacts based on accuracy
- **Tone:** Roast or praise the player's prompting skills
  - Close match: "Not bad, actually looks like what you asked for. Miracle."
  - Somewhat close: "Well, if you squint... I can kinda see it."
  - Way off: "That looks nothing like what you asked for. Learn to prompt better."

**Flow in App.tsx:**
```
buyVisualUpgrade() / terraformPlanet()
  ├── Submit prompt → voiceService.commentOnUpgrade('ship', 'start', promptText)
  ├── ... FAL.ai generates image, background removal, save ...
  └── Image ready → voiceService.commentOnUpgrade('ship', 'done', promptText, newImageUrl)
```

## Text-to-Speech

Direct browser call to ElevenLabs (CORS supported):
- Voice: `CwhRBWXzGAHq8TQ4Fs17` (Roger — laid-back, casual)
- Model: `eleven_flash_v2_5`
- Format: `mp3_22050_32`
- Plays via `new Audio(blobUrl)`

## Timing

Typical end-to-end per voice line: ~800-1200ms
- Edge function + OpenAI: ~400-600ms (vision calls ~600-900ms)
- ElevenLabs TTS: ~300-500ms
- First call after idle adds ~150ms cold start

## API Keys

| Service | Key Location |
|---------|-------------|
| OpenAI | Supabase secret `OPENAI_API_KEY` (never in frontend) |
| ElevenLabs | `VoiceService.ts` constant (CORS-safe, browser-callable) |

## Edge Function Modes

| Mode | Trigger | Uses Vision | Description |
|------|---------|-------------|-------------|
| *(default)* | Launch greeting | No | Random title + competitive context |
| `upgrade_react` | Upgrade submitted | No | Sarcastic reaction to player's prompt |
| `upgrade_review` | Upgrade complete | Yes | Compares generated image to original prompt |

## Ideas Explored / Shelved

- **Task landing comments** — witty reaction when opening a notion planet. Removed because it felt overwhelming with voice on every planet click.
- **Robot voices** — tested ElevenLabs robot/mechanical voices (Herbert, Retro Robot, etc.). All sounded gimmicky. Roger's natural delivery works better for witty/sarcastic lines.

## Potential Future Triggers

- Completing a task (celebration line)
- Another player overtaking on leaderboard
- Entering another player's zone
- Idle for too long (nudge to get back to work)

## Deployment

```bash
# Update the edge function
npx supabase functions deploy voice-greeting --no-verify-jwt

# Update OpenAI key if needed
npx supabase secrets set 'OPENAI_API_KEY=sk-...'
```

## Debug Logging

VoiceService logs everything to console:
- `[Voice] Context:` — raw data object
- `[Voice] System prompt:` — full system prompt
- `[Voice] User message:` — text sent to OpenAI
- `[Voice] Upgrade comment:` — upgrade type, phase, prompt
- `[Voice] OpenAI: Xms → "text"` — generated line + timing
- `[Voice] ElevenLabs: Xms` — TTS timing
- `[Voice] Total: Xms` — end-to-end
