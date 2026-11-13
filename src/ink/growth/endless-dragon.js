import * as THREE from 'three';
import {mergeVertices}from'three/examples/jsm/utils/BufferGeometryUtils.js';
import {CurveField,modifyMaterial}from'./curve-field.js';
import {clipPolygon}from'./growth-utils.js';
import {LoftSection}from'./loft-section.js';
import {LiveFeathers,DynamicMane}from'./dynamic-plumage.js';
import {FlightLimbs}from'./flight-limbs.js';
import {flightArrival}from'./flight-stroke.js';
import {YinglongHead}from'./yinglong-head.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

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
  this.arrivalPose={};
  this.jointKinds=this.body.skeleton.bones.map(b=>({front:/^DEF_(wing|feather|fore)/.test(b.name),rear:b.name.startsWith('DEF_hind'),head:/^DEF_(head|jaw|whisker|beard)/.test(b.name)}));
  for(const mesh of this.meshes){
   mesh.frustumCulled=false;mesh.userData.originalGeometry=mesh.geometry;mesh.userData.originalMaterial=mesh.material;mesh.geometry.setAttribute('aGrowth',this.growthAttribute(mesh.geometry));
   if(mesh===this.body){const values=new Float32Array(mesh.geometry.attributes.position.count*2);for(let i=0;i<values.length/2;i++){values[i*2]=maneData.vertexGroup[i];values[i*2+1]=maneData.vertexFlex[i];}mesh.geometry.setAttribute('aMane',new THREE.BufferAttribute(values,2));}
   mesh.userData.gray=modifyMaterial(new THREE.MeshStandardMaterial({color:'#aeb9b5',roughness:.94,side:THREE.DoubleSide}),this.shared);mesh.userData.ink=modifyMaterial(mesh.material,this.shared);this.materials.push(mesh.userData.gray,mesh.userData.ink);
  }
  this.capGeometry=this.clipBody(this.body.geometry);this.body.geometry=this.capGeometry;
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
 playClip(name){
  this.feathers?.restore();this.flightLimbs.restore();this.headPose.restore();this.mixer.stopAllAction();this.flightActions=null;this.arrivalAction=null;this.action=this.mixer.clipAction(this.asset.animations.find(c=>c.name===name));this.action.play();this.clipName=name;
  for(const r of this.feathers.records)r.baseline.copy(r.bone.quaternion);
 }
 poseFlight(dt){
  if(!this.motion){this.mixer.update(dt);return;}
  const {wingPhase,wingPower,drive,lift,change,arrival=0,settle=0,speed=0}=this.motion;
  const brake=smooth(.95,.993,settle)*(1-smooth(.87,2.45,speed));
  const terminal=flightArrival(arrival,this.arrivalPose,brake);
  if(!this.flightActions){
   this.mixer.stopAllAction();
   this.flightActions=['Living_Idle','Serpentine_Glide','Cloud_Flight'].map(name=>{
    const action=this.mixer.clipAction(this.asset.animations.find(clip=>clip.name===name));
    action.reset().play();
    action.paused=true;
    return action;
   });
  }
  // Sample the final wingbeat independently so the live clip can fade from
  // its current phase without snapping to a different point in the cycle.
  if(terminal.blend>0&&!this.arrivalAction){
   const flight=this.flightActions[2].getClip();
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
 seek(time){this.feathers.restore();if(this.flightActions){this.flightLimbs.restore();this.headPose.restore();}this.mixer.setTime(time);for(const r of this.feathers.records)r.baseline.copy(r.bone.quaternion);}
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
  if(this.flightActions){this.flightLimbs.restore();this.headPose.restore();}
  this.poseFlight(animate?dt:0);
  if(animate)this.time+=dt;
  this.extra+=(this.targetExtra-this.extra)*(1-Math.exp(-dt*5));if(Math.abs(this.targetExtra-this.extra)<1e-5)this.extra=this.targetExtra;
  const hipTarget=clamp(this.hipRatio*(1+this.extra)-this.data.hipAnchor,0,this.extra);this.hipExtra=clamp(this.hipExtra+(hipTarget-this.hipExtra)*(dt===0?1:1-Math.exp(-dt*7)),0,this.extra);
  this.shared.uGrowthExtra.value=this.extra;this.shared.uGrowthHip.value=this.hipExtra;
  this.field.update(1+this.extra,this.time,this.pose,this.bend);
  this.root.updateMatrixWorld(true);this.feathers.update(dt);this.root.updateMatrixWorld(true);this.body.skeleton.update();
  this.sections[0].update(this.hipExtra);this.sections[1].update(this.extra-this.hipExtra);this.mane.update(dt);
 }
 stats(){return{extraLength:this.extra,totalLength:1+this.extra,addedSegments:this.extra/this.data.moduleLength,hipExtra:this.hipExtra,hipFraction:(this.data.hipAnchor+this.hipExtra)/(1+this.extra),middleRings:this.sections.reduce((s,x)=>s+x.rings+2,0),middleTriangles:this.sections.reduce((s,x)=>s+x.midMesh.geometry.drawRange.count/3,0),capacityRings:this.sections.reduce((s,x)=>s+x.capacity,0),skinJoints:this.body.skeleton.bones.length,curveSamples:this.field.curveCount,maneTufts:this.mane.total,liveFeatherBones:this.feathers.records.length};}
}
