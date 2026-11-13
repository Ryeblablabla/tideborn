import * as THREE from 'three';
import { seaWind } from './sea-weather.js';

const CONTACT_CAPACITY = 3;
const CONTACT_LIFE = 1.85;
const WAKE_LIFE = 2.15;
const HULL_SEGMENTS = 10;
const TURN_LIMIT = 3;
const TURN_LIFE = 1.20;
const DEPARTURE_GAP = 1.10;
const ENTRY_SPEED = 6.9;
const ENTRY_DRIFT = .35;
const SHEET_ROWS = 14;
const SPRAY_STROKES = 23;
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;

export const contactWashGLSL = /* glsl */ `
  uniform vec4 uContacts[${CONTACT_CAPACITY}];
  uniform vec4 uContactFlow[${CONTACT_CAPACITY}];
  uniform vec4 uHullSpan[${HULL_SEGMENTS}],uHullParams[${HULL_SEGMENTS}];
  uniform vec4 uHullBow,uHullTravel,uHullBounds;

  vec3 hullWashAt(vec2 p,float grain) {
    if(any(lessThan(p,uHullBounds.xy))||any(greaterThan(p,uHullBounds.zw)))return vec3(0.);
    vec3 wash=vec3(0.);
    float closest=1e5;
    for(int i=0;i<${HULL_SEGMENTS};i++){
      vec4 span=uHullSpan[i],shape=uHullParams[i];
      if(max(shape.x,shape.y)<.012) continue;
      vec2 rel=p-span.xy, axis=span.zw-span.xy;
      if(max(abs(rel.x),abs(rel.y))>max(abs(axis.x),abs(axis.y))+3.7) continue;
      float along=clamp(dot(rel,axis)/max(.0001,dot(axis,axis)),0.,1.);
      vec2 side=rel-axis*along;
      float dist=length(side);
      float load=mix(shape.x,shape.y,along);
      if(dist>=closest||load<.008)continue;
      closest=dist;
      float r=dist/mix(shape.z,shape.w,along);
      float fiber=washNoise(vec2(float(i)*1.21+along*1.21,r*1.27-uTime*.68));
      float edge=r-1.+(fiber-.5)*.16;
      float bank=(1.-smoothstep(.10,.48,abs(edge)))*(.63+.37*fiber);
      float foam=(1.-smoothstep(.022,.20,abs(edge-.09)))*smoothstep(.19,.59,.70*fiber+.30*grain);
      float washout=1.-smoothstep(.52,1.86,r);
      wash=vec3(bank*.72,foam*.79,washout)*load;
    }
    if(uHullBow.z>.012){
      vec2 q=p-uHullBow.xy;
      float along=dot(q,uHullTravel.xy), across=dot(q,vec2(uHullTravel.y,-uHullTravel.x));
      float open=1.-smoothstep(uHullBow.w*.55,uHullBow.w,abs(across));
      float edge=along-uHullTravel.z+.28*across*across;
      if(abs(edge)<1.15&&open>.01){
        float fiber=washNoise(vec2(across*1.22,uTime*.58));
        float width=.40+(fiber-.5)*.18;
        float arc=(1.-smoothstep(.076,width,abs(edge)))*open*uHullBow.z;
        float foam=(1.-smoothstep(.028,.15,abs(edge-.07)))*smoothstep(.27,.67,fiber*.73+grain*.27);
        wash=max(wash,vec3(arc*.77,foam*open*uHullBow.z*.82,arc*.78));
      }
    }
    return wash;
  }

  vec2 contactWashAt(vec2 p, float grain) {
    vec2 wash=vec2(0.);
    for(int i=0;i<${CONTACT_CAPACITY};i++){
      vec4 impact=uContacts[i], flow=uContactFlow[i];
      if(impact.w<=0.) continue;
      vec2 delta=p-impact.xy;
      bool entry=flow.w>.5;
      float extent=entry?3.4+impact.z*10.6:2.5+impact.z*7.9;
      if(max(abs(delta.x),abs(delta.y))>extent) continue;
      vec2 side=vec2(flow.y,-flow.x);
      float along=dot(delta,flow.xy)-impact.z*flow.z*(entry?${ENTRY_DRIFT}:.22);
      float across=dot(delta,side);
      float widen=entry?1.08+.48*flow.z*.15:mix(1.03,1.42,flow.z*.15);
      float radius=length(vec2(along/widen,across));
      float crest=.78+impact.z*(entry?${ENTRY_SPEED.toFixed(1)}:5.5);
      float width=entry?.63+impact.z*.68:.52+impact.z*.65;
      float broad=washNoise(vec2(along*.43-impact.z,across*.65+float(i)*7.));
      float wetEdge=1.-smoothstep(width*.27,width*1.63,abs(radius-crest)+(broad-.5)*.38);
      float downstream=smoothstep(-.72,.92,along/(1.+impact.z*1.3));
      float opening=mix(entry?.08:.50,1.,downstream);
      float shell=wetEdge*opening;
      float forks=1.-smoothstep(.18,.78,abs(abs(across)-(.58+max(0.,along)*.40)));
      forks*=smoothstep(-1.25,.14,along)*(1.-smoothstep(1.6,4.1+impact.z*2.,along));
      float ageFade=1.-smoothstep(.22,1.85,impact.z);
      float force=impact.w*ageFade;
      float trough=entry?(1.-smoothstep(.25,.98,abs(radius-crest+width*.77)))*opening*.19:0.;
      float pooled=shell*(.40+.55*broad)+forks*.46+trough;
      float flying=1.-smoothstep(.055,.245,abs(radius-crest-.20+(broad-.5)*.28));
      float fractured=smoothstep(.23,.67,broad*.74+grain*.26);
      wash.x=max(wash.x,pooled*force*(entry?.99:.61));
      wash.y=max(wash.y,(flying*opening*(entry?1.10:.71)+forks*.70)*fractured*force);
    }
    return clamp(wash,0.,.99);
  }
`;

