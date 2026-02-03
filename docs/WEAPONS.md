# Weapons System Documentation

## Overview

The game features 4 weapons that players can purchase and equip. Only one weapon can be equipped at a time. All weapons fire using the **X key**.

## Weapons

| Weapon | Cost | Key | Type | Damage | Cooldown | Special |
|--------|------|-----|------|--------|----------|---------|
| Space Rifle | 300 | X | Projectile | 10 | 200ms | Fast bullets, straight line |
| Space TNT | 500 | X | Land & Detonate | Instant | - | Must land on planet first |
| Plasma Canon | 650 | X | Projectile | 50 | 800ms | Slow, high damage, purple plasma |
| Rocket Launcher | 1000 | X | Homing | 35 | 1200ms | Tracks nearest damageable planet |

## File Locations

### Main Files
- `src/App.tsx` - Purchase logic, shop UI, toggle functions
- `src/SpaceGame.ts` - Firing mechanics, projectile physics, rendering
- `src/types.ts` - TypeScript interfaces
- `src/hooks/useMultiplayerSync.ts` - Supabase sync, default effects
- `src/hooks/usePlayerPositions.ts` - Multiplayer position sync with effects

### Images
- `public/space-rifle.png`
- `public/space-tnt.png`
- `public/plasma-canon.png`
- `public/rocket-launcher.png`

---

## Code Structure

### Types (`src/types.ts`)

```typescript
// Projectile types
interface Projectile { x, y, vx, vy, life, maxLife, damage, size, color }
interface PlasmaProjectile { x, y, vx, vy, life, maxLife, damage, size, rotation }
interface Rocket { x, y, vx, vy, life, maxLife, damage, rotation, targetPlanetId }

// Ship effects (stored in Supabase)
interface ShipEffects {
  // ... other effects ...
  hasSpaceRifle: boolean;
  spaceRifleEquipped: boolean;
  hasPlasmaCanon: boolean;
  plasmaCanonEquipped: boolean;
  hasRocketLauncher: boolean;
  rocketLauncherEquipped: boolean;
  hasDestroyCanon: boolean;      // Space TNT (legacy field name)
  destroyCanonEquipped: boolean; // Space TNT equipped
}
```

### Constants (`src/App.tsx` ~line 115)

```typescript
const SPACE_RIFLE_COST = 300;
const SPACE_TNT_COST = 500;
const PLASMA_CANON_COST = 650;
const ROCKET_LAUNCHER_COST = 1000;
```

### SpaceGame.ts Constants (~line 240)

```typescript
// Space Rifle
private readonly FIRE_COOLDOWN: number = 200;
private readonly BULLET_SPEED: number = 12;
private readonly BULLET_DAMAGE: number = 10;
private readonly BULLET_RANGE: number = 500;

// Plasma Canon
private readonly PLASMA_COOLDOWN: number = 800;
private readonly PLASMA_SPEED: number = 6;
private readonly PLASMA_DAMAGE: number = 50;
private readonly PLASMA_RANGE: number = 600;
private readonly PLASMA_SIZE: number = 12;

// Rocket Launcher
private readonly ROCKET_COOLDOWN: number = 1200;
private readonly ROCKET_SPEED: number = 8;
private readonly ROCKET_DAMAGE: number = 35;
private readonly ROCKET_RANGE: number = 800;
private readonly ROCKET_TURN_SPEED: number = 0.08;

// Planet Health (for projectile damage)
private readonly PLANET_MAX_HEALTH: number = 100;
```

---

## Key Functions

### App.tsx - Purchase & Toggle

```typescript
// Buy functions - deduct points, set hasWeapon=true, auto-equip, unequip others
buySpaceRifle()
buySpaceTNT()
buyPlasmaCanon()
buyRocketLauncher()

// Toggle functions - equip/unequip, unequip others when equipping
toggleSpaceRifle()
toggleSpaceTNT()
togglePlasmaCanon()
toggleRocketLauncher()

// Helper - applies defaults to ship effects
getEffectsWithDefaults(effects: ShipEffects | undefined): ShipEffects

// Saves to Supabase
updateUserShipEffects(userId, currentShip, newEffects)
```

### SpaceGame.ts - Firing & Rendering

```typescript
// Firing (called from update loop when X pressed)
fireProjectile()     // Space Rifle
firePlasma()         // Plasma Canon
fireRocket()         // Rocket Launcher
startDestroyAnimation(planet)  // Space TNT (when landed)

// Update projectiles each frame
updateProjectiles()        // Bullets
updatePlasmaProjectiles()  // Plasma balls
updateRockets()            // Homing rockets

// Rendering
renderProjectiles()        // Draw bullets
renderPlasmaProjectiles()  // Draw plasma balls
renderRockets()            // Draw rockets
drawEquippedWeapon()       // Draw weapon on local ship
drawOtherPlayerWeapon()    // Draw weapon on other players

// Damage system
damagePlanet(planet, damage, hitX, hitY)
canDamagePlanet(planet): boolean
```

### Input Handling (SpaceGame.ts ~line 1248)

