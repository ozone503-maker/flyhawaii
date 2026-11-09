# Pickup and drop-off places

Every job uses two places from `destinations.json` in this folder: one where you pick the package up (amber beacon) and a different one where you drop it off (green beacon). They are always two different businesses, usually at least 1 km apart, and the same pair never repeats twice in a row. The more places in this list, the more routes there are.

## In the game now (20)

| Place | Town | Kind | Coordinates | Local | |
| --- | --- | --- | --- | --- | --- |
| FlashTown HQ | Mountain View | hq | `19.48148, -155.098468` |  |
| Kona Farmers Market | Kailua-Kona | market | `19.637213, -155.991901` | Uncle Keola |
| Kona Commons | Kailua-Kona | mall | `19.650076, -156.004391` |  |
| Keauhou Shopping Center | Keauhou | mall | `19.571372, -155.961814` |  |
| Volcano Farmers Market | Volcano | market | `19.434211, -155.230069` |  |
| Kilauea Lodge Restaurant | Volcano | restaurant | `19.430972, -155.231141` |  |
| Hilo Farmers Market | Hilo | market | `19.72333, -155.08475` | Aunty Mele |
| Volcano House | Volcano | hotel | `19.42833, -155.25806` | Malia |
| Makuʻu Farmers Market | Pāhoa | market | `19.50551, -154.95701` | Uncle Kimo | close, not exact
| Uncle Robert's ʻAwa Club | Kalapana | market | `19.36098, -154.97083` | Leilani |
| Suisan Fish Market | Hilo | market | `19.724, -155.07024` | Uncle Kenji |
| Ken's House of Pancakes | Hilo | restaurant | `19.72234, -155.06475` | Auntie Rose |
| Hana Hou Restaurant | Nāʻālehu | restaurant | `19.05999, -155.5867` | Uncle Moku |
| Bamboo Restaurant | Hāwī | restaurant | `20.23818, -155.83131` | Makana |
| Royal Kona Resort | Kailua-Kona | hotel | `19.63255, -155.9897` | Kawika |
| King Kamehameha's Kona Beach Hotel | Kailua-Kona | hotel | `19.64096, -155.99752` | Nalu |
| Hilton Waikoloa Village | Waikōloa | hotel | `19.92353, -155.88725` | Keoni |
| Mauna Lani | Kohala Coast | hotel | `19.9431, -155.8579` | Aunty Pua |
| Mauna Kea Beach Hotel | Kohala Coast | hotel | `20.00542, -155.82373` | Captain Ben |
| Four Seasons Resort Hualālai | Kaʻūpūlehu | hotel | `19.8298, -155.9818` | Hiʻilani | close, not exact

## Waiting on a pin

On Jessie's list but still need coordinates (long-press the building in Google Maps and copy the numbers):

- Irie Hawaii (all locations)
- Dolphin Spit Tavern
- Hilo Lanes (bowling)
- Tractor Supply and Prince Kūhiō Plaza (Hilo)
- Mountain View Mini Mart
- The 7-Elevens
- ChoiceMART (Captain Cook)
- Tex Drive In (Honokaʻa) and more north shore spots
- Kurdistan Cafe
- Blackrock grill (Volcano)

## Add a place

`node scripts/add-destination.mjs "Name" "19.72400,-155.07024" --kind restaurant --town Hilo`, or add an entry to `destinations.json` by hand. Then give it a `local` (name, a portrait from `public/locals/`, three lines) and some `packages`. Full guide: [docs/destinations.md](../../docs/destinations.md).

## Sponsors

`sponsor` stays `false` until a business signs on.
