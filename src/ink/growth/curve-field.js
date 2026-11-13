import * as THREE from 'three';
import { spineBeat } from './spine-beat.js';
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const nextPower=x=>2**Math.ceil(Math.log2(Math.max(2,x)));

const curveGLSL=/* glsl */`
attribute vec3 aGrowth;
uniform sampler2D uGrowthCurve;
uniform float uGrowthSamples;
uniform float uGrowthLength;
uniform float uGrowthExtra;
uniform float uGrowthHip;
uniform float uGrowthHead;
uniform float uGrowthA;
uniform float uGrowthB;
uniform float uGrowthC;
uniform float uGrowthD;
uniform float uGrowthStretch;
vec3 growthRow(float index,float row){return texture2D(uGrowthCurve,vec2((index+.5)/uGrowthSamples,(row+.5)/4.)).xyz;}
void growthFrame(float distance,out vec3 c,out vec3 n,out vec3 b,out vec3 t){
 float f=clamp(distance/uGrowthLength,0.,1.)*(uGrowthSamples-1.);
 float i=floor(f),j=min(i+1.,uGrowthSamples-1.),w=fract(f);
 c=mix(growthRow(i,0.),growthRow(j,0.),w);
 t=normalize(mix(growthRow(i,1.),growthRow(j,1.),w));
 n=mix(growthRow(i,2.),growthRow(j,2.),w);n=normalize(n-t*dot(n,t));b=normalize(cross(n,t));
 if(distance<0.)c+=t*distance;
 if(distance>uGrowthLength)c+=t*(distance-uGrowthLength);
}
float growthShift(float zone){return zone<.5?0.:zone<1.5?uGrowthHip:uGrowthExtra;}
float growthDistance(float d,vec3 params){
 if(uGrowthStretch>.5)return d+uGrowthHip*clamp((d-uGrowthA)/(uGrowthB-uGrowthA),0.,1.)+(uGrowthExtra-uGrowthHip)*clamp((d-uGrowthC)/(uGrowthD-uGrowthC),0.,1.);
 return d+growthShift(params.x);
}
vec3 growthPoint(vec3 p,vec3 params){
 float d=uGrowthHead-p.z;vec3 c,n,b,t;
 growthFrame(growthDistance(d,params),c,n,b,t);vec3 body=c+n*p.x+b*p.y;
 float anchor=params.z+growthShift(params.x);
 growthFrame(anchor,c,n,b,t);vec3 rigid=c+n*p.x+b*p.y+t*(d-params.z);
 return mix(body,rigid,params.y);
}
vec3 growthNormal(vec3 v,vec3 p,vec3 params){
 float d=uGrowthHead-p.z;vec3 c,n,b,t;
 vec3 local=v;
 if(uGrowthStretch>.5&&d>uGrowthA&&d<uGrowthB)local.z/=1.+uGrowthHip/(uGrowthB-uGrowthA);
 if(uGrowthStretch>.5&&d>uGrowthC&&d<uGrowthD)local.z/=1.+(uGrowthExtra-uGrowthHip)/(uGrowthD-uGrowthC);
 growthFrame(growthDistance(d,params),c,n,b,t);vec3 body=n*local.x+b*local.y-t*local.z;
 growthFrame(params.z+growthShift(params.x),c,n,b,t);vec3 rigid=n*v.x+b*v.y-t*v.z;
 return normalize(mix(body,rigid,params.y));
}
`;