const vertexShader = /* glsl */ `
  attribute vec4 aContactBrush;
  varying vec4 vBrush;
  void main(){
    vBrush=aContactBrush;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec4 vBrush;
  uniform float uTime;
  float hash(vec2 p){
    p=fract(p*vec2(.1031,.11369));
    p+=dot(p,p.yx+19.19);
    return fract(p.x*p.y);
  }
  float wash(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
      mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  void main(){
    float u=vBrush.x,s=vBrush.y,seed=abs(vBrush.z);
    float droplet=step(vBrush.z,0.);
    float pooled=wash(vec2(u*7.-uTime*.63,s*5.+seed));
    float bristle=wash(vec2(u*13.-uTime*.98,s*27.+seed*2.81));
    float ragged=wash(vec2(u*24.-uTime*.8,s*15.+seed*7.2));
    float tapered=smoothstep(0.,.095,u)*smoothstep(0.,.16,1.-u);
    float fringe=1.-smoothstep(.61,.99,abs(s)+(pooled-.44)*.30);
    float coverage=vBrush.w*tapered*fringe*(.68+.32*ragged);
    if(coverage<.012) discard;
    float outer=smoothstep(-.23,.75,s+.21*(pooled-.5));
    float paper=max(outer*.80,smoothstep(.35,.74,bristle)*.74);
    paper=max(paper,droplet*(1.-smoothstep(.33,.93,abs(s)))*.95);
    float ink=mix(.78,.34,outer)*(.85+.24*pooled);
    ink=mix(ink,.44+.18*pooled,droplet);
    gl_FragColor=vec4(1.-ink,paper,bristle,coverage);
  }
`;

function createBatch(capacity, name) {
  const vertices = capacity * (2 * (SHEET_ROWS + 1) * 3 + SPRAY_STROKES * 6);
  const indices = capacity * (2 * SHEET_ROWS * 12 + SPRAY_STROKES * 12);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3)
    .setUsage(THREE.DynamicDrawUsage);
  const brush = new THREE.BufferAttribute(new Float32Array(vertices * 4), 4)
    .setUsage(THREE.DynamicDrawUsage);
  const index = new THREE.BufferAttribute(new Uint16Array(indices), 1)
    .setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aContactBrush', brush);
  geometry.setIndex(index);
  geometry.setDrawRange(0,0);
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent:true, depthWrite:false,
    side:THREE.DoubleSide, forceSinglePass:true,
    uniforms:{uTime:{value:0}},
  }));
  mesh.name = name;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = -6;
  mesh.userData.inkIdSuppressed = true;
  return { mesh, position, brush, index };
}

export class WaterSplashBatch {
  constructor(capacity,name) {
    this.batch=createBatch(capacity,name);
    this.mesh=this.batch.mesh;
    this.indexCount=0;
  }

  vertex(x,y,z,u,s,seed,opacity) {
    const i=this.vertexCount++;
    this.batch.position.setXYZ(i,x-this.water.x,this.water.z-z,y-this.water.y);
    this.batch.brush.setXYZW(i,u,s,seed,opacity);
  }

