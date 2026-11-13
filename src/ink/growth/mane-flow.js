import { MathUtils, Matrix3, Matrix4, Quaternion, Vector2, Vector3 } from 'three';

const { clamp, smoothstep } = MathUtils;
const approach = (value, goal, rate, dt) => value + (goal - value) * -Math.expm1(-rate * dt);

/** Shared flow down the back, with separate lag for drag, steering and the strike. */
export class ManeFlow {
  constructor() {
    this.reset();
  }

  reset() {
    this.time = 0;
    this.phase = 0;
    this.drive = 0;
    this.stream = 0;
    this.turn = 0;
    this.lift = 0;
    this.impact = 0;
    this.tipImpact = 0;
    this.afterflow = 0;
    this.flinch = 0;
    this.middleFlinch = 0;
    this.tipFlinch = 0;
    this.flinchSide = 0;
  }

  update(motion, dt) {
    const reset = this.motion !== motion;
    if (reset) {
      this.reset();
      this.motion = motion;
    }
    const step = clamp(dt, 0, .05);
    this.drive = approach(this.drive, motion?.drive ?? 0, 5.8, step);
    this.stream = approach(this.stream, .50 * this.drive + .43 * (motion?.surge ?? 0)
      + .42 * (motion?.strike ?? 0), 8, step);
    this.turn = approach(this.turn, .80 * (motion?.turn ?? 0) + .45 * (motion?.aimYaw ?? 0), 7.5, step);
    this.lift = approach(this.lift, (motion?.lift ?? 0) * .085 + (motion?.aimPitch ?? 0) * .30, 6, step);
    const landing = (motion?.arrival ?? 0) > 0 ? motion.arrivalStroke?.load ?? 0 : 0;
    this.impact = approach(this.impact, .72 * (motion?.strike ?? 0) + .52 * (motion?.recoil ?? 0)
      - .40 * (motion?.anticipate ?? 0) + .25 * landing, 11, step);
    this.afterflow = approach(this.afterflow, this.stream + .46 * Math.abs(this.impact), 2.65, step);
    this.tipImpact = approach(this.tipImpact, this.impact, 6.4, step);
    const snap = motion?.flinch ?? 0;
    this.flinch = approach(this.flinch, snap, 30, step);
    this.middleFlinch = approach(this.middleFlinch, this.flinch, 17, step);
    this.tipFlinch = approach(this.tipFlinch, this.middleFlinch, 12, step);
    if (Math.abs(snap) > .005) this.flinchSide = clamp(motion?.flinchSide ?? 0, -1, 1);
    this.time += step;
    this.phase += step * (2.1 + 2.25 * this.drive + 2.35 * this.stream + .50 * this.afterflow);
    return reset;
  }

  sample(arc, seed, freedom, out) {
    const variation = .72 * Math.sin(seed * 2.7);
    const phase = this.phase - arc * 9.2 + variation;
    const proximal = 1 - smoothstep(arc, .19, 1.08);
    const aftershock = proximal * MathUtils.lerp(this.flinch, this.tipFlinch, smoothstep(arc, .12, .56));
    out.set(
      freedom * (.12 * Math.sin(phase - .7) - .31 * this.stream + .10 * this.lift
        - .19 * this.impact + .26 * aftershock),
      freedom * (.10 * Math.cos(phase * .77 + .9) + .30 * this.turn + this.flinchSide * .23 * aftershock),
      freedom * (.16 + .14 * this.drive + .16 * this.afterflow + .16 * Math.abs(this.tipImpact)),
      phase,
    );
    return out;
  }

  get pigment() { return .60 + .25 * this.stream + .13 * this.afterflow + .16 * Math.abs(this.impact); }
}

export function sculptWhisker(x, y, z) {
  return smoothstep(Math.abs(x), .063, .155) * smoothstep(z, .255, .383)
    * (1 - smoothstep(Math.abs(y - .021), .042, .077));
}

// Root, middle and tip locations measured from the original normalized meshes.
const crestGuides = {
  2: [
    [[.078,.124,.290],[.057,.196,.200],[.014,.265,.092]],
    [[.124,.103,.289],[.094,.188,.118],[.032,.183,-.022]],
    [[.149,.096,.285],[.083,.131,.161],[.056,.117,.064]],
  ],
  3: [
    [[-.061,.130,.329],[-.025,.195,.246],[-.027,.264,.112]],
    [[-.068,.099,.348],[-.061,.135,.260],[-.062,.161,.180]],
    [[.055,.129,.287],[.150,.216,.190],[.180,.287,.142]],
    [[.042,.123,.304],[.051,.172,.243],[.224,.258,.223]],
    [[.008,.145,.344],[.028,.196,.289],[.069,.281,.258]],
  ],
};

