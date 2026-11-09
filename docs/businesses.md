# Delivery businesses

Every pickup and drop-off is a business in `public/businesses/businesses.json`. Add a line there and the business is in the game: its beacon sits on its real coordinates, its name shows on the mission card, and its own cutaway clip plays when you arrive. No code changes.

## Add a business

1. Find it in Google Maps, long-press (phone) or right-click (desktop) right on the building, and copy the coordinates at the top, for example `19.72333, -155.08475`
2. Add an entry to `public/businesses/businesses.json`:
   ```json
   {
     "name": "Hilo Farmers Market",
     "kind": "market",
     "town": "Hilo",
     "coords": "19.72333, -155.08475",
     "address": "Mamo St & Kamehameha Ave, Hilo",
     "packages": ["a crate of apple bananas", "a box of rambutan"],
     "local": {
       "name": "Aunty Mele",
       "portrait": "papaya-aunty.webp",
       "lines": ["Ho, just in time!", "Mahalo nui, you're the best.", "Here, Kudokens for you!"]
     },
     "sponsor": { "active": false, "tagline": "", "url": "" }
   }
   ```
3. `npm test && npm run build`, open a PR. Merging to `master` deploys it

Only `name`, `town` and `coords` are required. You can also give `lat` and `lon` as separate numbers instead of `coords`.

| Field | What it does |
| --- | --- |
| `name` | Shown on the beacon and the mission card |
| `town` | Shown after the name, and in "Fly to ..." |
| `coords` | Where the beacon goes. Paste straight from Google Maps |
| `id` | Optional. Made from the name (`Hilo Farmers Market` becomes `hilo-farmers-market`). Clips use it |
| `kind` | `market`, `restaurant`, `shop`, `mall`, `farm`, `cafe`, `hotel`, `service` or `other` |
| `packages` | What gets picked up here. Falls back to the shared package list |
| `local` | The person who greets the pilot: name, portrait file in `public/locals/`, and their lines |
| `sponsor` | For later. Ignored unless `active` is `true`; links must be `https://` |
| `active` | Set to `false` to take a business out without deleting it |
| `placeholder` | Marks the made-up starter businesses that real ones should replace |

## Safety checks

- A business whose coordinates are not on Hawaiʻi Island (swapped numbers, a missing minus sign) is skipped and named in the browser console, so a typo never sends a pilot into the ocean
- Duplicate ids are skipped
- Pickup and drop-off are always at least 1.5 km apart
- If fewer than two businesses are valid, the game falls back to the built-in town list
- `npm test` checks the shipped list, including that every portrait file exists

## Clips for a business

Add `"biz": "<business id>"` to a clip in `public/clips/clips.json`. That clip then plays only at that business, and that business plays its own clips instead of the shared ones. Clips without `biz` are shared by every business that has none of its own. See [clips.md](clips.md).

```json
{ "id": "hfm-thanks", "file": "hfm-thanks.mp4", "biz": "hilo-farmers-market" }
```

## Local portraits

`public/locals/` holds the cut-out characters (transparent WebP, about 360 px). Use any of them for `local.portrait`.
