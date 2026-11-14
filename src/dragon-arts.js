import { canDisplaceEnemy, knockBackEnemy } from './encounters.js';
import { openCascadeFollowThrough, storeThawThunder } from './cascades.js';
import { DRAGON_ARTS } from './dragon-art-data.js';
import { FORM_BY_STAGE } from './rules.js';
import { frostPrismReceiver } from './technique-arts.js';

const CHARGE = 100;
const HITS_PER_SECOND = 1800;
const MAX_IMPACTS_PER_STEP = 28;
const MAX_LOCKS_PER_STEP = 20;
const MAX_CAPTURES = 96;
const MAX_SHELLS = 48;
const frostFractures = new Set(['spark', 'lightning', 'thunder', 'serpent', 'cascade-thunder']);
const thermalFractures = new Set(['fire', 'breach', 'emberwings', 'cascade-fire']);
const stoneFractures = new Set(['tail', 'stonecrest', 'cascade-water', 'cascade-wind']);
const riftSources = new Set(['claw', 'needle', 'pierce', 'cascade-wind']);
const wetFields = new Set(['rain', 'steam', 'cloud']);
const CONDUIT_CONTACT_LIFE = 1.45;
const CONDUIT_NODE_LIFE = 1.15;
const STEAMWAKE_WINDUP = .19;
const SCORCH_LIFETIME = 5.4;
const SCORCH_INTERVAL = .17;
const SCORCH_STEP = 2.3;
const SCORCH_WINDUP = .13;
const SCORCH_TRAVEL = .40;
const SCORCH_WIDTH = 2.4;
const SCORCH_STEAM_LIFE = 1.8;
const SCORCH_MAX_FRONTS = 2;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const progress = (value, start, end) => clamp((value - start) / (end - start), 0, 1);
const smooth = value => value * value * (3 - 2 * value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = ({x, y, z}) => ({x, y, z});
const facing = angle => ({x: Math.sin(angle), z: Math.cos(angle)});
const turn = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const toward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const RIFT_SEAM_WINDUP = .16;
const RIFT_SEAM_SETTLE = .22;
const RIFT_SEAM_WIDTH = 2.23;
const RIFT_SEAM_CAP = 12;
const RIFT_CLASH_WINDUP = .09;
const RIFT_CLASH_TRAVEL = .24;
const RIFT_CLASH_WIDTH = 6.2;
const RIFT_RECOIL_WINDUP = .16;
const RIFT_RECOIL_WIDTH = 2.8;
const RIFT_WIND_WINDOW = 1.45;
const RIFT_WIND_WIDTH = 3.45;
const RIFT_WIND_PREP = .10;
const RIFT_WIND_HOLD = .20;
const STONE_MARCH_OPENS = 1.94;
const STONE_MARCH_CLOSES = 3.45;
const STONE_MARCH_WIDTH = 3.65;
const STONE_CONTOUR_MIN = 6;
const STONE_CONTOUR_OPENS = 1.03;
const STONE_CONTOUR_CLOSES = 2.35;
const STONE_CONTOUR_WINDUP = .18;
const STONE_CONTOUR_REACH_CAP = 12;
const FROST_PRISM_WINDUP = .16;
const FROST_SHEET_OPEN = .69;
const FROST_SHEET_FIRST = 1.16;
const FROST_SHEET_SECOND = 1.35;
const THAW_FLANK = 'thaw-flank';

const arts = {
  stone: {radius: 13.5, height: 3.8, duration: 2.23, phase: 'wave', power: 3.7,
    cooldown: 9, sources: ['stonecrest', 'tail', 'bite', 'claw', 'water', 'ring', 'echo', 'cascade-water']},
  rift: {radius: 14, height: 4, duration: 2.41, phase: 'slash', power: 4.85,
    cooldown: 9.3, sources: ['stonecrest', 'fang', 'claw', 'bite', 'tail', 'pierce', 'needle', 'cascade-wind']},
  abyss: {radius: 16, height: 4.1, duration: 2.52, phase: 'spiral', power: 4.4,
    cooldown: 9.8, sources: ['coil', 'storm', 'ring', 'echo', 'poison', 'cascade-wind', 'cascade-poison']},
  frost: {radius: 16, height: 4.8, duration: 1.88, phase: 'freeze', power: 3.5,
    cooldown: 9.2, sources: ['hoarfrost', 'drop', 'bubble', 'torrent', 'water', 'rain', 'lightning', 'cascade-water', 'cascade-thunder']},
  beam: {radius: 23, height: 4.45, duration: 2.19, phase: 'windup', power: 4.6,
    cooldown: 9.5, sources: ['emberwings', 'shoot', 'needle', 'breach', 'ember', 'fire', 'spark', 'lightning', 'cascade-fire']},
};

function chargedByArt(source) {
  return typeof source === 'string' && source.startsWith('dragon-art-');
}

function rememberConduitContact(game, type, event) {
  if (type === 'arc' && event.from && event.to && (frostFractures.has(event.source) || event.source === 'ring')) {
    recordConduitSpark(game, event.to);
    for (const zone of game.zones) {
      if (zone.life <= 0 || !hasMoisture(zone)) continue;
      const contact = closestOnArc(event.from, event.to, zone);
      if (carrierContains(zone, contact, 1.25)) zone.conduitUntil = game.time + 2.6;
    }
  } else if (type === 'hit' && event.amount > 0 && frostFractures.has(event.source)) {
    recordConduitSpark(game, event);
    for (const zone of game.zones) {
      if (zone.life > 0 && hasMoisture(zone) && carrierContains(zone, event, 1.60)) zone.conduitUntil = game.time + 2.6;
    }
  } else if (type === 'cascadePulse' && event.kind === 'water' && event.from && event.to) {
    const crests = game.dragonArtWetCrests ??= [];
    if (crests.length >= 6) crests.shift();
    crests.push({...point(event), from: event.from, to: event.to, id: Symbol(), kind: 'water-crest',
      radius: event.radius, at: game.time, sourceId:event.id, direction:event.direction});
  } else if (type === 'field' && (event.kind === 'steam' || event.kind === 'cloud')) {
    const zone = game.zones.at(-1);
    if (zone?.kind === event.kind) zone.conduitMoisture = true;
  }
}

function recordConduitSpark(game, contact) {
  const sparks = game.dragonArtSparks ??= [];
  const previous = sparks.at(-1);
  if (previous && game.time - previous.at < .10 && distance(previous, contact) < .8 && Math.abs(previous.y - contact.y) < .8) return;
  if (sparks.length >= 24) sparks.shift();
  sparks.push({...point(contact), at: game.time});
}

function closestOnArc(from, to, center) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const t = clamp(((center.x-from.x)*dx + (center.y-from.y)*dy + (center.z-from.z)*dz) /
    Math.max(.01, dx*dx + dy*dy + dz*dz), 0, 1);
  return {x: from.x + dx*t, y: from.y + dy*t, z: from.z + dz*t};
}

function rememberRiftContacts(game, type, event) {
  if (type === 'cascadePulse' && event.kind === 'wind') {
    const {id, direction} = event;
    game.riftWindPulse = {id, direction, at:game.time};
    return;
  }
  if (type !== 'hit' || event.amount <= 0 || event.guarded || !event.from || !riftSources.has(event.source)) return;
  const wind = event.source === 'cascade-wind';
  const pulse = game.riftWindPulse;
  if (wind && (pulse?.id !== game.activeCascade?.id || pulse?.at !== game.time || !pulse.direction)) return;
  const length = distance(event.from,event);
  if (!wind && length < .045) return;
  const direction = wind ? pulse.direction : facing(toward(event.from,event));
  const history = game.riftContacts ??= [];
  const item = {...point(event),direction,at:game.time,targetId:event.targetId,
    source:event.source,carrierId:wind?pulse.id:event.strikeId};
  if (history.length === 22) history.shift();
  history.push(item);
  const art = game.activeDragonArt;
  if (art?.riftTension && game.time-art.startedAt <= 1.78) chargeRiftSeam(art,item);
  if (art?.riftClash) rememberRiftRecoilContact(art,item);
}

function chargeRiftSeam(art, contact) {
  const gap = distance(art.center,contact);
  if (gap > 7.1 || Math.abs(art.center.y-contact.y) > 4.2 || art.riftSeam) return;
  const {direction, source} = contact;
  const cross = direction.x*art.direction.z-direction.z*art.direction.x;
  if (source === 'cascade-wind' && Math.abs(cross) < .24) return;
  const moved = (contact.x-art.center.x)*art.direction.z-(contact.z-art.center.z)*art.direction.x;
  const side = Math.sign(Math.abs(cross) >= .18 ? cross : moved);
  const score = (source === 'needle' || source === 'pierce' ? 1.2 : 0) + (7.1-gap)*.24 + Math.abs(cross)*.27;
  const best = art.riftTension.contacts[side+1];
  if (!best || score > best.score + .10 || contact.at-best.at > .55) {
    art.riftTension.contacts[side+1] = {...contact,side,score};
  }
}

export function noteDragonArtEvent(game, type, event) {
  const kind = game.cultivation.dragonArt;
  if (!arts[kind] || game.stage >= 4 || game.status !== 'playing' || chargedByArt(event.source)) return;
  const art = game.activeDragonArt;
  if (kind === 'beam') rememberConduitContact(game, type, event);
  if (kind === 'rift' && game.cultivation.dragonArtRank === 3) {
    rememberRiftContacts(game,type,event);
  }
  if (type === 'hit' && art?.contactFractures) {
    const enemy = art.locked.get(event.targetId);
    if (enemy?.hp <= 0 && art.shells.size < MAX_SHELLS) art.shells.set(enemy.id, enemy);
    if (art.rank >= 2 && event.amount > 0 && enemy && !art.hitTargets.has(enemy.id)) {
      if (art.phase === 'wave' && stoneFractures.has(event.source)) {
        const cascade = game.activeCascade;
        const cascadeHit = event.source === `cascade-${cascade?.kind}`;
        const pulse = cascadeHit && art.quarryPulse?.id === cascade.id ? art.quarryPulse : null;
        const wetBlow = enemy.wet > 0 && event.from && distance(event.from,enemy) > .30 &&
          (event.source === 'tail' || event.source === 'stonecrest');
        const direction = pulse?.direction ?? (cascadeHit ? cascade.direction : wetBlow ? facing(toward(event.from,enemy)) : null);
        const prior = art.contactFractures.get(enemy.id);
        if (!prior?.direction || direction) art.contactFractures.set(enemy.id, {direction,
          front:cascadeHit ? cascade.id : wetBlow ? 'wet-shell' : null});
      } else if (art.kind === 'frost' && (art.phase === 'freeze' || art.phase === 'shatter') && enemy.wet > 0) {
        if (art.phase === 'freeze' && thermalFractures.has(event.source)) {
          art.contactFractures.set(enemy.id, {thermal: true});
          if(art.temperRush&&!art.temperRush.sent&&art.temperRush.contacts.size<24) {
            art.temperRush.contacts.set(enemy.id,{id:enemy.id,...point(enemy),at:art.age,source:event.source,
              heading:event.from&&distance(event.from,enemy)>.45 ? facing(toward(event.from,enemy)) : null});
          }
        }
        else if (frostFractures.has(event.source) && !art.contactFractures.has(enemy.id)) {
          art.contactFractures.set(enemy.id, {thunder:true});
        }
      }
    }
    if (!enemy && art.iceFork && event.amount > 0 && frostFractures.has(event.source)) {
      const shard = art.iceFork.shards.get(event.targetId);
      if (shard && game.time - art.startedAt - shard.at <= .42) {
        art.iceFork.shards.delete(event.targetId);
        queueIceFork(art,shard);
      }
    }
  }
  if (type === 'cascadePulse' && art?.kind === 'stone' && (event.kind === 'water' || event.kind === 'wind')) {
    art.quarryPulse = {id:event.id, direction:event.direction};
  }
  if (type === 'techniqueArtImpact' && event.kind === 'bankweir' && art?.kind === 'stone' && art.rank >= 2 && art.phase === 'wave') {
    const enemy = art.locked.get(event.targetId);
    const reach = event.from && distance(event.from, event);
    if (enemy && reach > .25) {
      art.contactFractures.set(enemy.id, {direction: facing(toward(event.from, event)), front: event.id});
    }
  }
  let gain = 0;
  const aligned = arts[kind].sources.includes(event.source ?? event.weapon ?? event.kind ?? type);
  if (type === 'hit' && event.amount > 0) gain = aligned && !event.guarded ? 3.4 : 1.05;
  else if (type === 'kill') gain = aligned ? 6.5 : 2.9;
  else if (type === 'cascadeHit') gain = event.killed ? 4.6 : 2.6;
  else if (type === 'reaction') gain = 4.3;
  else if (type === 'weaponCast' || type === 'clawRelease' || type === 'shoot') {
    if (aligned && !event.cancelled) gain = .65;
  }
  if (gain <= 0) return;
  game.dragonArtEngagedAt = game.time;
  // A crowd cascade can supply most of the charge. Briefly cap the intake so
  // a large simultaneous volley cannot unlock a second cast by itself.
  const frame = Math.floor(game.time * 8);
  if (frame !== game.dragonArtChargeFrame) {
    game.dragonArtChargeFrame = frame;
    game.dragonArtIntake = 0;
  }
  const accepted = Math.min(gain, 24 - game.dragonArtIntake);
  game.dragonArtIntake += accepted;
  game.dragonArtCharge = Math.min(CHARGE, (game.dragonArtCharge ?? 0) + accepted);
}

function announceAbyssTransfer(game,art) {
  const from = art.echoFrom, to = art.echoTo;
  const radius = art.echoRadius;
  const targets = nearby(game,to,radius,art.height).filter(enemy=>canDisplaceEnemy(enemy,game.time)).slice(0,16)
    .map(enemy=>({id:enemy.id,...point(enemy)}));
  const dx = to.x-from.x, dz = to.z-from.z;
  const span = Math.hypot(dx,dz);
  const turnSide = Math.sign(dx*art.direction.z-dz*art.direction.x) || 1;
  const bend = Math.min(2.6,span*.15)*turnSide;
  const points = Array.from({length:9}, (_, i) => {
    const t = i/8, curl = Math.sin(Math.PI*t);
    return {x:from.x+dx*t-dz/Math.max(.01,span)*bend*curl,
      y:from.y+(to.y-from.y)*t+curl*Math.min(3.5,span*.16),
      z:from.z+dz*t+dx/Math.max(.01,span)*bend*curl};
  });
  game.emit('dragonArtReaction',{...eventData(art),...point(to),reaction:'abyss-transfer',from,to,points,
    radius,receiverIds:targets.map(enemy=>enemy.id),targets,travel:.22,duration:.58,settle:.36,carriedEmber:art.carriedEmber});
}

export function dragonArtSlowing(game, enemy) {
  return !enemy.boss && (enemy.dragonArtHeldUntil ?? 0) > game.time ? 0 : 1;
}

export function resetDragonArt(game) {
  if (game.activeDragonArt) {
    for (const enemy of game.activeDragonArt.locked.values()) release(enemy);
    for (const {enemy} of game.activeDragonArt.captures?.values() ?? []) delete enemy.dragonArtCaptureProgress;
    for (const {enemy} of game.activeDragonArt.riftSeam?.caught.values() ?? []) releaseRiftPrey(enemy);
    for (const {enemy} of game.activeDragonArt.riftWindSeam?.caught.values() ?? []) releaseRiftPrey(enemy);
  }
  game.activeDragonArt = null;
  game.nextDragonArtAt = 0;
  game.dragonArtEngagedAt = -Infinity;
  game.dragonArtChargeFrame = -1;
  game.dragonArtCharge = 0;
  game.dragonArtSparks = [];
  game.dragonArtWetCrests = [];
  game.dragonScorch = null;
  game.riftContacts = [];
  game.riftWindPulse = null;
  game.galeTransport = null;
}

function nearby(game, center, radius, height) {
  return game.enemiesNear(center, radius + 3).filter(enemy => enemy.hp > 0 &&
    Math.abs(enemy.y - center.y) <= height + (enemy.radius ?? 0) * .33 &&
    distance(enemy, center) <= radius + (enemy.radius ?? 0) * .35);
}

function castAim(player, targets, sweep) {
  // A fixed set of angular bins finds a dense lane in one pass, even in a horde.
  const bins = Array(16).fill(0);
  let boss;
  for (const enemy of targets) {
    const angle = toward(player, enemy);
    const bin = Math.round((turn(angle - player.angle) + Math.PI) * bins.length / TAU) % bins.length;
    bins[bin] += enemy.boss ? 1.8 : 1;
    if (enemy.boss) boss = enemy;
  }
  if (targets.length === 1 && boss) return toward(player, boss);
  let best = 0;
  let score = -Infinity;
  const neighbors = Math.ceil(sweep * bins.length / TAU);
  for (let i = 0; i < bins.length; i++) {
    const angle = i * TAU / bins.length - Math.PI;
    let local = bins[i] + .24 * Math.cos(angle);
    for (let offset = 1; offset <= neighbors; offset++) {
      const weight = (1 - offset / (neighbors + 1)) * .86;
      local += weight * (bins[(i + offset) % bins.length] + bins[(i - offset + bins.length) % bins.length]);
    }
    if (local > score) {
      score = local;
      best = angle;
    }
  }
  return player.angle + best;
}

function castTargets(game, radius, height) {
  const targets = nearby(game, game.p, radius * .95, height);
  return targets.length >= 3 || targets.some(enemy => enemy.boss) ? targets : null;
}

function beamCandidates(player, targets, sweep) {
  const forwardRange = Math.min(1.41, sweep + .30);
  return targets.filter(enemy => Math.abs(turn(toward(player, enemy) - player.angle)) <= forwardRange);
}

function crowdedCenter(candidates, radius, height, enemyFilter) {
  let best;
  let bestScore = 0;
  for (const {point: center, cause} of candidates) {
    const score = enemyFilter(center, radius, height);
    if (score > bestScore) {
      best = {center: point(center), cause, score};
      bestScore = score;
    }
  }
  return best;
}

function inheritedCenter(game, kind, nearbyEnemies, radius, height, origin = game.p, away = null) {
  const cascade = game.activeCascade;
  const candidates = game.zones.filter(zone => zone.kind === 'storm' && zone.life > .48
    && distance(origin, zone) < radius * .72 && Math.abs(origin.y - zone.y) <= height)
    .map(zone => ({point: zone, cause: 'storm'}));
  const wind = cascade?.kind === 'wind' ? cascade.windGather ? cascade.windFocus : cascade.center : null;
  if (wind && distance(origin, wind) < radius * .72 && Math.abs(origin.y-wind.y)<=height) {
    candidates.unshift({point: wind, cause: 'wind'});
  }
  const whirlpool = game.wonders?.active;
  if (kind === 'abyss' && whirlpool?.kind === 'whirlpool' && whirlpool.phase === 'active' &&
      distance(origin, whirlpool) < radius * .72 && Math.abs(origin.y - whirlpool.y) <= height) {
    candidates.unshift({point: whirlpool, cause: 'whirlpool'});
  }
  const eligible = away ? candidates.filter(candidate => distance(candidate.point, away) >= 5.8) : candidates;
  const inherited = crowdedCenter(eligible, away ? radius * .26 : radius * (kind === 'rift' ? .64 : .57), height,
    (center, range, vertical) => nearbyEnemies.reduce((count, enemy) => count + Number(!enemy.boss
      && Math.abs(enemy.y - center.y) <= vertical && distance(enemy, center) < range), 0));
  return inherited?.score >= 2 ? inherited : null;
}

function eventData(art) {
  const {id, kind, rank, stage, x, y, z, radius, height, angle, age, duration, strength, phase, phaseAt,
    phaseAge, direction, origin, sweep, sweepAngle, beamWidth, frontRadius, doctrine, portals,
    hitCount, killCount, absorbed, beamLength, echoCenter, echoRadius, echoPhase, echoFrom, echoTo, echoWidth, echoAngle,
    inheritance, inheritanceSiteId, echoInheritance, comboFractures, carriedPoison, captured, shellCount, beamPitch} = art;
  return {id, kind, rank, stage, x, y, z, radius, height, angle, age, duration, strength, phase, phaseAt,
    phaseAge, direction, origin, sweep, sweepAngle, beamWidth, frontRadius, doctrine, portals,
    hitCount, killCount, absorbed, beamLength, echoCenter, echoRadius, echoPhase, echoFrom, echoTo, echoWidth, echoAngle,
    inheritance, inheritanceSiteId, echoInheritance, comboFractures, carriedPoison, captured, shellCount, beamPitch};
}

function beginArt(game, kind, rank, radius, height, targets) {
  const rule = arts[kind], doctrine = game.cultivation.dragonArtDoctrine;
  const origin = point(game.p);
  const sweep = [0, .80, 1.08, 1.29][rank];
  const aim = castAim(game.p, targets, kind === 'beam' ? sweep : Math.PI * .36);
  const angle = kind === 'beam' ? game.p.angle + clamp(turn(aim - game.p.angle), -.41, .41) : aim;
  const direction = facing(angle);
  let center = {...origin};
  let inheritance;
  let inheritanceSiteId;
  if (kind === 'rift' || kind === 'abyss') {
    const offset = kind === 'rift' ? radius * .36 : radius * .25;
    center.x += direction.x * offset;
    center.z += direction.z * offset;
    const inherited = inheritedCenter(game, kind, targets, radius, height);
    if (inherited) {
      ({center, cause: inheritance} = inherited);
      if(inheritance==='whirlpool')inheritanceSiteId=game.wonders.active.id;
    }
    if (!game.exploring) {
      center.x = clamp(center.x, -67, 67);
      center.z = clamp(center.z, -67, 67);
    }
    game.stayInWater(center, .3, origin);
    center.y += kind === 'rift' ? .6 : .38;
  }
  let portals = [center];
  const stackedMouths = kind==='abyss' && doctrine==='reach' && game.stage>=3;
  if (kind==='rift' && rank===3 && doctrine!=='echo') {
    portals = [-1,1].map(side => ({
      x: center.x + direction.z * radius * .31 * side,
      y: center.y + .27 * side,
      z: center.z - direction.x * radius * .31 * side,
    }));
  } else if (stackedMouths) {
    portals = [-1,1].map(side => ({...center,y:clamp(center.y+2.7*side,3.9,19.6)}));
  }
  const duration = rule.duration + (doctrine==='echo' ? .50 : kind==='beam'&&doctrine==='reach' ? .85 : 0);
  const strength = rule.power * (1 + (rank - 1) * .22);
  const arc = kind === 'beam' ? 'breath' : kind === 'stone' || kind === 'rift' || kind === 'abyss' ? 'physical' : 'water';
  const stats = game.stats();
  const stasis = kind === 'stone' || kind === 'frost';
  const suction = kind === 'rift' || kind === 'abyss';
  const art = {
    id: game.nextId++, kind, rank, stage: game.stage, ...center, radius, height, angle, origin, center,
    duration, strength, damage: stats.damage * strength * (stats.mods?.[arc] ?? 1), doctrine, direction,
    portals, stackedMouths, sweep, sweepAngle: angle - sweep, inheritance, inheritanceSiteId, carriedPoison:0,
    beamWidth: [.0, 1.15, 1.46, 1.8][rank], beamLength: radius, beamPitch: 0,
    age: 0, startedAt: game.time, phase: rule.phase, phaseAt: 0, phaseAge: 0, frontRadius: 0,
    locked: new Map(), hitTargets: new Set(), secondary: new Set(), sources: [], nextSecondaryAt: 0,
    contactFractures: stasis ? new Map() : null, shells: stasis ? new Map() : null, comboFractures: 0, shellCount: 0,
    captures: suction ? new Map() : null, fuel: suction ? new Map() : null, captured: 0,
    mouthBatches: kind==='abyss'&&rank>=2&&game.stage>=2 ? new Map() : null,
    steamSites: kind === 'frost' ? [] : null, carriedEmber: false,
    iceFork: kind === 'frost' && rank >= 2 ? {
      paths: [], hits: new Set(), reserved: new Set(), pending: [], shards: new Map(), started: 0, nextLeg: 0,
    } : null,
    iceSheets: kind==='frost'&&rank>=2&&game.stage>=2 ? {ready:false,fronts:[],reserved:new Set()} : null,
    temperRush: kind==='frost'&&rank>=2&&game.stage>=2 ? {contacts:new Map(),sites:[],sent:false,nextAt:0} : null,
    quarry: kind === 'stone' ? [] : null, undertow: kind === 'abyss' ? new Map() : null,
    stoneMarch: kind === 'stone' && rank === 3 && doctrine === 'echo' && game.stage >= 2 ? {
      breaks: [], entrants: null, anchors: [], nextAt: STONE_MARCH_OPENS, front: null,
    } : null,
    stoneContour: kind === 'stone' && rank >= 2 && game.stage >= 2 ? {
      breaks: new Map(), held: false, fronts: [], receivers: new Set(), spent: false, scanAt: 1.60,
    } : null,
    riftTension: kind === 'rift' && rank === 3 && doctrine === 'echo' ? {contacts:[]} : null,
    riftClash: kind === 'rift' && portals.length === 2 ? {intakes:new Map(), front:null} : null,
    conduit: kind === 'beam' ? {nodes: [], branches: [], hits: new Set(), fields: new Set(), starts: 0} : null,
    scorchLanes: kind==='beam'&&doctrine==='reach'?[]:undefined,
    pending: [], pendingHead: 0,
    hitCount: 0, killCount: 0, absorbed: 0,
  };
  if (art.riftTension) {
    for (const contact of game.riftContacts ?? []) {
      if (game.time-contact.at <= 1.12) chargeRiftSeam(art,contact);
    }
  }
  game.activeDragonArt = art;
  if (art.scorchLanes) game.dragonScorch = {art,stage:game.stage,lanes:art.scorchLanes,fronts:[],reservoirs:[],douses:[],
    carriers:new Set(),dryHits:new Set(),steamHits:new Set(),nextAt:game.time,quenched:0};
  game.dragonArtCharge = 0;
  game.nextDragonArtAt = game.time + rule.cooldown - (rank - 1) * .6;
  game.emit('dragonArtStart', eventData(art));
}

