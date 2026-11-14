import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { sampleSpine } from '../motion.js';

const up = new Vector3(0, 1, 0);
const matchBlendStart = 4.06;
const matchBlendEnd = 5.04;
const duration = .56;
export const SEA_TO_MOUNTAIN_CUT = 3.86;
export const SEA_TO_MOUNTAIN_DURATION = 10;
export const SEA_TO_MOUNTAIN_SPLASH = 3.03;
export const SEA_TO_MOUNTAIN_WINGBEAT = 4.98;
export const SEA_TO_MOUNTAIN_TITLE = 8.15;
export const SEA_TO_MOUNTAIN_BOSS_SINK = .82;
const { clamp, lerp, smoothstep, smootherstep } = MathUtils;
const valleyDuration = SEA_TO_MOUNTAIN_DURATION - SEA_TO_MOUNTAIN_CUT;
const morphStart = 3.46;
const morphEnd = 4.99;
const morphWings = 3.78;
const valleyLookStation = 6;
const crestAge = 4.84;
const downstrokeEnd = 5.35;

function strokePhase(age) {
  const unfurl = .40 * smoothstep(age, 4.00, 4.73);
  const crown = .06 * smoothstep(age, 4.50, crestAge);
  // The stroke reverses briefly at the top. Holding the pose through a
  // pair of quintic eases would make the wings stop twice before the power.
  const down = smoothstep(age, crestAge, downstrokeEnd);
  // Begin with a short, still-loaded catch, extend the recovering
  // wing into a shallow glide, then resume the next ordinary beat.
  const recover = .235 * smootherstep(age, downstrokeEnd, 5.73);
  const follow = Math.max(0, age - 5.73);
  const ease = .68;
  const live = follow < ease ? follow ** 2 / (2 * ease) : follow - ease * .5;
  const stroke=.64 + unfurl + crown + down * .364 + recover + live * .50;
  // Resolve the final approach onto a wide, near-neutral stroke while
  // the live follow camera closes. The normal cycle continues from it.
  const glide = smootherstep(age, 8.92, 9.38);
  const exit = 3.098 + .12 * (Math.max(0, age - 9.38) / .62) ** 2.32;
  return lerp(stroke, exit, glide);
}

function firstWingbeat(age) {
  const gather = smootherstep(age, 3.77, 4.08) * (1 - smootherstep(age, 4.13, 4.45));
  const stretch = smootherstep(age, 4.39, 4.78) * (1 - smootherstep(age, 4.96, 5.25));
  const opening = smoothstep(age, morphWings, 4.64);
  const loading = .43 * smootherstep(age, 4.59, 4.80) * (1 - smootherstep(age, 4.88, 5.07));
  const pressing = smootherstep(age, 4.90, 5.11) * (1 - smootherstep(age, 5.28, 5.52));
  const release = smootherstep(age, 5.14, 5.35) * (1 - smootherstep(age, 5.44, 5.82));
  return {
    opening, loading, pressing, release, staggeredGrowth: true,
    budSeparation: smoothstep(age, 4.03, 4.15) * (1 - smootherstep(age, 4.45, 4.64)),
    farPress: smootherstep(age, 5.09, 5.23) * (1 - smootherstep(age, 5.34, 5.43)),
    openPress: smootherstep(age, 4.96, 5.15) * (1 - smootherstep(age, 5.68, 6.25)),
    farGlide: smoothstep(age, 5.44, 5.60) * (1 - smootherstep(age, 6.02, 6.39)),
    chestPitch: -.31 * gather + .27 * stretch,
    chestArch: .54 * gather - .33 * stretch,
    earlySeparation: smootherstep(age, 4.02, 4.31) * (1 - smootherstep(age, 4.75, 5.05)),
    glide: smootherstep(age, 5.65, 5.92) * (1 - smootherstep(age, 6.38, 6.82)),
    socketTravel: smootherstep(age, 3.83, 4.83),
    socketInk: smootherstep(age, 3.95, 4.45) * (1 - smootherstep(age, 4.87, 5.19)),
    inkTravel: smootherstep(age, 4.10, 5.37),
    inkLoad: smootherstep(age, 4.11, 4.44) * (1 - smootherstep(age, 5.10, 5.76)),
    phase: strokePhase(age),
    force: smootherstep(age, 4.78, 5.11) * (1 - smootherstep(age, 7.03, 8.37)),
    reach: .36 * smootherstep(age, 5.02, 5.23) * (1 - smootherstep(age, 5.49, 5.96)),
    recoveryHeave: 1 - .82 * smootherstep(age, 4.69, 5.23) * (1 - smootherstep(age, 8.21, 9.41)),
    firstPress: pressing,
    powerStroke: .78,
  };
}

