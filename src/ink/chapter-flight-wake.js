import {
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage,
  MathUtils, Mesh, ShaderMaterial, Vector3,
} from 'three';

const wingAttach = [0, 1, .255];
const segments = 18;
const lifespan = .74;
const seaAttachment = .10;
const verticesPerWing = (segments + 1) * 2;
const up = new Vector3(0, 1, 0);
const { clamp, lerp, smoothstep } = MathUtils;

const vertexShader = /* glsl */ `
  varying vec2 vStroke;
  varying float vSide;
  attribute float aSide;
  void main() {
    vStroke = uv;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vStroke;
  varying float vSide;
  uniform float uOpacity, uAge, uRain;

  float randomInk(vec2 p) {
    return fract(sin(dot(p, vec2(89.7, 171.3))) * 43758.5453);
  }

  void main() {
    float s = vStroke.x;
    float edge = abs(vStroke.y * 2. - 1.);
    float breakInk = sin(s * 31. + vSide * 1.8) * .25 + sin(s * 67. - vSide) * .16;
    float fiber = randomInk(floor(vec2(s * 105., vStroke.y * 46. + vSide * 7.)));
    float dry = smoothstep(.23, .72, .51 + breakInk + (fiber - .5) * .22);
    float torn = .18 * sin(s * 63. + vSide) + .09 * (fiber - .5);
    float profile = 1. - smoothstep(.19, .90, edge + torn);
    float ends = smoothstep(.018, .13, s) * (1. - smoothstep(.78, .99, s));
    // The sea wash keeps a charcoal edge and opens to paper at its crest.
    // The two strokes break at different points as the air separates.
    float drift = sin(s * 21. + vSide * 2.7 - uAge * 2.1);
    float tear = smoothstep(.13, .78, .57 + .24 * drift + (fiber - .5) * .21);
    float seaDry = dry * (.61 + .39 * tear);
    float alpha = uOpacity * profile * ends * mix(seaDry, dry, uRain);
    if (alpha < .01) discard;
    // The shared ink renderer expects pre-blend reflectance, reserve and grain.
    float mist = smoothstep(.12, .85, edge);
    float lightLip = 1. - smoothstep(.11, .42, abs(vStroke.y - .66 - .08 * drift));
    float value = mix(.41 + .18 * mist + .21 * lightLip + .07 * uAge, .25 + .43 * mist, uRain);
    float reserve = mix(.27 + .54 * lightLip, .09 + .36 * mist, uRain);
    gl_FragColor = vec4(value, reserve,
      .31 + .34 * fiber, alpha);
  }
`;

function readContact(actor, bone, point) {
  return actor.contactWorld(bone.getWorldPosition(point), wingAttach, point);
}

