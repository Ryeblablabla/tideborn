import * as THREE from 'three';
import { WaterSplashBatch } from './water-contact.js';

const MAX_RIPPLES=5;
const MAX_VORTICES=3;
const MAX_SPLASHES=3;
const clamp=THREE.MathUtils.clamp;
const smooth=THREE.MathUtils.smoothstep;
const mix=THREE.MathUtils.lerp;
const surfaceClearance=(height,stage)=>stage===0?1:1-smooth(height,1.0,2.1);
const strikeWetness=(height,surface)=>Number.isFinite(height)?1-smooth(height-surface,1.08,1.83):0;
const SPLIT=0, IMPACT=1, HAZARD_WAVE=2, TAIL=3, BACKWASH_HIT=4, SHALLOW_HIT=5;
const WATER_STRIKE=6;
const bowHead=.79, bowStart=.23, bowSpread=.72, bowCurl=.13;
const bowReach=[.84,1.08,1.20];
const waterLift=[.28,.17,.40];
const surfaceVortices=new WeakMap();

export function surfaceVortex(zone,time) {
  const flow=surfaceVortices.get(zone);
  return flow?.time===time?flow:null;
}

export const combatWaterGLSL = /* glsl */ `
  uniform vec4 uWaterPulse[${MAX_RIPPLES}];
  uniform vec4 uWaterPulseFlow[${MAX_RIPPLES}];
  uniform vec4 uWaterPulseCut[${MAX_RIPPLES}];
  uniform vec4 uWaterVortex[${MAX_VORTICES}];
  uniform vec4 uWaterVortexFlow[${MAX_VORTICES}];

  float vortexPullAt(vec2 p) {
    float pull=0.;
    for(int i=0;i<${MAX_VORTICES};i++){
      vec4 vortex=uWaterVortex[i];
      if(vortex.w<.015)continue;
      vec2 q=p-vortex.xy;
      if(max(abs(q.x),abs(q.y))>vortex.z)continue;
      float r=length(q)/vortex.z;
      pull=max(pull,vortex.w*(1.-smoothstep(.40,1.,r)));
    }
    return pull;
  }

  vec2 strikeReachAt(vec2 local,float radius,float load,float age,float paper) {
    float hold=1.-smoothstep(.075,.25,age);
    float inset=radius-length(local);
    if(hold<=0.||inset<-.035||inset>.43)return vec2(0.);
    float angle=atan(local.y,local.x);
    float leading=1.-smoothstep(.27,.59,abs(angle-.47));
    float opposite=1.-smoothstep(.21,.56,abs(angle+.79));
    float strokes=max(leading,.81*opposite);
    float tooth=washNoise(vec2(angle*10.6,2.41));
    float wash=smoothstep(-.035,.049,inset)*(1.-smoothstep(.09,.27+.13*tooth,inset));
    float dryEdge=(1.-smoothstep(.024,.097,abs(inset-.15)))*smoothstep(.23,.65,paper*.57+tooth*.43);
    return vec2(wash*(.78+.20*tooth),dryEdge*.66)*strokes*load*hold;
  }

  vec2 combatWaterAt(vec2 p,float paper) {
    vec2 marks=vec2(0.);
    bool lake=uStage>.5&&uStage<1.5;
    bool sea=uStage>1.5;
    for(int i=0;i<${MAX_RIPPLES};i++){
      vec4 pulse=uWaterPulse[i],flow=uWaterPulseFlow[i],cut=uWaterPulseCut[i];
      bool waterStrike=flow.w>5.5;
      // The hit paints the outer reach immediately. The splash still spreads from contact.
      bool range=waterStrike&&cut.x>0.&&cut.z<.25;
      if(pulse.w<.005&&!range) continue;
      vec2 q=p-pulse.xy;
      float extent=max(pulse.z*flow.z+3.7,range?cut.x+.43:0.);
      if(max(abs(q.x),abs(q.y))>extent) continue;
      vec2 side=vec2(flow.y,-flow.x);
      float along=dot(q,flow.xy),across=dot(q,side);
      if(range)marks=max(marks,strikeReachAt(vec2(along,across),cut.x,cut.y,cut.z,paper));
      if(pulse.w<.005)continue;
      float age=cut.z;
      float kind=flow.w;
      bool split=kind<.5;
      bool hazard=kind>1.5&&kind<2.5;
      bool tail=kind>2.5&&kind<3.5;
      bool backwashHit=kind>3.5&&kind<4.5;
      bool shallowHit=kind>4.5&&!waterStrike;
      float d=length(vec2(along/flow.z,across));
      float local=washNoise(vec2(along*.53-age*.72,across*1.1+cut.w));
      float width=sea?.45+age*.42:lake?.19+age*.32:.28+age*.36;
      float edge=d-pulse.z;
      float opening=1.;
      if(split){
        // Separate sheets leave a clear lane and widen behind the contact.
        float span=(${bowHead}*pulse.z*flow.z-along)/max(.30,pulse.z);
        float t=clamp(span,0.,1.37);
        float reach=sea?${bowReach[2]}:lake?${bowReach[1]}:${bowReach[0]};
        float swept=(${bowStart}+${bowSpread}*t-${bowCurl}*t*t)*pulse.z*reach;
        edge=abs(across)-swept;
        opening=smoothstep(0.,.18,span)*(1.-smoothstep(.96,1.37,span));
        opening*=.60+.40*smoothstep(-.43,.39,sin(span*4.8+sign(across)*.75+cut.w));
      }else if(hazard){
        float azimuth=atan(q.x,q.y)-cut.x;
        float angle=abs(atan(sin(azimuth),cos(azimuth)));
        opening=cut.y>0.?smoothstep(cut.y,cut.y+.14,angle):1.;
        width=.32+age*.43;
      }else if(tail){
        opening=.18+.82*smoothstep(-.18,.59,along/max(.1,length(q)));
        width*=.68;
      }else if(backwashHit){
        opening=.18+.82*smoothstep(-.27,.67,along/max(.16,length(q)));
        width=.35+age*.52;
      }else if(shallowHit){
        opening=smoothstep(-.30,.66,along/max(.14,length(q)));
        width=.23+age*.34;
      }else if(waterStrike){
        float front=smoothstep(-.32,.46,along/max(.14,length(q)));
        opening=mix(.54+.46*front,1.,smoothstep(.11,.40,age));
        width=.20+age*.58;
      }else if(lake){
        float sweep=(along*.82+across*.48)/max(.16,length(q));
        opening=.31+.69*smoothstep(-.62,.35,sweep);
      }
      float irregular=edge+(local-.5)*(sea?.37:.22);
      float brush=1.-smoothstep(width*.28,width*(sea?1.94:1.54),abs(irregular));
      float bristle=1.-smoothstep(.025,sea?.20:lake?.090:.115,abs(irregular-(sea?.18:.085)));
      float sprayBreak=smoothstep(.25,.71,local*.72+paper*.28);
      float loaded=(hazard?.49:sea?.46:.36)+.36*local;
      if(backwashHit){
        loaded=.69+.22*local;
        bristle=max(bristle,(1.-smoothstep(.06,.26,abs(irregular-.10)))*.94);
      }
      if(shallowHit){
        loaded=.89+.10*local;
        bristle*=.69;
      }
      if(waterStrike){
        loaded=mix(.74,.44,smoothstep(.09,.51,age))+.21*local;
        float torn=smoothstep(.34,.72,local*.71+paper*.29);
        bristle=max(bristle,(1.-smoothstep(.026,.105,abs(irregular+width*.53)))*torn*.97);
      }
      if(lake&&!split&&!hazard&&!tail&&!backwashHit&&!shallowHit&&!waterStrike){
        // A quieter second wash follows the fine leading crease across the lake.
        float residual=1.-smoothstep(.052,.24,abs(edge+.36+age*.17+(local-.5)*.15));
        brush=max(brush,residual*.34*smoothstep(.24,.68,local));
      }
      marks.x=max(marks.x,brush*opening*pulse.w*loaded);
      marks.y=max(marks.y,bristle*sprayBreak*opening*pulse.w*(backwashHit?1.45:sea||hazard?1.:.74));
    }
    for(int i=0;i<${MAX_VORTICES};i++){
      vec4 vortex=uWaterVortex[i],flow=uWaterVortexFlow[i];
      if(vortex.w<.005) continue;
      vec2 q=p-vortex.xy;
      if(max(abs(q.x),abs(q.y))>vortex.z) continue;
      float r=length(q)/vortex.z;
      if(r>1.) continue;
      float spin=atan(q.x,q.y)*flow.x;
      float turn=spin+2.35*log(max(.09,r))-.5*flow.y;
      float arm=2.*turn;
      float fade=smoothstep(.18,.30,r)*(1.-smoothstep(.81,1.,r));
      float pressure=vortex.w*fade;
      float curl=sin(arm);
      float fibers=washNoise(vec2(r*8.8+flow.y*.18,cos(spin)*5.+sin(arm)*2.1+flow.z));
      float weight=.47+.53*smoothstep(-.28,.72,cos(turn-.61));
      float fed=flow.w;
      float wall=smoothstep(-.28,.89,curl+(fibers-.48)*.39);
      float pooled=(.10+(sea?.99:.61)*wall)*pressure*weight*(1.+fed*.24);
      float openEye=(1.-smoothstep(.09,.26,r+(fibers-.5)*.055))*vortex.w;
      float edge=1.-smoothstep(.075,.30,abs(sin(arm+.79)+(fibers-.46)*.21));
      float froth=smoothstep(.24,.69,fibers*.74+paper*.26);
      marks.x=max(marks.x,pooled);
      marks.y=max(marks.y,max(edge*froth*pressure*weight*((sea?1.36:.90)+fed*.48),openEye*(sea?.73:.32)));
    }
    return clamp(marks,0.,.94);
  }
`;