function seaPosition(origin, age) {
  const run = Math.max(0, age - .37);
  const burst = 4.1 * smootherstep(age, 2.06, 3.47);
  const travel = .9 * age + 1.54 * run * run + burst;
  const dive = smoothstep(age, .12, 1.48);
  const tuck = smootherstep(age, 1.63, 2.36) * (1 - smootherstep(age, 2.46, 2.94));
  const breach = smootherstep(age, 2.70, 3.58);
  const crestForce = smoothstep(age, 2.93, 3.09) * (1 - smootherstep(age, 3.12, 3.36));
  const across = 2.12 * Math.sin(Math.PI * smoothstep(age, .54, 2.90));
  const sweep = smootherstep(age, 1.15, 1.88) * (1 - smootherstep(age, 2.32, 2.78));
  const wake = 1.44 * smootherstep(age,.62,1.33) * (1 - smootherstep(age,2.20,3.16));
  const peel = (origin.peelSide ?? 0) * smootherstep(age, .03, .34)
    * (1 - smootherstep(age, .49, 1.06));
  const coil = across + wake * Math.sin((age - .65) * 3.25) + 1.35 * peel;
  const gather = smootherstep(age, .82, 1.51) * (1 - smootherstep(age, 1.64, 2.22));
  return {
    x: origin.x + Math.sin(origin.angle) * travel + Math.cos(origin.angle) * coil,
    y: lerp(origin.y, 1.16, dive) + .46 * Math.abs(peel) + 1.18 * gather - .43 * tuck + 5.1 * breach - .82 * crestForce,
    z: origin.z + Math.cos(origin.angle) * travel - Math.sin(origin.angle) * coil,
    angle: origin.angle - .23 * sweep,
  };
}

function seaExitOrigin(game) {
  const origin={...game.p};
  const boss=game.boss;
  function faceBend(angle) {
    origin.angle=angle;
    if(!boss)return;
    const lateral=(boss.x-origin.x)*Math.cos(angle)-(boss.z-origin.z)*Math.sin(angle);
    origin.peelSide=lateral<-.12?1:-1;
  }
  faceBend(origin.angle);
  if(!game.exploring||!game.shoreHeight)return origin;
  const heading=origin.angle;
  let best=heading,clearance=-Infinity;
  for(const bend of [0,.27,-.27,.55,-.55,.85,-.85,1.18,-1.18,1.6,-1.6,Math.PI]){
    faceBend(heading+bend);
    let margin=Infinity;
    for(let age=.24;age<SEA_TO_MOUNTAIN_CUT;age+=.20){
      const p=seaPosition(origin,age);
      const acrossX=Math.cos(origin.angle),acrossZ=-Math.sin(origin.angle);
      for(const side of [-.95,0,.95]){
        const floor=game.shoreHeight(p.x+acrossX*side,p.z+acrossZ*side);
        margin=Math.min(margin,p.y-floor);
      }
    }
    if(margin>.56)return origin;
    if(margin>clearance){best=origin.angle;clearance=margin;}
  }
  faceBend(best);
  origin.reefHeight=game.shoreHeight;
  return origin;
}

