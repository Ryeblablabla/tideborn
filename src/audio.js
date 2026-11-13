import {
  airThreatCue, attackCue, bankPincerCue, bossCue, dartRushCue, evolutionCue, fieldCue, reactionCue, reactionMaterial,
  sceneTexture, surfaceCue, waterStroke,
} from './audio-cues.js';

const CHAPTERS = [
  { water: .17, waterTone: 910, air: .076, airTone: 1430, windRate: 1.17,
    texture: [.64,3.4,.54], root: 146.83, phrase: [0,7,2,null,4], interval: 5.7, musicEntry: 1.6 },
  { water: .15, waterTone: 410, air: .046, airTone: 820, windRate: .38,
    texture: [.81,4.4,.43], root: 130.81, phrase: [7,null,2,0,null,7], interval: 6.6, musicEntry: 2.1 },
  { water: .31, waterTone: 520, air: .11, airTone: 630, windRate: .74,
    texture: [.57,4.2,.20], root: 98, phrase: [0,null,0,5,null,7], interval: 7.1, musicEntry: 2.6 },
  { water: .10, waterTone: 280, air: .17, airTone: 540, windRate: .87,
    texture: [.69,5.1,.34], root: 146.83, phrase: [7,2,null,9,4,null], interval: 7.9, musicEntry: 2.35 },
  { water: 0, waterTone: 260, air: .12, airTone: 890, windRate: .30,
    texture: [.89,6.4,.22], root: 196, phrase: [12,null,9,7,null,2], interval: 7.7, musicEntry: 2.55 },
];

const CUE_INTERVALS = {
  eat: .115, recover: .24, bite: .13, claw: .14, tail: .18, kill: .24,
  shoot: .24, hit: .145, hurt: .31, arc: .19, reaction: .84,
  storm: .56, fire: .49, ring: .48, thunder: .29, warning: .31, lightning: .21,
  bossPhase: .09, bossImpact: .21, bossWave: .20, bossCharge: .24,
  airDive: .27, airPass: .31, bankPincer: .47, dartRush: .35, armorBreak: .35,
  entry: .25, launch: .19, dash: .25, dashReady: .45,
};

const DETAIL_DUCK = {
  dash: [.46,.24], entry: [.43,.25], launch: [.54,.19], dashReady: [.65,.14],
  hurt: [.34,.35], recover: [.70,.15], warning: [.41,.34], bossImpact: [.40,.24],
  windup: [.41,.34], active: [.43,.24], recovery: [.53,.26],
  strike: [.64,.11], reaction: [.48,.18],
  airWarning: [.58,.18], bankPincer: [.75,.15], dartRush: [.79,.13],
  nearLightning: [.68,.12], lanternGap: [.65,.24],
};

const DETAIL_CUES = new Set(['shoot','hit','arc','fire','storm']);
const VOLUME = .68;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function noiseBuffer(ctx, seconds, channels, kind, seed) {
  const samples = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(channels, samples, ctx.sampleRate);
  let random = seed >>> 0;
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    let slow = 0, drift = 0;
    for (let i = 0; i < samples; i++) {
      random = (Math.imul(random,1664525)+1013904223) >>> 0;
      const white = random/2147483648-1;
      slow = slow*.943+white*.057;
      drift = drift*.989+white*.011;
      if (kind === 'white') data[i]=white;
      else if (kind === 'water') data[i]=white*.21+slow*1.11+drift*1.44;
      else if (kind === 'air') data[i]=white*.11+slow*.88+drift*1.82;
      else {
        const phase=2*Math.PI*i/samples;
        const sweep=.57+.27*Math.sin(phase*4+channel*1.2)+.14*Math.sin(phase*7+.45+channel*.91);
        data[i]=(white*.13+slow*1.31+drift*1.58)*sweep;
      }
    }
    if (kind !== 'white') {
      const seam=Math.floor(ctx.sampleRate*.11);
      for(let i=0;i<seam;i++) {
        const rise=Math.sin((i+.5)/seam*Math.PI*.5);
        data[i]*=rise;
        data[samples-1-i]*=rise;
      }
    }
  }
  return buffer;
}