function bindGuide(points, index) {
  const [root, middle, tip] = points.map(point => new Vector3(...point));
  const vectors = [middle.clone().sub(root), tip.clone().sub(middle)];
  const lengths = vectors.map(vector => vector.length());
  const total = lengths[0] + lengths[1];
  const segments = [root, middle].map((start, part) => ({
    start, vector: vectors[part], inverseSquare: 1 / lengths[part] ** 2,
    begin: part ? lengths[0] / total : 0, length: lengths[part] / total,
  }));
  return { segments, total, index, middle: new Vector3(), tip: new Vector3() };
}

/** Deform the original form's embedded crest and whisker tips before head posing. */
export class SculptManeFlow extends ManeFlow {
  constructor(stage) {
    super();
    this.stage = stage;
    this.displacement = { x: 0, y: 0, z: 0 };
    this.guides = crestGuides[stage].map(bindGuide);
    this.bindings = new Map();
    this.bindingPoint = new Vector3();
    const capacity = 40, sections = 8;
    this.headPose = {
      basis: new Matrix3(), matrix: new Matrix4(), current: new Quaternion(), inverse: new Quaternion(),
      older: new Quaternion(), newer: new Quaternion(), bend: new Vector3(), ready: false,
    };
    const controls = this.guides.length * 6;
    const stride = stage === 2 ? 4 : 4 + controls + 3;
    this.trail = {
      controls, stride,
      count: 0, next: 0, inputTime: NaN, capacity, sections,
      times: new Float64Array(capacity),
      frames: new Float32Array(capacity * stride),
      whisker: stage === 2 ? null : new Float32Array((sections + 1) * 3),
      range: new Float64Array(3),
    };
    for (const guide of this.guides) {
      guide.trail = new Float32Array((sections + 1) * 3);
      const [root, middle] = guide.segments;
      guide.sections = Array.from({ length: sections + 1 }, (_, i) => {
        const t = i / sections;
        const segment = t < middle.begin ? root : middle;
        return segment.start.clone().addScaledVector(segment.vector, (t - segment.begin) / segment.length)
          .sub(root.start);
      });
    }
  }

  // The far tip of Jiaolong's high sweep crosses both loft cuts. All of
  // that lock follows the crown, including the taper beyond the collar.
  headWeight(x, y, z, flex) {
    if (this.stage !== 2) return 0;
    return smoothstep(y, .118, .157) * smoothstep(z, -.068, -.044)
      * (1 - smoothstep(z, .070, .157));
  }

  whiskerFlex(x, y, z) {
    if (this.stage !== 2) return 0;
    return smoothstep(x, .175, .268) * smoothstep(z, .314, .330)
      * (1 - smoothstep(y, .095, .106));
  }

