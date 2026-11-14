import { ENEMY_TYPES } from './encounters.js';
import { marketChoices } from './market-choices.js';
import { clamp, flightBand, random, TAU } from './rules.js';
import { FRONTIER_SIZE, frontierCell, frontierLandmark, frontierPassage, frontierSeed } from './world-frontier.js';
import { OATHS, oathTrialResult, startOathTrial } from './wonder-oaths.js';
import { beginWildAssault, finishWildAssault, updateWildAssault, wildAssaultHint, wildAvailable } from './wonder-wild.js';

const names = {
  whirlpool: '回潮水眼', sword: '分水古剑', pigment: '山海墨髓',
  palm: '金身落掌', gates: '朱阙三封', crane: '仙鹤衔羽',
  carp: '白鲤寻珠', spring: '潮门夺珠',
  wild: '镇潮四阵',
};
const pigments = {
  ochre: { id: 'ochre', name: '朱砂墨', color: '#982e23', light: '#d4976c', effect: '伤害 +13% · 剑气灼伤', damage: 1.13 },
  indigo: { id: 'indigo', name: '青黛墨', color: '#243c75', light: '#7aa7c2', effect: '吸附 +28% · 剑气引潮', magnet: 1.28 },
};
const coreSites = [
  [['sword', .35, .75, 9.1], ['whirlpool', 0, .12, 23.5]],
  [['whirlpool', 3, .12, 20], ['pigment', 12, 1.1, 11]],
  [['sword', -2.4, .98, 10], ['whirlpool', -8, .22, 25], ['pigment', 14, 1.25, 9]],
  [['crane', -.4, 11.65, 13.6], ['palm', 2.8, 11.45, 28.5], ['gates', -8.5, 10.4, 43.6]],
];
const frontierKinds = [
  ['whirlpool', 'carp', 'sword', 'spring', 'pigment'],
  ['carp', 'pigment', 'spring', 'whirlpool', 'sword', 'oath'],
  ['whirlpool', 'sword', 'spring', 'pigment', 'carp', 'oath'],
  ['palm', 'gates', 'crane', 'pigment', 'gates', 'oath'],
];
const surgeRosters = [
  [ENEMY_TYPES.minnow, ENEMY_TYPES.crab],
  [ENEMY_TYPES.eel, ENEMY_TYPES.polyp],
  [ENEMY_TYPES.seaRay, ENEMY_TYPES.eel, ENEMY_TYPES.polyp],
];
const worldReach = 43;
const springCycle = 2.85;
const springWindup = .32;
const springReady = 1.27;
const springClose = 2.76;
const point = ({x, y, z}) => ({x, y, z});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const forward = (origin, angle, along, lateral = 0) => ({
  x: origin.x + Math.sin(angle) * along + Math.cos(angle) * lateral,
  y: origin.y,
  z: origin.z + Math.cos(angle) * along - Math.sin(angle) * lateral,
});

export function createWonders() {
  return {
    stage: -1, cells: new Map(), known: new Set(), outcomes: new Map(),
    sites: [], cores: [], active: null, guide: null, waypoint: null, slashes: [], swordTargets: [],
    relics: {sword: 0, feather: 0, tideStone: 0, oath: null, wild: null}, pigment: null, swordCD: 0, slashSide: 1,
    artifact: {charge: null, dashPath: null, targets: []},
    wildDash: null, breakwater: null,
    sealedUntil: 0, market: 0, normalRewardAt: 0, bossReadyAt: 0, nextTrialAt: 0,
    metrics: {discovered: 0, attempts: 0, completed: 0, failed: 0, relics: 0},
  };
}

export function resetWonders(game) {
  const wonders = game.wonders;
  wonders.stage = -1;
  wonders.cells.clear();
  wonders.known.clear();
  wonders.outcomes.clear();
  wonders.sites = [];
  wonders.cores = [];
  wonders.active = null;
  wonders.guide = null;
  wonders.waypoint = null;
  wonders.slashes = [];
  wonders.swordTargets.length = 0;
  wonders.artifact.dashPath = null;
  wonders.artifact.targets.length = 0;
  wonders.wildDash = null;
  wonders.breakwater = null;
  wonders.sealedUntil = 0;
  wonders.market = 0;
  wonders.normalRewardAt = 0;
  wonders.bossReadyAt = 0;
  wonders.nextTrialAt = 0;
}

function carpPath(origin, angle, at, bend) {
  return forward(origin, angle, at * 17.5, bend * Math.sin(at * TAU) * 1.75);
}

function carpRoute(game, origin, angle) {
  for (const offset of [0, -.36, .36, -.75, .75, 1.3, -1.3, Math.PI]) {
    const heading = angle + offset;
    const bend = offset < 0 ? -1 : 1;
    let clear = true;
    for (let i = 1; i <= 14 && clear; i++) {
      const {x, z} = carpPath(origin, heading, i / 14, bend);
      clear = !game.onLand(x, z, 1.15);
    }
    if (clear) return {origin, heading, bend};
  }
  return null;
}