  face(a,b,c,d) {
    const target=this.batch.index.array;
    const i=this.indexCount;
    target[i]=a;target[i+1]=b;target[i+2]=c;
    target[i+3]=b;target[i+4]=d;target[i+5]=c;
    this.indexCount+=6;
  }

  shapedSheet(event, sign) {
    const {age,strength,fx,fz,pulse,sheet}=event;
    const plunge=sheet.kind==='plunge';
    const breaking=sheet.kind==='breaking';
    const rise=smooth(age,0,plunge?.10:.094)*(1-smooth(age,plunge?.16:.21,plunge?.48:.58));
    if(rise<.015)return;
    const split=sheet.kind==='split';
    const seed=event.id*2.19+sign*.29;
    const front=plunge?.78+age*ENTRY_SPEED:pulse.front;
    const drift=plunge?age*event.speed*ENTRY_DRIFT:0;
    const reach=plunge?1.08+.48*event.speed*.15:1;
    for(let row=0;row<=SHEET_ROWS;row++){
      const u=row/SHEET_ROWS;
      const arch=Math.sin(Math.PI*u);
      const span=.16+.98*u;
      const sweep=sign*(breaking?.13+u*(sign>0?1.07:1.31):plunge?.07+u*(sign>0?1.52:1.23):.40+u*(sign>0?2.06:1.67));
      const ca=Math.cos(sweep),sa=Math.sin(sweep);
      const along=split?(sheet.head-span)*front:drift+ca*front*reach*(breaking?1.31:1);
      const across=split?sign*(sheet.start+sheet.spread*span-sheet.curl*span*span)*front:sa*front;
      const crown=event.y+.062+rise*sheet.height*strength*arch**.80*(.83+.17*Math.sin(u*7+sign*.86));
      const width=(breaking?.36:plunge?.34:split?.20:.17)*arch**.69*(.65+strength*.38);
      const opacity=rise*(.72+.26*strength)*(.84+.16*arch);
      const start=this.vertexCount;
      for(let j=0;j<3;j++){
        const side=j-1, offset=side*width;
        const a=along+offset*(split?-.38:ca),b=across+offset*(split?sign:sa);
        this.vertex(event.x+fx*a+fz*b,crown+offset*(.44-.19*u),
          event.z+fz*a-fx*b,u,side,seed,opacity);
      }
      if(row>0){
        this.face(start-3,start-2,start,start+1);
        this.face(start-2,start-1,start+1,start+2);
      }
    }
  }

  sheet(event, sign) {
    if(event.sheet){
      this.shapedSheet(event,sign);
      return;
    }
    const {age,strength,fx,fz}=event;
    const rise=smooth(age,0,.135)*(1-smooth(age,.29,.85));
    if(rise<.015) return;
    const entry=event.kind==='entry'||event.kind==='impact';
    const dash=event.kind==='dash';
    const sideX=fz*sign,sideZ=-fx*sign;
    const drift=age*event.speed*.42;
    const lift=rise*strength*(dash?1.38:entry?1.96:1.13);
    const seed=event.id*2.19+sign*.29;
    const reach=(.96+age*3.4)*(event.spread??1);
    for(let row=0;row<=SHEET_ROWS;row++) {
      const u=row/SHEET_ROWS;
      const arch=Math.sin(Math.PI*u);
      const along=drift+(u*.88-.18)*(1.45+reach)*(dash?1.40:1);
      const across=.25+u*reach*1.48+arch*.57;
      const crown=event.y+.15+lift*arch**.82*(.81+.18*Math.sin(u*8+sign*.7));
      const width=arch**.52*(.51+.51*u)*strength;
      const opacity=rise*(.64+.34*strength)*(1-.14*u);
      const start=this.vertexCount;
      for(let j=0;j<3;j++) {
        const side=j-1;
        const sweep=side*width;
        this.vertex(
          event.x+fx*(along-sweep*.48)+sideX*(across+sweep),
          crown+sweep*(.24+.42*u)-sweep*sweep*.14,
          event.z+fz*(along-sweep*.48)+sideZ*(across+sweep),
          u,side,seed,opacity,
        );
      }
      if(row>0) {
        this.face(start-3,start-2,start,start+1);
        this.face(start-2,start-1,start+1,start+2);
      }
    }
  }

