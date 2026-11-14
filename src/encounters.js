import { TAU, clamp, flightBand, waveDuration } from './rules.js';
import { updateFrontierBoss } from './frontier-boss.js';
import { paceSeaDrillEnemy } from './sea-drill.js';
import { techniqueSlowFactor } from './technique-arts.js';
import { ENDING_ROUTE_SITES } from './ending-route.js';

export const ENEMY_TYPES = Object.freeze({
  minnow: 0, crab: 1, polyp: 2, kite: 3, eel: 4,
  crabKing: 5, lantern: 6, turtle: 7, kun: 8, seaRay: 9, cloudRay: 10,
});
export const RANGED_SHOT_RANGE = 13.3;
export const CRAB_PINCER = Object.freeze({ windup: .68, active: .34, recovery: .52, width: .66 });
export const DART_RUSH = Object.freeze({ windup: .57, active: .27, recovery: .54, width: .51 });
export const CLOUD_PASS = Object.freeze({ windup: .59, active: .64, recovery: .76, width: .92 });

const { minnow, crab, polyp, kite, eel, seaRay, cloudRay } = ENEMY_TYPES;
const ENEMIES = {
  [minnow]: { role: 'dart', habitat: 'water', hp: 12, radius: .55, speed: 1.77, height: .61 },
  [crab]: { role: 'flanker', habitat: 'shallows', hp: 19, radius: .63, speed: 1.19, height: .62 },
  [polyp]: { role: 'lobber', habitat: 'water', hp: 25, radius: .71, speed: 1.04, height: .87, hold: 7.2, cooldown: 4.8 },
  [kite]: { role: 'diver', habitat: 'sky', hp: 29, radius: .79, speed: 1.77, height: 2.35, hold: 6.4, cooldown: 5.3 },
  [eel]: { role: 'surge', habitat: 'water', hp: 35, radius: .87, speed: 1.51, height: .84 },
  [seaRay]: { role: 'skimmer', habitat: 'sea', hp: 31, radius: .84, speed: 1.60, height: 1.12, hold: 5.6, cooldown: 4.9 },
  [cloudRay]: { role: 'escort', habitat: 'sky', hp: 33, radius: .86, speed: 1.44, height: -.65, hold: 8.0, cooldown: 4.6 },
};

export const CHAPTER_ROSTERS = [
  [[minnow, 5], [crab, 5]],
  [[minnow, 3], [polyp, 4], [eel, 3]],
  [[eel, 4], [seaRay, 4], [polyp, 2]],
  [[kite, 6], [cloudRay, 4]],
];

// Slots are lateral offset, distance ahead and, for fliers, height offset.
// Open sides and gaps are routes a player can actually use to pass a group.
const chapterPacks = [
  [
    { name: 'reed-shoal', cross: minnow, slots: [[minnow,-5,11], [minnow,-3,12], [minnow,-1,13.8], [minnow,1.4,14.5], [crab,5.6,16]] },
    { name: 'bank-pincer', flank: crab, slots: [[crab,-7,9], [crab,7,10.4], [crab,-8.5,12], [minnow,1.4,15.1], [minnow,4,16.6]] },
  ],
  [
    { name: 'lake-crossing', cross: eel, slots: [[eel,-5.8,12], [eel,-3.5,14.8], [eel,-1.2,17.5], [polyp,7,13], [polyp,8.4,16]] },
    { name: 'lake-islets', slots: [[polyp,-7.4,14.2], [polyp,2,16], [polyp,8.5,13.7], [minnow,-4,10.6], [eel,4.4,12], [minnow,5.5,15.3]] },
  ],
  [
    { name: 'breaking-front', slots: [[seaRay,-9,13], [seaRay,-4.6,11.8], [seaRay,0,13.5], [seaRay,5.4,14.2], [eel,-2.6,16.5], [eel,2.9,18.3]] },
    { name: 'split-swell', slots: [[eel,-4.5,10.8], [eel,-5.6,13], [seaRay,-7.6,15], [seaRay,5.5,11.6], [seaRay,8.2,14.3], [polyp,5.9,17.2]] },
    { name: 'reef-drift', slots: [[polyp,-7.4,16], [polyp,-5.1,18], [polyp,-1.8,18.8], [seaRay,-1.1,11.3], [seaRay,4.4,12.6], [eel,7.2,14.7]] },
  ],
  [
    { name: 'high-dive', slots: [[kite,-6,12,3.3], [kite,-2.7,14,2.6], [kite,1,16,3.4], [kite,4,17,2.3], [cloudRay,3.2,10.6,-2.2], [cloudRay,7.3,12.7,-2.5]] },
    { name: 'low-escort', slots: [[cloudRay,-8,12,-2.6], [cloudRay,-4.2,14,-2.8], [cloudRay,3.2,14.6,-2.4], [cloudRay,7.1,11.8,-2.6], [kite,-3.2,17.5,2.5], [kite,4.4,16.9,3]] },
    { name: 'ridge-pass', slots: [[kite,-6.4,11.9,2.8], [cloudRay,-6.3,13.6,-2.5], [kite,-8.3,15.4,2.2], [cloudRay,5.6,11.8,-2.7], [kite,6.5,14.3,2.6], [cloudRay,8.5,15.8,-2.5]] },
  ],
];

const packDelays = [4.8, 5.6, 5.2, 5.5];
// The first fish passes beside the default swim line while the opening
// technique winds up. Straight swimming should show the first reward clearly.
const openingShoal = { slots: [[minnow,1.55,4.4], [minnow,-3.2,6.3], [crab,2.5,7.8]] };
const backgroundPressure = [
  [.72, .88, 1.12, 1.17, .80],
  [1.07, 1.13, .86, 1.05, .76],
  [.73, .90, 1.29, 1.10, .82],
  [.89, 1.25, .75, 1.23, .76],
];
const cascadeShoals = [null,
  {name: 'lake-shoal', prey: [minnow, eel], guards: [polyp], hp: .58, interval: 9},
  {name: 'sea-shoal', prey: [eel, seaRay], guards: [polyp, seaRay], hp: .59, interval: 8},
  {name: 'cloud-flock', prey: [kite, cloudRay], guards: [kite, cloudRay], hp: .57, interval: 7},
];
// Each pod is [lateral, ahead, height, count]. The two late fronts share a
// bearing and are already in the world when the leading wing meets the player.
const shoalPods = [null,
  [[[0,4.15,0,5], [-4.5,7.25,-1,5], [4.7,8.35,.85,5]]],
  [[[0,4.15,0,3], [-6.15,4.35,0,6], [6.4,7.9,0,6], [-3,4.65,0,1], [3.65,7.65,0,1]],
   [[2.1,10.8,0,2], [4.9,17.8,0,5], [8.5,20.2,0,2]]],
  [[[-1.4,4.9,-.65,6], [-4.9,6.4,-1.55,7], [2.5,7.3,-.1,7]],
   [[4.0,10.8,1.15,2], [5.4,17.1,1.95,5], [8.8,18.8,2.45,3]]],
];
const podMembers = [[0,-1], [-1.05,-.3], [1.1,.15], [-.6,1.18], [1.35,1.52], [-1.8,.85], [2.05,-.68], [.35,2.56]];
const visibleShoalTurns = [0, -.38, .38, -.72, .72, -1.02, 1.02];
const shoalEnemyLimit = 48;
const followShoalMinimum = 12;
const crossCurrent = {name:'cross-current', slots:[
  [seaRay,-2,8.5], [eel,.5,9.6], [seaRay,2.3,10.8], [eel,1.8,12.6], [polyp,4.0,11.5], [seaRay,4.8,13.1],
]};
const highFlank = {name:'high-flank', slots:[
  [cloudRay,-2.5,9.4,1.2], [kite,-1.1,10.5,1.8], [cloudRay,.9,11.5,2.3],
  [kite,2.4,12.3,1.1], [cloudRay,2.8,12.8,1.9], [kite,4.1,13.4,.5],
]};
export const chapterPackDelay = stage => packDelays[stage] ?? Infinity;