  update(motion, dt, headFrame, skull) {
    const reset = super.update(motion, dt);
    const step = clamp(dt, 0, .05);
    for (const guide of this.guides) {
      if (reset) { guide.middle.set(0, 0, 0); guide.tip.set(0, 0, 0); }
      const phase = this.phase * (.90 + guide.index * .054) + guide.index * 1.92;
      const load = .55 + .42 * this.drive + .47 * this.afterflow;
      const length = clamp(guide.total / .22, .53, 1.24);
      const catchUp = this.impact - this.tipImpact;
      const middle = guide.middle, tip = guide.tip;
      const rootKick = MathUtils.lerp(this.flinch, this.middleFlinch, guide.index * .13);
      const tipKick = MathUtils.lerp(this.middleFlinch, this.tipFlinch, .38 + guide.index * .11);
      const midX = length * (.020 * Math.sin(phase) * load - .020 * this.turn + .053 * rootKick * this.flinchSide);
      const midY = length * (.031 * Math.cos(phase - .45) * load + .017 * this.lift
        - .016 * this.impact + .071 * rootKick);
      const tipX = length * (.045 * Math.sin(phase - 1.65) * load - .039 * this.turn
        + .038 * catchUp * Math.sin(phase - .5) + .093 * tipKick * this.flinchSide);
      const tipY = length * (.060 * Math.cos(phase - 1.99) * load + .031 * this.lift
        - .040 * this.tipImpact + .066 * catchUp * Math.cos(phase - .72) + .094 * tipKick);
      middle.x = approach(middle.x, midX, 14, step);
      middle.y = approach(middle.y, midY, 14, step);
      middle.z = approach(middle.z, .14 * Math.sin(phase + .72) * load
        - .13 * this.turn + .22 * rootKick * this.flinchSide, 14, step);
      tip.x = approach(tip.x, tipX, 8.5 - guide.index * .52, step);
      tip.y = approach(tip.y, tipY, 8.5 - guide.index * .52, step);
      tip.z = approach(tip.z, .34 * Math.sin(phase - .32) * load
        - .25 * this.turn + .33 * tipKick * this.flinchSide, 8.5 - guide.index * .52, step);
    }
    const pose = this.headPose;
    if (headFrame && skull) {
      pose.basis.set(
        headFrame[6], headFrame[9], -headFrame[3],
        headFrame[7], headFrame[10], -headFrame[4],
        headFrame[8], headFrame[11], -headFrame[5],
      ).multiply(skull);
      pose.current.setFromRotationMatrix(pose.matrix.setFromMatrix3(pose.basis));
      pose.inverse.copy(pose.current).invert();
      pose.ready = true;
    }
    this.updateTrail(motion, dt, reset);
    return reset;
  }

  updateTrail(motion, dt, reset) {
    const trail = this.trail;
    const pose = this.headPose;
    const frame = motion?.last;
    if (!pose.ready || (frame && frame.stage !== this.stage)) {
      trail.count = 0;
      trail.inputTime = NaN;
      return;
    }
    const inputTime = frame?.time ?? this.time;
    const elapsed = inputTime - trail.inputTime;
    // Displacements and roll are in rest-local coordinates before the
    // current head pose. A cut or a skipped interval starts a fresh trail.
    if (reset || dt > .085 || elapsed < 0 || elapsed > Math.max(.11, dt * 3.2)) trail.count = 0;
    trail.inputTime = inputTime;
    const { capacity, sections, times, frames, stride, controls } = trail;
    const jiao = this.stage === 2;
    const last = (trail.next + capacity - 1) % capacity;
    if (!trail.count || this.time > times[last] + 1e-7) {
      const slot = trail.next;
      let at = slot * stride;
      pose.current.toArray(frames, at);
      if (!jiao) {
        at += 4;
        for (const guide of this.guides) {
          guide.middle.toArray(frames, at);
          guide.tip.toArray(frames, at + 3);
          at += 6;
        }
        frames[at] = this.phase;
        frames[at + 1] = this.turn;
        frames[at + 2] = this.lift;
      }
      times[slot] = this.time;
      trail.next = (slot + 1) % capacity;
      trail.count = Math.min(trail.count + 1, capacity);
    }

    const range = delay => {
      const target = this.time - delay;
      let a = (trail.next + capacity - 1) % capacity, b = a;
      for (let i = 1; i < trail.count && times[a] > target; i++) {
        b = a;
        a = (a + capacity - 1) % capacity;
      }
      const span = times[b] - times[a];
      trail.range[0] = a * stride;
      trail.range[1] = b * stride;
      trail.range[2] = span > 1e-7 ? clamp((target - times[a]) / span, 0, 1) : 0;
      return trail.range;
    };
    for (const guide of this.guides) {
      for (let i = 0; i <= sections; i++) {
        const t = i / sections, middle = 2 * t * (1 - t), tip = t * t;
        const speed = jiao ? 1.55 : 1.18 + .085 * guide.index;
        const [a, b, blend] = range(guide.total * t / speed);
        const base = 4 + guide.index * 6;
        const rest = guide.sections[i];
        // A cross section keeps part of its previous direction. The skull
        // still owns its root, and heavier locks take longer to follow.
        pose.older.fromArray(frames, a).slerp(pose.newer.fromArray(frames, b), blend)
          .premultiply(pose.inverse);
        const bend = pose.bend.copy(rest).applyQuaternion(pose.older).sub(rest);
        const limit = jiao ? .028 : .048;
        const strength = Math.min(jiao ? .57 : .72, limit * t / Math.max(.0001, Math.hypot(bend.x, bend.y)));
        if (jiao) {
          guide.trail[i * 3] = guide.middle.x * middle + guide.tip.x * tip + bend.x * strength;
          guide.trail[i * 3 + 1] = guide.middle.y * middle + guide.tip.y * tip + bend.y * strength;
          guide.trail[i * 3 + 2] = guide.middle.z * middle + guide.tip.z * tip;
          continue;
        }
        for (let k = 0; k < 3; k++) {
          const current = guide.middle.getComponent(k) * middle + guide.tip.getComponent(k) * tip;
          const beforeMiddle = MathUtils.lerp(frames[a + base + k], frames[b + base + k], blend);
          const beforeTip = MathUtils.lerp(frames[a + base + 3 + k], frames[b + base + 3 + k], blend);
          guide.trail[i * 3 + k] = MathUtils.lerp(current, beforeMiddle * middle + beforeTip * tip, .72);
        }
        guide.trail[i * 3] += bend.x * strength;
        guide.trail[i * 3 + 1] += bend.y * strength;
      }
    }
    if (jiao) return;
    // The short whiskers share the same history, with a shorter travel time.
    for (let i = 0; i <= sections; i++) {
      const [a, b, blend] = range(.12 * i / sections);
      for (let k = 0; k < 3; k++) {
        trail.whisker[i * 3 + k] = MathUtils.lerp(frames[a + 4 + controls + k], frames[b + 4 + controls + k], blend);
      }
    }
  }

