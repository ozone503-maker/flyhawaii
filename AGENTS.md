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
| `src/destinations.js` | Destination list validation, packages by kind |
| `src/job-offers.js` | The job board: four offers, pay formula, ETA, reroll avoidance, optional Ohana specials |
| `src/moving-jobs.js` | Deliveries to a cruise ship, fishing boat or snorkel catamaran: vessel greeters and the Moving offer. Pure |
| `src/regulars.js` | Relationship tiers, tip bonuses, greeter line picks, versioned `fh_regulars_v1` storage |
| `src/shift.js` | FlashTown takeoff pad, near-HQ test, homecoming payout |
| `src/rings.js` | KDU ring tiers and values, fly-through test, streaks, chains, placement math. `RINGS_ENABLED` (currently false) parks the feature |
| `src/ring-field.js` | KDU rings in the 3D world: pooled instanced meshes, spawning, respawns, bursts. No-op when `RINGS_ENABLED` is false |
| `src/daylight.js` | Time of day: Hawaiʻi hour, sun position, sky, light and fog colors by sun height. Pure |
| `src/daylight3d.js` | Applies the time of day: sun or moon light, sky, fog, stars, moon, the shared shader tint (`src/world-light.js`) |
| `src/sky-ocean.js` | Sky dome with horizon haze, ocean colored by real depth with surf, instanced trade-wind clouds and the fly-through white-out |
| `src/clouds.js` | Where clouds go (windward band, Kona afternoon clouds, Kohala cap, sea cumulus) and cloud density at a point. Pure |
| `src/landmarks3d.js` | Kīlauea lava glow and vog plume, Mauna Kea snow and observatories, waterfall ribbons, town buildings (instanced) |
| `src/landmarks.js` | Town areas, observatory and crater coordinates, waterfall heights, building placement. Pure |
| `src/aircraft3d.js` | Airliners flying circuits at Hilo and Kona, tour helicopters, near-miss warning |
| `src/air-traffic.js` | Runway ends (FAA), circuit and helicopter tour paths, timed path sampling. Pure |
| `src/boats3d.js` | Cruise ships, sport fishing boats and a snorkel catamaran with foamy wakes |
| `src/sea-traffic.js` | Cruise route Hilo pier to the Kona anchorage around Upolu Point, boat routes from Honokōhau, Kawaihae and Hilo. Pure, and a test checks every leg stays at sea |
| `src/sea-life.js` | Humpback whales in season (Nov to Apr) off Kohala and Kona with blows, dives and breaches, spinner dolphin pods, honu at Punaluʻu |
| `src/rain3d.js` | Shower cells (dark cloud and rain curtain), rain on the glass, rainbows opposite a low sun |
| `src/rain.js` | Windward shower cells drifting on the trade wind, wetness, when a rainbow shows. Pure |
| `src/tree-field.js` | Forest, coconut palms and kiawe around the saucer (instanced, refilled as you fly) |
| `src/trees.js` | Which tree grows where from the imagery, deterministic trees per cell. Pure |
| `src/clips.js` | Cutaway clip list parsing and picking |
| `src/cd-player.js` | Music player logic (tracks, auto advance, ducking under clips) |
| `src/game-audio.js` | Synthesized WebAudio engine hum, chimes and coin blips, plus place sounds (surf, high wind, crater rumble, rain, birdsong, coquí). No sample files |
| `src/ambience.js` | How loud each place sound is for where the saucer is. Pure |
| `src/camera-mode.js` | Chase and cockpit camera positions |
| `src/flight-speed.js` | Shared flight speeds and easing |
| `src/ships.js`, `src/pilot-head.js` | The disc ship and the back-of-head pilot models |
| `src/attractions.js` | Real landmark photo signs and the Discovered counter |
| `src/chunks.js`, `src/height-png.js` | Terrain streaming and 16-bit height decoding |
| `test/*.test.js` | Unit tests for the pure modules (`node --test`) |
| `test/fixtures/clips/` | Test-only placeholder clips. Never ship them |
| `scripts/*.py` | Headless screenshot checks (Python Playwright + Chrome): `alien-shots.py`, `cutscene-shots.py`, `clip-shots.py`, `destination-shots.py`, `rings-jobs-shots.py`, `regulars-shots.py` |
| `scripts/clip-cards/` | Makes the 6 second thank-you clip for each business (see its README) |
| `scripts/add-destination.mjs` | Geocodes a business with OpenStreetMap and appends it to the destinations list |
| `scripts/bake-*.mjs` | One-off data baking for terrain and water. Rarely needed |
| `public/` | Static files served as is: terrain, photos, pilots, music, clips, destinations |
| `docs/` | Extra docs, including `docs/clips.md` and `docs/destinations.md` |

Keep logic that can be tested in small pure modules (like `cutscene.js`, `clips.js` or `destinations.js`) and add a test for it. `main.js` is big, so make focused edits there.

## Adding a song

1. Copy the MP3 into `public/music/`, for example `track-05.mp3`
2. Append an entry to `public/music/tracks.json`:
   ```json
   { "id": "track-05", "file": "track-05.mp3", "title": "ShockBot · Track 5" }
   ```