const attack = (name, windup, active, recovery, rest) => ({ name, windup, active, recovery, rest });
const BOSS_ATTACKS = [
  [attack('crab-charge', .96, .97, 1.58, .93), attack('claw-stamp', 1.60, .16, 1.34, .89)],
  [attack('lantern-pulse', 1.02, 2.05, 1.35, .73), attack('lantern-fan', .79, .20, 1.55, .79)],
  [attack('shell-breaker', 1.34, .42, 1.82, .84), attack('shell-fan', .84, .21, 1.60, .84)],
  [attack('starfall', 1.55, .61, 1.39, .83), attack('sky-salvo', .96, .39, 1.46, .82)],
];
const shellBackwash = attack('shell-backwash', 1.38, .94, 1.72, .91);
const backwashField = { startRadius: 3.60, radius: 9.35, halfWidth: .42 };
const skyCross = attack('sky-cross', 1.28, .76, 1.64, .92);
const lanternWave = {startRadius:1.2,radius:10.6,halfWidth:.42,gapWidth:1.38,damage:28};

const point = entity => ({ x: entity.x, y: entity.y, z: entity.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const heading = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function moveAngle(entity, angle, distance) {
  entity.x += Math.sin(angle) * distance;
  entity.z += Math.cos(angle) * distance;
}

function turn(entity, angle, dt, rate = 8) {
  entity.angle += wrap(angle - entity.angle) * Math.min(1, dt * rate);
}

export function enemyProfile(type) {
  return ENEMIES[type] ?? ENEMIES[minnow];
}

export function enemyType(stage, requested, random) {
  const roster = CHAPTER_ROSTERS[stage];
  if (requested != null) {
    // Older callers may request a river animal while arranging an air fight.
    // Resolve it to an actual flying role, including its collision and attacks.
    if (stage === 3 && ENEMIES[requested] && ENEMIES[requested].habitat !== 'sky') {
      return requested === crab || requested === polyp ? cloudRay : kite;
    }
    return requested;
  }
  if (!roster) return minnow;
  const total = roster.reduce((sum, [, weight]) => sum + weight, 0);
  let choice = random() * total;
  for (const [type, weight] of roster) {
    choice -= weight;
    if (choice < 0) return type;
  }
  return roster.at(-1)[0];
}

export function enemyHeight(game, type, phase) {
  const profile = enemyProfile(type);
  if (profile.habitat === 'sky') {
    const [low, high] = flightBand(game.stage);
    return clamp(game.p.y + profile.height + Math.sin(phase) * 1.3, low, high);
  }
  return profile.height + (game.stage === 2 ? Math.sin(phase) * .16 : 0);
}

function packSlots(game, pack, side, {
  forward = game.p.angle,
  turns = [0, .48, -.48, 1.02, -1.02, 1.78, -1.78, Math.PI],
  minimumFronts,
} = {}) {
  const p = game.p;
  const preferred = forward + side * .2;
  const [low, high] = flightBand(game.stage);
  let nearestClear = [];
  for (const offset of turns) {
    const angle = preferred + offset;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const cross = angle + side * Math.PI * .69;
    const clear = [];
    const frontCounts = [0, 0];
    for (const [type, lateral, ahead, rise = 0, guard = false, wing = 0] of pack.slots) {
      const x = p.x + sin * ahead + cos * lateral * side;
      const z = p.z + cos * ahead - sin * lateral * side;
      if ((!game.exploring && (Math.abs(x) > 66 || Math.abs(z) > 66)) || game.onLand(x, z, .6)) continue;
      const profile = enemyProfile(type);
      const y = profile.habitat === 'sky' ? clamp(p.y + profile.height + rise, low, high) : profile.height;
      if (game.stage === 3 && game.terrainHeight && game.terrainHeight(x, z) + .82 > y) continue;
      clear.push({ type, x, y, z, rise, cross, guard, wing, flank: -Math.sign(lateral * side) });
      if (!guard) frontCounts[wing]++;
    }
    if (minimumFronts?.some((minimum, wing) => frontCounts[wing] < minimum)) continue;
    if (clear.length === pack.slots.length) return clear;
    if (clear.length > nearestClear.length) nearestClear = clear;
  }
  return nearestClear;
}

function arrivePack(game, wave) {
  const options = chapterPacks[game.stage];
  const index = game.chapterPack;
  const pack = options[index % options.length];
  const slots = packSlots(game, pack, (index + game.stage) % 2 === 0 ? 1 : -1);
  if (!slots.length) return false;
  const pincerSides = new Set();
  let count = 0;
  let shoalLead = null;
  for (const [position, { type, x, y, z, rise, cross, flank }] of slots.entries()) {
    const foe = game.spawnEnemy(type, x, z, y);
    if (!foe) break;
    foe.pack = pack.name;
    if (game.stage === 3) foe.flightPack = index;
    if (rise) foe.packFlight = { rise, until: game.time + 10 };
    if (type === pack.cross) {
      foe.angle = cross;
      foe.crossing = { angle: cross, until: game.time + 1.8 };
    }
    if(game.stage===0&&pack.name==='reed-shoal'&&type===pack.cross)shoalLead??=foe;
    if (type === pack.flank) {
      foe.flankSide = flank;
      // The first crab on each bank can commit. The rest keep roaming.
      if (!pincerSides.has(flank)) {
        foe.pincerReadyAt = game.time + .74 + pincerSides.size * .52;
        pincerSides.add(flank);
      }
    }
    count++;
    if (position === slots.length - 1 && wave >= 4) {
      foe.hp = foe.maxHp *= 1.25;
      foe.speed *= 1.15;
    }
  }
  if (!count) return false;
  if(shoalLead){
    shoalLead.dartRushReadyAt=game.time+1.9;
    shoalLead.hp=shoalLead.maxHp*=1.65;
  }
  game.chapterPack++;
  game.emit('horde', { wave, count, pack: pack.name });
  return true;
}

function arriveCascadeShoal(game, wave, formation) {
  const inSchool = game.enemies.filter(enemy => enemy.hp > 0 && enemy.cascadeShoal).length;
  if (inSchool >= 28 || game.enemies.length >= 72) return false;
  const index = game.chapterPack;
  const side = index % 2 === 0 ? 1 : -1;
  const airborne = game.stage === 3;
  const fronts = shoalPods[game.stage];
  const guardSlots = formation.guards.map((type, i) => [type, i ? 8.4 : -7.4, 10 + i * 2.4, airborne ? 1.2 - i * 2 : 0, true]);
  const schoolSlots = fronts.flatMap((pods, wing) => pods.flatMap(([lateral, ahead, height, size], pod) =>
    podMembers.slice(0, size).map(([dx, dz], member) => {
      const type = formation.prey[Number((wing || pod) && (member + pod + wing) % 4 === 0)];
      const rise = airborne ? height + (member % 2 === 0 ? .25 : -.25) - enemyProfile(type).height : 0;
      return [type, lateral + dx, ahead + dz, rise, false, wing];
    })
  ));
  const forward = fronts.length === 2 || Math.cos(game.p.angle) >= -.15
    ? game.p.angle : Math.sin(game.p.angle) < 0 ? -1.18 : 1.18;
  const slots = packSlots(game, {slots: [...schoolSlots, ...guardSlots]}, side, {
    forward, turns: fronts.length === 2 ? visibleShoalTurns : undefined,
    minimumFronts: fronts.length === 2 ? [7, 4] : [7],
  });
  if (!slots.length) return false;
  const wings = fronts.map((_, wing) => slots.filter(slot => !slot.guard && slot.wing === wing));

  const guards = slots.filter(slot => slot.guard);
  const reserve = Math.min(wings[1]?.length ?? 0, 6);
  const shoal = game.stage >= 2 ? [] : null;
  let schoolSize = inSchool;
  for (const [wing, members] of wings.entries()) {
    const front = wing === 0 ? [...members.slice(0, shoalEnemyLimit - schoolSize - reserve), ...guards] : members;
    let count = 0;
    let guardCount = 0;
    let center = null;
    for (const {type, x, y, z, rise, guard} of front) {
      if (!guard && schoolSize >= shoalEnemyLimit) break;
      const foe = game.spawnEnemy(type, x, z, y);
      if (!foe) break;
      foe.pack = formation.name;
      if (airborne) foe.packFlight = {rise, until: game.time + 8};
      if (guard) {
        foe.hp = foe.maxHp *= 1.2;
        foe.shootCD = 1.25 + guardCount * .65;
        if (airborne) foe.flightPack = index;
        guardCount++;
        continue;
      }
      foe.cascadeShoal = true;
      foe.cascadeShoalId = index;
      foe.shoalWing = wing;
      foe.hp = foe.maxHp *= wing === 0 ? formation.hp : Math.max(.78, formation.hp);
      foe.shootCD = Infinity;
      shoal?.push(foe);
      center ??= point(foe);
      count++;
      schoolSize++;
    }
    if (count) game.emit('horde', {wave, count, guards:guardCount, pack:formation.name, cascadeShoal:true,
      shoalId:index, reinforcement:wing > 0, ...center});
  }
  if (schoolSize === inSchool) return false;
  if (shoal) {
    game.shoalPatrol = {stage:game.stage, shoal, index, at:game.time, center:point(shoal[0]),
      spent:false, calmAt:0, holdUntil:0};
  }
  game.chapterPack++;
  return true;
}

function arriveShoalPatrol(game, wave, patrol) {
  if (patrol.spent || patrol.shoal.length < followShoalMinimum || game.time < patrol.at + 1.6 ||
      game.time > patrol.at + 8.6 || game.enemies.length >= 65) return;
  if (game.activeDragonArt || game.activeCascade) {
    patrol.calmAt = game.time + .48;
    return;
  }
  if (game.time < patrol.calmAt ||
      patrol.shoal.filter(enemy=>enemy.hp > 0).length > patrol.shoal.length * .43) return;
  const p = game.p;
  const nearby = game.enemiesNear(p, 16).filter(enemy=>enemy.hp > 0 && Math.abs(enemy.y - p.y) < 5).length;
  if (nearby > 20) return;
  const budget = nearby > 12 ? 5 : 6;

  const side = Math.sign(wrap(p.angle - heading(p,patrol.center))) || (patrol.index % 2 ? -1 : 1);
  const airborne = game.stage === 3;
  const pack = airborne ? highFlank : crossCurrent;
  const slots = packSlots(game, pack, side, {forward:p.angle + side * .54, turns:[0,-side*.22,side*.30,-side*.45]});
  if (slots.length < 4) return;
  let count = 0;
  for (const {type,x,y,z,rise} of slots.slice(0, budget)) {
    const foe = game.spawnEnemy(type,x,z,y);
    if (!foe) break;
    foe.pack = pack.name;
    foe.shootCD = .88 + count * .31;
    if (airborne) {
      foe.packFlight = {rise, until:game.time + 4.5};
      foe.flightPack = patrol.index;
    }
    count++;
  }
  if (!count) return;
  patrol.spent = true;
  // Bring ordinary wildlife forward as a group and pay it back on the roaming clock.
  if (game.shoalSpawnDebt?.stage !== game.stage) game.shoalSpawnDebt = {stage:game.stage, left:0};
  game.shoalSpawnDebt.left += count;
  game.hordeCD = Math.max(game.hordeCD, 1.15);
  game.emit('horde', {wave, count, pack:pack.name, patrol:true, reinforcement:true,
    fromShoal:patrol.index, ...point(slots[0])});
}

export function updateEnemySpawns(game, dt) {
  if (game.practice||game.drill||game.stage>=4) return;
  const wave=game.cultivation.wave;
  const duration=waveDuration(game.stage,wave);
  const developed = game.cultivation.cascade || game.stage>=2 && game.cultivation.dragonArt;
  const shoal = developed ? cascadeShoals[game.stage] : null;
  const patrol = shoal && game.shoalPatrol?.stage === game.stage ? game.shoalPatrol : null;
  if (shoal && !game.boss && game.cascadeShoalStage !== game.stage) {
    game.cascadeShoalStage = game.stage;
    game.hordeCD = Math.min(game.hordeCD, 1.1);
  }
  const pressure=backgroundPressure[game.stage];
  const progress=clamp(game.waveTime/duration,0,1)*(pressure.length-1);
  const left=Math.floor(progress), right=Math.min(left+1,pressure.length-1);
  const tempo=pressure[left]+(pressure[right]-pressure[left])*(progress-left);
  // Leave space around the boss's openings, even during a chapter's high tide.
  const bossRelief=game.boss?.bossPlan?.phase==='recovery' ? .53 : game.boss ? .79 : 1;
  game.spawnCD -= dt;
  if (game.spawnCD <= 0) {
    const base=1.38+game.stage*1.09+Math.min(1.5,(wave-1)*.18);
    game.spawnCD=1/(base*tempo*bossRelief);
    if(game.stage===0&&game.openingHunt&&!game.boss){
      game.openingHunt=false;
      const slots=packSlots(game,openingShoal,1);
      if(slots.length)for(const {type,x,y,z} of slots)game.spawnEnemy(type,x,z,y);
      else game.spawnEnemy();
    }else if (!shoal || game.enemies.length < 72) {
      const debt = game.shoalSpawnDebt;
      if (debt?.stage === game.stage && debt.left > 0) debt.left--;
      else game.spawnEnemy();
    }
  }
  if (game.stage === 3) chooseMountainDive(game, dt);
  if (game.boss) return;
  if (patrol) arriveShoalPatrol(game,wave,patrol);
  game.hordeCD -= dt;
  if (game.hordeCD > 0) return;
  if (shoal) {
    // A late full shoal should not enter the final blows of the one the
    // player is fighting. Background wildlife and boss pressure still update.
    const art = game.activeDragonArt, cascade = game.activeCascade;
    const clearing = art && (art.killCount >= 6 || art.age >= .6 && patrol?.spent) ||
      cascade && (cascade.kills >= 6 || game.time - cascade.started >= .6 && patrol?.spent);
    if (patrol && clearing) {
      patrol.holdUntil ||= game.time + 1.55;
      if (game.time < patrol.holdUntil) return;
    }
    const arrived = arriveCascadeShoal(game, wave, shoal);
    if (!arrived && patrol) patrol.holdUntil = 0;
    game.hordeCD = arrived ? shoal.interval : 1.65;
    if (arrived) game.spawnCD = Math.max(game.spawnCD, 1.5);
    return;
  }
  // Give the group a clear arrival and then return to the ordinary roaming spawn.
  if (arrivePack(game, wave)) {
    game.hordeCD = Math.max(12, duration * .78);
    game.spawnCD = Math.max(game.spawnCD, 1.65);
  } else game.hordeCD = 1.65;
}

function segmentDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) /
    Math.max(.00001, lengthSquared), 0, 1);
  return Math.hypot(point.x - from.x - dx * t, point.y - from.y - dy * t, point.z - from.z - dz * t);
}

