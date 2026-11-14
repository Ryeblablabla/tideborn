import * as THREE from 'three';
import { surfaceVortex } from './water-combat.js';

export const INK_VORTEX_KINDS = new Set(['storm','fire','ring']);
const TAU = Math.PI * 2;
const SIDES = [-1,0,1];
const MAX_POLYGON_POINTS = 96;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const fract = value => value-Math.floor(value);

const vertexShader = /* glsl */ `
  attribute vec4 aBrush;
  varying vec4 vBrush;
  varying vec3 vWorld;
  void main(){
    vBrush=aBrush;
    vWorld=(modelMatrix*vec4(position,1.)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec4 vBrush;
  varying vec3 vWorld;
  uniform vec3 uHead;
  uniform float uTime,uInk,uReserve,uKind,uProtectHead;
  float hash(vec2 p) {
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+33.33);
    return fract((p.x+p.y)*p.x);
  }
  float wash(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
      mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
  }
  void main(){
    float u=vBrush.x,s=vBrush.y,seed=vBrush.z;
    float fire=step(1.5,uKind);
    float wind=step(.5,uKind)*(1.-fire);
    float current=uTime*(.28+1.45*wind+.66*fire);
    float broad=wash(vec2(u*(8.-4.1*wind)-current,seed+3.7*s));
    float fibers=wash(vec2(u*(19.-8.*wind)-current*1.4,(62.-23.*wind-14.*fire)*s+seed));
    float grain=hash(floor(vec2(u*301.,s*113.)));
    float tapered=smoothstep(0.,.06,u)*smoothstep(0.,.12,1.-u);
    float tongueSway=.17*sin(8.3*u+seed-current*.9)*fire;
    float edge=abs(s-tongueSway)+(broad-.46)*(.21+.15*fire);
    float fringe=1.-smoothstep(.79-.13*wind-.23*fire,.99,edge);
    float darkSide=1.-smoothstep(-.61,.69,s+.14*(broad-.5));
    float deposit=uInk*(.20+.78*darkSide)*(.78+.32*broad)*(1.-fire*.30*u);
    // Wind leaves long dry bristles. Flame reserves a small, moving bright core.
    float dryStroke=smoothstep(.56-.12*wind,.83,fibers)*smoothstep(-.38,.16,s);
    float tongue=exp(-8.*abs(s-.24-tongueSway-.17*(broad-.5)))*smoothstep(.12,.39,u);
    float licked=(1.-smoothstep(.14,.33,abs(s+.26-tongueSway)))*smoothstep(.38,.77,fibers)*smoothstep(.31,.75,u);
    float reserve=uReserve*max(dryStroke*(.45+.55*u),fire*max(tongue*.99,licked*.81));
    float coverage=vBrush.w*tapered*fringe*(.74+.23*grain+.09*broad);
    if(uProtectHead>.5){
      vec3 ray=uHead-cameraPosition;
      vec3 fragment=vWorld-cameraPosition;
      float along=dot(fragment,ray)/max(.001,dot(ray,ray));
      float lateral=length(fragment-ray*along)/max(.28,along);
      float inFront=smoothstep(.05,.19,along)*(1.-smoothstep(.92,1.06,along));
      // Let the actual dragon silhouette through only where a foreground
      // stroke crosses the head's sightline. The field boundary remains intact.
      float leaveHead=1.-smoothstep(.93,2.06,lateral);
      coverage*=(1.-.92*inFront*leaveHead)*mix(.53,1.,smoothstep(.19,.57,along));
    }
    if(coverage<.014)discard;
    gl_FragColor=vec4(exp(-deposit*3.),reserve,grain,coverage);
  }
`;

const PALETTES = {
  ring: {tint:'#83623f',strength:.67,ink:.78,reserve:.47,order:-5,kind:0},
  storm: {tint:'#4e6969',strength:.53,ink:.94,reserve:.75,order:-4,kind:1},
  undertow: {tint:'#425f68',strength:.60,ink:1.14,reserve:.86,order:-4,kind:1},
  flaming: {tint:'#b9472e',strength:.85,ink:.86,reserve:.74,order:-4,kind:2},
  toxic: {tint:'#5d6c42',strength:.67,ink:.86,reserve:.66,order:-4,kind:1},
  fire: {tint:'#b34b2f',strength:.89,ink:.86,reserve:.83,order:-3,kind:2},
};

