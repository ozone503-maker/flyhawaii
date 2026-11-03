# Fly Hawaii co-pilot script

Voice lines spoken by the in-cockpit co-pilot. Source of truth is `voice-src/lines.json`; spoken pronunciations for Hawaiian names live in `voice-src/say.json`. Rebuild the audio with `./scripts/bake-voice.sh` (Piper TTS, voice en_US-ljspeech-high, public domain).

## Landmarks (play with the photo card on zone entry)

| Zone | Line | File | Length |
|---|---|---|---|
| Waipiʻo Valley Lookout | Look down there, that's Waipiʻo Valley. Young Kamehameha the First spent his boyhood here, and taro still grows on the valley floor. | `/voice/lm-waipio.mp3` | 8.67 s, 43 KB |
| ʻAkaka Falls | ʻAkaka Falls, dropping about 135 meters into the gorge. That's Kolekole Stream feeding it, deep in the Hāmākua rainforest. | `/voice/lm-akaka.mp3` | 9.77 s, 48 KB |
| Rainbow Falls (Waiānuenue) | Rainbow Falls, Waiānuenue. In the morning the sun turns the mist into rainbows. Legend says the cave behind it was home to Hina, mother of Māui. | `/voice/lm-rainbow.mp3` | 10.14 s, 50 KB |
| Halemaʻumaʻu, Kīlauea | Halemaʻumaʻu, inside Kīlauea caldera. This is the home of Pele, so we fly with respect. That steam is the island still growing. | `/voice/lm-halemaumau.mp3` | 9.8 s, 48 KB |
| Mauna Kea summit | Mauna Kea, the tallest mountain on Earth when you measure from the sea floor. The summit is sacred in Hawaiian tradition, and it also hosts some of the world's great telescopes. | `/voice/lm-maunakea.mp3` | 11.52 s, 56 KB |
| Mauna Loa | Mauna Loa, the largest active volcano on the planet by volume. It last erupted in late 2022, so those dark lava slopes are still fresh. | `/voice/lm-maunaloa.mp3` | 10.58 s, 52 KB |
| Punaluʻu Black Sand Beach | Punaluʻu, the black sand beach. Honu, green sea turtles, love to rest here, so we give them plenty of space. | `/voice/lm-punaluu.mp3` | 8.72 s, 43 KB |
| Ka Lae (South Point) | Ka Lae, South Point, the southernmost tip of the fifty states. Hold on tight, the winds and currents here are strong. | `/voice/lm-kalae.mp3` | 8.28 s, 41 KB |
| Kealakekua Bay | Kealakekua Bay, one of the best snorkel spots on the island. The white monument across the water marks where Captain Cook died in 1779. | `/voice/lm-kealakekua.mp3` | 11.02 s, 54 KB |
| Hāpuna Beach | Hāpuna Beach, long white sand and clear water on the Kohala coast. On a calm day it's about as good as beaches get. | `/voice/lm-hapuna.mp3` | 8.2 s, 40 KB |
| Pololū Valley | Pololū Valley, at the end of the road in North Kohala. A steep trail drops to a black boulder beach, and the lookout view is worth the stop. | `/voice/lm-pololu.mp3` | 9.61 s, 47 KB |
| Moku Ola (Coconut Island) | Moku Ola, Coconut Island, right in Hilo Bay. The name means island of life, and it was once a place of healing. | `/voice/lm-mokuola.mp3` | 8.07 s, 40 KB |
| Huliheʻe Palace, Kailua-Kona | Huliheʻe Palace, on Aliʻi Drive in Kailua-Kona. Built of lava rock in 1838, it later became a summer home for Hawaiian royalty. | `/voice/lm-hulihee.mp3` | 10.55 s, 52 KB |
| Lava Tree State Monument | Lava Tree State Monument. In 1790 lava swept through an ʻōhiʻa forest and hardened around the trunks, leaving these hollow lava molds. | `/voice/lm-lavatree.mp3` | 10.27 s, 50 KB |
| Nāhuku (Thurston Lava Tube) | Nāhuku, the Thurston Lava Tube. About 500 years ago a river of lava drained out of this tunnel, and now you can walk right through it. | `/voice/lm-thurston.mp3` | 9.67 s, 47 KB |

## Towns (2.5 km zone, at most once every 3 minutes)

| Town | Line | File | Length |
|---|---|---|---|
| Hilo | Welcome to Hilo, on the green, rainy side of the island. The bayfront and the farmers market are local favorites. | `/voice/town-hilo.mp3` | 8.05 s, 40 KB |
| Kailua-Kona | Kailua-Kona, the sunny side of the island. Kona coffee grows on the slopes above town, and the sunsets here are something else. | `/voice/town-kailua-kona.mp3` | 8.28 s, 41 KB |
| Waimea | Waimea, up in cattle country. Paniolo, Hawaiian cowboys, have ranched these green hills since the 1800s. | `/voice/town-waimea.mp3` | 9.17 s, 45 KB |
| Volcano | Volcano village, cool and misty up near Kīlauea. Grab a jacket, it gets chilly up here. | `/voice/town-volcano.mp3` | 6.4 s, 31 KB |
| Pahoa | Pāhoa, a funky little Puna town with old wooden storefronts. Puna is some of the youngest land on the island. | `/voice/town-pahoa.mp3` | 7.39 s, 36 KB |
| Hawi | Hāwī, way up in North Kohala. It's an old sugar town turned art town, and Kamehameha the Great was born on this coast. | `/voice/town-hawi.mp3` | 8.23 s, 40 KB |

## Cues

| Trigger | Line | File | Length |
|---|---|---|---|
| Game start | Aloha, I'm your co-pilot. Follow the arrow to our first pickup, and I'll point out the sights along the way. | `/voice/cue-start.mp3` | 6.82 s, 34 KB |
| First package picked up (once ever) | Package on board. Nice and easy, now let's get it to the drop-off. | `/voice/cue-firstPickup.mp3` | 4.83 s, 24 KB |
| Every delivery | Delivered, mahalo! That's more KDU in the bank. Ready for the next one? | `/voice/cue-delivered.mp3` | 6.09 s, 30 KB |
| First attraction discovered (once ever) | Ooh, our first discovery! Find all fifteen spots around the island to finish the collection. | `/voice/cue-firstDiscovery.mp3` | 6.43 s, 32 KB |
| All 15 discovered | That's all fifteen! You've seen the whole island from the sky. Mahalo for flying with me. | `/voice/cue-allFound.mp3` | 6.22 s, 31 KB |
| Below about 65 m above ground at speed, away from a beacon, max once a minute | Whoa, pull up a little, we're getting close to the ground. | `/voice/cue-lowAlt.mp3` | 3.53 s, 17 KB |

Total audio: 27 files, 1,137,591 bytes (1.08 MB), mono MP3 40 kbps 22.05 kHz.
