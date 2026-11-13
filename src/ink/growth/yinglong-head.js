import { Bone, MathUtils, Quaternion, Skeleton, Vector3 } from 'three';
import { flightStroke } from './flight-stroke.js';
import { cutLipTriangle } from './jaw-cut.js';
import { interpolateVertex } from './growth-utils.js';

const { clamp, lerp, smoothstep } = MathUtils;
const lateral = new Vector3(1, 0, 0);
const up = new Vector3(0, 1, 0);
const forward = new Vector3(0, 0, 1);
const hinge = new Vector3(0, -.041, .424);
const lipLine = z => -.036 - .10 * (z - .428);
const jawArea = (x, z) => smoothstep(z, .416, .452) * (1 - smoothstep(Math.abs(x), .036, .060));

function bindJaw(body, meshes, head) {
  const { bones, boneInverses } = body.skeleton;
  const headIndex = bones.indexOf(head);
  const jawIndex = bones.length;
  const jaw = new Bone();
  jaw.name = 'DEF_jaw';
  jaw.position.copy(hinge).applyMatrix4(body.bindMatrix).applyMatrix4(boneInverses[headIndex]);
  head.add(jaw);
  jaw.updateWorldMatrix(true, false);

  const skeleton = new Skeleton([...bones, jaw], [...boneInverses, jaw.matrixWorld.clone().invert()]);
  for (const mesh of meshes) mesh.bind(skeleton, mesh.bindMatrix);

  const { position, skinIndex, skinWeight } = body.geometry.attributes;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const z = position.getZ(vertex);
    if (z < .416) continue;
    const y = position.getY(vertex);
    // The lip line on the original sculpture slopes down toward the nose.
    // A longitudinal taper keeps the mouth corner and cheek attached.
    const lowerLip = smoothstep(lipLine(z) - y, .001, .011);
    const weight = lowerLip * jawArea(position.getX(vertex), z);
    if (weight <= .001) continue;

    let source = -1;
    let vacant = -1;
    for (let slot = 0; slot < 4; slot++) {
      const jointWeight = skinWeight.getComponent(vertex, slot);
      if (skinIndex.getComponent(vertex, slot) === headIndex && jointWeight > 0) source = slot;
      if (jointWeight === 0) vacant = slot;
    }
    if (source < 0 || vacant < 0) continue;

    const inherited = skinWeight.getComponent(vertex, source);
    skinWeight.setComponent(vertex, source, inherited * (1 - weight));
    skinIndex.setComponent(vertex, vacant, jawIndex);
    skinWeight.setComponent(vertex, vacant, inherited * weight);
  }
  skinIndex.needsUpdate = true;
  skinWeight.needsUpdate = true;
  return jaw;
}

/** Head and jaw sit on the existing cervical base. Pose deltas retain the clip's bind. */
export class YinglongHead {
  constructor(body, meshes) {
    this.head = body.skeleton.getBoneByName('DEF_head');
    this.headIndex = body.skeleton.bones.indexOf(this.head);
    this.headRest = this.head.quaternion.clone();
    this.headPosition = this.head.position.clone();
    this.jaw = bindJaw(body, meshes, this.head);
    this.jawIndex = body.skeleton.bones.indexOf(this.jaw);
    this.jawAxis = lateral.clone()
      .applyQuaternion(this.head.getWorldQuaternion(new Quaternion()).invert());
    this.parentInverse = new Quaternion();
    this.rotation = new Quaternion();
    this.axis = new Vector3();
    this.offset = new Vector3();
    this.stroke = {};
  }

  lipWeight(vertex, lower) {
    const weight = lower ? jawArea(vertex.p[0], vertex.p[2]) : 0;
    const head = vertex.j.indexOf(this.headIndex);
    let jaw = vertex.j.indexOf(this.jawIndex);
    if (head < 0 || (weight === 0 && jaw < 0)) return vertex;
    if (jaw < 0) jaw = vertex.w.findIndex((value, index) => value === 0 && index !== head);
    if (jaw < 0) return vertex;

    const j = vertex.j.slice(), w = vertex.w.slice();
    const inherited = w[head] + (j[jaw] === this.jawIndex ? w[jaw] : 0);
    j[jaw] = this.jawIndex;
    w[head] = inherited * (1 - weight);
    w[jaw] = inherited * weight;
    return { ...vertex, j, w };
  }

