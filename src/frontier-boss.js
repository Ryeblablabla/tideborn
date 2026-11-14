import { clamp, flightBand, STAGES } from './rules.js';

const LOST_RANGE = 36;
const WARNING_TIME = 1.25;
const SETTLE_TIME = .6;
const DISTANCES = [18, 23];
const BEARINGS = [0, .46, -.46, .92, -.92, 1.52, -1.52, 2.15, -2.15, Math.PI];

function arrivalSite(game, boss) {
  const {p,stage} = game;
  const airborne = stage === 3;
  const [floor, ceiling] = flightBand(stage);
  for (const offset of BEARINGS) {
    const heading = p.angle + offset;
    const along = Math.sin(heading), across = Math.cos(heading);
    for (const distance of DISTANCES) {
      const x = p.x + along * distance;
      const z = p.z + across * distance;
      if (!airborne && game.onLand(x, z, boss.radius)) continue;
      if (!airborne) return {x, y:stage === 2 ? 1.04 : stage === 1 ? .86 : .7, z};
      const terrain = game.terrainHeight?.(x, z) ?? -Infinity;
      const minimum = Math.max(floor, terrain + 1.85);
      if (minimum <= ceiling) return {x, y:clamp(p.y, minimum, ceiling), z};
    }
  }
  return null;
}

/** Bring the same boss back into reach after the player has left the fight. */
export function updateFrontierBoss(game, boss) {
  if (!game.exploring) return false;
  const {p, time} = game;
  const incoming = boss.frontierArrival;
  if (incoming) {
    if (time < incoming.at) return true;
    boss.frontierArrival = null;
    const {x,y,z} = incoming;
    Object.assign(boss,{x,y,z,angle:Math.atan2(p.x-x,p.z-z)});
    boss.frontierSettledAt = time + SETTLE_TIME;
    return true;
  }
  if (time < (boss.frontierSettledAt ?? 0)) return true;
  if (Math.hypot(boss.x-p.x,boss.z-p.z) <= LOST_RANGE || time < (boss.frontierRetryAt ?? 0)) return false;

  const site = arrivalSite(game, boss);
  if (!site) {
    boss.frontierRetryAt = time + .8;
    return false;
  }
  const at = time + WARNING_TIME;
  boss.frontierArrival = {...site, at};
  boss.bossPlan = null;
  boss.shield = false;
  boss.lunge = 0;
  boss.lungeWindup = 0;
  boss.bankSide = 0;
  boss.attack = 1.35;
  game.hazards = game.hazards.filter(hazard => hazard.bossId !== boss.id);
  game.hazards.push({...site, id:game.nextId++, bossId:boss.id, attack:'boss-reentry',
    radius:boss.radius+.55, life:WARNING_TIME, maxLife:WARNING_TIME, resolveAt:at,
    warning:true, previewOnly:true, surface:game.stage<3});
  game.emit('bossReentry', {...site, bossId:boss.id, name:STAGES[game.stage].boss, duration:WARNING_TIME});
  return true;
}
