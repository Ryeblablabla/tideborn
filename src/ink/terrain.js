import * as THREE from 'three';

const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));

/** Collision queries interpolate the same triangles that Three.js draws. */
export function inkHeightfield({ width, depth, height, field, paint, seed = 0, angle = 0, columns = 52, rows = 36, waterline }) {
  const positions = [], triangles = [], guides = [];
  const samples = new Float32Array((columns + 1) * (rows + 1));
  const phase = seed * 1.237;
  for (let z = 0; z <= rows; z++) {
    const v = z / rows * 2 - 1;
    for (let x = 0; x <= columns; x++) {
      const u = x / columns * 2 - 1;
      const h = field(u, v);
      const i = positions.length / 3;
      positions.push(u * width, h, v * depth);
      samples[i] = h;
      if (paint) {
        const [loaded, reserve] = paint(u, v, h);
        guides.push(clamp(loaded), clamp(reserve));
      } else {
        const band = Math.sin(u * 17 + v * 10 + phase) + Math.sin(v * 19 - u * 6);
        guides.push(clamp((h / height - .12) * .28) * clamp(band * .24), clamp((band - .32) * .28) * clamp(h / height));
      }
    }
  }
  const addTriangle = (a, b, c) => {
    if (waterline === undefined || Math.max(samples[a], samples[b], samples[c]) > waterline) triangles.push(a,b,c);
  };
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < columns; x++) {
      const i = z * (columns + 1) + x;
      const rear = i + columns + 1;
      addTriangle(i, rear, i+1);
      addTriangle(i+1, rear, rear+1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  // Removing buried triangles also keeps their vertices out of the ink surface analysis.
  if (waterline === undefined) {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('inkGuides', new THREE.Float32BufferAttribute(guides, 2));
    geometry.setIndex(triangles);
  } else {
    const used = new Int32Array(samples.length).fill(-1);
    const exposedPositions = [], exposedGuides = [];
    const exposed = triangles.map(index => {
      if (used[index] >= 0) return used[index];
      const destination = exposedPositions.length / 3;
      exposedPositions.push(positions[index * 3],positions[index * 3 + 1],positions[index * 3 + 2]);
      exposedGuides.push(guides[index * 2],guides[index * 2 + 1]);
      used[index] = destination;
      return destination;
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(exposedPositions, 3));
    geometry.setAttribute('inkGuides', new THREE.Float32BufferAttribute(exposedGuides, 2));
    geometry.setIndex(exposed);
  }
  geometry.computeVertexNormals();
  geometry.rotateY(angle);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return {
    geometry,
    heightAt(x, z) {
      const u = ((x * cosine - z * sine) / width + 1) * columns / 2;
      const v = ((x * sine + z * cosine) / depth + 1) * rows / 2;
      if (u < 0 || v < 0 || u >= columns || v >= rows) return -Infinity;
      const i = Math.floor(u), j = Math.floor(v), s = u - i, t = v - j;
      const k = j * (columns + 1) + i;
      const frontLeft = samples[k], frontRight = samples[k + 1];
      const rearLeft = samples[k + columns + 1], rearRight = samples[k + columns + 2];
      if (s + t <= 1) return frontLeft + s * (frontRight - frontLeft) + t * (rearLeft - frontLeft);
      return rearRight + (1 - s) * (rearLeft - rearRight) + (1 - t) * (frontRight - rearRight);
    },
  };
}

export function inkTerrain(options) {
  const { height, seed, shape = 'ridge' } = options;
  const phase = seed * 1.237;
  function field(x, z) {
    const skew = Math.sin(z * 3.8 + phase) * .10;
    const radius = Math.hypot((x + skew) * .94, z * .95);
    const extent = clamp(1 - radius);
    const gullies = Math.sin(x * 14 + z * 9 + phase) * .080 +
      Math.sin(x * 29 - z * 19 + phase * 2) * .035 +
      Math.sin(x * 47 + z * 15 - phase) * .018;
    if (shape === 'bank') {
      const ledge = Math.exp(-((x + .2) ** 2 * 2.1 + (z - .12) ** 2 * 2.2));
      return height * extent ** .82 * (.46 + ledge * .44 + gullies) - .56 * clamp((radius - .7) / .28);
    }
    if (shape === 'island') {
      const lump = Math.exp(-((x + .29) ** 2 * 4.3 + (z + .06) ** 2 * 2.5));
      const side = Math.exp(-((x - .37) ** 2 * 4.9 + (z - .24) ** 2 * 2.2));
      const surface = .23 + Math.max(lump, side * .69) * .65 + gullies;
      return height * extent ** .71 * surface - .41;
    }
    if (shape === 'range') {
      const course = Math.sin(x * 5.6 + phase) * .23 + Math.sin(x * 9.3 - phase) * .06;
      const ridge = .46 + .23 * Math.sin(x * 15.8 + phase) +
        .13 * Math.sin(x * 32.7 - phase) + .075 * Math.sin(x * 54.6 + z * 3.9);
      const ends = clamp(1 - Math.abs(x)) ** .51;
      const crossSection = clamp(1 - Math.abs(z - course) * .97) ** 1.5;
      return height * ends * crossSection * (.35 + ridge + gullies) - .69;
    }
    const spine = -.25 + Math.sin(z * 3.3 + phase) * .21;
    const narrowPeak = Math.exp(-((x - spine) ** 2 * 7 + (z + .14) ** 2 * 2.7));
    const shoulder = Math.exp(-((x - .37) ** 2 * 5 + (z - .28) ** 2 * 3));
    const ridge = Math.max(narrowPeak, shoulder * .71) + shoulder * .18;
    return height * (extent ** .48) * (ridge + gullies) - .9 * clamp((radius - .83) / .17);
  }
  return inkHeightfield({ ...options, field });
}