function valleyPosition(origin, age, riverAt) {
  const fraction = clamp(age / valleyDuration, 0, 1);
  const shotTime = SEA_TO_MOUNTAIN_CUT + age;
  const surge = smootherstep(shotTime, 4.96, 6.46);
  const entry = 3.25 * (1 - Math.exp(-3.3 * age));
  const z = origin.z + 25.3 * fraction + entry + 12.4 * surge;
  const distance = z - origin.z;
  const drop = smoothstep(distance, 0, 7.1);
  // The breast starts rising during the power stroke and the long spine
  // follows the same path. Spread the curve over distance, not time.
  const thrust = smoothstep(distance, 6.45, 15.55);
  const rise = smoothstep(distance, 13.0, 23.1);
  const coast = smoothstep(distance, 23.1, 40.9);
  const river = riverAt(z);
  return {
    x: river.x + origin.x - riverAt(origin.z).x
      + 1.32 * smootherstep(age, 2.64, 3.86) - 3.0 * smootherstep(age, 3.85, 5.24)
      + 1.68 * smootherstep(age, 5.14, valleyDuration),
    y: origin.y - 1.55 * drop + 3.53 * thrust + 1.57 * rise - 3.52 * coast,
    z,
    angle: Math.atan2(riverAt(z + valleyLookStation).x - riverAt(z - valleyLookStation).x, 2 * valleyLookStation),
  };
}

function travelTrail(origin, age, pointAt, previous, time) {
  const travelled = [];
  for (let sample = age; sample > 0; sample -= .045) {
    const point = pointAt(origin, sample);
    point.t = time + sample - age;
    travelled.push(point);
  }
  return travelled.concat(previous);
}

/** Carry the sea silhouette across the valley cut before easing into chase. */
export class ChapterView {
  constructor() {
    this.camera = new PerspectiveCamera();
    this.previousEye = new Vector3();
    this.previousRotation = new Quaternion();
    this.entryEye = new Vector3();
    this.entryRotation = new Quaternion();
    this.head = new Vector3();
    this.outgoingEye = new Vector3();
    this.yaw = new Quaternion();
    this.forward = new Vector3();
    this.side = new Vector3();
    this.eye = new Vector3();
    this.aim = new Vector3();
    this.shotRotation = new Quaternion();
    this.matchEye = new Vector3();
    this.matchRotation = new Quaternion();
    this.incomingEye = new Vector3();
    this.incomingRotation = new Quaternion();
    this.pressEye = new Vector3();
    this.pressRotation = new Quaternion();
    this.pressFov = 56;
    this.riverEye = new Vector3();
    this.riverAim = new Vector3();
    this.reset();
  }

  reset() {
    this.stage = -1;
    this.age = duration;
    this.transition = this.seaTrail = this.valleyTrail = this.valleyOrigin = null;
  }