  spray(event) {
    const {age,strength,fx,fz}=event;
    const radial=event.sheet?.kind==='well';
    const plunge=event.sheet?.kind==='plunge'||event.sheet?.kind==='breaking';
    const throwHeight=event.sheet?Math.min(1.20,.58+.34*event.sheet.height):1;
    const count=['entry','impact','dash'].includes(event.kind)?SPRAY_STROKES:12;
    for(let i=0;i<count;i++) {
      const t=age-(i%6)*.036;
      if(t<=0||t>.77) continue;
      const seed=(event.id*59+i*41)*.0197;
      const sample=(i*.61803398875)%1;
      const sign=i%2?1:-1;
      const turn=plunge?sign*(.16+sample*1.44):i*2.39996323;
      const spread=event.spread??1;
      const speed=(.75+sample*1.90)*spread;
      const acrossV=radial||plunge?Math.sin(turn)*speed:sign*(.85+sample*2.45)*strength*spread;
      const forwardV=plunge?Math.cos(turn)*speed+event.speed*.39:
        radial?Math.cos(turn)*speed:.63+sample*2.05+event.speed*.44;
      const vy=(1.05+((i*.7351)%1)*1.68)*(.69+.56*strength)*throwHeight;
      const y=event.y+.13+vy*t-3.1*t*t;
      if(y<=event.y+.04) continue;
      const x=event.x+(fx*forwardV+fz*acrossV)*t;
      const z=event.z+(fz*forwardV-fx*acrossV)*t;
      const size=(.065+sample*.118)*strength;
      const opacity=(1-smooth(t,.23,.74))*(.58+.34*sample);
      const start=this.vertexCount;
      for(let row=0;row<3;row++) {
        const u=row*.5;
        const width=row===1?size*.62:size*.05;
        const extension=(u-.5)*size*2.9;
        const tilt=vy-6.2*t;
        for(let j=0;j<2;j++) {
          const s=j*2-1;
          this.vertex(x+extension*fx+s*width*fz,y+extension*tilt,z+extension*fz-s*width*fx,
            u,s*.53,-seed,opacity);
        }
      }
      this.face(start,start+1,start+2,start+3);
      this.face(start+2,start+3,start+4,start+5);
    }
  }

  render(events, time, waterPosition) {
    this.water=waterPosition;
    this.vertexCount=0;
    this.indexCount=0;
    this.mesh.material.uniforms.uTime.value=time;
    for(const event of events) {
      this.sheet(event,-1);
      this.sheet(event,1);
      this.spray(event);
    }
    this.mesh.geometry.setDrawRange(0,this.indexCount);
    this.mesh.visible=this.indexCount>0;
    if(!this.mesh.visible) return;
    this.batch.position.needsUpdate=true;
    this.batch.brush.needsUpdate=true;
    this.batch.index.needsUpdate=true;
  }

}

function impulseAt(x, z, event) {
  const dx=x-event.x, dz=z-event.z;
  const entry=event.kind==='entry';
  const extent=entry?3.4+event.age*10.6:2.5+event.age*7.9;
  if(Math.max(Math.abs(dx),Math.abs(dz))>extent) return 0;
  const along=dx*event.fx+dz*event.fz-event.age*event.speed*(entry?ENTRY_DRIFT:.22);
  const across=dx*event.fz-dz*event.fx;
  const radius=Math.hypot(along/(entry?1.08+.48*event.speed*.15:1.03+.39*event.speed*.15),across);
  const r=(radius-.78-event.age*(entry?ENTRY_SPEED:5.5))/(entry?.63+event.age*.68:.54+event.age*.66);
  const front=THREE.MathUtils.lerp(entry?.08:.50,1,smooth(along/(1+event.age*1.3),-.72,.92));
  const rise=smooth(event.age,0,.12)*(1-smooth(event.age,.28,entry?1.27:CONTACT_LIFE));
  const swell=Math.exp(-r*r*1.35)-(entry?.57:.28)*Math.exp(-((r+.92)**2)*2.6);
  return swell*front*rise*event.strength*(entry?1.16:.30);
}

export class SeaContact {
  constructor() {
    this.events=[];
    this.wake=[];
    this.counts={entry:0,launch:0};
    this.body=null;
    this.hull=Array.from({length:HULL_SEGMENTS+1},()=>({x:0,z:0,load:0,width:1,speed:0}));
    this.hullLength=0;
    this.paintedPoint=new THREE.Vector3();
    this.turns=[];
    this.bow={x:0,z:0,load:0,width:1,fx:0,fz:1,lead:0};
    this.uniforms={
      uContacts:{value:Array.from({length:CONTACT_CAPACITY},()=>new THREE.Vector4())},
      uContactFlow:{value:Array.from({length:CONTACT_CAPACITY},()=>new THREE.Vector4())},
      uHullSpan:{value:Array.from({length:HULL_SEGMENTS},()=>new THREE.Vector4())},
      uHullParams:{value:Array.from({length:HULL_SEGMENTS},()=>new THREE.Vector4())},
      uHullBow:{value:new THREE.Vector4()},uHullTravel:{value:new THREE.Vector4()},
      uHullBounds:{value:new THREE.Vector4(1,1,-1,-1)},
    };
    this.splash=new WaterSplashBatch(CONTACT_CAPACITY,'蛟龙入海 · 浪花');
    this.mesh=this.splash.mesh;
    this.previous=null;
    this.airborne=false;
    this.readyAtSurface=false;
    this.serial=0;
    this.velocity=new THREE.Vector3();
  }

