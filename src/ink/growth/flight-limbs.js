import { AnimationClip, MathUtils, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { flightStroke, wingElevation, wingFold } from './flight-stroke.js';

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
    this.wings = ['L', 'R'].map(side => {
      const joints = ['socket', '01', '02', '03', '04', '05'].map(key => joint(skeleton, 'DEF_wing_' + key + side));
      const shoulder = joints[1].bone;
      return { side: side === 'L' ? -1 : 1, joints, shoulder, poseScale: shoulder.scale.clone() };
    });
    this.wingRest = new Map(this.wings.flatMap(({ joints }) => joints.map(({ bone, rotation }) =>
      [bone.name + '.quaternion', rotation.toArray()])));
    for (const bone of skeleton.bones) {
      if (bone.name.startsWith('DEF_feather_')) this.wingRest.set(bone.name + '.quaternion', bone.quaternion.toArray());
    }
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

  liveClip(clip) {
    // The wing joints have their own shared stroke. The rest of the rig still
    // blends the original actions, and the final brake uses the authored wings.
    const tracks = clip.tracks.map(track => {
      const rest = this.wingRest.get(track.name);
      return rest ? new QuaternionKeyframeTrack(track.name, [0], rest) : track;
    });
    return new AnimationClip(clip.name + '_Live', clip.duration, tracks);
  }

  restoreWingScale() {
    for (const { shoulder, poseScale } of this.wings) shoulder.scale.copy(poseScale);
  }

  growWings(extraLength, opening) {
    // The torso and the socket keep their size. The shoulder carries the
    // entire wing and its feathers, so its pivot stays attached to the chest.
    const growth = Math.pow(extraLength / 2.5, 1.35);
    const fullScale = 1 + 2.8 * growth / (1 + growth);
    for (const [index, { shoulder, poseScale }] of this.wings.entries()) {
      poseScale.copy(shoulder.scale);
      shoulder.scale.multiplyScalar(opening ? lerp(.12, fullScale, opening[index]) : fullScale);
    }
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
    anticipate = 0, strike = 0, grip = 0, settle = 0, morph = 1, arrival = 0, gatePose, clawSide, chapterWing, dragonArt,
    combatWingRelease=0, riftClosing=0,
  }, terminal) {
    const stroke = wingStroke ?? flightStroke(wingPhase, this.stroke);
    const { blend, hold, gather, release, flare, letDown } = terminal;
    const live = 1 - blend;
    const steer = clamp(turn * 1.18, -.84, .84) * live;
    const load = lerp(stroke.load, terminal.load, blend);
    const steeringLoad = .34 + .66 * load;
    const climb = clamp(lift / 3, -.8, 1);
    const beatStrength = lerp(.31 + wingPower * .69, .84, blend) * (1 - hold * .8);
    const dive = gatePose?.tuck ?? 0;
    const caught = (gatePose?.bind ?? 0) * (1 - .76 * (gatePose?.strain ?? 0));
    const pin = gatePose?.load ?? 0;
    const planted = gatePose?.contact ?? 0;
    const landingFold = gatePose?.landingFold ?? 0;
    const bow = gatePose?.bow ?? 0;
    const courtWeight = gatePose?.courtWeight ?? 0;
    const push = gatePose?.push ?? 0;
    const hanging = gatePose?.lockHang ?? 0;
    const chestBreath = gatePose?.lockBreath ?? 0;
    const opening = chapterWing?.opening ?? morph;
    const chapterLoad = chapterWing?.loading ?? 0;
    const chapterPress = chapterWing?.pressing ?? 0;
    const chapterRelease = chapterWing?.release ?? 0;
    const glide = clamp(chapterWing?.glide ?? 0, 0, 1);
    const openPress = clamp(chapterWing?.openPress ?? 0, 0, 1);
    const recoveryFold = 1 - .75 * Math.max(glide, openPress);
    const wingStrength = (.74 + .42 * wingPower) * live * smoothstep(opening, .16, .83)
      * (1 - .67 * Math.max(dive, caught)) * (1 - .82 * Math.max(planted,landingFold))
      * (1 - hanging);
    const breath = Math.sin(phase * .79);
    const brakeStroke = blend * (.78 + .22 * smoothstep(arrival, .14, .48)
      - .50 * smoothstep(arrival, .66, .98));
    const brakeStagger = .17 * (1 - .63 * smoothstep(arrival, .62, .96));
    const powerStroke = clamp(chapterWing?.powerStroke ?? 0, 0, 1);
    // Load through the shoulder, then let the wrist take the new incidence
    // as the outer feathers catch up with the descending elbow.
    const shoulderPress = powerStroke * smoothstep(wingPhase, 1.20, 1.273)
      * (1 - smoothstep(wingPhase, 1.40, 1.56));
    const distalPress = powerStroke * smoothstep(wingPhase, 1.205, 1.28)
      * (1 - smoothstep(wingPhase, 1.465, 1.62));
    const distalOpen = powerStroke * smoothstep(wingPhase, 1.222, 1.288)
      * (1 - smoothstep(wingPhase, 1.44, 1.59));
    this.bankShoulders(steer, flare);
    for (const { side, joints, shoulder } of this.wings) {
      for (const { bone, rotation, position } of joints) {
        rotation.copy(bone.quaternion);
        position.copy(bone.position);
      }
      const socket = joints[0].bone;
      const elbow = joints[2].bone, wrist = joints[3].bone;
      const pinion = joints[4].bone, tip = joints[5].bone;
      const wingWeight=gatePose?.wingWeight??0;
      const relaxed=1-wingWeight;
      const wingSteer=steer*relaxed;
      const inside = wingSteer * side;
      const tuck = Math.max(0, inside);
      // The new wing clears the shoulder before the primaries fan open.
      const wingDelay = side < 0 ? .084 : 0;
      const folded = 1 - smoothstep(opening, .23 + wingDelay, .86 + wingDelay);
      const foldedTip = 1 - smoothstep(opening, .36 + wingDelay, .91 + wingDelay);
      // Start low and aft at the socket. The leading edge clears the
      // chest first, with the primaries still aligned to the arm.
      const tuckedBud = chapterWing ? (1 - clamp(opening - wingDelay * opening * (1 - opening), 0, 1)) ** .62 : 0;
      const nearPresentation = chapterWing && side > 0 ? smoothstep(opening, .30, .79)
        * (1 - smoothstep(wingPhase, .10, .19)) : 0;
      const guard=side>0?(gatePose?.wingGuard??0):0;
      const fold=landingFold*(side<0?1:.66);
      const flinch=side<0?(gatePose?.ankleFlinch??0):0;
      const exhaustion=gatePose?.exhaustion??0;
      const stoneLean=gatePose?.stoneLean??0;
      const tether = (side>0?1:.18) * (gatePose?.wing??0);
      const cuffJerk = (side>0?1:0) * (gatePose?.tetherJerk??0);
      const showIron=gatePose?.lockSilhouette??0;
      const latchExpose=side>0?(gatePose?.wingLatchExpose??0):0;
      const lockShock=(gatePose?.lockShock??0)*(side<0?1:.29);
      const releaseTension = 1 - .47 * (gatePose?.strain??0);
      const firstPress = chapterWing?.firstPress ?? 0;
      const beat = wingPhase + side * lerp(.016, .010, firstPress) - tether*.17;
      const jointLag = 1 - .39 * firstPress - .16 * chapterPress + .25 * distalPress;
      const nearPress = side > 0 ? distalOpen : 0;
      const shoulderArc = .53 * wingElevation(beat) - .13 * shoulderPress;
      const elbowArc = .52 * wingElevation(beat - .055 * jointLag) - .0312 * shoulderPress;
      const wristArc = .50 * wingElevation(beat - .106 * jointLag);
      const pinionArc = .48 * wingElevation(beat - .146 * jointLag);
      const tipArc = .46 * wingElevation(beat - .178 * jointLag);
      const sweep = .62 * change * live * relaxed + .33 * tuck * steeringLoad
        + .09 * wingFold(beat) * recoveryFold * wingStrength - .07 * hold + .045 * chapterLoad;
      this.rotateInModel(socket, up, (sweep + .11 * tuckedBud) * side);
      this.rotateInModel(shoulder, up, (sweep + .24 * folded + .40 * tuckedBud) * side);
      if (folded > 0) this.rotateInModel(shoulder, lateral, -.08 * folded);
      const strokeAngle = side * ((shoulderArc * (1 - .22 * openPress) - .045 + .056 * climb) * wingStrength * (1-.77*guard-.64*flinch) - .22 * tuckedBud
        + .052 * chapterLoad - .036 * chapterPress);
      const bankAngle = -.15 * wingSteer * steeringLoad;
      this.rotateInModel(socket, forward, .65 * strokeAngle + bankAngle);
      // Ease the near shoulder down to show the wing surface before the press.
      const earlySeparation = side > 0 ? .18 * clamp(chapterWing?.earlySeparation ?? 0, 0, 1) : 0;
      // Open the far chord on the first glide so it stays clear of the back.
      const farGlide = side < 0 ? clamp(chapterWing?.farGlide ?? 0, 0, 1) : 0;
      const budSeparation = side < 0 ? clamp(chapterWing?.budSeparation ?? 0, 0, 1) : 0;
      const farPress = side < 0 ? clamp(chapterWing?.farPress ?? 0, 0, 1) : 0;
      this.rotateInModel(shoulder, forward,
        strokeAngle + bankAngle - .16 * nearPresentation + earlySeparation
        - .13 * farGlide + .24 * budSeparation + .10 * farPress);
      // The brief low glide opens the sightline ahead of the muzzle while a
      // real follow-up crosses it. The torso keeps its normal steering pose.
      if (combatWingRelease > .001) {
        this.rotateInModel(shoulder, up, side * combatWingRelease * .17);
        this.rotateInModel(shoulder, forward, -side * combatWingRelease * .31);
      }
      if (hold > 0) {
        shoulder.parent.getWorldQuaternion(this.parentInverse).invert();
        this.axis.copy(up).applyQuaternion(this.parentInverse);
        const lower = hold * (-.014 + .002 * breath);
        socket.position.addScaledVector(this.axis, lower);
        shoulder.position.addScaledVector(this.axis, lower);
      }

      // The links inherit their parent's arc. Apply only the difference to the
      // delayed arc so every reversal passes outward without stacking rotations.
      // Open the already upturned bind pose into a broad surface under load.
      // Carry the open chord through the brief glide, then allow the
      // returning feathers to fold naturally into the next live stroke.
      const spread = (1 - .56 * wingFold(beat - .09 * jointLag) * recoveryFold) * live
        * (1 - .18 * chapterLoad + .16 * chapterPress + .04 * chapterRelease) * (1-.78*landingFold)*(1-.59*hanging);
      // Keep the near pinion behind the muzzle through the shoulder reveal.
      const nearUnfurl = chapterWing && side > 0 ? smoothstep(opening, .40, .87)
        * (1 - smoothstep(wingPhase, .102, .175)) : 0;
      this.rotateInModel(elbow, up, side * (
        .18 * change * live * relaxed + .21 * wingFold(beat - .043 * jointLag) * recoveryFold * wingStrength
        + .28 * tuck * steeringLoad + .19 * foldedTip + .16 * tuckedBud - .30 * nearUnfurl
        + .16 * chapterLoad - .08 * chapterPress - .12 * openPress - .20 * nearPress
      ));
      this.rotateInModel(elbow, forward, side * ((elbowArc - shoulderArc) * wingStrength - .13 * spread)
        + .17 * budSeparation);
      const wristFold = wingFold(beat - .085 * jointLag) * recoveryFold;
      const nearFeatherPress = side > 0 ? (chapterPress + .62 * chapterRelease) * (1 - .70 * openPress) : 0;
      this.rotateInModel(wrist, up, side * (.16 * wristFold * wingStrength - (.11 + .09 * firstPress) * spread
        + .085 * chapterLoad - .045 * chapterPress - .070 * openPress - .16 * nearPress) - .16 * farPress);
      this.rotateInModel(wrist, forward, side * ((wristArc - elbowArc) * wingStrength
        - .20 * spread - .060 * nearFeatherPress + hold * (.084 + .018 * breath)) - .09 * wingSteer * steeringLoad);
      this.rotateInModel(wrist, lateral, -.10 * wristFold * wingStrength - .14 * foldedTip
        - .085 * chapterLoad + .11 * chapterPress - .15 * farGlide - .25 * nearPress);
      this.rotateInModel(pinion, forward, side * ((pinionArc - wristArc) * wingStrength
        - .21 * spread - .055 * nearFeatherPress - .16 * nearPress));
      this.rotateInModel(tip, forward, side * ((tipArc - pinionArc) * wingStrength
        - .16 * spread - .040 * nearFeatherPress));
      this.rotateInModel(shoulder, up, side * (.72 * dive + .28 * caught + .17 * fold));
      this.rotateInModel(elbow, up, side * (.54 * dive + .20 * caught + .25 * fold));
      this.rotateInModel(wrist, up, side * (.32 * dive + .17 * caught + .18 * fold));
      // Carry the wrists behind and above the loaded elbows. Release the
      // primaries into the push only as the splintered timber gives way.
      this.rotateInModel(socket, forward, -side * .05 * fold);
      this.rotateInModel(shoulder, forward, side * (.31 * dive - .44 * planted - .19 * caught - .16 * fold));
      this.rotateInModel(elbow, forward, side * (-.30 * planted - .19 * fold));
      this.rotateInModel(wrist, forward, -side * .08 * fold);
      // Clear the foreleg on both sides before the load comes on. The
      // entrance shoulder lifts the inner wing, then the wrist folds back
      // into the same silhouette while the paw remains on the timber.
      const clearance = landingFold * (side < 0 ? 1 : .48);
      this.rotateInModel(shoulder, up, side * .22 * clearance);
      this.rotateInModel(shoulder, forward, side * .16 * clearance);
      this.rotateInModel(elbow, forward, side * .14 * clearance);
      this.rotateInModel(wrist, up, side * .34 * clearance);
      this.rotateInModel(wrist, forward, -side * .10 * clearance);
      this.rotateInModel(shoulder, up, side * .31 * bow);
      this.rotateInModel(elbow, up, side * .28 * bow);
      this.rotateInModel(wrist, lateral, -.21 * bow);
      this.rotateInModel(shoulder, forward, -side * .23 * bow);
      this.rotateInModel(shoulder, up, side * .37 * courtWeight);
      this.rotateInModel(elbow, up, side * .33 * courtWeight);
      this.rotateInModel(wrist, up, side * .25 * courtWeight);
      this.rotateInModel(shoulder, forward, side * .44 * courtWeight);
      this.rotateInModel(elbow, forward, side * .29 * courtWeight);
      this.rotateInModel(shoulder, forward, -side * .33 * push);
      this.rotateInModel(elbow, forward, -side * .22 * push);
      this.rotateInModel(wrist, up, -side * .15 * push);
      // The wing reaches out to recover balance, exposing the forewing.
      // The taut chain then rolls the captured wing back toward the body.
      // The opposite wing lifts to catch the ankle's first pull, then both
      // settle outward instead of continuing the last short flight stroke.
      this.rotateInModel(socket, forward, -.18*guard-.20*flinch);
      // Keep the cuffed side under tension. The free wing folds down and
      // braces against the steps as the rear of the body settles.
      const freeSlack=side<0?(gatePose?.freeWingSlack??0)*(1-.67*(gatePose?.stairKneel??0)):0;
      const sag=exhaustion*(side>0?.24-.11*wingWeight:.65)+stoneLean*(side>0?.09*relaxed:.20)+.30*freeSlack;
      const slack=exhaustion*(side>0?.15-.06*wingWeight:.46)+stoneLean*(side>0?.04*relaxed:.19)+.18*freeSlack;
      this.rotateInModel(shoulder, forward, -.64*flinch-side*(sag-.048*chestBreath*relaxed));
      this.rotateInModel(elbow, forward, -.37*flinch-side*slack);
      this.rotateInModel(wrist, up, -.17*exhaustion);
      this.rotateInModel(wrist, forward, -side*.22*exhaustion);
      this.rotateInModel(pinion, forward, -side*(.18*exhaustion+.26*freeSlack));
      this.rotateInModel(wrist, up, side*.37*freeSlack);
      this.rotateInModel(wrist, forward, -side*.22*freeSlack);
      const stone=side<0?(gatePose?.stairKneel??0):0;
      const lying=side<0?(gatePose?.stairRest??0):0;
      this.rotateInModel(shoulder,up,-.27*lying);
      this.rotateInModel(elbow,up,-.22*lying);
      this.rotateInModel(wrist,up,-.12*lying);
      // Keep the longer primaries from dropping through the raised tread.
      this.rotateInModel(shoulder,forward,-.34*stone);
      this.rotateInModel(elbow,forward,-.23*stone);
      this.rotateInModel(wrist,forward,-.16*stone);
      this.rotateInModel(shoulder, forward, .34*guard);
      this.rotateInModel(shoulder, up, -.78*guard);
      this.rotateInModel(elbow, up, -.42*guard);
      this.rotateInModel(elbow, forward, .26*guard);
      this.rotateInModel(wrist, up, -.27*guard);
      this.rotateInModel(shoulder, up, side * (.27 * tether * releaseTension + .33 * cuffJerk));
      this.rotateInModel(shoulder, forward, -side * (.37 * tether * releaseTension + .30 * cuffJerk));
      this.rotateInModel(elbow, up, side * (.14 * tether + .41 * cuffJerk));
      this.rotateInModel(wrist, forward, side * (.23 * tether * releaseTension + .37 * cuffJerk));
      this.rotateInModel(shoulder, forward, (side>0?.14:-.28)*showIron);
      this.rotateInModel(elbow, forward, (side>0?-.10:-.21)*showIron);
      this.rotateInModel(wrist, up, (side>0?.21:-.25)*showIron);
      // The cuff seats proximal to the wrist. The outer joints roll up
      // when the chain arrests it, leaving the actual seat in place.
      this.rotateInModel(wrist,forward,.68*latchExpose);
      this.rotateInModel(wrist,up,.24*latchExpose);
      this.rotateInModel(pinion,forward,.26*latchExpose);
      this.rotateInModel(shoulder,forward,-side*.73*lockShock);
      this.rotateInModel(elbow,forward,-side*.48*lockShock);
      this.rotateInModel(wrist,up,side*.32*lockShock);
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
      const swipe = clawSide ? (rear ? .23 : side === clawSide ? 1.22 : .29) : 1;
      const reach = strike * (rear ? .46 : 1) * swipe;
      const tuck = anticipate * (rear ? .72 : 1) * swipe;
      const close = grip * swipe + (rear?0:.48*riftClosing);
      const approach = settle * (1 - gather);
      const land = (rear ? gatePose?.rear : gatePose?.front) ?? 0;
      const leash = rear ? (gatePose?.ankle??0) * (side<0?1:.16) : 0;
      const kick = rear ? (gatePose?.kick??0) * (side<0?1:.48) : 0;
      const ankleReach=rear&&side<0?(gatePose?.ankleReach??0):0;
      const clearAnkle=rear&&side<0?(gatePose?.anklePresentation??0):0;
      const gateReach=rear?0:(gatePose?.lockReach??0)*(side>0?1:.54);
      const caughtReach=rear?0:(gatePose?.lockSilhouette??0)*(side>0?.17:1);
      const plantedFore=rear?0:(gatePose?.pawWeight?.[side<0?0:1]??0);
      const beamLoad=pin*plantedFore;
      const ringGrip=!rear&&side<0?(gatePose?.doorGrip??0):0;
      const stoneLean=rear?0:(gatePose?.stoneLean??0);
      const stoneLoad=rear||side<0?0:(gatePose?.stoneCompression??0);
      // The hind paws reach their flight pose after the shoulder and forepaws.
      const legDelay = side < 0 ? .066 : 0;
      const folded = 1 - smoothstep(morph, (rear ? .46 : .19) + legDelay, rear ? 1 : .86 + legDelay);
      const curled = 1 - smoothstep(morph, (rear ? .63 : .32) + legDelay, rear ? 1 : .92 + legDelay);
      const cutAge=dragonArt?.kind==='rift'&&!rear?dragonArt.age-(side>0?.10:0):1;
      const drawOut=smoothstep(cutAge,.02,.14)*(1-smoothstep(cutAge,.16,.30));
      const tear=smoothstep(cutAge,.145,.235)*(1-smoothstep(cutAge,.301,.49));
      const cut=drawOut*.57+tear;
      const cross=drawOut*.73-tear*.77;
      joints[0].bone.parent.getWorldQuaternion(this.parentInverse).invert();

      // During the push, the legs fold toward the belly. The hind pair
      // follows the shoulder beat with a delay and keeps its own reach.
      const shoulder = .07 * drive * live + (.11 - .05 * Number(rear)) * climb * live
        + beatStrength * (.13 * rise - .19 * recover) + swing * .045
        + .15 * tuck - .32 * reach - .12 * approach + bank * (rear ? .27 : .39)
        + gather * (rear ? .27 : .36) - .07 * release
        + hold * ((rear ? .17 : .36) + breath * .012) + .16 * letDown - (rear ? .44 : .55) * folded
        + .29 * dive - .58 * land + (rear?.09:.32) * pin + .21 * push - .18 * caught - .36*leash - .61*kick - .38*ankleReach - .48*cut
        + (rear ? .07 : .42) * bow - .63 * gateReach - .56*caughtReach + .48*clearAnkle
        + (side>0?.19:-.35)*stoneLean - .12*stoneLoad - .15*beamLoad;
      this.flexLeg(joints, 0, lateral, shoulder);
      this.flexLeg(joints, 0, forward, -side * (
        .11 * recover - .10 * rise + .12 * reach + .23 * gather + .31 * bank + .42 * folded + .24*ankleReach + .68 * cross
        - .56*caughtReach - .25*clearAnkle + (side>0?.26:.08)*stoneLean
      ));
      if(plantedFore>0)this.flexLeg(joints,0,forward,side*(plantedFore*(side>0?.16:.052)+.22*beamLoad));

      const elbow = beatStrength * (.31 * load + .13 * rise - .23 * recover)
        + .22 * tuck - .26 * reach - .22 * approach + .32 * gather - .09 * release
        + hold * (rear ? .54 : .89) + bank * (rear ? .29 : .49) + .13 * letDown - (rear ? .62 : .47) * folded
        + .33 * dive - .49 * land + (rear?.20:.57) * pin + .27 * push - .38*leash - .45*kick - .37*ankleReach - .21*cut
        + (rear ? .06 : .57) * bow - .47 * gateReach - .45*caughtReach + .32*clearAnkle
        + (side>0?.31:.27)*stoneLean + .29*stoneLoad + .39*beamLoad;
      this.flexLeg(joints, 2, lateral, elbow);
      const palm = beatStrength * (-.13 * load + .17 * recover) + .26 * close - .15 * reach
        + .20 * gather - .09 * release - .24 * hold - .15 * bank + .12 * flare + .15*ankleReach
        + .24*drawOut-.34*tear - (rear ? .05 : .22) * bow - .22 * gateReach + (rear?.015:.09)*hanging - .19*beamLoad;
      this.flexLeg(joints, 4, lateral, palm);

      for (const { bone, rest, index } of toes) {
        const rearToe = index === 4;
        const ripple = Math.sin(legPhase * 2 * Math.PI - index * .28) * .025 * live
          + Math.sin(phase * .79 - index * .26) * .011 * hold;
        const curl = .055 + beatStrength * (.27 * rise - .11 * recover) + ripple
          + .45 * close - .18 * reach - .10 * approach + .43 * gather - .21 * release + .24 * bank
          + .16 * flare - .14 * letDown + .68 * curled - .37 * land + .14 * pin + .33 * caught - .34 * gateReach
          + (rear?.09:.16)*hanging - .038*chestBreath + plantedFore*(rearToe?.09:.17) - .20*clearAnkle
          + (side>0?-.07:.20)*stoneLean + (rearToe?.30:.43)*ringGrip;
        this.rotation.setFromAxisAngle(lateral, -curl * (rearToe ? .72 : 1));
        bone.quaternion.copy(rest).multiply(this.rotation);
      }
    }
  }
}