function shot(game, enemy, { angle, y = enemy.y, speed, lift = 0, damage, radius = .30, attack, layer }) {
  game.hazards.push({
    id: game.nextId++, x: enemy.x, y, z: enemy.z, vx: Math.sin(angle) * speed,
    vy: lift, vz: Math.cos(angle) * speed, life: 6.3, radius, damage,
    bossId: enemy.boss ? enemy.id : undefined, sourceType: enemy.type, attack, layer,
  });
}

function pointOnBankClearLane(game, from, to, padding) {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(length / .38));
  let last = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sample = { x: from.x + (to.x - from.x) * t, y: to.y, z: from.z + (to.z - from.z) * t };
    if ((!game.exploring && (Math.abs(sample.x) > 66 || Math.abs(sample.z) > 66)) || game.onLand(sample.x, sample.z, padding)) break;
    last = sample;
  }
  return last;
}

function phaseEvent(game, enemy, plan) {
  game.emit('bossPhase', {
    stage: game.stage, bossId: enemy.id, attack: plan.definition.name, phase: plan.phase,
    duration: plan.remaining, ...point(enemy),
    ...(plan.definition.name==='lantern-pulse'&&plan.phase==='windup'?{gap:plan.gap}:{}),
  });
}

function chargeLane(game, enemy, target, angle) {
  const length = clamp(Math.hypot(target.x - enemy.x, target.z - enemy.z) + 2, 4.4, 11.8);
  const from = point(enemy);
  const desired = { ...from };
  moveAngle(desired, angle, length);
  const to = pointOnBankClearLane(game, from, desired, 1);
  return { from, to, width: 1.48 };
}