// A lossy, two-point string reflection produces the pluck and its decaying
// overtones from a short excitation instead of a transposed oscillator stack.
function stringBuffer(ctx, frequency) {
  const duration=1.72;
  const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate);
  const data=buffer.getChannelData(0);
  const wave=new Float32Array(Math.max(2,Math.round(ctx.sampleRate/frequency)));
  let state=(frequency*1009)>>>0,position=0,tail=0,bridge=0;
  for(let i=0;i<wave.length;i++) {
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const excite=state/2147483648-1;
    bridge=.68*bridge+.32*excite;
    wave[i]=bridge*.64+(excite-bridge)*.31;
  }
  for(let i=0;i<data.length;i++) {
    const next=(position+1)%wave.length;
    const sample=wave[position];
    wave[position]=.4982*sample+.4990*wave[next];
    position=next;
    tail=.83*tail+.17*sample;
    const attack=Math.min(1,i/(ctx.sampleRate*.005));
    data[i]=attack*Math.exp(-2.27*i/data.length)*(sample*.80+tail*.37);
  }
  return buffer;
}

function chapterIndex(stage) {
  return clamp(Number.isFinite(stage)?Math.trunc(stage):0,0,CHAPTERS.length-1);
}

export class AudioGarden {
  constructor(enabled = true) {
    this.enabled=enabled;
    this.ctx=null;
    this.scene=-1;
    this.musicTime=1.8;
    this.phrase=0;
    this.strokePhase=0;
    this.strokeSide=1;
    this.textureTime=0;
    this.textureSide=1;
    this.lastCue=new Map();
    this.stringCache=new Map();
    this.foodVariation=0;
    this.breathWeapon=null;
    this.breathAccent=false;
    this.detailUntil=0;
    this.detailFloor=1;
    this.evolutionUntil=0;
    this.warningAccent=Infinity;
  }

  async init() {
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return false;
    if(!this.ctx) {
      const ctx=this.ctx=new AudioContext();
      this.master=ctx.createGain();
      this.master.gain.value=this.enabled?VOLUME:0;
      this.limiter=ctx.createDynamicsCompressor();
      this.limiter.threshold.value=-14;
      this.limiter.knee.value=9;
      this.limiter.ratio.value=5;
      this.limiter.attack.value=.004;
      this.limiter.release.value=.23;
      this.master.connect(this.limiter).connect(ctx.destination);

      this.room=ctx.createGain();
      this.room.gain.value=0;
      this.room.connect(this.master);
      this.ambient=ctx.createGain();
      this.combat=ctx.createGain();
      this.music=ctx.createGain();
      this.ambient.gain.value=.92;
      this.combat.gain.value=1;
      this.music.gain.value=.52;
      for(const bus of [this.ambient,this.combat,this.music])bus.connect(this.room);
      this.detail=ctx.createGain();
      this.detail.connect(this.combat);
      this.white=noiseBuffer(ctx,2.6,1,'white',521);
      const water=noiseBuffer(ctx,10.4,2,'water',7919);
      const air=noiseBuffer(ctx,11.8,2,'air',8171);
      const swirl=noiseBuffer(ctx,7.8,2,'vortex',1811);
      this.water=this.makeBed(water,'lowpass',680,0);
      this.air=this.makeBed(air,'bandpass',1250,2.1);
      this.wake=this.makeBed(water,'bandpass',940,6.4);
      this.whirl=this.makeBed(swirl,'bandpass',520,2.8);
    }
    if(this.ctx.state!=='running')await this.ctx.resume().catch(()=>{});
    return this.ctx.state==='running';
  }

  makeBed(buffer,type,frequency,offset) {
    const source=this.ctx.createBufferSource();
    const filter=this.ctx.createBiquadFilter();
    const gain=this.ctx.createGain();
    source.buffer=buffer;
    source.loop=true;
    filter.type=type;
    filter.frequency.value=frequency;
    filter.Q.value=type==='bandpass'?.58:.70;
    gain.gain.value=0;
    source.connect(filter).connect(gain).connect(this.ambient);
    source.start(0,offset);
    return {source,filter,gain};
  }

  toggle() {
    this.enabled=!this.enabled;
    if(this.master)this.master.gain.setTargetAtTime(this.enabled?VOLUME:0,this.ctx.currentTime,.055);
    return this.enabled;
  }

