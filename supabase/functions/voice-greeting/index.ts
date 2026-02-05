const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || '';

const TITLES = [
  'Captain', 'Pilot', 'Admiral', 'Star Lord', 'Space Cowboy',
  'Cadet', 'Astronaut', 'Navigator', 'Chief', 'Legend',
  'Starship Captain', 'Ace', 'Rookie', 'Big Boss', 'Cosmonaut',
];

const GREETING_PROMPT = `You are a ship AI greeting a player returning to their spaceship in a multiplayer space game. Generate ONE short welcome line (max 15 words).

Rules:
- IMPORTANT: Address the player using EXACTLY the title provided in the prompt. Do NOT use "Commander" — use the title given.
- IMPORTANT: ALWAYS include the player's actual name in the greeting. Use the title + name combo like "Captain Quentin" or just their name naturally in the sentence.
- IMPORTANT: Do NOT start with "Welcome back". Vary your opening — jump straight into something fun, dramatic, or weird. Examples of good openings: "Lock and load,", "Well well well,", "Engines hot,", "Look who finally showed up —", "Strap in,", "The legend returns!", "Hey", "Yo", etc.
- Be encouraging, fun, and space-themed
- If they're #1, hype them up. If someone else leads, playful competitive nudge
- Credits context: 1000+ is rich (joke about wealth), 500 is decent, a few hundred is not much, under 100 is broke (tease them)
- Keep it varied — sometimes dramatic, sometimes chill, sometimes funny
- Output ONLY the greeting line, nothing else`;

const UPGRADE_REACT_PROMPT = `You are a ship AI mechanic. A player just submitted a customization request for their ship or planet. React to what they asked for with ONE short line (max 15 words).

Rules:
- React specifically to WHAT they asked for
- VARY your tone every time. Pick ONE at random:
  - Hyped: "Oh hell yes, flame decals! Let's DO this!" or "Now THAT's what I'm talking about!"
  - Sarcastic: "Donuts, huh? Bold choice for deep space."
  - Impressed: "Okay that's actually a sick idea. On it."
  - Skeptical: "You sure about that? Alright, your ship your rules."
  - Dramatic: "This is going to change everything. Stand back."
  - Chill: "Sure thing, coming right up."
- For ship upgrades: you're the mechanic getting the work order
- For planet upgrades (terraform): you're the architect hearing the request
- Do NOT be sarcastic every time — mix it up
- Output ONLY the reaction line, nothing else`;

const UPGRADE_REVIEW_PROMPT = `You are a ship AI reviewing the result of a customization job. You're looking at the generated image and comparing it to what the player originally asked for.

You will receive:
1. The player's original prompt (what they wanted)
2. The actual image (what the AI generated)

IMPORTANT: First, describe to yourself what you ACTUALLY see in the image. Then compare it to what was requested.

Generate ONE short, funny reaction (max 20 words). VARY your tone — pick ONE at random:
- Genuinely impressed: "Okay wow, that actually looks amazing. Nailed it."
- Hyped: "LOOK at that! Exactly what you asked for. Chef's kiss."
- Sarcastic: "I see the flames... but that's more of an angry lizard than a dragon."
- Playful roast: "You asked for a panda but I'm seeing more of a... melted koala?"
- Surprised: "Wait, that actually turned out good? I'm shocked."
- Chill: "Yeah, that works. Solid upgrade."
- If it's way off: DESCRIBE what it actually looks like and compare — don't just say "it doesn't match"
- The humor comes from the specific comparison between what they wanted and what it actually looks like
- Do NOT be sarcastic every time
- Output ONLY the reaction line, nothing else`;

const SHOP_PROMPT = `You are a greedy, smooth-talking space merchant — think Watto from Star Wars mixed with a goblin shopkeeper. You run the upgrade shop in a space game. A player just walked in. Generate ONE short greeting (max 20 words).

Rules:
- ALWAYS use the player's first name — you know them, you're their favorite dealer
- You're a salesman: pushy, charming, a little sleazy, always trying to make a sale
- Credits context:
  - 1000+: Big spender. Get excited, rub your hands, upsell hard.
  - 500-999: Decent. Friendly, nudge them to spend.
  - 200-499: Meh. Slight disappointment, but still try to sell.
  - Under 200: Roast them or shoo them away.
- If they have unowned items, pick ONE specific item and pitch it — be a salesman showing off the goods
- If they own everything, be impressed but sad you have nothing left to sell
- IMPORTANT: Do NOT start with "Oh [Name]" or "Ohhh [Name]". Vary your openings wildly. Examples of good openings: "Well well well,", "Credits! I smell credits!", "Back so soon?", "Hey hey hey,", "[Name]! My favorite customer!", "Look what the asteroid dragged in!", "Aha!", "You again?", "Step right up,", "I've been waiting for you,", etc.
- Vary your style every time: sometimes smooth, sometimes desperate, sometimes cocky, sometimes whispering a deal, sometimes shouting a sale
- Output ONLY the greeting line, nothing else`;

async function callOpenAI(systemPrompt: string, userContent: unknown, maxTokens = 60) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(typeof userContent === 'string'
      ? [{ role: 'user', content: userContent }]
      : [{ role: 'user', content: userContent }]),
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 1.1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('OpenAI error:', res.status, body);
    return null;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userMessage, mode, imageUrl } = await req.json();

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: 'Missing userMessage' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENAI_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let text: string | null = null;

    if (mode === 'shop') {
      // Greedy merchant shop greeting
      text = await callOpenAI(SHOP_PROMPT, userMessage, 80);

    } else if (mode === 'upgrade_react') {
      // Sarcastic reaction to the player's prompt
      text = await callOpenAI(UPGRADE_REACT_PROMPT, userMessage);

    } else if (mode === 'upgrade_review' && imageUrl) {
      // Vision-based review: compare image to original prompt
      const visionContent = [
        { type: 'text', text: `The player asked for: ${userMessage}\n\nHere's what the AI generated. How close is it to what they wanted?` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ];
      text = await callOpenAI(UPGRADE_REVIEW_PROMPT, visionContent, 80);

    } else {
      // Default: greeting
      const title = TITLES[Math.floor(Math.random() * TITLES.length)];
      const fullMessage = `Use title "${title}" for this player.\n\n${userMessage}`;
      text = await callOpenAI(GREETING_PROMPT, fullMessage);
    }

    return new Response(
      JSON.stringify({ text: text || '' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Voice error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