function phase(game, art, name, at) {
  art.phase = name;
  art.phaseAt = at;
  art.phaseAge = art.age - at;
  game.emit('dragonArtPhase', eventData(art));
}

function emitImpact(game, art, enemy, from, impact, killed = false, amount = 0, absorbed = false, sourceId, details) {
  if (impact === 'lock') {
    if (art.lockCount >= MAX_LOCKS_PER_STEP) return;
    art.lockCount++;
  } else if (!enemy.boss) {
    if (art.impactCount >= MAX_IMPACTS_PER_STEP) return;
    art.impactCount++;
  }
  game.emit('dragonArtImpact', {
    ...eventData(art), ...point(enemy), from: point(from), targetId: enemy.id, targetRadius: enemy.radius, targetAngle: enemy.angle,
    impact, killed, amount, absorbed, sourceId, shell: impact === 'shell-shatter',
    marked: art.locked.has(enemy.id), enemyType: enemy.type, boss: enemy.boss, ...details,
  });
}

function harvestBreak(game, art, enemy, from, absorbed) {
  let burst = art.crowdBreak;
  if (!burst || burst.absorbed !== absorbed || art.age - burst.last > .12 || art.age - burst.first > .25) {
    burst = art.crowdBreak = {first:art.age, last:art.age, kills:0, x:0, y:0, z:0, centers:[], targets:[], absorbed};
  }
  const center = absorbed ? from : enemy;
  burst.x += center.x;
  burst.y += center.y;
  burst.z += center.z;
  burst.last = art.age;
  burst.kills++;
  if (burst.centers.every(spot=>distance(spot,center)>2.6 || Math.abs(spot.y-center.y)>2) && burst.centers.length<4) {
    burst.centers.push(point(center));
  }
  if (burst.targets.length < 8) burst.targets.push({id:enemy.id, ...point(enemy), radius:enemy.radius, type:enemy.type,
    angle:enemy.angle, age:art.age, mouth:absorbed ? point(from) : undefined});
  if (burst.kills < 5 || art.age < (art.nextCrowdBreak ?? 0)) return;
  const {kills, x, y, z, centers, targets, first} = burst;
  art.lastBreak = {x:x/kills,y:y/kills,z:z/kills};
  art.nextCrowdBreak = art.age + .45;
  art.crowdBreak = null;
  game.emit('dragonArtBreak', {
    ...eventData(art), x:x/kills, y:y/kills, z:z/kills, centers, targets, first, burstKills:kills, absorbed,
  });
}

function recordMajorClear(art,enemy,from,impact,leg) {
  if(art.stage<2||!['stone','frost'].includes(art.kind)||
      !['crush','resonance','frost-sheet-shatter'].includes(impact))return;
  const batches=art.majorClears??=new Map();
  const key=`${impact}:${leg??0}`;
  let group=batches.get(key);
  if(group?.sent)return;
  if(!group||art.age-group.first>.12) {
    group={first:art.age,targets:[],impact,leg};
    batches.set(key,group);
  }
  if(group.targets.length>=28)return;
  group.targets.push({id:enemy.id,...point(enemy),radius:enemy.radius,angle:enemy.angle,type:enemy.type,
    from:point(from),killed:true});
}

function announceMajorClear(game,art) {
  for(const group of art.majorClears?.values()??[]) {
    if(group.sent||group.targets.length<12)continue;
    const {targets,impact,leg}=group;
    const count=targets.length;
    const center=targets.reduce((sum,target)=>({x:sum.x+target.x/count,y:sum.y+target.y/count,z:sum.z+target.z/count}),
      {x:0,y:0,z:0});
    group.sent=true;
    game.emit('dragonArtMajorClear',{...eventData(art),...center,impact,leg,targets,burstKills:count});
  }
}

function strike(game, art, enemy, from, power, impact = 'hit', absorbed = false, sourceId, mouth, details) {
  const terrainContact = impact==='beam-scorch' || impact==='beam-quench';
  const live = () => game.activeDragonArt === art || terrainContact && game.dragonScorch?.art === art && game.stage === art.stage;
  if (enemy.hp <= 0 || game.status !== 'playing' || !live()) return;
  if (art.hitBudget <= 0) {
    art.pending.push({enemy, from: point(from), power, impact, absorbed, sourceId, mouth, details});
    return;
  }
  art.hitBudget--;
  const bossReduction = enemy.boss ? .46 : 1;
  const before = enemy.hp;
  game.damage(enemy, art.damage * power * bossReduction, 'dragon-art-' + art.kind, from);
  art.hitCount++;
  if (art.stoneMarch && !enemy.boss && before > enemy.hp && (impact==='crush' || impact==='resonance')) {
    rememberStoneBreak(art, enemy);
  }
  if (art.stoneContour && before > enemy.hp && (impact==='crush'||impact==='resonance') && art.locked.has(enemy.id)) {
    noteContourFracture(art,enemy);
  }
  const killed = enemy.hp <= 0;
  if (killed) {
    art.killCount++;
    if (!enemy.boss && live()) {
      harvestBreak(game,art,enemy,from,absorbed);
      recordMajorClear(art,enemy,from,impact,details?.leg);
    }
    if (absorbed) {
      art.absorbed++;
      if (art.kind === 'abyss') {
        art.carriedPoison = Math.max(art.carriedPoison, enemy.poison || 0);
        art.carriedEmber ||= enemy.burn > 0;
        if (mouth && art.portals.includes(mouth)) {
          let load = art.undertow.get(mouth);
          if (!load) art.undertow.set(mouth, load = {count:0, poisoned:0, heat:0, intake:null});
          load.count++;
          if (enemy.poison > 0) load.poisoned++;
          load.intake ??= undertowIntake(game,mouth);
          if (enemy.burn > 0) load.heat = Math.min(8, load.heat + 1);
          sampleUndertowHeat(game, mouth, load);
        }
      }
      if (mouth && game.activeDragonArt === art) collectFuel(game, art, mouth, enemy);
    }
  }
  if (live()) {
    emitImpact(game, art, enemy, from, impact, killed, before - enemy.hp, killed&&absorbed, sourceId, details);
  }
}

function resolvePending(game, art) {
  while (art.hitBudget > 0 && art.pendingHead < art.pending.length && game.activeDragonArt === art) {
    const {enemy, from, power, impact, absorbed, sourceId, mouth, details} = art.pending[art.pendingHead++];
    strike(game, art, enemy, from, power, impact, absorbed, sourceId, mouth, details);
  }
  if (art.pendingHead === art.pending.length) {
    art.pending.length = 0;
    art.pendingHead = 0;
  }
}

function lock(game, art, enemy, until, from = art.echoCenter ?? art.center, details) {
  if (enemy.boss || art.locked.has(enemy.id)) return;
  const heldUntil = art.startedAt + until + .04;
  enemy.dragonArtHeldUntil = heldUntil;
  enemy.dragonArtHeldAt = game.time;
  enemy.dragonArtMark = art.kind;
  // A lunge stores an absolute clock and a fixed path. Leaving that clock
  // running under a statue would teleport a surviving enemy on release.
  if (enemy.pincer) enemy.pincerReadyAt = heldUntil + .45;
  if (enemy.dartRush) enemy.dartRushReadyAt = heldUntil + .45;
  enemy.pincer = enemy.dartRush = enemy.cloudPass = enemy.dive = enemy.diveExit = null;
  delete enemy.diveReadySince;
  enemy.weaponPush = null;
  art.locked.set(enemy.id, enemy);
  emitImpact(game, art, enemy, from, 'lock', false, 0, false, from.id, details);
}

function release(enemy) {
  delete enemy.dragonArtHeldAt;
  delete enemy.dragonArtHeldUntil;
  delete enemy.dragonArtMark;
}

function addFracture(art, enemy, direction) {
  if (art.sources.length < 28) art.sources.push({...point(enemy), id: enemy.id, hops: 0, direction});
}

function shatterShell(game, art, enemy, from) {
  if (!art.shells.delete(enemy.id)) return;
  art.shellCount++;
  if (art.stoneMarch) rememberStoneBreak(art, enemy);
  if (art.stoneContour) noteContourFracture(art,enemy);
  emitImpact(game, art, enemy, from, 'shell-shatter');
}

function shatter(game, art, age, full = false) {
  const radius = art.radius * progress(age, 0, .19);
  for (const [id, enemy] of art.locked) {
    if (art.iceFork?.reserved.has(id)||art.iceSheets?.reserved.has(id)) continue;
    if (!full && distance(enemy, art.center) > radius) continue;
    const wet = art.kind === 'frost' && enemy.wet > 0;
    if(wet&&art.contactFractures.get(id)?.thermal)recordTemperedShell(art,enemy);
    if (wet && art.iceFork) {
      if (art.contactFractures.get(enemy.id)?.thunder) queueIceFork(art,enemy);
      else if (enemy.hp > art.damage * 1.32 && art.iceFork.shards.size < 32) {
        art.iceFork.shards.set(enemy.id,{...point(enemy),id:enemy.id,at:art.age});
      }
    }
    if (art.rank === 3 && (art.kind === 'stone' || wet)) addFracture(art,enemy);
    art.hitTargets.add(enemy.id);
    if (enemy.hp > 0) strike(game, art, enemy, art.center, wet ? 1.32 : 1, 'crush');
    else shatterShell(game, art, enemy, art.center);
    art.locked.delete(id);
    art.contactFractures.delete(id);
    release(enemy);
    if(art.kind==='stone'&&art.doctrine==='reach'&&distance(enemy,art.center)>art.radius*.62){
      knockBackEnemy(game,enemy,art.center,'tail',art.rank);
    }
  }
  if (full) {
    for (const enemy of nearby(game, art.center, art.radius, art.height)) {
      if (!enemy.boss || art.hitTargets.has(enemy.id)) continue;
      art.hitTargets.add(enemy.id);
      strike(game, art, enemy, art.center, 1, 'crush');
    }
  }
}

function reactOnContact(game, art) {
  let processed = 0;
  for (const [id, contact] of art.contactFractures) {
    if (processed === 4 || art.hitBudget <= 0) break;
    const enemy = art.locked.get(id);
    if (enemy && (game.time - enemy.dragonArtHeldAt < .20 || art.iceFork?.reserved.has(id)||art.iceSheets?.reserved.has(id))) continue;
    art.contactFractures.delete(id);
    if (!enemy) continue;
    processed++;
    art.comboFractures++;
    art.hitTargets.add(id);
    if (contact.thermal) {
      recordTemperedShell(art,enemy);
      const radius = 4.5;
      if (art.steamSites.length < 3 && !art.steamSites.some(site => distance(site, enemy) < radius * 1.2)) {
        art.steamSites.push(point(enemy));
        createReaction(game, art, enemy, 'steam-bloom', radius);
      }
    } else if (contact.direction && contact.front != null && art.quarry.length < 24) {
      art.quarry.push({...point(enemy), direction:contact.direction, front:contact.front, id, at:art.age});
    } else addFracture(art, enemy, contact.direction);
    if (contact.thunder) queueIceFork(art,enemy);
    if (enemy.hp > 0) strike(game, art, enemy, enemy, art.kind === 'frost' ? 1.32 : 1, 'resonance');
    else shatterShell(game, art, enemy, enemy);
    art.locked.delete(id);
    release(enemy);
  }
  if (processed) localAftershocks(game, art);
}

function quarryRelease(game, art) {
  const sites = art.quarry;
  for (const site of [...sites]) {
    const time = art.age - site.at;
    if (!sites.includes(site) || time < .085) continue;
    const linked = sites.filter(edge => edge.direction.x * site.direction.x + edge.direction.z * site.direction.z >= .54 &&
      Math.abs(edge.at - site.at) <= .48 && Math.abs(edge.y - site.y) < 2.8 && distance(edge, site) <= 11.7);
    if (linked.length === 1 && time < .46 && !art.quarryReleased && site.front != null) continue;
    for (const edge of linked) sites.splice(sites.indexOf(edge), 1);
    if (linked.length < 2 || art.quarryReleased) {
      for (const edge of linked) addFracture(art, edge, edge.direction);
      continue;
    }
    const combined = linked.reduce((sum, edge) => ({x:sum.x+edge.direction.x, z:sum.z+edge.direction.z}), {x:0,z:0});
    const angle = Math.atan2(combined.x, combined.z);
    const [x,y,z] = ['x','y','z'].map(axis => linked.reduce((sum, edge) => sum+edge[axis],0) / linked.length);
    const from = {x,y,z};
    const length = Math.min(22, 12 + linked.length * 2);
    const width = Math.min(7, 3.5 + Math.max(...linked.map(edge => distance(site,edge))) * .42);
    const heading = quarryHeading(game, art, from, angle, length, width);
    const to = {x:x+heading.x*length, y, z:z+heading.z*length};
    art.quarryReleased = beginSecondaryFront(game, art, 'stone-quarry', from, to, width,
      Math.min(1.3, .84 + .10 * linked.length), linked);
    if (!art.quarryReleased) for (const edge of linked) addFracture(art, edge, edge.direction);
  }
  localAftershocks(game, art);
}

function quarryHeading(game, art, from, angle, length, width) {
  const prey = nearby(game, from, length, art.height).filter(enemy =>
    !enemy.boss && !art.hitTargets.has(enemy.id) && !art.locked.has(enemy.id));
  let best = -1, heading;
  for (const offset of [0,-.28,.28,-.54,.54]) {
    const option = facing(angle+offset);
    const hits = prey.reduce((count, enemy) => {
      const x = enemy.x-from.x, z = enemy.z-from.z;
      const ahead = x*option.x+z*option.z;
      return count + Number(ahead>=3 && ahead<=length && Math.abs(x*option.z-z*option.x)<width);
    },0);
    if (hits > best) {best = hits; heading = option;}
  }
  return heading;
}

function beginSecondaryFront(game, art, reaction, from, to, width, power, samples, outlet) {
  const stone = reaction === 'stone-quarry';
  const path = [point(from)];
  const length = distance(from, to);
  if (length < 4) return false;
  const passes = Math.max(1, Math.ceil(length / 1.35));
  for (let index = 1; index <= passes; index++) {
    const t = index / passes;
    const next = {x:from.x+(to.x-from.x)*t, y:from.y+(to.y-from.y)*t, z:from.z+(to.z-from.z)*t};
    game.stayInWater(next, .3, path.at(-1));
    // The momentum stops at a sharp ridge or a bank which rejects this lane.
    if (Math.abs(next.y - path.at(-1).y) > 2.1 || Math.abs(next.x-(from.x+(to.x-from.x)*t)) +
        Math.abs(next.z-(from.z+(to.z-from.z)*t)) > .34) break;
    path.push(next);
  }
  const end = path.at(-1);
  const travelLength = distance(from, end);
  if (travelLength < 4) return false;
  const direction = facing(toward(from, end));
  const windup = stone ? .22 : .23;
  const travel = stone ? clamp(travelLength / 23, .42, .82) : clamp(travelLength / 24, .45, .93);
  art.secondaryFront = {reaction, from, to:end, direction, width, power, path, length:travelLength,
    windup, travel, started:art.age, last:0, hits:new Set(), nextZone:4};
  game.emit('dragonArtReaction', {
    ...eventData(art), ...point(end), reaction,
    from, to:end, direction, width, radius:width, duration:windup+travel, windup, travel,
    points:path, targets:samples?.map(point), carrier:outlet?.carrier, zoneId:outlet?.field?.id,
    receiverIds:outlet?.receivers.slice(0,8).map(enemy=>enemy.id),
  });
  return true;
}

function frontPosition(front, along) {
  const index = clamp(along / front.length, 0, 1) * (front.path.length - 1);
  const before = front.path[Math.floor(index)], after = front.path[Math.ceil(index)];
  const blend = index % 1;
  return {x:before.x+(after.x-before.x)*blend, y:before.y+(after.y-before.y)*blend, z:before.z+(after.z-before.z)*blend};
}

function updateSecondaryFront(game, art) {
  const front = art.secondaryFront;
  if (!front) return;
  if (front.reaction === 'abyss-steamwake') {
    updateSteamwake(game, art, front);
    return;
  }
  const {reaction, from, direction, width, length, started, windup, travel, power} = front;
  if (art.age < started + windup) return;
  const reached = length * progress(art.age, started + windup, started + windup + travel);
  const middle = frontPosition(front, (reached + front.last) * .5);
  const stone = reaction === 'stone-quarry';
  while (!stone && reached >= front.nextZone) {
    const site = frontPosition(front, front.nextZone);
    game.addZone('poison', {...site, radius:Math.min(4.25,width), power:1.9, life:2.6, weaponAnchor:reaction});
    front.nextZone += 5.2;
  }
  for (const enemy of nearby(game, middle, Math.hypot(reached-front.last,width)+1.8, 3.8)) {
    if (enemy.boss || art.hitTargets.has(enemy.id) || art.locked.has(enemy.id) || front.hits.has(enemy.id)) continue;
    if (stone && art.stoneContour?.receivers.has(enemy.id)) continue;
    const dx = enemy.x-from.x, dz = enemy.z-from.z;
    const along = dx*direction.x+dz*direction.z, across = dx*direction.z-dz*direction.x;
    if (along < front.last-.7 || along > reached+.65 || Math.abs(across) > width + enemy.radius*.3 ||
        Math.abs(enemy.y-frontPosition(front,along).y) > (stone ? 2.45 : 3.25)) continue;
    front.hits.add(enemy.id);
    if (stone) art.hitTargets.add(enemy.id);
    else art.echoTargets?.add(enemy.id);
    if (stone) knockBackEnemy(game, enemy, {x:enemy.x-direction.x, z:enemy.z-direction.z}, 'tail', art.rank);
    else {
      enemy.poison = Math.max(enemy.poison, 4);
      if (canDisplaceEnemy(enemy, game.time)) slide(game, art, enemy, direction.x*1.2, 0, direction.z*1.2, middle);
    }
    strike(game, art, enemy, middle, power, reaction);
  }
  front.last = reached;
  if (reached >= length) art.secondaryFront = null;
}

function localAftershocks(game, art) {
  // A fixed cadence lets every fracture find fresh nearby enemies without
  // replaying the damage on the same target from intersecting splinters.
  if (art.age < art.nextSecondaryAt || !art.sources.length) return;
  art.nextSecondaryAt = art.age + .11;
  const sites = art.sources.splice(0, 4);
  const stone = art.kind === 'stone';
  const chain = art.rank===3&&art.doctrine==='echo';
  for (const site of sites) {
    // The crest carries an actual broken statue outward. A nearby enemy at its
    // side still needs a separate fracture to reach it.
    const radius = site.direction ? 7.5 : chain ? stone ? 6.5 : 7 : stone ? 3.8 : 5.1;
    const candidates=nearby(game,site,radius,art.height*.65).filter(enemy=>
      !art.hitTargets.has(enemy.id)&&!art.locked.has(enemy.id)&&!art.secondary.has(enemy.id)&&!art.iceFork?.reserved.has(enemy.id)&&
      !art.iceSheets?.reserved.has(enemy.id)&&!art.stoneContour?.receivers.has(enemy.id)&&
      (!chain||stone||enemy.wet>0)&&(!site.direction ||
        (enemy.x-site.x)*site.direction.x+(enemy.z-site.z)*site.direction.z>=distance(enemy,site)*.62));
    const targets=chain ? candidates.sort((a,b)=>distance(a,site)-distance(b,site)).slice(0,stone?2:1) : candidates;
    for (const enemy of targets) {
      art.secondary.add(enemy.id);
      strike(game, art, enemy, site, chain ? .68 - site.hops*.11 : .54,
        site.direction ? 'stone-surge' : chain ? stone?'stone-chain':'frost-chain' : 'crush',false,site.id);
      if(chain&&site.hops<1&&art.sources.length<28){
        art.sources.push({...point(enemy),id:enemy.id,hops:site.hops+1});
      }
    }
  }
}

function rememberStoneBreak(art, enemy) {
  const march = art.stoneMarch;
  if (march.entrants || march.breaks.length >= 28 || distance(enemy,art.center) < art.radius * .33) return;
  march.breaks.push({...point(enemy), id:enemy.id});
}

function stoneMarchUntouched(art, enemy) {
  return !enemy.boss && !art.hitTargets.has(enemy.id) && !art.locked.has(enemy.id) && !art.secondary.has(enemy.id) &&
    !art.stoneContour?.receivers.has(enemy.id);
}

function markStoneMarchEntrants(game, art, march) {
  for (const site of march.breaks.sort((a,b)=>distance(b,art.center)-distance(a,art.center))) {
    if (march.anchors.some(anchor=>distance(anchor.site,site)<3.7)) continue;
    const support = march.breaks.find(other=>other!==site && distance(site,other)>=2.6 && distance(site,other)<=10.8 &&
      Math.abs(site.y-other.y)<=2.8);
    if (support) march.anchors.push({site,support});
    if (march.anchors.length === 5) break;
  }
  march.entrants = new Map();
  if (!march.anchors.length) return;
  for (const enemy of nearby(game,art.center,art.radius+26,art.height+6)) {
    if (stoneMarchUntouched(art,enemy)) march.entrants.set(enemy.id,point(enemy));
  }
}

function stoneMarchPath(game, from, to, bend) {
  const length = distance(from,to), direction = facing(toward(from,to));
  const path = [{...point(from), along:0}];
  const passes = Math.ceil(length / 1.2);
  for (let index = 1; index <= passes; index++) {
    const t = index / passes, curve = 4*t*(1-t)*bend;
    const x = from.x + (to.x-from.x)*t + curve*direction.z;
    const z = from.z + (to.z-from.z)*t - curve*direction.x;
    if (!game.exploring && (Math.abs(x)>66 || Math.abs(z)>66)) return null;
    const next = {x,y:from.y+(to.y-from.y)*t,z};
    const previous = path.at(-1);
    game.stayInWater(next,.35,previous);
    if (Math.abs(next.y-previous.y)>1.55 || Math.hypot(next.x-x,next.z-z)>.32) return null;
    if (game.stage===3 && game.terrainHeight && game.terrainHeight(x,z)+.65>next.y) return null;
    path.push({...next,along:previous.along+distance(previous,next)});
  }
  return path;
}