3. `npm test && npm run build`, then open a PR

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

`when` is optional: `delivery` (the default), `pickup` or `any`. After each delivery or pickup the game plays a random fitting clip and avoids repeating the last one. Delivery clips play before the KDU coins fly into the counter. Ids must be unique.

Clip spec:
- Vertical 9:16 (720x1280 is plenty), 4 to 8 seconds
- MP4, H.264 video, AAC audio, `faststart` so it starts streaming right away
- Keep each file under about 5 MB

Convert anything with ffmpeg:

```bash
ffmpeg -i input.mov -t 8 -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30" -c:v libx264 -profile:v high -preset slow -crf 26 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart public/clips/thanks-01.mp4
```

## Adding a business (destination)

Jobs pick up and deliver at real businesses listed in `public/destinations/destinations.json`. Each one has its own exact lat/lon, so the beacon lands on the building. Town labels and landmarks are separate and stay as they are. Full details: [docs/destinations.md](docs/destinations.md).

```bash
node scripts/add-destination.mjs "Kona Farmers Market" "75-5767 Aliʻi Dr, Kailua-Kona, HI"
node scripts/add-destination.mjs "Some Shop" "19.6402,-155.9967" --kind shop --town Kailua-Kona
```

The script geocodes with OpenStreetMap Nominatim (one request per second, max a few per run), appends the entry and prints an OSM link. Open the link and check the pin sits on the business, not the road or the middle of town. Use `--dry-run` to preview. Then `npm test && npm run build` and open a PR.

An entry looks like this (only `name`, `kind`, `lat` and `lon` are required):

```json
{ "id": "kona-commons", "name": "Kona Commons", "town": "Kailua-Kona", "kind": "mall",
  "lat": 19.650076, "lon": -156.004391, "address": "74-5444 Makala Blvd, Kailua-Kona, HI 96740",
  "website": "https://www.konacommons.com/", "sponsor": false, "source": "https://www.openstreetmap.org/way/198255842" }
```

- `kind`: `hq`, `own` (Jessie's brands), `market`, `restaurant`, `mall`, `shop` or `hotel`
- `local` (name, portrait from `public/locals/`, lines) and `packages` give each business its own character and goods
- Record where the coordinates came from in `source`. Set `"approx": true` when they are a placeholder
- Only add places that are open now. Set `"enabled": false` to pause one without deleting it
- Entries with coordinates off the Big Island are skipped with a console warning, and `npm test` fails on them

## Game rules (do not change without Jessie)

- Every new shift takes off from the FlashTown HQ pin in Mountain View. If that pin is missing, it falls back to the old Hilo start. After at least one delivery the player can optionally fly home for a shift summary and a small homecoming payout
- Jobs come from a gig-style board: after the start and after every delivery the player picks one of four offers (keys 1 to 4 or tap). `R` or the hex button rerolls, with a cooldown. Pay = 15 + 1.6 KDU per km of delivery leg + 0.6 per km to reach the pickup, times Rush (1.3) or Fragile (1.15), plus or minus up to 8%, rounded to 5. A speed bonus is still added on delivery
- Each business remembers the player (regulars). Counts are stored in `fh_regulars_v1`. Tiers: Stranger (0 deliveries), Familiar (3, +10% tip), Regular (8, +20%), Ohana (15, +35%). The tip is paid at dropoff based on that business. Greeters use `local` data (see docs/destinations.md). Ohana businesses can occasionally offer a 1.5x special job marked with the business name, and heart pips on the board show relationship progress
- KDU fly-through rings are parked (`RINGS_ENABLED = false` in `src/rings.js`) until collection feels right. Do not bring back the old floating 1 KDU tokens. When the flag is on: fly through the middle (crossing the ring plane inside its radius). Tiers: blue 5 (biggest, common), green 10, gold 25, prismatic 50 (smallest, rare). Rings in a quick streak add +2 each (max +20); clearing a whole chain adds 10 per ring

- True scale: 1 world unit = 100 m on every axis. Real coordinates, real elevation data
- All three pilots fly the same classic disc ship with the same flight behavior. Only colors differ:
  - Mystery Drone: silver and blue
  - Ipo: pink
  - Monkey Jockey: light electric blue
- Pilots show only the backs of their heads. No helmets, no hats
- KDU (Kudoken) is always electric blue (`--kdu: #1ec8ff`), shown with the hexagon coin glyph
- FlashTown is the HQ (a real place in Mountain View). Its pin in the destinations list comes from Jessie. Do not move it without asking him
- The cockpit is alien tech:
  - No English words on buttons. Use glyphs from the SVG sprite in `index.html` (add new `<symbol id="g-...">` entries) and keep English in `aria-label` and `title` for accessibility
  - No round buttons. Use shards, hexagons, chevrons and clipped-corner panels with scanlines and a glow in the pilot's color
  - Numbers on readouts are fine
- Time of day follows the real clock in Hawaiʻi by default. `T` or the sun glyph in the pause menu cycles Live, Day, Sunset and Night (saved in `fh_time`); `?time=21` forces an hour for testing
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
