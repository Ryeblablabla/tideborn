import * as THREE from 'three';
import { random } from '../rules.js';
import {
  FRONTIER_BED, FRONTIER_DIVISIONS, FRONTIER_SIZE, FRONTIER_STEP, FRONTIER_STRIDE,
  FrontierTerrain, frontierCell, frontierSeed, sampleFrontierTile,
} from '../world-frontier.js';
import { addFrontierShorePlants } from './shore-plants.js';
import { addValleyPine } from './valley-pines.js';
import { addLakeSkiff } from './lake-skiff.js';
import { addFrontierLandmark, updateFrontierLandmark } from './frontier-landmarks.js';

const loadRadius = 2;
const retainRadius = 3;
const wetLine = -.14;
const styles = [
  { name: '苇泽回汀', tint: '#697052', amount: .34, wash: .63, tones: [.14,.39], gain: 1.12 },
  { name: '湖上烟岬', tint: '#506c68', amount: .42, wash: .52, tones: [.13,.36], gain: 1.11 },
  { name: '沧海卧礁', tint: '#4b5d65', amount: .41, wash: .72, tones: [.14,.41], gain: 1.28 },
  { name: '远山烟嶂', tint: '#437671', amount: .71, wash: .67, tones: [.16,.41], gain: 1.22 },
];
const { smoothstep, clamp } = THREE.MathUtils;