  transitionFrame(game, frame, transition, riverAt) {
    const { age, switched } = transition;
    this.riverAt = riverAt;
    if (this.transition !== transition) {
      this.transition = transition;
      this.seaOrigin = seaExitOrigin(game);
      this.seaTrail = game.trail;
      this.seaCameraCaptured = false;
      this.valleyOrigin = null;
      this.valleyTrail = null;
      this.matchFov = undefined;
      this.pressFov = undefined;
      this.seaPointAt = this.seaOrigin.reefHeight ? (origin, time) => {
        const point = seaPosition(origin, time);
        point.y = Math.max(point.y, origin.reefHeight(point.x, point.z) + .65);
        return point;
      } : seaPosition;
      this.splashed = false;
      this.bossRipples = false;
    }
    let position, trail;
    if (switched) {
      const valleyAge = Math.max(0, age - SEA_TO_MOUNTAIN_CUT);
      this.valleyOrigin ??= { ...game.p };
      const origin = this.valleyOrigin;
      const pointAt = (start, time) => valleyPosition(start, time, riverAt);
      position = pointAt(origin, valleyAge);
      if (!this.valleyTrail) {
        const entry = pointAt(origin, 0);
        const exit = this.seaPointAt(this.seaOrigin, SEA_TO_MOUNTAIN_CUT);
        const turn = entry.angle - exit.angle;
        const cos = Math.cos(turn), sin = Math.sin(turn);
        const previous = travelTrail(this.seaOrigin, SEA_TO_MOUNTAIN_CUT,
          this.seaPointAt, this.seaTrail, game.time);
        // Carry the visible body through the same rigid change of frame as
        // the camera. The head continues drawing the new route over it.
        this.valleyTrail = previous.map(point => {
          const dx = point.x - exit.x, dz = point.z - exit.z;
          return { ...point, x: entry.x + cos * dx + sin * dz,
            y: entry.y + point.y - exit.y, z: entry.z + cos * dz - sin * dx };
        });
        if (this.matchFov !== undefined) {
          this.yaw.setFromAxisAngle(up, turn);
          this.matchEye.applyQuaternion(this.yaw);
          this.matchRotation.premultiply(this.yaw);
        }
      }
      trail = travelTrail(origin, valleyAge, pointAt, this.valleyTrail, game.time);
    } else {
      position = this.seaPointAt(this.seaOrigin, age);
      trail = travelTrail(this.seaOrigin, age, this.seaPointAt, this.seaTrail, game.time);
    }
    position.dash = switched ? 0 : smoothstep(age, 1.40, 2.70);
    const morphPush = .042 * smootherstep(age, 4.04, 4.30) * (1 - smootherstep(age, 4.52, 4.92));
    const preview = !switched && age >= morphStart && frame.stage === 3;
    const stage = preview ? 4 : frame.stage;
    const chapterMorph = switched || preview ? clamp((age - morphStart) / (morphEnd - morphStart) + morphPush, 0, 1) : undefined;
    const chapterWing = stage === 4 && chapterMorph !== undefined ? firstWingbeat(age) : undefined;
    if (switched && chapterWing) {
      chapterWing.paper = { x: position.x, y: position.y, z: position.z, age };
      chapterWing.backdrop = smootherstep(age, 4.17, 4.86) * (1 - smootherstep(age, 6.35, 7.50));
    }
    if (switched && chapterWing && age >= SEA_TO_MOUNTAIN_WINGBEAT && age < 6.96) {
      chapterWing.wake = valleyPosition(this.valleyOrigin, SEA_TO_MOUNTAIN_WINGBEAT - SEA_TO_MOUNTAIN_CUT, riverAt);
      chapterWing.wakeAge = age - SEA_TO_MOUNTAIN_WINGBEAT;
    }
    const waveTuck = !switched ? smootherstep(age, 1.64, 2.36) * (1 - smootherstep(age, 2.40, 2.98)) : 0;
    const valleyBank = switched ? .31 * smootherstep(age, 6.56, 7.30) * (1 - smootherstep(age, 7.72, 8.55))
      - .14 * smootherstep(age,7.94,8.55) * (1-smootherstep(age,8.84,9.78)) : 0;
    return {
      ...frame, stage, position, trail, heading: position.angle, intent: undefined,
      chapterPreviewForm: preview,
      spine: sampleSpine(trail, frame.length, .65 * (1 + stage * .08), position),
      chapterMorph, chapterWing, waveTuck, valleyBank,
    };
  }