function findStoneMarch(game, art, march) {
  let best;
  for (const {site,support} of march.anchors) {
    const outward = facing(toward(art.center,site));
    const entrants = nearby(game,site,19.5,3.65).filter(enemy=>{
      if (!stoneMarchUntouched(art,enemy)) return false;
      const span = distance(site,enemy), dx = enemy.x-site.x, dz = enemy.z-site.z;
      const heading = (dx*outward.x + dz*outward.z)/span;
      if (span<7.2 || span>19.5 || heading<-.22 || heading>.97) return false;
      const earlier = march.entrants.get(enemy.id);
      return !earlier || distance(earlier,enemy)>=2.8 && distance(site,earlier)-span>=1.25;
    });
    for (const lead of entrants) {
      const receivers = entrants.filter(enemy=>distance(enemy,lead)<=4.4 && Math.abs(enemy.y-lead.y)<2.2);
      if (receivers.length < 2) continue;
      const score = Math.min(8,receivers.length)*2 - distance(lead,site)*.19;
      if (best && score <= best.score) continue;
      const end = receivers.reduce((sum,enemy)=>({x:sum.x+enemy.x,y:sum.y+enemy.y,z:sum.z+enemy.z}),{x:0,y:0,z:0});
      const to = {x:end.x/receivers.length,y:end.y/receivers.length,z:end.z/receivers.length};
      const direction = facing(toward(site,to));
      const turnSide = Math.sign(outward.x*direction.z-outward.z*direction.x) || 1;
      const bend = Math.min(3.9,distance(site,to)*.24) * turnSide;
      const exit = {x:to.x+direction.x*2.5,y:to.y,z:to.z+direction.z*2.5};
      const path = stoneMarchPath(game,site,exit,bend) ?? stoneMarchPath(game,site,to,bend);
      if (path) best = {site,support,path,receivers,score};
    }
  }
  return best;
}

function stoneMarchPosition(path, along) {
  const index = path.findIndex(site=>site.along>=along);
  if (index<=0) return index===0 ? path[0] : path.at(-1);
  const from = path[index-1], to = path[index];
  const t = progress(along,from.along,to.along);
  return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t};
}

function noteContourFracture(art, enemy) {
  const {breaks,spent} = art.stoneContour;
  if (spent || breaks.size >= 48 || breaks.has(enemy.id)) return;
  breaks.set(enemy.id,{...point(enemy),id:enemy.id,radius:enemy.radius,at:art.age});
}

function contourGroup(sites) {
  let best = [];
  for (const seed of sites) {
    const group = sites.filter(site=>distance(seed,site)<=8.2 && Math.abs(seed.y-site.y)<=2.8);
    if (group.length > best.length) best = group;
  }
  return best.slice(0,18);
}

function contourCenter(group) {
  const sum = {x:0,y:0,z:0};
  for (const site of group) { sum.x+=site.x; sum.y+=site.y; sum.z+=site.z; }
  return {x:sum.x/group.length,y:sum.y/group.length,z:sum.z/group.length};
}

function announceStoneHold(game, art, shatterAt) {
  const contour = art.stoneContour;
  if (contour.held || art.age < STONE_CONTOUR_OPENS || art.age > shatterAt - .09 || art.locked.size < STONE_CONTOUR_MIN) return;
  const held = contourGroup([...art.locked.values()].filter(enemy=>enemy.hp>0 && game.time-enemy.dragonArtHeldAt >= .13)
    .slice(0,64));
  if (held.length < STONE_CONTOUR_MIN) return;
  contour.held = true;
  const center = contourCenter(held);
  const radius = clamp(Math.max(...held.map(site=>distance(center,site)))+1.2,4,11);
  const hold = shatterAt-art.age;
  game.emit('dragonArtReaction', {...eventData(art), ...center, reaction:'stone-contour-hold',
    from:center,to:center,leg:0,radius,width:radius,hold,duration:hold,receiverIds:held.map(enemy=>enemy.id),
    targets:held.map(enemy=>({...point(enemy),id:enemy.id,radius:enemy.radius}))});
}

function contourPathContact(path, target, width, last, leading) {
  for (let i=1;i<path.length;i++) {
    const a=path[i-1], b=path[i];
    if (b.along<last-.50 || a.along>leading+.55) continue;
    const dx=b.x-a.x, dz=b.z-a.z, span=b.along-a.along;
    const t=clamp(((target.x-a.x)*dx+(target.z-a.z)*dz)/(span*span),0,1);
    const along=a.along+span*t;
    if (along<last-.50 || along>leading+.55) continue;
    const sample={x:a.x+dx*t,y:a.y+(b.y-a.y)*t,z:a.z+dz*t};
    if (Math.abs(target.y-sample.y)<=2.65 && distance(sample,target)<=width+(target.radius??0)*.29) return sample;
  }
  return null;
}

function contourRoutes(game, art, from) {
  const fan = art.doctrine==='reach';
  const radius = fan ? 15.2 : 20.5;
  const width = fan ? 4.5 : 3.6;
  const candidates = nearby(game,from,radius,6.2).filter(enemy=>stoneMarchUntouched(art,enemy)&&
    distance(from,enemy)>5.2).slice(0,48);
  const options = [];
  const outward = facing(toward(art.center,from));
  const directionTo = target=>facing(toward(from,target));
  for (const anchor of candidates) {
    const direction=directionTo(anchor);
    const side = Math.sign(outward.x*direction.z-outward.z*direction.x) || 1;
    const bend = fan ? .8*side : Math.min(3.2,distance(from,anchor)*.18)*side;
    const target = {x:anchor.x+direction.x*1.7,y:anchor.y,z:anchor.z+direction.z*1.7};
    const path = stoneMarchPath(game,from,target,bend) ?? stoneMarchPath(game,from,point(anchor),bend*.5);
    if (!path) continue;
    const length = path.at(-1).along;
    const receivers = candidates.filter(enemy=>{
      const contact=contourPathContact(path,enemy,width,4.2,length);
      return contact&&openRiftLane(game,contact,point(enemy));
    }).slice(0,STONE_CONTOUR_REACH_CAP);
    if (receivers.length<2) continue;
    const score = Math.min(12,receivers.length)*2 - length*(fan?.13:.035);
    options.push({path,receivers,score,width,direction});
  }
  options.sort((a,b)=>b.score-a.score);
  const first = options[0];
  if (!first || !fan) return first ? [first] : [];
  const used = new Set(first.receivers.map(enemy=>enemy.id));
  for (const next of options.slice(1)) {
    if (first.direction.x*next.direction.x + first.direction.z*next.direction.z>.52) continue;
    const receivers=next.receivers.filter(enemy=>!used.has(enemy.id));
    if (receivers.length>=2) return [first,{...next,receivers}];
  }
  return [first];
}

function updateStoneContour(game, art) {
  const contour = art.stoneContour;
  if (!contour.spent && contour.breaks.size >= STONE_CONTOUR_MIN && art.age>=contour.scanAt && art.age<STONE_CONTOUR_CLOSES) {
    contour.scanAt = art.age+.13;
    const sources=contourGroup([...contour.breaks.values()]);
    if (sources.length >= STONE_CONTOUR_MIN) {
      const center=contourCenter(sources);
      const routes=contourRoutes(game,art,center);
      if (routes.length) {
        contour.spent=true;
        for (const [index, route] of routes.entries()) {
          const {path,width,receivers}=route;
          const from=path[0], to=path.at(-1), length=to.along;
          const windup=STONE_CONTOUR_WINDUP+index*.09;
          const travel=clamp(length/25,.40,.78);
          const leg=index+1;
          const branch=art.doctrine==='reach'?'fan':'sweep';
          const ids=receivers.map(enemy=>enemy.id);
          const direction=facing(toward(from,to));
          const sourceIds=sources.map(site=>site.id);
          contour.fronts.push({from,to,path,length,width,windup,travel,started:art.age,last:4.2,leg,branch,direction,
            ids:new Set(ids),sourceIds});
          for (const id of ids) contour.receivers.add(id);
          game.emit('dragonArtReaction',{...eventData(art), ...point(to),reaction:'stone-contour',
            from,to,points:path,width,radius:width,windup,travel,duration:windup+travel,leg,branch,direction,
            sourceIds,targets:sources,receiverIds:ids,receiverTargets:receivers.map(enemy=>({...point(enemy),id:enemy.id}))});
        }
      }
    }
  }
  for (const front of contour.fronts) {
    if (front.done) continue;
    const reached=front.length*progress(art.age,front.started+front.windup,front.started+front.windup+front.travel);
    if(reached<=front.last)continue;
    const focus=stoneMarchPosition(front.path,reached);
    for (const enemy of nearby(game,focus,front.width+reached-front.last+2,4.3)) {
      if (!front.ids.has(enemy.id)||art.hitTargets.has(enemy.id)||art.locked.has(enemy.id)||art.secondary.has(enemy.id)) continue;
      const contact=contourPathContact(front.path,enemy,front.width,front.last,reached);
      if (!contact || !openRiftLane(game,contact,point(enemy))) continue;
      front.ids.delete(enemy.id);
      contour.receivers.delete(enemy.id);
      art.secondary.add(enemy.id);
      art.hitTargets.add(enemy.id);
      knockBackEnemy(game,enemy,{x:enemy.x-front.direction.x,z:enemy.z-front.direction.z},'tail',art.rank);
      strike(game,art,enemy,contact,art.doctrine==='reach'?1.07:1.16,'stone-contour',false,front.sourceIds[0],undefined,
        {leg:front.leg,branch:front.branch,sourceIds:front.sourceIds});
    }
    front.last=reached;
    if(reached>=front.length) {
      front.done=true;
      for (const id of front.ids) contour.receivers.delete(id);
    }
  }
}

function updateStoneMarch(game, art) {
  const march = art.stoneMarch;
  if (!art.shattered) return;
  if (!march.entrants) markStoneMarchEntrants(game,art,march);
  if (!march.front) {
    if (!march.anchors.length || art.age<march.nextAt || art.age>=STONE_MARCH_CLOSES) return;
    march.nextAt = art.age + .13;
    const match = findStoneMarch(game,art,march);
    if (!match) return;
    const {site,support,path,receivers} = match;
    const from = path[0], to = path.at(-1), length = to.along;
    const windup = .23, travel = clamp(length/23,.44,.88);
    march.front = {site,path,length,windup,travel,started:art.age,last:0};
    march.anchors.length = 0;
    game.emit('dragonArtReaction', {
      ...eventData(art), ...point(to), reaction:'stone-march', from, to, points:path,
      radius:STONE_MARCH_WIDTH, width:STONE_MARCH_WIDTH, windup, travel, duration:windup+travel,
      sourceId:site.id, sourceIds:[site.id,support.id], targets:[point(site),point(support)],
      receiverIds:receivers.map(enemy=>enemy.id),
    });
    return;
  }
  const {front} = march;
  const reached = front.length*progress(art.age,front.started+front.windup,front.started+front.windup+front.travel);
  if (reached<=front.last) return;
  const from = stoneMarchPosition(front.path,front.last), to = stoneMarchPosition(front.path,reached);
  const dx = to.x-from.x, dz = to.z-from.z, length = Math.hypot(dx,dz);
  if (length>.001) {
    for (const enemy of nearby(game,to,STONE_MARCH_WIDTH+length,3.45)) {
      if (!stoneMarchUntouched(art,enemy)) continue;
      const along = ((enemy.x-from.x)*dx+(enemy.z-from.z)*dz)/length;
      if (along<-.4 || along>length+.50) continue;
      const t = clamp(along/length,0,1);
      const origin = {x:from.x+dx*t,y:from.y+(to.y-from.y)*t,z:from.z+dz*t};
      if (distance(enemy,origin)>STONE_MARCH_WIDTH+enemy.radius*.28 || Math.abs(enemy.y-origin.y)>2.8) continue;
      art.secondary.add(enemy.id);
      knockBackEnemy(game,enemy,{x:enemy.x-dx/length,z:enemy.z-dz/length},'tail',art.rank);
      strike(game,art,enemy,origin,.68,'stone-march',false,front.site.id);
    }
  }
  front.last = reached;
  if (reached>=front.length) march.front = null;
}

function queueIceFork(art, enemy) {
  if (art.iceFork.pending.length < 8) art.iceFork.pending.push({...point(enemy), id:enemy.id, at:art.age});
}

function iceConducts(game, from, to, grounded) {
  if (game.stage < 3) return true;
  const terrain = game.terrainHeight;
  if (!terrain) return true;
  for (const t of [.25,.5,.75]) {
    const x = from.x+(to.x-from.x)*t, z = from.z+(to.z-from.z)*t;
    const y = from.y+(to.y-from.y)*t;
    if (terrain(x,z) > y + (grounded ? .9 : .30)) return false;
  }
  return true;
}

function iceForkTargets(game, art, from, branch, depth, direction) {
  const relay = art.rank === 3 && art.doctrine === 'echo';
  const range = depth ? relay ? 8.3 : 6.8 : art.rank === 3 ? 9.2 : 7.5;
  const height = art.doctrine === 'reach' && !depth ? 6.0 : depth ? 3.5 : 4.7;
  const eligible = [];
  for (const enemy of nearby(game,from,range,height)) {
    if (enemy.boss || enemy.wet <= 0 || enemy.id === from.id || art.iceFork.hits.has(enemy.id) ||
        art.iceFork.reserved.has(enemy.id)||art.iceSheets?.reserved.has(enemy.id)) continue;
    if(art.doctrine==='thaw'&&art.secondary.has(enemy.id))continue;
    const rise = enemy.y-from.y;
    const dx = enemy.x-from.x, dz = enemy.z-from.z;
    const span = Math.hypot(dx, dz, rise);
    if (span < 2.1 || span > range || Math.abs(rise) > height) continue;
    if (direction && dx*direction.x + dz*direction.z < -.3) continue;
    if (!depth && (branch === 'upper' && rise < 1.5 || branch === 'lower' && rise > -1.5 ||
      branch === 'surface' && Math.abs(rise) > 1.8)) continue;
    if (depth && branch === 'surface' && Math.abs(rise) > 2.15) continue;
    if (!iceConducts(game,from,enemy,branch==='surface')) continue;
    const local = art.locked.has(enemy.id) ? relay ? 2.3 : .65 : art.hitTargets.has(enemy.id) ? 2.6 : 0;
    eligible.push({enemy, score:span+local});
  }
  return eligible.sort((a,b)=>a.score-b.score || a.enemy.id-b.enemy.id).map(entry=>entry.enemy);
}

function iceShelf(game, art, target, from, branch) {
  return nearby(game, target, 3.4, 1.05).filter(enemy =>
    enemy.id !== target.id && enemy.id !== from.id && !enemy.boss && enemy.wet > 0 &&
    (art.doctrine!=='thaw'||!art.secondary.has(enemy.id)) &&
    !art.iceFork.hits.has(enemy.id) && !art.iceSheets?.reserved.has(enemy.id) && Math.abs(enemy.y - target.y) <= 1.05 &&
    distance(enemy, target) <= 3.3 && iceConducts(game, target, enemy, branch === 'surface'))
    .sort((a, b) => distance(a, target) - distance(b, target) || a.id - b.id).slice(0, 2);
}

function announceIcePath(game, art, path, windup, redirected = false) {
  const {from, to, target, branch, depth, grounded, leg, formation, lane} = path;
  game.emit('dragonArtReaction', {
    ...eventData(art), ...to, reaction:'frost-thunder-fork', carrier:'ice-shell', from:point(from), to,
    targetId:target.id, sourceId:from.id, branch, depth, grounded, leg, formation, lane, redirected,
    windup, duration:windup, radius:formation==='shelf'?3.4:grounded?2.3:1.45,
    receivers:path.receivers.map(enemy=>({id:enemy.id,...point(enemy)})),
  });
}

function reserveIceTarget(game, art, path, target) {
  const fork = art.iceFork;
  fork.hits.add(target.id);
  fork.reserved.add(target.id);
  if (path.formation==='shelf') {
    lock(game,art,target,path.at,path.from,{formation:path.formation,leg:path.leg,branch:path.branch,depth:path.depth});
    target.dragonArtHeldUntil=Math.max(target.dragonArtHeldUntil,art.startedAt+path.at+.04);
  } else if (path.formation==='relay') {
    slowIceTarget(game,target,.48,path.at-art.age+.06);
  }
}

function slowIceTarget(game, target, factor, duration) {
  if (target.frostSlowUntil > game.time && target.frostSlowFactor < factor) return;
  target.frostSlowFactor = factor;
  target.frostSlowUntil = Math.max(target.frostSlowUntil ?? 0,game.time+duration);
}

function startIceFork(game, art, from, target, branch, depth, delay = 0, lane) {
  const fork = art.iceFork;
  const formation = art.rank < 3 ? undefined : art.doctrine==='echo' ? 'relay' : !depth ? 'shelf' : undefined;
  const windup = (depth ? .15 : formation==='relay' ? .16 : .21) + delay;
  const receivers = formation==='shelf' ? [target,...iceShelf(game,art,target,from,branch)] : [target];
  // Shattering a shelf early substitutes for the main front at its overlap.
  // Only newly reached shelf neighbours receive the lighter side fracture.
  const mainShells = formation==='shelf' && !art.shattered ? new Set(receivers.filter(enemy=>
    art.locked.has(enemy.id) || (!art.hitTargets.has(enemy.id) &&
      distance(enemy,art.center)<=art.radius*1.18+(enemy.radius??0)*.35 &&
      Math.abs(enemy.y-art.center.y)<=art.height+(art.rank-1)+(enemy.radius??0)*.33))
    .map(enemy=>enemy.id)) : null;
  const path = {
    from, to:point(target), target, receivers, branch, depth, lane, formation,
    grounded:branch==='surface', leg:++fork.nextLeg, at:art.age+windup, mainShells,
  };
  fork.paths.push(path);
  for (const receiver of receivers) reserveIceTarget(game,art,path,receiver);
  announceIcePath(game,art,path,windup);
}

function oppositeIceWing(source, first, second) {
  const one = facing(toward(source, first));
  const two = facing(toward(source, second));
  return one.x*two.x + one.z*two.z < .47 && distance(first,second) > 4.1;
}

function openPrismFork(game, art, source) {
  if (art.doctrine==='reach') return false;
  const range = art.rank===3 ? 12.0 : 10.5;
  for (const prism of game.techniqueArts) {
    if (prism.kind!=='icekeel') continue;
    const span=Math.hypot(distance(source,prism.center),source.y-prism.center.y);
    if (span<2.1 || span>range) continue;
    const target=frostPrismReceiver(game,art,source,prism,FROST_PRISM_WINDUP);
    if (!target||art.iceSheets?.reserved.has(target.id)) continue;
    const fork=art.iceFork;
    // Transfer one live flank to the prism instead of also resolving it in
    // the radial shatter. Other weapons and enemy movement still apply.
    const path={from:source,to:point(prism.center),prism,target,at:art.age+FROST_PRISM_WINDUP,leg:++fork.nextLeg};
    fork.paths.push(path);
    fork.reserved.add(target.id);
    game.emit('dragonArtReaction',{...eventData(art),...path.to,reaction:'frost-prism-fork',
      from:point(source),to:path.to,sourceId:source.id,anchorId:prism.anchorId,targetId:target.id,leg:path.leg,
      windup:FROST_PRISM_WINDUP,duration:FROST_PRISM_WINDUP});
    return true;
  }
  return false;
}

function openIceFork(game, art, source) {
  const surface = iceForkTargets(game,art,source,'surface',0);
  const first = surface[0];
  if (first && art.rank===3 && art.doctrine==='echo') {
    const other=surface.find(enemy=>oppositeIceWing(source,first,enemy));
    if (other) {
      const dx = first.x-other.x, dz = first.z-other.z;
      const lane = dx*art.direction.z-dz*art.direction.x < 0 ? 'left' : 'right';
      startIceFork(game,art,source,first,'surface',0,0,lane);
      startIceFork(game,art,source,other,'surface',0,.105,lane==='left'?'right':'left');
      return true;
    }
  }
  const upper = iceForkTargets(game,art,source,'upper',0)[0];
  const lower = iceForkTargets(game,art,source,'lower',0)[0];
  if (upper && lower && art.rank===3) {
    startIceFork(game,art,source,upper,'upper',0);
    startIceFork(game,art,source,lower,'lower',0,.13);
    return true;
  }
  const next = upper ?? lower ?? first;
  if (!next) return openPrismFork(game,art,source);
  startIceFork(game,art,source,next,upper?'upper':lower?'lower':'surface',0);
  return true;
}

function canReceiveIce(game, path, enemy) {
  if (enemy.hp <= 0 || enemy.wet <= 0) return false;
  const shelf = path.formation === 'shelf';
  if (distance(path.to,enemy) > (shelf ? 3.55 : 2.9) || Math.abs(path.to.y-enemy.y) > (shelf ? 1.12 : 1.7)) return false;
  return iceConducts(game,path.from,enemy,path.grounded);
}

function releaseIceTarget(game, art, path, target) {
  const fork = art.iceFork;
  fork.reserved.delete(target.id);
  if (art.locked.has(target.id)) {
    if (target.hp <= 0) shatterShell(game,art,target,path.from);
    art.locked.delete(target.id);
    art.contactFractures.delete(target.id);
    fork.shards.delete(target.id);
    art.hitTargets.add(target.id);
    release(target);
  }
}

function icePathAlternate(game, art, path) {
  const {from,to,branch,depth,formation,grounded} = path;
  const direction = facing(toward(from,to));
  if (formation==='shelf') return null;
  for (const target of iceForkTargets(game,art,from,branch,depth,direction)) {
    const dx = target.x-from.x, dz = target.z-from.z;
    const width = formation==='relay' ? 3.65 : 2.65;
    if (dx*direction.x+dz*direction.z < 1.5 || Math.abs(dx*direction.z-dz*direction.x) > width) continue;
    if (grounded ? Math.abs(target.y-to.y)>1.55 : Math.abs(target.y-to.y)>2.15) continue;
    return target;
  }
  return null;
}

function landIcePath(game, art, path) {
  const {from, branch, depth, grounded, formation, lane, leg} = path;
  if (path.prism) {
    const prism=path.prism;
    const {target}=path;
    if (game.techniqueArts.includes(prism) && frostPrismReceiver(game,art,from,prism,0,target.id)) {
      game.emit('arc',{from:point(from),to:path.to,power:1.7,conductive:true,source:'dragon-art-frost',
        targetId:prism.anchorId,prismRelay:{dragonArtId:art.id,forkLeg:leg,prismId:prism.id,lateral:true,
          reservedTargetId:target.id,sourceId:from.id}});
      if (prism.charge?.relay?.forkLeg===leg) return;
    }
    art.iceFork.reserved.delete(target.id);
    if (art.shattered && art.locked.delete(target.id)) {
      art.contactFractures.delete(target.id);
      release(target);
    }
    return;
  }
  const alive = path.receivers.filter(enemy=>canReceiveIce(game,path,enemy));
  if (!alive.length) {
    for (const target of path.receivers) releaseIceTarget(game,art,path,target);
    const alternate = !path.redirected && icePathAlternate(game,art,path);
    if (alternate) {
      const extension=.095;
      Object.assign(path,{to:point(alternate),target:alternate,receivers:[alternate],at:art.age+extension,redirected:true});
      reserveIceTarget(game,art,path,alternate);
      announceIcePath(game,art,path,extension,true);
      art.iceFork.paths.push(path);
    }
    return;
  }
  // The lead remains grounded in the wet shelf. Surviving neighbours can
  // carry that same contact if another actual spell defeats the lead first.
  const leader = alive[0];
  const end = {...point(leader),id:leader.id};
  const redirected = Boolean(path.redirected || path.target!==leader);
  if (path.target!==leader) announceIcePath(game,art,{...path,target:leader,to:end,receivers:alive},0,true);
  game.emit('arc',{from:point(from),to:point(leader),power:grounded?1.7:2.3,conductive:true,source:'dragon-art-frost',
    targetId:leader.id, prismRelay:art.rank===2 || formation==='relay' ? {dragonArtId:art.id,forkLeg:leg} : undefined});
  for (const [index,target] of alive.entries()) {
    const locked = art.locked.has(target.id);
    slowIceTarget(game,target,grounded?.46:.64,grounded?.46:.27);
    target.charge = Math.max(target.charge,2.4);
    const power = path.mainShells?.has(target.id) ? 1.32 : index ? .40 : locked && formation!=='shelf' ? 1.22 : .85-depth*.16;
    strike(game,art,target,index ? end : from,power,'frost-thunder-fork',false,from.id,undefined,{
      leg, formation, lane, branch, depth, redirected, receiver:index,
    });
  }
  for (const target of path.receivers) releaseIceTarget(game,art,path,target);
  if (depth === 0 && art.rank === 3 && (art.doctrine==='echo' || !grounded)) {
    const next = iceForkTargets(game,art,end,branch,1,facing(toward(from,end)))[0];
    if (next) startIceFork(game,art,end,next,branch,1,0,lane);
  }
}

