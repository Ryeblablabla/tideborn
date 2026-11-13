import * as THREE from 'three';
import { ManeFlow } from './mane-flow.js';

const { clamp, smoothstep } = THREE.MathUtils;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;

/** Damp the original feather and whisker chains around their animated pose. */
export class LiveFeathers {
  constructor(owner) {
    this.owner = owner;
    this.records = [];
    this.flow = new ManeFlow();
    this.time = 0;
    this.enabled = true;
    this.windStrength = .65;
    this.windAngle = Math.PI;
    this.basis = new THREE.Matrix4();
    this.inverse = new THREE.Quaternion();
    this.orientation = new THREE.Quaternion();
    this.boneRotation = new THREE.Matrix4();
    this.rotation = new THREE.Quaternion();
    this.axisX = new THREE.Vector3();
    this.axisZ = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.headWind = new THREE.Vector3();
    this.wingWind = new THREE.Vector3();
    for (const bone of owner.body.skeleton.bones) {
      const feather = bone.name.match(/^DEF_feather_(\d+)_(base|tip)[._]?([LR])$/);
      const strand = bone.name.match(/^DEF_(whisker|beard)_(\d+)[._]?([LR])$/);
      const pinion = bone.name.match(/^DEF_wing_0([45])[._]?([LR])$/);
      if (!feather && !strand && !pinion) continue;
      const index = Number(feather?.[1] ?? strand?.[2] ?? pinion[1]);
      const kind = feather ? 'feather' : strand ? strand[1] : 'pinion';
      const base = feather?.[2] === 'base';
      const side = (feather?.[3] ?? strand?.[3] ?? pinion[2]) === 'L' ? -1 : 1;
      const length = feather && base
        ? bone.children.find(child => child.isBone)?.position.length() ?? .06
        : bone.position.length();
      this.records.push({
        bone, kind, index, base, side, length,
        baseline: bone.quaternion.clone(), bend: 0, twist: 0, bendVelocity: 0, twistVelocity: 0,
      });
    }
  }

  restore() {
    for (const record of this.records) record.bone.quaternion.copy(record.baseline);
  }

  windAt(distance, out = new THREE.Vector3()) {
    const motion = this.owner.motion;
    const gust = .74 + .19 * Math.sin(this.time * 1.7 - distance * 3.5)
      + .10 * Math.sin(this.time * 4.1 - distance * 6.8);
    out.set(Math.sin(this.windAngle) * gust + .18 * Math.sin(this.time * 2.1 - distance * 4),
      .14 + .12 * Math.sin(this.time * 1.3 - distance * 6), Math.cos(this.windAngle) * gust)
      .multiplyScalar(this.windStrength);
    if (motion) {
      const frame = this.owner.sampleFrame(distance);
      out.multiplyScalar(.37).addScaledVector(frame.t, .22 + this.flow.stream * 1.25)
        .addScaledVector(frame.n, -this.flow.turn * .38);
      out.y -= this.flow.lift * .48;
    }
    return out;
  }

  modelWind(distance, out) {
    const frame = this.owner.sampleFrame(distance);
    this.basis.makeBasis(frame.n, frame.b, this.forward.copy(frame.t).negate());
    this.inverse.setFromRotationMatrix(this.basis).invert();
    return this.windAt(distance, out).applyQuaternion(this.inverse);
  }

