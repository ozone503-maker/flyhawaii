# Destinations (businesses you pick up from and deliver to)

Every job picks a pickup and a dropoff from `public/destinations/destinations.json`. The file is plain JSON served as is, so you can edit it without touching code, and a push to `master` puts the change live. A copy is also bundled into the game as a fallback in case the file fails to load.

Town labels (Hilo, Kailua-Kona, Volcano, and so on) and landmarks are separate and do not change when you add businesses.

## Add a business

```bash
node scripts/add-destination.mjs "Name" "street address, town, HI"
node scripts/add-destination.mjs "Name" "19.637213,-155.991901"
```

Options: `--kind market|restaurant|mall|shop|hotel|own|hq`, `--town Volcano`, `--id custom-id`, `--website URL`, `--hours "Sundays 6am to 10am"`, `--package "a box of ..."`, `--dry-run`.

What it does:
1. Geocodes the address with [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/), limited to the Big Island
2. If the address lands on a plaza or parking lot, it looks for the business by name right around it and uses that pin when OSM has it
3. Guesses `kind` from the OSM tags (restaurant, marketplace, mall, shop) unless you pass `--kind`
4. Validates the entry, appends it, and prints the coordinates plus an OSM link

Always open the printed link and check the pin is on the building. If it is off, right-click the right spot on openstreetmap.org, choose "Show address", and use those coordinates instead (or edit `lat` and `lon` by hand).

Nominatim usage policy: at most one request per second, an identifying User-Agent, no bulk runs. The script follows that. To add dozens of places, run it once per place, not in a tight loop over a big list.

## Fields

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Shown on the beacon label and the mission card |
| `lat`, `lon` | yes | WGS84 decimal degrees of the business itself, 5 or 6 decimals. Not a town center |
| `kind` | yes | `hq`, `own` (Jessie's brands), `market`, `restaurant`, `mall`, `shop`, `hotel`. Unknown kinds become `shop` with a warning |
| `id` | no | Lowercase slug, unique. Made from `name` if missing |
| `town` | no | Shown after the name, for example "Kona Commons, Kailua-Kona" |
| `address`, `website`, `hours` | no | For people checking the data |
| `sponsor` | no | `false` for now. Reserved for sponsored placements later |
| `packages` | no | A list of things picked up here. One is chosen per job. Wins over `packageHint` |
| `local` | no | The person who greets the pilot: `name`, `portrait` (a file in `public/locals/`) and `lines` (what they say). Gives each business its own character |
| `packageHint` | no | What you pick up there, for example "a crate of fresh produce". Otherwise the game picks one by `kind` |
| `photo` | no | Reserved for a future storefront photo |
| `source` | no, but please | Where the coordinates came from (OSM link or official site) |
| `approx` | no | `true` when the coordinates are a placeholder |
| `enabled` | no | `false` hides the place without deleting it |

## Validation

At load the game skips, with a `[destinations]` console warning:
- coordinates outside the Big Island box (lat 18.85 to 20.30, lon -156.10 to -154.75), missing or not numbers (catches swapped lat/lon)
- entries without a name
- duplicate ids
- entries with `"enabled": false` (silently)

`npm test` loads the shipped file and fails if anything in it would be skipped, so a typo cannot reach production.

## How jobs are picked

- Pickup and dropoff are always two different places
- Pairs at least 1 km apart are preferred, so you never deliver across one parking lot
- The same pickup and dropoff pair never repeats twice in a row
- The reward scales with the straight-line distance, as before

## Testing a list

`?debug&dest=/path/to/test.json` loads a different list. `window.__fh.destLib.list` shows what loaded and `window.__fh.newJob()` rolls a new job.

## FlashTown HQ

The `flashtown-hq` entry is a placeholder at the Eden Roc place point with `"approx": true`. Replace `lat` and `lon` with the real pin from Jessie and remove `approx`.

## A clip for one business

Add `"biz": "<destination id>"` to a clip in `public/clips/clips.json`. It then plays only at that business, and that business plays its own clips instead of the shared ones. See [clips.md](clips.md).

## Local portraits

`public/locals/` holds 29 cut-out characters (transparent WebP, about 360 px) for `local.portrait`.