export function combatWaterUniforms() {
  const array=count=>({value:Array.from({length:count},()=>new THREE.Vector4())});
  return {
    uWaterPulse:array(MAX_RIPPLES),uWaterPulseFlow:array(MAX_RIPPLES),uWaterPulseCut:array(MAX_RIPPLES),
    uWaterVortex:array(MAX_VORTICES),uWaterVortexFlow:array(MAX_VORTICES),
  };
}

function write(array,index,x=0,y=0,z=0,w=0) {
  array[index].set(x,y,z,w);
}

const eventNames=new Set(['dash','ringBurst','bossWave','hazardImpact','hit','weaponStrike','evolve','beamContact']);
const wetProjectiles=new Set(['bubble','poison','mist']);
const freshCounts=()=>({dash:0,impact:0,bossWave:0,ring:0,hit:0,charge:0,dive:0,dart:0,waterStrike:0,tailStrike:0,evolve:0,beamContact:0});
export class WaterCombat {
  constructor(water) {
    this.water=water;
    this.uniforms=water.material.uniforms;
    this.brush=new WaterSplashBatch(MAX_SPLASHES,'水战 · 破浪飞沫');
    water.add(this.brush.mesh);
    water.userData.waterCombat=this;
    this.queue=[];
    this.pulses=[];
    this.splashes=[];
    this.vortices=[];
    this.vortexMotion=new Map();
    this.enemyTrace=new Map();
    this.run=null;
    this.previous=null;
    this.velocity=new THREE.Vector2();
    this.lastTime=-Infinity;
    this.lastStage=-1;
    this.lastHit=-Infinity;
    this.serial=0;
    this.counts=freshCounts();
  }

