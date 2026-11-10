// Deliveries to things that move: a cruise ship, the fishing fleet, the snorkel catamaran.
// The drop-off beacon rides on the vessel, so you have to catch it. Pure, no three.js.
import { distanceKm, packageFor } from './destinations.js';
import { offerPay, offerEtaSec } from './job-offers.js';

export const MOVING_MULT = 1.25; // catching a moving drop-off pays a quarter more
export const MOVING_CHANCE = 0.45; // how often the board shows one

export const VESSEL_STOPS = [
  { id: 'cruise-ship', vessel: 'cruise', name: 'Cruise ship', town: 'Hilo to Kona run', deckU: 1.0,
    packages: ['a box of fresh leis for the guests', 'a crate of apple bananas', 'a case of Kona coffee', 'a cooler of poke for the captain'],
    local: { name: 'Bosun Kale', portrait: 'rope-uncle.webp', lines: ['Ho, you caught us under way!', 'The passengers going love this. Mahalo!', 'Kudokens for you, sailor.'] } },
  { id: 'fishing-boat', vessel: 'fishing', name: 'Fishing boat', town: 'out on the grounds', deckU: 0.25,
    packages: ['a cooler of ice', 'a bucket of bait', 'a bag of lures', 'lunch for the crew'],
    local: { name: 'Uncle Sonny', portrait: 'hook-uncle.webp', lines: ['Eh, right on the bite!', 'Ice was almost gone, mahalo brah.', 'Kudokens, fresh off the boat.'] } },
  { id: 'snorkel-cat', vessel: 'catamaran', name: 'Snorkel catamaran', town: 'Kealakekua run', deckU: 0.3,
    packages: ['a box of reef-safe sunscreen', 'a bag of snorkel masks', 'a tray of musubi', 'fresh fruit for the guests'],
    local: { name: 'Kanoe', portrait: 'lei-maker.webp', lines: ['Aloha from the deck!', 'Mahalo, the guests were starving.', 'Here, Kudokens, come snorkel sometime.'] } },
];

/**
 * One offer to deliver to a vessel. vessels: [{ key, kind, lat, lon }] where they are now.
 * The pickup is a nearby business that makes sense for it (not too far, not right on top).
 */
export function makeMovingOffer({ list, vessels, player, rand = Math.random, stops = VESSEL_STOPS }) {
  if (!Array.isArray(list) || !list.length || !vessels?.length) return null;
  const choices = stops.flatMap((s) => vessels.filter((v) => v.kind === s.vessel).map((v) => ({ s, v })));
  if (!choices.length) return null;
  const { s, v } = choices[Math.floor(rand() * choices.length) % choices.length];
  const to = { id: s.id, name: s.name, town: s.town, kind: 'boat', lat: v.lat, lon: v.lon, vesselKey: v.key, deckU: s.deckU, local: s.local, packages: s.packages, moving: true };
  const near = list.filter((b) => b.kind !== 'hq').map((b) => ({ b, km: distanceKm(b, to) })).filter((x) => x.km >= 3 && x.km <= 40).sort((a, b) => a.km - b.km).slice(0, 5);
  if (!near.length) return null;
  const { b: from, km: legKm } = near[Math.floor(rand() * near.length) % near.length];
  const deadheadKm = player ? distanceKm(player, from) : 0;
  const tags = ['moving'];
  const pay = Math.round(offerPay(legKm, deadheadKm, [], rand() * 2 - 1) * MOVING_MULT / 5) * 5;
  return { key: `${from.id}>${s.id}`, slot: 0, from, to, legKm, deadheadKm, totalKm: legKm + deadheadKm,
    etaSec: offerEtaSec(legKm + deadheadKm), pay, tags, pkg: s.packages[Math.floor(rand() * s.packages.length) % s.packages.length] || packageFor(from, rand) };
}