```typescript
// All weapons fire with X key (only one equipped at a time)
if (this.keys.has('x') && !this.shipBeingSucked) {
  if (this.shipEffects.spaceRifleEquipped) {
    this.fireProjectile();
  } else if (this.shipEffects.plasmaCanonEquipped) {
    this.firePlasma();
  } else if (this.shipEffects.rocketLauncherEquipped) {
    this.fireRocket();
  }
  // Space TNT handled in handleLandedControls() when landed
}
```

---

## Supabase Schema

Weapons are stored in the `players` table, `ship_effects` JSON column:

```json
{
  "ship_effects": {
    "glowColor": null,
    "trailType": "default",
    "sizeBonus": 0,
    "speedBonus": 0,
    "landingSpeedBonus": 0,
    "ownedGlows": [],
    "ownedTrails": [],
    "hasSpaceRifle": true,
    "spaceRifleEquipped": false,
    "hasPlasmaCanon": false,
    "plasmaCanonEquipped": false,
    "hasRocketLauncher": false,
    "rocketLauncherEquipped": false,
    "hasDestroyCanon": true,
    "destroyCanonEquipped": true
  }
}
```

### Sync Flow

1. **Save**: `updateUserShipEffects()` → `updatePlayerData({ ship_effects })` → Supabase
2. **Load**: Supabase → `playerRowToData()` → applies `defaultShipEffects` for missing fields

---

## Adding a New Weapon

### 1. Types (`src/types.ts`)

Add to `ShipEffects`:
```typescript
hasNewWeapon: boolean;
newWeaponEquipped: boolean;
```

Add projectile interface if needed:
```typescript
interface NewProjectile { ... }
```

### 2. Default Effects

Update `defaultShipEffects` in:
- `src/hooks/useMultiplayerSync.ts` (~line 50)
- `src/hooks/usePlayerPositions.ts` (~line 85)
- `src/App.tsx` - in `getEffectsWithDefaults()` (~line 2616)
- `src/SpaceGame.ts` - in `shipEffects` initialization (~line 155)

### 3. App.tsx

Add cost constant:
```typescript
const NEW_WEAPON_COST = XXX;
```

Add buy function:
```typescript
const buyNewWeapon = () => {
  if (personalPoints < NEW_WEAPON_COST) return;
  // ... check if already owned
  const newEffects: ShipEffects = {
    ...currentEffects,
    hasNewWeapon: true,
    newWeaponEquipped: true,
    // Unequip other weapons
    spaceRifleEquipped: false,
    destroyCanonEquipped: false,
    plasmaCanonEquipped: false,
    rocketLauncherEquipped: false,
  };
  // ... deduct points, save
};
```

Add toggle function:
```typescript
const toggleNewWeapon = () => {
  const willEquip = !currentEffects.newWeaponEquipped;
  const newEffects: ShipEffects = {
    ...currentEffects,
    newWeaponEquipped: willEquip,
    // Unequip others if equipping
    spaceRifleEquipped: willEquip ? false : currentEffects.spaceRifleEquipped,
    // ... other weapons
  };
};
```

Add to shop UI (weapons tab, ordered by price).

### 4. SpaceGame.ts

Add image loading (~line 395):
```typescript
const newWeaponImg = new Image();
newWeaponImg.crossOrigin = 'anonymous';
newWeaponImg.src = '/new-weapon.png';
newWeaponImg.onload = () => { this.newWeaponImage = newWeaponImg; };
```

Add constants:
```typescript
private readonly NEW_WEAPON_COOLDOWN: number = XXX;
private readonly NEW_WEAPON_DAMAGE: number = XXX;
// etc.
```

Add projectile array:
```typescript
private newProjectiles: NewProjectile[] = [];
```

Add firing function:
```typescript
private fireNewWeapon() { ... }
```

Add update function:
```typescript
private updateNewProjectiles() { ... }
```

Add render function:
```typescript
private renderNewProjectiles() { ... }
```

Update input handling (~line 1248):
```typescript
} else if (this.shipEffects.newWeaponEquipped) {
  this.fireNewWeapon();
}
```

Update `drawEquippedWeapon()` and `drawOtherPlayerWeapon()`:
```typescript
} else if (this.shipEffects.newWeaponEquipped && this.newWeaponImage) {
  weaponImage = this.newWeaponImage;
  glowColor = '#XXXXXX';
}
```

### 5. Add Image

Place weapon image in `public/new-weapon.png`

Generate with FAL AI:
```typescript
// Prompt: "pixelart style [weapon description] weapon, transparent background, game asset"
// Use birefnet for background removal
```

---

## Damage System

Projectiles can damage completed Notion planets owned by the player:

1. **Health Tracking**: `planetHealth: Map<string, number>` (client-side, resets on refresh)
2. **Default Health**: 100 HP per planet
3. **Damage Effects**: Shake + cracks on surface
4. **Destruction**: When HP reaches 0, triggers explosion animation

### What Can Be Damaged
- Completed Notion planets (`planet.id.startsWith('notion-')`)
- NOT special planets (shop-station, planet-builder)
- NOT user-created planets (`user-planet-*`)

### Shield Bounce
Non-damageable planets have shields that bounce projectiles back. If bounced projectile hits a damageable planet, it deals damage.

---

## Multiplayer Sync

- Weapon effects sync via `ship_effects` in Supabase
- Other players see equipped weapons rendered on ships
- Projectiles are client-side only (not synced to other players)