  voice(duration, level, options) {
    const {attack=.008,delay=0,bus=this.combat,pan=0,shape}=options;
    const ctx=this.ctx,time=ctx.currentTime+delay;
    const envelope=ctx.createGain();
    const levelParam=envelope.gain;
    levelParam.setValueAtTime(.0001,time);
    if(shape) {
      const rise=Math.min(attack,duration*.55);
      for(let i=1;i<shape.length;i++){
        const offset=rise+(duration-rise)*(i-1)/Math.max(1,shape.length-2);
        levelParam.linearRampToValueAtTime(Math.max(.0001,level*shape[i]),time+offset);
      }
    } else {
      levelParam.linearRampToValueAtTime(level,time+Math.min(attack,duration*.55));
      levelParam.exponentialRampToValueAtTime(.0001,time+duration);
    }
    const stereo=pan&&ctx.createStereoPanner?ctx.createStereoPanner():null;
    if(stereo){
      stereo.pan.value=pan;
      envelope.connect(stereo).connect(bus);
    }else envelope.connect(bus);
    return {
      time,envelope,
      end:(source,filter)=>{
        source.onended=()=>{
          source.disconnect();
          filter?.disconnect();
          envelope.disconnect();
          stereo?.disconnect();
        };
        source.stop(time+duration+.012);
      },
    };
  }

  tone(frequency, finish, duration, level, options={}) {
    const {time,envelope,end}=this.voice(duration,level,options);
    const oscillator=this.ctx.createOscillator();
    oscillator.type=options.type||'sine';
    oscillator.frequency.setValueAtTime(frequency,time);
    oscillator.frequency.exponentialRampToValueAtTime(finish,time+duration);
    oscillator.connect(envelope);
    oscillator.start(time);
    end(oscillator);
  }

  noise(start,finish,duration,level,options={}) {
    const {time,envelope,end}=this.voice(duration,level,options);
    const source=this.ctx.createBufferSource();
    const filter=this.ctx.createBiquadFilter();
    source.buffer=this.white;
    filter.type=options.type||'bandpass';
    filter.Q.value=options.q??.7;
    filter.frequency.setValueAtTime(start,time);
    filter.frequency.exponentialRampToValueAtTime(finish,time+duration);
    source.connect(filter).connect(envelope);
    const variation=Math.max(0,this.white.duration-duration-.04);
    source.start(time,Math.random()*variation);
    end(source,filter);
  }

  pluck(frequency,level,delay=0,bus=this.music,pan=0) {
    const key=Math.round(frequency*2)/2;
    let buffer=this.stringCache.get(key);
    if(!buffer) {
      if(this.stringCache.size>=28)this.stringCache.delete(this.stringCache.keys().next().value);
      buffer=stringBuffer(this.ctx,key);
      this.stringCache.set(key,buffer);
    }
    const source=this.ctx.createBufferSource();
    source.buffer=buffer;
    const {time,envelope,end}=this.voice(buffer.duration,level,{delay,bus,pan,attack:.007});
    source.connect(envelope);
    source.start(time);
    end(source);
  }

  spatialVoice(kind,event,listener,cameraMatrix,focusKind,weight=1) {
    const positional=listener&&Number.isFinite(event?.x)&&Number.isFinite(event?.z);
    const dx=positional?event.x-listener.x:0;
    const dz=positional?event.z-listener.z:0;
    const across=cameraMatrix?dx*cameraMatrix[0]+dz*cameraMatrix[2]:0;
    const contact=kind==='hit'||kind==='bossImpact'||kind==='hurt'||kind==='strikeContact';
    const closeThreat=kind==='bankPincer'||kind==='dartRush';
    const pan=clamp(across/(closeThreat?4.3:contact||focusKind==='lanternGap'?7.2:11),-.83,.83);
    const distance=positional?Math.hypot(dx,dz,(event.y??listener.y??0)-(listener.y??0)):0;
    const focus=DETAIL_DUCK[focusKind];
    if(focus&&(kind==='hurt'||distance<25)){
      const now=this.ctx.currentTime;
      this.makeSpace(now,...focus);
      if(focusKind==='windup'||focusKind==='warning'){
        const lead=clamp(event?.duration||.96,.28,1.9);
        this.warningAccent=lead>.55?now+lead*.69:Infinity;
      }
    }
    const detail=DETAIL_CUES.has(kind);
    let gain=Math.max(kind==='hurt'?.63:0,1/(1+distance*(detail?.078:.053)));
    if(kind==='bossImpact'&&event?.attack==='sky-cross'&&!event.hit){
      gain*=1-.54*clamp((Math.hypot(dx,dz)-2)/5.5,0,1);
    }
    const absorption=1-(detail?.46:.35)*clamp(distance/31,0,1);
    return this.recipeVoice({pan,gain:gain*weight,absorption,bus:detail?this.detail:this.combat});
  }