function makeSite(game, id, kind, x, y, z, roll, course) {
  const { stage } = game;
  const radius = kind === 'whirlpool' ? (stage === 0 ? 7.5 : 8.5)
    : kind === 'crane' ? 5.2 : kind === 'palm' || kind === 'gates' ? 7
      : kind === 'spring' ? 6.5 : kind === 'carp' ? 4.65 : kind === 'oath' ? 4.8 : kind === 'wild' ? 15.8 : 1.6;
  if (stage < 2 || stage === 2 && game.shoreHeight) {
    const samples = kind === 'whirlpool' || kind === 'spring' ? 12 : 1;
    for (let i = 0; i < samples; i++) {
      const angle = i / samples * TAU;
      const reach = samples === 1 ? 0 : radius * .86;
      if (game.onLand(x + Math.sin(angle) * reach, z + Math.cos(angle) * reach, .65)) return null;
    }
    if (game.onLand(x, z, .6)) return null;
  }
  if (stage === 3) {
    const [, high] = flightBand(stage);
    const ground = game.terrainHeight?.(x, z) ?? -Infinity;
    y = Math.max(y, ground + (kind === 'crane' ? 2.25 : 1.65));
    if (y > high - 1.2) return null;
  }
  const outcome = game.wonders.outcomes.get(id);
  const pigment = roll() < .5 ? pigments.ochre : pigments.indigo;
  const angle = typeof course === 'number' ? course : roll() * TAU;
  const route = kind === 'carp' ? carpRoute(game, {x, y, z}, angle) : null;
  if (kind === 'carp' && !route) return null;
  return {
    id, stage, kind, x, y, z, radius, angle, route, progress: 0,
    triggerRadius:kind==='wild'?8.2:undefined,
    innerRadius: kind === 'whirlpool' ? 1.7 : undefined,
    claimRadius: kind === 'sword' ? 2.2 : 1.75,
    relic: kind === 'pigment' ? pigment.id : kind === 'sword' ? 'sword' : kind === 'crane' ? 'feather'
      : kind === 'carp' ? 'pearl' : kind === 'spring' ? 'tideStone'
        : kind === 'oath' ? course ?? (roll()<.5?'mirror':'tether') : undefined,
    phase: outcome === true ? 'spent' : 'ready', retryAt: typeof outcome === 'number' ? outcome : 0,
    startedAt: null, endsAt: null, hazards: [],
  };
}

function openingSites(game) {
  const side = frontierSeed(game.worldSeed, game.stage, 0, 0, 203) % 2 ? 1 : -1;
  const carp = Boolean((game.worldSeed + game.stage) % 2);
  let opening = coreSites[game.stage];
  if(game.stage===0&&!carp)opening=[['sword',-side*5.5,.75,10.8],['whirlpool',-side*7.2,.12,29.5]];
  const branch = [carp ? 'carp' : 'spring', side * 6.9, carp ? .44 : .14,
    [carp?35.6:22.8, 36.8, 37.2][game.stage], side * .17];
  const sites = game.stage < 3 ? [...opening, branch] : opening;
  return sites.flatMap(([kind, x, y, z, course], index) => {
    const roll = random(frontierSeed(game.worldSeed, game.stage, 0, 0, 482 + index));
    const spread = game.stage === 0 ? .45 : 2;
    const x0 = x + (roll() - .5) * spread;
    const z0 = z + (roll() - .5) * 1.7;
    const id = `${game.stage}:origin:${index}`;
    for (const [dx, dz] of [[0, 0], [3, -1], [-3, -2], [0, -5], [-3, 4], [5, 5]]) {
      const site = makeSite(game, id, kind, x0 + dx, y, z0 + dz, roll, course);
      if (site) return [site];
    }
    return [];
  });
}

function frontierSite(game, column, row) {
  if (!column && !row) return null;
  const id = `${game.stage}:${column}:${row}`;
  if (game.wonders.active?.id === id) return game.wonders.active;
  const outcome = game.wonders.outcomes.get(id);
  if (outcome === true) return null;
  if (outcome?.phase === 'reward') return outcome;
  const roll = random(frontierSeed(game.worldSeed, game.stage, column, row, 62713));
  const landmark=frontierLandmark(game.worldSeed,game.stage,column,row);
  if(landmark){
    if(game.stage===2){
      const assault=makeSite(game,id,'wild',landmark.x,.18,landmark.z,roll);
      if(assault){
        assault.landmark=landmark.name;
        assault.passageLandmark=landmark;
        return assault;
      }
    }
    const relic=((game.worldSeed+game.stage+1)&1)?'mirror':'tether';
    for(const along of [0,5,-5,9,-9]){
      const at=forward({x:landmark.x,y:game.stage===3?11.8:.82,z:landmark.z},landmark.heading,along);
      const shrine=makeSite(game,id,'oath',at.x,at.y,at.z,roll,relic);
      if(shrine){
        shrine.landmark=landmark.name;
        shrine.passageLandmark=landmark;
        return shrine;
      }
    }
  }
  if (roll() < .20) return null;
  const kinds = frontierKinds[game.stage];
  // A shifted lattice puts distinct kinds in adjacent cardinal cells. The
  // regional offset changes the route mix without using generation order.
  const region = frontierSeed(game.worldSeed, game.stage, Math.floor(column / 5), Math.floor(row / 5), 359);
  const index = (column + row * 2 + region % kinds.length) % kinds.length;
  const kind = kinds[(index + kinds.length) % kinds.length];
  const assault = game.stage === 2 && kind === 'whirlpool' && roll() < .26;
  const center = {x: column * FRONTIER_SIZE, z: row * FRONTIER_SIZE};
  const y = game.stage === 3 ? 9.5 + roll() * 5.5 : kind === 'whirlpool' || kind === 'spring' ? .16
    : kind === 'carp' ? .44 : game.stage === 0 ? .75 : 1.15;
  for (let i = 0; i < 9; i++) {
    const x = center.x + (roll() - .5) * (FRONTIER_SIZE - 17);
    const z = center.z + (roll() - .5) * (FRONTIER_SIZE - 17);
    const candidate = {x, z};
    if (game.wonders.cores.some(site => distance(site, candidate) < 18)) continue;
    const site = makeSite(game, id, assault ? 'wild' : kind, x, y, z, roll);
    if (site) return site;
  }
  return null;
}

