import * as THREE from 'three';
import { intakeDeformation } from './dragon-art-enemy-pose.js';
import reducedFauna from './assets/fauna-crowd.json';
import { SEA_TO_MOUNTAIN_BOSS_SINK } from './chapter-view.js';

const FULL_DETAIL_LIMIT = 40;
const MIDDLE_LIMIT = 280;
const CLOSE_RADIUS = 7.4;
const MARKING_RADIUS = 14;
const axis = new THREE.Vector3(0, 1, 0);
const distanceOrder = (a, b) => a.score - b.score || a.enemy.id - b.enemy.id;
const hasLane = enemy => enemy.pincer || enemy.dartRush || enemy.dive || enemy.cloudPass;

export function faunaStasis(enemy, time) {
  if (!(enemy.dragonArtHeldUntil > time) || enemy.dragonArtMark === 'rift') return 0;
  return enemy.dragonArtMark === 'frost' ? 2 : 1;
}

function crowdMesh(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Only red is used. Keep the mark on the mesh so it is released with the
  // instance buffer on resize, even though the painted geometry is reused.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    .setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function reducedGeometry(type, form, level) {
  const source = reducedFauna[type + ':' + form] ?? reducedFauna[type + ':standard'];
  if (!source) return null;
  const [count, base64] = source[level];
  const encoded = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  const vertices = new Int16Array(encoded.buffer, 0, count * 12);
  const geometry = new THREE.BufferGeometry();
  let offset = 0;
  for (const [name, width] of [['position',3],['normal',3],['inkGuides',2],['faunaPaint',4]]) {
    const data = new Float32Array(count * width);
    for (let i=0;i<count;i++) {
      for (let j=0;j<width;j++) data[i*width+j]=vertices[i*12+offset+j]/4096;
    }
    geometry.setAttribute(name,new THREE.BufferAttribute(data,width));
    offset+=width;
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(encoded.buffer,count*24),1));
  return geometry;
}

export class FaunaCrowd {
  constructor(scene, ink, paint, describe) {
    this.scene = scene;
    this.ink = ink;
    this.paint = paint;
    this.describe = describe;
    this.batches = new Map();
    this.detail = [];
    this.visible = [];
    this.entries = [];
    this.point = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.size = new THREE.Vector3();
    this.transform = new THREE.Matrix4();
    this.viewProjection = new THREE.Matrix4();
    this.frustum = new THREE.Frustum();
    this.sphere = new THREE.Sphere();
    this.frozenPoseTimes = new WeakMap();
  }

  clear() {
    this.detail.length=0;
    this.visible.length=0;
    this.entries.length=0;
    for(const batch of this.batches.values()) {
      batch.entries.length=0;
      batch.mesh.count=0;
      batch.mesh.visible=false;
    }
    this.stats={instanced:0,calls:0,fullDetail:0};
  }

  select(game, camera, previous, mode) {
    const {enemies,p} = game;
    this.detail.length = 0;
    this.visible.length = 0;
    if (mode.hidden) return this.detail;
    if (mode.transition) {
      if (!mode.transition.switched && mode.transition.age<SEA_TO_MOUNTAIN_BOSS_SINK && game.boss) this.detail.push(game.boss);
      return this.detail;
    }
    if (enemies.length <= FULL_DETAIL_LIMIT) return enemies;
    this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    let selected = 0;
    const target = game.clawAttack?.target;
    for (const enemy of enemies) {
      const distance = (enemy.x-p.x)**2 + (enemy.y-p.y)**2 + (enemy.z-p.z)**2;
      if (enemy.boss || hasLane(enemy) || target===enemy || enemy.id===mode.contactTarget) {
        this.detail.push(enemy);
        continue;
      }
      this.sphere.center.set(enemy.x,enemy.y,enemy.z);
      this.sphere.radius=1.7;
      if (!this.frustum.intersectsSphere(this.sphere) && distance>CLOSE_RADIUS**2) continue;
      const entry=this.entries[selected]??(this.entries[selected]={});
      entry.enemy=enemy;
      entry.distance=distance;
      entry.score=distance*(previous.has(enemy.id)?.84:1);
      entry.full=false;
      this.visible.push(entry);
      selected++;
    }
    this.entries.length=selected;
    this.visible.sort(distanceOrder);
    let close=0;
    while (close<this.visible.length && this.detail.length<FULL_DETAIL_LIMIT) {
      const entry=this.visible[close++];
      const {enemy,distance,score}=entry;
      if (score>(CLOSE_RADIUS+1.6)**2*.84) break;
      const reach=previous.has(enemy.id)?CLOSE_RADIUS+1.6:CLOSE_RADIUS;
      if (distance>reach**2) continue;
      this.detail.push(enemy);
      entry.full=true;
    }
    return this.detail;
  }

