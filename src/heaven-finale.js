import { clamp } from './rules.js';
import { hasHiddenEnding } from './ending-route.js';

const COURTYARD = { x: 0, y: 22.1, z: 64.2 };
const THRESHOLD = { x: 0, y: 23.3, z: 44.8 };
const UPDRAFT = { x: 12.3, y: 34, z: 36.8 };
export const FASCIA = Object.freeze({ x: 0, y: 31.5, z: 41.4 });
const LANDING = { x: 0, y: 33.08, z: 43.05 };
const ROOF_EDGE = 43.75;
export const STOMP_PAD = Object.freeze({ x: 6.45, zMin: 34.4, zMax: ROOF_EDGE + .35, yMin: 35.1, yMax: 42 });
const STOMP_LOFT = 2.8;
export const STOMP_LOAD = .46;
export const STOMP_PAW_GAP = .126;
const LAYERS = [{ y: 17.4, halfHeight: 2.1 }, { y: 27.5, halfHeight: 2.25 }];
const LOCK_TRACK = .95;
const LOCK_DURATION = 2.42;
const LAYER_DURATION = 2.65;
const LOCK_RADIUS = 4.3;
export const STOMP_IMPACT = 1.05;
export const STOMP_DURATION = 4.95;
export const STOMP_CHAIN_RELEASE = STOMP_DURATION - .10;
const LOCK_END = 5.75;
export const LOCK_GATE_DURATION = 19.15;
export const LOCK_LAKE_DURATION = 5.70;
export const GATE_BIND = Object.freeze({ ankle: .91, wing: 2.18, latch: 3.22 });
export const LOCK_LANDING = Object.freeze({ skid: 15.64, catch: 16.24, compression: 16.32, rebound: 16.53, release: 16.95, rest: 17.65 });
export const LOCK_STAIR = Object.freeze({
  touch: 15.02, lip: 15.68, landing: 16.12, lower: 16.80, chest: 17.61, rest: 18.20,
});
export const LOCK_SETTLE = Object.freeze({ load: 16.75, arrest: 17.06, rest: 17.66, exhale: 18.28 });
export const LOCK_DOOR = Object.freeze({ reach: 9.88, grip: 10.93, pull: 11.10, close: 12.08, release: 12.33, clear: 12.88 });
export const LOCK_SNAG = Object.freeze({ start: 13.01, peak: 13.47, release: 13.65, end: 14.48 });
const AUDIENCE_DURATION = 4.4;
const INSCRIPTION_AT = 2.30;
export const COURT_SEAL_AT = 3.55;
export const COURT_PAW_STEPS = Object.freeze([1.72, 2.18]);
const BLESSING_DURATION = 3.25;
export const BLESSING_RAIN_AT = 1.25;
export const LAKE_CHAIN_START = .91;

// [elapsed game seconds, authored animation age]. The trial and player
// approach use the ordinary clock. Each route lands its own action beats.
const ENDING_PACE = {
  lock: [[0, 0], [1, .32], [4, .82], [5, 1.24], [8.2, 2.06], [9.3, 2.51],
    [12.1, 3.15], [14.6, 4.15], [17.4, 5.50], [LOCK_GATE_DURATION, LOCK_END]],
  stomp: [[0, 0], [.45, .10], [1.55, .52], [2.58, .98], [2.98, 1.176],
    [3.64, STOMP_IMPACT + STOMP_LOAD], [5.05, 2.02], [7.70, 3.03], [9.84, 4.18],
    [11.38, 4.55], [12.78, STOMP_DURATION]],
  audience: [[0, 0], [2.20, 1.46], [3.75, INSCRIPTION_AT], [5.95, 3.41],
    [6.26, 3.79], [7.8, AUDIENCE_DURATION]],
  blessing: [[0, 0], [.74, .37], [2.05, .86], [2.75, 1.12], [3.30, 1.38],
    [4.40, 1.99], [6.7, BLESSING_DURATION]],
  ordained: [[0, 0], [4.2, 2.22], [8.25, 4.50], [11.7, 6.35]],
  'dragon-king': [[0, 0], [6.2, 2.48], [10.72, 3.8]],
};