  makeSpace(now,floor,duration) {
    const overlap=now<this.detailUntil;
    const until=Math.max(this.detailUntil,now+duration);
    const level=overlap?Math.min(this.detailFloor,floor):floor;
    if(until===this.detailUntil&&level===this.detailFloor)return;
    const volume=this.detail.gain;
    volume.cancelScheduledValues(now);
    volume.setTargetAtTime(level,now,.009);
    volume.setTargetAtTime(1,until,.060);
    this.detailUntil=until;
    this.detailFloor=level;
  }

  recipeVoice({pan=0,gain=1,absorption=1,bus=this.combat}={}) {
    return {
      noise:(start,finish,duration,level,options={})=>this.noise(
        start*absorption,finish*absorption,duration,level*gain,{pan,bus,...options},
      ),
      resonate:(modes,duration,level,options={})=>{
        const {bend=.92,attack=.008,delay=0}=options;
        modes.forEach((frequency,index)=>{
          const weight=[.63,.32,.155,.08][index]??.053;
          this.tone(frequency,frequency*bend,duration*(1-index*.12),level*gain*weight,{
            attack,delay,pan,bus,
          });
        });
      },
      pluck:(frequency,level,delay=0)=>this.pluck(frequency,level*gain,delay,bus,pan),
    };
  }