  update(dt) {
    const step = clamp(dt, 0, .05);
    const motion = this.owner.motion;
    const reset = this.flow.update(motion, step);
    this.time = this.flow.time;
    this.modelWind(.080, this.headWind);
    this.modelWind(.255, this.wingWind);
    for (const record of this.records) {
      record.baseline.copy(record.bone.quaternion);
      if (reset || !this.enabled) record.bend = record.twist = record.bendVelocity = record.twistVelocity = 0;
      if (!this.enabled) continue;
      // Sample the skeleton before adding wind. Parent rotations carry the
      // subsequent deformation, and forces stay aligned to the animated pose.
      this.orientation.setFromRotationMatrix(this.boneRotation.extractRotation(record.bone.matrixWorld));
      if (record.kind === 'pinion') {
        // Let one primary fan open just ahead of the other. The flight
        // pose still controls the shared shoulder and main wrist stroke.
        const phase = TAU * (motion?.wingPhase ?? this.time * .42) - (record.index - 4) * .42;
        const terminal = motion?.arrivalStroke?.blend ?? 0;
        const bank = this.flow.turn;
        const gap = (.17 + .052 * Math.cos(phase) + .09 * bank) * (1 - .83 * terminal);
        this.spring(record, gap * (record.index === 4 ? .56 : .74), 0, record.index === 4 ? 15 : 12, step);
        this.axisX.copy(Z).applyQuaternion(this.inverse.copy(this.orientation).invert());
        record.bone.quaternion.multiply(this.rotation.setFromAxisAngle(this.axisX, record.bend));
        continue;
      }
      this.axisX.copy(X).applyQuaternion(this.orientation);
      this.axisZ.copy(Z).applyQuaternion(this.orientation);
      const feather = record.kind === 'feather';
      const wind = feather ? this.wingWind : this.headWind;
      const pressure = wind.dot(this.axisZ);
      const cross = wind.dot(this.axisX);
      let bend, twist, omega, twistAxis;
      if (feather) {
        const outer = 1 - smoothstep(record.index, 1, 15);
        const lag = (record.base ? .30 : 1.0) + outer * .64;
        const cycle = Math.sin(TAU * (motion?.wingPhase ?? this.time * .42) - lag + record.side * (.18 + outer * .19)) * (motion?.wingPower ?? .46);
        const arrival = motion?.arrivalStroke;
        const fade = arrival?.blend ?? 0;
        const braking = (arrival?.load ?? 0) - .53 * (arrival?.recover ?? 0);
        const residual = Math.sin(this.time * 2.35 - lag * 1.13 + record.side * .24)
          * (.11 - .061 * (arrival?.hold ?? 0));
        const stroke = THREE.MathUtils.lerp(cycle, braking * .52 + residual, fade);
        const flex = record.base ? .31 : 1;
        bend = clamp((pressure * record.length * 1.31 - .27 * stroke + .11 * this.flow.stream) * flex, -.34, .29);
        twist = clamp((cross * record.length * .44 + .12 * stroke + record.side * .09 * this.flow.turn) * flex, -.16, .16);
        omega = record.base ? 23 - outer * 3 : 12 - outer * 2;
        twistAxis = Y;
      } else {
        const tip = clamp((record.index - 1) / (record.kind === 'whisker' ? 15 : 5), 0, 1);
        const freedom = .21 + .79 * smoothstep(tip, .04, .86);
        const wave = this.flow.phase * .76 - tip * 3.0 + record.side * .27;
        const impulse = this.flow.impact - .88 * THREE.MathUtils.lerp(this.flow.flinch, this.flow.tipFlinch, tip);
        const amplitude = record.kind === 'whisker' ? 1 : 1.24;
        bend = clamp((.039 * pressure + .030 * Math.sin(wave) - .036 * impulse) * freedom * amplitude, -.08, .08);
        twist = clamp((-.037 * cross + .027 * Math.cos(wave - .75) + .026 * this.flow.turn)
          * freedom * amplitude, -.076, .076);
        omega = 23 - tip * 12;
        twistAxis = Z;
      }
      this.spring(record, bend, twist, omega, step);
      record.bone.quaternion.multiply(this.rotation.setFromAxisAngle(X, record.bend))
        .multiply(this.rotation.setFromAxisAngle(twistAxis, record.twist));
    }
  }

  spring(record, bend, twist, omega, dt) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    const stiffness = omega * omega;
    const damping = 1.52 * omega;
    for (let i = 0; i < steps; i++) {
      record.bendVelocity += ((bend - record.bend) * stiffness - damping * record.bendVelocity) * h;
      record.twistVelocity += ((twist - record.twist) * stiffness - damping * record.twistVelocity) * h;
      record.bend += record.bendVelocity * h;
      record.twist += record.twistVelocity * h;
    }
  }
}

export { OriginalMane as DynamicMane } from './original-mane.js';
