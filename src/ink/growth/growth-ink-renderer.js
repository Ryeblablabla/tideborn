import * as THREE from 'three';
import {InkWashRenderer} from '../shared-ink/ink-wash.js';
import {loadSharedInkResources} from '../shared-ink/shared-ink-resources.js';
import {createYinglongStudy} from '../shared-ink/yinglong-study.js';
import {classifyYinglongWings} from '../shared-ink/wing-partition.js';
import {zipper} from './growth-utils.js';
import {InkFlame} from './ink-flame.js';
import {bendManeVector, installManePigment, maneAngles} from './mane-flow.js';
import {maneRidgeColumns, updateManeRidge} from './original-mane.js';
import {paintWaterHui} from './water-hui-ink.js';
import {ChapterWingGrowthInk} from './chapter-wing-growth-ink.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const TAU=Math.PI*2;
const skinAttributes = [['position', 3], ['normal', 3], ['skinWeight', 4], ['skinIndex', 4], ['aGrowth', 3]];
const vectorGetters = ['getX', 'getY', 'getZ'];

function packedArray(attribute, size) {
 return attribute.itemSize === size && !attribute.normalized && !attribute.isInterleavedBufferAttribute &&
  !attribute.isFloat16BufferAttribute ? attribute.array : null;
}

// Dynamic surface bridge. The shared ink renderer is used unchanged. Its input
// meshes carry the real, current deformed surface plus stable paint coordinates.
// Stamps keep their source triangle and barycentric coordinates, so animation
// does not leave the brush volumes behind in the bind pose.
export class GrowthInkRenderer {
 constructor(renderer,dragon,sharedInk=null){
  this.renderer=renderer;this.dragon=dragon;this.root=new THREE.Group();this.root.name='Shared_Ink_Dynamic_Surface';this.root.visible=false;
  this.ink=sharedInk||new InkWashRenderer(renderer,{outline:.55,outlineWidth:1.1,outlineDetail:.30,inkFlow:.68,inkFlowSpeed:.8});
  this.entries=[];this.middle=[];this.mane=[];this.maneRidges=[];this.frame=0;this.rebuildAt=0;this.lastTarget=NaN;this.updatedVertices=0;
  this.skinScratch = new WeakMap();
  this.anchorFrames = new Map();
  this.p=new THREE.Vector3();this.n=new THREE.Vector3();this.f=new Float64Array(12);this.g=new Float64Array(12);this.pm=new THREE.Matrix4();this.nm=new THREE.Matrix3();this.rm=new THREE.Matrix4();this.rnm=new THREE.Matrix3();
  this.maneFlow=new THREE.Vector4();this.maneAngle=new THREE.Vector2();this.maneTime={value:0};this.maneLoad={value:0};
  this.foilEye=new THREE.Vector3();this.foilAxis=new THREE.Vector3();
  this.gatePaper={value:0};
  this.chapterShoulderInk={value:0};
  this.chapterWingOpening={value:1};
  this.chapterWingBristle={value:0};
  this.chapterInkTrail={value:new THREE.Vector2()};
  this.chapterWingGrowthInk=new ChapterWingGrowthInk();
 }
 async initialize(){
  this.ink.setSharedResources(await loadSharedInkResources());
  if(this.dragon.wingless){this.initializeWingless();return;}
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
  const bodyVertices=new Set(buckets.body);
  for(const entry of this.entries){
   if(entry.inkRole!=='wing')continue;
   let root=-1,nearest=Infinity;
   for(let i=0;i<entry.mapping.length;i++){
    const vertex=entry.mapping[i];
    if(!bodyVertices.has(vertex))continue;
    const x=Math.abs(p.getX(vertex))-.083,y=p.getY(vertex)+.008,z=p.getZ(vertex)-.233;
    const distance=x*x+y*y+z*z;
    if(distance<nearest){root=i;nearest=distance;}
   }
   // The corresponding body triangle and wing share this skinned vertex.
   if(root>=0)entry.mesh.userData.chapterWingRoot=root;
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
 initializeWingless(){
  const dragon=this.dragon;
  for(const source of dragon.meshes){
   const sourceGeometry=source.geometry,geometry=this.referenceGeometry(source,sourceGeometry);
   const mapping=Uint32Array.from({length:geometry.attributes.position.count},(_,i)=>i);
   const variant=source===dragon.body?(dragon.method==='loft'?'cap':'full'):undefined;
   this.addEntry({name:'Ink_'+source.name,geometry,profile:{macroInk:.25,geometryInfluence:.78,
    reserveStrength:.43,strokeProfile:{frequency:.68}},inkRole:'body',kind:'skin',source,sourceGeometry,mapping,variant,
    stableProjection:true});
  }
  this.bindSectionEdges();this.syncMiddle(true);this.update(0);
 }
 referenceGeometry(source,geometry){
  const result=geometry.clone(),record=this.dragon.mane?.geometryRecords.find(r=>r.geometry===geometry);
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
  const mesh=new THREE.Mesh(entry.geometry,new THREE.MeshStandardMaterial({color:'#aeb9b5',side:THREE.DoubleSide,roughness:.94}));mesh.name=entry.name;mesh.frustumCulled=false;mesh.userData.inkProfile=entry.profile;mesh.userData.inkDragonSubject=true;this.root.add(mesh);
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
  if(this.dragon.wingless&&(entry.inkRole==='body'||entry.kind==='loft')&&this.dragon.stage>=2){
   const qiulong=this.dragon.stage===3;
   material.uniforms.uChapterPigment={value:0};
   material.fragmentShader='uniform float uChapterPigment;\n'+material.fragmentShader.replace(
    'float reflectance=exp(-pigment*3.1);',`
     float dryWash=smoothstep(.23,.77,wash);
     float headWash=smoothstep(.05,.38,inkRestHead);
     pigment=mix(pigment,pigment*${qiulong?'1.19':'0.88'}+${qiulong?'.025':'-.011'}*dryWash,uChapterPigment*headWash);
     paperReserve=max(paperReserve,${qiulong?'.08':'.13'}*uChapterPigment*dryWash*headWash);
     pigment=max(0.,pigment);
     float reflectance=exp(-pigment*3.1);`);
  }
  material.vertexShader='attribute vec3 inkRestPosition;\nattribute vec3 inkRestNormal;\n'+material.vertexShader;
  material.vertexShader=material.vertexShader.replace('vPaint = (position - uCenter) * uObjectScale;','vPaint = (inkRestPosition - uCenter) * uObjectScale;').replace('vFormNormal=normal;','vFormNormal=inkRestNormal;');
  if(material.uniforms.uChapterPigment){
   material.vertexShader='varying float inkRestHead;\n'+material.vertexShader.replace('void main() {','void main() { inkRestHead=inkRestPosition.z;');
   material.fragmentShader='varying float inkRestHead;\n'+material.fragmentShader;
  }
  if(entry.kind==='mane'||entry.kind==='maneRidge'||entry.kind==='skin'&&entry.source===this.dragon.body&&entry.sourceGeometry.attributes.aMane){
   const values=new Float32Array(mesh.geometry.attributes.position.count*2);
   if(entry.kind==='skin'){
    const attribute=entry.sourceGeometry.attributes.aMane;
    for(let i=0;i<entry.mapping.length;i++){
     values[i*2]=attribute.getY(entry.mapping[i]);
     values[i*2+1]=this.dragon.headZ-entry.referencePosition[i*3+2];
    }
   }else if(entry.kind==='mane'){
    const flex=entry.batch.geometry.attributes.aOriginalFlex;
    for(let i=0;i<values.length/2;i++){
     values[i*2]=flex.getX(i%flex.count);
     values[i*2+1]=-entry.referencePosition[i*3+2];
    }
   }else{
    for(let i=0;i<values.length/2;i++){
     const across=i%maneRidgeColumns/(maneRidgeColumns-1)*2-1;
     values[i*2]=.76*(1-Math.abs(across));
     values[i*2+1]=this.dragon.headZ-entry.referencePosition[i*3+2];
    }
   }
   mesh.geometry.setAttribute('aManePaint',new THREE.BufferAttribute(values,2));
   installManePigment(material,this.maneTime,this.maneLoad);
  }
  if(record.brush)this.bindBrush(entry);
  if(entry.inkRole==='wing')this.paintWingLayers(entry);
  if((entry.inkRole==='body'&&(!this.dragon.wingless||entry.variant==='cap'))||entry.kind==='loft')this.blendInkAtJoins(entry);
  if(this.dragon.eyes?.length===2)paintWaterHui(material,this.dragon.eyes,this.dragon.lip);
  if(!this.dragon.wingless&&(entry.inkRole==='body'||entry.inkRole==='wing'||entry.kind==='loft')){
   material.uniforms.uGatePaper=this.gatePaper;
   material.fragmentShader='uniform float uGatePaper;\n'+material.fragmentShader.replace(
    'float reflectance=exp(-pigment*3.1);',`
     if(uGatePaper>.001){
      float gateWashFacing=smoothstep(-.15,.63,dot(n,normalize(vec3(-.56,.82,.14))));
      float gateWashEdge=smoothstep(.35,.94,1.-abs(n.z));
      float gateWashGrain=smoothstep(.25,.75,fbm(p*vec3(28.,36.,9.)+vec3(7.1,4.1,3.)));
      float gateWashPaper=gateWashFacing*(.37+.63*gateWashGrain)*(.57+.43*gateWashEdge);
      pigment*=1.-.24*uGatePaper*gateWashPaper;
      paperReserve=max(paperReserve,.28*uGatePaper*gateWashPaper);
     }
     float reflectance=exp(-pigment*3.1);`);
  }
  if(!this.dragon.wingless&&(entry.inkRole==='body'||entry.inkRole==='wing')){
   this.paintChapterShoulder(material,entry.inkRole==='wing');
  }
  if((this.dragon.wingless&&this.dragon.stage===3&&entry.variant==='cap')
   ||(!this.dragon.wingless&&(entry.inkRole==='body'||entry.inkRole==='wing'))){
   this.paintChapterInkTrail(material,this.dragon.wingless);
   this.chapterWingGrowthInk.install(material,this.dragon.wingless);
  }
  this.entries.push(entry);return entry;
 }
 paintChapterInkTrail(material,outgoing){
  material.uniforms.uChapterInkTrail=this.chapterInkTrail;
  if(outgoing){
   material.vertexShader='varying vec3 vChapterShoulderRest;\n'+material.vertexShader.replace(
    'void main() {','void main() { vChapterShoulderRest=inkRestPosition;');
   material.fragmentShader='varying vec3 vChapterShoulderRest;\n'+material.fragmentShader;
  }
  material.fragmentShader='uniform vec2 uChapterInkTrail;\n'+material.fragmentShader;
  const stroke=outgoing?/* glsl */`
     float arrive=smoothstep(0.,.53,travel);
     float fade=1.-smoothstep(.35,.62,travel);
     vec2 center=mix(vec2(.014,.151),vec2(.044,.225),arrive);
     vec2 delta=vec2(span,rest.z)-center;
     float axis=delta.y-.65*delta.x;
     float washEdge=length(vec2(delta.x/.038,axis/.079));
     float upper=1.-smoothstep(.021,.074,abs(rest.y-.025));
     float wet=(1.-smoothstep(.28,1.04,washEdge+ragged))*upper*fade;
     pigment+=wet*load*(.24+.15*pooling);
     paperReserve*=1.-.34*wet*load;
  `:/* glsl */`
     float arrive=smoothstep(.15,.94,travel);
     float head=mix(.038,.294,arrive);
     float leading=rest.z-.248+.30*(span-.038);
     float across=1.-smoothstep(.014,.058,abs(leading)+ragged*.019);
     float tip=1.-smoothstep(.022,.083,abs(span-head));
     float laid=smoothstep(.008,.036,span)*(1.-smoothstep(head-.043,head-.014,span));
     float rise=smoothstep(.14,.34,travel);
     float fromRoot=1.-smoothstep(.03,.16,span);
     float upper=max(1.-smoothstep(.055,.115,abs(rest.y+.011)),smoothstep(.080,.145,span));
     float wet=across*upper*rise*(tip+.28*laid*fromRoot);
     pigment+=wet*load*(.24+.15*pooling);
     paperReserve*=1.-.38*wet*load;
     float dryDistance=abs(span-(head-.061));
     float dry=laid*across*upper*(1.-smoothstep(.009,.034,dryDistance))
       *smoothstep(.37,.67,wash)*smoothstep(.34,.72,travel)*load;
     pigment*=1.-.29*dry;
     paperReserve=max(paperReserve,.34*dry);
  `;
  material.fragmentShader=material.fragmentShader.replace('float reflectance=exp(-pigment*3.1);',/* glsl */`
    if(uChapterInkTrail.y>.001){
     vec3 rest=vChapterShoulderRest;
     float span=abs(rest.x);
     float travel=uChapterInkTrail.x, load=uChapterInkTrail.y;
     float ragged=.42*(wash-.5)+.24*(pooling-.5);
     ${stroke}
    }
    float reflectance=exp(-pigment*3.1);
  `);
 }
 paintChapterShoulder(material,wing){
  material.uniforms.uChapterShoulderInk=this.chapterShoulderInk;
  material.uniforms.uChapterWingOpening=this.chapterWingOpening;
  material.vertexShader='varying vec3 vChapterShoulderRest;\n'+material.vertexShader.replace(
   'void main() {','void main() { vChapterShoulderRest=inkRestPosition;');
  material.fragmentShader='varying vec3 vChapterShoulderRest; uniform float uChapterShoulderInk,uChapterWingOpening;\n'+material.fragmentShader;
  const featherEdge=wing?/* glsl */`
     float outward=mix(.073,.184,uChapterWingOpening);
     float travel=1.-smoothstep(.014,.048,abs(span-outward));
     float stroke=travel*(1.-smoothstep(.019,.064,abs(axis)))*smoothstep(.42,.70,wash);
     float dryReserve=stroke*smoothstep(.32,.62,uChapterWingOpening)*uChapterShoulderInk;
     pigment*=1.-.19*dryReserve;
     paperReserve=max(paperReserve,.24*dryReserve);
  `:'';
  material.fragmentShader=material.fragmentShader.replace('float reflectance=exp(-pigment*3.1);',/* glsl */`
    if(uChapterShoulderInk>.001){
     // Body and wing share the same bind-space mark at their attachment.
     float span=abs(vChapterShoulderRest.x);
     float axis=vChapterShoulderRest.z-.248+.30*(span-.038);
     vec2 shoulder=vec2((span-.038)/.065,axis/.057);
     float edge=length(shoulder)+.23*(wash-.5)+.14*(pooling-.5);
     float upper=1.-smoothstep(.038,.103,abs(vChapterShoulderRest.y+.008));
     float pool=(1.-smoothstep(.32,1.16,edge))*upper*uChapterShoulderInk;
     pigment+=pool*(.19+.16*pooling);
     paperReserve*=1.-.34*pool;
     ${featherEdge}
    }
    float reflectance=exp(-pigment*3.1);
  `);
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
  material.uniforms.uChapterWingBristle=this.chapterWingBristle;
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
  material.fragmentShader='varying vec3 vFoilPaint;uniform float uFoilLayer,uChapterWingBristle;\n'+material.fragmentShader;
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

   float nearBristle=uChapterWingBristle*(1.-smoothstep(.44,.54,uFoilLayer));
   if(nearBristle>.001){
    // Use the bind-space coverts to carry broad, tapered ink into the quills.
    float sweep=smoothstep(.12,.25,span)*(1.-smoothstep(.70,.89,span));
    float featherAcross=chord-mix(.022,.076,span);
    float wetEdge=noise3(vec3(span*19.,chord*142.,vFoilPaint.y*2.8));
    float raggedEdge=featherAcross+(wetEdge-.5)*.012;
    float brushWidth=.017+.010*sin(3.14159*span);
    float brushBody=1.-smoothstep(brushWidth*.52,brushWidth,abs(raggedEdge));
    float firstLoad=smoothstep(.14,.25,span)*(1.-smoothstep(.32,.43,span));
    float secondLoad=smoothstep(.36,.46,span)*(1.-smoothstep(.52,.63,span));
    float lastLoad=smoothstep(.56,.65,span)*(1.-smoothstep(.73,.86,span));
    float wetInk=nearBristle*sweep*brushBody*max(firstLoad,max(secondLoad,lastLoad));

    // A few interrupted bristle marks lift paper on the heel of the stroke.
    float fineBristle=noise3(vec3(span*11.,featherAcross*490.,8.2));
    float bristleBreak=noise3(vec3(span*45.,featherAcross*95.,3.1));
    float bristleEdge=smoothstep(.001,.008,raggedEdge)*
      (1.-smoothstep(.016,.025,raggedEdge));
    float flyingWhite=wetInk*bristleEdge*smoothstep(.49,.70,fineBristle)*
      smoothstep(.37,.64,bristleBreak);
    pigment+=wetInk*(.32+.09*wetEdge);
    pigment*=1.-.42*flyingWhite;
    ridgePaper*=1.-.72*wetInk;
    ridgePaper=max(ridgePaper,.57*flyingWhite);
   }
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
  if(!this.dragon.eyes?.length)m.fragmentShader=m.fragmentShader.replace('float reflectance=exp(-pigment*3.1);',`
    float joiningWash = mix(.105,.35,smoothstep(-.60,.80,normalize(vFormNormal).y))*uDensity;
    pigment = mix(joiningWash,pigment,vInkJoinBlend);
    paperReserve *= vInkJoinBlend;
    float reflectance=exp(-pigment*3.1);`);
  const brush=entry.record.brush;
  if(!brush)return;
  if(this.dragon.wingless&&this.dragon.stage>=2){
   // These surfaces do not use the mineral grain channel. Store the
   // receiver weight there so brush deposits fade before the cap/loft ID edge.
   m.fragmentShader=m.fragmentShader.replace(
    'vec4(reflectance,paperReserve,grain,1.0)',
    'vec4(reflectance,paperReserve,vInkJoinBlend,1.0)');
   brush.material.uniforms.tJoinReceiver={value:this.ink.target.texture};
   brush.material.fragmentShader='uniform sampler2D tJoinReceiver;\n'+brush.material.fragmentShader;
   brush.material.fragmentShader=brush.material.fragmentShader.replace(
    'gl_FragColor=vec4(deposit*uInkStorageScale,lift*uInkStorageScale,0.0,1.0);',`
    vec4 receiver=texture2D(tJoinReceiver,uv);
    float join=receiver.b/max(receiver.a,.00001);
    gl_FragColor=vec4(deposit*join*uInkStorageScale,lift*join*uInkStorageScale,0.0,1.0);`);
   return;
  }
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
  const coverage=brush?.mesh.geometry.attributes.aJoinBlend;
  if(!coverage||!amount)return;
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
 dispose(){
  for(const entry of this.entries.slice())this.removeEntry(entry);
  this.root.removeFromParent();
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
 prepareLength(extra){
  // Allocate both growth bands at the planned length without advancing
  // the current pose or changing the actor's active length.
  this.syncMiddle(false,extra);
 }
 syncMiddle(force=false,target=this.dragon.targetExtra){
  const dragon=this.dragon;
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
    if(dragon.wingless){
     const uniforms=entry.record.material.uniforms;
     uniforms.uBaseWash.value=body.uBaseWash.value;
     uniforms.uMacroInk.value=body.uMacroInk.value;
     uniforms.uReserveStrength.value=body.uReserveStrength.value;
     uniforms.uGeometryInfluence.value=body.uGeometryInfluence.value;
    }
    const brush=entry.record.brush?.material.uniforms;
    if(brush){
     brush.uCenter.value.copy(body.uCenter.value);
     brush.uObjectScale.value=body.uObjectScale.value;
    }
   }
   this.middle[sectionIndex]=entry;
   if(dragon.mane)this.syncManeRidge(section, sectionIndex, rings, referenceLength);
  });
 }
 syncManeRidge(section, sectionIndex, rows, length){
  if(this.maneRidges[sectionIndex])this.removeEntry(this.maneRidges[sectionIndex]);
  const columns=maneRidgeColumns, positions=[], normals=[], indices=[];
  for(let row=0;row<=rows;row++){
   for(let column=0;column<columns;column++){
    positions.push((column-2)*.008,-.037,this.dragon.headZ-section.a-row/rows*length);
    normals.push(0,1,0);
    if(row<rows&&column<columns-1){
     const i=row*columns+column;
     indices.push(i,i+1,i+columns,i+1,i+columns+1,i+columns);
    }
   }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setIndex(indices);
  const entry=this.addEntry({name:'Ink_mane_ridge_'+section.data.name,geometry,
   profile:{strokes:false,geometryInfluence:0,toneRange:[.16,.52],reserveStrength:.19,coherentInk:.75},
   kind:'maneRidge',section,rows});
  entry.record.material.uniforms.uCenter.value.set(0,-.05,0);
  entry.record.material.uniforms.uObjectScale.value=1;
  this.maneRidges[sectionIndex]=entry;
 }
 syncMane(){
  for(const batch of this.dragon.mane?.batches??[]){
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
  const rowStride = count * 4;
  for (let row = 0, a = i * 4, b = j * 4; row < 9; row += 3, a += rowStride, b += rowStride) {
   out[row] = data[a] + (data[b] - data[a]) * w;
   out[row + 1] = data[a + 1] + (data[b + 1] - data[a + 1]) * w;
   out[row + 2] = data[a + 2] + (data[b + 2] - data[a + 2]) * w;
  }
  let x = out[3], y = out[4], z = out[5];
  let inverse = 1 / Math.max(Math.sqrt(x * x + y * y + z * z), 1e-10);
  x *= inverse; y *= inverse; z *= inverse;
  out[3] = x; out[4] = y; out[5] = z;
  let nx = out[6], ny = out[7], nz = out[8];
  const dot = nx * x + ny * y + nz * z;
  nx -= x * dot; ny -= y * dot; nz -= z * dot;
  inverse = 1 / Math.max(Math.sqrt(nx * nx + ny * ny + nz * nz), 1e-10);
  nx *= inverse; ny *= inverse; nz *= inverse;
  out[6] = nx; out[7] = ny; out[8] = nz;
  out[9]=ny*z-nz*y;out[10]=nz*x-nx*z;out[11]=nx*y-ny*x;
  if(distance<0||distance>length){const excess=distance<0?distance:distance-length;out[0]+=x*excess;out[1]+=y*excess;out[2]+=z*excess;}
 }
 warp(x,y,z,nx,ny,nz,zone,attach,anchor,outP,outN){
  const d=this.dragon,shift=d.shift(zone),s=d.headZ-z;let distance=s+shift;
  let anchorDistance=anchor+shift;
  if(d.method==='stretch'){
   if(d.wingless){
    distance=d.stretchDistance(s);anchorDistance=d.stretchDistance(anchor);nz/=d.stretchSlope(s);
   }else{
    const a=d.sections[0],b=d.sections[1];
    distance=s+d.hipExtra*clamp((s-a.a)/(a.b-a.a))+(d.extra-d.hipExtra)*clamp((s-b.a)/(b.b-b.a));
    if(s>a.a&&s<a.b)nz/=1+d.hipExtra/(a.b-a.a);
    if(s>b.a&&s<b.b)nz/=1+(d.extra-d.hipExtra)/(b.b-b.a);
   }
  }
  if(attach===1){
   const g=this.anchorFrame(anchorDistance),ds=s-anchor;
   outP.set(g[0]+g[6]*x+g[9]*y+g[3]*ds,g[1]+g[7]*x+g[10]*y+g[4]*ds,g[2]+g[8]*x+g[11]*y+g[5]*ds);
   outN.set(g[6]*nx+g[9]*ny-g[3]*nz,g[7]*nx+g[10]*ny-g[4]*nz,g[8]*nx+g[11]*ny-g[5]*nz);
   return;
  }
  this.frameAt(distance,this.f);const f=this.f;
  let px=f[0]+f[6]*x+f[9]*y,py=f[1]+f[7]*x+f[10]*y,pz=f[2]+f[8]*x+f[11]*y;
  let vx=f[6]*nx+f[9]*ny-f[3]*nz,vy=f[7]*nx+f[10]*ny-f[4]*nz,vz=f[8]*nx+f[11]*ny-f[5]*nz;
  if(attach>1e-5){const g=this.anchorFrame(anchorDistance),ds=s-anchor;px+=(g[0]+g[6]*x+g[9]*y+g[3]*ds-px)*attach;py+=(g[1]+g[7]*x+g[10]*y+g[4]*ds-py)*attach;pz+=(g[2]+g[8]*x+g[11]*y+g[5]*ds-pz)*attach;vx+=(g[6]*nx+g[9]*ny-g[3]*nz-vx)*attach;vy+=(g[7]*nx+g[10]*ny-g[4]*nz-vy)*attach;vz+=(g[8]*nx+g[11]*ny-g[5]*nz-vz)*attach;}
  outP.set(px,py,pz);outN.set(vx,vy,vz);
 }
 anchorFrame(distance){
  const texture=this.dragon.field.curveTexture,version=texture.version;
  if(this.anchorTexture!==texture||this.anchorVersion!==version){
   this.anchorFrames.clear();
   this.anchorTexture=texture;
   this.anchorVersion=version;
  }
  const cached=this.anchorFrames.get(distance);
  if(cached)return cached;
  if(this.anchorFrames.size>=16){
   this.frameAt(distance,this.g);
   return this.g;
  }
  const frame=new Float64Array(12);
  this.frameAt(distance,frame);
  this.anchorFrames.set(distance,frame);
  return frame;
 }
 updateSkin(entry, cache) {
  const source = entry.source, geometry = entry.sourceGeometry;
  const input = geometry.attributes, output = entry.mesh.geometry.attributes;
  let state = cache.get(geometry);
  if (!state) {
   state = this.skinScratch.get(geometry);
   const count = input.position.count, boneCount = source.skeleton.bones.length;
   if (!state || state.done.length !== count || state.matrices.length !== boneCount * 16) {
    state = {
     matrices: new Float64Array(boneCount * 16),
     p: new Float32Array(count * 3), n: new Float32Array(count * 3),
     done: new Uint8Array(count), worldNormal: new THREE.Matrix3(), attributes: {}, decoded: {},
    };
    this.skinScratch.set(geometry, state);
   }
   state.done.fill(0);
   state.worldNormal.getNormalMatrix(source.matrixWorld);
   source.skeleton.update();
   for (let i = 0; i < boneCount; i++) {
    this.pm.fromArray(source.skeleton.boneMatrices, i * 16)
     .premultiply(source.bindMatrixInverse).multiply(source.bindMatrix).toArray(state.matrices, i * 16);
   }
   for (const [name, size] of skinAttributes) {
    const attribute = input[name], packed = packedArray(attribute, size);
    if (packed) {
     state.attributes[name] = packed;
     continue;
    }
    // Match the attribute getters for interleaved or normalized geometry.
    const length = attribute.count * size;
    let values = state.decoded[name];
    if (!values || values.length !== length) values = state.decoded[name] = new Float64Array(length);
    for (let i = 0; i < attribute.count; i++) {
     for (let axis = 0; axis < size; axis++) {
      values[i * size + axis] = size === 3 ? attribute[vectorGetters[axis]](i) : attribute.getComponent(i, axis);
     }
    }
    state.attributes[name] = values;
   }
   cache.set(geometry, state);
  }
  const { position, normal, skinWeight, skinIndex, aGrowth } = state.attributes;
  const destP = output.position.array, destN = output.normal.array;
  const matrices = state.matrices, outP = this.p, outN = this.n;
  const morph = this.dragon.motion?.chapterMorph;
  const crown = this.dragon.stage === 3 && this.dragon.wingless && morph !== undefined;
  const lift = crown ? this.dragon.motion.crownLift ?? 0 : 0;
  const leftGrowth = crown ? smooth(.26, .67, morph) : 1;
  const rightGrowth = crown ? smooth(.33, .74, morph) : 1;
  const moveCrown = crown && (leftGrowth < 1 || rightGrowth < 1 || lift > 0);
  for (let index = 0; index < entry.mapping.length; index++) {
   const i = entry.mapping[index], k = i * 3;
   if (!state.done[i]) {
    let x = position[k], y = position[k + 1];
    const z = position[k + 2];
    let nx = normal[k], ny = normal[k + 1], nz = normal[k + 2];
    if (moveCrown && y > .069 && z > .182 && z < .344) {
     // The sculpt's antler tips sit at x ±.07 and z .23. Splay them from
     // stationary roots with a short offset between the two growth curves.
     const side = clamp((x + .034) / .068);
     const blend = side * side * (3 - 2 * side);
     const blendSlope = 6 * side * (1 - side) / .068;
     const growth = leftGrowth + (rightGrowth - leftGrowth) * blend;
     const growthSlope = (rightGrowth - leftGrowth) * blendSlope;
     const rise = -.84 + (.84 + 1.48 * lift) * growth;
     const riseSlope = (.84 + 1.48 * lift) * growthSlope;
     const splay = 1.08 * lift * (2 * blend - 1) * growth;
     const splaySlope = 1.08 * lift * (2 * blendSlope * growth + (2 * blend - 1) * growthSlope);
     const front = clamp((z - .182) / .043), rear = clamp((z - .277) / .067);
     const rootMask = front * front * (3 - 2 * front);
     const maneMask = 1 - rear * rear * (3 - 2 * rear);
     const mask = rootMask * maneMask;
     const maskSlope = 6 * front * (1 - front) * maneMask / .043
      - rootMask * 6 * rear * (1 - rear) / .067;
     const height = y - .069, radius = height + .018;
     const reach = height * height / radius;
     const reachSlope = height * (height + .036) / (radius * radius);
     const stroke = reach * mask;
     // Transform normals by the inverse transpose of the local deformation.
     // The axial coordinate stays fixed so a horn cannot slide off the brow.
     const a = 1 + splaySlope * stroke, b = splay * reachSlope * mask;
     const c = riseSlope * stroke, d = 1 + rise * reachSlope * mask;
     const determinant = a * d - b * c;
     const warpedX = (d * nx - c * ny) / determinant;
     const warpedY = (a * ny - b * nx) / determinant;
     nz -= (splay * warpedX + rise * warpedY) * reach * maskSlope;
     nx = warpedX;
     ny = warpedY;
     x += splay * stroke;
     y += rise * stroke;
    }
    let px = 0, py = 0, pz = 0, vx = 0, vy = 0, vz = 0;
    for (let j = i * 4, end = j + 4; j < end; j++) {
     const weight = skinWeight[j];
     if (weight < 1e-7) continue;
     const n = skinIndex[j] * 16;
     px += (matrices[n] * x + matrices[n + 4] * y + matrices[n + 8] * z + matrices[n + 12]) * weight;
     py += (matrices[n + 1] * x + matrices[n + 5] * y + matrices[n + 9] * z + matrices[n + 13]) * weight;
     pz += (matrices[n + 2] * x + matrices[n + 6] * y + matrices[n + 10] * z + matrices[n + 14]) * weight;
     vx += (matrices[n] * nx + matrices[n + 4] * ny + matrices[n + 8] * nz) * weight;
     vy += (matrices[n + 1] * nx + matrices[n + 5] * ny + matrices[n + 9] * nz) * weight;
     vz += (matrices[n + 2] * nx + matrices[n + 6] * ny + matrices[n + 10] * nz) * weight;
    }
    this.warp(px, py, pz, vx, vy, vz, aGrowth[k], aGrowth[k + 1], aGrowth[k + 2], outP, outN);
    outP.applyMatrix4(source.matrixWorld);
    outN.applyMatrix3(state.worldNormal).normalize();
    state.p[k]=outP.x;
    state.p[k+1]=outP.y;
    state.p[k+2]=outP.z;
    state.n[k]=outN.x;
    state.n[k+1]=outN.y;
    state.n[k+2]=outN.z;
    state.done[i] = 1;
    this.updatedVertices++;
   }
   const dest = index * 3;
   destP[dest] = state.p[k]; destP[dest + 1] = state.p[k + 1]; destP[dest + 2] = state.p[k + 2];
   destN[dest] = state.n[k]; destN[dest + 1] = state.n[k + 1]; destN[dest + 2] = state.n[k + 2];
  }
 }
 updateLoft(entry){
  const section=entry.section,length=section.b-section.a+section.extra,prefix=entry.sectionIndex?this.dragon.hipExtra:0,positions=entry.mesh.geometry.attributes.position,normals=entry.mesh.geometry.attributes.normal,rest=entry.mesh.geometry.attributes.inkRestPosition;
  const restNormals=entry.mesh.geometry.attributes.inkRestNormal;
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
   this.p.fromBufferAttribute(at.inkRestPosition,a.vertex).lerp(other.fromBufferAttribute(bt.inkRestPosition,b.vertex),ref.t);
   this.n.fromBufferAttribute(at.inkRestNormal,a.vertex).lerp(otherNormal.fromBufferAttribute(bt.inkRestNormal,b.vertex),ref.t).normalize();
   rest.setXYZ(i,this.p.x,this.p.y,this.p.z);
   restNormals.setXYZ(i,this.n.x,this.n.y,this.n.z);
  }
  join.needsUpdate=true;this.updateJoinCoverage(entry);
  rest.needsUpdate=restNormals.needsUpdate=true;this.updatedVertices+=entry.params.length;
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
 update(dt,advanceInk=true){
  this.frame++;this.updatedVertices=0;this.dragon.root.updateMatrixWorld(true);
  if(Math.abs(this.lastTarget-this.dragon.targetExtra)>1e-5){if(!this.rebuildAt)this.rebuildAt=performance.now()+180;if(performance.now()>=this.rebuildAt){this.syncMiddle();this.rebuildAt=0;}}
  this.syncMane();const cache=new Map();
  const morph=this.dragon.motion?.chapterMorph;
  const gate=this.dragon.motion?.gatePose;
  this.gatePaper.value=gate ? Math.max(gate.tuck*.69,gate.front*.84,gate.load) : 0;
  const chapterWing=this.dragon.motion?.chapterWing;
  const opening=chapterWing?.opening;
  this.chapterWingOpening.value=opening??1;
  this.chapterWingBristle.value=chapterWing
   ? smooth(.22,.76,opening??0)*(1-smooth(.39,.71,chapterWing.phase??0))
   : 0;
  const inkLoad=clamp(chapterWing?.inkLoad??0);
  this.chapterInkTrail.value.set(clamp(chapterWing?.inkTravel??0),inkLoad);
  this.chapterWingGrowthInk.update(chapterWing);
  this.chapterShoulderInk.value=opening===undefined?0:
   smooth(.008,.38,opening)*(1-smooth(.57,.995,opening))*(1-.70*inkLoad);
  const pigment=morph===undefined?0:(this.dragon.stage===3
   ? smooth(.12,.42,morph)*(1-smooth(.72,1,morph))
   : 1-smooth(.38,.86,morph));
  for(const e of this.entries){
   const chapterPigment=e.record.material.uniforms.uChapterPigment;
   if(chapterPigment)chapterPigment.value=pigment;
   const loft=this.dragon.method==='loft';
   const visible=e.kind==='skin'
    ? (!e.variant||loft===(e.variant==='cap'))
    : loft&&(e.kind==='loft'||(e.kind==='maneRidge'?this.dragon.mane.enabled:e.source.visible));
   e.mesh.visible=visible;if(!visible)continue;
   if(e.kind==='skin')this.updateSkin(e,cache);else if(e.kind==='loft')this.updateLoft(e);else if(e.kind==='maneRidge'){
    const world=this.dragon.root.matrixWorld,mane=this.dragon.mane;
    updateManeRidge(e.section,e.rows,e.mesh.geometry,mane.flow,mane.dynamic,world,this.nm.getNormalMatrix(world));
    this.updatedVertices+=e.mesh.geometry.attributes.position.count;
   }else this.updateMane(e);
   e.mesh.geometry.attributes.position.needsUpdate=e.mesh.geometry.attributes.normal.needsUpdate=true;
   const brush=e.record.brush?.material.uniforms;
   if(brush)brush.uScale.value=this.ink.shared.uScale.value/Math.max(this.dragon.root.scale.x,.001);
   this.updateBrush(e);
  }
  if(advanceInk)this.ink.advance(dt);
  if(this.dragon.mane){this.maneTime.value=this.dragon.mane.flow.time;this.maneLoad.value=this.dragon.mane.flow.pigment;}
  this.flames?.update(dt);
 }
 render(scene,camera){
  const visible=this.dragon.root.visible;this.dragon.root.visible=false;this.root.visible=true;
  try{this.ink.render(scene,camera);}finally{this.root.visible=false;this.dragon.root.visible=visible;}
 }
 resize(){const s=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.ink.setSize(s.x,s.y);}
 inspect(){return{renderer:'shared InkWashRenderer 0.3',source:'outputs/ink-brush-lab-v1/src',dynamicVertices:this.updatedVertices,surfaceMeshes:this.entries.length,surfaceStrokeCount:this.ink.records.reduce((s,r)=>s+(r.brush?.count||0),0),inkTime:this.ink.time,inkFlow:this.ink.parameters.inkFlow,sharedBrushAtlas:!!this.ink.sharedResources.brushAtlas,inkFlameVolumes:this.flames?.count||0,inkFlameTime:this.flames?.time||0};}
}
