import * as THREE from 'three';
import {InkWashRenderer} from '../shared-ink/ink-wash.js';
import {loadSharedInkResources} from '../shared-ink/shared-ink-resources.js';
import {createYinglongStudy} from '../shared-ink/yinglong-study.js';
import {classifyYinglongWings} from '../shared-ink/wing-partition.js';
import {zipper} from './growth-utils.js';
import {InkFlame} from './ink-flame.js';
import {bendManeVector, installManePigment, maneAngles} from './mane-flow.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const TAU=Math.PI*2;

// Dynamic surface bridge. The shared ink renderer is used unchanged. Its input
// meshes carry the real, current deformed surface plus stable paint coordinates.
// Stamps keep their source triangle and barycentric coordinates, so animation
// does not leave the brush volumes behind in the bind pose.
export class GrowthInkRenderer {
 constructor(renderer,dragon,sharedInk=null){
  this.renderer=renderer;this.dragon=dragon;this.root=new THREE.Group();this.root.name='Shared_Ink_Dynamic_Surface';this.root.visible=false;
  this.ink=sharedInk||new InkWashRenderer(renderer,{outline:.55,outlineWidth:1.1,outlineDetail:.30,inkFlow:.68,inkFlowSpeed:.8});
  this.entries=[];this.middle=[];this.mane=[];this.frame=0;this.rebuildAt=0;this.lastTarget=NaN;this.updatedVertices=0;
  this.p=new THREE.Vector3();this.n=new THREE.Vector3();this.f=new Float64Array(12);this.g=new Float64Array(12);this.pm=new THREE.Matrix4();this.nm=new THREE.Matrix3();this.rm=new THREE.Matrix4();this.rnm=new THREE.Matrix3();
  this.maneFlow=new THREE.Vector4();this.maneAngle=new THREE.Vector2();this.maneTime={value:0};this.maneLoad={value:0};
  this.foilEye=new THREE.Vector3();this.foilAxis=new THREE.Vector3();
 }
 async initialize(){
  this.ink.setSharedResources(await loadSharedInkResources());
  const dragon=this.dragon,bodyReference=this.referenceGeometry(dragon.body,dragon.capGeometry),part=classifyYinglongWings(bodyReference),buckets={body:[],left:[],right:[],claw:[]},p=bodyReference.attributes.position,idx=bodyReference.index;
  for(let i=0;i<idx.count;i+=3){
   const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];
   const claw=ids.filter(i=>p.getY(i)<-.169&&Math.abs(p.getX(i))>.067).length>=2,wing=ids.filter(i=>part.mask[i]===1).length>=2;
   buckets[claw?'claw':wing?(ids.reduce((s,i)=>s+p.getX(i),0)>0?'right':'left'):'body'].push(...ids);
  }
  const authoredRoot=new THREE.Group(),authoredMesh=new THREE.Mesh(bodyReference.clone(),new THREE.MeshStandardMaterial());authoredRoot.add(authoredMesh);
  const study=createYinglongStudy(authoredRoot),bodyProfile=study.children.find(m=>m.userData.inkProfile?.brushPaths)?.userData.inkProfile||{};
  for(const[name,ids]of Object.entries(buckets))if(ids.length){
   const {geometry,mapping}=this.subset(bodyReference,ids),wing=name==='left'||name==='right',sign=name==='right'?1:-1;
   const profile=name==='claw'?{toneRange:[.9,1.2],geometryInfluence:.2,reserveStrength:0,strokes:false}:wing?{flow:new THREE.Vector3(sign*.65,.45,-1),toneRange:[.18,.68],reserveStrength:0,twoSidedInk:true,ridgeReserve:.85,ridgeWidth:.035}:bodyProfile;
   this.addEntry({name:'Ink_'+name,geometry,profile,inkRole:wing?'wing':name,kind:'skin',source:dragon.body,sourceGeometry:dragon.capGeometry,mapping,variant:'cap'});
  }
  for(const source of dragon.meshes)if(source!==dragon.body){
   const geometry=this.referenceGeometry(source,source.geometry),mapping=Uint32Array.from({length:geometry.attributes.position.count},(_,i)=>i);
   this.addEntry({name:'Ink_'+source.name,geometry,profile:{toneRange:[.75,.95],geometryInfluence:0,reserveStrength:0,strokes:false},kind:'skin',source,sourceGeometry:source.geometry,mapping});
  }
  const originalBody=this.referenceGeometry(dragon.body,dragon.body.userData.originalGeometry);
  this.addEntry({name:'Ink_stretch_comparison',geometry:originalBody,profile:bodyProfile,inkRole:'body',kind:'skin',source:dragon.body,sourceGeometry:dragon.body.userData.originalGeometry,mapping:Uint32Array.from({length:originalBody.attributes.position.count},(_,i)=>i),variant:'full'});
  study.traverse(m=>{if(m.isMesh){m.geometry.dispose();}});authoredMesh.geometry.dispose();authoredMesh.material.dispose();bodyReference.dispose();
  this.bindSectionEdges();this.syncMiddle(true);this.syncMane();this.flames=new InkFlame(this);this.update(0);
 }
 referenceGeometry(source,geometry){
  const result=geometry.clone(),record=this.dragon.mane.geometryRecords.find(r=>r.geometry===geometry);
  if(record){result.setAttribute('position',new THREE.BufferAttribute(record.originalP.slice(),3));result.setAttribute('normal',new THREE.BufferAttribute(record.originalN.slice(),3));}
  return result;
 }
 subset(source,ids){
  const unique=[...new Set(ids)],lookup=new Map(unique.map((v,i)=>[v,i])),geometry=new THREE.BufferGeometry();
  for(const name of['position','normal']){
   const a=source.attributes[name],values=new Float32Array(unique.length*3);unique.forEach((v,i)=>{values[i*3]=a.getX(v);values[i*3+1]=a.getY(v);values[i*3+2]=a.getZ(v);});geometry.setAttribute(name,new THREE.BufferAttribute(values,3));
  }
  geometry.setIndex(ids.map(v=>lookup.get(v)));return{geometry,mapping:Uint32Array.from(unique)};
 }
 addEntry(entry){
  const mesh=new THREE.Mesh(entry.geometry,new THREE.MeshStandardMaterial({color:'#aeb9b5',side:THREE.DoubleSide,roughness:.94}));mesh.name=entry.name;mesh.frustumCulled=false;mesh.userData.inkProfile=entry.profile;this.root.add(mesh);
  this.ink.register(mesh,{flow:new THREE.Vector3(0,0,1),reserveDirection:new THREE.Vector3(0,-1,0),reserveStrength:.48});
  const record=this.ink.records.find(r=>r.mesh===mesh);entry.mesh=mesh;entry.record=record;entry.referencePosition=mesh.geometry.attributes.position.array.slice();entry.referenceNormal=mesh.geometry.attributes.normal.array.slice();
  mesh.geometry.setAttribute('inkRestPosition',new THREE.Float32BufferAttribute(entry.referencePosition.slice(),3));mesh.geometry.setAttribute('inkRestNormal',new THREE.Float32BufferAttribute(entry.referenceNormal.slice(),3));
  const material=record.material;
  if(entry.inkRole==='body'||entry.inkRole==='wing'||entry.kind==='loft'){
   const wing=entry.inkRole==='wing';
   material.uniforms.uBaseWash={value:wing?.57:entry.kind==='loft'?.72:.70};
   if(!wing){
    material.uniforms.uToneRange.value.set(.12,.43);
    material.uniforms.uCoherentInk={value:.13};
    material.fragmentShader=material.fragmentShader.replace('pigment*=.94+.12*pooling;',`
      float dragging = movingInkFbm(p,paintNormal,vec3(0,0,1),vec3(28.,29.,3.6),vec3(4.2,6.1,7.7));
      float inkField = smoothstep(.39,.68,dragging);
      pigment *= .76+.26*pooling+inkField*.56;
      pigment += smoothstep(.51,.74,wash)*inkField*.14;
      float dryLine = smoothstep(.55,.72,fbm(p*vec3(174.,159.,14.)+vec3(7.,4.,2.)));
      pigment *= 1.-dryLine*inkField*.24;`);
   }
   if(record.brush){
    // The proxy mesh vertices are already world-space. Brush footprints are
    // authored in model units and need the same world scale as the model.
    record.brush.material.uniforms.uScale={value:this.ink.shared.uScale.value};
    record.brush.material.uniforms.uStrokeStrength={value:wing?.40:.54};
   }
  }
  material.vertexShader='attribute vec3 inkRestPosition;\nattribute vec3 inkRestNormal;\n'+material.vertexShader;
  material.vertexShader=material.vertexShader.replace('vPaint = (position - uCenter) * uObjectScale;','vPaint = (inkRestPosition - uCenter) * uObjectScale;').replace('vFormNormal=normal;','vFormNormal=inkRestNormal;');
  if(entry.kind==='mane'||entry.kind==='skin'&&entry.source===this.dragon.body){
   const values=new Float32Array(mesh.geometry.attributes.position.count*2);
   if(entry.kind==='skin'){
    const attribute=entry.sourceGeometry.attributes.aMane;
    for(let i=0;i<entry.mapping.length;i++){
     values[i*2]=attribute.getY(entry.mapping[i]);
     values[i*2+1]=this.dragon.headZ-entry.referencePosition[i*3+2];
    }
   }else{
    const flex=entry.batch.geometry.attributes.aOriginalFlex;
    for(let i=0;i<values.length/2;i++){
     values[i*2]=flex.getX(i%flex.count);
     values[i*2+1]=-entry.referencePosition[i*3+2];
    }
   }
   mesh.geometry.setAttribute('aManePaint',new THREE.BufferAttribute(values,2));
   installManePigment(material,this.maneTime,this.maneLoad);
  }
  if(record.brush)this.bindBrush(entry);
  if(entry.inkRole==='wing')this.paintWingLayers(entry);
  if(entry.inkRole==='body'||entry.kind==='loft')this.blendInkAtJoins(entry);
  this.entries.push(entry);return entry;
 }
 paintWingLayers(entry){
  const {mesh,record,sourceGeometry,mapping,referencePosition}=entry;
  const joints=sourceGeometry.attributes.skinIndex,weights=sourceGeometry.attributes.skinWeight;
  const featherBones=this.dragon.body.skeleton.bones.map(bone=>/^DEF_feather_/.test(bone.name)?1:0);
  const values=new Float32Array(mapping.length*3);
  for(let i=0;i<mapping.length;i++){
   const source=mapping[i],x=Math.abs(referencePosition[i*3]),z=referencePosition[i*3+2];
   let primaries=0;
   for(let j=0;j<4;j++)primaries+=featherBones[joints.getComponent(source,j)]*weights.getComponent(source,j);
   const span=smooth(.062,.294,x),shoulder=.249-.137*span;
   values[i*3]=span;
   values[i*3+1]=primaries;
   values[i*3+2]=Math.max(0,shoulder-z);
  }
  mesh.geometry.setAttribute('aFoilPaint',new THREE.BufferAttribute(values,3));
  const material=record.material,layer={value:.5},side=entry.name==='Ink_right'?1:-1;
  material.uniforms.uFoilLayer=layer;
  const previous=mesh.onBeforeRender;
  mesh.onBeforeRender=(renderer,scene,camera,geometry,activeMaterial,group)=>{
   previous.call(mesh,renderer,scene,camera,geometry,activeMaterial,group);
   if(activeMaterial!==material)return;
   const frame=this.dragon.sampleFrame(.235);
   this.foilAxis.copy(frame.n).transformDirection(this.dragon.root.matrixWorld);
   this.foilEye.setFromMatrixPosition(camera.matrixWorld)
    .sub(this.p.copy(frame.p).applyMatrix4(this.dragon.root.matrixWorld)).normalize();
   layer.value=.5-.5*this.foilEye.dot(this.foilAxis)*side;
  };
  material.vertexShader='attribute vec3 aFoilPaint;varying vec3 vFoilPaint;\n'+material.vertexShader;
  material.vertexShader=material.vertexShader.replace('void main() {','void main() {vFoilPaint=aFoilPaint;');
  material.fragmentShader='varying vec3 vFoilPaint;uniform float uFoilLayer;\n'+material.fragmentShader;
  material.fragmentShader=material.fragmentShader.replace('pigment = clamp(pigment * uDensity, 0.0, 1.6);',/* glsl */`
   {
   // Separate the inner coverts from the long primary feathers. Rest span
   // and feather weights keep the pale washes attached through the stroke.
   float span=vFoilPaint.x,chord=vFoilPaint.z;
   float flightFan=smoothstep(.16,.44,span)*(.54+.46*vFoilPaint.y);
   float farWash=(.27+.54*uFoilLayer)*flightFan;
   float foilGrain=fbm(vec3(span*12.,chord*43.,vFoilPaint.y*4.7));
   float coverts=smoothstep(.014,.034,chord)*(1.-smoothstep(.067,.102,chord));
   float opening=flightFan*coverts*(.46+.54*smoothstep(.26,.64,foilGrain));
   float shafts=smoothstep(.59,.83,fbm(vec3(span*25.,chord*11.,vFoilPaint.y*6.5)));
   pigment*=1.-farWash*.36-opening*.23;
   pigment+=flightFan*shafts*.052;
   ridgePaper=max(ridgePaper,opening*(.38+.25*uFoilLayer)+flightFan*shafts*.10);
   }
   pigment = clamp(pigment * uDensity, 0.0, 1.6);
  `);
  material.needsUpdate=true;
 }
 blendInkAtJoins(entry){
  const g=entry.mesh.geometry;
  const amount=new Float32Array(g.attributes.position.count);
  if(entry.kind==='loft'){
   for(let i=0;i<amount.length;i++){
    const u=entry.params[i].u;
    amount[i]=smooth(.001,.035,Math.min(u,1-u)*entry.referenceLength);
   }
  }else{
   const source=entry.sourceGeometry.attributes.aGrowth;
   const [trunk,tail]=this.dragon.data.gaps;
   const planes=[[trunk.frontCutZ],[trunk.rearCutZ,tail.frontCutZ],[tail.rearCutZ]];
   for(let i=0;i<amount.length;i++){
    const z=entry.referencePosition[i*3+2],zone=source.getX(entry.mapping[i]);
    amount[i]=smooth(.001,.035,Math.min(...planes[zone].map(plane=>Math.abs(z-plane))));
   }
  }
  const attr=new THREE.BufferAttribute(amount,1);
  g.setAttribute('inkJoinBlend',attr);
  const m=entry.record.material;
  m.vertexShader='attribute float inkJoinBlend; varying float vInkJoinBlend;\n'+m.vertexShader;
  m.vertexShader=m.vertexShader.replace('void main() {','void main() { vInkJoinBlend=inkJoinBlend;');
  m.fragmentShader='varying float vInkJoinBlend;\n'+m.fragmentShader;
  m.fragmentShader=m.fragmentShader.replace('float reflectance=exp(-pigment*3.1);',`
    float joiningWash = mix(.105,.35,smoothstep(-.60,.80,normalize(vFormNormal).y))*uDensity;
    pigment = mix(joiningWash,pigment,vInkJoinBlend);
    paperReserve *= vInkJoinBlend;
    float reflectance=exp(-pigment*3.1);`);
  const brush=entry.record.brush;
  if(!brush)return;
  const brushAmount=new Float32Array(entry.attachments.length);
  const coverage=new THREE.InstancedBufferAttribute(brushAmount,1);
  brush.mesh.geometry.setAttribute('aJoinBlend',coverage);
  const brushMat=brush.material;
  brushMat.vertexShader='attribute float aJoinBlend; varying float vInkJoinBlend;\n'+brushMat.vertexShader;
  brushMat.vertexShader=brushMat.vertexShader.replace('void main(){','void main(){vInkJoinBlend=aJoinBlend;');
  brushMat.fragmentShader='varying float vInkJoinBlend;\n'+brushMat.fragmentShader;
  brushMat.fragmentShader=brushMat.fragmentShader.replace(
   'vec4(deposit*uInkStorageScale,lift*uInkStorageScale,0.0,1.0)',
   'vec4(deposit*uInkStorageScale*vInkJoinBlend,lift*uInkStorageScale*vInkJoinBlend,0.0,1.0)');
  this.updateJoinCoverage(entry);
 }
 updateJoinCoverage(entry){
  const brush=entry.record.brush,amount=entry.mesh.geometry.attributes.inkJoinBlend;
  if(!brush||!amount)return;
  const coverage=brush.mesh.geometry.attributes.aJoinBlend;
  for(let i=0;i<coverage.count;i++){
   const {ids:[a,b,c],bary:[x,y,z]}=entry.attachments[i];
   coverage.setX(i,amount.getX(a)*x+amount.getX(b)*y+amount.getX(c)*z);
  }
  coverage.needsUpdate=true;
 }
 bindSectionEdges(){
  const caps=this.entries.filter(entry=>entry.variant==='cap');
  this.sectionEdges=this.dragon.sections.map((section,sectionIndex)=>{
   const bindings={};
   for(const [end,offset] of [['front',0],['rear',1]]){
    const plane=section.data[end+'CutZ'],candidates=[];
    for(const cap of caps){
     const growth=cap.sourceGeometry.attributes.aGrowth;
     for(let vertex=0;vertex<cap.mapping.length;vertex++){
      const i=vertex*3,z=cap.referencePosition[i+2];
      if(Math.abs(z-plane)<.00002&&growth.getX(cap.mapping[vertex])===sectionIndex+offset){
       candidates.push({cap,vertex});
      }
     }
    }
    bindings[end]=section[end].raw.map(profile=>{
     let closest=null,distance=.000025**2;
     for(const candidate of candidates){
      const i=candidate.vertex*3,p=candidate.cap.referencePosition;
      const d=(p[i]-profile.p[0])**2+(p[i+1]-profile.p[1])**2+(p[i+2]-profile.p[2])**2;
      if(d<distance){closest=candidate;distance=d;}
     }
     return closest;
    });
   }
   return bindings;
  });
 }
 removeEntry(entry){
  this.ink.unregister(entry.mesh);this.root.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh.material.dispose();this.entries=this.entries.filter(e=>e!==entry);
 }
 bindBrush(entry){
  const brush=entry.record.brush,geometry=brush.mesh.geometry,anchors=geometry.attributes.aAnchor,normals=geometry.attributes.aNormal,flows=geometry.attributes.aFlow,points=entry.mesh.geometry.attributes.position,index=entry.mesh.geometry.index;
  const hit={point:new THREE.Vector3(),distance:0,faceIndex:-1},triangle=new THREE.Triangle(),bary=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3(),flow=new THREE.Vector3();
  entry.attachments=[];
  for(let i=0;i<anchors.count;i++){
   const anchor=new THREE.Vector3().fromBufferAttribute(anchors,i);entry.record.analysis.bvh.closestPointToPoint(anchor,hit);const ids=[0,1,2].map(j=>index?index.getX(hit.faceIndex*3+j):hit.faceIndex*3+j);
   triangle.a.fromBufferAttribute(points,ids[0]);triangle.b.fromBufferAttribute(points,ids[1]);triangle.c.fromBufferAttribute(points,ids[2]);triangle.getBarycoord(anchor,bary);e1.copy(triangle.b).sub(triangle.a);e2.copy(triangle.c).sub(triangle.a);flow.fromBufferAttribute(flows,i);
   const aa=e1.dot(e1),bb=e1.dot(e2),cc=e2.dot(e2),d=aa*cc-bb*bb;
   entry.attachments.push({ids,bary:bary.toArray(),coeff:Math.abs(d)>1e-16?[(flow.dot(e1)*cc-flow.dot(e2)*bb)/d,(flow.dot(e2)*aa-flow.dot(e1)*bb)/d]:[1,0],anchor:anchor.toArray(),normal:new THREE.Vector3().fromBufferAttribute(normals,i).toArray(),flow:flow.toArray()});
  }
  geometry.setAttribute('aPaintAnchor',new THREE.InstancedBufferAttribute(anchors.array.slice(),3));geometry.setAttribute('aPaintNormal',new THREE.InstancedBufferAttribute(normals.array.slice(),3));geometry.setAttribute('aDynamicVisible',new THREE.InstancedBufferAttribute(new Float32Array(anchors.count).fill(1),1));
  const mat=brush.material;mat.vertexShader='attribute vec3 aPaintAnchor;attribute vec3 aPaintNormal;attribute float aDynamicVisible;varying vec3 vPaintAnchor;varying vec3 vPaintNormal;varying float vDynamicVisible;\n'+mat.vertexShader;
  mat.vertexShader=mat.vertexShader.replace('void main(){','void main(){vPaintAnchor=aPaintAnchor;vPaintNormal=aPaintNormal;vDynamicVisible=aDynamicVisible;');
  mat.fragmentShader='varying vec3 vPaintAnchor;varying vec3 vPaintNormal;varying float vDynamicVisible;\n'+mat.fragmentShader;
  mat.fragmentShader=mat.fragmentShader.replace('void main(){','void main(){if(vDynamicVisible<.5)discard;').replace('(vAnchor-uCenter)*uObjectScale','(vPaintAnchor-uCenter)*uObjectScale').replace('inkMassAmount(massPosition,vSurfaceNormal','inkMassAmount(massPosition,vPaintNormal').replace('dot(normalize(vSurfaceNormal),normalize(uReserveDirection))','dot(normalize(vPaintNormal),normalize(uReserveDirection))');mat.needsUpdate=true;
 }
 syncMiddle(force=false){
  const dragon=this.dragon,target=dragon.targetExtra;
  this.lastTarget=target;
  const hip=clamp(dragon.hipRatio*(1+target)-dragon.data.hipAnchor,0,target),targets=[hip,target-hip];
  dragon.sections.forEach((section,sectionIndex)=>{
   const requestedLength=section.b-section.a+targets[sectionIndex];
   const previous=this.middle[sectionIndex];
   if(!force&&previous&&requestedLength<=previous.referenceLength&&requestedLength>=previous.referenceLength*.46)return;
   if(previous)this.removeEntry(previous);
   // A modest amount of reserve keeps the same surface and brush instances
   // during a run of small gains. Rebuild only when a band changes scale.
   const referenceLength=Math.max(.16,requestedLength*1.24);
   const rings=Math.max(5,Math.ceil(referenceLength/.025)),radial=48,positions=[],normals=[],params=[],ringData=[];
   const n=new THREE.Vector3(),p=new THREE.Vector3();
   for(let i=0;i<=rings;i++){
    const boundary=i===0?'front':i===rings?'rear':null,refs=boundary?section[boundary].ring:Array.from({length:radial+1},(_,j)=>({angle:j/radial*TAU}));ringData.push({offset:params.length,angles:refs.map(r=>r.angle)});
    for(const ref of refs){
     const u=i/rings,theta=ref.angle,d=section.a+u*referenceLength,width=Math.min(.046,referenceLength*.4),wa=1-smooth(0,width,d-section.a),wb=1-smooth(0,width,section.a+referenceLength-d),wc=1-wa-wb;
     if(boundary){section[boundary].value(ref,'p',false,p);section[boundary].value(ref,'n',false,n).normalize();p.z=dragon.headZ-d;}
     else{
      const ar=section.front.ref(theta),br=section.rear.ref(theta),cr=section.middleProfile.ref(theta),a=section.front.value(ar,'p'),b=section.rear.value(br,'p'),c=section.middleProfile.value(cr,'p');p.copy(a).multiplyScalar(wa).addScaledVector(b,wb).addScaledVector(c,wc);p.z=dragon.headZ-d;
      section.front.value(ar,'n',false,a).normalize();section.rear.value(br,'n',false,b).normalize();section.middleProfile.value(cr,'n',false,c);c.z=0;c.normalize();n.copy(a).multiplyScalar(wa).addScaledVector(b,wb).addScaledVector(c,wc).normalize();
     }
     p.toArray(positions,positions.length);n.toArray(normals,normals.length);params.push({u,theta,boundary,ref});
    }
   }
   const indices=[];for(let i=0;i<rings;i++){const a=ringData[i],b=ringData[i+1];indices.push(...zipper(a.angles,b.angles,a.offset,b.offset));}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
   const entry=this.addEntry({name:'Ink_'+section.data.name,geometry,profile:{reserveStrength:.48,macroInk:.16,strokeProfile:{lengthRange:[.028,.080],frequency:.8}},kind:'loft',section,sectionIndex,params,referenceLength});
   const body=this.entries.find(e=>e.inkRole==='body'&&e.variant==='cap')?.record.material.uniforms;
   if(body){
    entry.record.material.uniforms.uCenter.value.copy(body.uCenter.value);
    entry.record.material.uniforms.uObjectScale.value=body.uObjectScale.value;
    const brush=entry.record.brush?.material.uniforms;
    if(brush){
     brush.uCenter.value.copy(body.uCenter.value);
     brush.uObjectScale.value=body.uObjectScale.value;
    }
   }
   this.middle[sectionIndex]=entry;
  });
 }
 syncMane(){
  for(const batch of this.dragon.mane.batches){
   const source=batch.mesh;if(!source)continue;let entry=this.mane.find(e=>e.batch===batch),required=Math.max(4,source.count);
   if(source.count===0){if(entry){entry.source=source;entry.mesh.visible=false;}continue;}
   if(entry&&entry.capacity>=required){entry.source=source;continue;}
   if(entry){this.removeEntry(entry);this.mane=this.mane.filter(e=>e!==entry);}
   const capacity=2**Math.ceil(Math.log2(required)),base=batch.geometry,positions=[],normals=[],indices=[],count=base.attributes.position.count;
   for(let copy=0;copy<capacity;copy++){
    for(let i=0;i<count;i++){positions.push(base.attributes.position.getX(i),base.attributes.position.getY(i),base.attributes.position.getZ(i)+this.dragon.headZ-this.dragon.a-copy*.052);normals.push(base.attributes.normal.getX(i),base.attributes.normal.getY(i),base.attributes.normal.getZ(i));}
    for(let i=0;i<base.index.count;i++)indices.push(base.index.getX(i)+copy*count);
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
   entry=this.addEntry({name:'Ink_original_mane',geometry,profile:{strokes:false,geometryInfluence:0,toneRange:[.18,.65],reserveStrength:.25,coherentInk:.8},kind:'mane',batch,source,capacity});entry.record.material.uniforms.uCenter.value.set(0,-.05,0);entry.record.material.uniforms.uObjectScale.value=1;this.mane.push(entry);
  }
 }
 frameAt(distance,out){
  const field=this.dragon.field,count=field.curveCount,data=field.curveArray,length=field.shared.uGrowthLength.value,f=clamp(distance/length)*(count-1),i=Math.floor(f),j=Math.min(count-1,i+1),w=f-i;
  for(let row=0;row<3;row++){const a=(row*count+i)*4,b=(row*count+j)*4;for(let k=0;k<3;k++)out[row*3+k]=data[a+k]+(data[b+k]-data[a+k])*w;}
  let x=out[3],y=out[4],z=out[5],inverse=1/Math.max(Math.hypot(x,y,z),1e-10);x*=inverse;y*=inverse;z*=inverse;out[3]=x;out[4]=y;out[5]=z;
  let nx=out[6],ny=out[7],nz=out[8],dot=nx*x+ny*y+nz*z;nx-=x*dot;ny-=y*dot;nz-=z*dot;inverse=1/Math.max(Math.hypot(nx,ny,nz),1e-10);nx*=inverse;ny*=inverse;nz*=inverse;out[6]=nx;out[7]=ny;out[8]=nz;
  out[9]=ny*z-nz*y;out[10]=nz*x-nx*z;out[11]=nx*y-ny*x;
  if(distance<0||distance>length){const excess=distance<0?distance:distance-length;out[0]+=x*excess;out[1]+=y*excess;out[2]+=z*excess;}
 }
 warp(x,y,z,nx,ny,nz,zone,attach,anchor,outP,outN){
  const d=this.dragon,shift=d.shift(zone),s=d.headZ-z;let distance=s+shift;
  if(d.method==='stretch'){const a=d.sections[0],b=d.sections[1];distance=s+d.hipExtra*clamp((s-a.a)/(a.b-a.a))+(d.extra-d.hipExtra)*clamp((s-b.a)/(b.b-b.a));if(s>a.a&&s<a.b)nz/=1+d.hipExtra/(a.b-a.a);if(s>b.a&&s<b.b)nz/=1+(d.extra-d.hipExtra)/(b.b-b.a);}
  this.frameAt(distance,this.f);const f=this.f;
  let px=f[0]+f[6]*x+f[9]*y,py=f[1]+f[7]*x+f[10]*y,pz=f[2]+f[8]*x+f[11]*y;
  let vx=f[6]*nx+f[9]*ny-f[3]*nz,vy=f[7]*nx+f[10]*ny-f[4]*nz,vz=f[8]*nx+f[11]*ny-f[5]*nz;
  if(attach>1e-5){this.frameAt(anchor+shift,this.g);const g=this.g,ds=s-anchor;px+=(g[0]+g[6]*x+g[9]*y+g[3]*ds-px)*attach;py+=(g[1]+g[7]*x+g[10]*y+g[4]*ds-py)*attach;pz+=(g[2]+g[8]*x+g[11]*y+g[5]*ds-pz)*attach;vx+=(g[6]*nx+g[9]*ny-g[3]*nz-vx)*attach;vy+=(g[7]*nx+g[10]*ny-g[4]*nz-vy)*attach;vz+=(g[8]*nx+g[11]*ny-g[5]*nz-vz)*attach;}
  outP.set(px,py,pz);outN.set(vx,vy,vz).normalize();
 }
 updateSkin(entry,cache){
  const source=entry.source,g=entry.sourceGeometry,a=g.attributes,positions=entry.mesh.geometry.attributes.position,normals=entry.mesh.geometry.attributes.normal,weights=a.skinWeight,joints=a.skinIndex,params=a.aGrowth;
  let state=cache.get(g);
  if(!state){
   const matrices=new Float64Array(source.skeleton.bones.length*16),m=new THREE.Matrix4(),worldNormal=new THREE.Matrix3().getNormalMatrix(source.matrixWorld);source.skeleton.update();
   for(let i=0;i<source.skeleton.bones.length;i++){m.fromArray(source.skeleton.boneMatrices,i*16).premultiply(source.bindMatrixInverse).multiply(source.bindMatrix);m.toArray(matrices,i*16);}
   state={matrices,p:new Float32Array(a.position.count*3),n:new Float32Array(a.position.count*3),done:new Uint8Array(a.position.count),worldNormal};cache.set(g,state);
  }
  const outP=this.p,outN=this.n,ms=state.matrices;
  for(let index=0;index<entry.mapping.length;index++){
   const i=entry.mapping[index],k=i*3;
   if(!state.done[i]){
    const x=a.position.getX(i),y=a.position.getY(i),z=a.position.getZ(i),nx=a.normal.getX(i),ny=a.normal.getY(i),nz=a.normal.getZ(i);let px=0,py=0,pz=0,vx=0,vy=0,vz=0;
    for(let j=0;j<4;j++){const w=weights.getComponent(i,j);if(w<1e-7)continue;const n=joints.getComponent(i,j)*16;px+=(ms[n]*x+ms[n+4]*y+ms[n+8]*z+ms[n+12])*w;py+=(ms[n+1]*x+ms[n+5]*y+ms[n+9]*z+ms[n+13])*w;pz+=(ms[n+2]*x+ms[n+6]*y+ms[n+10]*z+ms[n+14])*w;vx+=(ms[n]*nx+ms[n+4]*ny+ms[n+8]*nz)*w;vy+=(ms[n+1]*nx+ms[n+5]*ny+ms[n+9]*nz)*w;vz+=(ms[n+2]*nx+ms[n+6]*ny+ms[n+10]*nz)*w;}
    this.warp(px,py,pz,vx,vy,vz,params.getX(i),params.getY(i),params.getZ(i),outP,outN);outP.applyMatrix4(source.matrixWorld);outN.applyMatrix3(state.worldNormal).normalize();outP.toArray(state.p,k);outN.toArray(state.n,k);state.done[i]=1;this.updatedVertices++;
   }
   positions.setXYZ(index,state.p[k],state.p[k+1],state.p[k+2]);normals.setXYZ(index,state.n[k],state.n[k+1],state.n[k+2]);
  }
 }
 updateLoft(entry){
  const section=entry.section,length=section.b-section.a+section.extra,prefix=entry.sectionIndex?this.dragon.hipExtra:0,positions=entry.mesh.geometry.attributes.position,normals=entry.mesh.geometry.attributes.normal,rest=entry.mesh.geometry.attributes.inkRestPosition;
  for(let i=0;i<entry.params.length;i++){
   const {u,theta,boundary,ref}=entry.params[i];
   if(boundary){section[boundary].value(ref,'p',true,this.p);section[boundary].value(ref,'n',true,this.n).normalize();if(boundary==='rear')this.p.z-=section.extra;const x=this.p.x,y=this.p.y,z=this.p.z,nx=this.n.x,ny=this.n.y,nz=this.n.z;rest.setXYZ(i,x,y,z-prefix);this.warp(x,y,z,nx,ny,nz,entry.sectionIndex,0,0,this.p,this.n);positions.setXYZ(i,this.p.x,this.p.y,this.p.z);normals.setXYZ(i,this.n.x,this.n.y,this.n.z);continue;}
   const distance=section.a+u*length,p=section.surface(distance,theta),s=section.profileSamples,x=theta/TAU*section.radial,j=Math.min(section.radial-1,Math.floor(x)),f=x-j,[wa,wb]=section._mixAt(distance),wc=1-wa-wb;
   const a=s[j],b=s[j+1],nx=(a.normalA.x+(b.normalA.x-a.normalA.x)*f)*wa+(a.normalB.x+(b.normalB.x-a.normalB.x)*f)*wb+(a.nc.x+(b.nc.x-a.nc.x)*f)*wc,ny=(a.normalA.y+(b.normalA.y-a.normalA.y)*f)*wa+(a.normalB.y+(b.normalB.y-a.normalB.y)*f)*wb+(a.nc.y+(b.nc.y-a.nc.y)*f)*wc,nz=(a.normalA.z+(b.normalA.z-a.normalA.z)*f)*wa+(a.normalB.z+(b.normalB.z-a.normalB.z)*f)*wb;
   this.warp(p.x,p.y,p.z,nx,ny,nz,entry.sectionIndex,0,0,this.p,this.n);positions.setXYZ(i,this.p.x,this.p.y,this.p.z);normals.setXYZ(i,this.n.x,this.n.y,this.n.z);
   rest.setXYZ(i,p.x,p.y,p.z-prefix);
  }
  const world=this.dragon.root.matrixWorld,normalMatrix=new THREE.Matrix3().getNormalMatrix(world);
  for(let i=0;i<positions.count;i++){this.p.fromBufferAttribute(positions,i).applyMatrix4(world);this.n.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();positions.setXYZ(i,this.p.x,this.p.y,this.p.z);normals.setXYZ(i,this.n.x,this.n.y,this.n.z);}
  // Drive both sides of the boundary from the rendered, skinned cap.
  // Interpolating joint weights during clipping can differ from profile skin
  // weights near the hind limbs. Both materials now share the actual edge.
  const edges=this.sectionEdges[entry.sectionIndex],other=new THREE.Vector3(),otherNormal=new THREE.Vector3();
  const join=entry.mesh.geometry.attributes.inkJoinBlend;
  for(let i=0;i<entry.params.length;i++){
   const {boundary,ref,u}=entry.params[i];
   join.setX(i,smooth(.001,.035,Math.min(u,1-u)*length));
   if(!boundary)continue;
   const a=edges[boundary][ref.i],b=edges[boundary][ref.j];
   if(!a||!b)continue;
   const at=a.cap.mesh.geometry.attributes,bt=b.cap.mesh.geometry.attributes;
   this.p.fromBufferAttribute(at.position,a.vertex).lerp(other.fromBufferAttribute(bt.position,b.vertex),ref.t);
   this.n.fromBufferAttribute(at.normal,a.vertex).lerp(otherNormal.fromBufferAttribute(bt.normal,b.vertex),ref.t).normalize();
   positions.setXYZ(i,this.p.x,this.p.y,this.p.z);
   normals.setXYZ(i,this.n.x,this.n.y,this.n.z);
  }
  join.needsUpdate=true;this.updateJoinCoverage(entry);
  rest.needsUpdate=true;this.updatedVertices+=entry.params.length;
 }
 updateMane(entry){
  const source=entry.source,base=entry.batch.geometry,p=base.attributes.position,n=base.attributes.normal,flex=base.attributes.aOriginalFlex,flutter=source.geometry.attributes.aFlutter,positions=entry.mesh.geometry.attributes.position,normals=entry.mesh.geometry.attributes.normal,rest=entry.mesh.geometry.attributes.inkRestPosition,restNormals=entry.mesh.geometry.attributes.inkRestNormal,count=p.count;
  entry.mesh.geometry.setDrawRange(0,source.count*base.index.count);entry.mesh.visible=source.visible;
  for(let copy=0;copy<source.count;copy++){
   source.getMatrixAt(copy,this.pm);this.nm.getNormalMatrix(this.pm);const restMatrices=source.userData.inkRestMatrices;if(restMatrices){this.rm.fromArray(restMatrices,copy*16);this.rnm.getNormalMatrix(this.rm);}
   this.maneFlow.set(flutter.getX(copy),flutter.getY(copy),flutter.getZ(copy),flutter.getW(copy));
   for(let i=0;i<count;i++){
    maneAngles(flex.getX(i),this.maneFlow,this.maneAngle);
    const {x,y}=this.maneAngle,px=p.getX(i),py=p.getY(i),pz=p.getZ(i),nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i),index=copy*count+i;
    bendManeVector(this.p,px,py,pz,x,y).applyMatrix4(this.pm).applyMatrix4(source.matrixWorld);
    bendManeVector(this.n,nx,ny,nz,x,y).applyMatrix3(this.nm).transformDirection(source.matrixWorld);
    positions.setXYZ(index,this.p.x,this.p.y,this.p.z);normals.setXYZ(index,this.n.x,this.n.y,this.n.z);
    if(restMatrices){this.p.set(px,py,pz).applyMatrix4(this.rm);this.n.set(nx,ny,nz).applyMatrix3(this.rnm).normalize();rest.setXYZ(index,this.p.x,this.p.y,this.p.z);restNormals.setXYZ(index,this.n.x,this.n.y,this.n.z);}
   }
  }
  rest.needsUpdate=restNormals.needsUpdate=true;this.updatedVertices+=source.count*count;
 }
 updateBrush(entry){
  const brush=entry.record.brush;if(!brush)return;
  const a=brush.mesh.geometry.attributes,positions=entry.mesh.geometry.attributes.position,normals=entry.mesh.geometry.attributes.normal,p0=new THREE.Vector3(),p1=new THREE.Vector3(),p2=new THREE.Vector3(),n=new THREE.Vector3(),flow=new THREE.Vector3();
  const support=entry.stableProjection?a.aDynamicVisible:null;
  entry.attachments.forEach((s,i)=>{
   const [j,k,l]=s.ids,[x,y,z]=s.bary;p0.fromBufferAttribute(positions,j);p1.fromBufferAttribute(positions,k);p2.fromBufferAttribute(positions,l);this.p.copy(p0).multiplyScalar(x).addScaledVector(p1,y).addScaledVector(p2,z);
   this.n.fromBufferAttribute(normals,j).multiplyScalar(x).addScaledVector(n.fromBufferAttribute(normals,k),y).addScaledVector(n.fromBufferAttribute(normals,l),z).normalize();p1.sub(p0);p2.sub(p0);flow.copy(p1).multiplyScalar(s.coeff[0]).addScaledVector(p2,s.coeff[1]).normalize();
   if(support){
    // The bent face tangent can diverge from the interpolated normal.
    // The brush volume needs an orthogonal frame in the current pose.
    const dot=flow.dot(this.n);
    support.setX(i,1-smooth(.36,.84,Math.abs(dot)));
    flow.addScaledVector(this.n,-dot);
    if(flow.lengthSq()<1e-8){
     const useX=Math.abs(this.n.z)>.9;
     flow.set(useX?1:0,0,useX?0:1).addScaledVector(this.n,-(useX?this.n.x:this.n.z));
    }
    flow.normalize();
   }
   a.aAnchor.setXYZ(i,this.p.x,this.p.y,this.p.z);a.aNormal.setXYZ(i,this.n.x,this.n.y,this.n.z);a.aFlow.setXYZ(i,flow.x,flow.y,flow.z);
   if(entry.kind==='loft'){
    const rest=entry.mesh.geometry.attributes.inkRestPosition,p0=this.p.fromBufferAttribute(rest,j).multiplyScalar(x).addScaledVector(n.fromBufferAttribute(rest,k),y).addScaledVector(n.fromBufferAttribute(rest,l),z);a.aPaintAnchor.setXYZ(i,p0.x,p0.y,p0.z);
   }
  });
  for(const name of['aAnchor','aNormal','aFlow','aPaintAnchor'])a[name].needsUpdate=true;
  if(support)support.needsUpdate=true;
 }
 update(dt){
  this.frame++;this.updatedVertices=0;this.dragon.root.updateMatrixWorld(true);
  if(Math.abs(this.lastTarget-this.dragon.targetExtra)>1e-5){if(!this.rebuildAt)this.rebuildAt=performance.now()+180;if(performance.now()>=this.rebuildAt){this.syncMiddle();this.rebuildAt=0;}}
  this.syncMane();const cache=new Map();
  for(const e of this.entries){
   const visible=e.kind==='skin'?(e.variant==='full'?this.dragon.method==='stretch':e.variant==='cap'?this.dragon.method==='loft':true):e.kind==='loft'?this.dragon.method==='loft':e.source.visible&&this.dragon.method==='loft';
   e.mesh.visible=visible;if(!visible)continue;
   if(e.kind==='skin')this.updateSkin(e,cache);else if(e.kind==='loft')this.updateLoft(e);else this.updateMane(e);
   e.mesh.geometry.attributes.position.needsUpdate=e.mesh.geometry.attributes.normal.needsUpdate=true;
   const brush=e.record.brush?.material.uniforms;
   if(brush)brush.uScale.value=this.ink.shared.uScale.value/Math.max(this.dragon.root.scale.x,.001);
   this.updateBrush(e);
  }
  this.ink.advance(dt);
  this.maneTime.value=this.dragon.mane.flow.time;this.maneLoad.value=this.dragon.mane.flow.pigment;
  this.flames?.update(dt);
 }
 render(scene,camera){
  const visible=this.dragon.root.visible;this.dragon.root.visible=false;this.root.visible=true;
  try{this.ink.render(scene,camera);}finally{this.root.visible=false;this.dragon.root.visible=visible;}
 }
 resize(){const s=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.ink.setSize(s.x,s.y);}
 inspect(){return{renderer:'shared InkWashRenderer 0.3',source:'outputs/ink-brush-lab-v1/src',dynamicVertices:this.updatedVertices,surfaceMeshes:this.entries.length,surfaceStrokeCount:this.ink.records.reduce((s,r)=>s+(r.brush?.count||0),0),inkTime:this.ink.time,inkFlow:this.ink.parameters.inkFlow,sharedBrushAtlas:!!this.ink.sharedResources.brushAtlas,inkFlameVolumes:this.flames?.count||0,inkFlameTime:this.flames?.time||0};}
}