  event(event,stage,time) {
    const chapter=event.stage??stage;
    if(chapter<0||chapter>2||!eventNames.has(event.type)) return;
    if(event.type==='hit'&&(!wetProjectiles.has(event.source)||strikeWetness(event.y,this.water.position.y)<.12)) return;
    if(event.type==='weaponStrike'&&(event.hit!==true||!['water','tail'].includes(event.strike)||
        !Number.isFinite(event.radius)||event.radius<=0||strikeWetness(event.y,this.water.position.y)<.12)) return;
    if(event.type==='hit'&&time-this.lastHit<.19) return;
    if(event.type==='hit') this.lastHit=time;
    if(event.type==='hazardImpact'&&event.surface===false) return;
    if(!Number.isFinite(event.x)||!Number.isFinite(event.z)) return;
    this.queue.push({event,stage:chapter,time});
    if(this.queue.length>12)this.queue.shift();
  }

  reset(game,stage,time) {
    if(this.run&&this.run!==game)this.queue.length=0;
    this.run=game;
    this.lastStage=stage;
    this.lastTime=time;
    this.previous=null;
    this.velocity.set(0,0);
    this.pulses.length=0;
    this.splashes.length=0;
    this.vortices.length=0;
    this.vortexMotion.clear();
    this.enemyTrace.clear();
    this.lastHit=-Infinity;
    this.counts=freshCounts();
  }

