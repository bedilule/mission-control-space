# Mission Control Space - Visual Design Guide

## Art Style: "Stylized Sci-Fi Cartoon"

A polished, playful game art style that balances detail with readability. Inspired by modern mobile games with a premium feel.

### Style Characteristics

| Aspect | Description |
|--------|-------------|
| **Rendering** | Clean vector/cartoon with soft shading and depth |
| **Detail Level** | Medium - enough detail to be interesting, not overwhelming |
| **Shapes** | Rounded, friendly, futuristic - domes, cylinders, smooth curves |
| **Lighting** | Soft glow effects, emissive accents, rim lighting |
| **Depth** | Layered elements with clear foreground/background separation |

### Color Palettes

**Shop Station (Upgrade Shop)**
- Primary: Blue `#5490ff`
- Accent: Cyan `#00d4ff`
- Glow: Soft cyan emissive highlights
- Use for: Tech, upgrades, purchases

**Factory Station (Planet Factory)**
- Primary: Orange `#ffa500`
- Accent: Gold `#ffd700`
- Glow: Warm golden emissive highlights
- Use for: Crafting, building, production

### Notion Task Type Planets

**Bug Planet** (`/notion-bug.png`)
- Primary: Red `#ff4444`
- Accent: Crimson/Orange `#ff6600`
- Theme: Cute alien creature sitting on planet (squash the bug!)
- Use for: Bug tickets from Notion

**Enhancement Planet** (`/notion-enhancement.png`)
- Primary: Purple `#9944ff`
- Accent: Magenta/Pink `#ff44ff`
- Theme: Glowing gem/crystal on planet (valuable improvement)
- Use for: Enhancement/feature tickets from Notion

**Task Planet** (`/notion-task.png`)
- Primary: Teal `#44ddaa`
- Accent: Green/Cyan `#00ffaa`
- Theme: Toolbox with wrench on planet (work to do)
- Use for: Generic task tickets from Notion

**Biz Planet** (`/notion-biz.png`)
- Primary: Gold `#ffd700`
- Accent: Yellow/Orange `#ffaa00`
- Theme: Golden briefcase with rising chart on planet (business growth)
- Use for: Business/marketing tickets from Notion

### Priority Effects (Animated)

Priority determines planet size AND animated visual effects:

**Critical Priority** - Meteor Storm + Fire Aura
- Animated meteors (6) falling toward planet from all directions
- Orange/red trails with glowing heads
- Intense flame aura overlay on top (`/priority-critical.png`)
- Flame pulses slightly for extra urgency
- Communicates: "DROP EVERYTHING!"

**High Priority** - Lightning Storm
- Animated lightning bolts (3) striking around planet
- Jagged yellow/white bolts with quick flashes
- Random flickering pattern
- Communicates: "Important, do soon"

**Medium Priority**
- No additional effects
- Standard planet glow
- Communicates: "Normal priority"

**Low Priority**
- No additional effects
- Standard planet glow (subtle)
- Communicates: "When you have time"

> **Note:** Priority also affects planet size - higher priority = larger radius.

### Planet Design Structure

```
┌─────────────────────────┐
│    STATION/BUILDING     │  ← Detailed structure on top
│   (domes, antennas,     │     Multiple elements, glowing windows
│    smokestacks, etc.)   │
├─────────────────────────┤
│                         │
│    PLANET SPHERE        │  ← Textured surface with craters/patches
│    (with surface        │     Slight 3D shading
│     details)            │
│                         │
├─────────────────────────┤
│    GLOWING RING         │  ← Horizontal ring with glow effect
└─────────────────────────┘
```

### Prompt Template for Fal AI (nano-banana)

```
A stylized cartoon planet with a futuristic [BUILDING_TYPE] station on top.
[COLOR] planet with surface details and craters, glowing [ACCENT_COLOR] ring around it.
The [BUILDING_TYPE] base has multiple rounded buildings, [SPECIFIC_ELEMENTS].
Clean vector game art style with nice depth and soft glow effects.
[COLOR] and [ACCENT_COLOR] color palette with glowing accents.
Dark space background with stars.
```

**Variables:**
- `[BUILDING_TYPE]`: shop, factory, lab, hangar, etc.
- `[COLOR]`: blue, orange, purple, green, etc.
- `[ACCENT_COLOR]`: cyan, gold, pink, lime, etc.
- `[SPECIFIC_ELEMENTS]`:
  - Shop: "domes, antennas, glowing windows and neon signs"
  - Factory: "smokestacks with soft emissions, gears, pipes, glowing furnaces"
  - Lab: "satellite dishes, glowing tubes, holographic displays"

### Example Prompts Used

**Shop Station:**
```
A stylized cartoon planet with a futuristic shop station on top. Blue planet with surface details and craters, glowing cyan ring around it. The shop base has multiple rounded buildings, domes, antennas, glowing windows and neon signs. Clean vector game art style with nice depth and soft glow effects. Cyan and blue color palette with glowing accents. Dark space background with stars.
```

**Factory Station:**
```
A stylized cartoon planet with a futuristic factory station on top. Orange planet with surface details and craters, glowing golden ring around it. The factory base has multiple rounded buildings, smokestacks with soft emissions, gears, pipes, glowing furnaces and industrial lights. Clean vector game art style with nice depth and soft glow effects. Orange and gold color palette with glowing accents. Dark space background with stars.
```

**Bug Planet (Notion):**
```
A stylized cartoon planet with a cute alien bug creature sitting on top. Red and crimson planet with soft surface. The alien is small, round, with big eyes, looks like a bug to squash. Friendly cartoon game art style, soft gradients, rounded shapes. Red and orange color palette with subtle glow. Dark space background.
```

**Enhancement Planet (Notion):**
```
A stylized cartoon planet with a large glowing crystal gem on top. Purple and violet planet with soft surface. The crystal is bright, magical, glowing with inner light, represents valuable upgrade. Friendly cartoon game art style, soft gradients, rounded shapes. Purple and pink color palette with magical glow. Dark space background.
```

**Task Planet (Notion):**
```
A stylized cartoon planet with a toolbox and wrench station on top. Teal and green planet with soft surface. The toolbox is open with tools visible, wrench, gears, represents work to do. Friendly cartoon game art style, soft gradients, rounded shapes. Teal and cyan color palette with subtle glow. Dark space background.
```

**Biz Planet (Notion):**
```
A stylized cartoon planet with a golden briefcase and rising bar chart on top. Yellow and gold planet with soft surface details and craters. The briefcase is shiny, open slightly showing golden coins and a small chart going up. Friendly cartoon game art style, soft gradients, rounded shapes. Yellow and gold color palette with warm glow. White background.
```

**Critical Priority Flame Overlay:**
```
Intense circular fire storm effect, raging flames and inferno surrounding an empty center, orange red and yellow fire, dramatic blazing aura, game effect art style, transparent center hole for overlay, chaotic fire energy, black background
```

### Post-Processing

1. Generate image with Fal AI `nano-banana` model
2. Remove background with Fal AI `birefnet` model
3. Save as PNG with transparency

### References

Style reference image: `/dev/youreyes/ebf36629-a7ce-4c3c-a71e-04f1c9cc4bc1.png`

### Key Principles

1. **Readability**: Must be instantly recognizable at small sizes (50-110px radius)
2. **Playfulness**: Friendly, inviting, not intimidating
3. **Polish**: Glow effects and details give premium feel
4. **Consistency**: All station planets should feel like they belong together
5. **Function clarity**: The building on top should clearly communicate the station's purpose
