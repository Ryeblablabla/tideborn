import {
  AnimationClip, AnimationMixer, BufferAttribute, BufferGeometry, PropertyBinding,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CurveField } from './curve-field.js';
import { clipPolygon } from './growth-utils.js';
import { LoftSection } from './loft-section.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const defaultBands = [[.30, .49], [.70, .90]];
const profileFields = ['front', 'middle', 'rear'];
const localPose = /^(Fore_|Hind_|Jaw)/;

/** A rest sculpt and its skinned caps. The display curve owns spine motion. */
export class WinglessDragon {
  constructor(asset, profile, renderer, { stage = 0, rig = {} } = {}) {
    this.asset = asset;
    this.root = asset.scene;
    this.wingless = true;
    this.stage = stage;
    this.meshes = [];
    this.root.traverse(mesh => { if (mesh.isSkinnedMesh) this.meshes.push(mesh); });
    this.body = this.meshes[0];
    if (!this.body) throw new Error('缺少龙身骨骼蒙皮。');

    this.headZ = profile?.sourceHeadZ ?? .5;
    const rear = rig.limbs?.filter(limb => limb.kind === 'Hind') ?? [];
    const fore = rig.limbs?.filter(limb => limb.kind === 'Fore') ?? [];
    const averageStation = (limbs, fallback) =>
      limbs.length ? limbs.reduce((sum, limb) => sum + limb.station, 0) / limbs.length : fallback;
    this.hipRatio = .58;
    this.hipAnchor = profile?.hipAnchor ?? averageStation(rear, this.hipRatio);
    this.foreAnchor = profile?.foreAnchor ?? averageStation(fore, .29);
    this.headAnchor = stage === 0 ? .082 : .105;
    this.data = { ...profile, hipAnchor: this.hipAnchor };
    this.bands = rig.growthBands?.length === 2 ? rig.growthBands : defaultBands;
    this.raisedDetails = profile?.raisedDetails ?? rig.raisedDetails ?? [];
    this.extra = this.targetExtra = this.hipExtra = this.time = 0;
    this.field = new CurveField(renderer, this.headZ);
    this.shared = this.field.shared;
    this.mixer = new AnimationMixer(this.root);
    this.clips = new Map(asset.animations.map(clip => [
      clip.name,
      new AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => {
        const target = PropertyBinding.parseTrackName(track.name);
        return localPose.test(target.nodeName) && target.propertyName === 'quaternion';
      })),
    ]));

    this.method = profile?.gaps?.length === 2 && profile.gaps.every(gap =>
      profileFields.every(key => gap.profiles?.[key]?.points?.length > 2)) ? 'loft' : 'stretch';
    this.sections = [];
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;
      mesh.userData.originalGeometry = mesh.geometry;
      mesh.userData.originalMaterial = mesh.material;
      this.assignGrowth(mesh);
    }
    if (this.method === 'loft') {
      this.capGeometry = this.clipBody();
      this.body.geometry = this.capGeometry;
      this.sections = profile.gaps.map((gap, zone) => new LoftSection(this, gap, zone));
    }
    this.update(0, false);
  }

  sampleFrame(distance) { return this.field.sampleFrame(distance); }

  readVertex(mesh, i) {
    const { position, normal, uv, skinIndex, skinWeight } = mesh.geometry.attributes;
    const read = (attribute, length) => Array.from({ length }, (_, j) => attribute.getComponent(i, j));
    const j = read(skinIndex, 4), w = read(skinWeight, 4);
    let front = 0, rear = 0;
    for (let slot = 0; slot < 4; slot++) {
      const name = mesh.skeleton.bones[j[slot]].name;
      if (name.startsWith('Fore_')) front += w[slot];
      if (name.startsWith('Hind_')) rear += w[slot];
    }
    const p = read(position, 3);
    return { p, n: read(normal, 3), uv: uv ? read(uv, 2) : [0, 0], j, w, front, rear, head: 0 };
  }

  zoneAt(z) {
    const [trunk, tail] = this.data.gaps ?? [];
    if (!trunk || !tail) return 0;
    return z >= trunk.frontCutZ ? 0 : z <= tail.rearCutZ ? 2 : 1;
  }

  growthParameters(vertex, zone, core = false) {
    const [, y, z] = vertex.p;
    const station = this.headZ - z;
    const head = (1 - smooth(.12, this.stage === 0 ? .23 : .21, station)) * (1 - vertex.front - vertex.rear);
    let attachment = vertex.front + vertex.rear + head;
    let weightedAnchor = vertex.front * this.foreAnchor + vertex.rear * this.hipAnchor + head * this.headAnchor;

    for (const [start, end, anchor, base, solid] of this.raisedDetails) {
      if (station <= start || station >= end) continue;
      // Cap groups may only hold features on their own side of a body cut.
      if (this.method === 'loft' && this.zoneAt(this.headZ - anchor) !== zone) continue;
      const edge = Math.min(.022, (end - start) * .25);
      const rigid = (1 - attachment) * smooth(start, start + edge, station)
        * (1 - smooth(end - edge, end, station)) * smooth(base, solid, y);
      attachment += rigid;
      weightedAnchor += rigid * anchor;
    }

    const anchor = attachment > 1e-6 ? weightedAnchor / attachment : 0;
    if (core) {
      const [trunk, tail] = this.data.gaps;
      const nearest = zone === 0 ? Math.abs(z - trunk.frontCutZ)
        : zone === 2 ? Math.abs(z - tail.rearCutZ)
          : Math.min(Math.abs(z - trunk.rearCutZ), Math.abs(z - tail.frontCutZ));
      attachment *= smooth(0, .03, nearest);
    }
    return [zone, clamp(attachment), anchor];
  }

  assignGrowth(mesh) {
    const geometry = mesh.geometry;
    const values = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const vertex = this.readVertex(mesh, i);
      const zone = vertex.front > .15 && vertex.front >= vertex.rear ? 0
        : vertex.rear > .15 ? 1 : this.zoneAt(vertex.p[2]);
      values.set(this.growthParameters(vertex, zone), i * 3);
    }
    geometry.setAttribute('aGrowth', new BufferAttribute(values, 3));
  }

  clipBody() {
    const { body } = this;
    const geometry = body.geometry;
    const index = geometry.index;
    const vertices = new Array(geometry.attributes.position.count);
    const read = i => vertices[i] ??= this.readVertex(body, i);
    const attrs = { position: [], normal: [], uv: [], skinIndex: [], skinWeight: [], aGrowth: [] };
    const push = (vertex, zone, core) => {
      attrs.position.push(...vertex.p);
      attrs.normal.push(...vertex.n);
      attrs.uv.push(...vertex.uv);
      attrs.skinIndex.push(...vertex.j);
      attrs.skinWeight.push(...vertex.w);
      attrs.aGrowth.push(...this.growthParameters(vertex, zone, core));
    };
    const polygon = (points, zone, core) => {
      for (let i = 1; i < points.length - 1; i++) {
        push(points[0], zone, core);
        push(points[i], zone, core);
        push(points[i + 1], zone, core);
      }
    };
    const [trunk, tail] = this.data.gaps;
    const count = index?.count ?? vertices.length;
    const threshold = this.data.classificationThreshold ?? .15;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(j => read(index ? index.getX(i + j) : i + j));
      const fore = (points[0].front + points[1].front + points[2].front) / 3;
      const hind = (points[0].rear + points[1].rear + points[2].rear) / 3;
      if (fore > threshold && fore >= hind) polygon(points, 0, false);
      else if (hind > threshold) polygon(points, 1, false);
      else {
        polygon(clipPolygon(points, trunk.frontCutZ, true), 0, true);
        polygon(clipPolygon(clipPolygon(points, trunk.rearCutZ, false), tail.frontCutZ, true), 1, true);
        polygon(clipPolygon(points, tail.rearCutZ, false), 2, true);
      }
    }
    const caps = new BufferGeometry();
    for (const [name, values] of Object.entries(attrs)) {
      const size = name === 'uv' ? 2 : name.startsWith('skin') ? 4 : 3;
      const array = name === 'skinIndex' ? new Uint16Array(values) : new Float32Array(values);
      caps.setAttribute(name, new BufferAttribute(array, size));
    }
    const merged = mergeVertices(caps, 1e-6);
    caps.dispose();
    return merged;
  }

  shift(zone) { return zone < .5 ? 0 : zone < 1.5 ? this.hipExtra : this.extra; }

  stretchDistance(station) {
    const [front, tail] = this.bands;
    return station + this.hipExtra * smooth(front[0], front[1], station)
      + (this.extra - this.hipExtra) * smooth(tail[0], tail[1], station);
  }

  stretchSlope(station) {
    const [front, tail] = this.bands;
    const slope = (from, to) => {
      const u = clamp((station - from) / (to - from));
      return 6 * u * (1 - u) / (to - from);
    };
    return 1 + this.hipExtra * slope(front[0], front[1])
      + (this.extra - this.hipExtra) * slope(tail[0], tail[1]);
  }

  playClip(name) {
    if (name === this.clipName) return;
    this.mixer.stopAllAction();
    this.clipName = name;
    const clip = this.clips.get(name);
    this.action = clip?.tracks.length ? this.mixer.clipAction(clip).reset().play() : null;
  }

  seek(time) {
    if (!this.action) return;
    const { duration } = this.action.getClip();
    this.action.time = ((time % duration) + duration) % duration;
    this.mixer.update(0);
  }

  setMotion(name, time) {
    this.playClip(name);
    if (Number.isFinite(time)) this.seek(time);
  }

  setAddedLength(extra, { immediate = false } = {}) {
    this.targetExtra = Math.max(0, extra);
    if (immediate) {
      this.extra = this.targetExtra;
      this.hipExtra = this.hipTravel(this.extra);
    }
  }

  hipTravel(extra) {
    return Math.max(0, Math.min(extra, this.hipRatio * (1 + extra) - this.hipAnchor));
  }

  update(dt, animate = true) {
    if (animate) {
      this.time += dt;
      this.mixer.update(dt);
    }
    this.extra += (this.targetExtra - this.extra) * (1 - Math.exp(-5 * dt));
    this.hipExtra = this.hipTravel(this.extra);
    this.shared.uGrowthExtra.value = this.extra;
    this.shared.uGrowthHip.value = this.hipExtra;
    this.field.update(1 + this.extra, this.time, 'straight', 0);
    this.root.updateMatrixWorld(true);
    this.body.skeleton.update();
    this.sections.forEach((section, index) => section.update(index ? this.extra - this.hipExtra : this.hipExtra));
  }

  stats() {
    return {
      totalLength: 1 + this.extra,
      extraLength: this.extra,
      hipFraction: (this.hipAnchor + this.hipExtra) / (1 + this.extra),
      skinJoints: this.body.skeleton.bones.length,
      method: this.method,
    };
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.field.curveTexture?.dispose();
    this.root.removeFromParent();
    for (const mesh of this.meshes) {
      mesh.skeleton.dispose();
      mesh.geometry.dispose();
      if (mesh.userData.originalGeometry !== mesh.geometry) mesh.userData.originalGeometry.dispose();
      mesh.material.dispose();
    }
    for (const section of this.sections) {
      section.midMesh.geometry.dispose();
      section.gray.dispose();
      section.ink.dispose();
      section.colorTexture.dispose();
    }
  }
}
