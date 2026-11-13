import { Euler, MathUtils, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { spineBeat } from './growth/spine-beat.js';
import { clawHoldSeconds } from './claw-surface.js';

const { clamp, lerp, smoothstep } = MathUtils;
const beat = (time, start, peak, hold, end) =>
  smoothstep(time, start, peak) * (1 - smoothstep(time, hold, end));

// Shoulder or hip, elbow or hock, palm, and original digit tips. These
// positions are sampled from the undersides of both asymmetric rest sculpts.
const limbs = {
  2: [
    [[.064, -.046, .268], [.050, -.104, .326], [.054, -.124, .391],
      [[.010, -.117, .415], [.041, -.144, .463], [.084, -.143, .456], [.094, -.142, .410]]],
    [[.164, -.035, .234], [.193, -.066, .196], [.214, -.102, .189],
      [[.172, -.115, .184], [.199, -.134, .264], [.246, -.143, .246], [.270, -.132, .208]]],
    [[.063, -.020, -.090], [-.024, -.066, -.115], [.004, -.135, -.082],
      [[-.010, -.167, -.024], [.039, -.168, -.032], [.054, -.153, -.074]]],
    [[.089, -.028, -.178], [.119, -.027, -.226], [.087, -.067, -.273],
      [[.061, -.077, -.272], [.082, -.091, -.228], [.121, -.102, -.241], [.128, -.063, -.301]]],
  ],
  3: [
    [[-.045, -.031, .278], [-.080, -.066, .351], [-.087, -.077, .424],
      [[-.143, -.089, .472], [-.080, -.106, .486], [-.032, -.109, .459]]],
    [[.054, -.030, .252], [.105, -.062, .281], [.111, -.086, .327],
      [[.059, -.104, .385], [.121, -.111, .395], [.169, -.116, .370]]],
    [[.044, -.026, -.102], [.038, -.077, -.071], [.023, -.139, -.037],
      [[-.047, -.170, .020], [.024, -.181, .041], [.053, -.179, .010]]],
    [[.091, -.028, -.119], [.132, -.057, -.162], [.142, -.106, -.204],
      [[.091, -.143, -.158], [.152, -.145, -.146], [.211, -.140, -.180]]],
  ],
};

function closestOnBone(point, root, bone, lengthSquared, scratch) {
  const progress = clamp(scratch.subVectors(point, root).dot(bone) / lengthSquared, 0, 1);
  return { progress, distance: scratch.copy(root).addScaledVector(bone, progress).distanceTo(point) };
}

function digitBinding(tip, palm, forward) {
  const endpoint = new Vector3(...tip);
  const direction = endpoint.clone().sub(palm);
  const root = palm.clone().addScaledVector(direction, .23);
  const bone = direction.multiplyScalar(.77);
  const axis = new Vector3(bone.z, 0, -bone.x).normalize();
  const spread = clamp((forward.z * bone.x - forward.x * bone.z) / .035, -1, 1);
  return { root, bone, axis, spread, length: bone.x * bone.x + bone.z * bone.z,
    endpoint, vertex: null, vertexDistance: Infinity, posedRoot: new Vector3(), turn: new Quaternion() };
}

function interpolateRotation(out, a, b, weight) {
  const sign = a.dot(b) < 0 ? -1 : 1;
  const first = 1 - weight;
  const second = weight * sign;
  return out.set(
    first * a.x + second * b.x, first * a.y + second * b.y,
    first * a.z + second * b.z, first * a.w + second * b.w,
  ).normalize();
}

/** Shoulder, hock, and original phalanges for the two unskinned forms. */
export class FormLimbs {
  constructor(stage) {
    this.stage = stage;
    this.legs = limbs[stage].map(([start, middle, end, tips], index) => {
      const root = new Vector3(...start);
      const elbow = new Vector3(...middle);
      const palm = new Vector3(...end);
      const upper = elbow.clone().sub(root);
      const lower = palm.clone().sub(elbow);
      const forward = tips.reduce((sum, tip) => sum.add(new Vector3(...tip).sub(palm)), new Vector3());
      forward.y = 0;
      forward.normalize();
      return {
        root, elbow, palm, forward, upper, lower, upperLength: upper.lengthSq(), lowerLength: lower.lengthSq(),
        elbowAxis: upper.clone().normalize().add(lower.clone().normalize()).normalize(),
        wristAxis: lower.clone().normalize(),
        shoulderTravel: new Vector3(), posedRoot: new Vector3(), posedElbow: new Vector3(), posedPalm: new Vector3(),
        digits: tips.map(tip => digitBinding(tip, palm, forward)),
        reach: 0, close: 0, flinch: 0, guard: 0, press: 0,
        hook: stage === 3 && index < 2 ? {
          ready: false, bound: false, reach: 0, digit: -1,
          palm: new Vector3(), wrist: new Quaternion(),
          bendAxis: new Vector3(), bendPole: new Vector3(),
          upperBind: new Quaternion(), lowerBind: new Quaternion(),
          tipToPalm: new Vector3(), toeTurn: new Quaternion(),
          secondDigit: -1, secondTurn: new Quaternion(),
          releaseOffset: new Vector3(), releaseWrist: new Quaternion(), poleAngle: null,
        } : null,
        digitCeiling: Math.max(palm.y + .051, ...tips.map(tip => tip[1] + .030)),
        frame: new Float64Array(12), anchor: .5 - root.z, side: index % 2 ? 1 : -1, rear: index >= 2,
        upperRotation: new Matrix3(), lowerRotation: new Matrix3(), socketRotation: new Matrix3(),
        upperOffset: new Vector3(), lowerOffset: new Vector3(),
        upperOrientation: new Quaternion(), lowerOrientation: new Quaternion(), wristTurn: new Quaternion(),
      };
    });
    this.euler = new Euler(0, 0, 0, 'ZXY');
    this.rotation = new Matrix4();
    this.shoulder = new Quaternion();
    this.forearm = new Quaternion();
    this.claw = new Quaternion();
    this.spread = new Quaternion();
    this.up = new Vector3(0, 1, 0);
    this.point = new Vector3();
    this.normal = new Vector3();
    this.blend = new Quaternion();
    this.inverse = new Quaternion();
    this.socket = new Vector3();
    this.scratch = new Vector3();
    this.wrist = new Quaternion();
    this.swing = new Quaternion();
    this.identity = new Quaternion();
    this.contact = new Vector3();
    this.contactWeight = 0;
    this.contactRadius = .43;
    this.goal = new Vector3();
    this.direction = new Vector3();
    this.goalElbow = new Vector3();
    this.animatedElbow = new Vector3();
    this.animatedWrist = new Vector3();
    this.pole = new Vector3();
    this.axis = new Vector3();
    this.foldedPalm = new Vector3();
    this.hockBeat = {};
    this.hookPoint = new Vector3();
    this.hookAxis = new Vector3();
    this.hookRoll = new Quaternion();
    this.hookTwist = new Quaternion();
    this.secondRoot = new Vector3();
    this.secondTip = new Vector3();
    this.secondDirection = new Vector3();
    this.secondPoint = new Vector3();
    this.secondTarget = new Quaternion();
    this.previousAxis = new Vector3();
    this.transportedPole = new Vector3();
    this.boneBasis = new Quaternion();
    this.bendNormal = new Vector3();
    this.boneUp = new Vector3();
    this.solvedLower = new Vector3();
    this.frameRotation = new Quaternion();
    this.frameRight = new Vector3();
    this.frameUp = new Vector3();
    this.frameForward = new Vector3();
    this.hindCenter = (this.legs[2].anchor + this.legs[3].anchor) * .5;
    this.leadSide = 1;
  }

  shoulderWeight(leg, x, y, z) {
    const root = leg.root;
    const distance = Math.hypot((x - root.x) / .122, (y - root.y) / .136, (z - root.z) / .13);
    return 1 - smoothstep(distance, .24, 1.1);
  }

  bind(x, y, z, out, offset) {
    if (y > 0) return;
    this.point.set(x, y, z);
    let best = 0;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const a = closestOnBone(this.point, leg.root, leg.upper, leg.upperLength, this.scratch);
      const b = closestOnBone(this.point, leg.elbow, leg.lower, leg.lowerLength, this.scratch);
      const distance = Math.min(a.distance, b.distance);
      const between = smoothstep(a.distance - b.distance, -.026, .026);
      const progress = lerp(a.progress, 1 + b.progress, between);
      const elbowDepth = this.scratch.subVectors(this.point, leg.elbow).dot(leg.elbowAxis);
      const wristDepth = this.scratch.subVectors(this.point, leg.palm).dot(leg.wristAxis);
      let digitIndex = 0, digitWeight = 0, palmWeight = 0;
      let nearest = Infinity;
      for (let j = 0; j < leg.digits.length; j++) {
        const digit = leg.digits[j];
        const dx = x - digit.root.x, dz = z - digit.root.z;
        const along = clamp((dx * digit.bone.x + dz * digit.bone.z) / digit.length, 0, 1);
        const distance = Math.hypot(dx - along * digit.bone.x, dz - along * digit.bone.z);
        if (distance >= nearest) continue;
        nearest = distance;
        digitIndex = j;
        palmWeight = (1 - smoothstep(distance, .015, .029)) *
          smoothstep(along, 0, .27) * (1 - smoothstep(y, leg.digitCeiling - .012, leg.digitCeiling));
        digitWeight = palmWeight * smoothstep(along, .06, .72);
      }
      const depth = -y + leg.root.y;
      // Spread the socket transition along the upper arm. The palm and
      // toes still use their own tight anchors farther from the chest.
      const shaftWeight = (1 - smoothstep(distance, .021, .074)) *
        smoothstep(progress, .04, .84) * smoothstep(depth, -.023, .050);
      const weight = Math.max(shaftWeight, palmWeight);
      if (weight <= best) continue;
      best = weight;
      out[offset] = i;
      out[offset + 1] = weight;
      // A closest-segment switch is discontinuous in the curved elbow.
      // Signed distance to its bisector keeps neighboring vertices together.
      out[offset + 2] = Math.max(palmWeight, smoothstep(elbowDepth, -.024, .028));
      out[offset + 3] = digitIndex;
      out[offset + 4] = digitWeight;
      out[offset + 5] = Math.max(palmWeight, smoothstep(wristDepth, -.027, .008));
    }
  }

  update(motion, dt = 0, contact = null, scale = 1, spine = null, surface = null, actorRoot = null) {
    const { air = 0, drive = 0, surge = 0, phase = 0, lift = 0, turn = 0, recoil = 0, change = 0,
      anticipate = 0, strike = 0, grip = 0, aimYaw = 0, targetDistance = Infinity,
      attackKind = null, attackAge = -1, contactAge = -1, chestLoad = 0, hipPush = 0, morph = 1,
      contactLead = 0, clawSide = null, flinch = 0, flinchSide = 0,
    } = motion;
    if (contact) {
      this.contact.copy(contact);
      this.contactRadius = Math.max(0, motion.contactTarget?.radius ?? .43) / scale;
    }
    const near = contact ? 1 - smoothstep(targetDistance, 2.45, 4.2) : 0;
    this.contactWeight = lerp(this.contactWeight, near, dt > 0 ? -Math.expm1(-dt * 22) : 1);
    const locomotion = 1 - .78 * Math.max(anticipate, strike, grip);
    const closeClaw = attackKind === 'claw';
    const casting = attackKind === 'shoot';
    const aimingAttack = casting || closeClaw;
    const castAge = motion.castAge ?? (casting ? attackAge : Infinity);
    const castStrength = clamp(motion.castStrength ?? .58 + .42 * strike, .45, 1);
    if (closeClaw && (clawSide === -1 || clawSide === 1)) this.leadSide = clawSide;
    else if (!aimingAttack || attackAge <= dt * 1.5) this.leadSide = aimYaw < -.035 ? -1 : 1;
    const water = this.stage === 2;
    const waterStrike = water && closeClaw;
    const engaged = aimingAttack ? this.contactWeight : 0;
    const readable = smoothstep(motion.length ?? 0, 12, 28);
    const hip = (spine?.hipStation ?? 0) * scale;
    const rearAttack = motion.bodyBeats?.findLast(impulse => impulse.kind === 'claw' || impulse.kind === 'shoot');
    const hipsLoaded = hip > 0 && (chestLoad > .01 || rearAttack !== undefined);
    const poisedAge = attackAge + (closeClaw ? .066 : .064 * contactLead);
    const unhook = waterStrike ? smoothstep(contactAge, .003, .089) : 0;
    const lowSweep = waterStrike ? beat(attackAge, -.138, -.041, .101, .284) * engaged : 0;
    const highHook = beat(poisedAge, -.027, .049, .087, .204) * engaged;
    const raisedClaw = closeClaw ? beat(attackAge, -.116, -.066, -.049, -.012) * engaged : 0;
    const clawFall = closeClaw
      ? (waterStrike ? beat(attackAge, -.094, -.025, .031, .148) * (1 - unhook)
        : beat(attackAge, -.063, -.006, .031, .148)) * engaged
      : 0;
    const waterShoulder = waterStrike
      ? beat(attackAge, -.091, -.030, .046, .152) * engaged * (1 - unhook)
      : 0;
    const draw = beat(contactAge, .024, .143, .185, .320) * engaged;
    const brace = beat(poisedAge, -.026, .066, .212, .351) * engaged;
    const hockDrive = engaged * (water
      ? beat(poisedAge, -.026, .095, .166, .305)
      : beat(poisedAge, -.030, .037, .082, .186));
    const hockReclaim = engaged * (water
      ? beat(attackAge, .154, .240, .282, .434)
      : beat(attackAge, .082, .170, .242, .402));
    for (const leg of this.legs) {
      const leads = leg.side === this.leadSide;
      const swipe = leads && !leg.rear ? clawFall : 0;
      const latch = leg.hook;
      const hooking = latch && leads && closeClaw;
      if (latch && (!hooking || contactAge <= 0)) {
        latch.ready = false;
        latch.bound = false;
        latch.poleAngle = null;
        latch.secondDigit = -1;
        latch.secondTurn.identity();
      }
      const contactDigit = hooking ? leg.digits[surface?.digit] : null;
      if (hooking && latch.ready && !latch.bound && surface?.point && contactDigit?.vertex) {
        const { mesh, index } = contactDigit.vertex;
        const tip = this.scratch.fromBufferAttribute(mesh.geometry.attributes.position, index);
        latch.tipToPalm.copy(latch.palm).sub(tip);
        const wrist = this.swing.copy(leg.wristTurn).multiply(leg.lowerOrientation);
        latch.toeTurn.copy(wrist).invert().multiply(contactDigit.turn).multiply(wrist);
        latch.bound = true;
        latch.digit = surface.digit;
      }
      const releaseAge = contactAge - clawHoldSeconds;
      const releasing = hooking && latch.bound && releaseAge > 0;
      const hold = hooking && latch.bound && contactAge > 0 && !releasing ? 1 : 0;
      const releaseProgress = releasing ? smoothstep(releaseAge, 0, .185) : 0;
      const withdrawal = releasing ? 0 : draw * (1 - hold);
      const hipSide = rearAttack?.side ?? this.leadSide;
      const powerHock = water ? leg.side !== hipSide : leg.side === hipSide;
      // A new water leg opens from its socket, then rolls out the wrist
      // and uncurls the digits. The two sides follow in quick succession.
      const emergenceDelay = water && leg.side < 0 ? .073 : 0;
      const tucked = water
        ? 1 - smoothstep(morph, (leg.rear ? .41 : .16) + emergenceDelay, leg.rear ? .999 : .87 + emergenceDelay)
        : 1 - smoothstep(morph, leg.rear ? .28 : .10, leg.rear ? .94 : .71);
      const curled = water
        ? 1 - smoothstep(morph, (leg.rear ? .56 : .35) + emergenceDelay, leg.rear ? 1 : .92 + emergenceDelay)
        : tucked;
      let reachGoal = leg.rear || closeClaw ? strike : 0;
      let closeGoal = leg.rear || closeClaw ? grip : 0;
      if (!leg.rear) {
        const age = castAge - (leads ? 0 : water ? .048 : .039);
        const hasCast = !closeClaw && Number.isFinite(age);
        const gather = hasCast ? beat(age, -.266, -.101, -.007, .103) * (.80 + .20 * castStrength) : 0;
        const push = hasCast ? beat(age, -.009, water ? .098 : .074, water ? .143 : .119,
          water ? .311 : .278) * (.66 + .34 * castStrength) : 0;
        leg.guard = lerp(leg.guard, gather, dt > 0 ? -Math.expm1(-dt * 21) : 1);
        leg.press = lerp(leg.press, push, dt > 0 ? -Math.expm1(-dt * 36) : 1);
      }
      const guard = leg.rear || closeClaw ? 0 : leg.guard;
      const press = leg.rear || closeClaw ? 0 : leg.press;
      const localHock = leg.rear && hipsLoaded;
      if (localHock) {
        // The hip wave reaches a long body after the head has already closed
        // its claw. Sample the same moving frame as the attached rear leg.
        const station = hip + (leg.anchor - this.hindCenter) * scale - (powerHock ? 0 : .66);
        const impulse = spineBeat(motion, this.stage, station, spine.collar, hip, motion.length, this.hockBeat);
        const drive = smoothstep(impulse.advance, .008, .27);
        const release = smoothstep(-impulse.advance, .014, .17);
        reachGoal = drive * (powerHock ? 1 : .76);
        closeGoal = clamp(.82 * chestLoad + .71 * release, 0, 1) * (1 - .91 * drive);
      } else if ((leg.rear || closeClaw) && engaged > .001) {
        if (leg.rear) {
          // Jiaolong drives through the diagonal. Qiulong's leading hip
          // throws the shorter, earlier kick and loads back under the claw.
          reachGoal = Math.max(strike * .13, hockDrive * (powerHock ? 1 : .37));
          closeGoal = hockReclaim * (powerHock ? .79 : 1);
        } else if (releasing) {
          reachGoal = latch.reach * (1 - releaseProgress);
          closeGoal = .78 * grip * (1 - smoothstep(releaseAge, .065, .228));
        } else if (leads) {
          reachGoal = water
            ? Math.max(.74 * strike, lowSweep) * (1 - .72 * unhook)
            : Math.max(.67 * strike * (1 - .84 * withdrawal), highHook, hold * (latch?.reach ?? 0));
          closeGoal = water ? .54 * grip : clamp((.73 + .18 * hold) * grip + .63 * withdrawal, 0, 1);
        } else {
          reachGoal = strike * (water ? .28 : .37);
          closeGoal = grip * (water ? .21 : .36);
        }
      }
      const follow = leg.rear ? (powerHock ? 54 : 24) : leads && (waterStrike || !water) ? 44 : leads ? 29 : 9;
      leg.reach = lerp(leg.reach, reachGoal, dt > 0 ? -Math.expm1(-dt * follow) : 1);
      leg.close = lerp(leg.close, closeGoal, dt > 0 ? -Math.expm1(-dt * (leads ? 31 : 12)) : 1);
      const reach = leg.reach, close = leg.close;
      // The side opposite the blow catches the chest first. Hocks fold
      // after the elbows and extend later through the signed rebound.
      const lean = flinchSide * leg.side;
      const response = flinch * (.82 + .18 * lean);
      const rate = leg.rear ? 13 : 29;
      leg.flinch = lerp(leg.flinch, response, dt > 0 ? -Math.expm1(-dt * rate) : 1);
      const fold = Math.max(leg.flinch, 0);
      const recover = Math.min(.58, Math.max(0, -leg.flinch) * 1.9);
      const wave = phase - (leg.rear ? 1.25 : .10) - leg.side * (this.stage === 2 ? 1.15 : .62);
      const stroke = Math.sin(wave);
      const recovery = smoothstep(Math.cos(wave), -.25, .85);
      const paddle = this.stage === 2 ? (1 - air) * drive * locomotion : 0;
      const fly = air * (.16 + .84 * drive) * locomotion;
      const climb = clamp(lift * .22, -.65, 1);
      const inside = turn * leg.side;
      const tuck = surge * .22 + recoil * .24 + change * .20;
      const load = leg.rear ? .14 * anticipate + .33 * reach - .17 * close
        : .33 * anticipate - .58 * reach + (water ? -.09 : .23) * close;
      const pitch = -.25 * paddle * stroke + fly * (.075 * stroke - (leg.rear ? .14 : .10))
        + climb * (leg.rear ? -.10 : .17) - tuck * (leg.rear ? .68 : 1) + load + .16 * tucked +
        (leg.rear ? -.19 : .37) * fold - .23 * recover + .19 * guard + .22 * press;
      const roll = leg.side * (-.12 * fly - .19 * paddle * recovery + tuck * .10 + inside * .13
        + (leg.rear ? -.10 * reach : .21 * anticipate + .17 * reach - .17 * close) +
        .16 * fold + .19 * recover + .37 * press);
      const bend = .22 * paddle * recovery + fly * (.11 + .095 * Math.sin(wave - .68))
        + tuck * .40 + inside * .08 + climb * (leg.rear ? -.14 : .14)
        + (leg.rear ? .38 * anticipate - .33 * reach + .36 * close
          : .40 * anticipate - .30 * reach + (water ? .32 : .48) * close) + .71 * tucked +
        (leg.rear ? .56 : .72) * fold - .33 * recover + .42 * guard - .29 * press;
      const reachYaw = leg.rear ? -.10 * aimYaw : aimYaw * (.30 * reach + .10 * close);
      this.shoulder.setFromEuler(this.euler.set(pitch, -inside * .07 + reachYaw, roll));
      this.forearm.setFromEuler(this.euler.set(bend, .025 * stroke * leg.side, leg.side * bend * .18));
      this.forearm.premultiply(this.shoulder);
      const contactWeight = this.contactWeight;
      const extend = Math.max(reach, close * (water ? .64 : .42));
      const lead = leads ? 1 : .54;

      leg.shoulderTravel.set(0, 0, 0);
      if (!leg.rear) {
        // The upper arm starts at the moving scapula. Chest skin carries a
        // softer copy of this motion, so the socket slides with the shoulder.
        leg.shoulderTravel.set(
          leg.side * (.012 * anticipate + (.011 + .021 * readable * engaged) * extend) + .024 * aimYaw * extend
            + .019 * flinchSide * fold + leg.side * .027 * press,
          .016 * anticipate + (water ? -.014 : .020) * extend - .020 * fold - .018 * press,
          -.031 * anticipate + (.031 + .100 * contactWeight * lead) * extend - .042 * withdrawal -
            .022 * fold - .022 * guard - .019 * press,
        );
        if (leads && waterShoulder > .001) {
          // Bring the short forelimb into line with the prey using the
          // existing shoulder excursion before the elbow straightens.
          this.targetInFrame(leg, this.goal).sub(leg.root);
          this.goal.y = 0;
          this.goal.normalize();
          const travel = (.031 + .100 * contactWeight) * extend;
          leg.shoulderTravel.x = lerp(leg.shoulderTravel.x, this.goal.x * travel, waterShoulder);
          leg.shoulderTravel.z = lerp(leg.shoulderTravel.z, this.goal.z * travel, waterShoulder);
        }
      }
      leg.posedRoot.copy(leg.root).add(leg.shoulderTravel);
      let wristAim = 0;
      if (fold + recover > .006 && !aimingAttack) {
        this.goal.copy(leg.palm);
        this.goal.x += leg.side * ((water ? .034 : .052) * fold + .059 * recover);
        this.goal.y += (leg.rear ? .081 : water ? .039 : .063) * fold - .084 * recover;
        this.goal.z += (leg.rear ? .063 : -.079) * fold + (leg.rear ? -.065 : .044) * recover;
        this.solve(leg, this.goal, Math.min(1, 1.27 * fold + recover));
      } else if (localHock) {
        // Load the supporting foot under the hip, then send the opposite
        // hock down and back. The supporting foot opens ahead of the hip
        // so the two feet stay separated in profile on the long body.
        const chain = Math.sqrt(leg.upperLength) + Math.sqrt(leg.lowerLength);
        this.goal.copy(leg.palm);
        this.foldedPalm.set(leg.side * .43, -.52, .62).normalize()
          .multiplyScalar(chain * .63).add(leg.posedRoot);
        this.goal.lerp(this.foldedPalm, close);
        this.foldedPalm.set(
          leg.side * (water ? .49 : .32),
          powerHock ? -.84 : -.72,
          powerHock ? (water ? -.61 : -.88) : .89,
        ).normalize().multiplyScalar(chain * (powerHock ? .984 : .84)).add(leg.posedRoot);
        this.goal.lerp(this.foldedPalm, reach);
        this.solve(leg, this.goal, smoothstep(Math.max(reach, close), .025, .44));
      } else if (leg.rear) {
        // Gather the feet ahead of the hocks, then drive the hip-to-foot
        // chain backwards. The opposite foot guards the belly.
        const push = clamp(reach * (1 - .81 * close) + hipPush * engaged * (powerHock ? .38 : .13), 0, 1);
        const gather = clamp(anticipate + .46 * chestLoad + .92 * close + tucked, 0, 1);
        const weight = clamp(Math.max(push, gather * .87) * (.47 + .53 * contactWeight) + .46 * tucked, 0, 1);
        if (weight > .001) {
          this.goal.copy(leg.palm);
          this.goal.x += leg.side * ((.031 + .031 * readable * engaged) * push + .015 * gather);
          this.goal.y += .077 * gather - (powerHock ? .124 : .065) * push;
          this.goal.z += .063 * gather - (water ? .193 : .227) * push;
          this.solve(leg, this.goal, weight);
        }
      } else if (guard + press > .006 && tucked <= .005) {
        // The ranged strike braces against water or air. Gather below the
        // collar and press down and aft from the shoulder as breath leaves.
        const span = Math.sqrt(leg.upperLength) + Math.sqrt(leg.lowerLength);
        this.goal.copy(leg.palm);
        this.foldedPalm.set(leg.side * .37, -.36, .43).normalize()
          .multiplyScalar(span * .62).add(leg.posedRoot);
        this.goal.lerp(this.foldedPalm, guard);
        this.foldedPalm.set(leg.side * (water ? .61 : .42), water ? -.79 : -.87, water ? -.48 : -.44)
          .normalize().multiplyScalar(span * .963).add(leg.posedRoot);
        this.goal.lerp(this.foldedPalm, press);
        this.solve(leg, this.goal, smoothstep(Math.max(guard, press), .015, .53));
      } else if (tucked > .005 || (closeClaw && engaged > .005 && !leads)) {
        // During the lunge the second paw stays out of the leading wrist's
        // path, serving as a brace. This is also the folded emerging pose.
        this.goal.copy(leg.palm);
        this.goal.x += leg.side * ((.056 + .025 * readable) * brace - .024 * tucked);
        this.goal.y += (water ? .053 : -.040) * brace + (water ? .115 : .094) * tucked;
        this.goal.z -= ((water ? .092 : .052) * brace + .102 * tucked);
        this.solve(leg, this.goal, Math.max((water ? .94 : .83) * tucked, .72 * brace));
      } else if (releasing) {
        // Carry the release arc with the shoulder. Interpolate the radius
        // separately so chest recoil cannot pull the forearm straight.
        const weight = 1 - smoothstep(releaseAge, .170, .260);
        if (weight > .001) {
          const span = Math.sqrt(leg.upperLength) + Math.sqrt(leg.lowerLength);
          const radius = lerp(latch.releaseOffset.length(), span * .76, releaseProgress);
          this.goal.copy(latch.releaseOffset).normalize();
          this.foldedPalm.set(leg.side * .74, -.65, -.15).normalize();
          this.swing.setFromUnitVectors(this.goal, this.foldedPalm).slerp(this.identity, 1 - releaseProgress);
          this.goal.applyQuaternion(this.swing).multiplyScalar(radius).add(leg.posedRoot);
          const poleWeight = 1 - smoothstep(releaseAge, .020, .229);
          this.solve(leg, this.goal, weight, latch, poleWeight);
        }
      } else if (hold > 0) {
        // The planted toe acts as a fulcrum while the palm lowers and the
        // other toes wrap around the rim. The palm offset shares the pivot.
        const lever = latch.tipToPalm;
        this.hookPoint.copy(latch.palm);
        this.hookRoll.identity();
        if (surface?.point) {
          this.hookAxis.set(lever.z, 0, -lever.x);
          if (this.hookAxis.lengthSq() > 1e-8) {
            const load = smoothstep(contactAge, .004, .092);
            this.hookRoll.setFromAxisAngle(this.hookAxis.normalize(), .57 * load);
            this.hookTwist.setFromAxisAngle(this.hookAxis.copy(lever).normalize(), -leg.side * .61 * load);
            this.hookRoll.multiply(this.hookTwist);
          }
          this.hookPoint.copy(lever).applyQuaternion(this.hookRoll).add(surface.point);
        }
        this.pointInFrame(leg, this.hookPoint, this.goal);
        if (surface?.point) this.followHookShoulder(leg, latch, dt, scale);
        wristAim = 1;
        this.solve(leg, this.goal, wristAim, latch, 1);
      } else if (closeClaw && contactWeight > .005 && extend > .006) {
        this.targetInFrame(leg, this.goal);
        // Stop the palm behind the target surface, leaving the tip of each
        // original claw free. The chain never grows to reach the target.
        this.axis.copy(this.goal).sub(leg.posedRoot).normalize();
        this.goal.addScaledVector(this.axis, -this.contactRadius - .041 + (waterStrike ? .041 : .023) * swipe);
        const spread = .011 + .034 * readable * engaged;
        // Lift above the bite in windup, then roll down over the target.
        // On the water sweep the forehand arcs out immediately after contact.
        this.goal.x += leg.side * (spread * (1 - swipe) - .014 * swipe + .053 * unhook);
        this.goal.y += (water ? .031 : .079) * raisedClaw - (water ? .010 : .006) * swipe - .012 * unhook;
        this.goal.z -= (water ? .047 : .018) * smoothstep(attackAge, .042, .155) + .072 * unhook;
        if (!water) {
          this.foldedPalm.copy(leg.palm);
          this.foldedPalm.x += leg.side * (.064 + .040 * readable);
          this.foldedPalm.y -= .013;
          this.foldedPalm.z -= .072;
          this.goal.lerp(this.foldedPalm, clamp(withdrawal * 1.18, 0, 1));
        }
        wristAim = Math.max(smoothstep(extend, .035, .62) * contactWeight, withdrawal);
        this.solve(leg, this.goal, wristAim);
      }

      leg.upperOrientation.copy(this.shoulder);
      leg.lowerOrientation.copy(this.forearm);
      leg.upperRotation.setFromMatrix4(this.rotation.makeRotationFromQuaternion(this.shoulder));
      leg.lowerRotation.setFromMatrix4(this.rotation.makeRotationFromQuaternion(this.forearm));
      leg.socketRotation.setFromMatrix4(this.rotation.makeRotationFromQuaternion(
        interpolateRotation(this.blend, this.identity, this.shoulder, .27)));
      leg.upperOffset.copy(leg.posedRoot).sub(this.scratch.copy(leg.root).applyMatrix3(leg.upperRotation));
      leg.posedElbow.copy(leg.elbow).applyMatrix3(leg.upperRotation).add(leg.upperOffset);
      leg.lowerOffset.copy(leg.posedElbow).sub(this.scratch.copy(leg.elbow).applyMatrix3(leg.lowerRotation));
      leg.posedPalm.copy(leg.palm).applyMatrix3(leg.lowerRotation).add(leg.lowerOffset);
      this.wrist.copy(this.forearm);
      if (wristAim > .001) {
        this.axis.copy(leg.forward).applyQuaternion(this.forearm).normalize();
        this.goalElbow.copy(this.direction);
        if (waterStrike && swipe > .001) {
          const toward = this.targetInFrame(leg, this.scratch).sub(leg.posedPalm).normalize();
          this.goalElbow.lerp(toward, swipe);
        }
        this.goalElbow.y -= (waterStrike ? -.12 : .27) * swipe + .19 * close;
        this.swing.setFromUnitVectors(this.axis, this.goalElbow.normalize()).slerp(this.identity,
          1 - .88 * wristAim * (1 - .52 * withdrawal));
        this.wrist.premultiply(this.swing);
        if (swipe > .001) {
          this.wrist.premultiply(this.swing.setFromAxisAngle(this.goalElbow, -.26 * swipe * leg.side));
        }
      }
      if (hold > 0) {
        this.wrist.copy(this.orientFrame(leg).invert().multiply(this.hookRoll).multiply(latch.wrist));
      } else if (releasing) {
        this.orientFrame(leg).invert().multiply(latch.releaseWrist);
        this.wrist.slerp(this.frameRotation, 1 - smoothstep(releaseAge, 0, .203));
      }
      if (hooking && contactAge === 0) {
        latch.ready = true;
        latch.reach = reach;
        const frame = this.orientFrame(leg);
        const axis = latch.bendAxis.subVectors(leg.posedPalm, leg.posedRoot).normalize();
        const pole = latch.bendPole.subVectors(leg.posedElbow, leg.posedRoot);
        pole.addScaledVector(axis, -pole.dot(axis)).normalize();
        this.bendNormal.crossVectors(axis, pole).normalize();
        const upper = this.scratch.subVectors(leg.posedElbow, leg.posedRoot).normalize();
        latch.upperBind.copy(this.orientBone(upper)).invert().multiply(this.shoulder);
        const lower = this.scratch.subVectors(leg.posedPalm, leg.posedElbow).normalize();
        latch.lowerBind.copy(this.orientBone(lower)).invert().multiply(this.forearm);
        pole.applyQuaternion(frame);
        axis.applyQuaternion(frame);
        latch.wrist.copy(frame.multiply(this.wrist));
      }
      if (hooking && latch.ready && (contactAge === 0 || hold > 0)) {
        this.pointFromFrame(leg, leg.posedPalm, latch.palm);
        latch.releaseOffset.subVectors(leg.posedPalm, leg.posedRoot);
        latch.releaseWrist.copy(this.orientFrame(leg).multiply(this.wrist));
      }
      if (guard + press > .004) {
        this.axis.set(1, 0, 0).applyQuaternion(this.forearm);
        this.wrist.premultiply(this.swing.setFromAxisAngle(this.axis, .40 * guard - .17 * press));
      }
      leg.wristTurn.copy(this.wrist).multiply(this.inverse.copy(this.forearm).invert());
      // The planted toe keeps its contact angle while the two free toes
      // close against it. Release the pinch as the wrist starts its exit arc.
      const toeHold = latch?.bound ? 1 - smoothstep(releaseAge, 0, .110) : 1;
      for (let index = 0; index < leg.digits.length; index++) {
        const digit = leg.digits[index];
        const planted = latch?.bound && index === latch.digit;
        const freeToe = latch?.bound && !planted;
        const outside = index === (leg.side > 0 ? 2 : 0);
        const pinch = freeToe ? smoothstep(contactAge, outside ? .025 : .006, outside ? .124 : .082) : 0;
        const toeClose = planted ? 0 : lerp(close, .93, pinch) * toeHold;
        const digitLoad = leg.rear ? .44 * close - (localHock ? .43 : .19) * reach + .32 * curled
          : (water ? .74 : 1.13) * toeClose - .29 * reach - .24 * anticipate +
            (water ? .66 : .55) * curled + .15 * swipe * (1 - .63 * toeClose) + .16 * guard - .18 * press;
        const clench = (leg.rear ? .48 : .74) * fold - .43 * recover;
        const opening = (leg.rear ? .12 : .27) * (.62 * anticipate + .7 * reach) -
          (water ? .14 : .27) * toeClose - .14 * curled - .16 * fold + .22 * recover +
          (localHock ? .13 * reach : 0) + .16 * press - .18 * pinch * toeHold;
        const curl = (digitLoad + clench) * lerp(.82, 1, index / Math.max(1, leg.digits.length - 1))
          + .095 * paddle * recovery + .048 * fly * Math.sin(wave - .91 - index * .15);
        this.spread.setFromAxisAngle(this.up, digit.spread * opening);
        this.claw.setFromAxisAngle(digit.axis, curl).premultiply(this.spread);
        if (planted) this.claw.slerp(latch.toeTurn, toeHold);
        this.claw.premultiply(this.wrist);
        digit.turn.copy(this.claw).multiply(this.inverse.copy(this.wrist).invert());
        digit.posedRoot.copy(digit.root).sub(leg.palm).applyQuaternion(this.wrist).add(leg.posedPalm);
      }
      if (hooking && latch.bound && actorRoot) {
        this.poseSecondaryGrip(leg, latch, actorRoot, hold && surface?.grip, contactAge, releaseAge, dt);
      }
    }
  }

  poseSecondaryGrip(leg, latch, actorRoot, grip, contactAge, releaseAge, dt) {
    const target = this.secondTarget.identity();
    let selected = latch.secondDigit;
    let face = -1;
    let alignment = -Infinity;
    if (grip) {
      const reach = smoothstep(contactAge, .014, .115);
      const angle = .14 + .66 * reach;
      for (const [index, digit] of leg.digits.entries()) {
        if (index === latch.digit || !digit.contactTip || (latch.secondDigit >= 0 && index !== latch.secondDigit)) continue;
        const direction = this.secondDirection.copy(digit.contactTip).sub(digit.root)
          .applyQuaternion(this.wrist).applyQuaternion(digit.turn);
        this.pointFromFrame(leg, digit.posedRoot, this.secondRoot);
        this.pointFromFrame(leg, this.secondTip.copy(digit.posedRoot).add(direction), this.secondTip);
        actorRoot.localToWorld(this.secondRoot);
        actorRoot.localToWorld(this.secondTip).sub(this.secondRoot);
        const radius = this.secondTip.length();
        if (radius < 1e-6) continue;
        this.secondTip.divideScalar(radius);
        const solution = grip.secondaryPoint(this.secondRoot, radius, this.secondTip, angle);
        if (!solution) continue;
        const score = this.secondTip.dot(this.goalElbow.subVectors(solution.point, this.secondRoot)) / radius;
        if (score <= alignment) continue;
        alignment = score;
        face = solution.face;
        this.secondPoint.copy(solution.point);
        const point = actorRoot.worldToLocal(this.secondRoot.copy(solution.point));
        this.pointInFrame(leg, point, this.secondTip).sub(digit.posedRoot).normalize();
        target.setFromUnitVectors(direction.normalize(), this.secondTip);
        selected = index;
      }
    }
    latch.secondDigit = selected;
    if (selected < 0) return;
    if (face >= 0) grip.rememberSecondary(face, this.secondPoint);
    const weight = 1 - smoothstep(releaseAge, 0, .095);
    if (dt > 0 && grip) latch.secondTurn.rotateTowards(target, 9.3 * dt);
    const correction = this.swing.copy(this.identity).slerp(latch.secondTurn, weight);
    leg.digits[latch.secondDigit].turn.premultiply(correction);
  }

  targetInFrame(leg, out) {
    return this.pointInFrame(leg, this.contact, out);
  }

  pointInFrame(leg, point, out) {
    const f = leg.frame;
    const x = point.x - f[0], y = point.y - f[1], z = point.z - f[2];
    return out.set(
      f[6] * x + f[7] * y + f[8] * z,
      f[9] * x + f[10] * y + f[11] * z,
      .5 - leg.anchor - (f[3] * x + f[4] * y + f[5] * z),
    );
  }

  pointFromFrame(leg, point, out) {
    const f = leg.frame, x = point.x, y = point.y, d = .5 - leg.anchor - point.z;
    return out.set(
      f[0] + f[6] * x + f[9] * y + f[3] * d,
      f[1] + f[7] * x + f[10] * y + f[4] * d,
      f[2] + f[8] * x + f[11] * y + f[5] * d,
    );
  }

  orientFrame(leg) {
    const f = leg.frame;
    return this.frameRotation.setFromRotationMatrix(this.rotation.makeBasis(
      this.frameRight.fromArray(f, 6), this.frameUp.fromArray(f, 9),
      this.frameForward.fromArray(f, 3).negate(),
    ));
  }

  orientBone(axis) {
    this.boneUp.crossVectors(axis, this.bendNormal).normalize();
    return this.boneBasis.setFromRotationMatrix(this.rotation.makeBasis(this.bendNormal, this.boneUp, axis));
  }

  alignBone(rotation, rest, axis, bind, weight) {
    if (weight < 1) {
      this.axis.copy(rest).applyQuaternion(rotation).normalize();
      rotation.premultiply(this.swing.setFromUnitVectors(this.axis, axis));
    }
    if (weight > 0) rotation.slerp(this.orientBone(axis).multiply(bind), weight);
  }

  followHookShoulder(leg, latch, dt, scale) {
    // Let the scapula give way when the chest crosses the planted wrist.
    // The smallest correction keeps the arm out of a sudden fold and snap.
    const previous = this.previousAxis.copy(latch.bendAxis).applyQuaternion(this.orientFrame(leg).invert());
    const direction = this.axis.subVectors(this.goal, leg.posedRoot);
    const naturalReach = direction.length();
    if (naturalReach > 1e-6) direction.divideScalar(naturalReach);
    else direction.copy(previous);
    const turn = Math.acos(clamp(previous.dot(direction), -1, 1));
    const step = dt > 0 ? dt : 1 / 30;
    const turnLimit = 24 * step;
    if (turn > turnLimit) {
      this.swing.setFromUnitVectors(previous, direction).slerp(this.identity, 1 - turnLimit / turn);
      direction.copy(previous).applyQuaternion(this.swing);
    }
    const span = Math.sqrt(leg.upperLength) + Math.sqrt(leg.lowerLength);
    const expansion = Math.max(0, naturalReach - latch.releaseOffset.length() - 3.3 * step / scale);
    const reach = Math.max(.34 * span, naturalReach - expansion * smoothstep(turn, .26, .91));
    const correction = this.scratch.copy(this.goal).addScaledVector(direction, -reach)
      .sub(leg.posedRoot).clampLength(0, .24 / scale);
    leg.posedRoot.add(correction);
    leg.shoulderTravel.add(correction);
  }

  solve(leg, target, weight, latch = null, poleWeight = 0) {
    const root = leg.posedRoot;
    this.animatedElbow.copy(leg.upper).applyQuaternion(this.shoulder).add(root);
    this.animatedWrist.copy(leg.lower).applyQuaternion(this.forearm).add(this.animatedElbow);
    this.direction.copy(this.animatedWrist).lerp(target, weight).sub(root);
    const distance = this.direction.length();
    if (distance < .001) return;
    this.direction.multiplyScalar(1 / distance);

    // Use the animated elbow as the pole. Both solved segment lengths are
    // fixed even if the target is beyond the reach of the hand.
    const upper = Math.sqrt(leg.upperLength), lower = Math.sqrt(leg.lowerLength);
    const reach = clamp(distance, Math.abs(upper - lower) + .001, upper + lower - .0015);
    const along = (leg.upperLength - leg.lowerLength + reach * reach) / (2 * reach);
    const height = Math.sqrt(Math.max(0, leg.upperLength - along * along));
    this.pole.copy(this.animatedElbow).sub(root);
    // During an anchored release, carry the natural bend plane from its
    // own wrist axis before mixing it with the plane from the last pose.
    const poleAxis = latch ? this.axis.subVectors(this.animatedWrist, root).normalize() : this.direction;
    this.pole.addScaledVector(poleAxis, -this.pole.dot(poleAxis));
    if (this.pole.lengthSq() < 1e-6) {
      this.pole.set(leg.side * .42, -1, 0);
      this.pole.addScaledVector(poleAxis, -this.pole.dot(poleAxis));
    }
    if (latch) this.pole.applyQuaternion(this.swing.setFromUnitVectors(poleAxis, this.direction));
    if (latch && poleWeight > 0) {
      // Carry the elbow plane along the wrist axis with the smallest
      // rotation. Reprojecting an old elbow point can flip across the axis.
      const frame = this.orientFrame(leg);
      const inverse = this.inverse.copy(frame).invert();
      this.previousAxis.copy(latch.bendAxis).applyQuaternion(inverse);
      const carried = this.transportedPole.copy(latch.bendPole).applyQuaternion(inverse)
        .applyQuaternion(this.swing.setFromUnitVectors(this.previousAxis, this.direction));
      carried.addScaledVector(this.direction, -carried.dot(this.direction)).normalize();
      latch.bendAxis.copy(this.direction).applyQuaternion(frame);
      latch.bendPole.copy(carried).applyQuaternion(frame);

      if (poleWeight === 1) {
        this.pole.copy(carried);
      } else {
        this.pole.normalize();
        const cosine = this.pole.dot(carried);
        const sine = this.direction.dot(this.axis.crossVectors(this.pole, carried));
        let angle = Math.atan2(sine, cosine);
        if (latch.poleAngle === null && cosine < -.985) angle = leg.side * Math.PI;
        if (latch.poleAngle !== null) {
          angle += 2 * Math.PI * Math.round((latch.poleAngle - angle) / (2 * Math.PI));
        }
        latch.poleAngle = angle;
        this.pole.applyAxisAngle(this.direction, angle * poleWeight);
      }
    }
    this.goalElbow.copy(this.direction).multiplyScalar(along).addScaledVector(this.pole.normalize(), height);
    this.solvedLower.copy(this.direction).multiplyScalar(reach).sub(this.goalElbow).normalize();
    if (latch) this.bendNormal.crossVectors(this.direction, this.pole).normalize();
    // A hooked bone keeps the twist it had on impact, measured relative
    // to the whole bend plane. Both release rotations keep its solved axis.
    this.alignBone(this.shoulder, leg.upper, this.goalElbow.normalize(), latch?.upperBind, poleWeight);
    this.alignBone(this.forearm, leg.lower, this.solvedLower, latch?.lowerBind, poleWeight);
  }

  socketDelta(leg, x, y, z) {
    const offset = this.scratch.set(x, y, z).sub(leg.root);
    const motion = this.socket.copy(offset).applyMatrix3(leg.socketRotation).sub(offset).add(leg.shoulderTravel);
    const frame = leg.frame;
    const { x: dx, y: dy, z: dz } = motion;
    return motion.set(
      frame[6] * dx + frame[9] * dy - frame[3] * dz,
      frame[7] * dx + frame[10] * dy - frame[4] * dz,
      frame[8] * dx + frame[11] * dy - frame[5] * dz,
    );
  }

  pose(leg, lowerWeight, digitIndex, digitWeight, palmWeight, x, y, z, nx, ny, nz) {
    this.point.set(x, y, z);
    this.normal.set(nx, ny, nz);
    if (lowerWeight === 0) {
      this.point.applyMatrix3(leg.upperRotation).add(leg.upperOffset);
      this.normal.applyMatrix3(leg.upperRotation);
    } else if (lowerWeight === 1) {
      this.point.applyMatrix3(leg.lowerRotation).add(leg.lowerOffset);
      this.normal.applyMatrix3(leg.lowerRotation);
    } else {
      // Both bones meet at the same posed elbow. Interpolating the
      // orientation about that joint retains the section through the bend.
      const rotation = interpolateRotation(this.blend, leg.upperOrientation, leg.lowerOrientation, lowerWeight);
      this.point.sub(leg.elbow).applyQuaternion(rotation).add(leg.posedElbow);
      this.normal.applyQuaternion(rotation);
    }
    if (palmWeight > 0 && lowerWeight > 0) {
      const rotation = interpolateRotation(this.blend, this.identity, leg.wristTurn, palmWeight * lowerWeight);
      this.point.sub(leg.posedPalm).applyQuaternion(rotation).add(leg.posedPalm);
      this.normal.applyQuaternion(rotation);
    }
    if (digitWeight > 0 && lowerWeight > 0) {
      const digit = leg.digits[digitIndex];
      const rotation = interpolateRotation(this.blend, this.identity, digit.turn, digitWeight * lowerWeight);
      this.point.sub(digit.posedRoot).applyQuaternion(rotation).add(digit.posedRoot);
      this.normal.applyQuaternion(rotation);
    }
  }
}
