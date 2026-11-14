import * as THREE from 'three';
import {mergeVertices}from'three/examples/jsm/utils/BufferGeometryUtils.js';
import {CurveField,modifyMaterial}from'./curve-field.js';
import {clipPolygon}from'./growth-utils.js';
import {LoftSection}from'./loft-section.js';
import {LiveFeathers,DynamicMane}from'./dynamic-plumage.js';
import {FlightLimbs}from'./flight-limbs.js';
import {flightArrival}from'./flight-stroke.js';
import {YinglongHead}from'./yinglong-head.js';
import { COURT_PAW_STEPS, LOCK_STAIR } from '../../heaven-finale.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const headGrowth=[0,1,.08], frontGrowth=[0,1,.255], rearGrowth=[1,1,.62];

/** Head/chest, pelvis and tail caps with two independently growing body regions. */
export class EndlessDragon {
 constructor(asset,data,renderer,maneData=window.__ORIGINAL_MANE__){
  this.asset=asset;this.root=asset.scene;this.data=data;this.renderer=renderer;this.headZ=data.sourceHeadZ;this.maneData=maneData;
  this.extra=0;this.targetExtra=0;this.hipExtra=0;this.hipRatio=.58;this.time=0;this.pose='s';this.bend=.7;this.method='loft';this.materialMode='gray';
  this.field=new CurveField(renderer,this.headZ);this.shared=this.field.shared;this.meshes=[];this.materials=[];
  this.root.traverse(mesh=>{if(mesh.isSkinnedMesh){this.meshes.push(mesh);if(mesh.name==='Yinglong_Body')this.body=mesh;}});
  if(!this.body)throw new Error('缺少应龙主体蒙皮。');
  this.headPose=new YinglongHead(this.body,this.meshes);
  this.flightLimbs=new FlightLimbs(this.body.skeleton);
  this.forelegJoints=this.flightLimbs.legs.filter(leg=>!leg.rear).flatMap(({joints})=>
   joints.map(({bone})=>({bone,position:bone.position.clone()})));
  this.wingRoots=this.flightLimbs.wings.flatMap(({joints})=>
   joints.slice(0,2).map(({bone})=>({bone,position:bone.position.clone()})));
  this.frontAttachments=[...this.forelegJoints,...this.wingRoots];
  this.chestSpace=new THREE.Matrix4();
  this.chestAxis=new THREE.Vector3();
  this.arrivalPose={};
  this.jointKinds=this.body.skeleton.bones.map(b=>({front:/^DEF_(wing|feather|fore)/.test(b.name),rear:b.name.startsWith('DEF_hind'),head:/^DEF_(head|jaw|whisker|beard)/.test(b.name)}));
  for(const mesh of this.meshes){
   mesh.frustumCulled=false;mesh.userData.originalGeometry=mesh.geometry;mesh.userData.originalMaterial=mesh.material;mesh.geometry.setAttribute('aGrowth',this.growthAttribute(mesh.geometry));
   if(mesh===this.body){const values=new Float32Array(mesh.geometry.attributes.position.count*2);for(let i=0;i<values.length/2;i++){values[i*2]=maneData.vertexGroup[i];values[i*2+1]=maneData.vertexFlex[i];}mesh.geometry.setAttribute('aMane',new THREE.BufferAttribute(values,2));}
   mesh.userData.gray=modifyMaterial(new THREE.MeshStandardMaterial({color:'#aeb9b5',roughness:.94,side:THREE.DoubleSide}),this.shared);mesh.userData.ink=modifyMaterial(mesh.material,this.shared);this.materials.push(mesh.userData.gray,mesh.userData.ink);
  }
  this.capGeometry=this.clipBody(this.body.geometry);this.body.geometry=this.capGeometry;
  this.lockPawVertices=this.cacheLockedPawVertices();
  this.lockToe=new THREE.Vector3();
  this.lockGround=new THREE.Vector3();
  this.sections=data.gaps.map((gap,i)=>new LoftSection(this,gap,i));
  this.feathers=new LiveFeathers(this);this.mane=new DynamicMane(this);this.mixer=new THREE.AnimationMixer(this.root);this.playClip('Serpentine_Glide');this.setMaterial('gray');this.update(0,false);
 }
 get pathPoints(){return this.field.pathPoints;}
 get a(){return this.sections[0].a;}
 get b(){return this.sections[1].b;}
 sampleFrame(d){return this.field.sampleFrame(d);}
 vertex(geometry,i){
  const a=geometry.attributes,read=(n,k)=>a[n]?Array.from({length:k},(_,j)=>a[n].getComponent(i,j)):Array(k).fill(0),j=read('skinIndex',4),w=read('skinWeight',4);let front=0,rear=0,head=0;
  for(let k=0;k<4;k++){const t=this.jointKinds[j[k]];if(t.front)front+=w[k];if(t.rear)rear+=w[k];if(t.head)head+=w[k];}
  return{p:read('position',3),n:read('normal',3),uv:read('uv',2),mane:a.aMane?read('aMane',2):[-1,0],j,w,front,rear,head};
 }
 params(v,zone,core=false){
  const total=v.front+v.rear+v.head,planes=zone===0?[this.data.gaps[0].frontCutZ]:zone===1?[this.data.gaps[0].rearCutZ,this.data.gaps[1].frontCutZ]:[this.data.gaps[1].rearCutZ],fade=core?smooth(0,.03,Math.min(...planes.map(z=>Math.abs(v.p[2]-z)))):1;
  return[zone,clamp(total)*fade,total>1e-6?(v.front*.255+v.rear*.62+v.head*.08)/total:0];
 }
 growthAttribute(geometry){
  const values=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<geometry.attributes.position.count;i++){
   const v=this.vertex(geometry,i),zone=v.front+v.head>.15&&v.front+v.head>=v.rear?0:v.rear>.15?1:v.p[2]>=this.data.gaps[0].frontCutZ?0:v.p[2]<=this.data.gaps[1].rearCutZ?2:1;values.set(this.params(v,zone),i*3);
  }return new THREE.BufferAttribute(values,3);
 }
 clipBody(geometry){
  const attrs={position:[],normal:[],uv:[],skinIndex:[],skinWeight:[],aGrowth:[],aMane:[]},cache=new Map(),get=i=>{if(!cache.has(i))cache.set(i,this.vertex(geometry,i));return cache.get(i);};
  const push=(v,zone,core)=>{attrs.position.push(...v.p);attrs.normal.push(...v.n);attrs.uv.push(...v.uv);attrs.skinIndex.push(...v.j);attrs.skinWeight.push(...v.w);attrs.aGrowth.push(...this.params(v,zone,core));attrs.aMane.push(...v.mane);};
  const polygon=(p,zone,core=false)=>{for(let i=1;i<p.length-1;i++){push(p[0],zone,core);push(p[i],zone,core);push(p[i+1],zone,core);}};
  const a=this.data.gaps[0],b=this.data.gaps[1];
  for(let i=0;i<geometry.index.count;i+=3){
   const t=[get(geometry.index.getX(i)),get(geometry.index.getX(i+1)),get(geometry.index.getX(i+2))],front=t.reduce((s,v)=>s+v.front,0)/3,rear=t.reduce((s,v)=>s+v.rear,0)/3;
   const lips=this.headPose.splitLip(t);
   if(lips){for(const lip of lips)polygon(lip,0,true);}
   else if(front>.15&&front>=rear)polygon(t,0);else if(rear>.15)polygon(t,1);
   else{polygon(clipPolygon(t,a.frontCutZ,true),0,true);polygon(clipPolygon(clipPolygon(t,a.rearCutZ,false),b.frontCutZ,true),1,true);polygon(clipPolygon(t,b.rearCutZ,false),2,true);}
  }
  const result=new THREE.BufferGeometry();for(const[name,values]of Object.entries(attrs)){const n=['uv','aMane'].includes(name)?2:['skinIndex','skinWeight'].includes(name)?4:3;result.setAttribute(name,new THREE.BufferAttribute(name==='skinIndex'?new Uint16Array(values):new Float32Array(values),n));}
  const merged=mergeVertices(result,1e-6);result.dispose();return merged;
 }
 skinPoint(data,out=new THREE.Vector3()){
  const source=new THREE.Vector3(...data.p).applyMatrix4(this.body.bindMatrix),temp=new THREE.Vector3(),matrix=new THREE.Matrix4();out.set(0,0,0);
  for(let i=0;i<4;i++)if(data.w[i]>0){matrix.fromArray(this.body.skeleton.boneMatrices,data.j[i]*16);out.addScaledVector(temp.copy(source).applyMatrix4(matrix),data.w[i]);}
  return out.applyMatrix4(this.body.bindMatrixInverse);
 }
 shift(zone){return zone<.5?0:zone<1.5?this.hipExtra:this.extra;}
 mapPoint(p,params){
  const d=this.headZ-p.z;let distance=d+this.shift(params[0]);
  if(this.method==='stretch'){const a=this.sections[0],b=this.sections[1];distance=d+this.hipExtra*clamp((d-a.a)/(a.b-a.a))+(this.extra-this.hipExtra)*clamp((d-b.a)/(b.b-b.a));}
  const f=this.sampleFrame(distance),body=f.p.clone().addScaledVector(f.n,p.x).addScaledVector(f.b,p.y),g=this.sampleFrame(params[2]+this.shift(params[0])),rigid=g.p.clone().addScaledVector(g.n,p.x).addScaledVector(g.b,p.y).addScaledVector(g.t,d-params[2]);return body.lerp(rigid,params[1]);
 }
 contactWorld(point,parameters,out){
  this.body.worldToLocal(point);
  return this.root.localToWorld(out.copy(this.mapPoint(point,parameters)));
 }
 muzzle(out=new THREE.Vector3(),inset=0){
  this.contactWorld(this.headPose.mouth(out),headGrowth,out);
  const forward=this.sampleFrame(headGrowth[2]).t;
  return out.addScaledVector(forward,(inset-.012)*this.root.scale.x);
 }
 frontPalm(out,side){
  const leg=this.flightLimbs.legs.find(leg=>!leg.rear&&leg.side===side);
  return leg?this.contactWorld(leg.joints.at(-1).bone.getWorldPosition(out),frontGrowth,out):null;
 }
 cacheLockedPawVertices(side=1){
  const leg=this.flightLimbs.legs.find(candidate=>!candidate.rear&&candidate.side===side);
  const skeleton=this.body.skeleton;
  const {position,skinIndex,skinWeight}=this.capGeometry.attributes;
  return leg.toes.flatMap(({bone})=>{
   const jointIndex=skeleton.bones.indexOf(bone);
   const jointPoint=new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[jointIndex].clone().invert());
   const candidates=[];
   const vertex=new THREE.Vector3();
   for(let i=0;i<position.count;i++){
    if(![0,1,2,3].some(channel=>skinIndex.getComponent(i,channel)===jointIndex&&skinWeight.getComponent(i,channel)>.49))continue;
    vertex.fromBufferAttribute(position,i).applyMatrix4(this.body.bindMatrix);
    candidates.push({i,distance:vertex.distanceToSquared(jointPoint)});
   }
   candidates.sort((a,b)=>b.distance-a.distance);
   return candidates.slice(0,8).map(({i})=>{
    const {aGrowth}=this.capGeometry.attributes;
    return {i,growth:[aGrowth.getX(i),aGrowth.getY(i),aGrowth.getZ(i)]};
   });
  });
 }
 courtToePoint(landmark,out,far=false){
  if(this.body.geometry!==this.capGeometry)return null;
  const vertices=far?this.lockPawVertices:(this.courtToeVertices??=this.cacheLockedPawVertices(-1));
  let lowest=Infinity;
  for(const {i,growth} of vertices){
   const world=this.root.localToWorld(this.mapPoint(this.body.getVertexPosition(i,this.lockToe),growth));
   const local=landmark.worldToLocal(this.lockGround.copy(world));
   if(local.y<lowest){lowest=local.y;out.copy(world);}
  }
  return Number.isFinite(lowest)?out:null;
 }
 plantCourtPaws(landmark,age){
  const floor=landmark?.userData.courtStoneHeight;
  if(!floor)return null;
  const toes=this.courtPlantedToes??=[new THREE.Vector3(),new THREE.Vector3()];
  const target=this.courtPawTarget??=new THREE.Vector3();
  const shift=this.courtPawShift??=new THREE.Vector3();
  for(const leg of this.flightLimbs.legs){
   if(leg.rear)continue;
   const far=leg.side>0;
   const out=toes[Number(far)];
   if(!this.courtToePoint(landmark,out,far))return null;
   const touch=COURT_PAW_STEPS[Number(far)];
   const rise=far?3.83:3.71;
   const weight=smooth(touch-.15,touch+.025,age)*(1-smooth(rise,rise+.24,age));
   if(weight<=0)continue;
   const x=far?.95:-.69,z=far?10.35:10.24;
   const y=floor(x,z);
   if(!Number.isFinite(y))continue;
   this.root.worldToLocal(landmark.localToWorld(target.set(x,y+.026,z)));
   for(let pass=0;pass<3;pass++){
    this.root.worldToLocal(shift.copy(out));
    shift.subVectors(target,shift).multiplyScalar(weight).clampLength(0,.72/this.root.scale.x);
    if(shift.lengthSq()<1e-6)break;
    this.offsetForeleg(leg,shift,[.08,.24,.62,1]);
    this.root.updateMatrixWorld(true);
    this.body.skeleton.update();
    this.courtToePoint(landmark,out,far);
   }
  }
  return toes;
 }
 lockedClawPoint(landmark,out){
  const sample=landmark?.userData.lockStairHeight??landmark?.userData.upperStairHeight;
  if(!sample||this.body.geometry!==this.capGeometry)return null;
  let lowest=Infinity;
  for(const {i,growth} of this.lockPawVertices){
   const rigPoint=this.body.getVertexPosition(i,this.lockToe);
   const world=this.root.localToWorld(this.mapPoint(rigPoint,growth));
   const local=landmark.worldToLocal(this.lockGround.copy(world));
   const clearance=local.y-sample(local.x,local.z);
   if(clearance<lowest){lowest=clearance;out.copy(world);}
  }
  return Number.isFinite(lowest)?out:null;
 }
 finaleContacts(){
  const front=[],rear=[],wing=[],ankle=[],wingSeat=[],wingAxis=[],ankleAxis=[];
  const jointAt=(bone,parameters)=>{
   const out=new THREE.Vector3();
   return this.contactWorld(bone.getWorldPosition(out),parameters,out);
  };
  for(const leg of this.flightLimbs.legs){
   const targets=leg.rear?rear:front;
   targets.push(jointAt(leg.toes[1].bone,leg.rear?rearGrowth:frontGrowth));
   if(leg.rear){
    ankle.push(jointAt(leg.joints[4].bone,rearGrowth));
    ankleAxis.push(jointAt(leg.joints[2].bone,rearGrowth));
   }
  }
  for(const {joints} of this.flightLimbs.wings){
   wing.push(jointAt(joints[0].bone,frontGrowth));
   wingSeat.push(jointAt(joints[2].bone,frontGrowth));
   wingAxis.push(jointAt(joints[3].bone,frontGrowth));
  }
  return {front,rear,wing,ankle,wingSeat,wingAxis,ankleAxis};
 }
 plantGatePaws(){
  const pose=this.motion?.gatePose;
  if(!pose?.targets||!pose.contact)return;
  const falloff=[.10,.31,.62,1];
  for(const leg of this.flightLimbs.legs){
   if(leg.rear)continue;
   const side=leg.side<0?0:1;
   const weight=pose.pawWeight[side];
   if(!weight)continue;
   const toe=this.body.worldToLocal(leg.toes[1].bone.getWorldPosition(new THREE.Vector3()));
   const paw=this.mapPoint(toe,frontGrowth);
   const target=pose.targets[side];
   const shift=this.root.worldToLocal(target.pawWorld.clone()).sub(paw);
   shift.clampLength(0,(target.reach??2.4)/this.root.scale.x).multiplyScalar(weight);
   this.offsetForeleg(leg,shift,falloff,toe);
  }
 }
 settleBeamClaws(){
  const pose=this.motion?.gatePose;
  const left=pose?.targets?.[0]?.heightAt;
  const right=pose?.targets?.[1]?.heightAt;
  if(this.body.geometry!==this.capGeometry||!left||!right||!pose.contact)return;
  this.courtToeVertices??=this.cacheLockedPawVertices(-1);
  this.root.updateMatrixWorld(true);
  for(const leg of this.flightLimbs.legs){
   if(leg.rear)continue;
   const side=leg.side<0?0:1;
   const weight=pose.pawWeight[side];
   if(!weight)continue;
   const samples=side===0?this.courtToeVertices:this.lockPawVertices;
   let lift=0;
   for(const {i,growth} of samples){
    const point=this.root.localToWorld(this.mapPoint(this.body.getVertexPosition(i,this.lockToe),growth));
    const height=Math.max(left(point.x,point.z),right(point.x,point.z));
    lift=Math.max(lift,height-point.y-.045);
   }
   // The bent toes can hook the timber. Let the actual crest stop the
   // rest of their descent while the elbow continues to fold under load.
   if(lift>0){
    const offset=this.lockGround.set(0,Math.min(lift*1.45,.61),0);
    const point=this.root.getWorldPosition(this.lockToe);
    this.root.worldToLocal(offset.add(point));
    this.offsetForeleg(leg,offset,[0,.15,.94,1]);
   }
  }
 }
 offsetForeleg(leg,shift,falloff,toe){
  toe??=this.body.worldToLocal(leg.toes[1].bone.getWorldPosition(new THREE.Vector3()));
  const frame=this.sampleFrame(frontGrowth[2]);
  const rigDelta=new THREE.Vector3(shift.dot(frame.n),shift.dot(frame.b),-shift.dot(frame.t));
  const worldDelta=this.body.localToWorld(toe.clone().add(rigDelta)).sub(this.body.localToWorld(toe));
  // The foreleg deform bones are siblings on the chest. Give the
  // paw the whole offset and taper it up the leg toward the shoulder.
  const chest=leg.joints[0].bone.parent;
  const localDelta=chest.worldToLocal(chest.getWorldPosition(new THREE.Vector3()).add(worldDelta));
  for(let i=0;i<falloff.length;i++)leg.joints[i+1].bone.position.addScaledVector(localDelta,falloff[i]);
 }
 cacheStairSupports(){
  const {position,skinIndex,skinWeight,aGrowth}=this.capGeometry.attributes;
  const names=this.body.skeleton.bones.map(bone=>bone.name);
  const buckets=[new Map(),new Map(),new Map()];
  for(let i=0;i<position.count;i++){
   let dominant=0;
   for(let j=1;j<4;j++)if(skinWeight.getComponent(i,j)>skinWeight.getComponent(i,dominant))dominant=j;
   const bone=names[skinIndex.getComponent(i,dominant)];
   const distance=this.headZ-position.getZ(i);
   const wing=bone.startsWith('DEF_feather_')||bone.startsWith('DEF_wing_');
   const chest=bone.startsWith('DEF_body_')&&distance>.14&&distance<.38&&position.getY(i)<.045;
   const group=chest?0:wing?(bone.endsWith('L')?1:2):-1;
   if(group<0)continue;
   const key=chest?Math.floor(distance/.009)+'/'+Math.floor(position.getX(i)/.012):bone;
   const previous=buckets[group].get(key);
   if(!previous||position.getY(i)<position.getY(previous.i)){
    buckets[group].set(key,{i,growth:[aGrowth.getX(i),aGrowth.getY(i),aGrowth.getZ(i)]});
   }
  }
  return buckets.map(bucket=>[...bucket.values()]);
 }
 supportClearance(landmark,sample,vertices,out){
  let clearance=Infinity;
  for(const {i,growth} of vertices){
   const world=this.root.localToWorld(this.mapPoint(this.body.getVertexPosition(i,this.lockToe),growth));
   const local=landmark.worldToLocal(this.lockGround.copy(world));
   const floor=Math.max(sample(local.x,local.z),sample(local.x,local.z+.10),sample(local.x,local.z-.10));
   const gap=local.y-floor;
   if(gap<clearance){clearance=gap;out.copy(world);}
  }
  return clearance;
 }
 settleLockedBody(landmark){
  const phase=this.motion?.gatePose?.stairElapsed;
  const sample=landmark?.userData.lockStairHeight;
  if(!sample||phase==null||phase<17.12)return;
  const weight=smooth(17.12,18.44,phase);
  const lying=smooth(17.24,18.22,phase);
  const support=this.lockedSupport??={groups:this.cacheStairSupports(),points:[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()]};
  const {groups,points}=support;
  const chestGap=this.supportClearance(landmark,sample,groups[0],points[0]);
  const scale=this.root.scale.x;
  if(Number.isFinite(chestGap))this.field.settleChest(THREE.MathUtils.clamp(.045-chestGap,-.62,.42)*weight/scale);
  // A loose wing can pivot at its socket. The cuffed one keeps its
  // existing rig and attachment, so the chain eye moves with the cuff.
  const wing=this.flightLimbs.wings[0];
  const shoulder=wing.shoulder;
  const from=shoulder.quaternion.clone();
  const axis=this.lockToe.set(0,0,1).clone();
  const apply=angle=>{
   shoulder.quaternion.copy(from);
   this.flightLimbs.rotateInModel(shoulder,axis,angle);
   this.root.updateMatrixWorld(true);
   this.body.skeleton.update();
   return this.supportClearance(landmark,sample,groups[1],points[1]);
  };
  const startGap=apply(0);
  let flatten=0,gap=startGap;
  for(const angle of [-.58,-.38,-.19,.19,.38,.58]){
   const trial=apply(angle);
   if(Math.abs(trial-.055)<Math.abs(gap-.055)){gap=trial;flatten=angle;}
  }
  const toward=apply(flatten*.82);
  const slope=flatten?(gap-toward)/(flatten*.18):0;
  if(Number.isFinite(slope)&&Math.abs(slope)>.12){
   flatten=THREE.MathUtils.clamp(flatten+(.055-gap)/slope,-.61,.61);
  }
  apply(flatten*weight);
  this.supportClearance(landmark,sample,groups[0],points[0]);
  this.supportClearance(landmark,sample,groups[2],points[2]);
  // Put the unweighted foreleg down as the chest reaches the step, too.
  // Find the actual distal vertices and preserve the current upper hinge.
  if(lying>0){
   const arm=this.flightLimbs.legs.find(limb=>!limb.rear&&limb.side<0);
   const vertices=this.courtToeVertices??=this.cacheLockedPawVertices(-1);
   const point=new THREE.Vector3(),armTarget=new THREE.Vector3();
   const gap=this.supportClearance(landmark,sample,vertices,point);
   if(Number.isFinite(gap)){
    const end=landmark.worldToLocal(armTarget.copy(point));
    end.x+=.19*lying;
    end.z+=.43*lying;
    const upper=sample(end.x,end.z);
    if(Number.isFinite(upper)){
     end.y=upper+.038;
     const posed=this.root.worldToLocal(landmark.localToWorld(end)).sub(this.root.worldToLocal(point));
     posed.clampLength(0,1.85/scale).multiplyScalar(lying);
     this.offsetForeleg(arm,posed,[.05,.17,.56,1]);
    }
    this.root.updateMatrixWorld(true);
    this.body.skeleton.update();
   }
  }
 }
 braceLockedPaw(landmark){
  const pose=this.motion?.gatePose;
  const weight=pose?.stoneReach??0;
  const hold=pose?.stoneHold??0;
  const sample=landmark?.userData.lockStairHeight??landmark?.userData.upperStairHeight;
  if(weight<=0||!sample)return;
  const leg=this.flightLimbs.legs.find(candidate=>!candidate.rear&&candidate.side>0);
  if(!leg)return;
  const toe=this.body.worldToLocal(leg.toes[1].bone.getWorldPosition(new THREE.Vector3()));
  const paw=this.mapPoint(toe,frontGrowth);
  const claw=this.lockedClawPoint(landmark,new THREE.Vector3())??this.root.localToWorld(paw.clone());
  const stone=landmark.worldToLocal(claw.clone());
  const elapsed=pose.stairElapsed;
  if(elapsed===null)return;
  const run=smooth(LOCK_STAIR.touch,LOCK_STAIR.lip,elapsed);
  const landing=smooth(LOCK_STAIR.lip,LOCK_STAIR.landing,elapsed);
  const lower=smooth(LOCK_STAIR.landing,LOCK_STAIR.lower,elapsed);
  stone.x=THREE.MathUtils.lerp(stone.x,-1.48-.17*run-.10*landing-.12*lower,hold);
  stone.z=THREE.MathUtils.lerp(stone.z,-14.78-.93*run-1.88*landing-.83*lower,hold);
  const tread=sample(stone.x,stone.z);
  if(!Number.isFinite(tread))return;
  stone.y=tread+.033;
  const shift=this.root.worldToLocal(landmark.localToWorld(stone)).sub(this.root.worldToLocal(claw));
  shift.clampLength(0,(1.77+.88*hold)/this.root.scale.x).multiplyScalar(weight);
  this.offsetForeleg(leg,shift,[.08,.24,.62,1],toe);
  this.root.updateMatrixWorld(true);
  this.body.skeleton.update();
  // A toe farther from the lead claw can meet the next riser while the
  // lead point remains on the ramp. Lift the whole paw onto that lip.
  if(hold>.85){
   const lowest=this.lockedClawPoint(landmark,new THREE.Vector3());
   if(lowest){
    stone.copy(landmark.worldToLocal(lowest));
    const lift=sample(stone.x,stone.z)+.023-stone.y;
    if(lift>.015){
     this.root.worldToLocal(landmark.localToWorld(stone));
     const offset=stone.clone();
     offset.y+=Math.min(lift,.47)/this.root.scale.x;
     this.offsetForeleg(leg,offset.sub(stone),[.04,.18,.62,1]);
     this.root.updateMatrixWorld(true);
     this.body.skeleton.update();
    }
   }
  }
 }
 restoreFrontAttachments(){
  for(const {bone,position} of this.frontAttachments)bone.position.copy(position);
 }
 growFrontAttachments(){
  // The front leg chains and the two wing roots share the chest parent.
  // Existing weights blend the movement into the chest. Moving each wing's
  // socket and shoulder together keeps its inner edge on the same joint.
  const growth=this.extra/(2.1+this.extra);
  const forelegShift=.105*growth+.050*smooth(.25,4.8,this.extra);
  const wingShift=.105*growth*smooth(0,1.8,this.extra);
  const chest=this.forelegJoints[0].bone.parent;
  this.chestSpace.copy(chest.matrixWorld).invert().multiply(this.body.matrixWorld);
  this.chestAxis.setFromMatrixColumn(this.chestSpace,2);
  for(const {bone,position} of this.forelegJoints){
   position.copy(bone.position);
   bone.position.addScaledVector(this.chestAxis,-forelegShift);
  }
  for(const {bone,position} of this.wingRoots){
   position.copy(bone.position);
   bone.position.addScaledVector(this.chestAxis,-wingShift);
  }
 }
 playClip(name){
  this.feathers?.restore();this.flightLimbs.restoreWingScale();this.restoreFrontAttachments();this.flightLimbs.restore();this.headPose.restore();this.mixer.stopAllAction();this.flightActions=null;this.arrivalAction=null;this.action=this.mixer.clipAction(this.asset.animations.find(c=>c.name===name));this.action.play();this.clipName=name;
  for(const r of this.feathers.records)r.baseline.copy(r.bone.quaternion);
 }
 poseFlight(dt){
  if(!this.motion){this.mixer.update(dt);return;}
  const {wingPhase,wingPower,drive,lift,change,arrival=0,settle=0,speed=0}=this.motion;
  const brake=smooth(.95,.993,settle)*(1-smooth(.87,2.45,speed));
  const terminal=flightArrival(arrival,this.motion.arrivalStroke??this.arrivalPose,brake);
  const court=this.motion.gatePose?.courtWeight??0;
  if(court>0)terminal.blend*=1-court*.90;
  if(!this.flightActions){
   this.mixer.stopAllAction();
   this.flightActions=['Living_Idle','Serpentine_Glide','Cloud_Flight'].map(name=>{
    const clip=this.asset.animations.find(clip=>clip.name===name);
    const action=this.mixer.clipAction(this.flightLimbs.liveClip(clip));
    action.reset().play();
    action.paused=true;
    return action;
   });
  }
  // Sample the final wingbeat independently so the live clip can fade from
  // its current phase without snapping to a different point in the cycle.
  if(terminal.blend>0&&!this.arrivalAction){
   const flight=this.asset.animations.find(clip=>clip.name==='Cloud_Flight');
   this.arrivalClip??=new THREE.AnimationClip('Gate_Arrival',flight.duration,flight.tracks);
   this.arrivalAction=this.mixer.clipAction(this.arrivalClip).reset().play();
   this.arrivalAction.paused=true;
  }
  if(this.arrivalAction){
   this.arrivalAction.time=terminal.phase*this.arrivalClip.duration*.5;
   this.arrivalAction.setEffectiveWeight(terminal.blend);
  }
  const hover=(1-smooth(.08,.55,drive))*(1-smooth(.12,1.1,Math.abs(lift)))*(.72-.48*change);
  const weights=[hover,(1-hover)*(1-wingPower),(1-hover)*wingPower];
  for(let i=0;i<this.flightActions.length;i++){
   const action=this.flightActions[i];
   action.time=(wingPhase/(i===2?2:1)%1)*action.getClip().duration;
   action.setEffectiveWeight(weights[i]*(1-terminal.blend));
  }
  this.mixer.update(0);
  this.flightLimbs.update(this.motion,terminal);
  this.headPose.update(this.motion,terminal);
 }
 seek(time){this.feathers.restore();this.flightLimbs.restoreWingScale();this.restoreFrontAttachments();if(this.flightActions){this.flightLimbs.restore();this.headPose.restore();}this.mixer.setTime(time);for(const r of this.feathers.records)r.baseline.copy(r.bone.quaternion);this.root.updateMatrixWorld(true);this.growFrontAttachments();this.flightLimbs.growWings(this.extra);}
 setSegments(count,{immediate=false}={}){
  this.targetExtra=Math.max(0,Number(count)||0)*this.data.moduleLength;
  if(immediate){this.extra=this.targetExtra;this.hipExtra=clamp(this.hipRatio*(1+this.extra)-this.data.hipAnchor,0,this.extra);}
 }
 setAddedLength(length,options={}){this.setSegments(length/this.data.moduleLength,options);}
 setHipRatio(ratio){this.hipRatio=clamp(ratio,.28,.82);}
 setMethod(method){this.method=method;this.shared.uGrowthStretch.value=method==='stretch'?1:0;this.body.geometry=method==='stretch'?this.body.userData.originalGeometry:this.capGeometry;for(const section of this.sections)section.midMesh.visible=method!=='stretch';}
 setMaterial(mode){this.materialMode=mode;for(const mesh of this.meshes)mesh.material=mesh.userData[mode];for(const section of this.sections)section.setMaterial(mode);this.mane?.setMaterial(mode);}
 setSpine(points){this.field.customSpine=points?.length>1?new THREE.CatmullRomCurve3(points.map(p=>p.isVector3?p.clone():new THREE.Vector3(...p))):null;}
 update(dt,animate=true){
  this.feathers.restore();
  this.flightLimbs.restoreWingScale();
  this.restoreFrontAttachments();
  if(this.flightActions){this.flightLimbs.restore();this.headPose.restore();}
  this.poseFlight(animate?dt:0);
  if(animate)this.time+=dt;
  this.extra+=(this.targetExtra-this.extra)*(1-Math.exp(-dt*5));if(Math.abs(this.targetExtra-this.extra)<1e-5)this.extra=this.targetExtra;
  const hipTarget=clamp(this.hipRatio*(1+this.extra)-this.data.hipAnchor,0,this.extra);this.hipExtra=clamp(this.hipExtra+(hipTarget-this.hipExtra)*(dt===0?1:1-Math.exp(-dt*7)),0,this.extra);
  this.shared.uGrowthExtra.value=this.extra;this.shared.uGrowthHip.value=this.hipExtra;
  this.field.update(1+this.extra,this.time,this.pose,this.bend);
  this.root.updateMatrixWorld(true);
  this.feathers.update(dt);
  this.growFrontAttachments();
  this.flightLimbs.growWings(this.extra,this.chapterWingGrowth);
  this.root.updateMatrixWorld(true);
  this.plantGatePaws();
  this.settleBeamClaws();
  this.root.updateMatrixWorld(true);this.body.skeleton.update();
  const pose=this.motion?.gatePose;
  this.courtContacts=pose?.courtLandmark?this.plantCourtPaws(pose.courtLandmark,pose.courtAge):null;
  const stair=pose?.stairLandmark;
  if(stair){
   this.settleLockedBody(stair);
   this.braceLockedPaw(stair);
  }
  this.sections[0].update(this.hipExtra);this.sections[1].update(this.extra-this.hipExtra);this.mane.update(dt);
 }
 stats(){return{extraLength:this.extra,totalLength:1+this.extra,addedSegments:this.extra/this.data.moduleLength,hipExtra:this.hipExtra,hipFraction:(this.data.hipAnchor+this.hipExtra)/(1+this.extra),middleRings:this.sections.reduce((s,x)=>s+x.rings+2,0),middleTriangles:this.sections.reduce((s,x)=>s+x.midMesh.geometry.drawRange.count/3,0),capacityRings:this.sections.reduce((s,x)=>s+x.capacity,0),skinJoints:this.body.skeleton.bones.length,curveSamples:this.field.curveCount,maneTufts:this.mane.total,liveFeatherBones:this.feathers.records.length};}
}
