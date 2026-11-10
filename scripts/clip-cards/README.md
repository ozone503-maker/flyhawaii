# Thank-you clip cards

Makes the 6 second thank-you clip for each business in `public/clips/`: the business's local on a painted Big Island backdrop, their line popping in word by word, a blip voice, and a burst of KDU coins.

```bash
cd scripts/clip-cards
ln -sfn ../../public/locals locals
mkdir -p vo out
python3 spec.py            # writes spec.json from destinations.json plus the lines in spec.py
python3 timing_audio.py    # word timing and the sound for each clip
node render.cjs             # renders out/<business id>.mp4 (or: node render.cjs suisan-fish-market)
cp out/*.mp4 ../../public/clips/
```

To add a clip for a new business, add a line for it in `spec.py` (caption, backdrop from `bg/`, pan, voice pitch) and add it to `public/clips/clips.json` with `"biz": "<business id>"`. Needs Python with numpy, Node with Playwright, and ffmpeg.
