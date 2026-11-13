import { Vector3 } from 'three';

const epsilon = 1e-9;

/** Find a contact on the exposed side of a triangle at a fixed toe length. */
export class ClawReach {
  constructor() {
    this.normal = new Vector3();
    this.circle = new Vector3();
    this.tangent = new Vector3();
    this.candidate = new Vector3();
    this.edge = new Vector3();
    this.relative = new Vector3();
    this.point = new Vector3();
  }

  begin(root, radius, direction, preferred, anchor, angle) {
    this.root = root;
    this.radiusSquared = radius * radius;
    this.direction = direction;
    this.preferred = preferred;
    this.anchor = anchor;
    this.limit = radius * Math.cos(angle);
    this.score = -Infinity;
    this.face = -1;
  }

  consider(point, face) {
    const delta = this.relative.subVectors(point, this.root);
    if (delta.dot(this.direction) < this.limit || point.distanceToSquared(this.anchor) < .10 ** 2) return;
    const score = delta.dot(this.preferred);
    if (score <= this.score) return;
    this.score = score;
    this.face = face;
    this.point.copy(point);
  }

  test(triangle, face) {
    triangle.closestPointToPoint(this.root, this.candidate);
    if (this.candidate.distanceToSquared(this.root) > this.radiusSquared) return;
    const normal = triangle.getNormal(this.normal);
    if (normal.lengthSq() < epsilon) return;
    const planeDistance = this.relative.subVectors(this.root, triangle.a).dot(normal);
    // Prefer the exposed face, so a toe cannot reach it through the prey.
    if (planeDistance < -.025) return;
    const circleSquared = this.radiusSquared - planeDistance * planeDistance;
    if (circleSquared < 0) return;
    this.circle.copy(this.root).addScaledVector(normal, -planeDistance);
    const tangent = this.tangent.copy(this.preferred).addScaledVector(normal, -this.preferred.dot(normal));
    if (tangent.lengthSq() > epsilon || circleSquared < epsilon) {
      this.candidate.copy(this.circle).addScaledVector(tangent.normalize(), Math.sqrt(circleSquared));
      if (triangle.containsPoint(this.candidate)) this.consider(this.candidate, face);
    } else {
      this.candidate.copy(this.circle).addScaledVector(tangent.subVectors(triangle.b, triangle.a).normalize(), Math.sqrt(circleSquared));
      if (triangle.containsPoint(this.candidate)) this.consider(this.candidate, face);
    }
    this.testEdge(triangle.a, triangle.b, face);
    this.testEdge(triangle.b, triangle.c, face);
    this.testEdge(triangle.c, triangle.a, face);
  }

  testEdge(a, b, face) {
    const edge = this.edge.subVectors(b, a);
    const lengthSquared = edge.lengthSq();
    if (lengthSquared < epsilon) return;
    const relative = this.relative.subVectors(a, this.root);
    const halfB = relative.dot(edge);
    const discriminant = halfB * halfB - lengthSquared * (relative.lengthSq() - this.radiusSquared);
    if (discriminant < 0) return;
    const offset = Math.sqrt(discriminant);
    const near = (-halfB - offset) / lengthSquared;
    const far = (-halfB + offset) / lengthSquared;
    if (near >= 0 && near <= 1) this.consider(this.candidate.copy(a).addScaledVector(edge, near), face);
    if (far >= 0 && far <= 1) this.consider(this.candidate.copy(a).addScaledVector(edge, far), face);
  }
}