const lerp = (a, b, t) => a + (b - a) * t;
const ease = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const beat = (time, from, to) => ease((time - from) / (to - from));
const approach = (from, to, rate, dt) => lerp(from, to, 1 - Math.exp(-rate * dt));
const deltaAngle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function timeline(phase, ending) {
  return ENDING_PACE[phase === 'epilogue' ? ending : phase];
}

function sampleTimeline(points, value, from, to) {
  if (!points) return value;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], next = points[i];
    if (value <= next[from]) {
      return lerp(previous[to], next[to], (value - previous[from]) / (next[from] - previous[from]));
    }
  }
  return points.at(-1)[to];
}

export function endingElapsedAt(phase, age, ending) {
  return sampleTimeline(timeline(phase, ending), age, 1, 0);
}

export function finaleToWorld(origin, { x, y, z }) {
  const sin = Math.sin(origin.angle), cos = Math.cos(origin.angle);
  return { x: origin.x + x * cos + z * sin, y, z: origin.z - x * sin + z * cos };
}

export function finaleToLocal(origin, point) {
  const sin = Math.sin(origin.angle), cos = Math.cos(origin.angle);
  const x = point.x - origin.x, z = point.z - origin.z;
  return { x: x * cos - z * sin, y: point.y, z: x * sin + z * cos };
}

function localPose(game) {
  return { ...finaleToLocal(game.ascentOrigin, game.p), angle: deltaAngle(game.ascentOrigin.angle, game.p.angle) };
}

function place(game, pose, dt, exact = false) {
  const p = game.p, origin = game.ascentOrigin;
  Object.assign(p, finaleToWorld(origin, pose), { altitude: pose.y });
  const angle = origin.angle + pose.angle;
  p.angle = exact ? angle : p.angle + deltaAngle(p.angle, angle) * (1 - Math.exp(-8 * dt));
}

function phase(game, name) {
  const finale = game.finale;
  finale.phase = name;
  finale.age = 0;
  finale.elapsed = 0;
  finale.start = localPose(game);
  finale.manualHeight = false;
}

function crossed(previousAge, age, cue) {
  return previousAge < cue && age >= cue;
}

function announce(game, type, point, extra) {
  const { x, y, z } = point;
  game.emit(type, { x, y, z, stage: 4, ...extra });
}

export function createHeavenFinale(game) {
  const origin = game.ascentOrigin;
  const p = game.p;
  game.finale = {
    phase: 'approach',
    age: 0,
    elapsed: 0,
    start: localPose(game),
    entryMass: p.mass,
    velocity: { x: 0, y: 0, z: 3.9 },
    manualHeight: false,
    trialStep: 0,
    hits: 0,
    secret: hasHiddenEnding(game),
    warning: null,
    strike: null,
    gateOpen: 0,
    cracked: false,
    updraft: finaleToWorld(origin, UPDRAFT),
    impact: finaleToWorld(origin, FASCIA),
    threshold: finaleToWorld(origin, THRESHOLD),
    roofLine: false,
    stompReady: false,
    stompArmed: false,
    impactAt: STOMP_IMPACT,
    inscriptionAt: INSCRIPTION_AT,
    breakProgress: 0,
    stompHoldUntil: -Infinity,
    stompDipped: false,
    dashBufferUntil: -Infinity,
    ending: null,
    end: null,
  };
  p.dash = p.dashCD = p.invul = 0;
  return game.finale;
}

function startWarning(game, kind) {
  const finale = game.finale;
  const layers = kind === 'layers';
  finale.warning = {
    kind,
    age: 0,
    duration: layers ? LAYER_DURATION : LOCK_DURATION,
    locked: layers,
    center: layers ? finaleToWorld(game.ascentOrigin, { x: 0, y: 22.6, z: 28.6 }) : { x: game.p.x, y: game.p.y, z: game.p.z },
    layers: layers ? LAYERS : [],
    radius: layers ? 18 : LOCK_RADIUS,
  };
  announce(game, 'finaleWarning', finale.warning.center, { kind, duration: finale.warning.duration });
}

