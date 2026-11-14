import * as THREE from 'three';
import {InkWashRenderer}from'./shared-ink/ink-wash.js';
import {sampleSpine}from'../motion.js';
import {DragonMotion}from'./dragon-motion.js';
import {AttackPose}from'./attack-pose.js';
import {DisplaySpine}from'./growth/curve-field.js';
import {MineralPalette}from'./palette.js';
import {FORM_BY_STAGE,PLAYABLE_FORMS}from'../rules.js';
import { PublicDragon } from './public-dragon.js';
import atlas from './assets/shared-ink-brush-atlas.png';
import noise from './assets/shared-ink-flow-noise.png';
const units={0:6.2,2:7.0,3:7.4,4:7.8};
const shapeWashDuration=.66;

function shapeWash(entry, wash, axis) {
 entry.bridge.root.traverse(node=>{
  if(!node.isMesh)return;
  node.userData.dragonWash=wash;
  node.userData.dragonWashAxis=axis;
 });
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
  this.chapterPreview=null;
  this.evolvingTo=null;
  this.motion=new DragonMotion();
  this.attackPose=new AttackPose();
 }
 muzzle(out,inset=0){
  return this.active?.actor.muzzle?.(out,inset)??null;
 }
 setVisible(visible){
  if(!visible){
   for(const {bridge} of this.cache.values())bridge.root.visible=false;
  }else if(this.active){
   this.active.bridge.root.visible=true;
  }
 }
 event(event){
  if(event.type==='evolve'){
   const form=event.form??FORM_BY_STAGE[event.stage];
   const previous=event.previousForm??FORM_BY_STAGE[event.stage-1];
   const preview=this.chapterPreview;
   const alreadyShown=preview?.from===previous&&preview.to===form&&this.stage===form;
   this.evolvingTo=form===previous||alreadyShown?null:form;
   if(alreadyShown)this.chapterPreview=null;
  }
  this.motion.event(event);
  this.attackPose.event(event);
 }
 finishShapeChange(){
  if(!this.shapeChange)return;
  const {from,to}=this.shapeChange;
  from.bridge.root.visible=false;
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
 prepareTransitionLength(){
  // The procedural mesh has a fixed number of rings, even when its length grows.
 }
 async select(stage,{preloadNext=true}={}){
  this.desired=stage;const entry=this.load(stage);if(this.desired!==stage)return entry;
  const previous=this.active;
  const index=PLAYABLE_FORMS.indexOf(stage);
  const evolve=index>0&&stage===this.evolvingTo&&previous?.stage===PLAYABLE_FORMS[index-1];
  this.finishShapeChange();
  for(const {bridge} of this.cache.values())bridge.root.visible=false;
  this.active=entry;this.stage=stage;this.state='ready';
  this.evolvingTo=null;
  if(evolve){
   const length=this.motion.length;
   this.shapeChange={from:previous,to:entry,age:0,duration:shapeWashDuration,
    length,out:new THREE.Vector2(0,-1),into:new THREE.Vector2(0,1),axis:new THREE.Vector3()};
  }
  if(preloadNext)this.preloadNext(stage);
  return entry;
 }
 preloadNext(stage){
  const next=PLAYABLE_FORMS[PLAYABLE_FORMS.indexOf(stage)+1];
  if(next!==undefined)this.load(next);
 }
 update(frame,dt){
  if(frame.chapterPreviewForm===true&&frame.stage===4&&this.stage!==4){
   if(this.stage===3&&this.cache.has(4)){
    this.chapterPreview={from:3,to:4};
    this.evolvingTo=4;
   }else{
    frame={...frame,stage:3,chapterMorph:undefined,chapterWing:undefined};
   }
  }else if(frame.chapterPreviewForm!==true&&frame.stage!==this.chapterPreview?.to){
   this.chapterPreview=null;
  }
  if(this.desired!==frame.stage){this.state='loading';this.select(frame.stage,{preloadNext:frame.chapterMorph===undefined}).catch(e=>{this.state='error';console.error(e);});}
  if(!this.active||this.stage!==frame.stage)return;
  const {spine:points,stage}=frame;
  if(!points?.length)return;

  const motion=this.motion;
  motion.update(frame,dt);
  motion.chapterMorph=frame.chapterMorph;
  motion.chapterWing=frame.chapterWing;
  motion.crownLift=frame.crownLift??0;
  motion.crownTurn=frame.crownTurn??0;
  motion.waveTuck=frame.waveTuck??0;
  motion.valleyBank=frame.valleyBank??0;
  this.attackPose.apply(motion,dt);
  motion.dragonArt=frame.dragonArt;
  const handoff=frame.combatHandoff;
  const handoffX=handoff ? handoff.x-frame.position.x : 0;
  const handoffZ=handoff ? handoff.z-frame.position.z : 0;
  const forward=handoffX*Math.sin(frame.heading)+handoffZ*Math.cos(frame.heading);
  motion.combatWingRelease=handoff ? handoff.gain*THREE.MathUtils.smoothstep(forward,3,10)*
   (.46+.54*handoff.receiver) : 0;
  const art=motion.dragonArt;
  motion.riftClosing=0;
  if(art?.kind==='beam'){
   const cast=art.phase==='sweep'||art.phase==='echo';
   const lead=art.sweepAngle??art.angle;
   const delta=lead-motion.heading;
   motion.dragonArtYaw=THREE.MathUtils.clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-1.25,1.25);
   motion.jaw=Math.max(motion.jaw,cast?.99:.44);
   motion.attackPitch+=cast?.12+Math.atan(art.beamPitch??0)*.74:.17;
  }else motion.dragonArtYaw=0;
  if(art?.kind==='rift'&&art.age<.61){
   const {smoothstep}=THREE.MathUtils;
   const draw=smoothstep(art.age,.055,.21)*(1-smoothstep(art.age,.33,.56));
   const cut=smoothstep(art.age,.19,.30)*(1-smoothstep(art.age,.40,.59));
   motion.anticipate=Math.max(motion.anticipate,draw*.58);
   motion.strike=Math.max(motion.strike,cut*.86);
   motion.grip=Math.max(motion.grip,cut*.49);
   motion.attackPitch+=draw*.065-cut*.09;
   motion.clawSide=null;
  }
  if(handoff?.route==='rift-seam')motion.riftClosing=handoff.receiver*handoff.gain;
  motion.updateGlidePose(dt);
  const change=this.shapeChange;
  if(change)change.age+=dt;
  const shapeProgress=change?(frame.chapterMorph??THREE.MathUtils.clamp(change.age/change.duration,0,1)):1;
  const length=motion.length;
  const scale=Math.min(units[stage],length);
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
   if(shapeProgress>=1)this.finishShapeChange();
   else{
    // Spend the close shot on the brow and claws. The trailing shape clears
    // as the camera opens out, away from the close framing of the shoulder.
    const progress=frame.chapterMorph===undefined||frame.chapterWing
     ?THREE.MathUtils.smoothstep(shapeProgress,0,1)
     :THREE.MathUtils.lerp(.52*shapeProgress,shapeProgress,THREE.MathUtils.smootherstep(shapeProgress,.52,.98));
    change.out.x=change.into.x=progress;
    const softness=frame.chapterWing?3:frame.chapterMorph===undefined?1:2;
    change.out.y=-softness;
    change.into.y=softness;
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
  const points=actor.pathPoints;
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
  // During the chapter shot the old outline yields from the nose along the
  // neck and then toward the hind legs, instead of dissolving all at once.
  const cinematic=this.motion.chapterMorph!==undefined;
  const span=Math.max(30,length*(cinematic?1.05:1.88));
  const x=length>3?dx/length/span:1/span;
  const y=length>3?dy/length/span:0;
  change.axis.set(x,y,-(head.x+1)*viewport.x*x-(head.y+1)*viewport.y*y+(cinematic?.12:0));
 }
 render(scene,camera){
  if(this.shapeChange)this.orientShapeWash(camera);
  this.palette.render(scene,camera);this.ink.render(scene,camera);
 }
 resize(){const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.ink.setSize(size.x,size.y);}
 inspect(){return{state:this.state,stage:this.stage,available:[...this.cache.keys()],...this.active?.actor.stats(),sourceAlbedo:false,renderer:'shared InkWashRenderer 0.3',procedural:true};}
}
