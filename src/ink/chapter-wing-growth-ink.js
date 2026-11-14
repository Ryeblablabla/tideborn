import {
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage,
  MathUtils, Mesh, ShaderMaterial, Vector3,
} from 'three';

const wingAttach = [0, 1, .255];
const sections = 16;
const verticesPerWing = (sections + 1) * 2;
const { lerp, smoothstep } = MathUtils;

const vertexShader = /* glsl */ `
  attribute float aInkLoad;
  varying vec2 vBrush;
  varying float vInkLoad;
  void main() {
    vBrush = uv;
    vInkLoad = aInkLoad;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vBrush;
  varying float vInkLoad;
  void main() {
    float s = vBrush.x;
    float fiber = fract(sin(dot(floor(vBrush * vec2(88., 34.)), vec2(89.7, 171.3))) * 43758.5453);
    float edge = abs(vBrush.y * 2. - 1.);
    float torn = edge + sin(s * 59.) * .067 + (fiber - .5) * .12;
    float profile = 1. - smoothstep(.60, .995, torn);
    float tip = 1. - smoothstep(.80, 1., s);
    float alpha = vInkLoad * profile * tip;
    if (alpha < .01) discard;
    // Shared ink buffer: reflectance, paper reserve, grain, coverage.
    gl_FragColor = vec4(.075 + .16 * smoothstep(.52, 1., edge), 0., .32 + .31 * fiber, alpha);
  }
`;

function readJoint(actor, joint, target) {
  return actor.contactWorld(joint.bone.getWorldPosition(target), wingAttach, target);
}

/** Ink grows along the posed wing axes before their feathers fill the shape. */
export class ChapterWingGrowthInk {
  constructor() {
    const count = 2 * verticesPerWing;
    this.positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.loads = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    const uv = new BufferAttribute(new Float32Array(count * 2), 2);
    const indices = [];
    for (let wing = 0; wing < 2; wing++) {
      for (let i = 0; i <= sections; i++) {
        const vertex = wing * verticesPerWing + 2 * i;
        uv.setXY(vertex, i / sections, 0);
        uv.setXY(vertex + 1, i / sections, 1);
        if (i < sections) indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('uv', uv);
    geometry.setAttribute('aInkLoad', this.loads);
    geometry.setIndex(indices);
    const material = new ShaderMaterial({
      vertexShader, fragmentShader, side: DoubleSide, transparent: true, depthWrite: false,
      allowOverride: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = '翼根·湿墨生长';
    this.mesh.userData.inkIdSuppressed = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    this.joints = Array.from({ length: 4 }, () => new Vector3());
    this.distances = new Float32Array(4);
    this.eye = new Vector3();
    this.point = new Vector3();
    this.facing = new Vector3();
    this.width = new Vector3();
    this.tangent = new Vector3();
  }

  prepare(renderer, camera) {
    const previous = this.mesh.visible;
    this.mesh.visible = true;
    try {
      return renderer.compileAsync(this.mesh, camera);
    } finally {
      this.mesh.visible = previous;
    }
  }

  update(transition, actor, camera) {
    this.mesh.visible = false;
    const age = transition?.age;
    const wings = actor?.flightLimbs?.wings;
    const active = transition && (transition.switched || actor?.motion?.chapterWing);
    if (!active || !wings || !camera || !(age >= 4.08 && age < 4.96)) return;
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    const scale = actor.root.scale.x;
    for (let wing = 0; wing < 2; wing++) {
      const offset = wing * .045;
      const opening = actor.chapterWingGrowth?.[wing] ?? 0;
      const reach = smoothstep(age - offset, 4.08, 4.55);
      const load = .67 * smoothstep(age - offset, 4.08, 4.32)
        * (1 - smoothstep(age, 4.55, 4.96)) * (1 - smoothstep(opening, .30, .87));
      const firstVertex = wing * verticesPerWing;
      this.loads.array.fill(load, firstVertex, firstVertex + verticesPerWing);
      if (load < .01) continue;
      for (let i = 0; i < 4; i++) readJoint(actor, wings[wing].joints[i], this.joints[i]);
      const [socket, shoulder, elbow, wrist] = this.joints;
      // Keep the start inside the shoulder. Extend the live bone directions
      // slightly ahead of the tiny emerging mesh; the lead vanishes as it grows.
      socket.lerp(shoulder, .30);
      const lead = 1 + lerp(0, .79, reach) * (1 - smoothstep(opening, .08, .76));
      elbow.sub(shoulder).multiplyScalar(lead).add(shoulder);
      wrist.sub(shoulder).multiplyScalar(lead).add(shoulder);
      for (let i = 1; i < 4; i++) {
        this.distances[i] = this.distances[i - 1] + this.joints[i - 1].distanceTo(this.joints[i]);
      }
      const visibleLength = this.distances[3] * lerp(.10, 1, reach);
      for (let i = 0; i <= sections; i++) {
        const t = i / sections;
        const distance = visibleLength * t;
        const link = distance < this.distances[1] ? 0 : distance < this.distances[2] ? 1 : 2;
        const start = this.joints[link], end = this.joints[link + 1];
        const length = this.distances[link + 1] - this.distances[link];
        this.point.copy(start).lerp(end, (distance - this.distances[link]) / Math.max(length, .00001));
        this.facing.copy(this.eye).sub(this.point).normalize();
        this.tangent.copy(this.joints[Math.min(3, link + 2)]).sub(start).normalize();
        this.width.crossVectors(this.facing, this.tangent).normalize();
        const brushWidth = scale * lerp(.004, .015, reach) * (1 - .86 * smoothstep(.48, 1, t));
        this.width.multiplyScalar(brushWidth);
        const vertex = firstVertex + 2 * i;
        const { x, y, z } = this.point;
        this.positions.setXYZ(vertex, x - this.width.x, y - this.width.y, z - this.width.z);
        this.positions.setXYZ(vertex + 1, x + this.width.x, y + this.width.y, z + this.width.z);
      }
      this.mesh.visible = true;
    }
    this.positions.needsUpdate = true;
    this.loads.needsUpdate = true;
  }
}
