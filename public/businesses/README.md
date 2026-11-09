# Businesses in the game

Every pickup and drop-off in Fly Hawaii is a real Big Island business listed in `businesses.json` in this folder. Add a line there and the business is in the game. Full field guide: [docs/businesses.md](../../docs/businesses.md).

## Add a business in two minutes

1. In Google Maps, long-press (phone) or right-click (desktop) right on the building
2. Copy the numbers at the top, for example `19.72400, -155.07024`
3. Add an entry to `businesses.json` with at least `name`, `town` and `coords`
4. Give it a `local` (name, a portrait from `public/locals/`, three lines) and some `packages` so the scene feels like that place
5. `npm test`, then open a PR. The Vercel preview link shows it live before merging

## In the game now (15)

| Business | Town | Kind | Coordinates | Local |
| --- | --- | --- | --- | --- |
| Hilo Farmers Market | Hilo | market | `19.72333, -155.08475` | Aunty Mele |
| Kona Farmers Market | Kailua-Kona | market | `19.63721, -155.99190` | Uncle Keola |
| Volcano House | Volcano | hotel | `19.42833, -155.25806` | Malia |
| Makuʻu Farmers Market | Pāhoa | market | `19.50551, -154.95701` | Uncle Kimo |
| Uncle Robert's ʻAwa Club | Kalapana | market | `19.36098, -154.97083` | Leilani |
| Suisan Fish Market | Hilo | market | `19.72400, -155.07024` | Uncle Kenji |
| Ken's House of Pancakes | Hilo | restaurant | `19.72234, -155.06475` | Auntie Rose |
| Hana Hou Restaurant | Nāʻālehu | restaurant | `19.05999, -155.58670` | Uncle Moku |
| Bamboo Restaurant | Hāwī | restaurant | `20.23818, -155.83131` | Makana |
| Royal Kona Resort | Kailua-Kona | hotel | `19.63255, -155.98970` | Kawika |
| King Kamehameha's Kona Beach Hotel | Kailua-Kona | hotel | `19.64096, -155.99752` | Nalu |
| Hilton Waikoloa Village | Waikōloa | hotel | `19.92353, -155.88725` | Keoni |
| Mauna Lani | Kohala Coast | hotel | `19.94310, -155.85790` | Aunty Pua |
| Mauna Kea Beach Hotel | Kohala Coast | hotel | `20.00542, -155.82373` | Captain Ben |
| Four Seasons Resort Hualālai | Kaʻūpūlehu | hotel | `19.82980, -155.98180` | Hiʻilani |

Makuʻu Farmers Market and Four Seasons Hualālai are close but not exact. A fresh Google Maps pin would tighten them.

## Waiting on a pin

These are on the list but need coordinates from Google Maps before they go in:

- Irie Hawaii (all locations)
- Dolphin Spit Tavern
- Hilo Lanes (bowling, Kīlauea Ave)
- Tractor Supply and Prince Kūhiō Plaza (Hilo)
- Mountain View Mini Mart
- The 7-Elevens
- ChoiceMART (Captain Cook)
- Tex Drive In (Honokaʻa) and more north shore spots
- Kurdistan Cafe
- Blackrock grill (Volcano)

## Sponsors

Each business has a `sponsor` block that stays off (`"active": false`) until a business signs on. Turn it on with a short `tagline` and an `https://` link.