function chapterOathSite(game) {
  const {stage,worldSeed} = game;
  const key = frontierSeed(worldSeed,stage,0,0,5407);
  const roll = random(key);
  const relic = ((worldSeed + stage)&1) ? 'mirror' : 'tether';
  const side = key&1 ? 1 : -1;
  const x = side * (stage===1 ? 15.5 : stage===2 ? 14.8 : 11.4);
  const y = stage===3 ? 11.8 : .82;
  const z = (stage===1 ? 34 : stage===2 ? 42 : 57) + (roll()-.5)*5;
  for (const [dx,dz] of [[0,0],[-side*4,2],[-side*8,5],[side*3,3],[-side*12,4]]) {
    const site = makeSite(game,`${stage}:oath`,'oath',x+dx,y,z+dz,roll,relic);
    if(site)return site;
  }
  return null;
}

function chapterWildSite(game) {
  const seed=frontierSeed(game.worldSeed,game.stage,0,0,7833);
  const roll=random(seed);
  const other=game.wonders.cores.find(site=>site.kind==='oath');
  const side=other?.x?Math.sign(other.x)*-1:seed&1?1:-1;
  const z=32.5+(roll()-.5)*4;
  for(const x of [side*15.3,side*12.7,side*18.7,-side*14]){
    const site=makeSite(game,'2:wild','wild',x,.18,z,roll);
    if(site)return site;
  }
  return null;
}

function loadSites(game) {
  const wonders = game.wonders;
  const { column, row } = frontierCell(game.p.x, game.p.z);
  const focus = `${column}:${row}`;
  if (wonders.focus === focus && wonders.stage === game.stage) return;
  if (wonders.stage !== game.stage) {
    resetWonders(game);
    wonders.stage = game.stage;
    wonders.cores = openingSites(game);
    if(game.stage>0){
      const shrine=chapterOathSite(game);
      if(shrine)wonders.cores.push(shrine);
    }
    if(game.stage===2){
      const assault=chapterWildSite(game);
      if(assault)wonders.cores.push(assault);
    }
  }
  const cells = new Map();
  const sites = wonders.cores.filter(site => site.phase !== 'spent' && distance(game.p, site) < FRONTIER_SIZE * 1.8);
  for (let z = row - 1; z <= row + 1; z++) {
    for (let x = column - 1; x <= column + 1; x++) {
      const key = `${x}:${z}`;
      const site = wonders.cells.has(key) ? wonders.cells.get(key) : frontierSite(game, x, z);
      cells.set(key, site);
      if (site) sites.push(site);
    }
  }
  if (wonders.active && !sites.includes(wonders.active)) sites.push(wonders.active);
  wonders.sites = sites;
  wonders.cells = cells;
  wonders.focus = focus;
}

function announce(game, site, action, data = {}) {
  game.emit('wonder', { kind: site.kind, action, title: wonderTitle(site), ...point(site), ...data });
}

function claim(game, site, relic) {
  const { wonders, p } = game;
  let title;
  let effect;
  if ((relic === 'sword' || relic === 'pearl') && wonders.relics.sword < 3) {
    wonders.relics.sword++;
    title = wonders.relics.sword === 1 ? names.sword : `${names.sword} · 第${wonders.relics.sword === 2 ? '二' : '三'}重`;
    effect = relic === 'pearl' ? '鲤珠入剑 · 剑气更宽、贯穿更远'
      : wonders.relics.sword === 1 ? '自动挥出剑气 · 破浪横扫前方' : '剑气更宽 · 贯穿更远';
    wonders.swordCD = .24;
  } else if (relic === 'feather' && !wonders.relics.feather) {
    wonders.relics.feather = 1;
    title = '云鹤金羽';
    effect = '破浪蓄势加快 · 立刻恢复龙躯';
    p.dashCD = 0;
    game.gainMass(2.7 * p.density);
  } else if (relic === 'tideStone' && !wonders.relics.tideStone) {
    wonders.relics.tideStone = 1;
    title = '潮纹石';
    effect = '每次破浪回复 10 灵息 · 立刻恢复龙躯';
    p.qi = Math.min(100, p.qi + 20);
    game.gainMass(2.2 * p.density);
  } else if (OATHS[relic] && wonders.relics.oath !== relic) {
    wonders.relics.oath = relic;
    wonders.artifact.charge = null;
    wonders.artifact.dashPath = null;
    title = OATHS[relic].name;
    effect = OATHS[relic].description;
  } else if (pigments[relic] && wonders.pigment?.id !== relic) {
    wonders.pigment = pigments[relic];
    title = wonders.pigment.name;
    effect = wonders.pigment.effect;
  } else {
    game.gold++;
    game.gainMass(1.45 * p.density);
    title = '凝墨龙髓';
    effect = '增长龙躯 · 龙玉 +2';
  }
  wonders.metrics.relics++;
  announce(game, site, 'relic', {title, effect, relic, tier: wonders.relics.sword});
}

function markSpent(game, site) {
  site.phase = 'spent';
  game.wonders.outcomes.set(site.id, true);
  if (game.wonders.active === site) game.wonders.active = null;
  if (game.wonders.waypoint?.id === site.id) game.wonders.waypoint = null;
}