  emit(queued,frame,time,game) {
    const {event:e,stage}=queued;
    const strike=e.type==='weaponStrike';
    const clearance=e.type==='evolve'?1:strike||e.type==='hit'?strikeWetness(e.y,this.water.position.y):
      e.surface?1:surfaceClearance(e.y??frame.position.y,stage);
    if(clearance<.12)return;
    const actualSpeed=this.velocity.length();
    const measured=actualSpeed>1.3;
    let fx=measured?this.velocity.x/actualSpeed:Math.sin(frame.heading);
    let fz=measured?this.velocity.y/actualSpeed:Math.cos(frame.heading);
    if(Number.isFinite(e.fx)&&Number.isFinite(e.fz)){fx=e.fx;fz=e.fz;}
    else if(strike&&e.to){
      const dx=e.to.x-e.x,dz=e.to.z-e.z,length=Math.hypot(dx,dz);
      if(length>.1){fx=dx/length;fz=dz/length;}
    }
    else if(e.type==='hazardImpact'&&game.boss&&game.boss.id===e.bossId){
      const dx=e.x-game.boss.x,dz=e.z-game.boss.z,length=Math.hypot(dx,dz);
      if(length>.1){fx=dx/length;fz=dz/length;}
    }
    const type=e.type;
    let force,radius,duration,style,splash=null,spread=1,elongation=1;
    if(type==='dash'){
      force=clamp(.62+actualSpeed*.029,.76,1.07);
      radius=4.7;duration=.81;style=SPLIT;splash='dash';elongation=stage===2?1.84:1.65;spread=1.03;
    }else if(type==='bossWave'){
      force=.91;radius=clamp(e.radius??7.6,2.4,12);duration=clamp(e.life??2.0,.65,2.6);style=HAZARD_WAVE;
    }else if(type==='beamContact'){
      force=.61;radius=clamp(e.radius??2.1,1.7,3.5);duration=.68;style=TAIL;elongation=2.10;
    }else if(type==='hazardImpact'){
      const backwash=e.attack==='shell-backwash'&&e.hit;
      const lantern=e.attack==='lantern-pulse'&&e.hit;
      force=backwash?1.16:lantern?.82:.96;
      radius=backwash?2.30:lantern?1.9:clamp(e.radius??2.8,1.4,5.8)+.75;
      duration=backwash?.74:lantern?.57:1.08;
      style=backwash?BACKWASH_HIT:lantern?SHALLOW_HIT:IMPACT;
      elongation=backwash?1.38:lantern?1.23:1;
      splash='impact';spread=backwash?1.04:lantern?.79:clamp((e.radius??2.8)*.41,.71,1.58);
    }else if(type==='charge'){
      force=.82;radius=clamp(e.radius*.99+1.7,2.3,4.7);duration=.73;style=SPLIT;
      splash=e.splash?'dash':null;elongation=1.55;spread=1.22;
    }else if(type==='dart'){
      force=.51;radius=1.50;duration=.42;style=SPLIT;
      elongation=1.39;
    }else if(type==='dive'){
      force=.83;radius=clamp(e.radius+.82,1.5,3.1);duration=.92;style=IMPACT;
      splash='impact';spread=.86;
    }else if(type==='ringBurst'){
      force=.81;radius=clamp(e.radius??3.8,2,9)+1.3;duration=.96;style=IMPACT;
    }else if(type==='evolve'){
      force=.66;radius=3.4;duration=1.02;style=IMPACT;
    }else if(strike){
      radius=e.radius;
      if(e.strike==='water'){
        force=clamp(.78+.035*((e.tier??1)-1),.78,.96);
        duration=.83;style=WATER_STRIKE;splash='impact';spread=clamp(.65+.16*radius,.74,1.45);
      }else{
        force=clamp(.43+.027*((e.tier??1)-1),.43,.57);
        duration=.59;style=TAIL;elongation=1.55;
      }
    }else{
      const shallowHit=stage<=2&&e.type==='hit'&&!e.boss&&!e.guarded&&e.from;
      if(shallowHit){
        const dx=e.x-e.from.x,dz=e.z-e.from.z,length=Math.hypot(dx,dz);
        if(length>.01){fx=dx/length;fz=dz/length;}
      }
      force=shallowHit?.43:.27;
      radius=e.boss?1.65:1.16;
      duration=shallowHit?.40:.48;
      style=shallowHit?SHALLOW_HIT:IMPACT;
      elongation=shallowHit?1.32:1;
    }
    const age=Math.max(0,time-queued.time);
    const wave=type==='bossWave'?game.hazards.find(h=>h.wave&&h.bossId===e.bossId&&h.attack===e.attack&&h.life>0):null;
    const pulse={id:++this.serial,x:e.x,z:e.z,age,time:time-age,fx,fz,style,stage,force:force*clearance,
      radius,front:e.startRadius??.20,startRadius:e.startRadius??.18,elongation,duration,
      load:force*clearance,gap:e.gap??0,halfGap:(e.gapWidth??1.20)*.5,wave,
      strike:e.strike,weapon:e.weapon};
    this.pulses.push(pulse);
    if(this.pulses.length>MAX_RIPPLES){
      const weakest=this.pulses.findIndex(mark=>mark.style!==HAZARD_WAVE&&mark.force<.35);
      const ordinary=this.pulses.findIndex(mark=>mark.style!==HAZARD_WAVE);
      this.pulses.splice(weakest>=0?weakest:Math.max(0,ordinary),1);
    }
    if(splash){
      const reach=bowReach[stage];
      const sheet=style===SPLIT?{
        kind:'split',height:[.84,.58,.91][stage],head:bowHead*elongation,
        start:bowStart*reach,spread:bowSpread*reach,curl:bowCurl*reach,
      }:style===BACKWASH_HIT?{kind:'breaking',height:1.90}:{kind:'well',height:[.91,.69,1.62][stage]};
      this.splashes.push({id:pulse.id,x:e.x,z:e.z,y:this.water.position.y,time:time-age,age,
        fx,fz,kind:splash,speed:clamp(e.speed??(type==='dash'?Math.max(4.8,actualSpeed*.42):2.1),0,7.2),
        strength:force*clearance,spread,pulse,sheet});
      if(this.splashes.length>MAX_SPLASHES)this.splashes.shift();
    }
    const count=strike?(e.strike==='water'?'waterStrike':'tailStrike'):
      type==='hazardImpact'?'impact':type==='ringBurst'?'ring':type;
    this.counts[count]++;
  }