  reset() {
    this.events.length=0;
    this.wake.length=0;
    this.body=null;
    this.hullLength=0;
    this.turns.length=0;
    this.bow.load=0;
    for(const node of this.hull)node.speed=node.load=0;
    this.uniforms.uHullBounds.value.set(1,1,-1,-1);
    this.counts.entry=this.counts.launch=0;
    this.previous=null;
    this.airborne=false;
    this.readyAtSurface=false;
    this.velocity.set(0,0,0);
  }

  poseAt(time,frame,sampleSurface) {
    const p=frame.position,previous=this.previous;
    const dt=previous?time-previous.time:0;
    const entry=this.events.findLast(event=>event.kind==='entry');
    return {height:p.y-sampleSurface(p.x,p.z,time,p),
      vertical:dt>0?(p.y-previous.y)/dt:0,
      impactAge:entry?time-entry.time:Infinity};
  }

  update(time, stage, frame, game, paintedSpine, sampleSurface) {
    const head=frame.position;
    if(stage!==2 || head!==game?.p) {
      if(this.previous) this.reset();
      this.mesh.visible=false;
      this.upload();
      return;
    }
    const old=this.previous;
    if(old && (old.game!==game || time<old.time || Math.hypot(head.x-old.x,head.z-old.z)>7)) this.reset();
    const previous=this.previous;
    const clearance=head.y-sampleSurface(head.x,head.z,time,head);
    const painted=paintedSpine?.stage===stage&&paintedSpine.scale>0;
    const muzzle=painted?frame.seaMuzzle:null;
    const point=muzzle??head;
    const surface=sampleSurface(point.x,point.z,time,head);
    // The contact starts on the lower head envelope of the mapped sculpt.
    // Use an unforced wave sample to avoid re-triggering on our own splash.
    const scale=muzzle?paintedSpine.scale:5.8;
    const draft=scale*.179;
    const gap=point.y-draft-surface;
    // A moving forebody meets the upper edge of a swell over its contact
    // footprint. A near-vertical descent uses only the sculpt's own reach.
    const reach=.078*scale+.19*smooth(Math.hypot(this.velocity.x,this.velocity.z),1.8,6.6);
    const dt=previous ? time-previous.time : 0;
    if(!previous) {
      this.previous={...head,time,game,gap};
      this.readyAtSurface=gap<reach+.14;
      this.airborne=gap>DEPARTURE_GAP;
    } else if(dt>0 && game.status==='playing') {
      const ease=1-Math.exp(-dt*16);
      const dx=head.x-previous.x,dz=head.z-previous.z;
      const vy=(head.y-previous.y)/dt;
      this.trackTurn(time,dt,head,previous,dx,dz,clearance);
      this.velocity.x=THREE.MathUtils.lerp(this.velocity.x,dx/dt,ease);
      this.velocity.y=THREE.MathUtils.lerp(this.velocity.y,vy,ease);
      this.velocity.z=THREE.MathUtils.lerp(this.velocity.z,dz/dt,ease);
      const speed=Math.hypot(this.velocity.x,this.velocity.z);
      if(gap<reach+.14)this.readyAtSurface=true;
      if(!this.airborne&&gap>=DEPARTURE_GAP&&vy>.38&&this.velocity.y>.26) {
        if(this.readyAtSurface)this.emit('launch',time,point,frame.heading,speed,surface,gap,head.y);
        this.airborne=true;
      } else if(this.airborne&&gap<=reach&&vy<-.24&&this.velocity.y<-.26) {
        this.emit('entry',time,point,frame.heading,speed,surface,gap,head.y);
        this.airborne=false;
      }
      if(speed>.42 && clearance<1.73) {
        const last=this.wake[0];
        if(!last || time-last.time>.075 && Math.hypot(head.x-last.x,head.z-last.z)>.55) {
          this.wake.unshift({x:head.x,z:head.z,time,
            strip:this.serial,
            strength:clamp((speed-.3)*.18,0,1)*(1-smooth(clearance,.91,1.73))});
          if(this.wake.length>18) this.wake.pop();
        }
      }
      Object.assign(previous,{x:head.x,y:head.y,z:head.z,time,gap});
    }
    for(const event of this.events) event.age=time-event.time;
    for(const turn of this.turns){
      turn.age=time-turn.time;
      turn.load=turn.strength*smooth(turn.age,.20,.47)*(1-smooth(turn.age,.62,TURN_LIFE));
    }
    while(this.turns.length&&this.turns[0].age>=TURN_LIFE)this.turns.shift();
    while(this.events.length && this.events[0].age>CONTACT_LIFE) this.events.shift();
    while(this.wake.length && time-this.wake.at(-1).time>WAKE_LIFE) this.wake.pop();
    if(dt>0&&game.status!=='playing')this.velocity.set(0,0,0);
    this.updateHull(frame,dt,time,sampleSurface,paintedSpine);
    this.upload();
  }

