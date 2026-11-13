import * as THREE from 'three';

export const SHORE_WATER = -.12;

/** A masonry piece carries a continuous visible footing down into the sampled ground. */
export function foundedStone(width, depth, x, z, topAt, groundAt, wet = .20, rows = 5) {
  const geometry = new THREE.BoxGeometry(width, 1, depth, rows, 1, 4);
  const position = geometry.attributes.position;
  const guides = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const u = x + position.getX(i);
    const v = z + position.getZ(i);
    const high = position.getY(i) > 0;
    const top = topAt(u,v);
    const land = groundAt(u,v);
    const foot = Number.isFinite(land) ? land - .09 : SHORE_WATER - .67;
    const bottom = Math.min(top - .10, foot);
    position.setXYZ(i, u, high ? top : bottom, v);
    const tooth = .80 + .20 * Math.cos(u * 7.6 + v * 5.2);
    guides[i * 2] = (high ? wet * .13 : wet) * tooth;
    guides[i * 2 + 1] = high ? .082 * tooth : .026;
  }
  geometry.setAttribute('inkGuides', new THREE.BufferAttribute(guides,2));
  geometry.computeVertexNormals();
  return geometry;
}

export function fillStoneGuides(parts) {
  for (const geometry of parts) {
    if (geometry.hasAttribute('inkGuides')) continue;
    geometry.setAttribute('inkGuides', new THREE.Float32BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 2), 2,
    ));
  }
  return parts;
}

export function shoreStructureMark(root, environment, x, z, angle, length, width, ink, seed) {
  const ground = environment.heightAt(x,z);
  if (ground > SHORE_WATER + .08) return;
  root.userData.shoreStructureMarks ??= [];
  root.userData.shoreStructureMarks.push({x,z,angle,length,width,ink,seed});
}