function lateralInput(game, input) {
  // Viewed from behind the dragon, positive gate-local X is screen left.
  if (Number.isFinite(input.turn)) return -clamp(input.turn, -1, 1);
  const { x = 0, z = 0 } = input;
  const { angle } = game.ascentOrigin;
  return (x * Math.cos(angle) - z * Math.sin(angle)) / Math.max(1, Math.hypot(x, z));
}

function alignedWithDoor({ x, y }) {
  return Math.abs(x) <= 3.8 && Math.abs(y - THRESHOLD.y) <= 3.45;
}

function aboveFracture({ x, z }) {
  return Math.abs(x - FASCIA.x) <= STOMP_PAD.x && z >= STOMP_PAD.zMin && z <= STOMP_PAD.zMax;
}

function overRoofLine(finale, point) {
  return finale.phase === 'choice' && finale.cracked && point.y >= STOMP_PAD.yMin &&
    point.z >= 32.7 && Math.abs(point.x) <= 17.2;
}

function canStomp(game, point) {
  const { finale } = game;
  return finale.phase === 'choice' && finale.cracked && aboveFracture(point) &&
    point.y >= STOMP_PAD.yMin && point.y <= STOMP_PAD.yMax;
}

function moveFlight(game, dt, input) {
  const finale = game.finale, current = localPose(game), v = finale.velocity;
  const steer = lateralInput(game, input);
  const lift = clamp(input.lift ?? 0, -1, 1);
  const approachLane = finale.phase === 'approach';
  const trial = finale.phase === 'trial';
  const choice = finale.phase === 'choice';
  const blessing = finale.phase === 'blessing';
  const dashing = game.p.dash > 0;
  const dashX = Math.sin(finale.dashAngle ?? current.angle);
  const dashZ = Math.cos(finale.dashAngle ?? current.angle);
  const cruise = approachLane ? 4.35 : trial ? 1.45
    : blessing ? lerp(4.28, 4.92, beat(finale.age, .21, 1.45)) : 3.4;
  const speed = blessing ? 4.7 : 7.8;
  const updraft = choice && finale.secret
    ? 1 - ease(Math.hypot(current.x - UPDRAFT.x, current.z - UPDRAFT.z) / 4.4) : 0;
  // The side wind holds its place along the lane while the dragon gains height.
  const inSideWind = choice && finale.secret && current.y < 37.3
    ? (1 - beat(Math.abs(current.x - UPDRAFT.x), 1.9, 4.5)) * beat(current.z, 28.4, 35) : 0;
  const windSpeed = clamp((UPDRAFT.z - current.z) * 1.35, -2.4, 4.3);
  if (Math.abs(lift) > .05) finale.manualHeight = true;
  const climb = blessing ? clamp((32.8 - current.y) * 1.78, 0, 8.3)
    : !finale.manualHeight && approachLane ? clamp((22.6 - current.y) * 1.34, -6.7, 6.7) : 0;
  const draft = updraft * 7.8 * (1 - beat(current.y, 37.1, 39.4)) * Math.max(0, lift * .42 + .58);
  // Wings can reach the lintel on their own. Only the current alongside
  // the gate has the lift to carry them onto the roof approach.
  const climbAuthority = choice && lift > 0
    ? 1 - beat(current.y, 31.1, 34.2) : 1;
  const canCross = choice && finale.gateOpen >= .74 && alignedWithDoor(current);
  const ready = canStomp(game, current);
  const roofSpeed = overRoofLine(finale, current)
    ? lerp(cruise, .32, beat(current.z, 33.0, FASCIA.z)) : cruise;
  const approachSpeed = choice && !canCross ? roofSpeed * beat(ROOF_EDGE - current.z, 0, 1.65) : roofSpeed;
  // The updraft through the open court lends a small crosswind. Steering
  // can take either side of the aisle while the dragon clears the roof.
  const crosswind = blessing ? (1 - Math.min(1, Math.abs(steer))) *
    lerp(2.95, .22, beat(finale.age, 1.14, 2.1)) : 0;
  const xTarget = (dashing ? dashX * 14.3 : steer * speed) + crosswind;
  const zTarget = dashing ? cruise + dashZ * 14.3 : lerp(approachSpeed, windSpeed, inSideWind);
  v.x = approach(v.x, xTarget, dashing ? 12 : 6.8, dt);
  v.z = approach(v.z, zTarget, dashing ? 12 : 6.8, dt);
  if(ready && lift < -.12 && !finale.stompDipped){
    finale.stompHoldUntil=game.time+STOMP_LOFT;
    finale.stompDipped=true;
  }
  const holding=ready && game.time<finale.stompHoldUntil && lift<.12;
  const descending=holding&&lift<0?lift*lerp(.28,.67,beat(current.y,35.9,39.2)):lift;
  v.y = approach(v.y, descending * climbAuthority * (blessing ? 3.5 : 7.1) + climb + draft, 7.2, dt);

  const xLimit = approachLane ? 15 : blessing ? 8.5 : 19;
  const yLow = blessing ? lerp(22.25, 28.2, beat(finale.age, .15, 1.42)) : approachLane
    ? lerp(Math.min(11, finale.start.y), 15.5, beat(current.z, 15, 24.6)) : 15.5;
  // Keep the flight in the open aisle between the two covered walks
  // and give the dragon room to gain altitude before the inner hall.
  const yHigh = blessing ? 36 : trial ? 29.55 : choice && finale.secret ? 42 : 30.2;
  const minZ = approachLane ? 9 : trial ? 22 : blessing ? 63.9 : 25;
  const maxZ = approachLane ? 25 : trial ? 35 : blessing ? 75.7 : canCross ? THRESHOLD.z : ROOF_EDGE;
  const nextX=clamp(current.x+v.x*dt,-xLimit,xLimit);
  const nextZ=clamp(current.z+v.z*dt,minZ,Math.max(maxZ,current.z));
  const floor = holding&&aboveFracture({x:nextX,z:nextZ}) ? Math.max(yLow,STOMP_PAD.yMin+.23):yLow;
  const next = {
    x: nextX,
    y: clamp(current.y + v.y * dt, floor, yHigh),
    z: nextZ,
    angle: Math.atan2(xTarget, Math.max(cruise * .65, zTarget)),
  };
  place(game, next, dt);
  if(next.y===floor&&v.y<0&&floor>yLow)v.y=0;
  if(lift>=-.12||!aboveFracture(next))finale.stompDipped=false;
  if(lift>.12||!aboveFracture(next))finale.stompHoldUntil=-Infinity;
  if(canStomp(game,next)&&!ready&&lift<-.12){
    finale.stompHoldUntil=game.time+STOMP_LOFT;
    finale.stompDipped=true;
  }
  finale.roofLine = overRoofLine(finale,next);
  finale.stompReady = canStomp(game, next);
  finale.stompArmed = finale.stompReady && game.time <= finale.stompHoldUntil;
  return next;
}