  binding(x, y, z) {
    const key = Math.round(x * 16384) + Math.round(y * 16384) * 65536
      + Math.round(z * 16384) * 4294967296;
    if (this.bindings.has(key)) return this.bindings.get(key);
    const influences = [];
    for (const guide of this.guides) {
      let distance = Infinity, progress, cx, cy;
      for (const segment of guide.segments) {
        const { start, vector } = segment;
        const along = clamp(this.bindingPoint.set(x, y, z).sub(start).dot(vector)
          * segment.inverseSquare, 0, 1);
        this.bindingPoint.copy(start).addScaledVector(vector, along);
        const dx = x - this.bindingPoint.x, dy = y - this.bindingPoint.y, dz = z - this.bindingPoint.z;
        const gap = dx * dx + dy * dy + dz * dz;
        if (gap >= distance) continue;
        distance = gap;
        progress = segment.begin + segment.length * along;
        cx = dx;
        cy = dy;
      }
      const weight = 1 - smoothstep(distance, .031 ** 2, .073 ** 2);
      if (weight > .001) influences.push({ guide, weight, progress, cx, cy });
    }
    const total = influences.reduce((sum, bind) => sum + bind.weight, 0);
    for (const bind of influences) {
      bind.weight /= Math.max(1, total);
      bind.middle = 2 * bind.progress * (1 - bind.progress);
      bind.tip = bind.progress ** 2;
      bind.weight *= smoothstep(bind.progress, .02, .38);
    }
    this.bindings.set(key, influences);
    return influences;
  }