  syncVortices(game,time,stage) {
    const vortices=this.vortices;
    vortices.length=0;
    const keep=new Set();
    const eligible=game.zones.filter(z=>z.kind==='storm'&&z.life>0&&z.radius>.1&&
      surfaceClearance(z.y??game.p.y,stage)>.12);
    eligible.sort((a,b)=>(b===game.windZone)-(a===game.windZone)||
      Math.hypot(a.x-game.p.x,a.z-game.p.z)-Math.hypot(b.x-game.p.x,b.z-game.p.z));
    for(const zone of eligible.slice(0,MAX_VORTICES)){
      const rate=2.15+.10*(zone.power??1);
      let motion=this.vortexMotion.get(zone.id);
      if(!motion) {
        const spin=zone===game.windZone?(Math.sign(game.motion?.bend??0)||1):(zone.id%2?1:-1);
        motion={spin,phase:time*rate,time};
        this.vortexMotion.set(zone.id,motion);
      }
      motion.phase+=(time-motion.time)*rate;
      motion.time=time;
      keep.add(zone.id);
      const load=surfaceClearance(zone.y??game.p.y,stage)*
        clamp(.64+.05*(zone.power??1),.60,.96)*smooth(zone.age??0,0,.24)*smooth(zone.life,0,.45);
      const flow={id:zone.id,x:zone.x,z:zone.z,radius:zone.radius,load,spin:motion.spin,time,fed:zone.rainfed?1:0,
        phase:motion.phase,seed:zone.id*.31,surface:this.water.position.y};
      vortices.push(flow);
      surfaceVortices.set(zone,flow);
    }
    for(const id of this.vortexMotion.keys())if(!keep.has(id))this.vortexMotion.delete(id);
  }