  trackTurn(time,dt,head,previous,dx,dz,clearance) {
    const travel=Math.hypot(dx,dz),speed=travel/dt;
    if(speed<1.4){previous.bearing=null;return;}
    const bearing=Math.atan2(dx,dz),old=previous.bearing;
    previous.bearing=bearing;
    if(old==null)return;
    const angle=Math.atan2(Math.sin(bearing-old),Math.cos(bearing-old));
    const rate=angle/dt,side=Math.sign(rate);
    const pressure=smooth(Math.abs(rate),.62,4.6)*smooth(speed,2.1,6.4)*
      (1-smooth(clearance,1.04,1.57));
    const last=this.turns.at(-1);
    if(pressure<.10||last?.side===side&&time-last.time<.24)return;
    const fx=dx/travel,fz=dz/travel;
    this.turns.push({time,age:0,load:0,strength:pressure,side,fx,fz,
      x:head.x+fz*side*2.02+fx*.84,z:head.z-fx*side*2.02+fz*.84});
    if(this.turns.length>TURN_LIMIT)this.turns.shift();
  }

  updateHull(frame,dt,time,sampleSurface,paintedSpine) {
    const spine=frame.spine;
    if(!spine?.length||dt<=0&&spine===this.body)return;
    const speed=Math.hypot(this.velocity.x,this.velocity.z);
    const head=frame.position;
    const painted=paintedSpine?.stage===frame.stage&&paintedSpine.points.length>1&&paintedSpine.scale>0;
    const spacing=.65*(1+frame.stage*.08);
    const length=painted?Math.min(paintedSpine.motion.length,(spine.length-1)*spacing):(spine.length-1)*spacing;
    const count=Math.min(HULL_SEGMENTS,spine.length-1);
    this.hullLength=0;
    for(let i=0;i<=count;i++){
      const u=i/Math.max(1,count),distance=u*length;
      const index=Math.min(spine.length-1,Math.round(distance/spacing));
      const node=this.hull[i],source=spine[index],previous=this.body?.[index];
      const step=previous&&dt>0?Math.hypot(source.x-previous.x,source.z-previous.z)/dt:speed;
      const p=painted?paintedSpine.atDistance(distance/paintedSpine.scale,this.paintedPoint)
        .multiplyScalar(paintedSpine.scale):source;
      const wet=1-smooth(p.y-sampleSurface(p.x,p.z,time,head),.92,1.72);
      node.speed=THREE.MathUtils.lerp(node.speed,Math.min(19,step),1-Math.exp(-Math.max(0,dt)*15));
      const drive=smooth(node.speed,.3,9.0);
      const tail=(1-.41*u)*(1-smooth(u,.70,1));
      node.x=p.x;node.z=p.z;
      node.load=wet*drive*tail;
      node.width=(.78+.53*drive)*(.62+.38*tail);
      if(node.load>.012)this.hullLength=count;
    }
    const drive=smooth(speed,.45,12.5);
    const wet=1-smooth(head.y-sampleSurface(head.x,head.z,time,head),1.02,1.57);
    const bow=this.bow;
    bow.x=head.x;bow.z=head.z;bow.load=wet*drive;
    bow.fx=speed>.45?this.velocity.x/speed:Math.sin(frame.heading);
    bow.fz=speed>.45?this.velocity.z/speed:Math.cos(frame.heading);
    bow.lead=.75+1.11*drive;
    bow.width=1.48+1.24*drive;
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    if(bow.load>.012){minX=maxX=bow.x;minZ=maxZ=bow.z;}
    for(let i=0;i<this.hullLength;i++){
      const a=this.hull[i],b=this.hull[i+1];
      if(Math.max(a.load,b.load)<.012)continue;
      minX=Math.min(minX,a.x,b.x); minZ=Math.min(minZ,a.z,b.z);
      maxX=Math.max(maxX,a.x,b.x); maxZ=Math.max(maxZ,a.z,b.z);
    }
    const bounds=this.uniforms.uHullBounds.value;
    if(minX<=maxX)bounds.set(minX-3.8,minZ-3.8,maxX+3.8,maxZ+3.8);
    else bounds.set(1,1,-1,-1);
    this.body=spine;
  }