function updateIceFork(game, art) {
  const fork = art.iceFork;
  if (!fork) return;
  const paths = fork.paths;
  fork.paths = [];
  for (const path of paths) {
    if (art.age < path.at || art.hitBudget <= 0) {
      fork.paths.push(path);
    } else {
      landIcePath(game,art,path);
    }
  }
  if (fork.started < (art.rank===3 ? 2 : 1) && art.age >= (fork.nextStartAt ?? 0)) {
    const index = fork.pending.findIndex(source=>openIceFork(game,art,source));
    if (index >= 0) {
      fork.pending.splice(index,1);
      fork.started++;
      // Two reactions from the same thunder volley arrive on distinct beats.
      fork.nextStartAt = art.age + .075;
    }
  }
  fork.pending = fork.pending.filter(source=>art.age-source.at<.52);
}

function updateStasis(game, art) {
  const stone = art.kind === 'stone';
  const shatterAt = stone ? 1.44 : 1.05;
  if (art.phase === 'wave' || art.phase === 'freeze') {
    reactOnContact(game,art);
    art.frontRadius = art.radius * smooth(progress(art.age, 0, stone ? .96 : .32));
    for (const enemy of nearby(game, art.center, art.frontRadius, art.height)) {
      if(!art.hitTargets.has(enemy.id))lock(game, art, enemy, shatterAt + .21);
    }
    if(art.stoneContour)announceStoneHold(game,art,shatterAt);
    if (!stone) {
      // Water and rain prepare a second, irregular front ahead of the ice.
      // Extending altitude here catches wet units in a different flight lane.
      const extra = (art.rank - 1) * 1.0;
      const reach = art.frontRadius * 1.18;
      for (const enemy of nearby(game, art.center, reach, art.height + extra)) {
        const height=Math.abs(enemy.y-art.center.y);
        const outerCold=art.doctrine==='reach'&&height>=art.height&&distance(enemy,art.center)<=art.frontRadius*.86;
        if ((enemy.wet>0||outerCold)&&!art.hitTargets.has(enemy.id))lock(game,art,enemy,shatterAt+.21);
      }
    }
    if(art.iceSheets&&!art.iceSheets.ready&&art.age>=FROST_SHEET_OPEN)openFrostSheets(game,art);
    if (art.age >= shatterAt) {
      phase(game, art, 'shatter', shatterAt);
    }
  }
  if (art.phase === 'shatter') {
    if (!art.shattered) {
      const full = art.phaseAge >= .19;
      shatter(game, art, art.phaseAge, full);
      art.shattered = full;
    }
    if(art.stoneContour)updateStoneContour(game,art);
    localAftershocks(game, art);
  }
}

function frostSheetPoint(enemy) {
  return {...point(enemy),id:enemy.id,radius:enemy.radius};
}

function frostSheetPath(game, targets) {
  const first=targets[0];
  const farthest=(from)=>targets.reduce((best,enemy)=>distance(enemy,from)>distance(best,from)?enemy:best,first);
  const a=farthest(first), b=farthest(a);
  const length=distance(a,b);
  if(length<3.0)return null;
  const path=openRiftLane(game,point(a),point(b));
  if(!path)return null;
  const ordered=targets.toSorted((left,right)=>distance(left,a)-distance(right,a)||left.id-right.id);
  const width=clamp(Math.max(...ordered.map(enemy=>Math.abs((enemy.x-a.x)*path.dz-(enemy.z-a.z)*path.dx)/length))+.9,2.8,5.5);
  return {path,targets:ordered.filter(enemy=>iceConducts(game,a,enemy,false)),width};
}

function frostSheetData(art, front, present) {
  const {path,width,branch,leg}=front;
  return {...eventData(art),...path.to,from:path.from,to:path.to,points:path.points,width,radius:width,
    branch,leg,receiverIds:present.map(enemy=>enemy.id),targets:present.map(frostSheetPoint)};
}

function claimFrostSheet(game,art,group,branch,at,newHold=false) {
  if(group.length<5)return false;
  const plot=frostSheetPath(game,group);
  if(!plot||plot.targets.length<5)return false;
  const leg=art.iceSheets.fronts.length+1;
  const front={...plot,leg,branch,at};
  art.iceSheets.fronts.push(front);
  for(const enemy of front.targets) {
    if(newHold&&!art.locked.has(enemy.id))lock(game,art,enemy,at+.04,plot.path.from,{leg,formation:'frost-sheet'});
    art.iceSheets.reserved.add(enemy.id);
    enemy.dragonArtHeldUntil=Math.max(enemy.dragonArtHeldUntil??0,art.startedAt+at+.08);
  }
  const travel=Math.max(.17,at-art.age-.08);
  game.emit('dragonArtReaction',{...frostSheetData(art,front,front.targets),reaction:'frost-sheet',
    windup:.08,travel,hold:.09,duration:at-art.age+.14});
  return true;
}

function openFrostSheets(game,art) {
  const sheets=art.iceSheets;
  sheets.ready=true;
  const candidates=[...art.locked.values()].filter(enemy=>enemy.hp>0&&!art.iceFork.reserved.has(enemy.id));
  if(candidates.length<9)return;
  const level=enemy=>enemy.y-art.center.y;
  const side=enemy=>(enemy.x-art.center.x)*art.direction.z-(enemy.z-art.center.z)*art.direction.x;
  const iceEdge = art.doctrine==='reach' ? level : side;
  const local=candidates.toSorted((a,b)=>Math.abs(level(a))-Math.abs(level(b))||
    distance(a,art.center)-distance(b,art.center)||a.id-b.id).slice(0,24);
  if(!claimFrostSheet(game,art,local,'main',FROST_SHEET_FIRST))return;
  if(art.rank<3||art.doctrine==='thaw')return;
  const open=nearby(game,art.center,art.radius*1.26,art.height+3.5).filter(enemy=>!enemy.boss&&
    !sheets.reserved.has(enemy.id)&&!art.hitTargets.has(enemy.id)&&!art.iceFork.hits.has(enemy.id)&&
    (enemy.wet>0||art.locked.has(enemy.id))&&iceConducts(game,art.center,enemy,false));
  const scores=[-1,1].map(sign=>({sign,group:open.filter(enemy=>iceEdge(enemy)*sign>=(art.doctrine==='reach'?2.25:3.6))}));
  const best=scores.sort((a,b)=>b.group.length-a.group.length)[0];
  const order=best.group.toSorted((a,b)=>Math.abs(iceEdge(a)-iceEdge(b))<.6 ? a.id-b.id : Math.abs(iceEdge(b))-Math.abs(iceEdge(a)));
  claimFrostSheet(game,art,order.slice(0,18),art.doctrine==='reach'?(best.sign>0?'upper':'lower'):'cross',FROST_SHEET_SECOND,true);
}

function breakFrostSheets(game,art) {
  const sheets=art.iceSheets;
  if(!sheets?.fronts.length)return;
  for(const front of sheets.fronts) {
    if(front.done||art.age<front.at||art.hitBudget<=0)continue;
    const actual=[];
    const firstBreak=art.killCount;
    while (front.targets.length&&art.hitBudget>0) {
      const enemy=front.targets.shift();
      sheets.reserved.delete(enemy.id);
      if(!art.locked.delete(enemy.id))continue;
      const contact=art.contactFractures.get(enemy.id);
      art.contactFractures.delete(enemy.id);
      release(enemy);
      if(contact?.thermal)recordTemperedShell(art,enemy);
      if(enemy.hp<=0) {
        shatterShell(game,art,enemy,front.path.from);
        continue;
      }
      art.hitTargets.add(enemy.id);
      const wet=enemy.wet>0;
      if(wet) {
        if(art.rank===3)addFracture(art,enemy);
        if(contact?.thunder)queueIceFork(art,enemy);
        else if(enemy.hp>art.damage*1.32&&art.iceFork.shards.size<32) {
          art.iceFork.shards.set(enemy.id,{...point(enemy),id:enemy.id,at:art.age});
        }
      }
      if(contact?.thermal&&art.steamSites.length<3&&!art.steamSites.some(site=>distance(site,enemy)<5.4)) {
        art.steamSites.push(point(enemy));
        createReaction(game,art,enemy,'steam-bloom',4.5);
      }
      actual.push(enemy);
      strike(game,art,enemy,front.path.from,wet?1.32:1,'frost-sheet-shatter',false,undefined,undefined,
        {leg:front.leg,branch:front.branch});
    }
    front.done=front.targets.length===0;
    if(actual.length)game.emit('dragonArtReaction',{...frostSheetData(art,front,actual),reaction:'frost-sheet-shatter',
      burstKills:art.killCount-firstBreak,duration:.49});
  }
}

function recordTemperedShell(art,enemy) {
  const rush=art.temperRush;
  if(!rush||rush.sent)return;
  const contact=rush.contacts.get(enemy.id);
  if(!contact)return;
  rush.contacts.delete(enemy.id);
  rush.sites.push({...contact,...point(enemy),at:art.age});
}

function temperReceiver(art,enemy) {
  return !enemy.boss&&!art.hitTargets.has(enemy.id)&&!art.locked.has(enemy.id)&&!art.secondary.has(enemy.id)&&
    !art.iceFork.reserved.has(enemy.id)&&!art.iceSheets?.reserved.has(enemy.id);
}

function temperLane(game,from,to,lift=2.1) {
  const span=distance(from,to);
  const points=[{...from,along:0}];
  const samples=Math.ceil(span/1.15);
  for(let index=1;index<=samples;index++){
    const step=index/samples;
    const x=from.x+(to.x-from.x)*step,z=from.z+(to.z-from.z)*step;
    const linear=from.y+(to.y-from.y)*step;
    const rise=Math.sin(step*Math.PI)*Math.min(lift,span*.12);
    const planned={x,y:linear+rise,z};
    const position={...planned};
    game.stayInWater(position,.33,points.at(-1));
    if(distance(position,planned)>.28||Math.abs(position.y-planned.y)>.48)return null;
    points.push({...position,along:points.at(-1).along+distance(points.at(-1),position)});
  }
  return points;
}

function beyondFrostSheets(art,enemy) {
  const radius = art.radius * (enemy.wet > 0 ? 1.26 : 1);
  const height = art.height + (enemy.wet > 0 ? 3.5 : 0);
  return distance(enemy,art.center)>radius+.65 || Math.abs(enemy.y-art.center.y)>height+.42;
}

function thawFlank(game,art,from) {
  const candidates = nearby(game,from,39,art.height+7).filter(enemy=>temperReceiver(art,enemy)&&
    !art.iceFork.hits.has(enemy.id)&&beyondFrostSheets(art,enemy)&&distance(enemy,from)>=8.5);
  const width=8.9;
  const range=11.8;
  let best;
  for(const anchor of candidates.slice(0,54)) {
    const direction=facing(toward(from,anchor));
    const to={x:anchor.x+direction.x*1.35,y:anchor.y+.14,z:anchor.z+direction.z*1.35};
    const group=candidates.filter(enemy=>distance(enemy,anchor)<range&&Math.abs(enemy.y-anchor.y)<4.2);
    if(group.length<3)continue;
    const path=temperLane(game,from,to,3.4);
    if(!path)continue;
    const length=path.at(-1).along;
    const first=Math.max(6.4,length-range);
    const targets=group.filter(enemy=>{
      const contact=steamContact(path,enemy,first,length);
      return contact&&contact.gap<=width&&iceConducts(game,contact,enemy,false);
    }).slice(0,20);
    if(targets.length<3)continue;
    const score=targets.length+.04*length;
    if(!best||score>best.score)best={path,length,targets,score,first,width,formation:THAW_FLANK};
  }
  return best;
}

function temperRushLane(game,art,from,sources) {
  const width=Math.min(5.6,3.65+sources.length*.23);
  const candidates=nearby(game,from,22,art.height+3).filter(enemy=>temperReceiver(art,enemy)&&distance(from,enemy)>4.5)
    .sort((a,b)=>distance(a,from)-distance(b,from)||a.id-b.id).slice(0,42);
  let best;
  for(const anchor of candidates) {
    const direction=facing(toward(from,anchor));
    const to={x:anchor.x+direction.x*2.2,y:anchor.y+.15,z:anchor.z+direction.z*2.2};
    const path=temperLane(game,from,to);
    if(!path)continue;
    const length=path.at(-1).along;
    const targets=candidates.filter(enemy=>(steamContact(path,enemy,3.8,length)?.gap??Infinity)<=width).slice(0,18);
    if(targets.length<2)continue;
    const heat=sources.some(source=>source.heading&&source.heading.x*direction.x+source.heading.z*direction.z>.48);
    const score=targets.length+.36*Number(heat)-.038*length;
    if(!best||score>best.score)best={path,length,targets,score,width};
  }
  return best;
}

function launchTemperRush(game,art,rush) {
  const thaw=art.doctrine==='thaw'&&art.rank===3;
  const recent=rush.sites.filter(site=>art.age-site.at<(thaw?1.18:.66));
  const sources=recent.reduce((best,site)=>{
    const joined=recent.filter(other=>distance(site,other)<8.8&&Math.abs(site.y-other.y)<3.5);
    return joined.length>best.length?joined:best;
  },[]).slice(0,10);
  if(sources.length<2)return;
  const from=sources.reduce((sum,p)=>({x:sum.x+p.x/sources.length,y:sum.y+p.y/sources.length,z:sum.z+p.z/sources.length}),{x:0,y:0,z:0});
  let best=thaw?thawFlank(game,art,from):null;
  if(!best&&(!thaw||art.age>=1.32))best=temperRushLane(game,art,from,sources);
  if(!best)return;
  const {path,length,targets,formation,first=3.8,width}=best;
  const to=point(path.at(-1));
  const windup=formation ? .18 : .12;
  const travel=formation ? clamp(length/32,.47,.84) : clamp(length/30,.37,.65);
  const releaseAt=art.age+windup+travel;
  const arrives=formation ? Math.max(releaseAt+.18,FROST_SHEET_FIRST+.22) : releaseAt;
  const sourceIds=sources.map(source=>source.id), receiverIds=targets.map(enemy=>enemy.id);
  rush.sent=true;
  rush.front={from,to,path,length,width,windup,travel,started:art.age,last:first,sourceIds,sources,formation,arrives,
    receivers:new Set(receiverIds),hits:[],leg:1};
  game.emit('dragonArtReaction',{...eventData(art),...to,reaction:'frost-temper-rush',from,to,points:path,width,radius:width,
    windup,travel,settle:arrives-releaseAt,duration:arrives-art.age,formation,
    leg:1,sourceIds,sources,receiverIds,targets:targets.map(frostSheetPoint)});
}

function updateTemperRush(game,art) {
  const rush=art.temperRush;
  if(!rush)return;
  if(!rush.sent&&rush.sites.length>=2&&art.age>=rush.nextAt&&art.age<1.92) {
    rush.nextAt=art.age+.10;
    launchTemperRush(game,art,rush);
  }
  const front=rush.front;
  if(!front||art.hitBudget<=0||game.activeDragonArt!==art||game.status!=='playing')return;
  const {from,to,path,length,width,windup,travel,started,sourceIds,leg,formation,arrives}=front;
  if(formation&&art.age<arrives)return;
  const reached=formation?length:length*progress(art.age,started+windup,started+windup+travel);
  if(reached<=front.last)return;
  const center=steamwakePoint(path,(front.last+reached)*.5);
  for(const enemy of nearby(game,center,(reached-front.last)*.5+width+1.5,width+1.4)) {
    if(!front.receivers.has(enemy.id)||!temperReceiver(art,enemy))continue;
    if(formation&&art.iceFork.hits.has(enemy.id))continue;
    const contact=steamContact(path,enemy,Math.max(3.8,front.last-.17),Math.min(length,reached+.55));
    if(!contact||contact.gap>width||!iceConducts(game,contact,enemy,false))continue;
    if(art.hitBudget<=0)return;
    front.receivers.delete(enemy.id);
    art.secondary.add(enemy.id);
    art.hitTargets.add(enemy.id);
    enemy.burn=0;
    enemy.wet=Math.max(enemy.wet,4.2);
    const hit=frostSheetPoint(enemy);
    strike(game,art,enemy,contact,1.17,'frost-temper-rush',false,sourceIds[0],undefined,{leg,sourceIds,formation});
    front.hits.push({...hit,killed:enemy.hp<=0});
  }
  front.last=reached;
  if(reached<length)return;
  rush.front=null;
  const {hits}=front;
  if(!hits.length) {
    if(formation)game.emit('dragonArtReaction',{...eventData(art),...to,reaction:'frost-temper-rush-cancel',formation,leg});
    return;
  }
  game.metrics.steam++;
  game.metrics.reactions++;
  game.emit('dragonArtReaction',{...eventData(art),...to,reaction:'frost-temper-rush-hit',from,to,points:path,width,
    radius:width,leg,sourceIds,formation,receiverIds:hits.map(hit=>hit.id),targets:hits,burstKills:hits.filter(hit=>hit.killed).length,duration:.46});
  if(formation===THAW_FLANK)storeThawThunder(game,art,hits);
}

function slide(game, art, enemy, x, y, z, center) {
  const before = point(enemy);
  const edge = game.exploring ? Infinity : 67;
  enemy.x = clamp(enemy.x + x, -edge, edge);
  enemy.z = clamp(enemy.z + z, -edge, edge);
  enemy.y += y;
  game.stayInWater(enemy, .4, before);
  game.enemyGrid?.relocate(game.enemies, enemy, before.x, before.z);
  if(Math.abs(enemy.x-before.x)+Math.abs(enemy.y-before.y)+Math.abs(enemy.z-before.z)>.001){
    enemy.dragonArtPull=art.id;
    enemy.dragonArtPullAt=game.time;
    enemy.dragonArtPullCenter=center;
  }
}

function createReaction(game, art, center, reaction, radius) {
  const steam = reaction === 'steam-bloom';
  const zone = game.addZone(steam ? 'steam' : 'fire', {
    ...point(center), radius, life: steam ? 4.5 : 3.25, power: 1, weaponAnchor: 'dragon-art-reaction',
  });
  if (!zone) return;
  if (steam) game.metrics.steam++;
  else zone.toxic = Math.max(zone.toxic || 0, 3);
  game.metrics.reactions++;
  game.emit('reaction', {
    name: steam ? '火水相激 · 蒸汽成云' : '火炙毒涌 · 余焰成潮', ...point(zone),
  });
  game.emit('dragonArtReaction', {
    ...eventData(art), ...point(zone), reaction, radius: zone.radius, duration: zone.life, zoneId: zone.id,
  });
}

function collectFuel(game, art, mouth, enemy) {
  let fuel = art.fuel.get(mouth);
  if (!fuel) {
    fuel = {ember: false, poison: false, wet: false, spent: false};
    art.fuel.set(mouth, fuel);
  }
  if (fuel.spent) return;
  fuel.ember ||= enemy.burn > 0;
  fuel.wet ||= enemy.wet > 0;
  fuel.poison ||= enemy.poison > 0;
  if (!fuel.ember) return;
  for (const zone of game.zones) {
    if (zone.life <= 0 || Math.hypot(zone.x-mouth.x, zone.y-mouth.y, zone.z-mouth.z) > zone.radius + 1.45) continue;
    fuel.wet ||= zone.rain > 0 || zone.kind === 'rain' || zone.kind === 'steam' || zone.kind === 'cloud';
    fuel.poison ||= zone.toxic > 0 || zone.kind === 'poison';
  }
  if (!fuel.poison && !fuel.wet) return;
  fuel.spent = true;
  createReaction(game, art, mouth, fuel.poison ? 'fire-bloom' : 'steam-bloom', 4.1 + .7 * art.rank);
}

function undertowIntake(game, mouth) {
  const storm = game.zones.find(field => field.life > 0 && field.kind === 'storm' &&
    distance(field,mouth) < field.radius + 2.5 && Math.abs(field.y-mouth.y)<3.4);
  if (storm) return {carrier:'storm', zoneId:storm.id};
  const active = game.activeCascade;
  if (active?.kind === 'wind' && distance(active.center,mouth) < 8 && Math.abs(active.center.y-mouth.y)<4) return {carrier:'wind'};
  const whirlpool = game.wonders?.active;
  if (whirlpool?.kind === 'whirlpool' && whirlpool.phase === 'active' && distance(whirlpool,mouth)<whirlpool.radius+3 &&
    Math.abs(whirlpool.y-mouth.y)<3) return {carrier:'whirlpool'};
  return null;
}

function sampleUndertowHeat(game, mouth, load) {
  if (!load.intake || load.sourceZoneId !== undefined) return;
  const fire = game.zones.find(field => field.life > 0 && field.kind === 'fire' && carrierContains(field,mouth,1.2));
  const source = fire ?? game.zones.find(field => field.id === load.intake.zoneId && field.life > 0 && field.flame > 0);
  if (!source) return;
  load.sourceZoneId = source.id;
  load.heat = Math.min(8, load.heat + 2);
}

function sampleSteamLane(game, from, to, lift, points) {
  const count = Math.max(1, Math.ceil(distance(from,to) / 1.25));
  for (let index = 1; index <= count; index++) {
    const t = index / count;
    const site = {
      x:from.x + (to.x-from.x)*t, z:from.z + (to.z-from.z)*t,
      y:from.y + (to.y-from.y)*t + lift*Math.sin(Math.PI*t),
    };
    if (game.stage === 3 && game.terrainHeight) {
      if (game.terrainHeight(site.x,site.z) > site.y-.34) return false;
    } else if (game.stage < 3 && game.shoreHeight && game.shoreLevel(site.x,site.z,.25) > .16) {
      return false;
    }
    const last = points.at(-1);
    points.push({...site, along:last.along + distance(site,last)});
  }
  return true;
}

function steamPath(game, mouth, field, aim, breadth) {
  const boundary = {...point(field)};
  const incoming = [{...point(mouth),along:0}];
  if (!sampleSteamLane(game,mouth,boundary,0,incoming)) return null;
  const transition = incoming.find(site => carrierContains(field,site,.15));
  // If the eye is already in this wet region it is a local steam bloom.
  if (!transition || transition.along < 2.2) return null;
  const travelBeyond = distance(boundary,aim);
  if (travelBeyond < .18) return null;
  const exit = facing(toward(boundary, aim));
  const end = {x:aim.x+exit.x*2.35, y:aim.y+.38, z:aim.z+exit.z*2.35};
  const rise = clamp(1.05 + travelBeyond*.17 + Math.max(0,aim.y-boundary.y)*.24,1.15,3.8);
  const points = incoming.filter(site => site.along <= transition.along);
  // Bend just inside the water instead of doubling back from its center.
  if (!sampleSteamLane(game,transition,end, rise, points)) return null;
  const width = Math.min(5.8, breadth + Math.max(0,travelBeyond - 3)*.07);
  return {points,transition,outlet:boundary,rise,width};
}

function steamContact(path, target, first, last) {
  let best = null;
  let shortest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i-1], b = path[i];
    if (a.along > last || b.along < first) continue;
    const segment = b.along - a.along;
    const dx = b.x - a.x, dz = b.z - a.z;
    const edge = clamp(((target.x-a.x)*dx + (target.z-a.z)*dz) / (segment*segment),
      Math.max(0,(first-a.along)/segment), Math.min(1,(last-a.along)/segment));
    const site = {x:a.x+dx*edge, y:a.y+(b.y-a.y)*edge, z:a.z+dz*edge};
    const gap = Math.hypot(target.x-site.x, target.z-site.z, (target.y-site.y)*1.18);
    if (gap < shortest) {
      shortest = gap;
      best = {...site,gap};
    }
  }
  return best;
}

