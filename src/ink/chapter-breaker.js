import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, DoubleSide, DynamicDrawUsage,
  Group, MathUtils, Mesh, ShaderMaterial, Vector3,
} from 'three';

const { lerp, smoothstep } = MathUtils;
const spanSegments = 32;
const faceSegments = 18;
const faceStride = faceSegments + 1;
const jetSegments = 8;
const jets = [
  // Root offset, lateral reach, forward reach, lift, width, delay.
  [-.39, -1.49, -.72, 1.06, .13, .023],
  [-.22, -1.04, .28, 1.54, .14, .000],
  [-.08, -.52, .73, 1.19, .11, .054],
  [.12, .42, -.78, 1.62, .14, .017],
  [.31, .86, -.24, 1.37, .16, .038],
  [.43, 1.46, -.57, .94, .12, .069],
  [.51, 1.67, .56, .60, .10, .098],
];

// From the back of the swell to the submerged foot of the falling lip.
const profiles = [
  [[6, -.15], [4, .02], [2.6, .21], [1.5, .45], [.55, .74], [-.22, 1],
    [-.85, .91], [-1.45, .61], [-2.5, .30], [-3.8, .06], [-6, -.16]],
  [[5.7, -.15], [4.1, .025], [2.75, .16], [1.57, .39], [.68, .74], [-.19, 1],
    [-1.20, 1.01], [-2.06, .81], [-2.13, .61], [-1.68, .49], [-2.40, .27], [-4.8, .04], [-6.5, -.16]],
  [[6, -.15], [4.4, .03], [2.9, .24], [1.75, .42], [.8, .63], [-.18, .79],
    [-1.33, .87], [-2.58, .75], [-3.35, .41], [-4.68, .12], [-7, -.16]],
].map(profile => new CatmullRomCurve3(
  profile.map(([z, height]) => new Vector3(z, height, 0)),
).getPoints(faceSegments));

const vertexShader = /* glsl */ `
  attribute float aCrown;
  varying vec2 vStroke;
  varying float vHeight, vCrown;
  varying vec3 vNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.);
    vHeight = world.y;
    vCrown = aCrown;
    vNormal = mat3(modelMatrix) * normal;
    vStroke = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vStroke;
  varying float vHeight, vCrown;
  varying vec3 vNormal;
  uniform float uRoll, uTime;

  float hash(vec2 p) {
    p = fract(p * vec2(.1031, .11369));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
      mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
  }

  void main() {
    vec2 p = vStroke;
    float wash = .65 * noise(p * vec2(6.2, 8.4))
      + .35 * noise(p * vec2(18.1, 22.4) + 5.6);
    float striation = noise(vec2(p.x * 39. + p.y * 15. - uTime * 2.4, p.y * 7. + 2.));
    float grain = noise(vec2(p.x * 61. + p.y * 9., p.y * 142. - uTime * 7.));
    float face = 1. - abs(normalize(vNormal).y);
    float side = smoothstep(.02, .19, min(p.x, 1. - p.x));
    float foot = smoothstep(.015, .95, vHeight);
    float weight = side * foot;

    // Follow the geometric crest with a torn line of paper, then drag its
    // foam down the face in broken strokes with dark channels between.
    float crest = vCrown + .046 * uRoll + .053 * (wash - .5);
    float fromLip = p.y - crest;
    float scud = noise(vec2(p.x * 25. + p.y * 8., p.y * 43. - uTime * 3.));
    float lip = (1. - smoothstep(.009, .049 + .040 * scud, abs(fromLip)))
      * (.47 + .53 * smoothstep(.22, .68, striation * .75 + grain * .25));
    float drag = smoothstep(.015, .058, fromLip) * (1. - smoothstep(.14, .37, fromLip));
    float rake = fromLip * 44. + 3.3 * wash + 1.4 * sin(p.x * 13. + uTime * 2.5);
    float threads = (1. - smoothstep(.045, .40, abs(sin(rake))))
      * smoothstep(.31, .63, striation * .54 + grain * .46) * drag;
    float scumbledEdge = (1. - smoothstep(.005, .048, abs(fromLip - .094 - .085 * (wash - .5))))
      * smoothstep(.23, .72, scud * .69 + grain * .31);
    float scuff = smoothstep(.56, .81, grain * .58 + scud * .42) * drag;
    float foam = weight * (.92 * lip + .77 * threads + .68 * scumbledEdge + .31 * scuff);
    float faceShade = smoothstep(.02, .08, fromLip) * (1. - smoothstep(.13, .32, fromLip));
    float pooling = smoothstep(.45, .72, wash) * drag;
    float pigment = mix(.087, clamp(.36 + .45 * wash + .21 * face + .24 * faceShade
      - .13 * striation + .15 * pooling + .11 * (grain - .5), 0., .98), weight);
    gl_FragColor = vec4(1. - pigment, clamp(foam, 0., 1.), .23 + .31 * striation + .26 * grain, 1.);
  }
`;