function finish(game, site, success) {
  const { wonders, p } = game;
  if (site.kind==='wild') {
    finishWildAssault(game,site,success);
    if(success){
      wonders.metrics.completed++;
      markSpent(game,site);
      announce(game,site,'complete');
      return;
    }
  }
  if (site.kind==='oath')game.hazards=game.hazards.filter(hazard=>hazard.oathSite!==site.id);
  if (!success) {
    wonders.metrics.failed++;
    site.phase = 'ready';
    site.retryAt = game.time + 8;
    site.progress = 0;
    site.hazards = [];
    site.beacon = null;
    if (site.kind === 'carp') {
      Object.assign(site, site.route.origin);
      site.angle = site.route.heading;
    }
    wonders.outcomes.set(site.id, site.retryAt);
    wonders.active = null;
    announce(game, site, 'failed');
    return;
  }
  wonders.metrics.completed++;
  site.progress = 1;
  if (site.kind === 'whirlpool') {
    game.gainMass(p.density * (1.1 + .2 * game.stage));
    wonders.market = 1;
    announce(game, site, 'complete', {effect: '回潮回馈 · 额外一次选技'});
    markSpent(game, site);
  } else if (site.kind === 'spring') {
    announce(game, site, 'complete', {relic: site.relic});
    claim(game, site, site.relic);
    markSpent(game, site);
  } else {
    // Gifts stay at the site. Passing through the reward is a deliberate
    // decision, especially when a pigment would replace an existing color.
    if (site.kind === 'palm' || site.kind === 'gates' || site.kind === 'oath') {
      if (site.kind !== 'oath') site.relic = site.kind === 'palm' ? 'ochre' : 'indigo';
      const gift = forward(p, p.angle, 4.2);
      const [low,high]=flightBand(game.stage);
      if(game.stage===3){
        const floor=(game.terrainHeight?.(gift.x,gift.z)??-Infinity)+1.1;
        if(floor>high-.35)Object.assign(gift,point(site));
        else gift.y=clamp(Math.max(p.y,floor),low,high-.35);
      }else if(game.onLand(gift.x,gift.z,.45))Object.assign(gift,point(site));
      else gift.y=clamp(p.y,low,high);
      Object.assign(site, gift);
    }
    site.phase = 'reward';
    site.claimAt = game.time + .45;
    site.hazards = [];
    site.beacon = null;
    wonders.active = null;
    if (game.stage === 3) wonders.nextTrialAt = game.time + 2.8;
    wonders.bossReadyAt = game.time + 7;
    wonders.outcomes.set(site.id, site);
    announce(game, site, 'complete', {relic: site.relic});
  }
}

function addHazard(game, site, kind, position, angle, delay, shape, lead) {
  const impactAt = game.time + delay;
  const hazard = {
    id: game.nextId++, kind, ...position, angle, ...shape,
    startsAt: impactAt - lead, impactAt, endsAt: impactAt + .53,
    phase: 'warning', progress: 0,
  };
  site.hazards.push(hazard);
}

function challenge(game, site) {
  const { p } = game;
  const angle = p.angle;
  if (site.kind === 'palm') {
    const shape = {radius: 5.8, height: 6.4, fullAltitude:true};
    addHazard(game, site, 'palm', forward(p, angle, 8.7), angle, 1.55, shape, 1.55);
    site.palmSecondAt = game.time + 1.4;
    site.endsAt = game.time + 3.6;
  } else {
    const [floor,ceiling]=flightBand(3);
    const startHigh=Math.sin(site.angle)>.2;
    site.gatesCleared=0;
    for (let i = 0; i < 3; i++) {
      const openHigh=i%2===0?startHigh:!startHigh;
      const delay=1.44+i*1.47;
      const center=forward(p, angle, 6.05*delay);
      const terrain=game.terrainHeight?.(center.x,center.z)??-Infinity;
      const safeY=openHigh?Math.max(11.5,Math.min(15,terrain+1.8)):Math.max(11.7,Math.min(16.4,terrain+3.2));
      const bottom=openHigh?floor:safeY,top=openHigh?safeY:ceiling;
      center.y=(bottom+top)*.5;
      addHazard(game, site, 'gate', center, angle, delay, {
        radius:10.5,width:21,length:5.2,height:top-bottom,safeY,role:openHigh?'lower':'upper',
      }, i===0?1.44:1.59);
    }
    site.endsAt = site.hazards.at(-1).endsAt;
  }
}

function start(game, site) {
  const { wonders } = game;
  wonders.active = site;
  wonders.metrics.attempts++;
  site.phase = 'active';
  site.startedAt = game.time;
  site.progress = 0;
  site.failedHit = false;
  if (site.kind === 'whirlpool') {
    site.endsAt = game.time + 21 + game.stage * 2.5;
    site.orbit = 0;
    site.previousAngle = null;
    site.away = 0;
    site.pulseAt = game.time + .9;
    site.pulses = 0;
  } else if (site.kind === 'crane') {
    site.endsAt = game.time + 9;
    site.perch = point(site);
    const away = Math.atan2(site.x - game.p.x, site.z - game.p.z);
    site.angle = away;
    site.follow = 0;
  } else if (site.kind === 'carp') {
    site.endsAt = game.time + 16;
    site.routeAt = 0;
    site.collected = 0;
    setCarpBeacon(site);
  } else if (site.kind === 'spring') {
    site.endsAt = game.time + 16;
    site.beacon = {...point(site), y: .69, radius: 1.55};
    site.windowOpen = false;
    site.waveRadius = 2.5;
    site.cycleIndex = 0;
    site.waveHit = false;
  } else if (site.kind==='oath') startOathTrial(game,site);
  else if (site.kind==='wild') beginWildAssault(game,site);
  else challenge(game, site);
  announce(game, site, 'start');
}