function steamwakeOutlet(game, art, mouth, load, fields) {
  let best;
  const wet = fields.filter(field => field.id !== load.intake.zoneId && hasMoisture(field) &&
    field.weaponAnchor !== 'abyss-steamwake' && field.weaponAnchor !== 'dragon-art-reaction' &&
    Math.abs(field.y-mouth.y) <= 6.4 && distance(field,mouth) >= 4 &&
    distance(field,mouth) <= 24).slice(-12);
  for (const field of wet) {
    const inlet = facing(toward(mouth,field));
    const distanceToField = distance(mouth,field);
    const receivers = nearby(game,field,11.6,5.5).filter(enemy => {
      if (!freeUndertowPrey(art,enemy)) return false;
      const dx = enemy.x-field.x, dz = enemy.z-field.z;
      const beyond = distance(enemy, field);
      return distance(enemy,mouth) >= distanceToField-1.6 &&
        (carrierContains(field,enemy,.55) || dx*inlet.x + dz*inlet.z >= beyond*.28);
    });
    if (!receivers.length) continue;
    const carrier = field.weaponAnchor === 'windkite' ? 'windkite' : field.kind;
    const breadth = clamp(2.5 + load.heat*.125 + field.radius*.29,3.1,5.2);
    // Candidate lanes use actual enemies, choosing the path with the most
    // still-untouched bodies along its raised, downstream section.
    for (const aim of receivers.slice(0,10)) {
      const lane = steamPath(game,mouth,field,aim,breadth);
      if (!lane) continue;
      const last = lane.points.at(-1).along;
      const travel = clamp(last/19.5,.58,1.45);
      const condenseAt = STEAMWAKE_WINDUP + travel*lane.transition.along/last;
      const hits = receivers.filter(enemy =>
        (steamContact(lane.points,enemy,lane.transition.along,last)?.gap ?? Infinity) <= lane.width + enemy.radius*.28);
      const score = hits.length ? hits.length + .6 * Number(carrier==='windkite') + .018*distanceToField : 0;
      if (!score || best && score <= best.score) continue;
      best = {...lane, field, carrier, receivers:hits, score, travel, condenseAt};
    }
  }
  return best;
}

function steamwakePoint(path, distance) {
  const index = path.findIndex(site => site.along >= distance);
  if (index <= 0) return point(index === 0 ? path[0] : path.at(-1));
  const a = path[index - 1], b = path[index];
  const t = (distance-a.along)/(b.along-a.along);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
}

function launchSteamwake(game, art, from, load, outlet) {
  const {points,transition,rise,width,field,carrier,receivers,travel,condenseAt} = outlet;
  const {along:length} = points.at(-1);
  const to = point(points.at(-1));
  const windup = STEAMWAKE_WINDUP;
  art.secondaryFront = {reaction:'abyss-steamwake', from, to, path:points, length, windup, travel,
    started:art.age, last:transition.along, nextZone:transition.along+4.4, transition, rise, width, field, carrier,
    hits:new Set(), heat:load.heat, power:Math.min(1.04,.64+load.heat*.056)};
  game.emit('dragonArtReaction', {
    ...eventData(art), ...to, reaction:'abyss-steamwake', from, to, width, radius:width, windup, travel, duration:windup+travel,
    points, transition, condenseAt, steamRise:rise, outlet:outlet.outlet,
    carrier, zoneId:field.id, sourceZoneId:load.sourceZoneId, heat:load.heat, receiverIds:receivers.slice(0,8).map(enemy=>enemy.id),
  });
  return true;
}

function updateSteamwake(game, art, front) {
  const {path, transition, rise, width, field, started, windup, travel, length} = front;
  const reached = length * progress(art.age, started+windup, started+windup+travel);
  if (reached < transition.along) return;
  if (!front.condensed) {
    if (field.life <= 0 || !game.zones.includes(field) || !hasMoisture(field)) {
      art.secondaryFront = null;
      return;
    }
    front.condensed = true;
    game.metrics.steam++;
    game.metrics.reactions++;
    game.addZone('steam', {...point(transition),radius:Math.min(4.3,width),power:1,life:3.8,weaponAnchor:front.reaction});
    const site = point(transition);
    game.emit('dragonArtReaction', {...eventData(art),...site,reaction:'abyss-condense',transition:site,from:front.from,to:front.to,
      steamRise:rise,carrier:front.carrier,zoneId:field.id,radius:width,heat:front.heat,points:path,
      duration:started+windup+travel-art.age});
  }
  while (reached >= front.nextZone) {
    game.addZone('steam', {...steamwakePoint(path,front.nextZone), radius:Math.min(4.25,width),power:1,
      life:3.45,weaponAnchor:front.reaction});
    front.nextZone += 4.4;
  }
  const center = steamwakePoint(path,(front.last+reached)*.5);
  const first = Math.max(transition.along,front.last-.26), last = Math.min(length,reached+.82);
  for (const enemy of nearby(game,center,(reached-front.last)*.8+width+1.4,width+1.15)) {
    if (!freeUndertowPrey(art,enemy) || art.locked.has(enemy.id) || front.hits.has(enemy.id)) continue;
    const site = steamContact(path,enemy,first,last);
    if (!site || site.gap > width + enemy.radius*.28) continue;
    front.hits.add(enemy.id);
    art.echoTargets?.add(enemy.id);
    enemy.burn = 0;
    enemy.wet = Math.max(enemy.wet,5);
    strike(game,art,enemy,site,front.power,front.reaction,false,undefined,undefined,{steamRise:rise,zoneId:field.id});
  }
  front.last = reached;
  if (reached >= length) art.secondaryFront = null;
}

function releaseUndertow(game, art) {
  const fields = game.zones.filter(zone => zone.life > .16 && (hasMoisture(zone) || zone.kind === 'storm' || zone.kind === 'poison'));
  const mouths = [...art.undertow].sort((a,b) => b[1].count-a[1].count);
  for (const [mouth, load] of mouths) {
    if (load.count < 3) continue;
    const intake = load.intake ??= undertowIntake(game,mouth);
    if (!intake) continue;
    sampleUndertowHeat(game,mouth,load);
    if (load.heat > 0 && art.stage >= 2) {
      const outlet = steamwakeOutlet(game,art,mouth,load,fields);
      if (outlet) return launchSteamwake(game,art,mouth,load,outlet);
    }
    const sourcePoison = fields.find(field => (field.kind === 'poison' || field.toxic > 0) && carrierContains(field,mouth,2.1));
    const poisoned = load.poisoned > 0 || Boolean(sourcePoison);
    if (!poisoned) continue;
    const candidates = fields.filter(field => field.id !== intake.zoneId && field !== sourcePoison &&
      distance(mouth,field) >= 7.0 && distance(mouth,field) <= 25 && Math.abs(field.y-mouth.y) <= 8);
    let outlet;
    for (const field of candidates) {
      const carrier = field.weaponAnchor === 'windkite' ? 'windkite' : field.kind;
      const route = scoreUndertowOutlet(game, art, mouth, load, field, carrier, field.radius,'abyss-undertow');
      if (!outlet || route.score > outlet.score) outlet = route;
    }
    if ((!outlet || outlet.score <= 0) && poisoned) outlet = shoalUndertowOutlet(game, art, mouth, load);
    if (!outlet || outlet.score <= 0) continue;
    const {location, direction, width, reaction} = outlet;
    const to = {x:location.x+direction.x*3.5,y:location.y,z:location.z+direction.z*3.5};
    const power = Math.min(1.15,.71+load.count*.04);
    const sent = beginSecondaryFront(game, art, reaction, mouth, to, width, power, null, outlet);
    if (sent) return true;
  }
  return false;
}

function freeUndertowPrey(art, enemy) {
  return !enemy.boss && !art.hitTargets.has(enemy.id) && !art.captures.has(enemy.id);
}

function scoreUndertowOutlet(game, art, mouth, load, location, carrier, breadth, reaction, shoal) {
  const span = distance(mouth, location);
  const width = Math.min(6.5, 2.7 + load.count*.135 + breadth*.20);
  const direction = facing(toward(mouth, location));
  const receivers = (shoal ?? nearby(game,location,width+4,5.4)).filter(enemy => {
    if (!freeUndertowPrey(art,enemy)) return false;
    const dx = enemy.x-mouth.x, dz = enemy.z-mouth.z;
    const along = dx*direction.x+dz*direction.z;
    return along >= span*.62 && along <= span+4 && Math.abs(dx*direction.z-dz*direction.x)<width &&
      Math.abs(enemy.y-location.y)<3.25;
  });
  const score = receivers.length ? receivers.length + (carrier === 'windkite' ? 2 : 0) : 0;
  return {location, direction, width, reaction, carrier, receivers, score, field:shoal ? null : location};
}

function shoalUndertowOutlet(game, art, mouth, load) {
  const candidates = nearby(game,mouth,28,8).filter(enemy => freeUndertowPrey(art,enemy) && distance(enemy,mouth) >= 8 &&
    (enemy.wet > 0 || enemy.poison > 0)).slice(0,24);
  let best;
  for (const anchor of candidates) {
    const route = scoreUndertowOutlet(game, art, mouth, load, anchor, anchor.wet > 0 ? 'wet-shoal' : 'poison-shoal',
      2.8, 'abyss-undertow', candidates);
    if (route.receivers.length >= 2 && (!best || route.score > best.score)) best = route;
  }
  return best;
}

function beginCapture(art, enemy, mouth, duration, transfer = false) {
  const span = distance(enemy, mouth);
  const angle = span > .20 ? toward(mouth, enemy) : enemy.id * 2.399963;
  art.captures.set(enemy.id, {enemy, mouth, from: point(enemy), angle, started: art.age, duration, transfer});
  enemy.dragonArtCaptureProgress = 0;
}

function prepareMouthBatches(game,art) {
  if(!art.mouthBatches)return;
  const byMouth=new Map();
  for(const capture of art.captures.values()) {
    const {enemy,mouth}=capture;
    if(!canDisplaceEnemy(enemy,game.time)||art.mouthBatches.has(mouth))continue;
    let group=byMouth.get(mouth);
    if(!group){group=[];byMouth.set(mouth,group);}
    group.push(capture);
  }
  for(const [mouth,group] of byMouth) {
    const transfer=group[0].transfer;
    if(group.length<(transfer?2:4))continue;
    const leg=transfer?3:art.portals.indexOf(mouth)+1;
    const foldAt=art.age+(transfer?.27:.31);
    const targets=group.slice(0,18).map(({enemy})=>({...point(enemy),id:enemy.id,radius:enemy.radius}));
    const batch={mouth,leg,transfer,foldAt,waiting:new Set(targets.map(target=>target.id)),hits:[],closed:false};
    for(const capture of group.slice(0,18)) {
      capture.from=point(capture.enemy);
      capture.angle=toward(mouth,capture.enemy);
      capture.started=art.age;
      capture.duration=foldAt-art.age;
      capture.batch=batch;
    }
    art.mouthBatches.set(mouth,batch);
    art.duration=Math.max(art.duration,foldAt+.14);
    game.emit('dragonArtReaction',{...eventData(art),...mouth,reaction:'abyss-mouth-gather',from:mouth,to:mouth,
      leg,targets,receiverIds:[...batch.waiting],radius:transfer?3.9:4.8,travel:foldAt-art.age,duration:foldAt-art.age+.22});
  }
}

function finishMouthBatches(game,art) {
  for(const batch of art.mouthBatches?.values()??[]) {
    if(batch.closed||art.age<batch.foldAt||batch.waiting.size)continue;
    batch.closed=true;
    const {mouth,leg,hits}=batch;
    game.emit('dragonArtReaction',{...eventData(art),...mouth,
      reaction:hits.length?'abyss-mouth-fold':'abyss-mouth-cancel',from:mouth,to:mouth,leg,targets:hits,
      receiverIds:hits.map(hit=>hit.id),burstKills:hits.filter(hit=>hit.killed).length,
      radius:batch.transfer?3.9:4.8,duration:.42});
  }
}

function updateCaptures(game, art) {
  for (const [id, capture] of art.captures) {
    const {enemy, mouth, from, angle, started, duration, transfer, batch} = capture;
    if (canDisplaceEnemy(enemy, game.time)) {
      const t = progress(art.age, started, started + duration);
      const along = batch ? t*t*(.62+.38*t) : smooth(t);
      const curl = Math.sin(Math.PI * t) * (art.kind === 'rift' ? .66 : batch ? 1.66 : .95);
      const side = angle + (id % 2 ? 1 : -1) * Math.PI * .5;
      const x = from.x + (mouth.x - from.x) * along + Math.sin(side) * curl;
      const z = from.z + (mouth.z - from.z) * along + Math.cos(side) * curl;
      const y = from.y + (mouth.y - from.y) * along + curl * .48;
      slide(game, art, enemy, x - enemy.x, y - enemy.y, z - enemy.z, mouth);
      enemy.dragonArtCaptureProgress = t;
      if (t < 1 || art.hitBudget <= 0) continue;
      if (transfer && art.carriedPoison > 0) enemy.poison = Math.max(enemy.poison, Math.min(3.5, art.carriedPoison));
      if (transfer && art.carriedEmber) enemy.burn = Math.max(enemy.burn, 2);
      const arrived=art.kind!=='abyss'||distance(enemy,mouth)<.68&&Math.abs(enemy.y-mouth.y)<.68;
      if(arrived)art.captured++;
      if (!transfer) art.hitTargets.add(id);
      if (art.riftClash && !art.riftClash.intakes.has(mouth) &&
          distance(enemy,mouth)<.46 && Math.abs(enemy.y-mouth.y)<.62) {
        art.riftClash.intakes.set(mouth,id);
      }
      strike(game, art, enemy, arrived?mouth:enemy, transfer ? .68 : 1.25, transfer ? 'abyss-transfer' : 'crush', arrived,
        undefined, arrived?mouth:undefined,batch&&arrived?{leg:batch.leg,mouth:point(mouth),mouthFold:true}:undefined);
      if(batch&&arrived)batch.hits.push({...point(enemy),id,radius:enemy.radius,killed:enemy.hp<=0});
    } else if (transfer) art.echoTargets.delete(id);
    art.captures.delete(id);
    batch?.waiting.delete(id);
    delete enemy.dragonArtCaptureProgress;
  }
}

function riftClashCorridor(art, enemy) {
  if (enemy.boss || art.hitTargets.has(enemy.id) || art.captures.has(enemy.id) ||
      art.riftWindSeam?.possible.has(enemy.id)) return false;
  const x = enemy.x-art.center.x, z = enemy.z-art.center.z;
  const side = x*art.direction.z-z*art.direction.x;
  const along = x*art.direction.x+z*art.direction.z;
  const radius = enemy.radius ?? 0;
  return Math.abs(side) < art.radius*.15+radius*.35 && Math.abs(along) < RIFT_CLASH_WIDTH+radius*.35 &&
    Math.abs(enemy.y-art.center.y) < 2.25+radius*.25;
}

function beginRiftClash(game, art) {
  const clash = art.riftClash;
  if (clash?.intakes.size !== 2) return;
  const [from,to] = art.portals;
  if (!openRiftLane(game,from,to)) return;
  const targets = nearby(game,art.center,RIFT_CLASH_WIDTH+2.5,3).filter(enemy=>riftClashCorridor(art,enemy)).slice(0,12);
  if (!targets.length) return;
  const duration = RIFT_CLASH_WINDUP+RIFT_CLASH_TRAVEL;
  const pairedIds = [clash.intakes.get(from),clash.intakes.get(to)];
  clash.front = {starts:art.age+RIFT_CLASH_WINDUP, at:art.age+duration, targets:new Set(targets), pairedIds};
  game.emit('dragonArtReaction', {...eventData(art), ...point(art.center), reaction:'rift-clash', from:point(from), to:point(to),
    width:RIFT_CLASH_WIDTH, radius:RIFT_CLASH_WIDTH, windup:RIFT_CLASH_WINDUP, travel:RIFT_CLASH_TRAVEL, duration,
    pairedIds, receiverIds:targets.map(enemy=>enemy.id), targets:targets.map(enemy=>({id:enemy.id,...point(enemy)}))});
}

function rememberRiftRecoilContact(art, contact) {
  const matchAt=contact.at-art.startedAt;
  const piercing=contact.source==='needle'||contact.source==='pierce';
  if (art.riftRecoil || matchAt<.28 || matchAt>2.24 || (!piercing&&contact.source!=='cascade-wind') ||
      distance(art.center,contact)>11.4 || Math.abs(art.center.y-contact.y)>3.35) return;
  const lateral=contact.direction.x*art.direction.z-contact.direction.z*art.direction.x;
  if(Math.abs(lateral)<.25) return;
  const contacts=art.riftClash.contacts ??= [];
  const side=lateral<0 ? 0 : 1;
  const previous=contacts[side];
  if (!previous || contact.at>=previous.at) contacts[side]=contact;
}

function beginRiftRecoil(game, art, pairedIds) {
  const contacts=art.riftClash.contacts?.filter(contact=>game.time-contact.at<1.46);
  if (!contacts?.length) return false;
  const source=point(art.center);
  const candidates=nearby(game,source,art.radius*1.38,art.height+1.1).filter(enemy=>
    !enemy.boss && canDisplaceEnemy(enemy,game.time) && !art.hitTargets.has(enemy.id) &&
    !art.captures.has(enemy.id) && distance(source,enemy)>art.radius*.89);
  let best;
  for (const aim of candidates.slice(0,28)) {
    const dx=aim.x-source.x, dz=aim.z-source.z;
    const span=Math.hypot(dx,dz);
    const direction={x:dx/span,z:dz/span};
    const lateral=direction.x*art.direction.z-direction.z*art.direction.x;
    const forward=direction.x*art.direction.x+direction.z*art.direction.z;
    if (Math.abs(lateral)<.49 || forward<-.36) continue;
    const contact=contacts.find(item=>direction.x*item.direction.x+direction.z*item.direction.z>.69);
    if (!contact) continue;
    const terminal={x:aim.x+dx/span*2.1,y:aim.y,z:aim.z+dz/span*2.1};
    const lane=openRiftLane(game,source,terminal);
    if (!lane) continue;
    const receivers=candidates.filter(enemy=>riftContact(lane,enemy,RIFT_RECOIL_WIDTH)!==null).slice(0,12);
    if (receivers.length<2) continue;
    const score=receivers.length-(game.time-contact.at)*.24;
    if (!best || score>best.score) best={lane,contact,receivers,score};
  }
  if (!best) return false;
  const {lane,contact,receivers}=best;
  const carrier=contact.source==='cascade-wind'?'wind':'needle';
  const travel=clamp(lane.length/38,.41,.67);
  const duration=RIFT_RECOIL_WINDUP+travel;
  art.riftRecoil={...lane,starts:art.age+RIFT_RECOIL_WINDUP,ends:art.age+duration,carrier,pairedIds,sourceId:contact.targetId};
  art.duration=Math.max(art.duration,art.age+duration+.12);
  game.emit('dragonArtReaction',{...eventData(art),...lane.to,reaction:'rift-recoil',from:source,to:lane.to,
    points:lane.points,width:RIFT_RECOIL_WIDTH,radius:RIFT_RECOIL_WIDTH,windup:RIFT_RECOIL_WINDUP,travel,duration,
    carrier,sourceId:contact.targetId,carrierId:contact.carrierId,cutFrom:point(contact),carrierDirection:contact.direction,pairedIds,
    receiverIds:receivers.map(enemy=>enemy.id),targets:receivers.map(enemy=>({id:enemy.id,...point(enemy)}))});
  return true;
}

function updateRiftRecoil(game, art) {
  const lane=art.riftRecoil;
  const head=progress(art.age,lane.starts,lane.ends);
  if (head<=lane.along) return;
  const middle=riftLanePosition(lane,(head+lane.along)*.5);
  const length=(head-lane.along)*lane.length;
  const direction={x:lane.dx/lane.length,z:lane.dz/lane.length};
  for (const enemy of nearby(game,middle,length*.5+RIFT_RECOIL_WIDTH+1.1,2.8)) {
    if (enemy.boss || art.hitTargets.has(enemy.id) || art.captures.has(enemy.id) ||
        distance(lane.from,enemy)<art.radius*.84) continue;
    const contact=riftContact(lane,enemy,RIFT_RECOIL_WIDTH);
    if (!contact || contact.fraction<lane.along-.05 || contact.fraction>head+.03 ||
        !openRiftLane(game,contact.join,point(enemy))) continue;
    art.hitTargets.add(enemy.id);
    knockBackEnemy(game,enemy,{x:enemy.x-direction.x,z:enemy.z-direction.z},'tail',art.rank);
    strike(game,art,enemy,contact.join,.83,'rift-recoil',false,lane.sourceId,undefined,
      {carrier:lane.carrier,pairedIds:lane.pairedIds});
    if (!lane.hit) {
      lane.hit=true;
      game.metrics.reactions++;
    }
  }
  lane.along=head;
}

function updateRiftClash(game, art, dt) {
  const front = art.riftClash.front;
  if (art.age < front.starts) return;
  const finished = art.age >= front.at;
  if (finished) art.riftClash.front = null;
  let landed = false;
  for (const enemy of front.targets) {
    if (enemy.hp<=0 || !riftClashCorridor(art,enemy)) continue;
    if (!finished) {
      if (canDisplaceEnemy(enemy,game.time)) {
        const advance = Math.min(.16,dt*4.5);
        slide(game,art,enemy,(art.center.x-enemy.x)*advance,0,(art.center.z-enemy.z)*advance,art.center);
      }
    } else if (openRiftLane(game,art.center,point(enemy))) {
      art.hitTargets.add(enemy.id);
      strike(game,art,enemy,art.center,1.12,'rift-clash',false,undefined,undefined,{pairedIds:front.pairedIds});
      landed = true;
    }
  }
  if (landed) {
    game.metrics.reactions++;
    art.riftClash.recoilUntil=art.age+.25;
    art.riftClash.nextRecoil=art.age;
    art.riftClash.recoilPairs=front.pairedIds;
  }
}

function collapse(game, art) {
  const rift = art.kind === 'rift';
  const coverage = rift ? .85 : .66;
  for (const enemy of nearby(game, art.center, art.radius * coverage, art.height)) {
    if (art.hitTargets.has(enemy.id) || art.captures.has(enemy.id) || art.riftClash?.front?.targets.has(enemy) ||
        art.riftWindSeam?.possible.has(enemy.id)) continue;
    const depth = 1 - distance(enemy, art.center) / (art.radius * coverage);
    const reaction = !rift && (enemy.wet > 0 || enemy.poison > 0) ? .24 : 0;
    art.hitTargets.add(enemy.id);
    strike(game, art, enemy, art.center, .62 + depth * .5 + reaction, 'crush');
  }
}