  compose(camera, frame, { age, switched }, terrainHeight) {
    const result = this.camera.copy(camera, false);
    const { position, heading } = frame;
    this.head.set(position.x, position.y, position.z);
    this.forward.set(Math.sin(heading), 0, Math.cos(heading));
    this.side.crossVectors(up, this.forward);
    const portrait = camera.aspect < 1;

    if (!switched) {
      if (!this.seaCameraCaptured) {
        if (Number.isFinite(this.previousFov)) {
          this.entryEye.copy(this.previousEye);
          this.entryRotation.copy(this.previousRotation);
          this.entryFov = this.previousFov;
        } else {
          this.entryEye.copy(camera.position).sub(this.head);
          this.entryRotation.copy(camera.quaternion);
          this.entryFov = camera.fov;
        }
        this.seaCameraCaptured = true;
      }
      const push = smootherstep(age, .03, 1.69);
      const clearBoss = smoothstep(age, 0, .30) * (1 - smootherstep(age, .73, 1.36));
      const splashAhead = smootherstep(age, 2.02, 2.81) * (1 - smootherstep(age, 2.97, 3.58));
      const tracking = smootherstep(age, 2.59, 3.60);
      const drawToward = smootherstep(age, .68, 2.64);
      const approach = seaPosition(this.seaOrigin, lerp(1.48, age, tracking));
      const chase = smootherstep(age, 2.57, 3.79);
      const sideReveal = smootherstep(age, 2.93, 3.76);
      const fullWing = smootherstep(age, 3.28, 3.82);
      const lengthRoom = smoothstep(frame.length, 19, 43);
      this.eye.set(approach.x, approach.y, approach.z).lerp(this.head, .30 + .70 * tracking)
        .addScaledVector(this.forward, lerp(lerp(-.84, -4.8, drawToward), lerp(portrait ? -13.2 : -10.0, portrait ? -18.5 : -16.7, sideReveal) - (portrait ? 3.4 : 3.6) * fullWing * lengthRoom, chase))
        .addScaledVector(this.side, lerp(portrait ? 10.3 : 13.0, lerp(portrait ? 3.8 : 5.2, portrait ? 9.0 : 8.1, sideReveal), chase));
      this.eye.y = lerp(2.30 + .36 * drawToward, Math.max(2.8, this.head.y + 2.65 - .38 * chase), tracking);
      this.eye.y = lerp(this.eye.y, 7.46, sideReveal);
      const letRun = smootherstep(age, 1.63, 2.47) * (1 - smootherstep(age, 2.80, 3.48));
      this.aim.copy(this.head).addScaledVector(this.forward, lerp(-3.8, 1.6, chase) + 4.8 * letRun + 1.85 * splashAhead);
      this.aim.y += .24 + .5 * letRun + 1.06 * fullWing;
      this.aim.addScaledVector(this.side, (portrait ? -2.8 : -1.50) * fullWing);
      result.position.copy(this.eye);
      result.lookAt(this.aim);
      this.shotRotation.copy(result.quaternion);
      result.position.copy(this.entryEye).add(this.head).lerp(this.eye, push)
        .addScaledVector(this.side, 3.3 * (this.seaOrigin.peelSide ?? 1) * clearBoss);
      result.quaternion.copy(this.entryRotation).slerp(this.shotRotation, push);
      result.fov = lerp(this.entryFov, lerp(portrait ? 71 : 51,portrait ? 80 : 57,sideReveal) + 5.6 * fullWing, push);
      this.matchEye.copy(result.position).sub(this.head);
      this.matchRotation.copy(result.quaternion);
      this.matchFov = result.fov;
    } else {
      const open = smootherstep(age, 4.29, 5.08);
      const join = 1 - smootherstep(age, SEA_TO_MOUNTAIN_CUT, 4.78);
      const mistMomentum = 1 - smootherstep(age, 4.16, 4.74);
      const showBank = smootherstep(age, 4.10, 4.61) * (1 - smootherstep(age, 4.95, 5.54));
      const chestLine = smootherstep(age, 4.05, 4.39) * (1 - smootherstep(age, 4.83, 5.62));
      const holdReveal = smootherstep(age, 4.16, 4.52) * (1 - smootherstep(age, 5.17, 5.68));
      const lowerView = smootherstep(age, 4.03, 4.39) * (1 - smootherstep(age, 5.23, 5.87));
      const flyIn = smootherstep(age, 6.52, 7.32) * (1 - smootherstep(age, 7.93, 8.87));
      const spreadView = smootherstep(age, 4.63, 4.88) * (1 - smootherstep(age, 5.47, 6.11));
      const settle = smootherstep(age, 6.19, 8.52);
      const handoff = smootherstep(age, 8.10, 9.92);
      const wingspan = smoothstep(frame.length, 19, 48);
      const ridgeRoom = smootherstep(age, 6.41, 6.72) * (1 - smootherstep(age, 7.28, 7.58));
      const origin = this.valleyOrigin;
      const riverAt = this.riverAt;
      // Move along a slower parallel rail through the downstroke. The eye
      // and the valley's ink contours stay below the rising head for a beat.
      const delayed = age - .43 * smootherstep(age, 4.86, 5.34) * (1 - smootherstep(age, 5.81, 7.85));
      const rail = valleyPosition(origin, Math.max(0, delayed - SEA_TO_MOUNTAIN_CUT - .13 * mistMomentum), riverAt);
      const radius = lerp(portrait ? 18.0 : 11.8, portrait ? 24.9 : 16.6, open)
        + 6.8 * settle - (portrait ? 1.4 : 2.1) * flyIn + wingspan * (portrait ? 8.3 : 5.9) + 1.17 * ridgeRoom;
      const showSockets = smootherstep(age, 4.08, 4.45)
        * (1 - smootherstep(age, 4.77, 5.15));
      const angle = lerp(.73, .58, open) - .37 * settle - .24 * spreadView
        + .29 * chestLine - .20 * showSockets;
      // Steer the valley dolly from the broad river bend, independent of the
      // small yaw changes as the head crosses its longitudinal curves.
      const railHeading = Math.atan2(riverAt(rail.z + 15).x - riverAt(rail.z - 15).x, 30);
      const viewHeading = lerp(railHeading, heading, settle);
      this.forward.set(Math.sin(viewHeading), 0, Math.cos(viewHeading));
      this.side.crossVectors(up, this.forward);
      result.position.set(rail.x, rail.y, rail.z)
        .addScaledVector(this.forward, -radius * Math.cos(angle)).addScaledVector(this.side, radius * Math.sin(angle));
      // Keep the emergent wing and brow up against pale sky. As the
      // shoulders open fully, the eye eases back over the river's crest.
      result.position.y = lerp(lerp(12, 13.65, open) - (portrait ? 1.45 : 2.12) * lowerView,
        this.head.y + 4.7, settle);
      const sightY = this.head.y + .35;
      if (terrainHeight) {
        for (let i = 5; i <= 20; i++) {
          const t = i * .05;
          const x = lerp(this.head.x, result.position.x, t);
          const z = lerp(this.head.z, result.position.z, t);
          result.position.y = Math.max(result.position.y, sightY + (terrainHeight(x, z) + 1.65 - sightY) / t);
        }
      }

      this.aim.set(lerp(rail.x, this.head.x, settle), lerp(11.16 - .57 * join + .58 * lowerView, this.head.y - 1.07, settle),
        lerp(rail.z, this.head.z, settle));
      this.aim.y += .96 * ridgeRoom;
      this.aim.addScaledVector(this.forward, lerp(-1.0, 10.6, settle))
        .addScaledVector(this.side, ((portrait ? 1.55 : .65) + (portrait ? .67 : 1.65) * mistMomentum + (portrait ? .50 : 1.00) * showBank + .38 * join - (.52 * holdReveal - .36 * chestLine)) * (1 - settle));
      result.lookAt(this.aim);
      if (portrait) {
        // The crown stays close to the centre in the tall frame while the
        // two wings open beside it, without reducing the scale of the shot.
        const wingsInFrame = smootherstep(age, 4.32, 4.64)
          * (1 - .80 * smootherstep(age, 5.14, 5.45)) * (1 - smootherstep(age, 5.54, 5.87));
        result.rotateY(-.23 * wingsInFrame);
      }
      result.rotateZ(-.09 * frame.valleyBank * settle);
      // Let the body lead the move, then open the actual river mouth in
      // front of it. This arc is independent of the wingbeat's roll.
      const enterRiver = smootherstep(age, 5.83, 6.55)
        * (1 - smootherstep(age, 7.83, 8.85));
      if (enterRiver > 0) {
        const openBank = smootherstep(age, 6.23, 6.74);
        const followBank = smootherstep(age, 6.74, 7.27);
        const pathAngle = Math.atan2(riverAt(position.z + 9).x - riverAt(position.z - 9).x, 18);
        this.forward.set(Math.sin(pathAngle), 0, Math.cos(pathAngle));
        this.side.crossVectors(up, this.forward);
        const side = lerp(lerp(15.7, 10.65, openBank), 7.42, followBank);
        const back = lerp(lerp(15.92, 18.55, openBank), 19.83, followBank);
        this.riverEye.copy(this.head)
          .addScaledVector(this.side, side * (portrait ? 1.01 : 1))
          .addScaledVector(this.forward, -back - (portrait ? 8.5 : 0));
        this.riverEye.y = lerp(lerp(this.head.y - 1.05, this.head.y + .13, openBank), this.head.y + 2.08, followBank);
        if (terrainHeight) {
          for (let i = 5; i <= 20; i++) {
            const t = i / 20;
            const x = lerp(this.head.x, this.riverEye.x, t);
            const z = lerp(this.head.z, this.riverEye.z, t);
            this.riverEye.y = Math.max(this.riverEye.y, sightY + (terrainHeight(x, z) + 1.65 - sightY) / t);
          }
        }
        this.riverAim.copy(this.head).addScaledVector(this.forward, 5.2 + 2.25 * followBank);
        this.riverAim.x = lerp(this.riverAim.x, riverAt(this.riverAim.z + 2.0).x, .25);
        this.riverAim.y -= 1.12;
        this.shotRotation.copy(result.quaternion);
        this.eye.copy(result.position);
        result.position.copy(this.riverEye);
        result.lookAt(this.riverAim);
        result.quaternion.slerp(this.shotRotation, 1 - enterRiver);
        result.position.lerp(this.eye, 1 - enterRiver);
      }
      const matched = this.matchFov === undefined ? 1 : smootherstep(age, matchBlendStart, matchBlendEnd);
      this.incomingEye.copy(this.head).add(this.matchEye);
      this.incomingEye.y -= .38 * smoothstep(age, SEA_TO_MOUNTAIN_CUT, 4.84);
      this.incomingRotation.copy(this.matchRotation);
      result.position.lerp(this.incomingEye, 1 - matched);
      result.quaternion.slerp(this.incomingRotation, 1 - matched);
      result.position.lerp(camera.position, handoff);
      result.quaternion.slerp(camera.quaternion, handoff);
      const fov = (portrait ? 81 : 56) + 5.1 * wingspan + 1.9 * flyIn + 1.8 * ridgeRoom + enterRiver * (portrait ? 2.4 : 1.5);
      result.fov = lerp(lerp(this.matchFov ?? fov, fov, matched), camera.fov, handoff);
      // Briefly hold the valley framing during the stroke. The rock stays
      // almost fixed while the dragon moves up and away from the lens.
      if (age <= 4.99) {
        this.pressEye.copy(result.position);
        this.pressRotation.copy(result.quaternion);
        this.pressFov = result.fov;
      } else if (this.pressFov !== undefined && age < 5.89) {
        const hold = .88 * smootherstep(age, 4.99, 5.18) * (1 - smootherstep(age, 5.43, 5.89));
        result.position.lerp(this.pressEye, hold);
        result.quaternion.slerp(this.pressRotation, hold);
        result.fov = lerp(result.fov, this.pressFov + (portrait ? 4.1 : 2.6), hold);
      }
    }
    result.updateProjectionMatrix();
    result.updateMatrixWorld(true);
    return result;
  }

