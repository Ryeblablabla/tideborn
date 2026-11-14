import * as THREE from 'three';
import { CurveField } from './growth/curve-field.js';
import { FormLimbs } from './form-limbs.js';
import { FormHead, shapeSurfaceHead } from './form-head.js';
import { jawSides } from './form-jaw-binding.js';
import { splitJawGeometry } from './growth/jaw-cut.js';
import { SculptManeFlow, sculptWhisker } from './growth/mane-flow.js';

const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
const HEAD_Z = .5;
const HEAD_ANCHOR = .13;
const FLOW_STEPS = 128;
const STRIDE = 19;
const smooth = THREE.MathUtils.smoothstep;
const bodyGirth = [
  { rise: .25, crest: .40, taper: .60, tail: .87, width: -.035, depth: -.085, belly: 0 },
  { rise: .13, crest: .32, taper: .40, tail: .87, width: .055, depth: .25, belly: .037 },
];
const jiaolongTail = { start: .750, end: .836, offset: .102 };

function bandProgress(distance, band) {
  const fraction = clamp((distance - band.a) / (band.b - band.a));
  return fraction * fraction * (3 - 2 * fraction);
}

function bandSlope(distance, band) {
  const fraction = clamp((distance - band.a) / (band.b - band.a));
  return 6 * fraction * (1 - fraction) / (band.b - band.a);
}

function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function easeSlope(value, low, high) {
  const t = clamp((value - low) / (high - low));
  return 6 * t * (1 - t) / (high - low);
}

function shapePythonThroat(restP, restN, growth) {
  for (let i = 0; i < growth.count; i++) {
    const distance = growth.getX(i);
    if (distance <= .150 || distance >= .270) continue;
    const k = i * 3;
    const y = restP[k + 1];
    const underside = 1 - smooth(y, -.017, .028);
    // Spread the sculpt's lower neck expansion over a longer axial span.
    const offset = .021 * (smooth(distance, .150, .225) - smooth(distance, .190, .270)) -
      .019 * (smooth(distance, .185, .215) - smooth(distance, .221, .266));
    const along = .021 * (easeSlope(distance, .150, .225) - easeSlope(distance, .190, .270)) -
      .019 * (easeSlope(distance, .185, .215) - easeSlope(distance, .221, .266));
    restP[k + 1] -= underside * offset;
    const ny = restN[k + 1] / (1 + offset * easeSlope(y, -.017, .028));
    const nz = restN[k + 2] - ny * underside * along;
    const length = Math.hypot(restN[k], ny, nz) || 1;
    restN[k] /= length;
    restN[k + 1] = ny / length;
    restN[k + 2] = nz / length;
  }
}

function centerAt(band, distance, axis) {
  const { front, middle, rear } = band.data.profiles;
  const fraction = clamp((distance - band.a) / (band.b - band.a));
  const middleAt = clamp((HEAD_Z - middle.z - band.a) / (band.b - band.a), .05, .95);
  const across = (middle.center[axis] - THREE.MathUtils.lerp(front.center[axis], rear.center[axis], middleAt))
    / (middleAt * (1 - middleAt));
  return THREE.MathUtils.lerp(front.center[axis], rear.center[axis], fraction) + across * fraction * (1 - fraction);
}

/**
 * Every longitudinal strip is a conforming subdivision of original faces.
 * Growth distributes arc length only over two bands while the rest of the
 * sculpt translates along the spine. No independent contour join can tear.
 */