function mark(game, enemy, definition, center, radius, delay = 0, surface = false, fields) {
  const life = definition.windup + delay;
  const warning = {
    ...center, radius, life, maxLife: life, resolveAt: game.time + life,
    id: game.nextId++, warning: true, bossId: enemy.id, attack: definition.name, surface,
    ...fields,
  };
  game.hazards.push(warning);
  return warning.id;
}

function canSkyCross(enemy, attackIndex = enemy.attackIndex ?? 0) {
  return enemy.hp <= enemy.maxHp * .52 && attackIndex >= (enemy.nextSkyCross ?? 0);
}

function startBossAttack(game, enemy) {
  const moves = BOSS_ATTACKS[game.stage];
  if (!moves) return;
  const attackIndex = enemy.attackIndex ?? 0;
  let definition = moves[attackIndex % moves.length];
  enemy.attackIndex = attackIndex + 1;
  const p = game.p;
  if (game.stage === 2 && enemy.hp <= enemy.maxHp * .56
    && attackIndex >= (enemy.nextBackwash ?? 0) && Math.hypot(p.x - enemy.x, p.z - enemy.z) < 11.6) {
    definition = shellBackwash;
    enemy.nextBackwash = attackIndex + 3;
  }
  if(game.stage===3&&canSkyCross(enemy,attackIndex)){
    definition=skyCross;
    enemy.nextSkyCross=attackIndex+3;
  }
  const angle = heading(enemy, p);
  const lane = definition.name === 'crab-charge' ? chargeLane(game, enemy, p, angle) : null;
  if (lane && distance(lane.from, lane.to) < 2.8) definition = moves[1];
  const plan = {
    definition, phase: 'windup', remaining: definition.windup, angle,
    target: point(p), hit: false,
  };
  enemy.bossPlan = plan;
  const hazardIds = [];
  switch (definition.name) {
    case 'crab-charge': {
      Object.assign(plan, lane);
      enemy.lungeWindup = definition.windup;
      enemy.lungeX = Math.sin(plan.angle);
      enemy.lungeZ = Math.cos(plan.angle);
      game.emit('bossCharge', {
        stage: game.stage, bossId: enemy.id, attack: definition.name, duration: definition.windup, width: plan.width,
        from: { ...plan.from, y: .15 }, to: { ...plan.to, y: .15 },
      });
      break;
    }
    case 'claw-stamp':
      hazardIds.push(mark(game, enemy, definition, plan.target, 2.95, 0, true));
      break;
    case 'lantern-pulse': {
      plan.gap = plan.angle + (attackIndex % 4 === 0 ? 1.02 : -1.02);
      const center=point(enemy);
      hazardIds.push(mark(game,enemy,definition,center,lanternWave.radius,0,true,
        {...lanternWave,gap:plan.gap,previewOnly:true}));
      break;
    }
    case 'shell-breaker':
      enemy.shield = true;
      for (const side of [-1, 1]) {
        const center = { ...plan.target, y: .70 };
        moveAngle(center, plan.angle + side * Math.PI / 2, 1.65);
        hazardIds.push(mark(game, enemy, definition, center, 2.55, side === 1 ? .24 : 0, true));
      }
      break;
    case 'shell-backwash':
      enemy.shield = true;
      plan.center = { ...point(enemy), y: .76 };
      hazardIds.push(mark(game, enemy, definition, plan.center, backwashField.radius, 0, true, {
        ...backwashField, previewOnly: true,
      }));
      break;
    case 'starfall':
      for (let index = 0; index < 3; index++) {
        const offset = index - 1;
        const center = { ...plan.target, y: clamp(p.y + offset * 1.65, 3.5, 20) };
        moveAngle(center, p.angle, offset * 2.72);
        hazardIds.push(mark(game, enemy, definition, center, index === 1 ? 2.75 : 2.55, index * .25));
      }
      break;
    case 'sky-cross': {
      // Two fixed levels bracket the locked altitude. Travel through the
      // middle or take the fight beyond their shared horizontal footprint.
      const [floor,ceiling]=flightBand(game.stage);
      const middle=clamp(p.y,floor+2.35,ceiling-2.35);
      for(const [layer,offset,delay] of [['low',-2.35,0],['high',2.35,.47]]){
        const center={...plan.target,y:middle+offset};
        hazardIds.push(mark(game,enemy,definition,center,1.86,delay,false,{layer,damage:43}));
      }
      break;
    }
  }
  phaseEvent(game, enemy, plan);
  game.emit('warning', {
    stage: game.stage, bossId: enemy.id, attack: definition.name, duration: definition.windup,
    hazardIds, ...point(enemy),
  });
}

function fan(game, enemy, plan, count, spread, speed, height, damage, shift = 0, layer) {
  const attack = plan.definition.name;
  for (let i = 0; i < count; i++) {
    const angle = plan.angle + shift + (i / (count - 1) - .5) * spread;
    shot(game, enemy, { angle, y: height, speed, damage, attack, layer });
  }
}

