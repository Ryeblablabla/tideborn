import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/model.js';
import { finaleToLocal, LOCK_GATE_DURATION, LOCK_LAKE_DURATION } from '../src/heaven-finale.js';

const FPS = 60;

function playUntil(game, predicate, input = () => ({}), seconds = 15) {
  for (let i = 0; i < seconds * FPS && !predicate(); i++) game.step(1 / FPS, input());
  assert.ok(predicate(), `Timed out during ${game.finale?.phase ?? game.status}`);
}

function reachHeaven(hidden) {
  const game = new Game({ seed: 19 });
  if (hidden) Object.assign(game.endingRoute, { gateAt: 11, relayAt: 22 });
  for (let stage = 0; stage < 4; stage++) {
    game.summonBoss();
    game.damage(game.boss, 100_000);
  }
  playUntil(game, () => game.finale?.phase === 'trial');
  return game;
}

test('readable lock-on permits escape, while two hits lock the dragon and preserve its route on retry', () => {
  const game = reachHeaven(true);
  const entryMass = game.finale.entryMass;
  const hits = () => game.events.filter(event => event.type === 'finaleStrike').map(event => event.hit);

  playUntil(game, () => game.finale.warning?.locked && game.finale.trialStep === 1, () =>
    game.finale.trialStep === 0 && game.p.y < 28 ? { lift: 1 } : {});
  assert.deepEqual(hits(), [true]);
  assert.ok(game.p.mass < entryMass);

  playUntil(game, () => game.finale.phase === 'lock');
  const began = game.time;
  playUntil(game, () => game.finale.phase === 'epilogue', undefined, 22);
  assert.equal(game.finale.ending, 'locked');
  assert.equal(game.status, 'ascending');
  playUntil(game, () => game.status === 'dead', undefined, 30);
  assert.ok(Math.abs(game.time - began - LOCK_GATE_DURATION - LOCK_LAKE_DURATION) < .05,
    'time from the second strike through the lake coda to the result');
  assert.deepEqual(hits(), [true, true]);
  assert.equal(game.finale.end, 'locked');
  const locks = game.events.filter(event => event.type === 'finaleCuff' || event.type === 'finaleLatch');
  assert.deepEqual(locks.map(event => event.joint ?? event.type), ['ankle', 'wing', 'finaleLatch']);
  assert.ok(locks[1].age - locks[0].age > .5);
  assert.ok(locks[1].elapsed - locks[0].elapsed > 4, 'give the ankle capture time to read before the wing is caught');
  assert.equal(game.retryGate(), true);
  assert.equal(game.status, 'ascending');
  assert.equal(game.p.mass, entryMass);
  assert.equal(game.endingRoute.relayAt, 22);
  assert.equal(game.finale.secret, true);

  playUntil(game, () => game.finale.warning?.locked && game.finale.trialStep === 1);
  playUntil(game, () => game.finale.phase === 'choice', () => ({ turn: -1 }));
  assert.deepEqual(hits(), [true, true, false, false]);
  assert.ok(finaleToLocal(game.ascentOrigin, game.p).x > 4, 'left input moves toward the screen-left side');
});

test('forward flight continues through the open gate once the dragon is aligned', () => {
  const game = reachHeaven(false);
  playUntil(game, () => game.finale.phase === 'choice');
  const pose = () => finaleToLocal(game.ascentOrigin, game.p);
  const start = pose();
  playUntil(game, () => pose().x < -8, () => ({ turn: 1 }));
  for (let i = 0; i < 6 * FPS; i++) game.step(1 / FPS);
  assert.ok(pose().z > start.z + 3, 'the dragon advances without a forward key');
  assert.equal(game.finale.phase, 'choice', 'an off-center approach waits in front of the gate');
  playUntil(game, () => Math.abs(pose().x) < 2, () => ({ turn: -1 }));
  playUntil(game, () => game.finale.phase === 'audience');
  assert.equal(game.finale.ending, 'ordained');
  const began = game.time;
  playUntil(game, () => game.finale.phase === 'epilogue');
  assert.deepEqual(game.events.filter(event => ['finaleInscription', 'finaleSeal', 'finaleRain'].includes(event.type))
    .map(event => event.type), ['finaleInscription', 'finaleSeal', 'finaleRain']);
  playUntil(game, () => game.status === 'won');
  assert.ok(Math.abs(game.time - began - 26.2) < .07, 'time from entering the audience to the result');
});

test('the cracked gate can be stomped only with a descent and dash inside the flight window', () => {
  const game = reachHeaven(true);
  playUntil(game, () => game.finale.phase === 'choice');

  game.dash({ lift: -1 });
  assert.equal(game.finale.phase, 'choice', 'a descent at the gate approach does not start a cinematic');
  for (let i = 0; i < 360; i++) game.step(1 / FPS, { lift: 1 });
  assert.ok(game.p.y < 35.1, 'wings alone do not reach the roof above the gate');

  const steerTo = target => () => {
    const here = finaleToLocal(game.ascentOrigin, game.p);
    const axis = (wanted, actual) => Math.max(-1, Math.min(1, (wanted - actual) * .5));
    return { turn: -axis(target.x, here.x), lift: axis(target.y, here.y) };
  };

  playUntil(game, () => game.p.y > 37, steerTo({ x: 12.3, y: 37.5 }));
  playUntil(game, () => game.finale.stompReady, steerTo({ x: 1, y: 38 }));
  for (let i = 0; i < 36; i++) game.step(1 / FPS);
  assert.equal(game.dash(), true);
  assert.equal(game.finale.phase, 'choice', 'a dash without descent cannot commit the stomp');
  for (let i = 0; i < 16; i++) game.step(1 / FPS);

  game.step(1 / FPS, { lift: -1 });
  for (let i = 0; i < 2 * FPS; i++) game.step(1 / FPS);
  assert.equal(game.finale.stompArmed, true, 'the input window stays open after releasing descend');
  assert.equal(game.dash(), true, 'a mobile player can release descend before tapping dash');
  assert.equal(game.finale.phase, 'stomp');
  assert.equal(game.finale.ending, 'dragon-king');
  assert.equal(game.finale.breakProgress, 0);
  const began = game.time;
  playUntil(game, () => game.finale.phase === 'epilogue');
  assert.equal(game.finale.breakProgress, 1);
  playUntil(game, () => game.status === 'won');
  assert.equal(game.finale.end, 'dragon-king');
  assert.ok(Math.abs(game.time - began - 23.5) < .07, 'time from the player committing the stomp to the result');
  assert.equal(game.events.filter(event => event.type === 'finaleBreak').length, 1);
  const [land, breakGate] = game.events.filter(event => ['finalePawsLand','finaleBreak'].includes(event.type));
  assert.equal(land.type, 'finalePawsLand');
  assert.equal(breakGate.type, 'finaleBreak');
});