export function modifyMaterial(material,uniforms,middle=false){
 const result=material.clone();result.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  const extra=middle?'attribute vec2 aProfileMix;varying vec2 vProfileMix;varying vec2 vBodyCoord;':'';
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+curveGLSL+'\n'+extra);
  shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',/* glsl */`
   vec3 growthNormalPoint=position;
   #ifdef USE_SKINNING
   growthNormalPoint=(skinMatrix*vec4(position,1.)).xyz;
   #endif
   objectNormal=growthNormal(objectNormal,growthNormalPoint,aGrowth);
   #ifdef USE_TANGENT
   objectTangent=growthNormal(objectTangent,growthNormalPoint,aGrowth);
   #endif
   #include <defaultnormal_vertex>
  `);
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
   ${middle?'vProfileMix=aProfileMix;vBodyCoord=vec2(uv.x,uGrowthHead-transformed.z);':''}
   transformed=growthPoint(transformed,aGrowth);
   #include <project_vertex>
  `);
  if(middle&&material.map){
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',/* glsl */`#include <common>
    varying vec2 vProfileMix;varying vec2 vBodyCoord;
    float growthHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float growthNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(growthHash(i),growthHash(i+vec2(1,0)),f.x),mix(growthHash(i+vec2(0,1)),growthHash(i+vec2(1,1)),f.x),f.y);}
   `).replace('#include <map_fragment>',/* glsl */`
    vec4 frontColor=texture2D(map,vec2(vBodyCoord.x,1./6.));
    vec4 coreColor=texture2D(map,vec2(vBodyCoord.x,.5));
    vec4 rearColor=texture2D(map,vec2(vBodyCoord.x,5./6.));
    float coreWeight=max(0.,1.-vProfileMix.x-vProfileMix.y);
    vec4 wash=frontColor*vProfileMix.x+coreColor*coreWeight+rearColor*vProfileMix.y;
    float angle=vBodyCoord.x*6.28318530718;
    float broad=growthNoise(vec2(vBodyCoord.y*6.7+cos(angle)*2.,sin(angle)*3.));
    float bristle=growthNoise(vec2(vBodyCoord.y*2.4+sin(angle)*4.,cos(angle)*110.));
    wash.rgb*=1.+coreWeight*((broad-.5)*.24+(bristle-.5)*.07);
    diffuseColor*=wash;
   `);
  }
 };
 result.customProgramCacheKey=()=>`endless-dragon-v1-${material.type}-${middle}-${!!material.map}`;
 return result;
}


/**
 * Render-only interpolation of the authoritative game spine. A bounded
 * Hermite curve can round a steering corner without moving gameplay nodes.
 */
const gait = [
 { wavelength: 4.35, sweep: .44, rise: .035, twist: .035, waveStart: .36, waveFull: 2.85 },
 { wavelength: 7.9, sweep: .73, rise: .05, twist: .045, waveStart: .90, waveFull: 3.85 },
 { wavelength: 6.7, sweep: .40, rise: .15, twist: .086 },
 { wavelength: 9.2, sweep: .46, rise: .63, twist: .14 },
 { wavelength: 9.7, sweep: .36, rise: .45, twist: .10 },
];
const flinchPitch = [.342,-.09,.035,.145,0];
const flinchHeight = [0,-.29,-.32,-.25,0];
const feedNeck = [
 { inner: .92, outer: 2.95, loadY: .15, transferY: -.20, sweep: .62, retreat: .21, advance: .28 },
 { inner: 1.55, outer: 4.40, loadY: .38, transferY: -.48, sweep: .38, retreat: .40, advance: .66 },
 { inner: 1.73, outer: 4.20, loadY: .43, transferY: -.54, sweep: .37, retreat: .27, advance: .42 },
];
const castNeck = [
 { gather: .66, dip: .38, near: .94, far: 2.78 },
 { gather: .40, dip: .58, near: 1.18, far: 3.66 },
];

function roundTurns(points, spacing, turns) {
 const rounded=new THREE.Vector3();
 for(const turn of turns){
  const from=Math.max(1,Math.floor((turn.station-turn.window)/spacing));
  const to=Math.min(points.length-2,Math.ceil((turn.station+turn.window)/spacing));
  if(to-from<4)continue;
  const start=points[from],end=points[to];
  const handle=Math.min(turn.handle,start.distanceTo(end)*.52);
  const entry=start.clone().sub(points[from-1]).setLength(handle).add(start);
  const exit=end.clone().sub(points[to+1]).setLength(handle).add(end);
  const arc=new THREE.CubicBezierCurve3(start,entry,exit,end);
  for(let i=from+1;i<to;i++)points[i].lerp(arc.getPoint((i-from)/(to-from),rounded),turn.strength);
 }
}

export class DisplaySpine extends THREE.Curve {
 constructor(){
  super();
  this.points=[];
  this.tangents=[];
  this.stations=[];
  this.waveWeights=[];
  this.bendOffsets=[];
  this.rounded=[];
  this.turns=[];
  this.waveSide=new THREE.Vector3();
  this.bodyPose={side:0,lift:0,advance:0,roll:0};
  this.derivative=new THREE.Vector3();
  this.heading=new THREE.Vector3();
  this.headTangent=new THREE.Vector3();
  this.incoming=new THREE.Vector3();
  this.outgoing=new THREE.Vector3();
  this.side=new THREE.Vector3();
  this.up=new THREE.Vector3(0,1,0);
  this.offset=new THREE.Vector3();
 }
 set(source,heading,scale,motion,stage,grownHip){
  const usable=[];
  for(let index=0;index<source.length;index++){
   const point=source[index];
   if(!Number.isFinite(point.x+point.y+point.z))continue;
   const prior=usable.at(-1)?.point;
   if(!prior||Math.hypot(point.x-prior.x,point.y-prior.y,point.z-prior.z)>1e-5)usable.push({point,index});
  }
  if(!usable.length)return false;

  this.scale=scale;
  this.motion=motion;
  this.gait=gait[stage];
  this.stage=stage;
  this.hipStation=grownHip;
  this.collar=.26*scale;
  const count=Math.max(2,usable.length);
  this.heading.set(-Math.sin(heading),0,-Math.cos(heading));
  const { anticipate, strike, recoil, drive, phase }=motion;
  const look=stage<4?motion.aimYaw*.20:0;
  const scan=Math.sin(phase*.52+stage*.65)*(.038-.023*drive)*(1-anticipate)*(1-strike);
  const headYaw=heading+look+scan;
  const hover=motion.air*(1-drive)*(.06+.025*Math.sin(phase*.9));
  const swallow=.093*motion.swallow;
  const lift=stage<4?motion.aimPitch*.20:0;
  const loads=[.135,.20,.245,.31,.16];
  const dives=[.105,.18,.26,.32,.15];
  const pitch=clamp(motion.pitch+(motion.attackPitch??0)+lift+hover+anticipate*loads[stage]-strike*dives[stage]
   -.035*motion.surge-swallow+recoil*.11+motion.flinch*flinchPitch[stage]-.055*motion.change,-.65,.65);
  this.headSlope=-Math.tan(pitch);
  const castAge=motion.castAge??Infinity;
  const gather=smooth(-.24,-.085,castAge)*(1-smooth(-.035,.022,castAge));
  const dip=smooth(0,.079,castAge)*(1-smooth(.174,.316,castAge));
  const neckCast=castNeck[stage];
  this.castBend=neckCast?neckCast.gather*gather+neckCast.dip*dip:0;
  const gripAge=motion.contactAge;
  this.hookLean=stage===3&&motion.action?.hooked
   ?motion.clawSide*smooth(.012,.072,gripAge)*(1-smooth(.136,.305,gripAge)):0;
  this.headTangent.set(-Math.sin(headYaw),this.headSlope,-Math.cos(headYaw)).normalize();
  while(this.points.length<count){this.points.push(new THREE.Vector3());this.tangents.push(new THREE.Vector3());this.bendOffsets.push(new THREE.Vector3());this.rounded.push(new THREE.Vector3());}
  this.points.length=this.tangents.length=this.stations.length=this.waveWeights.length=this.bendOffsets.length=this.rounded.length=count;
  for(const offset of this.bendOffsets)offset.set(0,0,0);
  this.turns.length=0;
  const spacing=.65*(1+stage*.08);
  const tail=motion.tailAttack;
  const tailReach=tail ? .44+.33*smooth(8,27,motion.length) : 0;
  for(let i=0;i<count;i++){
   const sample=usable[Math.min(i,usable.length-1)],point=sample.point;
   const current=this.points[i].set(point.x,point.y,point.z);
   this.stations[i]=(sample.index+(i>=usable.length?1:0))*spacing/scale;
   this.waveWeights[i]=1;
   if(usable.length===1&&i===1)current.addScaledVector(this.heading,spacing);
   if(i>0&&usable[i]){
    const previous=usable[i-1].point,next=usable[i+1]?.point;
    this.incoming.set(point.x-previous.x,point.y-previous.y,point.z-previous.z);
    if(tail){
     const station=sample.index/Math.max(1,source.length-1);
     const weight=smooth(.39,.72,station)*(1-.24*smooth(.92,1,station));
     const beat=(tail.release?1:0)+(tail.age-(station-.74)*.17)/Math.max(.12,tail.windup);
     const swing=beat<.58?-.55*smooth(0,.58,beat):beat<1?-.55+1.55*smooth(.58,1,beat):1-smooth(1,2.56,beat);
     const amount=weight*swing*tailReach*(tail.hit===false?.72:1);
     this.waveSide.set(-this.incoming.z,0,this.incoming.x).normalize();
     current.addScaledVector(this.waveSide,amount*tail.side);
     current.y+=Math.abs(amount)*(stage<2?.23:.32);
    }
    if(next){
     this.outgoing.set(next.x-point.x,next.y-point.y,next.z-point.z);
     const straightness=this.incoming.dot(this.outgoing)/Math.max(this.incoming.length()*this.outgoing.length(),1e-8);
     const station=this.stations[i];
     const hipOffset=(station-grownHip)*scale;
     const longTurn=stage===3&&motion.attackKind!=='claw'&&!motion.clawSurface&&!tail
      ?smooth(15,25,motion.length)*smooth(-1.8,-.75,hipOffset)*(1-smooth(2.0,3.4,hipOffset)):0;
     if((stage<2||longTurn>0)&&i>1&&i<count-2){
      const strength=stage<2
       ?(1-smooth(-.36,.18,straightness))*smooth(-.84,-.48,straightness)
       :.65*longTurn*(1-smooth(.48,.72,straightness))*smooth(-.84,-.36,straightness);
      if(strength>.006){
       const angle=Math.acos(clamp(straightness,-1,1));
       const radius=stage===0?.72:.88;
       const window=(stage===3?1.65:clamp(radius*Math.tan(angle*.5),.9,1.45))/scale;
       const handle=stage===3?window*.47:4/3*radius*Math.tan(angle*.25)/scale;
       const turn={station,window,handle,strength};
       const last=this.turns.at(-1);
       if(!last||turn.station-last.station>=turn.window+last.window)this.turns.push(turn);
       else if(turn.strength>last.strength)this.turns[this.turns.length-1]=turn;
      }
     }
     this.offset.copy(this.outgoing).sub(this.incoming).multiplyScalar(.21);
     this.offset.clampLength(0,stage<2?.16:.23);
     current.add(this.offset);
     const cusp=1-smooth(-.96,-.43,straightness);
     if(cusp>.001)this.separateTurn(i,count,cusp);
     this.waveWeights[i]=smooth(-.82,.64,straightness);

    }
   }
  }
  for(let i=0;i<count;i++){
   const offset=this.bendOffsets[i];
   this.waveWeights[i]*=1-.66*smooth(.04,.35,offset.length());
   this.points[i].add(offset.clampLength(0,stage<2?.46:.68)).divideScalar(scale);
  }

  for(const weight of [.26,.21]){
   for(let i=1;i<count-1;i++){
    const point=this.points[i];
    this.rounded[i].copy(point).lerp(this.offset.copy(this.points[i-1]).lerp(this.points[i+1],.5),
     weight*(1.45-.65*this.waveWeights[i]));
   }
   for(let i=1;i<count-1;i++)this.points[i].copy(this.rounded[i]);
  }

  for(let i=0;i<count;i++){
   const tangent=this.tangents[i];
   if(i===0){
    this.incoming.subVectors(this.points[1],this.points[0]);
    const length=this.incoming.length();
    // The nose can turn before the travelled trail rounds the corner.
    // Keep the centreline tangent travelling towards its first sample.
    tangent.copy(this.incoming).normalize().lerp(this.heading,.26)
     .normalize().multiplyScalar(length*.80);
    continue;
   }
   this.incoming.subVectors(this.points[i],this.points[i-1]);
   if(i===count-1){tangent.copy(this.incoming);continue;}
   this.outgoing.subVectors(this.points[i+1],this.points[i]);
   const length=Math.min(this.incoming.length(),this.outgoing.length());
   this.incoming.normalize();
   this.outgoing.normalize();
   const angle=this.incoming.dot(this.outgoing);
   tangent.copy(this.incoming).add(this.outgoing);
   // A reversed trail can contain two segments on top of each other.
   // A short lateral tangent keeps the render curve's frame defined at the cusp.
   if(tangent.lengthSq()<.0025){
    tangent.crossVectors(this.incoming,this.up);
    if(tangent.lengthSq()<1e-8)tangent.set(1,0,0);
   }
   tangent.normalize().multiplyScalar(length*(.22+.70*smooth(-1,.65,angle)));
  }
  this.needsUpdate=true;
  return true;
 }
 separateTurn(index,count,strength){
  // The trail may double back into itself within one physics node. Separate
  // the arriving and leaving branches over a few samples instead of pushing
  // a single knot sideways, which can turn the surface frame through itself.
  this.side.crossVectors(this.incoming,this.up).normalize();
  this.side.multiplyScalar(1-this.motion.air*.59);
  this.side.y=-this.motion.air*.92;
  for(let offset=-3;offset<=3;offset++){
   const i=index+offset;
   if(i<=0||i>=count)continue;
   const taper=smooth(0,2,i);
   const lane=Math.sin(offset*Math.PI/4)*(1-smooth(2,4,Math.abs(offset)))*(this.stage<2?.42:.60);
   this.bendOffsets[i].addScaledVector(this.side,lane*strength*taper);
  }
 }
 getPoint(t,target=new THREE.Vector3()){
  const cursor=clamp(t)*(this.points.length-1);
  const index=Math.min(this.points.length-2,Math.floor(cursor));
  return this.segment(index,cursor-index,target);
 }
 atDistance(distance,target=new THREE.Vector3()){
  const end=this.stations.length-1;
  if(distance>=this.stations[end]){
   this.derivative.copy(this.tangents[end]).normalize();
   target.copy(this.points[end]).addScaledVector(this.derivative,distance-this.stations[end]);
   return this.undulate(target,distance,1);
  }
  let a=0,b=end;
  while(b-a>1){
   const middle=(a+b)>>1;
   if(this.stations[middle]<=distance)a=middle;
   else b=middle;
  }
  const fraction=clamp((distance-this.stations[a])/(this.stations[b]-this.stations[a]));
  this.segment(a,fraction,target);
  this.segmentDerivative(a,fraction,this.derivative);
  return this.undulate(target,distance,THREE.MathUtils.lerp(this.waveWeights[a],this.waveWeights[b],fraction));
 }
 segment(index,u,target){
  const u2=u*u,u3=u2*u;
  return target.copy(this.points[index]).multiplyScalar(2*u3-3*u2+1)
   .addScaledVector(this.tangents[index],u3-2*u2+u)
   .addScaledVector(this.points[index+1],3*u2-2*u3)
   .addScaledVector(this.tangents[index+1],u3-u2);
 }
 segmentDerivative(index,u,target){
  const u2=u*u;
  // The derivative of the two endpoints uses their difference to avoid subtracting world positions.
  return target.subVectors(this.points[index+1],this.points[index]).multiplyScalar(6*u*(1-u))
   .addScaledVector(this.tangents[index],3*u2-4*u+1)
   .addScaledVector(this.tangents[index+1],3*u2-2*u);
 }
 undulate(target,distance,weight){
  const s=distance*this.scale;
  const { phase, drive, flowDrive, surge, air, recoil, swallow, change, anticipate, strike, grip, chestLoad, flinch, flinchSide,
   arrivalStroke }=this.motion;
  const { wavelength, sweep, rise, waveStart=.48, waveFull=3.3 }=this.gait;
  const beat=spineBeat(this.motion,this.stage,s,this.collar,this.hipStation*this.scale,this.motion.length,this.bodyPose);
  const wave=TAU*s/wavelength-phase-.89*beat.swim;
  const envelope=smooth(waveStart,waveFull,s)*(.14+.86*smooth(.5,10,s))*weight;
  const rest=this.stage===4?1-.82*arrivalStroke.hold:1;
  const retainedDrive=THREE.MathUtils.lerp(drive,flowDrive,smooth(3,12,s));
  const strength=(.12+.84*retainedDrive+.22*surge+.88*beat.swim)*rest;
  // Broad bends run down the spine and gain amplitude toward the tail.
  this.waveSide.crossVectors(this.derivative,this.up);
  if(this.waveSide.lengthSq()>1e-9){
   this.waveSide.normalize();
   target.addScaledVector(this.waveSide,Math.sin(wave)*envelope*sweep*strength/this.scale);
  }
  let heaveWeight=1;
  if(this.stage===3){
   // The hips take part in the stroke, with a gentler rise through the
   // longer waist. The same wave carries on into the tail.
   const hip=this.hipStation*this.scale;
   const waist=smooth(hip-5,hip-2,s)*(1-smooth(hip+3.2,hip+6.2,s));
   heaveWeight-=.32*smooth(13,25,this.motion.length)*waist;
  }
  const heave=Math.cos(wave-.9)*rise*envelope*(.3+.7*drive+.35*beat.swim)*rest*heaveWeight;
  const shoulder=smooth(0,1.1,s)*(1-smooth(2,4.4,s));
  const {rise:wingRise,recover}=this.motion.wingStroke;
  const wingLift=this.stage===4?THREE.MathUtils.lerp(this.motion.wingPower*(.66*wingRise-.18*recover),
   (.54*arrivalStroke.rise-.12*arrivalStroke.recover)*rest,arrivalStroke.blend):0;
  const breath=(Math.sin(phase*.7)*(.10-.025*drive)+surge*.08-recoil*.22
   +swallow*.09+change*.18+wingLift)*shoulder;
  const nape=smooth(0,.18,distance)*(1-smooth(.21,.52,distance));
  const effort=this.stage<2?.68:1;
  const thrust=(.53*strike-.40*anticipate-.11*recoil)*nape*effort;
  const collar=smooth(.10,.29,distance)*(1-smooth(.32,.63,distance));
  const driveFromChest=(.67*strike+.16*grip-.45*chestLoad)*collar*effort;
  target.addScaledVector(this.heading,-(thrust+driveFromChest)/this.scale);
  const freeNeck=1-this.castBend;
  const neckLift=((anticipate*.29-strike*.18)*freeNeck+recoil*.08)*nape*effort;
  const shoulders=((.57*chestLoad-.34*strike)*freeNeck+.20*grip)*collar*effort;
  // Give the surface lunge's centreline the same slope as its head frame.
  // The small snake hands the motion back to the trunk over a shorter neck.
  const neckCast=castNeck[this.stage];
  const castHeight=neckCast?this.castBend*this.headSlope*s*(1-smooth(neckCast.near,neckCast.far,s)):0;
  // A single brace spans the front body. Separate opposing neck and
  // shoulder displacements can kink the skin between their peaks.
  const brace = flinch * effort * smooth(0,1.14,s) * (1-smooth(2.25,5.2,s));
  target.addScaledVector(this.waveSide, .31 * brace * flinchSide / this.scale);
  const clearance=.42+.58*weight;
  target.addScaledVector(this.waveSide,beat.side*clearance/this.scale);
  // Transfer weight away from the planted paw and lift its shoulder. The
  // surface anchor keeps the paw in place while the chest clears its path.
  const hook=smooth(.2,1.32,s)*(1-smooth(2.38,4.7,s))*this.hookLean;
  target.addScaledVector(this.waveSide,-.21*hook*clearance/this.scale);
  const localSpeed=this.derivative.length();
  if(localSpeed>1e-8)target.addScaledVector(this.derivative,(.53*brace-beat.advance*clearance)/(localSpeed*this.scale));
  if(this.stage===0&&flinch!==0){
   // Share the small snake's recoil between the head frame and the neck.
   // Let the rear of the bend settle after the skin leaves the rigid skull.
   const settle=1-smooth(2.5,7.2,s);
   const lift=.37*smooth(0,.46,s)+.36*Math.expm1(-s/1.28);
   target.y+=lift*settle*flinch/this.scale;
   const retreat=smooth(0,.63,s)*(1-smooth(1.82,4.35,s));
   target.addScaledVector(this.heading,.14*retreat*flinch/this.scale);
  }
  let feedHeight=0;
  const neck=feedNeck[this.stage];
  const {feedLoad,feedTransfer,feedSide}=this.motion;
  if(neck && s<neck.outer && feedLoad+feedTransfer>.001){
   // Keep the nose on the travelled trail. The cervical bend sweeps beside
   // it on a short stroke or carries the heavier swallow farther into the body.
   const profile=smooth(0,neck.inner,s)*(1-smooth(neck.inner,neck.outer,s))*clearance/this.scale;
   const across=neck.sweep*(feedTransfer-.32*feedLoad)*feedSide;
   target.addScaledVector(this.waveSide,across*profile);
   if(localSpeed>1e-8)target.addScaledVector(this.derivative,(neck.retreat*feedLoad-neck.advance*feedTransfer)*profile/localSpeed);
   feedHeight=(neck.loadY*feedLoad+neck.transferY*feedTransfer)*profile;
  }
  if(this.stage===3&&this.motion.attackKind==='eat'){
   // Carry the downward bite from the jaw into the longer chest arc.
   const transfer=smooth(.05,.15,this.motion.attackAge)*(1-smooth(.21,.42,this.motion.attackAge));
   target.y+=.31*transfer*s*(1-smooth(.83,4.65,s))/this.scale;
  }
  const throat=swallow*(1-smooth(.12,.82,Math.abs(s-this.motion.swallowStation)))*smooth(.10,.76,s);
  const sip=-.23*throat;
  if(this.stage===1)target.addScaledVector(this.waveSide,.26*throat*feedSide/this.scale);
  const impact=this.motion.impact;
  let reaction=0;
  if(impact?.station!=null){
   const arrived=impact.age-Math.abs(s-impact.station)/Math.max(17, this.motion.length*1.31);
   if(arrived>0&&arrived<.47){
    reaction=Math.sin(arrived*13)*Math.exp(-arrived*5.4)*impact.strength*smooth(.08,.80,s);
    target.addScaledVector(this.waveSide,.57*reaction*clearance/this.scale);
   }
  }
  target.y+=(heave*(this.stage<2?1:.35+.65*air)+breath+neckLift+shoulders+castHeight+flinchHeight[this.stage]*brace+
   beat.lift*clearance+sip-.28*reaction)/this.scale;
  target.y+=feedHeight;
  return target;
 }
 steerFrame(distance,tangent){
  if(distance>=.47)return;
  const yaw=Math.atan2(tangent.x,tangent.z);
  const goal=Math.atan2(this.headTangent.x,this.headTangent.z);
  const delta=Math.atan2(Math.sin(goal-yaw),Math.cos(goal-yaw));
  const weight=1-smooth(.088,.34+.13*smooth(.55,2.5,Math.abs(delta)),distance);
  if(weight===0)return;
  const angle=yaw+delta*weight;
  const pitch=THREE.MathUtils.lerp(Math.asin(clamp(tangent.y,-1,1)),Math.asin(this.headTangent.y),weight);
  const level=Math.cos(pitch);
  tangent.set(Math.sin(angle)*level,Math.sin(pitch),Math.cos(angle)*level);
 }
 rollAt(distance){
  const s=distance*this.scale;
  const { bank, phase, drive, air, flinch, flinchSide }=this.motion;
  const { wavelength, twist }=this.gait;
  const local=twist*Math.sin(TAU*s/wavelength-phase+.6)*smooth(.6,3.5,s)*(.3+.7*drive);
  const beat=spineBeat(this.motion,this.stage,s,this.collar,this.hipStation*this.scale,this.motion.length,this.bodyPose);
  const brace = .26 * flinch * flinchSide * smooth(.25,1.7,s) * (1-smooth(2.4,6.1,s));
  const hook = -.24*this.hookLean*smooth(.2,1.38,s)*(1-smooth(2.45,5.1,s));
  return bank*Math.exp(-s*(.16+.14*(1-air)))+local+beat.roll+brace+hook;
 }
}

export class CurveField {
 constructor(renderer,headZ=.5){this.renderer=renderer;this.headZ=headZ;this.time=0;this.pose='s';this.bend=.7;this.pathPoints=[];this.shared={uGrowthCurve:{value:null},uGrowthSamples:{value:256},uGrowthLength:{value:1},uGrowthExtra:{value:0},uGrowthHip:{value:0},uGrowthHead:{value:headZ},uGrowthA:{value:.38},uGrowthB:{value:.425},uGrowthC:{value:.695},uGrowthD:{value:.745},uGrowthStretch:{value:0}};}
 update(length,time,pose,bend){this.time=time;this.pose=pose;this.bend=bend;this._updatePath(length);}
 _updatePath(length){
  const count=Math.min(this.renderer.capabilities.maxTextureSize,8192,nextPower(Math.max(256,length/.0075)));
  if(!this.curveTexture||count!==this.curveCount){
   this.curveTexture?.dispose();this.curveCount=count;this.curveArray=new Float32Array(count*4*4);this.curveTexture=new THREE.DataTexture(this.curveArray,count,4,THREE.RGBAFormat,THREE.FloatType);this.curveTexture.minFilter=this.curveTexture.magFilter=THREE.NearestFilter;this.shared.uGrowthCurve.value=this.curveTexture;this.shared.uGrowthSamples.value=count;
  }
  const points=[],time=this.time,curve=this.customSpine;let raw=[];
  if(this.pose==='s'&&!curve){
   const n=Math.min(8192,Math.max(512,Math.ceil(length/.008))),step=length*1.25/(n-1);let arc=0,last=null;
   for(let i=0;i<n;i++){
    const u=i*step,ease=smooth(0,.28,u),a=.20*this.bend,k=TAU/1.65;
    const p=new THREE.Vector3(a*(Math.sin(k*u-time*.40)-Math.sin(-time*.40))*ease,.028*this.bend*(Math.sin(k*u*.45-time*.25)-Math.sin(-time*.25))*ease,this.headZ-u);
    if(last)arc+=p.distanceTo(last);raw.push({arc,p});last=p;
   }
   let index=0;for(let i=0;i<count;i++){const d=i/(count-1)*length;while(index<raw.length-2&&raw[index+1].arc<d)index++;const a=raw[index],b=raw[index+1];points.push(a.p.clone().lerp(b.p,(d-a.arc)/Math.max(b.arc-a.arc,1e-9)));}
  }else if(curve?.atDistance){
   for(let i=0;i<count;i++)points.push(curve.atDistance(i/(count-1)*length,this.pathPoints[i]));
  }else if(curve){
   curve.arcLengthDivisions=Math.max(384,count);
   curve.updateArcLengths();
   const full=curve.getLength(),tail=curve.getPointAt(1),tangent=curve.getTangentAt(1);
   for(let i=0;i<count;i++){
    const d=i/(count-1)*length;
    points.push(full>1e-8&&d<=full?curve.getPointAt(d/full):tail.clone().addScaledVector(tangent,d-full));
   }
  }
  else for(let i=0;i<count;i++){
   const d=i/(count-1)*length;
   if(this.pose==='coil'){const radius=.32+.10*(1-this.bend),pitch=.18/TAU,theta=d/Math.hypot(radius,pitch);points.push(new THREE.Vector3(radius*(1-Math.cos(theta)),pitch*theta,this.headZ-radius*Math.sin(theta)));}
   else points.push(new THREE.Vector3(0,0,this.headZ-d));
  }
  let previousT=null;
  const n=new THREE.Vector3(1,0,0),t=new THREE.Vector3(),displayNormal=new THREE.Vector3(),b=new THREE.Vector3();
  const q=new THREE.Quaternion(),worldUp=new THREE.Vector3(0,1,0),desired=new THREE.Vector3(),cross=new THREE.Vector3();
  const sampleArc=length/Math.max(1,count-1);
  // Ease the acute section of the centreline before deriving its skin frame.
  if(curve?.turns?.length)roundTurns(points,sampleArc,curve.turns);
  const frameStep=curve?.atDistance?Math.max(1,Math.round(.28/(curve.scale*sampleArc))):1;
  const maxBend=curve?.atDistance?sampleArc*curve.scale*(curve.stage<2?5.0:3.9):Math.PI;
  const bendCos=Math.cos(maxBend);
  for(let i=0;i<count;i++){
   t.subVectors(points[Math.min(count-1,i+frameStep)],points[Math.max(0,i-frameStep)]);
   if(t.lengthSq()<1e-12)t.copy(previousT||new THREE.Vector3(0,0,-1));
   t.normalize();
   curve?.steerFrame?.(i/(count-1)*length,t);
   if(previousT&&previousT.dot(t)<bendCos){
    // A narrow backtrack must turn the painted cross section over an arc.
    // A discontinuous tangent can flip the shoulder into the same skin.
    cross.crossVectors(previousT,t);
    if(cross.lengthSq()<1e-9)cross.copy(n);
    t.copy(previousT).applyAxisAngle(cross.normalize(),maxBend);
   }
   if(previousT&&previousT.dot(t)>-.998)n.applyQuaternion(q.setFromUnitVectors(previousT,t));
   else{
    n.crossVectors(t,worldUp);
    if(n.lengthSq()<1e-6)n.set(1,0,0);
   }
   n.addScaledVector(t,-n.dot(t)).normalize();
   desired.crossVectors(t,worldUp);
   if(previousT&&desired.lengthSq()>.02){
    desired.normalize();
    const angle=Math.atan2(t.dot(cross.crossVectors(n,desired)),clamp(n.dot(desired),-1,1));
    n.applyAxisAngle(t,angle*(1-Math.exp(-2*length/(count-1))));
   }
   displayNormal.copy(n);
   const roll=curve?.rollAt?.(i/(count-1)*length)??0;
   if(roll)displayNormal.applyAxisAngle(t,roll);
   b.crossVectors(displayNormal,t).normalize();
   for(const [row,value] of [[0,points[i]],[1,t],[2,displayNormal],[3,b]]){
    const k=(row*count+i)*4;
    this.curveArray[k]=value.x;this.curveArray[k+1]=value.y;this.curveArray[k+2]=value.z;this.curveArray[k+3]=1;
   }
   if(previousT)previousT.copy(t);else previousT=t.clone();
  }
  this.pathPoints=points;this.curveTexture.needsUpdate=true;this.shared.uGrowthLength.value=length;
 }

 sampleFrame(distance){
  const f=clamp(distance/this.shared.uGrowthLength.value)*(this.curveCount-1),i=Math.floor(f),j=Math.min(i+1,this.curveCount-1),w=f-i;
  const row=r=>new THREE.Vector3().fromArray(this.curveArray,(r*this.curveCount+i)*4).lerp(new THREE.Vector3().fromArray(this.curveArray,(r*this.curveCount+j)*4),w);
  const p=row(0),t=row(1).normalize(),n=row(2);n.addScaledVector(t,-n.dot(t)).normalize();return{p,t,n,b:new THREE.Vector3().crossVectors(n,t).normalize()};
 }
}