  play(kind,{stage=0,rank=0,event,listener,cameraMatrix}={}) {
    if(!this.enabled||this.ctx?.state!=='running'||event?.cancelled)return;
    if(kind==='eat'&&event?.shed)kind='recover';
    if(kind==='claw'&&event?.strike==='tail')kind='tail';
    const reaction=kind==='reaction'?reactionMaterial(event):null;
    if(kind==='reaction'&&!reaction)return;
    stage=chapterIndex(stage);
    if(kind==='bankPincer'&&(stage>1||event?.phase!=='windup'))return;
    const dartPhase=kind==='dartRush'?event?.phase:null;
    if(kind==='dartRush'&&(stage!==0||dartPhase!=='windup'&&dartPhase!=='active'))return;
    const phase=kind==='bossPhase'?event?.phase:'';
    const airThreat=kind==='airDive'||kind==='airPass';
    const evolutionStage=kind==='evolve'&&event?.type==='evolve'&&Number.isInteger(event.stage)
      &&event.stage>=1&&event.stage<=4 ? event.stage : 0;
    const group=phase?`${kind}:${event?.bossId??stage}:${event?.attack??'attack'}:${phase}`
      : reaction?`${kind}:${reaction}`:dartPhase?`${kind}:${dartPhase}`:kind;
    const now=this.ctx.currentTime;
    const breath=kind==='shoot'?event?.kind??event?.weapon:null;
    const recent=now-(this.lastCue.get(group)??-Infinity)<(CUE_INTERVALS[kind]||0);
    if(recent){
      if(!breath||breath===this.breathWeapon||this.breathAccent)return;
      this.breathAccent=true;
    }else{
      this.lastCue.set(group,now);
      if(kind==='shoot'){
        this.breathWeapon=breath;
        this.breathAccent=false;
      }
    }
    if(evolutionStage){
      this.evolutionUntil=now+1.22;
      this.makeSpace(now,.56,.42);
      evolutionCue(evolutionStage,CHAPTERS[evolutionStage].root,
        pan=>this.recipeVoice({pan,bus:this.master}));
      return;
    }
    if(phase==='active'||phase==='recovery')this.warningAccent=Infinity;
    const backwash=event?.attack==='shell-backwash';
    const skyCross=event?.attack==='sky-cross';
    const lanternPulse=event?.attack==='lantern-pulse';
    // Actual wave and strike events supply their own release positions.
    if((backwash||skyCross)&&phase==='active')return;
    if(lanternPulse&&((phase&&phase!=='windup')||kind==='bossWave'||kind==='bossImpact'&&!event.hit))return;
    let origin=event;
    if(airThreat||kind==='bossCharge'||kind==='bankPincer'||dartPhase)origin=event?.from??event;
    if(dartPhase==='active'&&event.from&&event.to){
      const {from,to}=event;
      origin={
        x:from.x+(to.x-from.x)*.28,y:from.y+(to.y-from.y)*.28,z:from.z+(to.z-from.z)*.28,
      };
    }
    if(kind==='dashReady')origin=event?.to??event;
    if(kind==='hurt')origin=event?.contact??listener??event;
    const strike=(kind==='claw'||kind==='tail')&&event?.hit===true;
    let focus=phase||(backwash&&kind==='bossWave'?'active':airThreat?'airWarning':strike?'strike':kind);
    if(lanternPulse&&(phase==='windup'||kind==='warning')){
      if(listener&&Number.isFinite(event.gap)){
        const radius=clamp(Math.hypot(listener.x-event.x,listener.z-event.z),1.2,10.6);
        origin={
          x:event.x+Math.sin(event.gap)*radius,y:event.y,z:event.z+Math.cos(event.gap)*radius,
        };
      }
      focus='lanternGap';
    }
    if(skyCross&&kind==='bossImpact'&&!event.hit){
      focus=listener&&Math.hypot(event.x-listener.x,event.z-listener.z)<3?'nearLightning':null;
    }
    const voice=this.spatialVoice(kind,origin,listener,cameraMatrix,focus,recent?.44:1);
    const root=CHAPTERS[stage].root;
    switch(kind) {
      case 'start':
      case 'chosen':
      case 'upgrade':
      case 'evolve':
      case 'arrival': {
        const strength=kind==='chosen'?.19:.23;
        this.pluck(root*2,strength,0,this.master);
        if(kind!=='chosen')this.pluck(root*3,strength*.63,.23,this.master);
        if(kind==='arrival'||kind==='evolve')this.pluck(root*4,strength*.53,.57,this.master);
        break;
      }
      case 'dash':
      case 'dashReady':
      case 'launch':
      case 'entry':
        surfaceCue(kind,voice,{stage,event,weight:clamp(event?.strength??(kind==='entry'?.86:1),.18,1.4)});
        break;
      case 'bite':
      case 'eat':
      case 'recover':
      case 'claw':
      case 'tail':
      case 'shoot':
      case 'hit':
      case 'hurt':
      case 'kill': {
        const tailVoice=kind==='hurt'&&event?.lost>0
          ? this.spatialVoice(kind,event,listener,cameraMatrix)
          : voice;
        const headContact=kind==='hurt'&&stage===2&&listener&&origin&&
          Math.hypot(origin.x-listener.x,origin.y-listener.y,origin.z-listener.z)<1.8;
        const headSize=headContact?listener.body??21:0;
        const contactVoice=strike&&event.to
          ? this.spatialVoice('strikeContact',event.to,listener,cameraMatrix)
          : voice;
        const variation=kind==='eat'?this.foodVariation++%3:1;
        attackCue(kind,voice,{stage,rank,event,tailVoice,headSize,contactVoice,variation,accent:recent});
        break;
      }
      case 'boss':
      case 'bossPhase':
      case 'bossImpact':
      case 'bossWave':
      case 'bossCharge':
      case 'warning':
      case 'thunder':
        bossCue(kind,voice,{stage,event});
        break;
      case 'airDive':
      case 'airPass': {
        const rear=cameraMatrix&&listener&&origin&&
          (origin.x-listener.x)*cameraMatrix[8]+(origin.z-listener.z)*cameraMatrix[10]>1;
        airThreatCue(kind,voice,{rear});
        break;
      }
      case 'armorBreak':
        voice.noise(2630,520,.16,.21,{attack:.01,q:2.1});
        voice.resonate([119,227,406],.22,.14,{delay:.018,bend:.61});
        break;
      case 'bankPincer': {
        const dx=listener&&origin?origin.x-listener.x:0;
        const dz=listener&&origin?origin.z-listener.z:0;
        const across=cameraMatrix?dx*cameraMatrix[0]+dz*cameraMatrix[2]:0;
        const rear=cameraMatrix&&dx*cameraMatrix[8]+dz*cameraMatrix[10]>0;
        bankPincerCue(voice,rear||Math.abs(across)>Math.hypot(dx,dz)*.48);
        break;
      }
      case 'dartRush':
        dartRushCue(dartPhase,voice);
        break;
      case 'storm':
      case 'fire':
      case 'ring':
      case 'lightning':
      case 'arc':
        fieldCue(kind,voice);
        break;
      case 'reaction':
        reactionCue(reaction,voice);
        break;
    }
  }