class RibbonBatch {
  constructor(scene, kind) {
    const pigment=PALETTES[kind];
    this.geometry=new THREE.BufferGeometry();
    this.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);
    this.material=new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent:true, depthWrite:false,
      side:THREE.DoubleSide, forceSinglePass:true,
      uniforms:{
        uTime:{value:0},uInk:{value:pigment.ink},uReserve:{value:pigment.reserve},uKind:{value:pigment.kind},
        uHead:{value:new THREE.Vector3()},uProtectHead:{value:0},
      },
    });
    this.mesh=new THREE.Mesh(this.geometry,this.material);
    this.mesh.name=`Ink field: ${kind}`;
    this.mesh.frustumCulled=false;
    this.mesh.renderOrder=pigment.order;
    this.mesh.visible=false;
    this.mesh.userData.inkTint=pigment.tint;
    this.mesh.userData.inkTintAmount=pigment.strength;
    // Clear wind is a translucent ink wash. Keep the dragon and terrain's
    // surface ownership where that wash passes in front of them.
    this.mesh.userData.inkIdSuppressed=kind==='storm'||kind==='undertow';
    this.vertexCount=0;
    this.indexCount=0;
    this.capacity=0;
    this.geometry.setDrawRange(0,0);
    scene.add(this.mesh);
  }

  begin() { this.vertexCount=0; this.indexCount=0; }

  reserve(rows) {
    const vertices=this.vertexCount+rows*SIDES.length;
    if(vertices<=this.capacity)return;
    const capacity=Math.max(512,2**Math.ceil(Math.log2(vertices)));
    const geometry=new THREE.BufferGeometry();
    geometry.boundingSphere=this.geometry.boundingSphere;
    const positions=new Float32Array(capacity*3);
    const normals=new Float32Array(capacity*3);
    const brushes=new Float32Array(capacity*4);
    const indices=new Uint32Array(capacity*6);
    if(this.capacity){
      positions.set(this.positions.subarray(0,this.vertexCount*3));
      normals.set(this.normals.subarray(0,this.vertexCount*3));
      brushes.set(this.brushes.subarray(0,this.vertexCount*4));
      indices.set(this.indices.subarray(0,this.indexCount));
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aBrush',new THREE.BufferAttribute(brushes,4).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.dispose();
    this.mesh.geometry=this.geometry=geometry;
    this.capacity=capacity;
    this.positions=positions;
    this.normals=normals;
    this.brushes=brushes;
    this.indices=indices;
  }

  writeRow(x,y,z,offsetX,offsetY,offsetZ,ridge,u,seed,pressure,join) {
    const start=this.vertexCount;
    const previous=start-SIDES.length;
    const dx=join ? x-this.previousX : 0;
    const dy=join ? y-this.previousY : 0;
    const dz=join ? z-this.previousZ : 0;
    const nx=dy*offsetZ-dz*offsetY;
    const ny=dz*offsetX-dx*offsetZ;
    const nz=dx*offsetY-dy*offsetX;
    const length=Math.hypot(nx,ny,nz);
    for(const side of SIDES){
      const i=this.vertexCount++;
      this.positions[i*3]=x+offsetX*side;
      this.positions[i*3+1]=y+offsetY*side+(1-side*side)*ridge;
      this.positions[i*3+2]=z+offsetZ*side;
      this.brushes[i*4]=u;
      this.brushes[i*4+1]=side;
      this.brushes[i*4+2]=seed;
      this.brushes[i*4+3]=pressure;
      this.normals[i*3]=length ? nx/length : 0;
      this.normals[i*3+1]=length ? ny/length : 1;
      this.normals[i*3+2]=length ? nz/length : 0;
    }
    this.previousX=x;
    this.previousY=y;
    this.previousZ=z;
    if(!join)return;
    if(this.brushes[previous*4]===0){
      this.normals.copyWithin(previous*3,start*3,(start+SIDES.length)*3);
    }
    for(let j=0;j<SIDES.length-1;j++){
      this.indices[this.indexCount++]=previous+j;
      this.indices[this.indexCount++]=start+j;
      this.indices[this.indexCount++]=previous+j+1;
      this.indices[this.indexCount++]=previous+j+1;
      this.indices[this.indexCount++]=start+j;
      this.indices[this.indexCount++]=start+j+1;
    }
  }

  end(time,focus) {
    this.mesh.visible=this.indexCount>0;
    this.geometry.setDrawRange(0,this.indexCount);
    if(!this.mesh.visible)return;
    this.material.uniforms.uTime.value=time;
    this.material.uniforms.uProtectHead.value=focus?1:0;
    if(focus)this.material.uniforms.uHead.value.set(focus.x,focus.y+.60,focus.z);
    for(const [attribute,count] of [
      [this.geometry.attributes.position,this.vertexCount*3],
      [this.geometry.attributes.normal,this.vertexCount*3],
      [this.geometry.attributes.aBrush,this.vertexCount*4],
      [this.geometry.index,this.indexCount],
    ]){
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0,count);
      attribute.needsUpdate=true;
    }
  }
}

