import * as THREE from 'three';
import {InkWashRenderer}from'./shared-ink/ink-wash.js';
import {sampleSpine}from'../motion.js';
import {DragonMotion}from'./dragon-motion.js';
import {AttackPose}from'./attack-pose.js';
import {DisplaySpine}from'./growth/curve-field.js';
import {MineralPalette}from'./palette.js';
import {PublicDragon}from'./public-dragon.js';
import atlas from './assets/shared-ink-brush-atlas.png';
import noise from './assets/shared-ink-flow-noise.png';
const units=[6.2,6.8,7.0,7.4,7.8];
const shapeWashDuration=.66;
const firstMoltDuration=.90;

function shapeWash(entry, wash, axis) {
 for(const root of [entry.actor.root,entry.bridge.root]){
  root?.traverse(node=>{
   if(!node.isMesh)return;
   node.userData.dragonWash=wash;
   node.userData.dragonWashAxis=axis;
  });
 }
}

export class InkDragon {
 constructor(scene,renderer){
  this.scene=scene;this.renderer=renderer;this.cache=new Map();this.stage=-1;this.desired=0;this.state='loading';
  this.ink=new InkWashRenderer(renderer,{outline:.5,outlineWidth:1.05,outlineDetail:.25,inkFlow:.68,inkFlowSpeed:.8});
  this.palette=new MineralPalette(renderer,this.ink);
  this.spine=new DisplaySpine();
  this.resetMotion();
  const loader=new THREE.TextureLoader();
  window.__TIDEBORN_SHARED_INK__=Promise.all([loader.loadAsync(atlas),loader.loadAsync(noise)]).then(([brushAtlas,flowNoise])=>{for(const t of[brushAtlas,flowNoise]){t.colorSpace=THREE.NoColorSpace;t.flipY=false;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;}flowNoise.wrapS=flowNoise.wrapT=THREE.RepeatWrapping;return{brushAtlas,flowNoise,atlasGrid:new THREE.Vector2(4,2)};});
  this.ready=window.__TIDEBORN_SHARED_INK__.then(r=>{this.ink.setSharedResources(r);return this.select(0);});
 }
 resetMotion(){
  this.finishShapeChange();
  this.evolvingTo=null;
  this.motion=new DragonMotion();
  this.attackPose=new AttackPose();
 }
 muzzle(out,inset=0){
  return this.active?.actor.muzzle?.(out,inset)??null;
 }
 event(event){
  if(event.type==='evolve')this.evolvingTo=event.stage;
  this.motion.event(event);
  this.attackPose.event(event);
 }
 finishShapeChange(){
  if(!this.shapeChange)return;
  const {from,to}=this.shapeChange;
  from.actor.root.visible=false;
  if(from.bridge.root)from.bridge.root.visible=false;
  shapeWash(from,undefined);shapeWash(to,undefined);
  this.shapeChange=null;
 }
 load(stage){
  if(this.cache.has(stage))return this.cache.get(stage);
  const actor=new PublicDragon(stage,this.ink);
  actor.root.visible=false;
  this.scene.add(actor.root);
  const entry={actor,bridge:actor.bridge,stage};
  this.cache.set(stage,entry);
  return entry;
 }
 select(stage){
  this.desired=stage;const entry=this.load(stage);
  const previous=this.active;
  const evolve=stage===this.evolvingTo&&previous?.stage===stage-1;
  this.finishShapeChange();
  for(const r of this.cache.values()){r.actor.root.visible=false;if(r.bridge.root)r.bridge.root.visible=false;}
  this.active=entry;this.stage=stage;this.state='ready';entry.actor.root.visible=true;
  this.evolvingTo=null;
  if(evolve){
   const first=stage===1;
   const length=this.motion.length;
   this.shapeChange={from:previous,to:entry,age:0,duration:first?firstMoltDuration:shapeWashDuration,
    first,initialLength:length,length,out:new THREE.Vector2(0,-1),into:new THREE.Vector2(0,1),axis:new THREE.Vector3()};
  }
  return entry;
 }
 update(frame,dt){
  if(this.desired!==frame.stage)this.select(frame.stage);
  if(!this.active||this.stage!==frame.stage)return;
  const {spine:points,stage}=frame;
  if(!points?.length)return;

  const motion=this.motion;
  motion.update(frame,dt);
  this.attackPose.apply(motion,dt);
  const change=this.shapeChange;
  if(change)change.age+=dt;
  const molt=change?.first&&change.initialLength>0&&change.age<change.duration?change:null;
  // Show the heavier head and forebody while the old trail is still visible.
  // The tail draws inward after the new form has started to read.
  const contract=molt?THREE.MathUtils.smoothstep(molt.age,.27,.86):1;
  const length=molt?THREE.MathUtils.lerp(molt.initialLength,motion.length,contract):motion.length;
  const formScale=molt?THREE.MathUtils.lerp(units[0],units[1],THREE.MathUtils.smoothstep(molt.age,.07,.52)):units[stage];
  const scale=Math.min(formScale,length);
  const spacing=.65*(1+stage*.08);
  const visibleSegments=length/spacing;
  // A hit truncates bodyPath immediately. Sample the same travelled trail
  // while the remaining painted tail is still retracting along it.
  const displayPath=frame.trail&&Math.ceil(visibleSegments)>=points.length
   ?sampleSpine(frame.trail,visibleSegments,spacing,frame.position)
   :points;
  motion.locateImpact(displayPath,spacing);
  if(!this.spine.set(displayPath,motion.heading,scale,motion,stage,.38*length/scale))return;
  if(change){
   change.length=length;
   if(change.age>=change.duration)this.finishShapeChange();
   else{
    const progress=THREE.MathUtils.smoothstep(change.age,0,change.first ? .64 : change.duration);
    change.out.x=change.into.x=progress;
    this.poseEntry(change.from,length);
    shapeWash(change.from,change.out,change.axis);
   }
  }
  this.poseEntry(this.active,length);
  if(this.shapeChange)shapeWash(this.active,this.shapeChange.into,this.shapeChange.axis);
  this.ink.advance(dt);
 }
 poseEntry({actor},length){
  actor.update(this.spine,this.motion,length);
  actor.root.visible=true;
 }
 orientShapeWash(camera){
  const change=this.shapeChange;
  const {actor}=change.to;
  const points=actor.centers;
  if(points.length<2||!(change.length>0))return;
  camera.updateMatrixWorld();
  const viewport=this.renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(.5);
  const head=points[0].clone().project(camera);
  const distance=change.length;
  const sample=Math.min(.48,7.2/distance);
  const middle=points[Math.floor((points.length-1)*sample)].clone().project(camera);
  const dx=(middle.x-head.x)*viewport.x,dy=(middle.y-head.y)*viewport.y;
  if(!Number.isFinite(dx+dy))return;
  const length=Math.hypot(dx,dy);
  const span=Math.max(30,length*1.88);
  const x=length>3?dx/length/span:1/span;
  const y=length>3?dy/length/span:0;
  change.axis.set(x,y,-(head.x+1)*viewport.x*x-(head.y+1)*viewport.y*y);
 }
 render(scene,camera){
  if(this.shapeChange)this.orientShapeWash(camera);
  this.palette.render(scene,camera);this.ink.render(scene,camera);
 }
 resize(){const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.ink.setSize(size.x,size.y);}
 inspect(){return{state:this.state,stage:this.stage,available:[...this.cache.keys()],...this.active?.actor.stats(),sourceAlbedo:false,renderer:'shared InkWashRenderer 0.3',procedural:true};}
}