/** A single world-space stroke batch released at the first wing press. */
export class ChapterFlightWake {
  constructor() {
    const count = verticesPerWing * 2;
    const geometry = new BufferGeometry();
    this.positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    const uv = new BufferAttribute(new Float32Array(count * 2), 2);
    const side = new BufferAttribute(new Float32Array(count), 1);
    const indices = [];
    for (let wing = 0; wing < 2; wing++) {
      for (let i = 0; i <= segments; i++) {
        const vertex = wing * verticesPerWing + i * 2;
        uv.setXY(vertex, i / segments, 0);
        uv.setXY(vertex + 1, i / segments, 1);
        side.setX(vertex, wing);
        side.setX(vertex + 1, wing);
        if (i < segments) indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
    }
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('uv', uv);
    geometry.setAttribute('aSide', side);
    geometry.setIndex(indices);
    const material = new ShaderMaterial({
      vertexShader, fragmentShader, side: DoubleSide, transparent: true, depthWrite: false,
      allowOverride: false,
      uniforms: {uOpacity: {value: 0}, uAge: {value: 0}, uRain: {value: 0}},
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = '初振 · 近翼飞白';
    this.mesh.userData.inkIdSuppressed = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    this.transition = null;
    this.firing = false;
    this.forward = new Vector3();
    this.cross = new Vector3();
    this.point = new Vector3();
    this.tangent = new Vector3();
    this.widthAxis = new Vector3();
    this.wings = Array.from({length: 2}, () => ({
      shoulder: new Vector3(), wrist: new Vector3(), primaries: new Vector3(), outflow: new Vector3(),
      liveShoulder: new Vector3(), liveWrist: new Vector3(), livePrimaries: new Vector3(),
    }));
  }

  prepare(renderer, camera) {
    const visible = this.mesh.visible;
    this.mesh.visible = true;
    try {
      return renderer.compileAsync(this.mesh, camera);
    } finally {
      this.mesh.visible = visible;
    }
  }

  update(shot, actor, heading, pressAt) {
    const rain = shot?.phase === 'blessing';
    if (this.transition !== shot) {
      this.transition = shot;
      this.firing = false;
    }
    this.mesh.visible = false;
    const elapsed = shot?.age - pressAt;
    const rig = actor?.flightLimbs?.wings;
    const duration = rain ? 1.16 : lifespan;
    const active = rain || shot?.switched || (shot && actor?.motion?.chapterWing);
    if (!active || !rig || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > duration) return;
    const start = smoothstep(elapsed, 0, rain ? .20 : .067);
    const fade = 1 - smoothstep(elapsed, rain ? .47 : .27, duration);
    const opacity = (rain ? .74 : .61) * start * fade;
    if (opacity < .012) return;
    if (!this.firing || (!rain && elapsed <= seaAttachment)) {
      this.firing = true;
      this.forward.set(Math.sin(heading), 0, Math.cos(heading));
      this.cross.crossVectors(up, this.forward);
      for (let i = 0; i < this.wings.length; i++) {
        const {side,joints} = rig[i];
        const wake = this.wings[i];
        readContact(actor, joints[1].bone, wake.shoulder);
        readContact(actor, joints[3].bone, wake.wrist);
        readContact(actor, joints[4].bone, wake.primaries);
        if (!rain) {
          wake.outflow.copy(wake.primaries).sub(wake.wrist);
          wake.outflow.y = 0;
          wake.outflow.addScaledVector(this.cross, .28 * side).normalize();
          // Hold the original outward half plane even if the pinion is
          // briefly pointing back across the chest during the press.
          const outward = wake.outflow.dot(this.cross) * side;
          if (outward < .22) wake.outflow.addScaledVector(this.cross, (.40 - outward) * side).normalize();
        }
      }
    }
    // The first few frames follow the wing; the laid stroke then separates
    // and stays on the air it disturbed instead of following the next flap.
    const attach = rain ? 1 - smoothstep(elapsed, .03, .19) : Number(elapsed <= seaAttachment);
    const age = clamp(elapsed / duration, 0, 1);
    const drift = rain ? 0 : smoothstep(elapsed, seaAttachment, duration);
    for (let i = 0; i < this.wings.length; i++) {
      const {side, joints} = rig[i];
      const wake = this.wings[i];
      readContact(actor, joints[1].bone, wake.liveShoulder).lerp(wake.shoulder, 1 - attach);
      readContact(actor, joints[3].bone, wake.liveWrist).lerp(wake.wrist, 1 - attach);
      readContact(actor, joints[4].bone, wake.livePrimaries).lerp(wake.primaries, 1 - attach);
      wake.liveShoulder.lerp(wake.liveWrist, rain ? .34 : .24);
      wake.livePrimaries.lerp(wake.liveWrist, rain ? .20 : .08);
      this.writeStroke(wake, side, i, age, rain, drift);
    }
    this.positions.needsUpdate = true;
    this.mesh.material.uniforms.uOpacity.value = opacity;
    this.mesh.material.uniforms.uAge.value = age;
    this.mesh.material.uniforms.uRain.value = Number(rain);
    this.mesh.visible = true;
  }

  writeStroke(wake, side, index, age, rain, drift) {
    const a = wake.liveShoulder, b = wake.liveWrist, c = wake.livePrimaries;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      this.point.copy(a).multiplyScalar(u * u).addScaledVector(b, 2 * u * t).addScaledVector(c, t * t);
      if (rain) {
        this.point.addScaledVector(this.forward, -(.27 + 1.53 * age + .58 * t * t));
        this.point.addScaledVector(this.cross, side * age * (.12 + .40 * t));
        this.point.y -= .23 + .52 * age + .25 * t * t;
        this.point.addScaledVector(this.forward, -1.48 * age);
        this.point.y -= 2.3 * age * age;
      } else {
        const open = drift * (.25 + .75 * t);
        const turn = t * t;
        this.point.addScaledVector(this.forward, -(.095 + .35 * turn + (1.28 + .48 * turn) * drift));
        this.point.addScaledVector(this.cross, side * open * (side > 0 ? 1.52 : 1.26));
        this.point.addScaledVector(wake.outflow, open * .77);
        this.point.y -= .083 + .15 * turn + (.82 + .65 * turn) * drift;
      }
      this.tangent.copy(b).sub(a).multiplyScalar(u).addScaledVector(this.widthAxis.copy(c).sub(b), t);
      this.widthAxis.crossVectors(up, this.tangent);
      if (this.widthAxis.lengthSq() < 1e-6) this.widthAxis.copy(this.forward);
      this.widthAxis.normalize().addScaledVector(up, .40).normalize();
      const taper = Math.sin(Math.PI * t);
      const width = rain ? lerp(.11, .38, taper) * (1 + 1.5 * age)
        : lerp(.071, .24 + .11 * drift, taper) * (1 + drift * (side > 0 ? .54 : .41));
      const vertex = index * verticesPerWing + i * 2;
      this.positions.setXYZ(vertex,
        this.point.x - this.widthAxis.x * width,
        this.point.y - this.widthAxis.y * width,
        this.point.z - this.widthAxis.z * width);
      this.positions.setXYZ(vertex + 1,
        this.point.x + this.widthAxis.x * width,
        this.point.y + this.widthAxis.y * width,
        this.point.z + this.widthAxis.z * width);
    }
  }
}
