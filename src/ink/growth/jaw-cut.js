import { BufferAttribute, BufferGeometry } from 'three';

/** Split a crossed lip triangle while retaining winding on both sides. */
export function cutLipTriangle(vertices, signed, atVertex, atEdge) {
  const upper = [], lower = [];
  for (let i = 0; i < 3; i++) {
    const next = (i + 1) % 3;
    const a = vertices[i], b = vertices[next];
    const s = signed[i], t = signed[next];
    if (s >= 0) upper.push(atVertex(a, false));
    if (s <= 0) lower.push(atVertex(a, true));
    if (s * t < 0) {
      const mix = s / (s - t);
      upper.push(atEdge(a, b, mix, false));
      lower.push(atEdge(a, b, mix, true));
    }
  }
  return [upper, lower];
}

/** Open a welded lip in a CPU-deformed sculpt. Other face attributes follow the source edge. */
export function splitJawGeometry(geometry, signedSide, jawRegion) {
  const position = geometry.getAttribute('position');
  const sourceIndex = geometry.getIndex();
  const signed = new Float32Array(position.count);
  const regions = new Float32Array(position.count);
  const weights = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    signed[i] = signedSide(x, y, z, i);
    regions[i] = jawRegion(x, y, z, i);
    weights[i] = signed[i] < 0 ? regions[i] : 0;
  }

  const edges = new Map();
  const added = [];
  const indices = [];
  const emit = polygon => {
    for (let i = 2; i < polygon.length; i++) indices.push(polygon[0], polygon[i - 1], polygon[i]);
  };
  const duplicate = (a, b, mix, lower) => {
    const key = Math.min(a, b) + ':' + Math.max(a, b) + ':' + Number(lower);
    let index = edges.get(key);
    if (index !== undefined) return index;
    index = position.count + added.length;
    edges.set(key, index);
    added.push({ a, b, mix });
    const x = position.getX(a) + (position.getX(b) - position.getX(a)) * mix;
    const y = position.getY(a) + (position.getY(b) - position.getY(a)) * mix;
    const z = position.getZ(a) + (position.getZ(b) - position.getZ(a)) * mix;
    weights[index] = lower ? jawRegion(x, y, z) : 0;
    return index;
  };
  const atVertex = (index, lower) => lower && signed[index] === 0 && regions[index] > 0
    ? duplicate(index, index, 0, true) : index;
  const faceCount = sourceIndex?.count ?? position.count;
  for (let i = 0; i < faceCount; i += 3) {
    const face = sourceIndex
      ? [sourceIndex.getX(i), sourceIndex.getX(i + 1), sourceIndex.getX(i + 2)]
      : [i, i + 1, i + 2];
    const values = face.map(index => signed[index]);
    if (face.some(index => regions[index] > 0) &&
      values.some(value => value < 0) && values.some(value => value >= 0)) {
      const [upper, lower] = cutLipTriangle(face, values, atVertex, duplicate);
      emit(upper);
      emit(lower);
    } else indices.push(...face);
  }

  const result = new BufferGeometry();
  for (const [name, source] of Object.entries(geometry.attributes)) {
    const values = new source.array.constructor(weights.length * source.itemSize);
    const attribute = new BufferAttribute(values, source.itemSize, source.normalized);
    for (let i = 0; i < source.count; i++) {
      for (let j = 0; j < source.itemSize; j++) attribute.setComponent(i, j, source.getComponent(i, j));
    }
    for (let i = 0; i < added.length; i++) {
      const { a, b, mix } = added[i];
      for (let j = 0; j < source.itemSize; j++) {
        const from = source.getComponent(a, j), to = source.getComponent(b, j);
        attribute.setComponent(source.count + i, j, from + (to - from) * mix);
      }
    }
    result.setAttribute(name, attribute);
  }
  result.setAttribute('aJawWeight', new BufferAttribute(Float32Array.from(weights), 1));
  result.setIndex(indices);
  return result;
}