function releaseBossWave(game, enemy, plan, center, field) {
  const life = plan.definition.active;
  const wave = {
    ...center, id: game.nextId++, wave: true, age: 0, life, maxLife: life,
    attack: plan.definition.name, bossId: enemy.id, hit: false, ...field,
  };
  game.hazards.push(wave);
  const { startRadius, radius, gap, gapWidth, halfWidth } = wave;
  game.emit('bossWave', {
    ...center, gap, gapWidth, radius, startRadius, life, halfWidth,
    attack: wave.attack, bossId: enemy.id, stage: game.stage,
  });
}

function startBossRelease(game, enemy, plan) {
  plan.phase = 'active';
  plan.remaining = plan.definition.active;
  phaseEvent(game, enemy, plan);
  switch (plan.definition.name) {
    case 'crab-charge':
      enemy.lungeWindup = 0;
      enemy.lunge = plan.remaining;
      break;
    case 'lantern-pulse':
      releaseBossWave(game,enemy,plan,point(enemy),{...lanternWave,gap:plan.gap});
      break;
    case 'lantern-fan':
      fan(game, enemy, plan, 4, .55, 4.7, enemy.y, 16, -.64);
      fan(game, enemy, plan, 4, .55, 4.7, enemy.y, 16, .64);
      break;
    case 'shell-fan':
      fan(game, enemy, plan, 7, 1.56, 4.9, .80, 22);
      break;
    case 'shell-backwash':
      releaseBossWave(game, enemy, plan, plan.center, { ...backwashField, gap: 0, gapWidth: 0, damage: 30 });
      break;
    case 'sky-salvo': {
      const low = clamp(plan.target.y - 1.65, 3.5, 20);
      const high = clamp(plan.target.y + 1.65, 3.5, 20);
      fan(game, enemy, plan, 5, 1.22, 5.8, low, 24, -.27, 'low');
      fan(game, enemy, plan, 4, 1.06, 5.4, high, 24, .29, 'high');
      break;
    }
  }
}

function startBossRecovery(game, enemy, plan) {
  plan.phase = 'recovery';
  plan.remaining = plan.definition.recovery;
  enemy.shield = false;
  enemy.lunge = 0;
  phaseEvent(game, enemy, plan);
}

function steerBossAroundBank(game,enemy,angle,dt){
  const from=point(enemy),desired={...from};
  moveAngle(desired,angle,2.6);
  if(distance(from,pointOnBankClearLane(game,from,desired,1))>2.25){
    enemy.bankSide=0;
    moveAngle(enemy,angle,enemy.speed*dt);
    return;
  }
  let best=null,score=Infinity;
  for(const turn of [.54,1.02,1.49,1.90,2.35,2.78,Math.PI])for(const side of [-1,1]){
    const heading=angle+side*turn;
    const candidate={...from};
    moveAngle(candidate,heading,2.6);
    const end=pointOnBankClearLane(game,from,candidate,1);
    const reach=distance(from,end);
    if(reach<.30)continue;
    const cost=distance(end,game.p)+(2.6-reach)*.82+(enemy.bankSide&&enemy.bankSide!==side?1.05:0);
    if(cost<score){best={heading,side};score=cost;}
  }
  if(best){
    enemy.bankSide=best.side;
    turn(enemy,best.heading,dt,3.2);
    moveAngle(enemy,best.heading,enemy.speed*dt);
  }else enemy.bankSide ||= 1;
}

function updateBoss(game, enemy, dt) {
  if (updateFrontierBoss(game, enemy)) return true;
  const plan = enemy.bossPlan;
  if (!plan) {
    const separation = Math.hypot(game.p.x - enemy.x, game.p.z - enemy.z);
    enemy.attack -= dt;
    const reposition=game.stage===0&&game.shoreHeight&&separation>9.5&&enemy.bankSide;
    if (enemy.attack <= 0) {
      if(!reposition){startBossAttack(game,enemy);return true;}
      enemy.attack=.28;
    }
    const angle = heading(enemy, game.p);
    turn(enemy, angle, dt, game.stage === 0 ? 2.9 : 8);
    if(separation>6.2){
      if(game.shoreHeight)steerBossAroundBank(game,enemy,angle,dt);
      else moveAngle(enemy,angle,enemy.speed*dt);
    }
    if (game.stage === 3) enemy.y += (game.p.y - enemy.y) * Math.min(1, dt * .72);
    if (game.stage === 2) enemy.y += (1.04 - enemy.y) * Math.min(1, dt * 1.8);
    return false;
  }

  if (plan.phase === 'windup') {
    turn(enemy, plan.angle, dt);
    plan.remaining = Math.max(0, plan.remaining - dt);
    if (plan.definition.name === 'crab-charge') enemy.lungeWindup = plan.remaining;
    if (plan.remaining <= 1e-6) startBossRelease(game, enemy, plan);
    return true;
  }

  const previous = plan.remaining;
  plan.remaining = Math.max(0, previous - dt);
  if (plan.phase === 'active') {
    if (plan.definition.name === 'crab-charge') {
      const t = 1 - plan.remaining / plan.definition.active;
      const before = point(enemy);
      enemy.x = plan.from.x + (plan.to.x - plan.from.x) * t;
      enemy.z = plan.from.z + (plan.to.z - plan.from.z) * t;
      enemy.lunge = plan.remaining;
      if (!plan.hit && segmentDistance(game.p, before, enemy) < plan.width) {
        plan.hit = true;
        game.hurt(25);
      }
    }
    if (plan.remaining <= 1e-6) startBossRecovery(game, enemy, plan);
    return true;
  }

  if (plan.remaining <= 1e-6) {
    enemy.bossPlan = null;
    enemy.attack = plan.definition.rest;
  }
  return true;
}

function clearFlightPath(game, from, to) {
  if (!game.terrainHeight) return true;
  const steps = Math.max(8, Math.ceil(distance(from, to) / .56));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const y = from.y + (to.y - from.y) * t;
    if (game.terrainHeight(x, z) + .86 > y) return false;
  }
  return true;
}

function findCloudPass(game, kite) {
  if (kite.flightPack == null) return null;
  const p = game.p;
  const height = p.y - 1.55;
  if (height < flightBand(game.stage)[0] + .32) return null;
  const approach = heading(p, kite);
  let selected = null;
  let best = 11.1;
  for (const escort of game.enemiesNear(p,11.1)) {
    if (escort.type !== cloudRay || escort.flightPack !== kite.flightPack || escort.hp <= 0 || escort.cloudPass) continue;
    if (game.time - (escort.lastRangedShotAt ?? -Infinity) < 1.1 || Math.abs(escort.y - height) > 3.8) continue;
    const gap = Math.hypot(escort.x - p.x, escort.z - p.z);
    if (gap < 3 || gap >= best || Math.abs(Math.sin(heading(p, escort) - approach)) < .48) continue;
    const from = { ...point(escort), y: height };
    const to = { ...point(p), y: height };
    const angle = heading(from, to);
    moveAngle(to, angle, .95);
    if (!clearFlightPath(game, from, to)) continue;
    best = gap;
    selected = { escort, from, to, angle };
  }
  return selected;
}

function startCloudPass(kite, dive, selected) {
  const { escort, from, to, angle } = selected;
  escort.shootCD = enemyProfile(escort.type).cooldown;
  escort.cloudPass = {
    from, to, angle, initialHeight: escort.y, leadId: kite.id,
    releaseAt: dive.releaseAt + dive.duration + .16, phase: 'waiting', hit: false,
  };
  dive.recoverUntil = escort.cloudPass.releaseAt + CLOUD_PASS.active + CLOUD_PASS.recovery;
}

