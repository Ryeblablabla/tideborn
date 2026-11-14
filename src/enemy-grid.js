export const ENEMY_CAPACITY = 4096;
export const ENEMY_RADIUS_LIMIT = 3;
const CELL = 4;
const MIN_INDEXED = 96;
// Pairs of 26-bit signed cell coordinates fit exactly in a JavaScript integer.
const cellKey = (x, z) => x * 0x4000000 + z;
const cell = coordinate => Math.floor(coordinate / CELL);
const bySpawnOrder = (a, b) => a.id - b.id;

// The grid lives for one phase of the simulation. Callers keep the exact
// three-dimensional hit test and the original spawn-order tie breaker.
export class EnemyGrid {
  constructor() {
    this.buckets = new Map();
    this.freeBuckets = [];
    this.source = null;
  }

  invalidate() {
    this.source = null;
  }

  add(enemy) {
    const key = cellKey(cell(enemy.x), cell(enemy.z));
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = this.freeBuckets.pop() ?? [];
      this.buckets.set(key, bucket);
    }
    bucket.push(enemy);
    this.count++;
  }

  relocate(enemies, enemy, oldX, oldZ) {
    if (this.source !== enemies) return;
    const oldKey = cellKey(cell(oldX), cell(oldZ));
    if (oldKey === cellKey(cell(enemy.x), cell(enemy.z))) return;
    const old = this.buckets.get(oldKey);
    const index = old?.indexOf(enemy) ?? -1;
    if (index < 0) return;
    old[index] = old.at(-1);
    old.pop();
    if (old.length === 0) {
      this.buckets.delete(oldKey);
      this.freeBuckets.push(old);
    }
    this.count--;
    this.add(enemy);
  }

  rebuild(enemies) {
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
      this.freeBuckets.push(bucket);
    }
    this.buckets.clear();
    this.source = enemies;
    this.count = 0;
    for (const enemy of enemies) this.add(enemy);
  }

  nearby(enemies, origin, reach, output) {
    if (enemies.length < MIN_INDEXED || !Number.isFinite(reach)) return enemies;
    if ((Math.ceil(reach * 2 / CELL) + 1) ** 2 > enemies.length) return enemies;
    if (this.source !== enemies || this.count !== enemies.length) this.rebuild(enemies);
    output.length = 0;
    const minX = cell(origin.x - reach);
    const maxX = cell(origin.x + reach);
    const minZ = cell(origin.z - reach);
    const maxZ = cell(origin.z + reach);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const bucket = this.buckets.get(cellKey(x, z));
        if (!bucket) continue;
        for (const enemy of bucket) {
          if (Math.abs(enemy.x - origin.x) <= reach && Math.abs(enemy.z - origin.z) <= reach) output.push(enemy);
        }
      }
    }
    output.sort(bySpawnOrder);
    return output;
  }
}
