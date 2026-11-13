import { MathUtils, Quaternion, Vector3 } from 'three';
import { flightStroke } from './flight-stroke.js';

const { clamp, lerp, smoothstep } = MathUtils;
const lateral = new Vector3(1, 0, 0);
const up = new Vector3(0, 1, 0);
const forward = new Vector3(0, 0, 1);

function joint(skeleton, name) {
  const bone = skeleton.getBoneByName(name);
  return { bone, position: bone.position.clone(), rotation: bone.quaternion.clone() };
}

/** Preserve baked skinning while adding load and recovery at the existing joints. */
export class FlightLimbs {
  constructor(skeleton) {
    this.shoulderSpine = ['DEF_body_04', 'DEF_body_05', 'DEF_body_07'].map(name => joint(skeleton, name));
    this.legs = ['fore', 'hind'].flatMap(kind => ['L', 'R'].map(side => {
      const prefix = 'DEF_' + kind + '_';
      const joints = ['01_1', '01_2', '02_1', '02_2', 'paw'].map(key =>
        joint(skeleton, prefix + key + side));
      const toes = [1, 2, 3, 4].map(index => {
        const bone = skeleton.getBoneByName(prefix + 'toe_' + index + side);
        return { bone, rest: bone.quaternion.clone(), index };
      });
      return { joints, toes, rear: kind === 'hind', side: side === 'L' ? -1 : 1 };
    }));
    this.wings = ['L', 'R'].map(side => ({
      side: side === 'L' ? -1 : 1,
      joints: ['socket', '01', '02', '03'].map(key => joint(skeleton, 'DEF_wing_' + key + side)),
    }));
    this.axis = new Vector3();
    this.pivot = new Vector3();
    this.parentInverse = new Quaternion();
    this.rotation = new Quaternion();
    this.trunkRotation = new Quaternion();
    this.trunkPosition = new Vector3();
    this.stroke = {};
    this.legStroke = {};
    this.terminalStroke = {};
  }

  restore() {
    for (const { bone, position, rotation } of this.shoulderSpine) {
      bone.position.copy(position);
      bone.quaternion.copy(rotation);
    }
    for (const { joints } of this.wings) {
      for (const { bone, position, rotation } of joints) {
        bone.position.copy(position);
        bone.quaternion.copy(rotation);
      }
    }
    for (const { joints, toes } of this.legs) {
      for (const { bone, position, rotation } of joints) {
        bone.position.copy(position);
        bone.quaternion.copy(rotation);
      }
      for (const { bone, rest } of toes) bone.quaternion.copy(rest);
    }
  }

  rotateInModel(bone, axis, angle) {
    bone.parent.getWorldQuaternion(this.parentInverse).invert();
    this.axis.copy(axis).applyQuaternion(this.parentInverse);
    bone.quaternion.premultiply(this.rotation.setFromAxisAngle(this.axis, angle));
  }

  bankShoulders(steer, flare) {
    for (const { bone, position, rotation } of this.shoulderSpine) {
      position.copy(bone.position);
      rotation.copy(bone.quaternion);
    }
    if (Math.abs(steer) < 1e-5 && flare < 1e-5) return;
    const shoulderBase = this.shoulderSpine[0].bone;
    const shoulderCenter = this.shoulderSpine[1].bone;
    const trunk = this.shoulderSpine[2].bone;
    // Local chest torsion loads the wing and foreleg sockets. Keep the longer
    // trunk on its existing flight path so the waist and tail do not snap.
    trunk.getWorldPosition(this.trunkPosition);
    trunk.getWorldQuaternion(this.trunkRotation);
    this.rotateInModel(shoulderBase, forward, -.07 * steer);
    this.rotateInModel(shoulderCenter, forward, -.12 * steer);
    // As the open wing takes the load, bring the shoulder up and back
    // while the remaining body keeps the guided flight path.
    if (flare > 0) {
      shoulderBase.parent.getWorldQuaternion(this.parentInverse).invert();
      this.axis.set(0, .014, -.009).applyQuaternion(this.parentInverse);
      shoulderBase.position.addScaledVector(this.axis, flare);
      shoulderCenter.parent.getWorldQuaternion(this.parentInverse).invert();
      this.axis.set(0, .024, -.012).applyQuaternion(this.parentInverse);
      shoulderCenter.position.addScaledVector(this.axis, flare);
    }
    trunk.position.copy(trunk.parent.worldToLocal(this.trunkPosition));
    trunk.parent.getWorldQuaternion(this.parentInverse).invert();
    trunk.quaternion.copy(this.parentInverse).multiply(this.trunkRotation);
  }