  emit(kind,time,point,heading,speed,surface,gap,headY) {
    const fx=speed>.65 ? this.velocity.x/speed : Math.sin(heading);
    const fz=speed>.65 ? this.velocity.z/speed : Math.cos(heading);
    const vertical=Math.abs(this.velocity.y);
    const strength=kind==='entry' ? clamp(.43+vertical*.12+speed*.041,.51,1.15)
      : clamp(.20+vertical*.07+speed*.027,.32,.70);
    const sheet=kind==='entry'?{kind:'plunge',height:clamp(1.62+.28*vertical,1.76,2.60)}:null;
    this.events.push({id:++this.serial,kind,time,age:0,x:point.x,z:point.z,y:surface,
      fx,fz,speed:Math.min(6.67,speed),vertical,strength,gap,headY,sheet});
    if(this.events.length>CONTACT_CAPACITY) this.events.shift();
    this.counts[kind]++;
  }

  upload() {
    const contacts=this.uniforms.uContacts.value, flows=this.uniforms.uContactFlow.value;
    for(let i=0;i<contacts.length;i++) {
      const event=this.events[i];
      if(!event) { contacts[i].set(0,0,0,0); flows[i].set(0,0,0,0); continue; }
      contacts[i].set(event.x,event.z,event.age,event.strength);
      flows[i].set(event.fx,event.fz,event.speed,Number(event.kind==='entry'));
    }
    const {uHullSpan,uHullParams,uHullBow,uHullTravel}=this.uniforms;
    for(let i=0;i<HULL_SEGMENTS;i++){
      const a=this.hull[i],b=this.hull[i+1];
      if(i>=this.hullLength){uHullParams.value[i].set(0,0,1,1);continue;}
      uHullSpan.value[i].set(a.x,a.z,b.x,b.z);
      uHullParams.value[i].set(a.load,b.load,a.width,b.width);
    }
    const bow=this.bow;
    uHullBow.value.set(bow.x,bow.z,bow.load,bow.width);
    uHullTravel.value.set(bow.fx,bow.fz,bow.lead,0);
  }

  writeWake(points, strengths, links, time) {
    for(let i=0;i<points.length;i++) {
      const sample=this.wake[i];
      links[i]=Number(!!sample && sample.strip===this.wake[i+1]?.strip);
      if(!sample) {points[i].set(0,1000,0);strengths[i]=0;continue;}
      points[i].set(sample.x,.72,sample.z);
      strengths[i]=sample.strength*(1-smooth(time-sample.time,.18,WAKE_LIFE));
    }
  }

  liftAt(x,z) {
    let lift=0;
    for(let i=0;i<this.events.length;i++) lift+=impulseAt(x,z,this.events[i]);
    const bounds=this.uniforms.uHullBounds.value;
    if(x<bounds.x||x>bounds.z||z<bounds.y||z>bounds.w)return clamp(lift,-.64,1.11);
    let closest=Infinity,body=0;
    for(let i=0;i<this.hullLength;i++){
      const a=this.hull[i],b=this.hull[i+1];
      if(Math.max(a.load,b.load)<.012)continue;
      const ax=b.x-a.x,az=b.z-a.z,dx=x-a.x,dz=z-a.z;
      if(Math.max(Math.abs(dx),Math.abs(dz))>Math.max(Math.abs(ax),Math.abs(az))+3.7)continue;
      const t=clamp((dx*ax+dz*az)/Math.max(.0001,ax*ax+az*az),0,1);
      const d=Math.hypot(dx-ax*t,dz-az*t),load=THREE.MathUtils.lerp(a.load,b.load,t);
      if(d>=closest||load<.008)continue;
      closest=d;
      const r=d/THREE.MathUtils.lerp(a.width,b.width,t);
      const bank=1-smooth(Math.abs(r-1),.07,.48);
      const trough=1-smooth(r,.03,.83);
      body=load*(bank*.56-trough*.34);
    }
    const bow=this.bow;
    if(bow.load>.012){
      const dx=x-bow.x,dz=z-bow.z;
      const along=dx*bow.fx+dz*bow.fz,across=dx*bow.fz-dz*bow.fx;
      const open=1-smooth(Math.abs(across),bow.width*.55,bow.width);
      const edge=along-bow.lead+.28*across*across;
      if(open>.01&&Math.abs(edge)<1.15){
        body+=bow.load*open*(.59*Math.exp(-((edge/.44)**2))-.24*Math.exp(-(((edge+.51)/.48)**2)));
      }
    }
    return clamp(lift+body,-.64,1.11);
  }