  syncEnemyContacts(game,time,stage,frame) {
    const keep=new Set();
    for(const enemy of game.enemies) {
      const old=this.enemyTrace.get(enemy.id);
      const charging=enemy.lunge>0&&enemy.bossPlan?.definition?.name==='crab-charge';
      const diving=!!enemy.dive;
      const darting=enemy.dartRush?.phase==='active';
      if(!charging&&!diving&&!old?.diving&&!darting)continue;
      keep.add(enemy.id);
      const trace=old||{x:enemy.x,z:enemy.z,y:enemy.y,travel:0,sprayAt:-5,
        pulseAt:-2.4,diving};
      const dx=enemy.x-trace.x,dz=enemy.z-trace.z,distance=Math.hypot(dx,dz);
      if(distance>.02&&distance<3.5){
        const fx=dx/distance,fz=dz/distance;
        trace.travel+=distance;
        if(charging&&surfaceClearance(enemy.y,stage)>.15&&trace.travel-trace.pulseAt>=2.15){
          const splash=trace.travel-trace.sprayAt>=4.6;
          const event={type:'charge',x:enemy.x-fx*.56,y:enemy.y,z:enemy.z-fz*.56,fx,fz,
            radius:enemy.radius,surface:true,speed:5.1,splash};
          this.emit({event,time,stage},frame,time,game);
          trace.pulseAt=trace.travel;
          if(splash)trace.sprayAt=trace.travel;
        }
        if(darting&&trace.travel>=.52&&!trace.darted){
          const event={type:'dart',x:enemy.x-fx*.28,y:enemy.y,z:enemy.z-fz*.28,fx,fz,surface:true};
          this.emit({event,time,stage},frame,time,game);
          trace.darted=true;
        }
        if(stage===2&&trace.diving&&trace.y>1.48&&enemy.y<=1.48) {
          const event={type:'dive',x:enemy.x,y:enemy.y,z:enemy.z,fx,fz,
            radius:enemy.dive?.width??enemy.radius,surface:true,speed:3.4};
          this.emit({event,time,stage},frame,time,game);
        }
      }
      Object.assign(trace,{x:enemy.x,z:enemy.z,y:enemy.y,diving});
      this.enemyTrace.set(enemy.id,trace);
    }
    for(const id of this.enemyTrace.keys())if(!keep.has(id))this.enemyTrace.delete(id);
  }