  batch(type, form, tint, strength, level) {
    const key=type+':'+form+':'+level;
    let batch=this.batches.get(key);
    if (!batch) {
      const geometry=reducedGeometry(type,form,level);
      if(!geometry)return null;
      const mesh=crowdMesh(geometry,new THREE.MeshBasicMaterial(),32);
      mesh.userData.inkTint=tint;
      mesh.userData.inkTintAmount=strength;
      this.ink.register(mesh,{
        strokes:false,geometryInfluence:0,occlusionProxy:false,
        toneRange:type===2?[.11,.38]:[.14,.47],reserveStrength:.29,coherentInk:.19,
      });
      const material=this.ink.records.find(record=>record.mesh===mesh).material;
      this.paint(material,mesh.geometry,type,this.ink,true);
      geometry.dispose();
      this.scene.add(mesh);
      batch={mesh,entries:[]};
      this.batches.set(key,batch);
    }
    return batch;
  }

  update(game,time,camera,previous,mode) {
    const detail=this.select(game,camera,previous,mode);
    const renderTimeOffset=time-game.time;
    for (const batch of this.batches.values()) batch.entries.length=0;
    const reveal=mode.storyShot?mode.revealCenter:null;
    const revealRadius=game.stage===3?12:8;
    let middle=0;
    for (const {enemy,distance,full} of this.visible) {
      if(full)continue;
      if (reveal && (enemy.x-reveal.x)**2+(enemy.y-reveal.y)**2+(enemy.z-reveal.z)**2<revealRadius**2) continue;
      const level=distance<MARKING_RADIUS**2&&middle<MIDDLE_LIMIT?'middle':'far';
      if(level==='middle')middle++;
      const {type,form,tint,strength}=this.describe(enemy,game.stage);
      const batch=this.batch(type,form,tint,strength,level);
      if(!batch){detail.push(enemy);continue;}
      batch.entries.push(enemy);
    }
    let instanced=0, calls=0;
    for (const batch of this.batches.values()) {
      const {mesh,entries}=batch;
      const count=entries.length;
      if (count>mesh.instanceMatrix.count) {
        const nextSize=2**Math.ceil(Math.log2(count));
        // Replace the mesh to release its old WebGL instance buffer, then
        // retain its existing ink record and analyzed shared geometry.
        const replacement=crowdMesh(mesh.geometry,mesh.material,nextSize);
        Object.assign(replacement.userData,mesh.userData);
        const record=this.ink.records.find(candidate=>candidate.mesh===mesh);
        record.mesh=replacement;
        this.scene.remove(mesh);
        mesh.dispose();
        this.scene.add(replacement);
        batch.mesh=replacement;
      }
      const current=batch.mesh;
      current.visible=count>0;
      current.count=count;
      if (!count) continue;
      calls++;
      instanced+=count;
      const marks=current.instanceColor;
      let marksChanged=false;
      for (let i=0;i<count;i++) {
        const enemy=entries[i];
        const mark=faunaStasis(enemy,game.time);
        let poseTime=time;
        if(mark){
          const heldAt=enemy.dragonArtHeldAt;
          let frozen=this.frozenPoseTimes.get(enemy);
          if(!frozen||frozen.heldAt!==heldAt){
            frozen={heldAt,time:renderTimeOffset+(heldAt??game.time)};
            this.frozenPoseTimes.set(enemy,frozen);
          }
          // Game time stops while paused, while the render clock can run on.
          poseTime=frozen.time;
        }
        const phase=poseTime*4+enemy.phase;
        const hit=!mark&&enemy.hit>0?1.1:1;
        this.point.set(enemy.x,enemy.y-.05+Math.sin(phase)*.08,enemy.z);
        this.rotation.setFromAxisAngle(axis,enemy.angle+Math.sin(phase)*.06);
        this.size.set(hit,hit*(1+Math.cos(phase)*.045),hit);
        const intake=intakeDeformation(enemy,game.activeDragonArt,game.time);
        if(intake>0){
          const mouth=enemy.dragonArtPullCenter;
          this.rotation.setFromAxisAngle(axis,Math.atan2(mouth.x-enemy.x,mouth.z-enemy.z));
          this.size.multiplyScalar(1-.42*intake);
          this.size.z=hit*(1+.57*intake);
        }
        this.transform.compose(this.point,this.rotation,this.size);
        current.setMatrixAt(i,this.transform);
        if (marks.getX(i)!==mark) {
          marks.setX(i,mark);
          marksChanged=true;
        }
      }
      current.instanceMatrix.clearUpdateRanges();
      current.instanceMatrix.addUpdateRange(0,count*16);
      current.instanceMatrix.needsUpdate=true;
      if (marksChanged) {
        marks.clearUpdateRanges();
        marks.addUpdateRange(0,count*3);
        marks.needsUpdate=true;
      }
    }
    this.stats={instanced,calls,fullDetail:detail.length};
    return detail;
  }

  inspect() {
    return this.stats;
  }
}