const sprayVertex = /* glsl */ `
  attribute float aStrength;
  varying vec2 vBrush;
  varying float vStrength;
  void main() {
    vBrush = uv;
    vStrength = aStrength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const sprayFragment = /* glsl */ `
  varying vec2 vBrush;
  varying float vStrength;
  void main() {
    float edge = 1. - abs(vBrush.x * 2. - 1.);
    float tear = .54 + .25 * sin(29. * vBrush.y + 4. * vBrush.x)
      + .19 * sin(57. * vBrush.y - 7. * vBrush.x);
    float foam = smoothstep(.08, .52, edge * (.44 + .56 * tear)) * vStrength;
    if (foam < .12) discard;
    float ink = .18 + .39 * (1. - edge) * (1. - foam);
    gl_FragColor = vec4(1. - ink, .96 * foam, .46 + .21 * tear, 1.);
  }
`;

function makeSpray() {
  const stride = (jetSegments + 1) * 2;
  const count = jets.length * stride;
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
  const strength = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
  const uv = new BufferAttribute(new Float32Array(count * 2), 2);
  const index = [];
  for (let jet = 0; jet < jets.length; jet++) {
    for (let step = 0; step <= jetSegments; step++) {
      const offset = jet * stride + step * 2;
      uv.setXY(offset, 0, step / jetSegments);
      uv.setXY(offset + 1, 1, step / jetSegments);
      if (step < jetSegments) index.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
  }
  geometry.setAttribute('position', position);
  geometry.setAttribute('aStrength', strength);
  geometry.setAttribute('uv', uv);
  geometry.setIndex(index);
  const mesh = new Mesh(geometry, new ShaderMaterial({
    vertexShader: sprayVertex, fragmentShader: sprayFragment, side: DoubleSide,
  }));
  mesh.name = '破浪 · 飞白';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.inkIdSuppressed = true;
  return { mesh, position, strength, stride };
}

/** A single shot-local breaker that rolls into the sea-to-valley flight path. */
export class ChapterBreaker {
  constructor() {
    this.root = new Group();
    this.root.visible = false;
    const count = (spanSegments + 1) * faceStride;
    this.positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.crown = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    this.profileHeights = new Float32Array(faceStride);
    const uv = new BufferAttribute(new Float32Array(count * 2), 2);
    const indices = [];
    for (let i = 0; i <= spanSegments; i++) {
      for (let j = 0; j <= faceSegments; j++) {
        const index = i * faceStride + j;
        uv.setXY(index, i / spanSegments, j / faceSegments);
        if (i < spanSegments && j < faceSegments) {
          indices.push(index, index + 1, index + faceStride,
            index + 1, index + faceStride + 1, index + faceStride);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('uv', uv);
    geometry.setAttribute('aCrown', this.crown);
    geometry.setIndex(indices);
    this.material = new ShaderMaterial({
      vertexShader, fragmentShader, side: DoubleSide,
      uniforms: { uRoll: { value: 0 }, uTime: { value: 0 } },
    });
    const wave = new Mesh(geometry, this.material);
    wave.name = '沧溟入千山 · 卷浪';
    wave.frustumCulled = false;
    wave.userData.inkTint = '#253d49';
    wave.userData.inkTintAmount = .75;
    this.spray = makeSpray();
    this.root.add(wave, this.spray.mesh);
    this.geometry = geometry;
  }

  prepare(renderer, camera) {
    // Compile even while the effect is outside the live shot.
    const visible = this.root.visible;
    const sprayVisible = this.spray.mesh.visible;
    this.root.visible = true;
    this.spray.mesh.visible = true;
    try {
      return renderer.compileAsync(this.root, camera);
    } finally {
      this.root.visible = visible;
      this.spray.mesh.visible = sprayVisible;
    }
  }

  update(age, origin, head) {
    this.root.visible = Boolean(origin && age > 1.94 && age < 3.86);
    if (!this.root.visible) return;
    this.root.position.set(origin.x, 0, origin.z);
    this.root.rotation.y = origin.angle;
    const dx = head ? head.x - origin.x : 0;
    const dz = head ? head.z - origin.z : 0;
    const sin = Math.sin(origin.angle);
    const cos = Math.cos(origin.angle);
    const headX = dx * cos - dz * sin;
    const headZ = dx * sin + dz * cos;
    const impact = smoothstep(age, 2.78, 3.01) * (1 - smoothstep(age, 3.29, 3.51));
    const grow = smoothstep(age, 1.94, 2.91);
    const fall = smoothstep(age, 3.03, 3.82);
    const roll = smoothstep(age, 2.41, 3.24);
    this.material.uniforms.uRoll.value = roll;
    this.material.uniforms.uTime.value = age;
    const advance = 19.5 - 3.2 * smoothstep(age, 2.04, 3.85);
    const [open, curl, spent] = profiles;
    for (let i = 0; i <= spanSegments; i++) {
      const along = i / spanSegments * 2 - 1;
      const span = (1 - along * along) ** .54;
      const x = 14.1 * along - 1.1;
      const bend = -3.4 * along + 1.15 * along * along + .51 * Math.sin(along * 5.7 + age);
      const shoulder = .91 + .15 * Math.sin(along * 6.4 + age * 2.4)
        + .071 * Math.sin(along * 17. + age * 2.8) + .19 * along;
      const fold = smoothstep(age - .16 * along, 2.41, 3.24);
      const crossing = impact * (1 - smoothstep(.40, 3.4, Math.abs(x - headX)));
      const height = 4.48 * grow * (1 - .60 * fall) * span * shoulder * (1 - .43 * crossing);
      let crownIndex = 0;
      let peak = -Infinity;
      for (let j = 0; j <= faceSegments; j++) {
        const heightAt = lerp(lerp(open[j].y, curl[j].y, fold), spent[j].y, fall);
        const z = lerp(lerp(open[j].x, curl[j].x, fold), spent[j].x, fall);
        const tooth = crossing * .20 * Math.sin(16. * along + age * 6.) * smoothstep(.4, .93, heightAt);
        this.profileHeights[j] = heightAt;
        if (heightAt > peak) {
          peak = heightAt;
          crownIndex = j;
        }
        this.positions.setXYZ(i * faceStride + j, x, -.53 + height * heightAt + tooth,
          advance + bend + z - crossing * 1.28 * smoothstep(.35, .86, heightAt));
      }
      const before = this.profileHeights[Math.max(0, crownIndex - 1)];
      const after = this.profileHeights[Math.min(faceSegments, crownIndex + 1)];
      const curvature = 2 * (2 * peak - before - after);
      const shift = curvature > 1e-4 ? (after - before) / curvature : 0;
      const crown = MathUtils.clamp((crownIndex + shift) / faceSegments, 0, 1);
      for (let j = 0; j <= faceSegments; j++) this.crown.setX(i * faceStride + j, crown);
    }
    this.positions.needsUpdate = true;
    this.crown.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.updateSpray(age, head, headX, headZ);
  }

  updateSpray(age, head, headX, headZ) {
    const { mesh, position, strength, stride } = this.spray;
    mesh.visible = Boolean(head && age >= 2.93 && age <= 3.42);
    if (!mesh.visible) return;
    const row = Math.round(MathUtils.clamp((headX + 1.1) / 14.1 * .5 + .5, 0, 1) * spanSegments);
    let crest = row * faceStride;
    for (let step = 1; step <= faceSegments; step++) {
      const index = row * faceStride + step;
      if (this.positions.getY(index) > this.positions.getY(crest)) crest = index;
    }
    const rootY = Math.min(this.positions.getY(crest) + .20, head.y + .02);
    const rootZ = lerp(this.positions.getZ(crest), headZ + .42, .70);
    for (let jet = 0; jet < jets.length; jet++) {
      const [rootOffset, across, forward, lift, width, delay] = jets[jet];
      const phase = MathUtils.clamp((age - 2.91 - delay) / .465, 0, 1);
      const opacity = smoothstep(phase, .01, .17) * (1 - smoothstep(phase, .65, 1));
      const stretch = .50 + 1.02 * smoothstep(phase, 0, .73);
      for (let step = 0; step <= jetSegments; step++) {
        const t = step / jetSegments;
        const x = headX + rootOffset + across * t ** 1.34 * stretch;
        const y = rootY + lift * (2.25 * t - 1.20 * t * t) * stretch - .25 * phase * t;
        const z = rootZ + (forward - .22) * t * stretch + .24 * Math.sin(t * Math.PI);
        const radius = 2.05 * width * (1 - .9 * t) * (.69 + .31 * Math.sin(t * 5.5 + jet));
        const index = jet * stride + step * 2;
        const ink = opacity * (1 - .46 * t * t);
        position.setXYZ(index, x - radius * .68, y, z - radius);
        position.setXYZ(index + 1, x + radius * .68, y, z + radius);
        strength.setX(index, ink);
        strength.setX(index + 1, ink);
      }
    }
    position.needsUpdate = true;
    strength.needsUpdate = true;
  }
}