function strike(game) {
  const finale = game.finale, warning = finale.warning;
  const p = game.p;
  const isLayer = warning.kind === 'layers';
  const hit = isLayer
    ? warning.layers.some(layer => Math.abs(p.y - layer.y) <= layer.halfHeight)
    : Math.hypot(p.x - warning.center.x, p.z - warning.center.z) <= warning.radius &&
      Math.abs(p.y - warning.center.y) < 4.25;
  finale.strike = { ...warning, age: 0, hit };
  finale.warning = null;
  announce(game, 'finaleStrike', warning.center, { kind: warning.kind, hit });
  if (!hit) return;

  finale.hits++;
  const oldBody = p.body, oldMass = p.mass;
  p.mass *= .72;
  game.syncBody();
  game.metrics.lost += oldMass - p.mass;
  p.invul = .85;
  const tail = game.bodyPath.at(-1) || p;
  announce(game, 'hurt', tail, { amount: (oldMass - p.mass) * 8 * Math.pow(p.density, .25), lost: oldBody - p.body });
}

function startChoice(game) {
  const finale = game.finale;
  phase(game, 'choice');
  finale.cracked = finale.secret;
  finale.gateOpen = .06;
  announce(game, 'finaleGate', finale.threshold, { cracked: finale.cracked });
}

function startLock(game) {
  const finale = game.finale;
  phase(game, 'lock');
  finale.ending = 'locked';
  finale.gateOpen = .28;
  announce(game, 'finaleBind', finale.threshold);
}

