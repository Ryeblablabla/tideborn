import { clamp, dist } from './rules.js';

export const ENDING_ROUTE_SITES = Object.freeze({
  marsh: { x: 9, y: .12, z: -3, tip: { x: 5.36, y: .03, z: -1.83 } },
  lake: { x: -10, y: .12, z: 18, coil: { x: -7, z: 16 } },
  sea: { x: 9, y: 1, z: 16, coil: { x: 7, z: 10 } },
  mountain: { x: 15.2, y: 8.6, z: 43 },
});
export const LAKE_WAVE_HIT = .93;

const LOCK_TIME = .86;
const ESCAPE_TIME = 1.08;
const CONDUCTOR_ESCAPE_TIME = 1.40;
const STRIKE_RADIUS = 3;

export function createEndingRoute() {
  return {
    marshSeenAt: null,
    lakeRattleAt: null,
    seaCoil: 0,
    seaReady: false,
    gateAt: null,
    relayAt: null,
    mountainStrike: null,
    nextMountainStrikeAt: 0,
    mountainCharge: 0,
    hint: '',
  };
}

export function hasHiddenEnding(game) {
  return game.endingRoute?.gateAt != null && game.endingRoute.relayAt != null;
}

const distanceToStrike = (point, strike) => Math.hypot(point.x - strike.x, point.y - strike.y, point.z - strike.z);

export function seaGateApproach(player) {
  const gate = ENDING_ROUTE_SITES.sea;
  const dx = gate.x - player.x, dz = gate.z - player.z;
  const distance = Math.hypot(dx, dz);
  const forwardX = Math.sin(player.angle), forwardZ = Math.cos(player.angle);
  const ahead = dx * forwardX + dz * forwardZ;
  const miss = Math.abs(dx * forwardZ - dz * forwardX);
  const aligned = distance <= .7 || (ahead > 0 && miss <= 2.15);
  return { distance, aligned, inReach: aligned && distance <= 6.6 };
}

function emitRoute(game, kind, point, detail = {}) {
  const { x, y, z } = point;
  game.emit('endingRoute', { kind, x, y, z, ...detail });
}

function updateMarsh(game, route) {
  const site = ENDING_ROUTE_SITES.marsh;
  if (!game.eaten || dist(game.p, site.tip) > 6.5) return;
  if (route.marshSeenAt === null) {
    route.marshSeenAt = game.time;
    emitRoute(game, 'chain-seen', site.tip);
  }
  const age = game.time - route.marshSeenAt;
  if (age > .30 && age < 4.5) route.hint = '鱼群到了苇根下的锈链前，纷纷掉头。';
}

function coilsAt(game, point, radius, strength) {
  const pose = game.pose;
  return pose.moving && pose.wind >= strength && dist(pose.center, point) <= radius;
}

function updateLake(game, route) {
  const site = ENDING_ROUTE_SITES.lake;
  if (dist(game.p, site) > 13) return;
  if (route.lakeRattleAt === null && coilsAt(game, site.coil, 5.4, .60)) {
    route.lakeRattleAt = game.time;
    emitRoute(game, 'chain-rattle', site);
  }
  if (route.lakeRattleAt === null) route.hint = '旧闸横着一条锈链。顺着回水盘旋，试着把水拢到一处。';
  else if (game.time - route.lakeRattleAt < 5) route.hint = '聚起的水涡撞上闸脚，水下的锈链响了。';
}

function updateSea(game, route, dt) {
  const site = ENDING_ROUTE_SITES.sea;
  const player = game.p;
  const { distance: nearGate, aligned, inReach } = seaGateApproach(player);
  if (route.gateAt !== null) {
    const age=game.time-route.gateAt;
    if (nearGate <= 15 && age < 7) route.hint = '海闸开了。长链绷直，没入远处云山。';
    return;
  }
  if (nearGate > 19) {
    if (!route.seaReady) route.seaCoil = 0;
    return;
  }

  const nearCoil = dist(player, site.coil);
  if (!route.seaReady) {
    const gathering = nearCoil <= 8.5 && player.y < 2.2 && coilsAt(game, site.coil, 5, .60);
    route.seaCoil = clamp(route.seaCoil + dt * (gathering ? 2.5 : -1.5), 0, 1);
    if (route.seaCoil >= 1) {
      route.seaReady = true;
      emitRoute(game, 'sea-coil', { ...site.coil, y: site.y });
    }
  }
  if (!route.seaReady) {
    route.hint = nearCoil <= 8.5 ? '在回涌的白浪里贴水盘旋，拢住潮头。' : '海面有一线逆行的白浪，尽头隐约露出石闸。';
    return;
  }

  route.hint = player.y >= 2.3 ? '降到水面，再对准闸口。'
    : !aligned ? '转向闸口，让龙首指向两根石墩之间。'
    : !inReach ? '贴水向前，沿潮线接近闸口。'
    : player.dashCD > .03 && player.dash <= 0 ? '保持朝向，等破浪恢复。'
    : '闸口已对准，按破浪。';
  if (player.dash <= 0 || player.y >= 2.3 || !inReach) return;

  route.gateAt = game.time;
  route.seaReady = false;
  route.hint = '';
  emitRoute(game, 'gate-open', site, { from: { x: player.x, y: player.y, z: player.z, angle: player.angle } });
}