  update(time,stage,frame,game,enabled) {
    if(this.run!==game||this.lastStage!==stage||time<this.lastTime) this.reset(game,stage,time);
    if(!enabled) {
      this.queue.length=this.pulses.length=this.splashes.length=this.vortices.length=0;
      this.previous=null;
      this.upload();
      this.brush.render([],time,this.water.position);
      return;
    }
    const head=frame.position;
    const dt=this.previous ? time-this.previous.time : 0;
    if(dt>0){
      const ease=1-Math.exp(-dt*18);
      const dx=head.x-this.previous.x,dz=head.z-this.previous.z;
      if(Math.hypot(dx,dz)<6) {
        this.velocity.x=mix(this.velocity.x,dx/dt,ease);
        this.velocity.y=mix(this.velocity.y,dz/dt,ease);
      } else this.velocity.set(0,0);
    }
    this.previous={x:head.x,z:head.z,time};
    for(const queued of this.queue) {
      if(queued.stage===stage&&time-queued.time<(queued.event.type==='evolve'?.34:.20))this.emit(queued,frame,time,game);
    }
    this.queue.length=0;
    this.syncEnemyContacts(game,time,stage,frame);
    for(let i=this.pulses.length-1;i>=0;i--){
      const pulse=this.pulses[i];
      pulse.age=pulse.wave?.age??time-pulse.time;
      if(pulse.age>=pulse.duration||(pulse.wave&&pulse.wave.life<=0)){this.pulses.splice(i,1);continue;}
      const fraction=pulse.age/pulse.duration;
      const surge=1-(1-fraction)**1.42;
      pulse.front=pulse.style===HAZARD_WAVE?mix(pulse.startRadius,pulse.radius,fraction):pulse.strike?
        mix(Math.min(pulse.startRadius,pulse.radius/pulse.elongation),pulse.radius/pulse.elongation,surge):
        pulse.startRadius+pulse.radius*surge;
      pulse.load=pulse.force*smooth(pulse.age,0,.055)*(1-smooth(fraction,.24,1));
    }
    for(let i=this.splashes.length-1;i>=0;i--){
      const splash=this.splashes[i];
      splash.age=time-splash.time;
      if(splash.age>.90)this.splashes.splice(i,1);
    }
    this.syncVortices(game,time,stage);
    this.lastTime=time;
    this.upload();
    this.brush.render(this.splashes,time,this.water.position);
  }

  upload() {
    const u=this.uniforms;
    for(let i=0;i<MAX_RIPPLES;i++){
      const p=this.pulses[i];
      write(u.uWaterPulse.value,i,p?.x,p?.z,p?.front,p?.load);
      write(u.uWaterPulseFlow.value,i,p?.fx,p?.fz,p?.elongation,p?.style);
      // A wave carries its safe angle. A water strike carries its true radius and wetness.
      const wave=p?.style===HAZARD_WAVE;
      const strike=p?.strike==='water';
      write(u.uWaterPulseCut.value,i,wave?p.gap:strike?p.radius:0,
        wave?p.halfGap:strike?p.force:0,p?.age,(p?.id??0)*.73%19);
    }
    for(let i=0;i<MAX_VORTICES;i++){
      const v=this.vortices[i];
      write(u.uWaterVortex.value,i,v?.x,v?.z,v?.radius,v?.load);
      write(u.uWaterVortexFlow.value,i,v?.spin,v?.phase,v?.seed,v?.fed);
    }
  }

  hasSurface() {
    return this.pulses.some(p=>p.load>.035)||this.vortices.some(v=>v.load>.035);
  }