  update(dt,{stage=0,active=false,time=0,movement=0,height=.7,threatened=false,vortex=0,turning=0}={}) {
    if(this.ctx?.state!=='running')return;
    stage=chapterIndex(stage);
    movement=clamp(movement,0,1);
    turning=clamp(turning,0,1);
    vortex=clamp(vortex,0,1);
    const now=this.ctx.currentTime;
    const profile=CHAPTERS[stage];
    if(this.scene!==stage) {
      this.scene=stage;
      this.musicTime=profile.musicEntry;
      this.phrase=0;
      this.strokePhase=0;
      this.textureTime=profile.texture[0];
      this.warningAccent=Infinity;
      this.water.filter.frequency.setTargetAtTime(profile.waterTone,now,.64);
    }
    this.room.gain.setTargetAtTime(active?1:.09,now,active?.29:.12);
    const highAir=stage>=2?clamp((height-1.24)*.093,0,1):0;
    const onWater=stage<2?1:stage===2?1-clamp((height-1.13)*.71,0,1):0;
    const swell=(.5+.5*Math.sin(time*.87))**2;
    const waterMotion=stage===2?.50+swell*.62:.79+Math.sin(time*.47)*.09;
    const waterReach=stage===3?1/(1+Math.max(0,height-5)*.13):1-highAir*.46;
    const gust=Math.sin(time*profile.windRate+.53*Math.sin(time*.41));
    this.water.gain.gain.setTargetAtTime(profile.water*waterMotion*waterReach,now,.16);
    this.air.filter.frequency.setTargetAtTime(profile.airTone*(1+gust*.12+highAir*.13),now,.55);
    this.air.gain.gain.setTargetAtTime(profile.air*(.75+gust*.18+highAir*.31),now,.29);
    this.wake.filter.frequency.setTargetAtTime(585+movement*(onWater>.3?490:614)+turning*190,now,.14);
    this.wake.gain.gain.setTargetAtTime((active?movement:0)*(.041+onWater*.134),now,.15);
    this.whirl.filter.frequency.setTargetAtTime(405+vortex*465,now,.17);
    this.whirl.gain.gain.setTargetAtTime(active?vortex*(.12+.051*onWater):0,now,.21);
    this.whirl.source.playbackRate.setTargetAtTime(.82+.39*vortex,now,.27);
    this.music.gain.setTargetAtTime(threatened?.19:.49,now,.31);

    if(!active||!this.enabled)return;
    if(now>=this.warningAccent){
      if(now-this.warningAccent<.22)this.makeSpace(now,.39,.23);
      this.warningAccent=Infinity;
    }
    this.textureTime-=dt;
    if(this.textureTime<=0&&!threatened&&now>=Math.max(this.detailUntil,this.evolutionUntil)) {
      const [,gap,width]=profile.texture;
      this.textureSide=-this.textureSide;
      this.textureTime=gap*(.84+Math.random()*.46);
      const pan=width*this.textureSide*(.62+Math.random()*.38);
      sceneTexture(this.recipeVoice({pan,bus:this.ambient}),stage,movement);
    }
    if(onWater>.1&&movement>.16){
      this.strokePhase+=dt*((stage===1?.64:.91)+movement*1.61+turning*.28)*onWater;
      if(this.strokePhase>=1){
        this.strokePhase%=1;
        this.strokeSide=-this.strokeSide;
        waterStroke(this.recipeVoice({pan:this.strokeSide*.18,bus:this.ambient}),movement*onWater,stage);
      }
    }else{
      this.strokePhase=Math.max(0,this.strokePhase-dt*.65);
    }

    this.musicTime-=dt;
    if(this.musicTime>0)return;
    const index=this.phrase++%profile.phrase.length;
    this.musicTime=profile.interval+(index%3)*.53;
    const note=profile.phrase[index];
    if(note!==null)this.pluck(profile.root*2**(note/12),.136);
  }
}
