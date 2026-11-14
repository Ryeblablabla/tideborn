import { random, TAU } from './rules.js';

export const FRONTIER_SIZE = 48;
export const FRONTIER_DIVISIONS = 32;
export const FRONTIER_STEP = FRONTIER_SIZE / FRONTIER_DIVISIONS;
export const FRONTIER_STRIDE = FRONTIER_DIVISIONS + 3;
export const FRONTIER_BED = -.72;

const half = FRONTIER_SIZE * .5;
const origins = [
  [-33, 49, -29, 56],
  [-63, 66, -48, 79],
  [-30, 40, -48, 49],
  [-86, 91, -43, 146],
];

const unit = value => Math.max(0, Math.min(1, value));
const smooth = (from, to, value) => {
  const t = unit((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const cellAxis = coordinate => Math.floor((coordinate + half) / FRONTIER_SIZE);

export function frontierCell(x, z) {
  return { column: cellAxis(x), row: cellAxis(z) };
}

export function frontierSeed(seed, stage, column, row, salt = 0) {
  let key = seed ^ Math.imul(stage + 1, 0x9e3779b1) ^ Math.imul(column, 0x85ebca6b) ^
    Math.imul(row, 0xc2b2ae35) ^ Math.imul(salt, 0x27d4eb2f);
  key = Math.imul(key ^ (key >>> 16), 0x7feb352d);
  key = Math.imul(key ^ (key >>> 15), 0x846ca68b);
  return (key ^ (key >>> 16)) >>> 0;
}

/** Extend the hand-composed river with bends that join both ends at zero grade. */
export function frontierRiver(authoredRiver, seed, z) {
  if (seed === null || (z >= -52 && z <= 155)) return authoredRiver(z);
  const edge = z < -52 ? -52 : 155;
  const from = authoredRiver(edge);
  const distance = Math.abs(z - edge);
  const reach = smooth(0, 76, distance);
  const phase = frontierSeed(seed, 3, 0, Math.sign(edge), 41) / 4294967296 * TAU;
  const a = (z - edge) * .017 + phase, b = (z - edge) * .037 - phase * .5;
  const bend = 29 * Math.sin(a) + 9 * Math.sin(b);
  const grade = 29 * .017 * Math.cos(a) + 9 * .037 * Math.cos(b);
  const envelopeT = unit(distance / 76);
  const envelopeGrade = 6 * envelopeT * (1 - envelopeT) * Math.sign(z - edge) / 76;
  const width = 24 + 7 * Math.sin(z * .021 + phase) + 4 * Math.cos(z * .046 - phase);
  return {
    x: from.x + reach * bend,
    grade: reach * grade + envelopeGrade * bend,
    halfWidth: from.halfWidth + (width - from.halfWidth) * reach,
  };
}

function protectedDistance(stage, x, z) {
  const [left, right, back, ahead] = origins[stage];
  return Math.max(left - x, x - right, back - z, z - ahead);
}

/** One discoverable formation per seeded group of twelve frontier cells. */
export function frontierLandmark(seed, stage, column, row) {
  if (stage !== 2 && stage !== 3) return null;
  const firstRow = stage === 2 ? 2 : 4;
  const first = column === 0 && row === firstRow;
  const groupX = Math.floor(column / 4), groupZ = Math.floor(row / 3);
  const slot = frontierSeed(seed,stage,groupX,groupZ,461) % 12;
  const chosen = column === groupX * 4 + slot % 4 && row === groupZ * 3 + Math.floor(slot / 4);
  if (!first && (!chosen || Math.hypot(column,row-firstRow) < 2.8 ||
      protectedDistance(stage,column*FRONTIER_SIZE,row*FRONTIER_SIZE)<39)) return null;
  const roll = random(frontierSeed(seed,stage,column,row,673));
  const x = column * FRONTIER_SIZE + (roll() - .5) * 18;
  const z = row * FRONTIER_SIZE + (first ? (stage===2 ? -9 : -14) : 0) + (roll() - .5) * 7;
  if(protectedDistance(stage,x,z)<27)return null;
  const heading = (roll() - .5) * (first ? .44 : .95);
  const side = roll() < .5 ? -1 : 1;
  const sea = stage === 2;
  return {
    kind:sea?'reef-gate':'split-falls',name:sea?'夹潮双礁':'分雪双瀑',
    x,z,heading,side,cosine:Math.cos(heading),sine:Math.sin(heading),
    width:sea ? 5.3 + roll() * 1.1 : 7.5 + roll() * 1.2,
    length:sea ? 19.5 + roll() * 3 : 25 + roll() * 4,
    phase:roll()*TAU,
  };
}

export const FALLS_PASSAGE = Object.freeze({
  height:10.8, minHeight:7.8, maxHeight:14.2, halfWidth:3.1, halfAngle:.24,
  mouthOffset:6.5, steeringOffset:10,
});
const REEF_PASSAGE = Object.freeze({
  height:1.05, minHeight:.7, maxHeight:2.2, halfWidth:2.45, halfAngle:.21,
  mouthOffset:5.5, steeringOffset:8,
});

export function passageLimits(site) {
  return site?.kind==='split-falls'?FALLS_PASSAGE:site?.kind==='reef-gate'?REEF_PASSAGE:null;
}

/** A shrine is reached through the mouth of its ravine, not across the ridge. */
export function frontierPassage(site, from, previousDirection) {
  const limits=passageLimits(site);
  if (!limits) return null;
  const dx=from.x-site.x,dz=from.z-site.z;
  const across=dx*site.cosine-dz*site.sine,along=dx*site.sine+dz*site.cosine;
  const distance=site.length+limits.mouthOffset;
  const inside=Math.abs(along)<=distance+2 && Math.abs(across)<=limits.halfWidth;
  const headingForward=Math.cos((from.angle??site.heading)-site.heading)>=0;
  const direction=previousDirection===1||previousDirection===-1?previousDirection:
    inside?(headingForward?1:-1):Math.sign(-along)||1;
  const side=-direction,progress=along*direction;
  const heading=site.heading+(direction<0?Math.PI:0);
  const point=offset=>({x:site.x+site.sine*offset,y:limits.height,z:site.z+site.cosine*offset});
  const entry=point(side*distance),exit=point(-side*distance);
  const approach=point(side*(distance+limits.steeringOffset));
  const delta=Number.isFinite(from.angle)?Math.abs(Math.atan2(Math.sin(heading-from.angle),Math.cos(heading-from.angle))):0;
  const height=from.y??limits.height;
  const atHeight=height>=limits.minHeight&&height<=limits.maxHeight;
  const centered=Math.abs(across)<=limits.halfWidth;
  const aligned=centered&&delta<=limits.halfAngle&&atHeight;
  const turningIntoPassage=inside&&delta<1.10;
  const finished=progress>distance;
  const needsRoom=progress>-distance-limits.steeringOffset+4 &&
    (progress>-distance+1?!centered:Math.abs(across)>limits.halfWidth+5.5);
  const stage=finished?'exit':turningIntoPassage?'through':needsRoom?'approach':'entry';
  const aimAhead=point(direction*Math.min(distance+limits.steeringOffset,progress+11));
  const target=stage==='exit'||stage==='through'?aimAhead:stage==='approach'?approach:
    centered&&progress>=-distance-3.5?aimAhead:entry;
  return {entry,exit,approach,heading,direction,along,across,progress,aligned,centered,atHeight,inside,stage,target,limits};
}

function gateRelief(site, u, v) {
  const sea = site.kind === 'reef-gate';
  const local = u * site.side;
  const face = .26 * Math.sin(v * .15 + site.phase) + .18 * Math.sin(v * .61);
  const chip = Math.sin(u * 1.23 + v * .92) * .37 + Math.cos(v * 1.86 - u * .74) * .23;
  const high = local > 0;
  const shift = high ? v * (sea ? .06 : .13) : -v * .17;
  const across = Math.abs(u) - site.width + shift + face;
  if (across <= 0) return 0;
  const foot = smooth(0,sea ? 1.9 : 3.4,across + chip*.44);
  const shoulder = sea ? (high ? 13.8 : 15.7) : (high ? 22.1 : 26.8);
  const center = sea ? (high ? 5.0 : 3.9) : (high ? 6.5 : 11.0);
  const lateral = 1 - smooth(center*.45,shoulder,across);
  const behind = high ? (sea ? .7 : 3.5) : (sea ? -2.9 : -4.6);
  const depth = (v - behind) / (sea ? 10.2 : 16.1);
  const extent = 1 - smooth(.24,1,Math.abs(depth));
  const first = sea ? (high ? 10.2 : 7.0) : (high ? 24 : 16.8);
  const second = sea ? (high ? 6.7 : 3.2) : (high ? 18.4 : 22.3);
  const spire = (rise,axis,span,lean,base) => {
    const along = Math.abs(v-axis)/span;
    const flank = Math.abs(across-base-lean*(v-axis))/(sea ? 4.7 : 10.1);
    return rise*unit(1 - along*.89 - flank*.55 + chip*.035) ** (sea ? .76 : .91);
  };
  const rift = sea ? 1 : 1 - .19 * (1 - smooth(.12,1.18,Math.abs(v + .58*across + 1.5)));
  const peak = Math.max(spire(first,behind,sea ? 7.6 : 11.2,.30,center),
    spire(second,behind+7.1,sea ? 6.1 : 13.2,-.27,center+2.4));
  return foot*lateral*rift*(peak + extent*(sea ? 2.2 : 6.2));
}

function landforms(seed, stage, column, row) {
  const roll = random(frontierSeed(seed, stage, column, row, 7));
  const theme = roll();
  const x = column * FRONTIER_SIZE + (roll() - .5) * 34;
  const z = row * FRONTIER_SIZE + (roll() - .5) * 34;
  const heading = (roll() - .5) * TAU;
  const phase = roll() * TAU;
  const across = Math.cos(heading), along = Math.sin(heading);
  const forms = [];
  const place = (dx, dz, width, depth, height, kind, rotation = 0) => {
    const angle = heading + rotation;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    forms.push({
      x: x + dx * across - dz * along, z: z + dx * along + dz * across,
      cosine, sine, width, depth, height, kind, phase: phase + forms.length * 1.73,
      radiusX: Math.abs(cosine * width) + Math.abs(sine * depth),
      radiusZ: Math.abs(sine * width) + Math.abs(cosine * depth),
    });
  };
  if (stage === 0) {
    // Long low bars open around a small return bay. Some reaches are paper water.
    if (theme < .12) return forms;
    place(0, 0, 10 + roll() * 8, 4.6 + roll() * 4, .92 + roll() * 1.37, 'bar');
    place(-7, 5.5, 6 + roll() * 4, 3.8 + roll() * 2.1, .61 + roll() * .79, 'shelf', -.65);
    if (theme > .48) place(9, 3.8, 7.5 + roll() * 3.3, 3.9 + roll() * 2.7, .6 + roll() * 1.1, 'bar', .27);
  } else if (stage === 1) {
    if (theme < .18) return forms;
    place(0, 0, 11 + roll() * 9, 8 + roll() * 6, 2.7 + roll() * 4.2, 'shelf');
    if (theme > .40) place(-8, 7, 7 + roll() * 5, 5 + roll() * 4, 1.6 + roll() * 2.8, 'bar', -.47);
    if (theme > .69) place(14, 1.3, 5.2 + roll() * 3.6, 4 + roll() * 4.1, 2.7 + roll() * 2.2, 'shelf', .72);
  } else if (stage === 2) {
    // Sea reefs form a loose chain, with wide breaks in the storm water.
    if (theme < .39) return forms;
    place(0, 0, 8 + roll() * 7, 3.8 + roll() * 3.6, 1.6 + roll() * 3.4, 'reef');
    if (theme > .54) place(7.5, 4.2, 4 + roll() * 3.2, 3 + roll() * 2.1, 3 + roll() * 6, 'reef', -.33);
    if (theme > .83) place(-8.1, 4.2, 7 + roll() * 2, 3.9 + roll() * 2.7, 1.2 + roll() * 2, 'reef', .25);
  } else {
    // Keep corridors between long, staggered ridges. Their saddles can be crossed above the ground.
    if (theme < .09) return forms;
    place(0, 0, 15 + roll() * 9, 10.5 + roll() * 8, 9 + roll() * 16, 'ridge');
    place(-9, 4, 10.5 + roll() * 8, 6.4 + roll() * 6.2, 5 + roll() * 10, 'ridge', -.26);
    if (theme > .40) place(12, 5, 9 + roll() * 5.4, 6 + roll() * 5, 6 + roll() * 12, 'ridge', .39);
  }
  return forms;
}

function relief(form, x, z) {
  const dx = x - form.x, dz = z - form.z;
  if (Math.abs(dx) > form.radiusX || Math.abs(dz) > form.radiusZ) return 0;
  const u = (dx * form.cosine + dz * form.sine) / form.width;
  const v = (-dx * form.sine + dz * form.cosine) / form.depth;
  if (Math.abs(u) >= 1 || Math.abs(v) >= 1) return 0;
  const { kind, phase, height } = form;
  const bend = .18 * Math.sin(u * 4.1 + phase) + .11 * u;
  const chips = .054 * Math.sin(u * 20 + v * 13 + phase) + .032 * Math.sin(u * 44 - v * 19 - phase);
  const edge = (1 - smooth(.81, 1, Math.abs(u))) * (1 - smooth(.81, 1, Math.abs(v)));
  if (kind === 'reef') {
    const face = Math.abs(u + .36 * v) * 1.04 + Math.abs(v + bend * .75) * .99;
    return height * unit(1 - face + chips) ** .72 * edge;
  }
  if (kind === 'ridge') {
    const spine = v - bend - .21 * u;
    const shoulder = v - .4 + .22 * Math.sin(u * 5.7 + phase);
    const weight = .58 + .17 * Math.sin(u * 8.7 + phase) + .11 * Math.sin(u * 18.6 - phase);
    const main = unit(1 - Math.hypot(u * .97, spine * 1.73) + chips);
    const side = unit(1 - Math.hypot((u + .19) * 1.16, shoulder * 2.15) - chips);
    return height * Math.max(main ** .81 * (weight + .33), side ** 1.26 * .59) * edge;
  }
  const bar = kind === 'bar';
  const shelf = Math.hypot(u * (bar ? .92 : 1.12), (v - bend) * (bar ? 1.40 : 1.12));
  return height * unit(1 - shelf + chips) ** (bar ? .79 : .70) * edge;
}

/** World-aligned samples share the same edge vertices and triangle split. */
function buildTile(seed, stage, column, row, river) {
  const minX = column * FRONTIER_SIZE - half, minZ = row * FRONTIER_SIZE - half;
  const tiles = new Float32Array(FRONTIER_STRIDE ** 2).fill(FRONTIER_BED);
  const features = [], banks = [], landmarks = [];
  // A rotated ridge can reach just across the neighboring cell's far edge.
  for (let j = row - 2; j <= row + 2; j++) {
    for (let i = column - 2; i <= column + 2; i++) {
      const landmark = frontierLandmark(seed,stage,i,j);
      if (landmark && Math.abs(landmark.x-(minX+half))<half+59 && Math.abs(landmark.z-(minZ+half))<half+59)
        landmarks.push(landmark);
      for (const form of landforms(seed, stage, i, j)) {
        if (form.x + form.radiusX < minX - FRONTIER_STEP || form.x - form.radiusX > minX + FRONTIER_SIZE + FRONTIER_STEP ||
            form.z + form.radiusZ < minZ - FRONTIER_STEP || form.z - form.radiusZ > minZ + FRONTIER_SIZE + FRONTIER_STEP) continue;
        features.push(form);
      }
    }
  }
  let top = FRONTIER_BED;
  if (features.length || landmarks.length) {
    for (let j = 0; j < FRONTIER_STRIDE; j++) {
      const z = minZ + (j - 1) * FRONTIER_STEP;
      const course = stage === 3 ? river(z) : null;
      for (let i = 0; i < FRONTIER_STRIDE; i++) {
        const x = minX + (i - 1) * FRONTIER_STEP;
        const outside = protectedDistance(stage, x, z);
        if (outside <= 0) continue;
        let primary = 0, secondary = 0;
        for (const form of features) {
          const weight = relief(form, x, z);
          if (weight > primary) {
            secondary = primary;
            primary = weight;
          } else if (weight > secondary) secondary = weight;
        }
        const shore = course ? smooth(.71, 1.12, Math.abs(x - course.x) / course.halfWidth) : 1;
        let reliefHeight=(primary + secondary * .17) * shore;
        for (const site of landmarks) {
          const dx=x-site.x,dz=z-site.z;
          const u=dx*site.cosine-dz*site.sine,v=dx*site.sine+dz*site.cosine;
          if(Math.abs(u)>41||Math.abs(v)>site.length+10)continue;
          const near=(1-smooth(29,41,Math.abs(u)))*(1-smooth(site.length,site.length+10,Math.abs(v)));
          reliefHeight=Math.max(reliefHeight*(1-near),gateRelief(site,u,v)*near);
        }
        const height = FRONTIER_BED + reliefHeight * smooth(0, 13, outside);
        tiles[j * FRONTIER_STRIDE + i] = height;
        if (i > 0 && j > 0 && i < FRONTIER_STRIDE - 1 && j < FRONTIER_STRIDE - 1)
          top = Math.max(top, tiles[j * FRONTIER_STRIDE + i]);
      }
    }
  }
  if (stage < 2 && top > .16) {
    for (const form of features) {
      if (cellAxis(form.x) !== column || cellAxis(form.z) !== row) continue;
      const f = smooth(0,13,protectedDistance(stage,form.x,form.z));
      const scale = unit(1 - 1.05 / (form.height * f));
      if (scale < .16) continue;
      const {x,z,cosine,sine,width,depth} = form;
      banks.push({x,z,rx:Math.hypot(cosine*width,sine*depth)*scale,rz:Math.hypot(sine*width,cosine*depth)*scale});
    }
  }
  return { column, row, minX, minZ, tiles, top, banks, landmarks,
    landmark:landmarks.find(site=>cellAxis(site.x)===column&&cellAxis(site.z)===row) };
}

export class FrontierTerrain {
  constructor(river) {
    this.river = river;
    this.seed = null;
    this.stage = -1;
    this.rows = new Map();
    this.tileCount = 0;
    this.window = null;
    this.outside = null;
  }

  setWorld(stage, seed) {
    if (this.stage === stage && this.seed === seed) return;
    this.stage = stage;
    this.seed = seed;
    this.rows.clear();
    this.tileCount = 0;
    this.window = null;
    this.outside = null;
  }

  tile(column, row) {
    const window = this.window;
    if (window && (Math.abs(column-window.column)>window.radius || Math.abs(row-window.row)>window.radius)) {
      if (this.outside?.column !== column || this.outside?.row !== row)
        this.outside = buildTile(this.seed,this.stage,column,row,this.river);
      return this.outside;
    }
    let cells = this.rows.get(row);
    if (!cells) this.rows.set(row, cells = new Map());
    let tile = cells.get(column);
    if (!tile) {
      tile = buildTile(this.seed, this.stage, column, row, this.river);
      cells.set(column, tile);
      this.tileCount++;
    }
    return tile;
  }

  heightAt(x, z) {
    if (this.seed === null || this.stage < 0 || this.stage > 3 || protectedDistance(this.stage, x, z) <= 0) return -Infinity;
    const tile = this.tile(cellAxis(x), cellAxis(z));
    if (tile.top < -.14) return -Infinity;
    return sampleFrontierTile(tile, x, z);
  }

  retain(column, row, radius) {
    this.window = {column,row,radius};
    this.outside = null;
    for (const [j, cells] of this.rows) {
      if (Math.abs(j - row) > radius) {
        this.tileCount -= cells.size;
        this.rows.delete(j);
        continue;
      }
      for (const i of cells.keys()) {
        if (Math.abs(i - column) <= radius) continue;
        cells.delete(i);
        this.tileCount--;
      }
      if (!cells.size) this.rows.delete(j);
    }
  }
}

export function sampleFrontierTile(tile, x, z) {
  const u = (x - tile.minX) / FRONTIER_STEP, v = (z - tile.minZ) / FRONTIER_STEP;
  const i = Math.min(FRONTIER_DIVISIONS - 1, Math.floor(u));
  const j = Math.min(FRONTIER_DIVISIONS - 1, Math.floor(v));
  const s = u - i, t = v - j;
  const k = (j + 1) * FRONTIER_STRIDE + i + 1;
  const a = tile.tiles[k], b = tile.tiles[k + 1];
  const c = tile.tiles[k + FRONTIER_STRIDE], d = tile.tiles[k + FRONTIER_STRIDE + 1];
  if (s + t <= 1) return a + s * (b - a) + t * (c - a);
  return d + (1 - s) * (c - d) + (1 - t) * (b - d);
}