function advanceTrial(game, dt, input) {
  const finale = game.finale;
  moveFlight(game, dt, input);
  const warning = finale.warning;
  if (!warning) {
    if (finale.strike && finale.strike.age < .91) return;
    if (finale.trialStep === 0) {
      finale.trialStep = 1;
      startWarning(game, 'lock');
    } else {
      startChoice(game);
    }
    return;
  }

  warning.age += dt;
  if (warning.kind === 'lock' && !warning.locked) {
    warning.center = finaleToWorld(game.ascentOrigin, localPose(game));
    warning.locked = warning.age >= LOCK_TRACK;
  }
  if (warning.age < warning.duration) return;
  strike(game);
  if (finale.hits === 2) startLock(game);
}

function startStomp(game) {
  const finale = game.finale;
  phase(game, 'stomp');
  finale.ending = 'dragon-king';
  finale.stompReady = false;
  finale.stompArmed = false;
  game.p.dash = .8;
  announce(game, 'finaleStomp', game.p);
}

export function dashHeavenFinale(game, input = {}) {
  const finale = game.finale;
  if (!finale || !['approach', 'trial', 'choice', 'blessing'].includes(finale.phase)) return false;
  if (canStomp(game, localPose(game))) {
    if ((input.lift ?? 0) < -.12 || finale.stompArmed) {
      startStomp(game);
    } else {
      finale.dashBufferUntil = game.time + .18;
    }
    return true;
  }
  if (game.p.dashCD > 0) return false;

  const steer = lateralInput(game, input);
  finale.dashAngle = Math.abs(steer) > .15 ? Math.atan2(steer, .24) : 0;
  game.p.dash = .34;
  game.p.dashCD = 1.7;
  announce(game, 'dash', game.p);
  return true;
}

function advanceChoice(game, dt, input) {
  const finale = game.finale;
  finale.gateOpen = lerp(.06, 1, beat(finale.age, 0, 1.25));
  const next = moveFlight(game, dt, input);
  if (finale.stompArmed && game.time <= finale.dashBufferUntil) {
    startStomp(game);
    return;
  }
  if (finale.gateOpen < .74 || next.z < THRESHOLD.z - .16 || !alignedWithDoor(next)) return;

  phase(game, 'audience');
  finale.ending = 'ordained';
  announce(game, 'finaleAudience', game.p);
  finale.stompReady = false;
  finale.stompArmed = false;
  finale.gateOpen = 1;
}