function reinforce(game, site) {
  const roster = surgeRosters[game.stage];
  const pulse = site.pulses++;
  const baseAngle = site.angle + pulse * 2.37;
  const count = roster.length;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + i * TAU / count;
    const at = forward(site, angle, site.radius + 3.2);
    const enemy = game.spawnEnemy(roster[i % roster.length], at.x, at.z);
    if (!enemy) continue;
    enemy.speed *= 1.17;
    enemy.wonderHaste = 1.23;
    enemy.shootCD = Math.min(enemy.shootCD, .8 + (i % 4) * .25);
  }
}

function updateWhirlpool(game, site, dt) {
  const { p } = game;
  const range = distance(p, site);
  const close = range <= site.radius + 1 && p.y < 2.25;
  site.away = close ? 0 : site.away + dt;
  const leaveDelay=site.progress<.07?1.15:2.8;
  if (site.away > leaveDelay || game.time >= site.endsAt) return finish(game, site, false);
  const orbiting = close && range >= site.innerRadius && range <= site.radius;
  const angle = Math.atan2(p.x - site.x, p.z - site.z);
  if (orbiting && site.previousAngle !== null) {
    const delta = Math.atan2(Math.sin(angle - site.previousAngle), Math.cos(angle - site.previousAngle));
    site.orbit += clamp(delta, -.34, .34);
    const laps = .85 + game.stage * .11;
    site.progress = clamp(Math.abs(site.orbit) / (TAU * laps), 0, 1);
    if (site.progress >= 1) return finish(game, site, true);
  }
  site.previousAngle = orbiting ? angle : null;
  game.spawnCD -= dt * .43;
  if (close && game.time >= site.pulseAt) {
    site.pulseAt = game.time + (game.stage === 0 ? 3.1 : 2.45);
    reinforce(game, site);
  }
}

function updateCrane(game, site, dt) {
  const { p } = game;
  if (game.time >= site.endsAt) {
    Object.assign(site, site.perch);
    return finish(game, site, false);
  }
  const age = game.time - site.startedAt;
  const path = forward(site.perch, site.angle, Math.min(16, age * 3.55), Math.sin(age * 1.1) * 2);
  path.y += Math.sin(age * 1.5) * .65;
  const ground = game.terrainHeight?.(path.x, path.z) ?? -Infinity;
  path.y = clamp(Math.max(path.y, ground + 1.4), 4, 18.65);
  Object.assign(site, path);
  if (distance3(p, site) <= site.radius) site.follow = Math.min(1, site.follow + dt / 2.4);
  site.progress = site.follow;
  if (site.progress >= 1) finish(game, site, true);
}

const carpMarks = [.24, .57, .90];

function setCarpBeacon(site) {
  const {origin, heading, bend} = site.route;
  site.beacon = {
    ...carpPath(origin, heading, carpMarks[site.collected], bend),
    y: .76, radius: 2.65, index: site.collected + 1, total: carpMarks.length,
  };
}

function updateCarp(game, site, dt) {
  const {p} = game;
  const {origin, heading, bend} = site.route;
  if (game.time >= site.endsAt || distance(p, site) > 23) return finish(game, site, false);
  const next = carpMarks[site.collected];
  const advance = distance(p, site) < 10.5 ? dt * .20 : dt * .045;
  site.routeAt = Math.min(next, site.routeAt + advance);
  const position = carpPath(origin, heading, site.routeAt, bend);
  const ahead = carpPath(origin, heading, site.routeAt + .025, bend);
  site.angle = Math.atan2(ahead.x - position.x, ahead.z - position.z);
  site.x = position.x;
  site.z = position.z;
  site.y = origin.y + Math.sin((game.time - site.startedAt) * 8) * .08;
  if (distance(p, site) > site.radius + .55 || distance3(p, site.beacon) > site.beacon.radius) return;
  site.collected++;
  site.progress = site.collected / carpMarks.length;
  announce(game, site, 'trail', {index: site.collected, total: carpMarks.length});
  if (site.collected === carpMarks.length) {
    Object.assign(site, point(site.beacon), {y: .78});
    finish(game, site, true);
  } else setCarpBeacon(site);
}

function updateSpring(game, site) {
  const {p} = game;
  const elapsed = game.time - site.startedAt;
  const range = distance(p, site);
  if (game.time >= site.endsAt || range > site.radius + 10.5) return finish(game, site, false);
  const cycle = Math.floor(elapsed / springCycle);
  if (cycle !== site.cycleIndex) {
    site.cycleIndex = cycle;
    site.waveHit = false;
  }
  const age = elapsed - cycle * springCycle;
  site.windowOpen = age >= springReady && age < springClose;
  const travel = clamp((age - springWindup) / (springReady - springWindup), 0, 1);
  site.waveRadius = 2.5 + travel * 6.5;
  site.progress = site.windowOpen ? 1 - (age - springReady) / (springClose - springReady)
    : age < springReady ? age / springReady : 0;
  if (site.windowOpen && p.dash > 0 && distance3(p, site.beacon) <= site.beacon.radius+.65) {
    finish(game, site, true);
    return;
  }
  if (!site.waveHit && age >= springWindup && age < springReady &&
      Math.abs(range - site.waveRadius) < .69 && Math.abs(p.y - site.y) < 1.65) {
    site.waveHit = true;
    if (p.invul <= 0) {
      announce(game, site, 'impact', {hit: true, radius: site.waveRadius});
      game.hurt(13 + game.stage * 7, p);
    }
  }
}

function contains(hazard, p) {
  if (!hazard.fullAltitude && Math.abs(p.y - hazard.y) > hazard.height * .5) return false;
  if (hazard.kind === 'palm') return distance(hazard, p) < hazard.radius;
  const x = p.x - hazard.x;
  const z = p.z - hazard.z;
  const sin = Math.sin(hazard.angle);
  const cos = Math.cos(hazard.angle);
  return Math.abs(x * cos - z * sin) < hazard.width * .5 && Math.abs(x * sin + z * cos) < hazard.length * .5;
}