function cloudPassPhase(game, enemy, pass, phase) {
  pass.phase = phase;
  game.emit('cloudPassPhase', {
    enemyId: enemy.id, leadId: pass.leadId, phase, duration: CLOUD_PASS[phase],
    from: pass.from, to: pass.to, width: CLOUD_PASS.width, ...point(enemy),
  });
}

function updateCloudPass(game, enemy, dt) {
  const { windup, active, recovery, width } = CLOUD_PASS;
  const pass = enemy.cloudPass;
  const elapsed = game.time - pass.releaseAt;
  if (elapsed < 0) {
    if (!game.enemies.some(lead => lead.id === pass.leadId && lead.hp > 0)) {
      enemy.cloudPass = null;
      return false;
    }
    if (elapsed >= -windup) {
      if (pass.phase === 'waiting') cloudPassPhase(game, enemy, pass, 'windup');
      const settle = clamp(1 + elapsed / windup, 0, 1);
      enemy.y = pass.initialHeight + (pass.from.y - pass.initialHeight) * settle;
      turn(enemy, pass.angle, dt, 9);
    }
    return true;
  }
  if (pass.phase !== 'recovery') {
    if (pass.phase !== 'active') cloudPassPhase(game, enemy, pass, 'active');
    const t = clamp(elapsed / active, 0, 1);
    const before = point(enemy);
    enemy.x = pass.from.x + (pass.to.x - pass.from.x) * t;
    enemy.y = pass.from.y;
    enemy.z = pass.from.z + (pass.to.z - pass.from.z) * t;
    turn(enemy, pass.angle, dt, 16);
    if (!pass.hit && segmentDistance(game.p, before, enemy) < width) {
      pass.hit = true;
      game.hurt(13, game.p);
    }
    if (t >= 1) cloudPassPhase(game, enemy, pass, 'recovery');
    return true;
  }
  if (elapsed >= active + recovery) enemy.cloudPass = null;
  return true;
}

const DIVE_WINDUP = .66;
const DIVE_DURATION = .48;

function diveRange(game, enemy) {
  const p = game.p;
  const distance = Math.hypot(p.x - enemy.x, p.z - enemy.z);
  return distance >= 2.65 && distance <= 11.4 && Math.abs(enemy.y - p.y) <= 6.1;
}

function divePlan(game, enemy) {
  const from = point(enemy);
  const to = point(game.p);
  moveAngle(to, heading(enemy, game.p), 1.15);
  if (!clearFlightPath(game, from, to)) return null;
  return { from, to, releaseAt: game.time + DIVE_WINDUP, duration: DIVE_DURATION, width: .86, hit: false };
}

function chooseMountainDive(game, dt) {
  const boss = game.boss;
  const plan = boss?.bossPlan;
  const crossPending = boss && !plan && boss.attack <= dt && canSkyCross(boss);
  const crossActive = plan?.definition.name === 'sky-cross' && plan.phase !== 'recovery';
  if (crossPending || crossActive) return;
  if (game.time < (game.nextMountainDiveAt ?? 0)) return;
  const limit = boss ? 2 : 3;
  const active = game.enemies.reduce((count, enemy) => count + Number(enemy.hp > 0 &&
    Boolean(enemy.dive || enemy.cloudPass && enemy.cloudPass.phase !== 'recovery')), 0);
  if (active >= limit) return;

  let selected = null;
  for (const enemy of game.enemies) {
    if (enemy.type !== kite || enemy.hp <= 0 || enemy.speed <= 0 || enemy.weaponPush ||
        enemy.dive || enemy.diveExit || enemy.shootCD > dt || !diveRange(game, enemy)) {
      delete enemy.diveReadySince;
      continue;
    }
    const dive = divePlan(game, enemy);
    if (!dive) {
      delete enemy.diveReadySince;
      enemy.shootCD = 1.2;
      continue;
    }
    enemy.diveReadySince ??= game.time;
    const escort = active + 2 <= limit ? findCloudPass(game, enemy) : null;
    // Pairing can move ahead by one beat. Time spent in a valid position
    // keeps a waiting ordinary bird from losing every turn to new pairs.
    const score = game.time - enemy.diveReadySince + (escort ? .85 : 0);
    if (!selected || score > selected.score || score === selected.score && enemy.id < selected.enemy.id) {
      selected = { enemy, dive, escort, score };
    }
  }
  if (!selected) return;

  const { enemy, dive, escort } = selected;
  delete enemy.diveReadySince;
  enemy.shootCD = enemyProfile(kite).cooldown;
  enemy.dive = dive;
  dive.paired = Boolean(escort);
  if (escort) startCloudPass(enemy, dive, escort);
  game.nextMountainDiveAt = escort
    ? escort.escort.cloudPass.releaseAt + CLOUD_PASS.active + .18
    : game.time + DIVE_WINDUP + (game.boss ? .31 : .16);
  game.emit('bossCharge', {
    stage: game.stage, enemyId: enemy.id, attack: 'kite-dive',
    from: dive.from, to: dive.to, duration: DIVE_WINDUP, width: dive.width,
  });
}

function updateDiver(game, enemy, dt) {
  const p = game.p;
  if (enemy.dive) {
    const dive = enemy.dive;
    const progress = clamp((game.time - dive.releaseAt) / dive.duration, 0, 1);
    dive.active = progress > 0;
    if (progress > 0) {
      const before = point(enemy);
      enemy.x = dive.from.x + (dive.to.x - dive.from.x) * progress;
      enemy.y = dive.from.y + (dive.to.y - dive.from.y) * progress;
      enemy.z = dive.from.z + (dive.to.z - dive.from.z) * progress;
      if (!dive.hit && segmentDistance(p, before, enemy) < dive.width) {
        dive.hit = true;
        game.hurt(17);
      }
    }
    if (progress >= 1) {
      if (dive.paired) enemy.diveExit = { until: dive.recoverUntil, angle: heading(dive.from, dive.to) };
      enemy.dive = null;
    }
    return true;
  }
  if (enemy.diveExit) {
    if (game.time < enemy.diveExit.until) {
      turn(enemy, enemy.diveExit.angle, dt);
      moveAngle(enemy, enemy.diveExit.angle, enemy.speed * .54 * dt);
      return true;
    }
    enemy.diveExit = null;
  }
  enemy.shootCD = Math.max(0, enemy.shootCD - dt);
  if (!diveRange(game, enemy)) delete enemy.diveReadySince;
  return false;
}

function pincerPhase(game, enemy, plan, phase) {
  plan.phase = phase;
  game.emit('pincerPhase', {
    enemyId: enemy.id, phase, duration: CRAB_PINCER[phase], from: plan.from, to: plan.to,
    width: CRAB_PINCER.width, side: plan.side, ...point(enemy),
  });
}

const laneActive=enemy=>enemy.hp>0&&((enemy.pincer&&enemy.pincer.phase!=='recovery')||
  (enemy.dartRush&&enemy.dartRush.phase!=='recovery'));

