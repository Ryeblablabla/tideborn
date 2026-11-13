import * as THREE from 'three';
import {ManeFlow, bendManeVector, maneAngles, maneBendGLSL} from './mane-flow.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const random=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
const TAU=Math.PI*2;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function spring(record,targetX,targetY,dt,omega=12,damping=.80){
 const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
 for(let i=0;i<steps;i++){
  record.vx+=((targetX-record.x)*omega*omega-2*damping*omega*record.vx)*h;record.x+=record.vx*h;
  record.vy+=((targetY-record.y)*omega*omega-2*damping*omega*record.vy)*h;record.y+=record.vy*h;
 }
}
function lobeMaterial(material){
 const result=material.clone();result.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+maneBendGLSL)
   .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=originalBend()*objectNormal;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=originalBend()*transformed;');
 };result.customProgramCacheKey=()=>`original-source-lobe-${material.type}`;return result;
}

/**
 * Shape the growing mane in patches of heavy locks and scattered accents.
 * Offsets and seeds stay fixed as the band gets longer. Growth reveals new
 * patches rather than changing the size or placement of existing locks.
 */
export function* manePatches(length, stage, bandIndex) {
 const isTail = bandIndex === 1;
 const phase = stage * 1.37 + bandIndex * 2.11;
 const formLength = stage === 2 ? .95 : stage === 3 ? 1.12 : 1;
 const tailLength = isTail ? .83 : 1;
 const thickness = isTail ? .84 : 1;
 let start = .014, lastRaised = -.4;
 for (let cluster = 0; start < length - .018; cluster++) {
  const seed = stage * 1297 + bandIndex * 503 + cluster * 29;
  const fullness = .54 + Math.sin(start * 6.3 + phase) * .31
    + Math.sin(start * 13.4 - phase) * .15;
  const lean = Math.sin(start * 3.4 + phase) * .31 + (random(seed + 1) - .5) * .26;
  const side = lean > 0 ? 1 : -1;
  const raised = stage === 4 && start - lastRaised > .17 + .10 * random(seed + 22)
    && fullness > .27 && random(seed + 24) > .27;
  if(raised)lastRaised=start;
  const heavy = raised || fullness > .42 && random(seed + 2) > .20;
  const lengthGain = formLength * tailLength;
  const role = heavy ? 'crest' : fullness < .27 ? 'small' : 'sweep';
  const patch = {
   key: `${bandIndex}:${cluster}:0`, seed, cluster, role, raised, offset: start,
   template: Math.floor(random(seed + 3) * (raised ? 2 : 4)),
   angle: lean,
   length: lengthGain * (raised ? 1.43 + random(seed + 4) * .47 : heavy ? 1.02 + random(seed + 4) * .55 : 1.17 + random(seed + 4) * .42),
   breadth: thickness * (raised ? .78 + random(seed + 5) * .37 : heavy ? .85 + random(seed + 5) * .48 : .68 + random(seed + 5) * .30),
   height: raised ? 1.35 + random(seed + 6) * .56 : heavy ? .92 + random(seed + 6) * .43 : .72 + random(seed + 6) * .31,
   pitch: raised ? .57 + random(seed + 7) * .27 : heavy ? .23 + random(seed + 7) * .24 : .09 + random(seed + 7) * .18,
   yaw: (random(seed + 8) - .5) * (heavy ? .39 : .54),
  };
  yield patch;
  const accent = start + .021 + random(seed + 9) * .029;
  if (accent < length - .018 && fullness > .56 && random(seed + 10) > .51) {
   yield {
    key: `${bandIndex}:${cluster}:1`, seed: seed + 11, cluster, role: 'side', offset: accent,
    template: Math.floor(random(seed + 12) * 4),
    angle: -side * (.29 + random(seed + 13) * .33),
    length: lengthGain * (.63 + random(seed + 14) * .46),
    breadth: thickness * (.72 + random(seed + 15) * .38),
    height: .77 + random(seed + 16) * .37,
    pitch: .16 + random(seed + 17) * .22,
    yaw: (random(seed + 18) - .5) * .41,
   };
  }
  // Interleaved low locks form a continuous line. Height and curl vary
  // separately, leaving the irregular rhythm of the original silhouette.
  const space = fullness < .35 ? .013 : 0;
  start += (.045 + random(seed + 20) ** 1.3 * .044 + space) * (isTail ? 1.14 : 1);
 }
}