function inGateOpening(hazard, p) {
  const x=p.x-hazard.x,z=p.z-hazard.z;
  const sin=Math.sin(hazard.angle),cos=Math.cos(hazard.angle);
  const clear=hazard.role==='lower'?p.y>hazard.safeY:p.y<hazard.safeY;
  return clear && Math.abs(x*cos-z*sin)<hazard.width*.46 && Math.abs(x*sin+z*cos)<7.4;
}

function updateMountainChallenge(game, site) {
  const { time, p, wonders } = game;
  if (distance(p, site) > worldReach || game.boss) return finish(game, site, false);
  if(site.palmSecondAt&&time>=site.palmSecondAt){
    site.palmSecondAt=null;
    const angle=p.angle;
    addHazard(game,site,'palm',forward(p,angle,6.3),angle,1.62,
      {radius:5.6,height:6.4,fullAltitude:true},1.62);
    site.endsAt=site.hazards.at(-1).endsAt;
  }
  for (const hazard of site.hazards) {
    if (time < hazard.startsAt) continue;
    if (hazard.phase === 'warning' && time >= hazard.impactAt) {
      hazard.phase = 'impact';
      const hit = contains(hazard, p) && p.invul <= 0;
      if(hazard.kind==='gate'&&inGateOpening(hazard,p))site.gatesCleared++;
      announce(game, site, 'impact', {...point(hazard), hit, radius: hazard.radius, hazard: hazard.kind});
      if (hit) {
        site.failedHit = true;
        game.hurt(hazard.kind === 'palm' ? 108 : 73, p);
        if (hazard.kind === 'gate') {
          p.qi = Math.max(0, p.qi - 25);
          wonders.sealedUntil = time + 2.6;
        }
      }
    }
    if (time >= hazard.endsAt) hazard.phase = 'spent';
    hazard.progress = clamp((time - hazard.startsAt) / (hazard.impactAt - hazard.startsAt), 0, 1);
  }
  site.progress = clamp((time - site.startedAt) / (site.endsAt - site.startedAt), 0, 1);
  if (time >= site.endsAt && game.status === 'playing') {
    finish(game, site, !site.failedHit&&(site.kind!=='gates'||site.gatesCleared>=2));
  }
}

function pigmentHint(wonders, relic) {
  const pigment = pigments[relic];
  if (!pigment) return '靠近察看这方山海墨髓';
  return wonders.pigment?.id && wonders.pigment.id !== relic
    ? `靠近换成${pigment.name} · ${pigment.effect}`
    : `靠近染入${pigment.name} · ${pigment.effect}`;
}

function readyHint(wonders, site) {
  switch (site.kind) {
    case 'sword': return '游近取剑，破浪可挥出横扫剑气';
    case 'pigment': return pigmentHint(wonders, site.relic);
    case 'whirlpool': return '贴水入浪，按住一侧顺流盘旋 · 守住可额外选技';
    case 'crane': return '飞近跟随仙鹤，接它衔来的金羽';
    case 'carp': return '跟随白鲤，穿过三处珠光 · 鲤珠可以养剑';
    case 'spring': return '浪退时破浪夺珠 · 潮纹石让冲刺回复灵息';
    case 'oath': return `${site.landmark?`${site.landmark} · `:''}${site.relic==='mirror'
      ? '用破浪迎击试炼来弹 · 得玄镜，收弹再返射'
      : '用破浪穿过三枚潮印 · 得玉珏，冲刺可卷走沿途群敌'}`;
    case 'wild': return '贴水靠近后可主动开启 · 四阵海兽来袭，战成可择一法宝';
    case 'palm': return '飞近引掌，从侧面飞出掌印可得朱砂墨';
    case 'gates': return '贴着白线穿过两处朱阙缺口，可得青黛墨';
  }
}

function activeHint(game, site) {
  switch (site.kind) {
    case 'whirlpool': {
      if (game.p.y >= 2.25) return '下降贴近水面，继续沿白浪盘旋';
      if (distance(game.p, site) > site.radius) return '回到白浪圈内，海兽正在逼近';
      if (distance(game.p, site) < site.innerRadius) return '离开涡心，沿外圈白浪盘旋';
      return '按住一侧顺流盘旋，海兽正在逼近';
    }
    case 'crane': return '跟紧仙鹤，保持在它身边';
    case 'carp': return `穿过下一处珠光 ${site.collected}/${carpMarks.length}`;
    case 'spring': return site.windowOpen ? '潮门已开！对准中心珠光，按破浪' : '潮浪正在推出，等珠光亮起再破浪';
    case 'oath': return site.relic==='mirror' ? (site.emitter?'对准来弹，近身时按破浪收弹':'前方将出现试炼来弹，留着破浪')
      : `对准潮印连线，按破浪贯穿 ${site.beacons.filter(b=>b.cleared).length}/${site.beacons.length}`;
    case 'wild': return wildAssaultHint(game,site);
    case 'palm': return site.failedHit ? '已被金印击中，避过余掌后可重试' : '掌印贯穿云层，横向转出金圈';
    case 'gates': {
      if(game.time<game.wonders.sealedUntil)return '朱阙封住破浪和剑气';
      const gate=site.hazards.find(hazard=>hazard.phase==='warning');
      if(!gate)return `已穿过 ${site.gatesCleared} 处缺口`;
      const rise=gate.role==='lower';
      const aligned=rise?game.p.y>gate.safeY+.38:game.p.y<gate.safeY-.38;
      const instruction=aligned?'沿白线直飞':rise?'抬升越过朱阙':'下潜穿过朱阙';
      return `${instruction} · 已过 ${site.gatesCleared} / 2`;
    }
  }
}

