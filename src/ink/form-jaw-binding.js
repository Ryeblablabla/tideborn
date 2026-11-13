// Distance through the source surface keeps teeth and lip corners with the
// jaw they grow from. World-space height alone catches their overlapping tips.
function distances(graph, vertices, side) {
  const values = new Float64Array(vertices.length).fill(Infinity);
  const queue = [];
  function push(index, distance) {
    let cursor = queue.length;
    const entry = [index, distance];
    queue.push(entry);
    while (cursor > 0) {
      const parent = (cursor - 1) >> 1;
      if (queue[parent][1] <= distance) break;
      queue[cursor] = queue[parent];
      cursor = parent;
    }
    queue[cursor] = entry;
  }
  function pop() {
    const first = queue[0];
    const last = queue.pop();
    if (!queue.length) return first;
    let cursor = 0;
    while (cursor * 2 + 1 < queue.length) {
      let child = cursor * 2 + 1;
      if (child + 1 < queue.length && queue[child + 1][1] < queue[child][1]) child++;
      if (last[1] <= queue[child][1]) break;
      queue[cursor] = queue[child];
      cursor = child;
    }
    queue[cursor] = last;
    return first;
  }

  for (let index = 0; index < vertices.length; index++) {
    if (vertices[index].height * side < .0115) continue;
    values[index] = 0;
    push(index, 0);
  }
  while (queue.length) {
    const [index, distance] = pop();
    if (values[index] !== distance) continue;
    for (const [next, length] of graph[index]) {
      const cost = distance + length;
      if (cost >= values[next]) continue;
      values[next] = cost;
      push(next, cost);
    }
  }
  return values;
}

export function jawSides(geometry, head) {
  const positions = geometry.attributes.position;
  const count = positions.count;
  const vertexNode = new Int32Array(count).fill(-1);
  const vertices = [];
  const labels = new Float32Array(count);
  const byPoint = new Map();
  for (let index = 0; index < count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const { along, across, height } = head.lipCoordinates(x, y, z);
    labels[index] = height;
    if (along < -.028 || Math.abs(across) > head.data.jawWidth * 1.17 || height < -.12 || height > .071) continue;
    const key = [x, y, z].map(value => Math.round(value * 1e6)).join(':');
    if (!byPoint.has(key)) {
      byPoint.set(key, vertices.length);
      vertices.push({ x, y, z, height });
    }
    vertexNode[index] = byPoint.get(key);
  }

  const graph = vertices.map(() => new Map());
  function connect(a, b) {
    const from = vertexNode[a], to = vertexNode[b];
    if (from < 0 || to < 0 || from === to || graph[from].has(to)) return;
    const p = vertices[from], q = vertices[to];
    const distance = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    graph[from].set(to, distance);
    graph[to].set(from, distance);
  }
  const triangles = geometry.index.array;
  for (let face = 0; face < triangles.length; face += 3) {
    const a = triangles[face], b = triangles[face + 1], c = triangles[face + 2];
    connect(a, b);
    connect(b, c);
    connect(c, a);
  }

  const upper = distances(graph, vertices, 1);
  const lower = distances(graph, vertices, -1);
  for (let index = 0; index < count; index++) {
    const node = vertexNode[index];
    if (node < 0) continue;
    const high = upper[node], low = lower[node];
    if (Number.isFinite(high + low)) {
      const signedDistance = low - high;
      const preference = head.stage === 1 || head.stage === 3 ? .54 : .24;
      labels[index] = signedDistance + preference * labels[index];
    } else if (Number.isFinite(high)) {
      labels[index] = Math.max(.006, labels[index]);
    } else if (Number.isFinite(low)) {
      labels[index] = Math.min(-.006, labels[index]);
    }
  }
  return labels;
}