function beginMountainStrike(game, route) {
  const { x, y, z } = game.p;
  const impactAt = game.time + LOCK_TIME + ESCAPE_TIME;
  const strike = {
    x, y, z, radius: STRIKE_RADIUS, id: game.nextId++, attack: 'starfall',
    warning: true, previewOnly: true, life: LOCK_TIME + ESCAPE_TIME,
    maxLife: LOCK_TIME + ESCAPE_TIME, resolveAt: impactAt, impactAt,
    startedAt: game.time, lockAt: game.time + LOCK_TIME, lockedAt: null, relay: false,
  };
  route.mountainStrike = strike;
  game.hazards.push(strike);
}

function updateMountainStrike(game, route, site) {
  const strike = route.mountainStrike;
  const player = game.p;
  if (strike.lockedAt === null) {
    const { x, y, z } = player;
    Object.assign(strike, { x, y, z });
    route.mountainCharge = clamp((game.time - strike.startedAt) / LOCK_TIME, 0, 1);
    route.hint = '对准链桩顶端飞过，让雷圈锁在铁环上。';
    const contact = distanceToStrike(site, strike) < STRIKE_RADIUS - .26;
    // Once the marked volume overlaps the iron, the strike latches there.
    // A flying player can aim through it at speed and still see where it lands.
    if (!contact && game.time < strike.lockAt) return;

    strike.lockedAt = game.time;
    strike.relay = contact;
    if (contact) {
      Object.assign(strike, site);
      strike.impactAt = strike.resolveAt = game.time + CONDUCTOR_ESCAPE_TIME;
      strike.life = CONDUCTOR_ESCAPE_TIME;
      strike.maxLife = CONDUCTOR_ESCAPE_TIME;
    }
    emitRoute(game, 'relay-lock', strike, { duration: Math.max(0, strike.impactAt - game.time),
      relay: contact, radius: strike.radius, from: { x: player.x, y: player.y, z: player.z, angle: player.angle } });
  }

  const outside = distanceToStrike(player, strike) >= strike.radius;
  if (strike.relay && outside && strike.escapedAt == null) {
    strike.escapedAt = game.time;
    emitRoute(game, 'relay-escape', strike, { radius: strike.radius,
      from: { x: player.x, y: player.y, z: player.z, angle: player.angle } });
  }
  route.hint = strike.relay ? outside ? '已飞出雷圈，保持航向。' : '落点锁定，立刻飞出雷圈。'
    : '雷圈偏离了链桩。躲开后还可以再引一次。';
  if (game.time < strike.impactAt) return;

  const inside = !outside;
  const hit = inside && player.invul <= 0;
  const { x, y, z } = strike;
  const conducted = strike.relay && !inside;
  game.emit('hazardImpact', { id: strike.id, x, y, z, radius: strike.radius, attack: strike.attack, relay: strike.relay, conducted,
    stage: game.stage, surface: false, inside, hit });
  if (hit) game.hurt(42, player);

  route.mountainStrike = null;
  route.mountainCharge = 0;
  route.nextMountainStrikeAt = game.time + 1.35;
  if (conducted) {
    route.relayAt = game.time;
    route.hint = '雷沿长链冲上天际。云后传来一声断响。';
    emitRoute(game, 'relay-strike', site, { radius: strike.radius,
      from: { x: player.x, y: player.y, z: player.z, angle: player.angle } });
    return true;
  }
}

function updateMountain(game, route) {
  const site = ENDING_ROUTE_SITES.mountain;
  if (route.relayAt !== null) {
    if (game.time - route.relayAt < 8) route.hint = '雷沿长链冲上天际。云后传来一声断响。';
    return;
  }
  if (route.gateAt === null) return;
  if (route.mountainStrike) {
    return updateMountainStrike(game, route, site);
  }
  const near = dist(game.p, site);
  if (near > 22) return;
  route.hint = near <= 13
    ? '飞到朱印上方的铁环旁，把雷圈引过去。'
    : '海里的长链通到江谷。循着山腰的朱印找链桩。';
  if (near <= 5.8 && Math.abs(game.p.y - site.y) <= 3.6 && game.time >= route.nextMountainStrikeAt) {
    beginMountainStrike(game, route);
  }
}

export function updateEndingRoute(game, dt) {
  const route = game.endingRoute;
  route.hint = '';
  if (game.practice || game.status !== 'playing') return;
  if (game.stage === 0) updateMarsh(game, route);
  if (game.stage === 1) updateLake(game, route);
  if (game.stage === 2) updateSea(game, route, dt);
  if (game.stage === 3) return updateMountain(game, route);
}