  finish(game, transition, riverAt) {
    const frame = this.transitionFrame(game, { stage: game.form, length: game.p.body }, transition, riverAt);
    Object.assign(game.p, frame.position, { altitude: frame.position.y });
    game.trail = frame.trail;
    game.bodyPath = frame.spine;
    this.stage = game.stage;
    this.age = duration;
    this.transition = this.seaTrail = this.valleyTrail = this.valleyOrigin = null;
  }

  apply(camera, frame, evolving, dt) {
    const { chapter: stage, position, heading } = frame;
    this.head.set(position.x, position.y, position.z);
    const entry = stage === 3 && this.stage === 2 && evolving && camera.isPerspectiveCamera;
    if (this.stage !== stage) this.age = duration;
    if (entry) {
      this.age = 0;
      this.entryEye.copy(this.previousEye);
      this.entryRotation.copy(this.previousRotation);
      this.entryHeading = this.previousHeading;
      this.entryFov = this.previousFov;
    }
    this.stage = stage;
    this.previousEye.copy(camera.position).sub(this.head);
    this.previousRotation.copy(camera.quaternion);
    this.previousHeading = heading;
    this.previousFov = camera.fov;
    if (this.age >= duration) return camera;

    this.yaw.setFromAxisAngle(up, heading - this.entryHeading);
    this.outgoingEye.copy(this.entryEye).applyQuaternion(this.yaw);
    // Opposing eyes would cross through the dragon instead of staying behind it.
    if (this.outgoingEye.dot(this.previousEye) <= 0) {
      this.age = duration;
      return camera;
    }
    const blend = MathUtils.smootherstep(this.age, 0, duration);
    this.age += dt;
    const result = this.camera.copy(camera, false);
    result.position.copy(this.outgoingEye).add(this.head).lerp(camera.position, blend);
    result.quaternion.copy(this.entryRotation).premultiply(this.yaw).slerp(camera.quaternion, blend);
    result.fov = MathUtils.lerp(this.entryFov, camera.fov, blend);
    result.updateProjectionMatrix();
    result.updateMatrixWorld(true);
    return result;
  }
}