/** Reuses the source sculpt's exact triangle/UV lobes; never creates hair cards. */
export class OriginalMane {
 constructor(owner){
  this.owner=owner;this.flow=new ManeFlow();this.enabled=true;this.dynamic=true;this.total=0;this.templates=owner.maneData.templates;this.groups=owner.maneData.groups.map(g=>({...g,rootV:new THREE.Vector3(...g.root),direction:new THREE.Vector3(...g.tip).sub(new THREE.Vector3(...g.root)).normalize(),flow:new THREE.Vector4(),x:0,y:0,vx:0,vy:0}));
  this.sourceGeometry=owner.body.userData.originalGeometry;this.records=new Map();this.designs=new Map();this.batches=[];
  this.geometryRecords=[this.prepareSourceGeometry(this.sourceGeometry),this.prepareSourceGeometry(owner.capGeometry)];
  for(const template of this.templates){
   const root=new THREE.Vector3(...template.root),positions=Float32Array.from(template.positions),geometry=new THREE.BufferGeometry();
   for(let i=0;i<positions.length;i+=3){positions[i]-=root.x;positions[i+1]-=root.y;positions[i+2]-=root.z;}
   geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(template.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(template.uv,2));geometry.setAttribute('aOriginalFlex',new THREE.Float32BufferAttribute(template.flex,1));geometry.setIndex(template.indices.flat());
   const gray=lobeMaterial(new THREE.MeshStandardMaterial({color:'#aeb9b5',roughness:.94,side:THREE.DoubleSide})),ink=lobeMaterial(owner.body.userData.originalMaterial);
   this.batches.push({template,geometry,gray,ink,mesh:null,capacity:0});
  }
 }
 prepareSourceGeometry(geometry){
  const originalP=geometry.attributes.position.array.slice(),originalN=geometry.attributes.normal.array.slice(),attribute=geometry.attributes.aMane,selected=[];
  for(let i=0;i<attribute.count;i++)if(attribute.getX(i)>=0&&attribute.getY(i)>.00001)selected.push({index:i,id:Math.round(attribute.getX(i)),flex:attribute.getY(i)});
  return{geometry,originalP,originalN,selected};
 }
 bendSource(dt){
  const owner=this.owner,basis=new THREE.Matrix4(),inverse=new THREE.Quaternion(),wind=new THREE.Vector3(),torque=new THREE.Vector3(),p=new THREE.Vector3(),n=new THREE.Vector3(),axis=new THREE.Vector3(),angles=new THREE.Vector2();
  for(const group of this.groups){
   const zone=group.root[2]>=owner.data.gaps[0].frontCutZ?0:group.root[2]<=owner.data.gaps[1].rearCutZ?2:1;
   const distance=owner.headZ-group.root[2]+owner.shift(zone),frame=owner.sampleFrame(distance);
   basis.makeBasis(frame.n,frame.b,axis.copy(frame.t).negate());
   inverse.setFromRotationMatrix(basis).invert();
   owner.feathers.windAt(distance,wind).applyQuaternion(inverse);
   torque.crossVectors(group.direction,wind);
   const gain={brow:.49,crest:1.06,neck:1.22,back:.80,tail:.97}[group.kind]||1;
   this.flow.sample(distance,group.id,gain*clamp(group.length/.074,.58,1.20),group.flow);
   if(this.dynamic){
    spring(group,clamp(group.flow.x+torque.x*.15,-.39,.34),clamp(group.flow.y+torque.y*.12,-.35,.35),dt,
     clamp(18-group.length*71,8,18),.76);
    group.flow.x=group.x;group.flow.y=group.y;
   }else{
    group.x=group.y=group.vx=group.vy=0;
    group.flow.set(0,0,0,0);
   }
  }
  this.maxOriginalTipOffset=0;
  for(const record of this.geometryRecords){
   const {geometry,originalP,originalN,selected}=record,positions=geometry.attributes.position,normals=geometry.attributes.normal;
   for(const item of selected){
    const g=this.groups[item.id],i=item.index,k=i*3;
    maneAngles(item.flex,g.flow,angles);
    bendManeVector(p,originalP[k]-g.rootV.x,originalP[k+1]-g.rootV.y,originalP[k+2]-g.rootV.z,angles.x,angles.y).add(g.rootV);
    bendManeVector(n,originalN[k],originalN[k+1],originalN[k+2],angles.x,angles.y);
    this.maxOriginalTipOffset=Math.max(this.maxOriginalTipOffset,Math.hypot(p.x-originalP[k],p.y-originalP[k+1],p.z-originalP[k+2]));
    positions.setXYZ(i,p.x,p.y,p.z);normals.setXYZ(i,n.x,n.y,n.z);
   }
   positions.needsUpdate=normals.needsUpdate=true;
  }
 }
 roots(){
  const result=[],owner=this.owner;
  if(!this.enabled)return result;
  for(let sectionIndex=0;sectionIndex<owner.sections.length;sectionIndex++){
   const section=owner.sections[sectionIndex],prefix=sectionIndex?owner.hipExtra:0,available=section.b-section.a+section.extra;
   for(const design of manePatches(available,4,sectionIndex)){
    const { key, seed, cluster, role, raised, offset } = design;
    let shape=this.designs.get(key);
    if(!shape){shape=this.designShape(design,seed);this.designs.set(key,shape);}
    const {templateIndex,angle,style}=shape,local=section.a+offset,p=section.surface(local,angle),arc=owner.headZ-p.z+prefix,f=owner.sampleFrame(arc),out=f.n.clone().multiplyScalar(Math.cos(angle)).addScaledVector(f.b,Math.sin(angle)).normalize(),fade=smooth(.015,.070,available-offset);
    const opposite=section.surface(local,angle+Math.PI);
    const c=Math.cos(angle),s=Math.sin(angle);
    const depth=(p.x-opposite.x)*c+(p.y-opposite.y)*s;
    // The collar may become narrower than a raised lock's rigid base.
    // Seat that base in the dorsal part of the actual ring instead of
    // burying it far enough to emerge through the ventral surface.
    const maxSink=Math.max(0,depth-Math.max(.007,depth*.22)+shape.rootFloor*fade);
    const sink=Math.min((shape.rootHeight+.0015)*fade+shape.rootCurve*fade*fade,maxSink);
    const root=f.p.clone().addScaledVector(f.n,p.x).addScaledVector(f.b,p.y).addScaledVector(out,-sink),restRoot=new THREE.Vector3(p.x-c*sink,p.y-s*sink,owner.headZ-arc);
    result.push({key,templateIndex,root,f,arc,scaleX:shape.scale[0]*fade,scaleY:shape.scale[1]*fade,scaleZ:shape.scale[2]*fade,style,restRoot,seed,role,raised,cluster});
   }
  }return result;
 }
 designShape(design,seed){
  const templateIndex=Math.min(design.template,this.templates.length-1),template=this.templates[templateIndex],crest=design.role==='crest',sweep=design.role==='sweep',small=design.role==='small',angle=Math.PI/2+design.angle+(random(seed+12)-.5)*.10;
  const desiredLength=((crest?.082:sweep?.062:small?.048:.044)+random(seed+13)*(crest?.020:.015))*(design.length??1);
  const scale=[
   (crest?.94:sweep?.79:small?.62:.76)*(.86+random(seed+14)*.24)*(design.breadth??1),
   (crest?1.01:sweep?.78:small?.58:.82)*(.86+random(seed+15)*.25)*(design.height??1),
   clamp(desiredLength/template.length,.48,design.raised?2.48:1.91),
  ];
  const style=new THREE.Quaternion(),matrix=new THREE.Matrix4(),root=new THREE.Vector3(...template.root),p=new THREE.Vector3(),sv=new THREE.Vector3(...scale);
  let pitch=design.pitch??(crest?.30:.23)+random(seed+16)*.15,rootHeight=0,rootFloor=0,rootCurve=0;
  for(let attempt=0;attempt<4;attempt++){
   style.setFromEuler(new THREE.Euler(pitch,design.yaw??(random(seed+17)-.5)*.24,-design.angle*.75,'YXZ'));matrix.compose(new THREE.Vector3(),style,sv);
   let top=-Infinity,base=-Infinity,floor=0,curve=0;
   for(let i=0;i<template.flex.length;i++){
    p.fromArray(template.positions,i*3).sub(root).applyMatrix4(matrix);const height=p.x*Math.cos(angle)+p.y*Math.sin(angle);top=Math.max(top,height);
    if(template.flex[i]<.36){base=Math.max(base,height);floor=Math.min(floor,height);const across=-p.x*Math.sin(angle)+p.y*Math.cos(angle);curve=Math.max(curve,across*across/.075);}
   }
   rootHeight=Math.max(0,base);rootFloor=floor;rootCurve=Math.min(.006,curve);if(top-rootHeight-rootCurve>.009)break;pitch+=.075;
  }
  return{templateIndex,angle,style,scale,rootHeight,rootFloor,rootCurve};
 }
 reserve(batch,count){
  if(batch.mesh&&count<=batch.capacity)return;
  const capacity=2**Math.ceil(Math.log2(Math.max(4,count))),geometry=batch.geometry.clone();geometry.setAttribute('aFlutter',new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage));
  if(batch.mesh){this.owner.root.remove(batch.mesh);batch.mesh.geometry.dispose();batch.mesh.dispose();}
  const mesh=new THREE.InstancedMesh(geometry,this.owner.materialMode==='ink'?batch.ink:batch.gray,capacity);mesh.frustumCulled=false;mesh.name=`Source_Mane_${batch.template.name}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.inkRestMatrices=new Float32Array(capacity*16);mesh.userData.maneRaised=new Uint8Array(capacity);batch.mesh=mesh;batch.capacity=capacity;this.owner.root.add(mesh);
 }
 update(dt){
  if(this.flow.update(this.owner.motion,dt)){
   this.records.clear();
   for(const group of this.groups)group.x=group.y=group.vx=group.vy=0;
  }
  this.bendSource(dt);const roots=this.roots(),lists=this.batches.map(()=>[]),owner=this.owner,active=new Set();for(const info of roots)lists[info.templateIndex].push(info);this.total=roots.length;
  const matrix=new THREE.Matrix4(),basis=new THREE.Matrix4(),restMatrix=new THREE.Matrix4(),q=new THREE.Quaternion(),wind=new THREE.Vector3(),scale=new THREE.Vector3(),inertia=new THREE.Vector3();
  this.layout=roots.map(r=>({key:r.key,seed:r.seed,templateIndex:r.templateIndex,role:r.role,raised:!!r.raised,arc:r.arc,scale:[r.scaleX,r.scaleY,r.scaleZ],yaw:new THREE.Euler().setFromQuaternion(r.style).y}));
  for(let k=0;k<this.batches.length;k++){
   const batch=this.batches[k],list=lists[k];this.reserve(batch,list.length);const mesh=batch.mesh;mesh.visible=this.enabled&&owner.method==='loft'&&list.length>0;mesh.count=list.length;
   const flutter=mesh.geometry.attributes.aFlutter;
   list.forEach((info,i)=>{
    active.add(info.key);let record=this.records.get(info.key);if(!record){record={x:0,y:0,vx:0,vy:0,lastRoot:info.root.clone(),rootVelocity:new THREE.Vector3(),flow:new THREE.Vector4()};this.records.set(info.key,record);}
    matrix.makeBasis(info.f.n,info.f.b,info.f.t.clone().negate());q.setFromRotationMatrix(matrix).invert();owner.feathers.windAt(info.arc,wind).applyQuaternion(q);
    const axis=new THREE.Vector3(...batch.template.tip).sub(new THREE.Vector3(...batch.template.root)).normalize(),torque=axis.cross(wind);
    inertia.set(0,0,0);
    if(dt>0&&info.root.distanceTo(record.lastRoot)<.06){const velocity=info.root.clone().sub(record.lastRoot).divideScalar(dt);inertia.copy(velocity).sub(record.rootVelocity).divideScalar(dt).clampLength(0,8).applyQuaternion(q);record.rootVelocity.copy(velocity);}else if(dt>0)record.rootVelocity.set(0,0,0);
    record.lastRoot.copy(info.root);
    const softness=info.raised?1.16:info.role==='crest'?1:info.role==='sweep'?.91:info.role==='side'?.77:.62;
    const flow=this.flow.sample(info.arc,info.seed,softness,record.flow);
    if(this.dynamic){
     const lift=info.raised?.23+.06*this.flow.lift:0;
     spring(record,clamp(flow.x+lift+torque.x*.13*softness-inertia.y*.012,-.42,.43),
      clamp(flow.y+torque.y*.15*softness+inertia.x*.012,-.37,.37),dt,(info.raised?8:info.role==='crest'?9:12)+random(info.seed)*3,.76);
     flow.x=record.x;flow.y=record.y;
    }else{
     record.x=record.y=record.vx=record.vy=0;
     flow.set(0,0,0,0);
    }
    scale.set(info.scaleX,info.scaleY,info.scaleZ);restMatrix.compose(info.restRoot,info.style,scale);restMatrix.toArray(mesh.userData.inkRestMatrices,i*16);
    matrix.compose(new THREE.Vector3(),info.style,scale);basis.makeBasis(info.f.n,info.f.b,info.f.t.clone().negate());matrix.premultiply(basis);matrix.setPosition(info.root);mesh.setMatrixAt(i,matrix);mesh.userData.maneRaised[i]=Number(!!info.raised);flutter.setXYZW(i,flow.x,flow.y,flow.z,flow.w);
   });
   mesh.instanceMatrix.needsUpdate=true;flutter.needsUpdate=true;
  }
  for(const key of this.records.keys())if(!active.has(key))this.records.delete(key);
 }
 setMaterial(mode){for(const batch of this.batches)if(batch.mesh)batch.mesh.material=mode==='gray'?batch.gray:batch.ink;}
}