export class FormGrowth {
  constructor(asset, data, renderer) {
    this.data = data;
    this.stage = data.stage;
    this.root = new THREE.Group();
    this.root.name = data.id + '_continuous';
    this.field = new CurveField(renderer, HEAD_Z);
    this.extra = 0;
    this.bodyEmergence = 1;
    this.targetExtra = 0;
    this.hipExtra = 0;
    this.hipRatio = .58;
    this.time = 0;
    this.frame = new Float64Array(12);
    this.anchorFrame = new Float64Array(12);
    this.contactPoint = new THREE.Vector3();
    this.clawContact = { point: new THREE.Vector3(), digit: 0, grip: null };
    this.clawSample = new THREE.Vector3();
    this.head = new FormHead(this.stage);
    this.maneFlow = this.stage >= 2 ? new SculptManeFlow(this.stage) : null;
    this.limbs = this.stage >= 2 ? new FormLimbs(this.stage) : null;
    this.radial = new Float64Array(4);
    this.sections = data.gaps.map(gap => ({
      data: gap,
      a: HEAD_Z - gap.frontCutZ,
      b: HEAD_Z - gap.rearCutZ,
      flow: new Float32Array((FLOW_STEPS + 1) * 4),
      flowLength: 0,
    }));

    this.meshes = [];
    asset.scene.traverse(source => {
      if (!source.isMesh) return;
      const lipSides = jawSides(source.geometry, this.head);
      const geometry = splitJawGeometry(source.geometry, (_x, _y, _z, index) => lipSides[index],
        (x, y, z) => this.head.jawRegion(x, y, z));
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: '#afb3b3', roughness: 1, side: THREE.DoubleSide,
      }));
      mesh.name = 'Original_' + data.id;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      const restP = geometry.attributes.position.array.slice();
      const restN = geometry.attributes.normal.array.slice();
      const growth = geometry.attributes._growth;
      const flex = geometry.attributes._flex;
      const jaw = geometry.attributes.aJawWeight;
      if (this.stage === 1) shapePythonThroat(restP, restN, growth);
      if (this.stage < 2) shapeSurfaceHead(this.stage, restP, restN, growth);
      const channels = new Float32Array(growth.count * STRIDE);
      const maneFlex = new Float32Array(growth.count);
      const forearmInk = this.stage === 3 ? new Float32Array(growth.count * 2) : null;
      for (let i = 0; i < growth.count; i++) {
        const distance = growth.getX(i);
        let anchor = growth.getZ(i);
        const [x, y, z] = restP.subarray(i * 3, i * 3 + 3);
        const base = i * STRIDE;
        if (this.limbs) {
          const first = this.limbs.shoulderWeight(this.limbs.legs[0], x, y, z);
          const second = this.limbs.shoulderWeight(this.limbs.legs[1], x, y, z);
          channels[base + 17] = first * (1 - .5 * second);
          channels[base + 18] = second * (1 - .5 * first);
          let crest = this.stage === 2
            ? smooth(y, .10, .145) * smooth(z, -.074, -.045)
            : smooth(y, .065, .115) * smooth(z, .005, .085);
          const collar = this.sections[0].data.frontCutZ;
          const beforeBand = smooth(z, collar + .012, collar + .108);
          const highLock = this.stage === 2 ? smooth(y,.158,.222) : smooth(y,.134,.200);
          // Behind the collar, the high sculpted locks follow the head
          // while the dorsal skin follows the growing trunk underneath.
          crest *= Math.max(beforeBand,highLock);
          crest = Math.max(crest, this.maneFlow.headWeight?.(x, y, z, flex.getX(i)) ?? 0);
          // The throat lies above the shoulder sockets. Skin below it
          // follows the moving chest and clavicle rather than the jaw.
          const chest = smooth(Math.max(first, second), .16, .71) * (1 - smooth(y, -.055, .045));
          const neck = smooth(z, .21, .34) * (1 - chest);
          anchor = HEAD_ANCHOR;
          growth.setXYZ(i, distance, Math.max(neck, crest), anchor);
        }
        const bandIndex = this.sections.findIndex(band => distance > band.a && distance < band.b);
        const band = this.sections[bandIndex];
        const whisker = this.maneFlow
          ? sculptWhisker(x, y, z) * (1 - smooth(this.head.jawRegion(x, y, z), .10, .45))
          : 0;
        let nativeFlex=flex.getX(i);
        if(this.maneFlow){
          // The old export makes every vertex ahead of z=.27 rigid. Carry
          // a continuous crown mask across that plane before reaching the brow.
          const crown=smooth(y,this.stage===2?.118:.108,this.stage===2?.246:.216)
            *(1-smooth(z,.277,.349))*(1-smooth(Math.abs(x),.14,.24));
          nativeFlex=THREE.MathUtils.lerp(nativeFlex,crown,smooth(z,.219,.256));
        }
        maneFlex[i] = Math.max(nativeFlex, whisker * .82, (this.maneFlow?.whiskerFlex(x, y, z) ?? 0) * .60);
        channels.set([
          bandProgress(distance, this.sections[0]),
          bandProgress(distance, this.sections[1]),
          bandSlope(distance, this.sections[0]),
          bandSlope(distance, this.sections[1]),
          bandProgress(anchor, this.sections[0]),
          bandProgress(anchor, this.sections[1]),
          maneFlex[i],
          bandIndex,
          band ? centerAt(band, distance, 0) : 0,
          band ? centerAt(band, distance, 1) : 0,
        ], i * STRIDE);
        if (this.limbs) {
          this.limbs.bind(x, y, z, channels, base + 10);
          const legIndex = channels[base + 10];
          const leg = this.limbs.legs[legIndex];
          if (forearmInk && !leg.rear && channels[base + 11] > .35) {
            const along = ((x - leg.elbow.x) * leg.lower.x + (y - leg.elbow.y) * leg.lower.y +
              (z - leg.elbow.z) * leg.lower.z) / leg.lowerLength;
            forearmInk[i * 2 + legIndex] = smooth(channels[base + 11], .35, .72) * smooth(along, -.09, .18) *
              (1 - smooth(along, .81, 1.09)) * (1 - smooth(channels[base + 15], .49, .93));
          }
          if (!leg.rear && channels[base + 14] > .45) {
            const digit = leg.digits[channels[base + 13]];
            const point = digit.endpoint;
            const distance = (x - point.x) ** 2 + (y - point.y) ** 2 + (z - point.z) ** 2;
            if (distance < digit.vertexDistance) {
              digit.vertexDistance = distance;
              digit.vertex = { mesh, index: i };
              digit.contactTip = this.stage === 3 && channels[base + 11] === 1 && channels[base + 12] === 1 &&
                channels[base + 14] === 1 && channels[base + 15] === 1 && maneFlex[i] < .06
                ? new THREE.Vector3(x, y, z) : null;
            }
          }
        }
        channels[base + 16] = jaw.getX(i);
      }
      geometry.setAttribute('inkRestPosition', new THREE.BufferAttribute(restP.slice(), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('inkRestNormal', new THREE.BufferAttribute(restN.slice(), 3));
      if (forearmInk) geometry.setAttribute('aForearmInk', new THREE.BufferAttribute(forearmInk, 2));
      this.meshes.push({ mesh, kind: 'surface', restP, restN, channels, maneFlex });
    });
  }

  setAddedLength(value, { immediate = false } = {}) {
    this.targetExtra = Math.max(0, value);
    if (immediate) this.extra = this.targetExtra;
  }

  setSpine(points) {
    const path = [];
    for (const point of points) {
      if (!Number.isFinite(point.x + point.y + point.z)) continue;
      if (!path.length || point.distanceToSquared(path.at(-1)) > 1e-10) path.push(point);
    }
    if (!path.length) return;
    if (path.length === 1) {
      const oldCurve = this.field.customSpine;
      const direction = oldCurve?.getTangent(0) || new THREE.Vector3(0, 0, -1);
      path.push(path[0].clone().add(direction));
    }
    this.field.customSpine = new THREE.CatmullRomCurve3(path);
  }

  updateBandFlow(bandIndex, extra) {
    const band = this.sections[bandIndex];
    const length = band.b - band.a + extra;
    if (Math.abs(length - band.flowLength) < 1e-6) return;
    band.flowLength = length;
    const amplitude = [.105, .163, .151, .143][this.stage] * ease((extra - .055) / .74);
    const shoulder = Math.min(length * .4, .19);
    const phase = this.stage * 1.13 + bandIndex * 2.43;
    for (let i = 0; i <= FLOW_STEPS; i++) {
      const distance = i * length / FLOW_STEPS;
      const front = clamp(distance / shoulder);
      const rear = clamp((length - distance) / shoulder);
      const left = ease(front);
      const right = ease(rear);
      const influence = amplitude * left * right;
      const influenceSlope = amplitude * 6 * (front * (1 - front) * right - rear * (1 - rear) * left) / shoulder;
      // Three unequal wavelengths carry a sequence of long, loaded folds.
      // The phase lives in material distance, so growth reveals the next fold.
      const broad = distance * 5.4 + phase;
      const undercut = distance * 12.9 - phase * 1.71;
      const accent = distance * 22.1 + phase * .81;
      const width = .61 * Math.sin(broad) + .29 * Math.sin(undercut) + .10 * Math.sin(accent);
      const height = .55 * Math.sin(broad + .44) + .31 * Math.sin(undercut - .69) + .14 * Math.sin(accent + .85);
      const widthSlope = 3.294 * Math.cos(broad) + 3.741 * Math.cos(undercut) + 2.21 * Math.cos(accent);
      const heightSlope = 2.97 * Math.cos(broad + .44) + 3.999 * Math.cos(undercut - .69) + 3.094 * Math.cos(accent + .85);
      band.flow.set([
        1 + influence * width, 1 + influence * height,
        influenceSlope * width + influence * widthSlope,
        influenceSlope * height + influence * heightSlope,
      ], i * 4);
    }
  }

  sampleBandFlow(band, offset, target) {
    const f = clamp(offset / band.flowLength) * FLOW_STEPS;
    const a = Math.floor(f);
    const b = Math.min(FLOW_STEPS, a + 1);
    const t = f - a;
    for (let channel = 0; channel < 4; channel++) {
      target[channel] = THREE.MathUtils.lerp(band.flow[a * 4 + channel], band.flow[b * 4 + channel], t);
    }
  }

  shapeManeRoot(bandIndex, offset, restDistance, point) {
    const band = this.sections[bandIndex];
    this.sampleBandFlow(band, offset, this.radial);
    const centerX = centerAt(band, restDistance, 0);
    const centerY = centerAt(band, restDistance, 1);
    point.x = centerX + (point.x - centerX) * this.radial[0] + this.tailCenterOffset(restDistance);
    point.y = centerY + (point.y - centerY) * this.radial[1];
    return point;
  }

  tailCenterOffset(distance) {
    if (this.stage !== 2 || distance <= jiaolongTail.start) return 0;
    return jiaolongTail.offset * smooth(distance, jiaolongTail.start, jiaolongTail.end);
  }

  frameAt(distance, out) {
    const { curveCount: count, curveArray: array } = this.field;
    const end = 1 + this.extra;
    const cursor = clamp(distance / end) * (count - 1);
    const a = Math.floor(cursor), b = Math.min(count - 1, a + 1), t = cursor - a;
    const rowStride = count * 4;
    // The binormal is rebuilt from the interpolated tangent and normal.
    for (let row = 0, first = a * 4, second = b * 4; row < 9; row += 3, first += rowStride, second += rowStride) {
      out[row] = array[first] + (array[second] - array[first]) * t;
      out[row + 1] = array[first + 1] + (array[second + 1] - array[first + 1]) * t;
      out[row + 2] = array[first + 2] + (array[second + 2] - array[first + 2]) * t;
    }
    let tx = out[3], ty = out[4], tz = out[5];
    let tangentLength = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tangentLength < 1e-6) {
      const nearest = (count + (t < .5 ? a : b)) * 4;
      tx = array[nearest]; ty = array[nearest + 1]; tz = array[nearest + 2];
      tangentLength = Math.hypot(tx, ty, tz) || 1;
    }
    out[3] = tx /= tangentLength; out[4] = ty /= tangentLength; out[5] = tz /= tangentLength;
    const dot = out[6] * tx + out[7] * ty + out[8] * tz;
    let nx = out[6] - dot * tx, ny = out[7] - dot * ty, nz = out[8] - dot * tz;
    let normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (normalLength < 1e-6) {
      nx = -tz; ny = 0; nz = tx;
      if (Math.abs(ty) > .999) { nx = 0; ny = -tz; nz = ty; }
      normalLength = Math.hypot(nx, ny, nz) || 1;
    }
    out[6] = nx /= normalLength; out[7] = ny /= normalLength; out[8] = nz /= normalLength;
    out[9] = ny * tz - nz * ty;
    out[10] = nz * tx - nx * tz;
    out[11] = nx * ty - ny * tx;
    const extension = distance - clamp(distance, 0, end);
    for (let axis = 0; axis < 3; axis++) out[axis] += out[axis + 3] * extension;
  }

  update(dt, animate = true) {
    if (animate) this.time += dt;
    this.extra += (this.targetExtra - this.extra) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 8));
    this.hipExtra = clamp(this.hipRatio * (1 + this.extra) - this.data.hipAnchor, 0, this.extra);
    this.field.update(1 + this.extra, this.time, 'straight', 0);
    const frontExtra = this.hipExtra;
    const tailExtra = this.extra - frontExtra;
    this.updateBandFlow(0, frontExtra);
    this.updateBandFlow(1, tailExtra);
    const limbs = this.motion ? this.limbs : null;
    this.head.update(this.motion, this.time);
    if (this.maneFlow) this.frameAt(HEAD_ANCHOR, this.anchorFrame);
    this.maneFlow?.update(this.motion, animate ? dt : 0, this.anchorFrame, this.head.skull);
    if (limbs) {
      for (const leg of limbs.legs) {
        const d = leg.anchor;
        this.frameAt(d + frontExtra * bandProgress(d, this.sections[0]) +
          tailExtra * bandProgress(d, this.sections[1]), leg.frame);
      }
      const target = this.motion.contactTarget;
      const contact = target && this.root.worldToLocal(this.contactPoint.set(target.x, target.y, target.z));
      const surface = this.motion.clawSurface;
      if (surface) {
        this.root.worldToLocal(this.clawContact.point.copy(surface.point));
        this.clawContact.digit = surface.digit;
        this.clawContact.grip = surface.grip;
      }
      limbs.update(this.motion, animate ? dt : 0, contact, this.root.scale.x, this.field.customSpine,
        surface ? this.clawContact : null, this.root);
    }
    const shoulderA = limbs?.legs[0], shoulderB = limbs?.legs[1];
    const swallow = this.motion?.swallow ?? 0;
    const throat = this.motion?.swallowStation ?? 0;
    const girth = bodyGirth[this.stage];
    const inverseLength = 1 / (1 + this.extra);

    for (const entry of this.meshes) {
      const { mesh, restP, restN, channels } = entry;
      const attributes = mesh.geometry.attributes;
      const pos = attributes.position.array;
      const normal = attributes.normal.array;
      const paint = attributes.inkRestPosition.array;
      const growth = attributes._growth.array;
      const frame = this.frame;
      const anchorFrame = this.anchorFrame;
      for (let k = 0, c = 0; k < pos.length; k += 3, c += STRIDE) {
        const distance = growth[k];
        const weight = growth[k + 1];
        const anchor = growth[k + 2];
        const extra = frontExtra * channels[c] + tailExtra * channels[c + 1];
        const scaleZ = 1 + frontExtra * channels[c + 2] + tailExtra * channels[c + 3];
        const flex = channels[c + 6];
        const z = restP[k + 2];
        const motionOffset = flex > 0 && this.maneFlow
          ? this.maneFlow.offset(distance, restP[k], restP[k + 1], z, flex)
          : null;
        const originalX = restP[k] + (motionOffset?.x ?? 0);
        const originalY = restP[k + 1] + (motionOffset?.y ?? 0);
        const originalNX = restN[k], originalNY = restN[k + 1], originalNZ = restN[k + 2];
        const grownDistance = distance + extra;
        const load = swallow * (1 - weight) *
          (1 - smooth(Math.abs(grownDistance * this.root.scale.x - throat), .12, .82));
        const width = 1 + .15 * load;
        const depth = 1 + (this.stage === 1 ? .35 : .25) * load;
        let x = originalX * width, y = originalY * depth;
        let nx = originalNX / width, ny = originalNY / depth, nz = originalNZ / scaleZ;
        if (this.stage === 2 && z > .09 && z < .342 && originalY < .012 && originalX > .015 && originalX < .226) {
          // Lift the soft throat between the two sockets into a continuous
          // sternum line. The leg branch below still uses the original bind.
          const front = smooth(z, .09, .194);
          const rear = 1 - smooth(z, .245, .342);
          const inner = smooth(originalX, .015, .088);
          const outer = 1 - smooth(originalX, .162, .226);
          const down = 1 - smooth(originalY, -.083, .012);
          const lift = .055 * front * rear * inner * outer;
          y += lift * down;
          ny /= 1 - lift * easeSlope(originalY, -.083, .012);
          nx -= ny * .055 * down * front * rear *
            (easeSlope(originalX, .015, .088) * outer - inner * easeSlope(originalX, .162, .226));
          nz -= ny * .055 * down * inner * outer *
            (easeSlope(z, .09, .194) * rear - front * easeSlope(z, .245, .342));
        }
        const bandIndex = channels[c + 7];
        if (bandIndex >= 0 && weight < 1 && this.extra > .055) {
          const band = this.sections[bandIndex];
          this.sampleBandFlow(band, grownDistance - band.a - (bandIndex ? frontExtra : 0), this.radial);
          const [width, height, widthSlope, heightSlope] = this.radial;
          const cx = channels[c + 8], cy = channels[c + 9];
          const offsetX = x - cx, offsetY = y - cy;
          x = cx + offsetX * width;
          y = cy + offsetY * height;
          nx /= width;
          ny /= height;
          nz += nx * offsetX * widthSlope + ny * offsetY * heightSlope;
        }
        if (girth && distance > .30 && distance < .88) {
          // Keep the ends of the sculpt and place the torso proportions
          // along the grown body, including across both growth bands.
          const station = grownDistance * inverseLength;
          const front = smooth(station, girth.rise, girth.crest);
          const rear = 1 - smooth(station, girth.taper, girth.tail);
          const neck = smooth(distance, .30, .402);
          const tail = 1 - smooth(distance, .79, .88);
          const shape = front * rear * neck * tail;
          const slope = (easeSlope(station, girth.rise, girth.crest) * rear -
            front * easeSlope(station, girth.taper, girth.tail)) * neck * tail * inverseLength +
            front * rear * (easeSlope(distance, .30, .402) * tail - neck * easeSlope(distance, .79, .88)) / scaleZ;
          const belly = y - girth.belly;
          const bodyWidth = 1 + girth.width * shape;
          const bodyDepth = 1 + girth.depth * shape;
          nz += (nx * x * girth.width / bodyWidth + ny * belly * girth.depth / bodyDepth) * slope;
          x *= bodyWidth;
          y += belly * girth.depth * shape;
          nx /= bodyWidth;
          ny /= bodyDepth;
        }
        if (this.bodyEmergence < 1 && distance > .24 && distance < .95) {
          // The first change shares the old snake's axis. Let the heavier
          // flank fill in from front to back just after the ink edge arrives.
          const station = grownDistance * inverseLength;
          const age = this.bodyEmergence - .46 * station;
          const fill = 1 - smooth(age, .12, .52);
          const front = smooth(distance, .24, .37);
          const rear = 1 - smooth(distance, .82, .95);
          const range = front * rear;
          const expansion = 1 - .34 * fill * range;
          const slope = -.34 * (.46 * easeSlope(age, .12, .52) * inverseLength * range +
            fill * (easeSlope(distance, .24, .37) * rear - front * easeSlope(distance, .82, .95)) / scaleZ);
          nz += (nx * x + ny * y) * slope / expansion;
          x *= expansion;
          y *= expansion;
          nx /= expansion;
          ny /= expansion;
        }
        this.frameAt(grownDistance, frame);
        // The rear skin blends into the original foot binding below.
        const tailShift = this.tailCenterOffset(distance);
        if (tailShift > 0) nz += nx * jiaolongTail.offset * easeSlope(distance, jiaolongTail.start, jiaolongTail.end) / scaleZ;
        let px = frame[0] + frame[6] * (x + tailShift) + frame[9] * y;
        let py = frame[1] + frame[7] * (x + tailShift) + frame[10] * y;
        let pz = frame[2] + frame[8] * (x + tailShift) + frame[11] * y;
        let vx = frame[6] * nx + frame[9] * ny - frame[3] * nz;
        let vy = frame[7] * nx + frame[10] * ny - frame[4] * nz;
        let vz = frame[8] * nx + frame[11] * ny - frame[5] * nz;
        if (weight > 0) {
          const anchorExtra = frontExtra * channels[c + 4] + tailExtra * channels[c + 5];
          this.frameAt(anchor + anchorExtra, anchorFrame);
          this.head.pose(channels[c + 16], originalX, originalY, z, originalNX, originalNY, originalNZ);
          const p = this.head.point;
          const n = this.head.normal;
          const offset = HEAD_Z - p.z - anchor;
          px += weight * (anchorFrame[0] + anchorFrame[6] * p.x + anchorFrame[9] * p.y + anchorFrame[3] * offset - px);
          py += weight * (anchorFrame[1] + anchorFrame[7] * p.x + anchorFrame[10] * p.y + anchorFrame[4] * offset - py);
          pz += weight * (anchorFrame[2] + anchorFrame[8] * p.x + anchorFrame[11] * p.y + anchorFrame[5] * offset - pz);
          vx += weight * (anchorFrame[6] * n.x + anchorFrame[9] * n.y - anchorFrame[3] * n.z - vx);
          vy += weight * (anchorFrame[7] * n.x + anchorFrame[10] * n.y - anchorFrame[4] * n.z - vy);
          vz += weight * (anchorFrame[8] * n.x + anchorFrame[11] * n.y - anchorFrame[5] * n.z - vz);
        }
        const limbWeight = channels[c + 11];
        if (limbs && channels[c + 17] > 0) {
          const amount = channels[c + 17];
          const shift = limbs.socketDelta(shoulderA, originalX, originalY, z);
          px += amount * shift.x;
          py += amount * shift.y;
          pz += amount * shift.z;
        }
        if (limbs && channels[c + 18] > 0) {
          const amount = channels[c + 18];
          const shift = limbs.socketDelta(shoulderB, originalX, originalY, z);
          px += amount * shift.x;
          py += amount * shift.y;
          pz += amount * shift.z;
        }
        if (limbs && limbWeight > 0) {
          const leg = limbs.legs[channels[c + 10]];
          const f = leg.frame;
          limbs.pose(leg, channels[c + 12], channels[c + 13], channels[c + 14], channels[c + 15], originalX, originalY, z, originalNX, originalNY, originalNZ);
          const posed = limbs.point;
          const n = limbs.normal;
          const offset = HEAD_Z - posed.z - leg.anchor;
          px += limbWeight * (f[0] + f[6] * posed.x + f[9] * posed.y + f[3] * offset - px);
          py += limbWeight * (f[1] + f[7] * posed.x + f[10] * posed.y + f[4] * offset - py);
          pz += limbWeight * (f[2] + f[8] * posed.x + f[11] * posed.y + f[5] * offset - pz);
          vx += limbWeight * (f[6] * n.x + f[9] * n.y - f[3] * n.z - vx);
          vy += limbWeight * (f[7] * n.x + f[10] * n.y - f[4] * n.z - vy);
          vz += limbWeight * (f[8] * n.x + f[11] * n.y - f[5] * n.z - vz);
        }
        const length = Math.hypot(vx, vy, vz) || 1;
        pos[k] = px;
        pos[k + 1] = py;
        pos[k + 2] = pz;
        normal[k] = vx / length;
        normal[k + 1] = vy / length;
        normal[k + 2] = vz / length;
        // Stable pigment on the original silhouette, with a metric along the
        // lengthened arc so a growing region cannot stretch its wash.
        paint[k] = restP[k] + (x - originalX) * (1 - weight);
        paint[k + 1] = restP[k + 1] + (y - originalY) * (1 - weight);
        paint[k + 2] = z - extra;
      }
      attributes.position.needsUpdate = true;
      attributes.normal.needsUpdate = true;
      attributes.inkRestPosition.needsUpdate = true;
    }
    this.root.updateMatrixWorld(true);
  }

  muzzle(out = new THREE.Vector3(), inset = 0) {
    const d = HEAD_ANCHOR;
    const frame = this.anchorFrame;
    this.frameAt(d + this.hipExtra * bandProgress(d, this.sections[0]) +
      (this.extra - this.hipExtra) * bandProgress(d, this.sections[1]), frame);
    const local = this.head.muzzle(out, inset);
    const { x, y, z } = local;
    const axial = HEAD_Z - z - d;
    return this.root.localToWorld(out.set(
      frame[0] + frame[6] * x + frame[9] * y + frame[3] * axial,
      frame[1] + frame[7] * x + frame[10] * y + frame[4] * axial,
      frame[2] + frame[8] * x + frame[11] * y + frame[5] * axial,
    ));
  }

  frontPalm(out, side) {
    if (!this.limbs || !this.motion || (side !== -1 && side !== 1)) return null;
    const leg = this.limbs.legs[side > 0 ? 1 : 0];
    const { x, y, z } = leg.posedPalm;
    const f = leg.frame, along = HEAD_Z - z - leg.anchor;
    return this.root.localToWorld(out.set(
      f[0] + f[6] * x + f[9] * y + f[3] * along,
      f[1] + f[7] * x + f[10] * y + f[4] * along,
      f[2] + f[8] * x + f[11] * y + f[5] * along,
    ));
  }

  clawTip(out = new THREE.Vector3(), selectedDigit = null) {
    if (!this.limbs) return null;
    const leading = this.limbs.legs[this.limbs.leadSide > 0 ? 1 : 0];
    const target = this.motion?.contactTarget;
    let nearest = Infinity;
    for (const [digitIndex, digit] of leading.digits.entries()) {
      if (selectedDigit !== null && digitIndex !== selectedDigit) continue;
      if (!digit.vertex) continue;
      const { mesh, index } = digit.vertex;
      const sample = this.clawSample.fromBufferAttribute(mesh.geometry.attributes.position, index);
      this.root.localToWorld(sample);
      const distance = target ? (sample.x - target.x) ** 2 + (sample.y - target.y) ** 2 + (sample.z - target.z) ** 2 : 0;
      if (distance >= nearest) continue;
      nearest = distance;
      out.copy(sample);
    }
    return Number.isFinite(nearest) ? out : null;
  }

  stats() {
    return {
      stage: this.stage,
      totalLength: 1 + this.extra,
      extraLength: this.extra,
      hipFraction: (this.data.hipAnchor + this.hipExtra) / (1 + this.extra),
      originalSurface: true,
      surfaceVertices: this.meshes[0].restP.length / 3,
      skinJoints: this.limbs ? this.limbs.legs.length * 2 : 0,
      method: 'continuous-source-surface',
    };
  }
}
