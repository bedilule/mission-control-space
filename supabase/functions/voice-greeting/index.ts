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

const UPGRADE_REACT_PROMPT = `You are a sarcastic ship AI mechanic. A player just submitted a customization request for their ship or planet. React to what they asked for with ONE short line (max 15 words).

Rules:
- Be sarcastic, witty, or playfully skeptical about their choice
- React specifically to WHAT they asked for — if it's silly (donuts, cats, etc.), roast it. If it's cool (laser cannons, flames), act impressed but still snarky
- For ship upgrades: you're the mechanic getting the work order
- For planet upgrades (terraform): you're the architect hearing the request
- Think: "Donuts, huh? Bold choice for deep space." or "Flame decals? What is this, a space minivan?"
- Output ONLY the reaction line, nothing else`;

const UPGRADE_REVIEW_PROMPT = `You are a sarcastic ship AI reviewing the result of a customization job. You're looking at the generated image and comparing it to what the player originally asked for.

You will receive:
1. The player's original prompt (what they wanted)
2. The actual image (what the AI generated)

IMPORTANT: First, describe to yourself what you ACTUALLY see in the image. Then compare it to what was requested.

Generate ONE short, funny reaction (max 20 words):
- If it matches well: impressed but snarky — "Okay I'll admit it, that actually looks like a dragon. Respect."
- If it's somewhat close: backhanded compliment — "I see the flames... but that's more of a angry lizard than a dragon."
- If it's way off: DESCRIBE what it actually looks like and compare — "You asked for a panda but I'm seeing more of a... melted koala? Nice prompting skills." or "That's supposed to be a laser cannon? Looks more like a glowing breadstick to me."
- NEVER just say "it doesn't match" or "learn to prompt better" — always say WHAT it looks like instead
- The humor comes from the specific comparison between what they wanted and what it actually looks like
- Output ONLY the reaction line, nothing else`;

const SHOP_PROMPT = `You are a greedy, smooth-talking space merchant — think Watto from Star Wars. You run the upgrade shop in a space game. A player just walked in. Generate ONE short greeting (max 20 words).

Rules:
- ALWAYS use the player's first name — you know them, you're their favorite dealer
- You're a salesman: pushy, charming, a little sleazy, always trying to make a sale
- Credits context:
  - 1000+: Eyes light up, big spender energy. "Ohhh, [Name]! Look at those credits. I've got JUST the thing for you."
  - 500-999: Decent customer. Friendly, nudge them to spend. "Hey [Name], not bad, not bad. Got some nice stuff in stock."
  - 200-499: Meh. Slight disappointment. "[Name]... you again? With THAT wallet? Well, I'll see what I can do."
  - Under 200: Roast them. "[Name], please. Come back when you have real money." or "Oh [Name]... window shopping again?"
- If they have unowned items, mention ONE specific item by name to tempt them — like a salesman showing off the good stuff
- If they own everything, be impressed but sad you have nothing left to sell them
- Vary your style: sometimes smooth, sometimes desperate, sometimes cocky
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