  hasSurface() { return this.events.length>0||this.hullLength>0||this.bow.load>.012; }

  hasCrest() {
    return this.bow.load>.02||this.turns.some(turn=>turn.load>.01)||
      this.events.some(event=>event.kind==='entry'&&event.age<1.15);
  }

  crestAt(x,z,out) {
    out.x=out.z=out.gap=out.bank=out.rejoin=0;
    const {bow}=this;
    if(bow.load>.02&&Math.max(Math.abs(x-bow.x),Math.abs(z-bow.z))<9.8){
      const dx=x-bow.x,dz=z-bow.z;
      const along=dx*bow.fx+dz*bow.fz,across=dx*bow.fz-dz*bow.fx;
      const side=Math.abs(across);
      const incidence=.56+.44*Math.abs(bow.fx*seaWind.x+bow.fz*seaWind.z);
      const pressure=bow.load*incidence*smooth(along,-.42,1.15)*(1-smooth(along,5.3,8.8));
      const throat=1-smooth(side,.33,1.64+.11*along);
      const windSide=seaWind.x*bow.fz-seaWind.z*bow.fx;
      const outwardSide=Math.sign(across);
      const coast=Math.max(0,outwardSide*windSide);
      const shoulder=1-smooth(Math.abs(side-2.23-.25*along-.68*coast),.24,2.15);
      out.gap=pressure*throat;
      out.bank=pressure*shoulder*(.75+.25*coast);
      // The phase is sampled upstream of the outward flow, so an existing
      // crest bows away on both sides of the cleared center.
      const forward=-2.48*out.gap-1.28*out.bank;
      const outward=-outwardSide*out.bank*2.21;
      out.x=bow.fx*forward+bow.fz*outward;
      out.z=bow.fz*forward-bow.fx*outward;
    }
    for(const turn of this.turns){
      if(turn.load<.01)continue;
      const dx=x-turn.x,dz=z-turn.z;
      if(Math.max(Math.abs(dx),Math.abs(dz))>5.0)continue;
      const along=dx*turn.fx+dz*turn.fz,across=dx*turn.fz-dz*turn.fx;
      const settle=turn.load*(1-smooth(Math.abs(along+.53),.62,4.51))*
        (1-smooth(Math.abs(across),.37,3.12));
      const inward=turn.side*settle*2.04;
      out.x+=turn.fz*inward+turn.fx*settle*.31;
      out.z-=turn.fx*inward-turn.fz*settle*.31;
      out.rejoin=Math.max(out.rejoin,settle);
    }
    for(const event of this.events){
      if(event.kind!=='entry'||event.age>=1.15)continue;
      const dx=x-event.x,dz=z-event.z;
      if(Math.max(Math.abs(dx),Math.abs(dz))>4+event.age*10)continue;
      const along=dx*event.fx+dz*event.fz-event.age*event.speed*ENTRY_DRIFT;
      const across=dx*event.fz-dz*event.fx;
      const radius=Math.hypot(along/(1.08+.48*event.speed*.15),across);
      const edge=(radius-.78-event.age*ENTRY_SPEED)/(.65+.68*event.age);
      const push=event.strength*Math.exp(-edge*edge)*smooth(along,-.45,1.12)*
        smooth(event.age,0,.11)*(1-smooth(event.age,.30,1.15));
      out.x-=event.fx*push*.79;
      out.z-=event.fz*push*.79;
      out.bank=Math.max(out.bank,push*.62);
    }
    return out;
  }

  render(time, waterPosition) {
    this.splash.render(this.events,time,waterPosition);
  }

  inspect() {
    return {counts:{...this.counts},airborne:this.airborne,wake:this.wake.length,hull:this.hullLength,
      hullLoad:Math.max(0,...this.hull.slice(0,this.hullLength+1).map(node=>node.load)),
      bow:this.bow.load,gap:this.previous?.gap,turn:this.turns.map(({age,side,load,x,z})=>({age,side,load,x,z})),
      triangles:this.splash.indexCount/3,velocity:this.velocity.toArray(),
      events:this.events.map(event=>({...event}))};
  }
}
