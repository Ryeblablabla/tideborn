import { TAU, clamp, flightBand } from './rules.js';

const skyHabitat = { limit: 158, pockets: 14, along: 3.8, across: 1.65 };

export const ambientLimit = stage => stage === 3 ? skyHabitat.limit : 0;

function makePocket(game, slot) {
  const { p, foodRng: roll } = game;
  const reach = 8 + Math.sqrt(roll()) * 24;
  const angle = p.angle + (slot + (roll() - .5) * 1.3) * TAU / skyHabitat.pockets;
  const z = p.z + Math.cos(angle) * reach;
  const river = game.flightRoute?.(z);
  const x = river ? river.x + Math.sin(angle) * river.halfWidth * .83 : p.x + Math.sin(angle) * reach;
  const heading = river ? Math.atan(river.grade) + (slot % 2 ? -.34 : .34) : angle + Math.PI / 2;
  const band = clamp(p.altitude, 9.4, 15.7) + (slot % 3 - 1) * 2.65;
  return { x, z, heading, band };
}

export function ambientPosition(game) {
  if (!ambientLimit(game.stage)) return null;
  const { p, foodRng: roll, foodPockets: pockets } = game;
  const high = flightBand(game.stage)[1];
  for (let attempt = 0; attempt < 20; attempt++) {
    const slot = Math.floor(roll() * skyHabitat.pockets);
    let pocket = pockets[slot];
    const distance = pocket ? Math.hypot(p.x - pocket.x, p.z - pocket.z) : Infinity;
    if (distance > 35 || distance < 4 || Math.abs(pocket.band - p.altitude) > 5.8) {
      pocket = pockets[slot] = makePocket(game, slot);
    }
    const along = (roll() + roll() - 1) * skyHabitat.along;
    const across = (roll() + roll() - 1) * skyHabitat.across;
    const sin = Math.sin(pocket.heading), cos = Math.cos(pocket.heading);
    const x = pocket.x + sin * along + cos * across;
    const z = pocket.z + cos * along - sin * across;
    const y = clamp(pocket.band + (roll() - .5) * 1.10, 7, high - .55);
    if (Math.abs(x) < 66 && Math.abs(z) < 66 && (!game.terrainHeight || game.terrainHeight(x, z) + .65 < y)) {
      return { x, z, y, foodHeading: pocket.heading };
    }
    if (attempt >= 7) pockets[slot] = null;
  }
  return null;
}
