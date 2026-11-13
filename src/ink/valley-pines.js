import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../rules.js';

const silhouettes = {
  cliff: {
    tint: '#35483a',
    wood: [
      [.16, [[0,-.25,0],[-.15,.63,0],[.43,1.18,-.05],[1.37,1.32,.04],[2.37,1.76,.22]]],
      [.063, [[.43,1.18,-.05],[.48,1.60,-.39],[.10,2.08,-.62]]],
      [.057, [[1.28,1.29,.04],[1.82,1.14,.45],[2.92,1.26,.71]]],
      [.043, [[1.73,1.47,.13],[2.08,1.93,-.20],[2.55,2.09,-.33]]],
    ],
    crown: [
      [2.40,1.80,.24, .99,.21,.48, 8], [2.84,1.31,.73, .79,.17,.40, 6],
      [.12,2.11,-.63, .48,.17,.42, 5], [2.55,2.11,-.34, .55,.14,.33, 5],
    ],
  },
  fork: {
    tint: '#485549',
    wood: [
      [.16, [[0,-.25,0],[.06,.63,.11],[-.35,1.31,.14],[-.82,2.19,.21],[-.91,3.07,.31]]],
      [.106, [[.08,.50,.08],[.53,1.25,-.13],[.91,1.93,-.22],[.89,2.65,-.33]]],
      [.058, [[-.51,1.59,.18],[-1.10,1.76,.59],[-1.75,1.97,.86]]],
      [.048, [[.70,1.52,-.16],[1.27,1.70,.10],[1.73,1.94,.52]]],
      [.041, [[-.83,2.52,.25],[-.44,2.76,-.31],[-.23,2.81,-.65]]],
    ],
    crown: [
      [-.91,3.12,.34, .63,.23,.53, 6], [.88,2.70,-.36, .77,.21,.58, 7],
      [-1.67,1.99,.88, .77,.16,.37, 7], [1.70,1.97,.55, .54,.17,.42, 6],
      [-.21,2.82,-.63, .53,.16,.35, 5],
    ],
  },
  sparse: {
    tint: '#3e5648',
    wood: [
      [.145, [[0,-.27,0],[.18,.88,-.10],[-.10,1.84,.19],[.26,2.72,.09],[.03,3.78,-.23]]],
      [.049, [[-.05,1.52,.15],[-.83,1.52,.51],[-1.62,1.82,.90]]],
      [.057, [[.13,2.37,.16],[.94,2.35,.16],[1.59,2.59,.42]]],
      [.040, [[.16,3.06,-.04],[-.44,3.38,-.49],[-1.01,3.53,-.68]]],
    ],
    crown: [
      [-1.56,1.82,.89, .61,.14,.36, 5], [1.56,2.61,.42, .82,.18,.38, 7],
      [-.98,3.54,-.67, .57,.17,.43, 5], [.06,3.83,-.25, .56,.18,.43, 5],
    ],
  },
};

function stain(geometry, paint) {
  geometry.deleteAttribute('uv');
  const position = geometry.attributes.position;
  const ink = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) ink[i*2] = paint(position.getY(i));
  geometry.setAttribute('inkGuides', new THREE.BufferAttribute(ink, 2));
  return geometry;
}

export function taperedBranch(radius, points) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const rings = 4 * (points.length - 1), sides = 5;
  const geometry = new THREE.TubeGeometry(curve, rings, radius, sides, false);
  const p = geometry.attributes.position, v = new THREE.Vector3(), center = new THREE.Vector3();
  for (let ring = 0; ring <= rings; ring++) {
    const u = ring / rings;
    curve.getPointAt(u, center);
    for (let j = 0; j <= sides; j++) {
      const i = ring * (sides + 1) + j;
      v.fromBufferAttribute(p, i).sub(center).multiplyScalar(1 - u * .83).add(center);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return stain(geometry, () => .28);
}

function canopy(shape, rng) {
  const [x, y, z, width, height, depth, count] = shape;
  const lobes = [];
  for (let i = 0; i < count; i++) {
    const a = rng()*Math.PI*2, distance = Math.sqrt(rng());
    const lobe = stain(new THREE.SphereGeometry(1, 6, 4), normalY => .15 + .18 * Math.max(0,-normalY));
    lobe.scale(width*(.30+rng()*.31), height*(.56+rng()*.50), depth*(.33+rng()*.42));
    lobe.rotateY(a);
    lobe.translate(x+Math.cos(a)*width*distance, y+(rng()-.5)*height*.65, z+Math.sin(a)*depth*distance);
    lobes.push(lobe);
  }
  return lobes;
}

export function addValleyPine(environment, root, x, y, z, size, kind, facing, seed) {
  const shape = silhouettes[kind], rng = random(seed);
  const parts = [
    ...shape.wood.map(([radius, points]) => taperedBranch(radius, points)),
    ...shape.crown.flatMap(crown => canopy(crown, rng)),
  ];
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.scale(size,size,size);
  geometry.rotateY(facing);
  return environment.add(root, geometry, [x,y,z], {
    tint: shape.tint, amount: .49,
    profile: { strokes:false, geometryInfluence:0, toneRange:[.21,.51], coherentInk:.22 },
  });
}