// The two low arcs indicate reach. Rising spirals leave the eye open for targets.
const STORM_SWEEPS = [
  {start:.07,turn:1.83,from:.99,to:.72,low:.025,high:.14,width:.085,roll:.30,steps:22,load:.72},
  {start:2.95,turn:1.30,from:.98,to:.65,low:.035,high:.15,width:.051,roll:.18,steps:18,load:.48},
  {start:.56,turn:3.64,from:.29,to:.91,low:.05,high:1.12,width:.155,roll:1.18,steps:31,load:.84},
  {start:3.33,turn:2.65,from:.43,to:.98,low:.18,high:.95,width:.089,roll:.87,steps:28,load:.60},
  {start:1.92,turn:1.42,from:.65,to:1.02,low:.71,high:1.20,width:.030,roll:.57,steps:16,load:.48},
];

const WET_SWEEPS = [
  {start:.06,turn:1.42,from:.33,to:.86,low:.07,high:.87,width:.113,roll:1.02,steps:28,load:.80},
  {start:Math.PI+.13,turn:1.19,from:.46,to:.92,low:.08,high:.63,width:.059,roll:.79,steps:21,load:.52},
];

const FIRE_SKIRTS = [
  {start:0,turn:1.72,from:.97,to:.70,low:.025,high:.19,width:.108,roll:.49,steps:21,load:.74},
  {start:3.08,turn:1.38,from:.98,to:.73,low:.02,high:.16,width:.084,roll:.48,steps:18,load:.62},
];

const FIRE_TONGUES = Array.from({length:7},(_,i)=>({
  start:TAU*i/7+Math.sin(i*7.6)*.22,
  turn:.66+.25*Math.sin(i*7.9),
  from:.58+i*.038, to:.65+.14*Math.cos(i*5.6),
  low:.035+.026*(i%3), high:i%3===0?1.11+.26*Math.sin(i+1):.49+.31*Math.sin(i*8.3+1),
  width:i%3===0?.168:.086+i*.006,roll:1.0,steps:16,load:i%3===0?.92:.69,
}));

function sweep(batch,zone,spec,rotation,height,seed,time,fade,flame=false,wet=null) {
  const steps=spec.steps;
  const lift=flame ? .82+.22*Math.sin(time*5.7+seed)+.09*Math.sin(time*11.6-seed) : 1;
  batch.reserve(steps+1);
  for(let i=0;i<=steps;i++){
    const u=i/steps;
    const tipCurl=flame ? (.65+.46*Math.sin(time*5.4+seed))*u*u : 0;
    const radiusProgress=flame ? u*u : u;
    const fold=flame?-.17*Math.sin(Math.PI*u)+.035*Math.sin(u*13+time*5.7+seed)*u:0;
    const radial=lerp(spec.from,spec.to,radiusProgress)+.024*Math.sin(u*8+seed)+fold;
    const sweepAngle=wet ? wet.spin*(spec.start+spec.turn*u*u+2.35*Math.log(radial)) : spec.start+spec.turn*u;
    const angle=rotation+sweepAngle+.083*Math.sin(u*5.9+seed)+tipCurl;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    const radius=zone.radius*radial;
    const rise=flame ? Math.pow(u,.76) : u;
    const y=(wet ? wet.surface : zone.y)+.035+height*(lerp(spec.low,spec.high,rise)*lift+.032*Math.sin(u*8+seed));
    const taper=Math.pow(Math.sin(u*Math.PI),.58)*(1-u*(flame ? .74 : .17));
    const width=zone.radius*spec.width*(.043+taper)*(.84+.16*Math.sin(u*15+seed));
    const roll=spec.roll+.32*Math.sin(u*5.2+seed*.7);
    const across=width*Math.cos(roll);
    const bend=width*Math.sin(roll);
    batch.writeRow(zone.x+ca*radius,y,zone.z+sa*radius,ca*across,bend,sa*across,
      width*.24,u,seed,fade*spec.load,i>0);
  }
}