  gatherAt(x,z,out) {
    out.x=out.z=out.pull=0;
    for(const v of this.vortices){
      if(v.load<.015)continue;
      const dx=x-v.x,dz=z-v.z;
      if(Math.max(Math.abs(dx),Math.abs(dz))>v.radius)continue;
      const distance=Math.hypot(dx,dz),r=distance/v.radius;
      if(r>=1)continue;
      const pull=v.load*(1-smooth(r,.40,1));
      const turn=smooth(r,.06,.29)*pull/Math.max(.18,distance);
      out.x+=(dz*v.spin*.83-dx*.34)*turn;
      out.z+=(-dx*v.spin*.83-dz*.34)*turn;
      out.pull=Math.max(out.pull,pull);
    }
    return out;
  }

  liftAt(x,z) {
    let lift=0;
    for(const pulse of this.pulses){
      if(pulse.load<.015||Math.max(Math.abs(x-pulse.x),Math.abs(z-pulse.z))>pulse.front*pulse.elongation+2.5)continue;
      const dx=x-pulse.x,dz=z-pulse.z;
      const along=dx*pulse.fx+dz*pulse.fz,across=dx*pulse.fz-dz*pulse.fx;
      let edge=Math.hypot(along/pulse.elongation,across)-pulse.front;
      let opening=1;
      if(pulse.style===SPLIT){
        const span=(bowHead*pulse.front*pulse.elongation-along)/Math.max(.30,pulse.front);
        if(span<0||span>1.37)continue;
        const swept=(bowStart+bowSpread*span-bowCurl*span*span)*pulse.front*bowReach[pulse.stage];
        edge=Math.abs(across)-swept;
        opening=smooth(span,0,.18)*(1-smooth(span,.96,1.37));
      }else if(pulse.style===HAZARD_WAVE){
        const azimuth=Math.atan2(dx,dz)-pulse.gap;
        opening=pulse.halfGap>0?smooth(Math.abs(Math.atan2(Math.sin(azimuth),Math.cos(azimuth))),pulse.halfGap,pulse.halfGap+.14):1;
      }else if(pulse.style===TAIL){
        opening=.18+.82*smooth(along/Math.max(.1,Math.hypot(dx,dz)),-.18,.59);
      }else if(pulse.style===BACKWASH_HIT){
        opening=.18+.82*smooth(along/Math.max(.16,Math.hypot(dx,dz)),-.27,.67);
      }else if(pulse.style===SHALLOW_HIT){
        opening=smooth(along/Math.max(.14,Math.hypot(dx,dz)),-.30,.66);
      }else if(pulse.style===WATER_STRIKE){
        const front=smooth(along/Math.max(.14,Math.hypot(dx,dz)),-.32,.46);
        opening=mix(.54+.46*front,1,smooth(pulse.age,.11,.40));
      }else if(pulse.stage===1){
        opening=.31+.69*smooth((along*.82+across*.48)/Math.max(.16,Math.hypot(dx,dz)),-.62,.35);
      }
      const q=edge/(.54+.41*pulse.age);
      const swell=Math.exp(-q*q)-(pulse.stage===2?.24*Math.exp(-((q+.99)**2)*2.3):0);
      lift+=swell*waterLift[pulse.stage]*pulse.load*opening;
    }
    for(const v of this.vortices){
      if(v.load<.015||Math.max(Math.abs(x-v.x),Math.abs(z-v.z))>v.radius)continue;
      const dx=x-v.x,dz=z-v.z,r=Math.hypot(dx,dz)/v.radius;
      if(r>=1)continue;
      const arm=2*Math.atan2(dx,dz)*v.spin+4.7*Math.log(Math.max(.09,r))-v.phase;
      const side=smooth(r,.12,.25)*(1-smooth(r,.77,1));
      lift+=v.load*(-.50*(1-smooth(r,.09,.45))+(.21+.09*v.fed)*side*(.38+.62*Math.sin(arm)));
    }
    return clamp(lift,-.50,.60);
  }

  inspect() {
    return {counts:{...this.counts},vortices:this.vortices.map(v=>({...v})),
      pulses:this.pulses.map(({wave,...p})=>({...p,waveId:wave?.id})),splashes:this.splashes.length,
      triangles:this.brush.indexCount/3,velocity:this.velocity.toArray()};
  }
}