  flexLeg(joints, first, axis, angle) {
    this.axis.copy(axis).applyQuaternion(this.parentInverse);
    this.rotation.setFromAxisAngle(this.axis, angle);
    this.pivot.copy(joints[first].bone.position);
    // The five baked deform joints share a parent. Moving each distal joint
    // about the chosen hinge keeps the segments linked as their weights blend.
    for (let i = first; i < joints.length; i++) {
      const { bone } = joints[i];
      bone.position.sub(this.pivot).applyQuaternion(this.rotation).add(this.pivot);
      bone.quaternion.premultiply(this.rotation);
    }
  }

  update({
    phase, wingPhase, wingStroke, wingPower, lift, drive, turn, change,
    anticipate = 0, strike = 0, grip = 0, settle = 0, morph = 1, arrival = 0,
  }, terminal) {
    const stroke = wingStroke ?? flightStroke(wingPhase, this.stroke);
    const { blend, hold, gather, release, flare, letDown } = terminal;
    const live = 1 - blend;
    const steer = clamp(turn * 1.18, -.84, .84) * live;
    const load = lerp(stroke.load, terminal.load, blend);
    const recover = lerp(stroke.recover, terminal.recover, blend);
    const steeringLoad = .34 + .66 * load;
    const climb = clamp(lift / 3, -.8, 1);
    const beatStrength = lerp(.31 + wingPower * .69, .84, blend) * (1 - hold * .8);
    const breath = Math.sin(phase * .79);
    const brakeStroke = blend * (.78 + .22 * smoothstep(arrival, .14, .48)
      - .50 * smoothstep(arrival, .66, .98));
    const brakeStagger = .17 * (1 - .63 * smoothstep(arrival, .62, .96));
    this.bankShoulders(steer, flare);
    for (const { side, joints } of this.wings) {
      for (const { bone, rotation, position } of joints) {
        rotation.copy(bone.quaternion);
        position.copy(bone.position);
      }
      const socket = joints[0].bone, shoulder = joints[1].bone;
      const elbow = joints[2].bone, wrist = joints[3].bone;
      const inside = steer * side;
      const tuck = Math.max(0, inside);
      // The new wing clears the shoulder before the primaries fan open.
      const wingDelay = side < 0 ? .084 : 0;
      const folded = 1 - smoothstep(morph, .23 + wingDelay, .86 + wingDelay);
      const foldedTip = 1 - smoothstep(morph, .36 + wingDelay, .91 + wingDelay);
      const sweep = .74 * change * live + .38 * tuck * steeringLoad
        + beatStrength * (.13 * recover - .045 * load)
        - .07 * hold;
      this.rotateInModel(socket, up, sweep * side);
      this.rotateInModel(shoulder, up, (sweep + .24 * folded) * side);
      if (folded > 0) this.rotateInModel(shoulder, lateral, -.08 * folded);
      const shoulderDrop = side * (-.13 * load + .05 * recover) * beatStrength - .15 * steer * steeringLoad;
      this.rotateInModel(socket, forward, shoulderDrop);
      this.rotateInModel(shoulder, forward, shoulderDrop);
      if (hold > 0) {
        shoulder.parent.getWorldQuaternion(this.parentInverse).invert();
        this.axis.copy(up).applyQuaternion(this.parentInverse);
        const lower = hold * (-.014 + .002 * breath);
        socket.position.addScaledVector(this.axis, lower);
        shoulder.position.addScaledVector(this.axis, lower);
      }

      // Extend the wing during the working stroke. The distal joints tuck in
      // succession during recovery, which keeps the primaries following the wrist.
      this.rotateInModel(elbow, up, side * (
        .23 * change * live + .28 * beatStrength * recover - .08 * load + .28 * tuck * steeringLoad + .19 * foldedTip
      ));
      const delayed = flightStroke(wingPhase - .065, this.legStroke);
      const end = flightStroke(terminal.phase - .065, this.terminalStroke);
      const bend = lerp(.20 * delayed.recover - .095 * delayed.load, .20 * end.recover - .095 * end.load, blend);
      this.rotateInModel(wrist, forward, side * (bend * beatStrength + hold * (.084 + .018 * breath))
        - .09 * steer * steeringLoad);
      if (foldedTip > 0) this.rotateInModel(wrist, lateral, -.14 * foldedTip);
      if (brakeStroke > 0) {
        // Lead the brake with the shoulder and feather the distal joints.
        // Ease the two wings back toward a level hold after the press.
        const press = -side * .38 * (1 + side * brakeStagger) * brakeStroke;
        this.rotateInModel(shoulder, forward, press);
        this.rotateInModel(elbow, lateral, -.22 * brakeStroke);
        this.rotateInModel(wrist, forward, .21 * press);
      }
    }

    for (const { joints, toes, rear, side } of this.legs) {
      for (const { bone, position, rotation } of joints) {
        position.copy(bone.position);
        rotation.copy(bone.quaternion);
      }
      const delay = rear ? .15 : .045;
      const bank = steer * side;
      const legPhase = wingPhase - delay - bank * (rear ? .13 : .08);
      const swing = Math.sin(legPhase * 2 * Math.PI) * live;
      const stroke = flightStroke(legPhase, this.legStroke);
      const end = flightStroke(terminal.phase - delay, this.terminalStroke);
      const load = lerp(stroke.load, end.load, blend);
      const recover = lerp(stroke.recover, end.recover, blend);
      const rise = lerp(stroke.rise, end.rise, blend);
      const reach = strike * (rear ? .46 : 1);
      const tuck = anticipate * (rear ? .72 : 1);
      const approach = settle * (1 - gather);
      // The hind paws reach their flight pose after the shoulder and forepaws.
      const legDelay = side < 0 ? .066 : 0;
      const folded = 1 - smoothstep(morph, (rear ? .46 : .19) + legDelay, rear ? 1 : .86 + legDelay);
      const curled = 1 - smoothstep(morph, (rear ? .63 : .32) + legDelay, rear ? 1 : .92 + legDelay);
      joints[0].bone.parent.getWorldQuaternion(this.parentInverse).invert();

      // During the push, the legs fold toward the belly. The hind pair
      // follows the shoulder beat with a delay and keeps its own reach.
      const shoulder = .07 * drive * live + (.11 - .05 * Number(rear)) * climb * live
        + beatStrength * (.13 * rise - .19 * recover) + swing * .045
        + .15 * tuck - .32 * reach - .12 * approach + bank * (rear ? .27 : .39)
        + gather * (rear ? .27 : .36) - .07 * release
        + hold * ((rear ? .17 : .36) + breath * .012) + .16 * letDown - (rear ? .44 : .55) * folded;
      this.flexLeg(joints, 0, lateral, shoulder);
      this.flexLeg(joints, 0, forward, -side * (
        .11 * recover - .10 * rise + .12 * reach + .23 * gather + .31 * bank + .42 * folded
      ));

      const elbow = beatStrength * (.31 * load + .13 * rise - .23 * recover)
        + .22 * tuck - .26 * reach - .22 * approach + .32 * gather - .09 * release
        + hold * (rear ? .54 : .89) + bank * (rear ? .29 : .49) + .13 * letDown - (rear ? .62 : .47) * folded;
      this.flexLeg(joints, 2, lateral, elbow);
      const palm = beatStrength * (-.13 * load + .17 * recover) + .26 * grip - .15 * reach
        + .20 * gather - .09 * release - .24 * hold - .15 * bank + .12 * flare;
      this.flexLeg(joints, 4, lateral, palm);

      for (const { bone, rest, index } of toes) {
        const rearToe = index === 4;
        const ripple = Math.sin(legPhase * 2 * Math.PI - index * .28) * .025 * live
          + Math.sin(phase * .79 - index * .26) * .011 * hold;
        const curl = .055 + beatStrength * (.27 * rise - .11 * recover) + ripple
          + .45 * grip - .18 * reach - .10 * approach + .43 * gather - .21 * release + .24 * bank
          + .16 * flare - .14 * letDown + .68 * curled;
        this.rotation.setFromAxisAngle(lateral, -curl * (rearToe ? .72 : 1));
        bone.quaternion.copy(rest).multiply(this.rotation);
      }
    }
  }
}