function advanceLock(game, dt, previousAge) {
  const { age, elapsed, start } = game.finale;
  const {ankle,wing,latch}=GATE_BIND;
  const recover = beat(age,.05,.32);
  const struck = beat(elapsed,0,.18) - beat(elapsed,.23,.69);
  const advance = beat(age,.22,ankle-.035);
  const firstRecoil = beat(age,ankle+.028,ankle+.36);
  const secondPush = beat(age,ankle+.48,wing-.045);
  const secondRecoil = beat(age,wing+.037,wing+.41);
  const doorReach = beat(elapsed,LOCK_DOOR.reach,LOCK_DOOR.grip);
  const doorDrag = beat(elapsed,LOCK_DOOR.pull,LOCK_DOOR.close);
  const doorLetGo = beat(elapsed,LOCK_DOOR.release,LOCK_DOOR.clear);
  const doorHold = doorReach*(1-doorLetGo);
  const lastPull = (beat(elapsed,9.41,10.13) - beat(elapsed,10.24,11.34))*(1-doorReach);
  const fold = beat(age,latch-.04,latch+.30);
  const fall = .33*beat(elapsed,LOCK_SNAG.start,LOCK_SNAG.peak)
    + .67*beat(elapsed,LOCK_SNAG.release,15.61);
  const snag = beat(elapsed,LOCK_SNAG.start,LOCK_SNAG.peak)
    - beat(elapsed,LOCK_SNAG.release,LOCK_SNAG.end);
  const settle = beat(age,latch+1.10,latch+1.65);
  const weightOnStone = .86 * beat(elapsed,14.90,LOCK_LANDING.catch) + .18 * beat(elapsed,16.49,LOCK_LANDING.rest);
  const recoilOnStone = beat(elapsed,LOCK_LANDING.skid,LOCK_LANDING.catch)
    - beat(elapsed,16.46,17.22);
  const {catch:stoneContact,compression,rebound,release}=LOCK_LANDING;
  const compress = beat(elapsed,stoneContact-.23,compression)-beat(elapsed,compression,rebound);
  const bounce = beat(elapsed,compression,rebound)-beat(elapsed,rebound,release);
  // The chain next catches the weight left by the paw rebound. Allow
  // one compression before the shoulder comes to rest under the bolts.
  const weightThroughShoulder = beat(elapsed,LOCK_SETTLE.load,LOCK_SETTLE.rest);
  const chainStop = beat(elapsed,LOCK_SETTLE.load,LOCK_SETTLE.arrest)
    - beat(elapsed,LOCK_SETTLE.arrest,LOCK_SETTLE.rest);
  const releaseHead = beat(elapsed,LOCK_SETTLE.rest,LOCK_SETTLE.exhale);
  const side = clamp(-start.x*.09-.48,-1.38,.62);
  const forward = Math.min(5.7,Math.max(.42,40.1-start.z));
  // The held leaf gives way at the same rate as the last backward pull.
  // The opposite leaf follows on its own hinge a moment behind.
  game.finale.gateOpen = .28 * (1-doorDrag);
  game.finale.otherGateOpen = .28 * (1-beat(elapsed,LOCK_DOOR.pull+.13,LOCK_DOOR.close+.11));
  const pose = {
    x: lerp(start.x * (1 - .28 * advance) + side * firstRecoil + .42 * secondPush + 1.29 * secondRecoil,
      -2.8,fall) + .58 * lastPull + .36 * recoilOnStone + .47*weightThroughShoulder + .77*snag - .38*struck,
    y: lerp(lerp(start.y,23.92,recover) + .40 * advance - 1.62 * firstRecoil
      + 2.35 * secondPush - 1.08 * secondRecoil - .52 * fold,15.98,fall)
      - .14 * settle - weightOnStone + .46 * lastPull - .36 * compress + .30 * bounce
      - .47*weightThroughShoulder - .19*chainStop - .10*releaseHead + .43*snag - 1.48*struck,
    z: lerp(start.z + forward * advance - 4.18 * firstRecoil + 3.5 * secondPush
      - 3.91 * secondRecoil,36.25,fall) - .39 * settle - .59 * lastPull - .68 * recoilOnStone + .22*weightThroughShoulder - .12*chainStop - .49*snag,
    angle: lerp(start.angle, Math.atan2(-start.x*.48,9),recover) - .23 * firstRecoil
      + .28 * secondPush + .25 * secondRecoil - .64 * fold + .34 * settle - .20 * lastPull + .15 * recoilOnStone
      - .14*weightThroughShoulder + .39*snag - .14*struck,
  };
  pose.x=lerp(pose.x,.90,doorHold);
  pose.y=lerp(pose.y,21.97-.61*doorDrag,doorHold);
  pose.z=lerp(pose.z,44.76-3.21*doorDrag,doorHold);
  pose.angle=lerp(pose.angle,.14-.15*doorDrag,doorHold);
  // The claw keeps sliding while the breast gives way behind it. Drive
  // the second descent toward the landing, then yield into the lower step.
  const skidDown=beat(elapsed,LOCK_STAIR.touch,LOCK_STAIR.lower);
  const settleBody=beat(elapsed,LOCK_STAIR.lower,LOCK_STAIR.chest);
  pose.x -= .37*skidDown+.12*settleBody;
  pose.y -= .43*skidDown+1.17*settleBody;
  pose.z -= 1.62*skidDown+2.72*settleBody;
  pose.angle -= .08*skidDown+.09*settleBody;
  // Let the forequarters roll across the tread as their last support
  // fails. Keep the initial fall and the earlier paw arrest intact.
  const lying=beat(elapsed,17.24,18.22);
  pose.x-=.40*lying;
  pose.y-=.70*lying;
  pose.z-=.45*lying;
  pose.angle-=.12*lying;
  place(game,pose,dt);
  const cue = { age, elapsed: game.finale.elapsed };
  if(crossed(previousAge,age,ankle))announce(game,'finaleCuff',game.p,{...cue,joint:'ankle'});
  if(crossed(previousAge,age,wing))announce(game,'finaleCuff',game.p,{...cue,joint:'wing'});
  if(crossed(previousAge,age,latch))announce(game,'finaleLatch',game.finale.threshold,cue);
}