function ringStroke(batch,zone,seed,fade,time) {
  const polygon=zone.polygon;
  if(!polygon||polygon.length<3)return;
  const count=Math.min(polygon.length,MAX_POLYGON_POINTS);
  const point = i => polygon[Math.floor(((i+count)%count)/count*polygon.length)];
  const charge=clamp((zone.charge||0)/4,0,1);
  const contraction=clamp(zone.contraction||0,0,.8);
  let winding=0;
  for(let i=0;i<count;i++){
    const a=point(i),b=point(i+1);
    winding+=(a.x-zone.x)*(b.z-zone.z)-(b.x-zone.x)*(a.z-zone.z);
  }
  const sign=winding<0?-1:1;
  // Two overlapping strokes close the traced polygon without a screen-space disk.
  for(const [start,length,thickness,alpha,inner] of [
    [0,count+2,.072,.92,false],
    [Math.floor(count*.13),Math.ceil(count*.58),.131,.70,true],
  ]){
    batch.reserve(length+1);
    for(let i=0;i<=length;i++){
      const j=start+i,u=i/length,p=point(j),a=point(j-1),b=point(j+1);
      const dx=b.x-a.x,dz=b.z-a.z,span=Math.hypot(dx,dz)||1;
      const nx=-sign*dz/span,nz=sign*dx/span;
      const width=clamp(zone.radius*thickness,.075,.62);
      const pressure=.67+.28*Math.sin(j*1.77+seed)+.12*Math.sin(time*2.8-j*.23);
      const half=width*pressure*(inner ? .77 : .50);
      const inwardPulse=.5+.5*Math.sin(time*4.1-j*.33);
      const inset=half+(inner ? width*(.30+contraction*1.65+.34*charge*inwardPulse) : 0);
      const y=zone.y+.035+(inner ? .052 : 0)+.037*Math.sin(j*.64-time*2.1);
      batch.writeRow(p.x+nx*inset,y,p.z+nz*inset,nx*half,inner ? .06 : 0,nz*half,
        inner ? .11 : .029,u,seed+(inner ? 3 : 0),
        fade*alpha*(inner ? .64+.36*charge*inwardPulse : .80+.20*charge),i>0);
    }
  }
}

/** Ribbons share indexed buffers by pigment. Scene depth occludes their 3D sweeps. */
export class InkVortexFields {
  constructor(scene) {
    this.batches=Object.fromEntries(Object.keys(PALETTES).map(kind=>[kind,new RibbonBatch(scene,kind)]));
  }

  update(zones,time,active=true,focus=null) {
    const batches=Object.values(this.batches);
    for(const batch of batches)batch.begin();
    if(active)for(const zone of zones){
      if(!INK_VORTEX_KINDS.has(zone.kind)||zone.life<=0||zone.radius<=0)continue;
      const seed=fract(Math.sin(zone.id*91.153+2.29)*43758.5)*11;
      const fade=clamp(zone.life*2.75,0,1);
      if(zone.kind==='ring'){
        ringStroke(this.batches.ring,zone,seed,fade,time);
        continue;
      }
      if(zone.kind==='storm'){
        const flaming=zone.flame>0;
        const batch=this.batches[flaming?'flaming':zone.toxic>0?'toxic':zone.rainfed?'undertow':'storm'];
        const tailDraw=zone.weaponAnchor==='tail'&&!flaming&&!(zone.toxic>0)&&!zone.rainfed;
        const height=clamp(.67+zone.radius*.38+zone.power*.15,1.5,3.9)*(zone.rainfed?1.15:tailDraw?.64:1);
        const wet=surfaceVortex(zone,time);
        const phase=wet ? Math.PI*.5-wet.spin*(Math.PI*.25+.5*wet.phase) : time*(1.14+zone.power*.09)+seed;
        const sweeps=wet?WET_SWEEPS:STORM_SWEEPS;
        const pressure=wet ? fade*Math.min(1,wet.load*1.9) : fade;
        for(const [i,spec] of sweeps.entries()){
          sweep(batch,zone,spec,phase,height,seed+i*3.4,time,pressure,false,wet);
        }
        if(flaming){
          for(let i=0;i<FIRE_TONGUES.length;i+=2){
            sweep(batch,zone,FIRE_TONGUES[i],phase*.79,height,seed+i*2.5+7,time,fade,true);
          }
        }
      }else{
        const height=clamp(1.30+zone.radius*.40+zone.power*.18,1.95,4.85);
        const phase=time*.66+seed;
        for(const [i,spec] of FIRE_SKIRTS.entries()){
          sweep(this.batches.fire,zone,spec,phase,height,seed+i*2.5,time,fade);
        }
        for(const [i,spec] of FIRE_TONGUES.entries()){
          sweep(this.batches.fire,zone,spec,phase,height,seed+i*2.5+7,time,fade,true);
        }
      }
    }
    for(const batch of batches)batch.end(time,focus);
  }
}