function tileGeometry(tile, stage) {
  const positions = [], normals = [], guides = [], index = [];
  const ids = new Int32Array(FRONTIER_STRIDE ** 2).fill(-1);
  const { tiles, minX, minZ } = tile;
  function addVertex(offset) {
    if (ids[offset] >= 0) return ids[offset];
    const id = positions.length / 3;
    ids[offset] = id;
    const x = (offset % FRONTIER_STRIDE - 1) * FRONTIER_STEP;
    const z = (Math.floor(offset / FRONTIER_STRIDE) - 1) * FRONTIER_STEP;
    const h = tiles[offset], worldX = x + minX, worldZ = z + minZ;
    const dx = tiles[offset - 1] - tiles[offset + 1];
    const dz = tiles[offset - FRONTIER_STRIDE] - tiles[offset + FRONTIER_STRIDE];
    const normalLength = Math.hypot(dx, FRONTIER_STEP * 2, dz);
    const slope = 1 - FRONTIER_STEP * 2 / normalLength;
    const brush = worldX * .71 + worldZ * .31 + .64 * Math.sin(worldZ * .18 - worldX * .1) + .22 * h;
    const strokes = Math.sin(brush * 1.51) + .31 * Math.sin(brush * 3.9 + worldZ * .42);
    const dry = Math.abs(Math.sin(brush * 1.93 + .38 * Math.sin(worldZ * .81)));
    const run = .57 + .43 * Math.sin(worldZ * .24 + worldX * .19 + h * .20) ** 2;
    const damp = 1 - smoothstep(h,.06,stage === 0 ? .93 : 2.4);
    const face = smoothstep(slope,.04,stage > 1 ? .45 : .21);
    const pressure = smoothstep(strokes,-.43,.86) * run;
    let stoneInk = 0, stonePaper = 0;
    for (const site of tile.landmarks) {
      const sx=worldX-site.x,sz=worldZ-site.z;
      const u=sx*site.cosine-sz*site.sine,v=sx*site.sine+sz*site.cosine;
      if(Math.abs(u)>34 || Math.abs(v)>site.length)continue;
      const edge=1-smoothstep(Math.abs(v),site.length*.55,site.length);
      const shore=smoothstep(Math.abs(u),site.width-1,site.width+4)*(1-smoothstep(Math.abs(u),site.width+7,34));
      const sea=stage===2;
      const bone=u*(sea ? .54 : .37)+v*.43+h*(sea ? .83 : .44);
      const stroke=smoothstep(Math.sin(bone)+.27*Math.sin(bone*2.65+v*.48),-.37,.85);
      const pressure=face*shore*edge*smoothstep(h,.3,sea?2.5:4.8);
      stoneInk=Math.max(stoneInk,pressure*(sea?.46:.34)*(.51+.49*stroke));
      stonePaper=Math.max(stonePaper,pressure*smoothstep(Math.cos(bone+.62),.46,.91)*(sea?.34:.42));
    }
    positions.push(x, h, z);
    normals.push(dx / normalLength, FRONTIER_STEP * 2 / normalLength, dz / normalLength);
    guides.push(clamp(.07 + .44 * face * pressure + .24 * damp * run+stoneInk,0,1),
      clamp(smoothstep(dry,.67,.99) * face * (1 - damp) * (stage < 2 ? .42 : .60)+stonePaper,0,1));
    return id;
  }
  function addTriangle(a,b,c) {
    if (Math.max(tiles[a],tiles[b],tiles[c]) <= wetLine) return;
    index.push(addVertex(a),addVertex(b),addVertex(c));
  }
  for (let row = 1; row <= FRONTIER_DIVISIONS; row++) {
    for (let column = 1; column <= FRONTIER_DIVISIONS; column++) {
      const a = row * FRONTIER_STRIDE + column, b = a + FRONTIER_STRIDE;
      addTriangle(a,b,a+1);
      addTriangle(a+1,b,b+1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('inkGuides',new THREE.Float32BufferAttribute(guides,2));
  geometry.setIndex(index);
  return geometry;
}

function buildChunk(environment, stage, seed, tile) {
  const root = new THREE.Group();
  root.userData.stage = stage;
  root.userData.frontierWind = [];
  root.userData.shoreHeightAt = environment.heightAt;
  const { column, row, minX, minZ } = tile;
  const roll = random(frontierSeed(seed,stage,column,row,127));
  const style = styles[stage];
  const cold = stage === 3 && roll() < .45;
  const green = stage === 3 && !cold && roll() < .56;
  root.name = `${tile.landmark?.name??style.name} ${column},${row}`;
  const land = environment.add(root,tileGeometry(tile,stage),[minX,0,minZ],{
    tint:cold?'#397393':green?'#3d8066':style.tint,amount:style.amount,
    profile:{ geometryInfluence:0,strokes:false,toneRange:style.tones,coherentInk:.09,macroInk:.06,reserveStrength:.17 },
  });
  Object.assign(land.userData,{
    landscape:1,landWash:style.wash,landPooling:.055,landGain:style.gain,
    authoredPigment:true,streamedTerrain:true,
  });
  if (stage < 2) {
    const sites = [];
    for (let trial = 0; trial < 54 && sites.length < (stage === 0 ? 5 : 3); trial++) {
      const x = minX + 3 + roll() * (FRONTIER_SIZE - 6), z = minZ + 3 + roll() * (FRONTIER_SIZE - 6);
      const y = sampleFrontierTile(tile,x,z);
      if (y < .015 || y > .64 || sites.some(site=>Math.hypot(x-site.x,z-site.z)<3.8)) continue;
      sites.push({x,z,size:.56+roll()*.57,heading:roll()*Math.PI*2,seed:Math.floor(roll()*2147483647)});
    }
    let lilySite;
    if(stage===0 && sites.length && roll()<.39){
      const source=sites[0];
      for(let trial=0;trial<12&&!lilySite;trial++){
        const x=source.x+(roll()-.5)*9,z=source.z+(roll()-.5)*9;
        if(x<minX+2||z<minZ+2||x>minX+FRONTIER_SIZE-2||z>minZ+FRONTIER_SIZE-2)continue;
        const y=sampleFrontierTile(tile,x,z);
        if(y>-.47&&y<-.09)lilySite=[x,z,2.8,2.1,source.seed,3];
      }
    }
    addFrontierShorePlants(environment,root,stage,sites,lilySite);
    if(stage===1 && tile.top>2 && roll()<.24){
      for(let trial=0;trial<18;trial++){
        const x=minX+6+roll()*(FRONTIER_SIZE-12),z=minZ+6+roll()*(FRONTIER_SIZE-12);
        if(sampleFrontierTile(tile,x,z)>-.34)continue;
        const yaw=(roll()-.5)*1.72;
        const free=[-2.8,-1.4,1.4,2.8].every(steps=>
          sampleFrontierTile(tile,x+Math.cos(yaw)*steps,z-Math.sin(yaw)*steps)<-.29);
        if(!free||[[-5,0],[5,0],[0,5],[0,-5]].every(([dx,dz])=>sampleFrontierTile(tile,x+dx,z+dz)<.19))continue;
        addLakeSkiff(environment,root,{x,z,yaw,contact:false});
        break;
      }
    }
  }
  if (stage === 1 || stage === 3) {
    const pines = [];
    const shapes = ['fork','cliff','sparse'];
    for (let trial = 0; trial < 30 && pines.length < 2; trial++) {
      const x = minX + 4 + roll() * (FRONTIER_SIZE - 8), z = minZ + 4 + roll() * (FRONTIER_SIZE - 8);
      const y = sampleFrontierTile(tile,x,z);
      if (y < (stage===1 ? 1.4 : 2.6) || y > 9 || pines.some(site=>Math.hypot(x-site.x,z-site.z)<5.5)) continue;
      pines.push({x,z});
      const pine = addValleyPine(environment,root,x,y-.10,z,.63+roll()*.57,
        shapes[Math.floor(roll()*shapes.length)],roll()*Math.PI*2,Math.floor(roll()*2147483647));
      pine.name = '烟岫疏松';
    }
  }
  return root;
}

export class InkFrontier {
  constructor(environment, river) {
    this.environment = environment;
    this.terrain = new FrontierTerrain(river);
    this.chunks = new Map();
    this.pending = [];
    this.center = null;
    this.peak = 0;
    this.ink = null;
    this.revision = 0;
    this.wetBanks = [];
    this.bankFocus = new THREE.Vector2(Infinity,Infinity);
  }

  get seed() { return this.terrain.seed; }
  get stage() { return this.terrain.stage; }

  clear() {
    for (const [key,chunk] of this.chunks) this.remove(key,chunk);
    this.terrain.setWorld(-1,null);
    this.pending.length = 0;
    this.center = null;
    this.peak = 0;
    this.bankFocus.set(Infinity,Infinity);
    this.wetBanks.length = 0;
  }

  remove(key,chunk) {
    if (chunk.root) {
      this.ink.unregister(chunk.root);
      chunk.root.removeFromParent();
      const materials=new Set();
      chunk.root.traverse(object=>{
        if(object.isMesh)object.geometry.dispose();
        if(object.userData.frontierMaterial)materials.add(object.material);
      });
      for(const material of materials)material.dispose();
      this.revision++;
      this.bankFocus.set(Infinity,Infinity);
    }
    this.chunks.delete(key);
  }

  heightAt(x,z) { return this.terrain.heightAt(x,z); }

  update(stage, ink, focus, seed) {
    if (seed == null || stage < 0 || stage > 3) {
      if (this.seed !== null) this.clear();
      return;
    }
    if (this.stage !== stage || this.seed !== seed) {
      this.clear();
      this.terrain.setWorld(stage,seed);
    }
    this.ink = ink;
    const { column, row } = frontierCell(focus.x,focus.z);
    const previous = this.center;
    if (previous?.column !== column || previous?.row !== row) {
      this.center = {column,row};
      this.terrain.retain(column,row,retainRadius);
      for (const [key,chunk] of this.chunks) {
        const distance = Math.max(Math.abs(chunk.column-column),Math.abs(chunk.row-row));
        if (distance > retainRadius) this.remove(key,chunk);
      }
      this.pending = [];
      for (let j = row-loadRadius; j <= row+loadRadius; j++) {
        for (let i = column-loadRadius; i <= column+loadRadius; i++) {
          const key = `${i}:${j}`;
          if (this.chunks.has(key)) continue;
          const d2 = (i*FRONTIER_SIZE-focus.x)**2 + (j*FRONTIER_SIZE-focus.z)**2;
          this.pending.push({key,column:i,row:j,d2});
        }
      }
      this.pending.sort((a,b)=>a.d2-b.d2);
    }
    if (!this.pending.length) return;
    const time = performance.now();
    let built = 0;
    do {
      const {key,column,row} = this.pending.shift();
      const tile = this.terrain.tile(column,row);
      let root = null;
      if (tile.top > wetLine || tile.landmark) {
        if(tile.top > wetLine && tile.top > FRONTIER_BED){
          root = buildChunk(this.environment,stage,seed,tile);
          this.environment.register(ink,root);
        }else{
          root=new THREE.Group();
          root.userData.frontierWind=[];
          root.name=tile.landmark.name;
        }
        if(tile.landmark)addFrontierLandmark(root,tile.landmark,this.environment.heightAt);
        this.environment.parent.add(root);
        this.revision++;
        built++;
      }
      this.chunks.set(key,{column,row,root,banks:tile.banks,landmark:tile.landmark});
      if(tile.banks.length)this.bankFocus.set(Infinity,Infinity);
    } while (this.pending.length && built < 2 && performance.now() - time < 4);
    this.peak = Math.max(this.peak,this.chunks.size);
  }

  updateLandmarks(time,water,focus) {
    for(const chunk of this.chunks.values())if(chunk.landmark)updateFrontierLandmark(chunk.root,time,water,focus);
  }

  banksAt(focus) {
    const authored = this.environment.obstacles;
    if (this.seed === null || this.stage > 1) return authored;
    if (this.bankFocus.distanceToSquared({x:focus.x,y:focus.z}) < 9) return this.wetBanks;
    this.bankFocus.set(focus.x,focus.z);
    const candidates = [...authored];
    for (const chunk of this.chunks.values()) candidates.push(...chunk.banks);
    const score = bank => (bank.x-focus.x)**2+(bank.z-focus.z)**2;
    candidates.sort((a,b)=>score(a)-score(b));
    this.wetBanks = candidates.slice(0,10);
    return this.wetBanks;
  }

  inspect() {
    let loaded = 0;
    for (const chunk of this.chunks.values()) loaded += Number(Boolean(chunk.root));
    return {stage:this.stage,seed:this.seed,center:this.center,loaded,cells:this.chunks.size,
      sampled:this.terrain.tileCount,pending:this.pending.length,peak:this.peak};
  }
}
