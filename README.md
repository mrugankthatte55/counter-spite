# Counter Spite

A Counter-Strike style first-person shooter that runs in the browser. No backend, no assets to download: the map, weapons, bots and sounds are all generated in code.

## Stack

- [Vite](https://vitejs.dev) + TypeScript for the build
- [Three.js](https://threejs.org) for rendering: PBR materials with procedurally generated color, normal and roughness maps, a physical sky with image-based environment lighting, soft shadows, ground-truth ambient occlusion and bloom post-processing
- WebAudio for procedural sound effects
- Static output in `dist/`, deployable to Vercel as-is (`vercel.json` is included)

## Run locally

```sh
npm install
npm run dev
```

Open the URL Vite prints, click **Play** to lock the mouse.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look, left click to shoot |
| Shift | Walk (quiet, more accurate) |
| Ctrl | Crouch |
| Space | Jump |
| R | Reload |
| 1 / 2 / 3 or scroll | AK-47 / USP-S / AWP |
| Right click or Q | Scope (AWP only) |
| Esc | Pause |

## Gameplay

You play Counter-Terrorist against five Terrorist bots on a dust-style arena. Rounds last five minutes; the team with the most kills wins. Headshots deal bonus damage. Bots patrol waypoints, react to line of sight and being shot, strafe while fighting and respawn after death.

## Graphics quality

The menu has a graphics selector, saved in the browser:

- **High**: ambient occlusion, bloom, 4K shadow map
- **Medium**: bloom, 2K shadow map
- **Low**: no post-processing, 1K shadow map

## Deploy to Vercel

```sh
npm run build      # type-checks then builds into dist/
npx vercel         # or import the repo in the Vercel dashboard
```

Vercel auto-detects Vite. Build command `npm run build`, output directory `dist`.

## Project layout

```
index.html        HUD and menu markup + styles
src/main.ts       Scene setup, game loop, rounds, shooting
src/player.ts     First-person controller (movement, collision, recoil)
src/weapon.ts     Weapon definitions, viewmodels, ammo, spread
src/enemy.ts      Bot AI (patrol / chase / attack), hitboxes
src/map.ts        Level geometry, colliders, spawns, waypoints
src/effects.ts    Tracers, sparks, bullet decals
src/hud.ts        DOM HUD updates
src/audio.ts      Procedural WebAudio sound effects
src/textures.ts   Procedural PBR texture generators (bricks, plaster, concrete, wood, sand, metal, fabric)
src/input.ts      Keyboard, mouse and pointer lock
```

Append `?autoplay` to the URL to run the game without pointer lock (used for automated smoke tests); add `&gfx=high|medium|low` to force a quality level.