  offset(distance, x, y, z, flex) {
    const whisker = sculptWhisker(x, y, z);
    const free = smoothstep(flex, .06, .99);
    const curtain = smoothstep(distance, .12, .23) * (1 - smoothstep(distance, .46, .72));
    // The heavy base and the raised strands share the travel direction but
    // have separate wave speeds. Mixing by rest height avoids visible seams
    // between adjoining locks in the sculpted crest.
    const upper = smoothstep(y, .08, .26);
    const side = clamp(x * 18, -1, 1);
    const curl = .16 + .64 * upper + .14 * whisker;
    const trail = this.trail;
    const active = trail?.count > 1;
    let phase = this.phase, turn = this.turn, lift = this.lift;
    if (active && trail.whisker && whisker > .06) {
      const u = free * trail.sections, i = Math.min(trail.sections - 1, Math.floor(u));
      const sample = i * 3, t = u - i, weight = .66 * whisker;
      const values = trail.whisker;
      phase = MathUtils.lerp(phase, MathUtils.lerp(values[sample], values[sample + 3], t), weight);
      turn = MathUtils.lerp(turn, MathUtils.lerp(values[sample + 1], values[sample + 4], t), weight);
      lift = MathUtils.lerp(lift, MathUtils.lerp(values[sample + 2], values[sample + 5], t), weight);
    }
    const base = phase * .71 - distance * 10.1 - 2.3 * free - upper * 1.8 + .74 * side + this.stage;
    // Rest height and width retain a phase gradient even when the original
    // flex mask saturates across the high, thick part of a single lock.
    const loose = phase * 1.20 - distance * 14.4 - 4.0 * free - y * 11.8 - 1.52 * side + this.stage;
    const lateral = MathUtils.lerp(Math.sin(base), Math.sin(loose), curl);
    const rise = MathUtils.lerp(Math.cos(base - .48), Math.cos(loose - 1.2), curl);
    const impact = MathUtils.lerp(this.impact, this.tipImpact, free);
    const whip = (this.impact - this.tipImpact) * Math.sin(loose - .26) * (.26 + .74 * upper);
    const load = .65 + .40 * this.drive + .35 * this.afterflow + .64 * Math.abs(impact);
    const scale = free * (.43 + .57 * Math.max(curtain, whisker)) * load;
    const neck = 1 - smoothstep(distance, .23, .59);
    const localKick = neck * MathUtils.lerp(this.flinch, this.tipFlinch, free);
    this.displacement.x = scale * (.038 * lateral - .038 * turn + side * .011 * this.stream
      + .027 * whip + .052 * localKick * this.flinchSide);
    this.displacement.y = scale * ((.031 + .012 * upper) * rise + .016 * lift
      - .019 * this.stream - .034 * impact + .043 * whip + .065 * localKick);

    const whiskerProgress = this.whiskerFlex(x, y, z);
    if (whiskerProgress > 0) {
      // The sculpt has two free filaments on the outer cheek. Their far
      // arcs flex apart while both attachment points stay with the skull.
      const upperStrand = 1 - smoothstep(z + (x - .180) * 1.25, .441, .452);
      const ripple = Math.sin(this.phase * 1.26 - 3.4 * whiskerProgress + upperStrand * 1.85);
      this.displacement.x += whiskerProgress * (.018 * ripple - .024 * this.turn);
      this.displacement.y += whiskerProgress * (.031 * ripple + .061 * (upperStrand - .48));
    }

    // Transport each width slice around its guide; the left and right edges
    // of the same lock no longer receive independent point noise.
    if (y > .085 && z > -.061 && z < .344 && whisker < .47) {
      const strength = smoothstep(free, .11, .61) * (1 - whisker);
      const originalX = this.displacement.x, originalY = this.displacement.y;
      for (const bind of this.binding(x, y, z)) {
        const { guide, cx, cy } = bind;
        const weight = strength * bind.weight;
        let bendX, bendY, angle;
        if (active) {
          const u = bind.progress * trail.sections, i = Math.min(trail.sections - 1, Math.floor(u));
          const sample = i * 3, t = u - i, values = guide.trail;
          bendX = MathUtils.lerp(values[sample], values[sample + 3], t);
          bendY = MathUtils.lerp(values[sample + 1], values[sample + 4], t);
          angle = MathUtils.lerp(values[sample + 2], values[sample + 5], t);
        } else {
          bendX = guide.middle.x * bind.middle + guide.tip.x * bind.tip;
          bendY = guide.middle.y * bind.middle + guide.tip.y * bind.tip;
          angle = guide.middle.z * bind.middle + guide.tip.z * bind.tip;
        }
        const sine = Math.sin(angle), cosine = Math.cos(angle);
        bendX += cx * (cosine - 1) - cy * sine;
        bendY += cy * (cosine - 1) + cx * sine;
        this.displacement.x += (bendX - originalX) * weight;
        this.displacement.y += (bendY - originalY) * weight;
      }
    }
    return this.displacement;
  }
}

// Articulated lobes use a shared CPU and shader formula. Flex zero keeps the
// base attached while a moving curl overtakes the upper part of the lock.
export function maneAngles(flex, flow, out) {
  const t = smoothstep(flex, .07, 1);
  const phase = flow.w - t * 3.4;
  out.set(t * (flow.x + flow.z * (.76 * Math.sin(phase) + .24 * Math.sin(phase * .61 + .8))),
    t * (flow.y + .77 * flow.z * Math.cos(phase - .9)));
  return out;
}

export function bendManeVector(out, px, py, pz, x, y) {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y);
  return out.set(c * px + d * b * py + d * a * pz, a * py - b * pz, -d * px + c * b * py + c * a * pz);
}

