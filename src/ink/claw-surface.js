import { MathUtils, Ray, Triangle, Vector3 } from 'three';
import { ClawReach } from './claw-reach.js';

export const clawHoldSeconds = .203;
const clawDrawSeconds = .128;
const clawReturnSeconds = .15;
const surfaceReach = .16;

/** A short grasp follows the actual deformed triangle touched by one claw. */
export class ClawSurface {
  constructor() {
    this.action = null;
    this.mesh = null;
    this.face = [-1, -1, -1];
    this.weights = new Vector3();
    this.triangle = new Triangle();
    this.nearest = new Vector3();
    this.weightsCandidate = new Vector3();
    this.pull = new Vector3();
    this.pullOffset = new Vector3();
    this.reach = new ClawReach();
    this.approach = new Ray();
    this.patch = [];
    this.patchShift = new Vector3();
    this.gripPoint = new Vector3();
    this.gripDirection = new Vector3();
    this.gripWeights = new Vector3();
    this.gripFace = -1;
    this.result = { point: new Vector3(), digit: 0, grip: this };
  }

  clear() {
    this.action = null;
    this.mesh = null;
    this.face[0] = -1;
    this.patch.length = 0;
  }

  capture(action, mesh, actor, heading) {
    if (this.action === action) return;
    this.action = action;
    this.mesh = mesh;
    this.face[0] = -1;
    this.gripFace = -1;
    this.patch.length = 0;
    if (!mesh || !actor.limbs) return;

    const forwardX = Math.sin(heading), forwardZ = Math.cos(heading);
    const outward = .44 * action.side;
    this.pull.set(outward * forwardZ - .22 * forwardX, -.37, -outward * forwardX - .22 * forwardZ);

    const leading = actor.limbs.legs[action.side > 0 ? 1 : 0];
    const tips = leading.digits.map((_, digit) => actor.clawTip(new Vector3(), digit));
    const { index, attributes } = mesh.geometry;
    const count = index?.count ?? attributes.position.count;
    mesh.updateWorldMatrix(true, false);
    let best = surfaceReach ** 2;
    for (let offset = 0; offset < count; offset += 3) {
      const a = index ? index.getX(offset) : offset;
      const b = index ? index.getX(offset + 1) : offset + 1;
      const c = index ? index.getX(offset + 2) : offset + 2;
      this.loadTriangle(mesh, a, b, c);
      for (let digit = 0; digit < tips.length; digit++) {
        const tip = tips[digit];
        if (!tip) continue;
        this.triangle.closestPointToPoint(tip, this.nearest);
        const distance = tip.distanceToSquared(this.nearest);
        if (!(distance < best) || !this.triangle.getBarycoord(this.nearest, this.weightsCandidate)) continue;
        best = distance;
        this.face[0] = a;
        this.face[1] = b;
        this.face[2] = c;
        this.weights.copy(this.weightsCandidate);
        this.result.digit = digit;
      }
    }
    if (this.face[0] < 0) return;
    this.loadTriangle(mesh, ...this.face);
    const { a, b, c } = this.triangle;
    const { x, y, z } = this.weights;
    this.gripPoint.copy(a).multiplyScalar(x).addScaledVector(b, y).addScaledVector(c, z);
    // Search the part of the prey around the planted toe. Pull and deformed
    // positions are sampled from the live mesh each time the other toe closes.
    for (let offset = 0; offset < count; offset += 3) {
      this.loadFace(offset);
      this.triangle.closestPointToPoint(this.gripPoint, this.nearest);
      if (this.nearest.distanceToSquared(this.gripPoint) < 1.0) this.patch.push(offset);
    }
  }

  displacement(action, age) {
    const returnEnd = clawHoldSeconds + clawReturnSeconds;
    if (action !== this.action || this.face[0] < 0 || age < 0 || age >= returnEnd) return null;
    const { smoothstep } = MathUtils;
    const load = smoothstep(age, .018, clawDrawSeconds);
    const ease = 1 - smoothstep(age, clawHoldSeconds, returnEnd);
    return this.pullOffset.copy(this.pull).multiplyScalar(load * ease);
  }

  loadTriangle(mesh, a, b, c) {
    const { triangle } = this;
    mesh.getVertexPosition(a, triangle.a).applyMatrix4(mesh.matrixWorld);
    mesh.getVertexPosition(b, triangle.b).applyMatrix4(mesh.matrixWorld);
    mesh.getVertexPosition(c, triangle.c).applyMatrix4(mesh.matrixWorld);
  }

  loadFace(offset, displacement = null) {
    const { index } = this.mesh.geometry;
    this.loadTriangle(this.mesh, index ? index.getX(offset) : offset,
      index ? index.getX(offset + 1) : offset + 1, index ? index.getX(offset + 2) : offset + 2);
    if (displacement) {
      this.triangle.a.add(displacement);
      this.triangle.b.add(displacement);
      this.triangle.c.add(displacement);
    }
  }

  secondaryPoint(root, radius, direction, angle) {
    const preferred = this.gripDirection.copy(direction);
    if (this.gripFace >= 0) {
      this.loadFace(this.gripFace, this.patchShift);
      const { a, b, c } = this.triangle;
      const { x, y, z } = this.gripWeights;
      preferred.copy(a).multiplyScalar(x).addScaledVector(b, y).addScaledVector(c, z)
        .sub(root).normalize().lerp(direction, .28).normalize();
    }
    this.reach.begin(root, radius, direction, preferred, this.result.point, angle);
    for (const offset of this.patch) {
      this.loadFace(offset, this.patchShift);
      this.reach.test(this.triangle, offset);
    }
    if (this.reach.face < 0) return null;
    // Reject a contact reached by passing through a different face first.
    this.approach.origin.copy(root);
    this.approach.direction.subVectors(this.reach.point, root).divideScalar(radius);
    for (const offset of this.patch) {
      this.loadFace(offset, this.patchShift);
      const { a, b, c } = this.triangle;
      const hit = this.approach.intersectTriangle(a, b, c, false, this.nearest);
      if (hit && root.distanceToSquared(hit) < (radius - .025) ** 2) return null;
    }
    return this.reach;
  }

  rememberSecondary(face, point) {
    this.loadFace(face, this.patchShift);
    if (this.triangle.getBarycoord(point, this.gripWeights)) this.gripFace = face;
  }

  sample(action, mesh, contactAge) {
    if (action !== this.action || mesh !== this.mesh || this.face[0] < 0 || contactAge > clawHoldSeconds + .03) return null;
    mesh.updateWorldMatrix(true, false);
    this.loadTriangle(mesh, ...this.face);
    const { a, b, c } = this.triangle;
    const { x, y, z } = this.weights;
    this.result.point.copy(a).multiplyScalar(x).addScaledVector(b, y).addScaledVector(c, z);
    const displacement = this.displacement(action, contactAge);
    this.patchShift.set(0, 0, 0);
    if (displacement) this.result.point.add(displacement);
    if (displacement) this.patchShift.copy(displacement);
    return this.result;
  }
}