function updatePull(game, art, dt) {
  const rift = art.kind === 'rift';
  const collapseAt = 1.65;
  if (rift && art.rank>=2 && art.stage>=2) {
    if(!art.riftWindSeam&&art.age>=.34&&art.age<=1.94) beginRiftWindSeam(game,art);
    if(art.riftWindSeam)updateRiftWindSeam(game,art);
  }
  if (rift && art.phase === 'slash' && art.age >= .58) phase(game, art, 'suction', .58);
  if (art.age >= collapseAt && (art.phase === 'suction' || art.phase === 'spiral')) {
    phase(game, art, 'collapse', collapseAt);
    if (rift) beginRiftClash(game,art);
    collapse(game, art);
  }
  if (art.kind === 'abyss' && art.phase === 'collapse' && !art.undertowReleased && art.age >= collapseAt + .18) {
    art.undertowReleased = releaseUndertow(game, art);
    if (!art.undertowReleased && art.age >= collapseAt + .44) art.undertowReleased = true;
  }
  if (art.riftClash?.front) updateRiftClash(game,art,dt);
  const clash=art.riftClash;
  if (clash?.recoilUntil>=art.age && art.age>=clash.nextRecoil) {
    if (beginRiftRecoil(game,art,clash.recoilPairs)) clash.recoilUntil=null;
    else clash.nextRecoil=art.age+.08;
  }
  if (art.riftRecoil) updateRiftRecoil(game,art);
  if (art.phase !== 'suction' && art.phase !== 'spiral') return;
  const buildup = smooth(progress(art.age, rift ? .49 : .04, rift ? 1.14 : 1.5));
  for (const enemy of nearby(game, art.center, art.radius, art.height)) {
    if (!canDisplaceEnemy(enemy, game.time) || art.captures.has(enemy.id) || art.riftWindSeam?.possible.has(enemy.id)) continue;
    // Let the seam between the mouths retain a distinct reception group.
    if (art.riftClash && riftClashCorridor(art,enemy)) continue;
    const target = art.portals.length === 1 ? art.center : art.stackedMouths
      ? art.portals[enemy.y<art.center.y?0:1]
      : distance(enemy,art.portals[0])<distance(enemy,art.portals[1])?art.portals[0]:art.portals[1];
    const dx = target.x - enemy.x, dz = target.z - enemy.z;
    const span = Math.hypot(dx, dz);
    const sink = rift ? 1.65 : 1.15;
    if (span < sink && (!art.stackedMouths || Math.abs(enemy.y-target.y) < 1.55) &&
        !art.hitTargets.has(enemy.id) && art.captures.size < MAX_CAPTURES) {
      beginCapture(art, enemy, target, .20 + .02 * (enemy.id % 5));
      continue;
    }
    const speed = (5.1 + art.rank * 1.45 + buildup * (rift ? 11.4 : 14.2)) * (1 - .36 * clamp(span / art.radius, 0, 1));
    const step = Math.min(span, dt * speed);
    const spiral = rift ? 0 : step * (.94 - buildup * .56) * (enemy.wet > 0 ? .78 : 1);
    const cloud = art.stage === 3 ? clamp(target.y-enemy.y,-1.4,1.4)*dt*(art.stackedMouths?6:art.rank+1) : 0;
    const width = Math.max(.16,span);
    slide(game, art, enemy, (dx*step-dz*spiral)/width,cloud,(dz*step+dx*spiral)/width,target);
  }
}

function hasMoisture(zone) {
  return wetFields.has(zone.kind) || zone.kind === 'thunder' && zone.conduitMoisture ||
    zone.kind === 'storm' && (zone.rain > 0 || zone.rainfed);
}

function conduitCarriers(game) {
  const fields = game.zones.filter(zone => zone.life > 0 && hasMoisture(zone));
  const crests = game.dragonArtWetCrests?.filter(crest => game.time - crest.at <= CONDUIT_NODE_LIFE) ?? [];
  return [...fields, ...crests];
}

function canConnectCarriers(current, field, from, location) {
  const vertical = Math.abs(location.y - from.y);
  const span = Math.hypot(distance(location, from), vertical);
  const reach = current ? current.radius + field.radius : field.radius + 3.5;
  return span >= 2.6 && span <= reach + .6 && span <= 13 && vertical <= 7.3;
}

function carrierPoint(carrier, toward) {
  if (carrier.kind !== 'water-crest') return point(carrier);
  const {from, to} = carrier;
  const x = to.x - from.x, z = to.z - from.z;
  const t = clamp(((toward.x - from.x) * x + (toward.z - from.z) * z) / Math.max(.01, x*x + z*z), 0, 1);
  return {x: from.x + x*t, y: carrier.y, z: from.z + z*t};
}

function carrierContains(carrier, position, edge = 0) {
  const center = carrierPoint(carrier, position);
  return Math.abs(position.y - center.y) <= Math.max(2.2, carrier.radius * .65) + edge &&
    Math.hypot(distance(center, position), position.y - center.y) <= carrier.radius + edge;
}

function markConduit(art, position, direction, charged, carrier = null) {
  const nodes = art.conduit.nodes;
  const known = nodes.find(node => carrier ? node.carrier === carrier
    : !node.carrier && Math.abs(node.y - position.y) < 2.0 && distance(node, position) < 2.5);
  if (known) {
    known.charged ||= charged;
    if (!known.spent) known.expires = art.age + CONDUIT_NODE_LIFE;
    return;
  }
  if (nodes.length < 14) nodes.push({...point(position), direction, charged, carrier, expires: art.age + CONDUIT_NODE_LIFE});
}

function conduitTargets(game, from, range, height, carrier) {
  return nearby(game, from, range, height).filter(enemy => !enemy.boss &&
    (enemy.wet > 0 || carrier && carrierContains(carrier, enemy, .4)));
}

function chargedCarrier(game, carrier, sparks, energized) {
  return carrier.conduitUntil > game.time || sparks.some(spark => carrierContains(carrier, spark, 1.5)) ||
    energized.some(zone => carrierContains(carrier, zone, Math.min(3, zone.radius)));
}

function conduitFields(game, art, origin, direction, radius, width, travel) {
  const carriers = conduitCarriers(game);
  const sparks = game.dragonArtSparks?.filter(spark => game.time - spark.at <= CONDUIT_CONTACT_LIFE) ?? [];
  const energized = game.zones.filter(zone => zone.kind === 'thunder' && zone.life > 0 && zone.energy > 0);
  const projected = [];
  for (const carrier of carriers) {
    const center = carrierPoint(carrier, origin);
    const x = center.x - origin.x, z = center.z - origin.z;
    const ahead = x * direction.x + z * direction.z;
    const side = Math.abs(x * direction.z - z * direction.x);
    if (ahead < .6 || ahead > radius + carrier.radius || side > width + carrier.radius + ahead * travel) continue;
    projected.push({carrier, center, ahead, side});
  }
  let aim;
  let best = 0;
  for (const {carrier, center, ahead, side} of projected) {
    const rise = center.y - origin.y;
    if (rise >= -3.25 || -rise > Math.min(10.2, ahead * 1.20) || ahead < 2.8 ||
        !chargedCarrier(game, carrier, sparks, energized)) continue;
    const held = conduitTargets(game, center, 9, 4, carrier).some(enemy => !art.hitTargets.has(enemy.id));
    const connected = carriers.some(field => field !== carrier &&
      canConnectCarriers(carrier, field, center, carrierPoint(field, center)));
    const entering = !held && nearby(game, center, carrier.radius + 2.3, 3.7).some(enemy => !enemy.boss &&
      Math.cos(enemy.angle - toward(enemy, center)) > .2);
    if (!held && !connected && !entering) continue;
    const score = Number(held) + Number(connected) + Number(entering) * .5 + (1 - side / (width + carrier.radius));
    if (score <= best) continue;
    best = score;
    aim = rise / ahead;
  }
  art.beamPitch = aim ?? 0;
  for (const {carrier, center, ahead} of projected) {
    const limit = art.height + Math.min(2, carrier.radius * .35);
    if (Math.abs(center.y - origin.y - art.beamPitch * ahead) > limit) continue;
    markConduit(art, center, direction, false, carrier);
  }
}

function relayFromField(game, art, from, direction, depth, current, carriers) {
  const {conduit} = art;
  let relay;
  let best = -Infinity;
  for (const field of carriers) {
    if (field === current || conduit.fields.has(field.id)) continue;
    const location = carrierPoint(field, from);
    const vertical = Math.abs(location.y - from.y);
    const horizontal = distance(location, from);
    if (!canConnectCarriers(current, field, from, location)) continue;
    const projected = (location.x - from.x) * direction.x + (location.z - from.z) * direction.z;
    if (depth && projected < -horizontal * .32) continue;
    const prey = conduitTargets(game, location, Math.min(7, field.radius + 2), 4, field)
      .some(enemy => !conduit.hits.has(enemy.id));
    const continued = carriers.some(other => other !== current && other !== field && !conduit.fields.has(other.id) &&
      canConnectCarriers(field, other, location, carrierPoint(other, location)));
    if (!prey && !continued) continue;
    const score = Number(prey) * 3 + Math.min(vertical, 4) * .36 + horizontal * .22;
    if (score <= best) continue;
    best = score;
    relay = {field, location};
  }
  return relay;
}

function predictConduitHop(game, art, from, direction, depth, current, carriers) {
  const {conduit} = art;
  const range = depth ? 7.6 : 8.8;
  let target;
  let shortest = Infinity;
  for (const enemy of conduitTargets(game, from, range, current ? 4.0 : 3.1, current)) {
    if (conduit.hits.has(enemy.id)) continue;
    const x = enemy.x - from.x, z = enemy.z - from.z;
    const step = Math.hypot(x, z, .68 * (enemy.y - from.y));
    const cost = step + Number(art.hitTargets.has(enemy.id)) * range;
    if (step < 2.3 || cost >= shortest || step > range) continue;
    const along = x * direction.x + z * direction.z;
    const side = Math.abs(x * direction.z - z * direction.x);
    if (depth ? along < -step * .18 : side < step * .36 && Math.abs(enemy.y - from.y) < 2.4) continue;
    target = enemy;
    shortest = cost;
  }
  const relay = !target || art.hitTargets.has(target.id) ? relayFromField(game, art, from, direction, depth, current, carriers) : null;
  if (!target && !relay && current) {
    target = conduitTargets(game, from, Math.min(7, current.radius + 2), 3.5, current)
      .find(enemy => !conduit.hits.has(enemy.id));
  }
  if (!target && !relay) return false;
  if (relay) conduit.fields.add(relay.field.id);
  else conduit.hits.add(target.id);
  const duration = depth ? .15 : .21;
  const origin = point(from);
  const to = relay?.location ?? point(target);
  const carrier = relay?.field ?? current;
  conduit.branches.push({from: origin, to, target: relay ? null : target, carrier,
    angle: distance(origin, to) > .75 ? toward(origin, to) : Math.atan2(direction.x, direction.z),
    depth, range, at: art.age + duration});
  game.emit('dragonArtReaction', {
    ...eventData(art), ...to, reaction: 'conductive-front', depth, duration,
    radius: relay ? Math.min(4.2, relay.field.radius) : 2.4,
    targetId: relay ? undefined : target.id, zoneId: typeof carrier?.id === 'number' ? carrier.id : undefined,
    carrier: carrier?.kind ?? 'enemy', from: origin, to,
  });
  return true;
}

function updateConduit(game, art) {
  const {conduit} = art;
  if (!conduit) return;
  const carriers = conduitCarriers(game);
  conduit.nodes = conduit.nodes.filter(node => node.expires >= art.age && (!node.carrier || carriers.includes(node.carrier)));
  const sparks = game.dragonArtSparks?.filter(spark => game.time - spark.at <= CONDUIT_CONTACT_LIFE) ?? [];
  const energized = game.zones.filter(zone => zone.kind === 'thunder' && zone.life > 0 && zone.energy > 0);
  const maxStarts = art.rank === 3 ? 2 : 1;
  if (conduit.starts < maxStarts) {
    for (const node of conduit.nodes) {
      if (node.spent || node.carrier && conduit.fields.has(node.carrier.id)) continue;
      const contacted = node.carrier
        ? node.carrier.conduitUntil > game.time || sparks.some(spark => carrierContains(node.carrier, spark, 2.0)) || energized.some(zone =>
          carrierContains(node.carrier, zone, Math.min(3.4, zone.radius)))
        : sparks.some(spark => Math.abs(spark.y - node.y) <= 3.4 && distance(spark, node) <= 4.2) ||
          energized.some(zone => carrierContains(zone, node, 1.1));
      if (!(node.charged || contacted) || !predictConduitHop(game, art, node, node.direction, 0, node.carrier, carriers)) continue;
      node.spent = true;
      if (node.carrier) conduit.fields.add(node.carrier.id);
      if (++conduit.starts >= maxStarts) break;
    }
  }
  const next = conduit.branches[0];
  if (!next || art.hitBudget <= 0) return;
  // Independent nodes can queue together. Resolve only the jobs already due,
  // letting each further arc visibly trace a new route before it lands.
  const remaining = conduit.branches;
  conduit.branches = [];
  for (const branch of remaining) {
    const {from, to, carrier, angle, depth, range, at} = branch;
    let {target} = branch;
    if (art.age < at || art.hitBudget <= 0) {
      conduit.branches.push(branch);
      continue;
    }
    const liveCarrier = carriers.includes(carrier) ? carrier : null;
    if (target && (target.hp <= 0 || (target.wet <= 0 && !(liveCarrier && carrierContains(liveCarrier, target, .4))) ||
      distance(target, from) > range + 1 || Math.abs(target.y - from.y) > (liveCarrier ? 5 : 4))) {
      target = conduitTargets(game, to, 2.4, 2, liveCarrier).find(enemy => !conduit.hits.has(enemy.id));
      if (!target) continue;
      conduit.hits.add(target.id);
    } else if (!target && !liveCarrier) continue;
    if (!conduit.discharged) {
      conduit.discharged = true;
      game.metrics.reactions++;
      game.metrics.thunder++;
      game.emit('reaction', {name: '龙息回雷 · 沿湿成锋', ...to});
    }
    const atTarget = target ? point(target) : to;
    game.emit('arc', {from, to: atTarget, source: 'dragon-art-beam', power: 2, conductive: true});
    if (target) {
      target.charge = Math.max(target.charge, 2);
      strike(game, art, target, from, .88 - .10 * depth, 'beam-conduit');
    }
    if (depth + 1 < Math.min(4, art.rank + 1 + Number(liveCarrier !== null))) {
      predictConduitHop(game, art, atTarget, facing(angle), depth + 1, liveCarrier, carriers);
    }
    let caught = 0;
    const radius = !target && liveCarrier ? Math.min(4.2, liveCarrier.radius) : 2.4;
    for (const enemy of conduitTargets(game, atTarget, radius, 2.7, liveCarrier)) {
      if (conduit.hits.has(enemy.id)) continue;
      enemy.charge = Math.max(enemy.charge, 1.5);
      conduit.hits.add(enemy.id);
      strike(game, art, enemy, atTarget, .42, 'beam-conduit');
      if (++caught >= (target ? 4 : 6)) break;
    }
  }
}

function beamLane(game, art, angle, radius, width, targets, power, travel = 0, interception = false) {
  const direction = facing(angle);
  const origin = point(game.p);
  conduitFields(game, art, origin, direction, radius, width, travel);
  for (const enemy of nearby(game, origin, radius, art.height + Math.abs(art.beamPitch) * radius)) {
    if (targets.has(enemy.id)) continue;
    const x = enemy.x - origin.x, z = enemy.z - origin.z;
    const range = Math.hypot(x, z);
    const ahead = x * direction.x + z * direction.z;
    const side = Math.abs(x * direction.z - z * direction.x);
    if (ahead < .35 || ahead > radius || side > width + range * travel + (enemy.radius ?? .55) * .65 ||
        Math.abs(enemy.y - origin.y - art.beamPitch * ahead) > art.height + (enemy.radius ?? .55) * .33) continue;
    if (art.phase==='echo'&&!beamInterceptionClear(game,origin,enemy) || interception&&art.hitTargets.has(enemy.id)) continue;
    targets.add(enemy.id);
    const resonant = enemy.burn > 0 || enemy.charge > 0;
    if (enemy.wet > 0 && !enemy.boss) {
      markConduit(art, enemy, direction, enemy.charge > 0 && !art.conduit.hits.has(enemy.id));
    }
    if (!enemy.boss) enemy.burn = Math.max(enemy.burn, resonant ? 3.2 : 1.6);
    strike(game, art, enemy, origin, power * (resonant ? 1.22 : 1),
      art.phase==='echo' ? 'beam-crosscut' : 'hit',false,undefined,undefined,interception?{interception:true}:undefined);
  }
}

const BEAM_INTERCEPT_SNAPSHOT = .22;
const BEAM_INTERCEPT_LEAD = .30;

function sampleBeamCrossing(game,art) {
  const state=art.beamTracking??={samples:new Map(),at:art.age};
  if (art.age<state.at) return;
  state.at=art.age+.10;
  const present=new Set();
  for (const enemy of nearby(game,game.p,art.radius,art.height)) {
    if (enemy.boss||art.hitTargets.has(enemy.id)) continue;
    present.add(enemy.id);
    let samples=state.samples.get(enemy.id);
    if(!samples)state.samples.set(enemy.id,samples=[]);
    samples.push({...point(enemy),at:art.age});
    if(samples.length>4)samples.shift();
  }
  for(const id of state.samples.keys())if(!present.has(id))state.samples.delete(id);
}

function beamInterceptionClear(game,origin,target) {
  if(game.stage!==3||!game.terrainHeight)return true;
  for(const t of [.16,.32,.48,.64,.80,.94]) {
    const x=origin.x+(target.x-origin.x)*t,z=origin.z+(target.z-origin.z)*t;
    const height=origin.y+(target.y-origin.y)*t;
    if(game.terrainHeight(x,z)>height+.15)return false;
  }
  return true;
}

function beamCrossingMotion(art,origin,enemy) {
  const samples=art.beamTracking?.samples.get(enemy.id);
  if (!samples||samples.length<2) return null;
  const first=samples.find(sample=>art.age-sample.at>=BEAM_INTERCEPT_SNAPSHOT);
  if (!first) return null;
  const span=art.age-first.at;
  const vx=(enemy.x-first.x)/span,vz=(enemy.z-first.z)/span;
  const rise=clamp((enemy.y-first.y)/span,-3.2,3.2);
  const range=distance(origin,enemy);
  const side=(vx*(enemy.z-origin.z)-vz*(enemy.x-origin.x))/range;
  if(Math.abs(side)<1.32||Math.hypot(vx,vz)>12.6||range<5.0) return null;
  const latest=samples.at(-1);
  const nextSide=((enemy.x-latest.x)*(enemy.z-origin.z)-(enemy.z-latest.z)*(enemy.x-origin.x))/range;
  if(art.age-latest.at>.04&&nextSide*side<=0) return null;
  const forecast={x:enemy.x+vx*BEAM_INTERCEPT_LEAD,y:enemy.y+rise*BEAM_INTERCEPT_LEAD,z:enemy.z+vz*BEAM_INTERCEPT_LEAD};
  return {enemy,forecast,side,angle:toward(origin,forecast)};
}

function beginBeamInterception(game,art) {
  const origin=point(game.p),reach=art.radius*.86,width=art.beamWidth*.77;
  const moving=[];
  for(const enemy of nearby(game,origin,reach,art.height)) {
    if(enemy.boss||art.hitTargets.has(enemy.id)) continue;
    const option=beamCrossingMotion(art,origin,enemy);
    if(!option || distance(origin,option.forecast)>reach||
      Math.abs(turn(option.angle-game.p.angle))>1.22||!beamInterceptionClear(game,origin,option.forecast)) continue;
    moving.push(option);
  }
  let best;
  for(const lead of moving) {
    const group=moving.filter(sample=>sample.side*lead.side>0&&Math.abs(turn(sample.angle-lead.angle))<=.23&&
      distance(sample.forecast,lead.forecast)<6.9&&Math.abs(sample.forecast.y-lead.forecast.y)<2.7);
    if(group.length<2 || best&&group.length<=best.group.length) continue;
    const center={x:0,y:0,z:0};
    for(const target of group){center.x+=target.forecast.x;center.y+=target.forecast.y;center.z+=target.forecast.z;}
    center.x/=group.length; center.y/=group.length; center.z/=group.length;
    best={group,center,side:Math.sign(lead.side)};
  }
  if(!best) return false;
  const angle=toward(origin,best.center),axis=facing(angle);
  art.echoCenter=best.center;
  art.echoRadius=reach;
  art.echoWidth=width;
  art.echoAngle=angle;
  art.echoFrom=origin;
  art.echoTo={x:origin.x+axis.x*reach,y:best.center.y,z:origin.z+axis.z*reach};
  art.beamInterception=best;
  return true;
}

function announceBeamInterception(game,art) {
  const {group,center,side}=art.beamInterception;
  const from=art.echoFrom,to=art.echoTo;
  game.emit('dragonArtReaction',{...eventData(art),...point(center),reaction:'beam-intercept',from,to,points:[from,center,to],
    receiverIds:group.map(({enemy})=>enemy.id),targets:group.map(({enemy,forecast})=>({id:enemy.id,...point(enemy),forecast})),
    startAngle:art.echoAngle+side*.29,endAngle:art.echoAngle-side*.29,
    windup:.13,travel:.36,duration:.49,width:art.echoWidth});
}

function scorchGround(game,x,z) {
  if(game.stage===3)return (game.terrainHeight?.(x,z)??0)+.40;
  return Math.max(.25,(game.shoreHeight?.(x,z)??0)+.20);
}

function layScorchLane(game,art) {
  const heat = game.dragonScorch;
  if(heat?.art!==art||art.age>=1.39||art.age<(art.lastScorchLane??0))return;
  art.lastScorchLane=art.age+.16;
  const {x,y,z}=game.p;
  const direction=facing(art.sweepAngle);
  const reach=art.radius*.86;
  const points=[];
  let low=Infinity, high=-Infinity;
  for (let step=SCORCH_STEP; step<=reach; step+=SCORCH_STEP) {
    const hubX=x+direction.x*step, hubZ=z+direction.z*step;
    const ground=scorchGround(game,hubX,hubZ);
    const clearance=y+(art.beamPitch??0)*step-ground;
    if (clearance < -.65) break;
    if (clearance > 4.8) continue;
    low=Math.min(low,ground);
    high=Math.max(high,ground);
    points.push({x:hubX,y:ground,z:hubZ,along:step});
  }
  if(points.length<2)return;
  const from=points[0], to=points.at(-1);
  const lane={id:heat.lanes.length+1,from,to,points,x,z,direction,length:to.along,
    width:art.beamWidth*.94,low,high,startsAt:art.age,expiresAt:art.age+SCORCH_LIFETIME,
    plantedAt:game.time,expires:game.time+SCORCH_LIFETIME,doused:[]};
  heat.lanes.push(lane);
  for (const mark of heat.douses) douseScorchLane(lane,mark,mark.radius);
}

function scorchSample(lane, along) {
  const first=lane.points[0], last=lane.points.at(-1);
  if (along<first.along||along>last.along) return null;
  const end=Math.max(1,lane.points.findIndex(sample=>sample.along>=along));
  const a=lane.points[end-1], b=lane.points[end];
  const gap=b.along-a.along;
  if (gap>SCORCH_STEP*1.5) return null;
  const fraction=(along-a.along)/gap;
  return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,z:a.z+(b.z-a.z)*fraction,along};
}

function douseScorch(heat, center, radius) {
  heat.douses.push({...point(center),radius});
  for (const lane of heat.lanes) douseScorchLane(lane,center,radius);
}

function douseScorchLane(lane,center,radius) {
  const x=center.x-lane.x, z=center.z-lane.z;
  const across=Math.abs(x*lane.direction.z-z*lane.direction.x);
  if (across>=radius) return;
  const side=Math.sqrt(radius*radius-across*across);
  const along=x*lane.direction.x+z*lane.direction.z;
  const start=Math.max(lane.points[0].along,along-side);
  const end=Math.min(lane.length,along+side);
  const site=scorchSample(lane,(start+end)*.5);
  if(start<end&&site&&Math.abs(site.y-center.y)<=1.35) lane.doused.push({from:start,to:end});
}

function scorchMoisture(game) {
  const fields=game.zones.filter(zone=>zone.life>.07&&
    (zone.kind==='rain'||zone.kind==='storm'&&(zone.rainfed||zone.rain>0)));
  const crests=(game.dragonArtWetCrests??[]).filter(crest=>game.time-crest.at<=.20);
  return fields.concat(crests);
}

function rainSlopeGap(game,carrier,site) {
  const rain=carrier.kind==='rain'||carrier.kind==='storm'&&(carrier.rainfed||carrier.rain>0);
  if (game.stage!==3||!game.terrainHeight||!rain) return Infinity;
  const fall=carrier.y-site.y, span=distance(carrier,site);
  if (fall<=2.15||fall>Math.min(5.8,2.7+carrier.radius*.55)||span>carrier.radius*.83) return Infinity;
  // Rain can reach the foot of the slope only if no overlying ledge blocks
  // its actual column. Broad rain fields still have a finite footprint.
  for (const t of [.2,.45,.7,.9]) {
    const x=carrier.x+(site.x-carrier.x)*t,z=carrier.z+(site.z-carrier.z)*t;
    if (scorchGround(game,x,z)>carrier.y-fall*t+.17) return Infinity;
  }
  return Math.hypot(span,fall*.55);
}

