# Guide for AI helpers (Claude, ChatGPT, Codex and friends)

Fly Hawaii is a browser 3D delivery game by Jessie. You fly a classic disc UFO around a true-scale Big Island, pick up packages at amber beacons, drop them at green beacons and earn KDU. It should feel good on phones as well as desktop. Read this whole file before changing anything.

## Quick start

```bash
npm install
npm run dev      # local game at http://localhost:5173
npm test         # must pass before every PR
npm run build    # must succeed before every PR
```

Node.js 24 is the target (see `engines` in package.json).

## Code map

| Path | What lives there |
| --- | --- |
| `index.html` | All HUD markup: KDU counter, mission card, gauges, cockpit dash, sound crystal (music), glyph buttons, touch pads, pause menu, clip overlay, the SVG glyph sprite (`<symbol id="g-...">`) |
| `src/main.js` | The game: terrain, flight, jobs and beacons, input, camera (chase and cockpit), HUD updates, arrival scenes, clips, music wiring |
| `src/style.css` | All styling. The "Alien tech cockpit layer" section near the end holds the current look |
| `src/alien-ui.js` | Glyph markup helper, gauge fractions, the fake music waveform |
| `src/cutscene.js` | Arrival scene timeline (pure math): beats, camera orbit, coin path, count-up, pausable and skippable clock |
| `src/arrival-fx.js` | Procedural 3D effects for arrival scenes: tractor beam, package, hex rings, sparkle burst |
| `src/clips.js` | Cutaway clip list parsing and picking |
| `src/businesses.js` | Delivery business list parsing, coordinate checks and job picking |
| `src/cd-player.js` | Music player logic (tracks, auto advance, ducking under clips) |
| `src/game-audio.js` | Synthesized WebAudio engine hum, chimes and coin blips. No sample files |
| `src/camera-mode.js` | Chase and cockpit camera positions |
| `src/flight-speed.js` | Shared flight speeds and easing |
| `src/ships.js`, `src/pilot-head.js` | The disc ship and the back-of-head pilot models |
| `src/attractions.js` | Real landmark photo signs and the Discovered counter |
| `src/chunks.js`, `src/height-png.js` | Terrain streaming and 16-bit height decoding |
| `test/*.test.js` | Unit tests for the pure modules (`node --test`) |
| `test/fixtures/clips/` | Test-only placeholder clips. Never ship them |
| `scripts/*.py` | Headless screenshot checks (Python Playwright + Chrome): `alien-shots.py`, `cutscene-shots.py`, `clip-shots.py` |
| `scripts/bake-*.mjs` | One-off data baking for terrain and water. Rarely needed |
| `public/` | Static files served as is: terrain, photos, pilots, music, clips, businesses, locals |
| `docs/` | Extra docs, including `docs/clips.md` |

Keep logic that can be tested in small pure modules (like `cutscene.js` or `clips.js`) and add a test for it. `main.js` is big, so make focused edits there.

## Adding a song

1. Copy the MP3 into `public/music/`, for example `track-05.mp3`
2. Append an entry to `public/music/tracks.json`:
   ```json
   { "id": "track-05", "file": "track-05.mp3", "title": "ShockBot · Track 5" }
   ```
3. `npm test && npm run build`, then open a PR

## Adding a business

Pickups and drop-offs are real businesses listed in `public/businesses/businesses.json`. Copy the coordinates from Google Maps, add an entry with `name`, `town` and `coords`, then `npm test && npm run build` and open a PR. Full details: [docs/businesses.md](docs/businesses.md).

## Adding a cutaway clip

Cutaway scenes are short live-action videos (for example an island local saying thank you and offering a KDU tip) that play inside a holographic frame during arrival scenes. With no clips listed, the normal arrival scene plays. Full details: [docs/clips.md](docs/clips.md).

1. Convert the video (see the spec and ffmpeg line below) and copy it into `public/clips/`, for example `thanks-01.mp4`
2. Add it to `public/clips/clips.json`:
   ```json
   { "clips": [
     { "id": "thanks-01", "file": "thanks-01.mp4" },
     { "id": "hello-01", "file": "hello-01.mp4", "when": "pickup" }
   ] }
   ```
3. `npm test && npm run build`, then open a PR

`when` is optional: `delivery` (the default), `pickup` or `any`. `biz` is optional too: a business id makes the clip play only at that business. After each delivery or pickup the game plays a random fitting clip and avoids repeating the last one. Delivery clips play before the KDU coins fly into the counter. Ids must be unique.

Clip spec:
- Vertical 9:16 (720x1280 is plenty), 4 to 8 seconds
- MP4, H.264 video, AAC audio, `faststart` so it starts streaming right away
- Keep each file under about 5 MB

Convert anything with ffmpeg:

```bash
ffmpeg -i input.mov -t 8 -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30" -c:v libx264 -profile:v high -preset slow -crf 26 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart public/clips/thanks-01.mp4
```

## Game rules (do not change without Jessie)

- True scale: 1 world unit = 100 m on every axis. Real coordinates, real elevation data
- All three pilots fly the same classic disc ship with the same flight behavior. Only colors differ:
  - Mystery Drone: silver and blue
  - Ipo: pink
  - Monkey Jockey: light electric blue
- Pilots show only the backs of their heads. No helmets, no hats
- KDU (Kudoken) is always electric blue (`--kdu: #1ec8ff`), shown with the hexagon coin glyph
- FlashTown is the HQ (a real place). Do not invent its coordinates; ask Jessie
- The cockpit is alien tech:
  - No English words on buttons. Use glyphs from the SVG sprite in `index.html` (add new `<symbol id="g-...">` entries) and keep English in `aria-label` and `title` for accessibility
  - No round buttons. Use shards, hexagons, chevrons and clipped-corner panels with scanlines and a glow in the pilot's color
  - Numbers on readouts are fine
- Every keyboard shortcut must keep working; touch must keep working on phones

## Style rules

- No periods at the end of headlines or headings
- No em dashes anywhere in visible text (use commas, colons or parentheses)
- No tiny, spaced-out, uppercase "eyebrow" text
- No big red buttons or big red areas
- Big buttons are copper or pewter metallic (see `.metal-btn.copper` and `.metal-btn.pewter`)
- No analytics, trackers or third-party scripts
- Free assets only. Flag anything that would cost money
- Respect `prefers-reduced-motion`

## Workflow

- Small, focused PRs with a clear description of what changed and how you checked it
- Run `npm test` and `npm run build` before opening a PR. Add or update tests for logic you touch
- Check phones too: a 412x915 portrait viewport with `?touch=1`, in both chase and cockpit (`?cam=cockpit`) views
- Never commit `node_modules/`, `dist/`, `.vercel/` or local screenshots (`shots/`)
- Do not add paid services, analytics or new heavy dependencies
- Deploys are automatic: merging to `master` deploys production on Vercel, and PRs get preview links