  splitLip(face) {
    if (!face.some(vertex => vertex.head > .5 && jawArea(vertex.p[0], vertex.p[2]) > 0)) return null;
    const signed = face.map(({ p }) => p[1] - lipLine(p[2]));
    return cutLipTriangle(
      face, signed,
      (vertex, lower) => this.lipWeight(vertex, lower),
      (a, b, fraction, lower) => this.lipWeight(interpolateVertex(a, b, fraction), lower),
    );
  }

  restore() {
    this.head.quaternion.copy(this.headRest);
    this.head.position.copy(this.headPosition);
    this.jaw.quaternion.identity();
  }

  turn(axis, radians) {
    this.axis.copy(axis).applyQuaternion(this.parentInverse);
    this.head.quaternion.premultiply(this.rotation.setFromAxisAngle(this.axis, radians));
  }

  update(motion, terminal) {
    const {
      phase, wingPhase, wingStroke, wingPower, pitch, turn, bank, change,
      anticipate = 0, strike = 0, jaw = 0, aimYaw = 0, aimPitch = 0, settle = 0, morph = 1,
    } = motion;
    const stroke = wingStroke ?? flightStroke(wingPhase, this.stroke);
    const { blend, hold, gather, release, flare } = terminal;
    const live = 1 - blend;
    const load = lerp(stroke.load, terminal.load, blend);
    const rise = lerp(stroke.rise, terminal.rise, blend);
    const recover = lerp(stroke.recover, terminal.recover, blend);
    const power = lerp(wingPower, .84, blend) * (1 - hold * .85);
    const breath = Math.sin(phase * .79);
    // Meet the outgoing head high in the shared neck frame, then lower
    // into flight as the new shoulders take the first wing stroke.
    const emergenceLift = 1 - smoothstep(morph, .08, .75);
    this.headRest.copy(this.head.quaternion);
    this.headPosition.copy(this.head.position);
    this.head.parent.getWorldQuaternion(this.parentInverse).invert();

    // Look into the turn while the chest and neck continue along the flight path.
    const yaw = clamp(aimYaw * (.72 - .38 * blend) + turn * .52 * live
      + Math.sin(phase * .77) * (.023 + .013 * hold), -.36, .36);
    const lift = clamp(
      -.28 * pitch + .06 * power * (recover - rise) + .17 * anticipate
      - .15 * strike + .13 * settle + .72 * aimPitch
      + .09 * gather - .048 * release + hold * breath * .016 + .06 * flare + .13 * emergenceLift,
      -.34, .34,
    );
    this.turn(lateral, -lift);
    this.turn(up, yaw);
    this.turn(forward, bank * .48 * live);

    // The forward reach follows the shoulder. Counter-motion at the head
    // keeps the gaze from bobbing one-for-one with each wingbeat.
    this.offset.set(
      -.012 * turn * live - .073 * emergenceLift,
      power * (.007 * recover - .014 * rise) + .009 * settle + hold * breath * .0025 + .009 * flare + .079 * emergenceLift,
      .013 * power * load + .026 * strike - .018 * anticipate - .014 * gather + .006 * release + .029 * flare,
    ).applyQuaternion(this.parentInverse);
    this.head.position.add(this.offset);

    // A small exhale on a strong stroke, a larger gape on an explicit cue.
    const exhale = .10 * load * smoothstep(power, .55, .93);
    const emergence = .22 * smoothstep(change, .04, .13) * (1 - smoothstep(change, .30, .65));
    const gape = Math.max(jaw * .47, exhale + emergence);
    this.jaw.quaternion.setFromAxisAngle(this.jawAxis, gape);
  }
}