function advanceStomp(game, dt, previousAge) {
  const finale = game.finale;
  const { age, start } = finale;
  const dive = clamp((age - .10) / (STOMP_IMPACT - .10), 0, 1);
  const approach = ease(dive);
  const drop = dive * dive * (2.58 - 1.58 * dive);
  const firstLoad = beat(age, STOMP_IMPACT, STOMP_IMPACT + .078);
  const secondLoad = beat(age, STOMP_IMPACT + STOMP_PAW_GAP, STOMP_IMPACT + .36);
  const releaseAt = STOMP_IMPACT + STOMP_LOAD;
  const rebound = beat(age, releaseAt + .04, releaseAt + .29);
  const bearing = beat(age, STOMP_IMPACT + .025, releaseAt - .04) * (1 - rebound);
  const clear = beat(age, releaseAt + .15, 2.96);
  const escape = beat(age, releaseAt + .31, 3.88);
  const climb = beat(age, releaseAt + .22, 4.08);
  const glide = clamp((age - releaseAt - .53) / 2.91, 0, 1);
  place(game, {
    x: lerp(start.x, LANDING.x, approach) - .34 * firstLoad * (1 - secondLoad)
      + 4.8 * escape + 5.4 * glide * glide,
    y: lerp(start.y + .47 * Math.sin(Math.PI * approach), LANDING.y + .29, drop)
      - .19 * firstLoad - .21 * secondLoad * (1 - rebound) - .68 * bearing + rebound * .14 + climb * 9.9,
    z: lerp(start.z, LANDING.z, approach) + 5.6 * clear + 9.4 * glide,
    angle: start.angle + deltaAngle(start.angle, 0) * approach + .59 * escape,
  }, dt);
  if (crossed(previousAge, age, STOMP_IMPACT)) announce(game, 'finalePawsLand', finale.impact);
  if (crossed(previousAge, age, releaseAt)) announce(game, 'finaleBreak', finale.impact);
  if (crossed(previousAge, age, STOMP_CHAIN_RELEASE)) announce(game, 'finaleChainRelease', finale.threshold);
  finale.breakProgress = clamp((age - releaseAt) / 2.6, 0, 1);
}

function advanceAudience(game, dt, previousAge) {
  const finale = game.finale;
  const { age, start } = finale;
  const cross = clamp(age / 2.26, 0, 1);
  // Brake at the leading forepaw. The weight transfer happens vertically
  // above the same stone before the head lowers to the decree.
  const travel = 1 - (1 - cross) ** 2;
  const brake = beat(age, 1.49, 1.91);
  const land = beat(age, 1.29, 1.74);
  const rise = beat(age, 3.69, 4.36);
  const [leadingAt, bearingAt] = COURT_PAW_STEPS;
  const leading = beat(age, 1.36, leadingAt + .11);
  const bearing = beat(age, bearingAt - .09, bearingAt + .15);
  const compress = beat(age, leadingAt, leadingAt + .16) * (1 - beat(age, 1.96, 2.10));
  const reset = beat(age, 2.45, 2.74);
  const ground = lerp(19.59 - .64 * leading - .50 * bearing - .26 * compress, 18.89, reset);
  place(game, {
    x: lerp(start.x, COURTYARD.x, beat(age, 0, 1.65)) - .31 * compress,
    y: lerp(lerp(lerp(start.y, COURTYARD.y, travel), ground, land), 22.25, rise),
    z: lerp(lerp(start.z, 63.10, travel), 62.90 + .20 * reset, brake) + .90 * rise,
    angle: start.angle * (1 - beat(age, 0, 1.46)),
  }, dt);
  for (const [side, cue] of COURT_PAW_STEPS.entries()) {
    if (crossed(previousAge, age, cue)) announce(game, 'finaleCourtStep', game.p, { side });
  }
  if (crossed(previousAge, age, INSCRIPTION_AT)) announce(game, 'finaleInscription', game.p);
  if (crossed(previousAge, age, COURT_SEAL_AT)) announce(game, 'finaleSeal', game.p);
  if (age >= AUDIENCE_DURATION) {
    phase(game, 'blessing');
    finale.velocity = { x: 0, y: 0, z: 0 };
  }
}