/** A sampled, arc-length preserving curl for the copied source locks. */
export class ManeCurl {
  constructor() {
    this.segments = 10;
    this.centers = Array.from({ length: 11 }, () => new Vector3());
    this.rotations = Array.from({ length: 11 }, () => new Quaternion());
    this.X = new Vector3(1, 0, 0);
    this.Y = new Vector3(0, 1, 0);
    this.delta = new Vector3();
    this.angles = new Vector2();
    this.pitch = new Quaternion();
    this.rotation = new Quaternion();
    this.axis = new Vector3();
    this.length = 1;
  }

  rotate(t, flow, out) {
    maneAngles(t, flow, this.angles);
    return out.setFromAxisAngle(this.Y, this.angles.y)
      .multiply(this.pitch.setFromAxisAngle(this.X, this.angles.x));
  }

  prepare(axis, length, flow) {
    this.axis.copy(axis);
    this.length = length;
    const step = length / this.segments;
    for (let i = 1; i <= this.segments; i++) {
      this.rotate(i / this.segments, flow, this.rotations[i]);
      this.rotate((i - .5) / this.segments, flow, this.rotation);
      this.delta.copy(this.axis).applyQuaternion(this.rotation);
      this.centers[i].copy(this.centers[i - 1]).addScaledVector(this.delta, step);
    }
  }

  pose(x, y, z, out) {
    const length = clamp(x * this.axis.x + y * this.axis.y + z * this.axis.z, 0, this.length);
    const sample = length * this.segments / this.length;
    const i = Math.min(this.segments - 1, Math.floor(sample));
    const t = sample - i;
    this.rotation.copy(this.rotations[i]).slerp(this.rotations[i + 1], t);
    this.delta.set(x, y, z).addScaledVector(this.axis, -length).applyQuaternion(this.rotation);
    return out.copy(this.centers[i]).lerp(this.centers[i + 1], t).add(this.delta);
  }
}

export const maneBendGLSL = /* glsl */ `
attribute float aOriginalFlex;
attribute vec4 aFlutter;
mat3 originalBend(){
 float t=smoothstep(.07,1.,aOriginalFlex);
 float phase=aFlutter.w-t*3.4;
 float x=t*(aFlutter.x+aFlutter.z*(.76*sin(phase)+.24*sin(phase*.61+.8)));
 float y=t*(aFlutter.y+.77*aFlutter.z*cos(phase-.9));
 float a=cos(x),b=sin(x),c=cos(y),d=sin(y);
 return mat3(c,0.,-d,d*b,a,c*b,d*a,-b,c*a);
}`;

/** Brush density travels over rest coordinates, independent of the world camera. */
export function installManePigment(material, time, strength) {
  material.uniforms.uManeTime = time;
  material.uniforms.uManeLoad = strength;
  material.vertexShader = 'attribute vec2 aManePaint; varying vec2 vManePaint;\n' + material.vertexShader;
  material.vertexShader = material.vertexShader.replace('void main() {', 'void main() { vManePaint=aManePaint;');
  material.fragmentShader = 'uniform float uManeTime,uManeLoad; varying vec2 vManePaint;\n' + material.fragmentShader;
  material.fragmentShader = material.fragmentShader.replace('pigment = clamp(pigment * uDensity, 0.0, 1.6);', /* glsl */ `
    float lockTip=smoothstep(.09,.77,vManePaint.x);
    if(lockTip>.001){
      float wave=vManePaint.y*14.+vManePaint.x*4.5-uManeTime*1.37;
      float wet=fbm(vec3(vPaint.x*37.+sin(wave*.6)*.4,vPaint.y*27.,wave));
      float inkLoad=smoothstep(.30,.78,wet);
      float load=lockTip*clamp(uManeLoad,0.,1.);
      float crossStroke=vPaint.x*63.+vPaint.y*28.+sin(wave*.76)*.66;
      float bristles=pow(.5+.5*cos(crossStroke),7.);
      float dryVein=bristles*smoothstep(.27,.84,1.-wet)*smoothstep(.17,.66,vManePaint.x);
      pigment*=mix(1.,.63+inkLoad*.77-dryVein*.35,load);
      pigment+=load*inkLoad*.088;
      ridgePaper=max(ridgePaper,load*((1.-inkLoad)*.16+dryVein*.24));
    }
    pigment = clamp(pigment * uDensity, 0.0, 1.6);
  `);
  material.needsUpdate = true;
}
