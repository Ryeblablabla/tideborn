import { gateStoneInk } from './gate-mineral-ink.js';
import { portalRoofInk } from './portal-roof-ink.js';
import * as THREE from 'three';
import{mergeGeometries}from'three/addons/utils/BufferGeometryUtils.js';
import{random}from'../rules.js';
import {inkHeightfield, inkTerrain} from './terrain.js';
import {frontierRiver} from '../world-frontier.js';
import {InkFrontier} from './frontier.js';
import {buildGreatLake, buildMountainValley, buildOffshoreReefs, buildReedMarsh, mountainRiver} from './landforms.js';
import { addChapterVista } from './chapter-vista.js';
import { arrangeChapterValley, reserveChapterValleyShoulder } from './chapter-valley-layout.js';
import { addChapterInkForeground } from './chapter-ink-foreground.js';
import { installChapterCliffBrush, installChapterRidgeGlaze, chapterRidgeGlazeWeight, registerChapterTerraceMist, installChapterWestShoreInk, chapterWestShoreInkWeight } from './chapter-cliff-brush.js';
import { chapterValleyPaintWeight, prepareChapterValleyPaint, chapterValleyPaintGLSL, finishChapterValleyPaint } from './chapter-valley-paint.js';
import {createHeaven} from './heaven.js';
import {shadeValleyStrata} from './valley-rock.js';
import {drawStructureContacts, populateShallows} from './shore-plants.js';
import {fillStoneGuides, foundedStone, SHORE_WATER, shoreStructureMark} from './shore-structure.js';
import {BeamTerrainScorch} from './beam-terrain-scorch.js';
const TAU=Math.PI*2,gray=new THREE.MeshStandardMaterial({color:'#b1b1ad',roughness:1,side:THREE.DoubleSide});
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function piece(g,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){g.applyMatrix4(new THREE.Matrix4().compose(V(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),V(...scale)));if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;}
function merge(parts){const normalized=parts.map(g=>{if(g.index){const copy=g.toNonIndexed();g.dispose();return copy;}return g;});for(const g of normalized){g.deleteAttribute('uv');g.deleteAttribute('color');}const result=mergeGeometries(normalized);normalized.forEach(g=>g.dispose());return result;}
function tube(points,radius=.04,sides=5){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>V(...v))),Math.max(5,points.length*4),radius,sides,false);}
function gridSurface(n,m,fn){const p=[],uv=[],idx=[];for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){p.push(...fn(i/n,j/m));uv.push(i/n,j/m);if(i<n&&j<m){const k=i*(m+1)+j;idx.push(k,k+1,k+m+1,k+1,k+m+2,k+m+1);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function roof(w,d,h){return gridSurface(24,16,(u,v)=>{const x=(u-.5)*2,z=(v-.5)*2;return[x*w*.5,h*(1-Math.abs(z))**.72+.75*(Math.abs(x)**6)+.48*(Math.abs(z)**5),z*d*.5];});}
function sampleTerrain(surfaces,x,z){
 let height=-Infinity;
 for(const surface of surfaces){
  if(Math.abs(x-surface.x)>surface.rx||Math.abs(z-surface.z)>surface.rz)continue;
  height=Math.max(height,surface.y+surface.sample(x-surface.x,z-surface.z));
 }
 return height;
}
export class InkEnvironment {
 constructor(parent){
  this.parent=parent;this.cache=new Map();this.building=new Map();this.stage=-1;this.obstacles=[];this.wind=[];
  this.palaceSurfaceInk={value:1};
  this.terrains=Array.from({length:5},()=>[]);
  this.chapterValleyPaint = { value: 0 };
  this.chapterValleyLayoutWeight = { value: 0 };
  this.cameraTerrain=[];
  this.chapterWestShoreInk = { value: 0 };
  this.chapterRidgeGlaze = { value: 0 };
  this.beamScorch = new BeamTerrainScorch();
  this.mountainRiver=z=>frontierRiver(mountainRiver,this.frontier.stage===3?this.frontier.seed:null,z);
  this.frontier=new InkFrontier(this,this.mountainRiver);
  this.heightAt=(x,z)=>{
   let height=sampleTerrain(this.terrains[this.stage]??[],x,z);
   if(this.frontier.stage===this.stage)height=Math.max(height,this.frontier.heightAt(x,z));
   return height;
  };
  this.cameraHeightAt=(x,z)=>this.stage===3
   ? Math.max(this.heightAt(x,z),sampleTerrain(this.cameraTerrain,x,z)):this.heightAt(x,z);
  this.stageNames=['苇汀初醒','烟波大湖','沧溟行雨','青绿千山','九重天阙'];this.setStage(0);
 }
 add(root,geometry,at=[0,0,0],{tint,amount=.55,profile={},wind=false}={}){
  const mesh=new THREE.Mesh(geometry,gray);mesh.position.set(...at);mesh.userData.inkProfile={geometryInfluence:.35,reserveStrength:.10,macroInk:.20,toneRange:[.16,.72],strokeProfile:{frequency:.24,lengthRange:[.09,.27]},...profile};
  if(tint){mesh.userData.inkTint=tint;mesh.userData.inkTintAmount=amount;}
  root.add(mesh);
  if(wind){
   const frontierWind=root.userData.frontierWind??root.parent?.userData.frontierWind;
   const windList=frontierWind??this.wind;
   const phase=frontierWind?at[0]*.67+at[2]*.41+(root.position.x+root.position.z)*.19:this.wind.length*1.7;
   windList.push({mesh,phase,base:at[1]});
  }
  return mesh;
 }
 terrain(root, x, y, z, size, options = {}) {
  const {
   tint, amount, profile, shape, angle, field, paint, columns, rows,
   seed = x * .3 + z * .7, distant = false, collision = !distant, wash, pooling = .10, gain = 1, strokeStrength = .28,
  } = options;
  const config = { width:size[0], height:size[1], depth:size[2], seed, shape, angle, paint, columns, rows, waterline: -.14-y };
  const terrain = field ? inkHeightfield({ ...config, field }) : inkTerrain(config);
  const mesh = this.add(root, terrain.geometry, [x,y,z], {tint,amount,profile});
  mesh.userData.landscape = distant ? 2 : 1;
  mesh.userData.landWash = wash;
  mesh.userData.landPooling = pooling;
  mesh.userData.landGain = gain;
  mesh.userData.authoredPigment = !!paint;
  mesh.userData.landStrokeStrength = strokeStrength;
  const stage=root.userData.stage;
  if (collision||stage===3) {
   const cosine=Math.abs(Math.cos(angle??0)),sine=Math.abs(Math.sin(angle??0));
   const surface={x,y,z,rx:size[0]*cosine+size[2]*sine,rz:size[0]*sine+size[2]*cosine,sample:terrain.heightAt};
   // Visible peaks are a camera obstruction even when they let the dragon fly through.
   if(collision)this.terrains[stage].push(surface);
   else this.cameraTerrain.push(surface);
  }
  return {mesh,heightAt:(dx,dz)=>y+terrain.heightAt(dx,dz)};
 }
 pine(root,x,y,z,size=1,seed=1) {
  const rng=random(seed);
  const bend=(rng()-.5)*.7;
  const trunk=[[0,-.22,0],[bend-.2,1.2,.03],[bend+.16,2.3,.16],[bend+.03,3.35,.21]];
  const parts=[tube(trunk,.104)];
  for (const sign of [-1,1]) parts.push(tube([[sign*.34,-.24,sign*.14],[sign*.16,-.07,sign*.065],[0,.25,0]],.057));
  for(let tier=0;tier<5;tier++) {
   const angle=tier*2.38+rng()*.96;
   const h=1.04+tier*.42;
   const reach=(1.32-tier*.10)*(.74+rng()*.44);
   const px=Math.cos(angle)*reach,pz=Math.sin(angle)*reach;
   parts.push(tube([[bend*.66,h-.29,.08],[px*.60,h-.12,pz*.62],[px,h+.07,pz]],.04));
   for(let twig=0;twig<7;twig++) {
    const l=twig/6;
    const xx=px*(.53+.54*l)+(rng()-.5)*.46;
    const zz=pz*(.53+.54*l)+(rng()-.5)*.48;
    const yy=h+.08+Math.sin(l*Math.PI)*.12+rng()*.13;
    parts.push(piece(new THREE.SphereGeometry(1,6,4),[xx,yy,zz],
     [.29+rng()*.25,.085+rng()*.09,.21+rng()*.19],[0,angle+rng(),(rng()-.5)*.3]));
   }
  }
  const geometry=merge(parts);
  geometry.scale(size,size,size);
  return this.add(root,geometry,[x,y,z],{
   tint:'#364c3d',amount:.42,profile:{strokes:false,geometryInfluence:0,toneRange:[.18,.55],coherentInk:.34},
  });
 }
 pavilion(root,x,y,z,size=1) {
  const groundAt=(u,v)=>this.heightAt(x+u*size,z+v*size);
  const baseWidth=3.62,baseDepth=3.48;
  for(const u of [-1.74,0,1.74]) for(const v of [-1.66,0,1.66]) {
   const h=groundAt(u,v);
   if(Number.isFinite(h)) y=Math.max(y,h-.19);
  }
  const pavilion = new THREE.Group();
  pavilion.position.set(x,y,z);
  pavilion.scale.setScalar(size);
  pavilion.name='临湖小亭';
  root.add(pavilion);

  const localGround = (u,v) => {
   const height = groundAt(u,v);
   return ((Number.isFinite(height) ? height : SHORE_WATER-.67) - y) / size;
  };
  // The footing wraps the sampled bank. The level paving and each tread
  // meet the same plinth rather than hovering over a uniformly cut box.
  const foundation=foundedStone(baseWidth,baseDepth,0,0,()=>-.03,localGround,.28,7);
  const stone = [
   foundation,
   piece(new THREE.BoxGeometry(3.87,.26,3.71),[0,.03,0]),
   piece(new THREE.BoxGeometry(3.28,.16,3.17),[0,.18,0]),
  ];
  const padOuter=-3.04, padLength=.46, padCenter=padOuter+padLength*.5;
  const treadInner=-1.56, treadCount=4, passageZ=-.40, passageWidth=1.51;
  const floorTop=.26;
  const padLand = Math.max(...[-1,0,1].flatMap(u=>[-1,0,1].map(v=>
   localGround(padCenter+u*padLength*.47,passageZ+v*passageWidth*.48),
  )));
  const padTop = Math.max(floorTop-.73,padLand+.046);
  stone.push(foundedStone(padLength,passageWidth,padCenter,passageZ,()=>padTop,localGround,.28));
  const treadWidth=(treadInner-(padOuter+padLength))/treadCount;
  for(let i=0;i<treadCount;i++){
   const u=padOuter+padLength+(i+.5)*treadWidth;
   const top=THREE.MathUtils.lerp(padTop,floorTop,(i+1)/(treadCount+1));
   stone.push(foundedStone(treadWidth+.014,passageWidth,u,passageZ,()=>top,localGround,.23,3));
  }
  pavilion.userData.bridgeLanding = {
   x:x+padCenter*size,z:z+passageZ*size,y:y+padTop*size,
   width:passageWidth*size,depth:padLength*size,
  };
  for(const side of [-1,1]){
   shoreStructureMark(root,this,x+padOuter*size,z+(passageZ+side*.64)*size,
    side*.21+.92,.92,.16,.24,4901+side);
  }
  const wood = [];
  for (const px of [-1.24,1.24]) for (const pz of [-1.16,1.16]) {
   stone.push(piece(new THREE.CylinderGeometry(.135,.185,.21,8),[px,.35,pz]));
   wood.push(piece(new THREE.CylinderGeometry(.088,.115,2.22,8),[px,1.55,pz]));
   wood.push(piece(new THREE.BoxGeometry(.37,.21,.41),[px,2.64,pz]));
  }
  for (const side of [-1,1]) {
   wood.push(piece(new THREE.BoxGeometry(2.91,.19,.17),[0,2.53,side*1.16]));
   wood.push(piece(new THREE.BoxGeometry(.17,.19,2.81),[side*1.24,2.53,0]));
  }
  wood.push(piece(new THREE.BoxGeometry(2.92,.33,2.75),[0,2.79,0]));
  const outer = roof(4.15,3.78,.95);
  outer.translate(0,2.51,0);
  const under = outer.clone();
  under.translate(0,-.13,0);
  const caps = [outer,under,piece(new THREE.SphereGeometry(.12,7,6),[0,3.54,0])];
  const tileLines = [];
  const roofHeight = (x,z) => 2.51 + .95*(1-Math.abs(z/1.89))**.72
    + .75*Math.abs(x/2.075)**6 + .48*Math.abs(z/1.89)**5;
  for (let course=0; course<11; course++) {
   const x = -1.89 + course*.377;
   for (const side of [-1,1]) {
    const points = Array.from({length:8},(_,i)=>{
     const z = side*(.10+i/7*(1.59 + .15*Math.cos(course*1.7)));
     return [x,roofHeight(x,z)+.014,z];
    });
    tileLines.push(tube(points,.017+(course%3===0?.006:0),4));
   }
  }
  const ridge = Array.from({length:9},(_,i)=>{
   const x = -1.95 + i*.4875;
   return [x,roofHeight(x,0)+.033,0];
  });
  tileLines.push(tube(ridge,.034,5));
  for(const side of [-1,1]) {
   caps.push(tube(Array.from({length:9},(_,i)=>{
    const u=i/4-1;
    return [u*2.075,2.94+.68*Math.abs(u)**6,side*1.89];
   }),.056));
  }
  this.add(pavilion,merge(fillStoneGuides(stone)),[0,0,0],{tint:'#786a54',amount:.30,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.12,.34],coherentInk:.14}}).name='接岸石台与逐级石踏';
  this.add(pavilion,merge(wood),[0,0,0],{tint:'#705748',amount:.61,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.21,.50],coherentInk:.21}});
  this.add(pavilion,merge(caps),[0,0,0],{tint:'#37453f',amount:.43,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.23,.57],coherentInk:.27}});
  this.add(pavilion,merge(tileLines),[0,0,0],{tint:'#59665a',amount:.27,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.16,.36],coherentInk:.19}}).name='叠瓦脊线';
  return pavilion;
 }
 bridge(root,x,z,rotation=0,span=8.8,deckWidth=1.63) {
  const originalX = Math.cos(rotation), originalZ = -Math.sin(rotation);
  const startPoint = { x:x-originalX*span*.5, z:z-originalZ*span*.5 };
  const landing = root.userData.stage === 1 ? root.getObjectByName('临湖小亭')?.userData.bridgeLanding : null;
  const endPoint = landing ?? { x:x+originalX*span*.5, z:z+originalZ*span*.5 };
  const dx=endPoint.x-startPoint.x,dz=endPoint.z-startPoint.z;
  span=Math.hypot(dx,dz);
  x=(endPoint.x+startPoint.x)*.5;z=(endPoint.z+startPoint.z)*.5;
  rotation=Math.atan2(-dz,dx);
  const cosine=Math.cos(rotation),sine=Math.sin(rotation);
  const worldPoint=(u,v)=>[x+cosine*u+sine*v,z-sine*u+cosine*v];
  const groundAt=(u,v)=>this.heightAt(...worldPoint(u,v));
  const half=span*.5;
  const gradeAt=u=>Math.max(...[-.49,-.24,0,.24,.49].map(side=>groundAt(u,side*deckWidth)));
  const start=Math.max(.08,gradeAt(-half)+.07);
  const end=landing?landing.y+.015:Math.max(.08,gradeAt(half)+.07);
  const arch=landing?.46:.49;
  const deckTop=u=>{
   const t=THREE.MathUtils.clamp(u/span+.5,0,1);
   return THREE.MathUtils.lerp(start,end,t)+Math.sin(t*Math.PI)**1.4*arch;
  };
  const deck=[], supports=[];
  const boards=25, boardWidth=span/boards, deckThickness=landing?.18:.14;
  for(let i=0;i<boards;i++){
   const u=-half+(i+.5)*boardWidth;
   const plank=new THREE.BoxGeometry(boardWidth-.010,deckThickness,deckWidth);
   const position=plank.attributes.position;
   for(let j=0;j<position.count;j++){
    const along=u+position.getX(j);
    position.setX(j,along);
    position.setY(j,position.getY(j)-deckThickness*.5+deckTop(along));
   }
   plank.computeVertexNormals();
   deck.push(plank);
  }
  const railHeight=landing?.57:.49;
  for(const side of [-1,1]){
   const v=side*(deckWidth*.5-.055);
   for(let i=0;i<=8;i++){
    const u=THREE.MathUtils.lerp(-half+.23,half-.23,i/8);
    deck.push(piece(new THREE.CylinderGeometry(.040,.052,railHeight,6),[u,deckTop(u)+railHeight*.48,v]));
   }
   deck.push(tube(Array.from({length:13},(_,i)=>{
    const u=THREE.MathUtils.lerp(-half+.22,half-.22,i/12);
    return [u,deckTop(u)+railHeight,v];
   }),.032,5));
  }
  // Footings follow the full width of each approach and the separate piers.
  // The last bridge boards lap over the matching pavilion pad.
  for(const side of [-1,1]){
   const u=side*half;
   const meetsPavilion=side===1&&landing;
   const headWidth=deckWidth+(meetsPavilion?.11:.27);
   supports.push(foundedStone(.63,headWidth,u-side*.21,0,
    sample=>deckTop(sample)-.040,groundAt,.26,4));
   if(meetsPavilion) continue;
   const length=landing?1.03:1.17;
   const outer=u+side*length;
   supports.push(foundedStone(length+.08,headWidth,outer-side*length*.5,0,
    (sample,v)=>{
     const fraction=THREE.MathUtils.smoothstep(Math.abs(sample-outer),0,length);
     const height=groundAt(sample,v);
     const surface=Number.isFinite(height)?Math.max(SHORE_WATER+.04,height+.030):SHORE_WATER+.04;
     return THREE.MathUtils.lerp(surface,deckTop(u)-.008,fraction);
    },groundAt,.24,7));
  }
  const seats=[];
  for(const t of (landing?[.32,.57,.76]:[.27,.52,.76])){
   const u=(t-.5)*span, bottomDeck=deckTop(u)-deckThickness;
   const sillWidth=deckWidth+.09;
   const pierSide=deckWidth*.5-(landing?.245:.175);
   const pierWidth=landing?.25:.19;
   for(const side of [-1,1]){
    const v=side*pierSide;
    supports.push(foundedStone(pierWidth,pierWidth,u,v,()=>bottomDeck-.073,groundAt,.32,2));
    const [px,pz]=worldPoint(u,v);
    seats.push({x:px,z:pz,terrain:groundAt(u,v),beam:bottomDeck});
    shoreStructureMark(root,this,px,pz,rotation+side*.69,landing?1.14:.65,landing?.15:.093,.26,
     Math.round(5831+px*4+pz*3));
   }
   deck.push(piece(new THREE.BoxGeometry(.19,.13,sillWidth),[u,bottomDeck-.027,0]));
  }
  const bridge=new THREE.Group();
  bridge.position.set(x,0,z);
  bridge.rotation.y=rotation;
  bridge.name=landing?'湖亭连桥':'江谷小桥';
  bridge.userData.shoreSeats = { start:{...startPoint,y:start,ground:gradeAt(-half)},
   end:{x:endPoint.x,z:endPoint.z,y:end,ground:gradeAt(half)},landing:landing ?? null,piers:seats };
  root.add(bridge);
  this.add(bridge,merge(deck),[0,0,0],{tint:'#594d40',amount:.45,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.18,.44],coherentInk:.16}}).name='随坡桥面与扶栏';
  this.add(bridge,merge(supports),[0,0,0],{tint:'#726854',amount:.29,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.11,.30],coherentInk:.12}}).name='落地桥台与桥墩';
  if(root.userData.stage===3)drawStructureContacts(this,root);
  return bridge;
 }
 marsh(root) {buildReedMarsh(this, root);populateShallows(this, root, 0);}
 heaven(root) {this.landmark = createHeaven(this, root);}
 *populateStage(stage,root){
  if (stage===0) this.marsh(root);
  if (stage===1) {
   yield* buildGreatLake(this,root);
   yield;
   populateShallows(this,root,1);
  }
  if (stage===2) buildOffshoreReefs(this,root);
  if (stage===3) {
   yield* buildMountainValley(this,root);
   yield;
   yield* addChapterVista(this,root);
   yield;
   this.chapterInkForeground=addChapterInkForeground(this,root);
   this.chapterValleyLayout=arrangeChapterValley(root);
  }
  if (stage===4) this.heaven(root);
 }
 prepareStageSlice(stage,ink){
  const ready=this.cache.get(stage);
  if(ready){
   if(ink)this.register(ink,ready);
   return ready;
  }
  let build=this.building.get(stage);
  if(!build){
   const root=new THREE.Group();
   root.name='墨境_'+this.stageNames[stage];
   root.userData.stage=stage;
   root.userData.shoreObstacles=[];
   build={root,steps:this.populateStage(stage,root)};
   this.building.set(stage,build);
  }
  // Placement reads the stage being built. Restore the live scene before
  // yielding, and keep the partial root detached until it can be displayed.
  const {root,steps}=build;
  const active=this.stage, obstacles=this.obstacles;
  this.stage=stage;
  this.obstacles=root.userData.shoreObstacles;
  let done;
  try { ({done}=steps.next()); }
  finally { this.stage=active; this.obstacles=obstacles; }
  if(!done)return;
  this.building.delete(stage);
  root.visible=stage===active;
  this.cache.set(stage,root);
  this.parent.add(root);
  if(ink)this.register(ink,root);
  return root;
 }
 prepareStage(stage,ink){
  let root;
  while(!root)root=this.prepareStageSlice(stage,ink);
  return root;
 }
 setStage(stage,ink,focus){
  const changed = this.stage !== stage;
  const root = this.prepareStage(stage,ink);
  this.stage = stage;
  if (changed) {
   for (const [s,r] of this.cache) r.visible=s===stage;
   this.obstacles.splice(0,this.obstacles.length,...root.userData.shoreObstacles);
  }
  if (stage===4 && focus) {
   root.position.set(focus.x,0,focus.z);
   root.rotation.y=focus.angle||0;
  }
  return root;
 }
 updateFrontier(stage,ink,focus,seed){this.frontier.update(stage,ink,focus,seed);}
 clearFrontier(){this.frontier.clear();}
 register(ink,root=this.cache.get(this.stage)){
  if(root.userData.registered)return;ink.register(root,{occlusionProxy:false});root.userData.registered=true;
  const meshes = new Set();
  root.traverse(m => meshes.add(m));
  for (const record of ink.records) {
   if (!meshes.has(record.mesh)) continue;
   const material = record.material;
   material.uniforms.uCun = {value:.29};
   material.uniforms.uBoneInk = {value:.38};
   material.uniforms.uDry = {value:.42};
   const {palaceBrush,palaceInkBounds}=record.mesh.userData;
   if(palaceBrush)paintPalaceSurface(material,palaceBrush,this.palaceSurfaceInk);
   if(palaceInkBounds){
    material.uniforms.uCenter.value.copy(palaceInkBounds.center);
    material.uniforms.uObjectScale.value=1/palaceInkBounds.size;
   }
   if (record.brush) record.brush.material.uniforms.uStrokeStrength = {value:record.mesh.userData.landStrokeStrength ?? .28};
   if(record.mesh.userData.inkSurfaceWash){
    material.transparent=true;
    material.depthWrite=false;
    material.forceSinglePass=true;
    material.fragmentShader=material.fragmentShader.replace('vec4(reflectance,paperReserve,grain,1.0)',
     'vec4(.29,0.,grain,vGuides.x*(.72+.28*grain))');
    material.needsUpdate=true;
   }
   const kind = record.mesh.userData.landscape;
   if (!kind) continue;
   const wash = record.mesh.userData.landWash;
   if (wash !== undefined) material.uniforms.uBaseWash.value = wash;
   else if (root.userData.stage === 3 && kind === 1) material.uniforms.uBaseWash.value=.43;
   material.uniforms.uLandPooling = {value:record.mesh.userData.landPooling};
   material.uniforms.uLandGain = {value:record.mesh.userData.landGain};
   material.uniforms.uTerrainDistance = {value:kind===2 ? 1 : 0};
   material.uniforms.uAuthoredLand = {value:Number(record.mesh.userData.authoredPigment)};
   const streamed=record.mesh.userData.streamedTerrain;
   material.vertexShader = 'varying vec2 vLandscape;\n' + material.vertexShader.replace(
    'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    `vec4 worldPosition = modelMatrix * vec4(position,1.0); vec4 viewPosition = modelViewMatrix * vec4(position,1.0);
     ${streamed?'vPaint = worldPosition.xyz * .02083333333;':''}
     vLandscape = vec2(worldPosition.y,-viewPosition.z); gl_Position = projectionMatrix * viewPosition;`,
   );
   material.fragmentShader = 'varying vec2 vLandscape; uniform float uTerrainDistance; uniform float uLandPooling; uniform float uLandGain; uniform float uAuthoredLand;\n' + material.fragmentShader.replace(
    'float reflectance=exp(-pigment*3.1);',
    `vec3 mineralNormal=normalize(vFormNormal);
     float slope=1.-abs(mineralNormal.y);
     float stone=smoothstep(.20,.78,slope+(wash-.5)*.42);
     float distanceWash=smoothstep(27.,130.,vLandscape.y);
     float foot=1.-smoothstep(-.12,2.4,vLandscape.x+(wash-.5)*1.7);
     float slab=fbm(vPaint*vec3(3.4,4.1,3.8)+vec3(7.3,2.1,5.4));
     float washMass=smoothstep(.39,.67,slab*.72+stone*.28);
     float facet=dot(mineralNormal,normalize(vec3(-.61,.57,.55)));
     float facingWash=smoothstep(-.19,.48,facet+(slab-.5)*.25);
     float groundedFace=smoothstep(.14,.67,slope+.25*(1.-facingWash));
     float darkMass=uAuthoredLand*smoothstep(.18,.69,vGuides.x+(slab-.5)*.15)*(.66+.34*groundedFace);
     pigment*=mix(.67+.48*stone,1.07-.49*facingWash,uAuthoredLand);
     pigment+=washMass*uLandPooling*(1.-uTerrainDistance*.88);
     pigment=mix(pigment, .66+.38*wash, darkMass*(1.-distanceWash*.62));
     float exposedPaper=uAuthoredLand*smoothstep(.15,.52,vGuides.y+(wash-.5)*.13);
     paperReserve=max(paperReserve,exposedPaper*.55);
     pigment*=1.-distanceWash*(.51+uTerrainDistance*.28);
     pigment*=1.-foot*(.32+uTerrainDistance*.44);
     float reflectance=exp(-pigment*uLandGain*3.1);`,
   );
   if(record.mesh.geometry.hasAttribute('inkStrata')) shadeValleyStrata(material);
   const chapterPaint=root.userData.stage===3&&!streamed
     &&prepareChapterValleyPaint(record.mesh,material,this.chapterValleyPaint,ink);
   if(root.userData.stage===3)paintMountainInk(material,record.mesh.geometry.hasAttribute('inkStrata'),chapterPaint);
   if(record.mesh.geometry.hasAttribute('inkMineralMask')){
    material.vertexShader = 'attribute float inkMineralMask; varying float vMineralMask;\n' +
      material.vertexShader.replace('vGuides=inkGuides;', 'vGuides=inkGuides; vMineralMask=inkMineralMask;');
    material.fragmentShader = 'varying float vMineralMask;\n' + material.fragmentShader.replace(
      'vec4(reflectance,paperReserve,grain,1.0)', 'vec4(reflectance,paperReserve,vMineralMask,1.0)',
    );
   }
   if(chapterPaint)finishChapterValleyPaint(material);
   if(root.userData.stage===3&&record.mesh.name==='千山·斧劈墨壁')
    installChapterCliffBrush(material,ink);
   if(root.userData.stage===3&&record.mesh.name==='江左石青'){
    reserveChapterValleyShoulder(material,this.chapterValleyLayoutWeight);
    installChapterWestShoreInk(material,this.chapterWestShoreInk,true);
   }
   if(root.userData.stage===3&&record.mesh.name==='千山·隔水皴岸')
    installChapterWestShoreInk(material,this.chapterWestShoreInk,false);
   if(root.userData.stage===3){
    const ridgeRole=record.mesh.name==='千山·隔岸横岭'?'malachite'
      :record.mesh.name==='江口劈崖'?'azurite'
      :record.mesh.name==='千山·石青主峰'?'far':null;
    if(ridgeRole){
     installChapterRidgeGlaze(material,this.chapterRidgeGlaze,ridgeRole);
     if(ridgeRole!=='far')registerChapterTerraceMist(ink,record.mesh,this.chapterRidgeGlaze,ridgeRole);
    }
   }
   if(kind===1&&root.userData.stage>=2&&root.userData.stage<4)this.beamScorch.bind(material);
   material.needsUpdate = true;
  }

 }
 setChapterValleyPaint(age){
  this.chapterValleyPaint.value = chapterValleyPaintWeight(age);
  this.chapterValleyLayoutWeight.value=this.chapterValleyLayout?.(age)??0;
  this.chapterRidgeGlaze.value = chapterRidgeGlazeWeight(age);
  this.chapterWestShoreInk.value=chapterWestShoreInkWeight(age);
 }
 update(time){
  const animate=wind=>{
   for(const w of wind)if(w.mesh.parent?.visible){
    w.mesh.rotation.z=Math.sin(time*.7+w.phase)*(w.mesh.userData.wave?.025:.022);
    if(w.mesh.userData.wave)w.mesh.position.y=w.base+Math.sin(time*.9+w.phase)*.12;
   }
  };
  animate(this.wind);
  for(const chunk of this.frontier.chunks.values())if(chunk.root)animate(chunk.root.userData.frontierWind);
 }
 inspect(){const root=this.cache.get(this.stage);let triangles=0,meshes=0;root.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});return{stage:this.stage,name:this.stageNames[this.stage],meshes,triangles,real3D:true};}
}

function paintMountainInk(material,hasBeds,chapterPaint){
 const chapter = chapterPaint ? chapterValleyPaintGLSL : null;
 material.vertexShader='varying vec3 vMountainPoint;\n'+material.vertexShader.replace(
  'vec4 worldPosition = modelMatrix * vec4(position,1.0);',
  'vec4 worldPosition = modelMatrix * vec4(position,1.0); vMountainPoint=worldPosition.xyz;',
 );
 material.fragmentShader='varying vec3 vMountainPoint;\n'+material.fragmentShader.replace(
  'float reflectance=exp(-pigment*uLandGain*3.1);',
  `// Deposit whole ink masses along the rock face. The dry shoulder uses
   // the same paint coordinates, so it stays on the stone as the eye moves.
   float faceLight=dot(mineralNormal,normalize(vec3(-.54,.68,-.48)));
   float hill=smoothstep(.74,4.8,vMountainPoint.y);
   float spanWash=1.-smoothstep(30.,93.,vLandscape.y);
   float back=1.-smoothstep(-.36,.38,faceLight);
   vec3 stoneRun=${hasBeds?'vec3(vInkStrata.x*.107+vInkStrata.y*.18,vInkStrata.y*.198,vMountainPoint.y*.079)'
      :'vec3(vMountainPoint.x*.16+vMountainPoint.z*.081,vMountainPoint.z*.118-vMountainPoint.y*.156,vMountainPoint.y*.092)'};
   float seamCloud=fbm(stoneRun+vec3(1.13,6.8,11.0));
   float stoneFiber=noise3(stoneRun*vec3(6.6,2.3,4.5)+vec3(4.8,9.7,1.1));
   float shelfPaint=smoothstep(.31,.69,vGuides.x);
   float concentration=smoothstep(.29,.67,seamCloud*.63+back*.22+shelfPaint*.15);
   float relief=smoothstep(.14,.69,slope+.16*shelfPaint);
   float mass=hill*spanWash*(.38+.62*relief)*concentration
     *${hasBeds?'(.63+.37*max(shelfPaint,vValleyBrush.x))':'(.66+.34*shelfPaint)'};
   ${chapter?.mass ?? ''}
   pigment=mix(pigment,1.02+.18*stoneFiber,mass*.89);
   float facetDry=smoothstep(.12,.61,faceLight)*smoothstep(.27,.67,relief);
   float fracture=1.-smoothstep(.037,.133,abs(seamCloud-.43+.16*(stoneFiber-.5)));
   float fray=smoothstep(.27,.73,stoneFiber);
   float flyingWhite=hill*spanWash*facetDry*fracture*(.35+.65*fray)*(1.-mass*.89);
   ${chapter?.reserve ?? ''}
   paperReserve=max(paperReserve,flyingWhite*.69);
   pigment*=1.-flyingWhite*.33;
   float farDepth=smoothstep(63.,157.,vLandscape.y);
   pigment*=1.-farDepth*(.27+.22*uTerrainDistance);
   float reflectance=exp(-pigment*uLandGain*3.1);`,
 );
}

function paintPalaceSurface(material,{kind,depth,contact,groundWash},surfaceInk){
 const directions={
  tile:['13.,9.,42.','10.,6.,8.',.13,.044],
  cliff:['20.,8.,18.','7.,4.,7.',.41,.19],
  stone:['11.,10.,26.','8.,7.,9.',.28,.13],
  plinth:['11.,10.,26.','8.,7.,9.',.20,.08],
  wood:['8.,43.,22.','7.,13.,10.',.24,.14],
 };
 const paint=directions[kind];
 const roof=kind==='tile'||kind==='portalTile';
 material.uniforms.uPalaceSurfaceInk=surfaceInk;
 const roofVertex=roof?'attribute vec2 inkRoofPlane; varying vec2 vRoofPlane;\n':'';
 material.vertexShader=roofVertex+'varying float vPalaceDistance;\n'+material.vertexShader.replace(
  'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  `${roof?'vRoofPlane=inkRoofPlane;':''} vec4 palaceView = modelViewMatrix * vec4(position,1.0); vPalaceDistance = -palaceView.z; gl_Position = projectionMatrix * palaceView;`,
 );
 const roofFragment=roof?'varying vec2 vRoofPlane;\n':'';
 material.fragmentShader=roofFragment+'varying float vPalaceDistance; uniform vec3 uCenter; uniform float uObjectScale,uPalaceSurfaceInk;\n'+material.fragmentShader.replace(
  'float reflectance=exp(-pigment*3.1);',
  `{
  ${paint?`
   vec3 brushPoint=vPaint*vec3(${paint[0]});
   vec3 washPoint=vPaint*vec3(${paint[1]})+vec3(8.5,1.7,3.4);
   float pool=noise3(washPoint*.62);
   float puddle=fbm(washPoint+vec3(.30*pool,.16*pool,.62*pool));
   float fiber=noise3(brushPoint+vec3(puddle*1.1,.39,7.2));
   float dry=fbm(brushPoint*1.91+vec3(1.6,4.1,5.7));
   float swath=smoothstep(.35,.74,puddle);
   float bristle=smoothstep(.60,.84,dry+(fiber-.5)*.30);
   pigment*=1.+(puddle-.54)*${(paint[2]*depth).toFixed(3)}*(.58+.42*fiber);
   paperReserve=max(paperReserve,swath*bristle*${(paint[3]*depth).toFixed(3)});
   ${contact?`
    // Keep the hand-polished face legible over the dark end grain.
    float upper=smoothstep(.22,.84,vFormNormal.y);
    pigment*=1.-upper*(.16+.14*swath);
    paperReserve=max(paperReserve,upper*(.06+.15*swath));
   `:''}
  `:''}
  { ${palaceDirectionalPigment(kind,depth)} }
  ${groundWash?palaceGroundWash(groundWash==='court'):''}
  ${groundWash==='throne'?'{'+gateStoneInk+'}':''}
  { ${kind==='portalTile'?portalRoofInk:palaceWashPlanes(kind,depth)} }
  // Pigment fades with distance. Geometry, visibility and depth stay shared
  // with the mineral pass and physical gate fragments.
  float haze=smoothstep(${(32+depth*14).toFixed(1)},${(105+depth*28).toFixed(1)},vPalaceDistance);
  pigment*=1.-haze*${(.74-.31*depth).toFixed(3)};
  paperReserve=mix(paperReserve,max(paperReserve,.33),haze*${(.85-.48*depth).toFixed(3)});
  }
  float reflectance=exp(-pigment*3.1);`,
 );
 material.needsUpdate=true;
}

function palaceGroundWash(court) {
 return court?`{
  vec3 stone=vPaint/uObjectScale+uCenter;
  float paleLane=1.-smoothstep(.32,2.05,abs(stone.x+.11*stone.z-.15));
  float center=4.7-.72*(stone.z+15.);
  vec3 direction=vec3(stone.z*.35+stone.x*.064,stone.x*.32,3.47);
  float seep=fbm(direction+vec3(8.12,6.6,4.9));
  float tooth=noise3(direction*vec3(3.5,8.7,1.8));
  float swept=abs(stone.x-center+(seep-.49)*6.8);
  float brush=(1.-smoothstep(1.3,8.9,swept))*(.36+.64*smoothstep(.28,.70,seep));
  float rim=1.-smoothstep(.14,1.64,abs(swept-6.+.68*(tooth-.5)));
  float wet=brush*(.35+.65*smoothstep(.25,.81,tooth+.29*seep));
  float floor=smoothstep(.70,.98,vFormNormal.y)*smoothstep(-19.,-16.4,stone.z)
    *(1.-smoothstep(-7.6,-4.1,stone.z));
  float wash=wet*(1.-.57*paleLane);
  pigment+=uPalaceSurfaceInk*floor*(wash*.47+rim*brush*.20);
  paperReserve=max(paperReserve,uPalaceSurfaceInk*floor*brush*(.22*paleLane+.18*rim));
 }`:`{
  // Carry the same wet brush over risers, treads and terraces. These are
  // coordinates in the intact palace, independent of the mesh's bounds.
  vec3 stone=vPaint/uObjectScale+uCenter;
  float strokeAlong=.20*stone.x+.112*stone.z;
  vec3 stroke=vec3(strokeAlong,stone.z*.16,2.7);
  float flow=fbm(stroke+vec3(6.8,2.6,9.1));
  float tooth=noise3(stroke*vec3(3.2,7.1,1.)+vec3(2.1,5.3,4.8));
  float center=.82*sin(stone.z*.18)+.66*(flow-.48);
  float shoulder=smoothstep(2.7,8.2,abs(stone.x-center));
  float apron=smoothstep(10.2,23.2,abs(stone.x-center));
  float skirt=1.-smoothstep(.20,.79,formNormal.y);
  float load=smoothstep(.26,.64,flow+.14*(tooth-.5));
  float wet=shoulder*(.27+.73*load)+.29*apron;
  float dry=(1.-smoothstep(.025,.14,abs(flow-.39+.11*(tooth-.5))))
    *smoothstep(.32,.73,tooth)*shoulder*(1.-.67*skirt);
  float bare=(1.-smoothstep(.8,3.5,abs(stone.x-center)))*(1.-.74*skirt);
  pigment+=uPalaceSurfaceInk*(wet*(.22+.095*skirt)+.037*shoulder*skirt*vGuides.x);
  pigment*=1.-uPalaceSurfaceInk*(.50*dry+.12*bare);
  paperReserve=max(paperReserve,uPalaceSurfaceInk*dry*.48);
 }`;
}

function palaceWashPlanes(kind, depth) {
 if(kind!=='tile'&&kind!=='wall'&&kind!=='soffit')return '';
 const strength=`uPalaceSurfaceInk*${(depth * depth).toFixed(3)}`;
 if(kind==='tile')return `
  // Drag the darker load through intact and detached courses in the same
  // roof coordinates. One dry interval catches the light across the curve.
  vec3 roofPoint=vPaint/uObjectScale+uCenter;
  float down=abs(vRoofPlane.y);
  float hip=smoothstep(.54,.98,abs(vRoofPlane.x));
  float course=vRoofPlane.x/(.72+.28*down);
  vec3 run=vec3(3.46*course+down*.42,1.73*down,roofPoint.y*.17+sign(vRoofPlane.y)*.42);
  float drift=noise3(run*vec3(.67,1.04,.55)+vec3(7.1,4.2,1.3));
  float brush=fbm(run+vec3(1.36*drift,3.9,6.7));
  float tooth=noise3(vec3(run.x*7.4+.42*drift,run.y*1.84,run.z*2.3+1.8));
  float split=noise3(vec3(run.x*16.7+down*.69,run.y*4.1,run.z*2.8+7.4));
  float stroke=down + .31*(brush-.48)+.057*(tooth-.5);
  float shoulder=smoothstep(.23,.40,stroke)*(1.-smoothstep(.52,.77,stroke));
  float coverage=shoulder*smoothstep(.24,.70,brush)*(.45+.55*tooth);
  float below=smoothstep(.63,.93,stroke)*(.51+.49*smoothstep(.28,.68,drift));
  float rich=clamp(.59*coverage+.46*below+.27*hip,0.,1.);
  float spread=1.-smoothstep(.020,.151,abs(stroke-.59));
  float skip=smoothstep(.28,.77,tooth+.31*(drift-.5));
  float torn=smoothstep(.26,.66,split+.21*(brush-.5));
  float openPaper=spread*skip*smoothstep(.18,.61,brush)*(1.-.56*hip)*(.27+.73*torn);
  float upper=smoothstep(.20,.87,dot(formNormal,normalize(vec3(-.32,.83,-.45))));
  float film=(1.-smoothstep(.055,.26,abs(stroke-.63+.095*(split-.47))))*upper;
  float hold=${strength};
  pigment=mix(pigment,.93+.16*brush,rich*hold*.93);
  pigment*=1.-hold*(.25*openPaper+.14*film*(.44+.56*skip));
  paperReserve=max(paperReserve,hold*max(openPaper*.53,film*.12));`;
 const soffit=kind==='soffit';
 return `
  vec3 rest=vPaint/uObjectScale+uCenter;
  vec3 plaster=vec3(rest.x*.134+rest.z*.148,rest.y*.31,rest.z*.20);
  float tide=fbm(plaster+vec3(3.7,12.9,1.7));
  float tooth=noise3(plaster*vec3(2.8,3.4,3.1)+vec3(5.3,4.6,9.5));
  float loaded=smoothstep(.32,.69,tide+.11*(tooth-.5));
  float edge=(1.-smoothstep(.025,.19,abs(tide-.40)))*smoothstep(.22,.76,tooth);
  float plane=${soffit?'(.51+.49*abs(formNormal.y))':'(1.-smoothstep(.24,.82,abs(formNormal.y)))'};
  float hold=${strength}*plane;
  pigment+=hold*(${soffit?'.37':'.23'}*loaded-${soffit?'.17':'.29'}*edge);
  paperReserve=max(paperReserve,hold*edge*${soffit?'.26':'.50'});`;
}

function palaceDirectionalPigment(kind,depth){
 if(kind!=='tile'&&kind!=='lacquer'&&kind!=='plinth'&&kind!=='door')return '';
 const strength=(depth*depth).toFixed(3);
 const coordinates='vec3 rest=vPaint/uObjectScale+uCenter;';
 if(kind==='door')return `
  ${coordinates}
  // A broad brush passes across several planks. Lift the dry fibers
  // only where that stroke thins, and keep the old lacquer heavy below.
  float face=smoothstep(.42,.91,abs(vFormNormal.z));
  vec3 sweep=vec3(rest.x*.54,rest.y*.34,rest.x*.08);
  float tide=fbm(sweep+vec3(9.2,2.6,4.4));
  float seep=fbm(vec3(rest.x*.88,rest.y*.21,5.7)+vec3(2.13,4.4,1.6));
  float hair=noise3(vec3(rest.x*16.8,rest.y*1.35,2.8));
  float dry=noise3(vec3(rest.x*26.7,rest.y*2.9,8.13));
  float rise=rest.y+.88*(tide-.46)+.19*(hair-.52);
  float below=1.-smoothstep(2.08,5.25,rise);
  float dragged=(1.-smoothstep(.12,.95,abs(rise-(6.1+1.34*(seep-.52)))))
    *smoothstep(.21,.70,seep)*(.57+.43*hair);
  float paleSpine=7.0+1.45*(seep-.48)+.52*sin(rest.x*.78);
  float rim=(1.-smoothstep(.047,.52,abs(rise-paleSpine)))
    *smoothstep(.32,.78,hair+.22*(dry-.5))*smoothstep(.30,.61,tide);
  float worn=smoothstep(.24,.72,seep)*smoothstep(.54,.89,tide)*(.42+.58*hair);
  float hold=uPalaceSurfaceInk*face;
  pigment=mix(pigment,.94,hold*(.52*below+.26*dragged));
  pigment*=1.-hold*(.34*rim+.52*worn);
  paperReserve=max(paperReserve,hold*max(.46*rim,.48*worn)*(.69+.31*dry));
 `;
 if(kind==='tile')return `
  ${coordinates}
  // The roof halves and the loose tiles use the intact roof's ink bounds.
  // A shared water load gathers over several courses, then opens along the slope.
  float downslope=abs(vPaint.z);
  float nearEave=smoothstep(.105,.235,downslope);
  vec3 washStroke=vec3(rest.x*.62 + downslope*11.,downslope*5.0,rest.y*.145);
  float swell=noise3(washStroke*vec3(.46,1.,1.)+vec3(3.5,2.8,1.3));
  float wetLoad=fbm(washStroke*vec3(.70,1.15,1.)+vec3(.55*swell,3.1,5.2));
  float dragged=fbm(washStroke*vec3(3.8,1.8,.48)+vec3(1.8*swell,7.4,2.3));
  float bristles=1.-smoothstep(.31,.61,dragged);
  float loaded=smoothstep(.31,.63,wetLoad + (swell-.5)*.16 + vGuides.x*.12);
  float dryBank=smoothstep(.34,.76,swell)*(.33+.67*nearEave);
  float tornEdge=smoothstep(.37,.77,nearEave+wetLoad*.43-(1.-bristles)*.30);
  float ragged=noise3(washStroke*vec3(23.,6.4,1.9)+vec3(3.1,2.7,5.6));
  float dryTips=dryBank*tornEdge*bristles*(.74+.26*smoothstep(.30,.62,ragged));
  pigment+=${strength}*(.21*loaded-.20*dryTips);
  paperReserve=max(paperReserve,${strength}*dryTips*(.73+.14*vGuides.y));`;
 if(kind==='lacquer')return `
  ${coordinates}
  // Exposed wood follows the column's grain and the authored paint-loss guide.
  vec3 axial=vec3(rest.x*4.3+rest.y*.065,rest.y*.24,rest.z*4.1-rest.y*.071);
  float wetBody=fbm(axial*vec3(.52,.81,.52)+vec3(1.7,3.8,4.1));
  float peeled=fbm(axial*vec3(1.51,1.42,1.51)+vec3(wetBody,3.4,1.8));
  float dryPatch=noise3(axial*vec3(.41,1.46,.41)+vec3(4.7,3.4,7.3));
  float litEdge=smoothstep(-.07,.76,dot(vFormNormal,vec3(-.58,.12,-.72)));
  float rounded=.38+.62*smoothstep(.08,.36,min(abs(vFormNormal.x),abs(vFormNormal.z)));
  float bare=rounded*litEdge*smoothstep(.35,.69,dryPatch)*smoothstep(.44,.73,peeled+.37*vGuides.y-.13*wetBody);
  pigment+=${strength}*(.13*smoothstep(.34,.67,wetBody)-.16*bare);
  paperReserve=max(paperReserve,${strength}*bare*.59);`;
 return `
  ${coordinates}
  // Diagonal dry strokes cross the battered face beneath the stone lip.
  float wallFace=1.-smoothstep(.33,.89,abs(vFormNormal.y));
  vec3 angle=vec3((rest.x-rest.y*.87+rest.z*.16)*.69,rest.y*.43,rest.z*.24);
  float ledge=fbm(angle*vec3(.53,1.2,.81)+vec3(4.9,5.9,1.8));
  float slip=fbm(angle*vec3(2.7,.61,.91)+vec3(.93*ledge,8.1,2.6));
  float pool=smoothstep(.39,.71,ledge+vGuides.x*.33);
  float exposed=wallFace*smoothstep(.45,.71,slip+vGuides.y*.29-.18*pool);
  pigment+=${strength}*wallFace*(.19*pool-.18*exposed);
  paperReserve=max(paperReserve,${strength}*exposed*.59);`;
}