function updatePincer(game, enemy, dt, angle, separation) {
  const { windup, active, recovery, width } = CRAB_PINCER;
  const plan = enemy.pincer;
  if (!plan) {
    if (game.time < enemy.pincerReadyAt || separation > 3.25 || separation < .62) return false;
    if (game.enemies.some(laneActive)) return false;
    const from = point(enemy);
    const desired = { ...from };
    moveAngle(desired, angle, clamp(separation + .34, 1.7, 3.48));
    const to = pointOnBankClearLane(game, from, desired, .46);
    if (distance(from, to) < Math.max(1.2, separation - width * .8)) {
      enemy.pincerReadyAt = game.time + .35;
      return false;
    }
    enemy.pincer = { from, to, angle, side: enemy.flankSide, releaseAt: game.time + windup, hit: false };
    pincerPhase(game, enemy, enemy.pincer, 'windup');
    return true;
  }
  const elapsed = game.time - plan.releaseAt;
  if (elapsed < 0) {
    turn(enemy, plan.angle - plan.side * .53, dt, 13);
    return true;
  }
  if (plan.phase !== 'recovery') {
    if (plan.phase === 'windup') pincerPhase(game, enemy, plan, 'active');
    const progress = clamp(elapsed / active, 0, 1);
    const before = point(enemy);
    enemy.x = plan.from.x + (plan.to.x - plan.from.x) * progress;
    enemy.z = plan.from.z + (plan.to.z - plan.from.z) * progress;
    turn(enemy, plan.angle, dt, 20);
    if (!plan.hit && segmentDistance(game.p, before, enemy) < width) {
      plan.hit = true;
      game.hurt(10, game.p);
    }
    if (progress >= 1) pincerPhase(game, enemy, plan, 'recovery');
    return true;
  }
  const retreat = clamp((elapsed - active) / recovery, 0, 1) * .24;
  enemy.x = plan.to.x + (plan.from.x - plan.to.x) * retreat;
  enemy.z = plan.to.z + (plan.from.z - plan.to.z) * retreat;
  if (elapsed >= active + recovery) {
    enemy.pincer = null;
    enemy.pincerReadyAt = game.time + 2.35;
  }
  return true;
}

function dartRushPhase(game, enemy, rush, phase) {
  rush.phase=phase;
  game.emit('dartRushPhase', {enemyId:enemy.id, phase, duration:DART_RUSH[phase],
    from:rush.from, to:rush.to, width:DART_RUSH.width, ...point(enemy)});
}

function updateDartRush(game,enemy,dt,angle,separation) {
  const {windup,active,recovery,width}=DART_RUSH;
  const rush=enemy.dartRush;
  if(!rush){
    if(game.time<enemy.dartRushReadyAt||separation<2.1||separation>4.25)return false;
    if(game.enemies.some(laneActive))return false;
    const from=point(enemy),desired={...from};
    moveAngle(desired,angle,separation+.40);
    const to=pointOnBankClearLane(game,from,desired,.42);
    if(distance(from,to)<separation+.09){enemy.dartRushReadyAt=game.time+.28;return false;}
    enemy.dartRush={from,to,angle,releaseAt:game.time+windup,hit:false};
    dartRushPhase(game,enemy,enemy.dartRush,'windup');
    return true;
  }
  const elapsed=game.time-rush.releaseAt;
  if(elapsed<0){turn(enemy,rush.angle,dt,14);return true;}
  if(rush.phase!=='recovery'){
    if(rush.phase==='windup')dartRushPhase(game,enemy,rush,'active');
    const t=clamp(elapsed/active,0,1);
    const from=point(enemy);
    enemy.x=rush.from.x+(rush.to.x-rush.from.x)*t;
    enemy.z=rush.from.z+(rush.to.z-rush.from.z)*t;
    if(!rush.hit&&segmentDistance(game.p,from,enemy)<width){rush.hit=true;game.hurt(13,game.p);}
    if(t>=1)dartRushPhase(game,enemy,rush,'recovery');
    return true;
  }
  if(elapsed>=active+recovery){enemy.dartRush=null;enemy.dartRushReadyAt=game.time+2.4;}
  return true;
}

function updateRegular(game, enemy, dt) {
  const profile = enemyProfile(enemy.type);
  const p = game.p;
  const angle = heading(enemy, p);
  const separation = Math.hypot(p.x - enemy.x, p.z - enemy.z);
  if(game.drill&&paceSeaDrillEnemy(game,enemy,dt,angle,separation))return false;
  if(enemy.wildRetreat?.until>game.time){
    turn(enemy,enemy.wildRetreat.angle,dt,9);
    moveAngle(enemy,enemy.angle,enemy.speed*dt);
    return true;
  }
  const route = game.endingRoute;
  const marker = game.stage === 3 ? route?.mountainStrike
    : game.stage === 2 && route?.seaReady ? ENDING_ROUTE_SITES.sea : null;
  if (marker && !laneActive(enemy) && !enemy.dive && !enemy.cloudPass) {
    const dx = enemy.x - marker.x, dz = enemy.z - marker.z;
    const reach = game.stage === 3 ? 7.8 : 6.6;
    if (dx * dx + dz * dz < reach * reach && Math.abs(enemy.y - marker.y) < 6.4) {
      // Wildlife turns away from the charged water or thunder before new
      // attacks start. Existing attack paths still finish normally.
      const retreat = Math.atan2(dx, dz) + .34 * (enemy.flankSide ?? 1);
      turn(enemy, retreat, dt, 10);
      moveAngle(enemy, enemy.angle, enemy.speed * 1.75 * dt);
      return true;
    }
  }
  const canPincer = enemy.pincerReadyAt != null;
  if (canPincer && updatePincer(game, enemy, dt, angle, separation)) return true;
  if(enemy.dartRushReadyAt!=null&&updateDartRush(game,enemy,dt,angle,separation))return true;
  if (enemy.cloudPass && updateCloudPass(game, enemy, dt)) return true;
  if (enemy.crossing?.until > game.time && separation > 4.6) {
    moveAngle(enemy, enemy.crossing.angle, enemy.speed * dt);
    return false;
  }
  const side = enemy.flankSide ?? (Math.sin(enemy.phase) < 0 ? -1 : 1);
  const wave = Math.sin(game.time * 2.3 + enemy.phase);
  turn(enemy, angle, dt);
  if (profile.role === 'diver' && updateDiver(game, enemy, dt)) return true;

  if (profile.hold) {
    const radial = separation > profile.hold + 1 ? 1 : separation < profile.hold - 1.25 ? -.62 : 0;
    moveAngle(enemy, angle, enemy.speed * radial * dt);
    moveAngle(enemy, angle + side * Math.PI / 2, enemy.speed * (profile.habitat === 'sky' ? .67 : .38) * dt);
  } else if (separation > .6) {
    const bias = profile.role === 'flanker' ? side * .38 : wave * .20;
    const surge = profile.role === 'surge' && separation < 7.2 ?
      1 + 1.08 * Math.max(0, Math.sin(game.time * 1.58 + enemy.phase)) ** 3 : 1;
    moveAngle(enemy, angle + bias, enemy.speed * surge * dt);
  }

  if (profile.habitat === 'sky' || game.stage === 2) {
    const [low, high] = flightBand(game.stage);
    const band = enemy.packFlight;
    const rise = band ? band.rise * clamp((band.until - game.time) / 3, 0, 1) : 0;
    const height = profile.habitat === 'sky' ? p.y + profile.height + rise + wave * .64 : profile.height + wave * .22;
    enemy.y += (clamp(height, low, high) - enemy.y) * Math.min(1, dt * 1.45);
  }

  if (['lobber', 'escort', 'skimmer'].includes(profile.role)) {
    enemy.shootCD -= dt * (enemy.wonderHaste ?? 1);
    if (enemy.shootCD <= 0 && separation < RANGED_SHOT_RANGE) {
      enemy.shootCD = profile.cooldown;
      enemy.lastRangedShotAt = game.time;
      if (profile.role === 'escort') {
        for (const split of [-1, 1]) {
          shot(game, enemy, {
            angle: angle + split * .13, y: enemy.y + split * .54, speed: 4.85,
            lift: clamp((p.y - enemy.y) / Math.max(3, separation), -.44, .44),
            damage: 16, radius: .27, attack: 'cloud-fan',
          });
        }
      } else {
        const speed = profile.role === 'skimmer' ? 4.9 : 3.85;
        shot(game, enemy, { angle, y: game.stage === 2 ? .85 : enemy.y, speed,
          damage: game.stage === 2 ? 15 : 13, radius: .29, attack: 'surface-spit' });
      }
    }
  }
  return canPincer;
}

