# Cutaway clips

Live-action clips (Jessie's thank-you clips and Claude's cutaway scenes) play inside a holographic transmission frame during arrival scenes.

## How they play

- After a delivery (and after a pickup, for clips marked `pickup` or `any`) the arrival scene starts as usual: camera orbit, tractor beam, package, burst
- At about 3.3 s the scene pauses and the clip plays in the frame, centered. Desktop shows a vertical panel, phones fill most of the screen
- For deliveries, the KDU coins fly into the counter after the clip ends
- ShockBot music ducks during the clip (on iPhone, where volume is locked, it pauses and resumes) and the engine hum is muted
- A random fitting clip is picked, never the same as the last one when there is a choice
- Files load only when a scene picks them (`preload="metadata"`, inline playback on iPhone)
- If sound is blocked, the clip plays muted with a tap-for-sound glyph. If it fails to load or start within 2.5 s, the scene continues without it
- Skip: tap, click or any key except P/Esc ends the clip (coins still fly), a second skip ends the scene. Pause freezes the clip
- Turning off "Arrival scenes" in the pause menu turns clips off too

## Adding a clip

1. Convert the clip (spec below) into `public/clips/`, for example `thanks-01.mp4`
2. Add an entry to `public/clips/clips.json`:
   ```json
   { "clips": [
     { "id": "thanks-01", "file": "thanks-01.mp4" },
     { "id": "wave-01", "file": "wave-01.mp4", "when": "any" }
   ] }
   ```
   A bare list (`[ {...} ]`) also works. `id` must be unique (defaults to the file name). `file` is relative to `public/clips/` unless it starts with `/`
3. `npm test && npm run build`, open a PR. Merging to `master` deploys it

`when` values:

| Value | Plays after |
| --- | --- |
| `delivery` (default) | Deliveries |
| `pickup` | Pickups |
| `any` | Both |

An empty list is valid and means no clips.

`biz` is optional: set it to a business id from `public/businesses/businesses.json` and the clip plays only at that business, and that business plays only its own clips. See [businesses.md](businesses.md).

## Spec

- Vertical 9:16, 720x1280 recommended, 4 to 8 s
- MP4 with H.264 video and AAC audio, `faststart`
- Under about 5 MB each

```bash
ffmpeg -i input.mov -t 8 -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30" -c:v libx264 -profile:v high -preset slow -crf 26 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart public/clips/thanks-01.mp4
```

## Testing without shipping a clip

Placeholder clips live in `test/fixtures/clips/` with their own list. Serve a build that has them at `/clips-test/` and open `?debug&clips=/clips-test/clips.json`:

```bash
npm run build
rm -rf /tmp/fh-test && cp -r dist /tmp/fh-test && cp -r test/fixtures/clips /tmp/fh-test/clips-test
npx vite preview --outDir /tmp/fh-test --port 4174
python3 scripts/clip-shots.py http://localhost:4174
```