function rainRunoff(game,carrier,site) {
  const wet=carrier.kind==='rain'||carrier.kind==='storm'&&(carrier.rainfed||carrier.rain>0);
  if(game.stage!==3||!game.terrainHeight||!wet) return null;
  const length=distance(carrier,site);
  if(length<carrier.radius+.65||length>carrier.radius+8.2||length>12.4) return null;
  const edge=carrier.radius*.81/length;
  const x=carrier.x+(site.x-carrier.x)*edge,z=carrier.z+(site.z-carrier.z)*edge;
  const ground=scorchGround(game,x,z);
  const drop=ground-site.y;
  if(carrier.y-ground<-.08||carrier.y-ground>Math.min(6.2,3.2+carrier.radius*.63)||drop<1.05||drop>4.75) return null;
  for(const t of [.22,.46,.70,.9]) {
    const px=carrier.x+(x-carrier.x)*t,pz=carrier.z+(z-carrier.z)*t;
    if(scorchGround(game,px,pz)>carrier.y+(ground-carrier.y)*t+.18) return null;
  }
  const route=[{x,y:ground+.10,z,ground,along:0}];
  const span=distance(route[0],site),steps=Math.ceil(span/.48);
  let low=ground;
  for(let i=1;i<=steps;i++) {
    const t=i/steps, px=x+(site.x-x)*t,pz=z+(site.z-z)*t;
    const floor=scorchGround(game,px,pz);
    if(floor>low+.32 || Math.abs(floor-route.at(-1).ground)>.75) return null;
    low=Math.min(low,floor);
    route.push({x:px,y:floor+.10,z:pz,ground:floor,along:span*t});
  }
  if(Math.abs(route.at(-1).ground-site.y)>.50) return null;
  return {points:route,travel:.17+span*.045,fall:drop};
}

function runoffContacts(game,carrier,lane,site,contacts) {
  if(contacts.length>=6||contacts.some(other=>distance(other.site,site)<1.35)) return;
  const runoff=rainRunoff(game,carrier,site);
  if(!runoff) return;
  contacts.push({carrier,lane,site,runoff});
}

function beginScorchRunoff(game,heat,contact) {
  const {art}=heat,{carrier,lane,site,runoff,route}=contact;
  const at=game.time+runoff.travel;
  if(lane.expires<=at||carrier.life<=runoff.travel) return false;
  heat.runoff={...contact,at};
  game.emit('dragonArtReaction',{...eventData(art),...point(site),reaction:'beam-quench-runoff',site:point(site),
    from:runoff.points[0],to:point(site),points:runoff.points,carrier:carrier.kind,carrierId:carrier.id,laneId:lane.id,
    steamTo:route.path.at(-1),receiverIds:route.hits.map(enemy=>enemy.id),
    terrainFall:runoff.fall,travel:runoff.travel,duration:runoff.travel});
  return true;
}

function finishScorchRunoff(game,heat) {
  const contact=heat.runoff;
  if(!contact||game.time<contact.at) return;
  heat.runoff=null;
  const {carrier,lane,site}=contact;
  const available=heat.quenched<SCORCH_MAX_FRONTS&&!heat.carriers.has(carrier.id)&&lane.expires>game.time&&
    carrier.life>0&&!heat.douses.some(mark=>Math.abs(mark.y-site.y)<=1.35&&distance(mark,site)<=mark.radius+.8);
  const from={...point(site),y:site.y+.28};
  const route=available&&chooseQuenchPath(game,heat,from,lane.direction,false,true);
  if(route?.terrainRise) {
    quenchScorch(game,heat,{...contact,from,route});
    return;
  }
  game.emit('dragonArtReaction',{...eventData(heat.art),...point(site),reaction:'beam-quench-runoff-cancel',
    site:point(site),from:contact.runoff.points[0],to:point(site),carrier:carrier.kind,carrierId:carrier.id,laneId:lane.id,depth:2,
    reason:available?'receivers-left':'heat-or-water-spent'});
}

function scorchedSamples(game, heat) {
  const sites=[];
  for (const lane of heat.lanes) {
    if (game.time-lane.plantedAt<.10||lane.expires<=game.time) continue;
    const samples=lane.points.flatMap((site,index,points)=>{
      const before=points[index-1];
      const middle=before&&scorchSample(lane,(before.along+site.along)*.5);
      return middle?[site,middle]:[site];
    });
    for (const site of samples) {
      if (!heat.douses.some(mark=>Math.abs(mark.y-site.y)<=1.35&&distance(mark,site)<=mark.radius+.8)) sites.push({lane,site});
    }
  }
  return sites;
}

function findScorchContact(game, heat, carriers, climbOnly = false) {
  // Check the real terrain trace, including a carrier between two samples.
  let winning;
  const samples=scorchedSamples(game,heat);
  for (const carrier of carriers) {
    if (heat.carriers.has(carrier.id)) continue;
    let best;
    const falling=[];
    const runoff=[];
    for (const {lane,site} of samples) {
      const middle=carrierPoint(carrier,site);
      const gap=Math.hypot(distance(middle,site),(middle.y-site.y)*1.25);
      if (Math.abs(middle.y-site.y)<=2.15&&gap<=carrier.radius+.55) {
        if (!best||gap<best.gap) best={carrier,lane,site,gap};
        continue;
      }
      const wet=rainSlopeGap(game,carrier,site);
      if (Number.isFinite(wet) && (falling.length<3||wet<falling.at(-1).gap)) {
        // Neighboring trace samples often lie at the same wet foot. Keep
        // a short list of distinct footprints for the climb search.
        const nearby=falling.findIndex(candidate=>distance(candidate.site,site)<1.35);
        if (nearby>=0 && wet>=falling[nearby].gap) continue;
        if (nearby>=0) falling.splice(nearby,1);
        falling.push({carrier,lane,site,gap:wet,rainfall:true});
        falling.sort((a,b)=>a.gap-b.gap);
        if (falling.length>3) falling.pop();
      }
      if(!heat.runoff&&!Number.isFinite(wet)) runoffContacts(game,carrier,lane,site,runoff);
    }
    for (const contact of [best,...falling,...runoff]) {
      if (!contact) continue;
      const {site,lane}=contact;
      const crest=carrier.kind==='water-crest';
      const from={...point(site),y:site.y+.28};
      const route=chooseQuenchPath(game,heat,from,crest?(carrier.direction??lane.direction):lane.direction,crest,
        climbOnly||contact.rainfall||Boolean(contact.runoff));
      if (!route) continue;
      const score=route.score-(contact.runoff?.travel??0)*.4;
      if (!winning||score>winning.score) winning={...contact,from,route,score};
    }
  }
  return winning;
}

export function beamRainPlacement(game,target,radius) {
  const heat=game.dragonScorch;
  if(game.stage!==3||!game.terrainHeight||!heat||heat.stage!==game.stage||!heat.lanes.length||!Number.isFinite(radius)||radius<=0||
      heat.quenched>=SCORCH_MAX_FRONTS||target.hp<=0||target.boss) return null;
  const from=point(target);
  const candidate=findScorchContact(game,heat,[{...from,kind:'rain',radius:clamp(radius,1,10)}],true);
  if(!candidate||candidate.lane.expires<=game.time+(candidate.runoff?.travel??0)+.20) return null;
  return candidate.score;
}

function quenchPath(game,from,direction) {
  const points=[{...from,along:0}];
  for (let along=1.10; along<=8.9; along+=1.10) {
    const x=from.x+direction.x*along, z=from.z+direction.z*along;
    const y=from.y+2.1*smooth(along/8.9);
    if (scorchGround(game,x,z)>y+.15) break;
    points.push({x,y,z,along});
  }
  return points;
}

function slopeQuenchPath(game,from,direction) {
  const floor=scorchGround(game,from.x,from.z);
  const points=[{...from,along:0,ground:floor}];
  let highest=floor;
  for (let along=.55; along<=10.0; along+=.55) {
    const x=from.x+direction.x*along, z=from.z+direction.z*along;
    const ground=scorchGround(game,x,z);
    const rise=ground-floor;
    // A steam bank can climb an actual slope but separates at cliffs and
    // loses its heat when the ground falls away behind a crest.
    if (Math.abs(ground-points.at(-1).ground)>.68 || ground<highest-.78 || rise>4.4) break;
    highest=Math.max(highest,ground);
    points.push({x,z,y:ground+.28+1.05*smooth(along/9.9),ground,along});
  }
  return points;
}

function quenchAltitude(path,along) {
  const step=path[1].along;
  const index=clamp(along/step,0,path.length-1);
  const a=path[Math.floor(index)],b=path[Math.ceil(index)];
  return a.y+(b.y-a.y)*(index%1);
}

function quenchContact(game, direction, from, reach, enemy, first=.20, slope) {
  const x=enemy.x-from.x, z=enemy.z-from.z;
  const along=x*direction.x+z*direction.z;
  if (along<first||along>reach||Math.abs(x*direction.z-z*direction.x)>SCORCH_WIDTH) return false;
  const y=slope ? quenchAltitude(slope,along) : from.y+2.1*smooth(clamp(along/8.9,0,1));
  return Math.abs(enemy.y-y)<=1.60 && scorchGround(game,enemy.x,enemy.z)<=y+.15;
}

function climbChoices(game,from,direction,directed) {
  if (directed) return [];
  const aim=Math.atan2(direction.x,direction.z);
  const origin=scorchGround(game,from.x,from.z);
  return [-1.10,1.10,-1.49,1.49].map(turn=>facing(aim+turn)).filter(heading=>
    scorchGround(game,from.x+heading.x*3.2,from.z+heading.z*3.2)>origin+.55);
}

function chooseQuenchPath(game,heat,from,direction,directed,climbOnly = false) {
  const flatTargets=nearby(game,from,10,5).filter(enemy=>!enemy.boss&&!heat.steamHits.has(enemy.id));
  const terrain=game.stage===3&&game.terrainHeight;
  const raisedTargets=terrain ? nearby(game,from,10.55,6.05).filter(enemy=>!enemy.boss&&!heat.steamHits.has(enemy.id)) : flatTargets;
  const choices=[direction];
  // A moving water crest keeps its own heading. Other wet fields may vent
  // sideways along the hot trace, wherever the low path is still open.
  if (!directed) for (const turn of [-.37,.37,-.76,.76]) {
    choices.push(facing(Math.atan2(direction.x,direction.z)+turn));
  }
  const flatCount=choices.length;
  if (terrain) choices.push(...climbChoices(game,from,direction,directed));
  let best;
  for (const [index,heading] of choices.entries()) {
    const path=index<flatCount ? quenchPath(game,from,heading) : [];
    const hits=path.length<3 ? [] : flatTargets.filter(enemy=>quenchContact(game,heading,from,path.at(-1).along+.55,enemy));
    const penalty=Number(index>0)*.18;
    const score=hits.length-penalty;
    if (!climbOnly&&path.length>=3 && (!best||score>best.score)) best={path,direction:heading,hits,score};
    if (!terrain) continue;
    const slope=slopeQuenchPath(game,from,heading);
    const finish=slope.at(-1);
    const terrainRise=finish.ground-slope[0].ground;
    if (finish.along<4.4||terrainRise<1.75) continue;
    const reached=raisedTargets.filter(enemy=>quenchContact(game,heading,from,finish.along+.3,enemy,.20,slope));
    const high=reached.filter(enemy=>!hits.includes(enemy) && enemy.y-from.y>2.55 &&
      scorchGround(game,enemy.x,enemy.z)-slope[0].ground>=1.45);
    const value=reached.length+Math.min(2,high.length)*.28-penalty;
    if (high.length&&(!best||value>best.score)) best={path:slope,direction:heading,hits:reached,score:value,terrainRise};
  }
  return best;
}

function quenchScorch(game, heat, contact) {
  const {carrier,lane,site,from,route,rainfall,runoff}=contact;
  const {art}=heat;
  const radius=clamp(carrier.radius*.67+1.05,2.5,4.0);
  douseScorch(heat,site,radius);
  heat.carriers.add(carrier.id);
  game.metrics.steam++;
  game.metrics.reactions++;
  const zone=game.addZone('steam',{...point(site),y:site.y+.45,radius,life:SCORCH_STEAM_LIFE,power:1,weaponAnchor:'beam-quench'});
  const source={id:++heat.quenched,site:point(site),from,radius,laneId:lane.id,carrier:carrier.kind,
    carrierId:carrier.sourceId??carrier.id,zoneId:zone?.id,preparedAt:game.time,rainfall,runoff};
  if (route.hits.length) {
    releaseScorchSteam(game,heat,source,route);
  } else if (zone) {
    const expiresAt=game.time+Math.min(zone.life,SCORCH_STEAM_LIFE);
    const direction=carrier.kind==='water-crest' ? (carrier.direction??lane.direction) : lane.direction;
    heat.reservoirs.push({...source,direction,expiresAt});
    game.emit('dragonArtReaction',{...eventData(art),...point(site),reaction:'beam-quench-store',site:point(site),from,
      to:route.path.at(-1),laneId:lane.id,carrier:source.carrier,carrierId:source.carrierId,zoneId:zone.id,
      radius,douseRadius:radius,leg:source.id,storeUntil:expiresAt,duration:expiresAt-game.time});
  }
}

function releaseScorchSteam(game, heat, source, route) {
  const {art}=heat;
  const {id,site,from,radius,laneId,carrier,carrierId,zoneId,preparedAt,rainfall,runoff}=source;
  const {direction,hits,path:points,terrainRise}=route;
  const to=points.at(-1);
  const heldFor=game.time-preparedAt;
  const stored=heldFor>0;
  const travel=terrainRise ? .51 : SCORCH_TRAVEL;
  const front={id,from,to,points,direction,carrier,carrierId,laneId,zoneId,stored,terrainRise,travel,
    width:SCORCH_WIDTH,at:game.time,last:0};
  heat.fronts.push(front);
  game.emit('dragonArtReaction',{...eventData(art),...point(to),reaction:'beam-quench',from,to,points,direction,
    width:front.width,radius:front.width,site,laneId,douseRadius:radius,carrier,carrierId,zoneId,stored,
    reservedAt:preparedAt,heldFor,leg:id,receiverIds:hits.map(enemy=>enemy.id),
    ...(terrainRise&&{climbing:true,terrainRise,rainfall:Boolean(rainfall)}),
    ...(runoff&&{runoff:true,runoffFall:runoff.fall,runoffTravel:runoff.travel}),
    windup:SCORCH_WINDUP,travel,duration:SCORCH_WINDUP+travel});
}

function releaseStoredScorchSteam(game, heat) {
  heat.reservoirs=heat.reservoirs.filter(source=>{
    if (game.time>=source.expiresAt || !game.zones.some(zone=>zone.id===source.zoneId&&zone.kind==='steam'&&zone.life>0)) return false;
    const route=chooseQuenchPath(game,heat,source.from,source.direction,source.carrier==='water-crest');
    if (!route?.hits.length) return true;
    releaseScorchSteam(game,heat,source,route);
    return false;
  });
}

function sweepQuench(game, heat, front) {
  const {art}=heat;
  const age=game.time-front.at;
  if (age<SCORCH_WINDUP) return true;
  const head=front.to.along*progress(age,SCORCH_WINDUP,SCORCH_WINDUP+front.travel);
  const from=front.from, direction=front.direction;
  for (const enemy of nearby(game,front.to,front.to.along+front.width,4.8)) {
    if (art.hitBudget<=0||game.dragonScorch!==heat) break;
    if (enemy.boss||heat.steamHits.has(enemy.id)) continue;
    if (!quenchContact(game,direction,from,head+.55,enemy,Math.max(.20,front.last-.85),front.terrainRise ? front.points : null)) continue;
    heat.steamHits.add(enemy.id);
    enemy.burn=0;
    enemy.wet=Math.max(enemy.wet,5);
    strike(game,art,enemy,from,.62,'beam-quench',false,front.carrierId,undefined,
      {carrier:front.carrier,carrierId:front.carrierId,laneId:front.laneId,zoneId:front.zoneId,stored:front.stored,leg:front.id,
        ...(front.terrainRise&&{climbing:true,terrainRise:front.terrainRise})});
  }
  if (art.hitBudget<=0) return true;
  front.last=head;
  return head<front.to.along;
}

function updateScorch(game, heat) {
  const {art}=heat;
  heat.fronts=heat.fronts.filter(front=>sweepQuench(game,heat,front));
  finishScorchRunoff(game,heat);
  if (game.time<heat.nextAt||game.dragonScorch!==heat) return;
  heat.nextAt=game.time+SCORCH_INTERVAL;
  if (heat.reservoirs.length) releaseStoredScorchSteam(game,heat);
  if (heat.lanes.length&&heat.quenched<SCORCH_MAX_FRONTS) {
    const moisture=scorchMoisture(game).filter(carrier=>art.age>=1.39||carrier.kind==='water-crest');
    const contact=findScorchContact(game,heat,moisture);
    if (contact?.runoff) beginScorchRunoff(game,heat,contact);
    else if (contact) quenchScorch(game,heat,contact);
  }
  for (const lane of heat.lanes) {
    if (lane.expires<=game.time||game.time-lane.plantedAt<.12) continue;
    for (const enemy of nearby(game,lane.from,lane.length,lane.high-lane.low+2.2)) {
      if (art.hitBudget<=0||game.dragonScorch!==heat) return;
      if (heat.dryHits.has(enemy.id)||heat.steamHits.has(enemy.id)) continue;
      const x=enemy.x-lane.x,z=enemy.z-lane.z;
      const along=x*lane.direction.x+z*lane.direction.z;
      const side=Math.abs(x*lane.direction.z-z*lane.direction.x);
      if (side>lane.width||lane.doused.some(mark=>along>=mark.from&&along<=mark.to)) continue;
      const floor=scorchSample(lane,along);
      if (!floor||Math.abs(enemy.y-floor.y)>1.8||Math.abs(scorchGround(game,enemy.x,enemy.z)-floor.y)>1.12) continue;
      heat.dryHits.add(enemy.id);
      if(!enemy.boss)enemy.burn=Math.max(enemy.burn,2.8);
      strike(game,art,enemy,floor,.38,'beam-scorch',false,undefined,undefined,{laneId:lane.id});
    }
  }
}

function advanceScorch(game,dt) {
  const heat=game.dragonScorch;
  if (!heat) return;
  if (heat.stage!==game.stage || game.activeDragonArt!==heat.art && !heat.fronts.length && !heat.reservoirs.length && !heat.runoff &&
      !heat.lanes.some(lane=>lane.expires>game.time)) {
    game.dragonScorch=null;
    return;
  }
  const {art}=heat;
  if (game.activeDragonArt!==art) {
    art.age=game.time-art.startedAt;
    art.phaseAge=art.age-art.phaseAt;
    art.impactCount=0;
    art.hitBudget=Math.max(1,Math.floor(dt*HITS_PER_SECOND));
  }
  updateScorch(game,heat);
}

function updateBeam(game, art) {
  if (art.age < .52) return;
  if (art.phase === 'windup') phase(game, art, 'sweep', .52);
  if (art.phase !== 'sweep') return;
  if (art.rank===3&&art.doctrine==='echo'&&art.age<1.39) sampleBeamCrossing(game,art);
  const sweepEnd=art.rank===3 ? 2.08 : 1.91;
  if (art.age>sweepEnd) {
    phase(game,art,'release',sweepEnd);
    return;
  }
  const reverse = art.rank === 3 && art.age >= 1.39;
  if (reverse && art.beamReturns === undefined) {
    if(art.doctrine==='echo'){
      phase(game,art,'release',art.age);
      return;
    }
    art.beamReturns = beamCandidates(game.p, nearby(game, game.p, art.radius, art.height), art.sweep).length > 0;
    if (!art.beamReturns) {
      if(!art.scorchLanes?.length)art.duration = Math.min(art.duration, art.age + .24);
      phase(game, art, 'release', art.age);
      return;
    }
  }
  const previous = art.sweepAngle;
  const fraction = smooth(progress(art.age, reverse ? 1.39 : .52, !reverse&&art.rank===3 ? 1.39 : sweepEnd));
  const aim = art.angle + art.sweep * (reverse ? 1 - 2 * fraction : 2 * fraction - 1);
  art.sweepAngle = limitBeamTurn(game.p, aim);
  const stepAngle = Math.abs(turn(art.sweepAngle - previous));
  const middle = previous + turn(art.sweepAngle - previous) * .5;
  beamLane(game, art, middle, art.radius, art.beamWidth * (reverse ? .68 : 1),
    reverse ? art.secondary : art.hitTargets, reverse ? .59 : 1, stepAngle * .5);
  if(!reverse)layScorchLane(game,art);
}

function limitBeamTurn(player, angle) {
  return player.angle + clamp(turn(angle - player.angle), -1.32, 1.32);
}

function alternateFormation(targets, art, radius) {
  const fresh=targets.filter(enemy=>!art.hitTargets.has(enemy.id));
  const others=fresh.length?fresh:targets;
  const candidates=others.slice(0,32).map(enemy=>({point:enemy}));
  return crowdedCenter(candidates,radius,art.height,(center,reach,height)=>
    others.reduce((count,enemy)=>count+Number(Math.abs(enemy.y-center.y)<=height&&distance(enemy,center)<=reach),0));
}

function beginCrosscut(game, art) {
  const beam=art.kind==='beam';
  if(beam&&beginBeamInterception(game,art))return true;
  const origin=beam?game.p:art.center;
  let targets=nearby(game,origin,art.radius*(beam?.86:1.16),art.height);
  if(beam)targets=beamCandidates(game.p,targets,art.sweep);
  if(beam&&game.stage===3&&game.terrainHeight)targets=targets.filter(enemy=>beamInterceptionClear(game,origin,enemy));
  else targets=targets.filter(enemy=>distance(enemy,art.center)>=art.radius*.37);
  const cluster=alternateFormation(targets,art,beam?5.2:3.6);
  if(!cluster)return false;
  const through=cluster.center;
  const heading=toward(origin,through);
  const direction=facing(heading);
  const facingAngle=beam?heading:heading+Math.PI*.5;
  const axis=facing(facingAngle);
  art.echoCenter=through;
  art.echoRadius=beam?art.radius*.86:Math.min(8.4,art.radius*.48);
  art.echoAngle=facingAngle;
  art.echoWidth=beam?art.beamWidth*.77:1.65;
  art.echoFrom=beam?point(origin):{x:through.x-axis.x*art.echoRadius,y:through.y,z:through.z-axis.z*art.echoRadius};
  art.echoTo=beam?{x:origin.x+direction.x*art.echoRadius,y:through.y,z:origin.z+direction.z*art.echoRadius}
    :{x:through.x+axis.x*art.echoRadius,y:through.y,z:through.z+axis.z*art.echoRadius};
  return true;
}

function updateCrosscut(game,art) {
  if(art.kind==='beam'){
    const aim=limitBeamTurn(game.p,toward(game.p,art.echoCenter));
    const previous=art.sweepAngle;
    if(art.beamInterception){
      const offset=art.beamInterception.side*.29*(1-2*smooth(progress(art.phaseAge,.13,.49)));
      art.sweepAngle=limitBeamTurn(game.p,aim+offset);
      if(art.phaseAge<.13)return;
      const step=clamp(turn(art.sweepAngle-previous),-.18,.18);
      beamLane(game,art,art.sweepAngle-step*.5,art.echoRadius,art.echoWidth,art.echoTargets,.82,Math.abs(step)*.5,true);
      return;
    }
    const offset=.29*(1-2*smooth(progress(art.phaseAge,.07,.41)));
    art.sweepAngle=limitBeamTurn(game.p,aim+offset);
    const step=art.phaseAge<.11?0:turn(art.sweepAngle-previous);
    beamLane(game,art,art.sweepAngle-step*.5,art.echoRadius,art.echoWidth,art.echoTargets,.82,Math.abs(step)*.5);
    return;
  }
  const index=progress(art.phaseAge,.14,.38);
  if(art.phaseAge<.14)return;
  const direction=facing(art.echoAngle);
  for(const enemy of nearby(game,art.echoCenter,art.echoRadius+art.echoWidth,Math.min(4,art.height))){
    if(art.echoTargets.has(enemy.id))continue;
    const x=enemy.x-art.echoFrom.x,z=enemy.z-art.echoFrom.z;
    const along=x*direction.x+z*direction.z;
    if(along<0||along>art.echoRadius*2*index||Math.abs(x*direction.z-z*direction.x)>art.echoWidth)continue;
    art.echoTargets.add(enemy.id);
    strike(game,art,enemy,art.echoFrom,.88,'rift-crosscut');
  }
}