export function canDisplaceEnemy(enemy, time) {
  return enemy.hp>0&&!enemy.boss&&!(enemy.dragonArtHeldUntil>time)&&
    !enemy.pincer&&!enemy.dartRush&&!enemy.cloudPass&&!enemy.dive&&!enemy.diveExit;
}

export function knockBackEnemy(game, enemy, origin, kind, tier) {
  if(!canDisplaceEnemy(enemy,game.time)||game.time-(enemy.lastWeaponPush??-Infinity)<.44)return;
  const x=enemy.x-origin.x,z=enemy.z-origin.z;
  const distance=Math.hypot(x,z);
  if(distance<.08)return;
  const tail=kind==='tail',wet=tail&&enemy.wet>0;
  const duration=tail?(wet?.33:.24):.13;
  const speed=(tail?(wet?8.1:6.1):3.6)*(1+.08*(tier-1));
  enemy.weaponPush={x:x/distance*speed,z:z/distance*speed,remaining:duration,duration};
  enemy.lastWeaponPush=game.time;
  return true;
}

export function updateEnemy(game, enemy, dt, playerDamage) {
  if (enemy.hp <= 0) return;
  const before = point(enemy);
  enemy.hit = Math.max(0, enemy.hit - dt);
  const held = !enemy.boss && enemy.dragonArtHeldUntil > game.time;
  let customContact=held;
  const push=enemy.weaponPush;
  if(!held&&push){
    const elapsed=Math.min(dt,push.remaining);
    const distance=elapsed*(push.remaining-elapsed*.5)/push.duration;
    enemy.x+=push.x*distance;enemy.z+=push.z*distance;
    push.remaining-=elapsed;
    if(push.remaining<=1e-6)enemy.weaponPush=null;
  }else if(!held)customContact=enemy.boss?updateBoss(game,enemy,dt):
    updateRegular(game,enemy,dt*techniqueSlowFactor(enemy,game.time));
  game.stayInWater(enemy, enemy.boss ? 1 : .4, before);
  if (!customContact && game.p.invul <= 0) {
    let contact = distanceSquared(enemy, game.p) < (enemy.radius + .65) ** 2 ? game.p : null;
    if (!contact) for (let i = 4; i < game.bodyPath.length; i += 3) {
      if (distanceSquared(enemy, game.bodyPath[i]) < (enemy.radius + .38) ** 2) {
        contact = game.bodyPath[i];
        break;
      }
    }
    if (contact) game.hurt((enemy.boss ? 24 : 8) * (1 + game.stage * .65) * (contact === game.p ? 1 : .65), contact);
  }
  enemy.wet = Math.max(0, enemy.wet - dt);
  enemy.poison = Math.max(0, enemy.poison - dt);
  enemy.burn = Math.max(0, enemy.burn - dt);
  enemy.charge = Math.max(0, enemy.charge - dt);
  enemy.dotCD -= dt;
  if (enemy.dotCD <= 0) {
    enemy.dotCD = .5;
    if (enemy.poison > 0 || enemy.burn > 0) {
      game.damage(enemy, playerDamage * .15 * (enemy.poison > 0 && enemy.burn > 0 ? 1.5 : 1),
        enemy.burn > 0 ? 'fire' : 'poison');
    }
  }
}

function updateWave(game, wave, dt) {
  const before = lerpRadius(wave, wave.age / wave.maxLife);
  wave.age = Math.min(wave.maxLife, wave.age + dt);
  const after = lerpRadius(wave, wave.age / wave.maxLife);
  const p = game.p;
  const distance = Math.hypot(p.x - wave.x, p.z - wave.z);
  const inGap = Math.abs(wrap(heading(wave, p) - wave.gap)) < wave.gapWidth * .5;
  const halfWidth = wave.halfWidth ?? .42;
  if (!wave.hit && !inGap && distance >= before - halfWidth && distance <= after + halfWidth && Math.abs(p.y - wave.y) < 1.0) {
    wave.hit = true;
    if (wave.attack==='shell-backwash'||wave.attack==='lantern-pulse') {
      if (p.invul <= 0 && game.status === 'playing') {
        game.emit('hazardImpact', {
          id: wave.id, x: p.x, y: wave.y, z: p.z, radius: halfWidth,
          stage: game.stage, attack: wave.attack, bossId: wave.bossId, hit: true, inside: true, surface: true,
        });
      }
      game.hurt(wave.damage, p);
    }else game.hurt(wave.damage);
  }
}

function lerpRadius(wave, t) {
  return wave.startRadius + (wave.radius - wave.startRadius) * t;
}

function resolveMark(game, hazard) {
  const p = game.p;
  const surface = hazard.surface === true;
  const inside = surface ?
    Math.hypot(p.x - hazard.x, p.z - hazard.z) < hazard.radius && Math.abs(p.y - hazard.y) < 1.16 :
    distance(hazard, p) < hazard.radius;
  const hit = inside && p.invul <= 0 && game.status === 'playing';
  const impact = {
    id: hazard.id, ...point(hazard), radius: hazard.radius, stage: game.stage,
    attack: hazard.attack, bossId: hazard.bossId, hit, inside, surface, layer:hazard.layer,
  };
  game.emit('hazardImpact', impact);
  if (hit) game.hurt(hazard.damage??(hazard.attack==='starfall'?61:hazard.attack==='shell-breaker'?38:27*(1+game.stage*.8)),
    hazard.attack==='sky-cross'?p:undefined);
}

export function updateEnemyHazards(game, dt) {
  const stage=game.stage;
  for (const hazard of game.hazards) {
    hazard.life = hazard.resolveAt == null ? hazard.life - dt : hazard.resolveAt - game.time;
    if (hazard.warning) {
      if (hazard.life <= 1e-6) {
        if (!hazard.previewOnly) resolveMark(game, hazard);
        hazard.life = 0;
      }
    } else if (hazard.wave) {
      updateWave(game, hazard, dt);
    } else {
      const before = point(hazard);
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      hazard.z += hazard.vz * dt;
      if (game.interceptWonderProjectile?.(before,hazard)) {
        hazard.life=0;
        if(game.stage!==stage||game.status!=='playing')return;
        continue;
      }
      if (segmentDistance(game.p, before, hazard) < (hazard.radius ?? .30) + .50) {
        if(!game.catchWonderProjectile?.(hazard,before))game.hurt(hazard.damage ?? 11 * (1 + game.stage * .7));
        hazard.life = 0;
      }
    }
  }
  const live = game.hazards.filter(hazard => hazard.life > 0);
  if (live.length <= 160) game.hazards = live;
  else {
    const scheduled = live.filter(hazard => hazard.warning || hazard.wave);
    const bullets = live.filter(hazard => !hazard.warning && !hazard.wave);
    const remaining = Math.max(0, 160 - scheduled.length);
    game.hazards = scheduled.concat(remaining ? bullets.slice(-remaining) : []);
  }
}