export function wonderTitle(site) {
  return site.title ?? (site.kind==='oath'?OATHS[site.relic]?.name:names[site.kind]);
}

export function wonderHint(game, site) {
  if (site.phase === 'active') return activeHint(game, site);
  if (site.phase === 'reward') {
    if (site.kind==='oath'){
      const current=game.wonders.relics.oath;
      const replacement=current&&current!==site.relic?` · 将替换${OATHS[current].name}`:'';
      return `靠近取宝${replacement} · ${OATHS[site.relic].description}`;
    }
    if (site.relic === 'pearl') return '游近收下鲤珠，淬炼分水古剑';
    return site.relic === 'feather' ? '飞近仙鹤，接取云鹤金羽' : pigmentHint(game.wonders, site.relic);
  }
  if (game.time < site.retryAt) return `气息将复 · ${Math.ceil(site.retryAt - game.time)} 秒后再试`;
  return site.hint ?? readyHint(game.wonders, site);
}

export function startWildChallenge(game) {
  const {wonders}=game;
  const site=wonders.sites.find(candidate=>candidate.id===wonders.guide?.id&&wildAvailable(game,candidate));
  if(!site)return false;
  start(game,site);
  return true;
}

export function updateWonders(game, dt) {
  const { wonders, p } = game;
  if (!game.exploring || game.drill) return;
  if (wonders.stage !== game.stage && game.chapterArrivals) {
    const installed = game.stage === 3 ? game.terrainHeight : game.shoreStage === game.stage;
    if (!installed) return;
  }
  loadSites(game);
  const active = wonders.active;
  if (active?.kind === 'whirlpool') updateWhirlpool(game, active, dt);
  else if (active?.kind === 'crane') updateCrane(game, active, dt);
  else if (active?.kind === 'carp') updateCarp(game, active, dt);
  else if (active?.kind === 'spring') updateSpring(game, active);
  else if (active?.kind === 'oath') {
    const result=oathTrialResult(game,active);
    if(result)finish(game,active,result==='complete');
  }
  else if (active?.kind === 'wild') {
    const result=updateWildAssault(game,active,dt);
    if(result)finish(game,active,result==='complete');
  }
  else if (active) updateMountainChallenge(game, active);
  if (game.status !== 'playing') return;

  let nearest = null;
  let nearestScore = Infinity;
  const readyWild = game.stage===2 ? wonders.sites.find(site=>wildAvailable(game,site)) : null;
  for (const site of wonders.sites) {
    if (site.phase === 'spent') continue;
    const d = distance(p, site);
    const heightDelta = site.y - p.y;
    if (d < 16 && Math.abs(heightDelta) < 7 && !wonders.known.has(site.id)) {
      wonders.known.add(site.id);
      wonders.metrics.discovered++;
    }
    if (site.phase === 'reward' && game.time >= site.claimAt && distance3(p, site) <= site.claimRadius + .65) {
      claim(game, site, site.relic);
      markSpent(game, site);
      continue;
    }
    if (site.phase !== 'ready' || game.time < site.retryAt) continue;
    if (site.kind==='wild') continue;
    if (site.kind === 'sword' || site.kind === 'pigment') {
      if (distance3(p, site) <= site.claimRadius) {
        claim(game, site, site.relic);
        markSpent(game, site);
      }
      continue;
    }
    if (wonders.active || game.boss || game.activeCascade || game.activeDragonArt || wonders.market || site === active ||
      game.stage===3&&game.time<wonders.nextTrialAt || readyWild) continue;
    const entryHeight = site.kind === 'whirlpool' || site.kind === 'carp' || site.kind === 'spring' || site.kind === 'oath'&&game.stage<3 ? 2.0
      : site.kind === 'crane' ? 3.8 : 4.5;
    if (d < site.radius && Math.abs(heightDelta) < entryHeight) start(game, site);
  }
  for (const site of wonders.sites) {
    if (site.phase === 'spent') continue;
    const score = distance(p, site) + Math.abs(site.y - p.y) * .9 - (site.phase === 'reward' ? 8 : wildAvailable(game,site)?9:0)
      + (site.retryAt>game.time?16:0);
    if (score < nearestScore) {
      nearestScore = score;
      nearest = site;
    }
  }
  const waypoint = wonders.waypoint;
  const tracked = waypoint?.stage === game.stage && (
    wonders.sites.find(site => site.id === waypoint.id && site.phase !== 'spent') ?? {...waypoint, phase: 'ready'}
  );
  const guide = wonders.active ?? (readyWild || tracked || (nearestScore <= 48 ? nearest : null));
  let marker=guide;
  let passage=null;
  if(guide?.phase==='active'){
    if(guide.kind==='carp')marker=guide.beacon??guide;
    else if(guide.kind==='oath'&&guide.relic==='tether')marker=guide.beacons.find(b=>!b.cleared)??guide;
  }else if(guide?.phase==='ready'&&guide.passageLandmark){
    passage=frontierPassage(guide.passageLandmark,p,guide.passageDirection);
    if(passage){
      guide.passageDirection=passage.progress<guide.passageLandmark.length+12?passage.direction:undefined;
      marker=passage.inside?guide:passage.target;
    }
  }
  const alternative=guide&&game.stage===0&&game.time<25&&guide.phase!=='reward'
    ?wonders.cores.find(site=>site.kind!==guide.kind&&site.kind!=='sword'&&site.phase==='ready'&&site.retryAt<=game.time&&
      distance(p,site)<36):null;
  wonders.guide = guide ? {
    id: guide.id, kind: guide.kind, stage: game.stage, relic: guide.relic, title: wonderTitle(guide), ...point(marker),
    distance: distance(p, marker), heightDelta: marker.y - p.y, phase: guide.phase, progress: guide.progress,
    remaining: guide.phase === 'active' ? Math.max(0, guide.endsAt - game.time) : null,
    hint: wonderHint(game, guide),
    canStart:wildAvailable(game,guide),
    alternate:alternative?{...point(alternative),title:wonderTitle(alternative),kind:alternative.kind}:null,
    passage:passage?{name:guide.landmark,stage:passage.stage,inside:passage.inside,
      minHeight:passage.limits.minHeight,maxHeight:passage.limits.maxHeight}:null,
  } : null;
}

