# Counter Spite

A Counter-Strike style first-person shooter that runs in the browser. No backend, no assets to download: the map, weapons, bots and sounds are all generated in code.

## Stack

- [Vite](https://vitejs.dev) + TypeScript for the build
- [Three.js](https://threejs.org) for rendering: PBR materials with procedurally generated color, normal and roughness maps, a physical sky with image-based environment lighting, soft shadows, ground-truth ambient occlusion and bloom post-processing
- WebAudio for procedural sound effects

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
| 1 / 2 or scroll | Primary / secondary weapon |
| Right click or Q | Scope (AWP only) |
| F | Toggle FPS counter |
| Esc | Menu |

## Menu

- **Play** locks the mouse and drops you into the round.
- **Loadout** picks the primary weapon (AK-47 or AWP). The USP-S is always the secondary.
- **Rankings** shows career and session stats, stored in the browser.
- **Controls** lists the key bindings.
- **Settings** has mouse sensitivity, master volume, graphics quality, and the colorway. The pill in the top-right corner cycles colorways too: neon lime, deep blue, toxic purple, crimson.

## Gameplay

You play Counter-Terrorist against five Terrorist bots on a dust-style arena. Rounds last five minutes; the team with the most kills wins. Headshots deal bonus damage. You spawn with 100 health and 100 armor; armor absorbs half of incoming damage until it runs out. Bots patrol waypoints, react to line of sight and being shot, strafe while fighting and respawn after death. The radar shows the map and marks bots that have fired in the last few seconds.

## Graphics quality

The menu has a graphics selector, saved in the browser:

- **High**: ambient occlusion, bloom, 4K shadow map
- **Medium**: bloom, 2K shadow map
- **Low**: no post-processing, 1K shadow map