function finish(game) {
  const finale = game.finale;
  finale.completedPhase = finale.phase;
  finale.phase = 'complete';
  finale.end = finale.ending;
  const win = finale.ending !== 'locked';
  game.status = win ? 'won' : 'dead';
  game.emit('end', { win, ending: finale.ending });
}

export function stepHeavenFinale(game, dt, input = {}) {
  const finale = game.finale, p = game.p;
  game.time += dt;
  game.ascend += dt;
  const previousAge = finale.age;
  const points = timeline(finale.phase, finale.ending);
  finale.elapsed = (finale.elapsed ?? endingElapsedAt(finale.phase, previousAge, finale.ending)) + dt;
  finale.age = sampleTimeline(points, finale.elapsed, 0, 1);
  p.dash = Math.max(0, p.dash - dt);
  p.dashCD = Math.max(0, p.dashCD - dt);
  p.invul = Math.max(0, p.invul - dt);
  if (finale.strike) {
    finale.strike.age += dt;
    if (finale.strike.age > 1.04) finale.strike = null;
  }

  switch (finale.phase) {
    case 'approach':
      if (moveFlight(game, dt, input).z >= 25) {
        phase(game, 'trial');
        startWarning(game, 'layers');
      }
      break;
    case 'trial':
      advanceTrial(game, dt, input);
      break;
    case 'choice':
      advanceChoice(game, dt, input);
      break;
    case 'lock':
      advanceLock(game, dt, previousAge);
      if (finale.age >= LOCK_END) phase(game, 'epilogue');
      break;
    case 'stomp':
      advanceStomp(game, dt, previousAge);
      if (finale.age >= STOMP_DURATION) phase(game, 'epilogue');
      break;
    case 'audience':
      advanceAudience(game, dt, previousAge);
      break;
    case 'blessing':
      moveFlight(game, finale.age - previousAge, input);
      if (crossed(previousAge, finale.age, BLESSING_RAIN_AT)) announce(game, 'finaleRain', game.p);
      if (finale.age >= BLESSING_DURATION) phase(game, 'epilogue');
      break;
    case 'epilogue':
      if (finale.ending === 'dragon-king' && crossed(previousAge, finale.age, LAKE_CHAIN_START)) {
        announce(game, 'finaleLakeChain', finale.threshold);
      }
      if (finale.ending === 'locked' && crossed(previousAge, finale.age, .95)) {
        announce(game, 'finaleLakeBlocked', finale.threshold);
      }
      if (finale.age >= (finale.ending === 'ordained' ? 6.35
        : finale.ending === 'locked' ? LOCK_LAKE_DURATION : 3.8)) finish(game);
      break;
  }
  game.followSkyTrail(dt);
}

export function retryHeavenFinale(game) {
  if (game.status !== 'dead' || game.finale?.end !== 'locked') return false;
  const finale = game.finale;
  game.metrics.lost = Math.max(0, game.metrics.lost - (finale.entryMass - game.p.mass));
  game.p.mass = finale.entryMass;
  game.syncBody();
  game.status = 'ascending';
  game.ascend = 0;
  const start = { x: 0, y: 22.6, z: 21.8, angle: 0 };
  place(game, start, 0, true);
  const spacing = .65 * (1 + game.form * .08);
  game.trail = Array.from({ length: 240 }, (_, i) => ({
    ...finaleToWorld(game.ascentOrigin, { ...start, z: start.z - i * spacing }),
    t: game.time - i * .12,
  }));
  game.followSkyTrail(0);
  createHeavenFinale(game);
  announce(game, 'ascend', game.p);
  return true;
}