export function rideWhirlpool(game, turn, radius, dt) {
  const { p, wonders } = game;
  const site = wonders.active;
  if (site?.kind !== 'whirlpool' || Math.abs(turn) < .36 || p.dash > 0 || p.y >= 2.25 || distance(p, site) > site.radius + 1) return;
  // The current draws the center of a sustained steering arc toward the
  // water eye. Releasing steering or dashing immediately leaves the current.
  const bend = Math.sign(turn) * Math.min(4.6, radius / Math.abs(turn));
  const x = site.x - p.x - Math.cos(p.angle) * bend;
  const z = site.z - p.z + Math.sin(p.angle) * bend;
  const reach = Math.hypot(x, z);
  const pace = Math.min(2.65 / Math.max(.01, reach), 1.2) * dt;
  p.x += x * pace;
  p.z += z * pace;
}

export function offerWonderGrowth(game) {
  const { wonders } = game;
  if (!wonders.market || game.boss || game.stage >= 4 || game.activeCascade) return false;
  wonders.market--;
  game.choices = marketChoices(game.cultivation, game.stage);
  if (!game.choices.length) {
    game.gainMass(4.5 * game.p.density);
    game.gold++;
    return false;
  }
  game.status = 'upgrade';
  wonders.normalRewardAt = game.time + 2.4;
  game.emit('upgrade', {source: 'whirlpool'});
  return true;
}

export function launchWonderSword(game, target = null, dash = false) {
  const { p, wonders } = game;
  const tier = wonders.relics.sword;
  if (!tier || game.time < wonders.sealedUntil) return;
  const angle = target ? Math.atan2(target.x - p.x, target.z - p.z) : p.angle;
  const speed = dash ? 27 : 20;
  const from = forward(p, angle, .83);
  const life = (dash ? .61 : .55) + (tier - 1) * .09;
  const rise = target ? clamp((target.y - p.y) * speed / Math.max(1, distance(p, target)), -8, 8) : 0;
  const slash = {
    id: game.nextId++, relic: 'sword', ...from, angle,
    vx: Math.sin(angle) * speed, vy: rise, vz: Math.cos(angle) * speed,
    width: (dash ? 5.8 : 3.4) + (tier - 1) * .78, height: 1.9 + (tier - 1) * .29,
    life, maxLife: life, progress: 0, tier, dash, side: wonders.slashSide,
    element: wonders.pigment?.id, damage: game.stats().damage * (dash ? 1.36 : 1.09) * (1 + (tier - 1) * .26),
    hits: new Set(),
  };
  wonders.slashSide *= -1;
  wonders.slashes.push(slash);
  game.emit('wonderSword', {...from, angle, tier, dash, side: slash.side, width: slash.width, element: slash.element});
}

export function updateWonderCombat(game, dt) {
  const { wonders } = game;
  if (!wonders.relics.sword) return;
  wonders.swordCD -= dt;
  if (wonders.swordCD <= 0) {
    wonders.swordCD = .12;
    const target = game.nearest(10.9 + wonders.relics.sword * 1.8);
    if (target && game.time >= wonders.sealedUntil) {
      launchWonderSword(game, target);
      wonders.swordCD = 2.15 - wonders.relics.sword * .14;
    }
  }
  const stage = game.stage;
  for (const slash of wonders.slashes) {
    const step = Math.min(slash.life, dt);
    slash.life -= step;
    slash.x += slash.vx * step;
    slash.y += slash.vy * step;
    slash.z += slash.vz * step;
    slash.progress = 1 - slash.life / slash.maxLife;
    const sin = Math.sin(slash.angle);
    const cos = Math.cos(slash.angle);
    const depth = Math.hypot(slash.vx, slash.vz) * step;
    const range = Math.hypot(slash.width * .5 + 1.45, depth + 1.45);
    const enemies = game.enemiesNear(slash, range, wonders.swordTargets);
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || slash.hits.has(enemy.id)) continue;
      if (Math.abs(enemy.y - slash.y) > slash.height * .5 + Math.min(.65, enemy.radius)) continue;
      const x = enemy.x - slash.x;
      const z = enemy.z - slash.z;
      const longitudinal = x * sin + z * cos;
      const radius = Math.min(1.45, enemy.radius);
      if (longitudinal < -depth - radius || longitudinal > radius ||
          Math.abs(x * cos - z * sin) > slash.width * .5 + radius) continue;
      slash.hits.add(enemy.id);
      if (slash.element === 'ochre') enemy.burn = Math.max(enemy.burn, 3);
      if (slash.element === 'indigo') enemy.wet = Math.max(enemy.wet, 5);
      const damage = slash.hits.size > 12 && !enemy.boss ? slash.damage * .69 : slash.damage;
      game.damage(enemy, damage, 'sword', slash);
      if (game.stage !== stage || game.status !== 'playing') return;
    }
  }
  wonders.slashes = wonders.slashes.filter(slash => slash.life > 0);
}
