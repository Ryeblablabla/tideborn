import * as THREE from 'three';
import{mergeGeometries}from'three/addons/utils/BufferGeometryUtils.js';
import{random}from'../rules.js';
import {inkHeightfield, inkTerrain} from './terrain.js';
import {buildGreatLake, buildMountainValley, buildOffshoreReefs, buildReedMarsh, mountainRiver} from './landforms.js';
import {createHeaven} from './heaven.js';
import {shadeValleyStrata} from './valley-rock.js';
import {drawStructureContacts, populateShallows} from './shore-plants.js';
import {fillStoneGuides, foundedStone, SHORE_WATER, shoreStructureMark} from './shore-structure.js';
const TAU=Math.PI*2,gray=new THREE.MeshStandardMaterial({color:'#b1b1ad',roughness:1,side:THREE.DoubleSide});
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function piece(g,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){g.applyMatrix4(new THREE.Matrix4().compose(V(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),V(...scale)));if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;}
function merge(parts){const normalized=parts.map(g=>{if(g.index){const copy=g.toNonIndexed();g.dispose();return copy;}return g;});for(const g of normalized){g.deleteAttribute('uv');g.deleteAttribute('color');}const result=mergeGeometries(normalized);normalized.forEach(g=>g.dispose());return result;}
function tube(points,radius=.04,sides=5){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>V(...v))),Math.max(5,points.length*4),radius,sides,false);}
function gridSurface(n,m,fn){const p=[],uv=[],idx=[];for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){p.push(...fn(i/n,j/m));uv.push(i/n,j/m);if(i<n&&j<m){const k=i*(m+1)+j;idx.push(k,k+1,k+m+1,k+1,k+m+2,k+m+1);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function roof(w,d,h){return gridSurface(24,16,(u,v)=>{const x=(u-.5)*2,z=(v-.5)*2;return[x*w*.5,h*(1-Math.abs(z))**.72+.75*(Math.abs(x)**6)+.48*(Math.abs(z)**5),z*d*.5];});}
export class InkEnvironment {
 constructor(parent){this.parent=parent;this.cache=new Map();this.stage=-1;this.obstacles=[];this.wind=[];this.terrains=[];this.mountainRiver=mountainRiver;this.heightAt=(x,z)=>this.terrains.reduce((height,t)=>t.stage===this.stage?Math.max(height,t.y+t.sample(x-t.x,z-t.z)):height,-Infinity);this.stageNames=['苇汀初醒','烟波大湖','沧溟行雨','青绿千山','九重天阙'];this.setStage(0);}
 add(root,geometry,at=[0,0,0],{tint,amount=.55,profile={},wind=false}={}){
  const mesh=new THREE.Mesh(geometry,gray);mesh.position.set(...at);mesh.userData.inkProfile={geometryInfluence:.35,reserveStrength:.10,macroInk:.20,toneRange:[.16,.72],strokeProfile:{frequency:.24,lengthRange:[.09,.27]},...profile};
  if(tint){mesh.userData.inkTint=tint;mesh.userData.inkTintAmount=amount;}root.add(mesh);if(wind)this.wind.push({mesh,stage:root.userData.stage,phase:this.wind.length*1.7,base:at[1]});return mesh;
 }
 terrain(root, x, y, z, size, options = {}) {
  const {
   tint, amount, profile, shape, angle, field, paint, columns, rows,
   seed = x * .3 + z * .7, distant = false, wash, pooling = .10, gain = 1, strokeStrength = .28,
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
  if (!distant) this.terrains.push({stage:root.userData.stage,x,y,z,sample:terrain.heightAt});
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
 lake(root) {buildGreatLake(this, root);populateShallows(this, root, 1);}
 mountains(root) {buildMountainValley(this, root);}
 heaven(root) {this.landmark = createHeaven(this, root);}
 create(stage) {
  const root=new THREE.Group();
  root.name='墨境_'+this.stageNames[stage];
  root.userData.stage=stage;
  const current = this.obstacles;
  this.obstacles = [];
  if (stage===0) this.marsh(root);
  if (stage===1) this.lake(root);
  if (stage===2) buildOffshoreReefs(this,root);
  if (stage===3) this.mountains(root);
  if (stage===4) this.heaven(root);
  root.userData.shoreObstacles = this.obstacles;
  this.obstacles = current;
  return root;
 }
 setStage(stage,ink,focus){
  const changed = this.stage !== stage;
  this.stage = stage;
  let root = this.cache.get(stage);
  if (!root) {
   root=this.create(stage);
   this.cache.set(stage,root);
   this.parent.add(root);
  }
  if (changed) {
   for (const [s,r] of this.cache) r.visible=s===stage;
   this.obstacles.splice(0,this.obstacles.length,...root.userData.shoreObstacles);
  }
  if (stage===4 && focus) {
   root.position.set(focus.x,0,focus.z);
   root.rotation.y=focus.angle||0;
  }
  if(ink)this.register(ink,root);return root;
 }
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
   material.vertexShader = 'varying vec2 vLandscape;\n' + material.vertexShader.replace(
    'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    'vec4 viewPosition = modelViewMatrix * vec4(position,1.0); vLandscape = vec2((modelMatrix*vec4(position,1.0)).y,-viewPosition.z); gl_Position = projectionMatrix * viewPosition;',
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
   if(record.mesh.geometry.hasAttribute('inkMineralMask')){
    material.vertexShader = 'attribute float inkMineralMask; varying float vMineralMask;\n' +
      material.vertexShader.replace('vGuides=inkGuides;', 'vGuides=inkGuides; vMineralMask=inkMineralMask;');
    material.fragmentShader = 'varying float vMineralMask;\n' + material.fragmentShader.replace(
      'vec4(reflectance,paperReserve,grain,1.0)', 'vec4(reflectance,paperReserve,vMineralMask,1.0)',
    );
   }
   material.needsUpdate = true;
  }

 }
 update(time){for(const w of this.wind)if(w.mesh.parent?.visible){w.mesh.rotation.z=Math.sin(time*.7+w.phase)*(w.mesh.userData.wave?.025:.022);if(w.mesh.userData.wave)w.mesh.position.y=w.base+Math.sin(time*.9+w.phase)*.12;}}
 inspect(){const root=this.cache.get(this.stage);let triangles=0,meshes=0;root.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});return{stage:this.stage,name:this.stageNames[this.stage],meshes,triangles,real3D:true};}
}
