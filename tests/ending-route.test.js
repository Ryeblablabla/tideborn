import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/simulation.js';
import { ENDING_ROUTE_SITES, hasHiddenEnding } from '../src/ending-route.js';

function gameAtChapter(stage, position) {
  const game = new Game({ seed: 11, interactiveFinale: true });
  game.stage = stage;
  game.p.mass = stage === 2 ? 54.4 : 110;
  game.syncBody();
  Object.assign(game.p, position, { altitude: position.y, manualHeightUntil: Infinity });
  game.essence = 0;
  game.cultivation.wave = 2;
  game.spawnCD = game.hordeCD = 60;
  return game;
}

function steerToward(game, target, strength = 1) {
  const dx = target.x - game.p.x;
  const dz = target.z - game.p.z;
  const distance = Math.hypot(dx, dz);
  game.step(1 / 60, { x: dx / Math.max(.01, distance) * strength,
    z: dz / Math.max(.01, distance) * strength, autoHeight: false });
}

test('a real swim orbit and a dash toward the sluice open it without a combat upgrade', () => {
  const { sea } = ENDING_ROUTE_SITES;
  const game = gameAtChapter(2, { x: sea.coil.x, y: 1, z: sea.coil.z - 4 });
  for (let i = 0; i < 360 && !game.endingRoute.seaReady; i++) {
    const angle = Math.atan2(game.p.z - sea.coil.z, game.p.x - sea.coil.x) + .42;
    steerToward(game, { x: sea.coil.x + 4 * Math.cos(angle), z: sea.coil.z + 4 * Math.sin(angle) }, .75);
  }
  assert.equal(game.endingRoute.seaReady, true);
  assert.equal(game.endingRoute.gateAt, null);

  for (let i = 0; i < 120 && game.endingRoute.gateAt === null; i++) {
    const range = Math.hypot(sea.x - game.p.x, sea.z - game.p.z);
    const desired = Math.atan2(sea.x - game.p.x, sea.z - game.p.z);
    const angle = Math.atan2(Math.sin(game.p.angle - desired), Math.cos(game.p.angle - desired));
    if (range < 7 && Math.abs(angle) < .6) game.dash();
    steerToward(game, sea);
  }
  assert.notEqual(game.endingRoute.gateAt, null);
  assert.equal(hasHiddenEnding(game), false);
  assert.deepEqual(game.events.filter(event => event.type === 'endingRoute').map(event => event.kind), ['sea-coil', 'gate-open']);
});

test('an unlocked mountain chain relays a locked strike only after the player exits the marked volume', () => {
  const { mountain } = ENDING_ROUTE_SITES;
  const game = gameAtChapter(3, mountain);
  const wait = seconds => {
    for (let i = 0; i < seconds * 60; i++) game.step(1 / 60, { x: 0, z: 0 });
  };
  wait(1);
  assert.equal(game.endingRoute.mountainStrike, null);
  game.endingRoute.gateAt = game.time;
  wait(2);
  assert.equal(hasHiddenEnding(game), false);
  assert.ok(game.events.some(event => event.type === 'hazardImpact' && event.hit));
  assert.ok(!game.events.some(event => event.kind === 'relay-escape'));

  const crossing = gameAtChapter(3, { ...mountain, z: mountain.z - 5 });
  crossing.endingRoute.gateAt = crossing.time;
  for (let i = 0; i < 160 && !hasHiddenEnding(crossing); i++) {
    crossing.step(1 / 60, { x: 0, z: 1, turn: 0, lift: 0, autoHeight: false });
  }
  assert.equal(hasHiddenEnding(crossing), true);
  const [lock, escape, strike] = crossing.events.filter(event => event.type === 'endingRoute');
  assert.deepEqual([lock.kind, escape.kind, strike.kind], ['relay-lock', 'relay-escape', 'relay-strike']);
  assert.equal(lock.relay, true);
  assert.ok(Math.hypot(escape.from.x - lock.x, escape.from.y - lock.y, escape.from.z - lock.z) >= lock.radius);
});