function riftLanePosition(lane, fraction) {
  return {x:lane.from.x+lane.dx*fraction, y:lane.from.y+lane.dy*fraction, z:lane.from.z+lane.dz*fraction};
}

function openRiftLane(game, from, to) {
  const dx = to.x-from.x, dy = to.y-from.y, dz = to.z-from.z;
  const length = Math.hypot(dx,dz);
  const lane = {from,to,dx,dy,dz,length,along:0};
  const samples = Math.max(1,Math.ceil(Math.hypot(length,dy)/.85));
  const points = [from];
  for (let i=1; i<=samples; i++) {
    const planned = riftLanePosition(lane,i/samples);
    const step = {...planned};
    game.stayInWater(step,.40,points.at(-1));
    if (distance(step,planned) > .23 || Math.abs(step.y-planned.y) > .32) return null;
    points.push(planned);
  }
  return {...lane,points};
}

function riftContact(lane, enemy, width = RIFT_SEAM_WIDTH) {
  const x = enemy.x-lane.from.x, z = enemy.z-lane.from.z;
  const fraction = (x*lane.dx+z*lane.dz)/(lane.length*lane.length);
  const across = Math.abs(x*lane.dz-z*lane.dx)/lane.length;
  if (fraction < .12 || fraction > 1 || across > width+(enemy.radius??0)*.32) return null;
  const join = riftLanePosition(lane,fraction);
  if (Math.abs(enemy.y-join.y) > 1.65+(enemy.radius??0)*.28) return null;
  return {join,fraction};
}

function beginRiftWindSeam(game, art) {
  const receipt=game.galeTransport;
  if(!receipt||!receipt.finished||receipt.spent||game.time-receipt.at>RIFT_WIND_WINDOW||art.riftSeam||art.riftRecoil)return;
  const {run,moves,cascadeId}=receipt;
  const cutFrom=point(run.to);
  if(distance(art.center,cutFrom)>art.radius*1.25||Math.abs(art.center.y-cutFrom.y)>art.height+.8)return;
  const delivered=[...moves.values()].filter(move=>move.travel>=.58&&distance(move.from,move.to)>=.45&&
    distance(move.to,cutFrom)<=run.width+4.5&&Math.abs(move.to.y-cutFrom.y)<art.height+.8);
  if(delivered.length<2)return;
  const from=point(art.portals.reduce((a,b)=>distance(a,cutFrom)<distance(b,cutFrom)?a:b));
  if(distance(from,cutFrom)<2.1||!openRiftLane(game,from,cutFrom))return;
  const candidates=nearby(game,cutFrom,17,art.height+.7).filter(enemy=>canDisplaceEnemy(enemy,game.time)&&
    !run.receivers.has(enemy.id)&&!art.hitTargets.has(enemy.id)&&!art.captures.has(enemy.id)&&
    !art.riftClash?.front?.targets.has(enemy)&&distance(cutFrom,enemy)>=2.3);
  let best;
  for(const anchor of candidates.slice(0,36)) {
    const heading=facing(toward(cutFrom,anchor));
    const cross=Math.abs(heading.x*run.direction.z-heading.z*run.direction.x);
    if(cross<.24||heading.x*run.direction.x+heading.z*run.direction.z<-.78)continue;
    const to={x:anchor.x+heading.x*1.5,y:anchor.y,z:anchor.z+heading.z*1.5};
    const lane=openRiftLane(game,cutFrom,to);
    if(!lane)continue;
    const targets=candidates.filter(enemy=>riftContact(lane,enemy,RIFT_WIND_WIDTH)).slice(0,12);
    if(targets.length<2)continue;
    const score=targets.length+cross*.64+lane.length*.04;
    if(!best||score>best.score)best={lane,targets,score};
  }
  if(!best)return;
  const {lane,targets}=best;
  const {to}=lane;
  const travel=clamp((distance(from,cutFrom)+lane.length)/56,.35,.58);
  const duration=RIFT_WIND_PREP+travel+RIFT_WIND_HOLD;
  const carriedIds=delivered.map(move=>move.enemy.id);
  const carrierMotion=delivered.slice(0,12).map(({enemy,from,to,travel})=>({id:enemy.id,from,to,travel}));
  const possible=new Set(targets.map(enemy=>enemy.id));
  receipt.spent=true;
  art.riftWindSeam={lane,possible,caught:new Map(),from,to,cutFrom,carrierFrom:run.from,carrierId:cascadeId,
    leg:receipt.leg,carriedIds,at:art.age,travel,duration,closed:false};
  art.duration=Math.max(art.duration,art.age+duration+.17);
  game.emit('dragonArtReaction',{...eventData(art),...to,reaction:'rift-wind-seam',from,to,points:[from,...lane.points],
    cutFrom,carrierFrom:run.from,leg:receipt.leg,carrierId:cascadeId,carriedIds,carrierMotion,
    width:RIFT_WIND_WIDTH,radius:RIFT_WIND_WIDTH,windup:RIFT_WIND_PREP,travel,hold:RIFT_WIND_HOLD,duration,
    receiverIds:[...possible],targets:targets.map(enemy=>({id:enemy.id,...point(enemy)}))});
}

function updateRiftWindSeam(game,art) {
  const seam=art.riftWindSeam;
  if(seam.closed)return;
  const age=art.age-seam.at;
  const {lane,cutFrom,to,from,caught,possible,leg,carrierId,carriedIds,travel,duration}=seam;
  if(age<RIFT_WIND_PREP)return;
  const crest=progress(age,RIFT_WIND_PREP+travel*.25,RIFT_WIND_PREP+travel);
  const common={leg,carrierId,carriedIds,cutFrom,width:RIFT_WIND_WIDTH};
  if(crest>lane.along) {
    const center=riftLanePosition(lane,(lane.along+crest)*.5);
    for(const enemy of nearby(game,center,(crest-lane.along)*lane.length*.5+RIFT_WIND_WIDTH+1.1,3.2)) {
      if(!possible.has(enemy.id)||caught.has(enemy.id)||!canDisplaceEnemy(enemy,game.time))continue;
      const hit=riftContact(lane,enemy,RIFT_WIND_WIDTH);
      if(!hit||hit.fraction<lane.along-.06||hit.fraction>crest+.03||!openRiftLane(game,point(enemy),hit.join))continue;
      const start=point(enemy);
      caught.set(enemy.id,{enemy,start,join:hit.join,offset:hit.fraction,at:age});
      enemy.dragonArtHeldAt=game.time;
      enemy.dragonArtHeldUntil=game.time+duration-age+.08;
      enemy.dragonArtMark='rift';
      enemy.weaponPush=null;
      game.emit('dragonArtReaction',{...eventData(art),...start,...common,reaction:'rift-wind-seam-bind',
        from:start,to,via:hit.join,targetId:enemy.id,travel:duration-age});
    }
    lane.along=crest;
  }
  const arrived=[];
  for(const [id,move] of caught) {
    const {enemy,start,join,offset,at}=move;
    if(enemy.hp<=0||!game.enemies.includes(enemy)) {
      caught.delete(id);releaseRiftPrey(enemy);continue;
    }
    const t=progress(age,at,duration);
    const along=smooth(progress(t,.18,1));
    const next=t<.18 ? closestRiftJoin(start,join,smooth(t/.18)) : riftLanePosition(lane,offset+(1-offset)*along);
    slide(game,art,enemy,next.x-enemy.x,next.y-enemy.y,next.z-enemy.z,to);
    enemy.dragonArtCaptureProgress=t;
    if(age>=duration) {
      if(distance(enemy,to)<.82&&Math.abs(enemy.y-to.y)<.55)arrived.push(enemy);
      releaseRiftPrey(enemy);
    }
  }
  if(age<duration)return;
  seam.closed=true;
  caught.clear();
  possible.clear();
  const ids=arrived.map(enemy=>enemy.id);
  game.emit('dragonArtReaction',{...eventData(art),...to,...common,reaction:ids.length?'rift-wind-seam-close':'rift-wind-seam-cancel',
    from,to,receiverIds:ids,capturedIds:ids,duration:.39});
  if(ids.length)game.metrics.reactions++;
  for(const enemy of arrived) {
    art.hitTargets.add(enemy.id);
    art.captured++;
    strike(game,art,enemy,to,1.23,'rift-wind-seam',true,undefined,undefined,common);
  }
}

function closestRiftJoin(from,to,t) {
  return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t};
}

function crossesRiftDirection(art, from, target, contact) {
  const dx = target.x-from.x, dz = target.z-from.z;
  const course = Math.hypot(dx,dz);
  const side = dx*art.direction.z-dz*art.direction.x;
  if (Math.abs(side) < course*.29 || contact.side && side*contact.side < 0) return false;
  return (dx*contact.direction.x+dz*contact.direction.z)/course > -.48;
}

function beginRiftSeam(game, art) {
  const contacts = art.riftTension?.contacts.filter(Boolean);
  if (!contacts?.length || art.hitTargets.size < 2) return false;
  const from = point(art.portals[0]);
  const targets = nearby(game,from,art.radius*1.58,art.stage===3?5.8:2.7).filter(enemy =>
    canDisplaceEnemy(enemy,game.time) && !art.hitTargets.has(enemy.id) && !art.captures.has(enemy.id) &&
    distance(from,enemy) >= art.radius*.60);
  let best = null, score = -Infinity;
  for (const aim of targets.slice(0,24)) {
    const contact = contacts.find(item => crossesRiftDirection(art,from,aim,item));
    if (!contact) continue;
    const forward = facing(toward(from,aim));
    const to = {x:aim.x+forward.x*2.1,y:aim.y,z:aim.z+forward.z*2.1};
    const lane = openRiftLane(game,from,to);
    if (!lane) continue;
    const receivers = targets.filter(enemy => riftContact(lane,enemy) !== null).slice(0,RIFT_SEAM_CAP);
    if (receivers.length < 2) continue;
    const weight = receivers.length + contact.score*.10 + distance(from,aim)*.012;
    if (weight <= score) continue;
    best = {lane,receivers,contact};
    score = weight;
  }
  if (!best) return false;
  const {lane,receivers,contact} = best;
  const travel = clamp(lane.length/36,.44,.73);
  const duration = RIFT_SEAM_WINDUP + travel + RIFT_SEAM_SETTLE;
  const carrier = contact.source === 'cascade-wind' ? 'wind' : contact.source === 'claw' ? 'claw' : 'needle';
  art.riftSeam = {...lane,travel,carrier,sourceId:contact.targetId,caught:new Map(),
    possible:new Set(receivers.map(enemy=>enemy.id)),closed:false};
  art.duration = art.age + duration + .20;
  art.echoPhase = 'seam';
  phase(game,art,'echo',art.age);
  game.emit('dragonArtReaction', {...eventData(art),...lane.to,reaction:'rift-seam',
    from:lane.from,to:lane.to,points:lane.points,width:RIFT_SEAM_WIDTH,windup:RIFT_SEAM_WINDUP,travel,
    settle:RIFT_SEAM_SETTLE,duration,carrier,sourceId:contact.targetId,cutFrom:point(contact),
    carrierId:contact.carrierId,receiverIds:[...art.riftSeam.possible]});
  return true;
}

function bindRiftSeam(game, art, seam, enemy, contact, closeAt) {
  const from = point(enemy);
  const {join,fraction} = contact;
  const check = {...join};
  game.stayInWater(check,.40,from);
  if (distance(check,join) > .22 || Math.abs(check.y-join.y) > .28) return;
  const move = {enemy,from,join,start:art.phaseAge,joinAt:art.phaseAge+.11,planned:fraction};
  seam.caught.set(enemy.id,move);
  const hold = game.time + closeAt-art.phaseAge+.08;
  enemy.dragonArtHeldAt = game.time;
  enemy.dragonArtHeldUntil = hold;
  enemy.dragonArtMark = 'rift';
  enemy.dragonArtCaptureProgress = 0;
  enemy.weaponPush = null;
  game.emit('dragonArtReaction', {...eventData(art),...from,reaction:'rift-seam-bind',
    from,via:join,to:seam.to,points:[from,join,seam.to],targetId:enemy.id,sourceId:seam.sourceId,
    width:RIFT_SEAM_WIDTH,carrier:seam.carrier,travel:closeAt-art.phaseAge,settle:RIFT_SEAM_SETTLE});
}

function moveAlongRiftSeam(game, art, seam, move, closeAt) {
  const {enemy,from,join,start,joinAt,planned} = move;
  const age = art.phaseAge;
  const capture = progress(age,start,closeAt);
  let next;
  if (age < joinAt) {
    const pull = smooth(progress(age,start,joinAt));
    next = {x:from.x+(join.x-from.x)*pull,y:from.y+(join.y-from.y)*pull,z:from.z+(join.z-from.z)*pull};
  } else {
    const pull = smooth(progress(age,joinAt,closeAt));
    next = riftLanePosition(seam,planned+(1-planned)*pull);
  }
  slide(game,art,enemy,next.x-enemy.x,next.y-enemy.y,next.z-enemy.z,seam.to);
  enemy.dragonArtCaptureProgress = capture;
}

function releaseRiftPrey(enemy) {
  release(enemy);
  delete enemy.dragonArtCaptureProgress;
}

function updateRiftSeam(game, art) {
  const seam = art.riftSeam;
  if (seam.closed || art.phaseAge < RIFT_SEAM_WINDUP) return;
  const now = art.phaseAge;
  const closeAt = RIFT_SEAM_WINDUP + seam.travel + RIFT_SEAM_SETTLE;
  const head = progress(now,RIFT_SEAM_WINDUP,RIFT_SEAM_WINDUP+seam.travel);
  if (now <= RIFT_SEAM_WINDUP+seam.travel+.08 && head>seam.along) {
    const middle = riftLanePosition(seam,(head+seam.along)*.5);
    const span = (head-seam.along)*seam.length;
    for (const enemy of nearby(game,middle,span*.5+RIFT_SEAM_WIDTH+1.2,2.5)) {
      if (!seam.possible.has(enemy.id) || seam.caught.has(enemy.id) || !canDisplaceEnemy(enemy,game.time)) continue;
      const contact = riftContact(seam,enemy);
      if (!contact || contact.fraction < seam.along-.055 || contact.fraction > head+.018) continue;
      bindRiftSeam(game,art,seam,enemy,contact,closeAt);
    }
    seam.along = head;
  }
  const received = [];
  for (const move of seam.caught.values()) {
    const {enemy} = move;
    if (enemy.hp <= 0 || !game.enemies.includes(enemy)) {
      seam.caught.delete(enemy.id);
      releaseRiftPrey(enemy);
      continue;
    }
    moveAlongRiftSeam(game,art,seam,move,closeAt);
    if (now < closeAt) continue;
    if (distance(enemy,seam.to) < .65 && Math.abs(enemy.y-seam.to.y) < .48) received.push(enemy);
    releaseRiftPrey(enemy);
  }
  if (now < closeAt) return;
  seam.closed = true;
  seam.caught.clear();
  const arrived = received.map(enemy=>enemy.id);
  game.emit('dragonArtReaction',{...eventData(art),...seam.to,reaction:'rift-seam-close',
    from:seam.from,to:seam.to,receiverIds:arrived,capturedIds:arrived,sourceId:seam.sourceId,width:RIFT_SEAM_WIDTH,
    carrier:seam.carrier,duration:.36});
  if (!arrived.length) return;
  game.metrics.reactions++;
  for (const enemy of received) {
    art.captured++;
    strike(game,art,enemy,seam.to,.95,'rift-seam',true,seam.sourceId,undefined,{carrier:seam.carrier});
  }
}

function updateEcho(game, art, dt) {
  const {kind}=art;
  if(art.doctrine!=='echo'||kind==='stone'||kind==='frost'||art.echoSkipped)return;
  if(kind==='rift'&&art.riftWindSeam&&!art.riftWindSeam.closed)return;
  const echoAt=kind==='beam'?1.43:arts[kind].duration-.10;
  if(art.age<echoAt)return;
  if (kind === 'rift' && art.riftSeam) {
    updateRiftSeam(game,art);
    return;
  }
  if (art.phase !== 'echo') {
    if (kind === 'rift' && beginRiftSeam(game,art)) return;
    let found=false;
    if(kind==='abyss'){
      const targets=nearby(game,art.center,art.radius*1.22,art.height).filter(enemy=>
        distance(enemy,art.center)>5.6);
      const inherited=inheritedCenter(game,kind,targets,art.radius*1.8,art.height,art.center,art.center);
      const cluster=inherited??alternateFormation(targets,art,5.4);
      if(cluster){
        art.echoCenter=cluster.center;
        art.echoRadius=Math.min(7.8,art.radius*.49);
        art.echoFrom=art.center;
        art.echoTo=art.echoCenter;
        art.echoInheritance=cluster.cause;
        found=true;
      }
    }else found=beginCrosscut(game,art);
    if(!found){
      art.echoSkipped=true;
      art.duration=Math.min(art.duration,art.age+.24);
      if(kind==='beam')phase(game,art,'release',art.age);
      return;
    }
    art.echoTargets = new Set();
    art.echoPhase=kind==='abyss'?'pull':'sweep';
    art.duration=echoAt+.58;
    phase(game, art, 'echo', echoAt);
    if(kind==='abyss')announceAbyssTransfer(game,art);
    if(art.beamInterception)announceBeamInterception(game,art);
  }
  if(kind!=='abyss'){updateCrosscut(game,art);return;}
  const targets = nearby(game, art.echoCenter, art.echoRadius, art.height);
  if (art.age < echoAt + .22) {
    for (const enemy of targets) {
      if (!canDisplaceEnemy(enemy, game.time)) continue;
      const dx = art.echoCenter.x - enemy.x, dz = art.echoCenter.z - enemy.z;
      const pull = 1 - Math.exp(-dt * 6.4);
      slide(game,art,enemy,(dx-dz*.44)*pull,0,(dz+dx*.44)*pull,art.echoCenter);
    }
    return;
  }
  if (art.echoPhase !== 'collapse' && art.age >= echoAt + .41) {
    art.echoPhase = 'collapse';
    game.emit('dragonArtPhase', eventData(art));
  }
  for (const enemy of targets) {
    if (art.echoTargets.has(enemy.id)) continue;
    if (enemy.boss) {
      if (art.echoPhase === 'collapse') {
        art.echoTargets.add(enemy.id);
        strike(game, art, enemy, art.echoCenter, .68, 'abyss-transfer');
      }
      continue;
    }
    if (art.age < echoAt + .32 && canDisplaceEnemy(enemy, game.time) &&
        !art.captures.has(enemy.id) && art.captures.size < MAX_CAPTURES) {
      art.echoTargets.add(enemy.id);
      const duration = .20 + .015 * (enemy.id % 5);
      beginCapture(art, enemy, art.echoCenter, duration, true);
      const from = point(enemy);
      game.emit('dragonArtReaction',{...eventData(art),...from,reaction:'abyss-transfer-bind',
        from,to:art.echoCenter,targetId:enemy.id,travel:duration,duration});
    } else if (art.echoPhase === 'collapse') {
      art.echoTargets.add(enemy.id);
      strike(game, art, enemy, art.echoCenter, .68, 'abyss-transfer');
    }
  }
}

export function updateDragonArt(game, dt) {
  const kind = game.cultivation.dragonArt;
  if (game.status !== 'playing') return;
  if(game.galeTransport&&game.time-game.galeTransport.at>RIFT_WIND_WINDOW)game.galeTransport=null;
  const state = game.activeDragonArt;
  if (state && state.stage !== game.stage) resetDragonArt(game);
  if (game.dragonScorch?.art!==game.activeDragonArt) advanceScorch(game,dt);
  if (!arts[kind] || game.stage >= 4 || game.status !== 'playing') return;
  const rank = clamp(game.cultivation.dragonArtRank ?? 1, 1, 3);
  if (!game.activeDragonArt) {
    if (game.time - (game.dragonArtEngagedAt ?? -Infinity) < 3.4) {
      game.dragonArtCharge = Math.min(CHARGE, (game.dragonArtCharge ?? 0) + dt * (10 + rank));
    }
    if (game.stage < 1 || FORM_BY_STAGE[game.stage] < (DRAGON_ARTS[kind].minForm ?? 0) ||
        (game.dragonArtCharge ?? 0) < CHARGE || game.time < (game.nextDragonArtAt ?? 0)) return;
    const rule = arts[kind];
    const reach = game.cultivation.dragonArtDoctrine === 'reach';
    const baseRadius=rule.radius*[0,1,1.19,1.36][rank];
    const radius=baseRadius*(reach&&kind==='stone'?1.18:1);
    const height=rule.height*(1+(rank-1)*(kind==='frost'||kind==='abyss'?.23:.12))+
      (reach&&kind==='abyss'&&game.stage>=3?2.1:0);
    let targets = castTargets(game, radius, height);
    if (targets && kind === 'beam') {
      const frontal = beamCandidates(game.p, targets, [.0, .80, 1.08, 1.29][rank]);
      targets = frontal.length >= 2 || frontal.some(enemy => enemy.boss) ? frontal : null;
    }
    if (targets) beginArt(game, kind, rank, radius, height, targets);
    return;
  }
  const art = game.activeDragonArt;
  art.age = game.time - art.startedAt;
  art.phaseAge = art.age - art.phaseAt;
  art.impactCount = 0;
  art.lockCount = 0;
  // Extreme hordes use the same damage and loot callbacks as regular shots.
  // Meter each burst across frames so thousands of kills cannot stall a cast.
  art.hitBudget = Math.max(1, Math.floor(dt * HITS_PER_SECOND));
  if (art.captures?.size) {
    prepareMouthBatches(game,art);
    updateCaptures(game, art);
  }
  if(art.mouthBatches)finishMouthBatches(game,art);
  resolvePending(game, art);
  if (game.activeDragonArt !== art || game.status !== 'playing') return;
  if (art.kind === 'stone' || art.kind === 'frost') updateStasis(game, art);
  else if (art.kind === 'beam') {
    advanceScorch(game,dt);
    if (game.activeDragonArt===art&&game.status==='playing') updateBeam(game, art);
  }
  else updatePull(game, art, dt);
  updateEcho(game, art, dt);
  if (art.quarry?.length) quarryRelease(game, art);
  if (art.secondaryFront) updateSecondaryFront(game, art);
  if (art.stoneMarch) updateStoneMarch(game, art);
  if (art.kind === 'frost') {
    breakFrostSheets(game,art);
    updateIceFork(game, art);
    updateTemperRush(game,art);
  }
  if (art.kind === 'beam') updateConduit(game, art);
  announceMajorClear(game,art);
  const march = art.stoneMarch;
  if (march && (march.front || march.anchors.length && art.age < STONE_MARCH_CLOSES)) return;
  const contour=art.stoneContour;
  if (contour && (contour.fronts.some(front=>!front.done) || !contour.spent&&contour.breaks.size>=STONE_CONTOUR_MIN&&
      art.age<STONE_CONTOUR_CLOSES)) return;
  if (art.age < art.duration || art.pending.length || art.quarry?.length || art.secondaryFront || art.captures?.size ||
      art.conduit?.branches.length || art.iceFork?.paths.length || art.iceSheets?.reserved.size || art.temperRush?.front || game.activeDragonArt !== art) return;
  for (const enemy of art.locked.values()) release(enemy);
  game.activeDragonArt = null;
  game.emit('dragonArtEnd', eventData(art));
  openCascadeFollowThrough(game,art);
}
